import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";
import {
  assertNoRendererSigningSecret,
  wrapRendererSigningBoundary,
} from "../electron/rendererSigningBoundary";

const preloadSource = readFileSync(resolve("electron/preload.ts"), "utf8");

describe("renderer signing boundary", () => {
  it.each(["privateKeyHex", "authorityPrivateKeyHex"])(
    "rejects nested %s before invoking a bridge implementation",
    (property) => {
      const implementation = vi.fn(() => undefined);
      const api = wrapRendererSigningBoundary<{
        mutate(input: unknown): void;
      }>({ mutate: implementation }, new Set<never>());

      expect(() =>
        api.mutate({ nested: { [property]: "11".repeat(32) } }),
      ).toThrow("does not accept renderer-provided signing keys");
      expect(implementation).not.toHaveBeenCalled();
    },
  );

  it("permits key-free mutation inputs and preserves return values", () => {
    const implementation = vi.fn(() => "ok");
    const api = wrapRendererSigningBoundary<{
      mutate(input: unknown): string;
    }>({ mutate: implementation }, new Set<never>());

    expect(api.mutate({ accountId: "alice@wonderland" })).toBe("ok");
    expect(implementation).toHaveBeenCalledOnce();
  });

  it("allows only explicitly scoped setup key ingestion", () => {
    const storeAccountSecret = vi.fn(() => "stored");
    const mutate = vi.fn(() => undefined);
    const api = wrapRendererSigningBoundary<{
      storeAccountSecret(input: unknown): string;
      mutate(input: unknown): void;
    }>(
      { storeAccountSecret, mutate },
      new Set(["storeAccountSecret"] as const),
    );

    expect(api.storeAccountSecret({ privateKeyHex: "22".repeat(32) })).toBe(
      "stored",
    );
    expect(storeAccountSecret).toHaveBeenCalledOnce();
    expect(() => api.mutate({ privateKeyHex: "22".repeat(32) })).toThrow();
    expect(mutate).not.toHaveBeenCalled();
  });

  it("handles repeated object references without weakening the check", () => {
    const safe: Record<string, unknown> = {};
    safe.self = safe;
    expect(() => assertNoRendererSigningSecret("read", [safe])).not.toThrow();
    safe.privateKeyHex = "33".repeat(32);
    expect(() => assertNoRendererSigningSecret("read", [safe])).toThrow();
  });

  it("checks deep inputs iteratively and fails closed at the complexity bound", () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 128; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }

    expect(() => assertNoRendererSigningSecret("read", [root])).toThrow(
      "complexity limit",
    );
  });

  it("rejects wide, expando, and binary containers without bulk key-list allocation", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 1_024 }, (_, index) => [`field${index}`, index]),
    );
    const expando = ["safe"] as unknown[] & Record<string, unknown>;
    for (let index = 0; index < 1_024; index += 1) {
      expando[`extra${index}`] = index;
    }
    const inputs = [wide, expando, new Uint8Array(64 * 1024 + 1)];
    const ownPropertyNames = vi.spyOn(Object, "getOwnPropertyNames");
    const ownKeys = vi.spyOn(Reflect, "ownKeys");
    const failures: unknown[] = [];
    let bulkEnumerations = -1;
    try {
      for (const input of inputs) {
        try {
          assertNoRendererSigningSecret("read", [input]);
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      bulkEnumerations = [
        ...ownPropertyNames.mock.calls,
        ...ownKeys.mock.calls,
      ].filter(([candidate]) => inputs.includes(candidate)).length;
      ownPropertyNames.mockRestore();
      ownKeys.mockRestore();
    }

    expect(failures).toHaveLength(3);
    failures.forEach((error) =>
      expect(error).toHaveProperty(
        "message",
        "Renderer bridge input exceeds the signing-boundary complexity limit.",
      ),
    );
    expect(bulkEnumerations).toBe(0);
  });

  it("enforces a global field budget across individually bounded objects", () => {
    const root = Object.fromEntries(
      Array.from({ length: 40 }, (_, containerIndex) => [
        `container${containerIndex}`,
        Object.fromEntries(
          Array.from({ length: 512 }, (_, fieldIndex) => [
            `field${fieldIndex}`,
            fieldIndex,
          ]),
        ),
      ]),
    );

    expect(() => assertNoRendererSigningSecret("read", [root])).toThrow(
      "complexity limit",
    );
  });

  it("bounds inherited enumerable traversal without hiding inherited secrets", () => {
    const inherited = Object.fromEntries(
      Array.from({ length: 1_024 }, (_, index) => [`field${index}`, index]),
    );
    const input = Object.create(inherited) as object;

    expect(() => assertNoRendererSigningSecret("read", [input])).toThrow(
      "complexity limit",
    );
    Object.defineProperty(inherited, "privateKeyHex", {
      enumerable: false,
      value: "77".repeat(32),
    });
    expect(() => assertNoRendererSigningSecret("read", [input])).toThrow(
      "does not accept renderer-provided signing keys",
    );
  });

  it("rejects a deeply nested signing key without overflowing the stack", () => {
    const root: Record<string, unknown> = {};
    let cursor = root;
    for (let depth = 0; depth < 48; depth += 1) {
      const next: Record<string, unknown> = {};
      cursor.next = next;
      cursor = next;
    }
    cursor.privateKeyHex = "55".repeat(32);

    expect(() => assertNoRendererSigningSecret("read", [root])).toThrow(
      "does not accept renderer-provided signing keys",
    );
  });

  it("rejects inherited signing-key properties before dispatch", () => {
    const implementation = vi.fn(() => undefined);
    const api = wrapRendererSigningBoundary<{
      mutate(input: unknown): void;
    }>({ mutate: implementation }, new Set<never>());
    const input = Object.create({ privateKeyHex: "44".repeat(32) }) as object;

    expect(() => api.mutate(input)).toThrow(
      "does not accept renderer-provided signing keys",
    );
    expect(implementation).not.toHaveBeenCalled();
  });

  it("rejects a non-enumerable signing-key property without enumerating names", () => {
    const input = {};
    Object.defineProperty(input, "privateKeyHex", {
      enumerable: false,
      value: "66".repeat(32),
    });
    const ownPropertyNames = vi.spyOn(Object, "getOwnPropertyNames");
    let failure: unknown;
    let ownPropertyNameCalls = -1;
    try {
      try {
        assertNoRendererSigningSecret("read", [input]);
      } catch (error) {
        failure = error;
      }
    } finally {
      ownPropertyNameCalls = ownPropertyNames.mock.calls.length;
      ownPropertyNames.mockRestore();
    }
    expect(failure).toHaveProperty(
      "message",
      expect.stringContaining("does not accept renderer-provided signing keys"),
    );
    expect(ownPropertyNameCalls).toBe(0);
  });

  it("wraps the exposed preload API with an exact setup-only allowlist", () => {
    const start = preloadSource.indexOf("const SETUP_SECRET_INPUT_METHODS");
    const boundary = preloadSource.slice(start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(boundary).toContain(
      "wrapRendererSigningBoundary(api, SETUP_SECRET_INPUT_METHODS)",
    );
    expect(boundary).toContain('"storeAccountSecret"');
    expect(boundary).toContain('"derivePublicKey"');
    expect(boundary).not.toContain('"deriveConfidentialOwnerTag"');
    expect(boundary).not.toContain('"deriveConfidentialReceiveAddress"');
    expect(boundary).not.toContain('"transferAsset"');
    expect(boundary).not.toContain('"registerAccount"');
    expect(boundary).not.toContain('"connectVpn"');
  });
});
