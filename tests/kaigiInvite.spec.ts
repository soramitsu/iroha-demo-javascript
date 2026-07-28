import { describe, expect, it, vi } from "vitest";
import {
  KAIGI_INVITE_SECRET_BASE64URL_LENGTH,
  buildKaigiCallId,
  buildKaigiInvite,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
  computeKaigiMeetingExpiryMs,
  createKaigiInviteSecretBase64Url,
  deriveKaigiMeetingCode,
  isKaigiMeetingExpired,
  parseKaigiInviteDeepLink,
  parseKaigiInviteInput,
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
} from "@/utils/kaigiInvite";

const INVITE_SECRET = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";
const CALL_ID = "default.universal:kaigi-weekly-sync";

describe("Kaigi invite helpers", () => {
  it("builds and parses links containing only the canonical call and secret", () => {
    const invite = buildKaigiInvite(CALL_ID, INVITE_SECRET);
    const deepLink = buildKaigiInviteDeepLink(invite);
    const hashRoute = buildKaigiInviteHashRoute(invite);

    expect(deepLink).toBe(
      `iroha://kaigi/join?call=default.universal%3Akaigi-weekly-sync&secret=${INVITE_SECRET}`,
    );
    expect(hashRoute).toBe(
      `/kaigi?call=default.universal%3Akaigi-weekly-sync&secret=${INVITE_SECRET}`,
    );
    expect(deepLink).not.toMatch(/sdp|ice|wallet/i);
    expect(hashRoute).not.toMatch(/sdp|ice|wallet/i);
    expect(parseKaigiInviteDeepLink(deepLink)).toEqual(invite);
    expect(parseKaigiInviteInput(deepLink)).toEqual(invite);
    expect(parseKaigiInviteInput(`#${hashRoute}`)).toEqual(invite);
    expect(parseKaigiInviteInput(hashRoute)).toEqual(invite);
    expect(
      parseKaigiInviteInput(`https://wallet.example/#${hashRoute}`),
    ).toEqual(invite);
  });

  it.each([
    `iroha://kaigi/join?invite=${INVITE_SECRET}`,
    INVITE_SECRET,
    `iroha://kaigi/join?call=${encodeURIComponent(CALL_ID)}`,
    `iroha://kaigi/join?secret=${INVITE_SECRET}`,
    `iroha://kaigi/join?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}&extra=true`,
    `iroha://kaigi/join?call=${encodeURIComponent(CALL_ID)}&call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `iroha://kaigi/join?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}&secret=${INVITE_SECRET}`,
    `iroha://kaigi/other?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `iroha://other/join?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `#/other?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `https://wallet.example/?sdp=forbidden&wallet=forbidden#/kaigi?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    ` iroha://kaigi/join?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
    `javascript:void(0)#/kaigi?call=${encodeURIComponent(CALL_ID)}&secret=${INVITE_SECRET}`,
  ])("rejects non-canonical invite input %s", (input) => {
    expect(() => parseKaigiInviteInput(input)).toThrow(
      /exact call-and-secret meeting link/i,
    );
  });

  it("requires an already-qualified exact call id", () => {
    expect(requireKaigiCallId(CALL_ID)).toBe(CALL_ID);
    expect(buildKaigiCallId("default.universal", "Weekly Sync")).toBe(CALL_ID);
    expect(deriveKaigiMeetingCode(CALL_ID)).toBe("weekly-sync");

    expect(() => buildKaigiCallId("default", "Weekly Sync")).toThrow(
      /domain\.dataspace/i,
    );
    expect(() =>
      buildKaigiInvite("default:kaigi-weekly-sync", INVITE_SECRET),
    ).toThrow(/domain\.dataspace:meeting/i);
  });

  it("requires and generates a 24-byte unpadded base64url secret", () => {
    const randomValues = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation((array) => {
        const bytes = new Uint8Array(
          array.buffer,
          array.byteOffset,
          array.byteLength,
        );
        bytes.forEach((_value, index) => {
          bytes[index] = index;
        });
        return array;
      });

    const secret = createKaigiInviteSecretBase64Url();

    expect(randomValues).toHaveBeenCalledTimes(1);
    expect(secret).toHaveLength(KAIGI_INVITE_SECRET_BASE64URL_LENGTH);
    expect(requireKaigiInviteSecretBase64Url(secret)).toBe(secret);
    expect(() => requireKaigiInviteSecretBase64Url("bXktc2VjcmV0")).toThrow(
      /exactly 24 bytes/i,
    );
    expect(() =>
      requireKaigiInviteSecretBase64Url(`${INVITE_SECRET}=`),
    ).toThrow(/exactly 24 bytes/i);
  });

  it("computes 24h expiry and detects expiration", () => {
    const scheduledStartMs = 1_700_000_000_000;
    const expiresAtMs = computeKaigiMeetingExpiryMs(scheduledStartMs);
    expect(expiresAtMs).toBe(1_700_086_400_000);
    expect(isKaigiMeetingExpired({ expiresAtMs }, expiresAtMs + 1)).toBe(true);
    expect(isKaigiMeetingExpired({ expiresAtMs }, expiresAtMs)).toBe(false);
  });
});
