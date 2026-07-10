<template>
  <div class="ui-action-bar">
    <div v-if="$slots.summary" class="ui-action-summary">
      <slot name="summary" />
    </div>
    <div class="ui-action-controls"><slot /></div>
  </div>
</template>
