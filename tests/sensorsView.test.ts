import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchStats: vi.fn().mockResolvedValue(undefined),
  stats: {
    sensors: {
      enabled: true,
      running: true,
      configured: 3,
      loaded: 3,
      poll_interval_seconds: 30,
      readings: [
        {
          name: 'Roof modem',
          type: 'pymc_modem',
          ok: true,
          timestamp: '2026-07-27T16:00:00Z',
          data: {
            battery_voltage_v: 4.112,
            battery_percent: 86,
            fix_valid: true,
            satellites_used: 9,
            charge_state: 'charging',
          },
        },
        {
          name: 'Equipment cabinet',
          type: 'shtc3',
          ok: false,
          timestamp: null,
          error: 'SHTC3 device not available',
          data: {},
        },
        {
          name: 'Host system',
          type: 'hardware_stats',
          ok: true,
          timestamp: '2026-07-27T16:00:00Z',
          data: {
            cpu: {
              usage_percent: 42.5,
              count: 2,
              frequency: 2500.006,
              load_avg: { '1min': 6.785 },
            },
            memory: { total: 1073741824, available: 929612800, usage_percent: 61 },
            network: { bytes_sent: 87747529, packets_sent: 232108 },
          },
        },
      ],
    },
  },
}));

vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    stats: mocks.stats,
    fetchStats: mocks.fetchStats,
  }),
}));

vi.mock('@/composables/useManagedPolling', () => ({
  useManagedPolling: vi.fn(),
}));

import Sensors from '@/views/Sensors.vue';

const mountView = () => mount(Sensors);

describe('Sensors dashboard', () => {
  beforeEach(() => {
    mocks.fetchStats.mockClear();
  });

  it('presents system health and each configured sensor with a clear status', () => {
    const wrapper = mountView();

    expect(wrapper.findAll('[data-testid="sensor-summary"]')).toHaveLength(4);
    expect(wrapper.get('[data-testid="sensor-health-summary"]').text()).toContain('2 of 3 healthy');
    expect(wrapper.findAll('[data-testid="sensor-card"]')).toHaveLength(3);
    expect(wrapper.text()).toContain('Roof modem');
    expect(wrapper.text()).toContain('Online');
    expect(wrapper.text()).toContain('Equipment cabinet');
    expect(wrapper.text()).toContain('Needs attention');
    expect(wrapper.text()).toContain('SHTC3 device not available');
  });

  it('turns machine field names and raw numbers into readable metric tiles with units', () => {
    const wrapper = mountView();
    const metrics = wrapper.findAll('[data-testid="sensor-metric"]');

    expect(metrics.length).toBeGreaterThan(7);
    expect(wrapper.text()).toContain('Battery voltage');
    expect(wrapper.text()).toContain('4.112 V');
    expect(wrapper.text()).toContain('Battery');
    expect(wrapper.text()).toContain('86%');
    expect(wrapper.text()).toContain('Fix valid');
    expect(wrapper.text()).toContain('Yes');
    expect(wrapper.text()).toContain('Satellites used');
    expect(wrapper.text()).toContain('Charge state');
    expect(wrapper.text()).toContain('Charging');
    expect(wrapper.text()).toContain('CPU · Usage');
    expect(wrapper.text()).toContain('42.5%');
    expect(wrapper.text()).toContain('Memory · Usage');
  });

  it('uses compact human-readable formatting instead of raw machine numbers', () => {
    const text = mountView().text();

    expect(text).toContain('CPU · Frequency');
    expect(text).toContain('2.5 GHz');
    expect(text).toContain('CPU · Load Avg · 1min');
    expect(text).toContain('6.79');
    expect(text).toContain('Memory · Total');
    expect(text).toContain('1 GiB');
    expect(text).toContain('Network · Bytes Sent');
    expect(text).toContain('83.7 MiB');
    expect(text).toContain('Network · Packets Sent');
    expect(text).toContain('232.1K');
    expect(text).not.toContain('2,500.006');
    expect(text).not.toContain('1,073,741,824');
  });

  it('offers a labelled manual refresh action', async () => {
    const wrapper = mountView();

    await wrapper.get('button[aria-label="Refresh sensor readings"]').trigger('click');

    expect(mocks.fetchStats).toHaveBeenCalledOnce();
  });
});
