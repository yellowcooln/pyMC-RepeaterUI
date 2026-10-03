import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '@/commands/hopfetch/model';
describe('hopfetch model', () => {
  it('preserves explicit disabled radio overrides and normalizes profile IDs', () => {
    for (const radio_type of [null, 'no_radio', '']) {
      const rows = buildSnapshot(
        {
          radio_type: 'sx1262',
          radios: [{ id: 7, radio_type }],
          radio_profiles: [{ radio_id: '7', frequency_hz: 915000000 }],
        },
        null,
      );
      expect(rows.find((row) => row.label === 'Radio 7')?.value).toContain('disabled');
      expect(JSON.stringify(rows)).toContain('915 MHz');
    }
  });
  it('retains every configured radio with profile-specific RF and honest link evidence', () => {
    const rows = buildSnapshot(
      {
        radios: [
          { id: 'a', name: 'North', radio_type: 'modem_tcp' },
          { id: 'b', radio_type: 'sx1262' },
        ],
        radio_status: 'ok',
        modem_disconnected: ['a: modem_tcp'],
        radio_profiles: [
          {
            radio_id: 'a',
            frequency_hz: 868000000,
            bandwidth_hz: 125000,
            spreading_factor: 7,
            coding_rate: 5,
            tx_power: 0,
          },
          { radio_id: 'b', frequency_hz: 915000000 },
        ],
      },
      null,
    );
    const text = JSON.stringify(rows);
    expect(text).toContain('North');
    expect(text).toContain('disconnected');
    expect(text).toContain('868 MHz');
    expect(text).toContain('915 MHz');
    expect(text).toContain('0 dBm');
    expect(text).toContain('link unknown');
    expect(text).not.toContain('connected ·');
  });
  it('handles single and explicitly absent radio configurations', () => {
    expect(
      JSON.stringify(
        buildSnapshot({ config: { radio_type: 'kiss', radio: { frequency: 868000000 } } }, null),
      ),
    ).toContain('kiss');
    expect(JSON.stringify(buildSnapshot({ config: { radio_type: 'none' } }, null))).toContain(
      'none configured',
    );
  });
  it('lists nested sensor inventories without dumping measurements or errors', () => {
    const stats = {
      config: {
        sensors: {
          enabled: true,
          definitions: [
            { name: 'weather', type: 'bme280' },
            { name: 'modem', type: 'openhop_modem', settings: { poll_interval_seconds: 5 } },
            { name: 'off', type: 'test', enabled: false },
            { name: 'pending', type: 'test' },
          ],
        },
      },
      sensors: {
        enabled: true,
        readings: [
          {
            name: 'weather',
            type: 'bme280',
            ok: true,
            timestamp: '2020-01-01',
            data: { nested: { token: 'SECRET' } },
          },
          { name: 'modem', type: 'openhop_modem', ok: true, timestamp: '2020-01-01' },
          { name: 'broken', type: 'test', ok: false, error: 'SECRET' },
        ],
      },
    };
    const text = JSON.stringify(buildSnapshot(stats, null, Date.parse('2026-01-01')));
    expect(text).toContain('reporting (age unknown)');
    expect(text).toContain('stale');
    expect(text).toContain('disabled');
    expect(text).toContain('awaiting');
    expect(text).toContain('error');
    expect(text).not.toContain('SECRET');
  });
  it('uses backend summary inventory including sensors without readings', () => {
    const inventory = [
      { name: 'weather', type: 'bme280', enabled: true, loaded: true },
      { name: 'off', type: 'test', enabled: false, loaded: false },
      { name: 'broken', type: 'test', enabled: true, loaded: false },
      { name: 'pending', type: 'test', enabled: true, loaded: true },
      { name: 'unknown', type: 'test', enabled: true },
    ];
    const rows = buildSnapshot(
      {
        config: { node_name: 'Hill' },
        sensors: {
          enabled: true,
          configured: 5,
          loaded: 2,
          inventory,
          readings: [{ name: 'weather', type: 'bme280', ok: true, timestamp: '2026-01-01' }],
        },
      },
      null,
    );
    expect(rows.find((r) => r.label === 'Sensors')?.value).toBe('5 configured');
    expect(rows.filter((r) => r.label === 'Sensor').map((r) => r.value)).toEqual([
      'weather (bme280) · reporting (age unknown)',
      'off (test) · disabled',
      'broken (test) · not loaded',
      'pending (test) · awaiting',
      'unknown (test) · unknown',
    ]);
  });
  it('prefers safe inventory over legacy definitions and merges reading errors', () => {
    const rows = buildSnapshot(
      {
        config: { sensors: { definitions: [{ name: 'obsolete', type: 'test' }] } },
        sensors: {
          enabled: true,
          configured: 2,
          inventory: [
            { name: 'failed', type: 'test', enabled: true, loaded: false },
            { name: 'disabled', type: 'test', enabled: false, loaded: false },
          ],
          readings: [
            { name: 'failed', type: 'test', ok: false, error: 'private diagnostic' },
            { name: 'extra', type: 'test', ok: true, timestamp: null },
          ],
        },
      },
      null,
    );
    const text = JSON.stringify(rows);
    expect(text).not.toContain('obsolete');
    expect(text).not.toContain('private diagnostic');
    expect(text).toContain('failed (test) · error');
    expect(text).toContain('disabled (test) · disabled');
    expect(text).toContain('extra (test) · awaiting');
  });
  it('labels partial older summaries without inventing configured sensor names', () => {
    const rows = buildSnapshot(
      {
        sensors: {
          enabled: true,
          configured: 5,
          readings: [{ name: 'weather', type: 'bme280', ok: false, error: 'secret' }],
        },
      },
      null,
    );
    expect(rows.find((r) => r.label === 'Sensors')?.value).toBe(
      '5 configured · names incomplete (1 visible)',
    );
    expect(rows.filter((r) => r.label === 'Sensor')).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain('secret');
  });
  it('distinguishes disabled manager, no sensors and unknown data', () => {
    expect(JSON.stringify(buildSnapshot({ sensors: { enabled: false } }, null))).toContain(
      'manager disabled',
    );
    expect(
      JSON.stringify(
        buildSnapshot({ sensors: { enabled: true, configured: 0, readings: [] } }, null),
      ),
    ).toContain('none configured');
    expect(JSON.stringify(buildSnapshot({}, null))).toContain('inventory unknown');
  });

  it('allowlists node and host fields, preserving zero', () => {
    const rows = buildSnapshot(
      { config: { node_name: 'Hill' }, uptime_seconds: 0, version: '1' },
      {
        cpu: { usage_percent: 0, count: 4 },
        system: { os: 'Linux', uptime: 0 },
        memory: { used: 0, total: 1024 },
      },
    );
    const text = JSON.stringify(rows);
    expect(text).toContain('Hill');
    expect(text).toContain('0%');
    expect(text).toContain('0 B / 1 KiB');
    expect(text).toContain('0s');
  });
});
