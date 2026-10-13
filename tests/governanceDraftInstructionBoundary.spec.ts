import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "electron/preload.ts"),
  "utf8",
);

const between = (startMarker: string, endMarker: string): string => {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
};

describe("public governance draft instruction boundary", () => {
  it("rejects nested fields outside exact wire_id and payload_hex", () => {
    const decoder = between(
      "const decodeGovernanceDraftInstruction",
      "const prunePreparedGovernanceActions",
    );

    expect(decoder).toContain(
      '["payload_hex", "wire_id"],\n    "Governance draft instruction",',
    );
    expect(decoder.indexOf("assertGovernanceExactKeys(")).toBeLessThan(
      decoder.indexOf("item.wire_id"),
    );
    expect(decoder.indexOf("assertGovernanceExactKeys(")).toBeLessThan(
      decoder.indexOf("item.payload_hex"),
    );
  });

  it("admits Torii concrete frames only by byte equality with the reviewed instruction", () => {
    const decoder = between(
      "const decodeGovernanceDraftInstruction",
      "const prunePreparedGovernanceActions",
    );

    expect(decoder).toContain("reviewedGovernanceDraftWireId(expectedVariant)");
    expect(decoder).toContain("decodeReviewedFirstReleaseInstructionDraft({");
    expect(decoder).toContain("expectedInstruction,");
    // The native public-frame decoder rejects Torii's concrete frames.
    expect(decoder).not.toContain("decodeFirstReleaseInstruction(");
    expect(source).not.toContain(
      '"iroha_data_model::isi::governance::RegisterCitizen"',
    );
  });

  it("routes only citizen registration and reviewed proposals through the decoder", () => {
    const sharedPrepare = between(
      "const prepareGovernanceDecodedAction",
      "const assertGovernanceExactKeys",
    );
    const citizen = between(
      "const prepareGovernanceCitizenRegistrationAction",
      "const prepareGovernanceProposalAction",
    );
    const proposal = between(
      "const prepareGovernanceProposalAction",
      "const confirmPreparedGovernanceAction",
    );

    expect(sharedPrepare).toContain("decodeGovernanceDraftInstruction(");
    expect(citizen).toContain("return prepareGovernanceDecodedAction({");
    expect(citizen).toContain(
      "expectedInstruction: { RegisterCitizen: { owner, amount } },",
    );
    expect(proposal).toContain("return await prepareGovernanceDecodedAction({");
    expect(proposal).toContain('operation: "propose"');
    expect(proposal).not.toMatch(/CastPlainBallot|EnactReferendum/u);
    expect(source).not.toContain("prepareGovernanceEnactAction");
  });
});
