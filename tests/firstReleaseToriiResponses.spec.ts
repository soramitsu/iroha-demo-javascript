import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeFirstReleaseKaigiCall,
  normalizeFirstReleaseKaigiCallEvent,
  normalizeFirstReleaseKaigiCallSignals,
  normalizeFirstReleaseVerifyingKeyDetail,
} from "../electron/firstReleaseToriiResponses";

const CALL_ID = "default.universal:kaigi-weekly-sync";
const OTHER_CALL_ID = "default.universal:kaigi-other";
const MARKED_HASH = `${"00".repeat(31)}01`;
const VERIFIER_BACKEND = "pipa-r/pasta/confidential-transfer-v1" as const;
const VERIFIER_NAME = "wallet-confidential-transfer-v1";
const VERIFIER_BYTES = Buffer.from([1, 2, 3, 4]);
const SCHEDULED_START_MS = 1_700_000_000_000;

const base64UrlBytes = (length: number, fill: number): string =>
  Buffer.alloc(length, fill).toString("base64url");

const validSecretBox = () => ({
  schema: "iroha-demo-kaigi-secret-box/v1",
  saltBase64Url: base64UrlBytes(16, 1),
  ivBase64Url: base64UrlBytes(12, 2),
  ciphertextBase64Url: base64UrlBytes(32, 3),
  authTagBase64Url: base64UrlBytes(16, 4),
});

const validSealedBox = () => ({
  schema: "iroha-demo-kaigi-sealed-box/v1",
  ephemeralPublicKeyBase64Url: base64UrlBytes(32, 5),
  saltBase64Url: base64UrlBytes(16, 6),
  ivBase64Url: base64UrlBytes(12, 7),
  ciphertextBase64Url: base64UrlBytes(32, 8),
  authTagBase64Url: base64UrlBytes(16, 9),
});

const validCallMetadata = (privacyMode: "transparent") => ({
  kaigi_call: {
    schema: "iroha-demo-kaigi-call-metadata/v2",
    meetingCode: "weekly-sync",
    expiresAtMs: SCHEDULED_START_MS + 24 * 60 * 60 * 1_000,
    live: true,
    privacyMode,
    encryptedOffer: validSecretBox(),
  },
});

const verifierCommitment = (backend: string, bytes: Uint8Array): string => {
  const backendBytes = Buffer.from(backend, "utf8");
  const backendLength = Buffer.alloc(8);
  backendLength.writeBigUInt64BE(BigInt(backendBytes.length));
  const payloadLength = Buffer.alloc(8);
  payloadLength.writeBigUInt64BE(BigInt(bytes.length));
  return createHash("sha256")
    .update("iroha:zk:v1:vk", "utf8")
    .update(backendLength)
    .update(backendBytes)
    .update(payloadLength)
    .update(bytes)
    .digest("hex");
};

const validVerifyingKey = () => ({
  id: { backend: VERIFIER_BACKEND, name: VERIFIER_NAME },
  record: {
    version: 1,
    circuit_id: VERIFIER_BACKEND,
    owner_manifest_id: null,
    namespace: "core",
    backend: "native-pipa-r-pasta",
    curve: "pallas",
    public_inputs_schema_hash: "11".repeat(32),
    commitment: verifierCommitment(VERIFIER_BACKEND, VERIFIER_BYTES),
    vk_len: VERIFIER_BYTES.length,
    max_proof_bytes: 65_536,
    gas_schedule_id: "halo2_default",
    metadata_uri_cid: null,
    vk_bytes_cid: null,
    activation_height: 10,
    withdraw_height: null,
    status: "Active",
    key: {
      backend: VERIFIER_BACKEND,
      bytes_b64: VERIFIER_BYTES.toString("base64"),
    },
  },
  record_norito_base64: Buffer.from([0x10, 0x20]).toString("base64"),
});

const parseVerifyingKey = (payload: unknown) =>
  normalizeFirstReleaseVerifyingKeyDetail(payload, {
    backend: VERIFIER_BACKEND,
    name: VERIFIER_NAME,
  });

const omitKeys = <T extends Record<string, unknown>>(
  value: T,
  keys: readonly string[],
): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );

const validTransparentCall = () => ({
  call_id: CALL_ID,
  domain: "default.universal",
  call_name: "kaigi-weekly-sync",
  host_account_id: "testuCanonicalHost",
  billing_account_id: "testuCanonicalHost",
  title: "Weekly sync",
  description: "Project update",
  max_participants: 8,
  gas_rate_per_minute: 2,
  metadata: validCallMetadata("transparent"),
  scheduled_start_ms: SCHEDULED_START_MS,
  privacy_mode: "transparent",
  room_policy: "authenticated",
  participant_count: 2,
  commitment_count: 0,
  nullifier_count: 0,
  usage_commitment_count: 0,
  status: "active",
  created_at_ms: 1_699_999_999_000,
  total_duration_ms: 0,
  total_billed_gas: 0,
  segments_recorded: 0,
});

const validSignal = () => ({
  entrypoint_hash: MARKED_HASH,
  authority: "testuCanonicalParticipant",
  timestamp_ms: 1_700_000_000_100,
  call_id: CALL_ID,
  signal_kind: "answer",
  host_account_id: "testuCanonicalHost",
  participant_account_id: "testuCanonicalParticipant",
  created_at_ms: 1_700_000_000_000,
  metadata: {
    schema: "iroha-demo-kaigi-chain-signal/v1",
    callId: CALL_ID,
    signalKind: "answer",
    hostAccountId: "testuCanonicalHost",
    participantAccountId: "testuCanonicalParticipant",
    createdAtMs: 1_700_000_000_000,
    encryptedSignal: validSealedBox(),
  },
});

describe("first-release Torii verifying-key responses", () => {
  it("normalizes one exact response bound to its requested backend and name", () => {
    const normalized = parseVerifyingKey(validVerifyingKey());

    expect(normalized.id).toEqual({
      backend: VERIFIER_BACKEND,
      name: VERIFIER_NAME,
    });
    expect(normalized.record.commitment_hex).toBe(
      validVerifyingKey().record.commitment,
    );
    expect(normalized.record.inline_key?.bytes_b64).toBe(
      VERIFIER_BYTES.toString("base64"),
    );
  });

  it("rejects cross-wired identities and non-exact fields", () => {
    const response = validVerifyingKey();
    expect(() =>
      parseVerifyingKey({
        ...response,
        id: { ...response.id, name: "other-key" },
      }),
    ).toThrow(/does not match its request/iu);

    expect(() => parseVerifyingKey({ ...response, legacy: null })).toThrow(
      /fields are not exact/iu,
    );
    const missing = omitKeys(response, ["record_norito_base64"]);
    expect(() => parseVerifyingKey(missing)).toThrow(/missing/iu);
  });

  it("rejects malformed registry records, unsafe integers, and noncanonical encodings", () => {
    const response = validVerifyingKey();
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: {
          ...response.record,
          version: Number.MAX_SAFE_INTEGER + 1,
        },
      }),
    ).toThrow(/bounded JSON integer/iu);
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: {
          ...response.record,
          public_inputs_schema_hash: "AA".repeat(32),
        },
      }),
    ).toThrow(/lowercase 32-byte hex/iu);
    expect(() =>
      parseVerifyingKey({
        ...response,
        record_norito_base64: "AQ",
      }),
    ).toThrow(/canonical standard Base64/iu);
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: {
          ...response.record,
          key: { ...response.record.key, bytes_b64: "AQ" },
        },
      }),
    ).toThrow(/canonical standard Base64/iu);
  });

  it("binds inline key backend, length, and commitment", () => {
    const response = validVerifyingKey();
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: { ...response.record, vk_len: VERIFIER_BYTES.length + 1 },
      }),
    ).toThrow(/do not match vk_len/iu);
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: { ...response.record, commitment: "22".repeat(32) },
      }),
    ).toThrow(/do not match commitment/iu);
    expect(() =>
      parseVerifyingKey({
        ...response,
        record: {
          ...response.record,
          activation_height: 12,
          withdraw_height: 12,
        },
      }),
    ).toThrow(/withdraw height must exceed/iu);
  });

  it("accepts canonical all-zero fixed-byte fields when no inline key claims them", () => {
    const response = validVerifyingKey();
    const normalized = parseVerifyingKey({
      ...response,
      record: {
        ...response.record,
        public_inputs_schema_hash: "00".repeat(32),
        commitment: "00".repeat(32),
        vk_len: 0,
        key: null,
      },
    });

    expect(normalized.record.public_inputs_schema_hash).toBe("00".repeat(32));
    expect(normalized.record.commitment_hex).toBe("00".repeat(32));
  });
});

describe("first-release Torii Kaigi call responses", () => {
  it("accepts only the exact transparent lifecycle view", () => {
    expect(
      normalizeFirstReleaseKaigiCall(validTransparentCall(), CALL_ID),
    ).toEqual(validTransparentCall());

    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...validTransparentCall(), privacy_mode: "private" },
        CALL_ID,
      ),
    ).toThrow(/exactly transparent/iu);
  });

  it("rejects mismatched call identity, unknown fields, and noncanonical text", () => {
    const response = validTransparentCall();
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, call_id: OTHER_CALL_ID },
        CALL_ID,
      ),
    ).toThrow(/identity does not match/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall({ ...response, extra: true }, CALL_ID),
    ).toThrow(/fields are not exact/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, title: " weekly sync" },
        CALL_ID,
      ),
    ).toThrow(/canonical NFC text/iu);
  });

  it("rejects privacy, status, retired roster, count, and timestamp inconsistencies", () => {
    const response = validTransparentCall();
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, privacy_mode: "private" },
        CALL_ID,
      ),
    ).toThrow(/exactly transparent/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall({ ...response, status: "ended" }, CALL_ID),
    ).toThrow(/conflicts with status/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, roster_root_hex: MARKED_HASH },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, participant_count: 9 },
        CALL_ID,
      ),
    ).toThrow(/bounded JSON integer/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        { ...response, created_at_ms: Number.MAX_SAFE_INTEGER + 1 },
        CALL_ID,
      ),
    ).toThrow(/losslessly decoded/iu);
  });

  it("requires the exact app metadata envelope and canonical secret box", () => {
    const response = validTransparentCall();
    const metadata = validCallMetadata("transparent");
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        {
          ...response,
          metadata: { kaigiCall: metadata.kaigi_call },
        },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        {
          ...response,
          metadata: {
            kaigi_call: {
              ...metadata.kaigi_call,
              peerIdentityReveal: "Hidden",
            },
          },
        },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        {
          ...response,
          metadata: {
            kaigi_call: {
              ...metadata.kaigi_call,
              meetingCode: "other",
            },
          },
        },
        CALL_ID,
      ),
    ).toThrow(/meetingCode does not match/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCall(
        {
          ...response,
          metadata: {
            kaigi_call: {
              ...metadata.kaigi_call,
              encryptedOffer: {
                ...metadata.kaigi_call.encryptedOffer,
                saltBase64Url: `${metadata.kaigi_call.encryptedOffer.saltBase64Url}=`,
              },
            },
          },
        },
        CALL_ID,
      ),
    ).toThrow(/Base64url/iu);
  });
});

describe("first-release Torii Kaigi signal responses", () => {
  it("accepts an exact identity-bound page and canonical cursor", () => {
    const cursor = Buffer.from([1, 2, 3]).toString("base64url");
    const response = {
      has_more: true,
      next_cursor: cursor,
      items: [validSignal()],
    };

    expect(normalizeFirstReleaseKaigiCallSignals(response, CALL_ID)).toEqual(
      response,
    );
  });

  it("rejects mismatched IDs, duplicate hashes, and non-exact signal fields", () => {
    const signal = validSignal();
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [{ ...signal, call_id: OTHER_CALL_ID }],
        },
        CALL_ID,
      ),
    ).toThrow(/does not match the requested/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        { has_more: false, items: [signal, structuredClone(signal)] },
        CALL_ID,
      ),
    ).toThrow(/duplicate entrypoint/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [{ ...signal, legacy_signal: null }],
        },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
  });

  it("rejects noncanonical cursors and pagination inconsistencies", () => {
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        { has_more: true, items: [] },
        CALL_ID,
      ),
    ).toThrow(/presence must match/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        { has_more: false, next_cursor: "AQ", items: [] },
        CALL_ID,
      ),
    ).toThrow(/presence must match/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        { has_more: true, next_cursor: "A", items: [] },
        CALL_ID,
      ),
    ).toThrow(/Base64url/iu);
  });

  it("rejects unsafe timing, metadata cross-wiring, and missing identities", () => {
    const signal = validSignal();
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [{ ...signal, created_at_ms: signal.timestamp_ms + 1 }],
        },
        CALL_ID,
      ),
    ).toThrow(/exceeds timestamp_ms/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [
            {
              ...signal,
              metadata: { ...signal.metadata, callId: OTHER_CALL_ID },
            },
          ],
        },
        CALL_ID,
      ),
    ).toThrow(/cross-wired/iu);
    const redacted = omitKeys(signal, [
      "authority",
      "host_account_id",
      "participant_account_id",
    ]);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [redacted],
        },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
  });

  it("rejects redacted private signals and metadata aliases", () => {
    const signal = validSignal();
    const privateSignal = omitKeys(signal, [
      "authority",
      "host_account_id",
      "participant_account_id",
    ]);
    privateSignal.metadata = omitKeys(signal.metadata, [
      "hostAccountId",
      "participantAccountId",
    ]);
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        { has_more: false, items: [privateSignal] },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);

    const metadata = privateSignal.metadata as Record<string, unknown>;
    expect(() =>
      normalizeFirstReleaseKaigiCallSignals(
        {
          has_more: false,
          items: [
            {
              ...privateSignal,
              metadata: {
                ...omitKeys(metadata, ["callId"]),
                call_id: CALL_ID,
              },
            },
          ],
        },
        CALL_ID,
      ),
    ).toThrow(/fields are not exact/iu);
  });
});

describe("first-release Torii Kaigi lifecycle events", () => {
  const call = {
    call_id: CALL_ID,
    domain: "default.universal",
    call_name: "kaigi-weekly-sync",
  };

  it("accepts exact transparent and ended events", () => {
    const transparent = {
      kind: "roster_updated",
      call,
      privacy_mode: "transparent",
      participant_count: 2,
      commitment_count: 0,
      nullifier_count: 0,
    };
    const ended = {
      kind: "ended",
      call,
      status: "ended",
      ended_at_ms: 1_700_000_000_000,
    };

    expect(normalizeFirstReleaseKaigiCallEvent(transparent, CALL_ID)).toEqual(
      transparent,
    );
    expect(normalizeFirstReleaseKaigiCallEvent(ended, CALL_ID)).toEqual(ended);
  });

  it("rejects call substitution, privacy conflicts, and malformed ended events", () => {
    expect(() =>
      normalizeFirstReleaseKaigiCallEvent(
        {
          kind: "ended",
          call: { ...call, call_id: OTHER_CALL_ID },
          status: "ended",
          ended_at_ms: 1,
        },
        CALL_ID,
      ),
    ).toThrow(/identity does not match/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallEvent(
        {
          kind: "roster_updated",
          call,
          privacy_mode: "private",
          participant_count: 1,
          commitment_count: 1,
          nullifier_count: 0,
        },
        CALL_ID,
      ),
    ).toThrow(/exactly transparent/iu);
    expect(() =>
      normalizeFirstReleaseKaigiCallEvent(
        {
          kind: "ended",
          call,
          status: "active",
          ended_at_ms: 1,
        },
        CALL_ID,
      ),
    ).toThrow(/must be ended/iu);
  });
});

describe("first-release Torii preload integration", () => {
  it("normalizes every Kaigi read before use", () => {
    const preload = readFileSync(resolve("electron/preload.ts"), "utf8");
    for (const boundary of [
      "return normalizeFirstReleaseKaigiCall(",
      "return normalizeFirstReleaseKaigiCallSignals(",
      "normalizeFirstReleaseKaigiCallEvent(event, normalizedCallId)",
    ]) {
      expect(preload).toContain(boundary);
    }
  });
});
