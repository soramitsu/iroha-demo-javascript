<template>
  <div class="ui-empty-state">
    <div v-if="$slots.icon" class="ui-empty-icon" aria-hidden="true">
      <slot name="icon" />
    </div>
    <h2 v-if="title">{{ title }}</h2>
    <p v-if="description">{{ description }}</p>
    <div v-if="$slots.actions" class="ui-empty-actions">
      <slot name="actions" />
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ title?: string; description?: string }>(), {
  title: "",
  description: "",
});
</script>
