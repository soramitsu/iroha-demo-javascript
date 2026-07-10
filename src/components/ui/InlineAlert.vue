<template>
  <div
    class="ui-alert"
    :class="`ui-tone-${tone}`"
    :role="tone === 'danger' ? 'alert' : 'status'"
  >
    <div v-if="$slots.icon" class="ui-alert-icon" aria-hidden="true">
      <slot name="icon" />
    </div>
    <div class="ui-alert-copy">
      <p v-if="title" class="ui-alert-title">{{ title }}</p>
      <div class="ui-alert-body"><slot /></div>
    </div>
    <div v-if="$slots.action" class="ui-alert-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { UiTone } from "@/types/ui";

withDefaults(defineProps<{ tone?: UiTone; title?: string }>(), {
  tone: "neutral",
  title: "",
});
</script>
