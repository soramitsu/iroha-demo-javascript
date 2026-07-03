import type {
  EvmSccpProveFn,
  TonSccpProveFn,
  TronSccpProveFn,
} from "@iroha/iroha-js/sccp";
import type {
  BscToTairaSourceProofPackageInput,
  TonToTairaSourceProofPackageInput,
  TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import { normalizeSccpProverModuleUrl } from "@/utils/sccpProverUrl";

export type TronSccpProverModule = {
  default?: unknown;
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

export type TronSccpSourceProveFn = (
  input: TronToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export type BscSccpSourceProveFn = (
  input: BscToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export type TonSccpSourceProveFn = (
  input: TonToTairaSourceProofPackageInput,
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
