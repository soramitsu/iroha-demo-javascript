import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const between = (
  value: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker ${startMarker}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(end, `missing source marker ${endMarker}`).toBeGreaterThan(start);
  return value.slice(start, end);
};

describe("v2.0.1 governance release boundary", () => {
  it("ships only the current fc569 Taira identity and current SDK build", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      version: string;
      scripts: Record<string, string>;
    };
    const chains = source("src/constants/chains.ts");

    expect(packageJson.version).toBe("2.0.1");
    expect(packageJson.scripts.build).not.toContain("taira-v1");
    expect(packageJson.scripts).not.toHaveProperty("build:native:taira-v1");
    expect(chains).toContain("fc56984b-2be7-431d-840e-21514d1883f0");
    expect(chains).not.toContain("809574f5-fee7-5e69-bfcf-52451e42d50f");
    expect(chains.indexOf("TAIRA_CHAIN_PRESET")).toBeLessThan(
      chains.indexOf("MINAMOTO_CHAIN_PRESET"),
    );
  });

  it("keeps governance renderer DTOs and bridge methods key-free", () => {
    const rendererTypes = between(
      source("src/types/iroha.d.ts"),
      "export interface GovernancePrepareContext",
      "export type GovernanceVotingMode",
    );
    const preloadTypes = between(
      source("electron/preload.ts"),
      "type GovernanceWriteOperation",
      "type SubscriptionStatusView",
    );
    const rendererService = between(
      source("src/services/iroha.ts"),
      "export const getGovernanceCapabilities",
      "export const getExplorerMetrics",
    );

    for (const value of [rendererTypes, preloadTypes, rendererService]) {
      expect(value).not.toMatch(/privateKey|secretKey|seedPhrase/u);
      expect(value).not.toMatch(/finalizeGovernance|GovernanceFinalize/u);
    }
  });

  it("contains no legacy governance or validation-fee proof adapters", () => {
    const productionBoundary = [
      source("electron/governanceCapabilities.ts"),
      source("electron/governanceRoutes.ts"),
      source("electron/governanceValidationFee.ts"),
      source("electron/governanceValidationFeeDraft.ts"),
      source("electron/irohaJsNativeDir.ts"),
      source("scripts/iroha-sdk-compat.mjs"),
      source("scripts/postinstallNativeCheck.mjs"),
      source("src/governance/model.ts"),
      source("src/stores/parliament.ts"),
    ].join("\n");

    for (const forbidden of [
      "validationFeeCurrentPolicyProofRequestV1",
      "validationFeeVerifyCurrentPolicyProofV1",
      "normalizeValidationFeeLedgerBindingV1",
      "GOVERNANCE_VALIDATION_FEE_LEDGER_BINDING_JSON",
      "/v1/gov/finalize",
      'path: "/v1/gov/proposals/deploy-contract"',
      'path: "/v1/gov/proposals/runtime-upgrade"',
      'path: "/v1/gov/proposals/sccp-route-governance"',
    ]) {
      expect(productionBoundary).not.toContain(forbidden);
    }
  });

  it("loads packaged validation-fee runtime config through privileged IPC", () => {
    const main = source("electron/main.ts");
    const preload = source("electron/preload.ts");
    const runtimeConfig = source("electron/governanceRuntimeConfig.ts");

    expect(runtimeConfig).toContain('"sora.wallet.governance-runtime.v1"');
    expect(runtimeConfig).toContain('"governance-runtime.json"');
    expect(runtimeConfig).toContain(
      "refusing to mix environment and file runtime configuration",
    );
    expect(main).toContain(
      'loadGovernanceRuntimeConfig({\n      userDataPath: app.getPath("userData")',
    );
    expect(preload).toContain(
      "ipcRenderer.invoke(\n    GOVERNANCE_RUNTIME_CONFIG_IPC_CHANNEL",
    );
    expect(preload).not.toContain(
      "return fetchCoreGovernanceValidationFeePolicy();",
    );
  });
});
