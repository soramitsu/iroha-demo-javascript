import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BSC_MAINNET_CAIP_CHAIN_ID,
  BSC_TESTNET_CAIP_CHAIN_ID,
  BSC_TESTNET_CHAIN_ID_HEX,
  BSC_TESTNET_RPC_URL,
} from "@/utils/sccp";

const VALID_BSC_ADDRESS = "0x1111111111111111111111111111111111111111";
const SECOND_BSC_ADDRESS = "0x2222222222222222222222222222222222222222";
const THIRD_BSC_ADDRESS = "0x3333333333333333333333333333333333333333";
const LEGACY_BSC_WALLETCONNECT_STORAGE_KEY =
  "iroha-demo:sccp:bsc-walletconnect";
const BSC_WALLETCONNECT_STORAGE_KEY =
  "iroha-demo:sccp:bsc-walletconnect:eip155-97";
const BSC_WALLETCONNECT_NAMESPACE = "eip155";
const BSC_WALLETCONNECT_METHOD = "eth_sendTransaction";
const VALID_BSC_SELECTOR = "0x12345678";
const SECOND_BSC_SELECTOR = "0x87654321";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const allowedBscRouteTarget = {
  allowedToAddresses: [SECOND_BSC_ADDRESS],
  allowedToAddressLabel: "the active BSC SCCP bridge contract",
  allowedCallDataSelectors: [VALID_BSC_SELECTOR],
  allowedCallDataSelectorLabel: "the active BSC SCCP method",
} as const;

const expectGenericSecretTransactionRejection = (
  action: () => unknown,
  forbidden: string[],
): void => {
  let caught: unknown = null;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = caught instanceof Error ? caught.message : "";
  expect(message).toMatch(/secret-like material/u);
  for (const value of forbidden) {
    expect(message).not.toContain(value);
  }
};

describe("BSC WalletConnect connector", () => {
  afterEach(() => {
    delete (
      window as unknown as {
        __irohaBscWalletHarness?: unknown;
      }
    ).__irohaBscWalletHarness;
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.doUnmock("@reown/appkit-universal-connector");
    vi.resetModules();
    Reflect.deleteProperty(window, "iroha");
  });

  it("normalizes only opaque WalletConnect project identifiers", async () => {
    const { normalizeBscWalletConnectProjectId } = await import(
      "@/composables/useBscWalletConnect"
    );

    expect(normalizeBscWalletConnectProjectId(" project-123 ")).toBe(
      "project-123",
    );
    expect(normalizeBscWalletConnectProjectId("")).toBeNull();
    for (const unsafeProjectId of [
      "https://walletconnect.example/project",
      "project id",
      "project/id",
      "project?id=secret",
      "project#debug",
      "user@example",
      "x".repeat(129),
    ]) {
      expect(() => normalizeBscWalletConnectProjectId(unsafeProjectId)).toThrow(
        /opaque identifier/,
      );
    }
  });

  it("normalizes only 4-byte BSC WalletConnect call data selectors", async () => {
    const { normalizeBscWalletConnectAllowedCallDataSelectors } = await import(
      "@/composables/useBscWalletConnect"
    );

    expect(
      normalizeBscWalletConnectAllowedCallDataSelectors([
        " 0X12345678 ",
        "0x12345678",
        "0x87654321",
      ]),
    ).toEqual(["0x12345678", "0x87654321"]);
    for (const malformed of [
      "",
      "0x1234567",
      "0x1234567890",
      "12345678",
      "0x1234567g",
      12345678 as unknown as string,
    ]) {
      expect(() =>
        normalizeBscWalletConnectAllowedCallDataSelectors([malformed]),
      ).toThrow(/4-byte hex values/);
    }
  });

  it("requests BSC testnet eth_sendTransaction and stores only metadata", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-bsc",
        namespaces: {
          [BSC_WALLETCONNECT_NAMESPACE]: {
            accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
            chains: [BSC_TESTNET_CAIP_CHAIN_ID],
            methods: [BSC_WALLETCONNECT_METHOD],
          },
        },
      },
    });
    const initMock = vi.fn().mockResolvedValue({
      connect: connectMock,
      disconnect: vi.fn(),
      provider: { session: null },
      request: vi.fn(),
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();
    await bsc.connect();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        networks: [
          expect.objectContaining({
            namespace: BSC_WALLETCONNECT_NAMESPACE,
            methods: [BSC_WALLETCONNECT_METHOD],
            chains: [
              expect.objectContaining({
                caipNetworkId: BSC_TESTNET_CAIP_CHAIN_ID,
                name: "BSC Testnet",
                rpcUrls: {
                  default: {
                    http: [BSC_TESTNET_RPC_URL],
                  },
                },
              }),
            ],
          }),
        ],
      }),
    );
    expect(connectMock).toHaveBeenCalledWith({
      namespaces: {
        [BSC_WALLETCONNECT_NAMESPACE]: {
          chains: [BSC_TESTNET_CAIP_CHAIN_ID],
          methods: [BSC_WALLETCONNECT_METHOD],
          events: ["accountsChanged", "chainChanged"],
        },
      },
    });
    expect(bsc.address.value).toBe(VALID_BSC_ADDRESS);
    expect(
      JSON.parse(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY) ?? "null"),
    ).toEqual({
      topic: "topic-bsc",
      address: VALID_BSC_ADDRESS,
      chainId: BSC_TESTNET_CAIP_CHAIN_ID,
      namespace: BSC_WALLETCONNECT_NAMESPACE,
      methodVersion: "eip155-v1",
      connectedAtMs: expect.any(Number),
    });
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).not.toMatch(
      /private|seed|mnemonic/iu,
    );
  });

  it("ignores the E2E BSC wallet harness unless it is explicitly enabled", async () => {
    const harnessConnect = vi.fn().mockResolvedValue({
      address: VALID_BSC_ADDRESS,
      topic: "e2e-topic",
      connectedAtMs: Date.now(),
    });
    (
      window as unknown as {
        __irohaBscWalletHarness?: {
          connect: typeof harnessConnect;
        };
      }
    ).__irohaBscWalletHarness = {
      connect: harnessConnect,
    };

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    expect(bsc.projectConfigured.value).toBe(false);
    await expect(bsc.connect()).rejects.toThrow(
      /WalletConnect project ID is not configured/,
    );
    expect(harnessConnect).not.toHaveBeenCalled();
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
  });

  it("uses runtime preload config for the E2E BSC wallet harness", async () => {
    const nowMs = Date.now();
    const harnessConnect = vi.fn().mockResolvedValue({
      address: VALID_BSC_ADDRESS,
      topic: "runtime-e2e-topic",
      connectedAtMs: nowMs,
    });
    (
      window as unknown as {
        iroha?: unknown;
        __irohaBscWalletHarness?: {
          connect: typeof harnessConnect;
        };
      }
    ).iroha = {
      getRuntimeConfig: () => ({
        walletConnectProjectId: "runtime-project",
        sccpBscE2eWallet: "1",
      }),
    };
    (
      window as unknown as {
        __irohaBscWalletHarness?: {
          connect: typeof harnessConnect;
        };
      }
    ).__irohaBscWalletHarness = {
      connect: harnessConnect,
    };

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    expect(bsc.projectId.value).toBe("runtime-project");
    expect(bsc.projectConfigured.value).toBe(true);
    await bsc.connect();
    expect(harnessConnect).toHaveBeenCalled();
    expect(
      JSON.parse(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY) ?? "null"),
    ).toEqual({
      topic: "runtime-e2e-topic",
      address: VALID_BSC_ADDRESS,
      chainId: BSC_TESTNET_CAIP_CHAIN_ID,
      namespace: BSC_WALLETCONNECT_NAMESPACE,
      methodVersion: "eip155-v1",
      connectedAtMs: nowMs,
    });
  });

  it("uses the explicitly enabled E2E BSC wallet harness without persisting secrets", async () => {
    vi.stubEnv("VITE_SCCP_BSC_E2E_WALLET", "1");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "https://not-used.invalid");
    const nowMs = Date.now();
    const harnessSend = vi.fn(async (transaction) => {
      expect(Object.isFrozen(transaction)).toBe(true);
      expect(transaction).toEqual({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        value: "0x0",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      });
      return "0x" + "CD".repeat(32);
    });
    const harnessDisconnect = vi.fn();
    (
      window as unknown as {
        __irohaBscWalletHarness?: {
          connect: () => Promise<{
            address: string;
            topic: string;
            connectedAtMs: number;
          }>;
          disconnect: typeof harnessDisconnect;
          sendTransaction: typeof harnessSend;
        };
      }
    ).__irohaBscWalletHarness = {
      connect: vi.fn().mockResolvedValue({
        address: VALID_BSC_ADDRESS.toUpperCase(),
        topic: "e2e-topic",
        connectedAtMs: nowMs,
      }),
      disconnect: harnessDisconnect,
      sendTransaction: harnessSend,
    };

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    expect(bsc.projectConfigurationError.value).toBe("");
    expect(bsc.projectConfigured.value).toBe(true);
    await bsc.connect();
    expect(bsc.address.value).toBe(VALID_BSC_ADDRESS);
    expect(
      JSON.parse(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY) ?? "null"),
    ).toEqual({
      topic: "e2e-topic",
      address: VALID_BSC_ADDRESS,
      chainId: BSC_TESTNET_CAIP_CHAIN_ID,
      namespace: BSC_WALLETCONNECT_NAMESPACE,
      methodVersion: "eip155-v1",
      connectedAtMs: nowMs,
    });
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).not.toMatch(
      /private|seed|mnemonic|secret/iu,
    );
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          value: "0x0",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        allowedBscRouteTarget,
      ),
    ).resolves.toBe("0x" + "cd".repeat(32));
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: THIRD_BSC_ADDRESS,
          data: "0x12345678",
          value: "0x0",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/to address must match/);
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: SECOND_BSC_SELECTOR,
          value: "0x0",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/call data selector must match/);
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
          privateKeyHex: "00".repeat(32),
        } as unknown as Record<string, unknown>,
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/secret-like material|unsupported field/u);
    expect(harnessSend).toHaveBeenCalledTimes(1);
    await bsc.disconnect();
    expect(harnessDisconnect).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
  });

  it("rejects ambiguous or under-scoped BSC WalletConnect sessions", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const disconnectMock = vi.fn();
    const connectMock = vi
      .fn()
      .mockResolvedValueOnce({
        session: {
          topic: "topic-multi",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [
                `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
                `${BSC_TESTNET_CAIP_CHAIN_ID}:${SECOND_BSC_ADDRESS}`,
              ],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "topic-method",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              methods: ["eth_sign"],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "topic-extra-method",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              methods: [BSC_WALLETCONNECT_METHOD, "eth_sign"],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "topic-extra-chain",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID, BSC_MAINNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "topic-missing-chain-scope",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "topic-extra-namespace",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
            tron: {
              accounts: ["tron:0xcd8690dc:TGkWdpawVNfeset3P6uTBbLaPY7nZVZvXY"],
              chains: ["tron:0xcd8690dc"],
              methods: ["tron_signTransaction"],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          topic: "",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue({
          connect: connectMock,
          disconnect: disconnectMock,
          provider: { session: null },
          request: vi.fn(),
        }),
      },
    }));

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(bsc.connect()).rejects.toThrow(
      /multiple BSC Testnet accounts/,
    );
    expect(bsc.address.value).toBe("");
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    await expect(bsc.connect()).rejects.toThrow(
      /did not approve BSC transaction sending/,
    );
    await expect(bsc.connect()).rejects.toThrow(
      /did not approve BSC transaction sending/,
    );
    await expect(bsc.connect()).rejects.toThrow(
      /did not approve BSC transaction sending/,
    );
    await expect(bsc.connect()).rejects.toThrow(
      /did not approve BSC transaction sending/,
    );
    await expect(bsc.connect()).rejects.toThrow(
      /did not approve BSC transaction sending/,
    );
    await expect(bsc.connect()).rejects.toThrow(
      /WalletConnect topic is required/,
    );
    expect(disconnectMock).toHaveBeenCalledTimes(7);
  });

  it("rejects over-scoped EIP-155 WalletConnect sessions", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const disconnectMock = vi.fn();
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-overscoped",
        namespaces: {
          [BSC_WALLETCONNECT_NAMESPACE]: {
            accounts: [
              `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
              `${BSC_MAINNET_CAIP_CHAIN_ID}:${SECOND_BSC_ADDRESS}`,
            ],
            methods: [BSC_WALLETCONNECT_METHOD],
          },
        },
      },
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue({
          connect: connectMock,
          disconnect: disconnectMock,
          provider: { session: null },
          request: vi.fn(),
        }),
      },
    }));

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(bsc.connect()).rejects.toThrow(
      /unsupported EIP-155 accounts \(eip155:56\)/u,
    );
    expect(bsc.address.value).toBe("");
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(disconnectMock).toHaveBeenCalledTimes(1);
  });

  it("rejects accessor-backed BSC WalletConnect session metadata without invoking it", async () => {
    const {
      bscWalletConnectSessionSupportsRequiredSigning,
      extractBscAddressFromSession,
    } = await import("@/composables/useBscWalletConnect");

    const namespaceAccessorSession: Record<string, unknown> = {
      topic: "topic-bsc",
    };
    const namespaceAccesses: string[] = [];
    Object.defineProperty(namespaceAccessorSession, "namespaces", {
      enumerable: true,
      get() {
        namespaceAccesses.push("namespaces");
        return {
          [BSC_WALLETCONNECT_NAMESPACE]: {
            accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
            chains: [BSC_TESTNET_CAIP_CHAIN_ID],
            methods: [BSC_WALLETCONNECT_METHOD],
          },
        };
      },
    });
    expect(() =>
      extractBscAddressFromSession(namespaceAccessorSession),
    ).toThrow(/metadata fields/);
    expect(
      bscWalletConnectSessionSupportsRequiredSigning(namespaceAccessorSession),
    ).toBe(false);
    expect(namespaceAccesses).toEqual([]);

    const accountsAccessorNamespace: Record<string, unknown> = {
      chains: [BSC_TESTNET_CAIP_CHAIN_ID],
      methods: [BSC_WALLETCONNECT_METHOD],
    };
    const accountsAccesses: string[] = [];
    Object.defineProperty(accountsAccessorNamespace, "accounts", {
      enumerable: true,
      get() {
        accountsAccesses.push("accounts");
        return [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`];
      },
    });
    expect(() =>
      extractBscAddressFromSession({
        topic: "topic-bsc",
        namespaces: {
          [BSC_WALLETCONNECT_NAMESPACE]: accountsAccessorNamespace,
        },
      }),
    ).toThrow(/metadata fields/);
    expect(accountsAccesses).toEqual([]);

    const accountIndexAccessor = [
      `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
    ];
    const accountIndexAccesses: string[] = [];
    Object.defineProperty(accountIndexAccessor, "0", {
      enumerable: true,
      get() {
        accountIndexAccesses.push("0");
        return `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`;
      },
    });
    expect(() =>
      extractBscAddressFromSession({
        topic: "topic-bsc",
        namespaces: {
          [BSC_WALLETCONNECT_NAMESPACE]: {
            accounts: accountIndexAccessor,
            chains: [BSC_TESTNET_CAIP_CHAIN_ID],
            methods: [BSC_WALLETCONNECT_METHOD],
          },
        },
      }),
    ).toThrow(/metadata fields/);
    expect(accountIndexAccesses).toEqual([]);
  });

  it("expires or rejects unsafe stored BSC WalletConnect metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
    const nowMs = Date.now();
    const { readStoredBscWalletConnectSession } = await import(
      "@/composables/useBscWalletConnect"
    );

    for (const stored of [
      null,
      [],
      {
        topic: "topic",
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: "eip155:56",
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
      },
      {
        topic: "private_key_topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs - 8 * 24 * 60 * 60 * 1000,
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs + 10 * 60 * 1000,
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
        label: "unexpected metadata must not persist",
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
        privateKeyHex: "00".repeat(32),
      },
      {
        topic: "topic",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
        sessionProperties: {
          accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
        },
      },
    ]) {
      localStorage.setItem(
        BSC_WALLETCONNECT_STORAGE_KEY,
        JSON.stringify(stored),
      );
      expect(readStoredBscWalletConnectSession()).toBeNull();
      expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    }
  });

  it("rejects duplicate JSON keys in stored BSC WalletConnect metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
    const nowMs = Date.now();
    const { readStoredBscWalletConnectSession } = await import(
      "@/composables/useBscWalletConnect"
    );

    for (const stored of [
      `{"topic":"topic-bsc","\\u0074opic":"topic-shadow","address":"${VALID_BSC_ADDRESS}","chainId":"${BSC_TESTNET_CAIP_CHAIN_ID}","namespace":"${BSC_WALLETCONNECT_NAMESPACE}","methodVersion":"eip155-v1","connectedAtMs":${nowMs}}`,
      `{"topic":"topic-bsc","address":"${VALID_BSC_ADDRESS}","\\u0061ddress":"${SECOND_BSC_ADDRESS}","chainId":"${BSC_TESTNET_CAIP_CHAIN_ID}","namespace":"${BSC_WALLETCONNECT_NAMESPACE}","methodVersion":"eip155-v1","connectedAtMs":${nowMs}}`,
      `{"topic":"topic-bsc","address":"${VALID_BSC_ADDRESS}","chainId":"${BSC_TESTNET_CAIP_CHAIN_ID}","namespace":"${BSC_WALLETCONNECT_NAMESPACE}","methodVersion":"eip155-v1","connectedAtMs":${nowMs},"sessionProperties":{"accounts":[],"\\u0061ccounts":["${BSC_TESTNET_CAIP_CHAIN_ID}:${SECOND_BSC_ADDRESS}"]}}`,
    ]) {
      localStorage.setItem(BSC_WALLETCONNECT_STORAGE_KEY, stored);
      expect(readStoredBscWalletConnectSession()).toBeNull();
      expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    }
  });

  it("migrates valid legacy BSC WalletConnect metadata to the active network storage key", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
    const nowMs = Date.now();
    const { readStoredBscWalletConnectSession } = await import(
      "@/composables/useBscWalletConnect"
    );

    localStorage.setItem(
      LEGACY_BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: nowMs,
      }),
    );

    expect(readStoredBscWalletConnectSession()).toEqual({
      topic: "topic-bsc",
      address: VALID_BSC_ADDRESS,
      chainId: BSC_TESTNET_CAIP_CHAIN_ID,
      namespace: BSC_WALLETCONNECT_NAMESPACE,
      methodVersion: "eip155-v1",
      connectedAtMs: nowMs,
    });
    expect(
      localStorage.getItem(LEGACY_BSC_WALLETCONNECT_STORAGE_KEY),
    ).toBeNull();
    expect(
      JSON.parse(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY) ?? "null"),
    ).toEqual({
      topic: "topic-bsc",
      address: VALID_BSC_ADDRESS,
      chainId: BSC_TESTNET_CAIP_CHAIN_ID,
      namespace: BSC_WALLETCONNECT_NAMESPACE,
      methodVersion: "eip155-v1",
      connectedAtMs: nowMs,
    });
  });

  it("clears stored BSC metadata when the active session later exposes multiple accounts", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [
                `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
                `${BSC_TESTNET_CAIP_CHAIN_ID}:${SECOND_BSC_ADDRESS}`,
              ],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/multiple BSC Testnet accounts/);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("clears stored BSC metadata when the active session later exposes another EIP-155 chain", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [
                `${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
                `${BSC_MAINNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`,
              ],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/unsupported EIP-155 accounts \(eip155:56\)/u);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("clears stored BSC metadata when the active session later over-declares namespace scope", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID, BSC_MAINNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/Reconnect your BSC wallet/);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("clears stored BSC metadata when the active session later omits namespace chain scope", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/Reconnect your BSC wallet/);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("clears stored BSC metadata when the active session later exposes an extra namespace", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
            tron: {
              accounts: ["tron:0xcd8690dc:TGkWdpawVNfeset3P6uTBbLaPY7nZVZvXY"],
              chains: ["tron:0xcd8690dc"],
              methods: ["tron_signTransaction"],
            },
          },
        },
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/Reconnect your BSC wallet/);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("clears stored BSC metadata when the active session topic is accessor-backed", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const topicAccesses: string[] = [];
    const activeSession = {
      namespaces: {
        [BSC_WALLETCONNECT_NAMESPACE]: {
          accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
          chains: [BSC_TESTNET_CAIP_CHAIN_ID],
          methods: [BSC_WALLETCONNECT_METHOD],
        },
      },
    };
    Object.defineProperty(activeSession, "topic", {
      enumerable: true,
      get() {
        topicAccesses.push("topic");
        return "topic-bsc";
      },
    });
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: activeSession,
      },
      request: vi.fn(),
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();

    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/metadata fields/);
    expect(topicAccesses).toEqual([]);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    expect(bsc.address.value).toBe("");
    expect(connector.request).not.toHaveBeenCalled();
  });

  it("sends cloned BSC transactions only when the active session still matches stored metadata", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const requestMock = vi.fn(async (request) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.params)).toBe(true);
      expect(Object.isFrozen(request.params[0])).toBe(true);
      expect(() => {
        request.params[0].data = "0xmutated";
      }).toThrow(TypeError);
      expect(() => {
        request.params.push({ data: "0xmutated" });
      }).toThrow(TypeError);
      return "0x" + "ab".repeat(32);
    });
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: requestMock,
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();
    const transaction = {
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      value: "0x0",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    };
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).resolves.toBe("0x" + "ab".repeat(32));
    expect(requestMock).toHaveBeenCalledWith(
      {
        method: BSC_WALLETCONNECT_METHOD,
        params: [
          {
            from: VALID_BSC_ADDRESS,
            to: SECOND_BSC_ADDRESS,
            data: "0x12345678",
            value: "0x0",
            chainId: BSC_TESTNET_CHAIN_ID_HEX,
          },
        ],
      },
      BSC_TESTNET_CAIP_CHAIN_ID,
    );
    expect(transaction.data).toBe("0x12345678");
    await expect(
      bsc.sendTransaction(
        {
          ...transaction,
          from: SECOND_BSC_ADDRESS,
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/from address must match/);
    await expect(
      bsc.sendTransaction(
        {
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          value: "0x0",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/from field/);
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          value: "0x0",
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/must include chainId 0x61/);
    await expect(
      bsc.sendTransaction(
        {
          ...transaction,
          value: "0x1",
        },
        allowedBscRouteTarget,
      ),
    ).rejects.toThrow(/native BNB value must be 0x0/);
    expect(requestMock).toHaveBeenCalledTimes(1);

    connector.provider.session.topic = "topic-drifted";
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).rejects.toThrow(/Reconnect your BSC wallet/);
    expect(localStorage.getItem(BSC_WALLETCONNECT_STORAGE_KEY)).toBeNull();
  });

  it("rejects malformed BSC WalletConnect transaction hash responses", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const requestMock = vi
      .fn()
      .mockResolvedValueOnce("0x" + "AB".repeat(32))
      .mockResolvedValueOnce("0x" + "00".repeat(32))
      .mockResolvedValueOnce("0x1234")
      .mockResolvedValueOnce({ transactionHash: "0x" + "cd".repeat(32) });
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: requestMock,
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { normalizeBscWalletConnectTransactionHash, useBscWalletConnect } =
      await import("@/composables/useBscWalletConnect");
    expect(
      normalizeBscWalletConnectTransactionHash("0x" + "AB".repeat(32)),
    ).toBe("0x" + "ab".repeat(32));
    for (const malformed of [
      "",
      "0x1234",
      "0x" + "00".repeat(31),
      "0x" + "gg".repeat(32),
      { transactionHash: "0x" + "cd".repeat(32) },
    ]) {
      expect(() => normalizeBscWalletConnectTransactionHash(malformed)).toThrow(
        /32-byte transaction hash/,
      );
    }
    expect(() =>
      normalizeBscWalletConnectTransactionHash("0x" + "00".repeat(32)),
    ).toThrow(/non-zero/);

    const bsc = useBscWalletConnect();
    const transaction = {
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    };
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).resolves.toBe("0x" + "ab".repeat(32));
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).rejects.toThrow(/non-zero/);
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).rejects.toThrow(/32-byte transaction hash/);
    await expect(
      bsc.sendTransaction(transaction, allowedBscRouteTarget),
    ).rejects.toThrow(/32-byte transaction hash/);
  });

  it("binds BSC WalletConnect approvals to allowed SCCP route targets", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const requestMock = vi.fn().mockResolvedValue("0x" + "ab".repeat(32));
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-bsc",
          namespaces: {
            [BSC_WALLETCONNECT_NAMESPACE]: {
              accounts: [`${BSC_TESTNET_CAIP_CHAIN_ID}:${VALID_BSC_ADDRESS}`],
              chains: [BSC_TESTNET_CAIP_CHAIN_ID],
              methods: [BSC_WALLETCONNECT_METHOD],
            },
          },
        },
      },
      request: requestMock,
    };
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue(connector),
      },
    }));
    localStorage.setItem(
      BSC_WALLETCONNECT_STORAGE_KEY,
      JSON.stringify({
        topic: "topic-bsc",
        address: VALID_BSC_ADDRESS,
        chainId: BSC_TESTNET_CAIP_CHAIN_ID,
        namespace: BSC_WALLETCONNECT_NAMESPACE,
        methodVersion: "eip155-v1",
        connectedAtMs: Date.now(),
      }),
    );

    const { useBscWalletConnect } = await import(
      "@/composables/useBscWalletConnect"
    );
    const bsc = useBscWalletConnect();
    await expect(
      bsc.sendTransaction({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).rejects.toThrow(/must declare approved SCCP route contract targets/);
    expect(requestMock).not.toHaveBeenCalled();
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        {
          allowedToAddresses: [SECOND_BSC_ADDRESS],
          allowedToAddressLabel: "the active BSC SCCP bridge contract",
        },
      ),
    ).rejects.toThrow(/must declare approved SCCP route method selectors/);
    expect(requestMock).not.toHaveBeenCalled();
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS.toUpperCase(),
          to: SECOND_BSC_ADDRESS.toUpperCase(),
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        {
          allowedToAddresses: [SECOND_BSC_ADDRESS],
          allowedToAddressLabel: "the active BSC SCCP bridge contract",
          allowedCallDataSelectors: [VALID_BSC_SELECTOR.toUpperCase()],
          allowedCallDataSelectorLabel: "the active BSC SCCP method",
        },
      ),
    ).resolves.toBe("0x" + "ab".repeat(32));
    expect(requestMock).toHaveBeenCalledWith(
      {
        method: BSC_WALLETCONNECT_METHOD,
        params: [
          {
            from: VALID_BSC_ADDRESS,
            to: SECOND_BSC_ADDRESS,
            data: "0x12345678",
            chainId: BSC_TESTNET_CHAIN_ID_HEX,
          },
        ],
      },
      BSC_TESTNET_CAIP_CHAIN_ID,
    );
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: THIRD_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        {
          allowedToAddresses: [SECOND_BSC_ADDRESS],
          allowedToAddressLabel: "the active BSC SCCP bridge contract",
          allowedCallDataSelectors: [VALID_BSC_SELECTOR],
          allowedCallDataSelectorLabel: "the active BSC SCCP method",
        },
      ),
    ).rejects.toThrow(
      /to address must match the active BSC SCCP bridge contract/,
    );
    await expect(
      bsc.sendTransaction(
        {
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: SECOND_BSC_SELECTOR,
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
        },
        {
          allowedToAddresses: [SECOND_BSC_ADDRESS],
          allowedToAddressLabel: "the active BSC SCCP bridge contract",
          allowedCallDataSelectors: [VALID_BSC_SELECTOR],
          allowedCallDataSelectorLabel: "the active BSC SCCP method",
        },
      ),
    ).rejects.toThrow(
      /call data selector must match the active BSC SCCP method/,
    );
    expect(requestMock).toHaveBeenCalledTimes(1);
  });

  it("rejects malformed BSC transaction shapes before WalletConnect approval", async () => {
    const { cloneBscWalletConnectTransactionRequest } = await import(
      "@/composables/useBscWalletConnect"
    );
    const valid = {
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      value: "0x0",
      gas: "0x5208",
      gasLimit: "0x5208",
      nonce: "0x0",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    };
    const canonicalValid = {
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      value: "0x0",
      gas: "0x5208",
      nonce: "0x0",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    };

    expect(cloneBscWalletConnectTransactionRequest(valid)).toEqual(
      canonicalValid,
    );
    expect(
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        from: VALID_BSC_ADDRESS.toUpperCase(),
        to: SECOND_BSC_ADDRESS.toUpperCase(),
      }),
    ).toEqual(canonicalValid);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gas: undefined,
      }),
    ).toThrow(/must not contain undefined fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        customData: { relayer: undefined },
      }),
    ).toThrow(/must not contain undefined fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        customData: [{ relayer: undefined }],
      }),
    ).toThrow(/must not contain undefined fields/);
    expect(
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gasPrice: "0x3b9aca00",
      }),
    ).toEqual({
      ...canonicalValid,
      gasPrice: "0x3b9aca00",
    });
    expect(
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        maxFeePerGas: "0x3b9aca00",
        maxPriorityFeePerGas: "0x1",
      }),
    ).toEqual({
      ...canonicalValid,
      maxFeePerGas: "0x3b9aca00",
      maxPriorityFeePerGas: "0x1",
    });
    for (const [field, value] of [
      ["input", "0x12345678"],
      ["gas_limit", "0x5208"],
      ["customData", { relayer: SECOND_BSC_ADDRESS }],
      ["accessList", []],
      ["type", "0x2"],
    ] as const) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest({
          ...valid,
          [field]: value,
        }),
      ).toThrow(new RegExp(`unsupported field ${field}`));
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        proofMaterial: "public proof summary",
      }),
    ).toThrow(/unsupported field \[redacted unsupported field\]/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        proofMaterial: "public proof summary",
      }),
    ).not.toThrow(/proofMaterial/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        from: undefined,
      }),
    ).toThrow(/must not contain undefined fields/);
    for (const transaction of [
      { ...valid, from: "" },
      { ...valid, from: "0x" + "0".repeat(40) },
      { ...valid, from: "0x1234" },
    ]) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest(transaction),
      ).toThrow(/from address|from field/);
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        to: undefined,
      }),
    ).toThrow(/must not contain undefined fields/);
    for (const transaction of [
      { ...valid, to: "" },
      { ...valid, to: "0x" + "0".repeat(40) },
      { ...valid, to: "0x1234" },
    ]) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest(transaction),
      ).toThrow(/to address/);
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        data: undefined,
      }),
    ).toThrow(/must not contain undefined fields/);
    for (const transaction of [
      { ...valid, data: "0x" },
      { ...valid, data: "0x1234567" },
      { ...valid, data: "0x1234567g" },
      { ...valid, data: 12345678 },
    ]) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest(transaction),
      ).toThrow(/data must be 0x-prefixed byte hex/);
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        data: `0x12345678${"00".repeat(128 * 1024)}`,
      }),
    ).toThrow(/data must be at most 131072 bytes/);
    for (const [field, value] of [
      ["value", "1"],
      ["value", "0x00"],
      ["gas", 21000],
      ["gasLimit", "0x"],
      ["gasPrice", "0x01"],
      ["maxFeePerGas", "-0x1"],
      ["maxPriorityFeePerGas", "0x1.1"],
      ["nonce", "0"],
    ] as const) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest({
          ...valid,
          [field]: value,
        }),
      ).toThrow(new RegExp(`${field} must be a canonical 0x-prefixed`));
    }
    for (const field of [
      "gas",
      "gasLimit",
      "gasPrice",
      "maxFeePerGas",
      "maxPriorityFeePerGas",
      "nonce",
    ] as const) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest({
          ...valid,
          [field]: `0x1${"0".repeat(64)}`,
        }),
      ).toThrow(new RegExp(`${field} must fit within a 256-bit`));
    }
    for (const value of ["0x1", "0xde0b6b3a7640000"]) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest({
          ...valid,
          value,
        }),
      ).toThrow(/native BNB value must be 0x0/);
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gas: "0x5208",
        gasLimit: "0x5209",
      }),
    ).toThrow(/gas and gasLimit aliases must match/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gas: "0x0",
        gasLimit: "0x0",
      }),
    ).toThrow(/gas limit must be greater than zero/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gas: undefined,
        gasLimit: "0x0",
      }),
    ).toThrow(/must not contain undefined fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gasPrice: "0x0",
      }),
    ).toThrow(/gasPrice must be greater than zero/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gasPrice: "0x3b9aca00",
        maxFeePerGas: "0x3b9aca00",
      }),
    ).toThrow(/must not mix legacy gasPrice and EIP-1559 fee fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        gasPrice: "0x3b9aca00",
        maxPriorityFeePerGas: "0x1",
      }),
    ).toThrow(/must not mix legacy gasPrice and EIP-1559 fee fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        maxFeePerGas: "0x3b9aca00",
      }),
    ).toThrow(/must include both maxFeePerGas and maxPriorityFeePerGas/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        maxPriorityFeePerGas: "0x1",
      }),
    ).toThrow(/must include both maxFeePerGas and maxPriorityFeePerGas/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        maxFeePerGas: "0x0",
        maxPriorityFeePerGas: "0x0",
      }),
    ).toThrow(/maxFeePerGas must be greater than zero/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        maxFeePerGas: "0x2",
        maxPriorityFeePerGas: "0x3",
      }),
    ).toThrow(/maxPriorityFeePerGas must not exceed maxFeePerGas/);

    const cyclicTransaction = { ...valid } as Record<string, unknown>;
    cyclicTransaction.customData = cyclicTransaction;
    expect(() =>
      cloneBscWalletConnectTransactionRequest(cyclicTransaction),
    ).toThrow(/enumerable string-keyed data fields/);
  });

  it("rejects pre-signed, secret-like, and uncloneable BSC transaction requests before WalletConnect", async () => {
    const { cloneBscWalletConnectTransactionRequest } = await import(
      "@/composables/useBscWalletConnect"
    );
    const valid = {
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    };

    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
      }),
    ).toThrow(/must include chainId 0x61/);
    expect(cloneBscWalletConnectTransactionRequest(valid)).toEqual(valid);
    const nullPrototypeTransaction = Object.assign(Object.create(null), valid);
    expect(
      cloneBscWalletConnectTransactionRequest(nullPrototypeTransaction),
    ).toEqual(valid);
    class BscTransactionRequest {
      from = VALID_BSC_ADDRESS;
      to = SECOND_BSC_ADDRESS;
      data = "0x12345678";
      chainId = BSC_TESTNET_CHAIN_ID_HEX;
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest(
        new BscTransactionRequest() as unknown as Record<string, unknown>,
      ),
    ).toThrow(/plain object/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest(
        Object.assign(
          Object.create({
            to: SECOND_BSC_ADDRESS,
            data: "0x12345678",
            chainId: BSC_TESTNET_CHAIN_ID_HEX,
          }),
          { from: VALID_BSC_ADDRESS },
        ),
      ),
    ).toThrow(/plain object/);
    expect(
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chain_id: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).toEqual({
      from: VALID_BSC_ADDRESS,
      to: SECOND_BSC_ADDRESS,
      data: "0x12345678",
      chainId: BSC_TESTNET_CHAIN_ID_HEX,
    });
    for (const unsafeChainId of [
      "0x38",
      "0x061",
      "97",
      "97 ",
      BSC_TESTNET_CAIP_CHAIN_ID,
      "eip155:56",
      97,
      56,
      -1,
    ]) {
      expect(() =>
        cloneBscWalletConnectTransactionRequest({
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: unsafeChainId,
        }),
      ).toThrow(/chainId must be 0x61/);
    }
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: 97n,
      }),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
        chain_id: "0x38",
      }),
    ).toThrow(/chainId aliases must match/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        signature: "0x" + "11".repeat(65),
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
      }),
    ).toThrow(/must not already contain signatures/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        to: SECOND_BSC_ADDRESS,
        data: "0x12345678",
        chainId: BSC_TESTNET_CHAIN_ID_HEX,
        nested: { signature_b64: "already-signed" },
      }),
    ).toThrow(/signing helper payloads/);
    expectGenericSecretTransactionRejection(
      () =>
        cloneBscWalletConnectTransactionRequest({
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
          privateKeyHex: "00".repeat(32),
        }),
      ["privateKeyHex", "private key", "0".repeat(32)],
    );
    expectGenericSecretTransactionRejection(
      () =>
        cloneBscWalletConnectTransactionRequest({
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
          note: VALID_MNEMONIC,
        }),
      ["note", "abandon abandon"],
    );
    expectGenericSecretTransactionRejection(
      () =>
        cloneBscWalletConnectTransactionRequest({
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
          nested: { recovery_phrase: VALID_MNEMONIC },
        }),
      ["nested", "recovery_phrase", "abandon abandon"],
    );
    expectGenericSecretTransactionRejection(
      () =>
        cloneBscWalletConnectTransactionRequest({
          from: VALID_BSC_ADDRESS,
          to: SECOND_BSC_ADDRESS,
          data: "0x12345678",
          chainId: BSC_TESTNET_CHAIN_ID_HEX,
          privateKeyPem: [
            "-----BEGIN PRIVATE KEY-----",
            "MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            "-----END PRIVATE KEY-----",
          ].join("\n"),
        }),
      ["privateKeyPem", "BEGIN PRIVATE KEY"],
    );
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        privateKeyHex: "00".repeat(32),
        debug: () => "not cloneable",
      }),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        from: VALID_BSC_ADDRESS,
        debug: () => "not cloneable",
      }),
    ).toThrow(/enumerable string-keyed data fields/);

    const getterBackedTransaction = { ...valid };
    const accessedFields: string[] = [];
    Object.defineProperty(getterBackedTransaction, "data", {
      enumerable: true,
      get() {
        accessedFields.push("data");
        return "0x12345678";
      },
    });
    expect(() =>
      cloneBscWalletConnectTransactionRequest(getterBackedTransaction),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(accessedFields).toEqual([]);

    const nestedGetterBackedTransaction = {
      ...valid,
      customData: {},
    };
    const nestedAccessedFields: string[] = [];
    Object.defineProperty(nestedGetterBackedTransaction.customData, "secret", {
      enumerable: true,
      get() {
        nestedAccessedFields.push("secret");
        return VALID_MNEMONIC;
      },
    });
    expect(() =>
      cloneBscWalletConnectTransactionRequest(nestedGetterBackedTransaction),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(nestedAccessedFields).toEqual([]);

    const symbolBackedTransaction = { ...valid } as Record<
      PropertyKey,
      unknown
    >;
    symbolBackedTransaction[Symbol("privateKeyHex")] = "00".repeat(32);
    expect(() =>
      cloneBscWalletConnectTransactionRequest(
        symbolBackedTransaction as Record<string, unknown>,
      ),
    ).toThrow(/enumerable string-keyed data fields/);

    const hiddenSecretTransaction = { ...valid };
    Object.defineProperty(hiddenSecretTransaction, "privateKeyHex", {
      enumerable: false,
      value: "00".repeat(32),
    });
    expect(() =>
      cloneBscWalletConnectTransactionRequest(hiddenSecretTransaction),
    ).toThrow(/enumerable string-keyed data fields/);

    const sparseArray = [] as unknown[];
    sparseArray.length = 1;
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        customData: sparseArray,
      }),
    ).toThrow(/enumerable string-keyed data fields/);

    const arrayWithExtraProperty = [{ visible: true }] as Array<
      Record<string, unknown>
    > & { privateKeyHex?: string };
    arrayWithExtraProperty.privateKeyHex = "00".repeat(32);
    expect(() =>
      cloneBscWalletConnectTransactionRequest({
        ...valid,
        customData: arrayWithExtraProperty,
      }),
    ).toThrow(/enumerable string-keyed data fields/);
  });
});
