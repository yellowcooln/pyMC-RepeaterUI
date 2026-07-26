import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import ApiService, { authClient } from '@/utils/api';

const STREAM_CALLERS = [
  'src/utils/api.ts',
  'src/stores/websocket.ts',
  'src/views/GPSDiagnostics.vue',
  'src/views/CADCalibration.vue',
  'src/views/Logs.vue',
  'src/views/Neighbors.vue',
  'src/components/modals/UpdateModal.vue',
];

const STREAM_PATH_CONTRACTS = new Map([
  ['src/stores/websocket.ts', "createStreamTicket('/ws/packets')"],
  ['src/views/GPSDiagnostics.vue', "createStreamUrl('/api/gps-stream')"],
  ['src/views/CADCalibration.vue', "createStreamUrl('/api/cad-calibration-stream')"],
  ['src/views/Logs.vue', "createStreamUrl('/api/logs_stream'"],
  ['src/utils/api.ts', "createStreamUrl('/api/discover_neighbors_stream', params)"],
  ['src/components/modals/UpdateModal.vue', "createStreamUrl('/api/update/progress')"],
]);

describe('stream tickets', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('requests an endpoint-scoped ticket through authenticated HTTP', async () => {
    const post = vi.spyOn(authClient, 'post').mockResolvedValue({
      data: {
        success: true,
        ticket: 'opaque-once',
        path: '/api/gps_stream',
        expires_in: 30,
      },
    });

    await expect(ApiService.createStreamTicket('/api/gps-stream')).resolves.toBe('opaque-once');
    expect(post).toHaveBeenCalledWith('/auth/stream_ticket', { path: '/api/gps-stream' });
  });

  it('rejects malformed ticket responses', async () => {
    vi.spyOn(authClient, 'post').mockResolvedValue({ data: { success: true } });
    await expect(ApiService.createStreamTicket('/ws/packets')).rejects.toThrow(
      'Stream ticket response was invalid',
    );
  });

  it('uses a fresh opaque ticket for every stream URL and preserves stream parameters', async () => {
    const post = vi
      .spyOn(authClient, 'post')
      .mockResolvedValueOnce({ data: { success: true, ticket: 'ticket-one' } })
      .mockResolvedValueOnce({ data: { success: true, ticket: 'ticket-two' } });
    const firstParams = new URLSearchParams({ since_id: '41' });

    const first = new URL(
      await ApiService.createStreamUrl('/api/logs_stream', firstParams),
      'http://repeater.test',
    );
    const second = new URL(
      await ApiService.createStreamUrl('/api/logs_stream'),
      'http://repeater.test',
    );

    expect(first.pathname).toBe('/api/logs_stream');
    expect(first.searchParams.get('since_id')).toBe('41');
    expect(first.searchParams.get('ticket')).toBe('ticket-one');
    expect(second.searchParams.get('ticket')).toBe('ticket-two');
    expect(first.searchParams.has('token')).toBe(false);
    expect(second.searchParams.has('token')).toBe(false);
    expect(post).toHaveBeenNthCalledWith(1, '/auth/stream_ticket', {
      path: '/api/logs_stream',
    });
    expect(post).toHaveBeenNthCalledWith(2, '/auth/stream_ticket', {
      path: '/api/logs_stream',
    });
  });

  it('binds every browser stream caller to its exact backend ticket path', () => {
    for (const [relativePath, expectedCall] of STREAM_PATH_CONTRACTS) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source, relativePath).toContain(expectedCall);
    }
  });

  it('does not place reusable JWTs in browser stream URLs', () => {
    for (const relativePath of STREAM_CALLERS) {
      const source = readFileSync(resolve(process.cwd(), relativePath), 'utf8');
      expect(source, relativePath).not.toMatch(/[?&]token=/);
      expect(source, relativePath).not.toContain("params.set('token'");
      expect(source, relativePath).not.toContain("query.set('token'");
    }
  });
});
