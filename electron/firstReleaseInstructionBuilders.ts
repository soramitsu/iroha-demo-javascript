import { Buffer } from "node:buffer";

import { normalizeAssetHoldingId } from "@iroha/iroha-js/normalizers";

import { normalizeCanonicalAccountIdLiteral } from "./accountAddress";
import { requireKaigiCallId } from "../src/utils/kaigiInvite";
import { requireFirstReleaseJsonObject } from "./firstReleaseResourceLimits";

const MAX_METADATA_BYTES = 64 * 1024;
const MAX_KAIGI_TITLE_BYTES = 512;
const MAX_QUANTITY_SIGNIFICANT_DIGITS = 154;
const MAX_QUANTITY_SCALE = 28;
const MAX_QUANTITY_MANTISSA = (1n << 511n) - 1n;

type JsonObject = Record<string, unknown>;

const cloneBoundedJsonObject = (value: unknown, label: string): JsonObject => {
  return requireFirstReleaseJsonObject(value, label, MAX_METADATA_BYTES);
};

export const requireFirstReleaseTransferQuantity = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.length > MAX_QUANTITY_SIGNIFICANT_DIGITS + MAX_QUANTITY_SCALE + 1 ||
    !/^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/u.test(value)
  ) {
    throw new TypeError("quantity must be a canonical non-negative quantity.");
  }
  const [whole, fractional = ""] = value.split(".");
  const digits = `${whole}${fractional}`.replace(/^0+/u, "") || "0";
  if (
    fractional.length > MAX_QUANTITY_SCALE ||
    digits.length > MAX_QUANTITY_SIGNIFICANT_DIGITS ||
    BigInt(digits) > MAX_QUANTITY_MANTISSA
  ) {
    throw new TypeError("quantity exceeds the first-release numeric limit.");
  }
  if (BigInt(digits) === 0n) {
    throw new TypeError("quantity must be greater than zero.");
  }
  return value;
};

const requireCanonicalAccount = (
  value: unknown,
  label: string,
  networkPrefix: number,
): string => {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a canonical account literal.`);
  }
  const canonical = normalizeCanonicalAccountIdLiteral(
    value,
    label,
    networkPrefix,
  );
  if (canonical !== value) {
    throw new TypeError(`${label} must already be canonical.`);
  }
  return canonical;
};

const splitKaigiCallId = (value: unknown, label: string) => {
  const callId = requireKaigiCallId(value, label);
  const separator = callId.indexOf(":");
  return {
    domain_id: callId.slice(0, separator),
    call_name: callId.slice(separator + 1),
  };
};

const requireOptionalKaigiTitle = (value: unknown): string | null => {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !value ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > MAX_KAIGI_TITLE_BYTES
  ) {
    throw new TypeError("title must be bounded canonical text when provided.");
  }
  return value;
};

const requireOptionalTimestamp = (
  value: unknown,
  label: string,
): number | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
};

export const buildFirstReleaseRegisterAccountInstruction = (input: {
  accountId: string;
  networkPrefix: number;
  metadata?: JsonObject | null;
}) => ({
  Register: {
    Account: {
      id: requireCanonicalAccount(
        input.accountId,
        "accountId",
        input.networkPrefix,
      ),
      label: null,
      uaid: null,
      opaque_ids: [],
      metadata: cloneBoundedJsonObject(input.metadata ?? {}, "metadata"),
    },
  },
});

export const buildFirstReleaseTransferAssetInstruction = (input: {
  sourceAssetHoldingId: string;
  quantity: string;
  destinationAccountId: string;
  networkPrefix: number;
}) => ({
  Transfer: {
    Asset: {
      source: normalizeAssetHoldingId(
        input.sourceAssetHoldingId,
        "sourceAssetHoldingId",
      ),
      object: requireFirstReleaseTransferQuantity(input.quantity),
      destination: requireCanonicalAccount(
        input.destinationAccountId,
        "destinationAccountId",
        input.networkPrefix,
      ),
    },
  },
});

export const buildFirstReleaseCreateKaigiInstruction = (input: {
  callId: string;
  host: string;
  networkPrefix: number;
  title?: string | null;
  scheduledStartMs?: number | null;
  metadata: JsonObject;
}) => ({
  Kaigi: {
    CreateKaigi: {
      call: {
        id: splitKaigiCallId(input.callId, "callId"),
        host: requireCanonicalAccount(input.host, "host", input.networkPrefix),
        title: requireOptionalKaigiTitle(input.title),
        description: null,
        max_participants: null,
        gas_rate_per_minute: 0,
        metadata: cloneBoundedJsonObject(input.metadata, "metadata"),
        scheduled_start_ms: requireOptionalTimestamp(
          input.scheduledStartMs,
          "scheduledStartMs",
        ),
        billing_account: null,
        privacy_mode: { mode: "Transparent", state: null },
        room_policy: { policy: "Authenticated", state: null },
        relay_manifest: null,
      },
      commitment: null,
      nullifier: null,
      roster_root: null,
      proof: null,
    },
  },
});

export const buildFirstReleaseJoinKaigiInstruction = (input: {
  callId: string;
  participant: string;
  networkPrefix: number;
}) => ({
  Kaigi: {
    JoinKaigi: {
      call_id: splitKaigiCallId(input.callId, "callId"),
      participant: requireCanonicalAccount(
        input.participant,
        "participant",
        input.networkPrefix,
      ),
      commitment: null,
      nullifier: null,
      roster_root: null,
      proof: null,
    },
  },
});

export const buildFirstReleaseEndKaigiInstruction = (input: {
  callId: string;
  endedAtMs?: number | null;
}) => ({
  Kaigi: {
    EndKaigi: {
      call_id: splitKaigiCallId(input.callId, "callId"),
      ended_at_ms: requireOptionalTimestamp(input.endedAtMs, "endedAtMs"),
      commitment: null,
      nullifier: null,
      roster_root: null,
      proof: null,
    },
  },
});
