import { describe, expect, it } from 'vitest';
import { renderSnapshot, cellWidth } from '@/commands/hopfetch/renderer';
import { buildSnapshot } from '@/commands/hopfetch/model';
describe('hopfetch renderer', () => {
  it.each([24, 40, 80, 110, 180])('wraps every entry within %i cells', (cols) => {
    const rows = Array.from({ length: 20 }, (_, i) => ({
      label: `Radio ${i}`,
      value: `測試🛰️é-${i}-` + 'long'.repeat(25),
    }));
    const lines = renderSnapshot(rows, { cols, rows: 28 });
    expect(lines.every((line) => cellWidth(line) <= cols)).toBe(true);
    for (let i = 0; i < 20; i++) expect(lines.join('')).toContain(`-${i}-`);
  });
  it('fits complete host telemetry and three radios in 30 rows', () => {
    const radios = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      name: ['North', 'South', 'Local'][i],
      radio_type: 'modem_tcp',
    }));
    const radio_profiles = radios.map((r) => ({
      radio_id: r.id,
      frequency_hz: 868000000,
      bandwidth_hz: 125000,
      spreading_factor: 7,
      coding_rate: 5,
      tx_power: 22,
    }));
    const inventory = Array.from({ length: 5 }, (_, i) => ({
      name: `sensor${i}`,
      type: 'bme280',
      enabled: i !== 3,
      loaded: i !== 4,
    }));
    const readings = inventory
      .slice(0, 3)
      .map((s) => ({ name: s.name, type: s.type, ok: true, timestamp: '2026-01-01' }));
    const temperatures = Object.fromEntries(
      [
        'cpu_package',
        'core0',
        'core1',
        'core2',
        'core3',
        'nvme',
        'wifi',
        'acpi',
        'board',
        'ambient',
        'chipset',
        'gpu',
      ].map((name, i) => [name, 40 + i]),
    );
    const rows = buildSnapshot(
      {
        config: { node_name: 'Hilltop Repeater' },
        mode: 'repeater',
        version: '2.3.1',
        core_version: '1.12.0',
        uptime_seconds: 86400,
        radios,
        radio_profiles,
        sensors: { enabled: true, configured: 5, inventory, readings },
      },
      {
        system: {
          os: 'Debian GNU/Linux 13',
          kernel: '6.12.0-amd64',
          arch: 'x86_64',
          model: 'Intel NUC',
          uptime: 172800,
        },
        cpu: { model: 'Intel Core i5-8259U', count: 8, usage_percent: 12 },
        memory: { used: 2147483648, total: 8589934592 },
        disk: { used: 10737418240, total: 128849018880 },
        temperatures,
      },
    );
    const lines = renderSnapshot(rows, { cols: 110, rows: 30 });
    expect(lines.length).toBeLessThanOrEqual(30);
    const text = lines.join('');
    expect(text).toContain('CPU 40°C · Drive 45°C');
    expect(text).not.toContain('cpu_package');
    expect(text).not.toContain('core0');
    expect(lines.every((line) => cellWidth(line) <= 110)).toBe(true);
    for (const radio of radios) expect(text).toContain(radio.name);
  });
  it.each([40, 80, 110, 180])('keeps fitting inventory tokens intact at %i cells', (cols) => {
    const names = Array.from(
      { length: 12 },
      (_, i) => `fixture_temp_${String(i + 1).padStart(2, '0')}`,
    );
    const lines = renderSnapshot(
      [{ label: 'Temperatures', value: names.map((name) => `${name} 40°C`).join(' · ') }],
      { cols, plain: true },
    );
    expect(lines.every((line) => cellWidth(line) <= cols)).toBe(true);
    for (const name of names) expect(lines.some((line) => line.includes(name))).toBe(true);
  });
  it('wraps at whitespace before falling back to cells for an oversized token', () => {
    const lines = renderSnapshot([{ label: 'X', value: 'alpha beta gamma' }], {
      cols: 12,
      plain: true,
    });
    expect(lines).toEqual(['X: alpha', 'beta gamma']);
    const long = '測試é'.repeat(12);
    const hard = renderSnapshot([{ label: 'X', value: long }], { cols: 12, plain: true });
    expect(hard.every((line) => cellWidth(line) <= 12)).toBe(true);
    expect(hard[0]).toBe('X:');
    expect(hard.slice(1).join('')).toBe(long);
    expect(hard.every((line) => !line.startsWith('́'))).toBe(true);
  });
  it('uses the high-contrast existing text ANSI slot, without cyan or changing the palette', () => {
    const text = renderSnapshot([{ label: 'Node', value: 'Hill' }], { cols: 110 }).join('');
    expect(text).toContain('\x1b[1;37m');
    expect(text).not.toContain('\x1b[1;36m');
  });
  it('includes a compact leaping rabbit rather than only three brand words', () => {
    const lines = renderSnapshot(buildSnapshot({}, null), { cols: 110 });
    expect(lines.join('')).toContain('openHop');
    expect(lines.join('')).toContain('(__');
    expect(lines.length).toBeLessThanOrEqual(30);
  });
  it('plain has no logo or ANSI; injected controls cannot execute', () => {
    const lines = renderSnapshot(
      [{ label: '\x1b[31mUnsafe', value: '\x1b]0;bad\x07Hi\r\nthere' }],
      { cols: 80, plain: true },
    );
    expect(lines.join('')).not.toMatch(/[\x00-\x1f\x7f]/);
    expect(lines.join('')).not.toContain('openHop');
  });
  it('uses branding beside useful width and a wordmark on narrow terminals', () => {
    const rows = [{ label: 'Node', value: 'Hill' }];
    expect(renderSnapshot(rows, { cols: 110 }).join('')).toContain('openHop');
    expect(renderSnapshot(rows, { cols: 30 }).join('')).toContain('openHop');
  });
});
