import { describe, expect, it } from "vitest";
import {
  ballotDirectionToCode,
  canonicalizeProposalId,
  extractProposalIdFromReferendum,
  hasGovernancePermission,
  isPositiveInteger,
  isPositiveWholeNumberString,
  isValidProposalId,
  listGovernancePermissions,
  parseParliamentHistory,
  pushRecentValue,
  resolveXorBalance,
} from "@/utils/parliament";

describe("parliament utilities", () => {
  it("prefers configured asset IDs, then XOR balances, and falls back safely", () => {
    expect(
      resolveXorBalance(
        [
          {
            asset_id: "norito:abcdef0123456789",
            quantity: "7",
          },
          {
            asset_id: "norito:9876543210fedcba",
            quantity: "42",
          },
        ],
        "norito:9876543210fedcba",
      ),
    ).toBe("42");

    expect(
      resolveXorBalance([
        {
          asset_id: "norito:abcdef0123456789##alice@wonderland",
          quantity: "150",
        },
        {
          asset_id: "XOR#wonderland##alice@wonderland",
          quantity: "42",
        },
      ]),
    ).toBe("42");

    expect(
      resolveXorBalance([
        {
          asset_id: "norito:abcdef0123456789xorfeed",
          quantity: "21",
        },
      ]),
    ).toBe("21");

    expect(
      resolveXorBalance([
        {
          asset_id: "norito:abcdef0123456789",
          quantity: "7",
        },
      ]),
    ).toBe("7");

    expect(resolveXorBalance([])).toBe("0");
  });

  it("deduplicates and sorts permission names", () => {
    const permissions = [
      { name: "CanSubmitGovernanceBallot", payload: null },
      { name: "CanManageParliament", payload: null },
      { name: "CanSubmitGovernanceBallot", payload: null },
    ];

    expect(listGovernancePermissions(permissions)).toEqual([
      "CanManageParliament",
      "CanSubmitGovernanceBallot",
    ]);
    expect(
      hasGovernancePermission(permissions, "CanSubmitGovernanceBallot"),
    ).toBe(true);
    expect(hasGovernancePermission(permissions, "CanEnactGovernance")).toBe(
      false,
    );
  });

  it("maps ballot directions to instruction codes", () => {
    expect(ballotDirectionToCode("Aye")).toBe(0);
    expect(ballotDirectionToCode("Nay")).toBe(1);
    expect(ballotDirectionToCode("Abstain")).toBe(2);
  });

  it("normalizes and validates proposal ids", () => {
    const raw = "A".repeat(64);
    expect(canonicalizeProposalId(raw)).toBe(`0x${"a".repeat(64)}`);
    expect(canonicalizeProposalId(`0x${raw}`)).toBe(`0x${"a".repeat(64)}`);
    expect(isValidProposalId(`0x${"f".repeat(64)}`)).toBe(true);
    expect(isValidProposalId("ref-1")).toBe(false);
  });

  it("extracts proposal id hints from referendum payloads", () => {
    const direct = extractProposalIdFromReferendum({
      proposal_id: `0x${"1".repeat(64)}`,
    });
    const nested = extractProposalIdFromReferendum({
      proposal: {
        id: `${"2".repeat(64)}`,
      },
    });
    const invalid = extractProposalIdFromReferendum({
      proposal_id: "ref-1",
    });

    expect(direct).toBe(`0x${"1".repeat(64)}`);
    expect(nested).toBe(`0x${"2".repeat(64)}`);
    expect(invalid).toBeNull();
  });

  it("deduplicates and bounds recent history entries", () => {
    const recents = pushRecentValue(["ref-2", "ref-1"], "ref-2", 3);
    expect(recents).toEqual(["ref-2", "ref-1"]);

    const parsed = parseParliamentHistory({
      referenda: ["ref-3", "ref-2", "ref-2", "ref-1"],
      proposals: [
        `0x${"a".repeat(64)}`,
        `${"b".repeat(64)}`,
        "not-a-proposal-id",
        `0x${"a".repeat(64)}`,
      ],
    });
    expect(parsed.referenda).toEqual(["ref-3", "ref-2", "ref-1"]);
    expect(parsed.proposals).toEqual([
      `0x${"a".repeat(64)}`,
      `0x${"b".repeat(64)}`,
    ]);
  });

  it("validates positive whole-number and integer inputs", () => {
    expect(isPositiveWholeNumberString("10000")).toBe(true);
    expect(isPositiveWholeNumberString(" 42 ")).toBe(true);
    expect(isPositiveWholeNumberString("0")).toBe(false);
    expect(isPositiveWholeNumberString("10.5")).toBe(false);
    expect(isPositiveWholeNumberString("abc")).toBe(false);

    expect(isPositiveInteger(1)).toBe(true);
    expect(isPositiveInteger(7200)).toBe(true);
    expect(isPositiveInteger(0)).toBe(false);
    expect(isPositiveInteger(-5)).toBe(false);
    expect(isPositiveInteger(1.2)).toBe(false);
  });
});
