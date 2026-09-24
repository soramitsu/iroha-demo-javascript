import { describe, expect, it } from "vitest";
import { normalizeEndpointUrl } from "@/utils/endpoint";

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
    expect(() =>
      normalizeEndpointUrl("https://user:secret@example.com"),
    ).toThrow("Endpoint URL must not include credentials.");
    expect(() => normalizeEndpointUrl("http://torii.example")).toThrow(
      "Remote Torii endpoints must use HTTPS.",
    );
    expect(() =>
      normalizeEndpointUrl("https://torii.example?route=other"),
    ).toThrow("Endpoint URL must not include a query or fragment.");
    expect(() =>
      normalizeEndpointUrl("https://torii.example/#fragment"),
    ).toThrow("Endpoint URL must not include a query or fragment.");
    expect(() => normalizeEndpointUrl("https://torii.example?")).toThrow(
      "Endpoint URL must not include a query or fragment.",
    );
    expect(() => normalizeEndpointUrl("https://torii.example#")).toThrow(
      "Endpoint URL must not include a query or fragment.",
    );
    expect(() =>
      normalizeEndpointUrl(`https://${"a".repeat(2_048)}.example`),
    ).toThrow(/bounded/i);
  });

  it("rejects ambiguous host and path spellings", () => {
    expect(() => normalizeEndpointUrl("https://torii.example./api")).toThrow(
      "hostname must not end with a dot",
    );
    expect(() => normalizeEndpointUrl("https://torii.example/api//v2")).toThrow(
      "path must be canonical and unambiguous",
    );
    expect(() =>
      normalizeEndpointUrl("https://torii.example/%2fadmin"),
    ).toThrow("ambiguous escaped path characters");
    expect(() =>
      normalizeEndpointUrl("https://torii.example\\@evil.test"),
    ).toThrow("ambiguous escaped path characters");
    expect(() => normalizeEndpointUrl("https://torii.example/\u0000")).toThrow(
      "control characters",
    );
  });

  it("allows HTTP only for canonical loopback hosts", () => {
    expect(normalizeEndpointUrl("http://localhost:8080/")).toBe(
      "http://localhost:8080",
    );
    expect(normalizeEndpointUrl("http://wallet.localhost:8080/")).toBe(
      "http://wallet.localhost:8080",
    );
    expect(normalizeEndpointUrl("http://127.7.8.9:8080/")).toBe(
      "http://127.7.8.9:8080",
    );
    expect(normalizeEndpointUrl("http://[::1]:8080/")).toBe(
      "http://[::1]:8080",
    );
    expect(() => normalizeEndpointUrl("http://127.1:8080/")).toThrow(
      "canonical notation",
    );
    expect(() => normalizeEndpointUrl("http://2130706433:8080/")).toThrow(
      "canonical notation",
    );
    expect(() => normalizeEndpointUrl("http://0177.0.0.1:8080/")).toThrow(
      "canonical notation",
    );
  });
});
