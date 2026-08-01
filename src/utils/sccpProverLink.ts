import type {
  EvmSccpProveFn,
  TonSccpProveFn,
  TronSccpProveFn,
} from "@/legacy/sccpLegacySdk";
import type {
  SolanaDestinationProofResultV1,
  SolanaDestinationProverInputV1,
} from "@/utils/sccpSolanaDestination";
import type {
  BscToTairaSourceProofPackageInput,
  SolanaToTairaSourceProofPackageInput,
  TonToTairaSourceProofPackageInput,
  TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import { normalizeSccpProverModuleUrl } from "@/utils/sccpProverUrl";

export type TronSccpProverModule = {
  default?: unknown;
  moduleHash?: unknown;
  module_hash?: unknown;
  sha256?: unknown;
  sha256Hash?: unknown;
  sha256_hash?: unknown;
  prove?: unknown;
  proveFn?: unknown;
  irohaSccpTronProve?: unknown;
  tronSccpProve?: unknown;
  irohaSccpBscProve?: unknown;
  bscSccpProve?: unknown;
  evmSccpProve?: unknown;
  irohaSccpTonProve?: unknown;
  tonSccpProve?: unknown;
  proveTon?: unknown;
  proveBsc?: unknown;
  irohaSccpTronSourceProve?: unknown;
  tronSccpSourceProve?: unknown;
  proveTronSource?: unknown;
  irohaSccpBscSourceProve?: unknown;
  bscSccpSourceProve?: unknown;
  proveBscSource?: unknown;
  irohaSccpTonSourceProve?: unknown;
  tonSccpSourceProve?: unknown;
  proveTonSource?: unknown;
  proveTonSccpSource?: unknown;
  irohaSccpSolanaProve?: unknown;
  solanaSccpProve?: unknown;
  proveSolana?: unknown;
  proveSolanaSccpDestination?: unknown;
  solanaSccpDestinationProverSelfTest?: unknown;
  irohaSccpSolanaSourceProve?: unknown;
  solanaSccpSourceProve?: unknown;
  proveSolanaSource?: unknown;
  proveSolanaSccpSource?: unknown;
  solanaSccpSourceProverSelfTest?: unknown;
};

export type TronSccpProverGlobal = {
  irohaSccpTronProve?: unknown;
  tronSccpProve?: unknown;
  irohaSccpBscProve?: unknown;
  bscSccpProve?: unknown;
  evmSccpProve?: unknown;
  irohaSccpTonProve?: unknown;
  tonSccpProve?: unknown;
  irohaSccpTronSourceProve?: unknown;
  tronSccpSourceProve?: unknown;
  irohaSccpBscSourceProve?: unknown;
  bscSccpSourceProve?: unknown;
  irohaSccpTonSourceProve?: unknown;
  tonSccpSourceProve?: unknown;
  irohaSccpSolanaProve?: unknown;
  solanaSccpProve?: unknown;
  irohaSccpSolanaSourceProve?: unknown;
  solanaSccpSourceProve?: unknown;
};

export type BscSccpProverModule = TronSccpProverModule;

export type BscSccpProverGlobal = Pick<
  TronSccpProverGlobal,
  "irohaSccpBscProve" | "bscSccpProve" | "evmSccpProve"
>;

export type TonSccpProverModule = TronSccpProverModule;

export type TonSccpProverGlobal = Pick<
  TronSccpProverGlobal,
  | "irohaSccpTonProve"
  | "tonSccpProve"
  | "irohaSccpTonSourceProve"
  | "tonSccpSourceProve"
>;

export type SolanaSccpProverModule = TronSccpProverModule;

export type SolanaSccpProveFn = (
  input: SolanaDestinationProverInputV1,
) => SolanaDestinationProofResultV1 | unknown | Promise<unknown>;

export type SolanaSccpProverGlobal = Pick<
  TronSccpProverGlobal,
  | "irohaSccpSolanaProve"
  | "solanaSccpProve"
  | "irohaSccpSolanaSourceProve"
  | "solanaSccpSourceProve"
>;

export type TronSccpSourceProveFn = (
  input: TronToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export type BscSccpSourceProveFn = (
  input: BscToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export type TonSccpSourceProveFn = (
  input: TonToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export type SolanaSccpSourceProveFn = (
  input: SolanaToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

type SccpProverExportName =
  | keyof TronSccpProverModule
  | keyof TronSccpProverGlobal;

const SCCP_PROVER_EXPORT_DATA_PROPERTY_ERROR =
  "SCCP prover exports must be own enumerable data properties.";

const readSccpProverExport = (
  source: unknown,
  exportName: SccpProverExportName,
): unknown => {
  if (
    source === null ||
    (typeof source !== "object" && typeof source !== "function")
  ) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(source, exportName);
  if (!descriptor) {
    return undefined;
  }
  if (!descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(SCCP_PROVER_EXPORT_DATA_PROPERTY_ERROR);
  }
  return descriptor.value;
};

const resolveSccpProverImportUrl = (moduleUrl: string): string => {
  if (moduleUrl.startsWith("/") && globalThis.location?.protocol === "file:") {
    const assetsMarker = "/assets/";
    const markerIndex = import.meta.url.lastIndexOf(assetsMarker);
    const rendererRoot =
      markerIndex >= 0
        ? import.meta.url.slice(0, markerIndex)
        : import.meta.url.replace(/\/[^/]*$/u, "");
    return `${rendererRoot}${moduleUrl}`;
  }
  return moduleUrl;
};

export const normalizeTronSccpProverModuleUrl = normalizeSccpProverModuleUrl;

export const pickTronSccpProveFn = (
  globalScope: TronSccpProverGlobal,
  moduleExports?: TronSccpProverModule | null,
): TronSccpProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "irohaSccpTronProve"),
    readSccpProverExport(moduleExports, "tronSccpProve"),
    readSccpProverExport(moduleExports, "prove"),
    readSccpProverExport(moduleExports, "proveFn"),
    readSccpProverExport(moduleExports, "default"),
    readSccpProverExport(globalScope, "irohaSccpTronProve"),
    readSccpProverExport(globalScope, "tronSccpProve"),
  ];
  return candidates.find(
    (candidate): candidate is TronSccpProveFn =>
      typeof candidate === "function",
  );
};

export const loadTronSccpProveFn = async (input: {
  globalScope: TronSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<TronSccpProverModule>;
}): Promise<TronSccpProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return pickTronSccpProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TronSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickTronSccpProveFn(input.globalScope, moduleExports);
};

export const pickBscSccpProveFn = (
  _globalScope: BscSccpProverGlobal,
  moduleExports?: BscSccpProverModule | null,
): EvmSccpProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "irohaSccpBscProve"),
    readSccpProverExport(moduleExports, "bscSccpProve"),
    readSccpProverExport(moduleExports, "evmSccpProve"),
    readSccpProverExport(moduleExports, "proveBsc"),
    readSccpProverExport(moduleExports, "prove"),
    readSccpProverExport(moduleExports, "proveFn"),
    readSccpProverExport(moduleExports, "default"),
  ];
  return candidates.find(
    (candidate): candidate is EvmSccpProveFn => typeof candidate === "function",
  );
};

export const loadBscSccpProveFn = async (input: {
  globalScope: BscSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<BscSccpProverModule>;
}): Promise<EvmSccpProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return undefined;
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<BscSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickBscSccpProveFn(input.globalScope, moduleExports);
};

export const pickTonSccpProveFn = (
  _globalScope: TonSccpProverGlobal,
  moduleExports?: TonSccpProverModule | null,
): TonSccpProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "irohaSccpTonProve"),
    readSccpProverExport(moduleExports, "tonSccpProve"),
    readSccpProverExport(moduleExports, "proveTon"),
    readSccpProverExport(moduleExports, "prove"),
    readSccpProverExport(moduleExports, "proveFn"),
    readSccpProverExport(moduleExports, "default"),
    readSccpProverExport(_globalScope, "irohaSccpTonProve"),
    readSccpProverExport(_globalScope, "tonSccpProve"),
  ];
  return candidates.find(
    (candidate): candidate is TonSccpProveFn => typeof candidate === "function",
  );
};

export const loadTonSccpProveFn = async (input: {
  globalScope: TonSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<TonSccpProverModule>;
}): Promise<TonSccpProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return pickTonSccpProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TonSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickTonSccpProveFn(input.globalScope, moduleExports);
};

export const pickSolanaSccpProveFn = (
  _globalScope: SolanaSccpProverGlobal,
  moduleExports?: SolanaSccpProverModule | null,
): SolanaSccpProveFn | undefined => {
  const candidate = readSccpProverExport(
    moduleExports,
    "proveSolanaSccpDestination",
  );
  return typeof candidate === "function"
    ? (candidate as SolanaSccpProveFn)
    : undefined;
};

const readOwnSccpProverDataField = (
  value: unknown,
  key: string,
  label: string,
): unknown => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be a plain object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain object.`);
  }
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
    throw new Error(`${label}.${key} must be an enumerable data property.`);
  }
  return descriptor.value;
};

const SOLANA_PROVER_ROUTE_ID = "taira_sol_xor";
const SOLANA_PROVER_ASSET_KEY = "xor";
const SOLANA_PROVER_NETWORK = "solana-testnet";
const SOLANA_PROVER_GENESIS_HASH =
  "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY";
const SOLANA_PROVER_BACKEND = "solana-groth16-bn254-v1";

const readMatchingSolanaSelfTestAliases = (
  record: unknown,
  camelKey: string,
  snakeKey: string,
  label: string,
): unknown => {
  const camel = readOwnSccpProverDataField(record, camelKey, label);
  const snake = readOwnSccpProverDataField(record, snakeKey, label);
  if (JSON.stringify(camel) !== JSON.stringify(snake)) {
    throw new Error(
      `${label}.${camelKey} and ${label}.${snakeKey} must agree exactly.`,
    );
  }
  return camel;
};

const validateSolanaProductionProverSelfTest = (
  result: unknown,
  direction: "destination" | "source",
): void => {
  const label = `Solana ${direction} prover self-test`;
  const sourceDomain = direction === "destination" ? 0 : 3;
  const targetDomain = direction === "destination" ? 3 : 0;
  if (
    readOwnSccpProverDataField(result, "ready", label) !== true ||
    readOwnSccpProverDataField(result, "linked", label) !== true ||
    readMatchingSolanaSelfTestAliases(
      result,
      "productionProofsReady",
      "production_proofs_ready",
      label,
    ) !== true ||
    readMatchingSolanaSelfTestAliases(result, "routeId", "route_id", label) !==
      SOLANA_PROVER_ROUTE_ID ||
    readMatchingSolanaSelfTestAliases(
      result,
      "assetKey",
      "asset_key",
      label,
    ) !== SOLANA_PROVER_ASSET_KEY ||
    readMatchingSolanaSelfTestAliases(
      result,
      "solanaNetwork",
      "solana_network",
      label,
    ) !== SOLANA_PROVER_NETWORK ||
    readOwnSccpProverDataField(result, "network", label) !==
      SOLANA_PROVER_NETWORK ||
    readMatchingSolanaSelfTestAliases(
      result,
      "genesisHash",
      "genesis_hash",
      label,
    ) !== SOLANA_PROVER_GENESIS_HASH ||
    readOwnSccpProverDataField(result, "direction", label) !== direction ||
    readMatchingSolanaSelfTestAliases(
      result,
      "sourceDomain",
      "source_domain",
      label,
    ) !== sourceDomain ||
    readMatchingSolanaSelfTestAliases(
      result,
      "targetDomain",
      "target_domain",
      label,
    ) !== targetDomain ||
    readMatchingSolanaSelfTestAliases(
      result,
      "proofBackend",
      "proof_backend",
      label,
    ) !== SOLANA_PROVER_BACKEND ||
    readMatchingSolanaSelfTestAliases(
      result,
      "requiredProofBackend",
      "required_proof_backend",
      label,
    ) !== SOLANA_PROVER_BACKEND
  ) {
    throw new Error(
      `Solana ${direction} prover self-test must be production-ready and exactly route, network, direction, domain, and backend bound.`,
    );
  }
  const missingArtifactIds = readMatchingSolanaSelfTestAliases(
    result,
    "missingArtifactIds",
    "missing_artifact_ids",
    label,
  );
  if (!Array.isArray(missingArtifactIds) || missingArtifactIds.length !== 0) {
    throw new Error(
      `Solana ${direction} prover self-test must report no missing production artifacts.`,
    );
  }
};

export const validateSolanaDestinationProverSelfTest = async (input: {
  moduleExports: SolanaSccpProverModule;
  semanticProofProfile: SolanaDestinationProverInputV1["proof_request"]["semantic_proof_profile"];
}): Promise<void> => {
  const selfTest = readSccpProverExport(
    input.moduleExports,
    "solanaSccpDestinationProverSelfTest",
  );
  if (typeof selfTest !== "function") {
    throw new Error(
      "Solana destination prover must export solanaSccpDestinationProverSelfTest.",
    );
  }
  const result = await selfTest();
  validateSolanaProductionProverSelfTest(result, "destination");
  const profile = readOwnSccpProverDataField(
    result,
    "semantic_proof_profile",
    "Solana prover self-test",
  );
  const commitments = readOwnSccpProverDataField(
    profile,
    "commitments",
    "Solana prover self-test semantic_proof_profile",
  );
  const expected = input.semanticProofProfile;
  if (
    readOwnSccpProverDataField(
      profile,
      "profile",
      "Solana prover self-test semantic_proof_profile",
    ) !== expected.profile ||
    readOwnSccpProverDataField(
      commitments,
      "version",
      "Solana prover self-test commitments",
    ) !== expected.commitments.version ||
    readOwnSccpProverDataField(
      commitments,
      "circuit_commitment",
      "Solana prover self-test commitments",
    ) !== expected.commitments.circuit_commitment ||
    readOwnSccpProverDataField(
      commitments,
      "witness_generator_commitment",
      "Solana prover self-test commitments",
    ) !== expected.commitments.witness_generator_commitment ||
    readOwnSccpProverDataField(
      commitments,
      "public_signal_schema_hash",
      "Solana prover self-test commitments",
    ) !== expected.commitments.public_signal_schema_hash
  ) {
    throw new Error(
      "Solana destination prover self-test commitments do not match the typed route outbound proof policy.",
    );
  }
};

export const validateSolanaSourceProverSelfTest = async (input: {
  moduleExports: SolanaSccpProverModule;
}): Promise<void> => {
  const selfTest = readSccpProverExport(
    input.moduleExports,
    "solanaSccpSourceProverSelfTest",
  );
  if (typeof selfTest !== "function") {
    throw new Error(
      "Solana source prover must export solanaSccpSourceProverSelfTest.",
    );
  }
  validateSolanaProductionProverSelfTest(await selfTest(), "source");
};

export const loadSolanaSccpProveFn = async (input: {
  globalScope: SolanaSccpProverGlobal;
  moduleUrl?: string | null;
  semanticProofProfile: SolanaDestinationProverInputV1["proof_request"]["semantic_proof_profile"];
  importer?: (moduleUrl: string) => Promise<SolanaSccpProverModule>;
}): Promise<SolanaSccpProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    throw new Error("Solana SCCP destination prover module URL is required.");
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<SolanaSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  await validateSolanaDestinationProverSelfTest({
    moduleExports,
    semanticProofProfile: input.semanticProofProfile,
  });
  return pickSolanaSccpProveFn(input.globalScope, moduleExports);
};

export const pickTronSccpSourceProveFn = (
  globalScope: TronSccpProverGlobal,
  moduleExports?: TronSccpProverModule | null,
): TronSccpSourceProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "irohaSccpTronSourceProve"),
    readSccpProverExport(moduleExports, "tronSccpSourceProve"),
    readSccpProverExport(moduleExports, "proveTronSource"),
    readSccpProverExport(globalScope, "irohaSccpTronSourceProve"),
    readSccpProverExport(globalScope, "tronSccpSourceProve"),
  ];
  return candidates.find(
    (candidate): candidate is TronSccpSourceProveFn =>
      typeof candidate === "function",
  );
};

export const loadTronSccpSourceProveFn = async (input: {
  globalScope: TronSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<TronSccpProverModule>;
}): Promise<TronSccpSourceProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return pickTronSccpSourceProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TronSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickTronSccpSourceProveFn(input.globalScope, moduleExports);
};

export const pickBscSccpSourceProveFn = (
  _globalScope: BscSccpProverGlobal,
  moduleExports?: TronSccpProverModule | null,
): BscSccpSourceProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "irohaSccpBscSourceProve"),
    readSccpProverExport(moduleExports, "bscSccpSourceProve"),
    readSccpProverExport(moduleExports, "proveBscSource"),
  ];
  return candidates.find(
    (candidate): candidate is BscSccpSourceProveFn =>
      typeof candidate === "function",
  );
};

export const loadBscSccpSourceProveFn = async (input: {
  globalScope: BscSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<TronSccpProverModule>;
}): Promise<BscSccpSourceProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return undefined;
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TronSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickBscSccpSourceProveFn(input.globalScope, moduleExports);
};

export const pickTonSccpSourceProveFn = (
  globalScope: TonSccpProverGlobal,
  moduleExports?: TonSccpProverModule | null,
): TonSccpSourceProveFn | undefined => {
  const candidates = [
    readSccpProverExport(moduleExports, "proveTonSccpSource"),
    readSccpProverExport(moduleExports, "irohaSccpTonSourceProve"),
    readSccpProverExport(moduleExports, "tonSccpSourceProve"),
    readSccpProverExport(moduleExports, "proveTonSource"),
    readSccpProverExport(globalScope, "irohaSccpTonSourceProve"),
    readSccpProverExport(globalScope, "tonSccpSourceProve"),
  ];
  return candidates.find(
    (candidate): candidate is TonSccpSourceProveFn =>
      typeof candidate === "function",
  );
};

export const loadTonSccpSourceProveFn = async (input: {
  globalScope: TonSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<TonSccpProverModule>;
}): Promise<TonSccpSourceProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    return pickTonSccpSourceProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TonSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  return pickTonSccpSourceProveFn(input.globalScope, moduleExports);
};

export const pickSolanaSccpSourceProveFn = (
  _globalScope: SolanaSccpProverGlobal,
  moduleExports?: SolanaSccpProverModule | null,
): SolanaSccpSourceProveFn | undefined => {
  const candidate = readSccpProverExport(
    moduleExports,
    "proveSolanaSccpSource",
  );
  return typeof candidate === "function"
    ? (candidate as SolanaSccpSourceProveFn)
    : undefined;
};

export const loadSolanaSccpSourceProveFn = async (input: {
  globalScope: SolanaSccpProverGlobal;
  moduleUrl?: string | null;
  importer?: (moduleUrl: string) => Promise<SolanaSccpProverModule>;
}): Promise<SolanaSccpSourceProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    throw new Error("Solana SCCP source prover module URL is required.");
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<SolanaSccpProverModule>);
  const moduleExports = await importer(resolveSccpProverImportUrl(moduleUrl));
  await validateSolanaSourceProverSelfTest({ moduleExports });
  return pickSolanaSccpSourceProveFn(input.globalScope, moduleExports);
};
