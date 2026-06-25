import { describe, expect, it } from "vitest";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";

describe("JSON parsing helpers", () => {
  it("parses JSON without duplicate object keys", () => {
    expect(
      parseJsonWithoutDuplicateObjectKeys(
        '{"routeId":"taira_bsc_xor","items":[{"key":"a"},{"key":"b"}]}',
        "route manifest",
      ),
    ).toEqual({
      routeId: "taira_bsc_xor",
      items: [{ key: "a" }, { key: "b" }],
    });
  });

  it("rejects duplicate object keys before JSON.parse applies last-key-wins semantics", () => {
    for (const text of [
      '{"routeId":"shadow","routeId":"taira_bsc_xor"}',
      '{"\\u0072outeId":"shadow","routeId":"taira_bsc_xor"}',
      '{"items":[{"address":"0x1","\\u0061ddress":"0x2"}]}',
    ]) {
      expect(() =>
        parseJsonWithoutDuplicateObjectKeys(text, "SCCP metadata"),
      ).toThrow(/SCCP metadata contains a duplicate JSON object key/);
    }
  });
});
