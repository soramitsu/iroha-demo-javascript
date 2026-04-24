import { describe, expect, it } from "vitest";
import { AccountAddress } from "@iroha/iroha-js";
import {
  buildToriiSurfaceProbeUrls,
  buildToriiMcpToolsListRequest,
  extractToriiMcpToolNames,
  findMissingToriiVpnMcpTools,
  findMissingToriiVpnOpenApiPaths,
  formatSurfaceProbeAttempt,
  decimalQuantityEquals,
  extractTransactionHashHex,
  isOnboardingBadRequestError,
  isOnboardingConflictError,
  isOnboardingDisabledError,
  isRetryableFaucetBadRequest,
  isSupportedAccountIdLiteral,
  parseCachedFundedWalletRecord,
  parseFundedEnvConfig,
  parseOnboardingEnvConfig,
  parseNetworkPrefix,
  resolveOptionalAliasRegistrationOutcome,
  summarizePublicFinalityDiagnostic,
} from "../scripts/e2e/electron-live-utils.mjs";

const sampleI105AccountId = AccountAddress.fromAccount({
  publicKey: Buffer.from(
    "CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03",
    "hex",
  ),
}).toI105(369);

describe("electron live e2e utils", () => {
  it("builds TAIRA surface probe URLs from a base Torii URL", () => {
    expect(buildToriiSurfaceProbeUrls("https://taira.sora.org")).toEqual({
      healthUrls: [
        "https://taira.sora.org/v1/health",
        "https://taira.sora.org/health",
      ],
      mcpUrl: "https://taira.sora.org/v1/mcp",
      openApiUrl: "https://taira.sora.org/openapi.json",
      vpnProfileUrl: "https://taira.sora.org/v1/vpn/profile",
    });
    expect(buildToriiSurfaceProbeUrls("https://taira.sora.org/")).toEqual({
      healthUrls: [
        "https://taira.sora.org/v1/health",
        "https://taira.sora.org/health",
      ],
      mcpUrl: "https://taira.sora.org/v1/mcp",
      openApiUrl: "https://taira.sora.org/openapi.json",
      vpnProfileUrl: "https://taira.sora.org/v1/vpn/profile",
    });
  });

  it("rejects empty base URLs for surface probes", () => {
    expect(() => buildToriiSurfaceProbeUrls("")).toThrow(
      "Torii base URL must not be empty.",
    );
    expect(() => buildToriiSurfaceProbeUrls("   ")).toThrow(
      "Torii base URL must not be empty.",
    );
  });

  it("formats surface probe failures with trimmed body snippets", () => {
    expect(
      formatSurfaceProbeAttempt(
        "https://taira.sora.org/v1/vpn/profile",
        404,
        "Not Found",
        "  missing route  ",
      ),
    ).toBe(
      "https://taira.sora.org/v1/vpn/profile -> 404 Not Found: missing route",
    );
    expect(
      formatSurfaceProbeAttempt("https://taira.sora.org/v1/mcp", 200, "OK", ""),
    ).toBe("https://taira.sora.org/v1/mcp -> 200 OK");
  });

  it("builds a JSON-RPC tools/list request for MCP discovery", () => {
    expect(buildToriiMcpToolsListRequest()).toEqual({
      jsonrpc: "2.0",
      id: "taira-vpn-surface",
      method: "tools/list",
      params: {},
    });
    expect(buildToriiMcpToolsListRequest("custom-id")).toEqual({
      jsonrpc: "2.0",
      id: "custom-id",
      method: "tools/list",
      params: {},
    });
  });

  it("extracts MCP tool names and reports missing VPN tools", () => {
    const payload = {
      result: {
        tools: [
          { name: "iroha.health" },
          { name: "iroha.vpn.profile" },
          { name: "iroha.vpn.sessions.create" },
          { name: "iroha.vpn.receipts.list" },
        ],
      },
    };
    expect(extractToriiMcpToolNames(payload)).toEqual([
      "iroha.health",
      "iroha.vpn.profile",
      "iroha.vpn.sessions.create",
      "iroha.vpn.receipts.list",
    ]);
    expect(findMissingToriiVpnMcpTools(payload)).toEqual([
      "iroha.vpn.sessions.get",
      "iroha.vpn.sessions.delete",
    ]);
    expect(findMissingToriiVpnMcpTools({ result: { tools: [] } })).toEqual([
      "iroha.vpn.profile",
      "iroha.vpn.sessions.create",
      "iroha.vpn.sessions.get",
      "iroha.vpn.sessions.delete",
      "iroha.vpn.receipts.list",
    ]);
  });

  it("reports missing VPN OpenAPI paths", () => {
    expect(
      findMissingToriiVpnOpenApiPaths({
        paths: {
          "/v1/vpn/profile": {},
          "/v1/vpn/sessions": {},
        },
      }),
    ).toEqual(["/v1/vpn/sessions/{session_id}", "/v1/vpn/receipts"]);
    expect(findMissingToriiVpnOpenApiPaths({ paths: {} })).toEqual([
      "/v1/vpn/profile",
      "/v1/vpn/sessions",
      "/v1/vpn/sessions/{session_id}",
      "/v1/vpn/receipts",
    ]);
  });

  it("parses valid network prefixes with TAIRA default fallback", () => {
    expect(parseNetworkPrefix(undefined)).toBe(369);
    expect(parseNetworkPrefix("369")).toBe(369);
    expect(parseNetworkPrefix("0")).toBe(0);
    expect(parseNetworkPrefix("16383")).toBe(16383);
  });

  it("rejects invalid network prefixes", () => {
    expect(() => parseNetworkPrefix("-1")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 16383.",
    );
    expect(() => parseNetworkPrefix("16384")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 16383.",
    );
    expect(() => parseNetworkPrefix("1.5")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 16383.",
    );
    expect(() => parseNetworkPrefix("abc")).toThrow(
      "E2E_NETWORK_PREFIX must be an integer from 0 to 16383.",
    );
  });

  it("accepts canonical I105 account ids", () => {
    expect(isSupportedAccountIdLiteral(sampleI105AccountId)).toBe(true);
  });

  it("rejects unsupported or malformed account id literals", () => {
    expect(isSupportedAccountIdLiteral("")).toBe(false);
    expect(isSupportedAccountIdLiteral("   ")).toBe(false);
    expect(isSupportedAccountIdLiteral(null)).toBe(false);
    expect(isSupportedAccountIdLiteral(undefined)).toBe(false);
    expect(isSupportedAccountIdLiteral("i105:xyz")).toBe(false);
    expect(isSupportedAccountIdLiteral("sora:xyz")).toBe(false);
    expect(isSupportedAccountIdLiteral("uaid:abc")).toBe(false);
    expect(isSupportedAccountIdLiteral("opaque:abc")).toBe(false);
    expect(isSupportedAccountIdLiteral("0xabc@wonderland")).toBe(false);
    expect(isSupportedAccountIdLiteral("alice")).toBe(false);
    expect(
      isSupportedAccountIdLiteral(
        "ed0120CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03@wonderland",
      ),
    ).toBe(false);
  });

  it("detects onboarding-disabled responses from status text", () => {
    expect(
      isOnboardingDisabledError("Onboarding failed with status 403 ()"),
    ).toBe(true);
    expect(isOnboardingDisabledError("status403")).toBe(false);
    expect(isOnboardingDisabledError("status 404")).toBe(false);
    expect(isOnboardingDisabledError("")).toBe(false);
    expect(isOnboardingDisabledError(null)).toBe(false);
  });

  it("detects onboarding-bad-request responses from status text", () => {
    expect(
      isOnboardingBadRequestError(
        "Alias registration failed with status 400 (Bad Request)",
      ),
    ).toBe(true);
    expect(isOnboardingBadRequestError("status400")).toBe(false);
    expect(isOnboardingBadRequestError("status 403")).toBe(false);
    expect(isOnboardingBadRequestError("")).toBe(false);
    expect(isOnboardingBadRequestError(null)).toBe(false);
  });

  it("detects onboarding-conflict responses from status text", () => {
    expect(
      isOnboardingConflictError("Onboarding failed with status 409 (Conflict)"),
    ).toBe(true);
    expect(isOnboardingConflictError("status409")).toBe(false);
    expect(isOnboardingConflictError("status 403")).toBe(false);
    expect(isOnboardingConflictError("")).toBe(false);
    expect(isOnboardingConflictError(null)).toBe(false);
  });

  it("classifies optional alias registration outcomes", () => {
    expect(resolveOptionalAliasRegistrationOutcome("ok", "")).toBe("executed");
    expect(
      resolveOptionalAliasRegistrationOutcome(
        "error",
        "Alias registration failed with status 403 (Forbidden)",
      ),
    ).toBe("skipped");
    expect(
      resolveOptionalAliasRegistrationOutcome(
        "error",
        "Alias registration failed with status 400 (Bad Request)",
      ),
    ).toBe("skipped");
    expect(
      resolveOptionalAliasRegistrationOutcome(
        "error",
        "Alias registration failed with status 409 (Conflict)",
      ),
    ).toBe("executed");
    expect(() =>
      resolveOptionalAliasRegistrationOutcome(
        "error",
        "Alias registration failed with status 500 (Internal Server Error)",
      ),
    ).toThrow(
      "Optional alias registration probe failed: Alias registration failed with status 500 (Internal Server Error)",
    );
  });

  it("detects retryable faucet 400 responses", () => {
    expect(
      isRetryableFaucetBadRequest(
        "Faucet request failed (400): TAIRA rejected this faucet claim. Stale faucet proof challenges can trigger this response; request a fresh puzzle and try again.",
      ),
    ).toBe(true);
    expect(
      isRetryableFaucetBadRequest(
        "Faucet request failed (400): some unrelated bad request",
      ),
    ).toBe(false);
    expect(
      isRetryableFaucetBadRequest(
        "Faucet request failed (500): stale faucet proof challenges can also trigger this response.",
      ),
    ).toBe(false);
  });

  it("compares decimal faucet quantities after trimming insignificant zeros", () => {
    expect(decimalQuantityEquals("25000", "25000")).toBe(true);
    expect(decimalQuantityEquals("25000.00000", "25000")).toBe(true);
    expect(decimalQuantityEquals("025000.0100", "25000.01")).toBe(true);
    expect(decimalQuantityEquals("1000", "25000")).toBe(false);
    expect(decimalQuantityEquals("", "25000")).toBe(false);
    expect(decimalQuantityEquals("25000 XOR", "25000")).toBe(false);
  });

  it("parses onboarding env defaults when vars are absent", () => {
    expect(parseOnboardingEnvConfig({})).toEqual({
      alias: "e2e-onboarding-shared@universal",
      privateKeyHex:
        "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7",
      offlineBalance: "100",
    });
  });

  it("parses explicit onboarding env vars", () => {
    expect(
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_ALIAS: "  QA Shared Alias  ",
        E2E_ONBOARDING_PRIVATE_KEY_HEX:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        E2E_ONBOARDING_OFFLINE_BALANCE: "2500",
      }),
    ).toEqual({
      alias: "QA Shared Alias",
      privateKeyHex:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      offlineBalance: "2500",
    });
  });

  it("rejects deprecated onboarding env var names", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).toThrow("Deprecated onboarding env vars are no longer supported");
  });

  it("reports all deprecated onboarding env var names that are set", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_ALIAS: "legacy-alias",
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
      }),
    ).toThrow("E2E_STATEFUL_ALIAS, E2E_STATEFUL_OFFLINE_BALANCE");
  });

  it("reports deprecated onboarding vars in stable declaration order", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        E2E_STATEFUL_ALIAS: "legacy-alias",
      }),
    ).toThrow(
      "E2E_STATEFUL_ALIAS, E2E_STATEFUL_PRIVATE_KEY_HEX, E2E_STATEFUL_OFFLINE_BALANCE",
    );
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_STATEFUL_OFFLINE_BALANCE: "50",
        E2E_STATEFUL_PRIVATE_KEY_HEX:
          "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        E2E_STATEFUL_ALIAS: "legacy-alias",
      }),
    ).toThrow(
      "E2E_STATEFUL_ALIAS -> E2E_ONBOARDING_ALIAS, E2E_STATEFUL_PRIVATE_KEY_HEX -> E2E_ONBOARDING_PRIVATE_KEY_HEX, E2E_STATEFUL_OFFLINE_BALANCE -> E2E_ONBOARDING_OFFLINE_BALANCE",
    );
  });

  it("ignores whitespace-only deprecated env var values", () => {
    expect(
      parseOnboardingEnvConfig({
        E2E_STATEFUL_ALIAS: "   ",
      }),
    ).toEqual({
      alias: "e2e-onboarding-shared@universal",
      privateKeyHex:
        "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7",
      offlineBalance: "100",
    });
  });

  it("rejects invalid onboarding private key values", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_PRIVATE_KEY_HEX: "abc",
      }),
    ).toThrow(
      "E2E_ONBOARDING_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
    );
  });

  it("rejects invalid onboarding offline balance values", () => {
    expect(() =>
      parseOnboardingEnvConfig({
        E2E_ONBOARDING_OFFLINE_BALANCE: "0",
      }),
    ).toThrow(
      "E2E_ONBOARDING_OFFLINE_BALANCE must be a positive numeric string.",
    );
  });

  it("returns null when no funded-wallet override is set", () => {
    expect(parseFundedEnvConfig({})).toBeNull();
  });

  it("parses funded-wallet env vars", () => {
    expect(
      parseFundedEnvConfig({
        E2E_FUNDED_PRIVATE_KEY_HEX:
          "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        E2E_FUNDED_DOMAIN: "  treasury  ",
      }),
    ).toEqual({
      privateKeyHex:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      domain: "treasury",
    });
  });

  it("defaults the funded-wallet domain to default", () => {
    expect(
      parseFundedEnvConfig({
        E2E_FUNDED_PRIVATE_KEY_HEX:
          "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      }),
    ).toEqual({
      privateKeyHex:
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      domain: "default",
    });
  });

  it("rejects invalid funded-wallet private key values", () => {
    expect(() =>
      parseFundedEnvConfig({
        E2E_FUNDED_PRIVATE_KEY_HEX: "abc",
      }),
    ).toThrow(
      "E2E_FUNDED_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
    );
  });

  it("returns null for missing cached funded-wallet payloads", () => {
    expect(parseCachedFundedWalletRecord(null)).toBeNull();
    expect(parseCachedFundedWalletRecord(undefined)).toBeNull();
    expect(parseCachedFundedWalletRecord({})).toBeNull();
    expect(parseCachedFundedWalletRecord([])).toBeNull();
  });

  it("parses cached funded-wallet records", () => {
    expect(
      parseCachedFundedWalletRecord({
        privateKeyHex:
          "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
        domain: "  treasury  ",
        accountId: ` ${sampleI105AccountId} `,
        assetId: " xor#test-account ",
        assetDefinitionId: " xor ",
        cachedAt: " 2026-04-16T12:00:00.000Z ",
      }),
    ).toEqual({
      privateKeyHex:
        "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      domain: "treasury",
      accountId: sampleI105AccountId,
      assetId: "xor#test-account",
      assetDefinitionId: "xor",
      cachedAt: "2026-04-16T12:00:00.000Z",
    });
  });

  it("defaults cached funded-wallet domains to default", () => {
    expect(
      parseCachedFundedWalletRecord({
        privateKeyHex:
          "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
      }),
    ).toEqual({
      privateKeyHex:
        "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      domain: "default",
      accountId: "",
      assetId: "",
      assetDefinitionId: "",
      cachedAt: "",
    });
  });

  it("rejects invalid cached funded-wallet private keys", () => {
    expect(() =>
      parseCachedFundedWalletRecord({
        privateKeyHex: "abc",
      }),
    ).toThrow(
      "Cached funded wallet privateKeyHex must be a 64-character hexadecimal string.",
    );
  });

  it("extracts transaction hashes from timeout details", () => {
    expect(
      extractTransactionHashHex(
        "Transaction BB939A46A679E4D79B1533239D04CF43CB4B1F9A79ECC9AD7D0175CE697923ED did not reach a terminal status within 180000ms",
      ),
    ).toBe("bb939a46a679e4d79b1533239d04cf43cb4b1f9a79ecc9ad7d0175ce697923ed");
    expect(
      extractTransactionHashHex(
        "Faucet claim 92832455f5657312325370bce215055d9b7b4e894d2294de9d42c11f7c5715db stayed queued and did not finalize within 240 seconds.",
      ),
    ).toBe("92832455f5657312325370bce215055d9b7b4e894d2294de9d42c11f7c5715db");
    expect(extractTransactionHashHex("no hash here")).toBeNull();
  });

  it("summarizes public finality diagnostics", () => {
    expect(
      summarizePublicFinalityDiagnostic({
        txHashHex:
          "bb939a46a679e4d79b1533239d04cf43cb4b1f9a79ecc9ad7d0175ce697923ed",
        txStatusPayload: {
          status: {
            kind: "Queued",
          },
        },
        statusPayload: {
          blocks: 720,
          queue_size: 0,
          view_changes: 119,
          sumeragi: {
            commit_qc_height: 720,
            tx_queue_depth: 0,
            tx_queue_saturated: false,
            highest_qc_height: 714,
            locked_qc_height: 714,
          },
        },
        sumeragiPayload: {
          membership: {
            height: 721,
          },
          view_change_causes: {
            last_cause: "quorum_timeout",
          },
        },
        blocksPayload: {
          items: [
            {
              height: 720,
              created_at: "2026-04-16T12:19:33.459Z",
            },
          ],
        },
      }),
    ).toEqual({
      txHashHex:
        "bb939a46a679e4d79b1533239d04cf43cb4b1f9a79ecc9ad7d0175ce697923ed",
      txStatus: "Queued",
      blocks: 720,
      queueSize: 0,
      txQueueDepth: 0,
      txQueueSaturated: false,
      commitQcHeight: 720,
      highestQcHeight: 714,
      lockedQcHeight: 714,
      membershipHeight: 721,
      viewChanges: 119,
      viewChangeCause: "quorum_timeout",
      latestBlockHeight: 720,
      latestBlockCreatedAt: "2026-04-16T12:19:33.459Z",
      likelyFinalityStall: true,
    });

    expect(
      summarizePublicFinalityDiagnostic({
        statusPayload: {
          blocks: 58,
          sumeragi: {
            commit_qc_height: 58,
          },
        },
        sumeragiPayload: {
          view_change_causes: {
            last_cause: "missing_qc",
          },
        },
        blocksPayload: [
          {
            height: 58,
            created_at: "2026-04-16T15:58:34.489Z",
          },
        ],
      }),
    ).toMatchObject({
      latestBlockHeight: 58,
      latestBlockCreatedAt: "2026-04-16T15:58:34.489Z",
      commitQcHeight: 58,
    });
  });
});
