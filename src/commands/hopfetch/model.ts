import { normalizeModemTransportConfig } from '@/utils/modemTransport';

export interface SnapshotRow {
  label: string;
  value: string;
}
export type RecordData = Record<string, unknown>;
export const record = (value: unknown): RecordData =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as RecordData) : {};
export const list = (value: unknown): RecordData[] =>
  Array.isArray(value) ? value.map(record) : [];

/** Backend strings are data, never terminal instructions (including bidi controls). */
export function sanitize(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return 'unknown';
  return (
    String(value)
      .replace(/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/g, '')
      .replace(/[\x00-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u206f]/g, '')
      .trim() || 'unknown'
  );
}
export function number(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
const shown = (value: unknown, suffix = '') =>
  number(value) === undefined ? 'unknown' : `${value}${suffix}`;
export function bytes(value: unknown): string {
  const n = number(value);
  if (n === undefined || n < 0) return 'unknown';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const i = n === 0 ? 0 : Math.min(4, Math.floor(Math.log(n) / Math.log(1024)));
  return `${Number((n / 1024 ** i).toFixed(1))} ${units[i]}`;
}
export function uptime(value: unknown): string {
  const n = number(value);
  if (n === undefined || n < 0) return 'unknown';
  const s = Math.floor(n);
  return s < 60
    ? `${s}s`
    : `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}
/** psutil keys identify chip families, not individual channel labels. */
function compactTemperatures(value: unknown): string {
  const groups: Record<string, number[]> = { CPU: [], Drive: [], Board: [], Unclassified: [] };
  for (const [key, reading] of Object.entries(record(value))) {
    const temp = number(reading);
    if (temp === undefined) continue;
    const chip = key.toLowerCase().replace(/_\d+$/, '');
    const group = /^(coretemp|k10temp|cpu[-_]thermal|cpu_package|zenpower)$/.test(chip)
      ? 'CPU'
      : /^(nvme|drivetemp)$/.test(chip)
        ? 'Drive'
        : /^(acpitz|soc[-_]thermal|bcm2835[-_]thermal)$/.test(chip)
          ? 'Board'
          : 'Unclassified';
    groups[group]!.push(temp);
  }
  const labels = groups.CPU!.length ? ['CPU', 'Drive'] : ['Board', 'Drive'];
  if (!labels.some((label) => groups[label]!.length)) labels.push('Unclassified');
  return labels
    .filter((label) => groups[label]!.length)
    .map((label) => `${label} ${Math.max(...groups[label]!)}°C`)
    .join(' · ');
}

/** Strict host tokens: never let URL parsing coerce short/hex IPv4 addresses. */
function hostToken(value: unknown): string | undefined {
  if (typeof value !== 'string' || value !== value.trim()) return;
  const host = value.toLowerCase();
  if (host.includes(':')) {
    const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
    if (!/^[0-9a-f:.]+$/.test(bare)) return;
    try {
      return new URL(`http://[${bare}]`).hostname.slice(1, -1);
    } catch {
      return;
    }
  }
  if (/^[0-9.]+$/.test(host)) {
    const parts = host.split('.');
    return parts.length === 4 &&
      parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
      ? host
      : undefined;
  }
  if (!host.includes('.') && !/[a-z]/.test(host)) return;
  if (/^0x/i.test(host)) return;
  return host.length <= 253 &&
    host.split('.').every((p) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(p))
    ? host
    : undefined;
}
function sensorHost(value: unknown): string | undefined {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) return;
  const match = value.match(/^https?:\/\/(?:[^/?#@]*@)?(\[[^\]]+\]|[^:/?#]+)(?::\d+)?(?:[/?#]|$)/i);
  if (!match) return;
  try {
    const url = new URL(value);
    const host = hostToken(match[1]);
    return host !== undefined && host === hostToken(url.hostname) ? host : undefined;
  } catch {
    return;
  }
}
function modemModel(stats: RecordData, hardware: RecordData, now: number): string | undefined {
  const host = hostToken(record(hardware.modem_tcp).host);
  const summary = record(stats.sensors);
  if (!host || summary.enabled === false) return;
  const inventory = list(summary.inventory).filter((d) =>
    ['openhop_modem', 'pymc_modem'].includes(String(d.type)),
  );
  const readings = list(summary.readings).filter((r) =>
    ['openhop_modem', 'pymc_modem'].includes(String(r.type)),
  );
  const located = inventory
    // Unloaded definitions without an origin are not runtime devices. If safe
    // metadata supplies an origin, retain it to detect same-host ambiguity.
    .filter((d) => d.enabled !== false && (d.loaded !== false || hostToken(d.source_host)))
    .map((def) => {
      const candidates = readings.filter((r) => r.name === def.name);
      const reading = candidates.length === 1 ? candidates[0] : undefined;
      const fromReading = sensorHost(record(reading?.data).url);
      const fromInventory = hostToken(def.source_host);
      return {
        def,
        reading,
        host:
          candidates.length > 1 || (fromReading && fromInventory && fromReading !== fromInventory)
            ? undefined
            : (fromInventory ?? fromReading),
      };
    });
  for (const reading of readings) {
    if (!inventory.some((def) => def.name === reading.name))
      located.push({ def: {}, reading, host: sensorHost(record(reading.data).url) });
  }
  // An unlocated configured device could share the host: no false certainty.
  if (located.some((device) => !device.host)) return;
  const matches = located.filter((device) => device.host === host);
  if (matches.length !== 1 || !matches[0]!.reading) return;
  const { reading: r, def } = matches[0]!;
  if (!r) return;
  if (r.ok !== true || r.timestamp === null || def?.enabled === false || def?.loaded === false)
    return;
  const cadence = number(def.poll_interval_seconds ?? r.poll_interval_seconds);
  const timestamp = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
  if (
    !Number.isFinite(timestamp) ||
    timestamp > now ||
    (cadence !== undefined && cadence > 0 && now - timestamp > cadence * 3000)
  )
    return;
  const data = record(r.data);
  const board = data.system_board ?? record(data.system).board;
  return typeof board === 'string' && board.trim()
    ? `${sanitize(board)} (sensor reported)`
    : undefined;
}
const hardwareDefaults: RecordData = {
  gpio_chip: 0,
  use_gpiod_backend: false,
  radio_timing_delay: 0.01,
  txled_pin: -1,
  rxled_pin: -1,
  use_dio3_tcxo: false,
  use_dio2_rf: false,
  is_waveshare: false,
  dio3_tcxo_voltage: 1.8,
};
const hardwareKeys = [
  'bus_id',
  'cs_id',
  'cs_pin',
  'reset_pin',
  'busy_pin',
  'irq_pin',
  'txen_pin',
  'rxen_pin',
  ...Object.keys(hardwareDefaults),
];
/** Match config.py's int(value.strip().rstrip(','), 0), not JS coercion. */
function factoryInt(value: unknown): number | undefined {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : undefined;
  if (typeof value !== 'string') return;
  const token = value.trim().replace(/,+$/, '');
  if (
    !/^[+-]?(?:0[xX]_?[\da-fA-F](?:_?[\da-fA-F])*|0[bB]_?[01](?:_?[01])*|0[oO]_?[0-7](?:_?[0-7])*|[1-9](?:_?\d)*|0(?:_?0)*)$/.test(
      token,
    )
  )
    return;
  const unsigned = token.replace(/^[+-]/, '').replace(/_/g, '');
  const n = Number(unsigned) * (token.startsWith('-') ? -1 : 1);
  return Number.isSafeInteger(n) ? n : undefined;
}
function factoryFloat(value: unknown): number | undefined {
  if (typeof value === 'number') return number(value);
  if (
    typeof value !== 'string' ||
    !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim())
  )
    return;
  return number(Number(value));
}
function hardwareValue(cfg: RecordData, key: string): unknown {
  const value = Object.prototype.hasOwnProperty.call(cfg, key) ? cfg[key] : hardwareDefaults[key];
  if (['use_dio3_tcxo', 'use_dio2_rf', 'is_waveshare', 'use_gpiod_backend'].includes(key))
    return typeof value === 'boolean' ? value : undefined;
  if (['dio3_tcxo_voltage', 'radio_timing_delay'].includes(key)) return factoryFloat(value);
  // Optional parsed integers explicitly null use the factory default.
  return factoryInt(value ?? hardwareDefaults[key]);
}
function enablePins(cfg: RecordData): unknown {
  let raw = cfg.en_pins;
  if (typeof raw === 'string') {
    let text = raw.trim();
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
    raw = text.split(',').filter((p) => p.trim());
  }
  if (raw != null && !Array.isArray(raw)) return;
  // The factory parses the scalar even when a list takes precedence.
  const scalar = factoryInt(cfg.en_pin ?? -1);
  if (scalar === undefined) return;
  const pins = raw == null ? [] : (raw as unknown[]).map(factoryInt);
  if (pins.some((p) => p === undefined)) return;
  return [...new Set((pins.length ? pins : [scalar]).filter((p) => p !== -1))];
}
function boardPreset(kind: unknown, hardware: RecordData, options: RecordData[]): string {
  if (!options.length) return 'preset unknown';
  const actual = record(hardware.sx1262);
  const matches = options.filter((option) => {
    const expected = record(option.config);
    if ((expected.radio_type ?? 'sx1262') !== kind) return false;
    if (kind === 'sx1262_ch341') {
      const adapter = record(hardware.ch341);
      if (
        !['vid', 'pid'].every((key) => {
          const fallback = key === 'vid' ? 6790 : 21778;
          const id = factoryInt(adapter[key] ?? fallback);
          return id !== undefined && id === factoryInt(expected[key] ?? fallback);
        })
      )
        return false;
      // Adapter selectors choose the device, not the board pin map; never print them.
    }
    if (
      !hardwareKeys.every(
        (k) =>
          hardwareValue(actual, k) !== undefined &&
          hardwareValue(actual, k) === hardwareValue(expected, k),
      )
    )
      return false;
    const a = enablePins(actual),
      e = enablePins(expected);
    return a !== undefined && e !== undefined && JSON.stringify(a) === JSON.stringify(e);
  });
  return matches.length === 1
    ? `${sanitize(matches[0]!.name)} preset`
    : matches.length > 1
      ? 'preset ambiguous'
      : 'Custom';
}

function radioRows(
  stats: RecordData,
  config: RecordData,
  now: number,
  options: RecordData[],
): SnapshotRow[] {
  const profiles = list(stats.radio_profiles);
  const configured = list(stats.radios).length ? list(stats.radios) : list(config.radios);
  const kind = Object.prototype.hasOwnProperty.call(stats, 'radio_type')
    ? stats.radio_type
    : config.radio_type;
  const absent =
    kind === null || ['none', 'disabled', 'off', 'null', 'no_radio', ''].includes(String(kind));
  if (!configured.length && absent) return [{ label: 'Radios', value: 'none configured' }];
  const entries = configured.length
    ? configured
    : kind !== undefined
      ? [{ id: profiles[0]?.radio_id ?? 'radio0', radio_type: kind }]
      : profiles;
  if (!entries.length) return [{ label: 'Radios', value: 'inventory unknown' }];
  return entries.flatMap((entry, i) => {
    const id = entry.id ?? entry.radio_id ?? `radio${i}`;
    const backend = Object.prototype.hasOwnProperty.call(entry, 'radio_type')
      ? entry.radio_type
      : kind;
    const profile = profiles.find((p) => String(p.radio_id) === String(id));
    const rf = profile ?? { ...record(config.radio), ...record(entry.radio) };
    const hardware = configured.length ? entry : { ...config, ...stats };
    const deviceHost = hostToken(record(hardware.modem_tcp).host);
    const ambiguousRadioHost =
      configured.filter(
        (radio) =>
          radio.radio_type === 'modem_tcp' &&
          radio.enabled !== false &&
          deviceHost &&
          hostToken(record(radio.modem_tcp).host) === deviceHost,
      ).length > 1;
    const identity =
      backend === 'modem_tcp' && !ambiguousRadioHost
        ? modemModel(stats, hardware, now)
        : ['sx1262', 'sx1262_ch341'].includes(String(backend))
          ? boardPreset(backend, hardware, options)
          : undefined;
    const downLabel = configured.length ? `${id}: ${backend}` : String(backend);
    // Absence from the down list is NOT proof of connectivity: older cores
    // lack transport state. Initialization health is aggregate, not link evidence.
    const down =
      Array.isArray(stats.modem_disconnected) && stats.modem_disconnected.includes(downLabel);
    const link =
      entry.enabled === false ||
      [null, '', 'none', 'disabled', 'off', 'null', 'no_radio'].includes(backend as string | null)
        ? 'disabled'
        : down
          ? 'link disconnected'
          : 'link unknown';
    const freq = number(profile ? rf.frequency_hz : rf.frequency);
    const bw = number(profile ? rf.bandwidth_hz : rf.bandwidth);
    return [
      {
        label: `Radio ${sanitize(id)}`,
        value: `${entry.name ? sanitize(entry.name) + ' · ' : ''}${identity ? identity + ' · ' : ''}${sanitize(backend)} · ${link}`,
      },
      {
        label: '  RF config',
        value: `${shown(freq === undefined ? undefined : freq / 1e6, ' MHz')} · BW ${shown(bw === undefined ? undefined : bw / 1e3, ' kHz')} · SF ${shown(rf.spreading_factor)} · CR ${shown(rf.coding_rate)} · power ${shown(rf.tx_power, ' dBm')}`,
      },
    ];
  });
}
export function buildSnapshot(
  statsValue: unknown,
  hardwareValue: unknown,
  now = Date.now(),
  hardwareOptions: unknown = [],
): SnapshotRow[] {
  const stats = normalizeModemTransportConfig(statsValue);
  const config = normalizeModemTransportConfig(stats.config);
  const hw = record(hardwareValue);
  const system = record(hw.system);
  const cpu = record(hw.cpu);
  const rows: SnapshotRow[] = [];
  const add = (label: string, value: string) => rows.push({ label, value });
  add(
    'Node',
    `${sanitize(config.node_name)} · ${sanitize(stats.mode ?? record(config.repeater).mode)}`,
  );
  add('Versions', `Repeater ${sanitize(stats.version)} · Core ${sanitize(stats.core_version)}`);
  add('OS', sanitize(system.os));
  add('Kernel / arch', `${sanitize(system.kernel)} / ${sanitize(system.arch)}`);
  add('Model', sanitize(system.model));
  add(
    'CPU',
    `${sanitize(cpu.model)} · ${shown(cpu.count, cpu.count === 1 ? ' core' : ' cores')} · ${shown(cpu.usage_percent, '%')}`,
  );
  for (const [label, field] of [
    ['RAM', 'memory'],
    ['Disk', 'disk'],
  ]) {
    const data = record(hw[field]);
    add(label!, `${bytes(data.used)} / ${bytes(data.total)}`);
  }
  add('Uptime', `Host ${uptime(system.uptime)} · Service ${uptime(stats.uptime_seconds)}`);
  const temperatures = compactTemperatures(hw.temperatures);
  if (temperatures) add('Temperatures', temperatures);
  rows.push(...radioRows(stats, config, now, list(hardwareOptions)));
  add('Scope', 'Backend-visible system; container limits may apply');
  return rows;
}
