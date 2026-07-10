import { createPinia } from "pinia";
import { nextTick } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, it } from "vitest";
import AppButton from "@/components/ui/AppButton.vue";
import AppDialog from "@/components/ui/AppDialog.vue";
import SegmentedControl from "@/components/ui/SegmentedControl.vue";

const mountedWrappers: VueWrapper[] = [];

const settleDialog = async () => {
  await nextTick();
  await nextTick();
};

const markVisible = (...elements: Array<HTMLElement | null>) => {
  elements.forEach((element) => {
    if (!element) return;
    Object.defineProperty(element, "offsetParent", {
      configurable: true,
      get: () => element.parentElement ?? document.body,
    });
  });
};

const mountDialog = (
  props: Partial<InstanceType<typeof AppDialog>["$props"]> = {},
  slots: Record<string, string> = {},
) => {
  const wrapper = mount(AppDialog, {
    attachTo: document.body,
    props: {
      open: true,
      title: "Approve connection?",
      description: "Review the requesting session.",
      ...props,
    },
    slots,
  });
  mountedWrappers.push(wrapper);
  return wrapper;
};

describe("Quiet Sakura UI primitives", () => {
  afterEach(() => {
    mountedWrappers.splice(0).forEach((wrapper) => wrapper.unmount());
    document.body.innerHTML = "";
  });

  it("exposes loading button state without firing actions", async () => {
    const wrapper = mount(AppButton, {
      props: { loading: true },
      slots: { default: "Continue" },
      global: { plugins: [createPinia()] },
    });
    mountedWrappers.push(wrapper);

    expect(wrapper.attributes("aria-busy")).toBe("true");
    expect(wrapper.attributes("disabled")).toBeDefined();
    await wrapper.trigger("click");
    expect(wrapper.emitted("click")).toBeUndefined();
  });

  it("uses pressed semantics for segmented choices", async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: "standard",
        label: "Send mode",
        options: [
          { value: "standard", label: "Standard" },
          { value: "private", label: "Private" },
        ],
      },
    });
    mountedWrappers.push(wrapper);

    const options = wrapper.findAll("button");
    expect(options[0]?.attributes("aria-pressed")).toBe("true");
    expect(options[1]?.attributes("aria-pressed")).toBe("false");
    await options[1]?.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["private"]);
  });

  it("opens a labelled modal, focuses the requested action, and requests close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const wrapper = mountDialog(
      { initialFocusSelector: "[data-reject]" },
      {
        actions:
          "<button data-approve>Approve</button><button data-reject>Reject</button>",
      },
    );
    await settleDialog();

    const dialog = document.body.querySelector("dialog");
    const reject = document.body.querySelector<HTMLElement>("[data-reject]");
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog?.getAttribute("aria-describedby")).toBeTruthy();
    expect(document.activeElement).toBe(reject);

    dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
    await settleDialog();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("traps forward and reverse keyboard focus inside the dialog", async () => {
    mountDialog(
      { initialFocusSelector: "[data-first]" },
      {
        actions:
          "<button data-first>First</button><button data-middle>Middle</button><button data-last>Last</button>",
      },
    );
    await settleDialog();

    const dialog = document.body.querySelector<HTMLDialogElement>("dialog");
    const close = document.body.querySelector<HTMLElement>(".ui-dialog-close");
    const first = document.body.querySelector<HTMLElement>("[data-first]");
    const middle = document.body.querySelector<HTMLElement>("[data-middle]");
    const last = document.body.querySelector<HTMLElement>("[data-last]");
    markVisible(close, first, middle, last);

    last?.focus();
    dialog?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(close);

    close?.focus();
    dialog?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the opener after every open and close cycle", async () => {
    const firstOpener = document.createElement("button");
    const secondOpener = document.createElement("button");
    document.body.append(firstOpener, secondOpener);

    const wrapper = mountDialog(
      { open: false, initialFocusSelector: "[data-safe]" },
      { actions: "<button data-safe>Safe action</button>" },
    );

    firstOpener.focus();
    await wrapper.setProps({ open: true });
    await settleDialog();
    expect(document.activeElement).toBe(
      document.body.querySelector("[data-safe]"),
    );
    await wrapper.setProps({ open: false });
    await settleDialog();
    expect(document.activeElement).toBe(firstOpener);

    secondOpener.focus();
    await wrapper.setProps({ open: true });
    await settleDialog();
    await wrapper.setProps({ open: false });
    await settleDialog();
    expect(document.activeElement).toBe(secondOpener);
  });

  it("closes from Escape and the backdrop but not from panel clicks", async () => {
    const wrapper = mountDialog({}, { default: "<p>Review details</p>" });
    await settleDialog();

    const dialog = document.body.querySelector<HTMLDialogElement>("dialog");
    const panel = document.body.querySelector<HTMLElement>(".ui-dialog-panel");
    panel?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("close")).toBeUndefined();

    dialog?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("close")).toHaveLength(1);

    dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(wrapper.emitted("close")).toHaveLength(2);
  });

  it("refuses Escape, backdrop, and close-button dismissal while busy", async () => {
    const wrapper = mountDialog({ busy: true });
    await settleDialog();

    const dialog = document.body.querySelector<HTMLDialogElement>("dialog");
    dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
    dialog?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.body.querySelector<HTMLButtonElement>(".ui-dialog-close")?.click();

    expect(wrapper.emitted("close")).toBeUndefined();
    expect(dialog?.hasAttribute("open")).toBe(true);
    expect(dialog?.getAttribute("aria-busy")).toBe("true");
  });

  it("honors a non-dismissible backdrop without disabling explicit close", async () => {
    const wrapper = mountDialog({ closeOnBackdrop: false });
    await settleDialog();

    document.body
      .querySelector<HTMLDialogElement>("dialog")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(wrapper.emitted("close")).toBeUndefined();

    document.body.querySelector<HTMLButtonElement>(".ui-dialog-close")?.click();
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("falls back to a safe enabled action when the requested focus target is disabled", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    mountDialog(
      {
        initialFocusSelector: "[data-disabled]",
        showClose: false,
      },
      {
        actions:
          "<button data-disabled disabled>Unavailable</button><button data-safe>Reject</button>",
      },
    );
    await settleDialog();

    expect(document.activeElement).toBe(
      document.body.querySelector("[data-safe]"),
    );
  });

  it("focuses the dialog itself when it has no interactive descendants", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    mountDialog(
      { showClose: false },
      { default: "<p>The operation is still running.</p>" },
    );
    await settleDialog();

    const dialog = document.body.querySelector<HTMLDialogElement>("dialog");
    expect(document.activeElement).toBe(dialog);
  });

  it("survives a malformed initial-focus selector and uses the safe fallback", async () => {
    mountDialog(
      {
        initialFocusSelector: "[not-a-valid-selector",
        showClose: false,
      },
      { actions: "<button data-safe>Reject</button>" },
    );
    await settleDialog();

    expect(document.activeElement).toBe(
      document.body.querySelector("[data-safe]"),
    );
  });
});
