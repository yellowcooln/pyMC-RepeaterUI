import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

import { useSetupStore } from '@/stores/setup';
import ApiService, { authClient } from '@/utils/api';

describe('first-run bootstrap authorization', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('sends the setup token only in X-Bootstrap-Token and clears it on reset', async () => {
    const request = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', request);
    const store = useSetupStore();
    store.currentStep = 6;
    store.bootstrapToken = 'local-only-bootstrap-token';
    store.selectedHardwareConnection = 'usb';
    store.selectedHardware = {
      key: 'pymc_usb',
      name: 'USB modem',
      description: '',
      config: {},
    };
    store.selectedRadioPreset = {
      title: 'Test',
      description: '',
      frequency: '915.0',
      spreading_factor: '7',
      bandwidth: '125',
      coding_rate: '5',
      tx_power: '14',
    };
    store.adminPassword = 'new-password';
    store.confirmPassword = 'new-password';

    await expect(store.completeSetup()).resolves.toMatchObject({ success: true });

    const [, options] = request.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Bootstrap-Token': 'local-only-bootstrap-token',
    });
    expect(String(options.body)).not.toContain('local-only-bootstrap-token');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    store.reset();
    expect(store.bootstrapToken).toBe('');
  });

  it('sends bootstrap restore credentials without using the authenticated admin client', async () => {
    const post = vi.spyOn(authClient, 'post').mockResolvedValue({
      data: { success: true, sections_updated: ['repeater'] },
    });

    await expect(
      ApiService.importBootstrapConfig(
        { repeater: { node_name: 'restored' } },
        'local-only-bootstrap-token',
      ),
    ).resolves.toMatchObject({ success: true });

    expect(post).toHaveBeenCalledWith(
      '/config_import',
      { config: { repeater: { node_name: 'restored' } } },
      { headers: { 'X-Bootstrap-Token': 'local-only-bootstrap-token' } },
    );
  });
});
