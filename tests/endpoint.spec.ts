import { describe, expect, it } from "vitest";
import { normalizeEndpointUrl, resolveEndpointUrl } from "@/utils/endpoint";

describe("endpoint utilities", () => {
  it("normalizes http and https endpoint URLs", () => {
    expect(normalizeEndpointUrl(" https://taira.sora.org/ ")).toBe(
      "https://taira.sora.org",
    );
    expect(normalizeEndpointUrl("http://127.0.0.1:8080/api/")).toBe(
      "http://127.0.0.1:8080/api",
    );
  });

  it("rejects empty, malformed, and non-http endpoints", () => {
    expect(() => normalizeEndpointUrl("")).toThrow(
      "Enter a Torii endpoint URL.",
    );
    expect(() => normalizeEndpointUrl("not a url")).toThrow(
      "Enter a valid Torii endpoint URL.",
    );
    expect(() => normalizeEndpointUrl("ftp://example.com")).toThrow(
      "Endpoint must start with http:// or https://.",
    );
  });

  it("resolves invalid persisted values to a normalized fallback", () => {
    expect(
      resolveEndpointUrl("ftp://example.com", "https://taira.sora.org/"),
    ).toBe("https://taira.sora.org");
  });
});
