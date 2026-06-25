import {
  buildBscSccpProofPackage,
  buildTronSccpProofPackage,
  generateBscSccpProofPackage,
  generateTronSccpProofPackage,
  type BscSccpProofPackageInput,
  type TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";
import {
  bindBscToTairaSourceProofPackage,
  bindTronToTairaSourceProofPackage,
  readBscSourceProverMaterialBinding,
  type BscToTairaSourceProofPackage,
  type BscToTairaSourceProofPackageInput,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import {
  loadBscSccpProveFn,
  loadBscSccpSourceProveFn,
  loadTronSccpSourceProveFn,
  loadTronSccpProveFn,
  type BscSccpProverGlobal,
  type TronSccpProverGlobal,
} from "@/utils/sccpProverLink";
import { snapshotSccpDataValue } from "@/utils/sccpDataSnapshot";
import { isSecretLikeTextValue } from "@/utils/secretLike";

type BscRuntimeProverWorkerGlobal = typeof self & {
  IrohaSccpBscProverConfigUrl?: string;
};

type SccpProverWorkerRequestKind =
  | "build-bsc-proof-package"
  | "prove-bsc-proof-package"
  | "build-tron-proof-package"
  | "prove-tron-proof-package"
  | "prove-tron-source-package"
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
      kind: "prove-bsc-source-package";
      input: BscToTairaSourceProofWorkerInput;
    };

type BscToTairaSourceProofWorkerInput = Omit<
  BscToTairaSourceProofPackageInput,
  "proofArtifactHash" | "provingKeyHash" | "nativeEvmProverBundleHash"
>;

type SccpProverWorkerResponse =
  | {
      id: string;
      ok: true;
      result:
        | ReturnType<typeof buildBscSccpProofPackage>
        | ReturnType<typeof buildTronSccpProofPackage>
        | BscToTairaSourceProofPackage
        | TronToTairaSourceProofPackage;
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
  fallbackKey: keyof ImportMetaEnv,
): string => {
  const activeKey =
    activeBscNetworkEnvKey() === "mainnet" ? mainnetKey : testnetKey;
  return (
    String(import.meta.env[activeKey] ?? "").trim() ||
    String(import.meta.env[fallbackKey] ?? "").trim() ||
    ""
  );
};

const isSccpProverWorkerRequestKind = (
  value: unknown,
): value is SccpProverWorkerRequestKind =>
  value === "build-bsc-proof-package" ||
  value === "prove-bsc-proof-package" ||
  value === "build-tron-proof-package" ||
  value === "prove-tron-proof-package" ||
  value === "prove-tron-source-package" ||
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

const configureBscRuntimeProverConfigUrl = (): void => {
  const configUrl = readBscProfileEnv(
    "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
    "VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL",
    "VITE_SCCP_BSC_PROVER_CONFIG_URL",
  );
  const workerGlobal = self as BscRuntimeProverWorkerGlobal;
  if (configUrl) {
    workerGlobal.IrohaSccpBscProverConfigUrl = configUrl;
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
        configureBscRuntimeProverConfigUrl();
        const prove = await loadBscSccpProveFn({
          globalScope: self as unknown as BscSccpProverGlobal,
          moduleUrl: readBscProfileEnv(
            "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
            "VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL",
            "VITE_SCCP_BSC_PROVER_MODULE_URL",
          ),
        });
        const result = await generateBscSccpProofPackage({
          ...input,
          prove,
        });
        postSccpProverWorkerSuccess(id, result);
        return;
      }
      if (kind !== "build-tron-proof-package") {
        if (kind === "prove-bsc-source-package") {
          configureBscRuntimeProverConfigUrl();
          const proveSource = await loadBscSccpSourceProveFn({
            globalScope: self as unknown as BscSccpProverGlobal,
            moduleUrl: readBscProfileEnv(
              "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL",
              "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL",
              "VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL",
            ),
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
          const materialBoundInput = {
            ...input,
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
            proofPackage: await proveSource(proveInput),
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
