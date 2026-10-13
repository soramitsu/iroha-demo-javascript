import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import { decodeReviewedFirstReleaseInstructionDraft } from "../electron/firstReleaseNativeInstruction";
import {
  GOVERNANCE_CITIZEN_DRAFT_WIRE_ID,
  reviewedGovernanceDraftWireId,
} from "../electron/governanceDraftInstruction";
import { VALIDATION_FEE_POLICY_DRAFT_WIRE_ID } from "../electron/governanceValidationFeeDraft";
import { installGlobalIrohaJsNativeBinding } from "../electron/irohaJsNativeDir";
import { PROPOSAL_OPERATOR } from "./helpers/validationFeeFixtures";

type NativeInstructionCodec = Readonly<{
  noritoEncodeInstruction(json: string, networkPrefix: number): Uint8Array;
  noritoDecodeInstruction(bytes: Uint8Array, networkPrefix: number): string;
}>;

const sdkRepositoryRoot = (): string =>
  resolve(
    realpathSync(
      process.env.IROHA_JS_SDK_ROOT ??
        resolve(process.cwd(), "node_modules/.cache/iroha-sdk-compat/active"),
    ),
    "../..",
  );

/**
 * Rust golden (`crates/iroha_data_model/src/isi/governance.rs`): its
 * `concrete_frame_hex` is asserted equal to `framed_instruction_payload`, the
 * exact bytes Torii returns as a draft instruction's `payload_hex`.
 */
const rustDraftGolden = (): {
  wire_id: string;
  inputs: Record<string, unknown>;
  concrete_frame_hex: string;
  instruction_box_pair_hex: string;
  standalone_instruction_box_frame_hex: string;
} =>
  JSON.parse(
    readFileSync(
      resolve(
        sdkRepositoryRoot(),
        "fixtures/governance/plain_v1/update_plain_conviction_instruction_v1.json",
      ),
      "utf8",
    ),
  );

let native: NativeInstructionCodec;

beforeAll(() => {
  native = installGlobalIrohaJsNativeBinding(
    pathToFileURL(resolve(process.cwd(), "electron/irohaJsNativeDir.ts")).href,
  ) as unknown as NativeInstructionCodec;
});

describe("Torii draft instruction frames against the active native binding", () => {
  it("admits the Rust-pinned Torii concrete frame that the native decoder rejects", () => {
    const golden = rustDraftGolden();
    const concrete = Buffer.from(golden.concrete_frame_hex, "hex");
    const expectedInstruction = { UpdatePlainConviction: golden.inputs };

    expect(() => native.noritoDecodeInstruction(concrete, 753)).toThrow(
      /schema mismatch/u,
    );
    expect(
      Buffer.from(
        native.noritoEncodeInstruction(
          JSON.stringify(expectedInstruction),
          753,
        ),
      ).toString("hex"),
    ).toBe(golden.standalone_instruction_box_frame_hex);
    expect(golden.standalone_instruction_box_frame_hex.slice(80)).toBe(
      golden.instruction_box_pair_hex,
    );

    expect(
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: golden.wire_id,
        frame: concrete,
        expectedInstruction,
        networkPrefix: 753,
      }),
    ).toEqual(expectedInstruction);
    expect(() =>
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: golden.wire_id,
        frame: concrete,
        expectedInstruction: {
          UpdatePlainConviction: { ...golden.inputs, duration_blocks: 201 },
        },
        networkPrefix: 753,
      }),
    ).toThrow(/differ from the exact reviewed instruction/u);
  });

  it("uses the registered V1 wire ids for every reviewed governance draft", () => {
    expect(reviewedGovernanceDraftWireId("RegisterCitizen")).toBe(
      GOVERNANCE_CITIZEN_DRAFT_WIRE_ID,
    );
    expect(reviewedGovernanceDraftWireId("ProposeValidationFeePolicy")).toBe(
      VALIDATION_FEE_POLICY_DRAFT_WIRE_ID,
    );
    expect(
      reviewedGovernanceDraftWireId("ProposeValidationFeePayoutLifecycle"),
    ).toBeNull();
    expect(reviewedGovernanceDraftWireId("toString")).toBeNull();

    const citizen = {
      RegisterCitizen: { owner: PROPOSAL_OPERATOR, amount: "10000" },
    };
    const publicFrame = Buffer.from(
      native.noritoEncodeInstruction(JSON.stringify(citizen), 369),
    );
    const start = publicFrame.indexOf("NRT0", 40, "latin1");
    expect(start).toBeGreaterThan(48);
    const concrete = publicFrame.subarray(start);
    expect(
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: GOVERNANCE_CITIZEN_DRAFT_WIRE_ID,
        frame: concrete,
        expectedInstruction: citizen,
        networkPrefix: 369,
      }),
    ).toEqual(citizen);
    expect(() =>
      decodeReviewedFirstReleaseInstructionDraft({
        wireId: "iroha_data_model::isi::governance::RegisterCitizen",
        frame: concrete,
        expectedInstruction: citizen,
        networkPrefix: 369,
      }),
    ).toThrow(/differ from the exact reviewed instruction/u);
  });
});
