import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRON_MAINNET_CAIP_CHAIN_ID,
  TRON_MAINNET_RPC_URL,
  TRON_NILE_CAIP_CHAIN_ID,
  TRON_NILE_RPC_URL,
  WALLETCONNECT_TRON_METHOD_VERSION,
  WALLETCONNECT_TRON_NAMESPACE,
  WALLETCONNECT_TRON_SIGN_METHOD,
} from "@/utils/sccp";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const SECOND_TRON_ADDRESS = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const TRON_WALLETCONNECT_STORAGE_KEY = "iroha-demo:sccp:tron-walletconnect";
const TRON_WALLETCONNECT_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PEM_PRIVATE_KEY =
  "-----BEGIN PRIVATE KEY-----\nMC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\n-----END PRIVATE KEY-----";

describe("TRON WalletConnect connector", () => {
  afterEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.doUnmock("@reown/appkit-universal-connector");
    vi.resetModules();
    Reflect.deleteProperty(window, "iroha");
  });

  it("normalizes only opaque WalletConnect project identifiers", async () => {
    const { normalizeTronWalletConnectProjectId } = await import(
      "@/composables/useTronWalletConnect"
    );

    expect(normalizeTronWalletConnectProjectId(" project-123 ")).toBe(
      "project-123",
    );
    expect(normalizeTronWalletConnectProjectId("")).toBeNull();
    for (const unsafeProjectId of [
      "https://walletconnect.example/project",
      "project id",
      "project/id",
      "project?id=secret",
      "project#debug",
      "user@example",
      "x".repeat(129),
    ]) {
      expect(() =>
        normalizeTronWalletConnectProjectId(unsafeProjectId),
      ).toThrow(/opaque identifier/);
    }
  });

  it("rejects unsafe configured project IDs before initializing AppKit", async () => {
    vi.stubEnv(
      "VITE_WALLETCONNECT_PROJECT_ID",
      "https://walletconnect.example/project",
    );
    const initMock = vi.fn();
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    expect(tron.projectConfigured.value).toBe(false);
    expect(tron.projectId.value).toBe("");
    expect(tron.projectConfigurationError.value).toContain("opaque identifier");
    await expect(tron.connect()).rejects.toThrow(/opaque identifier/);
    expect(initMock).not.toHaveBeenCalled();
  });

  it("requests official TRON mainnet v1 transaction signing and stores only metadata", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-1",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    await tron.connect();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "test-project",
        networks: [
          expect.objectContaining({
            namespace: WALLETCONNECT_TRON_NAMESPACE,
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            chains: [
              expect.objectContaining({
                caipNetworkId: TRON_MAINNET_CAIP_CHAIN_ID,
                rpcUrls: {
                  default: {
                    http: [TRON_MAINNET_RPC_URL],
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
        [WALLETCONNECT_TRON_NAMESPACE]: {
          chains: [TRON_MAINNET_CAIP_CHAIN_ID],
          methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          events: ["accountsChanged", "chainChanged"],
        },
      },
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    });
    const connectRequest = connectMock.mock.calls[0]?.[0];
    expect(Object.keys(connectRequest.namespaces)).toEqual([
      WALLETCONNECT_TRON_NAMESPACE,
    ]);
    expect(
      connectRequest.namespaces[WALLETCONNECT_TRON_NAMESPACE].methods,
    ).not.toContain("tron_sendTransaction");
    expect(
      connectRequest.namespaces[WALLETCONNECT_TRON_NAMESPACE].chains,
    ).not.toContain("tron:0xcd8690dc");
    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);
    expect(
      JSON.parse(
        localStorage.getItem("iroha-demo:sccp:tron-walletconnect") ?? "null",
      ),
    ).toEqual({
      topic: "topic-1",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
      namespace: WALLETCONNECT_TRON_NAMESPACE,
      methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
      connectedAtMs: expect.any(Number),
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("can target TRON Nile when explicitly configured for testnet", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "nile");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-nile",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_NILE_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            chains: [TRON_NILE_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    await tron.connect();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        networks: [
          expect.objectContaining({
            chains: [
              expect.objectContaining({
                caipNetworkId: TRON_NILE_CAIP_CHAIN_ID,
                name: "TRON Nile Testnet",
                rpcUrls: {
                  default: {
                    http: [TRON_NILE_RPC_URL],
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
        [WALLETCONNECT_TRON_NAMESPACE]: {
          chains: [TRON_NILE_CAIP_CHAIN_ID],
          methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          events: ["accountsChanged", "chainChanged"],
        },
      },
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    });
    expect(
      JSON.parse(
        localStorage.getItem("iroha-demo:sccp:tron-walletconnect") ?? "null",
      ),
    ).toMatchObject({
      topic: "topic-nile",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_NILE_CAIP_CHAIN_ID,
    });
  });

  it("expires or rejects unsafe stored TRON WalletConnect metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    const nowMs = Date.now();
    const { readStoredTronWalletConnectSession } = await import(
      "@/composables/useTronWalletConnect"
    );

    for (const stored of [
      null,
      [],
      {
        topic: "topic",
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_NILE_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
      },
      {
        topic: "private_key_topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS - 1,
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs + 10 * 60 * 1000,
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
        label: "unexpected metadata must not persist",
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
        privateKeyHex: "00".repeat(32),
      },
      {
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: nowMs,
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    ]) {
      localStorage.setItem(
        TRON_WALLETCONNECT_STORAGE_KEY,
        JSON.stringify(stored),
      );
      expect(readStoredTronWalletConnectSession()).toBeNull();
      expect(localStorage.getItem(TRON_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    }
  });

  it("rejects duplicate JSON keys in stored TRON WalletConnect metadata", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-05T00:00:00Z"));
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    const nowMs = Date.now();
    const { readStoredTronWalletConnectSession } = await import(
      "@/composables/useTronWalletConnect"
    );

    for (const stored of [
      `{"topic":"topic-tron","\\u0074opic":"topic-shadow","address":"${VALID_TRON_ADDRESS}","chainId":"${TRON_MAINNET_CAIP_CHAIN_ID}","namespace":"${WALLETCONNECT_TRON_NAMESPACE}","methodVersion":"${WALLETCONNECT_TRON_METHOD_VERSION}","connectedAtMs":${nowMs}}`,
      `{"topic":"topic-tron","address":"${VALID_TRON_ADDRESS}","\\u0061ddress":"${SECOND_TRON_ADDRESS}","chainId":"${TRON_MAINNET_CAIP_CHAIN_ID}","namespace":"${WALLETCONNECT_TRON_NAMESPACE}","methodVersion":"${WALLETCONNECT_TRON_METHOD_VERSION}","connectedAtMs":${nowMs}}`,
      `{"topic":"topic-tron","address":"${VALID_TRON_ADDRESS}","chainId":"${TRON_MAINNET_CAIP_CHAIN_ID}","namespace":"${WALLETCONNECT_TRON_NAMESPACE}","methodVersion":"${WALLETCONNECT_TRON_METHOD_VERSION}","connectedAtMs":${nowMs},"sessionProperties":{"tron_method_version":"${WALLETCONNECT_TRON_METHOD_VERSION}","\\u0074ron_method_version":"shadow"}}`,
    ]) {
      localStorage.setItem(TRON_WALLETCONNECT_STORAGE_KEY, stored);
      expect(readStoredTronWalletConnectSession()).toBeNull();
      expect(localStorage.getItem(TRON_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    }
  });

  it("uses the Electron Nile test signer when Nile is explicitly configured and WalletConnect is not configured", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "nile");
    const unsignedTransaction = {
      visible: true,
      txID: "aa".repeat(32),
      raw_data: { contract: [] },
      raw_data_hex: "12",
    };
    const signedTransaction = {
      ...unsignedTransaction,
      signature: ["11".repeat(65)],
    };
    const getSignerMock = vi.fn().mockResolvedValue({
      enabled: true,
      network: "nile",
      address: VALID_TRON_ADDRESS,
    });
    const signMock = vi.fn().mockResolvedValue(signedTransaction);
    (window as unknown as { iroha?: unknown }).iroha = {
      getSccpNileTestTronSigner: getSignerMock,
      signSccpNileTestTronTransaction: signMock,
    };
    const initMock = vi.fn();
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    await tron.refreshTestSigner();

    expect(tron.projectConfigured.value).toBe(true);
    expect(tron.testSignerEnabled.value).toBe(true);
    await tron.connect();

    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);
    expect(tron.sessionTopic.value).toBe("sccp-nile-test-signer");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
    await expect(tron.signTransaction(unsignedTransaction)).resolves.toBe(
      signedTransaction,
    );
    expect(signMock).toHaveBeenCalledWith({
      transaction: unsignedTransaction,
      ownerAddress: VALID_TRON_ADDRESS,
    });
    expect(initMock).not.toHaveBeenCalled();
  });

  it("does not use the Nile test signer for an explicit mainnet TRON profile", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    const getSignerMock = vi.fn().mockResolvedValue({
      enabled: true,
      network: "nile",
      address: VALID_TRON_ADDRESS,
    });
    const signMock = vi.fn();
    (window as unknown as { iroha?: unknown }).iroha = {
      getSccpNileTestTronSigner: getSignerMock,
      signSccpNileTestTronTransaction: signMock,
    };
    const initMock = vi.fn();
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    await tron.refreshTestSigner();

    expect(getSignerMock).not.toHaveBeenCalled();
    expect(tron.projectConfigured.value).toBe(false);
    expect(tron.testSignerEnabled.value).toBe(false);
    expect(tron.testSignerAddress.value).toBe("");

    await expect(tron.connect()).rejects.toThrow(
      /WalletConnect project ID is not configured/,
    );
    expect(getSignerMock).not.toHaveBeenCalled();
    expect(signMock).not.toHaveBeenCalled();
    expect(initMock).not.toHaveBeenCalled();
    expect(tron.address.value).toBe("");
    expect(tron.sessionTopic.value).toBe("");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("rejects ambiguous WalletConnect sessions with multiple TRON mainnet accounts", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-multi",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [
              `${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`,
              `${TRON_MAINNET_CAIP_CHAIN_ID}:${SECOND_TRON_ADDRESS}`,
            ],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    });
    const disconnectMock = vi.fn();
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(tron.connect()).rejects.toThrow(/multiple TRON Mainnet/);
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(tron.address.value).toBe("");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("rejects over-scoped or cross-profile TRON WalletConnect sessions", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const baseSession = {
      topic: "topic-scope",
      namespaces: {
        [WALLETCONNECT_TRON_NAMESPACE]: {
          accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
          chains: [TRON_MAINNET_CAIP_CHAIN_ID],
          methods: [WALLETCONNECT_TRON_SIGN_METHOD],
        },
      },
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    };
    const connectMock = vi
      .fn()
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [
                `${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`,
                `${TRON_NILE_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`,
              ],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD, "tron_signMessage"],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
            eip155: {
              accounts: [],
              methods: [],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID, TRON_NILE_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
        },
      })
      .mockResolvedValueOnce({
        session: {
          ...baseSession,
          sessionProperties: {
            tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
            debug: true,
          },
        },
      });
    const disconnectMock = vi.fn();
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(tron.connect()).rejects.toThrow(
      /unsupported TRON accounts \(tron:0xcd8690dc\)/u,
    );
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(tron.connect()).rejects.toThrow(
        "Connected wallet did not approve TRON v1 transaction signing.",
      );
      expect(tron.address.value).toBe("");
      expect(localStorage.getItem(TRON_WALLETCONNECT_STORAGE_KEY)).toBeNull();
    }
    expect(disconnectMock).toHaveBeenCalledTimes(6);
  });

  it("rejects WalletConnect sessions without a stable topic", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    });
    const disconnectMock = vi.fn();
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(tron.connect()).rejects.toThrow(
      /Connected WalletConnect topic is required/,
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(tron.address.value).toBe("");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("allows duplicate WalletConnect account entries only when they normalize to one TRON address", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-duplicate",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [
              `${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`,
              `${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`,
            ],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: vi.fn().mockResolvedValue({
          connect: connectMock,
          disconnect: vi.fn(),
          provider: { session: null },
          request: vi.fn(),
        }),
      },
    }));

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(tron.connect()).resolves.toBeUndefined();
    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);
  });

  it("sends tron_signTransaction with the documented v1 request shape", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const unsignedTransaction = {
      visible: true,
      txID: "aa".repeat(32),
      raw_data: { contract: [] },
      raw_data_hex: "12",
    };
    const requestMock = vi.fn().mockResolvedValue({
      ...unsignedTransaction,
      signature: ["11".repeat(65)],
    });
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-1",
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
          sessionProperties: {
            tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
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
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic-1",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );
    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(
      tron.signTransaction(unsignedTransaction),
    ).resolves.toMatchObject({
      txID: unsignedTransaction.txID,
    });
    expect(requestMock).toHaveBeenCalledWith(
      {
        method: WALLETCONNECT_TRON_SIGN_METHOD,
        params: {
          address: VALID_TRON_ADDRESS,
          transaction: unsignedTransaction,
        },
      },
      TRON_MAINNET_CAIP_CHAIN_ID,
    );
  });

  it("clones and freezes unsigned transactions before WalletConnect signing so adapter mutations cannot rewrite caller intent", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const unsignedTransaction = {
      visible: true,
      txID: "aa".repeat(32),
      raw_data: { contract: [] as Array<Record<string, unknown>> },
      raw_data_hex: "12",
    };
    const requestMock = vi.fn().mockImplementation((request) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.params)).toBe(true);
      expect(Object.isFrozen(request.params.transaction)).toBe(true);
      expect(Object.isFrozen(request.params.transaction.raw_data)).toBe(true);
      expect(
        Object.isFrozen(request.params.transaction.raw_data.contract),
      ).toBe(true);
      expect(() => {
        request.params.transaction.raw_data.contract.push({ mutated: true });
      }).toThrow(TypeError);
      expect(() => {
        request.params.transaction.raw_data_hex = "feedface";
      }).toThrow(TypeError);
      return Promise.resolve({
        ...request.params.transaction,
        signature: ["11".repeat(65)],
      });
    });
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-1",
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
          sessionProperties: {
            tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
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
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic-1",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    const signed = await tron.signTransaction(unsignedTransaction);

    expect(requestMock.mock.calls[0][0].params.transaction).not.toBe(
      unsignedTransaction,
    );
    expect(unsignedTransaction.raw_data.contract).toEqual([]);
    expect(unsignedTransaction.raw_data_hex).toBe("12");
    expect(signed).toMatchObject({
      raw_data: { contract: [] },
      raw_data_hex: "12",
    });
  });

  it("rejects pre-signed WalletConnect transaction requests before signing", async () => {
    const { cloneTronWalletConnectTransactionRequest } = await import(
      "@/composables/useTronWalletConnect"
    );

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: { contract: [] },
        raw_data_hex: "12",
        signature: ["11".repeat(65)],
      }),
    ).toThrow(/must not already contain signatures/);

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [
            {
              parameter: {
                value: {
                  owner_address: VALID_TRON_ADDRESS,
                  signatures: ["11".repeat(65)],
                },
              },
            },
          ],
        },
        raw_data_hex: "12",
      }),
    ).toThrow(/must not already contain signatures/);

    for (const helperPayload of [
      { signature_b64: "already-signed" },
      { signatureB64: "already-signed" },
      { signedTransaction: { txID: "aa".repeat(32) } },
      { walletSignature: "11".repeat(65) },
    ]) {
      expect(() =>
        cloneTronWalletConnectTransactionRequest({
          visible: true,
          txID: "aa".repeat(32),
          raw_data: { contract: [{ parameter: { value: helperPayload } }] },
          raw_data_hex: "12",
        }),
      ).toThrow(/signing helper payloads/);
    }
  });

  it("rejects secret-like fields in WalletConnect transaction requests before signing", async () => {
    const { cloneTronWalletConnectTransactionRequest } = await import(
      "@/composables/useTronWalletConnect"
    );

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [
            {
              parameter: {
                value: {
                  owner_address: VALID_TRON_ADDRESS,
                  privateKeyHex: "00".repeat(32),
                },
              },
            },
          ],
        },
        raw_data_hex: "12",
      }),
    ).toThrow(/privateKeyHex.*connected wallet/);

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [{ parameter: { value: { seedPhrase: "test test" } } }],
        },
        raw_data_hex: "12",
      }),
    ).toThrow(/seedPhrase.*connected wallet/);

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [{ parameter: { value: { note: VALID_MNEMONIC } } }],
        },
        raw_data_hex: "12",
      }),
    ).toThrow(/note.*WalletConnect signing/);

    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [
            {
              parameter: {
                value: {
                  memo: PEM_PRIVATE_KEY,
                },
              },
            },
          ],
        },
        raw_data_hex: "12",
      }),
    ).toThrow(/memo.*WalletConnect signing/);
  });

  it("does not send unsafe transaction requests to WalletConnect", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const requestMock = vi.fn();
    const connector = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-1",
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
          sessionProperties: {
            tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
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
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic-1",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(
      tron.signTransaction({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: { contract: [] },
        raw_data_hex: "12",
        signature: ["11".repeat(65)],
      }),
    ).rejects.toThrow(/must not already contain signatures/);

    await expect(
      tron.signTransaction({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [{ parameter: { value: { recoveryPhrase: "test test" } } }],
        },
        raw_data_hex: "12",
      }),
    ).rejects.toThrow(/recoveryPhrase.*connected wallet/);

    await expect(
      tron.signTransaction({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [{ parameter: { value: { note: VALID_MNEMONIC } } }],
        },
        raw_data_hex: "12",
      }),
    ).rejects.toThrow(/note.*WalletConnect signing/);

    await expect(
      tron.signTransaction({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [{ parameter: { value: { signature: "11".repeat(65) } } }],
        },
        raw_data_hex: "12",
      }),
    ).rejects.toThrow(/must not already contain signatures/);

    await expect(
      tron.signTransaction({
        visible: true,
        txID: "aa".repeat(32),
        raw_data: {
          contract: [
            {
              parameter: {
                value: { signature_b64: "already-signed" },
              },
            },
          ],
        },
        raw_data_hex: "12",
      }),
    ).rejects.toThrow(/signing helper payloads/);

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("rejects non-JSON and hostile object graph transaction requests before signing", async () => {
    const { cloneTronWalletConnectTransactionRequest } = await import(
      "@/composables/useTronWalletConnect"
    );
    const valid = {
      txID: "aa".repeat(32),
      raw_data: { contract: [] as Array<Record<string, unknown>> },
      raw_data_hex: "12",
    };
    const nullPrototypeTransaction = Object.assign(Object.create(null), valid);
    expect(
      cloneTronWalletConnectTransactionRequest(nullPrototypeTransaction),
    ).toEqual(valid);

    class TronTransactionRequest {
      txID = "aa".repeat(32);
      raw_data = { contract: [] };
      raw_data_hex = "12";
    }
    expect(() =>
      cloneTronWalletConnectTransactionRequest(
        new TronTransactionRequest() as unknown as Record<string, unknown>,
      ),
    ).toThrow(/plain object/);
    expect(() =>
      cloneTronWalletConnectTransactionRequest(
        Object.assign(
          Object.create({
            raw_data: { contract: [] },
            raw_data_hex: "12",
          }),
          { txID: "aa".repeat(32) },
        ),
      ),
    ).toThrow(/plain object/);
    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        txID: "aa".repeat(32),
        debug: () => "not cloneable",
      }),
    ).toThrow(/JSON-serializable/);
    for (const nonJsonValue of [
      1n,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ]) {
      expect(() =>
        cloneTronWalletConnectTransactionRequest({
          ...valid,
          raw_data: {
            contract: [],
            nonJsonValue,
          },
        }),
      ).toThrow(/JSON-serializable/);
    }
    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        ...valid,
        raw_data: {
          contract: [],
          omittedBeforeWallet: undefined,
        },
      }),
    ).toThrow(/must not contain undefined fields/);
    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        ...valid,
        raw_data: {
          contract: [{ parameter: { value: { owner_address: undefined } } }],
        },
      }),
    ).toThrow(/must not contain undefined fields/);
    const cyclicTransaction = { ...valid } as Record<string, unknown>;
    cyclicTransaction.self = cyclicTransaction;
    expect(() =>
      cloneTronWalletConnectTransactionRequest(cyclicTransaction),
    ).toThrow(/JSON-serializable/);

    const getterBackedTransaction = { ...valid };
    const accessedFields: string[] = [];
    Object.defineProperty(getterBackedTransaction, "raw_data_hex", {
      enumerable: true,
      get() {
        accessedFields.push("raw_data_hex");
        return "12";
      },
    });
    expect(() =>
      cloneTronWalletConnectTransactionRequest(getterBackedTransaction),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(accessedFields).toEqual([]);

    const nestedGetterBackedTransaction = {
      ...valid,
      raw_data: { contract: [{}] },
    };
    const nestedAccessedFields: string[] = [];
    Object.defineProperty(
      nestedGetterBackedTransaction.raw_data.contract[0],
      "secret",
      {
        enumerable: true,
        get() {
          nestedAccessedFields.push("secret");
          return VALID_MNEMONIC;
        },
      },
    );
    expect(() =>
      cloneTronWalletConnectTransactionRequest(nestedGetterBackedTransaction),
    ).toThrow(/enumerable string-keyed data fields/);
    expect(nestedAccessedFields).toEqual([]);

    const symbolBackedTransaction = { ...valid } as Record<
      PropertyKey,
      unknown
    >;
    symbolBackedTransaction[Symbol("privateKeyHex")] = "00".repeat(32);
    expect(() =>
      cloneTronWalletConnectTransactionRequest(
        symbolBackedTransaction as Record<string, unknown>,
      ),
    ).toThrow(/enumerable string-keyed data fields/);

    const hiddenSecretTransaction = { ...valid };
    Object.defineProperty(hiddenSecretTransaction, "privateKeyHex", {
      enumerable: false,
      value: "00".repeat(32),
    });
    expect(() =>
      cloneTronWalletConnectTransactionRequest(hiddenSecretTransaction),
    ).toThrow(/enumerable string-keyed data fields/);

    const sparseContract = [] as Array<Record<string, unknown>>;
    sparseContract.length = 1;
    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        ...valid,
        raw_data: { contract: sparseContract },
      }),
    ).toThrow(/enumerable string-keyed data fields/);

    const contractWithExtraProperty = [{ parameter: { value: {} } }] as Array<
      Record<string, unknown>
    > & { privateKeyHex?: string };
    contractWithExtraProperty.privateKeyHex = "00".repeat(32);
    expect(() =>
      cloneTronWalletConnectTransactionRequest({
        ...valid,
        raw_data: { contract: contractWithExtraProperty },
      }),
    ).toThrow(/enumerable string-keyed data fields/);
  });

  it("clears failed connector initialization so a later connect can retry", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-2",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    });
    const initMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("transient connector load failure"))
      .mockResolvedValueOnce({
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();

    await expect(tron.connect()).rejects.toThrow(
      "transient connector load failure",
    );
    await expect(tron.connect()).resolves.toBeUndefined();

    expect(initMock).toHaveBeenCalledTimes(2);
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);
  });

  it("clears stale metadata when a connected WalletConnect session lacks required TRON signing", async () => {
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "old-topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "new-topic",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            chains: [TRON_MAINNET_CAIP_CHAIN_ID],
            methods: ["tron_signMessage"],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      },
    });
    const disconnectMock = vi.fn();
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

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);

    await expect(tron.connect()).rejects.toThrow(
      "Connected wallet did not approve TRON v1 transaction signing.",
    );
    expect(disconnectMock).toHaveBeenCalledTimes(1);
    expect(tron.address.value).toBe("");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("expires restored WalletConnect metadata before signing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    vi.stubEnv("VITE_SCCP_TRON_NETWORK", "mainnet");
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const unsignedTransaction = {
      visible: true,
      txID: "aa".repeat(32),
      raw_data: { contract: [] },
      raw_data_hex: "12",
    };
    const requestMock = vi.fn();
    const initMock = vi.fn().mockResolvedValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      provider: {
        session: {
          topic: "topic-1",
          namespaces: {
            [WALLETCONNECT_TRON_NAMESPACE]: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              chains: [TRON_MAINNET_CAIP_CHAIN_ID],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
          sessionProperties: {
            tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
          },
        },
      },
      request: requestMock,
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));
    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic-1",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );

    const { useTronWalletConnect } = await import(
      "@/composables/useTronWalletConnect"
    );
    const tron = useTronWalletConnect();
    expect(tron.address.value).toBe(VALID_TRON_ADDRESS);

    vi.setSystemTime(
      new Date(Date.now() + TRON_WALLETCONNECT_SESSION_MAX_AGE_MS + 1),
    );

    await expect(tron.signTransaction(unsignedTransaction)).rejects.toThrow(
      "Reconnect your TRON wallet before signing.",
    );
    expect(initMock).not.toHaveBeenCalled();
    expect(requestMock).not.toHaveBeenCalled();
    expect(tron.address.value).toBe("");
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });
});
