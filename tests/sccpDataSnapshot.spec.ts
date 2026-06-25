import { describe, expect, it } from "vitest";
import {
  snapshotSccpDataValue,
  snapshotSccpJsonDataValue,
} from "@/utils/sccpDataSnapshot";

describe("SCCP data snapshot", () => {
  it("clones plain data without preserving caller-owned mutable references", () => {
    const binary = new Uint8Array([1, 2, 3]);
    const input = Object.assign(Object.create(null), {
      route: "taira_bsc_xor",
      nested: { amount: 10, binary },
    });

    const snapshot = snapshotSccpDataValue(input, "SCCP fixture") as {
      nested: { binary: Uint8Array };
    };

    expect(snapshot).toEqual(input);
    expect(snapshot).not.toBe(input);
    expect(snapshot.nested).not.toBe(input.nested);
    expect(snapshot.nested.binary).toEqual(binary);
    expect(snapshot.nested.binary).not.toBe(binary);
  });

  it("rejects undefined fields instead of deleting caller intent", () => {
    expect(() =>
      snapshotSccpJsonDataValue(
        {
          raw_data: {
            contract: [{ parameter: { value: { owner_address: undefined } } }],
          },
        },
        "TRON transaction request must contain only JSON data.",
      ),
    ).toThrow(/TRON transaction request must contain only JSON data/);
    expect(() =>
      snapshotSccpDataValue(
        {
          proof: undefined,
        },
        "SCCP proof input",
      ),
    ).toThrow(/SCCP proof input/);
  });

  it("rejects hostile object graph shapes without invoking accessors", () => {
    const accessed: string[] = [];
    const getterBacked = { route: "taira_bsc_xor" };
    Object.defineProperty(getterBacked, "secret", {
      enumerable: true,
      get() {
        accessed.push("secret");
        return "should-not-run";
      },
    });
    expect(() =>
      snapshotSccpDataValue(getterBacked, "SCCP proof input"),
    ).toThrow(/SCCP proof input/);
    expect(accessed).toEqual([]);

    const symbolBacked = { route: "taira_bsc_xor" } as Record<
      PropertyKey,
      unknown
    >;
    symbolBacked[Symbol("hidden")] = "value";
    expect(() =>
      snapshotSccpDataValue(
        symbolBacked as Record<string, unknown>,
        "SCCP proof input",
      ),
    ).toThrow(/SCCP proof input/);

    const cyclic = { route: "taira_bsc_xor" } as Record<string, unknown>;
    cyclic.self = cyclic;
    expect(() => snapshotSccpDataValue(cyclic, "SCCP proof input")).toThrow(
      /SCCP proof input/,
    );
  });

  it("rejects non-canonical arrays and non-finite primitives", () => {
    const sparse: unknown[] = [];
    sparse.length = 1;
    expect(() => snapshotSccpDataValue(sparse, "SCCP proof input")).toThrow(
      /SCCP proof input/,
    );

    const withSideChannel = [1] as unknown[] & { debug?: string };
    withSideChannel.debug = "side channel";
    expect(() =>
      snapshotSccpDataValue(withSideChannel, "SCCP proof input"),
    ).toThrow(/SCCP proof input/);

    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      1n,
    ]) {
      expect(() =>
        snapshotSccpDataValue({ value }, "SCCP proof input"),
      ).toThrow(/SCCP proof input/);
    }
  });
});
