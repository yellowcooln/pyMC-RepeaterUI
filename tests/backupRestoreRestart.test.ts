import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import BackupRestore from '@/components/configuration/BackupRestore.vue';
import ApiService from '@/utils/api';

vi.mock('@/utils/api', () => ({
  default: {
    importConfig: vi.fn(),
  },
}));

function mountBackupRestore() {
  return mount(BackupRestore, {
    global: {
      stubs: {
        Spinner: true,
        RestartModal: {
          props: ['modelValue', 'message'],
          template: '<div v-if="modelValue" data-testid="restart-modal">{{ message }}</div>',
        },
      },
    },
  });
}

describe('BackupRestore restart handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('opens the restart modal when an import requires restart', async () => {
    vi.mocked(ApiService.importConfig).mockResolvedValue({
      success: true,
      message: 'Imported configuration',
      restart_required: true,
    } as unknown as Awaited<ReturnType<typeof ApiService.importConfig>>);
    const wrapper = mountBackupRestore();
    (wrapper.vm as unknown as { importPreview: object }).importPreview = {
      config: { repeater: { identity_key: '22'.repeat(32) } },
    };

    await (wrapper.vm as unknown as { importConfig: () => Promise<void> }).importConfig();
    await flushPromises();

    expect(wrapper.get('[data-testid="restart-modal"]').text()).toContain(
      'Restart the service to activate the imported configuration.',
    );
  });
});
