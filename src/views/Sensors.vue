<script setup lang="ts">
import { computed, watch } from 'vue';
import { useManagedPolling } from '@/composables/useManagedPolling';
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

// Group readings by sensor type
const readingsByType = computed(() => {
  const groups: Record<string, SensorReading[]> = {};
  for (const reading of readingRows.value) {
    const type = reading.type || 'unknown';
    if (!groups[type]) groups[type] = [];
    groups[type].push(reading);
  }
  return groups;
});

// Sort keys by type name
const sortedTypeKeys = computed(() => {
  return Object.keys(readingsByType.value).sort();
});

const summaryCards = computed(() => {
  const s = sensors.value;
  if (!s) {
    return [
      { label: 'Enabled', value: 'n/a', icon: 'power', color: 'gray' },
      { label: 'Running', value: 'n/a', icon: 'activity', color: 'gray' },
      { label: 'Configured', value: 'n/a', icon: 'settings', color: 'gray' },
      { label: 'Poll Interval', value: 'n/a', icon: 'clock', color: 'gray' },
    ];
  }

  return [
    { label: 'Enabled', value: s.enabled ? 'Yes' : 'No', icon: 'power', color: s.enabled ? 'green' : 'red' },
    { label: 'Running', value: s.running ? 'Yes' : 'No', icon: 'activity', color: s.running ? 'green' : 'red' },
    { label: 'Configured / Loaded', value: `${s.configured ?? 0} / ${s.loaded ?? 0}`, icon: 'settings', color: 'blue' },
    { label: 'Poll Interval', value: typeof s.poll_interval_seconds === 'number' ? `${s.poll_interval_seconds.toFixed(1)}s` : 'n/a', icon: 'clock', color: 'purple' },
  ];
});

// Semantic formatting for common sensor metrics
const formatMetric = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return 'n/a';

  const num = typeof value === 'number' ? value : NaN;

  // Temperature
  if (key.match(/temperature|temp/) && Number.isFinite(num)) {
    return `${num.toFixed(1)}°C`;
  }

  // Humidity
  if (key.match(/humidity|rh|relative_humidity/) && Number.isFinite(num)) {
    return `${num.toFixed(1)}%`;
  }

  // Pressure
  if (key.match(/pressure|baro|barometric/) && Number.isFinite(num)) {
    return `${num.toFixed(1)} hPa`;
  }

  // Voltage
  if (key.match(/voltage|volt|vcc|vbat|cell/) && Number.isFinite(num)) {
    if (num >= 100) return `${num.toFixed(0)}V`;
    return `${num.toFixed(2)}V`;
  }

  // Current
  if (key.match(/current|amp|ia|load/) && Number.isFinite(num)) {
    if (Math.abs(num) >= 1) return `${num.toFixed(2)}A`;
    return `${(num * 1000).toFixed(1)}mA`;
  }

  // Power
  if (key.match(/power|watt/) && Number.isFinite(num)) {
    if (num >= 1) return `${num.toFixed(2)}W`;
    return `${(num * 1000).toFixed(1)}mW`;
  }

  // Battery level
  if (key.match(/battery|soc|charge/) && Number.isFinite(num)) {
    return `${num.toFixed(0)}%`;
  }

  // Altitude
  if (key.match(/altitude|height/) && Number.isFinite(num)) {
    return `${num.toFixed(0)}m`;
  }

  // Date/time
  if (key.match(/time|date/) && typeof value === 'string') {
    try {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString();
    } catch { /* ignore */ }
    return String(value);
  }

  // Default
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'n/a';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const formatTime = (iso: string | null | undefined): string => {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

const refreshNow = async () => {
  await systemStore.fetchStats();
};

useManagedPolling(
  async () => {
    await systemStore.fetchStats();
  },
  { intervalMs: 10_000, immediate: true },
);

// Watch for data changes to refresh polling interval
watch(
  () => sensors.value?.poll_interval_seconds,
  (interval) => {
    if (interval && interval > 0 && interval < 60) {
      // Keep polling at least as fast as sensor interval
    }
  },
);
</script>

<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="glass-card rounded-[15px] p-4 sm:p-6">
      <div class="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 class="text-ui-title sm:text-ui-title-lg font-semibold text-content-heading">Sensors</h1>
          <p class="mt-1 text-ui-label sm:text-ui-body text-content-muted">
            Live sensor data and system overview.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            class="rounded-[10px] border border-stroke-subtle dark:border-white/opacity-light px-3 py-2 text-sm hover:bg-black/opacity-light dark:hover:bg-white/opacity-light"
            @click="refreshNow"
          >
            Refresh
          </button>
          <router-link
            to="/configuration?tab=sensormanager"
            class="rounded-[10px] bg-primary/opacity-light text-primary px-3 py-2 text-sm font-medium hover:bg-primary/opacity-medium transition-colors"
          >
            Manage Sensors
          </router-link>
        </div>
      </div>

      <!-- Summary cards -->
      <div class="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div
          v-for="card in summaryCards"
          :key="card.label"
          class="rounded-[12px] border border-stroke-subtle dark:border-white/opacity-light p-3"
        >
          <p class="text-xs uppercase tracking-wide text-content-muted">{{ card.label }}</p>
          <p class="mt-2 text-lg font-semibold text-content-heading">{{ card.value }}</p>
        </div>
      </div>
    </div>

    <!-- No data state -->
    <div v-if="!sensors" class="glass-card rounded-[15px] p-5 text-content-muted">
      Sensor data is not available yet. Ensure the repeater has started and stats are loading.
    </div>

    <!-- Empty state -->
    <div
      v-else-if="readingRows.length === 0"
      class="glass-card rounded-[15px] p-5 text-content-muted text-center"
    >
      <p class="text-lg font-medium mb-2">No sensor readings available</p>
      <p class="text-sm">Sensors are configured but no readings have been collected yet.</p>
    </div>

    <!-- Readings grouped by type -->
    <div v-else class="space-y-4">
      <div
        v-for="typeKey in sortedTypeKeys"
        :key="typeKey"
        class="glass-card rounded-[15px] p-4 sm:p-5"
      >
        <!-- Type header -->
        <div class="flex items-center gap-2 mb-3 pb-2 border-b border-stroke-subtle dark:border-stroke/opacity-light">
          <span class="text-sm font-semibold text-content-primary">{{ typeKey }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full bg-primary/opacity-light text-primary">
            {{ readingsByType[typeKey].length }} sensor{{ readingsByType[typeKey].length > 1 ? 's' : '' }}
          </span>
        </div>

        <!-- Sensors in this type group -->
        <div class="space-y-3">
          <div
            v-for="reading in readingsByType[typeKey]"
            :key="reading.name || `${typeKey}-${reading.timestamp}`"
            class="rounded-lg border border-stroke-subtle dark:border-stroke/opacity-light p-3"
          >
            <!-- Sensor header -->
            <div class="flex flex-wrap items-center justify-between gap-2 mb-2">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-content-primary text-sm">
                  {{ reading.name || 'Unknown Sensor' }}
                </h3>
                <span
                  class="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  :class="reading.ok
                    ? 'bg-accent-green/opacity-light text-accent-green dark:bg-accent-green/opacity-medium dark:text-accent-green'
                    : 'bg-accent-red/opacity-light text-accent-red dark:bg-accent-red/opacity-medium dark:text-accent-red'"
                >
                  {{ reading.ok ? 'OK' : 'Error' }}
                </span>
              </div>
              <span class="text-xs text-content-muted">{{ formatTime(reading.timestamp) }}</span>
            </div>

            <!-- Error message -->
            <div v-if="reading.error" class="text-xs text-accent-red mb-2">
              {{ reading.error }}
            </div>

            <!-- Metrics grid -->
            <div v-if="reading.data && Object.keys(reading.data).length > 0" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div
                v-for="(value, key) in reading.data"
                :key="key"
                class="rounded-md bg-black/opacity-light dark:bg-white/opacity-subtle p-2"
              >
                <p class="text-[10px] uppercase tracking-wide text-content-muted truncate">{{ key }}</p>
                <p class="text-sm font-mono text-content-heading mt-0.5">{{ formatMetric(key, value) }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
