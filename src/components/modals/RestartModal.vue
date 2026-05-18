<script setup lang="ts">
import { ref, watch } from 'vue';
import Spinner from '@/components/ui/Spinner.vue';
import apiClient from '@/utils/api';
import { waitForServiceRecovery } from '@/utils/restartRecovery';

interface Props {
  modelValue: boolean;
  message: string;
  title?: string;
}

const props = withDefaults(defineProps<Props>(), {
  title: 'Service Restart Required',
});

const emit = defineEmits<{
  'update:modelValue': [value: boolean];
}>();

const isRestarting = ref(false);
const hasFailed = ref(false);

function close() {
  if (isRestarting.value && !hasFailed.value) return;
  isRestarting.value = false;
  hasFailed.value = false;
  emit('update:modelValue', false);
}

async function handleRestart() {
  isRestarting.value = true;
  hasFailed.value = false;
  try {
    await apiClient.post('/restart_service', {});
  } catch { /* network drop on restart is expected */ }

  const recovered = await waitForServiceRecovery({
    endpoint: '/api/needs_setup',
    initialDelayMs: 10000,
    intervalMs: 1000,
    timeoutMs: 60000,
    stableResponsesRequired: 5,
  });

  if (recovered) {
    window.location.reload();
  } else {
    isRestarting.value = false;
    hasFailed.value = true;
  }
}

watch(() => props.modelValue, (val) => {
  if (!val) {
    isRestarting.value = false;
    hasFailed.value = false;
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-200"
      leave-to-class="opacity-0"
    >
      <div
        v-if="modelValue"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        @click.self="close"
      >
        <div class="modal-card max-w-md shadow-xl">

          <!-- Restarting state: spinner -->
          <div v-if="isRestarting" class="flex flex-col items-center gap-5 py-2">
            <Spinner size="lg" />
            <div class="text-center">
              <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                Restarting&hellip;
              </h3>
              <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                Please wait while the service restarts. This may take up to a minute.
              </p>
            </div>
          </div>

          <!-- Failed state: error + dismiss -->
          <template v-else-if="hasFailed">
            <div class="flex items-start gap-3 mb-4">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                  Service Did Not Restart
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  The service did not respond after 60 seconds. Please log into the device and check the system logs.
                </p>
              </div>
            </div>
            <div class="modal-actions">
              <button @click="close" class="modal-btn-cancel">Dismiss</button>
            </div>
          </template>

          <!-- Idle state: warning + buttons -->
          <template v-else>
            <div class="flex items-start gap-3 mb-4">
              <div class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <svg class="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 class="text-base font-semibold text-content-primary dark:text-content-primary">
                  {{ title }}
                </h3>
                <p class="mt-1 text-sm text-content-secondary dark:text-content-muted">
                  {{ message }}
                </p>
              </div>
            </div>
            <div class="modal-actions">
              <button @click="close" class="modal-btn-cancel">Cancel</button>
              <button @click="handleRestart" class="modal-btn-primary">Restart</button>
            </div>
          </template>

        </div>
      </div>
    </Transition>
  </Teleport>
</template>
