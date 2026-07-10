<template>
  <RouterLink v-if="to" v-slot="{ href, navigate }" :to="to" custom>
    <a
      class="ui-button"
      :class="['ui-button-' + variant, 'ui-button-' + size]"
      :href="disabled || loading ? undefined : href"
      :tabindex="disabled || loading ? -1 : undefined"
      :aria-disabled="disabled || loading ? 'true' : undefined"
      :aria-busy="loading || undefined"
      @click="handleLinkClick($event, navigate)"
    >
      <span v-if="loading" class="ui-button-spinner" aria-hidden="true"></span>
      <span v-if="$slots.icon" class="ui-button-icon" aria-hidden="true">
        <slot name="icon" />
      </span>
      <span class="ui-button-label"><slot /></span>
    </a>
  </RouterLink>
  <button
    v-else
    class="ui-button"
    :class="['ui-button-' + variant, 'ui-button-' + size]"
    :type="type"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
    @click="handleClick"
  >
    <span v-if="loading" class="ui-button-spinner" aria-hidden="true"></span>
    <span v-if="$slots.icon" class="ui-button-icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span class="ui-button-label"><slot /></span>
  </button>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import type { ButtonSize, ButtonVariant } from "@/types/ui";

const props = withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    size?: ButtonSize;
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
    to?: string;
  }>(),
  {
    variant: "primary",
    size: "md",
    type: "button",
    loading: false,
    disabled: false,
    to: "",
  },
);

const emit = defineEmits<{ click: [event: MouseEvent] }>();
const handleClick = (event: MouseEvent) => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    return;
  }
  emit("click", event);
};

const handleLinkClick = (
  event: MouseEvent,
  navigate: (event?: MouseEvent) => Promise<unknown>,
) => {
  if (props.disabled || props.loading) {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }
  emit("click", event);
  void navigate(event);
};
</script>
