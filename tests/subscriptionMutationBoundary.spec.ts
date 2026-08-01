import { describe, expect, it, vi } from "vitest";
import { executeSubscriptionMutationBoundary } from "../electron/subscriptionMutationBoundary";

describe("subscription mutation secret boundary", () => {
  it("runs draft review before vault access, signing, submit, confirmation, and receipt", async () => {
    const order: string[] = [];
    const receipt = await executeSubscriptionMutationBoundary({
      prepareDraft: async () => {
        order.push("prepare");
        return { id: "draft" };
      },
      resolveSigningMaterial: async () => {
        order.push("vault");
        return { key: "secret" };
      },
      quoteAndSign: async () => {
        order.push("sign");
        return { signed: true };
      },
      submit: async () => {
        order.push("submit");
        return { hash: "ab".repeat(32) };
      },
      confirmResultingState: async () => {
        order.push("confirm");
      },
      buildReceipt: () => {
        order.push("receipt");
        return { ok: true };
      },
    });

    expect(receipt).toEqual({ ok: true });
    expect(order).toEqual([
      "prepare",
      "vault",
      "sign",
      "submit",
      "confirm",
      "receipt",
    ]);
  });

  it("never touches the vault, signer, or submitter when draft review rejects", async () => {
    const vault = vi.fn();
    const sign = vi.fn();
    const submit = vi.fn();
    await expect(
      executeSubscriptionMutationBoundary({
        prepareDraft: async () => {
          throw new Error("invalid unsigned draft");
        },
        resolveSigningMaterial: vault,
        quoteAndSign: sign,
        submit,
        confirmResultingState: vi.fn(),
        buildReceipt: vi.fn(),
      }),
    ).rejects.toThrow("invalid unsigned draft");
    expect(vault).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("does not manufacture a success receipt until exact state confirmation passes", async () => {
    const receipt = vi.fn(() => ({ ok: true }));
    await expect(
      executeSubscriptionMutationBoundary({
        prepareDraft: async () => ({ id: "draft" }),
        resolveSigningMaterial: async () => ({ key: "secret" }),
        quoteAndSign: async () => ({ signed: true }),
        submit: async () => ({ hash: "ab".repeat(32) }),
        confirmResultingState: async () => {
          throw new Error("indexed state mismatch");
        },
        buildReceipt: receipt,
      }),
    ).rejects.toThrow("indexed state mismatch");
    expect(receipt).not.toHaveBeenCalled();
  });
});
