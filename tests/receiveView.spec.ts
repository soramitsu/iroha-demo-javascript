import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ReceiveView from "@/views/ReceiveView.vue";
import { useSessionStore } from "@/stores/session";
import {
  encodeConfidentialPaymentAddress,
  type ConfidentialPaymentAddressPayload,
} from "@/utils/confidentialPaymentAddress";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const BOB_I105_ACCOUNT_ID = "testuBobRealI105AccountId";
const ALICE_RECEIVE_KEY_ID = "AQEBAQEBAQEBAQEBAQEBAQEB";
const BOB_RECEIVE_KEY_ID = "AgICAgICAgICAgICAgICAgIC";
const qrToDataUrlMock = vi.fn();
const createConfidentialPaymentAddressMock = vi.fn();

vi.mock("qrcode", () => ({
  default: {
    toDataURL: (payload: string, options: unknown) =>
      qrToDataUrlMock(payload, options),
  },
}));

vi.mock("@/services/iroha", () => ({
  createConfidentialPaymentAddress: (input: unknown) =>
    createConfidentialPaymentAddressMock(input),
}));

describe("ReceiveView", () => {
  beforeEach(() => {
    qrToDataUrlMock.mockReset();
    createConfidentialPaymentAddressMock.mockReset();
    qrToDataUrlMock.mockResolvedValue("data:image/png;base64,cXI=");
    setActivePinia(createPinia());
  });

  afterEach(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: undefined,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined,
    });
  });

  const mountView = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        networkPrefix: 369,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "default",
          accountId: "alice@default",
          i105AccountId: ALICE_I105_ACCOUNT_ID,
          i105DefaultAccountId: ALICE_I105_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "alice@default",
    });
    return mount(ReceiveView, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const switchToBob = async () => {
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "default",
          accountId: "bob@default",
          i105AccountId: BOB_I105_ACCOUNT_ID,
          i105DefaultAccountId: BOB_I105_ACCOUNT_ID,
          publicKeyHex: "ef".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: "bob@default",
    });
    await flushPromises();
  };

  it("ignores stale qr render after active account switch", async () => {
    let resolveAliceAddress: (value: unknown) => void = () => {};
    const bobAddress: ConfidentialPaymentAddressPayload = {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: BOB_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "A".repeat(43),
      shieldedOwnerTagHex: "22".repeat(32),
      shieldedDiversifierHex: "44".repeat(32),
      recoveryHint: "one-time-receive-key",
    };
    createConfidentialPaymentAddressMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveAliceAddress = resolve;
      }),
    );
    createConfidentialPaymentAddressMock.mockResolvedValueOnce(bobAddress);
    const wrapper = mountView();

    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(createConfidentialPaymentAddressMock).toHaveBeenLastCalledWith({
      accountId: BOB_I105_ACCOUNT_ID,
      networkPrefix: 369,
    });
    expect(
      createConfidentialPaymentAddressMock.mock.calls.at(-1)?.[0],
    ).not.toHaveProperty("privateKeyHex");
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      encodeConfidentialPaymentAddress(bobAddress),
    );

    resolveAliceAddress({
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    });
    await flushPromises();
    await flushPromises();

    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      encodeConfidentialPaymentAddress(bobAddress),
    );
  });

  it("renders the receive qr with scan-friendly contrast colors", async () => {
    const paymentAddress: ConfidentialPaymentAddressPayload = {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    };
    createConfidentialPaymentAddressMock.mockResolvedValueOnce(paymentAddress);
    const wrapper = mountView();

    await flushPromises();

    expect(qrToDataUrlMock).toHaveBeenCalledWith(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v3",
        receiveKeyId: ALICE_RECEIVE_KEY_ID,
        receivePublicKeyBase64Url: "E".repeat(43),
        shieldedOwnerTagHex: "11".repeat(32),
        shieldedDiversifierHex: "33".repeat(32),
        recoveryHint: "one-time-receive-key",
      }),
      expect.objectContaining({
        type: "image/png",
        width: 240,
        color: {
          dark: "#14202b",
          light: "#ffffff",
        },
      }),
    );
    expect((wrapper.get("textarea").element as HTMLTextAreaElement).value).toBe(
      encodeConfidentialPaymentAddress(paymentAddress),
    );
    expect(wrapper.get(".qr img").attributes("src")).toBe(
      "data:image/png;base64,cXI=",
    );
  });

  it("keeps the QR and its actions primary while details stay disclosed", async () => {
    createConfidentialPaymentAddressMock.mockResolvedValue({
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    });
    const wrapper = mountView();
    await flushPromises();

    const workspace = wrapper.get(".receive-qr-workspace");
    expect(workspace.find(".qr-panel").exists()).toBe(true);
    expect(workspace.findAll(".receive-actions button")).toHaveLength(2);
    expect(wrapper.get(".receive-address-details").attributes("open")).toBe(
      undefined,
    );
    expect(wrapper.get(".receive-wallet-details").attributes("open")).toBe(
      undefined,
    );
  });

  it("requests a fresh confidential payment address for the active account", async () => {
    createConfidentialPaymentAddressMock.mockResolvedValue({
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    });
    mountView();

    await flushPromises();

    expect(createConfidentialPaymentAddressMock).toHaveBeenCalledWith({
      accountId: ALICE_I105_ACCOUNT_ID,
      networkPrefix: 369,
    });
    expect(
      createConfidentialPaymentAddressMock.mock.calls[0]?.[0],
    ).not.toHaveProperty("privateKeyHex");
  });

  it("shares the rendered QR image when native sharing supports files", async () => {
    const shareMock = vi.fn();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      blob: async () => new Blob(["png"], { type: "image/png" }),
    } as Response);
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: vi.fn(() => true),
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: shareMock,
    });
    createConfidentialPaymentAddressMock.mockResolvedValue({
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    });
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Share QR")
      ?.trigger("click");
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledWith("data:image/png;base64,cXI=");
    expect(shareMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Receive",
        files: [expect.any(File)],
      }),
    );
    expect(wrapper.text()).toContain("QR shared.");
  });

  it("copies the private payment address as text", async () => {
    const writeTextMock = vi.fn();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: writeTextMock,
      },
    });
    const paymentAddress: ConfidentialPaymentAddressPayload = {
      schema: "iroha-confidential-payment-address/v3",
      receiveKeyId: ALICE_RECEIVE_KEY_ID,
      receivePublicKeyBase64Url: "E".repeat(43),
      shieldedOwnerTagHex: "11".repeat(32),
      shieldedDiversifierHex: "33".repeat(32),
      recoveryHint: "one-time-receive-key",
    };
    createConfidentialPaymentAddressMock.mockResolvedValue(paymentAddress);
    const wrapper = mountView();
    await flushPromises();

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Copy address")
      ?.trigger("click");
    await flushPromises();

    expect(writeTextMock).toHaveBeenCalledWith(
      encodeConfidentialPaymentAddress(paymentAddress),
    );
    expect(wrapper.text()).toContain("Private address copied.");
  });
});
