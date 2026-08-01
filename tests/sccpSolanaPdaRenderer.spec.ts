import { describe, expect, it } from "vitest";
import { deriveSolanaProgramAddressV1 } from "@/utils/sccpSolanaCanonical";

const PROGRAM_ID = "2VDW9dFE1ZXz4zWAbaBDQFynNVdRpQ73HyfSHMzBSL6Z";

describe("renderer-safe Solana PDA derivation", () => {
  it("derives the canonical address from cross-realm renderer byte arrays", () => {
    const first = new TextEncoder().encode("sccp-vk-v1");
    const second = Uint8Array.from({ length: 32 }, () => 0x11);
    const third = Uint8Array.from({ length: 32 }, () => 0x22);
    const snapshots = [first, second, third].map((seed) => [...seed]);

    const result = deriveSolanaProgramAddressV1({
      programAddress: PROGRAM_ID,
      seeds: [first, second, third],
    });
    expect(result).toEqual({
      address: "7aT1267FfvAHWoZD8JHxXv7iN4RVDuvTUscfJLn9NQrX",
      bump: 255,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect([first, second, third].map((seed) => [...seed])).toEqual(snapshots);
  });

  it("rejects seed counts and lengths that cannot be represented on Solana", () => {
    expect(() =>
      deriveSolanaProgramAddressV1({
        programAddress: PROGRAM_ID,
        seeds: Array.from({ length: 16 }, () => Uint8Array.of(1)),
      }),
    ).toThrow(/at most 15 byte arrays/u);
    expect(() =>
      deriveSolanaProgramAddressV1({
        programAddress: PROGRAM_ID,
        seeds: [new Uint8Array(33)],
      }),
    ).toThrow(/at most 32 bytes/u);
  });

  it("rejects invalid program identities before returning an address", () => {
    expect(() =>
      deriveSolanaProgramAddressV1({
        programAddress: "not-a-solana-program",
        seeds: [new TextEncoder().encode("sccp-vk-v1")],
      }),
    ).toThrow();
  });
});
