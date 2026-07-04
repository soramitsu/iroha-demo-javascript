import { afterEach, describe, expect, it } from "vitest";
import {
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
import { solanaWalletConnectSessionFromAddress } from "@/utils/sccp";

const SOLANA_ADDRESS = "11111111111111111111111111111112";
const SOLANA_SIGNATURE =
  "3nUXv2RyNf9K92r8XukE8eTQr8BQjzHDcYFQG9dMbXJQ7VTSk2qpvDzRhAFnP5x5w1GvNpYg6pkpLz41bDwL7o2";

const session = (
  accounts: string[],
  methods = ["solana_signAndSendTransaction"],
) => ({
  topic: "topic-1",
  namespaces: {
    solana: {
      accounts,
      chains: ["solana:testnet"],
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
          chains: ["solana:testnet"],
          methods: ["solana_signTransaction", "solana_signAndSendTransaction"],
          events: ["accountsChanged", "chainChanged"],
        },
      },
    });
  });

  it("extracts exactly one Solana testnet account", () => {
    const connected = session([`solana:testnet:${SOLANA_ADDRESS}`]);
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
          `solana:testnet:${SOLANA_ADDRESS}`,
          "solana:testnet:11111111111111111111111111111113",
        ]),
      ),
    ).toThrow(/multiple Solana accounts/u);
    expect(
      solanaWalletConnectSessionSupportsRequiredSigning(
        session(
          [`solana:testnet:${SOLANA_ADDRESS}`],
          ["solana_signTransaction"],
        ),
      ),
    ).toBe(false);
  });

  it("normalizes project ids and wallet responses", () => {
    expect(normalizeSolanaWalletConnectProjectId(" abc123 ")).toBe("abc123");
    expect(() => normalizeSolanaWalletConnectProjectId("https://bad")).toThrow(
      /WalletConnect project ID/u,
    );
    expect(
      normalizeSolanaWalletSignature({ signature: SOLANA_SIGNATURE }),
    ).toBe(SOLANA_SIGNATURE);
    expect(
      normalizeSolanaWalletSignedTransaction({ transaction: "AQ==" }),
    ).toBe("AQ==");
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
      chainId: "solana:testnet",
      namespace: "solana",
    });
    expect(
      window.localStorage.getItem("iroha-demo:sccp:solana-walletconnect"),
    ).toBeNull();
  });
});
