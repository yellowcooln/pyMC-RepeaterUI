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
function radioRows(stats: RecordData, config: RecordData): SnapshotRow[] {
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
        value: `${entry.name ? sanitize(entry.name) + ' · ' : ''}${sanitize(backend)} · ${link}`,
      },
      {
        label: '  RF config',
        value: `${shown(freq === undefined ? undefined : freq / 1e6, ' MHz')} · BW ${shown(bw === undefined ? undefined : bw / 1e3, ' kHz')} · SF ${shown(rf.spreading_factor)} · CR ${shown(rf.coding_rate)} · power ${shown(rf.tx_power, ' dBm')}`,
      },
    ];
  });
}
function sensorRows(stats: RecordData, config: RecordData, now: number): SnapshotRow[] {
  const summary = record(stats.sensors);
  const section = record(config.sensors);
  const hasInventory = Array.isArray(summary.inventory);
  const hasDefinitions = Array.isArray(section.definitions ?? section.sensors);
  const definitions = list(
    hasInventory ? summary.inventory : (section.definitions ?? section.sensors),
  );
  const readings = list(summary.readings);
  const used = new Set<RecordData>();
  const configured =
    number(summary.configured) ?? (hasInventory || hasDefinitions ? definitions.length : undefined);
  const inventoryLabel =
    configured === 0
      ? 'none configured'
      : configured !== undefined
        ? `${configured} configured`
        : 'configured count unknown';
  const rows: SnapshotRow[] = [
    {
      label: 'Sensors',
      value:
        (summary.enabled ?? section.enabled) === false
          ? 'manager disabled'
          : !hasInventory && !hasDefinitions && configured !== 0
            ? `${inventoryLabel === 'configured count unknown' && !readings.length ? 'inventory unknown' : inventoryLabel} · names incomplete (${readings.length} visible)`
            : inventoryLabel,
    },
  ];
  const entries = definitions.map((def) => {
    const reading = readings.find((r) => r.name === def.name && !used.has(r));
    if (reading) used.add(reading);
    return { def, reading };
  });
  for (const reading of readings) if (!used.has(reading)) entries.push({ def: {}, reading });
  for (const { def, reading } of entries) {
    const r = reading ?? {};
    let state = 'unknown';
    if (
      (summary.enabled ?? section.enabled) === false ||
      def.enabled === false ||
      r.error === 'disabled'
    )
      state = 'disabled';
    else if (r.ok === false) state = 'error';
    else if (def.loaded === false) state = 'not loaded';
    else if (!reading) state = def.loaded === true || hasDefinitions ? 'awaiting' : 'unknown';
    else if (r.timestamp === null) state = 'awaiting';
    else if (r.ok === true) {
      // Only a known per-sensor cadence permits stale classification. A global
      // manager interval may be overridden by a plugin; never guess from it.
      const cadence = number(r.poll_interval_seconds ?? record(def.settings).poll_interval_seconds);
      const timestamp = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
      state =
        cadence !== undefined && cadence > 0 && Number.isFinite(timestamp) && timestamp <= now
          ? now - timestamp > cadence * 3000
            ? 'stale'
            : 'reporting'
          : 'reporting (age unknown)';
    }
    rows.push({
      label: 'Sensor',
      value: `${sanitize(def.name ?? r.name)} (${sanitize(def.type ?? r.type)}) · ${state}`,
    });
  }
  return rows;
}
export function buildSnapshot(
  statsValue: unknown,
  hardwareValue: unknown,
  now = Date.now(),
): SnapshotRow[] {
  const stats = record(statsValue);
  const config = record(stats.config);
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
    `${sanitize(cpu.model)} · ${shown(cpu.count, ' cores')} · ${shown(cpu.usage_percent, '%')}`,
  );
  for (const [label, field] of [
    ['RAM', 'memory'],
    ['Disk', 'disk'],
  ]) {
    const data = record(hw[field]);
    add(label!, `${bytes(data.used)} / ${bytes(data.total)}`);
  }
  add('Uptime', `Host ${uptime(system.uptime)} · Service ${uptime(stats.uptime_seconds)}`);
  const temperatures = Object.entries(record(hw.temperatures))
    .filter(([, temp]) => number(temp) !== undefined)
    .map(([name, temp]) => `${sanitize(name)} ${shown(temp, '°C')}`);
  if (temperatures.length) add('Temperatures', temperatures.join(' · '));
  rows.push(...radioRows(stats, config), ...sensorRows(stats, config, now));
  add('Scope', 'Backend-visible system; container limits may apply');
  return rows;
}
