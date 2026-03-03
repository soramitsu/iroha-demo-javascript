import { describe, expect, it } from "vitest";
import {
  normalizeBaseUrl,
  normalizeExplorerAccountQrPayload,
  sanitizeFetchHeaders,
  sanitizeFetchInit,
} from "../electron/preload-utils";

describe("preload utils", () => {
  it("normalizes Torii base URLs", () => {
    expect(normalizeBaseUrl(" https://torii.example/ ")).toBe(
      "https://torii.example",
    );
    expect(normalizeBaseUrl("http://127.0.0.1:8080")).toBe(
      "http://127.0.0.1:8080",
    );
    expect(() => normalizeBaseUrl("127.0.0.1:8080")).toThrow(
      "Torii URL must include http or https scheme",
    );
  });

  it("normalizes fetch headers from multiple input formats", () => {
    const fromHeaders = sanitizeFetchHeaders(
      new Headers({
        Accept: "application/json",
      }),
    );
    expect(Array.isArray(fromHeaders)).toBe(true);
    expect(fromHeaders).toContainEqual(["accept", "application/json"]);

    expect(
      sanitizeFetchHeaders([
        ["x-int", 42],
        ["x-bool", false],
      ]),
    ).toEqual([
      ["x-int", "42"],
      ["x-bool", "false"],
    ]);

    expect(
      sanitizeFetchHeaders({
        "x-ok": 123,
        "x-null": null,
        "x-undef": undefined,
      }),
    ).toEqual({
      "x-ok": "123",
    });
  });

  it("sanitizes fetch init headers without mutating passthroughs", () => {
    expect(sanitizeFetchInit(undefined)).toBeUndefined();

    const passthrough = { method: "GET" } as const;
    expect(sanitizeFetchInit(passthrough)).toBe(passthrough);

    const init = {
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-version": 2,
        "x-ignored": undefined,
      },
    } as unknown as Parameters<typeof fetch>[1];
    const out = sanitizeFetchInit(init);
    expect(out).not.toBe(init);
    expect(out).toEqual({
      method: "POST",
      headers: {
        Accept: "application/json",
        "x-version": "2",
      },
    });
  });

  it("maps explorer QR snake_case payloads to renderer contract fields", () => {
    const normalized = normalizeExplorerAccountQrPayload({
      canonical_id: "ed0120ABC@wonderland",
      literal: "ih58-literal",
      address_format: "ih58",
      network_prefix: 42,
      error_correction: "M",
      modules: 33,
      qr_version: 4,
      svg: "<svg/>",
    });

    expect(normalized).toEqual({
      canonicalId: "ed0120ABC@wonderland",
      literal: "ih58-literal",
      addressFormat: "ih58",
      networkPrefix: 42,
      errorCorrection: "M",
      modules: 33,
      qrVersion: 4,
      svg: "<svg/>",
    });

    expect(() =>
      normalizeExplorerAccountQrPayload({
        canonical_id: "ed0120ABC@wonderland",
        svg: "<svg/>",
      }),
    ).toThrow("Explorer QR response was missing required fields.");
  });
});
