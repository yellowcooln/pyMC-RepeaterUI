import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '@/commands/hopfetch/model';
import catalogue from './fixtures/hopfetch-hardware-options.json';
const now = Date.parse('2026-01-01T00:00:10Z');
const radio = (id: string, host: string) => ({
  id,
  radio_type: 'modem_tcp',
  modem_tcp: { host, port: 5055 },
});
const sensor = (name: string, url: string, board = 'EtherMesh-1W') => ({
  name,
  type: 'openhop_modem',
  ok: true,
  timestamp: '2026-01-01T00:00:09Z',
  poll_interval_seconds: 5,
  data: { url, system_board: board },
});
const radioValues = (stats: unknown) =>
  buildSnapshot(stats, null, now)
    .filter((r) => r.label.startsWith('Radio '))
    .map((r) => r.value);
describe('hopfetch compact hardware', () => {
  // Snapshot of the backend radio-settings.json hardware-options response.
  it('matches real catalogue hardware with effective factory defaults and integer encodings', () => {
    const stock = catalogue.find((o) => o.key === 'pimesh-1w-v2')!;
    const value = (sx1262: unknown, options: Record<string, unknown>[] = catalogue) =>
      buildSnapshot({ radio_type: 'sx1262', sx1262 }, null, now, options).find(
        (r) => r.label === 'Radio radio0',
      )?.value;
    const actual = {
      ...stock.config,
      gpio_chip: 0,
      use_gpiod_backend: false,
      radio_timing_delay: 0.01,
      bus_id: '0',
      reset_pin: '0x12',
      en_pins: '[0x1a, 26]',
    };
    expect(value(actual)).toContain('PiMesh-1W (V2) preset');
    expect(value(stock.config, [{ ...stock, config: actual }])).toContain('PiMesh-1W (V2) preset');
    for (const patch of [
      { gpio_chip: 1 },
      { use_gpiod_backend: true },
      { reset_pin: '18oops' },
      { en_pins: '[26oops]' },
      { bus_id: '' },
      { reset_pin: '018' },
      { en_pins: [null] },
      { radio_timing_delay: 0.02 },
    ]) {
      expect(value({ ...stock.config, ...patch })).toContain('Custom');
    }
  });
  it('matches every real native catalogue preset through per-radio config shapes', () => {
    for (const option of catalogue.filter(
      (o) => !['modem_usb', 'modem_tcp', 'kiss'].includes(o.key),
    )) {
      const cfg: Record<string, unknown> = { ...option.config };
      // Both integer list and scalar EN representations are backend-supported.
      if (Array.isArray(cfg.en_pins)) cfg.en_pins = cfg.en_pins.join(', ');
      const kind = cfg.radio_type ?? 'sx1262';
      const value = buildSnapshot(
        {
          config: {
            radios: [
              {
                id: option.key,
                radio_type: kind,
                sx1262: cfg,
                ch341: { vid: '0x1a86', pid: '0x5512' },
              },
            ],
          },
        },
        null,
        now,
        catalogue,
      ).find((r) => r.label === `Radio ${option.key}`)?.value;
      expect(value).not.toContain('Custom');
      expect(value).toMatch(/preset(?: ambiguous)? ·/);
    }
  });
  it('never matches malformed adapter IDs even when the catalogue has the same bad value', () => {
    const stock = catalogue.find((o) => o.key === 'pinedio')!;
    const value = buildSnapshot(
      { radio_type: 'sx1262_ch341', sx1262: stock.config, ch341: { vid: 'not-an-id', pid: 21778 } },
      null,
      now,
      [{ ...stock, config: { ...stock.config, vid: 'not-an-id' } }],
    ).find((r) => r.label === 'Radio radio0')?.value;
    expect(value).toContain('Custom');
  });
  it('reports real overlapping PiMesh V1 and MeshAdv presets as ambiguous, not custom', () => {
    for (const key of ['pimesh-1w-v1', 'meshadv']) {
      const stock = catalogue.find((o) => o.key === key)!;
      const value = buildSnapshot(
        { radio_type: 'sx1262', sx1262: stock.config },
        null,
        now,
        catalogue,
      ).find((r) => r.label === 'Radio radio0')?.value;
      expect(value).toContain('preset ambiguous');
      expect(value).not.toContain('Custom');
    }
  });
  it('matches hardware catalogue pins/flags, never regional RF or stale board names', () => {
    const pins = {
      bus_id: 0,
      cs_id: 0,
      cs_pin: -1,
      reset_pin: 18,
      busy_pin: 5,
      irq_pin: 6,
      txen_pin: -1,
      rxen_pin: -1,
      en_pin: 26,
      use_dio3_tcxo: true,
      use_dio2_rf: true,
    };
    const options = [{ key: 'pimesh-1w-v2', name: 'PiMesh-1W (V2)', config: pins }];
    const stats = {
      radio_type: 'sx1262',
      sx1262: pins,
      config: { radio: { frequency: 915000000 } },
    };
    const value = (s: unknown, catalogue = options) =>
      buildSnapshot(s, null, now, catalogue).find((r) => r.label === 'Radio radio0')?.value;
    expect(value(stats)).toContain('PiMesh-1W (V2) preset');
    expect(
      value({ ...stats, sx1262: { ...pins, busy_pin: 20, name: 'PiMesh-1W (V2)' } }),
    ).toContain('Custom');
    expect(value({ ...stats, sx1262: { ...pins, en_pins: [0] } })).toContain('Custom');
    expect(value({ ...stats, sx1262: { ...pins, en_pin: -1, en_pins: [26] } })).toContain(
      'PiMesh-1W',
    );
    expect(value(stats, [])).toContain('preset unknown');
    expect(value({ radio_type: 'sx1262', sx1262: { frequency: 915000000 } })).toContain('Custom');
  });
  it('keeps per-radio native preset matching separate from RF and adapter transport', () => {
    const pins = {
      bus_id: 0,
      cs_id: 0,
      cs_pin: 0,
      reset_pin: -1,
      busy_pin: 11,
      irq_pin: 10,
      txen_pin: -1,
      rxen_pin: -1,
      use_dio2_rf: true,
    };
    const options = [
      {
        key: 'pinedio',
        name: 'PineDio CH341 + SX1262',
        config: { ...pins, radio_type: 'sx1262_ch341', vid: 6790, pid: 21778 },
      },
    ];
    const rows = buildSnapshot(
      {
        radios: [
          { id: 'usb', radio_type: 'sx1262_ch341', sx1262: pins, radio: { frequency: 915000000 } },
          { id: 'custom', radio_type: 'sx1262_ch341', sx1262: { ...pins, irq_pin: 6 } },
        ],
      },
      null,
      now,
      options,
    );
    expect(rows.find((r) => r.label === 'Radio usb')?.value).toContain(
      'PineDio CH341 + SX1262 preset',
    );
    expect(rows.find((r) => r.label === 'Radio custom')?.value).toContain('Custom');
    expect(rows.find((r) => r.label === '  RF config')?.value).toContain('915 MHz');
  });
  it('summarizes a 39-channel server without dumping cores', () => {
    const temperatures = Object.fromEntries(
      Array.from({ length: 36 }, (_, i) => [`coretemp_${i}`, 40 + i]),
    );
    Object.assign(temperatures, { nvme_0: 50, nvme_1: 60, acpitz: 30 });
    const rows = buildSnapshot({}, { temperatures });
    expect(rows.find((r) => r.label === 'Temperatures')?.value).toBe('CPU 75°C · Drive 60°C');
  });
  it('keeps Pi/zero/unknown temperatures honest and singular core', () => {
    expect(
      buildSnapshot({}, { temperatures: { 'cpu-thermal': 0 }, cpu: { count: 1 } }).find(
        (r) => r.label === 'CPU',
      )?.value,
    ).toContain('1 core ·');
    expect(
      buildSnapshot({}, { temperatures: { 'cpu-thermal': 0 } }).find(
        (r) => r.label === 'Temperatures',
      )?.value,
    ).toBe('CPU 0°C');
    expect(
      buildSnapshot({}, { temperatures: { nvme: 55, mystery: 80, broken: Infinity } }).find(
        (r) => r.label === 'Temperatures',
      )?.value,
    ).toBe('Drive 55°C');
    expect(
      buildSnapshot({}, { temperatures: { mystery: 80, other: 70 } }).find(
        (r) => r.label === 'Temperatures',
      )?.value,
    ).toBe('Unclassified 80°C');
    expect(buildSnapshot({}, {}).some((r) => r.label === 'Temperatures')).toBe(false);
  });
  it('matches exact unique hosts across HTTP/TCP ports without exposing URLs', () => {
    const values = radioValues({
      radios: [radio('a', 'modem.local'), radio('b', 'other.local')],
      sensors: {
        readings: [
          sensor('unrelated-name', 'https://user:SECRET@MODEM.local:80/private?token=SECRET'),
          sensor('modem.local', 'http://other.local', 'OtherBoard'),
        ],
      },
    });
    expect(values[0]).toContain('EtherMesh-1W');
    expect(values[1]).toContain('OtherBoard');
    expect(values.join()).not.toMatch(/SECRET|private|connected/);
  });
  it('rejects unmatched, malformed and ambiguous associations', () => {
    for (const readings of [
      [sensor('modem.local', 'http://elsewhere')],
      [sensor('x', 'ftp://modem.local')],
      [sensor('x', 'http://modem.local'), sensor('y', 'https://modem.local')],
    ]) {
      expect(
        radioValues({ radios: [radio('a', 'modem.local')], sensors: { readings } })[0],
      ).not.toContain('EtherMesh');
    }
    expect(
      radioValues({
        radios: [radio('a', '127.1')],
        sensors: { readings: [sensor('x', 'http://127.0.0.1')] },
      })[0],
    ).not.toContain('EtherMesh');
  });
  it('does not reuse a host-only association across ambiguous radio services', () => {
    const values = radioValues({
      radios: [
        radio('a', 'modem.local'),
        { ...radio('b', 'modem.local'), modem_tcp: { host: 'modem.local', port: 5056 } },
      ],
      sensors: { readings: [sensor('x', 'http://modem.local')] },
    });
    expect(values.join()).not.toContain('EtherMesh');
  });
  it('does not claim stale/error/disabled telemetry as current hardware', () => {
    for (const patch of [{ ok: false }, { timestamp: '2020-01-01' }, { timestamp: null }]) {
      expect(
        radioValues({
          radios: [radio('a', 'modem.local')],
          sensors: { readings: [{ ...sensor('x', 'http://modem.local'), ...patch }] },
        })[0],
      ).not.toContain('EtherMesh');
    }
    expect(
      radioValues({
        radios: [radio('a', 'modem.local')],
        sensors: { enabled: false, readings: [sensor('x', 'http://modem.local')] },
      })[0],
    ).not.toContain('EtherMesh');
  });
  it('uses safe loaded host metadata for ambiguity and effective cadence, not global defaults', () => {
    const reading = sensor('x', 'http://modem.local');
    const inventory = [
      {
        name: 'x',
        type: 'openhop_modem',
        enabled: true,
        loaded: true,
        source_host: 'modem.local',
        poll_interval_seconds: 5,
      },
    ];
    const stats = {
      radios: [radio('a', 'modem.local')],
      sensors: { inventory, readings: [reading], poll_interval_seconds: 9999 },
    };
    expect(radioValues(stats)[0]).toContain('EtherMesh');
    expect(
      radioValues({
        ...stats,
        sensors: {
          ...stats.sensors,
          readings: [{ ...reading, timestamp: '2026-01-01T00:00:00Z' }],
          inventory: [{ ...inventory[0], poll_interval_seconds: 1 }],
        },
      })[0],
    ).not.toContain('EtherMesh');
    expect(
      radioValues({
        ...stats,
        sensors: {
          ...stats.sensors,
          inventory: [...inventory, { ...inventory[0], name: 'awaiting' }],
        },
      })[0],
    ).not.toContain('EtherMesh');
    expect(
      radioValues({
        ...stats,
        sensors: {
          ...stats.sensors,
          inventory: [{ ...inventory[0], source_host: 'elsewhere.local' }],
        },
      })[0],
    ).not.toContain('EtherMesh');
    expect(
      radioValues({
        radio_type: 'modem_tcp',
        modem_tcp: { host: 'modem.local' },
        sensors: { readings: [reading] },
      })[0],
    ).toContain('EtherMesh');
  });
  it('associates canonical bare IPv6 inventory and TCP hosts with bracketed HTTP origins', () => {
    const loaded = {
      name: 'x',
      type: 'openhop_modem',
      enabled: true,
      loaded: true,
      source_host: '2001:db8::1',
      poll_interval_seconds: 5,
    };
    const reading = sensor('x', 'http://[2001:0DB8:0:0:0:0:0:1]:80/stats');
    const values = (host: string, inventory = [loaded], readings = [reading]) =>
      radioValues({
        radios: [radio('a', host)],
        sensors: { inventory, readings },
      });
    expect(values('2001:db8::1')[0]).toContain('EtherMesh');
    expect(values('[2001:db8::1]')[0]).toContain('EtherMesh');
    expect(values('2001:db8::1', [{ ...loaded, source_host: '2001:db8::2' }])[0]).not.toContain(
      'EtherMesh',
    );
    expect(values('2001:db8::1', [loaded, { ...loaded, name: 'other' }])[0]).not.toContain(
      'EtherMesh',
    );
    expect(values('2001:db8:::1')[0]).not.toContain('EtherMesh');
    expect(
      radioValues({
        radios: [radio('a', '2001:db8::1'), radio('b', '[2001:0db8::1]')],
        sensors: { inventory: [loaded], readings: [reading] },
      }).join(),
    ).not.toContain('EtherMesh');
  });
  it('does not let unrelated unloaded instances hide a valid loaded model', () => {
    const loaded = {
      name: 'x',
      type: 'openhop_modem',
      enabled: true,
      loaded: true,
      source_host: 'modem.local',
      poll_interval_seconds: 5,
    };
    const failed = { name: 'failed', type: 'openhop_modem', enabled: true, loaded: false };
    const values = (other: Record<string, unknown>) =>
      radioValues({
        radios: [radio('a', 'modem.local')],
        sensors: { inventory: [loaded, other], readings: [sensor('x', 'http://modem.local')] },
      });
    expect(values(failed)[0]).toContain('EtherMesh');
    expect(values({ ...failed, source_host: 'elsewhere.local' })[0]).toContain('EtherMesh');
    expect(values({ ...failed, source_host: 'modem.local' })[0]).not.toContain('EtherMesh');
    expect(values({ ...failed, loaded: true })[0]).not.toContain('EtherMesh');
  });
  it('supports reviewed nested system.board as well as normalized system_board', () => {
    const s = sensor('x', 'http://modem.local');
    s.data = {
      url: 'http://modem.local',
      system: { board: 'NestedBoard' },
    } as unknown as typeof s.data;
    expect(
      radioValues({ radios: [radio('a', 'modem.local')], sensors: { readings: [s] } })[0],
    ).toContain('NestedBoard');
  });
});
