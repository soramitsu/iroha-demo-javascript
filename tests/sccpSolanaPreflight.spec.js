/* global BigInt */
import { describe, expect, it } from "vitest";
import {
  checkDestinationProofAdmission,
  parseSccpSolanaVerifierStateData,
  parseSplTokenMintAccountData,
  parseUpgradeableProgramDataAccountData,
  solanaExecutableBlake2b256,
  SOLANA_PROGRAMDATA_METADATA_LEN,
  SCCP_SOLANA_STATE_LEN,
  SCCP_SOLANA_STATE_MAGIC,
  SOLANA_UPGRADEABLE_PROGRAMDATA_TAG,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";

const leU32 = (value) => {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value, 0);
  return out;
};

const leU64 = (value) => {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value), 0);
  return out;
};

describe("Solana SCCP preflight live ProgramData parsing", () => {
  it("accepts immutable ProgramData with retained trailing authority bytes", () => {
    const slot = 419725105n;
    const staleAuthority = Buffer.from(
      "c4f2feefb3ccdacce6859d6302876c2ea14084081193d57133ba6b6cef08d5aa",
      "hex",
    );
    const executable = Buffer.from("7f454c460102030405", "hex");
    const programdata = Buffer.concat([
      leU32(SOLANA_UPGRADEABLE_PROGRAMDATA_TAG),
      leU64(slot),
      Buffer.from([0]),
      staleAuthority,
      executable,
    ]);

    const parsed = parseUpgradeableProgramDataAccountData(programdata);

    expect(programdata.subarray(0, SOLANA_PROGRAMDATA_METADATA_LEN)).toEqual(
      Buffer.concat([
        leU32(SOLANA_UPGRADEABLE_PROGRAMDATA_TAG),
        leU64(slot),
        Buffer.from([0]),
        staleAuthority,
      ]),
    );
    expect(parsed.slot).toBe(slot.toString());
    expect(parsed.executableHash).toBe(solanaExecutableBlake2b256(executable));
    expect(parsed.executableLength).toBe(executable.length);
  });

  it("parses PDA-controlled SPL mint and initialized SCCP verifier state", () => {
    const mintAuthority = Buffer.from("11".repeat(32), "hex");
    const mint = Buffer.alloc(82);
    leU32(1).copy(mint, 0);
    mintAuthority.copy(mint, 4);
    leU64(123n).copy(mint, 36);
    mint[44] = 9;
    mint[45] = 1;
    leU32(0).copy(mint, 46);

    const parsedMint = parseSplTokenMintAccountData(mint);

    expect(parsedMint.mintAuthority).toBe(
      "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2",
    );
    expect(parsedMint.supply).toBe("123");
    expect(parsedMint.decimals).toBe(9);
    expect(parsedMint.initialized).toBe(true);
    expect(parsedMint.freezeAuthority).toBeNull();

    const state = Buffer.alloc(SCCP_SOLANA_STATE_LEN);
    Buffer.from(SCCP_SOLANA_STATE_MAGIC, "ascii").copy(state, 0);
    state[8] = 1;
    Buffer.from("22".repeat(32), "hex").copy(state, 16);
    mintAuthority.copy(state, 192);
    leU64(5n).copy(state, 224);
    leU64(3n).copy(state, 232);

    const parsedState = parseSccpSolanaVerifierStateData(state);

    expect(parsedState.magic).toBe(SCCP_SOLANA_STATE_MAGIC);
    expect(parsedState.version).toBe(1);
    expect(parsedState.storedMint).toBe(
      "29d2S7vB453rNYFdR5Ycwt7y9haRT5fwVwL9zTmBhfV2",
    );
    expect(parsedState.totalMinted).toBe("5");
    expect(parsedState.totalBurned).toBe("3");
    expect(parsedState.acceptedHash).toBeNull();
  });

  it("rejects shape-only Solana destination proof admission material", () => {
    const manifest = {
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
      destinationProofAdmission: {
        admissionMode: "envelope-recorder-v1",
        proofSystem: "none",
        entrypoint: "submit_sccp_message_proof",
        verifierCodeHash: `0x${"11".repeat(32)}`,
        verifierKeyHash: `0x${"22".repeat(32)}`,
        destinationBindingHash: `0x${"33".repeat(32)}`,
        shapeOnly: true,
        acceptsUnverifiedProofs: true,
      },
      solanaProgramdataAddress: "2wen6hXkK13qnjfActBxfUxiGw1ASnUMrtqoNPMva7A7",
      solanaProgramdataSlot: 419725105,
    };

    expect(() => checkDestinationProofAdmission(manifest)).toThrow(
      /governed-zk-verifier-v1/u,
    );

    const production = {
      ...manifest,
      destinationProofAdmission: {
        ...manifest.destinationProofAdmission,
        admissionMode: "governed-zk-verifier-v1",
        proofSystem: "stark-fri-v1",
        shapeOnly: false,
        acceptsUnverifiedProofs: false,
      },
    };

    expect(checkDestinationProofAdmission(production)).toMatchObject({
      admissionMode: "governed-zk-verifier-v1",
      proofSystem: "stark-fri-v1",
      entrypoint: "submit_sccp_message_proof",
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      destinationBindingHash: `0x${"33".repeat(32)}`,
    });
  });
});
