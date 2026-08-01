import {
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
} from "../src/utils/kaigiInvite";

export { requireKaigiCallId, requireKaigiInviteSecretBase64Url };

export const PRIVATE_KAIGI_TRANSFER_BACKEND = "halo2/ipa";
export const PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID =
  "halo2/pasta/ipa/confidential-transfer-2x2-merkle16-axiom-poseidon-v3";

export type PrivateKaigiFeeSchedule = {
  enabled: boolean;
  feeAssetDefinitionId: string;
  baseFee: string;
  perByteFee: string;
  perInstructionFee: string;
  perGasUnitFee: string;
};

export type PrivateKaigiTransferVerifyingKeyContext = {
  backend: typeof PRIVATE_KAIGI_TRANSFER_BACKEND;
  circuitId: typeof PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID;
  proofVerifyingKey: {
    id: {
      backend: typeof PRIVATE_KAIGI_TRANSFER_BACKEND;
      name: string;
    };
    record: Record<string, unknown>;
    inline_key: {
      backend: typeof PRIVATE_KAIGI_TRANSFER_BACKEND;
      bytes_b64: string;
    };
  };
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value;
};

const requireExactString = (value: unknown, label: string): string => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value.trim() !== value) {
    throw new Error(`${label} must not contain surrounding whitespace.`);
  }
  return value;
};

const requireCanonicalNonNegativeDecimal = (
  value: unknown,
  label: string,
): string => {
  const literal = requireExactString(value, label);
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(literal)) {
    throw new Error(
      `${label} must be a canonical non-negative decimal string.`,
    );
  }
  return literal;
};

const rejectAliasField = (
  record: Record<string, unknown>,
  alias: string,
  canonical: string,
  label: string,
) => {
  if (Object.prototype.hasOwnProperty.call(record, alias)) {
    throw new Error(`${label}.${alias} is unsupported; use ${canonical}.`);
  }
};

const requireCanonicalBase64 = (value: unknown, label: string): string => {
  const literal = requireExactString(value, label);
  if (
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      literal,
    ) ||
    Buffer.from(literal, "base64").length === 0 ||
    Buffer.from(literal, "base64").toString("base64") !== literal
  ) {
    throw new Error(`${label} must be canonical non-empty base64.`);
  }
  return literal;
};

export const readPrivateKaigiFeeSchedule = (
  lifecyclePayload: unknown,
  pipelinePreflightPayload: unknown,
): PrivateKaigiFeeSchedule => {
  const lifecycle = requireRecord(lifecyclePayload, "nexus lifecycle");
  rejectAliasField(
    lifecycle,
    "nexusEnabled",
    "nexus_enabled",
    "nexus lifecycle",
  );
  if (typeof lifecycle.nexus_enabled !== "boolean") {
    throw new Error("nexus lifecycle.nexus_enabled must be a boolean.");
  }

  const preflight = requireRecord(
    pipelinePreflightPayload,
    "pipeline preflight",
  );
  const fees = requireRecord(preflight.fees, "pipeline preflight.fees");
  for (const [alias, canonical] of [
    ["feeAssetId", "fee_asset_id"],
    ["baseFee", "base_fee"],
    ["perByteFee", "per_byte_fee"],
    ["perInstructionFee", "per_instruction_fee"],
    ["perGasUnitFee", "per_gas_unit_fee"],
  ] as const) {
    rejectAliasField(fees, alias, canonical, "pipeline preflight.fees");
  }

  return {
    enabled: lifecycle.nexus_enabled,
    feeAssetDefinitionId: requireExactString(
      fees.fee_asset_id,
      "pipeline preflight.fees.fee_asset_id",
    ),
    baseFee: requireCanonicalNonNegativeDecimal(
      fees.base_fee,
      "pipeline preflight.fees.base_fee",
    ),
    perByteFee: requireCanonicalNonNegativeDecimal(
      fees.per_byte_fee,
      "pipeline preflight.fees.per_byte_fee",
    ),
    perInstructionFee: requireCanonicalNonNegativeDecimal(
      fees.per_instruction_fee,
      "pipeline preflight.fees.per_instruction_fee",
    ),
    perGasUnitFee: requireCanonicalNonNegativeDecimal(
      fees.per_gas_unit_fee,
      "pipeline preflight.fees.per_gas_unit_fee",
    ),
  };
};

export const readPrivateKaigiTransferVerifyingKey = (
  value: unknown,
): PrivateKaigiTransferVerifyingKeyContext => {
  const detail = requireRecord(value, "private Kaigi verifying key");
  rejectAliasField(
    detail,
    "inline_key",
    "record.inline_key",
    "private Kaigi verifying key",
  );
  rejectAliasField(
    detail,
    "inlineKey",
    "record.inline_key",
    "private Kaigi verifying key",
  );

  const id = requireRecord(detail.id, "private Kaigi verifying key.id");
  const record = requireRecord(
    detail.record,
    "private Kaigi verifying key.record",
  );
  rejectAliasField(
    record,
    "circuitId",
    "circuit_id",
    "private Kaigi verifying key.record",
  );
  rejectAliasField(
    record,
    "inlineKey",
    "inline_key",
    "private Kaigi verifying key.record",
  );
  const inlineKey = requireRecord(
    record.inline_key,
    "private Kaigi verifying key.record.inline_key",
  );
  rejectAliasField(
    inlineKey,
    "bytesBase64",
    "bytes_b64",
    "private Kaigi verifying key.record.inline_key",
  );

  const idBackend = requireExactString(
    id.backend,
    "private Kaigi verifying key.id.backend",
  );
  const recordBackend = requireExactString(
    record.backend,
    "private Kaigi verifying key.record.backend",
  );
  const inlineBackend = requireExactString(
    inlineKey.backend,
    "private Kaigi verifying key.record.inline_key.backend",
  );
  if (
    idBackend !== PRIVATE_KAIGI_TRANSFER_BACKEND ||
    recordBackend !== PRIVATE_KAIGI_TRANSFER_BACKEND ||
    inlineBackend !== PRIVATE_KAIGI_TRANSFER_BACKEND
  ) {
    throw new Error(
      `private Kaigi transfer verifier backend must be exactly ${PRIVATE_KAIGI_TRANSFER_BACKEND}.`,
    );
  }

  const circuitId = requireExactString(
    record.circuit_id,
    "private Kaigi verifying key.record.circuit_id",
  );
  if (circuitId !== PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID) {
    throw new Error(
      `private Kaigi transfer verifier circuit_id must be exactly ${PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID}.`,
    );
  }

  const name = requireExactString(
    id.name,
    "private Kaigi verifying key.id.name",
  );
  const bytesBase64 = requireCanonicalBase64(
    inlineKey.bytes_b64,
    "private Kaigi verifying key.record.inline_key.bytes_b64",
  );
  return {
    backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
    circuitId: PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID,
    proofVerifyingKey: {
      id: {
        backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
        name,
      },
      record,
      inline_key: {
        backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
        bytes_b64: bytesBase64,
      },
    },
  };
};
