<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  Activity,
  AlertTriangle,
  Battery,
  Clock3,
  Cpu,
  Gauge,
  Radio,
  RefreshCw,
  Thermometer,
  Zap,
} from '@lucide/vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
import Spinner from '@/components/ui/Spinner.vue';
import { useSystemStore } from '@/stores/system';

defineOptions({ name: 'SensorsView' });

interface SensorReading {
  name?: string;
  type?: string;
  ok?: boolean;
  timestamp?: string | null;
  error?: string;
  data?: Record<string, unknown>;
}

interface SensorsSummary {
  enabled?: boolean;
  poll_interval_seconds?: number;
  configured?: number;
  loaded?: number;
  running?: boolean;
  readings?: SensorReading[];
}

const systemStore = useSystemStore();

const sensors = computed<SensorsSummary | null>(() => {
  const stats = systemStore.stats as { sensors?: SensorsSummary } | null;
  return stats?.sensors ?? null;
});

const readingRows = computed(() => sensors.value?.readings ?? []);
const healthyCount = computed(() => readingRows.value.filter((reading) => reading.ok).length);
const isRefreshing = ref(false);

const summaryCards = computed(() => {
  const s = sensors.value;
  if (!s) {
    return [
      { label: 'Service', value: 'Waiting', detail: 'Loading status', icon: Activity },
      { label: 'Health', value: '—', detail: 'No readings yet', icon: Gauge },
      { label: 'Sensors', value: '—', detail: 'Loading inventory', icon: Radio },
      { label: 'Refresh', value: '—', detail: 'Polling interval', icon: Clock3 },
    ];
  }

  return [
    {
      label: 'Service',
      value: s.running ? 'Polling' : s.enabled ? 'Stopped' : 'Disabled',
      detail: s.running ? 'Collection is active' : 'No active collection',
      icon: Activity,
    },
    {
      label: 'Health',
      value: `${healthyCount.value} of ${readingRows.value.length} healthy`,
      detail: readingRows.value.length ? 'Latest sensor cycle' : 'Waiting for readings',
      icon: Gauge,
    },
    {
      label: 'Sensors',
      value: `${s.loaded ?? 0} loaded`,
      detail: `${s.configured ?? 0} configured`,
      icon: Radio,
    },
    {
      label: 'Refresh',
      value:
        typeof s.poll_interval_seconds === 'number'
          ? `${s.poll_interval_seconds.toFixed(1)}s`
          : '—',
      detail: 'Polling interval',
      icon: Clock3,
    },
  ];
});

const UNIT_SUFFIXES = [
  ['solar_charge_rate_percent_per_hour', '%/hr'],
  ['percent_per_hour', '%/hr'],
  ['battery_percentage', '%'],
  ['battery_percent', '%'],
  ['percentage', '%'],
  ['percent', '%'],
  ['pct', '%'],
  ['temperature_c', '°C'],
  ['temperature_f', '°F'],
  ['speed_kmh', 'km/h'],
  ['course_degrees', '°'],
  ['voltage_mv', 'mV'],
  ['current_ma', 'mA'],
  ['capacity_mah', 'mAh'],
  ['power_mw', 'mW'],
  ['altitude_m', 'm'],
  ['voltage_v', 'V'],
] as const;

const titleCase = (value: string): string =>
  value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const fieldMeta = (key: string): { label: string; unit: string } => {
  const normalized = key.toLowerCase();
  const matched = UNIT_SUFFIXES.find(([suffix]) => normalized.endsWith(suffix));
  let labelKey = normalized;

  const explicitFieldLabels: Record<string, string> = {
    battery_percent: 'Battery',
    battery_percentage: 'Battery',
    battery_voltage_mv: 'Battery voltage',
    battery_voltage_v: 'Battery voltage',
    bus_voltage_v: 'Bus voltage',
    current_ma: 'Current',
    humidity_pct: 'Humidity',
    power_mw: 'Power',
    shunt_voltage_mv: 'Shunt voltage',
    shunt_voltage_v: 'Shunt voltage',
    solar_charge_rate_percent_per_hour: 'Solar charge rate',
    temperature_c: 'Temperature',
    temperature_f: 'Temperature',
    vbus_voltage_mv: 'VBUS voltage',
  };

  if (matched) {
    labelKey = labelKey.slice(0, -matched[0].length).replace(/_+$/, '');
  }

  const explicitLabels: Record<string, string> = {
    battery: 'Battery',
    bus: 'Bus voltage',
    charge_state: 'Charge state',
    datetime_utc: 'Device time',
    fix_quality: 'Fix quality',
    fix_valid: 'Fix valid',
    gps_enabled: 'GPS enabled',
    gps_seen: 'GPS seen',
    satellites_in_view: 'Satellites in view',
    satellites_used: 'Satellites used',
    shunt: 'Shunt voltage',
    source: 'Source',
    vbus: 'VBUS voltage',
  };

  const label =
    explicitFieldLabels[normalized] ??
    explicitLabels[labelKey] ??
    titleCase(labelKey || normalized);
  return { label, unit: matched?.[1] ?? '' };
};

const formatDecimal = (value: number, maximumFractionDigits = 3): string =>
  value.toLocaleString(undefined, {
    useGrouping: false,
    maximumFractionDigits,
  });

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = bytes / 1024 ** unitIndex;
  return `${formatDecimal(scaled, 1)} ${units[unitIndex]}`;
};

const formatCompactCount = (value: number): string => {
  const units = [
    { threshold: 1_000_000_000, suffix: 'B' },
    { threshold: 1_000_000, suffix: 'M' },
    { threshold: 1_000, suffix: 'K' },
  ];
  const unit = units.find(({ threshold }) => Math.abs(value) >= threshold);
  return unit
    ? `${formatDecimal(value / unit.threshold, 1)}${unit.suffix}`
    : formatDecimal(value, 0);
};

const formatDuration = (seconds: number): string => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const days = Math.floor(wholeSeconds / 86400);
  const hours = Math.floor((wholeSeconds % 86400) / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${wholeSeconds}s`;
};

const formatMetricValue = (path: string[], value: unknown): string => {
  const key = path[path.length - 1] ?? '';
  const fullPath = path.join('.').toLowerCase();
  if (value === null || value === undefined) return 'Not available';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'Not available';

    if (fullPath === 'cpu.frequency') return `${formatDecimal(value / 1000, 2)} GHz`;
    if (/^(memory|disk)\.(total|available|used|free)$/.test(fullPath)) return formatBytes(value);
    if (/^network\.bytes_(sent|recv)$/.test(fullPath)) return formatBytes(value);
    if (/^network\.packets_(sent|recv)$/.test(fullPath)) return formatCompactCount(value);
    if (fullPath.startsWith('cpu.load_avg.')) return formatDecimal(value, 2);
    if (fullPath === 'system.uptime') return formatDuration(value);
    if (fullPath === 'system.boot_time') return new Date(value * 1000).toLocaleString();
    if (path[0]?.toLowerCase() === 'temperatures') return `${formatDecimal(value, 1)}°C`;

    const formatted = formatDecimal(value);
    const unit = fieldMeta(key).unit;
    const separator = unit === '%' || unit.startsWith('°') ? '' : ' ';
    return `${formatted}${unit ? `${separator}${unit}` : ''}`;
  }
  if (typeof value === 'string') {
    if (key === 'datetime_utc') return formatTime(value);
    if (/^(https?:\/\/)/.test(value)) return value;
    return titleCase(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

type FlattenedMetric = { path: string[]; value: unknown };

const flattenMetrics = (data: Record<string, unknown>, prefix: string[] = []): FlattenedMetric[] =>
  Object.entries(data).flatMap(([key, value]) => {
    const path = [...prefix, key];
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length) {
      return flattenMetrics(value as Record<string, unknown>, path);
    }
    return [{ path, value }];
  });

const metricGroupLabel = (key: string): string => {
  const labels: Record<string, string> = {
    cpu: 'CPU',
    gps: 'GPS',
    vbus: 'VBUS',
  };
  return labels[key.toLowerCase()] ?? titleCase(key);
};

const metricRows = (reading: SensorReading) =>
  flattenMetrics(reading.data ?? {}).map(({ path, value }) => {
    const key = path[path.length - 1] ?? '';
    const group = path.slice(0, -1).map(metricGroupLabel).join(' · ');
    const label = fieldMeta(key).label;
    return {
      key: path.join('.'),
      label: group ? `${group} · ${label}` : label,
      value: formatMetricValue(path, value),
      prominent: typeof value === 'number' || typeof value === 'boolean',
    };
  });

const sensorIcon = (reading: SensorReading) => {
  const type = reading.type?.toLowerCase() ?? '';
  const keys = Object.keys(reading.data ?? {});
  if (type.includes('temperature') || type.includes('sht') || type.includes('ens')) {
    return Thermometer;
  }
  if (type.includes('ups') || keys.some((key) => key.includes('battery'))) return Battery;
  if (type.includes('ina') || keys.some((key) => key.includes('power'))) return Zap;
  if (type.includes('hardware')) return Cpu;
  if (type.includes('modem')) return Radio;
  return Gauge;
};

const sensorTypeLabel = (type: string | undefined): string => {
  if (type === 'pymc_modem') return 'pyMC Modem';
  return titleCase(type || 'Unknown sensor');
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const refreshNow = async () => {
  if (isRefreshing.value) return;
  isRefreshing.value = true;
  try {
    await systemStore.fetchStats();
  } finally {
    isRefreshing.value = false;
  }
};

useManagedPolling(
  async () => {
    await systemStore.fetchStats();
  },
  { intervalMs: 10_000, immediate: true },
);
</script>

<template>
  <div class="space-y-5 sm:space-y-6">
    <section class="glass-card overflow-hidden rounded-[15px]">
      <div class="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div class="flex min-w-0 items-start gap-4">
          <div
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-primary/opacity-medium bg-primary/opacity-light text-primary"
          >
            <Activity class="h-5 w-5" aria-hidden="true" />
          </div>
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2.5">
              <h1
                class="text-ui-title font-semibold tracking-tight text-content-heading sm:text-ui-title-lg"
              >
                Sensor telemetry
              </h1>
              <span
                v-if="sensors"
                class="status-badge"
                :class="sensors.running ? 'status-badge-green' : 'status-badge-amber'"
              >
                <span
                  class="h-1.5 w-1.5 rounded-full"
                  :class="sensors.running ? 'status-dot-green' : 'status-dot-amber'"
                />
                {{ sensors.running ? 'Live' : 'Paused' }}
              </span>
            </div>
            <p class="mt-1 max-w-2xl text-sm leading-6 text-content-muted">
              Current health and measurements from every configured sensor.
            </p>
          </div>

        </div>

        <button
          class="btn-secondary inline-flex shrink-0 items-center justify-center gap-2 self-start disabled:cursor-not-allowed disabled:opacity-50"
          type="button"
          aria-label="Refresh sensor readings"
          :disabled="isRefreshing"
          @click="refreshNow"
        >
          <Spinner v-if="isRefreshing" size="sm" color="current" />
          <RefreshCw v-else class="h-4 w-4" aria-hidden="true" />
          {{ isRefreshing ? 'Refreshing' : 'Refresh' }}
        </button>
      </div>

      <div
        class="grid grid-cols-2 border-t border-stroke-subtle dark:border-white/opacity-light lg:grid-cols-4"
      >
        <div
          v-for="(card, index) in summaryCards"
          :key="card.label"
          data-testid="sensor-summary"
          class="min-w-0 p-4 sm:p-5"
          :class="[
            index % 2 === 1 ? 'border-l border-stroke-subtle dark:border-white/opacity-light' : '',
            index >= 2
              ? 'border-t border-stroke-subtle dark:border-white/opacity-light lg:border-t-0'
              : '',
            index > 0
              ? 'lg:border-l lg:border-stroke-subtle lg:dark:border-white/opacity-light'
              : '',
          ]"
        >
          <div class="flex items-center gap-2 text-content-muted">
            <component :is="card.icon" class="h-4 w-4" aria-hidden="true" />
            <p class="text-xs font-medium uppercase tracking-wide">{{ card.label }}</p>
          </div>
          <p
            class="mt-2 truncate text-base font-semibold text-content-heading sm:text-lg"
            :data-testid="card.label === 'Health' ? 'sensor-health-summary' : undefined"
          >
            {{ card.value }}
          </p>
          <p class="mt-0.5 truncate text-xs text-content-muted">{{ card.detail }}</p>
        </div>
      </div>
    </section>

    <section
      v-if="!sensors"
      class="glass-card flex min-h-56 flex-col items-center justify-center rounded-[15px] p-8 text-center"
    >
      <Spinner size="lg" />
      <h2 class="mt-5 text-base font-semibold text-content-heading">Loading sensor telemetry</h2>
      <p class="mt-1 max-w-md text-sm text-content-muted">
        Waiting for the repeater to return its first sensor snapshot.
      </p>
    </section>

    <section v-else-if="readingRows.length" class="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <article
        v-for="(reading, idx) in readingRows"
        :key="`${reading.name || 'sensor'}-${idx}`"
        data-testid="sensor-card"
        class="glass-card min-w-0 overflow-hidden rounded-[15px]"
      >
        <header
          class="flex items-start justify-between gap-4 border-b border-stroke-subtle p-4 dark:border-white/opacity-light sm:p-5"
        >
          <div class="flex min-w-0 items-center gap-3.5">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
              :class="
                reading.ok
                  ? 'border-primary/opacity-medium bg-primary/opacity-light text-primary'
                  : 'border-accent-red/opacity-medium bg-accent-red/opacity-light text-accent-red'
              "
            >
              <component :is="sensorIcon(reading)" class="h-5 w-5" aria-hidden="true" />
            </div>
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-content-heading sm:text-lg">
                {{ reading.name || `Sensor ${idx + 1}` }}
              </h2>
              <p class="mt-0.5 truncate text-xs text-content-muted">
                {{ sensorTypeLabel(reading.type) }}
              </p>
            </div>
          </div>
          <span :class="reading.ok ? 'status-badge-green' : 'status-badge-red'">
            <span
              class="h-1.5 w-1.5 rounded-full"
              :class="reading.ok ? 'status-dot-green' : 'status-dot-red'"
            />
            {{ reading.ok ? 'Online' : 'Needs attention' }}
          </span>
        </header>

        <div class="p-4 sm:p-5">
          <div class="flex items-center gap-2 text-xs text-content-muted">
            <Clock3 class="h-3.5 w-3.5" aria-hidden="true" />
            <span>Last sample</span>
            <span class="font-medium text-content-secondary">{{
              formatTime(reading.timestamp)
            }}</span>
          </div>

          <div
            v-if="reading.error"
            class="mt-4 flex items-start gap-3 rounded-xl border border-accent-red/opacity-medium bg-accent-red/opacity-light p-3 text-sm text-accent-red"
          >
            <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p class="min-w-0 break-words">{{ reading.error }}</p>
          </div>

          <div
            v-if="metricRows(reading).length"
            class="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3"
          >
            <div
              v-for="metric in metricRows(reading)"
              :key="metric.key"
              data-testid="sensor-metric"
              class="min-w-0 rounded-xl border border-stroke-subtle bg-background-mute p-3 dark:border-white/opacity-light dark:bg-white/opacity-subtle"
            >
              <p class="truncate text-xs text-content-muted" :title="metric.label">
                {{ metric.label }}
              </p>
              <p
                class="mt-1.5 min-w-0 break-words font-semibold text-content-heading"
                :class="metric.prominent ? 'text-lg sm:text-xl' : 'text-sm sm:text-base'"
                :title="metric.value"
              >
                {{ metric.value }}
              </p>
            </div>
          </div>

          <div
            v-else-if="!reading.error"
            class="mt-4 rounded-xl border border-dashed border-stroke-subtle p-5 text-center text-sm text-content-muted dark:border-white/opacity-light"
          >
            This sensor has not reported any measurement fields yet.
          </div>
        </div>
      </article>
    </section>

    <section
      v-else
      class="glass-card flex min-h-56 flex-col items-center justify-center rounded-[15px] p-8 text-center"
    >
      <Radio class="h-9 w-9 text-content-muted" aria-hidden="true" />
      <h2 class="mt-4 text-base font-semibold text-content-heading">Waiting for sensor readings</h2>
      <p class="mt-1 max-w-md text-sm text-content-muted">
        {{
          sensors.loaded
            ? 'Sensors are loaded and will appear after the next polling cycle.'
            : 'No enabled sensor plug-ins are currently loaded.'
        }}
      </p>
    </section>
  </div>
</template>
