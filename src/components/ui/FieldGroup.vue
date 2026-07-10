<template>
  <div class="ui-field" :class="{ 'ui-field-error': Boolean(error) }">
    <label v-if="label" class="ui-field-label" :for="forId">{{ label }}</label>
    <p v-if="description" :id="descriptionId" class="ui-field-description">
      {{ description }}
    </p>
    <slot :describedby="describedby" />
    <p v-if="error" :id="errorId" class="ui-field-message" role="alert">
      {{ error }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{
    forId?: string;
    label?: string;
    description?: string;
    error?: string;
  }>(),
  { forId: "", label: "", description: "", error: "" },
);

const descriptionId = computed(() =>
  props.forId && props.description ? `${props.forId}-description` : undefined,
);
const errorId = computed(() =>
  props.forId && props.error ? `${props.forId}-error` : undefined,
);
const describedby = computed(
  () =>
    [descriptionId.value, errorId.value].filter(Boolean).join(" ") || undefined,
);
</script>
