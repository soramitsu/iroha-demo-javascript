export interface SubscriptionMutationBoundarySteps<
  TPrepared,
  TSigningMaterial,
  TSigned,
  TSubmission,
  TConfirmation,
  TReceipt,
> {
  prepareDraft: () => Promise<TPrepared>;
  resolveSigningMaterial: (prepared: TPrepared) => Promise<TSigningMaterial>;
  quoteAndSign: (
    prepared: TPrepared,
    signingMaterial: TSigningMaterial,
  ) => Promise<TSigned>;
  submit: (prepared: TPrepared, signed: TSigned) => Promise<TSubmission>;
  confirmResultingState: (
    prepared: TPrepared,
    submission: TSubmission,
  ) => Promise<TConfirmation>;
  buildReceipt: (
    prepared: TPrepared,
    submission: TSubmission,
    confirmation: TConfirmation,
  ) => TReceipt;
}

/**
 * Enforces the subscription secret boundary: all public draft acquisition,
 * decoding, and semantic review must finish before wallet material is read.
 */
export const executeSubscriptionMutationBoundary = async <
  TPrepared,
  TSigningMaterial,
  TSigned,
  TSubmission,
  TConfirmation,
  TReceipt,
>(
  steps: SubscriptionMutationBoundarySteps<
    TPrepared,
    TSigningMaterial,
    TSigned,
    TSubmission,
    TConfirmation,
    TReceipt
  >,
): Promise<TReceipt> => {
  const prepared = await steps.prepareDraft();
  const signingMaterial = await steps.resolveSigningMaterial(prepared);
  const signed = await steps.quoteAndSign(prepared, signingMaterial);
  const submission = await steps.submit(prepared, signed);
  const confirmation = await steps.confirmResultingState(prepared, submission);
  return steps.buildReceipt(prepared, submission, confirmation);
};
