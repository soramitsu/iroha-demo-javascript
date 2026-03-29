import { describe, expect, it } from "vitest";
import {
  buildKaigiHashRoute,
  extractKaigiDeepLinkFromArgv,
  parseKaigiDeepLinkToHashRoute,
} from "../electron/deepLink";

describe("Kaigi deep-link helpers", () => {
  it("maps app protocol links into renderer hash routes", () => {
    expect(
      parseKaigiDeepLinkToHashRoute("iroha://kaigi/join?invite=abc123"),
    ).toBe(buildKaigiHashRoute("abc123"));
  });

  it("extracts the first matching deep link from argv", () => {
    expect(
      extractKaigiDeepLinkFromArgv([
        "--flag",
        "iroha://kaigi/join?invite=meeting-token",
      ]),
    ).toBe(buildKaigiHashRoute("meeting-token"));
  });

  it("rejects unrelated urls", () => {
    expect(parseKaigiDeepLinkToHashRoute("https://example.com")).toBeNull();
    expect(extractKaigiDeepLinkFromArgv(["--flag", "hello"])).toBeNull();
  });
});
