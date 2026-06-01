import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TAIRA_TORII_URL,
  SCCP_XOR_ASSET_KEY,
  SCCP_XOR_ROUTE_ID,
  TAIRA_CHAIN_ID,
  TAIRA_NETWORK_PREFIX,
  TRON_MAINNET_NETWORK_ID_HEX,
  evaluateSccpRoutePreflight,
  fetchTronContractReadback,
  isValidTronBase58CheckAddress,
  normalizeToriiEndpoint,
  normalizeTronGatewayEndpoint,
  runSccpRoutePreflight,
} from "../scripts/e2e/sccp-route-preflight.mjs";

const BRIDGE_ADDRESS = "TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjU7";
const TOKEN_ADDRESS = "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj";
const SOURCE_BRIDGE_ADDRESS = "TMwFHYXLJaRUPeW6421aqXL4ZEzPRFGkGT";
const VERIFIER_ADDRESS = "TLsV52sRDL79HXGGm9yzwKibb6BeruhUzy";
const HASH_11 = `0x${"11".repeat(32)}`;
const HASH_22 = `0x${"22".repeat(32)}`;
const HASH_33 = `0x${"33".repeat(32)}`;
const BINDING_KEY = "tron:0:5:mainnet:taira_tron_xor:v1";
const ARTIFACT_B64 = Buffer.from(
  "taira xor sccp burn-record test artifact",
).toString("base64");
const BRIDGE_SOLIDITY = "74472e7d35395a6b5add427eecb7f4b62ad2b071";
const ABI_ADDRESS_BRIDGE = `${"0".repeat(24)}${BRIDGE_SOLIDITY}`;

const readyChainMetadata = {
  chainId: TAIRA_CHAIN_ID,
  networkPrefix: TAIRA_NETWORK_PREFIX,
};

const readyCapabilities = {
  proofSubmitPath: "/v1/sccp/proofs",
  messageSubmitPath: "/v1/bridge/messages",
};

const readyManifest = (overrides = {}) => ({
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
    destinationBindingKey: BINDING_KEY,
    version: 1,
  },
  destinationBinding: {
    key: BINDING_KEY,
    version: 1,
    sourceDomain: 0,
    targetDomain: 5,
    bindingHash: HASH_33,
  },
  tairaXorBurnRecord: {
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    contractArtifactB64: ARTIFACT_B64,
    vkRef: {
      backend: "groth16-bn254",
      name: "taira-xor-sccp-burn-record-v1",
    },
    gasLimit: 500000,
  },
  ...overrides,
});

const evaluate = (input = {}) =>
  evaluateSccpRoutePreflight({
    endpoint: DEFAULT_TAIRA_TORII_URL,
    chainMetadata: readyChainMetadata,
    capabilities: readyCapabilities,
    manifestSet: { manifests: [readyManifest()] },
    checkedAt: "2026-06-01T00:00:00.000Z",
    ...input,
  });

const failedCheck = (report, id) =>
  report.checks.find((check) => check.id === id && check.status === "fail");

const constantResponse = (word) =>
  Response.json({ result: { result: true }, constant_result: [word] });

describe("SCCP route preflight", () => {
  it("accepts a production-ready TAIRA/TRON XOR route without exposing secret material", () => {
    const report = evaluate();

    expect(report.ready).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.deployment).toEqual({
      bridgeAddress: BRIDGE_ADDRESS,
      tokenAddress: TOKEN_ADDRESS,
      sourceBridgeAddress: SOURCE_BRIDGE_ADDRESS,
      verifierAddress: VERIFIER_ADDRESS,
      networkIdHex: TRON_MAINNET_NETWORK_ID_HEX,
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
    expect(JSON.stringify(report)).not.toContain(ARTIFACT_B64);
    expect(JSON.stringify(report)).not.toContain("private");
  });

  it("fails closed on Minamoto or any non-TAIRA endpoint identity", () => {
    const report = evaluate({
      chainMetadata: {
        chainId: "00000000-0000-0000-0000-000000000000",
        networkPrefix: 753,
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "taira-network")?.detail).toContain(
      "00000000-0000-0000-0000-000000000000",
    );
  });

  it("requires both proof and bridge-message submit capability paths", () => {
    const report = evaluate({
      capabilities: { proofSubmitPath: "/v1/sccp/proofs" },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "sccp-capabilities")?.detail).toContain(
      "Missing proofSubmitPath or messageSubmitPath",
    );
  });

  it("rejects TRON manifests that do not exactly match the route and asset key", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            routeId: "taira_tron_other",
            assetKey: SCCP_XOR_ASSET_KEY,
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "route-manifest")?.detail).toContain(
      "none match route taira_tron_xor",
    );
  });

  it("requires an explicit boolean productionReady true flag", () => {
    const report = evaluate({
      manifestSet: { manifests: [readyManifest({ productionReady: "true" })] },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "production-ready")?.detail).toContain(
      "boolean true",
    );
  });

  it("rejects malformed TRON deployment addresses", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            tairaXorTokenAddress: "TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdX",
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "tron-token-address")?.detail).toContain(
      "checksum",
    );
  });

  it("rejects verifier rollout material for anything other than TRON mainnet", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            destinationRollout: {
              ...readyManifest().destinationRollout,
              destinationNetworkId: "0x00000000000000000000000000000001",
            },
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "tron-proof-material")?.detail).toContain(
      "Expected TRON mainnet",
    );
  });

  it("rejects destination binding hashes that disagree with rollout evidence", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            destinationBinding: {
              ...readyManifest().destinationBinding,
              bindingHash: `0x${"44".repeat(32)}`,
            },
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "destination-binding")?.detail).toContain(
      "disagrees",
    );
  });

  it("rejects alias settlement assets for the TAIRA burn-record contract", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            tairaXorBurnRecord: {
              ...readyManifest().tairaXorBurnRecord,
              settlementAssetDefinitionId: "xor#universal",
            },
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "taira-burn-record")?.detail).toContain(
      "canonical Base58",
    );
  });

  it("rejects non-base64 burn-record artifacts and non-positive gas limits", () => {
    const report = evaluate({
      manifestSet: {
        manifests: [
          readyManifest({
            tairaXorBurnRecord: {
              ...readyManifest().tairaXorBurnRecord,
              contractArtifactB64: "not base64",
              gasLimit: -1,
            },
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "taira-burn-record")?.detail).toContain(
      "strict base64",
    );
  });

  it("normalizes safe endpoints and rejects unsafe live preflight targets", () => {
    expect(normalizeToriiEndpoint("https://taira.sora.org/")).toBe(
      DEFAULT_TAIRA_TORII_URL,
    );
    expect(
      normalizeToriiEndpoint("http://localhost:8080/", { allowLocal: true }),
    ).toBe("http://localhost:8080");
    expect(() => normalizeToriiEndpoint("http://taira.sora.org")).toThrow(
      "HTTPS",
    );
    expect(() =>
      normalizeToriiEndpoint("https://user:pass@taira.sora.org"),
    ).toThrow("credentials");
    expect(() =>
      normalizeToriiEndpoint("https://taira.sora.org?debug=1"),
    ).toThrow("query strings");
    expect(normalizeTronGatewayEndpoint("https://api.trongrid.io/")).toBe(
      "https://api.trongrid.io",
    );
    expect(() => normalizeTronGatewayEndpoint("https://127.0.0.1")).toThrow(
      "local network",
    );
  });

  it("validates TRON Base58Check addresses with checksum and mainnet prefix", () => {
    expect(isValidTronBase58CheckAddress(BRIDGE_ADDRESS)).toBe(true);
    expect(
      isValidTronBase58CheckAddress("TLa2f6VPqDgRE67v1736s7bJ8Ray5wYjUX"),
    ).toBe(false);
    expect(isValidTronBase58CheckAddress("0x2b6653dc")).toBe(false);
  });

  it("fetches only non-mutating SCCP and metadata endpoints", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const href = String(url);
      calls.push({ href, method: init?.method });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifest()] });
      }
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });

    const report = await runSccpRoutePreflight({
      endpoint: DEFAULT_TAIRA_TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(report.ready).toBe(true);
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.map((call) => new URL(call.href).pathname)).toEqual([
      "/v1/chain/metadata",
      "/v1/sccp/capabilities",
      "/v1/sccp/manifests",
    ]);
    expect(
      calls.some((call) => call.href.includes("/v1/bridge/messages")),
    ).toBe(false);
  });

  it("optionally verifies deployed TRON contract view state against the manifest", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const href = String(url);
      calls.push({
        href,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (href.endsWith("/wallet/triggerconstantcontract")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        switch (body.function_selector) {
          case "bridge()":
          case "owner()":
            return constantResponse(ABI_ADDRESS_BRIDGE);
          case "bridgeLocked()":
            return constantResponse(`${"0".repeat(63)}1`);
          case "destinationBindingHash()":
            return constantResponse(HASH_33.slice(2));
          default:
            return Response.json(
              { result: { result: false, message: "unknown selector" } },
              { status: 200 },
            );
        }
      }
      return new Response("{}", { status: 404 });
    });

    const readback = await fetchTronContractReadback({
      manifest: readyManifest(),
      fetchImpl,
    });
    const report = evaluate({ tronContractReadback: readback });

    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "tron-contract-readback",
        status: "pass",
      }),
    );
    expect(
      calls.every(
        (call) =>
          call.method === "POST" &&
          call.href ===
            "https://api.trongrid.io/wallet/triggerconstantcontract",
      ),
    ).toBe(true);
    expect(calls.map((call) => call.body.function_selector).sort()).toEqual([
      "bridge()",
      "bridgeLocked()",
      "destinationBindingHash()",
      "destinationBindingHash()",
      "owner()",
    ]);
    expect(
      calls.every((call) => call.body.owner_address === BRIDGE_ADDRESS),
    ).toBe(true);
  });

  it("fails TRON contract readback on unlocked or mismatched deployments", () => {
    const report = evaluate({
      tronContractReadback: {
        endpoint: "https://api.trongrid.io",
        tokenBridgeAddress: BRIDGE_SOLIDITY,
        tokenBridgeLocked: false,
        sourceBridgeOwner: "0".repeat(40),
        bridgeDestinationBindingHash: HASH_33,
        verifierDestinationBindingHash: `0x${"44".repeat(32)}`,
      },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "tron-token-lock-readback")?.detail).toContain(
      "not locked",
    );
    expect(failedCheck(report, "tron-source-owner-readback")?.detail).toContain(
      "does not match",
    );
    expect(
      failedCheck(report, "tron-verifier-binding-readback")?.detail,
    ).toContain("does not match");
  });

  it("runs live SCCP route preflight with optional read-only TRON contract checks", async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      const href = String(url);
      calls.push({ href, method: init?.method });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifest()] });
      }
      if (href.endsWith("/wallet/triggerconstantcontract")) {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (body.function_selector === "bridgeLocked()") {
          return constantResponse(`${"0".repeat(63)}1`);
        }
        if (
          body.function_selector === "bridge()" ||
          body.function_selector === "owner()"
        ) {
          return constantResponse(ABI_ADDRESS_BRIDGE);
        }
        return constantResponse(HASH_33.slice(2));
      }
      return new Response(JSON.stringify({}), {
        status: 404,
        headers: { "content-type": "application/json" },
      });
    });

    const report = await runSccpRoutePreflight({
      endpoint: DEFAULT_TAIRA_TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
      checkTronContracts: true,
    });

    expect(report.ready).toBe(true);
    expect(
      calls.some((call) =>
        call.href.endsWith("/wallet/triggerconstantcontract"),
      ),
    ).toBe(true);
    expect(
      calls.every((call) => call.method === "GET" || call.method === "POST"),
    ).toBe(true);
    expect(calls.some((call) => call.href.includes("/wallet/broadcast"))).toBe(
      false,
    );
  });
});
