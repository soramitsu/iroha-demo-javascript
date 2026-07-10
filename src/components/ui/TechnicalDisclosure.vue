<template>
  <details class="ui-disclosure" :open="open">
    <summary>
      <span>{{ summary }}</span>
      <span class="ui-disclosure-caret" aria-hidden="true"></span>
    </summary>
    <div class="ui-disclosure-body"><slot /></div>
  </details>
</template>

<script setup lang="ts">
withDefaults(defineProps<{ summary: string; open?: boolean }>(), {
  open: false,
});
</script>
