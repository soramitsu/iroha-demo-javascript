import { buildTransactionPayload } from "@iroha/iroha-js";
import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";

type Instruction = Record<string, unknown>;
type InstructionFactory = (authority: string) => Instruction;

const stringifyErrorDetail = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (value && typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return "";
};

export const isMissingFeeQuoteRouteError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as Record<string, unknown>;
  if (Number(record.status) !== 404) {
    return false;
  }
  const detail = [
    error instanceof Error ? error.message : null,
    record.code,
    record.rejectCode,
    record.errorMessage,
    record.bodyText,
    record.bodyJson,
  ]
    .map(stringifyErrorDetail)
    .join("\n");
  return /\broute_not_found\b|requested route does not exist/iu.test(detail);
};

export const resolveCanonicalInstructionWireInput = (input: {
  authorityAccountId: string;
  networkPrefix?: number;
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
  chainId: string;
  authority: string;
  networkPrefix?: number;
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
  const payload = buildTransactionPayload({
    chainId: input.chainId,
    authority,
    instructions: input.instructions,
    feePayment: { payer: "authority", chargeLimits: [] },
    metadata: input.metadata,
    creationTimeMs: input.creationTimeMs,
    ttlMs: input.ttlMs,
    nonce: input.nonce,
  });
  return {
    authority,
    payload,
    canonicalAuth: {
      accountId: authority,
      privateKey: input.privateKey,
    },
  };
};
