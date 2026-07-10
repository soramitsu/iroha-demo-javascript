<template>
  <button
    class="ui-icon-button"
    :class="['ui-button-' + variant, 'ui-icon-button-' + size]"
    :type="type"
    :aria-label="label"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="emit('click', $event)"
  >
    <span v-if="loading" class="ui-button-spinner" aria-hidden="true"></span>
    <slot v-else />
  </button>
</template>

<script setup lang="ts">
import type { ButtonSize, ButtonVariant } from "@/types/ui";

withDefaults(
  defineProps<{
    label: string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
  }>(),
  {
    variant: "ghost",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
</script>
