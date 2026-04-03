import { describe, expect, it } from "vitest";
import {
  sanitizeErrorMessage,
  toUserFacingErrorMessage,
} from "@/utils/errorMessage";

describe("sanitizeErrorMessage", () => {
  it("keeps ordinary messages intact", () => {
    expect(sanitizeErrorMessage("network timeout")).toBe("network timeout");
  });

  it("strips unreadable binary prefixes before readable error details", () => {
    expect(
      sanitizeErrorMessage(
        "ERR_UNEXPECTED_NETWORK_PREFIX — NRT0`\uFFFD6W\uFFFD5 invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
      ),
    ).toBe(
      "ERR_UNEXPECTED_NETWORK_PREFIX — invalid account_id `sorauExample` : ERR_UNEXPECTED_NETWORK_PREFIX",
    );
  });

  it("drops unreadable prefixes when no leading error code is present", () => {
    expect(
      sanitizeErrorMessage(
        "NRT0`\uFFFD6W\uFFFD5 invalid account_id `sorauExample`",
      ),
    ).toBe("invalid account_id `sorauExample`");
  });

  it("formats opaque norito literals inside readable errors", () => {
    expect(
      sanitizeErrorMessage(
        "Shield policy check failed for norito:00112233445566778899aabbccddeeff",
      ),
    ).toBe("Shield policy check failed for 4Zust3cNxsgov3757wxRW7DtR8n6");
  });
});

describe("toUserFacingErrorMessage", () => {
  it("falls back when the original error is empty", () => {
    expect(toUserFacingErrorMessage(new Error(""), "Request failed.")).toBe(
      "Request failed.",
    );
  });
});
