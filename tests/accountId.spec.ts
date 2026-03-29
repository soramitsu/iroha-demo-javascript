import { describe, expect, it } from "vitest";
import {
  getAccountDisplayLabel,
  getPublicAccountId,
} from "@/utils/accountId";

describe("accountId utils", () => {
  it("prefers the canonical public account id when present", () => {
    expect(
      getPublicAccountId({
        displayName: "",
        accountId: "testuCompatAccountId",
        i105AccountId: "testuVisibleAccountId",
        i105DefaultAccountId: "sorauCanonicalAccountId",
      }),
    ).toBe("sorauCanonicalAccountId");
  });

  it("falls back through visible and stored account ids", () => {
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
    ).toBe("sorauCanonicalAccountId");
  });
});
