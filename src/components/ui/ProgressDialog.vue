<template>
  <AppDialog
    :open="open"
    :title="title"
    :description="description"
    :close-label="closeLabel"
    :show-close="cancelable"
    :close-on-backdrop="false"
    :busy="!cancelable"
    @close="$emit('cancel')"
  >
    <div class="ui-progress" role="status" aria-live="polite">
      <span class="ui-progress-spinner" aria-hidden="true"></span>
      <p v-if="detail">{{ detail }}</p>
      <div v-if="steps.length" class="ui-progress-steps">
        <div
          v-for="(step, index) in steps"
          :key="step"
          :class="{
            active: index === currentStep,
            complete: index < currentStep,
          }"
          :aria-current="index === currentStep ? 'step' : undefined"
        >
          <span aria-hidden="true">{{ index + 1 }}</span>
          <p>{{ step }}</p>
        </div>
      </div>
    </div>
    <template v-if="cancelable" #actions>
      <AppButton variant="secondary" @click="$emit('cancel')">
        {{ cancelLabel }}
      </AppButton>
    </template>
  </AppDialog>
</template>

<script setup lang="ts">
import AppButton from "./AppButton.vue";
import AppDialog from "./AppDialog.vue";

withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    detail?: string;
    steps?: string[];
    currentStep?: number;
    cancelable?: boolean;
    cancelLabel?: string;
    closeLabel?: string;
  }>(),
  {
    description: "",
    detail: "",
    steps: () => [],
    currentStep: 0,
    cancelable: false,
    cancelLabel: "Cancel",
    closeLabel: "Close",
  },
);

defineEmits<{ cancel: [] }>();
</script>
