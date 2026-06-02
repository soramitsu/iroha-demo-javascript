import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TAIRA_TORII_URL,
  SCCP_XOR_ASSET_KEY,
  SCCP_XOR_ROUTE_ID,
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
  TRON_MAINNET_NETWORK_ID_HEX,
} from "../scripts/e2e/sccp-route-preflight.mjs";
import {
  SCCP_LIVE_SMOKE_STEPS,
  evaluateSccpLiveSmokeReadiness,
  normalizeSccpBrowserModuleUrl,
  normalizeWalletConnectProjectId,
  runSccpLiveSmokeReadiness,
} from "../scripts/e2e/sccp-live-smoke-readiness.mjs";

const BRIDGE_ADDRESS = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const TOKEN_ADDRESS = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const SOURCE_BRIDGE_ADDRESS = "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT";
const VERIFIER_ADDRESS = "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy";
const HASH_11 = `0x${"11".repeat(32)}`;
const HASH_22 = `0x${"22".repeat(32)}`;
const HASH_33 = `0x${"33".repeat(32)}`;

const readyRouteReport = (overrides = {}) => ({
  ready: true,
  endpoint: DEFAULT_TAIRA_TORII_URL,
  routeId: SCCP_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  deployment: {
    bridgeAddress: BRIDGE_ADDRESS,
    tokenAddress: TOKEN_ADDRESS,
    sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
    verifierAddress: VERIFIER_ADDRESS,
    networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  },
  checks: [],
  reasons: [],
  nextSteps: [],
  ...overrides,
});

const readyManifest = () => ({
  routeId: SCCP_XOR_ROUTE_ID,
  assetKey: SCCP_XOR_ASSET_KEY,
  counterpartyDomain: 5,
  productionReady: true,
  tairaXorBridgeAddress: BRIDGE_ADDRESS,
  tairaXorTokenAddress: TOKEN_ADDRESS,
  sccpTronSourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
  destinationRollout: {
    destinationNetworkId: TRON_MAINNET_NETWORK_ID_HEX,
    verifierIdentity: VERIFIER_ADDRESS,
    verifierCodeHash: HASH_11,
    verifierKeyHash: HASH_22,
    destinationBindingHash: HASH_33,
    destinationBindingKey: "tron:0:5:mainnet:taira_tron_xor:v1",
    version: 1,
  },
  destinationBinding: {
    key: "tron:0:5:mainnet:taira_tron_xor:v1",
    version: 1,
    sourceDomain: 0,
    targetDomain: 5,
    bindingHash: HASH_33,
  },
  tairaXorBurnRecord: {
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    contractArtifactB64: Buffer.from(
      "Nrt0fixture-bytecode-material-v1!!",
    ).toString("base64"),
    vkRef: {
      backend: "groth16-bn254",
      name: "taira-xor-sccp-burn-record-v1",
    },
    gasLimit: 500000,
  },
});

describe("SCCP live smoke readiness", () => {
  it("passes when route, WalletConnect, and browser prover prerequisites are configured", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.routeReady).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.nextSteps).toEqual(SCCP_LIVE_SMOKE_STEPS);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "source-prover-module",
        status: "pass",
        detail: expect.stringContaining(
          "using VITE_SCCP_TRON_PROVER_MODULE_URL fallback",
        ),
      }),
    );
    expect(JSON.stringify(report)).not.toContain("private");
    expect(JSON.stringify(report)).not.toContain("seed");
  });

  it("fails closed when route preflight or live-smoke app configuration is missing", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({
        ready: false,
        nextSteps: ["Activate route manifest evidence."],
      }),
      walletConnectProjectId: "",
      destinationProverModuleUrl: "",
      sourceProverModuleUrl: "",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons).toEqual([
      "SCCP route preflight is not ready.",
      "WalletConnect project ID is missing.",
      "TAIRA -> TRON browser prover module URL is missing.",
      "TRON -> TAIRA browser source prover module URL is missing.",
    ]);
    expect(report.nextSteps).toContain("Activate route manifest evidence.");
    expect(report.nextSteps).toContain(
      "Set VITE_WALLETCONNECT_PROJECT_ID before launching the Electron renderer.",
    );
  });

  it("rejects unsafe WalletConnect identifiers and browser prover module URLs", () => {
    expect(normalizeWalletConnectProjectId(" project-123 ")).toBe(
      "project-123",
    );
    expect(normalizeWalletConnectProjectId("")).toBeNull();
    expect(() =>
      normalizeWalletConnectProjectId("https://walletconnect.example"),
    ).toThrow(/opaque identifier/);
    expect(() => normalizeWalletConnectProjectId("project id")).toThrow(
      /opaque identifier/,
    );

    expect(
      normalizeSccpBrowserModuleUrl(
        " https://cdn.example.invalid/prover.js ",
        "module",
      ),
    ).toBe("https://cdn.example.invalid/prover.js");
    expect(normalizeSccpBrowserModuleUrl("./prover.js", "module")).toBe(
      "./prover.js",
    );
    expect(
      normalizeSccpBrowserModuleUrl("http://127.0.0.1:5173/p.js", "module"),
    ).toBe("http://127.0.0.1:5173/p.js");
    expect(() =>
      normalizeSccpBrowserModuleUrl(
        "http://cdn.example.invalid/p.js",
        "module",
      ),
    ).toThrow(/relative path, HTTPS URL, or loopback HTTP URL/);
    expect(() =>
      normalizeSccpBrowserModuleUrl(
        "https://user:pass@cdn.example.invalid/p.js",
        "module",
      ),
    ).toThrow(/credentials/);
    expect(() =>
      normalizeSccpBrowserModuleUrl(
        "https://cdn.example.invalid/p.js?token=secret",
        "module",
      ),
    ).toThrow(/query strings or fragments/);
    expect(() =>
      normalizeSccpBrowserModuleUrl("/p.js#debug", "module"),
    ).toThrow(/query strings or fragments/);
    expect(() => normalizeSccpBrowserModuleUrl("./p.js?v=1", "module")).toThrow(
      /query strings or fragments/,
    );
    expect(() =>
      normalizeSccpBrowserModuleUrl(
        "https://cdn.example.invalid/p js",
        "module",
      ),
    ).toThrow(/whitespace/);
  });

  it("runs the read-only route preflight before evaluating live-smoke prerequisites", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const href = String(url);
      calls.push({ href, method: init?.method });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json({
          chainId: TAIRA_CHAIN_ID,
          networkPrefix: TAIRA_NETWORK_PREFIX,
        });
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json({
          proofSubmitPath: "/v1/sccp/proofs",
          messageSubmitPath: "/v1/bridge/messages",
        });
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifest()] });
      }
      return new Response("{}", { status: 404 });
    });

    const report = await runSccpLiveSmokeReadiness({
      endpoint: DEFAULT_TAIRA_TORII_URL,
      checkTronContracts: false,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.map((call) => new URL(call.href).pathname)).toEqual([
      "/v1/chain/metadata",
      "/v1/sccp/capabilities",
      "/v1/sccp/manifests",
    ]);
    expect(calls.some((call) => call.href.includes("/wallet/broadcast"))).toBe(
      false,
    );
  });
});
