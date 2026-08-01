import type { TransactionFeeLike } from "../src/utils/transactionFee";
import type { TransactionFinalityProof } from "./transactionFinality";
import {
  buildSoraCloudCommittedLaunchResponse,
  buildSoraCloudIndexingLaunchResponse,
  decodeMatchingSoraCloudHfStatus,
  decodeSoraCloudHfDraftInstructions,
  decodeSoraCloudHfMutationDraft,
  type SoraCloudCommittedLaunchResponse,
  type SoraCloudHfDeployExpectation,
  type SoraCloudHfSettlementReview,
} from "./soraCloudResponses";

type CommittedSubmission = {
  hash: string;
  finality: TransactionFinalityProof;
  fee?: TransactionFeeLike | string | number | null;
};

export type SoraCloudHfDraftCommitDependencies = {
  fetchDraft: () => Promise<unknown>;
  decodeInstruction: (payload: Uint8Array) => unknown;
  authorizeSettlement: (
    settlement: SoraCloudHfSettlementReview,
  ) => Promise<boolean>;
  commitInstructions: (
    instructions: Record<string, unknown>[],
  ) => Promise<CommittedSubmission>;
  fetchCommittedStatus: () => Promise<unknown>;
  wait: (delayMs: number) => Promise<void>;
};

export const executeSoraCloudHfDraftToCommit = async (input: {
  expected: SoraCloudHfDeployExpectation;
  minimumSequenceExclusive: number;
  statusAttempts?: number;
  statusPollIntervalMs?: number;
  dependencies: SoraCloudHfDraftCommitDependencies;
}): Promise<SoraCloudCommittedLaunchResponse> => {
  const attempts = input.statusAttempts ?? 12;
  const intervalMs = input.statusPollIntervalMs ?? 750;
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("SoraCloud statusAttempts must be a positive integer.");
  }
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 0) {
    throw new Error(
      "SoraCloud statusPollIntervalMs must be a non-negative integer.",
    );
  }
  const draft = decodeSoraCloudHfMutationDraft(
    await input.dependencies.fetchDraft(),
    input.expected.accountId,
    input.expected.signer,
  );
  const decodedDraft = decodeSoraCloudHfDraftInstructions(
    draft,
    input.expected,
    input.dependencies.decodeInstruction,
  );
  if (
    !(await input.dependencies.authorizeSettlement(decodedDraft.settlement))
  ) {
    throw new Error("SoraCloud settlement approval was rejected.");
  }
  const submission = await input.dependencies.commitInstructions(
    decodedDraft.instructions,
  );

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const status = decodeMatchingSoraCloudHfStatus(
        await input.dependencies.fetchCommittedStatus(),
        input.expected,
        decodedDraft.settlement,
        input.minimumSequenceExclusive,
      );
      return buildSoraCloudCommittedLaunchResponse({
        status,
        serviceName: input.expected.serviceName,
        transactionHash: submission.hash,
        finality: submission.finality,
        ...(submission.fee !== undefined ? { fee: submission.fee } : {}),
      });
    } catch {
      if (attempt < attempts) {
        await input.dependencies.wait(intervalMs);
      }
    }
  }

  return buildSoraCloudIndexingLaunchResponse({
    settlement: decodedDraft.settlement,
    serviceName: input.expected.serviceName,
    transactionHash: submission.hash,
    finality: submission.finality,
    ...(submission.fee !== undefined ? { fee: submission.fee } : {}),
  });
};
