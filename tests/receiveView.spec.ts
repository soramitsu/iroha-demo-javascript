import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ReceiveView from "@/views/ReceiveView.vue";
import { useSessionStore } from "@/stores/session";

const ALICE_I105_ACCOUNT_ID = "testuAliceRealI105AccountId";
const BOB_I105_ACCOUNT_ID = "testuBobRealI105AccountId";
const ASSET_DEFINITION_ID = "norito:abcdef0123456789";
const ALICE_OWNER_TAG_HEX = "11".repeat(32);
const BOB_OWNER_TAG_HEX = "22".repeat(32);
const ALICE_DIVERSIFIER_HEX = "33".repeat(32);
const BOB_DIVERSIFIER_HEX = "44".repeat(32);
const qrToStringMock = vi.fn();

vi.mock("qrcode", () => ({
  default: {
    toString: (payload: string, options: unknown) =>
      qrToStringMock(payload, options),
  },
}));

describe("ReceiveView", () => {
  beforeEach(() => {
    qrToStringMock.mockReset();
    window.iroha = {
      deriveConfidentialOwnerTag: vi
        .fn()
        .mockImplementation((privateKeyHex: string) => ({
          ownerTagHex:
            privateKeyHex === "12".repeat(32)
              ? BOB_OWNER_TAG_HEX
              : ALICE_OWNER_TAG_HEX,
        })),
      deriveConfidentialReceiveAddress: vi
        .fn()
        .mockImplementation((privateKeyHex: string) => ({
          ownerTagHex:
            privateKeyHex === "12".repeat(32)
              ? BOB_OWNER_TAG_HEX
              : ALICE_OWNER_TAG_HEX,
          diversifierHex:
            privateKeyHex === "12".repeat(32)
              ? BOB_DIVERSIFIER_HEX
              : ALICE_DIVERSIFIER_HEX,
        })),
    } as unknown as typeof window.iroha;
    setActivePinia(createPinia());
  });

  const mountView = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        toriiUrl: "http://localhost:8080",
        chainId: "chain",
        assetDefinitionId: ASSET_DEFINITION_ID,
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
          privateKeyHex: "cd".repeat(32),
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
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@default",
    });
    await flushPromises();
  };

  it("ignores stale qr render after amount changes", async () => {
    let resolveInitialQr: (value: string) => void = () => {};
    const initialQrDeferred = new Promise<string>((resolve) => {
      resolveInitialQr = resolve;
    });
    qrToStringMock.mockReturnValueOnce(initialQrDeferred);
    qrToStringMock.mockImplementationOnce((payload: string) =>
      Promise.resolve(`<svg><text>${payload}</text></svg>`),
    );

    const wrapper = mountView();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    await wrapper.get('input[type="number"]').setValue("5");
    await flushPromises();

    expect(wrapper.text()).toContain('"amount":5');

    resolveInitialQr(
      `<svg><text>{"accountId":"${ALICE_I105_ACCOUNT_ID}","assetDefinitionId":"${ASSET_DEFINITION_ID}","amount":"0"}</text></svg>`,
    );
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('"amount":5');
    expect(wrapper.text()).not.toContain('"amount":"0"');
  });

  it("ignores stale qr render after active account switch", async () => {
    let resolveAliceQr: (value: string) => void = () => {};
    const aliceQrDeferred = new Promise<string>((resolve) => {
      resolveAliceQr = resolve;
    });
    qrToStringMock.mockReturnValueOnce(aliceQrDeferred);
    qrToStringMock.mockImplementationOnce((payload: string) =>
      Promise.resolve(`<svg><text>${payload}</text></svg>`),
    );

    const wrapper = mountView();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    await switchToBob();
    await flushPromises();

    expect(wrapper.text()).toContain(`"accountId":"${BOB_I105_ACCOUNT_ID}"`);

    resolveAliceQr(
      `<svg><text>{"accountId":"${ALICE_I105_ACCOUNT_ID}","assetDefinitionId":"${ASSET_DEFINITION_ID}","amount":"0"}</text></svg>`,
    );
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain(`"accountId":"${BOB_I105_ACCOUNT_ID}"`);
    expect(wrapper.text()).not.toContain(
      `"accountId":"${ALICE_I105_ACCOUNT_ID}"`,
    );
  });

  it("renders the receive qr with scan-friendly contrast colors", async () => {
    qrToStringMock.mockResolvedValueOnce("<svg></svg>");

    const wrapper = mountView();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(qrToStringMock).toHaveBeenCalledWith(
      JSON.stringify({
        schema: "iroha-confidential-payment-address/v2",
        accountId: ALICE_I105_ACCOUNT_ID,
        chainId: "chain",
        assetDefinitionId: ASSET_DEFINITION_ID,
        amount: "0",
        shieldedOwnerTagHex: ALICE_OWNER_TAG_HEX,
        shieldedDiversifierHex: ALICE_DIVERSIFIER_HEX,
        shieldedAddressIndex: 0,
        recoveryHint: "encrypted-note-envelope-required",
      }),
      expect.objectContaining({
        type: "svg",
        width: 240,
        color: {
          dark: "#14202b",
          light: "#ffffff",
        },
      }),
    );
  });
});
