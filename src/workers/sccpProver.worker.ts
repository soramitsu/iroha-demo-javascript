import {
  buildTronSccpProofPackage,
  generateTronSccpProofPackage,
  type TronSccpProofPackageInput,
} from "@/utils/sccpProofPackage";
import {
  bindTronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackage,
  type TronToTairaSourceProofPackageInput,
} from "@/utils/sccp";
import {
  loadTronSccpSourceProveFn,
  loadTronSccpProveFn,
  type TronSccpProverGlobal,
} from "@/utils/sccpProverLink";
import { isSecretLikeTextValue } from "@/utils/secretLike";

type SccpProverWorkerRequestKind =
  | "build-tron-proof-package"
  | "prove-tron-proof-package"
  | "prove-tron-source-package";

type SccpProverWorkerRequest =
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
    };

type SccpProverWorkerResponse =
  | {
      id: string;
      ok: true;
      result:
        | ReturnType<typeof buildTronSccpProofPackage>
        | TronToTairaSourceProofPackage;
    }
  | {
      id: string;
      ok: false;
      error: string;
    };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const MAX_SCCP_WORKER_REQUEST_ID_LENGTH = 128;
const SCCP_WORKER_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]+$/u;
const SCCP_WORKER_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret)/iu;
const SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN =
  /^(?:privateSignature|private_signature|signatureB64|signature_b64|signedTransaction|signed_transaction|walletSignature|wallet_signature)$/iu;

const isSccpProverWorkerRequestKind = (
  value: unknown,
): value is SccpProverWorkerRequestKind =>
  value === "build-tron-proof-package" ||
  value === "prove-tron-proof-package" ||
  value === "prove-tron-source-package";

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
    return isRecord(data) ? normalizeSccpProverWorkerRequestId(data.id) : "";
  } catch (_error) {
    return "";
  }
};

const snapshotSccpProverWorkerInput = <T>(input: T, label: string): T => {
  try {
    return structuredClone(input);
  } catch (_error) {
    throw new Error(`${label} must be structured-cloneable.`);
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
    throw new Error(
      `${path} must not contain recovery phrases or private key material before SCCP proof generation.`,
    );
  }
  if (isBinaryLikeWorkerValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoSecretLikeSccpWorkerInputFields(entry, `${path}[${index}]`, seen);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SCCP_WORKER_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`${path}.${key} must not be sent to the SCCP prover.`);
    }
    if (SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not be sent to the SCCP prover; TRON signing must happen through WalletConnect approval.`,
      );
    }
    assertNoSecretLikeSccpWorkerInputFields(child, `${path}.${key}`, seen);
  }
};

export const assertNoUnsafeSccpWorkerOutputFields = (
  value: unknown,
  path = "SCCP worker result",
  seen = new WeakSet<object>(),
): void => {
  if (isSecretLikeTextValue(value)) {
    throw new Error(
      `${path} must not contain recovery phrases or private key material after SCCP proof generation.`,
    );
  }
  if (isBinaryLikeWorkerValue(value)) {
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    value.forEach((entry, index) => {
      assertNoUnsafeSccpWorkerOutputFields(entry, `${path}[${index}]`, seen);
    });
    return;
  }
  if (!isRecord(value)) {
    return;
  }
  if (seen.has(value)) {
    return;
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (SCCP_WORKER_SECRET_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not be returned by the SCCP prover.`,
      );
    }
    if (SCCP_WORKER_SIGNING_HELPER_KEY_PATTERN.test(key)) {
      throw new Error(
        `${path}.${key} must not be returned by the SCCP prover; TRON signing must happen through WalletConnect approval.`,
      );
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
  if (!isRecord(data)) {
    throw new Error("SCCP worker request must be an object.");
  }
  const id = normalizeSccpProverWorkerRequestId(data.id);
  if (!isSccpProverWorkerRequestKind(data.kind)) {
    throw new Error(`Unsupported SCCP worker request: ${String(data.kind)}`);
  }
  if (!isRecord(data.input)) {
    throw new Error("SCCP worker request input must be an object.");
  }
  assertNoSecretLikeSccpWorkerInputFields(data.input);

  if (data.kind === "prove-tron-source-package") {
    return {
      id,
      kind: data.kind,
      input: data.input as unknown as TronToTairaSourceProofPackageInput,
    };
  }

  return {
    id,
    kind: data.kind,
    input: data.input as unknown as TronSccpProofPackageInput,
  };
};

self.onmessage = (event: MessageEvent<unknown>) => {
  const requestId = readSccpProverWorkerRequestId(event.data);
  void (async () => {
    try {
      const { id, kind, input } = normalizeSccpProverWorkerRequest(event.data);
      if (kind !== "build-tron-proof-package") {
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
