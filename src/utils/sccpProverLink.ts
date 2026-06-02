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

const isLoopbackHost = (hostname: string): boolean => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeModuleUrlCharacter = (value: string): boolean => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

export const normalizeTronSccpProverModuleUrl = (
  value?: string | null,
): string | undefined => {
  const moduleUrl = value?.trim();
  if (!moduleUrl) {
    return undefined;
  }
  if (hasUnsafeModuleUrlCharacter(moduleUrl)) {
    throw new Error(
      "SCCP prover module URL must not contain whitespace or control characters.",
    );
  }
  if (/[?#]/u.test(moduleUrl)) {
    throw new Error(
      "SCCP prover module URL must not include query strings or fragments.",
    );
  }
  if (/^(?:\/(?!\/)|\.{1,2}\/)/u.test(moduleUrl)) {
    return moduleUrl;
  }
  let parsed: URL;
  try {
    parsed = new URL(moduleUrl);
  } catch (_error) {
    throw new Error(
      "SCCP prover module URL must be a relative path, HTTPS URL, or loopback HTTP URL.",
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error("SCCP prover module URL must not include credentials.");
  }
  if (parsed.search || parsed.hash) {
    throw new Error(
      "SCCP prover module URL must not include query strings or fragments.",
    );
  }
  if (parsed.protocol === "https:") {
    return parsed.toString();
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
    return parsed.toString();
  }
  throw new Error(
    "SCCP prover module URL must be a relative path, HTTPS URL, or loopback HTTP URL.",
  );
};

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
  const moduleUrl = normalizeTronSccpProverModuleUrl(input.moduleUrl);
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
  const moduleUrl = normalizeTronSccpProverModuleUrl(input.moduleUrl);
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
