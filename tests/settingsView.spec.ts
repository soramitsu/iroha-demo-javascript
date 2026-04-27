import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SettingsView from "@/views/SettingsView.vue";
import { DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/stores/session";

const getChainMetadataMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  getChainMetadata: (toriiUrl: string) => getChainMetadataMock(toriiUrl),
}));

const t = (key: string) => translate("en-US", key);

describe("SettingsView", () => {
  let activeWrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    localStorage.clear();
    getChainMetadataMock.mockReset();
    getChainMetadataMock.mockResolvedValue({
      chainId: "loaded-chain",
      networkPrefix: 42,
    });
    setActivePinia(createPinia());
  });

  afterEach(() => {
    activeWrapper?.unmount();
    activeWrapper = null;
    document.body.innerHTML = "";
  });

  const mountView = (toriiUrl = DEFAULT_CHAIN_PRESET.connection.toriiUrl) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...DEFAULT_CHAIN_PRESET.connection,
        toriiUrl,
      },
    });
    activeWrapper = mount(SettingsView, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    return activeWrapper;
  };

  const getButtonByText = (
    wrapper: ReturnType<typeof mount>,
    label: string,
  ) => {
    const button = wrapper
      .findAll("button")
      .find((node) => node.text() === label);
    if (!button) {
      throw new Error(`Button not found: ${label}`);
    }
    return button;
  };

  it("shows the default endpoint and current chain settings", () => {
    const wrapper = mountView();
    const endpointInput = wrapper.get<HTMLInputElement>(
      '[data-testid="settings-torii-url-input"]',
    );
    const inputs = wrapper.findAll("input").map((node) => {
      return (node.element as HTMLInputElement).value;
    });

    expect(endpointInput.attributes("type")).toBe("url");
    expect(endpointInput.attributes("name")).toBe("toriiUrl");
    expect(endpointInput.attributes("aria-describedby")).toBe(
      "settings-endpoint-status settings-endpoint-error",
    );
    expect(endpointInput.attributes("translate")).toBe("no");
    expect(wrapper.text()).toContain(DEFAULT_CHAIN_PRESET.connection.toriiUrl);
    expect(inputs).toContain(DEFAULT_CHAIN_PRESET.connection.chainId);
    expect(inputs).toContain(
      String(DEFAULT_CHAIN_PRESET.connection.networkPrefix),
    );
    expect(wrapper.text()).toContain(t("Default endpoint"));
  });

  it("saves a normalized custom endpoint without checking chain metadata", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue(" http://127.0.0.1:8080/ ");
    await getButtonByText(wrapper, t("Save without checking")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe("http://127.0.0.1:8080");
    expect(session.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(session.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(wrapper.text()).toContain(t("Endpoint saved."));
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection
        .toriiUrl,
    ).toBe("http://127.0.0.1:8080");
  });

  it("restores known endpoint metadata when saving a preset endpoint without checking", async () => {
    const wrapper = mountView("http://127.0.0.1:8080");
    const session = useSessionStore();
    session.updateConnection({
      chainId: "00000000-0000-0000-0000-000000000000",
      networkPrefix: 1,
    });

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue(DEFAULT_CHAIN_PRESET.connection.toriiUrl);
    await getButtonByText(wrapper, t("Save without checking")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(session.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(session.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
  });

  it("rejects unsupported endpoint schemes", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("ftp://example.com");
    await getButtonByText(wrapper, t("Save without checking")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(wrapper.text()).toContain(
      t("Endpoint must start with http:// or https://."),
    );
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="settings-torii-url-input"]').element,
    );
  });

  it("checks and saves the draft endpoint", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("http://localhost:8080/");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(getChainMetadataMock).toHaveBeenCalledWith("http://localhost:8080");
    expect(session.connection.toriiUrl).toBe("http://localhost:8080");
    expect(session.connection.chainId).toBe("loaded-chain");
    expect(session.connection.networkPrefix).toBe(42);
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection
        .toriiUrl,
    ).toBe("http://localhost:8080");
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection
        .chainId,
    ).toBe("loaded-chain");
    expect(wrapper.text()).toContain(
      t("Endpoint checked and chain settings saved."),
    );
    expect(wrapper.get('[role="status"]').text()).toBe(
      t("Endpoint checked and chain settings saved."),
    );
  });

  it("does not save a draft endpoint when the check fails", async () => {
    getChainMetadataMock.mockRejectedValueOnce(
      new Error("metadata unavailable"),
    );
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("http://localhost:8080/");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(getChainMetadataMock).toHaveBeenCalledWith("http://localhost:8080");
    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(wrapper.text()).toContain("metadata unavailable");
    expect(wrapper.get('[role="alert"]').text()).toBe("metadata unavailable");
  });

  it("rejects invalid draft endpoints before checking", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("ftp://example.com");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(getChainMetadataMock).not.toHaveBeenCalled();
    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(wrapper.get('[role="alert"]').text()).toBe(
      t("Endpoint must start with http:// or https://."),
    );
    expect(document.activeElement).toBe(
      wrapper.get('[data-testid="settings-torii-url-input"]').element,
    );
  });

  it("restores the default endpoint", async () => {
    const wrapper = mountView("http://localhost:8080");
    const session = useSessionStore();
    session.updateConnection({
      chainId: "loaded-chain",
      networkPrefix: 42,
    });

    await getButtonByText(wrapper, t("Reset to default")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(session.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(session.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(wrapper.text()).toContain(t("Default endpoint restored."));
  });
});
