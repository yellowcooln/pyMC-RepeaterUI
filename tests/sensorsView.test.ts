import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { reactive, nextTick } from 'vue';

const state = reactive<{ stats: { sensors: { readings: Array<Record<string, unknown>> } } }>({
  stats: { sensors: { readings: [] } },
});
vi.mock('@/stores/system', () => ({
  useSystemStore: () => ({
    get stats() {
      return state.stats;
    },
    fetchStats: vi.fn(async () => {}),
  }),
}));
vi.mock('@/composables/useManagedPolling', () => ({ useManagedPolling: vi.fn() }));

import Sensors from '@/views/Sensors.vue';

const metric = (id: string, category: string, label: string, unit: string | null = null) => ({
  id,
  source_path: id,
  data_key: `modem:${id}`,
  label,
  unit,
  kind: 'number',
  category,
  available: true,
});
const modem = (name: string, data: Record<string, unknown>, metrics: unknown[]) => ({
  name,
  type: 'openhop_modem',
  ok: true,
  timestamp: '2026-09-28T12:00:00Z',
  data,
  metrics,
});
const mounted: VueWrapper[] = [];
function render(readings: Array<Record<string, unknown>>) {
  state.stats = { sensors: { readings } };
  const wrapper = mount(Sensors, { global: { stubs: ['router-link'] } });
  mounted.push(wrapper);
  return wrapper;
}
afterEach(() => {
  mounted.forEach((wrapper) => wrapper.unmount());
  mounted.length = 0;
});

describe('Sensors view metric descriptors', () => {
  it('renders synthetic Victron status labels directly without a legacy duplicate', () => {
    const fields = [
      ['CS', 'charge_state_code', 3, 'State of operation', 'Bulk'],
      ['ERR', 'error_code', 0, 'Error code', 'No error'],
      ['MPPT', 'tracker_state_code', 2, 'Tracker operation mode', 'MPP Tracker active'],
      [
        'OR',
        'off_reason',
        2147483657,
        'Off reason',
        'No input power; Remote input; Unknown bits (0x80000000)',
      ],
      ['AR', 'alarm_reason', 5, 'Alarm reason', 'Low Voltage; Low SOC'],
      ['MON', 'monitor_mode_code', -9, 'DC monitor mode', 'Solar charger'],
      ['HSDS', 'day_sequence', 34, 'Day Sequence', undefined],
      ['LOAD', 'load_output', false, 'Load Output', undefined],
    ];
    const data = Object.fromEntries(fields.map(([, key, value]) => [String(key), value]));
    const descriptors = fields.map(([id, key, value, label, display_value]) => ({
      id: `/${id}`,
      source_path: `/${id}`,
      data_key: key,
      label,
      display_value,
      kind: typeof value === 'boolean' ? 'boolean' : 'number',
      unit: null,
      category: 'status',
      available: true,
    }));
    const wrapper = render([
      { name: 'Synthetic Victron', type: 'victron_vedirect', ok: true, data, metrics: descriptors },
    ]);
    const cards = wrapper.findAll('[data-testid="sensor-metric"]');
    expect(cards).toHaveLength(fields.length);
    fields.forEach(([, , value, label, display], index) => {
      expect(cards[index].findAll('p').map((p) => p.text())).toEqual([
        String(label),
        String(display ?? value),
      ]);
    });
    expect(wrapper.text()).not.toContain('Legacy');
    expect(wrapper.text()).not.toContain('charge_state');
    expect(data.charge_state_code).toBe(3);
  });

  it.each([
    [3, true, 'Unknown (999)', 'Unknown (999)'],
    [3, true, 'Unknown bits (0x200)', 'Unknown bits (0x200)'],
    [3, true, '<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
    [3, true, '', '3'],
    [3, true, '   ', '3'],
    [3, true, 42, '3'],
    [3, false, 'Bulk', 'n/a'],
    [null, true, 'Bulk', 'n/a'],
    [undefined, true, 'Bulk', 'n/a'],
    ['invalid', true, 'Bulk', 'n/a'],
    [NaN, true, 'Bulk', 'n/a'],
    [Infinity, true, 'Bulk', 'n/a'],
  ])(
    'honors generic display metadata only for valid available raw values (%s, %s, %s)',
    (value, available, display_value, expected) => {
      const descriptor = {
        ...metric('/code', 'status', 'Generic status'),
        available,
        display_value,
      };
      const data = value === undefined ? {} : { [descriptor.data_key]: value };
      const wrapper = render([modem('Synthetic', data, [descriptor])]);
      const cards = wrapper.findAll('[data-testid="sensor-metric"]');
      if (value === undefined && available) {
        expect(cards).toHaveLength(0);
      } else {
        expect(cards[0].findAll('p')[1].text()).toBe(expected);
        expect(cards[0].findAll('p')[1].classes()).toContain('text-content-heading');
      }
      expect(wrapper.find('img').exists()).toBe(false);
    },
  );

  it('never displays a stale status label after missing, invalid or read-failed transitions', async () => {
    const descriptor = { ...metric('/CS', 'status', 'State of operation'), display_value: 'Bulk' };
    const wrapper = render([modem('Synthetic', { [descriptor.data_key]: 3 }, [descriptor])]);
    expect(wrapper.text()).toContain('Bulk');
    for (const reason of ['missing', 'invalid', 'read_failed']) {
      state.stats = {
        sensors: {
          readings: [modem('Synthetic', {}, [{ ...descriptor, available: false, reason }])],
        },
      };
      await nextTick();
      expect(wrapper.text()).not.toContain('Bulk');
      expect(wrapper.find('[data-testid="sensor-metric"]').text()).toContain('n/a');
    }
  });

  it.each([18, 0, -9])('preserves %s dBm instead of interpreting RF power as watts', (power) => {
    const wrapper = render([
      modem('Legacy modem', { tx_power_dbm: power, power_mw: 18, power_w: 2 }, []),
      modem('Described modem', { tx_power_dbm: power, 'modem:/environment/value': 1 }, [
        metric('/environment/value', 'measurement', 'Value'),
      ]),
    ]);
    const cards = wrapper.findAll('[data-testid="sensor-reading"]');
    for (const card of cards) {
      expect(card.text()).toContain(`${power} dBm`);
      expect(card.text()).not.toContain(`${power.toFixed(2)}W`);
    }
    expect(cards[0].text()).toContain('18.0mW');
    expect(cards[0].text()).toContain('2.00W');
  });

  it('groups descriptor metrics separately, uses units and labels, and keeps legacy keys visible', () => {
    const wrapper = render([
      modem(
        'G3',
        {
          temperature_c: 45,
          'modem:/environment/temperature_c': 23.5,
          'modem:/radio/agc_reset_count': 0,
          'modem:/radio/agc_reset_interval_sec': 0,
          'modem:/environment/available': false,
          'modem:/environment/pressure_hpa': null,
        },
        [
          metric('/environment/temperature_c', 'measurement', 'Environmental temperature', '°C'),
          metric('/radio/agc_reset_count', 'diagnostic', 'AGC resets'),
          metric('/radio/agc_reset_interval_sec', 'configuration', 'AGC reset interval', 's'),
          {
            ...metric('/environment/available', 'status', 'Environment available'),
            kind: 'boolean',
          },
          {
            ...metric('/environment/pressure_hpa', 'measurement', 'Station pressure', 'hPa'),
            available: false,
            reason: 'null',
          },
        ],
      ),
    ]);
    expect(wrapper.text()).toContain('Measurements');
    expect(wrapper.text()).toContain('Diagnostics');
    expect(wrapper.text()).toContain('Configuration');
    expect(wrapper.text()).toContain('Status');
    expect(wrapper.text()).toContain('Legacy values');
    expect(wrapper.text()).toContain('Environmental temperature');
    expect(wrapper.text()).toContain('23.5 °C');
    expect(wrapper.text()).toContain('0 s');
    expect(wrapper.text()).toContain('false');
    expect(wrapper.text()).toContain('n/a');
    expect(wrapper.text()).toContain('temperature_c');
    expect(wrapper.text()).toContain('45.0°C');
  });

  it('keeps known metrics unavailable after a successful reading is followed by a failed poll', async () => {
    const descriptor = metric(
      '/environment/temperature_c',
      'measurement',
      'Environmental temperature',
      '°C',
    );
    const wrapper = render([modem('Alpha', { [descriptor.data_key]: 23.5 }, [descriptor])]);
    expect(wrapper.text()).toContain('23.5 °C');
    state.stats = {
      sensors: {
        readings: [
          {
            ...modem('Alpha', {}, [{ ...descriptor, available: false, reason: 'read_failed' }]),
            ok: false,
            error: 'RuntimeError: offline',
          },
        ],
      },
    };
    await nextTick();
    expect(wrapper.findAll('[data-testid="sensor-metric"]')).toHaveLength(1);
    expect(wrapper.text()).toContain('Environmental temperature');
    expect(wrapper.text()).toContain('n/a');
    expect(wrapper.text()).toContain('RuntimeError: offline');
    expect(wrapper.text()).not.toContain('23.5 °C');
  });

  it('reacts to availability transitions and isolates two modem instances', async () => {
    const descriptor = metric('/environment/new_charge_count', 'measurement', 'New charge count');
    const first = modem('Alpha', { 'modem:/environment/new_charge_count': null }, [
      { ...descriptor, available: false },
    ]);
    const second = modem('Beta', { 'modem:/environment/new_charge_count': 0 }, [descriptor]);
    const wrapper = render([first, second]);
    const cards = () => wrapper.findAll('[data-testid="sensor-reading"]');
    expect(cards()).toHaveLength(2);
    expect(cards()[0].text()).toContain('n/a');
    expect(cards()[1].text()).toContain('0');
    expect(cards()[1].text()).not.toContain('%');
    state.stats = {
      sensors: {
        readings: [
          modem('Alpha', { 'modem:/environment/new_charge_count': 7 }, [descriptor]),
          second,
        ],
      },
    };
    await nextTick();
    expect(cards()[0].text()).toContain('7');
    state.stats = { sensors: { readings: [first, second] } };
    await nextTick();
    expect(cards()[0].text()).toContain('n/a');
  });

  it('escapes remote labels and displays a responsive grid for many metrics', () => {
    const readings = Array.from({ length: 32 }, (_, i) =>
      metric(`/environment/value_${i}`, 'measurement', `Value ${i}`),
    );
    readings[0].label = '<img src=x onerror=alert(1)>';
    const data = Object.fromEntries(readings.map((m, i) => [m.data_key, i]));
    const wrapper = render([modem('Alpha', data, readings)]);
    expect(wrapper.find('img').exists()).toBe(false);
    expect(wrapper.html()).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(wrapper.findAll('[data-testid="sensor-metric"]')).toHaveLength(32);
    expect(wrapper.find('[data-testid="metric-grid"]').classes()).toContain('grid-cols-2');
    expect(wrapper.find('[data-testid="metric-grid"]').classes()).toContain('sm:grid-cols-3');
  });

  it('keeps the old backend grid and hardware_stats flattening without descriptors', () => {
    const wrapper = render([
      { name: 'Old modem', type: 'openhop_modem', ok: true, data: { die_temperature_c: 39 } },
      {
        name: 'Host',
        type: 'hardware_stats',
        ok: true,
        data: { cpu: { usage_percent: 0, count: 4 } },
      },
    ]);
    expect(wrapper.text()).toContain('39.0°C');
    expect(wrapper.text()).toContain('cpu_usage');
    expect(wrapper.text()).toContain('0.0%');
  });
});
