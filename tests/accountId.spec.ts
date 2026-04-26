import { describe, expect, it } from "vitest";
import {
  getAccountDisplayLabel,
  getPublicAccountId,
  normalizeAccountIdLiteralForNetwork,
  normalizeMainnetAccountIdLiteral,
  normalizeTairaAccountIdLiteral,
} from "@/utils/accountId";

describe("accountId utils", () => {
  it("rewrites stale SORA-native literals onto the TAIRA prefix", () => {
    expect(
      normalizeTairaAccountIdLiteral("sorauCanonicalAccountId1234567890"),
    ).toBe("testuCanonicalAccountId1234567890");
    expect(normalizeTairaAccountIdLiteral("testuVisibleAccountId")).toBe(
      "testuVisibleAccountId",
    );
  });

  it("rewrites stale TAIRA-native literals onto the SORA mainnet prefix", () => {
    expect(
      normalizeMainnetAccountIdLiteral("testuCanonicalAccountId1234567890"),
    ).toBe("sorauCanonicalAccountId1234567890");
    expect(
      normalizeAccountIdLiteralForNetwork(
        "testuCanonicalAccountId1234567890",
        753,
      ),
    ).toBe("sorauCanonicalAccountId1234567890");
    expect(
      getPublicAccountId(
        {
          displayName: "",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        753,
      ),
    ).toBe("sorauVisibleAccountId");
  });

  it("defaults to the SORA mainnet-visible account id when present", () => {
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "testuVisibleAccountId",
        i105DefaultAccountId: "sorauCanonicalAccountId",
      }),
    ).toBe("sorauVisibleAccountId");
  });

  it("falls back through normalized default and stored account ids", () => {
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "6cmzCompatAccountId",
        i105AccountId: "",
        i105DefaultAccountId: "sorauCanonicalAccountId",
      }),
    ).toBe("sorauCanonicalAccountId");
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "testuVisibleAccountId",
        i105DefaultAccountId: "",
      }),
    ).toBe("sorauVisibleAccountId");
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "",
        i105DefaultAccountId: "",
      }),
    ).toBe("sorauCompatAccountId");
  });

  it("prefers display name over account ids for labels", () => {
    expect(
      getAccountDisplayLabel(
        {
          displayName: "Alice",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        "fallback",
      ),
    ).toBe("Alice");
  });

  it("falls back to the canonical public account id for labels", () => {
    expect(
      getAccountDisplayLabel(
        {
          displayName: " ",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        "fallback",
      ),
    ).toBe("sorauVisibleAccountId");
  });
});
