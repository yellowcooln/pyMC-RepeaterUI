import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import TerminalView from '@/views/Terminal.vue';
const mocks = vi.hoisted(() => ({
  ensure: vi.fn(),
  get: vi.fn(),
  input: (() => {}) as (data: string) => void,
  write: vi.fn(),
  writeln: vi.fn(),
  dispose: vi.fn(),
}));
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = 110;
    rows = 30;
    unicode = { register: vi.fn(), activeVersion: '11' };
    options = {};
    loadAddon(addon: { activate?: (term: unknown) => void }) {
      addon.activate?.(this);
    }
    open() {}
    focus() {}
    clear() {}
    scrollToBottom() {}
    attachCustomKeyEventHandler() {}
    write = mocks.write;
    writeln = mocks.writeln;
    dispose = mocks.dispose;
    onData(callback: (data: string) => void) {
      mocks.input = callback;
      return { dispose: vi.fn() };
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit() {}
  },
}));
vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: class {
    dispose() {}
  },
}));
vi.mock('@xterm/addon-search', () => ({ SearchAddon: class {} }));
vi.mock('@xterm/addon-web-links', () => ({ WebLinksAddon: class {} }));
vi.mock('@/composables/useTheme', () => ({ useTheme: () => ({ theme: ref('dark') }) }));
vi.mock('@/stores/dataService', () => ({ useDataService: () => ({ ensure: mocks.ensure }) }));
vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({ stats: { config: { node_name: 'Hill' } } }),
}));
vi.mock('@/utils/streamingFetch', () => ({ streamingGet: mocks.get }));
const type = (text: string) => {
  for (const ch of text) mocks.input(ch);
};
describe('hopfetch terminal dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensure.mockResolvedValue(undefined);
    mocks.get.mockResolvedValue({ success: true, data: { system: { os: 'Linux' } } });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it('does not auto-run and dispatches the real registry command and alias', async () => {
    const wrapper = mount(TerminalView);
    expect(mocks.get).not.toHaveBeenCalled();
    type('hopfetch --plain\r');
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(mocks.writeln.mock.calls.flat().join('')).toContain('Hill');
    type('fastfetch help\r');
    await flushPromises();
    expect(mocks.get).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });
  it('offers hopfetch arguments without fetching', async () => {
    const wrapper = mount(TerminalView);
    type('hopfetch \t');
    await flushPromises();
    expect(mocks.writeln.mock.calls.flat().join('')).toContain('--plain');
    expect(mocks.get).not.toHaveBeenCalled();
    wrapper.unmount();
  });
  it('Ctrl+C cancels active snapshot with exactly one prompt and no late output', async () => {
    let finish!: () => void;
    mocks.ensure.mockReturnValue(
      new Promise<void>((r) => {
        finish = r;
      }),
    );
    const wrapper = mount(TerminalView);
    type('hopfetch\r');
    mocks.write.mockClear();
    mocks.writeln.mockClear();
    mocks.input('\x03');
    const promptCount = mocks.write.mock.calls.filter((c) => String(c[0]).includes('❯')).length;
    expect(promptCount).toBe(1);
    finish();
    await flushPromises();
    expect(mocks.writeln).not.toHaveBeenCalled();
    expect(mocks.write.mock.calls.filter((c) => String(c[0]).includes('❯'))).toHaveLength(1);
    wrapper.unmount();
  });
  it('unmount aborts hardware work and prevents late terminal writes', async () => {
    let finish!: () => void;
    mocks.ensure.mockReturnValue(
      new Promise<void>((r) => {
        finish = r;
      }),
    );
    const wrapper = mount(TerminalView);
    type('hopfetch\r');
    wrapper.unmount();
    mocks.write.mockClear();
    mocks.writeln.mockClear();
    expect(mocks.get.mock.calls[0][2].signal.aborted).toBe(true);
    finish();
    await flushPromises();
    expect(mocks.write).not.toHaveBeenCalled();
    expect(mocks.writeln).not.toHaveBeenCalled();
    expect(mocks.dispose).toHaveBeenCalledTimes(1);
  });
});
