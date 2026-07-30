<script setup lang="ts">
import { computed } from 'vue';
import CoffeeIcon from '@/components/icons/coffee.vue';
import DiscordIcon from '@/components/icons/discord.vue';
import GitHubIcon from '@/components/icons/github.vue';
import OpenHopIcon from '@/components/icons/openhop.vue';

interface Props {
  size?: 'sm' | 'md';
}

const props = withDefaults(defineProps<Props>(), {
  size: 'sm',
});

const buttonSizeClass = computed(() =>
  props.size === 'md' ? 'w-9 h-9 sm:w-10 sm:h-10' : 'w-9 h-9',
);
const iconSizeClass = computed(() => (props.size === 'md' ? 'w-5 h-5 sm:w-6 sm:h-6' : 'w-5 h-5'));
const brandIconSizeClass = computed(() =>
  props.size === 'md' ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-5 h-5',
);
const buttonClass =
  'inline-flex items-center justify-center rounded-xl bg-content-primary dark:bg-white/opacity-subtle border border-stroke-subtle dark:border-stroke/opacity-medium transition-all duration-300 hover:scale-110 group backdrop-blur-sm';
</script>

<template>
  <div data-testid="community-links" class="flex items-center justify-center gap-3">
    <a
      href="https://discord.gg/3s8MMaSTzq"
      target="_blank"
      rel="noopener noreferrer"
      :class="[
        buttonClass,
        buttonSizeClass,
        'hover:bg-indigo-50 dark:hover:bg-indigo-500/20 hover:border-indigo-500/50 dark:hover:border-indigo-500/50',
      ]"
      title="Discord"
    >
      <DiscordIcon
        :class="[iconSizeClass, 'text-white group-hover:text-indigo-500 transition-colors']"
      />
    </a>
    <a
      href="https://openhop.dev"
      target="_blank"
      rel="noopener noreferrer"
      :class="[
        buttonClass,
        buttonSizeClass,
        'hover:bg-primary/opacity-medium dark:hover:bg-primary/opacity-medium hover:border-primary/opacity-heavy dark:hover:border-primary/opacity-heavy',
      ]"
      title="openHop Website"
    >
      <OpenHopIcon :class="[brandIconSizeClass, 'text-white transition-colors']" />
    </a>
    <a
      href="https://github.com/openhop-dev/openhop_repeater"
      target="_blank"
      rel="noopener noreferrer"
      :class="[
        buttonClass,
        buttonSizeClass,
        'hover:bg-primary/opacity-medium dark:hover:bg-primary/opacity-medium hover:border-primary/opacity-heavy dark:hover:border-primary/opacity-heavy',
      ]"
      title="GitHub"
    >
      <GitHubIcon
        :class="[iconSizeClass, 'text-white group-hover:text-primary transition-colors']"
      />
    </a>
    <a
      href="https://buymeacoffee.com/rightup"
      target="_blank"
      rel="noopener noreferrer"
      :class="[
        buttonClass,
        buttonSizeClass,
        'hover:bg-secondary/opacity-light hover:border-secondary/opacity-heavy dark:hover:border-secondary/opacity-heavy',
      ]"
      title="Buy Me a Coffee"
    >
      <CoffeeIcon
        :class="[iconSizeClass, 'text-white group-hover:text-secondary transition-colors']"
      />
    </a>
  </div>
</template>
