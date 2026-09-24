import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const preloadSource = () =>
  readFileSync(resolve(process.cwd(), "electron/preload.ts"), "utf8");

describe("current live surface contract", () => {
  it("uses only the current Nexus lifecycle and public-lanes routes", () => {
    const source = preloadSource();

    expect(source).toContain('"/v1/nexus/lifecycle"');
    expect(source).toContain(
      'warnings.push("Nexus lifecycle telemetry is unavailable.")',
    );
    expect(source).toContain(
      'await readBoundedExactJsonTextResponse(response, "Nexus lifecycle")',
    );
    expect(source).toContain("fetchNexusLifecycle(toriiUrl, signal)");
    expect(source).toContain(
      'const { toriiUrl } = requireFirstReleaseIpcInput(config, "toriiConfig")',
    );
    expect(source).toContain("return fetchNexusLifecycle(toriiUrl)");
    expect(source).toContain("/v1/nexus/public-lanes/");
    expect(source).not.toContain("/v1/nexus/public_lanes/");
  });

  it("reads the current Sumeragi JSON without the skewed typed SDK parser", () => {
    const source = preloadSource();

    expect(source).toContain('"/v1/sumeragi/status"');
    expect(source).not.toContain("client.getSumeragiStatusTyped");
  });

  it("does not expose the removed SDK allowance query or metadata policy", () => {
    const source = preloadSource();

    expect(source).not.toContain("listOfflineAllowances");
    expect(source).not.toContain('"/v1/offline/readiness"');
    expect(source).not.toContain("metadata.zk.policy");
    expect(source).not.toContain('"zk.policy"');
  });

  it("builds transparent transfers only from the configured canonical asset", () => {
    const source = preloadSource();
    const start = source.indexOf("async transferAsset(rendererInput)");
    const end = source.indexOf("setIrohaConnectContext(input)", start);
    const transferSource = source.slice(start, end);

    expect(transferSource).toContain(
      "normalizeFirstReleaseAssetDefinitionId(\n      input.assetDefinitionId",
    );
    expect(
      transferSource.indexOf("normalizeFirstReleaseAssetDefinitionId("),
    ).toBeLessThan(transferSource.indexOf("await resolveSigningMaterial("));
    expect(transferSource).not.toContain("listAccountAssets");
    expect(transferSource).not.toContain("resolveUniqueLiveAssetDefinitionId");
    expect(transferSource).not.toContain("positiveBalanceMatches");
    expect(transferSource).not.toContain("containsMatches");
  });

  it("exposes only transparent transfers and read-only confidential balances", () => {
    const source = preloadSource();
    const transferStart = source.indexOf("async transferAsset(rendererInput)");
    const transferEnd = source.indexOf(
      "setIrohaConnectContext(input)",
      transferStart,
    );
    const transferSource = source.slice(transferStart, transferEnd);
    const endpointGuard = transferSource.indexOf(
      "assertWriteConnectionMatchesEndpoint({",
    );
    const signingMaterial = transferSource.indexOf(
      "await resolveSigningMaterial({",
    );

    expect(transferStart).toBeGreaterThanOrEqual(0);
    expect(source).not.toContain("buildShieldInstruction");
    expect(source).not.toContain("buildZkTransferInstruction");
    expect(source).not.toContain("buildUnshieldInstruction");
    expect(source).not.toContain("getConfidentialTransferExecutionContext");
    expect(source).not.toContain("resolveConfidentialTransferMaterials");
    expect(transferSource).not.toContain("input.shielded");
    expect(transferSource).not.toContain("input.unshield");
    expect(endpointGuard).toBeGreaterThanOrEqual(0);
    expect(signingMaterial).toBeGreaterThan(endpointGuard);
    expect(source).toContain("getConfidentialAssetBalance(input) {");
  });
});
