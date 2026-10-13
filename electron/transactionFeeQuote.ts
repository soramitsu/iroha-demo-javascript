import { NetworkId } from "@iroha/iroha-js/canonical-request";
import type { FeeQuoteResponse } from "@iroha/iroha-js";
import type { TransactionFeeQuoteView } from "../src/utils/transactionFee";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { buildFirstReleaseAuthorityTransactionDraft } from "./firstReleaseTransaction";

type Instruction = Record<string, unknown>;
type InstructionFactory = (authority: string) => Instruction;

export const transactionFeeQuoteView = (
  quote: FeeQuoteResponse,
): TransactionFeeQuoteView => ({
  payer: quote.intent.payer,
  components: quote.components.map((component) => ({
    kind: component.kind.kind,
    assetDefinitionId: component.asset_definition_id,
    maxAmount: component.max_amount,
  })),
  nextBlockHeight: String(quote.observation.next_block_height),
});

export const resolveCanonicalInstructionWireInput = (input: {
  authorityAccountId: string;
  networkPrefix: number;
  instruction: Instruction | InstructionFactory;
}) => {
  const authority = normalizeCanonicalAccountIdLiteral(
    input.authorityAccountId,
    "authorityAccountId",
    input.networkPrefix,
  );
  return {
    authority,
    instruction:
      typeof input.instruction === "function"
        ? input.instruction(authority)
        : input.instruction,
  };
};

export const buildCanonicalInstructionFeeQuoteRequest = (input: {
  networkId: NetworkId;
  authority: string;
  networkPrefix: number;
  instructions: object[];
  privateKey: Buffer;
  metadata?: Record<string, unknown>;
  creationTimeMs?: number;
  ttlMs?: number;
  nonce?: number;
}) => {
  const authority = normalizeCanonicalAccountIdLiteral(
    input.authority,
    "authority",
    input.networkPrefix,
  );
  const draft = buildFirstReleaseAuthorityTransactionDraft({
    networkId: input.networkId,
    networkPrefix: input.networkPrefix,
    authority,
    instructions: input.instructions,
    metadata: input.metadata,
    creationTimeMs: input.creationTimeMs,
    ttlMs: input.ttlMs,
    nonce: input.nonce,
  });
  return {
    authority,
    draft,
    payload: draft.payload,
    canonicalAuth: {
      accountId: authority,
      privateKey: input.privateKey,
    },
  };
};
