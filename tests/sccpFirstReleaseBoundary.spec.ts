import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();
const readSource = (path: string) =>
  readFileSync(resolve(projectRoot, path), "utf8");

const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".vue",
  ".js",
  ".mjs",
  ".css",
  ".svg",
] as const;

const resolveRuntimeImport = (
  importer: string,
  rawSpecifier: string,
): string | null => {
  const specifier = rawSpecifier.split(/[?#]/u, 1)[0];
  let base: string;
  if (specifier.startsWith("@/")) {
    base = resolve(projectRoot, "src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(importer), specifier);
  } else if (specifier.startsWith("/")) {
    base = resolve(projectRoot, "src", specifier.slice(1));
  } else {
    return null;
  }

  const candidates = [
    base,
    ...SOURCE_EXTENSIONS.map((extension) => `${base}${extension}`),
    ...SOURCE_EXTENSIONS.map((extension) => resolve(base, `index${extension}`)),
  ];
  const rootPrefix = `${projectRoot}${sep}`;
  for (const candidate of candidates) {
    if (
      (candidate === projectRoot || candidate.startsWith(rootPrefix)) &&
      existsSync(candidate) &&
      statSync(candidate).isFile()
    ) {
      return candidate;
    }
  }
  return null;
};

const collectRuntimeModuleGraph = (entries: readonly string[]) => {
  const pending = entries.map((entry) => resolve(projectRoot, entry));
  const visited = new Set<string>();
  while (pending.length > 0) {
    const modulePath = pending.pop();
    if (!modulePath || visited.has(modulePath)) continue;
    visited.add(modulePath);
    const source = readFileSync(modulePath, "utf8");
    const imports = ts
      .preProcessFile(source, true, true)
      .importedFiles.map(({ fileName }) => fileName);
    for (const match of source.matchAll(
      /new\s+URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url\s*\)/gu,
    )) {
      imports.push(match[1]);
    }
    for (const specifier of imports) {
      const dependency = resolveRuntimeImport(modulePath, specifier);
      if (dependency && !visited.has(dependency)) pending.push(dependency);
    }
  }
  return [...visited].map((path) => relative(projectRoot, path));
};

const RETIRED_RUNTIME_MODULE =
  /^(?:electron\/(?:governanceBallotDraft|governanceEnactBoundary|governancePlainReferendum|privateKaigiContract|soraCloudDeployRequest|soraCloudHfFlow|soraCloudResponses|soraCloudSettlementBoundary|tronTestSigner)\.ts|src\/(?:components\/governance\/GovernanceTimeline\.vue|governance\/enactBoundary\.ts|types\/iroha-js-private-kaigi\.d\.ts|views\/SccpView\.vue|composables\/use(?:Bsc|Sccp|Solana|Ton|Tron)\w*\.ts|types\/sccpDormant\.ts|(?:legacy|provers|utils|workers)\/sccp[^/]*\.(?:d\.ts|js|ts)|(?:services|stores|utils|views)\/offline(?:\.[^/]+)?))$/iu;

const RETIRED_RUNTIME_NAMES = [
  "getRuntimeConfig",
  "getSccpCapabilities",
  "getSccpProofManifests",
  "getSccpSoraOutboundMaterial",
  "listSccpRecentMessages",
  "getSccpMessageProofBundle",
  "getSccpMessageProofJob",
  "submitSccpBridgeProof",
  "submitSccpBridgeMessage",
  "waitForSccpTransactionCommit",
  "deriveZkIvmPayload",
  "startZkIvmProveJob",
  "getZkIvmProveJob",
  "cancelZkIvmProveJob",
  "submitZkIvmProvedTransaction",
  "getTronTransaction",
  "getTronTransactionReceipt",
  "getTronTransactionEvents",
  "getTronFinalityData",
  "getTronAccount",
  "triggerTronConstantContract",
  "triggerTronSmartContract",
  "broadcastTronTransaction",
  "callEvmRpc",
  "callEvmContract",
  "getEvmBalance",
  "getEvmBlockByHash",
  "getEvmChainId",
  "getEvmLogs",
  "getEvmTransaction",
  "getEvmTransactionReceipt",
  "callSolanaRpc",
  "getSolanaBalance",
  "getSolanaSignatureStatus",
  "getSolanaTokenBalance",
  "getSolanaTransaction",
  "prepareSolanaAssociatedTokenAccount",
  "buildSolanaTransaction",
  "broadcastSolanaTransaction",
] as const;

describe("first-release SCCP runtime boundary", () => {
  it("has no route, preload implementation, renderer facade, or bridge contract", () => {
    const routerSource = readSource("src/router/index.ts");
    const preloadSource = readSource("electron/preload.ts");
    const serviceSource = readSource("src/services/iroha.ts");
    const bridgeTypeSource = readSource("src/types/iroha.d.ts");
    const endpointInspectorSource = readSource("electron/endpointInspector.ts");
    const endpointTypeSource = readSource("src/types/endpointInspection.ts");
    const settingsSource = readSource("src/views/SettingsView.vue");
    const activeStyles = [
      readSource("src/styles/main.css"),
      readSource("src/styles/primitives.css"),
      readSource("src/styles/operational-views.css"),
    ].join("\n");

    expect(routerSource).not.toContain('path: "/sccp"');
    expect(routerSource).not.toContain("SccpView");
    expect(preloadSource).not.toContain("legacy/sccpLegacySdk");
    expect(activeStyles).not.toMatch(/\.sccp(?:-|\b)/u);
    expect(bridgeTypeSource).not.toMatch(/\b(?:Sccp|ZkIvm|Tron|Evm|Solana)/u);
    for (const source of [
      endpointInspectorSource,
      endpointTypeSource,
      settingsSource,
    ]) {
      expect(source).not.toContain("zkProofJobs");
      expect(source).not.toContain("/v1/zk/ivm/");
    }
    for (const name of RETIRED_RUNTIME_NAMES) {
      expect(preloadSource).not.toContain(name);
      expect(serviceSource).not.toContain(name);
      expect(bridgeTypeSource).not.toContain(`${name}(`);
    }
  });

  it("keeps foreign-chain packages out of production dependencies", () => {
    const packageJson = JSON.parse(readSource("package.json")) as {
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.scripts?.build).not.toMatch(/sccp/iu);
    for (const operatorDependency of [
      "@reown/appkit-universal-connector",
      "@solana/web3.js",
      "@ton-community/func-js",
      "@ton/core",
      "@ton/crypto",
      "@ton/ton",
      "@tonconnect/sdk",
      "@tonconnect/ui",
      "bs58",
      "viem",
    ]) {
      expect(packageJson.dependencies).not.toHaveProperty(operatorDependency);
      expect(packageJson.devDependencies).toHaveProperty(operatorDependency);
    }
  });

  it("keeps every dormant renderer module outside all production entry graphs", () => {
    const modules = collectRuntimeModuleGraph([
      "electron/main.ts",
      "electron/preload.ts",
      "src/main.ts",
    ]);

    expect(modules.filter((path) => RETIRED_RUNTIME_MODULE.test(path))).toEqual(
      [],
    );
    expect(modules).not.toContain("electron/tronTestSigner.ts");
  });

  it("has one explicit renderer entry and disables public-directory copying", () => {
    const buildConfig = readSource("electron.vite.config.ts");
    const rendererHtml = readSource("src/index.html");
    const protocolSmoke = readSource("scripts/e2e/renderer-protocol-smoke.mjs");

    expect(buildConfig).toContain("publicDir: false");
    expect(buildConfig).toContain('input: resolveFromRoot("src/index.html")');
    expect(buildConfig).not.toMatch(/input:\s*\[[^\]]/u);
    expect(rendererHtml.match(/<script\b/gu)).toHaveLength(1);
    expect(rendererHtml).toContain(
      '<script type="module" src="/main.ts"></script>',
    );
    expect(protocolSmoke).toContain("forbiddenRuntimeAsset");
    expect(protocolSmoke).toContain("forbiddenBuiltFiles");
    expect(protocolSmoke).toContain("forbiddenStatuses");
    expect(protocolSmoke).not.toContain("resolveHashedWorkerUrl");
    expect(protocolSmoke).not.toContain("proveSolanaSccpDestination");
  });

  it("does not retain retired navigation or icon variants", () => {
    const navigationSource = readSource("src/types/navigation.ts");
    const iconSource = readSource("src/components/AppIcon.vue");
    const rendererEnvironmentTypes = readSource("src/shims-modules.d.ts");

    for (const retiredVariant of ["offline", "bridge"]) {
      expect(navigationSource).not.toContain(`| "${retiredVariant}"`);
      expect(iconSource).not.toContain(`  ${retiredVariant}:`);
    }
    expect(rendererEnvironmentTypes).not.toMatch(
      /VITE_(?:SCCP|WALLETCONNECT)_/u,
    );
  });

  it("keeps removed Kaigi, governance, and SoraCloud mutations out of every callable bridge", () => {
    const preloadSource = readSource("electron/preload.ts");
    const serviceSource = readSource("src/services/iroha.ts");
    const bridgeTypeSource = readSource("src/types/iroha.d.ts");
    const soraCloudUtilities = readSource("src/utils/soracloud.ts");
    const packageJson = JSON.parse(readSource("package.json")) as {
      scripts: Record<string, string>;
    };

    for (const removedModule of [
      "electron/governanceBallotDraft.ts",
      "electron/governanceEnactBoundary.ts",
      "electron/governancePlainReferendum.ts",
      "electron/privateKaigiContract.ts",
      "electron/soraCloudDeployRequest.ts",
      "electron/soraCloudHfFlow.ts",
      "electron/soraCloudResponses.ts",
      "electron/soraCloudSettlementBoundary.ts",
      "src/governance/enactBoundary.ts",
      "src/services/offline.ts",
      "src/stores/offline.ts",
      "src/types/iroha-js-private-kaigi.d.ts",
      "src/utils/offline.ts",
      "src/views/OfflineView.vue",
    ]) {
      expect(existsSync(resolve(projectRoot, removedModule))).toBe(false);
    }

    for (const retiredCallable of [
      "buildKaigiRosterJoinProof",
      "buildPrivateCreateKaigiTransaction",
      "buildPrivateJoinKaigiTransaction",
      "buildPrivateEndKaigiTransaction",
      "prepareGovernancePlainBallot",
      "finalizeGovernance",
      "enactGovernance",
      "deploySoraCloud",
      "joinSoraCloud",
    ]) {
      for (const source of [preloadSource, serviceSource, bridgeTypeSource]) {
        expect(source).not.toContain(retiredCallable);
      }
    }

    for (const retiredSoraCloudCompatibility of [
      "SoraCloudDeploymentEvent",
      "SoraCloudDeploymentSummary",
      "summarizeSoraCloudDeployments",
      "sortSoraCloudDeployments",
    ]) {
      expect(soraCloudUtilities).not.toContain(retiredSoraCloudCompatibility);
    }
    expect(packageJson.scripts.build).toContain(
      "node scripts/verify-first-release-runtime.mjs",
    );
  });

  it("does not compile retired action copy into locale tables", () => {
    const localeSources = readdirSync(resolve(projectRoot, "src/i18n"))
      .filter((name) => name.endsWith(".ts"))
      .map((name) => readSource(`src/i18n/${name}`))
      .join("\n");

    for (const retiredCopy of [
      "CanEnactGovernance permission is required for enact.",
      "CanSubmitGovernanceBallot permission is missing on the active account.",
      "Cast Plain Ballot",
      "Launch live instance",
      "Referendum Lookup",
      "Submit ballot",
      "Use Launch instance to submit a real Hugging Face deployment.",
    ]) {
      expect(localeSources).not.toContain(retiredCopy);
    }
  });
});
