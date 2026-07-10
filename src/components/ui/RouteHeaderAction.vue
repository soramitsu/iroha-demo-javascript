<template>
  <Teleport v-if="targetExists" to="#route-header-actions">
    <div class="ui-route-header-action"><slot /></div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from "vue";

const targetExists = ref(false);

onMounted(() => {
  targetExists.value = Boolean(document.querySelector("#route-header-actions"));
});
</script>
