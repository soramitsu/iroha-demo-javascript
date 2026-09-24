import { describe, expect, it, vi } from "vitest";
import {
  FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES,
  FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES,
  assertFirstReleaseConfidentialNoteContinuation,
  consumeFirstReleaseConfidentialNotePage,
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS,
  FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET,
  FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
  FIRST_RELEASE_JSON_OBJECT_MAX_DEPTH,
  FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS,
  assertFirstReleaseConfidentialScanTargets,
  requireFirstReleaseFaucetRequestId,
  requireFirstReleaseJsonObject,
  reserveFirstReleaseFaucetRequest,
} from "../electron/firstReleaseResourceLimits";

describe("first-release resource limits", () => {
  it("keeps renderer-to-OS clipboard payloads finite", () => {
    expect(FIRST_RELEASE_CLIPBOARD_TEXT_MAX_BYTES).toBe(64 * 1024);
  });

  it("bounds cryptographic key material before decoding", () => {
    expect(FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES).toBe(16 * 1024);
  });
  it("snapshots a bounded renderer JSON object", () => {
    const input = { memo: "hello", nested: { count: 2 }, flags: [true] };
    const result = requireFirstReleaseJsonObject(input, "metadata");
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.nested).not.toBe(input.nested);
  });

  it("rejects lossy or structurally expensive renderer JSON", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => requireFirstReleaseJsonObject(cyclic, "metadata")).toThrow(
      /cyclic or shared/u,
    );
    expect(() =>
      requireFirstReleaseJsonObject({ missing: undefined }, "metadata"),
    ).toThrow(/non-JSON/u);
    expect(() =>
      requireFirstReleaseJsonObject(
        { huge: "x".repeat(16 * 1024 + 1) },
        "metadata",
      ),
    ).toThrow(/oversized text/u);

    let deep: Record<string, unknown> = {};
    const root = deep;
    for (
      let depth = 0;
      depth <= FIRST_RELEASE_JSON_OBJECT_MAX_DEPTH;
      depth += 1
    ) {
      const next: Record<string, unknown> = {};
      deep.next = next;
      deep = next;
    }
    expect(() => requireFirstReleaseJsonObject(root, "metadata")).toThrow(
      /depth limit/u,
    );
  });

  it("rejects sparse, accessor-backed, and enumerable named-field JSON arrays", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() =>
      requireFirstReleaseJsonObject({ values: sparse }, "metadata"),
    ).toThrow(/dense JSON data-field array/u);

    const accessor = ["safe"];
    Object.defineProperty(accessor, "0", {
      enumerable: true,
      get: () => {
        throw new Error("must not invoke array accessors");
      },
    });
    expect(() =>
      requireFirstReleaseJsonObject({ values: accessor }, "metadata"),
    ).toThrow(/dense JSON data-field array/u);

    const hiddenIndex = ["safe"];
    Object.defineProperty(hiddenIndex, "0", {
      enumerable: false,
      value: "safe",
    });
    expect(() =>
      requireFirstReleaseJsonObject({ values: hiddenIndex }, "metadata"),
    ).toThrow(/dense JSON data-field array/u);

    const named = ["safe"];
    Object.defineProperty(named, "hidden", {
      enumerable: false,
      value: true,
    });
    const snapshot = requireFirstReleaseJsonObject(
      { values: named },
      "metadata",
    );
    expect(snapshot).toEqual({ values: ["safe"] });
  });

  it("rejects wide JSON containers without bulk key-list allocation", () => {
    const wide = Object.fromEntries(
      Array.from({ length: 10_000 }, (_, index) => [`field${index}`, index]),
    );
    const dense = Array.from({ length: 513 }, (_, index) => index);
    const expando = ["safe"] as unknown[] & Record<string, unknown>;
    for (let index = 0; index < 10_000; index += 1) {
      expando[`extra${index}`] = index;
    }
    const ownKeys = vi.spyOn(Reflect, "ownKeys");
    const ownPropertyNames = vi.spyOn(Object, "getOwnPropertyNames");
    const failures: unknown[] = [];
    let ownKeyCalls = -1;
    let ownPropertyNameCalls = -1;
    try {
      for (const input of [wide, { values: dense }, { values: expando }]) {
        try {
          requireFirstReleaseJsonObject(input, "metadata");
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

    expect(failures).toHaveLength(3);
    expect(failures[0]).toHaveProperty(
      "message",
      "metadata exceeds its JSON property limit.",
    );
    expect(failures[1]).toHaveProperty(
      "message",
      "metadata.values exceeds its JSON array limit.",
    );
    expect(failures[2]).toHaveProperty(
      "message",
      "metadata.values contains unsupported array fields.",
    );
    expect(ownKeyCalls).toBe(0);
    expect(ownPropertyNameCalls).toBe(0);
  });

  it("enforces the global JSON-node budget before growing the pending walk", () => {
    const values = Array.from({ length: 8 }, () =>
      Array.from({ length: 512 }, () => 0),
    );
    expect(() => requireFirstReleaseJsonObject({ values }, "metadata")).toThrow(
      /JSON node limit/u,
    );
  });

  it("rejects oversized encodings even when individual values are small", () => {
    const input = {
      values: Array.from({ length: 100 }, () => "abcdefgh"),
    };
    const stringify = vi.spyOn(JSON, "stringify");
    let failure: unknown;
    let inputSerializations = -1;
    try {
      try {
        requireFirstReleaseJsonObject(input, "identity", 128);
      } catch (error) {
        failure = error;
      }
    } finally {
      inputSerializations = stringify.mock.calls.filter(
        ([candidate]) => candidate === input,
      ).length;
      stringify.mockRestore();
    }

    expect(failure).toHaveProperty(
      "message",
      "identity exceeds its JSON byte limit.",
    );
    expect(inputSerializations).toBe(0);
  });

  it("accounts for exact escaped UTF-8 bytes before building the snapshot", () => {
    const values = [
      'quote"slash\\',
      "\u0000\b\t\n\f\r",
      "snowman-☃",
      "emoji-😀",
      "unpaired-\ud800-\udc00",
      "line-\u2028-paragraph-\u2029",
    ];
    const input = Object.fromEntries(
      values.map((value, index) => [`field${index}`, value]),
    );
    const exactBytes = Buffer.byteLength(JSON.stringify(input), "utf8");

    expect(
      requireFirstReleaseJsonObject(input, "identity", exactBytes),
    ).toEqual(input);
    expect(() =>
      requireFirstReleaseJsonObject(input, "identity", exactBytes - 1),
    ).toThrow(/byte limit/u);
  });

  it("caps every confidential note page and the number of pages per asset", () => {
    let budget = { pages: 0, items: 0 };
    for (
      let page = 0;
      page < FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET;
      page += 1
    ) {
      budget = consumeFirstReleaseConfidentialNotePage(
        budget,
        FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE,
      );
    }
    expect(budget.pages).toBe(
      FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_PAGES_PER_ASSET,
    );
    expect(() => consumeFirstReleaseConfidentialNotePage(budget, 0)).toThrow(
      /finite scan budget/u,
    );
    expect(() =>
      assertFirstReleaseConfidentialNoteContinuation(budget, true),
    ).toThrow(/finite scan budget/u);
    expect(() =>
      assertFirstReleaseConfidentialNoteContinuation(budget, false),
    ).not.toThrow();
    expect(() =>
      consumeFirstReleaseConfidentialNotePage(
        { pages: 0, items: 0 },
        FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE + 1,
      ),
    ).toThrow(/page contract/u);
  });

  it("allows only the small unique confidential asset set used by the wallet", () => {
    const targets = Array.from(
      { length: FIRST_RELEASE_CONFIDENTIAL_NOTE_MAX_ASSETS },
      (_, index) => `asset-${index}`,
    );
    expect(() =>
      assertFirstReleaseConfidentialScanTargets(targets),
    ).not.toThrow();
    expect(() =>
      assertFirstReleaseConfidentialScanTargets([...targets, "asset-extra"]),
    ).toThrow(/tracked-asset limit/u);
    expect(() =>
      assertFirstReleaseConfidentialScanTargets(["asset", "asset"]),
    ).toThrow(/unique bounded/u);
  });

  it("requires a bounded canonical faucet request id", () => {
    expect(requireFirstReleaseFaucetRequestId("wallet-faucet-123-1")).toBe(
      "wallet-faucet-123-1",
    );
    expect(() => requireFirstReleaseFaucetRequestId(" bad id ")).toThrow(
      /bounded canonical/u,
    );
    expect(() => requireFirstReleaseFaucetRequestId("x".repeat(129))).toThrow(
      /bounded canonical/u,
    );
  });

  it("reserves and identity-releases a globally bounded faucet slot", () => {
    const controllers = new Map<string, AbortController>();
    const reservations = Array.from(
      { length: FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS },
      (_, index) =>
        reserveFirstReleaseFaucetRequest(controllers, `request-${index}`),
    );
    expect(() =>
      reserveFirstReleaseFaucetRequest(controllers, "request-overflow"),
    ).toThrow(/concurrency limit/u);
    expect(() =>
      reserveFirstReleaseFaucetRequest(controllers, "request-0"),
    ).toThrow(/already active/u);

    reservations[0].release();
    expect(controllers.size).toBe(FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS - 1);
    reservations[0].release();
    expect(controllers.size).toBe(FIRST_RELEASE_MAX_ACTIVE_FAUCET_REQUESTS - 1);
  });
});
