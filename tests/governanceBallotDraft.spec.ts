import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertGovernanceBallotDraftResponse,
  normalizeGovernanceDraftPayloadHex,
  normalizeGovernanceDraftWireId,
} from "../electron/governanceBallotDraft";

const draft = (
  wireId = "iroha_data_model::isi::governance::CastPlainBallot",
) => ({
  ok: true,
  accepted: true,
  reason: "build transaction skeleton",
  tx_instructions: [{ wire_id: wireId, payload_hex: "00" }],
});

describe("governance ballot draft boundary", () => {
  it("is enforced with citizenship, capability, and proposal-bound terms before review", () => {
    const source = readFileSync(
      resolve(process.cwd(), "electron", "preload.ts"),
      "utf8",
    );
    const proposalStart = source.indexOf(
      "const prepareGovernanceProposalAction = async",
    );
    const plainStart = source.indexOf(
      "const prepareGovernancePlainBallotAction = async",
      proposalStart,
    );
    const parliamentStart = source.indexOf(
      "const prepareGovernanceParliamentBallotAction = async",
      plainStart,
    );
    const enactStart = source.indexOf(
      "const prepareGovernanceEnactAction = async",
      parliamentStart,
    );
    const proposal = source.slice(proposalStart, plainStart);
    const plain = source.slice(plainStart, parliamentStart);
    const parliament = source.slice(parliamentStart, enactStart);

    expect(proposal).toContain("assertCurrentBondedGovernanceCitizen");
    expect(plain).toContain("assertCurrentBondedGovernanceCitizen");
    expect(plain).toContain("fetchGovernancePlainReferendumContract");
    expect(plain).toContain("assertGovernancePlainReferendumBallotBinding");
    expect(plain).toContain("hasExistingLock: proposal.locks.some");
    expect(plain).toContain('proposal.kind.type !== "ValidationFeePolicy"');
    expect(plain).toContain("capabilities.minBondAmount");
    expect(plain).toContain("capabilities.convictionStepBlocks");
    expect(plain).toContain(
      "assertGovernancePlainReferendumBallotDraft(draft, plainReferendum, {",
    );
    expect(plain).toContain("owner: accountId");
    expect(plain).toContain("direction: input.direction");
    expect(parliament).toContain(
      'assertGovernanceBallotDraftResponse(draft, "CastParliamentBallot")',
    );
  });

  it("accepts the exact local-signing response for the reviewed variant", () => {
    expect(() =>
      assertGovernanceBallotDraftResponse(draft(), "CastPlainBallot"),
    ).not.toThrow();
    expect(() =>
      assertGovernanceBallotDraftResponse(
        draft("iroha_data_model::isi::governance::CastParliamentBallot"),
        "CastParliamentBallot",
      ),
    ).not.toThrow();
  });

  it("rejects unsuccessful or server-submitted ballot responses", () => {
    expect(() =>
      assertGovernanceBallotDraftResponse(
        { ...draft(), accepted: false },
        "CastPlainBallot",
      ),
    ).toThrow("accepted local-signing draft");
    expect(() =>
      assertGovernanceBallotDraftResponse(
        { ...draft(), reason: "submitted transaction" },
        "CastPlainBallot",
      ),
    ).toThrow("accepted local-signing draft");
  });

  it("rejects response drift and non-canonical instructions", () => {
    expect(() =>
      assertGovernanceBallotDraftResponse(
        { ...draft(), extra: true },
        "CastPlainBallot",
      ),
    ).toThrow("missing or unknown fields");
    expect(() =>
      assertGovernanceBallotDraftResponse(
        {
          ...draft(),
          tx_instructions: [{ wire_id: "CastZkBallot", payload_hex: "00" }],
        },
        "CastPlainBallot",
      ),
    ).toThrow("must use exact wire id");
    expect(() =>
      assertGovernanceBallotDraftResponse(
        {
          ...draft(),
          tx_instructions: [
            {
              wire_id: "iroha_data_model::isi::governance::CastPlainBallot",
              payload_hex: "AA",
            },
          ],
        },
        "CastPlainBallot",
      ),
    ).toThrow("lowercase hexadecimal");
  });

  it.each([
    [
      "leading wire-id whitespace",
      () => normalizeGovernanceDraftWireId(" wire"),
    ],
    [
      "trailing wire-id whitespace",
      () => normalizeGovernanceDraftWireId("wire "),
    ],
    ["uppercase payload hex", () => normalizeGovernanceDraftPayloadHex("AA")],
    [
      "leading payload whitespace",
      () => normalizeGovernanceDraftPayloadHex(" 00"),
    ],
    [
      "trailing payload whitespace",
      () => normalizeGovernanceDraftPayloadHex("00 "),
    ],
  ])("rejects %s before native decode", (_label, decode) => {
    expect(decode).toThrow(/canonical non-empty text|lowercase hexadecimal/u);
  });
});
