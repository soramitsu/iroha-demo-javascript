import { describe, expect, it } from "vitest";
import {
  KAIGI_COMPACT_INVITE_SCHEMA,
  KAIGI_INVITE_SCHEMA,
  buildKaigiCallId,
  buildKaigiCompactInviteDeepLink,
  buildKaigiCompactInviteHashRoute,
  buildKaigiCompactInvitePayload,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
  computeKaigiMeetingExpiryMs,
  decodeKaigiInvitePayload,
  deriveKaigiMeetingCode,
  encodeKaigiInvitePayload,
  extractKaigiInviteToken,
  isKaigiInviteExpired,
  parseKaigiInviteInput,
  type KaigiInvitePayload,
} from "@/utils/kaigiInvite";

describe("Kaigi invite helpers", () => {
  const invite: KaigiInvitePayload = {
    schema: KAIGI_INVITE_SCHEMA,
    callId: "default:kaigi-weekly-sync",
    meetingCode: "weekly-sync",
    title: "Weekly Sync",
    hostAccountId: "sorauAlice",
    hostDisplayName: "Alice",
    hostParticipantId: "alice",
    hostKaigiPublicKeyBase64Url: "ZmFrZS1rZXk",
    scheduledStartMs: 1_700_000_000_000,
    expiresAtMs: 1_700_086_400_000,
    createdAtMs: 1_700_000_000_000,
    live: true,
    offerDescription: {
      type: "offer",
      sdp: "v=0\r\na=ice-ufrag:test\r\n",
    },
  };

  it("encodes and decodes legacy invite payloads", () => {
    const token = encodeKaigiInvitePayload(invite);
    expect(decodeKaigiInvitePayload(token)).toEqual(invite);
  });

  it("extracts legacy invite tokens from deep links and hash routes", () => {
    const token = encodeKaigiInvitePayload(invite);
    expect(extractKaigiInviteToken(buildKaigiInviteDeepLink(token))).toBe(
      token,
    );
    expect(extractKaigiInviteToken(buildKaigiInviteHashRoute(token))).toBe(
      token,
    );
    expect(
      extractKaigiInviteToken(
        `https://example.invalid/#/kaigi?invite=${token}`,
      ),
    ).toBe(token);
  });

  it("parses compact invite links without embedding SDP", () => {
    const compact = buildKaigiCompactInvitePayload(
      "default:kaigi-weekly-sync",
      "bXktc2VjcmV0",
    );
    expect(compact.schema).toBe(KAIGI_COMPACT_INVITE_SCHEMA);
    const deepLink = buildKaigiCompactInviteDeepLink(compact);
    const hashRoute = buildKaigiCompactInviteHashRoute(compact);

    expect(deepLink).toContain("call=default%3Akaigi-weekly-sync");
    expect(deepLink).toContain("secret=bXktc2VjcmV0");
    expect(deepLink).not.toContain("offer");
    expect(hashRoute).toContain("call=default%3Akaigi-weekly-sync");
    expect(hashRoute).toContain("secret=bXktc2VjcmV0");

    expect(parseKaigiInviteInput(deepLink)).toEqual({
      kind: "compact",
      payload: compact,
    });
    expect(parseKaigiInviteInput(`#${hashRoute}`)).toEqual({
      kind: "compact",
      payload: compact,
    });
  });

  it("parses full legacy invite input directly", () => {
    const token = encodeKaigiInvitePayload(invite);
    expect(parseKaigiInviteInput(buildKaigiInviteDeepLink(token))).toEqual({
      kind: "legacy",
      payload: invite,
    });
  });

  it("builds call ids and derives meeting codes", () => {
    const callId = buildKaigiCallId("default", "Weekly Sync");
    expect(callId).toBe("default.universal:kaigi-weekly-sync");
    expect(deriveKaigiMeetingCode(callId)).toBe("weekly-sync");
  });

  it("computes 24h expiry from the scheduled start", () => {
    expect(computeKaigiMeetingExpiryMs(1_700_000_000_000)).toBe(
      1_700_086_400_000,
    );
  });

  it("detects invite expiry", () => {
    expect(
      isKaigiInviteExpired(
        { expiresAtMs: invite.expiresAtMs },
        invite.expiresAtMs + 1,
      ),
    ).toBe(true);
    expect(
      isKaigiInviteExpired(
        { expiresAtMs: invite.expiresAtMs },
        invite.expiresAtMs,
      ),
    ).toBe(false);
  });
});
