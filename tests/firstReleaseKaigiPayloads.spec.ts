import { Buffer } from "node:buffer";

import { describe, expect, it } from "vitest";

import {
  KAIGI_CALL_METADATA_SCHEMA,
  KAIGI_CALL_OFFER_SCHEMA,
  KAIGI_CHAIN_ANSWER_SCHEMA,
  KAIGI_CHAIN_SIGNAL_SCHEMA,
  normalizeFirstReleaseKaigiCallMetadata,
  normalizeFirstReleaseKaigiCallOfferPayload,
  normalizeFirstReleaseKaigiChainAnswerPayload,
  normalizeFirstReleaseKaigiChainSignalMetadata,
  requireFirstReleaseKaigiMeetingPrivacy,
  toFirstReleaseKaigiUiEvent,
} from "../electron/firstReleaseKaigiPayloads";

const CALL_ID = "default.universal:kaigi-weekly-sync";
const ACCOUNT_ID = "testuﾛ1NﾐヱﾇCﾍUovﾏﾊｺｸﾛJbｵVtﾍykRﾗﾊhﾄﾏKqTjUｺwﾒrym3GS93U";
const OTHER_ACCOUNT_ID =
  "testuロ1Q4gマZJC8ナヰvLFヒヌムU2ナスpヲuT4eフPavルセNナgw54ムV9U4YY";
const NETWORK_PREFIX = 369;
const SCHEDULED_START_MS = 1_700_000_000_000;
const CREATED_AT_MS = 1_699_999_999_000;

const base64Url = (bytes: number, fill: number): string =>
  Buffer.alloc(bytes, fill).toString("base64url");

const secretBox = () => ({
  schema: "iroha-demo-kaigi-secret-box/v1" as const,
  saltBase64Url: base64Url(16, 1),
  ivBase64Url: base64Url(12, 2),
  ciphertextBase64Url: base64Url(32, 3),
  authTagBase64Url: base64Url(16, 4),
});

const sealedBox = () => ({
  schema: "iroha-demo-kaigi-sealed-box/v1" as const,
  ephemeralPublicKeyBase64Url: base64Url(32, 5),
  saltBase64Url: base64Url(16, 6),
  ivBase64Url: base64Url(12, 7),
  ciphertextBase64Url: base64Url(32, 8),
  authTagBase64Url: base64Url(16, 9),
});

const offer = () => ({
  schema: KAIGI_CALL_OFFER_SCHEMA,
  callId: CALL_ID,
  hostAccountId: ACCOUNT_ID,
  hostDisplayName: "Host",
  hostParticipantId: "host-one",
  hostKaigiPublicKeyBase64Url: base64Url(32, 10),
  createdAtMs: CREATED_AT_MS,
  description: { type: "offer", sdp: "v=0\r\n" },
});

const answer = () => ({
  schema: KAIGI_CHAIN_ANSWER_SCHEMA,
  callId: CALL_ID,
  kind: "answer",
  participantAccountId: ACCOUNT_ID,
  participantId: "participant-one",
  participantName: "Participant",
  walletIdentity: ACCOUNT_ID,
  roomId: CALL_ID,
  createdAtMs: CREATED_AT_MS,
  description: { type: "answer", sdp: "v=0\r\n" },
});

describe("first-release Kaigi payload boundary", () => {
  it("accepts only transparent live meetings", () => {
    expect(requireFirstReleaseKaigiMeetingPrivacy("transparent")).toBe(
      "transparent",
    );
    expect(() => requireFirstReleaseKaigiMeetingPrivacy("private")).toThrow(
      /exactly transparent/u,
    );
  });

  it("binds call metadata to the call, schedule, state, and exact schema", () => {
    const payload = {
      schema: KAIGI_CALL_METADATA_SCHEMA,
      meetingCode: "weekly-sync",
      expiresAtMs: SCHEDULED_START_MS + 24 * 60 * 60 * 1_000,
      live: true,
      privacyMode: "transparent",
      encryptedOffer: secretBox(),
    };
    expect(
      normalizeFirstReleaseKaigiCallMetadata(payload, {
        callId: CALL_ID,
        privacyMode: "transparent",
        scheduledStartMs: SCHEDULED_START_MS,
        live: true,
      }),
    ).toEqual(payload);
    expect(() =>
      normalizeFirstReleaseKaigiCallMetadata(
        { ...payload, peerIdentityReveal: "Hidden" },
        {
          callId: CALL_ID,
          privacyMode: "transparent",
          scheduledStartMs: SCHEDULED_START_MS,
          live: true,
        },
      ),
    ).toThrow(/fields must match/u);
    expect(() =>
      normalizeFirstReleaseKaigiCallMetadata(
        { ...payload, meeting_code: payload.meetingCode },
        {
          callId: CALL_ID,
          privacyMode: "transparent",
          scheduledStartMs: SCHEDULED_START_MS,
          live: true,
        },
      ),
    ).toThrow(/fields must match/u);
    expect(() =>
      normalizeFirstReleaseKaigiCallMetadata(
        { ...payload, live: false },
        {
          callId: CALL_ID,
          privacyMode: "transparent",
          scheduledStartMs: SCHEDULED_START_MS,
          live: true,
        },
      ),
    ).toThrow(/live is cross-wired/u);
  });

  it("normalizes an offer and rejects implicit participant or account repair", () => {
    expect(
      normalizeFirstReleaseKaigiCallOfferPayload(offer(), {
        callId: CALL_ID,
        privacyMode: "transparent",
        hostAccountId: ACCOUNT_ID,
        createdAtMs: CREATED_AT_MS,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toEqual(offer());
    expect(() =>
      normalizeFirstReleaseKaigiCallOfferPayload(
        { ...offer(), hostParticipantId: " Host One " },
        {
          callId: CALL_ID,
          privacyMode: "transparent",
          hostAccountId: ACCOUNT_ID,
          createdAtMs: CREATED_AT_MS,
          networkPrefix: NETWORK_PREFIX,
        },
      ),
    ).toThrow(/bounded canonical text|canonical participant identifier/u);
    expect(() =>
      normalizeFirstReleaseKaigiCallOfferPayload(offer(), {
        callId: CALL_ID,
        privacyMode: "transparent",
        hostAccountId: OTHER_ACCOUNT_ID,
        createdAtMs: CREATED_AT_MS,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toThrow(/host identity is cross-wired/u);
  });

  it("binds encrypted signal metadata and plaintext answers to one carrier", () => {
    const metadata = {
      schema: KAIGI_CHAIN_SIGNAL_SCHEMA,
      callId: CALL_ID,
      signalKind: "answer",
      hostAccountId: ACCOUNT_ID,
      participantAccountId: ACCOUNT_ID,
      createdAtMs: CREATED_AT_MS,
      encryptedSignal: sealedBox(),
    };
    expect(
      normalizeFirstReleaseKaigiChainSignalMetadata(metadata, {
        callId: CALL_ID,
        createdAtMs: CREATED_AT_MS,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toEqual(metadata);
    expect(
      normalizeFirstReleaseKaigiChainAnswerPayload(answer(), {
        callId: CALL_ID,
        createdAtMs: CREATED_AT_MS,
        participantAccountId: ACCOUNT_ID,
        networkPrefix: NETWORK_PREFIX,
      }),
    ).toEqual(answer());
    expect(() =>
      normalizeFirstReleaseKaigiChainAnswerPayload(
        { ...answer(), room_id: CALL_ID },
        {
          callId: CALL_ID,
          createdAtMs: CREATED_AT_MS,
          participantAccountId: ACCOUNT_ID,
          networkPrefix: NETWORK_PREFIX,
        },
      ),
    ).toThrow(/fields must match/u);
  });

  it("projects only exact normalized SDK events into the renderer shape", () => {
    expect(
      toFirstReleaseKaigiUiEvent({
        kind: "ended",
        call: {
          call_id: CALL_ID,
          domain: "default.universal",
          call_name: "kaigi-weekly-sync",
        },
        status: "ended",
        ended_at_ms: SCHEDULED_START_MS,
      }),
    ).toEqual({
      kind: "ended",
      callId: CALL_ID,
      endedAtMs: SCHEDULED_START_MS,
    });
  });
});
