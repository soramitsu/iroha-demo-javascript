import type {
  EvmSccpProveFn,
  SolanaSccpProveFn,
  TonSccpProveFn,
  TronSccpProveFn,
} from "@iroha/iroha-js/sccp";
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
  irohaSccpSolanaSourceProve?: unknown;
  solanaSccpSourceProve?: unknown;
  proveSolanaSource?: unknown;
  proveSolanaSccpSource?: unknown;
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

type SccpProverModuleBytesFetcher = (
  moduleUrl: string,
) => Promise<ArrayBuffer | ArrayBufferView | string>;

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

const normalizeSccpProverModuleHash = (
  value: string,
  label: string,
): string => {
  const normalized = `0x${value.trim().toLowerCase().replace(/^0x/u, "")}`;
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const snapshotSccpProverModuleBytes = (
  value: ArrayBuffer | ArrayBufferView | string,
): Uint8Array => {
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  const source =
    value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  const snapshot = new Uint8Array(source.byteLength);
  snapshot.set(source);
  return snapshot;
};

const copyBytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let encoded = "";
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const first = bytes[offset] ?? 0;
    const hasSecond = offset + 1 < bytes.length;
    const hasThird = offset + 2 < bytes.length;
    const second = hasSecond ? bytes[offset + 1] : 0;
    const third = hasThird ? bytes[offset + 2] : 0;
    encoded += alphabet[first >> 2];
    encoded += alphabet[((first & 0x03) << 4) | (second >> 4)];
    encoded += hasSecond
      ? alphabet[((second & 0x0f) << 2) | (third >> 6)]
      : "=";
    encoded += hasThird ? alphabet[third & 0x3f] : "=";
  }
  return encoded;
};

const immutableSccpProverModuleImportUrl = (bytes: Uint8Array): string =>
  `data:text/javascript;base64,${bytesToBase64(bytes)}`;

const sha256Hex = async (value: Uint8Array): Promise<string> => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("SCCP prover module hash verification needs WebCrypto.");
  }
  const digest = await subtle.digest("SHA-256", copyBytesToArrayBuffer(value));
  return `0x${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
};

const defaultFetchSccpProverModuleBytes: SccpProverModuleBytesFetcher = async (
  moduleUrl,
) => {
  if (typeof fetch !== "function") {
    throw new Error("SCCP prover module hash verification needs fetch.");
  }
  const response = await fetch(moduleUrl, {
    cache: "no-store",
    credentials: "omit",
  });
  if (!response.ok) {
    throw new Error(
      `SCCP prover module hash verification failed to fetch ${moduleUrl}: HTTP ${response.status}.`,
    );
  }
  return response.arrayBuffer();
};

const fetchVerifiedSccpProverModuleBytes = async (input: {
  moduleUrl: string;
  moduleHash: string;
  moduleBytesFetcher?: SccpProverModuleBytesFetcher;
}): Promise<Uint8Array> => {
  const expectedHash = input.moduleHash.trim();
  if (!expectedHash) {
    throw new Error("SCCP prover module hash is required.");
  }
  const normalizedExpected = normalizeSccpProverModuleHash(
    expectedHash,
    "SCCP prover module hash",
  );
  const fetched = await (
    input.moduleBytesFetcher ?? defaultFetchSccpProverModuleBytes
  )(input.moduleUrl);
  const bytes = snapshotSccpProverModuleBytes(fetched);
  const actualHash = await sha256Hex(bytes);
  if (actualHash !== normalizedExpected) {
    throw new Error(
      `SCCP prover module hash mismatch for ${input.moduleUrl}: expected ${normalizedExpected}, got ${actualHash}.`,
    );
  }
  return bytes;
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

export const loadSolanaSccpProveFn = async (input: {
  globalScope: SolanaSccpProverGlobal;
  moduleUrl?: string | null;
  moduleHash?: string | null;
  moduleBytesFetcher?: SccpProverModuleBytesFetcher;
  importer?: (moduleUrl: string) => Promise<SolanaSccpProverModule>;
}): Promise<SolanaSccpProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    throw new Error("Solana SCCP destination prover module URL is required.");
  }
  if (!input.moduleHash?.trim()) {
    throw new Error("Solana SCCP destination prover module hash is required.");
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<SolanaSccpProverModule>);
  const importUrl = resolveSccpProverImportUrl(moduleUrl);
  const moduleBytes = await fetchVerifiedSccpProverModuleBytes({
    moduleUrl: importUrl,
    moduleHash: input.moduleHash,
    moduleBytesFetcher: input.moduleBytesFetcher,
  });
  const moduleExports = await importer(
    immutableSccpProverModuleImportUrl(moduleBytes),
  );
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
  moduleHash?: string | null;
  moduleBytesFetcher?: SccpProverModuleBytesFetcher;
  importer?: (moduleUrl: string) => Promise<SolanaSccpProverModule>;
}): Promise<SolanaSccpSourceProveFn | undefined> => {
  const moduleUrl = normalizeSccpProverModuleUrl(input.moduleUrl);
  if (!moduleUrl) {
    throw new Error("Solana SCCP source prover module URL is required.");
  }
  if (!input.moduleHash?.trim()) {
    throw new Error("Solana SCCP source prover module hash is required.");
  }
  const importer =
    input.importer ??
    ((url: string) =>
      import(/* @vite-ignore */ url) as Promise<SolanaSccpProverModule>);
  const importUrl = resolveSccpProverImportUrl(moduleUrl);
  const moduleBytes = await fetchVerifiedSccpProverModuleBytes({
    moduleUrl: importUrl,
    moduleHash: input.moduleHash,
    moduleBytesFetcher: input.moduleBytesFetcher,
  });
  const moduleExports = await importer(
    immutableSccpProverModuleImportUrl(moduleBytes),
  );
  return pickSolanaSccpSourceProveFn(input.globalScope, moduleExports);
};
