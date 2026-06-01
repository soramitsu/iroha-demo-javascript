import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TRON_MAINNET_CAIP_CHAIN_ID,
  TRON_MAINNET_RPC_URL,
  WALLETCONNECT_TRON_METHOD_VERSION,
  WALLETCONNECT_TRON_NAMESPACE,
  WALLETCONNECT_TRON_SIGN_METHOD,
} from "@/utils/sccp";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";

describe("TRON WalletConnect connector", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.doUnmock("@reown/appkit-universal-connector");
    vi.resetModules();
  });

  it("requests official TRON mainnet v1 transaction signing and stores only metadata", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-1",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
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
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    });
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

  it("sends tron_signTransaction with the documented v1 request shape", async () => {
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

  it("clears failed connector initialization so a later connect can retry", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", "test-project");
    const connectMock = vi.fn().mockResolvedValue({
      session: {
        topic: "topic-2",
        namespaces: {
          [WALLETCONNECT_TRON_NAMESPACE]: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
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
});
