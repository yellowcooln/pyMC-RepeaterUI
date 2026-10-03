import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Terminal } from '@xterm/xterm';
import { HopfetchCommand } from '@/commands/HopfetchCommand';
import { CommandRegistry } from '@/commands';
const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  get: vi.fn(),
  apiGet: vi.fn(),
  store: { stats: { config: { node_name: 'Hill' } } as unknown },
}));
vi.mock('@/stores/dataService', () => ({ useDataService: () => ({ ensure: mocks.ensure }) }));
vi.mock('@/stores/system', () => ({ useSystemStore: () => mocks.store }));
vi.mock('@/utils/streamingFetch', () => ({ streamingGet: mocks.get }));
vi.mock('@/utils/api', () => ({ ApiService: { get: mocks.apiGet } }));
const context = (args: string[] = [], signal?: AbortSignal) => ({
  term: { cols: 110, rows: 30, writeln: vi.fn() } as unknown as Terminal,
  args,
  signal,
  writePrompt: vi.fn(),
});
describe('hopfetch command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.store.stats = { config: { node_name: 'Hill' } };
    mocks.apiGet.mockResolvedValue({ hardware: [] });
    mocks.ensure.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({ success: true, data: { system: { os: 'Linux' } } });
  });
  it('registers primary name and alias in dynamic help', async () => {
    const registry = new CommandRegistry();
    expect(registry.findCommand('fastfetch')).toBe(registry.findCommand('hopfetch'));
    expect(registry.getCommandNames()).toContain('hopfetch');
    const ctx = context();
    await registry.findCommand('help')!.execute(ctx);
    expect(vi.mocked(ctx.term.writeln).mock.calls.flat().join('')).toContain('hopfetch');
  });
  it.each([['help'], ['--help'], ['--bogus'], ['--plain', '--bad']])(
    'help/invalid args %j do no network',
    async (...args) => {
      const ctx = context(args);
      await new HopfetchCommand().execute(ctx);
      expect(mocks.ensure).not.toHaveBeenCalled();
      expect(mocks.get).not.toHaveBeenCalled();
      expect(ctx.writePrompt).toHaveBeenCalledTimes(1);
    },
  );
  it('fetches once through managed stats and authenticated hardware helper', async () => {
    const ctx = context(['--plain']);
    await new HopfetchCommand().execute(ctx);
    expect(mocks.ensure).toHaveBeenCalledExactlyOnceWith('stats');
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.get.mock.calls[0][0]).toBe('/hardware_stats');
    const text = vi.mocked(ctx.term.writeln).mock.calls.flat().join('');
    expect(text).toContain('Hill');
    expect(text).toContain('Linux');
    expect(text).not.toContain('\x1b');
    expect(ctx.writePrompt).toHaveBeenCalledTimes(1);
  });
  it.each(['stats', 'hardware'])(
    'preserves the other source on %s failure and never prints exceptions',
    async (source) => {
      if (source === 'stats') mocks.ensure.mockRejectedValue(new Error('SECRET'));
      else mocks.get.mockRejectedValue(new Error('SECRET'));
      const ctx = context();
      await new HopfetchCommand().execute(ctx);
      const text = vi.mocked(ctx.term.writeln).mock.calls.flat().join('');
      expect(text).toContain(source === 'stats' ? 'Linux' : 'Hill');
      expect(text).not.toContain('SECRET');
      expect(ctx.writePrompt).toHaveBeenCalledTimes(1);
    },
  );
  it('only fetches the hardware catalogue once for native radios, never sensor config', async () => {
    mocks.store.stats = { radio_type: 'sx1262' };
    await new HopfetchCommand().execute(context());
    expect(mocks.apiGet).toHaveBeenCalledExactlyOnceWith(
      'hardware_options',
      undefined,
      expect.objectContaining({ signal: undefined }),
    );
    mocks.apiGet.mockClear();
    mocks.store.stats = { radio_type: 'modem_tcp' };
    await new HopfetchCommand().execute(context());
    expect(mocks.apiGet).not.toHaveBeenCalled();
  });
  it('cancels without late writes or prompt after terminal disposal', async () => {
    let finish!: () => void;
    mocks.ensure.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const controller = new AbortController();
    const ctx = context([], controller.signal);
    const work = new HopfetchCommand().execute(ctx);
    controller.abort();
    finish();
    await work;
    expect(ctx.term.writeln).not.toHaveBeenCalled();
    expect(ctx.writePrompt).not.toHaveBeenCalled();
  });
});
