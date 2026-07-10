<template>
  <Teleport to="body">
    <dialog
      ref="dialog"
      v-bind="$attrs"
      class="ui-dialog"
      :class="`ui-dialog-${variant}`"
      :aria-labelledby="titleId"
      :aria-describedby="description ? descriptionId : undefined"
      :aria-busy="busy || undefined"
      @cancel="handleCancel"
      @click="handleBackdropClick"
      @keydown="handleKeydown"
    >
      <div class="ui-dialog-panel">
        <header class="ui-dialog-header">
          <div>
            <p v-if="eyebrow" class="ui-dialog-eyebrow">{{ eyebrow }}</p>
            <h2 :id="titleId">{{ title }}</h2>
            <p v-if="description" :id="descriptionId">{{ description }}</p>
          </div>
          <button
            v-if="showClose"
            type="button"
            class="ui-dialog-close"
            :aria-label="closeLabel"
            :disabled="busy"
            @click="requestClose"
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div class="ui-dialog-body"><slot /></div>
        <footer v-if="$slots.actions" class="ui-dialog-actions">
          <slot name="actions" />
        </footer>
      </div>
    </dialog>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    open: boolean;
    title: string;
    description?: string;
    eyebrow?: string;
    closeLabel?: string;
    showClose?: boolean;
    closeOnBackdrop?: boolean;
    busy?: boolean;
    initialFocusSelector?: string;
    variant?: "modal" | "drawer";
  }>(),
  {
    description: "",
    eyebrow: "",
    closeLabel: "Close",
    showClose: true,
    closeOnBackdrop: true,
    busy: false,
    initialFocusSelector: "",
    variant: "modal",
  },
);

const emit = defineEmits<{ close: [] }>();
const dialog = ref<HTMLDialogElement | null>(null);
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
const titleId = `ui-dialog-title-${instanceId}`;
const descriptionId = `${titleId}-description`;
let previousFocus: HTMLElement | null = null;

const focusableSelector =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const isAvailableControl = (control: HTMLElement) => {
  if (
    control.hidden ||
    control.matches(":disabled, [aria-disabled='true']") ||
    control.closest("[hidden], [inert]")
  ) {
    return false;
  }
  const style = window.getComputedStyle(control);
  return style.display !== "none" && style.visibility !== "hidden";
};

const queryRequestedControl = (root: HTMLDialogElement) => {
  if (!props.initialFocusSelector) return null;
  try {
    return root.querySelector<HTMLElement>(props.initialFocusSelector);
  } catch {
    return null;
  }
};

const focusInitialControl = () => {
  const root = dialog.value;
  if (!root) return;
  const requested = queryRequestedControl(root);
  const firstAvailable = Array.from(
    root.querySelectorAll<HTMLElement>(focusableSelector),
  ).find(isAvailableControl);
  const target =
    requested && isAvailableControl(requested) ? requested : firstAvailable;
  if (target) {
    target.focus();
    return;
  }
  root.tabIndex = -1;
  root.focus();
};

const requestClose = () => {
  if (!props.busy) emit("close");
};

const handleCancel = (event: Event) => {
  event.preventDefault();
  requestClose();
};

const handleBackdropClick = (event: MouseEvent) => {
  if (event.target === dialog.value && props.closeOnBackdrop) requestClose();
};

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key !== "Tab" || !dialog.value) return;
  const controls = Array.from(
    dialog.value.querySelectorAll<HTMLElement>(focusableSelector),
  ).filter(isAvailableControl);
  if (!controls.length) {
    event.preventDefault();
    dialog.value.focus();
    return;
  }
  const first = controls[0];
  const last = controls[controls.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
};

const syncOpenState = async (open: boolean) => {
  const element = dialog.value;
  if (!element) return;
  if (open) {
    previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!element.open) {
      if (typeof element.showModal === "function") {
        element.showModal();
      } else {
        element.setAttribute("open", "");
      }
    }
    await nextTick();
    focusInitialControl();
    return;
  }
  if (element.open) {
    if (typeof element.close === "function") {
      element.close();
    } else {
      element.removeAttribute("open");
    }
  }
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
  previousFocus = null;
};

watch(() => props.open, syncOpenState, { flush: "post" });

onMounted(() => {
  void syncOpenState(props.open);
});

onBeforeUnmount(() => {
  if (dialog.value?.open) {
    if (typeof dialog.value.close === "function") {
      dialog.value.close();
    } else {
      dialog.value.removeAttribute("open");
    }
  }
  if (previousFocus?.isConnected) {
    previousFocus.focus();
  }
});
</script>
