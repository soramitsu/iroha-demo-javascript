import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import HeaderIrohaConnectButton from "@/components/HeaderIrohaConnectButton.vue";
import { AccountAddress } from "@iroha/iroha-js/address";
import { NetworkId } from "@iroha/iroha-js/browser";
import { createConnectSessionPreview } from "@iroha/iroha-js/connect-browser";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { translate } from "@/i18n/messages";
import { useSessionStore } from "@/stores/session";
import { buildIrohaConnectTokenProtocol } from "@/utils/irohaConnect";
import {
  IrohaConnectBoundary,
  type IrohaConnectWalletContext,
} from "../electron/irohaConnectBoundary";
import {
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
  encodeServerEventConnectFrame,
  encryptConnectEnvelope,
  generateConnectWalletKeyPair,
  hexToBytes,
  type ConnectPermissions,
} from "@/utils/soraswapConnectWire";
import {
  TEST_TAIRA_NETWORK_ID as TAIRA_NETWORK_ID,
  matchedNetworkIdentity,
} from "./helpers/networkIdentityFixture";

const CONTRACT_CALL_SIGN_SCHEMA =
  "uranai.irohaconnect.contract-call-signature.v1";
const RAW_DOMAIN = "example:signing:v1";
const EXAMPLE_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from(
    Buffer.from(
      "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      "hex",
    ),
  ),
}).toI105(TAIRA_CHAIN_PRESET.connection.networkPrefix);
const SECOND_ACCOUNT_ID = AccountAddress.fromAccount({
  publicKey: Uint8Array.from(
    Buffer.from(
      "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
      "hex",
    ),
  ),
}).toI105(TAIRA_CHAIN_PRESET.connection.networkPrefix);
const CONNECT_APP_KEY_PAIR = generateConnectWalletKeyPair();
const CONNECT_NONCE = new Uint8Array(16).fill(0x42);
const CONNECT_NETWORK_ID = NetworkId.parse(TAIRA_NETWORK_ID);
const CONNECT_PREVIEW = createConnectSessionPreview({
  networkId: CONNECT_NETWORK_ID,
  node: TAIRA_CHAIN_PRESET.connection.toriiUrl,
  nonce: CONNECT_NONCE,
  appKeyPair: {
    publicKey: hexToBytes(CONNECT_APP_KEY_PAIR.publicKeyHex),
    privateKey: hexToBytes(CONNECT_APP_KEY_PAIR.privateKeyHex),
  },
});
const VALID_CONNECT_SID = CONNECT_PREVIEW.sidBase64Url;
const VALID_WALLET_TOKEN = Buffer.alloc(32, 0xa1).toString("base64url");
const VALID_RELAY_TOKEN = Buffer.alloc(32, 0xa2).toString("base64url");
const VALID_CONNECT_WALLET_URI = `${CONNECT_PREVIEW.walletUri}&token=${VALID_WALLET_TOKEN}&relay=${VALID_RELAY_TOKEN}`;
const FOREIGN_NETWORK_ID = NetworkId.fromBytes(
  Uint8Array.from({ length: 32 }, (_, index) => (index === 31 ? 0x13 : 0x11)),
);
const buildConnectWalletUri = (input: {
  networkId?: NetworkId;
  node?: string;
}) => {
  const preview = createConnectSessionPreview({
    networkId: input.networkId ?? CONNECT_NETWORK_ID,
    node: input.node ?? TAIRA_CHAIN_PRESET.connection.toriiUrl,
    nonce: CONNECT_NONCE,
    appKeyPair: {
      publicKey: hexToBytes(CONNECT_APP_KEY_PAIR.publicKeyHex),
      privateKey: hexToBytes(CONNECT_APP_KEY_PAIR.privateKeyHex),
    },
  });
  return `${preview.walletUri}&token=${VALID_WALLET_TOKEN}&relay=${VALID_RELAY_TOKEN}`;
};
const signIrohaConnectMessageMock = vi.fn();
const inspectEndpointMock = vi.fn();
let testIrohaConnectBoundary: IrohaConnectBoundary;
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
  inspectEndpoint: (input: unknown) => inspectEndpointMock(input),
  setIrohaConnectContext: (input: IrohaConnectWalletContext) =>
    testIrohaConnectBoundary.setContext(input),
  resetIrohaConnectBoundary: () => testIrohaConnectBoundary.reset(),
  prepareIrohaConnectSession: (
    input: Parameters<IrohaConnectBoundary["prepareSession"]>[0],
  ) => testIrohaConnectBoundary.prepareSession(input),
  approveIrohaConnectSession: (
    input: Parameters<IrohaConnectBoundary["approveSession"]>[0],
  ) => testIrohaConnectBoundary.approveSession(input),
  processIrohaConnectFrame: (
    input: Parameters<IrohaConnectBoundary["processFrame"]>[0],
  ) => testIrohaConnectBoundary.processFrame(input),
  approveIrohaConnectRequest: (
    input: Parameters<IrohaConnectBoundary["approveRequest"]>[0],
  ) => testIrohaConnectBoundary.approveRequest(input),
  rejectIrohaConnectRequest: (
    input: Parameters<IrohaConnectBoundary["rejectRequest"]>[0],
  ) => testIrohaConnectBoundary.rejectRequest(input),
  closeIrohaConnectSession: (input: { sessionToken: string }) =>
    testIrohaConnectBoundary.closeSession(input.sessionToken),
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
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    connectQrDecodeHandler = null;
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    signIrohaConnectMessageMock.mockReset().mockResolvedValue({
      publicKeyHex: "ab".repeat(32),
      signatureB64: Buffer.alloc(64, 0x5a).toString("base64"),
      signingAlgorithm: "ed25519",
      algorithmCode: 0,
      algorithmLabel: "Ed25519",
    });
    testIrohaConnectBoundary = new IrohaConnectBoundary({
      assertContext: async (context) => ({ ...context }),
      authorize: async () => true,
      sign: async (context, message) => {
        const result = (await signIrohaConnectMessageMock({
          ...context,
          signingMessageB64: Buffer.from(message).toString("base64"),
        })) as {
          signatureB64: string;
          algorithmCode?: number;
          algorithmLabel?: string;
        };
        return {
          algorithmCode: result.algorithmCode ?? 0,
          algorithmLabel: result.algorithmLabel || "Ed25519",
          signatureHex: Buffer.from(result.signatureB64, "base64").toString(
            "hex",
          ),
          signatureBase64: result.signatureB64,
        };
      },
    });
    inspectEndpointMock
      .mockReset()
      .mockImplementation(
        (input: {
          toriiUrl: string;
          chainId: string;
          networkPrefix: number;
        }) => ({
          schema: "iroha.wallet.endpoint-inspection.v1",
          toriiUrl: input.toriiUrl,
          expected: input,
          observed: {
            chainId: input.chainId,
            networkPrefix: input.networkPrefix,
            networkId: TAIRA_NETWORK_ID,
          },
          identityStatus: "matched",
          accessMode: "read-write",
          checkedAtMs: 1,
          evidence: [],
          networkIdentity: matchedNetworkIdentity(),
          features: {
            irohaConnectSessions: {
              supported: true,
              source: "openapi",
              requiredOperations: ["POST /v1/connect/session"],
              missingOperations: [],
            },
          },
          diagnostic: {
            code: "endpoint_identity_matched",
            message: "Endpoint identity matches the configured network.",
          },
        }),
      );
    setActivePinia(createPinia());
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.unstubAllGlobals();
  });

  const mountComponent = (
    connection: Partial<(typeof TAIRA_CHAIN_PRESET)["connection"]> = {},
  ) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        ...connection,
      },
      accounts: [
        {
          displayName: "Alice",
          domain: "wonderland",
          accountId: EXAMPLE_ACCOUNT_ID,
          publicKeyHex: "ab".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: EXAMPLE_ACCOUNT_ID,
    });
    const wrapper = mount(HeaderIrohaConnectButton, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
  };

  const scanConnectQr = async (payload: string) => {
    if (!connectQrDecodeHandler) {
      throw new Error("IrohaConnect QR decode handler was not registered.");
    }
    connectQrDecodeHandler(payload);
    await flushPromises();
  };

  const getOpenDialog = () =>
    document.body.querySelector<HTMLDialogElement>("dialog.ui-dialog[open]");

  const getDialogButtonByText = (label: string) => {
    const button = Array.from(
      getOpenDialog()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((node) => node.textContent?.trim() === label);
    if (!button) {
      throw new Error(`Dialog button not found: ${label}`);
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

  const encodeSignRequestFrame = (
    appKey: Uint8Array,
    input: {
      sequence?: number;
      signingMessageB64: string;
      type?: "sign_request_raw" | "sign_request_tx";
      domainTag?: string;
    },
  ) => {
    const sequence = input.sequence ?? 2;
    const request =
      input.type === "sign_request_tx"
        ? {
            type: "sign_request_tx" as const,
            txBytesHex: Buffer.from(input.signingMessageB64, "base64").toString(
              "hex",
            ),
            txBytesBase64: input.signingMessageB64,
            txBytesLength: Buffer.from(input.signingMessageB64, "base64")
              .length,
          }
        : {
            type: "sign_request_raw" as const,
            domainTag: input.domainTag ?? RAW_DOMAIN,
            bytesHex: Buffer.from(input.signingMessageB64, "base64").toString(
              "hex",
            ),
            bytesBase64: input.signingMessageB64,
            bytesLength: Buffer.from(input.signingMessageB64, "base64").length,
          };
    const aead = encryptConnectEnvelope(
      appKey,
      VALID_CONNECT_SID,
      "app_to_wallet",
      sequence,
      request,
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

  const approveConnection = async (
    permissions: ConnectPermissions | null = {
      methods: ["sign_raw"],
      events: [],
      resources: [RAW_DOMAIN],
    },
  ) => {
    const walletToken = VALID_WALLET_TOKEN;
    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(getOpenDialog()).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="header-connect-reject"]'),
    );
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    expect(FakeWebSocket.instances).toHaveLength(1);

    const socket = FakeWebSocket.instances[0];
    expect(String(socket.url)).toBe(
      `wss://taira.sora.org/v1/connect/ws?sid=${VALID_CONNECT_SID}&role=wallet`,
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
          appPublicKeyHex: CONNECT_APP_KEY_PAIR.publicKeyHex,
          constraints: {
            networkId: TAIRA_NETWORK_ID,
          },
          appMeta: null,
          permissions,
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
        privateKeyHex: CONNECT_APP_KEY_PAIR.privateKeyHex,
        publicKeyHex: CONNECT_APP_KEY_PAIR.publicKeyHex,
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

    const { approvalFrame } = await approveConnection();

    expect(approvalFrame.kind).toBe("control");
    expect(approvalFrame.direction).toBe("wallet_to_app");
    expect(approvalFrame.seq).toBe(1);
    expect(approvalFrame.control).toMatchObject({
      type: "approve",
      accountId: EXAMPLE_ACCOUNT_ID,
    });
    expect(wrapper.text()).toContain(t("IrohaConnect approved."));
  });

  it("closes when the first app frame is not Open sequence 1", async () => {
    const wrapper = mountComponent();
    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");
    emitBinaryMessage(
      socket,
      encodeControlConnectFrame({
        sid: VALID_CONNECT_SID,
        direction: "app_to_wallet",
        seq: 1,
        control: { type: "ping", nonce: 9 },
      }),
    );
    await flushPromises();

    expect(socket.sent).toHaveLength(0);
    expect(socket.closeCode).toBe(1000);
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("first app frame must be Open");
  });

  it("closes on an out-of-order app frame after approval", async () => {
    const wrapper = mountComponent();
    const { socket } = await approveConnection();
    emitBinaryMessage(
      socket,
      encodeControlConnectFrame({
        sid: VALID_CONNECT_SID,
        direction: "app_to_wallet",
        seq: 3,
        control: { type: "ping", nonce: 10 },
      }),
    );
    await flushPromises();

    expect(socket.closeCode).toBe(1000);
    expect(wrapper.text()).toContain("app sent sequence 3; expected 2");
  });

  it("rejects a duplicate Open while the first approval signature is pending", async () => {
    let resolveSignature!: (value: {
      publicKeyHex: string;
      signatureB64: string;
      signingAlgorithm: string;
      algorithmCode: number;
      algorithmLabel: string;
    }) => void;
    signIrohaConnectMessageMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignature = resolve;
      }),
    );
    mountComponent();
    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");
    const firstAppKey = CONNECT_APP_KEY_PAIR;
    const secondAppKey = generateConnectWalletKeyPair();
    for (const [index, appKey] of [firstAppKey, secondAppKey].entries()) {
      emitBinaryMessage(
        socket,
        encodeControlConnectFrame({
          sid: VALID_CONNECT_SID,
          direction: "app_to_wallet",
          seq: index + 1,
          control: {
            type: "open",
            appPublicKeyHex: appKey.publicKeyHex,
            constraints: {
              networkId: TAIRA_NETWORK_ID,
            },
            appMeta: null,
            permissions: {
              methods: ["sign_raw"],
              events: [],
              resources: [RAW_DOMAIN],
            },
          },
        }),
      );
      await flushPromises();
    }

    expect(signIrohaConnectMessageMock).toHaveBeenCalledTimes(1);
    expect(socket.closeCode).toBe(1000);
    expect(socket.sent).toHaveLength(0);
    resolveSignature({
      publicKeyHex: "ab".repeat(32),
      signatureB64: Buffer.alloc(64, 0x5a).toString("base64"),
      signingAlgorithm: "ed25519",
      algorithmCode: 0,
      algorithmLabel: "Ed25519",
    });
    await flushPromises();
    expect(socket.sent).toHaveLength(0);
  });

  it.each([
    {
      label: "NetworkId",
      uri: buildConnectWalletUri({ networkId: FOREIGN_NETWORK_ID }),
      connection: {},
      error: "different NetworkId",
    },
    {
      label: "endpoint",
      uri: buildConnectWalletUri({ node: "https://other.example" }),
      connection: {},
      error: "different endpoint",
    },
  ])(
    "rejects a pairing QR for a different $label before opening its relay",
    async ({ uri, connection, error }) => {
      const wrapper = mountComponent(connection);
      await scanConnectQr(uri);

      getDialogButtonByText(t("Approve connection")).click();
      await flushPromises();

      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
      expect(wrapper.text()).toContain(error);
    },
  );

  it("rejects a pairing when endpoint identity is not write-authorized", async () => {
    const wrapper = mountComponent();
    inspectEndpointMock.mockResolvedValueOnce({
      accessMode: "read-only",
      features: {
        irohaConnectSessions: {
          supported: true,
        },
      },
      diagnostic: {
        message: "Endpoint identity does not match the active wallet network.",
      },
    });
    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();

    expect(inspectEndpointMock).toHaveBeenCalledTimes(1);
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("does not match");
  });

  it("rejects a relay Open frame for another NetworkId before generating a wallet key or signing", async () => {
    const wrapper = mountComponent();
    const randomValuesSpy = vi.spyOn(globalThis.crypto, "getRandomValues");
    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");
    await flushPromises();
    randomValuesSpy.mockClear();
    emitBinaryMessage(
      socket,
      encodeControlConnectFrame({
        sid: VALID_CONNECT_SID,
        direction: "app_to_wallet",
        seq: 1,
        control: {
          type: "open",
          appPublicKeyHex: CONNECT_APP_KEY_PAIR.publicKeyHex,
          constraints: {
            networkId: FOREIGN_NETWORK_ID.toString(),
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

    expect(randomValuesSpy).not.toHaveBeenCalled();
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(socket.sent).toHaveLength(0);
    expect(wrapper.text()).toContain("does not match the scanned session");
    randomValuesSpy.mockRestore();
  });

  it("rejects connection approval on Escape and returns focus", async () => {
    const wrapper = mountComponent();
    const panel = wrapper.get("details.header-connect")
      .element as HTMLDetailsElement;
    panel.open = true;
    const scanButton = wrapper.get('[data-testid="header-connect-scan-screen"]')
      .element as HTMLButtonElement;
    scanButton.focus();
    expect(document.activeElement).toBe(scanButton);

    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    const dialog = getOpenDialog();
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="header-connect-reject"]'),
    );
    dialog?.dispatchEvent(new Event("cancel", { cancelable: true }));
    await flushPromises();

    expect(getOpenDialog()).toBeNull();
    expect(document.activeElement).toBe(scanButton);
    expect(wrapper.text()).toContain(t("IrohaConnect connection rejected."));
    expect(FakeWebSocket.instances).toHaveLength(0);
  });

  it("does not sign an IrohaConnect transaction request until the user approves it", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    const signingMessageB64 = Buffer.from("transfer 10 XOR").toString("base64");

    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64,
      }),
    );
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(getOpenDialog()?.textContent).toContain(
      t("Approve transaction signature?"),
    );
    expect(getOpenDialog()?.textContent).toContain("transfer 10 XOR");
    expect(getOpenDialog()?.textContent).toContain(RAW_DOMAIN);
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="header-connect-request-reject"]'),
    );

    getDialogButtonByText(t("Approve and sign")).click();
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith({
      toriiUrl: "https://taira.sora.org",
      chainId: "fc56984b-2be7-431d-840e-21514d1883f0",
      networkPrefix: 369,
      networkId: TAIRA_NETWORK_ID,
      accountId: EXAMPLE_ACCOUNT_ID,
      signingMessageB64,
    });
    expect(
      decodeLatestWalletEnvelope(socket, keys.walletKey).payload.type,
    ).toBe("sign_result_ok");
  });

  it("keeps the first modal active and answers an overlapping relay request in-band", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64: Buffer.from("first request").toString("base64"),
      }),
    );
    await flushPromises();
    const firstDialog = getOpenDialog();
    expect(firstDialog?.textContent).toContain("first request");

    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        sequence: 3,
        signingMessageB64: Buffer.from("overlapping request").toString(
          "base64",
        ),
      }),
    );
    await flushPromises();

    expect(socket.closeCode).toBeNull();
    expect(getOpenDialog()).toBe(firstDialog);
    expect(getOpenDialog()?.textContent).toContain("first request");
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(
      decodeLatestWalletEnvelope(socket, keys.walletKey).payload,
    ).toMatchObject({
      type: "sign_result_err",
      code: "REQUEST_IN_FLIGHT",
    });
  });

  it("signs the exact outer SignRequestRaw bytes without reinterpreting nested contract JSON", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    const innerMessageB64 = Buffer.from("do not sign me").toString("base64");
    const outerMessageB64 = Buffer.from(
      JSON.stringify({
        schema: CONTRACT_CALL_SIGN_SCHEMA,
        kind: "contract_call_signature_request",
        requestId: "legacy-nested-request",
        signingMessageB64: innerMessageB64,
      }),
    ).toString("base64");

    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64: outerMessageB64,
      }),
    );
    await flushPromises();
    getDialogButtonByText(t("Approve and sign")).click();
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signingMessageB64: outerMessageB64,
      }),
    );
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        signingMessageB64: innerMessageB64,
      }),
    );
  });

  it.each([
    {
      label: "null grants",
      permissions: null,
      requestType: "sign_request_raw" as const,
      domainTag: RAW_DOMAIN,
    },
    {
      label: "non-current method names",
      permissions: {
        methods: ["sign"],
        events: [],
        resources: [RAW_DOMAIN],
      },
      requestType: "sign_request_raw" as const,
      domainTag: RAW_DOMAIN,
    },
    {
      label: "a different raw domain",
      permissions: {
        methods: ["sign_raw"],
        events: [],
        resources: ["other:domain:v1"],
      },
      requestType: "sign_request_raw" as const,
      domainTag: RAW_DOMAIN,
    },
    {
      label: "resource-scoped transaction grants",
      permissions: {
        methods: ["sign_transaction"],
        events: [],
        resources: ["asset:opaque"],
      },
      requestType: "sign_request_tx" as const,
      domainTag: undefined,
    },
  ])(
    "rejects $label before vault signing",
    async ({ permissions, requestType, domainTag }) => {
      mountComponent();
      const { socket, keys } = await approveConnection(permissions);
      emitBinaryMessage(
        socket,
        encodeSignRequestFrame(keys.appKey, {
          type: requestType,
          domainTag,
          signingMessageB64: Buffer.from("permission probe").toString("base64"),
        }),
      );
      await flushPromises();

      expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
      expect(getOpenDialog()).toBeNull();
      expect(
        decodeLatestWalletEnvelope(socket, keys.walletKey).payload,
      ).toMatchObject({
        type: "sign_result_err",
        code: "PERMISSION_DENIED",
      });
    },
  );

  it("accepts an unscoped sign_transaction grant", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection({
      methods: ["sign_transaction"],
      events: [],
      resources: null,
    });
    const signingMessageB64 = Buffer.from("unsigned transaction").toString(
      "base64",
    );
    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        type: "sign_request_tx",
        signingMessageB64,
      }),
    );
    await flushPromises();
    getDialogButtonByText(t("Approve and sign")).click();
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ signingMessageB64 }),
    );
  });

  it("tracks relay server events separately from the peer app sequence", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    emitBinaryMessage(
      socket,
      encodeServerEventConnectFrame({
        sid: VALID_CONNECT_SID,
        direction: "app_to_wallet",
        seq: 1,
        height: 9,
        entryHash: "block-hash",
        proofsJson: "{}",
      }),
    );
    await flushPromises();
    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        sequence: 2,
        signingMessageB64: Buffer.from("after server event").toString("base64"),
      }),
    );
    await flushPromises();

    expect(socket.closeCode).toBeNull();
    expect(getOpenDialog()?.textContent).toContain("after server event");
  });

  it("does not send a stale signature after the relay socket closes during vault signing", async () => {
    let resolveSignature!: (value: {
      publicKeyHex: string;
      signatureB64: string;
      signingAlgorithm: string;
      algorithmCode: number;
      algorithmLabel: string;
    }) => void;
    mountComponent();
    const { socket, keys } = await approveConnection();
    signIrohaConnectMessageMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignature = resolve;
      }),
    );
    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64: Buffer.from("stale signature").toString("base64"),
      }),
    );
    await flushPromises();
    getDialogButtonByText(t("Approve and sign")).click();
    await flushPromises();
    expect(signIrohaConnectMessageMock).toHaveBeenCalledTimes(1);

    socket.emit("close");
    resolveSignature({
      publicKeyHex: "ab".repeat(32),
      signatureB64: Buffer.alloc(64, 0x5a).toString("base64"),
      signingAlgorithm: "ed25519",
      algorithmCode: 0,
      algorithmLabel: "Ed25519",
    });
    await flushPromises();

    expect(socket.sent).toHaveLength(1);
    expect(getOpenDialog()).toBeNull();
  });

  it("fails closed when the bridge returns a non-Ed25519 signature", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    const signingMessageB64 =
      Buffer.from("transfer with secp").toString("base64");
    signIrohaConnectMessageMock.mockResolvedValueOnce({
      publicKeyHex: "02" + "ab".repeat(32),
      signatureB64: Buffer.alloc(64, 0x6b).toString("base64"),
      signingAlgorithm: "secp256k1",
      algorithmCode: 1,
      algorithmLabel: "Secp256k1",
    });

    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64,
      }),
    );
    await flushPromises();
    getDialogButtonByText(t("Approve and sign")).click();
    await flushPromises();

    const envelope = decodeLatestWalletEnvelope(socket, keys.walletKey);
    expect(envelope.payload.type).toBe("sign_result_err");
  });

  it("rejects an IrohaConnect transaction request without signing", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();

    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64: Buffer.from("stake 5 XOR").toString("base64"),
      }),
    );
    await flushPromises();

    getDialogButtonByText(t("Reject")).click();
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    const envelope = decodeLatestWalletEnvelope(socket, keys.walletKey);
    expect(envelope.payload).toMatchObject({
      type: "sign_result_err",
      code: "USER_REJECTED",
      message: "Rejected by user.",
    });
  });

  it("closes a pending signing request when the wallet context changes", async () => {
    mountComponent();
    const { socket, keys } = await approveConnection();
    const signingMessageB64 = Buffer.from("transfer after switch").toString(
      "base64",
    );
    emitBinaryMessage(
      socket,
      encodeSignRequestFrame(keys.appKey, {
        signingMessageB64,
      }),
    );
    await flushPromises();
    const approveButton = getDialogButtonByText(t("Approve and sign"));

    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: SECOND_ACCOUNT_ID,
          publicKeyHex: "cd".repeat(32),
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
      activeAccountId: SECOND_ACCOUNT_ID,
    });
    await flushPromises();
    approveButton.click();
    await flushPromises();

    expect(socket.closeCode).toBe(1000);
    expect(getOpenDialog()).toBeNull();
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
  });
});
