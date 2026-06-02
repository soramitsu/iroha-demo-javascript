import { afterEach, describe, expect, it } from "vitest";
import {
  createTronWalletConnectConnectParams,
  extractTronAddressFromSession,
  isFreshTronWalletConnectSessionTimestamp,
  readStoredTronWalletConnectSession,
  TRON_WALLETCONNECT_SESSION_MAX_AGE_MS,
  tronWalletConnectSessionMatchesSnapshot,
  tronWalletConnectSessionSupportsRequiredSigning,
  writeStoredTronWalletConnectSession,
} from "@/composables/useTronWalletConnect";
import {
  TRON_MAINNET_CAIP_CHAIN_ID,
  WALLETCONNECT_TRON_METHOD_VERSION,
  WALLETCONNECT_TRON_NAMESPACE,
  WALLETCONNECT_TRON_SIGN_METHOD,
  walletConnectSessionFromAddress,
} from "@/utils/sccp";

const VALID_TRON_ADDRESS = "TJRabPrwbZy45sbavfcjinPJC18kjpRTv8";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

describe("TRON WalletConnect state", () => {
  afterEach(() => {
    localStorage.clear();
  });

  it("builds a narrow official TRON mainnet connect request", () => {
    expect(createTronWalletConnectConnectParams()).toEqual({
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
    expect(
      createTronWalletConnectConnectParams().namespaces[
        WALLETCONNECT_TRON_NAMESPACE
      ].methods,
    ).not.toContain("tron_sendTransaction");
  });

  it("extracts the official TRON mainnet account from a WalletConnect session", () => {
    expect(
      extractTronAddressFromSession({
        topic: "topic",
        namespaces: {
          tron: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            methods: [WALLETCONNECT_TRON_SIGN_METHOD],
          },
        },
        sessionProperties: {
          tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
        },
      }),
    ).toBe(VALID_TRON_ADDRESS);
  });

  it("ignores sessions without a TRON mainnet account", () => {
    expect(
      extractTronAddressFromSession({
        namespaces: {
          tron: {
            accounts: [`tron:0x00000000:${VALID_TRON_ADDRESS}`],
          },
        },
      }),
    ).toBeNull();
    expect(
      extractTronAddressFromSession({
        namespaces: {
          tron: {
            accounts:
              `${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}` as unknown as string[],
          },
        },
      }),
    ).toBeNull();
  });

  it("persists only non-secret WalletConnect metadata", () => {
    writeStoredTronWalletConnectSession(
      walletConnectSessionFromAddress(VALID_TRON_ADDRESS, "topic"),
    );

    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toContain(VALID_TRON_ADDRESS);
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).not.toMatch(/private|seed|mnemonic/iu);
    expect(readStoredTronWalletConnectSession()).toMatchObject({
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
      namespace: WALLETCONNECT_TRON_NAMESPACE,
      methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
    });
  });

  it("scrubs unexpected fields from accepted persisted metadata", () => {
    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: TRON_MAINNET_CAIP_CHAIN_ID,
        namespace: WALLETCONNECT_TRON_NAMESPACE,
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
        privateKey: "do-not-keep",
        mnemonic: "do not keep this either",
      }),
    );

    expect(readStoredTronWalletConnectSession()).toMatchObject({
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      connectedAtMs: expect.any(Number),
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).not.toMatch(/privateKey|mnemonic|do-not-keep/iu);
  });

  it("requires official TRON v1 transaction signing in connected sessions", () => {
    const session = {
      namespaces: {
        tron: {
          accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
          methods: [WALLETCONNECT_TRON_SIGN_METHOD],
        },
      },
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    };

    expect(tronWalletConnectSessionSupportsRequiredSigning(session)).toBe(true);
    expect(
      tronWalletConnectSessionSupportsRequiredSigning({
        ...session,
        namespaces: {
          tron: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            methods: ["tron_signMessage"],
          },
        },
      }),
    ).toBe(false);
    expect(
      tronWalletConnectSessionSupportsRequiredSigning({
        ...session,
        sessionProperties: {
          tron_method_version: "legacy",
        },
      }),
    ).toBe(false);
    expect(
      tronWalletConnectSessionSupportsRequiredSigning({
        ...session,
        namespaces: {
          tron: {
            accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
            methods: WALLETCONNECT_TRON_SIGN_METHOD as unknown as string[],
          },
        },
      }),
    ).toBe(false);
    expect(
      tronWalletConnectSessionSupportsRequiredSigning({
        ...session,
        sessionProperties: {
          tron_method_version: [
            WALLETCONNECT_TRON_METHOD_VERSION,
          ] as unknown as string,
        },
      }),
    ).toBe(false);
  });

  it("matches active WalletConnect sessions to stored non-secret snapshots", () => {
    const session = {
      topic: "topic",
      namespaces: {
        tron: {
          accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
          methods: [WALLETCONNECT_TRON_SIGN_METHOD],
        },
      },
      sessionProperties: {
        tron_method_version: WALLETCONNECT_TRON_METHOD_VERSION,
      },
    };
    const snapshot = walletConnectSessionFromAddress(
      VALID_TRON_ADDRESS,
      "topic",
    );

    expect(tronWalletConnectSessionMatchesSnapshot(session, snapshot)).toBe(
      true,
    );
    expect(
      tronWalletConnectSessionMatchesSnapshot(
        {
          ...session,
          topic: "other-topic",
        },
        snapshot,
      ),
    ).toBe(false);
    expect(
      tronWalletConnectSessionMatchesSnapshot(
        {
          ...session,
          namespaces: {
            tron: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:${VALID_TRON_ADDRESS}`],
              methods: ["tron_signMessage"],
            },
          },
        },
        snapshot,
      ),
    ).toBe(false);
    expect(
      tronWalletConnectSessionMatchesSnapshot(
        {
          ...session,
          namespaces: {
            tron: {
              accounts: [`${TRON_MAINNET_CAIP_CHAIN_ID}:not-a-tron-address`],
              methods: [WALLETCONNECT_TRON_SIGN_METHOD],
            },
          },
        },
        snapshot,
      ),
    ).toBe(false);
    expect(
      tronWalletConnectSessionMatchesSnapshot(
        {
          ...session,
          topic: undefined,
        },
        snapshot,
      ),
    ).toBe(false);
    expect(
      tronWalletConnectSessionMatchesSnapshot(session, {
        ...snapshot,
        topic: null,
      }),
    ).toBe(false);
    expect(
      tronWalletConnectSessionMatchesSnapshot(session, {
        ...snapshot,
        connectedAtMs: Date.now() - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS - 1,
      }),
    ).toBe(false);
    expect(tronWalletConnectSessionMatchesSnapshot(null, snapshot)).toBe(false);
  });

  it("drops stale or mismatched persisted WalletConnect metadata", () => {
    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        topic: "topic",
        address: VALID_TRON_ADDRESS,
        chainId: "tron:0x00000000",
        namespace: "tron",
        methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
        connectedAtMs: Date.now(),
      }),
    );

    expect(readStoredTronWalletConnectSession()).toBeNull();
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("drops expired, future-dated, and malformed persisted WalletConnect metadata", () => {
    const baseSnapshot = {
      topic: "topic",
      address: VALID_TRON_ADDRESS,
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
      namespace: WALLETCONNECT_TRON_NAMESPACE,
      methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
    };

    for (const connectedAtMs of [
      Date.now() - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS - 1,
      Date.now() + 10 * 60 * 1000,
    ]) {
      localStorage.setItem(
        "iroha-demo:sccp:tron-walletconnect",
        JSON.stringify({
          ...baseSnapshot,
          connectedAtMs,
        }),
      );

      expect(readStoredTronWalletConnectSession()).toBeNull();
      expect(
        localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
      ).toBeNull();
    }

    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        ...baseSnapshot,
        topic: ["not", "a", "topic"],
        connectedAtMs: Date.now(),
      }),
    );

    expect(readStoredTronWalletConnectSession()).toBeNull();
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();

    for (const topic of [
      "topic with spaces",
      VALID_MNEMONIC,
      "topic\nwith-control",
    ]) {
      localStorage.setItem(
        "iroha-demo:sccp:tron-walletconnect",
        JSON.stringify({
          ...baseSnapshot,
          topic,
          connectedAtMs: Date.now(),
        }),
      );

      expect(readStoredTronWalletConnectSession()).toBeNull();
      expect(
        localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
      ).toBeNull();
    }

    localStorage.setItem(
      "iroha-demo:sccp:tron-walletconnect",
      JSON.stringify({
        ...baseSnapshot,
        topic: "",
        connectedAtMs: Date.now(),
      }),
    );

    expect(readStoredTronWalletConnectSession()).toBeNull();
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("refuses to persist stale or wrong-chain WalletConnect snapshots", () => {
    writeStoredTronWalletConnectSession({
      ...walletConnectSessionFromAddress(VALID_TRON_ADDRESS, "topic"),
      connectedAtMs: Date.now() - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS - 1,
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();

    writeStoredTronWalletConnectSession({
      ...walletConnectSessionFromAddress(VALID_TRON_ADDRESS, "topic"),
      chainId: "tron:0x00000000",
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();

    writeStoredTronWalletConnectSession(
      walletConnectSessionFromAddress(VALID_TRON_ADDRESS, null),
    );
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();

    writeStoredTronWalletConnectSession({
      topic: "topic",
      address: "not-a-tron-address",
      chainId: TRON_MAINNET_CAIP_CHAIN_ID,
      namespace: WALLETCONNECT_TRON_NAMESPACE,
      methodVersion: WALLETCONNECT_TRON_METHOD_VERSION,
      connectedAtMs: Date.now(),
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();

    writeStoredTronWalletConnectSession({
      ...walletConnectSessionFromAddress(
        VALID_TRON_ADDRESS,
        "topic with space",
      ),
    });
    expect(
      localStorage.getItem("iroha-demo:sccp:tron-walletconnect"),
    ).toBeNull();
  });

  it("validates WalletConnect metadata timestamps with a bounded future skew", () => {
    const now = Date.now();

    expect(isFreshTronWalletConnectSessionTimestamp(now, now)).toBe(true);
    expect(
      isFreshTronWalletConnectSessionTimestamp(
        now - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS,
        now,
      ),
    ).toBe(true);
    expect(
      isFreshTronWalletConnectSessionTimestamp(
        now - TRON_WALLETCONNECT_SESSION_MAX_AGE_MS - 1,
        now,
      ),
    ).toBe(false);
    expect(
      isFreshTronWalletConnectSessionTimestamp(now + 10 * 60 * 1000, now),
    ).toBe(false);
    expect(isFreshTronWalletConnectSessionTimestamp("now", now)).toBe(false);
  });
});
