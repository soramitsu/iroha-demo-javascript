import { describe, expect, it } from "vitest";
import {
  getAccountDisplayLabel,
  getPublicAccountId,
  normalizeAccountIdLiteralForNetwork,
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

  it("prefers the TAIRA-visible account id when present", () => {
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "testuVisibleAccountId",
        i105DefaultAccountId: "sorauCanonicalAccountId",
      }),
    ).toBe("testuVisibleAccountId");
  });

  it("falls back through normalized default and stored account ids", () => {
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "6cmzCompatAccountId",
        i105AccountId: "",
        i105DefaultAccountId: "sorauCanonicalAccountId",
      }),
    ).toBe("testuCanonicalAccountId");
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "testuVisibleAccountId",
        i105DefaultAccountId: "",
      }),
    ).toBe("testuVisibleAccountId");
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "",
        i105DefaultAccountId: "",
      }),
    ).toBe("testuCompatAccountId");
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
    ).toBe("testuVisibleAccountId");
  });
});
