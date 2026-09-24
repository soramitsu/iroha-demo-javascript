import { describe, expect, it } from "vitest";
import { parseConfidentialNoteIndexPage } from "../electron/confidentialNoteIndex";
import { FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE } from "../electron/firstReleaseResourceLimits";

const HASH = "ab".repeat(32);

const item = () => ({
  entrypoint_hash: HASH,
  transaction_hash: HASH,
  block: 42,
  result_ok: true,
  authority: "testuCanonicalAuthority",
  metadata: {},
  instructions: [{ zk: { Shield: { amount: "5" } } }],
});

const page = () => ({
  items: [item()],
  next_cursor: null,
  scanned_to_block: 42,
});

describe("confidential note index decoder", () => {
  it("accepts the exact first-release page contract", () => {
    expect(parseConfidentialNoteIndexPage(page())).toEqual({
      items: [
        {
          entrypoint_hash: HASH,
          result_ok: true,
          authority: "testuCanonicalAuthority",
          block: 42,
          metadata: {},
          instructions: [{ zk: { Shield: { amount: "5" } } }],
        },
      ],
      nextCursor: null,
      scannedToBlock: 42,
    });
  });

  it("distinguishes a genuine empty page from a malformed response", () => {
    expect(
      parseConfidentialNoteIndexPage({
        items: [],
        next_cursor: null,
        scanned_to_block: 0,
      }),
    ).toEqual({
      items: [],
      nextCursor: null,
      scannedToBlock: 0,
    });
    expect(() =>
      parseConfidentialNoteIndexPage({
        next_cursor: null,
        scanned_to_block: 0,
      }),
    ).toThrow(/missing or unknown fields/u);
  });

  it("rejects aliases, dropped fields, and unknown page fields", () => {
    const aliasedItem = {
      ...item(),
      transactionHash: HASH,
    } as Record<string, unknown>;
    delete aliasedItem.transaction_hash;
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        items: [aliasedItem],
      }),
    ).toThrow(/missing or unknown fields/u);
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        total: 1,
      }),
    ).toThrow(/missing or unknown fields/u);
  });

  it("rejects failed, mismatched, or non-canonical transaction records", () => {
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        items: [{ ...item(), result_ok: false }],
      }),
    ).toThrow(/result_ok must be true/u);
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        items: [{ ...item(), transaction_hash: "cd".repeat(32) }],
      }),
    ).toThrow(/transaction hashes must match/u);
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        items: [{ ...item(), entrypoint_hash: HASH.toUpperCase() }],
      }),
    ).toThrow(/lowercase 32-byte hex/u);
  });

  it("requires a canonical block cursor", () => {
    expect(
      parseConfidentialNoteIndexPage({
        ...page(),
        next_cursor: "41",
      }).nextCursor,
    ).toBe("41");
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        next_cursor: "041",
      }),
    ).toThrow(/canonical positive block cursor/u);
  });

  it("rejects a response page before decoding more items than requested", () => {
    expect(() =>
      parseConfidentialNoteIndexPage({
        ...page(),
        items: Array.from(
          { length: FIRST_RELEASE_CONFIDENTIAL_NOTE_PAGE_SIZE + 1 },
          item,
        ),
      }),
    ).toThrow(/requested page limit/u);
  });
});
