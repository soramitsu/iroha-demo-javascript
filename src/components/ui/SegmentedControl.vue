<template>
  <div class="ui-segmented" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="ui-segmented-option"
      :class="{ active: option.value === modelValue }"
      :aria-pressed="option.value === modelValue"
      :disabled="option.disabled"
      @click="$emit('update:modelValue', option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts">
export interface SegmentedOption {
  value: string;
  label: string;
  disabled?: boolean;
}

defineProps<{
  modelValue: string;
  label: string;
  options: SegmentedOption[];
}>();

defineEmits<{ "update:modelValue": [value: string] }>();
</script>
