import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import SettingsView from "@/views/SettingsView.vue";
import { DEFAULT_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { SESSION_STORAGE_KEY, useSessionStore } from "@/stores/session";
import type {
  EndpointFeature,
  EndpointFeatureMap,
  EndpointInspection,
} from "@/types/endpointInspection";

const inspectEndpointMock = vi.fn();

vi.mock("@/services/iroha", () => ({
  inspectEndpoint: (input: {
    toriiUrl: string;
    chainId: string;
    networkPrefix: number;
  }) => inspectEndpointMock(input),
}));

const t = (key: string) => translate("en-US", key);
type EndpointInspectionInput = {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
};
const endpointFeatures = (supported: boolean): EndpointFeatureMap => {
  const features: EndpointFeature[] = [
    "accountRegistration",
    "accountOnboarding",
    "assetTransfers",
    "faucetClaim",
    "confidentialTransfers",
    "kaigiMeetings",
    "governanceWrites",
    "stakingWrites",
    "subscriptionWrites",
    "soraCloudDeploy",
    "vpnSessions",
    "irohaConnectSessions",
    "zkProofJobs",
  ];
  return Object.fromEntries(
    features.map((feature) => [
      feature,
      {
        supported,
        source: "openapi",
        requiredOperations: [],
        missingOperations: [],
      },
    ]),
  ) as unknown as EndpointFeatureMap;
};
const matchingInspection = (
  input: EndpointInspectionInput,
): EndpointInspection => ({
  schema: "iroha.wallet.endpoint-inspection.v1",
  toriiUrl: input.toriiUrl,
  expected: {
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  },
  observed: {
    chainId: input.chainId,
    networkPrefix: input.networkPrefix,
  },
  identityStatus: "matched",
  accessMode: "read-write",
  checkedAtMs: 1,
  evidence: [],
  features: endpointFeatures(true),
  diagnostic: {
    code: "endpoint_identity_matched",
    message: "Endpoint identity matches the configured network.",
  },
});

describe("SettingsView", () => {
  let activeWrapper: ReturnType<typeof mount> | null = null;

  beforeEach(() => {
    localStorage.clear();
    inspectEndpointMock.mockReset();
    inspectEndpointMock.mockImplementation((input: EndpointInspectionInput) =>
      matchingInspection(input),
    );
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

    expect(inspectEndpointMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: DEFAULT_CHAIN_PRESET.connection.chainId,
      networkPrefix: DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    });
    expect(session.connection.toriiUrl).toBe("http://localhost:8080");
    expect(session.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(session.connection.networkPrefix).toBe(
      DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    );
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection
        .toriiUrl,
    ).toBe("http://localhost:8080");
    expect(
      JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? "{}").connection
        .chainId,
    ).toBe(DEFAULT_CHAIN_PRESET.connection.chainId);
    expect(wrapper.text()).toContain(
      t("Endpoint identity verified and saved."),
    );
    expect(wrapper.get('[role="status"]').text()).toBe(
      t("Endpoint identity verified and saved."),
    );
    expect(
      wrapper.get('[data-testid="endpoint-diagnostics"]').text(),
    ).toContain(t("Read and write"));
  });

  it("keeps a mismatched endpoint configured for reads without retargeting the wallet", async () => {
    inspectEndpointMock.mockImplementationOnce(
      (input: {
        toriiUrl: string;
        chainId: string;
        networkPrefix: number;
      }) => ({
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: input.toriiUrl,
        expected: {
          chainId: input.chainId,
          networkPrefix: input.networkPrefix,
        },
        observed: {
          chainId: "archived-chain",
          networkPrefix: input.networkPrefix,
        },
        identityStatus: "mismatched",
        accessMode: "read-only",
        checkedAtMs: 1,
        evidence: [],
        features: endpointFeatures(false),
        diagnostic: {
          code: "endpoint_identity_mismatch",
          message: "Archived deployment mismatch. Writes are blocked.",
        },
      }),
    );
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("http://localhost:8080/");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe("http://localhost:8080");
    expect(session.connection.chainId).toBe(
      DEFAULT_CHAIN_PRESET.connection.chainId,
    );
    expect(wrapper.get('[role="status"]').text()).toContain(
      "Endpoint saved in read-only mode: Archived deployment mismatch. Writes are blocked.",
    );
    expect(
      wrapper.get('[data-testid="endpoint-diagnostics"]').text(),
    ).toContain("archived-chain");
  });

  it("does not save a draft endpoint when the check fails", async () => {
    inspectEndpointMock.mockRejectedValueOnce(
      new Error("metadata unavailable"),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const endpointStore = useEndpointStore();
    const activeInspection = matchingInspection({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      networkPrefix: session.connection.networkPrefix,
    });
    endpointStore.adoptInspection(activeInspection);

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("http://localhost:8080/");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(inspectEndpointMock).toHaveBeenCalledWith({
      toriiUrl: "http://localhost:8080",
      chainId: DEFAULT_CHAIN_PRESET.connection.chainId,
      networkPrefix: DEFAULT_CHAIN_PRESET.connection.networkPrefix,
    });
    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(endpointStore.inspection).toEqual(activeInspection);
    expect(endpointStore.writeAllowed).toBe(true);
    expect(endpointStore.error).toBe("");
    expect(wrapper.text()).toContain("metadata unavailable");
    expect(wrapper.get('[role="alert"]').text()).toBe("metadata unavailable");
    expect(
      wrapper.get('[data-testid="endpoint-diagnostics"]').text(),
    ).toContain(t("Read and write"));
  });

  it("keeps active endpoint diagnostics after an unsaved candidate reports unreachable", async () => {
    inspectEndpointMock.mockImplementationOnce(
      (input: EndpointInspectionInput): EndpointInspection => ({
        ...matchingInspection(input),
        observed: null,
        identityStatus: "unreachable",
        accessMode: "offline",
        features: endpointFeatures(false),
        diagnostic: {
          code: "endpoint_unreachable",
          message: "Candidate endpoint is unreachable.",
        },
      }),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const endpointStore = useEndpointStore();
    const activeInspection = matchingInspection({
      toriiUrl: session.connection.toriiUrl,
      chainId: session.connection.chainId,
      networkPrefix: session.connection.networkPrefix,
    });
    endpointStore.adoptInspection(activeInspection);

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("http://localhost:8080/");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(session.connection.toriiUrl).toBe(
      DEFAULT_CHAIN_PRESET.connection.toriiUrl,
    );
    expect(endpointStore.inspection).toEqual(activeInspection);
    expect(endpointStore.writeAllowed).toBe(true);
    expect(endpointStore.error).toBe("");
    expect(wrapper.get('[role="alert"]').text()).toBe(
      "Candidate endpoint is unreachable.",
    );
    expect(
      wrapper.get('[data-testid="endpoint-diagnostics"]').text(),
    ).toContain(t("Read and write"));
  });

  it("ignores an older candidate inspection after a newer candidate is saved", async () => {
    const resolvers = new Map<
      string,
      (inspection: EndpointInspection) => void
    >();
    inspectEndpointMock.mockImplementation(
      (input: EndpointInspectionInput) =>
        new Promise<EndpointInspection>((resolve) => {
          resolvers.set(input.toriiUrl, resolve);
        }),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const endpointStore = useEndpointStore();
    const endpointInput = wrapper.get(
      '[data-testid="settings-torii-url-input"]',
    );

    await endpointInput.setValue("http://candidate-a.example/");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await endpointInput.setValue("http://candidate-b.example/");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    const resolveNewer = resolvers.get("http://candidate-b.example");
    if (!resolveNewer) throw new Error("newer candidate resolver missing");
    resolveNewer(
      matchingInspection({
        toriiUrl: "http://candidate-b.example",
        chainId: session.connection.chainId,
        networkPrefix: session.connection.networkPrefix,
      }),
    );
    await flushPromises();

    expect(session.connection.toriiUrl).toBe("http://candidate-b.example");
    expect(endpointStore.inspection?.toriiUrl).toBe(
      "http://candidate-b.example",
    );

    const resolveOlder = resolvers.get("http://candidate-a.example");
    if (!resolveOlder) throw new Error("older candidate resolver missing");
    resolveOlder(
      matchingInspection({
        toriiUrl: "http://candidate-a.example",
        chainId: session.connection.chainId,
        networkPrefix: session.connection.networkPrefix,
      }),
    );
    await flushPromises();

    expect(session.connection.toriiUrl).toBe("http://candidate-b.example");
    expect(endpointStore.inspection?.toriiUrl).toBe(
      "http://candidate-b.example",
    );
    expect(endpointStore.writeAllowed).toBe(true);
  });

  it("rejects invalid draft endpoints before checking", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await wrapper
      .get('[data-testid="settings-torii-url-input"]')
      .setValue("ftp://example.com");
    await getButtonByText(wrapper, t("Check & Save")).trigger("click");
    await flushPromises();

    expect(inspectEndpointMock).not.toHaveBeenCalled();
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

  it("keeps the unchecked save path in Advanced and one dominant action", () => {
    const wrapper = mountView("http://localhost:8080");
    const advanced = wrapper.get(".settings-advanced");

    expect(advanced.attributes("open")).toBeUndefined();
    expect(
      advanced
        .findAll("button")
        .some((button) => button.text() === t("Save without checking")),
    ).toBe(true);
    expect(wrapper.get(".settings-primary").text()).toBe(t("Check & Save"));
    expect(getButtonByText(wrapper, t("Reset to default")).classes()).toContain(
      "ghost",
    );
  });
});
