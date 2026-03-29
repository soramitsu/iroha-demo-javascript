import { describe, expect, it } from "vitest";
import {
  buildKaigiHashRoute,
  extractKaigiDeepLinkFromArgv,
  parseKaigiDeepLinkToHashRoute,
} from "../electron/deepLink";

describe("Kaigi deep-link helpers", () => {
  it("maps app protocol compact links into renderer hash routes", () => {
    expect(
      parseKaigiDeepLinkToHashRoute(
        "iroha://kaigi/join?call=kaigi%3Aroom&secret=abc123",
      ),
    ).toBe(buildKaigiHashRoute({ call: "kaigi:room", secret: "abc123" }));
  });

  it("still maps legacy invite links during migration", () => {
    expect(
      parseKaigiDeepLinkToHashRoute("iroha://kaigi/join?invite=legacy-token"),
    ).toBe(buildKaigiHashRoute({ invite: "legacy-token" }));
  });

  it("extracts the first matching deep link from argv", () => {
    expect(
      extractKaigiDeepLinkFromArgv([
        "--flag",
        "iroha://kaigi/join?call=kaigi%3Aroom&secret=meeting-secret",
      ]),
    ).toBe(
      buildKaigiHashRoute({
        call: "kaigi:room",
        secret: "meeting-secret",
      }),
    );
  });

  it("rejects unrelated urls", () => {
    expect(parseKaigiDeepLinkToHashRoute("https://example.com")).toBeNull();
    expect(extractKaigiDeepLinkFromArgv(["--flag", "hello"])).toBeNull();
  });
});
