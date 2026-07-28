import { describe, expect, it } from "vitest";
import {
  extractKaigiDeepLinkFromArgv,
  parseKaigiDeepLinkToHashRoute,
} from "../electron/deepLink";
import {
  buildKaigiInvite,
  buildKaigiInviteDeepLink,
  buildKaigiInviteHashRoute,
} from "@/utils/kaigiInvite";

const INVITE = buildKaigiInvite(
  "kaigi.universal:kaigi-room",
  "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u",
);
const DEEP_LINK = buildKaigiInviteDeepLink(INVITE);
const HASH_ROUTE = buildKaigiInviteHashRoute(INVITE);

describe("Kaigi deep-link helpers", () => {
  it("delegates the exact app-protocol link to the shared invite codec", () => {
    expect(parseKaigiDeepLinkToHashRoute(DEEP_LINK)).toBe(HASH_ROUTE);
  });

  it.each([
    "iroha://kaigi/join?invite=legacy-token",
    "iroha://kaigi/join?call=kaigi.universal%3Akaigi-room",
    `${DEEP_LINK}&extra=true`,
    `${DEEP_LINK}&secret=${INVITE.inviteSecretBase64Url}`,
    DEEP_LINK.replace("kaigi.universal", "kaigi"),
    DEEP_LINK.replace(INVITE.inviteSecretBase64Url, "short"),
    DEEP_LINK.replace("/join", "/other"),
    DEEP_LINK.replace("://kaigi/", "://other/"),
  ])("rejects a non-canonical deep link %s", (input) => {
    expect(parseKaigiDeepLinkToHashRoute(input)).toBeNull();
  });

  it("extracts the first matching deep link from argv", () => {
    expect(
      extractKaigiDeepLinkFromArgv([
        "--flag",
        "iroha://kaigi/join?invite=legacy-token",
        DEEP_LINK,
      ]),
    ).toBe(HASH_ROUTE);
  });

  it("rejects unrelated values", () => {
    expect(parseKaigiDeepLinkToHashRoute("https://example.com")).toBeNull();
    expect(extractKaigiDeepLinkFromArgv(["--flag", "hello"])).toBeNull();
  });
});
