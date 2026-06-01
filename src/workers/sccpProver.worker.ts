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

const isSccpProverWorkerRequestKind = (
  value: unknown,
): value is SccpProverWorkerRequestKind =>
  value === "build-tron-proof-package" ||
  value === "prove-tron-proof-package" ||
  value === "prove-tron-source-package";

const readSccpProverWorkerRequestId = (data: unknown): string =>
  isRecord(data) && typeof data.id === "string" ? data.id : "";

export const normalizeSccpProverWorkerRequest = (
  data: unknown,
): SccpProverWorkerRequest => {
  if (!isRecord(data)) {
    throw new Error("SCCP worker request must be an object.");
  }
  if (typeof data.id !== "string" || data.id.trim().length === 0) {
    throw new Error("SCCP worker request id must be a non-empty string.");
  }
  if (!isSccpProverWorkerRequestKind(data.kind)) {
    throw new Error(`Unsupported SCCP worker request: ${String(data.kind)}`);
  }
  if (!isRecord(data.input)) {
    throw new Error("SCCP worker request input must be an object.");
  }

  if (data.kind === "prove-tron-source-package") {
    return {
      id: data.id,
      kind: data.kind,
      input: data.input as unknown as TronToTairaSourceProofPackageInput,
    };
  }

  return {
    id: data.id,
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
            moduleUrl:
              import.meta.env.VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL ??
              import.meta.env.VITE_SCCP_TRON_PROVER_MODULE_URL,
          });
          if (typeof proveSource !== "function") {
            const error = new Error(
              "TRON -> TAIRA SCCP source prover is not linked; provide a browser-safe source proof module before submitting TAIRA settlement.",
            );
            (error as Error & { code?: string }).code =
              "ERR_SCCP_TRON_SOURCE_PROVER_UNAVAILABLE";
            throw error;
          }
          const result = bindTronToTairaSourceProofPackage({
            manifest: input.manifest,
            proofPackage: await proveSource(input),
            txId: input.txId,
            events: input.events,
            tronSender: input.tronSender,
            tairaRecipient: input.tairaRecipient,
            amountDecimal: input.amountDecimal,
          });
          self.postMessage({
            id,
            ok: true,
            result,
          } satisfies SccpProverWorkerResponse);
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
        self.postMessage({
          id,
          ok: true,
          result,
        } satisfies SccpProverWorkerResponse);
        return;
      }
      const result = buildTronSccpProofPackage(input);
      self.postMessage({
        id,
        ok: true,
        result,
      } satisfies SccpProverWorkerResponse);
    } catch (error) {
      self.postMessage({
        id: requestId,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies SccpProverWorkerResponse);
    }
  })();
};
