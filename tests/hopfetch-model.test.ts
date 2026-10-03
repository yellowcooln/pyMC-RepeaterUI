import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '@/commands/hopfetch/model';
describe('hopfetch model', () => {
  it('keeps arbitrary radios on individual named rows with only their own RF and optional hardware', () => {
    const radios = Array.from({ length: 5 }, (_, i) => ({
      id: i,
      name: ['porch', 'third-floor', 'Roof', 'East', 'West'][i],
      radio_type: 'modem_tcp',
    }));
    const rows = buildSnapshot(
      {
        config: { radio: { frequency: 999000000 } },
        radios,
        radio_profiles: radios
          .map((r, i) => ({
            radio_id: String(r.id),
            frequency_hz: (868 + i) * 1e6,
            bandwidth_hz: 125000,
            spreading_factor: 7 + i,
            coding_rate: 5,
            tx_power: i,
          }))
          .reverse(),
      },
      null,
    );
    expect(rows.filter((r) => r.label.startsWith('Radio '))).toHaveLength(5);
    for (const [i, radio] of radios.entries()) {
      expect(rows.find((r) => r.label === `Radio ${radio.name}`)?.value).toBe(
        `${868 + i} MHz · BW 125 kHz · SF ${7 + i} · CR 5 · power ${i} dBm`,
      );
    }
    expect(JSON.stringify(rows)).not.toMatch(
      /RF config|Sensor|modem_tcp|link unknown|sensor reported|999 MHz/,
    );
  });
  it('never substitutes shared RF for a configured radio missing its own settings', () => {
    const rows = buildSnapshot(
      {
        config: { radio: { frequency: 999000000, bandwidth: 250000 } },
        radios: [
          { id: 'missing', radio_type: 'modem_tcp' },
          { id: 'bad', radio: { frequency: Infinity } },
        ],
      },
      null,
    );
    for (const id of ['missing', 'bad']) {
      expect(rows.find((r) => r.label === `Radio ${id}`)?.value).toBe(
        'unknown · BW unknown · SF unknown · CR unknown · power unknown',
      );
    }
  });
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
    expect(text).not.toContain('link unknown');
    expect(text).not.toContain('connected ·');
  });
  it('handles single and explicitly absent radio configurations', () => {
    expect(
      JSON.stringify(
        buildSnapshot({ config: { radio_type: 'kiss', radio: { frequency: 868000000 } } }, null),
      ),
    ).toContain('868 MHz');
    expect(JSON.stringify(buildSnapshot({ config: { radio_type: 'none' } }, null))).toContain(
      'none configured',
    );
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
