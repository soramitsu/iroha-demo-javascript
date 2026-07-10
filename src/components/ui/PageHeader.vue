<template>
  <header class="ui-page-header">
    <div class="ui-page-heading">
      <p v-if="eyebrow" class="ui-page-eyebrow">{{ eyebrow }}</p>
      <component :is="headingTag" :id="headingId" ref="heading" tabindex="-1">
        {{ title }}
      </component>
      <p v-if="subtitle" class="ui-page-subtitle">{{ subtitle }}</p>
    </div>
    <div v-if="$slots.actions" class="ui-page-actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = withDefaults(
  defineProps<{
    title: string;
    subtitle?: string;
    eyebrow?: string;
    headingId?: string;
    headingLevel?: 1 | 2;
  }>(),
  {
    subtitle: "",
    eyebrow: "",
    headingId: "page-title",
    headingLevel: 2,
  },
);

const headingTag = computed(() => `h${props.headingLevel}`);
const heading = ref<HTMLElement | null>(null);
defineExpose({ focus: () => heading.value?.focus() });
</script>
