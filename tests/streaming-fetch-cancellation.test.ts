import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises } from '@vue/test-utils';
import { CanceledError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { apiClient } from '@/utils/api';
import { streamingGet } from '@/utils/streamingFetch';

// Exercise the real streaming helper, ApiService and Axios. Only the network
// adapter is replaced: no HTTP, auth token or hardware is required.
describe('streamingGet cancellation and cleanup', () => {
  const originalAdapter = apiClient.defaults.adapter;
  let request: InternalAxiosRequestConfig;
  let resolve!: (response: AxiosResponse) => void;
  beforeEach(() => {
    vi.useFakeTimers();
    apiClient.defaults.adapter = (config) => {
      request = config;
      return new Promise((done, reject) => {
        resolve = done;
        config.signal?.addEventListener?.('abort', () => reject(new CanceledError()));
      });
    };
  });
  afterEach(() => {
    apiClient.defaults.adapter = originalAdapter;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const finish = () =>
    resolve({
      data: { success: true },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: request,
    });
  it('forwards lifecycle cancellation to Axios and removes caller listeners/timers', async () => {
    const caller = new AbortController();
    const removed = vi.spyOn(caller.signal, 'removeEventListener');
    const pending = streamingGet('/hardware_stats', undefined, { signal: caller.signal });
    const rejected = expect(pending).rejects.toBeDefined();
    await flushPromises();
    expect(request.url).toBe('/hardware_stats');
    expect(request.timeout).toBe(0);
    expect(request.signal?.aborted).toBe(false);
    caller.abort('unmounted');
    expect(request.signal?.aborted).toBe(true);
    await rejected;
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans connect and idle timers after successful streaming', async () => {
    const caller = new AbortController();
    const removed = vi.spyOn(caller.signal, 'removeEventListener');
    const phases = vi.fn();
    const pending = streamingGet('/hardware_stats', undefined, {
      signal: caller.signal,
      onPhaseChange: phases,
    });
    await flushPromises();
    request.onDownloadProgress?.({ loaded: 1, bytes: 1, lengthComputable: false });
    expect(phases.mock.calls.flat()).toEqual(['connecting', 'receiving']);
    expect(vi.getTimerCount()).toBe(1);
    finish();
    await pending;
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
    caller.abort();
    expect(request.signal?.aborted).toBe(false);
  });
  it.each(['connecting', 'receiving'])(
    'aborts stalled %s requests and cleans timers',
    async (phase) => {
      const pending = streamingGet('/hardware_stats', undefined, {
        connectTimeoutMs: 100,
        idleTimeoutMs: 50,
      });
      const rejected = expect(pending).rejects.toBeDefined();
      await flushPromises();
      if (phase === 'receiving')
        request.onDownloadProgress?.({ loaded: 1, bytes: 1, lengthComputable: false });
      await vi.advanceTimersByTimeAsync(phase === 'connecting' ? 100 : 50);
      await rejected;
      expect(request.signal?.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it('rejects pre-aborted callers without sending a network request', async () => {
    const adapter = vi.fn();
    apiClient.defaults.adapter = adapter;
    const caller = new AbortController();
    caller.abort();
    await expect(
      streamingGet('/hardware_stats', undefined, { signal: caller.signal }),
    ).rejects.toBeDefined();
    expect(adapter).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('cleans resources when a connecting phase callback throws', async () => {
    const caller = new AbortController();
    const removed = vi.spyOn(caller.signal, 'removeEventListener');
    await expect(
      streamingGet('/hardware_stats', undefined, {
        signal: caller.signal,
        onPhaseChange: () => {
          throw new Error('callback');
        },
      }),
    ).rejects.toThrow('callback');
    expect(removed).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(vi.getTimerCount()).toBe(0);
  });
});
