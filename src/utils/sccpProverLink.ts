import type { TronSccpProveFn } from "@iroha/iroha-js/sccp";
import type { TronToTairaSourceProofPackageInput } from "@/utils/sccp";

export type TronSccpProverModule = {
  default?: unknown;
  prove?: unknown;
  proveFn?: unknown;
  irohaSccpTronProve?: unknown;
  tronSccpProve?: unknown;
  irohaSccpTronSourceProve?: unknown;
  tronSccpSourceProve?: unknown;
  proveTronSource?: unknown;
};

export type TronSccpProverGlobal = {
  irohaSccpTronProve?: unknown;
  tronSccpProve?: unknown;
  irohaSccpTronSourceProve?: unknown;
  tronSccpSourceProve?: unknown;
};

export type TronSccpSourceProveFn = (
  input: TronToTairaSourceProofPackageInput,
) => unknown | Promise<unknown>;

export const pickTronSccpProveFn = (
  globalScope: TronSccpProverGlobal,
  moduleExports?: TronSccpProverModule | null,
): TronSccpProveFn | undefined => {
  const candidates = [
    moduleExports?.irohaSccpTronProve,
    moduleExports?.tronSccpProve,
    moduleExports?.prove,
    moduleExports?.proveFn,
    moduleExports?.default,
    globalScope.irohaSccpTronProve,
    globalScope.tronSccpProve,
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
  const moduleUrl = input.moduleUrl?.trim();
  if (!moduleUrl) {
    return pickTronSccpProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TronSccpProverModule>);
  const moduleExports = await importer(moduleUrl);
  return pickTronSccpProveFn(input.globalScope, moduleExports);
};

export const pickTronSccpSourceProveFn = (
  globalScope: TronSccpProverGlobal,
  moduleExports?: TronSccpProverModule | null,
): TronSccpSourceProveFn | undefined => {
  const candidates = [
    moduleExports?.irohaSccpTronSourceProve,
    moduleExports?.tronSccpSourceProve,
    moduleExports?.proveTronSource,
    globalScope.irohaSccpTronSourceProve,
    globalScope.tronSccpSourceProve,
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
  const moduleUrl = input.moduleUrl?.trim();
  if (!moduleUrl) {
    return pickTronSccpSourceProveFn(input.globalScope);
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<TronSccpProverModule>);
  const moduleExports = await importer(moduleUrl);
  return pickTronSccpSourceProveFn(input.globalScope, moduleExports);
};
