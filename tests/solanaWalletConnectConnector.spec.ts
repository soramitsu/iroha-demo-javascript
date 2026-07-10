import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCCP_SOLANA_NETWORK,
  SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID,
} from "@/utils/sccp";

const VALID_SOLANA_ADDRESS = "11111111111111111111111111111112";
const SOLANA_SIGNATURE =
  "3nUXv2RyNf9K92r8XukE8eTQr8BQjzHDcYFQG9dMbXJQ7VTSk2qpvDzRhAFnP5x5w1GvNpYg6pkpLz41bDwL7o2";
const SOLANA_WALLETCONNECT_STORAGE_KEY = `iroha-demo:sccp:solana-walletconnect:${SCCP_SOLANA_NETWORK.caipChainId.replace(
  /[^a-z0-9_-]/giu,
  "-",
)}`;
const SOLANA_WALLETCONNECT_NAMESPACE = "solana";
const SOLANA_SIGN_TRANSACTION_METHOD = "solana_signTransaction";
const SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD = "solana_signAndSendTransaction";
const WALLETCONNECT_PROJECT_ID = "0123456789abcdef0123456789abcdef";

describe("Solana WalletConnect connector", () => {
  afterEach(() => {
    localStorage.clear();
    vi.unstubAllEnvs();
    vi.doUnmock("@reown/appkit-universal-connector");
    vi.resetModules();
    Reflect.deleteProperty(window, "iroha");
  });

  it("requests canonical Solana testnet WalletConnect signing and stores only metadata", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", WALLETCONNECT_PROJECT_ID);
    const session = {
      topic: "topic-solana",
      namespaces: {
        [SOLANA_WALLETCONNECT_NAMESPACE]: {
          accounts: [
            `${SCCP_SOLANA_NETWORK.caipChainId}:${VALID_SOLANA_ADDRESS}`,
          ],
          chains: [SCCP_SOLANA_NETWORK.caipChainId],
          methods: [
            SOLANA_SIGN_TRANSACTION_METHOD,
            SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
          ],
        },
      },
    };
    const provider: { session: typeof session | null } = { session: null };
    const connectMock = vi.fn().mockImplementation(async () => {
      provider.session = session;
      return { session };
    });
    const initMock = vi.fn().mockResolvedValue({
      connect: connectMock,
      disconnect: vi.fn(),
      provider,
      request: vi.fn(),
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useSolanaWalletConnect } = await import(
      "@/composables/useSolanaWalletConnect"
    );
    const solana = useSolanaWalletConnect();
    await solana.connect();

    expect(initMock).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: WALLETCONNECT_PROJECT_ID,
        networks: [
          expect.objectContaining({
            namespace: SOLANA_WALLETCONNECT_NAMESPACE,
            methods: [
              SOLANA_SIGN_TRANSACTION_METHOD,
              SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
            ],
            chains: [
              expect.objectContaining({
                id: SCCP_SOLANA_NETWORK.caipReference,
                caipNetworkId: SCCP_SOLANA_NETWORK.caipChainId,
                name: "Solana Testnet",
                rpcUrls: {
                  default: {
                    http: [SCCP_SOLANA_NETWORK.rpcUrl],
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
        [SOLANA_WALLETCONNECT_NAMESPACE]: {
          chains: [SCCP_SOLANA_NETWORK.caipChainId],
          methods: [
            SOLANA_SIGN_TRANSACTION_METHOD,
            SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
          ],
          events: ["accountsChanged", "chainChanged"],
        },
      },
    });
    expect(solana.address.value).toBe(VALID_SOLANA_ADDRESS);
    expect(
      JSON.parse(
        localStorage.getItem(SOLANA_WALLETCONNECT_STORAGE_KEY) ?? "null",
      ),
    ).toEqual({
      topic: "topic-solana",
      address: VALID_SOLANA_ADDRESS,
      chainId: SCCP_SOLANA_NETWORK.caipChainId,
      namespace: SOLANA_WALLETCONNECT_NAMESPACE,
      methodVersion: "solana-wallet-standard-v1",
      connectedAtMs: expect.any(Number),
    });
    expect(localStorage.getItem(SOLANA_WALLETCONNECT_STORAGE_KEY)).not.toMatch(
      /private|seed|mnemonic/iu,
    );
  });

  it("sends Solana sign-and-send requests with pubkey and send options", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", WALLETCONNECT_PROJECT_ID);
    const session = {
      topic: "topic-solana",
      namespaces: {
        [SOLANA_WALLETCONNECT_NAMESPACE]: {
          accounts: [
            `${SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID}:${VALID_SOLANA_ADDRESS}`,
          ],
          chains: [SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID],
          methods: [
            SOLANA_SIGN_TRANSACTION_METHOD,
            SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
          ],
        },
      },
    };
    const provider: { session: typeof session | null } = { session: null };
    const requestMock = vi
      .fn()
      .mockResolvedValue({ signature: SOLANA_SIGNATURE });
    const connectMock = vi.fn().mockImplementation(async () => {
      provider.session = session;
      return { session };
    });
    const initMock = vi.fn().mockResolvedValue({
      connect: connectMock,
      disconnect: vi.fn(),
      provider,
      request: requestMock,
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useSolanaWalletConnect } = await import(
      "@/composables/useSolanaWalletConnect"
    );
    const solana = useSolanaWalletConnect();
    await solana.connect();
    await expect(solana.signAndSendTransaction(" AQ== ")).resolves.toBe(
      SOLANA_SIGNATURE,
    );

    expect(requestMock).toHaveBeenCalledWith(
      {
        method: SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
        params: {
          transaction: "AQ==",
          pubkey: VALID_SOLANA_ADDRESS,
          sendOptions: {
            preflightCommitment: "confirmed",
            skipPreflight: false,
          },
        },
      },
      SCCP_SOLANA_NETWORK.caipChainId,
    );
  });

  it("rejects Solana WalletConnect sessions without both signing methods", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", WALLETCONNECT_PROJECT_ID);
    const session = {
      topic: "topic-solana",
      namespaces: {
        [SOLANA_WALLETCONNECT_NAMESPACE]: {
          accounts: [
            `${SCCP_SOLANA_NETWORK.caipChainId}:${VALID_SOLANA_ADDRESS}`,
          ],
          chains: [SCCP_SOLANA_NETWORK.caipChainId],
          methods: [SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD],
        },
      },
    };
    const disconnectMock = vi.fn();
    const initMock = vi.fn().mockResolvedValue({
      connect: vi.fn().mockResolvedValue({ session }),
      disconnect: disconnectMock,
      provider: { session },
      request: vi.fn(),
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useSolanaWalletConnect } = await import(
      "@/composables/useSolanaWalletConnect"
    );
    const solana = useSolanaWalletConnect();

    await expect(solana.connect()).rejects.toThrow(
      /Solana transaction signing/u,
    );
    expect(disconnectMock).toHaveBeenCalled();
    expect(solana.connected.value).toBe(false);
    expect(localStorage.getItem(SOLANA_WALLETCONNECT_STORAGE_KEY)).toBeNull();
  });

  it("sends Solana sign-transaction requests with the connected pubkey", async () => {
    vi.stubEnv("VITE_WALLETCONNECT_PROJECT_ID", WALLETCONNECT_PROJECT_ID);
    const session = {
      topic: "topic-solana",
      namespaces: {
        [SOLANA_WALLETCONNECT_NAMESPACE]: {
          accounts: [
            `${SCCP_SOLANA_NETWORK.caipChainId}:${VALID_SOLANA_ADDRESS}`,
          ],
          chains: [SCCP_SOLANA_NETWORK.caipChainId],
          methods: [
            SOLANA_SIGN_TRANSACTION_METHOD,
            SOLANA_SIGN_AND_SEND_TRANSACTION_METHOD,
          ],
        },
      },
    };
    const provider: { session: typeof session | null } = { session: null };
    const requestMock = vi.fn().mockResolvedValue({ transaction: "Ag==" });
    const connectMock = vi.fn().mockImplementation(async () => {
      provider.session = session;
      return { session };
    });
    const initMock = vi.fn().mockResolvedValue({
      connect: connectMock,
      disconnect: vi.fn(),
      provider,
      request: requestMock,
    });
    vi.doMock("@reown/appkit-universal-connector", () => ({
      UniversalConnector: {
        init: initMock,
      },
    }));

    const { useSolanaWalletConnect } = await import(
      "@/composables/useSolanaWalletConnect"
    );
    const solana = useSolanaWalletConnect();
    await solana.connect();
    await expect(solana.signTransaction(" AQ== ")).resolves.toBe("Ag==");

    expect(requestMock).toHaveBeenCalledWith(
      {
        method: SOLANA_SIGN_TRANSACTION_METHOD,
        params: {
          transaction: "AQ==",
          pubkey: VALID_SOLANA_ADDRESS,
        },
      },
      SCCP_SOLANA_NETWORK.caipChainId,
    );
  });
});
