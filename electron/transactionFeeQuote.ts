import { NetworkId } from "@iroha/iroha-js/canonical-request";
import type { FeeQuoteResponse } from "@iroha/iroha-js";
import type { TransactionFeeQuoteView } from "../src/utils/transactionFee";
import {
  resolveFirstReleaseNetworkIdLiteral,
  TAIRA_TORII_URL,
} from "../src/utils/firstReleaseNetworkIdentity";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { buildFirstReleaseAuthorityTransactionDraft } from "./firstReleaseTransaction";

type Instruction = Record<string, unknown>;
type InstructionFactory = (authority: string) => Instruction;

/**
 * Resolve only release-pinned transaction domains.
 *
 * A human-selected chain label cannot be converted into an Iroha NetworkId.
 * Each writable release profile therefore pins the exact genesis-derived
 * literal independently. A profile without that pin remains read-only.
 */
export const resolveFirstReleaseNetworkIdForConfiguredIdentity = (input: {
  chainId: string;
  networkPrefix: number;
}): NetworkId => NetworkId.parse(resolveFirstReleaseNetworkIdLiteral(input));

export const resolveFirstReleaseTransactionNetworkId = (input: {
  toriiUrl: string;
  chainId: string;
  networkPrefix: number;
}): NetworkId => {
  if (input.toriiUrl !== TAIRA_TORII_URL) {
    throw new Error(
      "This release has no exact genesis-derived NetworkId pinned for the selected write profile.",
    );
  }
  return resolveFirstReleaseNetworkIdForConfiguredIdentity(input);
};

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
