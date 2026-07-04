import "@/polyfills";
import {
  buildBscSccpProofPackage,
  buildSolanaSccpProofPackage,
  buildTonSccpProofPackage,
  buildTronSccpProofPackage,
  generateBscSccpProofPackage,
  generateSolanaSccpProofPackage,
  generateTonSccpProofPackage,
  generateTronSccpProofPackage,
  type BscSccpProofPackageInput,
  type SolanaSccpProofPackageInput,
  type TonSccpProofPackageInput,
  type TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";
import {
  buildBscSourceChainProofEnvelope,
  type BscSourceChainProofEnvelopeInput,
  type BscSourceChainProofEnvelopeResult,
} from "@iroha/iroha-js/sccp";
import {
  bindBscToTairaSourceProofPackage,
  bindSolanaToTairaSourceProofPackage,
  bindTonToTairaSourceProofPackage,
  bindTronToTairaSourceProofPackage,
  readBscSourceProverMaterialBinding,
  type BscSourceProverMaterialBinding,
  type BscToTairaSourceProofPackage,
  type BscToTairaSourceProofPackageInput,
  type SolanaToTairaSourceProofPackage,
  type SolanaToTairaSourceProofPackageInput,
  type TonToTairaSourceProofPackage,
  type TonToTairaSourceProofPackageInput,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import {
  loadBscSccpProveFn,
  loadBscSccpSourceProveFn,
  loadSolanaSccpProveFn,
  loadSolanaSccpSourceProveFn,
  loadTonSccpProveFn,
  loadTonSccpSourceProveFn,
  loadTronSccpSourceProveFn,
  loadTronSccpProveFn,
  type BscSccpProverModule,
  type BscSccpProverGlobal,
  type SolanaSccpProverGlobal,
  type SolanaSccpProverModule,
  type TonSccpProverGlobal,
  type TonSccpProverModule,
  type TonSccpSourceProveFn,
  type TronSccpProverGlobal,
} from "@/utils/sccpProverLink";
import { normalizeSccpPackageOrRemoteModuleUrl } from "@/utils/sccpProverUrl";
import { snapshotSccpDataValue } from "@/utils/sccpDataSnapshot";
import { isSecretLikeTextValue } from "@/utils/secretLike";

type BscRuntimeProverWorkerGlobal = typeof self & {
  IrohaSccpBscProverConfigUrl?: string;
};

type SccpProverWorkerRequestKind =
  | "build-bsc-proof-package"
  | "prove-bsc-proof-package"
  | "build-ton-proof-package"
  | "prove-ton-proof-package"
  | "build-solana-proof-package"
  | "prove-solana-proof-package"
  | "build-tron-proof-package"
  | "prove-tron-proof-package"
  | "prove-tron-source-package"
  | "prewarm-ton-source-prover"
  | "prove-ton-source-package"
  | "prove-solana-source-package"
  | "prove-bsc-source-package";

type SccpProverWorkerRequest =
  | {
      id: string;
      kind: "build-bsc-proof-package";
      input: BscSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "prove-bsc-proof-package";
      input: BscSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "build-ton-proof-package";
      input: TonSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "prove-ton-proof-package";
      input: TonSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "build-solana-proof-package";
      input: SolanaSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "prove-solana-proof-package";
      input: SolanaSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "build-tron-proof-package";
      input: TronSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "prove-tron-proof-package";
      input: TronSccpProofPackageInput;
    }
  | {
      id: string;
      kind: "prove-tron-source-package";
      input: TronToTairaSourceProofPackageInput;
    }
  | {
      id: string;
      kind: "prewarm-ton-source-prover";
      input: { proverModuleUrl?: string };
    }
  | {
      id: string;
      kind: "prove-ton-source-package";
      input: TonToTairaSourceProofWorkerInput;
    }
  | {
      id: string;
      kind: "prove-solana-source-package";
      input: SolanaToTairaSourceProofWorkerInput;
    }
  | {
      id: string;
      kind: "prove-bsc-source-package";
      input: BscToTairaSourceProofWorkerInput;
    };

type BscToTairaSourceProofWorkerInput = Omit<
  BscToTairaSourceProofPackageInput,
  "proofArtifactHash" | "provingKeyHash" | "nativeEvmProverBundleHash"
> & {
  proverModuleUrl?: string;
  proverConfigUrl?: string;
};

type TonToTairaSourceProofWorkerInput = TonToTairaSourceProofPackageInput & {
  proverModuleUrl?: string;
};

type SolanaToTairaSourceProofWorkerInput =
  SolanaToTairaSourceProofPackageInput & {
    proverModuleUrl?: string;
  };

type SccpProverWorkerResponse =
  | {
      id: string;
      ok: true;
      result:
        | ReturnType<typeof buildBscSccpProofPackage>
        | ReturnType<typeof buildSolanaSccpProofPackage>
        | ReturnType<typeof buildTonSccpProofPackage>
        | ReturnType<typeof buildTronSccpProofPackage>
        | BscToTairaSourceProofPackage
        | SolanaToTairaSourceProofPackage
        | TonToTairaSourceProofPackage
        | TronToTairaSourceProofPackage
        | Record<string, unknown>;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isCanonicalArrayIndexKey = (key: string, length: number): boolean => {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(key)) {
    return false;
  }
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
};

const ownEnumerableDataEntries = (
  value: object,
  errorMessage: string,
): Array<[string, unknown]> => {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const entries: Array<[string, unknown]> = [];
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(descriptors, String(index))) {
        throw new Error(errorMessage);
      }
    }
  }
  for (const key of Reflect.ownKeys(descriptors)) {
    if (Array.isArray(value) && key === "length") {
      continue;
    }
    if (
      typeof key !== "string" ||
      (Array.isArray(value) && !isCanonicalArrayIndexKey(key, value.length))
    ) {
      throw new Error(errorMessage);
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor)) {
      throw new Error(errorMessage);
    }
    entries.push([key, descriptor.value]);
  }
  return entries;
};

const MAX_SCCP_WORKER_REQUEST_ID_LENGTH = 128;
const SCCP_WORKER_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const SCCP_WORKER_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN =
  /^(?:privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;
const SCCP_WORKER_SECRET_INPUT_ERROR =
  "SCCP worker request input must not contain secret-like material before SCCP proof generation.";
const SCCP_WORKER_SIGNING_HELPER_INPUT_ERROR =
  "SCCP worker request input must not contain signing helper payloads; counterparty signing must happen through wallet approval.";
const SCCP_WORKER_SECRET_OUTPUT_ERROR =
  "SCCP worker result must not contain secret-like material after SCCP proof generation.";
const SCCP_WORKER_SIGNING_HELPER_OUTPUT_ERROR =
  "SCCP worker result must not contain signing helper payloads; counterparty signing must happen through wallet approval.";
const SCCP_WORKER_BSC_BUILD_PROOF_MATERIAL_INPUT_ERROR =
  "BSC destination proof requests must not include caller-supplied proof material; proof material must come from the configured BSC prover module.";
const SCCP_WORKER_BSC_SOURCE_PROOF_MATERIAL_INPUT_ERROR =
  "BSC source proof requests must not include caller-supplied proof material; proof hashes are derived from the route manifest inside the worker.";
const SCCP_WORKER_BSC_BUILD_PROOF_MATERIAL_KEYS = new Set([
  "proofBytes",
  "proof_bytes",
  "proofResult",
  "proof_result",
]);
const SCCP_WORKER_BSC_SOURCE_PROOF_MATERIAL_KEYS = new Set([
  "proofArtifactHash",
  "proof_artifact_hash",
  "proverArtifactHash",
  "prover_artifact_hash",
  "provingKeyHash",
  "proving_key_hash",
  "nativeEvmProverBundleHash",
  "native_evm_prover_bundle_hash",
  "nativeProverBundleHash",
  "native_prover_bundle_hash",
]);

const activeBscNetworkEnvKey = (): "mainnet" | "testnet" => {
  const normalized = String(import.meta.env.VITE_SCCP_BSC_NETWORK ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/gu, "-");
  return ["mainnet", "bsc-mainnet", "bnb-mainnet", "bsc"].includes(normalized)
    ? "mainnet"
    : "testnet";
};

const readBscProfileEnv = (
  testnetKey: keyof ImportMetaEnv,
  mainnetKey: keyof ImportMetaEnv,
): string => {
  const activeKey =
    activeBscNetworkEnvKey() === "mainnet" ? mainnetKey : testnetKey;
  return String(import.meta.env[activeKey] ?? "").trim();
};

const readOptionalWorkerString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const resolveWorkerPublicUrl = (value: unknown): string => {
  const url = readOptionalWorkerString(value);
  if (!url) {
    return "";
  }
  if (url.startsWith("/") && self.location?.protocol === "file:") {
    return new URL(`..${url}`, self.location.href).href;
  }
  return url;
};

const importWorkerPublicModule = async <TModule>(
  moduleUrl: string,
): Promise<TModule> =>
  import(
    /* @vite-ignore */ resolveWorkerPublicUrl(moduleUrl)
  ) as Promise<TModule>;

let tonSourceProverCache: {
  moduleUrl: string;
  promise: Promise<TonSccpSourceProveFn | undefined>;
} | null = null;

const resolveTonSourceProverModuleUrl = (moduleUrl?: unknown): string =>
  readOptionalWorkerString(moduleUrl) ||
  import.meta.env.VITE_SCCP_TON_SOURCE_PROVER_MODULE_URL ||
  "";

const loadCachedTonSourceProveFn = (
  moduleUrl?: unknown,
): Promise<TonSccpSourceProveFn | undefined> => {
  const resolvedModuleUrl = resolveTonSourceProverModuleUrl(moduleUrl);
  if (
    !tonSourceProverCache ||
    tonSourceProverCache.moduleUrl !== resolvedModuleUrl
  ) {
    tonSourceProverCache = {
      moduleUrl: resolvedModuleUrl,
      promise: loadTonSccpSourceProveFn({
        globalScope: self as unknown as TonSccpProverGlobal,
        moduleUrl: resolvedModuleUrl,
        importer: importWorkerPublicModule<TonSccpProverModule>,
      }),
    };
  }
  return tonSourceProverCache.promise;
};

const isSccpProverWorkerRequestKind = (
  value: unknown,
): value is SccpProverWorkerRequestKind =>
  value === "build-bsc-proof-package" ||
  value === "prove-bsc-proof-package" ||
  value === "build-ton-proof-package" ||
  value === "prove-ton-proof-package" ||
  value === "build-solana-proof-package" ||
  value === "prove-solana-proof-package" ||
  value === "build-tron-proof-package" ||
  value === "prove-tron-proof-package" ||
  value === "prove-tron-source-package" ||
  value === "prewarm-ton-source-prover" ||
  value === "prove-ton-source-package" ||
  value === "prove-solana-source-package" ||
  value === "prove-bsc-source-package";

const normalizeSccpProverWorkerRequestId = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("SCCP worker request id must be a non-empty string.");
  }
  if (
    value.length > MAX_SCCP_WORKER_REQUEST_ID_LENGTH ||
    !SCCP_WORKER_REQUEST_ID_PATTERN.test(value)
  ) {
    throw new Error(
      "SCCP worker request id must use 1-128 safe ASCII characters.",
    );
  }
  return value;
};

const readSccpProverWorkerRequestId = (data: unknown): string => {
  try {
    const snapshot = snapshotSccpDataValue(data, "SCCP worker request");
    return isRecord(snapshot)
      ? normalizeSccpProverWorkerRequestId(snapshot.id)
      : "";
  } catch (_error) {
    return "";
  }
};

const snapshotSccpProverWorkerInput = <T>(input: T, label: string): T => {
  return snapshotSccpDataValue(input, label);
};

const readWorkerOwnField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): unknown => {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      return value[key];
    }
  }
  return undefined;
};

const readRequiredWorkerTextField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): string => {
  const selected = readWorkerOwnField(value, keys);
  const text = typeof selected === "string" ? selected.trim() : "";
  if (!text) {
    throw new Error(`${label} is required.`);
  }
  return text;
};

const readOptionalWorkerTextField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): string | undefined => {
  const selected = readWorkerOwnField(value, keys);
  const text = typeof selected === "string" ? selected.trim() : "";
  return text || undefined;
};

const readRequiredWorkerRecordField = (
  value: Record<string, unknown>,
  keys: readonly string[],
  label: string,
): Record<string, unknown> => {
  const selected = readWorkerOwnField(value, keys);
  if (!isRecord(selected)) {
    throw new Error(`${label} must be an object.`);
  }
  return selected;
};

const readOptionalWorkerRecordField = (
  value: Record<string, unknown>,
  keys: readonly string[],
): Record<string, unknown> | undefined => {
  const selected = readWorkerOwnField(value, keys);
  return isRecord(selected) ? selected : undefined;
};

const normalizeWorkerUnsignedIndex = (
  value: unknown,
  label: string,
): string => {
  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new Error(`${label} must be a safe non-negative integer.`);
    }
    parsed = BigInt(value);
  } else if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    if (/^0x(?:0|[1-9a-f][0-9a-f]*)$/u.test(text)) {
      parsed = BigInt(text);
    } else if (/^(?:0|[1-9][0-9]*)$/u.test(text)) {
      parsed = BigInt(text);
    } else {
      throw new Error(`${label} must be an unsigned integer.`);
    }
  } else {
    throw new Error(`${label} must be an unsigned integer.`);
  }
  if (parsed < 0n || parsed > (1n << 64n) - 1n) {
    throw new Error(`${label} must fit in an unsigned 64-bit integer.`);
  }
  return parsed.toString();
};

const readOptionalWorkerUnsignedIndex = (
  record: Record<string, unknown> | undefined,
  keys: readonly string[],
  label: string,
): string | undefined => {
  if (!record) {
    return undefined;
  }
  let selectedValue = "";
  let selectedKey = "";
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      continue;
    }
    const value = record[key];
    if (value === undefined || value === null || value === "") {
      continue;
    }
    const normalized = normalizeWorkerUnsignedIndex(value, label);
    if (!selectedValue) {
      selectedValue = normalized;
      selectedKey = key;
      continue;
    }
    if (selectedValue !== normalized) {
      throw new Error(
        `${label} aliases disagree: ${selectedKey}=${selectedValue} but ${key}=${normalized}.`,
      );
    }
  }
  return selectedValue || undefined;
};

const readBscSourceReceiptRootIndex = (
  input: Record<string, unknown>,
  receipt: Record<string, unknown> | undefined,
): string | undefined => {
  const keys = [
    "receiptRootIndex",
    "receipt_root_index",
    "transactionIndex",
    "transaction_index",
  ] as const;
  const topLevel = readOptionalWorkerUnsignedIndex(
    input,
    keys,
    "BSC source receipt root index",
  );
  const receiptLevel = readOptionalWorkerUnsignedIndex(
    receipt,
    keys,
    "BSC source receipt root index",
  );
  if (topLevel && receiptLevel && topLevel !== receiptLevel) {
    throw new Error(
      "BSC source receipt root index aliases disagree between request and receipt.",
    );
  }
  return topLevel || receiptLevel;
};

const withBscSourceReceiptRootIndex = <T extends Record<string, unknown>>(
  input: T,
): T & { receiptRootIndex?: string } => {
  const receipt = readOptionalWorkerRecordField(input, ["receipt"]);
  const receiptRootIndex = readBscSourceReceiptRootIndex(input, receipt);
  return receiptRootIndex
    ? {
        ...input,
        receiptRootIndex,
      }
    : input;
};

const replaceBscSourcePackageFinalityProof = (
  proofPackage: Record<string, unknown>,
  sourceProof: BscSourceChainProofEnvelopeResult,
): Record<string, unknown> => {
  const messageBundle = readRequiredWorkerRecordField(
    proofPackage,
    ["messageBundle", "message_bundle"],
    "BSC source proof package messageBundle",
  );
  const patchedMessageBundle: Record<string, unknown> = {
    ...messageBundle,
    finality_proof: sourceProof.sourceProofHex,
  };
  if (Object.prototype.hasOwnProperty.call(messageBundle, "finalityProof")) {
    patchedMessageBundle.finalityProof = sourceProof.sourceProofHex;
  }
  const patchedPackage: Record<string, unknown> = {
    ...proofPackage,
    messageBundle: patchedMessageBundle,
  };
  if (Object.prototype.hasOwnProperty.call(proofPackage, "message_bundle")) {
    patchedPackage.message_bundle = patchedMessageBundle;
  }
  return patchedPackage;
};

const withBscSourcePublicInputFinality = (
  proofPackage: Record<string, unknown>,
  sourceProof: Pick<
    BscSourceChainProofEnvelopeResult,
    "finalityHeight" | "finalityBlockHash"
  >,
): Record<string, unknown> => {
  const publicInputKey = isRecord(proofPackage.publicInputs)
    ? "publicInputs"
    : isRecord(proofPackage.public_inputs)
      ? "public_inputs"
      : null;
  if (!publicInputKey) {
    return proofPackage;
  }
  return {
    ...proofPackage,
    [publicInputKey]: {
      ...(proofPackage[publicInputKey] as Record<string, unknown>),
      finalityHeight: sourceProof.finalityHeight,
      finalityBlockHash: sourceProof.finalityBlockHash,
    },
  };
};

const buildBinaryBscSourceProofPackage = (
  proofPackage: unknown,
  input: BscToTairaSourceProofPackageInput,
): Record<string, unknown> => {
  const packageSnapshot = snapshotSccpDataValue(
    proofPackage,
    "BSC source proof package",
  );
  if (!isRecord(packageSnapshot)) {
    throw new Error("BSC source proof package must be an object.");
  }
  const packageRecord = packageSnapshot;
  const messageBundle = readRequiredWorkerRecordField(
    packageRecord,
    ["messageBundle", "message_bundle"],
    "BSC source proof package messageBundle",
  );
  const commitment = readRequiredWorkerRecordField(
    messageBundle,
    ["commitment"],
    "BSC source proof package commitment",
  );
  const inputRecord = input as Record<string, unknown>;
  if (
    isRecord(inputRecord.sourceVerifierMaterial) ||
    isRecord(inputRecord.source_verifier_material) ||
    isRecord(inputRecord.sourceAdapterEngineDeployment) ||
    isRecord(inputRecord.source_adapter_engine_deployment)
  ) {
    throw new Error(
      "BSC -> TAIRA deployment-bound source proofs require the native Electron proof bridge; the browser worker cannot generate the Rust OpenVerify/FastPQ source proof.",
    );
  }
  const receipt = readOptionalWorkerRecordField(inputRecord, ["receipt"]);
  const block = readOptionalWorkerRecordField(inputRecord, ["block"]);
  const blockReceipts = Array.isArray(inputRecord.blockReceipts)
    ? inputRecord.blockReceipts
    : Array.isArray(inputRecord.block_receipts)
      ? inputRecord.block_receipts
      : undefined;
  const receiptRootIndex = readBscSourceReceiptRootIndex(inputRecord, receipt);
  const sourceBridgeEmitterAddress = readOptionalWorkerTextField(inputRecord, [
    "sourceBridgeEmitterAddress",
    "source_bridge_emitter_address",
    "sourceBridgeAddress",
    "source_bridge_address",
    "bscSourceBridgeAddress",
    "bsc_source_bridge_address",
  ]);
  const sourceBridgeEmitterCodeHash = readOptionalWorkerTextField(inputRecord, [
    "sourceBridgeEmitterCodeHash",
    "source_bridge_emitter_code_hash",
    "sourceBridgeCodeHash",
    "source_bridge_code_hash",
  ]);
  const finalityHeight = readOptionalWorkerTextField(inputRecord, [
    "finalityHeight",
    "finality_height",
  ]);
  const finalityBlockHash = readOptionalWorkerTextField(inputRecord, [
    "finalityBlockHash",
    "finality_block_hash",
  ]);
  const sourceProofInput: BscSourceChainProofEnvelopeInput = {
    messageId: readRequiredWorkerTextField(
      commitment,
      ["message_id", "messageId"],
      "BSC source proof package message id",
    ),
    payloadHash: readRequiredWorkerTextField(
      commitment,
      ["payload_hash", "payloadHash"],
      "BSC source proof package payload hash",
    ),
    commitmentRoot: readRequiredWorkerTextField(
      messageBundle,
      ["commitment_root", "commitmentRoot"],
      "BSC source proof package commitment root",
    ),
    sourceEventDigest: readRequiredWorkerTextField(
      packageRecord,
      ["sourceEventDigest", "source_event_digest"],
      "BSC source proof package source event digest",
    ),
    ...(sourceBridgeEmitterAddress ? { sourceBridgeEmitterAddress } : {}),
    ...(sourceBridgeEmitterCodeHash ? { sourceBridgeEmitterCodeHash } : {}),
    ...(finalityHeight ? { finalityHeight } : {}),
    ...(finalityBlockHash ? { finalityBlockHash } : {}),
    ...(receipt ? { receipt } : {}),
    ...(block ? { block } : {}),
    ...(blockReceipts ? { blockReceipts } : {}),
    ...(receiptRootIndex
      ? {
          receiptRootIndex,
        }
      : {}),
  };
  const sourceProof = buildBscSourceChainProofEnvelope(sourceProofInput);
  return withBscSourcePublicInputFinality(
    replaceBscSourcePackageFinalityProof(packageRecord, sourceProof),
    sourceProof,
  );
};

const configureBscRuntimeProverConfigUrl = (inputConfigUrl?: unknown): void => {
  const rawConfigUrl =
    readOptionalWorkerString(inputConfigUrl) ||
    readBscProfileEnv(
      "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
      "VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL",
    );
  const configUrl = normalizeSccpPackageOrRemoteModuleUrl(
    rawConfigUrl,
    "BSC SCCP prover config URL",
  );
  const workerGlobal = self as BscRuntimeProverWorkerGlobal;
  if (configUrl) {
    workerGlobal.IrohaSccpBscProverConfigUrl =
      resolveWorkerPublicUrl(configUrl);
  } else {
    delete workerGlobal.IrohaSccpBscProverConfigUrl;
  }
};

const isBinaryLikeWorkerValue = (value: unknown): boolean =>
  value instanceof ArrayBuffer || ArrayBuffer.isView(value);

const assertNoSecretLikeSccpWorkerInputFields = (
  value: unknown,
  path = "SCCP worker request input",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(SCCP_WORKER_SECRET_INPUT_ERROR);
  }
  if (isBinaryLikeWorkerValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [index, entry] of ownEnumerableDataEntries(
      value,
      SCCP_WORKER_SECRET_INPUT_ERROR,
    )) {
      assertNoSecretLikeSccpWorkerInputFields(entry, `${path}[${index}]`, seen);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of ownEnumerableDataEntries(
    value,
    SCCP_WORKER_SECRET_INPUT_ERROR,
  )) {
    if (SCCP_WORKER_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(SCCP_WORKER_SECRET_INPUT_ERROR);
    }
    if (SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(SCCP_WORKER_SIGNING_HELPER_INPUT_ERROR);
    }
    assertNoSecretLikeSccpWorkerInputFields(child, `${path}.${key}`, seen);
  }
};

const assertNoCallerSuppliedBscBuildProofMaterial = (
  value: Record<string, unknown>,
): void => {
  for (const key of SCCP_WORKER_BSC_BUILD_PROOF_MATERIAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(SCCP_WORKER_BSC_BUILD_PROOF_MATERIAL_INPUT_ERROR);
    }
  }
};

const assertNoCallerSuppliedBscSourceProofMaterial = (
  value: Record<string, unknown>,
): void => {
  for (const key of SCCP_WORKER_BSC_SOURCE_PROOF_MATERIAL_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(SCCP_WORKER_BSC_SOURCE_PROOF_MATERIAL_INPUT_ERROR);
    }
  }
};

const assertBscBuildOnlyResultHasNoProofMaterial = (
  result: ReturnType<typeof buildBscSccpProofPackage>,
): void => {
  if (!isRecord(result)) {
    throw new Error("BSC worker build result must be an object.");
  }
  if (result.submission !== null || result.bridgePayload !== null) {
    throw new Error(SCCP_WORKER_BSC_BUILD_PROOF_MATERIAL_INPUT_ERROR);
  }
};

export const assertNoUnsafeSccpWorkerOutputFields = (
  value: unknown,
  path = "SCCP worker result",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(SCCP_WORKER_SECRET_OUTPUT_ERROR);
  }
  if (isBinaryLikeWorkerValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    for (const [index, entry] of ownEnumerableDataEntries(
      value,
      SCCP_WORKER_SECRET_OUTPUT_ERROR,
    )) {
      assertNoUnsafeSccpWorkerOutputFields(entry, `${path}[${index}]`, seen);
    }
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of ownEnumerableDataEntries(
    value,
    SCCP_WORKER_SECRET_OUTPUT_ERROR,
  )) {
    if (SCCP_WORKER_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(SCCP_WORKER_SECRET_OUTPUT_ERROR);
    }
    if (SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(SCCP_WORKER_SIGNING_HELPER_OUTPUT_ERROR);
    }
    assertNoUnsafeSccpWorkerOutputFields(child, `${path}.${key}`, seen);
  }
};

const postSccpProverWorkerSuccess = (
  id: string,
  result: Extract<SccpProverWorkerResponse, { ok: true }>["result"],
): void => {
  assertNoUnsafeSccpWorkerOutputFields(result);
  self.postMessage({
    id,
    ok: true,
    result,
  } satisfies SccpProverWorkerResponse);
};

export const normalizeSccpProverWorkerRequest = (
  data: unknown,
): SccpProverWorkerRequest => {
  const snapshot = snapshotSccpDataValue(data, "SCCP worker request");
  if (!isRecord(snapshot)) {
    throw new Error("SCCP worker request must be an object.");
  }
  const id = normalizeSccpProverWorkerRequestId(snapshot.id);
  if (!isSccpProverWorkerRequestKind(snapshot.kind)) {
    throw new Error(
      `Unsupported SCCP worker request: ${String(snapshot.kind)}`,
    );
  }
  if (!isRecord(snapshot.input)) {
    throw new Error("SCCP worker request input must be an object.");
  }
  assertNoSecretLikeSccpWorkerInputFields(snapshot.input);

  if (snapshot.kind === "prove-tron-source-package") {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as TronToTairaSourceProofPackageInput,
    };
  }

  if (snapshot.kind === "prewarm-ton-source-prover") {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as { proverModuleUrl?: string },
    };
  }

  if (snapshot.kind === "prove-ton-source-package") {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as TonToTairaSourceProofWorkerInput,
    };
  }

  if (snapshot.kind === "prove-solana-source-package") {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as SolanaToTairaSourceProofWorkerInput,
    };
  }

  if (snapshot.kind === "prove-bsc-source-package") {
    assertNoCallerSuppliedBscSourceProofMaterial(snapshot.input);
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as BscToTairaSourceProofWorkerInput,
    };
  }

  if (
    snapshot.kind === "build-bsc-proof-package" ||
    snapshot.kind === "prove-bsc-proof-package"
  ) {
    assertNoCallerSuppliedBscBuildProofMaterial(snapshot.input);
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as BscSccpProofPackageInput,
    };
  }

  if (
    snapshot.kind === "build-ton-proof-package" ||
    snapshot.kind === "prove-ton-proof-package"
  ) {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as TonSccpProofPackageInput,
    };
  }

  if (
    snapshot.kind === "build-solana-proof-package" ||
    snapshot.kind === "prove-solana-proof-package"
  ) {
    return {
      id,
      kind: snapshot.kind,
      input: snapshot.input as unknown as SolanaSccpProofPackageInput,
    };
  }

  return {
    id,
    kind: snapshot.kind,
    input: snapshot.input as unknown as TronSccpProofPackageInput,
  };
};

self.onmessage = (event: MessageEvent<unknown>) => {
  const requestId = readSccpProverWorkerRequestId(event.data);
  void (async () => {
    try {
      const { id, kind, input } = normalizeSccpProverWorkerRequest(event.data);
      if (kind === "build-bsc-proof-package") {
        const result = buildBscSccpProofPackage(input);
        assertBscBuildOnlyResultHasNoProofMaterial(result);
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind === "prove-bsc-proof-package") {
        configureBscRuntimeProverConfigUrl(input.proverConfigUrl);
        const prove = await loadBscSccpProveFn({
          globalScope: self as unknown as BscSccpProverGlobal,
          moduleUrl:
            readOptionalWorkerString(input.proverModuleUrl) ||
            readBscProfileEnv(
              "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
              "VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL",
            ),
          importer: importWorkerPublicModule<BscSccpProverModule>,
        });
        const result = await generateBscSccpProofPackage({
          ...input,
          prove,
        });
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind === "build-ton-proof-package") {
        const result = buildTonSccpProofPackage(
          input as unknown as TonSccpProofPackageInput,
        );
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind === "prove-ton-proof-package") {
        const prove = await loadTonSccpProveFn({
          globalScope: self as unknown as TonSccpProverGlobal,
          moduleUrl: import.meta.env.VITE_SCCP_TON_PROVER_MODULE_URL,
          importer: importWorkerPublicModule<TonSccpProverModule>,
        });
        const result = await generateTonSccpProofPackage({
          ...(input as unknown as TonSccpProofPackageInput),
          prove,
        });
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind === "build-solana-proof-package") {
        const result = buildSolanaSccpProofPackage(
          input as unknown as SolanaSccpProofPackageInput,
        );
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind === "prove-solana-proof-package") {
        const solanaInput = input as unknown as SolanaSccpProofPackageInput;
        const prove = await loadSolanaSccpProveFn({
          globalScope: self as unknown as SolanaSccpProverGlobal,
          moduleUrl:
            readOptionalWorkerString(solanaInput.proverModuleUrl) ||
            import.meta.env.VITE_SCCP_SOLANA_PROVER_MODULE_URL,
          importer: importWorkerPublicModule<SolanaSccpProverModule>,
        });
        const result = await generateSolanaSccpProofPackage({
          ...solanaInput,
          prove,
        });
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind !== "build-tron-proof-package") {
        if (kind === "prewarm-ton-source-prover") {
          let proveSource: TonSccpSourceProveFn | undefined;
          let loadError: unknown;
          try {
            proveSource = await loadCachedTonSourceProveFn(
              input.proverModuleUrl,
            );
          } catch (error) {
            loadError = error;
            proveSource = undefined;
          }
          if (typeof proveSource !== "function") {
            const detail =
              loadError instanceof Error && loadError.message
                ? ` ${loadError.message}`
                : "";
            throw new Error(
              `TON -> TAIRA source proof module is not available.${detail}`,
            );
          }
          postSccpProverWorkerSuccess(id, {
            ready: true,
            moduleUrl: resolveTonSourceProverModuleUrl(input.proverModuleUrl),
          });
          return;
        }
        if (kind === "prove-ton-source-package") {
          let proveSource: TonSccpSourceProveFn | undefined;
          let loadError: unknown;
          try {
            proveSource = await loadCachedTonSourceProveFn(
              input.proverModuleUrl,
            );
          } catch (error) {
            loadError = error;
            proveSource = undefined;
          }
          if (typeof proveSource !== "function") {
            const detail =
              loadError instanceof Error && loadError.message
                ? ` ${loadError.message}`
                : "";
            throw new Error(
              `TON -> TAIRA needs an available TON source proof module before settlement.${detail}`,
            );
          }
          const bindInput = snapshotSccpProverWorkerInput(
            input,
            "TON -> TAIRA SCCP source proof input",
          );
          const proveInput = snapshotSccpProverWorkerInput(
            input,
            "TON -> TAIRA SCCP source prove input",
          );
          const result = bindTonToTairaSourceProofPackage({
            manifest: bindInput.manifest,
            proofPackage: await proveSource(proveInput),
            txId: bindInput.txId,
            tonSender: bindInput.tonSender,
            tairaRecipient: bindInput.tairaRecipient,
            amountDecimal: bindInput.amountDecimal,
          });
          postSccpProverWorkerSuccess(id, result);
          return;
        }
        if (kind === "prove-solana-source-package") {
          const solanaInput =
            input as unknown as SolanaToTairaSourceProofWorkerInput;
          const proveSource = await loadSolanaSccpSourceProveFn({
            globalScope: self as unknown as SolanaSccpProverGlobal,
            moduleUrl:
              readOptionalWorkerString(solanaInput.proverModuleUrl) ||
              import.meta.env.VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
            importer: importWorkerPublicModule<SolanaSccpProverModule>,
          });
          if (typeof proveSource !== "function") {
            const error = new Error(
              "Solana -> TAIRA SCCP source prover is not linked; provide a browser-safe Solana source proof module before submitting TAIRA settlement.",
            );
            (error as Error & { code?: string }).code =
              "ERR_SCCP_SOLANA_SOURCE_PROVER_UNAVAILABLE";
            throw error;
          }
          const bindInput = snapshotSccpProverWorkerInput(
            solanaInput,
            "Solana -> TAIRA SCCP source proof input",
          );
          const proveInput = snapshotSccpProverWorkerInput(
            solanaInput,
            "Solana -> TAIRA SCCP source prove input",
          );
          const result = bindSolanaToTairaSourceProofPackage({
            manifest: bindInput.manifest,
            proofPackage: await proveSource(proveInput),
            txId: bindInput.txId,
            solanaSender: bindInput.solanaSender,
            tairaRecipient: bindInput.tairaRecipient,
            amountDecimal: bindInput.amountDecimal,
            amountBaseUnits: bindInput.amountBaseUnits,
          });
          postSccpProverWorkerSuccess(id, result);
          return;
        }
        if (kind === "prove-bsc-source-package") {
          configureBscRuntimeProverConfigUrl(input.proverConfigUrl);
          const proveSource = await loadBscSccpSourceProveFn({
            globalScope: self as unknown as BscSccpProverGlobal,
            moduleUrl:
              readOptionalWorkerString(input.proverModuleUrl) ||
              readBscProfileEnv(
                "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL",
                "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL",
              ),
            importer: importWorkerPublicModule<BscSccpProverModule>,
          });
          if (typeof proveSource !== "function") {
            const error = new Error(
              "BSC -> TAIRA SCCP source prover is not linked; provide a browser-safe BSC source proof module before submitting TAIRA settlement.",
            );
            (error as Error & { code?: string }).code =
              "ERR_SCCP_BSC_SOURCE_PROVER_UNAVAILABLE";
            throw error;
          }
          const materialBinding = readBscSourceProverMaterialBinding(
            input.manifest,
          );
          const normalizedInput = withBscSourceReceiptRootIndex(
            input as BscToTairaSourceProofWorkerInput & Record<string, unknown>,
          );
          const materialBoundInput: BscToTairaSourceProofWorkerInput &
            BscSourceProverMaterialBinding & { receiptRootIndex?: string } = {
            ...normalizedInput,
            ...materialBinding,
          };
          const bindInput = snapshotSccpProverWorkerInput(
            materialBoundInput,
            "BSC -> TAIRA SCCP source proof input",
          );
          const proveInput = snapshotSccpProverWorkerInput(
            materialBoundInput,
            "BSC -> TAIRA SCCP source prove input",
          );
          const result = bindBscToTairaSourceProofPackage({
            manifest: bindInput.manifest,
            proofArtifactHash: bindInput.proofArtifactHash,
            provingKeyHash: bindInput.provingKeyHash,
            nativeEvmProverBundleHash: bindInput.nativeEvmProverBundleHash,
            proofPackage: buildBinaryBscSourceProofPackage(
              await proveSource(proveInput),
              bindInput,
            ),
            txId: bindInput.txId,
            receipt: bindInput.receipt,
            bscSender: bindInput.bscSender,
            tairaRecipient: bindInput.tairaRecipient,
            amountDecimal: bindInput.amountDecimal,
          });
          postSccpProverWorkerSuccess(id, result);
          return;
        }
        if (kind === "prove-tron-source-package") {
          const proveSource = await loadTronSccpSourceProveFn({
            globalScope: self as unknown as TronSccpProverGlobal,
            moduleUrl: import.meta.env.VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL,
          });
          if (typeof proveSource !== "function") {
            const error = new Error(
              "TRON -> TAIRA SCCP source prover is not linked; provide a browser-safe source proof module before submitting TAIRA settlement.",
            );
            (error as Error & { code?: string }).code =
              "ERR_SCCP_TRON_SOURCE_PROVER_UNAVAILABLE";
            throw error;
          }
          const bindInput = snapshotSccpProverWorkerInput(
            input,
            "TRON -> TAIRA SCCP source proof input",
          );
          const proveInput = snapshotSccpProverWorkerInput(
            input,
            "TRON -> TAIRA SCCP source prove input",
          );
          const result = bindTronToTairaSourceProofPackage({
            manifest: bindInput.manifest,
            proofPackage: await proveSource(proveInput),
            txId: bindInput.txId,
            events: bindInput.events,
            tronSender: bindInput.tronSender,
            tairaRecipient: bindInput.tairaRecipient,
            amountDecimal: bindInput.amountDecimal,
          });
          postSccpProverWorkerSuccess(id, result);
          return;
        }
        if (kind !== "prove-tron-proof-package") {
          throw new Error(`Unsupported SCCP worker request: ${kind}`);
        }
        const prove = await loadTronSccpProveFn({
          globalScope: self as unknown as TronSccpProverGlobal,
          moduleUrl: import.meta.env.VITE_SCCP_TRON_PROVER_MODULE_URL,
        });
        const result = await generateTronSccpProofPackage({
          ...input,
          prove,
        });
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      const result = buildTronSccpProofPackage(input);
      postSccpProverWorkerSuccess(id, result);
    } catch (error) {
      self.postMessage({
        id: requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies SccpProverWorkerResponse);
    }
  })();
};
