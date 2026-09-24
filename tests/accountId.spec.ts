import { describe, expect, it } from "vitest";
import {
  getAccountDisplayLabel,
  getPublicAccountId,
  normalizeAccountIdLiteralForNetwork,
} from "@/utils/accountId";

describe("accountId utils", () => {
  it("accepts only literals already targeting the requested network", () => {
    expect(
      normalizeAccountIdLiteralForNetwork("testuVisibleAccountId", 369),
    ).toBe("testuVisibleAccountId");
    expect(
      normalizeAccountIdLiteralForNetwork(
        "testuCanonicalAccountId1234567890",
        753,
      ),
    ).toBe("");
    expect(
      normalizeAccountIdLiteralForNetwork(
        "sorauCanonicalAccountId1234567890",
        753,
      ),
    ).toBe("sorauCanonicalAccountId1234567890");
  });

  it("does not forge a network address by replacing an I105 prefix", () => {
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
    ).toBe("sorauCanonicalAccountId");
  });

  it("rejects invalid, implicit, or noncanonical network inputs", () => {
    expect(() =>
      normalizeAccountIdLiteralForNetwork("testuVisibleAccountId", -1),
    ).toThrow("networkPrefix must be an integer between 0 and 16383.");
    expect(
      normalizeAccountIdLiteralForNetwork(" testuVisibleAccountId", 369),
    ).toBe("");
    expect(
      normalizeAccountIdLiteralForNetwork("unqualified-account", 369),
    ).toBe("");
  });

  it("falls through only exact literals for the selected network", () => {
    expect(
      getPublicAccountId(
        {
          displayName: "",
          accountId: "other-format",
          i105AccountId: "",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        753,
      ),
    ).toBe("sorauCanonicalAccountId");
    expect(
      getPublicAccountId(
        {
          displayName: "",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "",
        },
        753,
      ),
    ).toBe("");
  });

  it("prefers a display name over account IDs for labels", () => {
    expect(
      getAccountDisplayLabel(
        {
          displayName: "Alice",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        "fallback",
        753,
      ),
    ).toBe("Alice");
  });

  it("falls back to the exact public account ID for labels", () => {
    expect(
      getAccountDisplayLabel(
        {
          displayName: " ",
          accountId: "testuCompatAccountId",
          i105AccountId: "testuVisibleAccountId",
          i105DefaultAccountId: "sorauCanonicalAccountId",
        },
        "fallback",
        753,
      ),
    ).toBe("sorauCanonicalAccountId");
  });
});
