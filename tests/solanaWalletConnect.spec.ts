import { afterEach, describe, expect, it } from "vitest";
import {
  createSolanaWalletConnectSignAndSendTransactionParams,
  createSolanaWalletConnectSignTransactionParams,
  createSolanaWalletConnectConnectParams,
  extractSolanaAddressFromSession,
  isFreshSolanaWalletConnectSessionTimestamp,
  normalizeSolanaWalletConnectProjectId,
  normalizeSolanaWalletSignature,
  normalizeSolanaWalletSignedTransaction,
  readStoredSolanaWalletConnectSession,
  solanaWalletConnectSessionSupportsRequiredSigning,
  writeStoredSolanaWalletConnectSession,
} from "@/composables/useSolanaWalletConnect";
import {
  SCCP_SOLANA_NETWORK,
  SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID,
  solanaWalletConnectSessionFromAddress,
} from "@/utils/sccp";

const SOLANA_ADDRESS = "11111111111111111111111111111112";
const WALLETCONNECT_PROJECT_ID = "0123456789abcdef0123456789abcdef";
const SOLANA_SIGNATURE =
  "3nUXv2RyNf9K92r8XukE8eTQr8BQjzHDcYFQG9dMbXJQ7VTSk2qpvDzRhAFnP5x5w1GvNpYg6pkpLz41bDwL7o2";

const session = (
  accounts: string[],
  methods = ["solana_signTransaction", "solana_signAndSendTransaction"],
) => ({
  topic: "topic-1",
  namespaces: {
    solana: {
      accounts,
      chains: [SCCP_SOLANA_NETWORK.caipChainId],
      methods,
    },
  },
});

describe("Solana WalletConnect helpers", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("builds a Solana testnet WalletConnect proposal", () => {
    expect(createSolanaWalletConnectConnectParams()).toEqual({
      namespaces: {
        solana: {
          chains: [SCCP_SOLANA_NETWORK.caipChainId],
          methods: ["solana_signTransaction", "solana_signAndSendTransaction"],
          events: ["accountsChanged", "chainChanged"],
        },
      },
    });
  });

  it("extracts exactly one Solana testnet account", () => {
    const connected = session([
      `${SCCP_SOLANA_NETWORK.caipChainId}:${SOLANA_ADDRESS}`,
    ]);
    expect(extractSolanaAddressFromSession(connected)).toBe(SOLANA_ADDRESS);
    expect(solanaWalletConnectSessionSupportsRequiredSigning(connected)).toBe(
      true,
    );
  });

  it("accepts the Solana wallet-standard testnet account alias", () => {
    const connected = session([
      `${SOLANA_TESTNET_WALLET_STANDARD_CHAIN_ID}:${SOLANA_ADDRESS}`,
    ]);
    expect(extractSolanaAddressFromSession(connected)).toBe(SOLANA_ADDRESS);
    expect(solanaWalletConnectSessionSupportsRequiredSigning(connected)).toBe(
      true,
    );
  });

  it("rejects unsupported or ambiguous Solana sessions", () => {
    expect(() =>
      extractSolanaAddressFromSession(
        session([`solana:mainnet:${SOLANA_ADDRESS}`]),
      ),
    ).toThrow(/unsupported Solana accounts/u);
    expect(() =>
      extractSolanaAddressFromSession(
        session([
          `${SCCP_SOLANA_NETWORK.caipChainId}:${SOLANA_ADDRESS}`,
          `${SCCP_SOLANA_NETWORK.caipChainId}:11111111111111111111111111111113`,
        ]),
      ),
    ).toThrow(/multiple Solana accounts/u);
    expect(
      solanaWalletConnectSessionSupportsRequiredSigning(
        session(
          [`${SCCP_SOLANA_NETWORK.caipChainId}:${SOLANA_ADDRESS}`],
          ["solana_signTransaction"],
        ),
      ),
    ).toBe(false);
    expect(
      solanaWalletConnectSessionSupportsRequiredSigning(
        session(
          [`${SCCP_SOLANA_NETWORK.caipChainId}:${SOLANA_ADDRESS}`],
          ["solana_signAndSendTransaction"],
        ),
      ),
    ).toBe(false);
  });

  it("normalizes project ids and wallet responses", () => {
    expect(
      normalizeSolanaWalletConnectProjectId(` ${WALLETCONNECT_PROJECT_ID} `),
    ).toBe(WALLETCONNECT_PROJECT_ID);
    expect(() => normalizeSolanaWalletConnectProjectId("abc123")).toThrow(
      /32-character hex/u,
    );
    expect(() => normalizeSolanaWalletConnectProjectId("https://bad")).toThrow(
      /WalletConnect project ID/u,
    );
    expect(
      normalizeSolanaWalletSignature({ signature: SOLANA_SIGNATURE }),
    ).toBe(SOLANA_SIGNATURE);
    expect(
      normalizeSolanaWalletSignedTransaction({ transaction: "AQ==" }),
    ).toBe("AQ==");
    expect(() => normalizeSolanaWalletSignature("2".repeat(64))).toThrow(
      /valid transaction signature/u,
    );
    expect(() =>
      normalizeSolanaWalletSignedTransaction({
        transaction: globalThis.btoa("x".repeat(1233)),
      }),
    ).toThrow(/canonical Solana transaction bytes/u);
  });

  it("builds Reown-compatible Solana signing request params", () => {
    expect(
      createSolanaWalletConnectSignTransactionParams(" AQ== ", SOLANA_ADDRESS),
    ).toEqual({
      transaction: "AQ==",
      pubkey: SOLANA_ADDRESS,
    });
    expect(
      createSolanaWalletConnectSignAndSendTransactionParams(
        " AQ== ",
        SOLANA_ADDRESS,
      ),
    ).toEqual({
      transaction: "AQ==",
      pubkey: SOLANA_ADDRESS,
      sendOptions: {
        preflightCommitment: "confirmed",
        skipPreflight: false,
      },
    });
  });

  it("persists only fresh metadata sessions", () => {
    const snapshot = solanaWalletConnectSessionFromAddress(
      SOLANA_ADDRESS,
      "topic-1",
    );
    expect(
      isFreshSolanaWalletConnectSessionTimestamp(snapshot.connectedAtMs),
    ).toBe(true);
    writeStoredSolanaWalletConnectSession(snapshot);
    expect(readStoredSolanaWalletConnectSession()).toMatchObject({
      address: SOLANA_ADDRESS,
      topic: "topic-1",
      chainId: SCCP_SOLANA_NETWORK.caipChainId,
      namespace: "solana",
    });
    expect(
      window.localStorage.getItem("iroha-demo:sccp:solana-walletconnect"),
    ).toBeNull();
  });
});
