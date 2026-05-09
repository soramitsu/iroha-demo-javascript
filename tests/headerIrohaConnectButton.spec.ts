import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HeaderIrohaConnectButton from "@/components/HeaderIrohaConnectButton.vue";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import {
  buildIrohaConnectTokenProtocol,
  decodeIrohaConnectFrame,
  encodeIrohaConnectCiphertextFrame,
} from "@/utils/irohaConnect";

const CONTRACT_CALL_SIGN_SCHEMA =
  "uranai.irohaconnect.contract-call-signature.v1";
const EXAMPLE_ACCOUNT_ID = "testu1connected";
const VALID_CONNECT_SID = Buffer.from(new Uint8Array(32).fill(0xce)).toString(
  "base64url",
);
const signIrohaConnectMessageMock = vi.fn();
const buildUranaiPrivateTradeProofMock = vi.fn();
type QrDecodeHandler = (payload: string) => void;
let connectQrDecodeHandler: QrDecodeHandler | null = null;
const t = (key: string) => translate("en-US", key);

type FakeWebSocketListener = {
  callback: (event: Event | MessageEvent) => void;
  once: boolean;
};

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly sent: unknown[] = [];
  readonly listeners = new Map<string, FakeWebSocketListener[]>();
  binaryType: BinaryType = "blob";
  readyState = FakeWebSocket.CONNECTING;
  closeCode: number | null = null;
  closeReason = "";

  constructor(
    readonly url: string | URL,
    readonly protocols?: string | string[],
  ) {
    FakeWebSocket.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean,
  ) {
    const callback =
      typeof listener === "function"
        ? listener
        : (event: Event | MessageEvent) => listener.handleEvent(event);
    const once = typeof options === "object" && Boolean(options.once);
    const current = this.listeners.get(type) ?? [];
    current.push({ callback, once });
    this.listeners.set(type, current);
  }

  send(data: unknown) {
    this.sent.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = FakeWebSocket.CLOSED;
    this.closeCode = code ?? null;
    this.closeReason = reason ?? "";
  }

  emit(type: string, event: Event | MessageEvent = new Event(type)) {
    if (type === "open") {
      this.readyState = FakeWebSocket.OPEN;
    }
    const current = this.listeners.get(type) ?? [];
    for (const entry of current) {
      entry.callback(event);
    }
    this.listeners.set(
      type,
      current.filter((entry) => !entry.once),
    );
  }
}

vi.mock("@/services/iroha", () => ({
  buildUranaiPrivateTradeProof: (input: unknown) =>
    buildUranaiPrivateTradeProofMock(input),
  signIrohaConnectMessage: (input: unknown) =>
    signIrohaConnectMessageMock(input),
}));

vi.mock("@/composables/useQrScanner", async () => {
  const { ref } = await vi.importActual<typeof import("vue")>("vue");
  return {
    useQrScanner: (onDecode: QrDecodeHandler) => {
      connectQrDecodeHandler = onDecode;
      return {
        scanning: ref(false),
        screenScanning: ref(false),
        message: ref(""),
        videoRef: ref<HTMLVideoElement | null>(null),
        fileInputRef: ref<HTMLInputElement | null>(null),
        start: vi.fn(),
        stop: vi.fn(),
        openFilePicker: vi.fn(),
        decodeScreen: vi.fn(),
        decodeFile: vi.fn(),
      };
    },
  };
});

describe("HeaderIrohaConnectButton", () => {
  beforeEach(() => {
    connectQrDecodeHandler = null;
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    signIrohaConnectMessageMock.mockReset().mockResolvedValue({
      publicKeyHex: "ab".repeat(32),
      signatureB64: "signature",
    });
    buildUranaiPrivateTradeProofMock.mockReset();
    setActivePinia(createPinia());
  });

  const mountComponent = () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: EXAMPLE_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          privateKeyHex: "",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: EXAMPLE_ACCOUNT_ID,
    });
    return mount(HeaderIrohaConnectButton, {
      global: {
        plugins: [pinia],
      },
    });
  };

  const scanConnectQr = async (payload: string) => {
    if (!connectQrDecodeHandler) {
      throw new Error("IrohaConnect QR decode handler was not registered.");
    }
    connectQrDecodeHandler(payload);
    await flushPromises();
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

  const approveConnection = async (wrapper: ReturnType<typeof mount>) => {
    const relayNode = "https://relay.example";
    const walletToken = "wallet-token-1";
    await scanConnectQr(
      `iroha://connect?sid=${VALID_CONNECT_SID}&chain_id=chain-a&node=${encodeURIComponent(
        relayNode,
      )}&v=1&role=wallet&token=${encodeURIComponent(walletToken)}`,
    );

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(wrapper.find(".header-connect-modal-backdrop").exists()).toBe(true);
    await getButtonByText(wrapper, t("Approve connection")).trigger("click");
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    expect(String(socket.url)).toBe(
      `wss://relay.example/v1/connect/ws?sid=${VALID_CONNECT_SID}&role=wallet`,
    );
    expect(socket.protocols).toEqual([
      buildIrohaConnectTokenProtocol(walletToken),
    ]);
    socket.emit("open");
    await flushPromises();
    expect(socket.sent).toHaveLength(1);
    return socket;
  };

  it("opens a connection approval modal before sending the approval frame", async () => {
    const wrapper = mountComponent();

    const socket = await approveConnection(wrapper);
    const approvalFrame = decodeIrohaConnectFrame(socket.sent[0] as Uint8Array);

    expect(approvalFrame.kind).toBe("other");
    expect(approvalFrame.direction).toBe("wallet-to-app");
    expect(approvalFrame.sequence).toBe(1);
    expect(wrapper.text()).toContain(t("IrohaConnect approved."));
  });

  it("does not sign an IrohaConnect transaction request until the user approves it", async () => {
    const wrapper = mountComponent();
    const socket = await approveConnection(wrapper);
    const signingMessageB64 = Buffer.from("transfer 10 XOR").toString("base64");

    const requestFrame = encodeIrohaConnectCiphertextFrame({
      sid: VALID_CONNECT_SID,
      direction: "app-to-wallet",
      sequence: 2,
      payload: JSON.stringify({
        schema: CONTRACT_CALL_SIGN_SCHEMA,
        kind: "contract_call_signature_request",
        requestId: "request-1",
        accountId: EXAMPLE_ACCOUNT_ID,
        signingMessageB64,
      }),
    });
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: requestFrame.buffer,
      }),
    );
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain(t("Approve transaction signature?"));
    expect(wrapper.text()).toContain("transfer 10 XOR");

    await getButtonByText(wrapper, t("Approve and sign")).trigger("click");
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith({
      accountId: EXAMPLE_ACCOUNT_ID,
      signingMessageB64,
    });
    const responseFrame = decodeIrohaConnectFrame(
      socket.sent.at(-1) as Uint8Array,
    );
    expect(responseFrame.kind).toBe("ciphertext");
    if (responseFrame.kind !== "ciphertext") {
      throw new Error("Expected response ciphertext frame.");
    }
    expect(new TextDecoder().decode(responseFrame.payload)).toContain(
      "contract_call_signature_response",
    );
  });

  it("rejects an IrohaConnect transaction request without signing", async () => {
    const wrapper = mountComponent();
    const socket = await approveConnection(wrapper);

    const requestFrame = encodeIrohaConnectCiphertextFrame({
      sid: VALID_CONNECT_SID,
      direction: "app-to-wallet",
      sequence: 2,
      payload: JSON.stringify({
        schema: CONTRACT_CALL_SIGN_SCHEMA,
        kind: "contract_call_signature_request",
        requestId: "request-2",
        accountId: EXAMPLE_ACCOUNT_ID,
        signingMessageB64: Buffer.from("stake 5 XOR").toString("base64"),
      }),
    });
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: requestFrame.buffer,
      }),
    );
    await flushPromises();

    await getButtonByText(wrapper, t("Reject")).trigger("click");
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    const responseFrame = decodeIrohaConnectFrame(
      socket.sent.at(-1) as Uint8Array,
    );
    expect(responseFrame.kind).toBe("ciphertext");
    if (responseFrame.kind !== "ciphertext") {
      throw new Error("Expected rejection ciphertext frame.");
    }
    const payload = new TextDecoder().decode(responseFrame.payload);
    expect(payload).toContain("contract_call_signature_reject");
    expect(payload).toContain("Rejected by user.");
  });
});
