import { describe, expect, it } from "vitest";
import {
  KAIGI_COMPACT_INVITE_SCHEMA,
  buildKaigiCallId,
  buildKaigiCompactInviteDeepLink,
  buildKaigiCompactInviteHashRoute,
  buildKaigiCompactInvitePayload,
  computeKaigiMeetingExpiryMs,
  deriveKaigiMeetingCode,
  isKaigiInviteExpired,
  parseKaigiInviteInput,
} from "@/utils/kaigiInvite";

describe("Kaigi invite helpers", () => {
  it("builds and parses compact links containing only call and secret", () => {
    const compact = buildKaigiCompactInvitePayload(
      "default.universal:kaigi-weekly-sync",
      "bXktc2VjcmV0",
    );
    expect(compact.schema).toBe(KAIGI_COMPACT_INVITE_SCHEMA);
    const deepLink = buildKaigiCompactInviteDeepLink(compact);
    const hashRoute = buildKaigiCompactInviteHashRoute(compact);

    expect(deepLink).toBe(
      "iroha://kaigi/join?call=default.universal%3Akaigi-weekly-sync&secret=bXktc2VjcmV0",
    );
    expect(hashRoute).toBe(
      "/kaigi?call=default.universal%3Akaigi-weekly-sync&secret=bXktc2VjcmV0",
    );
    expect(deepLink).not.toMatch(/invite|sdp|ice|wallet/i);
    expect(hashRoute).not.toMatch(/invite|sdp|ice|wallet/i);

    expect(parseKaigiInviteInput(deepLink)).toEqual({
      kind: "compact",
      payload: compact,
    });
    expect(parseKaigiInviteInput(`#${hashRoute}`)).toEqual({
      kind: "compact",
      payload: compact,
    });
  });

  it("rejects legacy invite-token links and raw encoded payloads", () => {
    const legacyPayload = btoa(
      JSON.stringify({
        schema: "iroha-demo-kaigi-invite/v1",
        callId: "default:kaigi-weekly-sync",
        hostAccountId: "sorauAlice",
        offerDescription: {
          type: "offer",
          sdp: "v=0\r\na=ice-ufrag:test\r\n",
        },
      }),
    );

    expect(() =>
      parseKaigiInviteInput(
        `iroha://kaigi/join?invite=${encodeURIComponent(legacyPayload)}`,
      ),
    ).toThrow(/on-chain call and invite secret/i);
    expect(() => parseKaigiInviteInput(legacyPayload)).toThrow(
      /on-chain call and invite secret/i,
    );
  });

  it("rejects incomplete compact links", () => {
    expect(() =>
      parseKaigiInviteInput(
        "iroha://kaigi/join?call=default.universal%3Akaigi-weekly-sync",
      ),
    ).toThrow(/on-chain call and invite secret/i);
    expect(() =>
      parseKaigiInviteInput("iroha://kaigi/join?secret=bXktc2VjcmV0"),
    ).toThrow(/on-chain call and invite secret/i);
  });

  it("builds first-release call ids and derives meeting codes", () => {
    const callId = buildKaigiCallId("default", "Weekly Sync");
    expect(callId).toBe("default.universal:kaigi-weekly-sync");
    expect(deriveKaigiMeetingCode(callId)).toBe("weekly-sync");
  });

  it("computes 24h expiry and detects expiration", () => {
    const scheduledStartMs = 1_700_000_000_000;
    const expiresAtMs = computeKaigiMeetingExpiryMs(scheduledStartMs);
    expect(expiresAtMs).toBe(1_700_086_400_000);
    expect(isKaigiInviteExpired({ expiresAtMs }, expiresAtMs + 1)).toBe(true);
    expect(isKaigiInviteExpired({ expiresAtMs }, expiresAtMs)).toBe(false);
  });
});
