<template>
  <span class="ui-status-badge" :class="`ui-tone-${tone}`">
    <span v-if="dot" class="ui-status-dot" aria-hidden="true"></span>
    <slot />
  </span>
</template>

<script setup lang="ts">
import type { UiTone } from "@/types/ui";

withDefaults(defineProps<{ tone?: UiTone; dot?: boolean }>(), {
  tone: "neutral",
  dot: false,
});
</script>
