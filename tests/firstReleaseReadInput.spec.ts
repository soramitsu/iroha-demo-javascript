import { describe, expect, it, vi } from "vitest";

import {
  assertFirstReleaseHasMore,
  assertFirstReleasePageWindow,
  requireFirstReleaseInputArray,
  requireFirstReleaseInputText,
  requireFirstReleasePagination,
  requireOptionalFirstReleaseFilter,
} from "../electron/firstReleaseReadInput";

describe("first-release renderer read input", () => {
  it("normalizes an omitted page and accepts the inclusive bounds", () => {
    expect(
      requireFirstReleasePagination({}, { defaultLimit: 50, label: "Assets" }),
    ).toEqual({ limit: 50, offset: 0 });
    expect(
      requireFirstReleasePagination(
        { limit: 500, offset: 10_000 },
        { defaultLimit: 50, label: "Assets" },
      ),
    ).toEqual({ limit: 500, offset: 10_000 });
  });

  it.each([
    { limit: "50" },
    { limit: null },
    { limit: 0 },
    { limit: 1.5 },
    { limit: 501 },
    { limit: Number.MAX_SAFE_INTEGER + 1 },
    { offset: "0" },
    { offset: null },
    { offset: -0 },
    { offset: -1 },
    { offset: 1.5 },
    { offset: 10_001 },
    { offset: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects a noncanonical or excessive page %#", (page) => {
    expect(() =>
      requireFirstReleasePagination(page, {
        defaultLimit: 50,
        label: "Assets",
      }),
    ).toThrow(/exact integer/iu);
  });

  it("binds returned item counts to the selected exact-count window", () => {
    expect(() =>
      assertFirstReleasePageWindow(
        { items: [1, 2], total: 12 },
        { limit: 2, offset: 10 },
        "Assets",
      ),
    ).not.toThrow();
    expect(() =>
      assertFirstReleasePageWindow(
        { items: [1, 2, 3], total: 12 },
        { limit: 2, offset: 0 },
        "Assets",
      ),
    ).toThrow(/more items than requested/iu);
    expect(() =>
      assertFirstReleasePageWindow(
        { items: [1, 2], total: 11 },
        { limit: 2, offset: 10 },
        "Assets",
      ),
    ).toThrow(/outside its exact-count window/iu);
  });

  it("binds has_more to the exact total and requested offset", () => {
    const page = { items: [1, 2], total: 5 };
    const request = { limit: 2, offset: 2 };
    expect(() =>
      assertFirstReleaseHasMore(true, page, request, "Assets"),
    ).not.toThrow();
    expect(() =>
      assertFirstReleaseHasMore(false, page, request, "Assets"),
    ).toThrow(/inconsistent has_more/iu);
    expect(() =>
      assertFirstReleaseHasMore("true", page, request, "Assets"),
    ).toThrow(/inconsistent has_more/iu);
  });

  it("requires bounded canonical optional filters without coercion", () => {
    expect(requireOptionalFirstReleaseFilter(undefined, "Filter")).toBe(
      undefined,
    );
    expect(requireOptionalFirstReleaseFilter(null, "Filter")).toBe(undefined);
    expect(requireOptionalFirstReleaseFilter("active", "Filter")).toBe(
      "active",
    );
    expect(() => requireOptionalFirstReleaseFilter(7, "Filter")).toThrow(
      /canonical text/iu,
    );
    expect(() =>
      requireOptionalFirstReleaseFilter(" active", "Filter"),
    ).toThrow(/canonical text/iu);
    expect(() =>
      requireOptionalFirstReleaseFilter("a".repeat(33), "Filter", 32),
    ).toThrow(/canonical text/iu);
    expect(() =>
      requireOptionalFirstReleaseFilter("active\u202e", "Filter"),
    ).toThrow(/canonical text/iu);
  });

  it("requires mandatory input text instead of trimming or coercing it", () => {
    expect(requireFirstReleaseInputText("alice", "Alias")).toBe("alice");
    expect(() => requireFirstReleaseInputText(undefined, "Alias")).toThrow(
      /canonical text/iu,
    );
    expect(() => requireFirstReleaseInputText(" alice ", "Alias")).toThrow(
      /canonical text/iu,
    );
  });

  it("bounds renderer-supplied arrays and rejects sparse or named fields", () => {
    const source = ["a", "b"];
    const snapshot = requireFirstReleaseInputArray(source, "Accounts", 2);
    source[0] = "changed";
    expect(snapshot).toEqual(["a", "b"]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() =>
      requireFirstReleaseInputArray(["a", "b", "c"], "Accounts", 2),
    ).toThrow(/item limit/iu);
    expect(() =>
      requireFirstReleaseInputArray(new Array(1), "Accounts", 2),
    ).toThrow(/dense array/iu);
    const named = ["a"] as string[] & { extra?: boolean };
    named.extra = true;
    expect(() => requireFirstReleaseInputArray(named, "Accounts", 2)).toThrow(
      /named fields/iu,
    );
    const symbolNamed = ["a"] as unknown[] & { [key: symbol]: boolean };
    symbolNamed[Symbol("extra")] = true;
    expect(() =>
      requireFirstReleaseInputArray(symbolNamed, "Accounts", 2),
    ).toThrow(/named fields/iu);
    const accessor = ["a"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      configurable: true,
      get: () => "a",
    });
    expect(() =>
      requireFirstReleaseInputArray(accessor, "Accounts", 2),
    ).toThrow(/dense array/iu);
    const inherited = ["a"];
    Object.setPrototypeOf(inherited, Object.create(Array.prototype));
    expect(() =>
      requireFirstReleaseInputArray(inherited, "Accounts", 2),
    ).toThrow(/exact array/iu);
  });

  it("checks the item cap before enumerating a dense or expando array", () => {
    const dense = Array.from({ length: 10_000 }, (_, index) => index);
    const expando = ["account"] as unknown[] & Record<string, unknown>;
    for (let index = 0; index < 10_000; index += 1) {
      expando[`extra${index}`] = index;
    }
    const ownKeys = vi.spyOn(Reflect, "ownKeys");
    const ownPropertyNames = vi.spyOn(Object, "getOwnPropertyNames");
    const failures: unknown[] = [];
    let ownKeyCalls = -1;
    let ownPropertyNameCalls = -1;
    try {
      for (const input of [dense, expando]) {
        try {
          requireFirstReleaseInputArray(input, "Accounts", 2);
        } catch (error) {
          failures.push(error);
        }
      }
    } finally {
      ownKeyCalls = ownKeys.mock.calls.length;
      ownPropertyNameCalls = ownPropertyNames.mock.calls.length;
      ownKeys.mockRestore();
      ownPropertyNames.mockRestore();
    }

    expect(failures).toHaveLength(2);
    expect(failures[0]).toHaveProperty(
      "message",
      "Accounts exceeds its exact item limit.",
    );
    expect(failures[1]).toHaveProperty(
      "message",
      "Accounts must not contain named fields.",
    );
    expect(ownKeyCalls).toBe(0);
    expect(ownPropertyNameCalls).toBe(0);
  });
});
