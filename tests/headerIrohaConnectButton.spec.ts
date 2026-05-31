import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HeaderIrohaConnectButton from "@/components/HeaderIrohaConnectButton.vue";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { buildIrohaConnectTokenProtocol } from "@/utils/irohaConnect";
import {
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
  encryptConnectEnvelope,
  generateWalletConnectKeyPair,
  hexToBytes,
} from "@/utils/soraswapConnectWire";

const CONTRACT_CALL_SIGN_SCHEMA =
  "uranai.irohaconnect.contract-call-signature.v1";
const EXAMPLE_ACCOUNT_ID = "testu1connected";
const SECOND_ACCOUNT_ID = "testu1switched";
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
      signatureB64: Buffer.from("signature").toString("base64"),
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

  const emitBinaryMessage = (socket: FakeWebSocket, bytes: Uint8Array) => {
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength,
        ),
      }),
    );
  };

  const encodeContractSignRequestFrame = (
    appKey: Uint8Array,
    input: {
      sequence?: number;
      requestId: string;
      accountId?: string;
      signingMessageB64: string;
    },
  ) => {
    const sequence = input.sequence ?? 2;
    const payload = JSON.stringify({
      schema: CONTRACT_CALL_SIGN_SCHEMA,
      kind: "contract_call_signature_request",
      requestId: input.requestId,
      accountId: input.accountId,
      signingMessageB64: input.signingMessageB64,
    });
    const bytes = Buffer.from(payload, "utf8");
    const aead = encryptConnectEnvelope(
      appKey,
      VALID_CONNECT_SID,
      "app_to_wallet",
      sequence,
      {
        type: "sign_request_raw",
        domainTag: "uranai.irohaconnect.contract-call-signature",
        bytesHex: bytes.toString("hex"),
        bytesBase64: bytes.toString("base64"),
        bytesLength: bytes.length,
      },
    );
    return encodeCiphertextConnectFrame({
      sid: VALID_CONNECT_SID,
      direction: "app_to_wallet",
      seq: sequence,
      aead,
    });
  };

  const decodeLatestWalletEnvelope = (
    socket: FakeWebSocket,
    walletKey: Uint8Array,
  ) => {
    const responseFrame = decodeConnectFrame(socket.sent.at(-1) as Uint8Array);
    expect(responseFrame.kind).toBe("ciphertext");
    if (!responseFrame.ciphertext) {
      throw new Error("Expected response ciphertext frame.");
    }
    return decryptConnectEnvelope(
      walletKey,
      VALID_CONNECT_SID,
      responseFrame.direction,
      responseFrame.seq,
      hexToBytes(responseFrame.ciphertext.aeadHex),
    );
  };

  const approveConnection = async (wrapper: ReturnType<typeof mount>) => {
    const relayNode = "https://relay.example";
    const walletToken = "wallet-token-1";
    const appKeyPair = generateWalletConnectKeyPair();
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
    expect(socket.sent).toHaveLength(0);
    emitBinaryMessage(
      socket,
      encodeControlConnectFrame({
        sid: VALID_CONNECT_SID,
        direction: "app_to_wallet",
        seq: 1,
        control: {
          type: "open",
          appPublicKeyHex: appKeyPair.publicKeyHex,
          constraints: {
            chainId: "chain-a",
          },
          appMeta: null,
          permissions: {
            methods: ["sign"],
            events: [],
            resources: null,
          },
        },
      }),
    );
    await flushPromises();
    expect(socket.sent).toHaveLength(1);
    const approvalFrame = decodeConnectFrame(socket.sent[0] as Uint8Array);
    if (approvalFrame.control?.type !== "approve") {
      throw new Error("Expected IrohaConnect approval control frame.");
    }
    const keys = deriveConnectDirectionKeys(
      {
        sid: VALID_CONNECT_SID,
        sidBytesHex: "",
        nonceHex: "",
        privateKeyHex: appKeyPair.privateKeyHex,
        publicKeyHex: appKeyPair.publicKeyHex,
        walletUri: "",
        appUri: "",
        wsUrl: "",
        createdAt: 0,
      },
      approvalFrame.control.walletPublicKeyHex,
    );
    signIrohaConnectMessageMock.mockClear();
    return { socket, approvalFrame, keys };
  };

  it("opens a connection approval modal before sending the approval frame", async () => {
    const wrapper = mountComponent();

    const { approvalFrame } = await approveConnection(wrapper);

    expect(approvalFrame.kind).toBe("control");
    expect(approvalFrame.direction).toBe("wallet_to_app");
    expect(approvalFrame.seq).toBe(1);
    expect(approvalFrame.control).toMatchObject({
      type: "approve",
      accountId: EXAMPLE_ACCOUNT_ID,
    });
    expect(wrapper.text()).toContain(t("IrohaConnect approved."));
  });

  it("does not sign an IrohaConnect transaction request until the user approves it", async () => {
    const wrapper = mountComponent();
    const { socket, keys } = await approveConnection(wrapper);
    const signingMessageB64 = Buffer.from("transfer 10 XOR").toString("base64");

    emitBinaryMessage(
      socket,
      encodeContractSignRequestFrame(keys.appKey, {
        requestId: "request-1",
        accountId: EXAMPLE_ACCOUNT_ID,
        signingMessageB64,
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
    expect(
      decodeLatestWalletEnvelope(socket, keys.walletKey).payload.type,
    ).toBe("sign_result_ok");
  });

  it("rejects an IrohaConnect transaction request without signing", async () => {
    const wrapper = mountComponent();
    const { socket, keys } = await approveConnection(wrapper);

    emitBinaryMessage(
      socket,
      encodeContractSignRequestFrame(keys.appKey, {
        requestId: "request-2",
        accountId: EXAMPLE_ACCOUNT_ID,
        signingMessageB64: Buffer.from("stake 5 XOR").toString("base64"),
      }),
    );
    await flushPromises();

    await getButtonByText(wrapper, t("Reject")).trigger("click");
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    const envelope = decodeLatestWalletEnvelope(socket, keys.walletKey);
    expect(envelope.payload).toMatchObject({
      type: "sign_result_err",
      code: "signature_rejected",
      message: "request-2: Rejected by user.",
    });
  });

  it("signs encrypted IrohaConnect requests with the approved account after wallet switching", async () => {
    const wrapper = mountComponent();
    const { socket, keys } = await approveConnection(wrapper);
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: SECOND_ACCOUNT_ID,
          publicKeyHex: "cd".repeat(32),
          privateKeyHex: "",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: SECOND_ACCOUNT_ID,
    });
    const signingMessageB64 = Buffer.from("transfer after switch").toString(
      "base64",
    );

    emitBinaryMessage(
      socket,
      encodeContractSignRequestFrame(keys.appKey, {
        requestId: "request-3",
        accountId: EXAMPLE_ACCOUNT_ID,
        signingMessageB64,
      }),
    );
    await flushPromises();

    await getButtonByText(wrapper, t("Approve and sign")).trigger("click");
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith({
      accountId: EXAMPLE_ACCOUNT_ID,
      signingMessageB64,
    });
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: SECOND_ACCOUNT_ID,
      }),
    );
  });
});
