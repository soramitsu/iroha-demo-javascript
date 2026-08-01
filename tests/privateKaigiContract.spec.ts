import { describe, expect, it } from "vitest";
import {
  PRIVATE_KAIGI_TRANSFER_BACKEND,
  PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID,
  readPrivateKaigiFeeSchedule,
  readPrivateKaigiTransferVerifyingKey,
  requireKaigiCallId,
  requireKaigiInviteSecretBase64Url,
} from "../electron/privateKaigiContract";

const validLifecycle = {
  version: 1,
  nexus_enabled: true,
  lane_count: 1,
  lanes: [],
};

const validPreflight = {
  fees: {
    fee_asset_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    base_fee: "0",
    per_byte_fee: "0",
    per_instruction_fee: "0.001",
    per_gas_unit_fee: "0.00005",
  },
};

const validVerifyingKey = () => ({
  id: {
    backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
    name: "vk_transfer",
  },
  record: {
    version: 1,
    circuit_id: PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID,
    backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
    status: "Active",
    inline_key: {
      backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
      bytes_b64: Buffer.from([1, 2, 3]).toString("base64"),
    },
  },
});

describe("private Kaigi first-release contract", () => {
  it("reads only the required snake_case live Nexus fee fields", () => {
    expect(readPrivateKaigiFeeSchedule(validLifecycle, validPreflight)).toEqual(
      {
        enabled: true,
        feeAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
        baseFee: "0",
        perByteFee: "0",
        perInstructionFee: "0.001",
        perGasUnitFee: "0.00005",
      },
    );
  });

  it.each([
    [
      "missing nexus_enabled",
      { version: 1 },
      validPreflight,
      /nexus_enabled must be a boolean/u,
    ],
    [
      "string nexus_enabled",
      { nexus_enabled: "true" },
      validPreflight,
      /nexus_enabled must be a boolean/u,
    ],
    [
      "camelCase lifecycle alias",
      { nexus_enabled: true, nexusEnabled: true },
      validPreflight,
      /nexusEnabled is unsupported/u,
    ],
    [
      "missing fees",
      validLifecycle,
      {},
      /pipeline preflight\.fees must be an object/u,
    ],
    [
      "missing fee component",
      validLifecycle,
      {
        fees: {
          ...validPreflight.fees,
          per_instruction_fee: undefined,
        },
      },
      /per_instruction_fee must be a non-empty string/u,
    ],
    [
      "camelCase fee alias",
      validLifecycle,
      {
        fees: {
          ...validPreflight.fees,
          baseFee: "0",
        },
      },
      /baseFee is unsupported/u,
    ],
    [
      "numeric zero fallback",
      validLifecycle,
      {
        fees: {
          ...validPreflight.fees,
          base_fee: 0,
        },
      },
      /base_fee must be a non-empty string/u,
    ],
    [
      "padded decimal",
      validLifecycle,
      {
        fees: {
          ...validPreflight.fees,
          per_byte_fee: " 0 ",
        },
      },
      /per_byte_fee must not contain surrounding whitespace/u,
    ],
  ])(
    "rejects %s rather than supplying defaults",
    (_name, lifecycle, preflight, error) => {
      expect(() => readPrivateKaigiFeeSchedule(lifecycle, preflight)).toThrow(
        error,
      );
    },
  );

  it("accepts the exact typed verifier record and creates only an SDK adapter", () => {
    const context = readPrivateKaigiTransferVerifyingKey(validVerifyingKey());
    expect(context.backend).toBe(PRIVATE_KAIGI_TRANSFER_BACKEND);
    expect(context.circuitId).toBe(PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID);
    expect(context.proofVerifyingKey.id).toEqual({
      backend: PRIVATE_KAIGI_TRANSFER_BACKEND,
      name: "vk_transfer",
    });
    expect(context.proofVerifyingKey.record.inline_key).toEqual(
      context.proofVerifyingKey.inline_key,
    );
  });

  it.each([
    [
      "top-level inline-key fallback",
      () => {
        const value = validVerifyingKey();
        const inlineKey = value.record.inline_key;
        return {
          ...value,
          record: { ...value.record, inline_key: undefined },
          inline_key: inlineKey,
        };
      },
      /inline_key is unsupported/u,
    ],
    [
      "camelCase circuit alias",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          record: {
            ...value.record,
            circuit_id: undefined,
            circuitId: PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID,
          },
        };
      },
      /circuitId is unsupported/u,
    ],
    [
      "defaulted backend",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          id: { name: value.id.name },
        };
      },
      /id\.backend must be a non-empty string/u,
    ],
    [
      "case-folded backend",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          id: { ...value.id, backend: "HALO2/IPA" },
        };
      },
      /backend must be exactly halo2\/ipa/u,
    ],
    [
      "mismatched inline backend",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          record: {
            ...value.record,
            inline_key: {
              ...value.record.inline_key,
              backend: "stark/fri",
            },
          },
        };
      },
      /backend must be exactly halo2\/ipa/u,
    ],
    [
      "case-folded circuit",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          record: {
            ...value.record,
            circuit_id: PRIVATE_KAIGI_TRANSFER_CIRCUIT_ID.toUpperCase(),
          },
        };
      },
      /circuit_id must be exactly/u,
    ],
    [
      "legacy circuit path alias",
      () => {
        const value = validVerifyingKey();
        return {
          ...value,
          record: {
            ...value.record,
            circuit_id:
              "halo2/pasta/confidential-transfer-2x2-merkle16-axiom-poseidon-v3",
          },
        };
      },
      /circuit_id must be exactly/u,
    ],
  ])("rejects the %s before proof construction", (_name, build, error) => {
    expect(() => readPrivateKaigiTransferVerifyingKey(build())).toThrow(error);
  });

  it("requires an already-qualified exact Kaigi call id", () => {
    expect(
      requireKaigiCallId("kaigi.universal:kaigi-weekly-sync", "callId"),
    ).toBe("kaigi.universal:kaigi-weekly-sync");
  });

  it.each([
    "kaigi:kaigi-weekly-sync",
    " kaigi.universal:kaigi-weekly-sync",
    "kaigi.universal:kaigi-weekly-sync ",
    "KAIGI.universal:kaigi-weekly-sync",
    "kaigi..universal:kaigi-weekly-sync",
    "kaigi.universal:kaigi:weekly-sync",
    "kaigi.universal:",
  ])("rejects legacy or non-exact call id %s", (callId) => {
    expect(() => requireKaigiCallId(callId, "callId")).toThrow(
      /domain\.dataspace:meeting|surrounding whitespace/u,
    );
  });

  it("requires an exact 24-byte invite secret", () => {
    const secret = "MDEyMzQ1Njc4OWFiY2RlZmdoaWprbG1u";
    expect(requireKaigiInviteSecretBase64Url(secret)).toBe(secret);
    expect(() => requireKaigiInviteSecretBase64Url("bXktc2VjcmV0")).toThrow(
      /exactly 24 bytes/u,
    );
    expect(() => requireKaigiInviteSecretBase64Url(`${secret}=`)).toThrow(
      /exactly 24 bytes/u,
    );
  });
});
