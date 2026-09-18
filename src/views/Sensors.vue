<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useManagedPolling } from '@/composables/useManagedPolling';
import { useSystemStore } from '@/stores/system';
import {
  Gauge,
  Settings,
  Plus,
  Trash2,
  Edit3,
  X,
  Save,
  Loader2,
  AlertCircle,
} from '@lucide/vue';
import Spinner from '@/components/ui/Spinner.vue';

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

interface SensorsConfig {
  enabled: boolean;
  poll_interval_seconds: number;
  auto_install_packages: boolean;
  definitions: Array<{
    type: string;
    name: string;
    enabled: boolean;
    auto_install_packages?: boolean;
    settings?: Record<string, unknown>;
  }>;
}

const route = useRoute();
const router = useRouter();
const systemStore = useSystemStore();

// --- Tab state ---
const activeTab = ref<'sensors' | 'settings'>(
  (route.query.tab as 'sensors' | 'settings' | undefined) || 'sensors',
);

if (route.query.tab) {
  activeTab.value = route.query.tab as 'sensors' | 'settings';
}

function handleTabChange(tab: 'sensors' | 'settings') {
  activeTab.value = tab;
  router.replace({ query: { ...route.query, tab } });
}

// --- Sensors tab data ---
const sensors = computed<SensorsSummary | null>(() => {
  const stats = systemStore.stats as { sensors?: SensorsSummary } | null;
  return stats?.sensors ?? null;
});

const readingRows = computed(() => sensors.value?.readings ?? []);

const summaryCards = computed(() => {
  const s = sensors.value;
  if (!s) {
    return [
      { label: 'Enabled', value: 'n/a' },
      { label: 'Running', value: 'n/a' },
      { label: 'Configured', value: 'n/a' },
      { label: 'Poll Interval', value: 'n/a' },
    ];
  }
  return [
    { label: 'Enabled', value: s.enabled ? 'Yes' : 'No' },
    { label: 'Running', value: s.running ? 'Yes' : 'No' },
    { label: 'Configured / Loaded', value: `${s.configured ?? 0} / ${s.loaded ?? 0}` },
    {
      label: 'Poll Interval',
      value:
        typeof s.poll_interval_seconds === 'number'
          ? `${s.poll_interval_seconds.toFixed(1)}s`
          : 'n/a',
    },
  ];
});

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return 'n/a';
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

// --- Settings tab data ---
const sensorsConfig = computed<SensorsConfig | null>(() => systemStore.sensorsConfig);
const isSaving = computed(() => systemStore.isSavingSensors);
const isRestarting = computed(() => systemStore.isRestarting);
const saveError = ref<string | null>(null);
const restartError = ref<string | null>(null);

// Modal state
const showAddModal = ref(false);
const showEditModal = ref(false);
const showRemoveModal = ref(false);
const editingIndex = ref(-1);
const removingIndex = ref(-1);

// Form state
const formName = ref('');
const formType = ref('');
const formEnabled = ref(true);
const formAutoInstall = ref(false);
const formSettings = ref<Record<string, string>>({});

const availableTypes = [
  'hardware_stats',
  'bme280',
  'ens210',
  'ina219',
  'shtc3',
  'lafvin_ups_3s',
  'waveshare_ups_d',
  'waveshare_ups_e',
  'openhop_modem',
  'pymc_modem',
];

function openAddModal() {
  formName.value = '';
  formType.value = '';
  formEnabled.value = true;
  formAutoInstall.value = false;
  formSettings.value = {};
  showAddModal.value = true;
}

function openEditModal(index: number) {
  const def = sensorsConfig.value?.definitions[index];
  if (!def) return;
  editingIndex.value = index;
  formName.value = def.name;
  formType.value = def.type;
  formEnabled.value = def.enabled;
  formAutoInstall.value = def.auto_install_packages ?? false;
  formSettings.value = {};
  if (def.settings) {
    for (const [key, value] of Object.entries(def.settings)) {
      formSettings.value[key] = String(value);
    }
  }
  showEditModal.value = true;
}

function openRemoveModal(index: number) {
  removingIndex.value = index;
  showRemoveModal.value = true;
}

function closeModal() {
  showAddModal.value = false;
  showEditModal.value = false;
  showRemoveModal.value = false;
}

function handleAdd() {
  if (!formName.value || !formType.value) return;
  const config = sensorsConfig.value;
  if (!config) return;

  config.definitions.push({
    type: formType.value,
    name: formName.value,
    enabled: formEnabled.value,
    auto_install_packages: formAutoInstall.value ? formAutoInstall.value : undefined,
    settings: Object.keys(formSettings.value).length > 0 ? formSettings.value : {},
  });
  closeModal();
}

function handleEdit() {
  if (!formName.value || !formType.value) return;
  const config = sensorsConfig.value;
  if (!config || editingIndex.value < 0) return;

  const def = config.definitions[editingIndex.value];
  if (!def) return;

  def.name = formName.value;
  def.type = formType.value;
  def.enabled = formEnabled.value;
  def.auto_install_packages = formAutoInstall.value ? formAutoInstall.value : undefined;
  def.settings = Object.keys(formSettings.value).length > 0 ? formSettings.value : {};

  closeModal();
}

function handleRemove() {
  const config = sensorsConfig.value;
  if (!config || removingIndex.value < 0) return;

  config.definitions.splice(removingIndex.value, 1);
  closeModal();
}

async function handleSaveAndRestart() {
  saveError.value = null;
  restartError.value = null;

  const saved = await systemStore.saveSensorsConfig();
  if (!saved) {
    saveError.value = 'Failed to save sensor configuration.';
    return;
  }

  const restarted = await systemStore.restartService();
  if (!restarted) {
    restartError.value = 'Configuration saved, but service restart failed. Restart manually.';
  }
}

// Fetch sensor config on mount
onMounted(async () => {
  await systemStore.fetchSensorsConfig();
});

// Poll sensor readings every 10s
useManagedPolling(
  async () => {
    await systemStore.fetchStats();
  },
  { intervalMs: 10_000, immediate: true },
);
</script>

<template>
  <div class="space-y-4">
    <div class="glass-card rounded-[15px] p-4 sm:p-6">
      <div class="flex items-start justify-between gap-4">
        <div>
          <h1 class="text-ui-title sm:text-ui-title-lg font-semibold text-content-heading">Sensors</h1>
          <p class="mt-1 text-ui-label sm:text-ui-body text-content-muted">
            Monitor live sensor readings and manage sensor configuration.
          </p>
        </div>
      </div>

      <!-- Tabs -->
      <div class="mt-4 border-b border-stroke-subtle dark:border-white/opacity-light">
        <div class="flex gap-0">
          <button
            class="px-4 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'sensors'
              ? 'border-b-2 border-primary text-primary'
              : 'text-content-muted hover:text-content-heading'"
            @click="handleTabChange('sensors')"
          >
            <Gauge class="mr-1.5 inline-block h-4 w-4" />
            Sensors
          </button>
          <button
            class="px-4 py-2 text-sm font-medium transition-colors"
            :class="activeTab === 'settings'
              ? 'border-b-2 border-primary text-primary'
              : 'text-content-muted hover:text-content-heading'"
            @click="handleTabChange('settings')"
          >
            <Settings class="mr-1.5 inline-block h-4 w-4" />
            Settings
          </button>
        </div>
      </div>

      <div class="mt-4">
        <!-- ==================== SENSORS TAB ==================== -->
        <div v-if="activeTab === 'sensors'">
          <!-- Summary cards -->
          <div class="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="card in summaryCards"
              :key="card.label"
              class="rounded-[12px] border border-stroke-subtle dark:border-white/opacity-light p-3"
            >
              <p class="text-xs uppercase tracking-wide text-content-muted">{{ card.label }}</p>
              <p class="mt-2 text-lg font-semibold text-content-heading">{{ card.value }}</p>
            </div>
          </div>

          <!-- Loading state -->
          <div v-if="!sensors" class="glass-card rounded-[15px] p-5 text-content-muted">
            Sensor data is not available yet. Ensure the repeater has started and stats are loading.
          </div>

          <!-- Reading cards -->
          <div v-if="sensors">
            <div
              v-for="(reading, idx) in readingRows"
              :key="`${reading.name || 'sensor'}-${idx}`"
              class="glass-card rounded-[15px] p-4 sm:p-5"
            >
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-content-heading">
                    {{ reading.name || `Sensor ${idx + 1}` }}
                  </h2>
                  <p class="text-sm text-content-muted">Type: {{ reading.type || 'unknown' }}</p>
                </div>
                <span
                  class="rounded-full px-3 py-1 text-xs font-semibold"
                  :class="reading.ok
                    ? 'bg-accent-green/opacity-light text-accent-green dark:bg-accent-green/opacity-medium dark:text-accent-green'
                    : 'bg-accent-red/opacity-light text-accent-red dark:bg-accent-red/opacity-medium dark:text-accent-red'"
                >
                  {{ reading.ok ? 'OK' : 'Error' }}
                </span>
              </div>

              <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div class="text-sm">
                  <span class="text-content-muted">Timestamp:</span>
                  <span class="ml-2 text-content-heading">{{ formatTime(reading.timestamp) }}</span>
                </div>
                <div v-if="reading.error" class="text-sm">
                  <span class="text-content-muted">Error:</span>
                  <span class="ml-2 text-accent-red">{{ reading.error }}</span>
                </div>
              </div>

              <div class="mt-4 overflow-x-auto rounded-[12px] border border-stroke-subtle dark:border-white/opacity-light">
                <table class="min-w-full text-sm">
                  <thead class="bg-black/opacity-light dark:bg-white/opacity-subtle">
                    <tr>
                      <th class="px-3 py-2 text-left text-content-muted">Field</th>
                      <th class="px-3 py-2 text-left text-content-muted">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(value, key) in (reading.data || {})"
                      :key="String(key)"
                      class="border-t border-stroke-subtle dark:border-white/opacity-light"
                    >
                      <td class="px-3 py-2 font-medium text-content-heading">{{ key }}</td>
                      <td class="px-3 py-2 text-content-muted break-all">{{ formatValue(value) }}</td>
                    </tr>
                    <tr v-if="!reading.data || Object.keys(reading.data).length === 0">
                      <td class="px-3 py-3 text-content-muted" colspan="2">No fields in payload</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div v-if="readingRows.length === 0" class="glass-card rounded-[15px] p-5 text-content-muted">
              Sensors are configured but no readings are available yet.
            </div>
          </div>

          <!-- Refresh -->
          <div class="mt-4 flex justify-end">
            <button
              class="rounded-[10px] border border-stroke-subtle dark:border-white/opacity-light px-3 py-2 text-sm hover:bg-black/opacity-light dark:hover:bg-white/opacity-light"
              @click="refreshNow"
            >
              Refresh
            </button>
          </div>
        </div>

        <!-- ==================== SETTINGS TAB ==================== -->
        <div v-if="activeTab === 'settings'">
          <div v-if="!sensorsConfig" class="flex items-center justify-center py-10">
            <Spinner size="md" />
            <span class="ml-3 text-content-muted">Loading sensor configuration...</span>
          </div>

          <div v-else class="space-y-4">
            <!-- Global settings -->
            <div class="glass-card rounded-[15px] p-4 sm:p-5">
              <h2 class="text-lg font-semibold text-content-heading mb-4">Global Settings</h2>

              <div class="space-y-4">
                <!-- Enable/Disable -->
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-content-heading">Enable Sensors</p>
                    <p class="text-sm text-content-muted">Master switch for the sensor subsystem</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      :checked="sensorsConfig.enabled"
                      @change="sensorsConfig.enabled = ($event.target as HTMLInputElement).checked"
                    />
                    <div class="w-11 h-6 bg-stroke-subtle rounded-full peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </label>
                </div>

                <!-- Poll interval -->
                <div>
                  <label class="block text-sm font-medium text-content-heading mb-1">
                    Poll Interval (seconds)
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="0.5"
                    class="w-full rounded-[10px] border border-stroke-subtle dark:border-white/opacity-light bg-transparent px-3 py-2 text-content-heading focus:border-primary focus:outline-none"
                    :value="sensorsConfig.poll_interval_seconds"
                    @input="sensorsConfig.poll_interval_seconds = parseFloat(($event.target as HTMLInputElement).value) || 1"
                  />
                </div>

                <!-- Auto install packages -->
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-content-heading">Auto-install Packages</p>
                    <p class="text-sm text-content-muted">Automatically install missing Python packages for sensors</p>
                  </div>
                  <label class="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      class="sr-only peer"
                      :checked="sensorsConfig.auto_install_packages"
                      @change="sensorsConfig.auto_install_packages = ($event.target as HTMLInputElement).checked"
                    />
                    <div class="w-11 h-6 bg-stroke-subtle rounded-full peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
                  </label>
                </div>
              </div>
            </div>

            <!-- Sensor definitions list -->
            <div class="glass-card rounded-[15px] p-4 sm:p-5">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-content-heading">Sensor Definitions</h2>
                <button
                  class="btn-primary flex items-center gap-1.5"
                  @click="openAddModal"
                >
                  <Plus class="h-4 w-4" />
                  Add Sensor
                </button>
              </div>

              <div v-if="sensorsConfig.definitions.length === 0" class="text-content-muted py-4 text-center">
                No sensors configured. Click "Add Sensor" to get started.
              </div>

              <div v-else class="space-y-3">
                <div
                  v-for="(def, idx) in sensorsConfig.definitions"
                  :key="idx"
                  class="rounded-[12px] border border-stroke-subtle dark:border-white/opacity-light p-3"
                >
                  <div class="flex flex-wrap items-center justify-between gap-3">
                    <div class="flex items-center gap-3">
                      <span
                        class="rounded-full px-2.5 py-1 text-xs font-semibold"
                        :class="def.enabled
                          ? 'bg-accent-green/opacity-light text-accent-green dark:bg-accent-green/opacity-medium dark:text-accent-green'
                          : 'bg-stroke/opacity-light text-content-muted'"
                      >
                        {{ def.enabled ? 'Active' : 'Disabled' }}
                      </span>
                      <div>
                        <p class="font-medium text-content-heading">{{ def.name }}</p>
                        <p class="text-xs text-content-muted">{{ def.type }}</p>
                      </div>
                    </div>
                    <div class="flex items-center gap-2">
                      <button
                        class="btn-secondary p-2 rounded-[8px] hover:bg-black/opacity-light dark:hover:bg-white/opacity-light"
                        title="Edit"
                        @click="openEditModal(idx)"
                      >
                        <Edit3 class="h-4 w-4 text-content-muted" />
                      </button>
                      <button
                        class="btn-secondary p-2 rounded-[8px] hover:bg-accent-red/opacity-light dark:hover:bg-accent-red/opacity-medium"
                        title="Remove"
                        @click="openRemoveModal(idx)"
                      >
                        <Trash2 class="h-4 w-4 text-accent-red" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Error messages -->
            <div v-if="saveError" class="glass-card rounded-[15px] p-4 border border-accent-red/opacity-medium flex items-start gap-3">
              <AlertCircle class="h-5 w-5 text-accent-red flex-shrink-0 mt-0.5" />
              <div>
                <p class="font-medium text-accent-red">Save Failed</p>
                <p class="text-sm text-content-muted">{{ saveError }}</p>
              </div>
            </div>

            <div v-if="restartError" class="glass-card rounded-[15px] p-4 border border-accent-amber/opacity-medium flex items-start gap-3">
              <AlertCircle class="h-5 w-5 text-accent-amber flex-shrink-0 mt-0.5" />
              <div>
                <p class="font-medium text-accent-amber">Restart Failed</p>
                <p class="text-sm text-content-muted">{{ restartError }}</p>
              </div>
            </div>

            <!-- Save & Restart -->
            <div class="flex justify-end gap-3">
              <button
                class="btn-secondary"
                :disabled="isSaving || isRestarting"
                @click="handleSaveAndRestart"
              >
                <template v-if="isSaving || isRestarting">
                  <Loader2 class="mr-2 h-4 w-4 animate-spin" />
                  {{ isRestarting ? 'Restarting...' : 'Saving...' }}
                </template>
                <template v-else>
                  <Save class="mr-2 h-4 w-4" />
                  Save & Restart
                </template>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ==================== MODALS ==================== -->

    <!-- Add Sensor Modal -->
    <Teleport to="body">
      <div v-if="showAddModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal-card max-w-md" @click.stop>
          <div class="modal-header flex items-center justify-between p-4 border-b border-stroke-subtle dark:border-white/opacity-light">
            <h3 class="text-lg font-semibold text-content-heading">Add Sensor</h3>
            <button @click="closeModal" class="text-content-muted hover:text-content-heading">
              <X class="h-5 w-5" />
            </button>
          </div>

          <form class="modal-form p-4 space-y-4" @submit.prevent="handleAdd">
            <div>
              <label class="modal-field-label">Name</label>
              <input
                class="modal-input"
                v-model="formName"
                placeholder="e.g. Living Room Temp"
                required
              />
            </div>

            <div>
              <label class="modal-field-label">Type</label>
              <select class="modal-input" v-model="formType" required>
                <option value="" disabled>Select a sensor type</option>
                <option v-for="t in availableTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-content-heading">Enabled</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  :checked="formEnabled"
                  @change="formEnabled = ($event.target as HTMLInputElement).checked"
                />
                <div class="w-11 h-6 bg-stroke-subtle rounded-full peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-content-heading">Auto-install Packages</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  :checked="formAutoInstall"
                  @change="formAutoInstall = ($event.target as HTMLInputElement).checked"
                />
                <div class="w-11 h-6 bg-stroke-subtle rounded-full peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>

            <!-- Dynamic settings fields -->
            <div v-if="formType">
              <p class="text-sm font-medium text-content-heading mb-2">Settings</p>
              <div class="space-y-2">
                <div
                  v-for="(key, index) in Object.keys(formSettings)"
                  :key="index"
                  class="flex gap-2"
                >
                  <input
                    class="modal-input flex-1"
                    :value="key"
                    placeholder="Key"
                    @input="formSettings[($event.target as HTMLInputElement).value] = formSettings[key]; delete formSettings[key]"
                  />
                  <input
                    class="modal-input flex-1"
                    :value="formSettings[key]"
                    placeholder="Value"
                    @input="formSettings[key] = ($event.target as HTMLInputElement).value"
                  />
                  <button
                    type="button"
                    class="btn-secondary p-2"
                    @click="delete formSettings[key]"
                  >
                    <X class="h-4 w-4" />
                  </button>
                </div>
                <button
                  type="button"
                  class="text-sm text-primary hover:underline"
                  @click="formSettings['new_key'] = ''"
                >
                  + Add Setting
                </button>
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="modal-btn-cancel" @click="closeModal">Cancel</button>
              <button type="submit" class="modal-btn-primary" :disabled="!formName || !formType">
                Add Sensor
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Edit Sensor Modal -->
    <Teleport to="body">
      <div v-if="showEditModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal-card max-w-md" @click.stop>
          <div class="modal-header flex items-center justify-between p-4 border-b border-stroke-subtle dark:border-white/opacity-light">
            <h3 class="text-lg font-semibold text-content-heading">Edit Sensor</h3>
            <button @click="closeModal" class="text-content-muted hover:text-content-heading">
              <X class="h-5 w-5" />
            </button>
          </div>

          <form class="modal-form p-4 space-y-4" @submit.prevent="handleEdit">
            <div>
              <label class="modal-field-label">Name</label>
              <input class="modal-input" v-model="formName" required />
            </div>

            <div>
              <label class="modal-field-label">Type</label>
              <select class="modal-input" v-model="formType" required>
                <option v-for="t in availableTypes" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>

            <div class="flex items-center justify-between">
              <span class="text-content-heading">Enabled</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  class="sr-only peer"
                  :checked="formEnabled"
                  @change="formEnabled = ($event.target as HTMLInputElement).checked"
                />
                <div class="w-11 h-6 bg-stroke-subtle rounded-full peer-checked:bg-primary peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
              </label>
            </div>

            <div class="modal-actions">
              <button type="button" class="modal-btn-cancel" @click="closeModal">Cancel</button>
              <button type="submit" class="modal-btn-primary" :disabled="!formName || !formType">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    </Teleport>

    <!-- Confirm Remove Modal -->
    <Teleport to="body">
      <div v-if="showRemoveModal" class="modal-backdrop" @click.self="closeModal">
        <div class="modal-card max-w-sm" @click.stop>
          <div class="modal-header flex items-center justify-between p-4 border-b border-stroke-subtle dark:border-white/opacity-light">
            <h3 class="text-lg font-semibold text-content-heading">Remove Sensor</h3>
            <button @click="closeModal" class="text-content-muted hover:text-content-heading">
              <X class="h-5 w-5" />
            </button>
          </div>

          <div class="p-4">
            <p class="text-content-muted">
              Are you sure you want to remove
              <span class="font-medium text-content-heading">
                {{ sensorsConfig?.definitions[removingIndex]?.name }}
              </span>
              ? This change will take effect after restart.
            </p>
          </div>

          <div class="modal-actions">
            <button type="button" class="modal-btn-cancel" @click="closeModal">Cancel</button>
            <button type="button" class="modal-btn-danger" @click="handleRemove">
              Remove
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Restarting overlay -->
    <Teleport to="body">
      <div v-if="isRestarting" class="modal-backdrop-heavy" @click.self.stop>
        <div class="modal-card-glass max-w-sm text-center p-8" @click.stop>
          <Spinner size="lg" />
          <h3 class="mt-4 text-lg font-semibold text-content-heading">Restarting Service</h3>
          <p class="mt-2 text-content-muted">
            The service is restarting. This may take up to a minute.
          </p>
        </div>
      </div>
    </Teleport>
  </div>
</template>
