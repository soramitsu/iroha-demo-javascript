// @vitest-environment node
import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SCCP_SOLANA_EXACT_MATERIAL_HEADER_LEN,
  SCCP_SOLANA_EXACT_MATERIAL_LEN,
  SCCP_SOLANA_EXACT_MATERIAL_SEED,
  SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED,
  SCCP_SOLANA_EXACT_PUBLIC_SIGNAL_SCHEMA_HASH,
  SCCP_SOLANA_EXACT_ROUTE_STATE_LEN,
  SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED,
  SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN,
  SOLANA_SPL_TOKEN_PROGRAM_ID,
  checkExactRegistrySolanaRuntimeState,
  deriveExactSccpSolanaMaterialConfigHash,
  deriveExactSccpSolanaRuntimeLaneHashes,
  parseExactSccpSolanaMintData,
  parseExactSccpSolanaRouteStateData,
  parseExactSccpSolanaVerifierMaterialData,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
});

const bytes32 = (byte) => Uint8Array.from({ length: 32 }, () => byte);
const address = (byte) => new PublicKey(bytes32(byte)).toBase58();
const hex32 = (byte) => `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const hashBytes = (value) => Buffer.from(value.slice(2), "hex");
const putU16 = (data, offset, value) => data.writeUInt16LE(value, offset);
const putU32 = (data, offset, value) => data.writeUInt32LE(value, offset);
const putPubkey = (data, offset, value) =>
  Buffer.from(new PublicKey(value).toBytes()).copy(data, offset);
const putHash = (data, offset, value) => hashBytes(value).copy(data, offset);
const pda = (program, seedParts) => {
  const [key, bump] = PublicKey.findProgramAddressSync(
    seedParts.map((part) => Buffer.from(part)),
    new PublicKey(program),
  );
  return { address: key.toBase58(), bump };
};

const buildFixture = () => {
  const programs = {
    destination: address(0x12),
    source: address(0x13),
    nativeVerifier: address(0x14),
  };
  const accounts = {
    tokenMint: address(0x21),
    destinationState: address(0x22),
    sourceState: address(0x23),
  };
  const destinationBindingHash = hex32(0x31);
  const routeConfigurationHash = hex32(0x32);
  const proofPolicy = {
    soraFinalityAnchorHash: hex32(0x33),
    semanticProfileHash: hex32(0x34),
    circuitCommitment: hex32(0x35),
    witnessGeneratorCommitment: hex32(0x36),
    publicSignalSchemaHash: SCCP_SOLANA_EXACT_PUBLIC_SIGNAL_SCHEMA_HASH,
  };
  const verifyingKey = Buffer.alloc(SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN);
  for (let index = 0; index < verifyingKey.length; index += 1) {
    verifyingKey[index] = (index * 29 + 7) & 0xff;
  }
  const vkSha256 = `0x${createHash("sha256").update(verifyingKey).digest("hex")}`;
  const verifierKeyHash = `0x${Buffer.from(
    keccak_256(Uint8Array.from(verifyingKey)),
  ).toString("hex")}`;
  const verifyAuthority = pda(programs.destination, [
    new TextEncoder().encode(SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED),
    new PublicKey(accounts.destinationState).toBytes(),
  ]);
  const sourceVerifyAuthority = pda(programs.source, [
    new TextEncoder().encode(SCCP_SOLANA_EXACT_VERIFY_AUTHORITY_SEED),
    new PublicKey(accounts.sourceState).toBytes(),
  ]);
  const mintAuthority = pda(programs.destination, [
    new TextEncoder().encode(SCCP_SOLANA_EXACT_MINT_AUTHORITY_SEED),
    new PublicKey(accounts.destinationState).toBytes(),
  ]);
  const materialModel = {
    routeRevision: 1,
    asset: "xor",
    vkKeccak: verifierKeyHash,
    bridgeProgram: programs.destination,
    sourceProgram: programs.source,
    bridgeAuthority: verifyAuthority.address,
    bridgeState: accounts.destinationState,
    mint: accounts.tokenMint,
    tokenProgram: SOLANA_SPL_TOKEN_PROGRAM_ID,
    destinationBindingHash,
    routeConfigurationHash,
    soraFinalityAnchorHash: proofPolicy.soraFinalityAnchorHash,
    semanticProfileHash: proofPolicy.semanticProfileHash,
    circuitHash: proofPolicy.circuitCommitment,
    witnessGeneratorCommitment: proofPolicy.witnessGeneratorCommitment,
    schemaCommitment: proofPolicy.publicSignalSchemaHash,
  };
  const nativeVerifierConfigHash = deriveExactSccpSolanaMaterialConfigHash({
    verifierProgram: programs.nativeVerifier,
    material: materialModel,
  });
  const materialPda = pda(programs.nativeVerifier, [
    new TextEncoder().encode(SCCP_SOLANA_EXACT_MATERIAL_SEED),
    hashBytes(verifierKeyHash),
    hashBytes(nativeVerifierConfigHash),
  ]);
  accounts.nativeVerifierMaterial = materialPda.address;
  const laneHashes = deriveExactSccpSolanaRuntimeLaneHashes();

  const stateBytes = (role) => {
    const data = Buffer.alloc(SCCP_SOLANA_EXACT_ROUTE_STATE_LEN);
    data.write("SCCPRT01", 0, "ascii");
    data[8] = 1;
    data[9] = role;
    data[10] = role === 1 ? verifyAuthority.bump : sourceVerifyAuthority.bump;
    data[11] = mintAuthority.bump;
    putU32(data, 12, 1);
    putPubkey(data, 16, accounts.tokenMint);
    putPubkey(data, 48, role === 1 ? programs.source : programs.destination);
    putPubkey(data, 80, accounts.destinationState);
    putPubkey(data, 112, programs.nativeVerifier);
    putPubkey(data, 144, accounts.nativeVerifierMaterial);
    putHash(data, 176, destinationBindingHash);
    putHash(data, 208, routeConfigurationHash);
    putHash(data, 240, verifierKeyHash);
    putHash(data, 272, nativeVerifierConfigHash);
    putHash(data, 304, laneHashes.sourceLaneHash);
    putHash(data, 336, laneHashes.destinationLaneHash);
    return data;
  };

  const mint = Buffer.alloc(82);
  putU32(mint, 0, 1);
  putPubkey(mint, 4, mintAuthority.address);
  mint[44] = 9;
  mint[45] = 1;
  putU32(mint, 46, 0);

  const material = Buffer.alloc(SCCP_SOLANA_EXACT_MATERIAL_LEN);
  material.write("SCCPMAT1", 0, "ascii");
  material[8] = 1;
  material[9] = 2;
  material[10] = materialPda.bump;
  putU16(material, 12, SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN);
  putU32(material, 16, 1);
  material[20] = 3;
  putHash(material, 64, vkSha256);
  putHash(material, 96, verifierKeyHash);
  putHash(material, 128, nativeVerifierConfigHash);
  putPubkey(material, 160, programs.destination);
  putPubkey(material, 192, verifyAuthority.address);
  putPubkey(material, 224, accounts.destinationState);
  putPubkey(material, 256, accounts.tokenMint);
  putPubkey(material, 288, SOLANA_SPL_TOKEN_PROGRAM_ID);
  putHash(material, 320, destinationBindingHash);
  putHash(material, 352, routeConfigurationHash);
  putHash(material, 384, proofPolicy.soraFinalityAnchorHash);
  putHash(material, 416, proofPolicy.semanticProfileHash);
  putHash(material, 448, proofPolicy.circuitCommitment);
  putHash(material, 480, proofPolicy.witnessGeneratorCommitment);
  putHash(material, 512, proofPolicy.publicSignalSchemaHash);
  putHash(material, 544, proofPolicy.publicSignalSchemaHash);
  putHash(material, 576, laneHashes.sourceLaneHash);
  putHash(material, 608, laneHashes.destinationLaneHash);
  material.write("xor", 640, "ascii");
  material.write("taira_sol_xor", 704, "ascii");
  putPubkey(material, 736, programs.source);
  verifyingKey.copy(material, SCCP_SOLANA_EXACT_MATERIAL_HEADER_LEN);

  const summary = {
    routeId: "taira_sol_xor",
    assetKey: "xor",
    revision: 1,
    activation: "bidirectional",
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    programs,
    accounts,
    destinationBindingHash,
    routeConfigurationHash,
    verifierKeyHash,
    nativeVerifierConfigHash,
    proofPolicy,
  };
  const rpcAccounts = new Map([
    [
      accounts.destinationState,
      { owner: programs.destination, data: stateBytes(1) },
    ],
    [accounts.sourceState, { owner: programs.source, data: stateBytes(2) }],
    [accounts.tokenMint, { owner: SOLANA_SPL_TOKEN_PROGRAM_ID, data: mint }],
    [
      accounts.nativeVerifierMaterial,
      { owner: programs.nativeVerifier, data: material },
    ],
  ]);
  return { summary, rpcAccounts };
};

const installRpc = (accounts) => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const request = JSON.parse(options.body);
      const account = accounts.get(request.params[0]);
      return new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: request.id,
          result: {
            context: { slot: 9001 },
            value: account
              ? {
                  owner: account.owner,
                  executable: account.executable === true,
                  data: [account.data.toString("base64"), "base64"],
                }
              : null,
          },
        }),
        { headers: { "content-type": "application/json" } },
      );
    }),
  );
};

describe("exact Solana SCCP live runtime state", () => {
  it("accepts only the exact mutually bound route states, mint, and material", async () => {
    const fixture = buildFixture();
    installRpc(fixture.rpcAccounts);
    const evidence = await checkExactRegistrySolanaRuntimeState(
      fixture.summary,
      "https://api.testnet.solana.com",
      { attempts: 1 },
    );
    expect(evidence).toMatchObject({
      destinationState: { role: 1, contextSlot: 9001 },
      sourceState: { role: 2, contextSlot: 9001 },
      mint: { decimals: 9, initialized: true, freezeAuthority: null },
      material: {
        status: "sealed",
        asset: "xor",
        written: SCCP_SOLANA_EXACT_VERIFYING_KEY_LEN,
      },
    });
  });

  it("parses every exact ABI at its fixed length", () => {
    const fixture = buildFixture();
    expect(
      parseExactSccpSolanaRouteStateData(
        fixture.rpcAccounts.get(fixture.summary.accounts.destinationState).data,
      ),
    ).toMatchObject({ role: 1, routeRevision: 1 });
    expect(
      parseExactSccpSolanaMintData(
        fixture.rpcAccounts.get(fixture.summary.accounts.tokenMint).data,
      ),
    ).toMatchObject({ decimals: 9, initialized: true });
    expect(
      parseExactSccpSolanaVerifierMaterialData(
        fixture.rpcAccounts.get(fixture.summary.accounts.nativeVerifierMaterial)
          .data,
      ),
    ).toMatchObject({ status: "sealed", asset: "xor" });
  });

  it.each([
    [
      "spoofed state owner",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.destinationState,
        ).owner = fixture.summary.programs.source;
      },
      /route-state owner/u,
    ],
    [
      "spoofed material PDA",
      (fixture) => {
        fixture.summary.accounts.nativeVerifierMaterial = address(0x77);
      },
      /material PDA/u,
    ],
    [
      "truncated route layout",
      (fixture) => {
        const account = fixture.rpcAccounts.get(
          fixture.summary.accounts.destinationState,
        );
        account.data = account.data.subarray(0, account.data.length - 1);
      },
      /must be 400 bytes/u,
    ],
    [
      "swapped destination role",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.destinationState,
        ).data[9] = 2;
      },
      /role 1/u,
    ],
    [
      "wrong mint decimals",
      (fixture) => {
        fixture.rpcAccounts.get(fixture.summary.accounts.tokenMint).data[44] =
          8;
      },
      /decimals must be 9/u,
    ],
    [
      "freeze authority",
      (fixture) => {
        const mint = fixture.rpcAccounts.get(
          fixture.summary.accounts.tokenMint,
        ).data;
        putU32(mint, 46, 1);
        bytes32(0x44).forEach((byte, index) => {
          mint[50 + index] = byte;
        });
      },
      /must not have a freeze authority/u,
    ],
    [
      "wrong mint authority",
      (fixture) => {
        putPubkey(
          fixture.rpcAccounts.get(fixture.summary.accounts.tokenMint).data,
          4,
          address(0x66),
        );
      },
      /mint authority differs/u,
    ],
    [
      "uncleared material authority",
      (fixture) => {
        Buffer.from(bytes32(0x55)).copy(
          fixture.rpcAccounts.get(
            fixture.summary.accounts.nativeVerifierMaterial,
          ).data,
          32,
        );
      },
      /upload authority must be zero-filled/u,
    ],
    [
      "unsealed material",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.nativeVerifierMaterial,
        ).data[9] = 1;
      },
      /must be version 1 and sealed/u,
    ],
    [
      "truncated material",
      (fixture) => {
        const account = fixture.rpcAccounts.get(
          fixture.summary.accounts.nativeVerifierMaterial,
        );
        account.data = account.data.subarray(0, account.data.length - 1);
      },
      /must be 1984 bytes/u,
    ],
    [
      "tampered governed state hash",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.sourceState,
        ).data[176] ^= 1;
      },
      /destinationBindingHash differs/u,
    ],
    [
      "tampered material source program",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.nativeVerifierMaterial,
        ).data[736] ^= 1;
      },
      /config (?:commitment|hash)|source program|material PDA/u,
    ],
    [
      "tampered VK bytes",
      (fixture) => {
        fixture.rpcAccounts.get(
          fixture.summary.accounts.nativeVerifierMaterial,
        ).data[SCCP_SOLANA_EXACT_MATERIAL_HEADER_LEN] ^= 1;
      },
      /VK bytes do not match stored SHA-256/u,
    ],
  ])("rejects %s", async (_name, mutate, expected) => {
    const fixture = buildFixture();
    mutate(fixture);
    installRpc(fixture.rpcAccounts);
    await expect(
      checkExactRegistrySolanaRuntimeState(
        fixture.summary,
        "https://api.testnet.solana.com",
        { attempts: 1 },
      ),
    ).rejects.toThrow(expected);
  });
});
