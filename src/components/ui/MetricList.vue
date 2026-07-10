<template>
  <dl class="ui-metric-list" :class="{ 'ui-metric-list-compact': compact }">
    <div v-for="item in items" :key="item.label" class="ui-metric-item">
      <dt>{{ item.label }}</dt>
      <dd :class="{ mono: item.monospace }">{{ item.value }}</dd>
      <p v-if="item.detail">{{ item.detail }}</p>
    </div>
  </dl>
</template>

<script setup lang="ts">
export interface MetricItem {
  label: string;
  value: string | number;
  detail?: string;
  monospace?: boolean;
}

withDefaults(defineProps<{ items: MetricItem[]; compact?: boolean }>(), {
  compact: false,
});
</script>
