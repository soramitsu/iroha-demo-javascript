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

  it("strips unreadable binary fragments after generic error codes", () => {
    expect(
      sanitizeErrorMessage(
        "route_unavailable — NRT0y?v\uFFFDv\uFFFD\uFFFDp\uFFFDz\uFFFDie no authoritative peer binding is registered for lane 1 dataspace 1",
      ),
    ).toBe(
      "route_unavailable — no authoritative peer binding is registered for lane 1 dataspace 1",
    );
  });

  it("formats opaque norito literals inside readable errors", () => {
    expect(
      sanitizeErrorMessage(
        "Shield policy check failed for norito:00112233445566778899aabbccddeeff",
      ),
    ).toBe("Shield policy check failed for 4Zust3cNxsgov3757wxRW7DtR8n6");
  });

  it("collapses HTML gateway responses to readable text", () => {
    expect(
      sanitizeErrorMessage(
        "<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx/1.29.8</center></body></html>",
      ),
    ).toBe("502 Bad Gateway");
  });

  it("turns binary transaction chain rejections into settings guidance", () => {
    expect(
      sanitizeErrorMessage(
        'transaction_rejected — NRT0"\uFFFDF\uFFFDF transaction_rejected failed to accept transaction: Chain id doesn\'t correspond to the id of current blockchain: Expected ChainId("00000000-0000-0000-0000-000000000000"), actual ChainId("sora nexus main net")',
      ),
    ).toBe(
      'Torii endpoint chain id mismatch: endpoint expects "00000000-0000-0000-0000-000000000000", but the app signed for "sora nexus main net". Open Settings and use Check & Save for this endpoint before sending.',
    );
  });
});

describe("toUserFacingErrorMessage", () => {
  it("falls back when the original error is empty", () => {
    expect(toUserFacingErrorMessage(new Error(""), "Request failed.")).toBe(
      "Request failed.",
    );
  });
});
