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

self.onmessage = (event: MessageEvent<SccpProverWorkerRequest>) => {
  const { id, kind, input } = event.data;
  void (async () => {
    try {
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
        id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies SccpProverWorkerResponse);
    }
  })();
};
