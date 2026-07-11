import { reactive, nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import App from "@/App.vue";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/stores/session";
import { useLocaleStore } from "@/stores/locale";
import { useThemeStore } from "@/stores/theme";
import { MINAMOTO_CHAIN_PRESET, TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";

const route = reactive<{
  path: string;
  meta: { titleKey?: string; subtitleKey?: string };
}>({
  path: "/account",
  meta: {
    titleKey: "Create wallet",
    subtitleKey: "Create or restore a wallet",
  },
});

vi.mock("vue-router", async () => {
  const actual =
    await vi.importActual<typeof import("vue-router")>("vue-router");
  return {
    ...actual,
    useRoute: () => route,
  };
});

const t = (key: string) => translate("en-US", key);
const wrappers: VueWrapper[] = [];
let mobileViewportMatches = false;

describe("App shell", () => {
  beforeEach(() => {
    localStorage.clear();
    document.title = "";
    mobileViewportMatches = false;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn((query: string) => ({
        matches: query.includes("max-width: 760px")
          ? mobileViewportMatches
          : query.includes("min-width: 761px") &&
            query.includes("max-width: 1179px"),
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(() => true),
      })),
    });
    route.path = "/account";
    route.meta = {
      titleKey: "Saved Wallets",
      subtitleKey: "Create, restore, or switch wallets",
    };
    setActivePinia(createPinia());
  });

  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  });

  const mountApp = (options?: { withAccount?: boolean }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
    });
    if (options?.withAccount) {
      session.$patch({
        accounts: [
          {
            displayName: "Alice",
            domain: "wonderland",
            accountId: "alice@wonderland",
            publicKeyHex: "ab".repeat(32),
            privateKeyHex: "cd".repeat(32),
            hasStoredSecret: true,
          },
        ],
        activeAccountId: "alice@wonderland",
      });
    }
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
        stubs: {
          RouterLink: {
            props: ["to"],
            template:
              '<a class="router-link-stub" href="#" :data-to="to"><slot /></a>',
          },
          RouterView: {
            template: '<div class="router-view-stub" />',
          },
          SakuraScene: true,
          AccountSwitcher: true,
        },
      },
    });
    wrappers.push(wrapper);
    return wrapper;
  };

  it("shows only public footer destinations before a wallet exists", () => {
    const wrapper = mountApp();
    const labels = wrapper
      .findAll(".sidebar-footer .nav-label")
      .map((node) => node.text());

    expect(wrapper.findAll(".nav-group")).toHaveLength(0);
    expect(labels).toEqual([t("Settings"), t("Saved Wallets")]);
    expect(
      wrapper.find('[data-testid="header-irohaconnect-button"]').exists(),
    ).toBe(false);
  });

  it("uses the exact grouped navigation order without steps or descriptions", () => {
    route.path = "/wallet";
    route.meta = {
      titleKey: "Wallet",
      subtitleKey: "Balance, funding, and activity",
    };

    const wrapper = mountApp({ withAccount: true });
    const labelsFor = (group: string) =>
      wrapper
        .get(`[data-nav-group="${group}"]`)
        .findAll(".nav-label")
        .map((node) => node.text());

    expect(labelsFor("daily")).toEqual([t("Wallet"), t("Send"), t("Receive")]);
    expect(labelsFor("grow")).toEqual([
      t("Staking"),
      t("Governance"),
      t("Subscriptions"),
    ]);
    expect(labelsFor("services")).toEqual([
      t("Stats"),
      t("Explore"),
      t("SoraCloud"),
      t("VPN"),
      t("Kaigi"),
      t("Offline"),
      t("SCCP Bridge"),
    ]);
    expect(
      wrapper.findAll(".sidebar-footer .nav-label").map((node) => node.text()),
    ).toEqual([t("Settings"), t("Advanced"), t("Saved Wallets")]);
    expect(wrapper.find(".nav-step").exists()).toBe(false);
    expect(wrapper.find(".nav-description").exists()).toBe(false);
  });

  it("opens the mobile drawer and closes it when the route changes", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });

    await wrapper.get(".mobile-nav-trigger").trigger("click");
    await nextTick();
    expect(
      document.body.querySelector("dialog.ui-dialog-drawer[open]"),
    ).toBeTruthy();
    expect(wrapper.get(".mobile-nav-trigger").attributes("aria-expanded")).toBe(
      "true",
    );

    route.path = "/settings";
    route.meta = {
      titleKey: "Settings",
      subtitleKey: "Endpoint and app preferences",
    };
    await nextTick();
    await nextTick();

    expect(
      document.body.querySelector("dialog.ui-dialog-drawer[open]"),
    ).toBeNull();
  });

  it("presents the mobile drawer as a labelled modal surface", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });
    const trigger = wrapper.get(".mobile-nav-trigger");
    await nextTick();
    await nextTick();
    (trigger.element as HTMLButtonElement).focus();

    await trigger.trigger("click");
    await nextTick();

    const drawer = document.body.querySelector<HTMLDialogElement>(
      "dialog.ui-dialog-drawer[open]",
    );
    const labelledBy = drawer?.getAttribute("aria-labelledby");
    const describedBy = drawer?.getAttribute("aria-describedby");
    expect(drawer).toBeTruthy();
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? "")?.textContent).toContain(
      t("Navigate"),
    );
    expect(describedBy).toBeTruthy();
    expect(drawer?.contains(document.activeElement)).toBe(true);
  });

  it("closes the drawer on Escape and restores focus to its trigger", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });
    const trigger = wrapper.get(".mobile-nav-trigger");
    await nextTick();
    await nextTick();
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await nextTick();
    const drawer = document.body.querySelector<HTMLDialogElement>(
      "dialog.ui-dialog-drawer[open]",
    );
    expect(drawer).toBeTruthy();

    drawer?.dispatchEvent(new Event("cancel", { cancelable: true }));
    await nextTick();
    await nextTick();

    expect(
      document.body.querySelector("dialog.ui-dialog-drawer[open]"),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("restores drawer-trigger focus after backdrop dismissal", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });
    const trigger = wrapper.get(".mobile-nav-trigger");
    await nextTick();
    await nextTick();
    (trigger.element as HTMLButtonElement).focus();
    await trigger.trigger("click");
    await nextTick();

    document.body
      .querySelector<HTMLDialogElement>("dialog.ui-dialog-drawer[open]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await nextTick();
    await nextTick();

    expect(
      document.body.querySelector("dialog.ui-dialog-drawer[open]"),
    ).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
  });

  it("traps forward and reverse focus within the open drawer", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });
    await wrapper.get(".mobile-nav-trigger").trigger("click");
    await nextTick();

    const drawer = document.body.querySelector<HTMLDialogElement>(
      "dialog.ui-dialog-drawer[open]",
    );
    expect(drawer).toBeTruthy();
    const focusable = Array.from(
      drawer?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? [],
    );
    expect(focusable.length).toBeGreaterThan(1);
    focusable.forEach((element) => {
      Object.defineProperty(element, "offsetParent", {
        configurable: true,
        get: () => drawer,
      });
    });
    const first = focusable[0];
    const last = focusable.at(-1);

    last?.focus();
    drawer?.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(document.activeElement).toBe(first);

    first?.focus();
    drawer?.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true,
      }),
    );
    expect(document.activeElement).toBe(last);
  });

  it("closes the drawer after selecting a real navigation destination", async () => {
    mobileViewportMatches = true;
    const wrapper = mountApp({ withAccount: true });
    await wrapper.get(".mobile-nav-trigger").trigger("click");

    document.body
      .querySelector<HTMLElement>('.drawer-navigation [data-to="/send"]')
      ?.click();
    await nextTick();
    await nextTick();

    expect(
      document.body.querySelector("dialog.ui-dialog-drawer[open]"),
    ).toBeNull();
  });

  it("provides a keyboard-visible accessible tooltip in icon-rail mode", async () => {
    route.path = "/wallet";
    route.meta = {
      titleKey: "Wallet",
      subtitleKey: "Balance, funding, and activity",
    };
    const wrapper = mountApp({ withAccount: true });
    const sendLink = wrapper.get('.sidebar [data-to="/send"]');

    const tooltip = sendLink.element.querySelector<HTMLElement>(
      ':scope > [role="tooltip"]',
    );
    expect(sendLink.attributes("aria-label")).toBe(t("Send"));
    expect(tooltip?.textContent?.trim()).toBe(t("Send"));
    expect(tooltip?.getAttribute("aria-hidden")).toBe("true");
  });

  it("marks exactly one current navigation destination", () => {
    route.path = "/wallet";
    route.meta = {
      titleKey: "Wallet",
      subtitleKey: "Balance, funding, and activity",
    };
    const wrapper = mountApp({ withAccount: true });

    const current = wrapper.findAll('.nav-link[aria-current="page"]');
    expect(current).toHaveLength(1);
    expect(current[0]?.attributes("data-to")).toBe("/wallet");
  });

  it("focuses the sole route heading and updates the document title", async () => {
    const wrapper = mountApp({ withAccount: true });

    route.path = "/receive";
    route.meta = {
      titleKey: "Receive",
      subtitleKey: "Show a payment QR",
    };
    await nextTick();
    await nextTick();

    const heading = wrapper.get(".workspace-heading h1");
    expect(wrapper.findAll(".workspace-header h1")).toHaveLength(1);
    expect(heading.text()).toBe(t("Receive"));
    expect(document.activeElement).toBe(heading.element);
    expect(document.title).toBe(`${t("Receive")} · ${t("Iroha Wallet")}`);
    expect(wrapper.find(".workspace-meta").exists()).toBe(false);
  });

  it("uses the video-first workspace treatment on Kaigi", () => {
    route.path = "/kaigi";
    route.meta = {
      titleKey: "Kaigi",
      subtitleKey: "Wallet-based meeting links",
    };

    const wrapper = mountApp({ withAccount: true });

    expect(wrapper.get(".workspace").classes()).toContain("kaigi-workspace");
  });

  it("keeps a branded Open wallet link and the IrohaConnect action", () => {
    const wrapper = mountApp({ withAccount: true });

    expect(wrapper.get(".brand-link").attributes("aria-label")).toBe(
      t("Open wallet"),
    );
    expect(wrapper.get(".brand-link").attributes("data-to")).toBe("/wallet");
    expect(
      wrapper.get('[data-testid="header-irohaconnect-button"]').text(),
    ).toContain("IrohaConnect");
  });

  it("uses the metadata-backed Saved Wallets title for the account route", () => {
    const wrapper = mountApp({ withAccount: true });

    expect(wrapper.get(".workspace-heading h1").text()).toBe(
      t("Saved Wallets"),
    );
    expect(wrapper.get(".section-label").text()).toBe(
      t("Create, restore, or switch wallets"),
    );
    expect(wrapper.findAll(".sidebar-footer .nav-label").at(-1)?.text()).toBe(
      t("Saved Wallets"),
    );
  });

  it("persists locale changes from the permanent header control and updates document language direction", async () => {
    const wrapper = mountApp();
    const localeStore = useLocaleStore();
    localeStore.setLocale("en-US");
    await nextTick();

    const preferences = wrapper.get(".header-preferences");
    const localeSelect = preferences.get('[data-testid="locale-select"]');
    const localeValues = Array.from(
      (localeSelect.element as HTMLSelectElement).options,
      (option) => option.value,
    );
    expect(localeValues).toContain("egy-Egyp");
    expect(localeValues).toContain("akk-Xsux");
    await localeSelect.setValue("ar-SA");

    expect(localeStore.current).toBe("ar-SA");
    expect(localStorage.getItem("iroha-demo:locale")).toBe("ar-SA");
    expect(document.documentElement.getAttribute("lang")).toBe("ar-SA");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");

    await localeSelect.setValue("de-DE");

    expect(localeStore.current).toBe("de-DE");
    expect(localStorage.getItem("iroha-demo:locale")).toBe("de-DE");
    expect(document.documentElement.getAttribute("lang")).toBe("de-DE");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");

    for (const locale of ["egy-Egyp", "akk-Xsux"] as const) {
      await localeSelect.setValue(locale);
      expect(localeStore.current).toBe(locale);
      expect(localStorage.getItem("iroha-demo:locale")).toBe(locale);
      expect(document.documentElement.getAttribute("lang")).toBe(locale);
      expect(document.documentElement.getAttribute("dir")).toBe("ltr");
      expect(localeSelect.attributes("aria-label")).toBe(
        locale === "egy-Egyp"
          ? "Language — Ancient Egyptian"
          : "Language — Old Akkadian",
      );
    }
  });

  it("exposes the desktop light and dark options as a persisted pressed-state group", async () => {
    const wrapper = mountApp();
    const themeStore = useThemeStore();
    themeStore.setTheme("dark");
    await nextTick();

    const preferences = wrapper.get(".header-preferences");
    const lightButton = preferences.get('[data-testid="theme-light-button"]');
    const darkButton = preferences.get('[data-testid="theme-dark-button"]');

    expect(lightButton.attributes("aria-pressed")).toBe("false");
    expect(darkButton.attributes("aria-pressed")).toBe("true");

    await lightButton.trigger("click");

    expect(themeStore.current).toBe("light");
    expect(localStorage.getItem("iroha-demo:theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(lightButton.attributes("aria-pressed")).toBe("true");
    expect(darkButton.attributes("aria-pressed")).toBe("false");

    await darkButton.trigger("click");

    expect(themeStore.current).toBe("dark");
    expect(localStorage.getItem("iroha-demo:theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(lightButton.attributes("aria-pressed")).toBe("false");
    expect(darkButton.attributes("aria-pressed")).toBe("true");
  });

  it("keeps the compact theme toggle stateful and persisted", async () => {
    const wrapper = mountApp();
    const themeStore = useThemeStore();
    themeStore.setTheme("dark");
    await nextTick();

    const toggle = wrapper
      .get(".header-preferences")
      .get('[data-testid="theme-toggle"]');
    expect(toggle.attributes("aria-pressed")).toBe("false");

    await toggle.trigger("click");

    expect(themeStore.current).toBe("light");
    expect(localStorage.getItem("iroha-demo:theme")).toBe("light");
    expect(toggle.attributes("aria-pressed")).toBe("true");

    await toggle.trigger("click");

    expect(themeStore.current).toBe("dark");
    expect(localStorage.getItem("iroha-demo:theme")).toBe("dark");
    expect(toggle.attributes("aria-pressed")).toBe("false");
  });

  it("keeps preferences out of the account menu and renders the account switcher when empty", () => {
    const wrapper = mountApp();
    const utilityPanel = wrapper.get(".utility-menu-panel");

    expect(utilityPanel.find('[data-testid="locale-select"]').exists()).toBe(
      false,
    );
    expect(utilityPanel.find('[data-testid^="theme-"]').exists()).toBe(false);
    expect(utilityPanel.find(".utility-menu-action").exists()).toBe(false);
    expect(utilityPanel.find("account-switcher-stub").exists()).toBe(true);
  });

  it("orders direct header controls predictably and keeps each preference keyboard focusable", () => {
    const wrapper = mountApp({ withAccount: true });
    const headerRail = wrapper.get(".header-rail");
    const connect = headerRail.get(".header-connect").element;
    const network = headerRail.get(".network-control").element;
    const preferences = headerRail.get(".header-preferences");
    const account = headerRail.get(".utility-menu").element;
    const children = Array.from(headerRail.element.children);

    expect(children.indexOf(connect)).toBeLessThan(children.indexOf(network));
    expect(children.indexOf(network)).toBeLessThan(
      children.indexOf(preferences.element),
    );
    expect(children.indexOf(preferences.element)).toBeLessThan(
      children.indexOf(account),
    );

    const controls = preferences.findAll<HTMLElement>(
      "select, button:not([disabled])",
    );
    expect(controls).toHaveLength(4);
    expect(
      controls.map((control) => ({
        disabled: (control.element as HTMLButtonElement | HTMLSelectElement)
          .disabled,
        testId: control.attributes("data-testid"),
        tabIndex: control.element.tabIndex,
      })),
    ).toEqual([
      { disabled: false, testId: "locale-select", tabIndex: 0 },
      { disabled: false, testId: "theme-light-button", tabIndex: 0 },
      { disabled: false, testId: "theme-dark-button", tabIndex: 0 },
      { disabled: false, testId: "theme-toggle", tabIndex: 0 },
    ]);
  });

  it("switches the active network profile from the compact header selector", async () => {
    const wrapper = mountApp();
    const session = useSessionStore();
    const networkSelect = wrapper.get('[data-testid="network-profile-select"]');

    expect(networkSelect.attributes("aria-label")).toBe(t("Network"));

    await networkSelect.setValue(MINAMOTO_CHAIN_PRESET.id);

    expect(session.connection).toEqual(MINAMOTO_CHAIN_PRESET.connection);
    expect(wrapper.get(".brand-network").text()).toBe(
      MINAMOTO_CHAIN_PRESET.label,
    );
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection,
    ).toEqual(MINAMOTO_CHAIN_PRESET.connection);
  });
});
