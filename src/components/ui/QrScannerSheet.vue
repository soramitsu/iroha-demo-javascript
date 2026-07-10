<template>
  <AppDialog
    :open="open"
    :title="title"
    :description="description"
    :close-label="closeLabel"
    @close="$emit('close')"
  >
    <div class="ui-scanner-sheet"><slot /></div>
    <template #actions><slot name="actions" /></template>
  </AppDialog>
</template>

<script setup lang="ts">
import AppDialog from "./AppDialog.vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    closeLabel?: string;
  }>(),
  { description: "", closeLabel: "Close" },
);

defineEmits<{ close: [] }>();
</script>
