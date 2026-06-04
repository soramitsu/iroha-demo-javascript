import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TAIRA_TORII_URL,
  SCCP_XOR_ASSET_KEY,
  SCCP_XOR_ROUTE_ID,
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
  TRON_MAINNET_NETWORK_ID_HEX,
  TRON_NILE_NETWORK_ID_HEX,
} from "../scripts/e2e/sccp-route-preflight.mjs";
import {
  SCCP_LIVE_SMOKE_STEPS,
  evaluateSccpLiveSmokeReadiness,
  isSccpNileTestSignerConfigured,
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
const HASH_44 = `0x${"44".repeat(32)}`;
const HASH_55 = `0x${"55".repeat(32)}`;
const HASH_66 = `0x${"66".repeat(32)}`;

const readyRouteReport = (overrides = {}) => ({
  ready: true,
  endpoint: DEFAULT_TAIRA_TORII_URL,
  tronNetwork: "mainnet",
  manifestSource: "endpoint",
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
  checks: [
    {
      id: "post-deploy-live-evidence",
      label: "TRON source-event and route-canary live evidence are complete.",
      status: "pass",
    },
  ],
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: `0x${"77".repeat(32)}`,
  },
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
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: `0x${"77".repeat(32)}`,
  },
});

const readyNileRouteReport = (overrides = {}) =>
  readyRouteReport({
    tronNetwork: "nile",
    deployment: {
      ...readyRouteReport().deployment,
      networkIdHex: TRON_NILE_NETWORK_ID_HEX,
    },
    postDeployLiveEvidence: null,
    ...overrides,
  });

describe("SCCP live smoke readiness", () => {
  it("passes when route, WalletConnect, and browser prover prerequisites are configured", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
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
        detail: "/sccp-tron-source-prover.js",
      }),
    );
    expect(JSON.stringify(report)).not.toContain("private");
    expect(JSON.stringify(report)).not.toContain("seed");
  });

  it("does not treat the destination prover URL as an implicit source prover", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons).toContain(
      "TRON -> TAIRA browser source prover module URL is missing.",
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "source-prover-module",
        status: "fail",
      }),
    );
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
    expect(report.nextSteps.join("\n")).toContain(
      "Set VITE_WALLETCONNECT_PROJECT_ID before launching the Electron renderer",
    );
    expect(report.nextSteps.join("\n")).toContain(
      "SCCP_TRON_NILE_TEST_SIGNER=1",
    );
  });

  it("accepts selected TRON Nile endpoint reports without mainnet live evidence", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      tronNetwork: "nile",
      routeReport: readyNileRouteReport(),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.routeReady).toBe(true);
    expect(report.route?.tronNetwork).toBe("nile");
    expect(report.route?.deployment?.networkIdHex).toBe(
      TRON_NILE_NETWORK_ID_HEX,
    );
  });

  it("passes Nile readiness with the explicit test signer when WalletConnect is absent", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      tronNetwork: "nile",
      routeReport: readyNileRouteReport(),
      walletConnectProjectId: "",
      nileTestSignerConfigured: true,
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "walletconnect-project-id",
        status: "pass",
        detail: "Using explicit Nile-only Electron test signer for this test run.",
      }),
    );
    expect(JSON.stringify(report)).not.toContain("private");
  });

  it("does not apply the Nile test signer to mainnet readiness", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: "",
      nileTestSignerConfigured: true,
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons).toContain("WalletConnect project ID is missing.");
  });

  it("requires both the Nile test signer flag and secret file", () => {
    expect(
      isSccpNileTestSignerConfigured({
        tronNetwork: "nile",
        enabled: "1",
        secretFile: "../iroha/artifacts/sccp-tron/nile.secret.json",
      }),
    ).toBe(true);
    expect(
      isSccpNileTestSignerConfigured({
        tronNetwork: "mainnet",
        enabled: "1",
        secretFile: "../iroha/artifacts/sccp-tron/nile.secret.json",
      }),
    ).toBe(false);
    expect(
      isSccpNileTestSignerConfigured({
        tronNetwork: "nile",
        enabled: "0",
        secretFile: "../iroha/artifacts/sccp-tron/nile.secret.json",
      }),
    ).toBe(false);
    expect(
      isSccpNileTestSignerConfigured({
        tronNetwork: "nile",
        enabled: "1",
        secretFile: "",
      }),
    ).toBe(false);
  });

  it("does not treat a local manifest-file route preflight as public live-smoke readiness", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      tronNetwork: "nile",
      routeReport: readyNileRouteReport({ manifestSource: "file" }),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.route?.manifestSource).toBe("file");
    expect(
      report.checks.find((check) => check.id === "route-preflight")?.detail,
    ).toContain("public TAIRA route publication is not proven");
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

  it("rejects ready route reports that are not bound to TAIRA/TRON XOR", () => {
    const cases = [
      {
        name: "missing post-deploy live evidence check",
        routeReport: readyRouteReport({ checks: [] }),
        detail: "post-deploy live evidence preflight check has not passed",
      },
      {
        name: "missing post-deploy live evidence ids",
        routeReport: readyRouteReport({ postDeployLiveEvidence: null }),
        detail: "postDeployLiveEvidence is missing",
      },
      {
        name: "forged source event transaction id",
        routeReport: readyRouteReport({
          postDeployLiveEvidence: {
            ...readyRouteReport().postDeployLiveEvidence,
            sourceEventTransactionId: `0x${"00".repeat(32)}`,
          },
        }),
        detail: "sourceEventTransactionId must be a non-zero 32-byte hex value",
      },
      {
        name: "wrong route and asset",
        routeReport: readyRouteReport({
          routeId: "minamoto_tron_xor",
          assetKey: "dot",
        }),
        detail: "expected route taira_tron_xor/xor",
      },
      {
        name: "missing deployment evidence",
        routeReport: readyRouteReport({ deployment: null }),
        detail: "deployment evidence is missing",
      },
      {
        name: "missing TRON network binding",
        routeReport: readyRouteReport({
          deployment: {
            bridgeAddress: BRIDGE_ADDRESS,
            tokenAddress: TOKEN_ADDRESS,
            sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
            verifierAddress: VERIFIER_ADDRESS,
            settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
        }),
        detail: "networkIdHex is missing",
      },
      {
        name: "invalid TRON bridge address",
        routeReport: readyRouteReport({
          deployment: {
            bridgeAddress: "T000000000000000000000000000000000",
            tokenAddress: TOKEN_ADDRESS,
            sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
            verifierAddress: VERIFIER_ADDRESS,
            networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
            settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          },
        }),
        detail: "bridgeAddress must be a valid TRON Base58Check address",
      },
    ];

    for (const { name, routeReport, detail } of cases) {
      const report = evaluateSccpLiveSmokeReadiness({
        routeReport,
        walletConnectProjectId: "project_123",
        destinationProverModuleUrl: "/sccp-tron-prover.js",
        sourceProverModuleUrl: "/sccp-tron-source-prover.js",
        checkedAt: "2026-06-02T00:00:00.000Z",
      });

      expect(report.ready, name).toBe(false);
      expect(report.routeReady, name).toBe(false);
      expect(report.reasons, name).toContain(
        "SCCP route preflight report is not bound to TAIRA/TRON XOR.",
      );
      expect(report.checks, name).toContainEqual(
        expect.objectContaining({
          id: "route-preflight",
          status: "fail",
          detail: expect.stringContaining(
            "Route preflight report is not for taira_tron_xor/xor",
          ),
        }),
      );
      expect(
        report.checks.find((check) => check.id === "route-preflight")?.detail,
        name,
      ).toContain(detail);
      expect(report.nextSteps, name).not.toEqual(SCCP_LIVE_SMOKE_STEPS);
    }
  });

  it("echoes only public route deployment fields in readiness reports", () => {
    const report = evaluateSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({
        deployment: {
          bridgeAddress: { private_key: "nested-secret" },
          tokenAddress: TOKEN_ADDRESS,
          sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
          verifierAddress: VERIFIER_ADDRESS,
          networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
          settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          private_key: "top-level-secret",
          seedPhrase: "seed words must not leak",
        },
      }),
      walletConnectProjectId: "project_123",
      destinationProverModuleUrl: "/sccp-tron-prover.js",
      sourceProverModuleUrl: "/sccp-tron-source-prover.js",
      checkedAt: "2026-06-02T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.route?.deployment).toEqual({
      bridgeAddress: null,
      tokenAddress: TOKEN_ADDRESS,
      sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
      verifierAddress: VERIFIER_ADDRESS,
      networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
    expect(report.route?.postDeployLiveEvidence).toEqual(
      readyRouteReport().postDeployLiveEvidence,
    );
    expect(JSON.stringify(report)).not.toContain("private_key");
    expect(JSON.stringify(report)).not.toContain("seedPhrase");
    expect(JSON.stringify(report)).not.toContain("nested-secret");
    expect(JSON.stringify(report)).not.toContain("top-level-secret");
    expect(JSON.stringify(report)).not.toContain("seed words must not leak");
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
      tronNetwork: "mainnet",
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
