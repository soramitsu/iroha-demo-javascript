import type {
  ConnectTransactionInstructionKind,
  ConnectTransactionInstructionReview,
  ConnectTransactionReview,
  ConnectTransactionReviewField,
} from "../types/connectTransactionReview";

const MAX_INSTRUCTIONS = 64;
const MAX_FIELDS_PER_INSTRUCTION = 256;
const MAX_TEXT = 4_096;
const INSTRUCTION_KINDS = new Set<ConnectTransactionInstructionKind>([
  "transfer",
  "mint",
  "burn",
  "grant_permission",
  "grant",
  "settlement_atomic",
  "settlement",
  "escrow",
  "repo",
  "unknown",
  "undecoded",
]);

const isPlainRecord = (value: unknown): value is Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isBoundedText = (value: unknown, maximum = MAX_TEXT): value is string =>
  typeof value === "string" && value.length <= maximum;

const isDecimal = (value: unknown): value is string =>
  typeof value === "string" && /^(?:0|[1-9]\d{0,19})$/u.test(value);

const isReviewField = (
  value: unknown,
): value is ConnectTransactionReviewField =>
  isPlainRecord(value) &&
  hasExactKeys(value, ["label", "value"]) &&
  isBoundedText(value.label, 256) &&
  isBoundedText(value.value);

const isInstructionReview = (
  value: unknown,
): value is ConnectTransactionInstructionReview =>
  isPlainRecord(value) &&
  hasExactKeys(value, [
    "index",
    "wireId",
    "kind",
    "title",
    "fields",
    "json",
    "warning",
  ]) &&
  Number.isSafeInteger(value.index) &&
  (value.index as number) >= 1 &&
  isBoundedText(value.wireId, 256) &&
  INSTRUCTION_KINDS.has(value.kind as ConnectTransactionInstructionKind) &&
  isBoundedText(value.title, 256) &&
  Array.isArray(value.fields) &&
  value.fields.length <= MAX_FIELDS_PER_INSTRUCTION &&
  value.fields.every(isReviewField) &&
  (value.json === null || isBoundedText(value.json)) &&
  (value.warning === null || isBoundedText(value.warning, 1_024));

/** Exact structural validation for reviews crossing a process boundary. */
export const isConnectTransactionReview = (
  value: unknown,
): value is ConnectTransactionReview =>
  isPlainRecord(value) &&
  hasExactKeys(value, [
    "schema",
    "networkId",
    "authority",
    "payloadHashHex",
    "payloadByteLength",
    "creationTimeMs",
    "ttlMs",
    "executable",
    "instructions",
    "warnings",
  ]) &&
  value.schema === "iroha.wallet.connect-transaction-review.v1" &&
  isBoundedText(value.networkId, 128) &&
  isBoundedText(value.authority, 1_024) &&
  typeof value.payloadHashHex === "string" &&
  /^[0-9a-f]{64}$/u.test(value.payloadHashHex) &&
  Number.isSafeInteger(value.payloadByteLength) &&
  (value.payloadByteLength as number) >= 1 &&
  isDecimal(value.creationTimeMs) &&
  (value.ttlMs === null || isDecimal(value.ttlMs)) &&
  (value.executable === "instructions" || value.executable === "batch") &&
  Array.isArray(value.instructions) &&
  value.instructions.length >= 1 &&
  value.instructions.length <= MAX_INSTRUCTIONS &&
  value.instructions.every(isInstructionReview) &&
  Array.isArray(value.warnings) &&
  value.warnings.length <= MAX_INSTRUCTIONS &&
  value.warnings.every((warning) => isBoundedText(warning, 1_200));

/**
 * Plain-text lines for an approval surface. Every instruction is listed; no
 * instruction is summarized away.
 */
export const formatConnectTransactionReviewLines = (
  review: ConnectTransactionReview,
): string[] => {
  const lines = [
    `Network: ${review.networkId}`,
    `Signer: ${review.authority}`,
    `Payload hash to sign: ${review.payloadHashHex}`,
    `Payload: ${review.payloadByteLength} bytes, ${review.executable}, TTL ${review.ttlMs ?? "none"} ms`,
    `Instructions (${review.instructions.length}):`,
  ];
  for (const instruction of review.instructions) {
    lines.push(
      `${instruction.index}. ${instruction.title} [${instruction.wireId}]`,
    );
    for (const entry of instruction.fields) {
      lines.push(`   ${entry.label}: ${entry.value}`);
    }
    if (instruction.kind === "unknown" && instruction.json) {
      lines.push(`   JSON: ${instruction.json}`);
    }
    if (instruction.warning) {
      lines.push(`   WARNING: ${instruction.warning}`);
    }
  }
  return lines;
};

export interface ConnectTransactionReviewRow {
  label: string;
  value: string;
  monospace?: boolean;
  warning?: boolean;
}

/** Modal rows: one per instruction, listing every rendered field. */
export const connectTransactionReviewRows = (
  review: ConnectTransactionReview,
): ConnectTransactionReviewRow[] => [
  {
    label: "Payload hash to sign",
    value: review.payloadHashHex,
    monospace: true,
  },
  {
    label: "Payload",
    value: `${review.payloadByteLength} bytes · ${review.executable} · TTL ${review.ttlMs ?? "none"} ms`,
  },
  ...review.instructions.map((instruction) => ({
    label: `${instruction.index}. ${instruction.title}`,
    value: [
      ...instruction.fields.map((entry) => `${entry.label}: ${entry.value}`),
      `Wire ID: ${instruction.wireId}`,
      ...(instruction.kind === "unknown" && instruction.json
        ? [`JSON: ${instruction.json}`]
        : []),
    ].join("\n"),
    monospace: true,
  })),
  ...review.warnings.map((warning) => ({
    label: "Warning",
    value: warning,
    warning: true,
  })),
];
