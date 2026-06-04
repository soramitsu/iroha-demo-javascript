import { describe, expect, it } from "vitest";
import {
  buildTronSccpProofRequest,
  sccpSubmitMessageProofCallData,
  tronSccpDestinationBinding,
  wrapTronSccpProofResult,
  type TronSccpProofRequest,
} from "@iroha/iroha-js/sccp";
import { prove } from "@/utils/sccpNileDiagnosticProver";

const SCCP_SORA_DOMAIN = 0;
const SCCP_TRON_DOMAIN = 5;

const NILE_NETWORK_ID =
  "0x00000000000000000000000000000000000000000000000000000000cd8690dc";
const NILE_VERIFIER_ADDRESS = "TKJtY3UFssmhUSg1FPdXyxWcHKS9SWVtCJ";
const NILE_VERIFIER_CODE_HASH =
  "0x31b377bf5870aa2c26f701b678ca17c34ed9ae4d27292a81a1066a3bc554d9ef";
const NILE_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const NILE_BINDING_HASH =
  "0xdbce00b44904bf0462b08d97eebb5095906d09733f624f0a0b3319589f2b6e3f";

const hex32 = (byte: string): string => `0x${byte.repeat(32)}`;
const SAMPLE_PUBLIC_INPUTS = {
  version: 1 as const,
  messageId: hex32("11"),
  payloadHash: hex32("22"),
  targetDomain: SCCP_TRON_DOMAIN,
  commitmentRoot: hex32("33"),
  finalityHeight: "19",
  finalityBlockHash: hex32("44"),
};

const proofWord = (proofBytes: string, index: number): string =>
  proofBytes.slice(2 + index * 64, 2 + (index + 1) * 64);

const uint256Word = (value: number): string =>
  value.toString(16).padStart(64, "0");

const buildRequest = (): TronSccpProofRequest => {
  const destinationBinding = tronSccpDestinationBinding({
    version: 1,
    sourceDomain: SCCP_SORA_DOMAIN,
    targetDomain: SCCP_TRON_DOMAIN,
    networkId: NILE_NETWORK_ID,
    verifierAddress: NILE_VERIFIER_ADDRESS,
    verifierCodeHash: NILE_VERIFIER_CODE_HASH,
    verifierKeyHash: NILE_VERIFIER_KEY_HASH,
    bindingHash: NILE_BINDING_HASH,
  });

  return buildTronSccpProofRequest({
    publicInputs: SAMPLE_PUBLIC_INPUTS,
    bundleBytes: new Uint8Array([5, 6, 7]),
    sourceProofBytes: [],
    sourceDomain: SCCP_SORA_DOMAIN,
    statementHash: hex32("55"),
    destinationBinding,
  });
};

describe("SCCP Nile diagnostic destination prover", () => {
  it("generates a request-bound TRON Groth16 proof tuple", async () => {
    const request = buildRequest();

    const result = await prove(request);

    expect(result.requestHash).toBe(request.requestHash);
    expect(result.destinationBindingHash).toBe(NILE_BINDING_HASH);
    expect(result.proofBytes).toMatch(/^0x[0-9a-f]{768}$/u);
    expect(proofWord(result.proofBytes, 0)).toBe(uint256Word(1));
    expect(proofWord(result.proofBytes, 1)).toBe(
      request.publicInputs.messageId.slice(2),
    );
    expect(proofWord(result.proofBytes, 2)).toBe(uint256Word(SCCP_SORA_DOMAIN));
    expect(proofWord(result.proofBytes, 3)).toBe(
      request.publicInputs.commitmentRoot.slice(2),
    );

    const wrapped = wrapTronSccpProofResult(result.proofBytes, request);
    expect(wrapped.requestHash).toBe(request.requestHash);
    expect(wrapped.proofBytes).toHaveLength(384);
    expect(wrapped.envelopeHash).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(() =>
      sccpSubmitMessageProofCallData(
        wrapped.proofBytes,
        SAMPLE_PUBLIC_INPUTS,
        request.statementHash,
      ),
    ).not.toThrow();
  });

  it("accepts bare hex words returned by Torii proof jobs", async () => {
    const request = buildRequest();
    const bareRequest = {
      ...request,
      publicInputs: {
        ...request.publicInputs,
        messageId: request.publicInputs.messageId.slice(2),
        commitmentRoot: request.publicInputs.commitmentRoot.slice(2),
      },
      publicSignalWords: request.publicSignalWords.map((word) =>
        word.slice(2),
      ),
    };

    const result = await prove(bareRequest);

    expect(result.proofBytes).toMatch(/^0x[0-9a-f]{768}$/u);
    expect(result.requestHash).toBe(request.requestHash);
    expect(result.statementHash).toBe(request.statementHash);
    expect(result.destinationBindingHash).toBe(NILE_BINDING_HASH);
    expect(result.publicSignalWords[0]).toMatch(/^0x[0-9a-f]{64}$/u);
    expect(proofWord(result.proofBytes, 1)).toBe(
      request.publicInputs.messageId.slice(2),
    );
  });

  it("rejects requests outside the SORA-to-TRON Nile diagnostic lane", async () => {
    const request = buildRequest();

    await expect(
      prove({ ...request, sourceDomain: SCCP_TRON_DOMAIN }),
    ).rejects.toThrow(/SORA-origin/u);
    await expect(prove({ ...request, targetDomain: 1 })).rejects.toThrow(
      /targets TRON/u,
    );
    await expect(
      prove({
        ...request,
        publicSignalWords: request.publicSignalWords.slice(1),
      }),
    ).rejects.toThrow(/nine public signal words/u);
  });
});
