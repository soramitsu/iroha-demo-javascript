import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import ReceiveView from "@/views/ReceiveView.vue";
import { useSessionStore } from "@/stores/session";

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
        assetDefinitionId: "xor#wonderland",
        networkPrefix: 42,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: "alice@wonderland",
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "cd".repeat(32),
        },
      ],
      activeAccountId: "alice@wonderland",
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
          domain: "wonderland",
          accountId: "bob@wonderland",
          publicKeyHex: "ef".repeat(32),
          privateKeyHex: "12".repeat(32),
        },
      ],
      activeAccountId: "bob@wonderland",
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
      '<svg><text>{"accountId":"alice@wonderland","assetDefinitionId":"xor#wonderland","amount":"0"}</text></svg>',
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

    expect(wrapper.text()).toContain('"accountId":"bob@wonderland"');

    resolveAliceQr(
      '<svg><text>{"accountId":"alice@wonderland","assetDefinitionId":"xor#wonderland","amount":"0"}</text></svg>',
    );
    await flushPromises();
    await flushPromises();

    expect(wrapper.text()).toContain('"accountId":"bob@wonderland"');
    expect(wrapper.text()).not.toContain('"accountId":"alice@wonderland"');
  });

  it("renders the receive qr with scan-friendly contrast colors", async () => {
    qrToStringMock.mockResolvedValueOnce("<svg></svg>");

    const wrapper = mountView();

    await wrapper.get("button").trigger("click");
    await flushPromises();

    expect(qrToStringMock).toHaveBeenCalledWith(
      JSON.stringify({
        accountId: "alice@wonderland",
        assetDefinitionId: "xor#wonderland",
        amount: "0",
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
