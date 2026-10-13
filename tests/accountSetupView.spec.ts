import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import AccountSetupView from "@/views/AccountSetupView.vue";
import { translate } from "@/i18n/messages";
import { useEndpointStore } from "@/stores/endpoint";
import { useSessionStore } from "@/stores/session";
import type { ConnectionConfig } from "@/stores/session";
import type {
  EndpointFeatureAvailability,
  EndpointInspection,
} from "@/types/endpointInspection";
import { TAIRA_CHAIN_PRESET } from "@/constants/chains";
import { NetworkId } from "@iroha/iroha-js/browser";
import { AccountAddress } from "@iroha/iroha-js/address";
import { createConnectSessionPreview } from "@iroha/iroha-js/connect-browser";
import { mnemonicToPrivateKeyHex } from "@/utils/mnemonic";
import {
  WALLET_BACKUP_SCHEMA,
  buildWalletBackupPayload,
} from "@/utils/walletBackup";
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
  unpinnedNetworkIdentity,
} from "./helpers/networkIdentityFixture";

const ALICE_PUBLIC_KEY_HEX =
  "d04ab232742bb4ab3a1368bd4615e4e6d0224ab71a016baf8520a332c9778737";
const BOB_PUBLIC_KEY_HEX =
  "a09aa5f47a6759802ff955f8dc2d2a14a5c99d23be97f864127ff9383455a4f0";
const accountIdFor = (publicKeyHex: string, networkPrefix: number) =>
  AccountAddress.fromAccount({
    publicKey: Uint8Array.from(
      publicKeyHex.match(/.{2}/gu)!.map((byte) => Number.parseInt(byte, 16)),
    ),
  }).toI105(networkPrefix);
const EXAMPLE_REAL_I105_ACCOUNT_ID = accountIdFor(ALICE_PUBLIC_KEY_HEX, 369);
const SECOND_I105_ACCOUNT_ID = accountIdFor(BOB_PUBLIC_KEY_HEX, 369);
const SECP256K1_I105_ACCOUNT_ID = "testuAliceSecp256k1Account1234567890";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const VALID_MNEMONIC_PRIVATE_KEY_HEX =
  "5EB00BBDDCF069084889A8AB9155568165F5C453CCB85E70811AAED6F6DA5FC1";
const VALID_24_WORD_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon art";
const RAW_DOMAIN = "account-setup:sign:v1";
const CONNECT_APP_KEY_PAIR = generateConnectWalletKeyPair();
const CONNECT_NONCE = new Uint8Array(16).fill(0x42);
const CONNECT_PREVIEW = createConnectSessionPreview({
  networkId: NetworkId.parse(TAIRA_NETWORK_ID),
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
    networkId: input.networkId ?? NetworkId.parse(TAIRA_NETWORK_ID),
    node: input.node ?? TAIRA_CHAIN_PRESET.connection.toriiUrl,
    nonce: CONNECT_NONCE,
    appKeyPair: {
      publicKey: hexToBytes(CONNECT_APP_KEY_PAIR.publicKeyHex),
      privateKey: hexToBytes(CONNECT_APP_KEY_PAIR.privateKeyHex),
    },
  });
  return `${preview.walletUri}&token=${VALID_WALLET_TOKEN}&relay=${VALID_RELAY_TOKEN}`;
};
const copyTextToClipboardMock = vi.fn();
const deriveAccountAddressMock = vi.fn();
const derivePublicKeyMock = vi.fn();
const exportConfidentialWalletBackupMock = vi.fn();
const generateKeyPairMock = vi.fn();
const getSigningAlgorithmsMock = vi.fn();
const importConfidentialWalletBackupMock = vi.fn();
const inspectEndpointMock = vi.fn();
const isSecureVaultAvailableMock = vi.fn();
const signIrohaConnectMessageMock = vi.fn();
let testIrohaConnectBoundary: IrohaConnectBoundary;
const storeAccountSecretMock = vi.fn();
const onboardAccountMock = vi.fn();
const routerPushMock = vi.fn();
type QrDecodeHandler = (payload: string) => void;
let connectQrDecodeHandler: QrDecodeHandler | null = null;
const t = (key: string, params?: Record<string, string | number>) =>
  translate("en-US", key, params);

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

vi.mock("vue-router", () => ({
  useRouter: () => ({
    push: routerPushMock,
  }),
}));

vi.mock("@/services/iroha", () => ({
  copyTextToClipboard: (text: string) => copyTextToClipboardMock(text),
  deriveAccountAddress: (input: unknown) => deriveAccountAddressMock(input),
  derivePublicKey: (privateKeyHex: string) =>
    derivePublicKeyMock(privateKeyHex),
  exportConfidentialWalletBackup: (input: unknown) =>
    exportConfidentialWalletBackupMock(input),
  generateKeyPair: (input: unknown) => generateKeyPairMock(input),
  getSigningAlgorithms: (toriiUrl?: string) =>
    getSigningAlgorithmsMock(toriiUrl),
  importConfidentialWalletBackup: (input: unknown) =>
    importConfidentialWalletBackupMock(input),
  inspectEndpoint: (input: unknown) => inspectEndpointMock(input),
  isSecureVaultAvailable: () => isSecureVaultAvailableMock(),
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
  storeAccountSecret: (input: unknown) => storeAccountSecretMock(input),
  onboardAccount: (input: unknown) => onboardAccountMock(input),
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

describe("AccountSetupView", () => {
  const mountedWrappers: Array<ReturnType<typeof mount>> = [];

  beforeEach(() => {
    connectQrDecodeHandler = null;
    FakeWebSocket.instances = [];
    vi.stubGlobal("WebSocket", FakeWebSocket);
    copyTextToClipboardMock.mockReset();
    copyTextToClipboardMock.mockResolvedValue(undefined);
    deriveAccountAddressMock.mockReset();
    derivePublicKeyMock.mockReset();
    exportConfidentialWalletBackupMock.mockReset();
    generateKeyPairMock.mockReset();
    getSigningAlgorithmsMock.mockReset();
    importConfidentialWalletBackupMock.mockReset();
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
          accessMode: "read-write",
          identityStatus: "matched",
          observed: { networkId: TAIRA_NETWORK_ID },
          networkIdentity: matchedNetworkIdentity(),
          features: {
            irohaConnectSessions: {
              supported: true,
            },
          },
          diagnostic: {
            message: "Endpoint identity matches the configured network.",
          },
          expected: input,
        }),
      );
    isSecureVaultAvailableMock.mockReset();
    storeAccountSecretMock.mockReset();
    onboardAccountMock.mockReset();
    routerPushMock.mockReset();
    deriveAccountAddressMock.mockImplementation(() => ({
      accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      i105AccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      i105DefaultAccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      i105DefaultFullwidthAccountId: "",
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
      accountIdWarning: "",
    }));
    derivePublicKeyMock.mockResolvedValue({
      publicKeyHex: ALICE_PUBLIC_KEY_HEX,
    });
    generateKeyPairMock.mockImplementation(
      async (input: { seedHex?: string; signingAlgorithm?: string } = {}) => {
        const derived = await derivePublicKeyMock(input.seedHex ?? "");
        return {
          privateKeyHex: input.seedHex ?? "cd".repeat(32),
          publicKeyHex: derived.publicKeyHex,
          signingAlgorithm: input.signingAlgorithm ?? "ed25519",
        };
      },
    );
    getSigningAlgorithmsMock.mockResolvedValue([
      { id: "ed25519", label: "Ed25519", isDefault: true },
    ]);
    // Persistence uses the preload bridge as well as the mocked view service.
    // Keep both paths on the same derived identity, including synthetic IDs in
    // the network-preview cases below.
    (window as unknown as { iroha: unknown }).iroha = {
      validateCanonicalAccountId: ({ accountId }: { accountId: string }) =>
        accountId,
      deriveAccountAddress: (input: {
        publicKeyHex: string;
        networkPrefix: number;
      }) =>
        input.publicKeyHex === BOB_PUBLIC_KEY_HEX
          ? { accountId: accountIdFor(BOB_PUBLIC_KEY_HEX, input.networkPrefix) }
          : deriveAccountAddressMock(input),
    };
    exportConfidentialWalletBackupMock.mockResolvedValue({
      schema: "iroha-demo-confidential-wallet-backup/v2",
      chainId: TAIRA_CHAIN_PRESET.connection.chainId,
      accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      scanWatermarkBlock: 12,
      stateBox: {
        kdf: "HKDF-SHA256",
        cipher: "AES-256-GCM",
        saltBase64Url: "A".repeat(43),
        ivBase64Url: "B".repeat(16),
        ciphertextBase64Url: "C".repeat(32),
        authTagBase64Url: "Q".repeat(22),
      },
    });
    importConfidentialWalletBackupMock.mockResolvedValue(undefined);
    isSecureVaultAvailableMock.mockResolvedValue(true);
    storeAccountSecretMock.mockResolvedValue(undefined);
    setActivePinia(createPinia());
  });

  afterEach(() => {
    for (const wrapper of mountedWrappers.splice(0)) {
      wrapper.unmount();
    }
    vi.useRealTimers();
    vi.unstubAllGlobals();
    delete (window as { iroha?: unknown }).iroha;
  });

  const mountView = (options?: {
    connection?: Partial<ConnectionConfig>;
    connectSupported?: boolean;
    endpointWriteAllowed?: boolean;
    withSavedAccount?: boolean;
    savedAccount?: {
      displayName?: string;
      domain?: string;
      accountId?: string;
      i105AccountId?: string;
      i105DefaultAccountId?: string;
      publicKeyHex?: string;
      signingAlgorithm?: string;
      privateKeyHex?: string;
      hasStoredSecret?: boolean;
      localOnly?: boolean;
    };
  }) => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const session = useSessionStore();
    session.$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        ...options?.connection,
      },
    });
    if (options?.withSavedAccount || options?.savedAccount) {
      const savedAccount = {
        displayName: "Alice",
        domain: "wonderland",
        accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        i105AccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        publicKeyHex: ALICE_PUBLIC_KEY_HEX,
        signingAlgorithm: "ed25519",
        hasStoredSecret: true,
        localOnly: false,
        ...options?.savedAccount,
      };
      session.$patch({
        accounts: [savedAccount],
        activeAccountId: savedAccount.accountId,
      });
    }
    const feature = (supported = true): EndpointFeatureAvailability => ({
      supported,
      source: "openapi",
      requiredOperations: [],
      missingOperations: supported ? [] : ["POST /missing"],
    });
    const endpointWriteAllowed = options?.endpointWriteAllowed !== false;
    useEndpointStore().$patch({
      state: "ready",
      inspection: {
        schema: "iroha.wallet.endpoint-inspection.v1",
        toriiUrl: session.connection.toriiUrl,
        expected: {
          chainId: session.connection.chainId,
          networkPrefix: session.connection.networkPrefix,
        },
        observed: endpointWriteAllowed
          ? {
              chainId: session.connection.chainId,
              networkPrefix: session.connection.networkPrefix,
            }
          : null,
        identityStatus: endpointWriteAllowed ? "matched" : "unverified",
        accessMode: endpointWriteAllowed ? "read-write" : "read-only",
        checkedAtMs: 1,
        evidence: [],
        networkIdentity: endpointWriteAllowed
          ? matchedNetworkIdentity()
          : unpinnedNetworkIdentity(),
        features: {
          accountRegistration: feature(),
          accountOnboarding: feature(),
          assetTransfers: feature(),
          faucetClaim: feature(),
          kaigiMeetings: feature(),
          governanceWrites: feature(),
          stakingWrites: feature(),
          subscriptionWrites: feature(),
          soraCloudHfSharedLease: feature(),
          vpnSessions: feature(),
          irohaConnectSessions: feature(options?.connectSupported !== false),
        },
        diagnostic: endpointWriteAllowed
          ? {
              code: "endpoint_identity_matched",
              message: "Endpoint identity matches the configured network.",
            }
          : {
              code: "endpoint_identity_unverified",
              message: "Endpoint identity is unverified.",
            },
      } satisfies EndpointInspection,
      error: "",
    });
    const wrapper = mount(AccountSetupView, {
      attachTo: document.body,
      global: {
        plugins: [pinia],
      },
    });
    mountedWrappers.push(wrapper);
    return wrapper;
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

  const getTextInputs = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findAll('input:not([type="checkbox"]):not([type="file"])');

  const selectRestoreFlow = async (wrapper: ReturnType<typeof mount>) => {
    const addWalletButton = wrapper
      .findAll("button")
      .find((node) => node.text() === t("Add another wallet"));
    if (addWalletButton) {
      await addWalletButton.trigger("click");
      await flushPromises();
    }
    await getButtonByText(wrapper, t("Restore from recovery phrase")).trigger(
      "click",
    );
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

  const setInputFiles = (input: HTMLInputElement, files: File[]) => {
    Object.defineProperty(input, "files", {
      configurable: true,
      value: files,
    });
  };

  const scanConnectQr = async (payload: string) => {
    if (!connectQrDecodeHandler) {
      throw new Error("IrohaConnect QR decode handler was not registered.");
    }
    connectQrDecodeHandler(payload);
    await flushPromises();
  };

  const approveConnectSession = async (
    permissions: ConnectPermissions | null = {
      methods: ["sign_raw"],
      events: [],
      resources: [RAW_DOMAIN],
    },
  ) => {
    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances.at(-1);
    if (!socket) {
      throw new Error("IrohaConnect test socket was not opened.");
    }
    socket.emit("open");
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeControlConnectFrame({
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
      }),
    );
    await flushPromises();
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
    return { socket, keys };
  };

  const encodeRawSignRequest = (
    appKey: Uint8Array,
    input: {
      sequence?: number;
      domainTag?: string;
      signingMessageB64: string;
    },
  ) => {
    const sequence = input.sequence ?? 2;
    const bytes = Buffer.from(input.signingMessageB64, "base64");
    const aead = encryptConnectEnvelope(
      appKey,
      VALID_CONNECT_SID,
      "app_to_wallet",
      sequence,
      {
        type: "sign_request_raw",
        domainTag: input.domainTag ?? RAW_DOMAIN,
        bytesHex: bytes.toString("hex"),
        bytesBase64: input.signingMessageB64,
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
    const frame = decodeConnectFrame(socket.sent.at(-1) as Uint8Array);
    if (!frame.ciphertext) {
      throw new Error("Expected an encrypted IrohaConnect response.");
    }
    return decryptConnectEnvelope(
      walletKey,
      VALID_CONNECT_SID,
      frame.direction,
      frame.seq,
      hexToBytes(frame.ciphertext.aeadHex),
    );
  };

  it("focuses first launch on the onboarding wizard", () => {
    const wrapper = mountView();

    expect(wrapper.text()).toContain(t("Create wallet"));
    expect(wrapper.text()).toContain("I105 Account ID");
    expect(wrapper.text()).toContain(
      t(
        "The domain label defaults to {domain}. It is a neutral SDK label for local derivation, not an on-chain dataspace alias.",
        {
          domain: t("default"),
        },
      ),
    );
    expect(wrapper.text()).not.toContain(t("IrohaConnect Pairing"));
    expect(wrapper.text()).not.toContain(t("Saved Wallets"));
    expect(wrapper.findAll(".account-step")).toHaveLength(3);
    expect(
      getButtonByText(wrapper, t("Create wallet")).attributes("aria-pressed"),
    ).toBe("true");
  });

  it("does not advertise an app-role QR without a remote signing session", () => {
    const wrapper = mountView({ withSavedAccount: true });

    expect(
      wrapper.find('[data-testid="account-connect-generate"]').exists(),
    ).toBe(false);
    expect(wrapper.text()).toContain(
      "Scan a wallet-role QR from an app to connect it to this wallet.",
    );
  });

  it("disables pairing QR generation when endpoint writes are blocked", () => {
    const wrapper = mountView({
      withSavedAccount: true,
      endpointWriteAllowed: false,
    });

    expect(
      wrapper.get('[data-testid="account-connect-prerequisite"]').text(),
    ).toContain("unverified");
  });

  it("disables pairing QR generation when the operation is not advertised", () => {
    const wrapper = mountView({
      withSavedAccount: true,
      connectSupported: false,
    });

    expect(
      wrapper.get('[data-testid="account-connect-prerequisite"]').text(),
    ).toBe(
      t("The active endpoint does not advertise IrohaConnect session writes."),
    );
  });

  it("opens the wallet when the active saved wallet is selected", async () => {
    const wrapper = mountView({ withSavedAccount: true });

    await getButtonByText(wrapper, t("Open wallet")).trigger("click");
    await flushPromises();

    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
  });

  it("switches to another saved wallet and opens the wallet", async () => {
    const wrapper = mountView({ withSavedAccount: true });
    const session = useSessionStore();
    session.$patch({
      accounts: [
        ...session.accounts,
        {
          displayName: "Bob",
          domain: "wonderland",
          accountId: SECOND_I105_ACCOUNT_ID,
          publicKeyHex: BOB_PUBLIC_KEY_HEX,
          signingAlgorithm: "ed25519",
          hasStoredSecret: true,
          localOnly: false,
        },
      ],
    });
    await flushPromises();

    await getButtonByText(wrapper, t("Switch to this account")).trigger(
      "click",
    );
    await flushPromises();

    expect(session.activeAccountId).toBe(SECOND_I105_ACCOUNT_ID);
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
  });

  it("approves a scanned wallet-role IrohaConnect QR over the relay WebSocket", async () => {
    const wrapper = mountView({ withSavedAccount: true });
    const relayNode = TAIRA_CHAIN_PRESET.connection.toriiUrl;
    const walletToken = VALID_WALLET_TOKEN;
    const payload = VALID_CONNECT_WALLET_URI;

    await scanConnectQr(payload);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(getOpenDialog()).not.toBeNull();
    expect(getOpenDialog()?.textContent).toContain(t("Approve connection?"));
    expect(getOpenDialog()?.textContent).toContain(
      EXAMPLE_REAL_I105_ACCOUNT_ID,
    );
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="account-connect-reject"]'),
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
    expect(socket.binaryType).toBe("arraybuffer");
    expect(wrapper.text()).toContain(VALID_CONNECT_SID);
    expect(wrapper.text()).toContain(TAIRA_CHAIN_PRESET.connection.chainId);
    expect(wrapper.text()).toContain(relayNode);

    socket.emit("open");
    await flushPromises();

    expect(socket.sent).toHaveLength(0);
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeControlConnectFrame({
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
            permissions: {
              methods: ["sign_raw"],
              events: [],
              resources: null,
            },
          },
        }),
      }),
    );
    await flushPromises();

    expect(socket.sent).toHaveLength(1);
    expect(socket.sent[0]).toBeInstanceOf(Uint8Array);
    const approvalFrame = decodeConnectFrame(socket.sent[0] as Uint8Array);
    expect(approvalFrame.kind).toBe("control");
    expect(approvalFrame.direction).toBe("wallet_to_app");
    expect(approvalFrame.seq).toBe(1);
    expect(approvalFrame.sid).toBe(VALID_CONNECT_SID);
    if (approvalFrame.control?.type !== "approve") {
      throw new Error("Expected IrohaConnect approval control frame.");
    }
    expect(approvalFrame.control).toMatchObject({
      accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      permissions: null,
      proof: null,
    });
    expect(signIrohaConnectMessageMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(wrapper.text()).toContain(t("IrohaConnect approved."));
  });

  it("rejects duplicate Account Setup Open frames while approval signing is pending", async () => {
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
    mountView({ withSavedAccount: true });
    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");
    for (const [index, appKey] of [
      CONNECT_APP_KEY_PAIR,
      generateConnectWalletKeyPair(),
    ].entries()) {
      socket.emit(
        "message",
        new MessageEvent("message", {
          data: encodeControlConnectFrame({
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

  it("shows the exact raw-signing domain and signs only after approval", async () => {
    mountView({ withSavedAccount: true });
    const { socket, keys } = await approveConnectSession();
    const signingMessageB64 = Buffer.from("account setup raw request").toString(
      "base64",
    );
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeRawSignRequest(keys.appKey, { signingMessageB64 }),
      }),
    );
    await flushPromises();

    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(getOpenDialog()?.textContent).toContain(RAW_DOMAIN);
    getDialogButtonByText(t("Approve request")).click();
    await flushPromises();

    expect(signIrohaConnectMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ signingMessageB64 }),
    );
    expect(
      decodeLatestWalletEnvelope(socket, keys.walletKey).payload.type,
    ).toBe("sign_result_ok");
  });

  it("keeps the Account Setup modal active when a second relay request arrives", async () => {
    mountView({ withSavedAccount: true });
    const { socket, keys } = await approveConnectSession();
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeRawSignRequest(keys.appKey, {
          signingMessageB64: Buffer.from("first setup request").toString(
            "base64",
          ),
        }),
      }),
    );
    await flushPromises();
    const firstDialog = getOpenDialog();
    expect(firstDialog).not.toBeNull();

    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeRawSignRequest(keys.appKey, {
          sequence: 3,
          signingMessageB64: Buffer.from("overlapping setup request").toString(
            "base64",
          ),
        }),
      }),
    );
    await flushPromises();

    expect(socket.closeCode).toBeNull();
    expect(getOpenDialog()).toBe(firstDialog);
    expect(signIrohaConnectMessageMock).not.toHaveBeenCalled();
    expect(
      decodeLatestWalletEnvelope(socket, keys.walletKey).payload,
    ).toMatchObject({
      type: "sign_result_err",
      code: "REQUEST_IN_FLIGHT",
    });
  });

  it.each([
    {
      label: "null grants",
      permissions: null,
      domainTag: RAW_DOMAIN,
    },
    {
      label: "a non-current method name",
      permissions: {
        methods: ["sign"],
        events: [],
        resources: [RAW_DOMAIN],
      },
      domainTag: RAW_DOMAIN,
    },
    {
      label: "an ungranted raw domain",
      permissions: {
        methods: ["sign_raw"],
        events: [],
        resources: ["other:domain:v1"],
      },
      domainTag: RAW_DOMAIN,
    },
  ])(
    "rejects Account Setup signing for $label before vault access",
    async ({ permissions, domainTag }) => {
      mountView({ withSavedAccount: true });
      const { socket, keys } = await approveConnectSession(permissions);
      socket.emit(
        "message",
        new MessageEvent("message", {
          data: encodeRawSignRequest(keys.appKey, {
            domainTag,
            signingMessageB64:
              Buffer.from("permission probe").toString("base64"),
          }),
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

  it("keeps relay server-event sequence independent from Account Setup peer sequence", async () => {
    mountView({ withSavedAccount: true });
    const { socket, keys } = await approveConnectSession();
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeServerEventConnectFrame({
          sid: VALID_CONNECT_SID,
          direction: "app_to_wallet",
          seq: 1,
          height: 7,
          entryHash: "event-hash",
          proofsJson: "{}",
        }),
      }),
    );
    await flushPromises();
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeRawSignRequest(keys.appKey, {
          sequence: 2,
          signingMessageB64: Buffer.from("after event").toString("base64"),
        }),
      }),
    );
    await flushPromises();

    expect(socket.closeCode).toBeNull();
    expect(getOpenDialog()?.textContent).toContain("6166746572206576656e74");
  });

  it("does not send an Account Setup signature after the socket closes during vault signing", async () => {
    let resolveSignature!: (value: {
      publicKeyHex: string;
      signatureB64: string;
      signingAlgorithm: string;
      algorithmCode: number;
      algorithmLabel: string;
    }) => void;
    mountView({ withSavedAccount: true });
    const { socket, keys } = await approveConnectSession();
    signIrohaConnectMessageMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSignature = resolve;
      }),
    );
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeRawSignRequest(keys.appKey, {
          signingMessageB64: Buffer.from("stale request").toString("base64"),
        }),
      }),
    );
    await flushPromises();
    getDialogButtonByText(t("Approve request")).click();
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

  it("does not send approval when the wallet changes during vault signing", async () => {
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
    mountView({ withSavedAccount: true });
    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];
    socket.emit("open");
    socket.emit(
      "message",
      new MessageEvent("message", {
        data: encodeControlConnectFrame({
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
            permissions: null,
          },
        }),
      }),
    );
    await flushPromises();
    expect(signIrohaConnectMessageMock).toHaveBeenCalledTimes(1);
    expect(socket.sent).toHaveLength(0);

    useSessionStore().$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        chainId: "different-chain",
      },
    });
    resolveSignature({
      publicKeyHex: "ab".repeat(32),
      signatureB64: Buffer.alloc(64, 0x5a).toString("base64"),
      signingAlgorithm: "ed25519",
      algorithmCode: 0,
      algorithmLabel: "Ed25519",
    });
    await flushPromises();

    expect(socket.sent).toHaveLength(0);
    expect(socket.closeCode).toBe(1000);
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
    {
      label: "network prefix",
      uri: VALID_CONNECT_WALLET_URI,
      connection: { networkPrefix: 753 },
      error: "differs from the configured network prefix",
    },
  ])(
    "rejects a scanned pairing for a different $label before opening the relay",
    async ({ uri, connection, error }) => {
      const wrapper = mountView({ withSavedAccount: true, connection });
      if (connection.networkPrefix === 753) {
        inspectEndpointMock.mockResolvedValueOnce({
          accessMode: "read-only",
          identityStatus: "mismatched",
          observed: { networkId: TAIRA_NETWORK_ID, networkPrefix: 369 },
          networkIdentity: matchedNetworkIdentity(),
          features: { irohaConnectSessions: { supported: true } },
          diagnostic: {
            message:
              "Endpoint network prefix 369 differs from the configured network prefix 753.",
          },
        });
      }

      await scanConnectQr(uri);
      getDialogButtonByText(t("Approve connection")).click();
      await flushPromises();

      // The pinned NetworkId comes from a fresh inspection, so the claim is
      // checked against it before any relay socket is opened.
      expect(inspectEndpointMock).toHaveBeenCalledTimes(1);
      expect(FakeWebSocket.instances).toHaveLength(0);
      expect(wrapper.text()).toContain(error);
    },
  );

  it("does not open a scanned relay when fresh endpoint inspection is read-only", async () => {
    const wrapper = mountView({ withSavedAccount: true });
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

  it("does not open a scanned relay when the wallet context changes during inspection", async () => {
    let resolveInspection!: (value: unknown) => void;
    inspectEndpointMock.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveInspection = resolve;
      }),
    );
    mountView({ withSavedAccount: true });

    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();

    useSessionStore().$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        chainId: "different-chain",
      },
    });
    resolveInspection({
      accessMode: "read-write",
      features: {
        irohaConnectSessions: {
          supported: true,
        },
      },
      diagnostic: {
        message: "Endpoint identity matches the configured network.",
      },
    });
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(getOpenDialog()).toBeNull();
  });

  it("does not approve an opened relay after the wallet context changes", async () => {
    mountView({ withSavedAccount: true });

    await scanConnectQr(VALID_CONNECT_WALLET_URI);
    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();
    const socket = FakeWebSocket.instances[0];

    useSessionStore().$patch({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        chainId: "different-chain",
      },
    });
    socket.emit("open");
    await flushPromises();

    expect(socket.sent).toEqual([]);
    expect(socket.closeCode).toBe(1000);
    expect(getOpenDialog()).toBeNull();
  });

  it("rejects scanned wallet-role IrohaConnect QR approval when the token is missing", async () => {
    const wrapper = mountView({ withSavedAccount: true });

    await scanConnectQr(
      VALID_CONNECT_WALLET_URI.replace(`&token=${VALID_WALLET_TOKEN}`, ""),
    );

    expect(getOpenDialog()).toBeNull();
    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(wrapper.text()).toContain("IrohaConnect URI is missing token.");
  });

  it("rejects a scanned wallet-role IrohaConnect QR without opening the relay", async () => {
    const wrapper = mountView({ withSavedAccount: true });

    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    expect(getOpenDialog()).not.toBeNull();
    getDialogButtonByText(t("Reject")).click();
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(getOpenDialog()).toBeNull();
    expect(wrapper.text()).toContain(t("IrohaConnect connection rejected."));
  });

  it("rejects pairing from the dialog backdrop and returns focus", async () => {
    const wrapper = mountView({ withSavedAccount: true });
    const pairingDisclosure = wrapper.get(".account-pairing-disclosure")
      .element as HTMLDetailsElement;
    pairingDisclosure.open = true;
    const scanButton = wrapper.get('[data-testid="account-connect-scan"]')
      .element as HTMLButtonElement;
    scanButton.focus();
    expect(document.activeElement).toBe(scanButton);

    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    const dialog = getOpenDialog();
    expect(dialog).not.toBeNull();
    expect(document.activeElement).toBe(
      document.querySelector('[data-testid="account-connect-reject"]'),
    );
    dialog?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await flushPromises();

    expect(getOpenDialog()).toBeNull();
    expect(document.activeElement).toBe(scanButton);
    expect(wrapper.text()).toContain(t("IrohaConnect connection rejected."));
  });

  it("rejects scanned IrohaConnect QRs that are not for the wallet role", async () => {
    const wrapper = mountView({ withSavedAccount: true });

    await scanConnectQr(
      VALID_CONNECT_WALLET_URI.replace("role=wallet", "role=app"),
    );

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(wrapper.text()).toContain("IrohaConnect QR must use role=wallet.");
    expect(wrapper.text()).not.toContain(VALID_CONNECT_SID);
  });

  it("surfaces relay open timeouts before sending an IrohaConnect approval frame", async () => {
    vi.useFakeTimers();
    const wrapper = mountView({ withSavedAccount: true });

    await scanConnectQr(VALID_CONNECT_WALLET_URI);

    getDialogButtonByText(t("Approve connection")).click();
    await flushPromises();

    expect(FakeWebSocket.instances).toHaveLength(1);
    const socket = FakeWebSocket.instances[0];

    await vi.advanceTimersByTimeAsync(10_000);
    await flushPromises();

    expect(socket.sent).toHaveLength(0);
    expect(wrapper.text()).toContain("IrohaConnect approval timed out.");
  });

  it("saves the first generated account locally and routes to the wallet", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    expect(inputs).toHaveLength(2);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    expect(wrapper.text()).not.toContain(t("Register on-chain alias"));
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === t("Advanced")),
    ).toBe(false);
    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(session.activeAccount?.displayName).toBe("Alice");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("shows secure storage errors when saving the generated account fails", async () => {
    isSecureVaultAvailableMock.mockResolvedValue(false);
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      t("Secure OS-backed key storage is unavailable on this device."),
    );
    expect(storeAccountSecretMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBeNull();
  });

  it("shows a secure storage error when the availability bridge rejects", async () => {
    isSecureVaultAvailableMock.mockRejectedValueOnce(
      new Error("IPC unavailable"),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(
      t("Secure OS-backed key storage is unavailable on this device."),
    );
    expect(storeAccountSecretMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBeNull();
  });

  it("keeps the wallet unsaved when the vault write rejects late", async () => {
    storeAccountSecretMock.mockRejectedValueOnce(
      new Error("Windows DPAPI command failed: access denied"),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        networkPrefix: 369,
        privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/i),
      }),
    );
    expect(wrapper.text()).toContain(
      "Windows DPAPI command failed: access denied",
    );
    expect(importConfidentialWalletBackupMock).not.toHaveBeenCalled();
    expect(routerPushMock).not.toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBeNull();
  });

  it("copies the generated recovery phrase instead of downloading the manual backup", async () => {
    const wrapper = mountView();

    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    expect(wrapper.text()).toContain(t("Copy phrase"));
    expect(wrapper.text()).not.toContain(t("Download backup"));

    await getButtonByText(wrapper, t("Copy phrase")).trigger("click");
    await flushPromises();

    expect(copyTextToClipboardMock).toHaveBeenCalledTimes(1);
    const copiedPhrase = String(
      copyTextToClipboardMock.mock.calls[0]?.[0] ?? "",
    );
    expect(copiedPhrase.split(" ")).toHaveLength(24);
    expect(copiedPhrase).not.toContain("\n");
    expect(copiedPhrase).not.toContain("1.");
    expect(wrapper.text()).toContain(t("Recovery phrase copied to clipboard."));

    await getButtonByText(wrapper, "Reset").trigger("click");
    await flushPromises();
    await selectRestoreFlow(wrapper);

    await wrapper.find("textarea").setValue(copiedPhrase);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenLastCalledWith(
      mnemonicToPrivateKeyHex(copiedPhrase),
    );
  });

  it("saves the first account locally without UAID onboarding", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    expect(inputs).toHaveLength(2);

    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(session.activeAccount?.displayName).toBe("");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("blocks wallet generation when the endpoint has no supported signing algorithms", async () => {
    getSigningAlgorithmsMock.mockResolvedValueOnce([]);

    const wrapper = mountView();
    await flushPromises();

    expect(wrapper.text()).toContain(
      t(
        "This endpoint does not advertise any signing algorithms supported by this app.",
      ),
    );
    expect(
      (
        getButtonByText(wrapper, t("Generate recovery phrase"))
          .element as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("uses the selected non-default signing algorithm when creating a wallet", async () => {
    getSigningAlgorithmsMock.mockResolvedValueOnce([
      { id: "ed25519", label: "Ed25519", isDefault: true },
      { id: "secp256k1", label: "Secp256k1", isDefault: false },
    ]);
    deriveAccountAddressMock.mockImplementation(
      (input: { domain?: string; signingAlgorithm?: string }) => ({
        accountId: SECP256K1_I105_ACCOUNT_ID,
        i105AccountId: SECP256K1_I105_ACCOUNT_ID,
        i105DefaultAccountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        i105DefaultFullwidthAccountId: "",
        publicKeyHex: "ab".repeat(32),
        signingAlgorithm: input.signingAlgorithm,
        accountIdWarning: "",
      }),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    await flushPromises();

    const signingSelect = wrapper
      .findAll("select")
      .find((select) => select.find('option[value="secp256k1"]').exists());
    if (!signingSelect) {
      throw new Error("Signing algorithm select was not rendered.");
    }
    await signingSelect.setValue("secp256k1");

    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(generateKeyPairMock).toHaveBeenCalledWith({
      signingAlgorithm: "secp256k1",
      seedHex: expect.stringMatching(/^[0-9a-f]{64}$/i),
    });
    expect(deriveAccountAddressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        signingAlgorithm: "secp256k1",
      }),
    );
    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: SECP256K1_I105_ACCOUNT_ID,
      networkPrefix: 369,
      privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/i),
      signingAlgorithm: "secp256k1",
    });
    expect(session.activeAccount?.signingAlgorithm).toBe("secp256k1");
  });

  it("preserves the previewed network prefix for vault storage and the saved account", async () => {
    deriveAccountAddressMock.mockImplementation(
      (input: { domain?: string; networkPrefix?: number }) => {
        const prefix = input.networkPrefix === 369 ? "testu" : "n42u";
        const suffix = `${input.domain || "default"}StableAccount1234567890`;
        return {
          accountId: `${prefix}${suffix}`,
          i105AccountId: `${prefix}${suffix}`,
          i105DefaultAccountId: `sorau${suffix}`,
          i105DefaultFullwidthAccountId: "",
          publicKeyHex: "ab".repeat(32),
          accountIdWarning: "",
        };
      },
    );
    const wrapper = mountView({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        networkPrefix: 42,
      },
    });
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    expect(wrapper.text()).toContain("n42uflowersStableAccount1234567890");
    expect(wrapper.text()).not.toContain("testuflowersStableAccount1234567890");

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: "n42uflowersStableAccount1234567890",
      networkPrefix: 42,
      privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/i),
      signingAlgorithm: "ed25519",
    });
    expect(session.connection.networkPrefix).toBe(42);
    expect(session.activeAccountId).toBe("n42uflowersStableAccount1234567890");
    expect(session.activeAccount?.i105AccountId).toBe(
      "n42uflowersStableAccount1234567890",
    );
  });

  it("does not replace a previewed custom-prefix account with the default i105 id when bridge output is partial", async () => {
    deriveAccountAddressMock.mockImplementation(
      (input: { domain?: string; networkPrefix?: number }) => {
        const prefix = input.networkPrefix === 369 ? "testu" : "n42u";
        const suffix = `${input.domain || "default"}PartialAccount1234567890`;
        return {
          accountId: `${prefix}${suffix}`,
          i105AccountId: "",
          i105DefaultAccountId: `sorau${suffix}`,
          i105DefaultFullwidthAccountId: "",
          publicKeyHex: "ab".repeat(32),
          accountIdWarning: "partial i105 output",
        };
      },
    );
    const wrapper = mountView({
      connection: {
        ...TAIRA_CHAIN_PRESET.connection,
        networkPrefix: 42,
      },
    });
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();
    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();
    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: "n42uflowersPartialAccount1234567890",
      networkPrefix: 42,
      privateKeyHex: expect.stringMatching(/^[0-9a-f]{64}$/i),
      signingAlgorithm: "ed25519",
    });
    expect(session.activeAccountId).toBe("n42uflowersPartialAccount1234567890");
    expect(session.activeAccount?.i105AccountId).toBe(
      "n42uflowersPartialAccount1234567890",
    );
    expect(session.activeAccount?.i105DefaultAccountId).toBe(
      "sorauflowersPartialAccount1234567890",
    );
  });

  it("restores a wallet from a recovery phrase without re-registering it", async () => {
    const wrapper = mountView();
    const session = useSessionStore();

    await selectRestoreFlow(wrapper);

    const textarea = wrapper.find("textarea");
    expect(textarea.exists()).toBe(true);
    await textarea.setValue(VALID_MNEMONIC);

    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(
      VALID_MNEMONIC_PRIVATE_KEY_HEX,
    );
    expect(wrapper.text()).not.toContain(t("Download backup"));

    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });

  it("restores local metadata from an imported backup JSON file", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const backupPayload = JSON.stringify(
      buildWalletBackupPayload({
        mnemonic: VALID_MNEMONIC,
        wordCount: 12,
        target: "manual",
        createdAt: "2026-03-29T00:00:00.000Z",
        displayName: "Backup Alice",
        domain: "backup-domain",
        confidentialWallet: {
          schema: "iroha-demo-confidential-wallet-backup/v2",
          chainId: TAIRA_CHAIN_PRESET.connection.chainId,
          accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
          scanWatermarkBlock: 42,
          stateBox: {
            kdf: "HKDF-SHA256",
            cipher: "AES-256-GCM",
            saltBase64Url: "A".repeat(43),
            ivBase64Url: "B".repeat(16),
            ciphertextBase64Url: "C".repeat(32),
            authTagBase64Url: "Q".repeat(22),
          },
        },
      }),
    );
    const backupFile = new File([backupPayload], "iroha-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(backupFile, "text", {
      configurable: true,
      value: () => Promise.resolve(backupPayload),
    });

    await selectRestoreFlow(wrapper);

    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    setInputFiles(fileInput.element as HTMLInputElement, [backupFile]);
    await fileInput.trigger("change");
    await flushPromises();
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(
      VALID_MNEMONIC_PRIVATE_KEY_HEX,
    );
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(session.activeAccount?.displayName).toBe("Backup Alice");
    expect(session.activeAccount?.domain).toBe("backup-domain");
    expect(session.activeAccount?.localOnly).toBe(true);
    expect(importConfidentialWalletBackupMock).toHaveBeenCalledWith({
      toriiUrl: TAIRA_CHAIN_PRESET.connection.toriiUrl,
      chainId: TAIRA_CHAIN_PRESET.connection.chainId,
      networkPrefix: TAIRA_CHAIN_PRESET.connection.networkPrefix,
      accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      mnemonic: VALID_MNEMONIC,
      confidentialWallet: {
        schema: "iroha-demo-confidential-wallet-backup/v2",
        chainId: TAIRA_CHAIN_PRESET.connection.chainId,
        accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        scanWatermarkBlock: 42,
        stateBox: {
          kdf: "HKDF-SHA256",
          cipher: "AES-256-GCM",
          saltBase64Url: "A".repeat(43),
          ivBase64Url: "B".repeat(16),
          ciphertextBase64Url: "C".repeat(32),
          authTagBase64Url: "Q".repeat(22),
        },
      },
    });
  });

  it("does not save restored backup metadata when confidential restore fails", async () => {
    importConfidentialWalletBackupMock.mockRejectedValueOnce(
      new Error("confidential bundle rejected"),
    );
    const wrapper = mountView();
    const session = useSessionStore();
    const backupPayload = JSON.stringify(
      buildWalletBackupPayload({
        mnemonic: VALID_MNEMONIC,
        wordCount: 12,
        target: "manual",
        createdAt: "2026-03-29T00:00:00.000Z",
        displayName: "Backup Alice",
        domain: "backup-domain",
        confidentialWallet: {
          schema: "iroha-demo-confidential-wallet-backup/v2",
          chainId: TAIRA_CHAIN_PRESET.connection.chainId,
          accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
          scanWatermarkBlock: 42,
          stateBox: {
            kdf: "HKDF-SHA256",
            cipher: "AES-256-GCM",
            saltBase64Url: "A".repeat(43),
            ivBase64Url: "B".repeat(16),
            ciphertextBase64Url: "C".repeat(32),
            authTagBase64Url: "Q".repeat(22),
          },
        },
      }),
    );
    const backupFile = new File([backupPayload], "iroha-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(backupFile, "text", {
      configurable: true,
      value: () => Promise.resolve(backupPayload),
    });

    await selectRestoreFlow(wrapper);

    const fileInput = wrapper.find('input[type="file"]');
    setInputFiles(fileInput.element as HTMLInputElement, [backupFile]);
    await fileInput.trigger("change");
    await flushPromises();
    await flushPromises();

    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(storeAccountSecretMock).toHaveBeenCalledWith({
      accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
      networkPrefix: 369,
      privateKeyHex: VALID_MNEMONIC_PRIVATE_KEY_HEX,
      signingAlgorithm: "ed25519",
    });
    expect(importConfidentialWalletBackupMock).toHaveBeenCalledTimes(1);
    expect(wrapper.text()).toContain("confidential bundle rejected");
    expect(routerPushMock).not.toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBeNull();
  });

  it("does not apply backup metadata when imported recovery data is invalid", async () => {
    const wrapper = mountView();
    const invalidBackupPayload = JSON.stringify({
      schema: WALLET_BACKUP_SCHEMA,
      mnemonic:
        "invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid",
      wordCount: 12,
      signingAlgorithm: "ed25519",
      createdAt: "2026-03-29T00:00:00.000Z",
      target: "manual",
      displayName: "Backup Alice",
      domain: "backup-domain",
      confidentialWallet: {
        schema: "iroha-demo-confidential-wallet-backup/v2",
        chainId: TAIRA_CHAIN_PRESET.connection.chainId,
        accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        scanWatermarkBlock: null,
        stateBox: {
          kdf: "HKDF-SHA256",
          cipher: "AES-256-GCM",
          saltBase64Url: "A".repeat(43),
          ivBase64Url: "B".repeat(16),
          ciphertextBase64Url: "C".repeat(32),
          authTagBase64Url: "Q".repeat(22),
        },
      },
    });
    const backupFile = new File([invalidBackupPayload], "iroha-backup.json", {
      type: "application/json",
    });
    Object.defineProperty(backupFile, "text", {
      configurable: true,
      value: () => Promise.resolve(invalidBackupPayload),
    });

    await selectRestoreFlow(wrapper);

    const fileInput = wrapper.find('input[type="file"]');
    expect(fileInput.exists()).toBe(true);
    setInputFiles(fileInput.element as HTMLInputElement, [backupFile]);
    await fileInput.trigger("change");
    await flushPromises();
    await flushPromises();

    const inputs = getTextInputs(wrapper);
    expect(wrapper.text()).toContain(t("Invalid recovery phrase"));
    expect((inputs[0].element as HTMLInputElement).value).toBe("");
    expect((inputs[1].element as HTMLInputElement).value).toBe("default");
    expect(derivePublicKeyMock).not.toHaveBeenCalled();
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("validates restore phrases before deriving or saving", async () => {
    const wrapper = mountView();

    await selectRestoreFlow(wrapper);

    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(t("Enter a recovery phrase."));
    expect(derivePublicKeyMock).not.toHaveBeenCalled();

    const textarea = wrapper.find("textarea");
    await textarea.setValue("one two three");
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain(
      t("Recovery phrase must contain 12 or 24 words."),
    );
    expect(derivePublicKeyMock).not.toHaveBeenCalled();

    await textarea.setValue(
      "invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid invalid",
    );
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain(t("Invalid recovery phrase"));
    expect(derivePublicKeyMock).not.toHaveBeenCalled();
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("restores a 24-word recovery phrase", async () => {
    const wrapper = mountView();
    const session = useSessionStore();
    const expectedPrivateKeyHex = mnemonicToPrivateKeyHex(
      VALID_24_WORD_MNEMONIC,
    );

    await selectRestoreFlow(wrapper);

    await wrapper.find("textarea").setValue(VALID_24_WORD_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(derivePublicKeyMock).toHaveBeenCalledWith(expectedPrivateKeyHex);
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
  });

  it("surfaces bridge failures while deriving a restored wallet", async () => {
    derivePublicKeyMock.mockRejectedValueOnce(new Error("bridge down"));

    const wrapper = mountView();

    await selectRestoreFlow(wrapper);

    await wrapper.find("textarea").setValue(VALID_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();

    expect(wrapper.text()).toContain("bridge down");
    expect(
      wrapper
        .findAll("button")
        .some((button) => button.text() === t("Restore wallet")),
    ).toBe(false);
    expect(useSessionStore().hasAccount).toBe(false);
  });

  it("does not expose advanced on-chain onboarding controls on first launch", async () => {
    const wrapper = mountView();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    expect(wrapper.text()).not.toContain(t("Register on-chain alias"));
    expect(onboardAccountMock).not.toHaveBeenCalled();
  });

  it("ignores stale onboarding bridge mocks and still saves locally", async () => {
    onboardAccountMock.mockRejectedValueOnce(
      new Error("Onboarding bridge should not be called"),
    );

    const wrapper = mountView();
    const session = useSessionStore();
    const inputs = getTextInputs(wrapper);

    await inputs[0].setValue("Alice");
    await inputs[1].setValue("flowers");
    await getButtonByText(wrapper, t("Generate recovery phrase")).trigger(
      "click",
    );
    await flushPromises();

    await wrapper.find('input[type="checkbox"]').setValue(true);
    await flushPromises();

    await getButtonByText(wrapper, t("Save identity")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(routerPushMock).toHaveBeenCalledWith("/wallet");
    expect(session.activeAccountId).toBe(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(session.activeAccount?.localOnly).toBe(true);
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
  });

  it("restores from the saved-wallet layout and updates an existing account entry", async () => {
    const wrapper = mountView({
      savedAccount: {
        displayName: "Existing Alice",
        domain: "default",
        accountId: EXAMPLE_REAL_I105_ACCOUNT_ID,
        publicKeyHex: "11".repeat(32),
        signingAlgorithm: "ed25519",
        hasStoredSecret: true,
        localOnly: false,
      },
    });
    const session = useSessionStore();

    expect(session.accounts).toHaveLength(1);

    await selectRestoreFlow(wrapper);

    const textarea = wrapper.find("textarea");
    await textarea.setValue(VALID_MNEMONIC);
    await getButtonByText(wrapper, t("Load recovery phrase")).trigger("click");
    await flushPromises();
    await getButtonByText(wrapper, t("Restore wallet")).trigger("click");
    await flushPromises();

    expect(onboardAccountMock).not.toHaveBeenCalled();
    expect(session.accounts).toHaveLength(1);
    expect(session.activeAccountId).toBe(EXAMPLE_REAL_I105_ACCOUNT_ID);
    expect(session.activeAccount?.displayName).toBe("");
    expect(session.activeAccount?.hasStoredSecret).toBe(true);
    expect(session.activeAccount?.localOnly).toBe(true);
  });
});
