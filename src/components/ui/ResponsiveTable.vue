<template>
  <div class="ui-table-wrap" tabindex="0" role="region" :aria-label="label">
    <table class="ui-table">
      <caption v-if="caption">
        {{
          caption
        }}
      </caption>
      <slot />
    </table>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; caption?: string }>();
</script>
