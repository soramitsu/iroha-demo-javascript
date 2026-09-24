import type {
  ParsedPipelineStatus,
  TransactionFinalityProof,
} from "../electron/transactionFinality";

export interface FinalizedMutationReceipt {
  hashHex: string;
  finality: TransactionFinalityProof;
}

export interface ToriiFinalityEvidence extends FinalizedMutationReceipt {
  statusPayload: Record<string, unknown>;
  transactionPayload: Record<string, unknown>;
}

export function assertFinalizedMutationReceipt(
  receipt: unknown,
  options?: {
    label?: string;
    hashFields?: readonly string[];
  },
): FinalizedMutationReceipt;

export function waitForToriiTransactionFinality(input: {
  toriiUrl: string;
  hashHex: string;
  timeoutMs?: number;
  intervalMs?: number;
  readJson?: (url: URL) => Promise<unknown>;
  fetchImpl?: typeof fetch;
  wait?: (delayMs: number) => Promise<void>;
  now?: () => number;
}): Promise<ToriiFinalityEvidence>;

export type { ParsedPipelineStatus, TransactionFinalityProof };
