import { describe, expect, it, vi } from "vitest";

import {
  assertFaucetCommittedHeightAdvances,
  FaucetCommittedHeightStalledError,
  readSumeragiCommittedHeight,
} from "../electron/faucetFinality";

describe("faucet finality", () => {
  it("accepts a stale-timestamp endpoint when a bounded second observation proves committed-height progress", async () => {
    const wait = vi.fn().mockResolvedValue(undefined);
    const observe = vi.fn().mockResolvedValue({
      ledgerHeight: 14_535,
      sumeragiHeight: 14_535,
    });

    await expect(
      assertFaucetCommittedHeightAdvances({
        initial: {
          ledgerHeight: 14_533,
          sumeragiHeight: 14_533,
        },
        observationWindowMs: 3_000,
        observe,
        wait,
      }),
    ).resolves.toEqual({
      ledgerHeight: 14_535,
      sumeragiHeight: 14_535,
    });
    expect(wait).toHaveBeenCalledWith(3_000, undefined);
    expect(observe).toHaveBeenCalledOnce();
  });

  it("accepts an authoritative Sumeragi height that already advanced beyond the ledger observation", async () => {
    const wait = vi.fn();
    const observe = vi.fn();

    await expect(
      assertFaucetCommittedHeightAdvances({
        initial: {
          ledgerHeight: 14_533,
          sumeragiHeight: 14_534,
        },
        observationWindowMs: 3_000,
        observe,
        wait,
      }),
    ).resolves.toEqual({
      ledgerHeight: 14_533,
      sumeragiHeight: 14_534,
    });
    expect(wait).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
  });

  it("rejects a stale endpoint whose committed height stays unchanged", async () => {
    const initial = {
      ledgerHeight: 14_533,
      sumeragiHeight: 14_533,
    };

    await expect(
      assertFaucetCommittedHeightAdvances({
        initial,
        observationWindowMs: 3_000,
        observe: async () => ({ ...initial }),
        wait: async () => undefined,
      }),
    ).rejects.toEqual(
      expect.objectContaining<FaucetCommittedHeightStalledError>({
        name: "FaucetCommittedHeightStalledError",
        message: "The committed block height did not advance.",
        initial,
        latest: initial,
      }),
    );
  });

  it("preserves cancellation during the bounded observation", async () => {
    const controller = new AbortController();
    const reason = new Error("user canceled faucet");

    await expect(
      assertFaucetCommittedHeightAdvances({
        initial: {
          ledgerHeight: 14_533,
          sumeragiHeight: 14_533,
        },
        observationWindowMs: 3_000,
        observe: async () => ({
          ledgerHeight: 14_534,
          sumeragiHeight: 14_534,
        }),
        wait: async () => {
          controller.abort(reason);
        },
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
  });

  it("fails closed when the follow-up observation errors", async () => {
    const failure = new Error("Torii follow-up unavailable");

    await expect(
      assertFaucetCommittedHeightAdvances({
        initial: {
          ledgerHeight: 14_533,
          sumeragiHeight: 14_533,
        },
        observationWindowMs: 3_000,
        observe: async () => {
          throw failure;
        },
        wait: async () => undefined,
      }),
    ).rejects.toBe(failure);
  });

  it("reads the protocol-v3 authoritative committed height and legacy fallback", () => {
    expect(
      readSumeragiCommittedHeight({
        protocol_version: 3,
        last_committed_height: 14_535,
        commit_qc: { height: 12 },
      }),
    ).toBe(14_535);
    expect(
      readSumeragiCommittedHeight({
        commit_qc: { height: 88 },
      }),
    ).toBe(88);
    expect(
      readSumeragiCommittedHeight({
        last_committed_height: null,
        commit_qc: { height: 89 },
      }),
    ).toBe(89);
    expect(readSumeragiCommittedHeight({ height: 99 })).toBeNull();
  });
});
