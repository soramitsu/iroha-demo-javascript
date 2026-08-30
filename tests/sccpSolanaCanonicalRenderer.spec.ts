// @vitest-environment node
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { describe, expect, it } from "vitest";
import {
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaNativeVerifierConfigHashV1,
  SCCP_SOLANA_SORA_OUTBOUND_EXECUTION_SEMANTICS_V1,
  sccpLaneIdHash,
  type SccpTransferPayloadV1,
} from "@iroha/iroha-js/sccp";
import { AccountAddress } from "@iroha/iroha-js/address";
import { deriveContractAddress } from "@iroha/iroha-js/smart-contract-deployment";
import {
  SCCP_SOLANA_TO_TAIRA_LANE_V1,
  SCCP_TAIRA_TO_SOLANA_LANE_V1,
  canonicalSccpTextWireHex,
  canonicalSolanaPubkeyWireHex,
  exactSccpMessageId,
  exactSccpPayloadBytes,
  exactSccpPayloadHash,
  deriveSccpSolanaRouteStateAddressV1,
  readGovernedSolanaRoutePinsV1,
} from "@/utils/sccpSolanaCanonical";
import {
  SCCP_SOLANA_SOURCE_BURN_EVENT_MARKER,
  SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
  SCCP_SOLANA_SYSTEM_PROGRAM_ID,
  buildTairaXorSolanaOutboundBurnRecordRequest,
  buildTairaXorSolanaBurnTransactionRequest,
  normalizeSolanaSourceBurnNonce,
  parseFinalizedSolanaSourceBurnTransaction,
} from "@/utils/sccp";

const upperHex = (byte: number, length: number): string =>
  byte.toString(16).padStart(2, "0").repeat(length).toUpperCase();
const upperBytes = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("hex").toUpperCase();
const expectedRegistryRevision = `0x${"10".repeat(32)}`;
const TAIRA_CHAIN_ID = "fc56984b-2be7-431d-840e-21514d1883f0";

const g1 = () => ({
  x: "1".padStart(64, "0"),
  y: "2".padStart(64, "0"),
});

// Canonical BN254 G2 generator coordinates. Repeated-byte placeholders are
// not valid curve points and must never stand in for verifier material.
const g2 = () => ({
  x_c0: "1800DEEF121F1E76426A00665E5C4479674322D4F75EDADD46DEBD5CD992F6ED",
  x_c1: "198E9393920D483A7260BFB731FB5D25F1AA493335A9E71297E485B7AEF312C2",
  y_c0: "12C85EA5DB8C6DEB4AAB71808DCB408FE3D1E7690C43D37B4CE6CC0166FA7DAA",
  y_c1: "090689D0585FF075EC9E99AD690C3395BC4B313370B38EF355ACDADCD122975B",
});

const verifyingKey = () => {
  const ic: Record<string, ReturnType<typeof g1>> = { constant: g1() };
  for (let index = 0; index < 11; index += 1) {
    ic[`signal_${index}`] = g1();
  }
  return {
    version: 1,
    alpha1: g1(),
    beta2: g2(),
    gamma2: g2(),
    delta2: g2(),
    ic,
  };
};

const verifyingKeyBytes = (
  key: ReturnType<typeof verifyingKey>,
): Uint8Array => {
  const words: string[] = [];
  const addG1 = (point: ReturnType<typeof g1>) => {
    words.push(point.x, point.y);
  };
  const addG2 = (point: ReturnType<typeof g2>) => {
    words.push(point.x_c0, point.x_c1, point.y_c0, point.y_c1);
  };
  addG1(key.alpha1);
  addG2(key.beta2);
  addG2(key.gamma2);
  addG2(key.delta2);
  addG1(key.ic.constant);
  for (let index = 0; index < 11; index += 1) {
    addG1(key.ic[`signal_${index}`]);
  }
  return Uint8Array.from(Buffer.from(words.join(""), "hex"));
};

const outboundPolicy = () => ({
  version: 1,
  semantic_profile: {
    profile: "sora_taira_finality_inclusion_groth16_bn254",
    commitments: {
      version: 1,
      circuit_commitment: upperHex(0xc1, 32),
      witness_generator_commitment: upperHex(0xc2, 32),
      public_signal_schema_hash:
        "7567439F41173D6745A3D51923CB70371ACC7D66F23CEFB4100D6D5D7A432CBB",
    },
  },
  sora_finality_anchor: {
    version: 1,
    source_network: { network: "sora_taira", profile: null },
    protocol_version: 3,
    chain_id_hash:
      "CF1CFC0F57B0BFA4C21882A9870317A1F4812F86533897095E3944BE34C5BBA7",
    checkpoint_height: 7,
    checkpoint_block_hash: upperHex(0xa1, 32),
    checkpoint_context_id: upperHex(0xa2, 32),
    checkpoint_finality_artifact_hash: upperHex(0xa3, 32),
  },
});

const soraOutboundArtifact = Uint8Array.from(
  { length: 64 },
  (_, index) => (index * 17 + 3) & 0xff,
);

const soraOutboundExecutionPolicy = () => ({
  version: 1,
  semantics: SCCP_SOLANA_SORA_OUTBOUND_EXECUTION_SEMANTICS_V1,
  contract_artifact_sha256: Buffer.from(sha256(soraOutboundArtifact))
    .toString("hex")
    .toUpperCase(),
  contract_address: outboundContractAddress,
  vk_ref: {
    backend: "stark/fri/v1",
    name: "ivm-execution-v1",
    version: 7,
    commitment: upperHex(0xb2, 32),
  },
  gas_limit: 50_000_000,
});

const custodyAccount = AccountAddress.fromAccount({
  publicKey: Uint8Array.from([0x58, ...Array(31).fill(0x66)]),
}).toI105(369);
const outboundContractAddress = deriveContractAddress({
  chainId: TAIRA_CHAIN_ID,
  chainDiscriminant: 369,
  authority: custodyAccount,
  deployNonce: 7,
  dataspaceId: 0,
});

const governedRoute = (): Record<string, unknown> => {
  const key = verifyingKey();
  const mint = new PublicKey(Uint8Array.from({ length: 32 }, () => 0x11));
  const destinationProgram = new PublicKey(
    Uint8Array.from({ length: 32 }, () => 0x12),
  );
  const sourceProgram = new PublicKey(
    Uint8Array.from({ length: 32 }, () => 0x31),
  );
  const destinationState = new PublicKey(
    deriveSccpSolanaRouteStateAddressV1({
      routeProgramAddress: destinationProgram.toBase58(),
      role: 1,
      tokenMintAddress: mint.toBase58(),
    }),
  );
  const sourceState = new PublicKey(
    deriveSccpSolanaRouteStateAddressV1({
      routeProgramAddress: sourceProgram.toBase58(),
      role: 2,
      tokenMintAddress: mint.toBase58(),
    }),
  );
  const deployment = {
    token_mint_address: Buffer.from(mint.toBytes())
      .toString("hex")
      .toUpperCase(),
    route_program_id: Buffer.from(destinationProgram.toBytes())
      .toString("hex")
      .toUpperCase(),
    route_program_data_address: upperHex(0x13, 32),
    route_program_data_slot: 17,
    route_state_account: Buffer.from(destinationState.toBytes())
      .toString("hex")
      .toUpperCase(),
    route_program_code_hash: upperHex(0x15, 32),
    native_verifier_program_id: upperHex(0x16, 32),
    native_verifier_program_data_address: upperHex(0x17, 32),
    native_verifier_program_data_slot: 18,
    native_verifier_material_account: upperHex(0x18, 32),
    native_verifier_program_code_hash: upperHex(0x19, 32),
    native_verifier_config_hash: upperHex(0x1a, 32),
    verifying_key: key,
    verifier_key_hash: Buffer.from(keccak_256(verifyingKeyBytes(key)))
      .toString("hex")
      .toUpperCase(),
    outbound_proof_policy: outboundPolicy(),
    taira_to_token_multiplier: 1,
  };
  deployment.native_verifier_config_hash =
    deriveSccpSolanaNativeVerifierConfigHashV1(
      deployment as never,
      upperBytes(sourceProgram.toBytes()),
      1,
    )
      .slice(2)
      .toUpperCase();
  const deploymentHashes = deriveSccpSolanaDestinationHashesV1(
    deployment as never,
    upperBytes(sourceProgram.toBytes()),
    1,
  );
  return {
    lane_id: SCCP_SOLANA_TO_TAIRA_LANE_V1,
    route_id: "taira_sol_xor",
    asset_key: "xor",
    revision: 1,
    activation: { activation: "bidirectional", direction: null },
    inbound_finality_cutoff: null,
    source_identity: {
      lane: SCCP_SOLANA_TO_TAIRA_LANE_V1,
      emitter: {
        emitter: "solana",
        identity: {
          program_id: Buffer.from(sourceProgram.toBytes())
            .toString("hex")
            .toUpperCase(),
          program_data_address: upperHex(0x32, 32),
          program_data_slot: 19,
          state_account: Buffer.from(sourceState.toBytes())
            .toString("hex")
            .toUpperCase(),
          program_code_hash: upperHex(0x34, 32),
          route_config_hash: deploymentHashes.route_configuration_hash
            .slice(2)
            .toUpperCase(),
        },
      },
    },
    destination: { family: "solana", deployment },
    sora_outbound_execution_policy: soraOutboundExecutionPolicy(),
    settlement: {
      asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      custody_account_id: custodyAccount,
      payload_amount_scale: 9,
    },
  };
};

const soraOutboundMaterial = (
  route: Record<string, unknown> = governedRoute(),
): Record<string, unknown> => {
  const pins = readGovernedSolanaRoutePinsV1(route);
  return {
    version: 1,
    registry_revision: `0x${"10".repeat(32)}`,
    route_key: {
      lane_id: SCCP_SOLANA_TO_TAIRA_LANE_V1,
      route_id: "taira_sol_xor",
      asset_key: "xor",
      revision: 1,
    },
    route_configuration_hash: pins.routeConfigurationHash,
    destination_binding_hash: pins.destinationBindingHash,
    settlement_asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    policy: soraOutboundExecutionPolicy(),
    contract_artifact_b64: Buffer.from(soraOutboundArtifact).toString("base64"),
    contract_address: outboundContractAddress,
    contract_code_hash: `0x${"22".repeat(32)}`,
    verifying_key_version: 7,
  };
};

const transfer = (): SccpTransferPayloadV1 => ({
  version: 1,
  source_domain: 0,
  dest_domain: 3,
  nonce: "7",
  route_revision: 1,
  asset_home_domain: 0,
  asset_id_codec: 1,
  asset_id: canonicalSccpTextWireHex("xor"),
  amount: "11",
  sender_codec: 1,
  sender: canonicalSccpTextWireHex("alice@taira"),
  recipient_codec: 6,
  recipient: `0x${"11".repeat(32)}`,
  route_id_codec: 1,
  route_id: canonicalSccpTextWireHex("taira_sol_xor"),
});

const b64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");
const hexBytes = (value: string): Uint8Array =>
  Uint8Array.from(Buffer.from(value.replace(/^0x/u, ""), "hex"));
const u64Le = (value: bigint): Uint8Array => {
  const bytes = new Uint8Array(8);
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
  return bytes;
};

describe("strict first-release Solana SCCP renderer bindings", () => {
  it("matches the SDK golden payload and directed-lane message id", () => {
    const payload = transfer();

    expect(Buffer.from(exactSccpPayloadBytes(payload)).toString("hex")).toBe(
      "02010000000003000000070000000000000001000000000000000103000000786f72" +
        "0b000000000000000000000000000000010b000000616c69636540746169726106" +
        "200000001111111111111111111111111111111111111111111111111111111111111111" +
        "010d00000074616972615f736f6c5f786f72",
    );
    expect(exactSccpMessageId(SCCP_TAIRA_TO_SOLANA_LANE_V1, payload)).toBe(
      "0x42e5569e97f40e74c3f122eaaf30cc96ca5c6ebd1775cb04112e240b02c89824",
    );
    expect(exactSccpPayloadHash(payload)).toBe(
      "0x464d5263b570bd7f81630e4eea743eb812cada0d635213e767e8ba44383a3f6c",
    );
  });

  it("binds addresses and hashes to the exact governed Solana route", () => {
    expect(readGovernedSolanaRoutePinsV1(governedRoute())).toMatchObject({
      revision: 1,
      destinationBindingHash:
        "0x19819920a58061f61ac26505463c291fc5f85c79b7fc49dbb573732f7af8a812",
      routeConfigurationHash:
        "0xd48b260a65d3f75f8ddb0caaaf5cbb1926caf9663638ca75183cc2339f27b66b",
      sourceEmitterIdentityHash:
        "0x47f425637f86916bd80686bc6378358b50be07ed66dbcea90028a827d1f72a7e",
      sourceIdentityHash:
        "0x4687ec8e689faae78bb8972f05f53286651dea53d9d7c1065b4adc849e5af43b",
    });
  });

  it("uses only exact route-scoped SORA material for Solana outbound settlement", () => {
    const route = governedRoute();
    const material = soraOutboundMaterial(route);
    const request = buildTairaXorSolanaOutboundBurnRecordRequest({
      manifest: route,
      soraOutboundMaterial: material,
      expectedRegistryRevision,
      tairaSender: custodyAccount,
      solanaRecipient: new PublicKey(
        Uint8Array.from({ length: 32 }, () => 0x44),
      ).toBase58(),
      amountDecimal: "1",
      nonce: "7",
    });
    expect(request.zkIvmRequest.request.metadata.gas_limit).toBe(50_000_000);
    expect(request.material.artifactSha256).toBe(
      `0x${soraOutboundExecutionPolicy().contract_artifact_sha256.toLowerCase()}`,
    );
    expect(request.material.vkRef).toMatchObject({
      version: 7,
      commitment: upperHex(0xb2, 32),
    });

    const hostileMaterials = [
      { ...material, bytecode: material.contract_artifact_b64 },
      {
        ...material,
        policy: {
          ...(material.policy as Record<string, unknown>),
          gas_limit: 2_000_000,
        },
      },
      {
        ...material,
        contract_artifact_b64: Buffer.from(
          Uint8Array.from({ length: 64 }, () => 0x55),
        ).toString("base64"),
      },
      {
        ...material,
        verifying_key_version: 8,
      },
      {
        ...material,
        verifying_key_version: 0,
      },
      {
        ...material,
        policy: {
          ...(material.policy as Record<string, unknown>),
          vk_ref: {
            ...((material.policy as Record<string, unknown>).vk_ref as Record<
              string,
              unknown
            >),
            version: 0,
          },
        },
      },
      {
        ...material,
        policy: {
          ...(material.policy as Record<string, unknown>),
          vk_ref: {
            ...((material.policy as Record<string, unknown>).vk_ref as Record<
              string,
              unknown
            >),
            version: 8,
          },
        },
      },
      {
        ...material,
        policy: {
          ...(material.policy as Record<string, unknown>),
          vk_ref: {
            ...((material.policy as Record<string, unknown>).vk_ref as Record<
              string,
              unknown
            >),
            commitment: "00".repeat(32),
          },
        },
      },
      {
        ...material,
        route_key: {
          ...(material.route_key as Record<string, unknown>),
          routeId: "taira_sol_xor",
        },
      },
    ];
    for (const hostileMaterial of hostileMaterials) {
      expect(() =>
        buildTairaXorSolanaOutboundBurnRecordRequest({
          manifest: route,
          soraOutboundMaterial: hostileMaterial,
          expectedRegistryRevision,
          tairaSender: custodyAccount,
          solanaRecipient: new PublicKey(
            Uint8Array.from({ length: 32 }, () => 0x44),
          ).toBase58(),
          amountDecimal: "1",
          nonce: "7",
        }),
      ).toThrow();
    }

    const aliasOnlyRoute = {
      routeId: "taira_sol_xor",
      assetKey: "xor",
      revision: 1,
      solanaProgramId: "legacy-alias",
      tairaXorBurnRecord: material,
    };
    expect(() =>
      buildTairaXorSolanaOutboundBurnRecordRequest({
        manifest: aliasOnlyRoute,
        soraOutboundMaterial: material,
        expectedRegistryRevision,
        tairaSender: custodyAccount,
        solanaRecipient: new PublicKey(
          Uint8Array.from({ length: 32 }, () => 0x44),
        ).toBase58(),
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/exact taira_sol_xor route id|closed first-release/u);

    expect(() =>
      buildTairaXorSolanaOutboundBurnRecordRequest({
        manifest: { ...route, legacyBurnRecord: material },
        soraOutboundMaterial: material,
        expectedRegistryRevision,
        tairaSender: custodyAccount,
        solanaRecipient: new PublicKey(
          Uint8Array.from({ length: 32 }, () => 0x44),
        ).toBase58(),
        amountDecimal: "1",
        nonce: "7",
      }),
    ).toThrow(/closed first-release|unknown or retired field/u);
  });

  it("requires an explicit current typed-registry revision for Solana outbound settlement", () => {
    const route = governedRoute();
    const material = soraOutboundMaterial(route);
    const baseInput = {
      manifest: route,
      soraOutboundMaterial: material,
      tairaSender: custodyAccount,
      solanaRecipient: new PublicKey(
        Uint8Array.from({ length: 32 }, () => 0x44),
      ).toBase58(),
      amountDecimal: "1",
      nonce: "7",
    };

    for (const invalidRevision of [
      undefined,
      "",
      "0x1234",
      `0x${"00".repeat(32)}`,
    ]) {
      expect(() =>
        buildTairaXorSolanaOutboundBurnRecordRequest({
          ...baseInput,
          expectedRegistryRevision: invalidRevision as string,
        }),
      ).toThrow(/SCCP capabilities\.registry_revision/u);
    }

    expect(() =>
      buildTairaXorSolanaOutboundBurnRecordRequest({
        ...baseInput,
        expectedRegistryRevision: `0x${"11".repeat(32)}`,
      }),
    ).toThrow(/different registry revision/u);

    expect(() =>
      buildTairaXorSolanaOutboundBurnRecordRequest({
        ...baseInput,
        soraOutboundMaterial: {
          ...material,
          registry_revision: `0x${"11".repeat(32)}`,
        },
        expectedRegistryRevision,
      }),
    ).toThrow(/different registry revision/u);
  });

  it("rejects mutation of route revision or lane semantics", () => {
    const payload = transfer();
    const revisionTwo = { ...payload, route_revision: 2 };
    expect(
      exactSccpMessageId(SCCP_TAIRA_TO_SOLANA_LANE_V1, revisionTwo),
    ).not.toBe(exactSccpMessageId(SCCP_TAIRA_TO_SOLANA_LANE_V1, payload));
    expect(exactSccpPayloadBytes(revisionTwo)).not.toEqual(
      exactSccpPayloadBytes(payload),
    );
    expect(() =>
      exactSccpMessageId(SCCP_SOLANA_TO_TAIRA_LANE_V1, payload),
    ).toThrow(/domain/i);
    expect(() =>
      exactSccpPayloadBytes({ ...payload, route_revision: 0 }),
    ).toThrow(/route_revision/i);
  });

  it("requires raw codec-6 bytes and exact canonical Solana public keys", () => {
    const base58 = "7gyGAp71YXQRoxmFBaHxofQXAipvgHyBKPyxmdSJxyvz";
    expect(canonicalSolanaPubkeyWireHex(base58, "recipient")).toBe(
      `0x${"63".repeat(32)}`,
    );
    expect(() =>
      exactSccpPayloadBytes({ ...transfer(), recipient: base58 }),
    ).toThrow(/hex/i);
    expect(() =>
      canonicalSolanaPubkeyWireHex(
        "11111111111111111111111111111111",
        "recipient",
      ),
    ).toThrow(/non-zero/i);
  });

  it("fails closed on aliases, stale schema, invalid revision, and role reuse", () => {
    const lowerCaseRole = structuredClone(governedRoute());
    const deployment = (
      lowerCaseRole.destination as { deployment: Record<string, unknown> }
    ).deployment;
    deployment.route_program_id = "ab".repeat(32);
    expect(() => readGovernedSolanaRoutePinsV1(lowerCaseRole)).toThrow(
      /uppercase/i,
    );

    const reusedRole = structuredClone(governedRoute());
    const reusedDeployment = (
      reusedRole.destination as { deployment: Record<string, unknown> }
    ).deployment;
    reusedDeployment.route_program_id = reusedDeployment.token_mint_address;
    expect(() => readGovernedSolanaRoutePinsV1(reusedRole)).toThrow(/reuses/i);

    for (const revision of [0, 2, 0xffff_ffff]) {
      const badRevision = { ...governedRoute(), revision };
      expect(() => readGovernedSolanaRoutePinsV1(badRevision)).toThrow(
        /exactly 1/i,
      );
    }

    for (const activation of ["staged", "inbound_only", "paused"] as const) {
      const inactive = structuredClone(governedRoute());
      inactive.activation = { activation, direction: null };
      expect(() => readGovernedSolanaRoutePinsV1(inactive)).toThrow(
        /exactly bidirectional/i,
      );
    }

    const missingSettlement = structuredClone(governedRoute());
    delete missingSettlement.settlement;
    expect(() => readGovernedSolanaRoutePinsV1(missingSettlement)).toThrow(
      /exact closed first-release registry route/i,
    );

    const camelCaseAlias = {
      routeId: "taira_sol_xor",
      assetKey: "xor",
      routeRevision: 1,
      destinationBindingHash: `0x${"11".repeat(32)}`,
    };
    expect(() => readGovernedSolanaRoutePinsV1(camelCaseAlias)).toThrow(
      /route id/i,
    );
  });

  it("builds and rebinds the exact [1,3] eight-account Solana source burn", () => {
    const manifest = governedRoute();
    const owner = new PublicKey(Uint8Array.from({ length: 32 }, () => 0x41));
    const sourceToken = new PublicKey(
      Uint8Array.from({ length: 32 }, () => 0x42),
    );
    const request = buildTairaXorSolanaBurnTransactionRequest({
      manifest,
      ownerAddress: owner.toBase58(),
      sourceTokenAddress: sourceToken.toBase58(),
      tairaRecipient: custodyAccount,
      amountDecimal: "0.000000011",
      nonce: "7",
    });
    const instruction = request.transaction.instructions[0];
    const recipientBytes = Buffer.from(custodyAccount, "utf8");
    const recipientLength = Buffer.alloc(2);
    recipientLength.writeUInt16LE(recipientBytes.length);
    expect(instruction.dataHex).toBe(
      `0x0103${Buffer.from(u64Le(11n)).toString("hex")}${Buffer.from(u64Le(7n)).toString("hex")}${recipientLength.toString("hex")}${recipientBytes.toString("hex")}`,
    );
    expect(instruction.accounts).toHaveLength(8);
    expect(
      instruction.accounts.map(({ isSigner, isWritable }) => [
        isSigner,
        isWritable,
      ]),
    ).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [false, true],
      [false, true],
      [false, true],
      [false, false],
      [false, false],
    ]);

    const transaction = new Transaction({
      feePayer: owner,
      recentBlockhash: new PublicKey(
        Uint8Array.from({ length: 32 }, () => 0x70),
      ).toBase58(),
    }).add(
      new TransactionInstruction({
        programId: new PublicKey(instruction.programId),
        keys: instruction.accounts.map((meta) => ({
          pubkey: new PublicKey(meta.pubkey),
          isSigner: meta.isSigner,
          isWritable: meta.isWritable,
        })),
        data: Buffer.from(instruction.dataHex.slice(2), "hex"),
      }),
    );
    const compiled = transaction.compileMessage();
    const accountKeys = compiled.accountKeys.map((key) => key.toBase58());
    const indexOf = (address: string): number => accountKeys.indexOf(address);
    const receiptHash = Uint8Array.from({ length: 32 }, () => 0xee);
    const receiptTransfer = Buffer.alloc(12);
    receiptTransfer.writeUInt32LE(2, 0);
    receiptTransfer.writeBigUInt64LE(1n, 4);
    const receiptAllocate = Buffer.alloc(12);
    receiptAllocate.writeUInt32LE(8, 0);
    receiptAllocate.writeBigUInt64LE(896n, 4);
    const receiptAssign = Buffer.alloc(36);
    receiptAssign.writeUInt32LE(1, 0);
    receiptAssign.set(new PublicKey(instruction.programId).toBytes(), 4);
    const event = [
      new TextEncoder().encode(SCCP_SOLANA_SOURCE_BURN_EVENT_MARKER),
      hexBytes(sccpLaneIdHash(SCCP_SOLANA_TO_TAIRA_LANE_V1)),
      hexBytes(request.messageId),
      hexBytes(request.payloadHash),
      hexBytes(request.sourceEventDigest),
      new PublicKey(request.sourceBurnReceiptAddress).toBytes(),
      receiptHash,
      hexBytes(request.canonicalPayloadHex),
    ];
    const signature = bs58.encode(Uint8Array.from({ length: 64 }, () => 0x77));
    const raw = {
      slot: 9,
      version: "legacy",
      transaction: {
        signatures: [signature],
        message: {
          header: compiled.header,
          accountKeys,
          recentBlockhash: compiled.recentBlockhash,
          instructions: compiled.compiledInstructions.map((value) => ({
            programIdIndex: value.programIdIndex,
            accounts: [...value.accountKeyIndexes],
            data: bs58.encode(value.data),
          })),
        },
      },
      meta: {
        err: null,
        loadedAddresses: { writable: [], readonly: [] },
        innerInstructions: [
          {
            index: 0,
            instructions: [
              {
                programIdIndex: indexOf(SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID),
                accounts: [
                  sourceToken.toBase58(),
                  instruction.accounts[3].pubkey,
                  owner.toBase58(),
                ].map(indexOf),
                data: bs58.encode(Uint8Array.from([8, ...u64Le(11n)])),
              },
              {
                programIdIndex: indexOf(SCCP_SOLANA_SYSTEM_PROGRAM_ID),
                accounts: [
                  owner.toBase58(),
                  request.sourceBurnReceiptAddress,
                ].map(indexOf),
                data: bs58.encode(receiptTransfer),
              },
              {
                programIdIndex: indexOf(SCCP_SOLANA_SYSTEM_PROGRAM_ID),
                accounts: [request.sourceBurnReceiptAddress].map(indexOf),
                data: bs58.encode(receiptAllocate),
              },
              {
                programIdIndex: indexOf(SCCP_SOLANA_SYSTEM_PROGRAM_ID),
                accounts: [request.sourceBurnReceiptAddress].map(indexOf),
                data: bs58.encode(receiptAssign),
              },
            ],
          },
        ],
        preBalances: accountKeys.map(() => 0),
        postBalances: accountKeys.map((_, index) =>
          index === indexOf(request.sourceBurnReceiptAddress) ? 1 : 0,
        ),
        preTokenBalances: [
          {
            accountIndex: indexOf(sourceToken.toBase58()),
            mint: instruction.accounts[3].pubkey,
            owner: owner.toBase58(),
            programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
            uiTokenAmount: { amount: "20", decimals: 9 },
          },
        ],
        postTokenBalances: [
          {
            accountIndex: indexOf(sourceToken.toBase58()),
            mint: instruction.accounts[3].pubkey,
            owner: owner.toBase58(),
            programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID,
            uiTokenAmount: { amount: "9", decimals: 9 },
          },
        ],
        logMessages: [`Program data: ${event.map(b64).join(" ")}`],
      },
    };
    const status = {
      slot: 9,
      confirmations: null,
      err: null,
      confirmationStatus: "finalized",
    };
    const bindingInput = {
      transaction: raw,
      signatureStatus: status,
      finality: structuredClone(status),
      txId: signature,
      sourceBridgeAddress: instruction.programId,
      sourceStateAddress: instruction.accounts[1].pubkey,
      destinationStateAddress: instruction.accounts[2].pubkey,
      tokenMintAddress: instruction.accounts[3].pubkey,
      ownerAddress: owner.toBase58(),
      tairaRecipient: custodyAccount,
      amountBaseUnits: "11",
      routeRevision: 1,
    };
    expect(
      parseFinalizedSolanaSourceBurnTransaction(bindingInput),
    ).toMatchObject({
      messageId: request.messageId,
      payloadHash: request.payloadHash,
      sourceEventDigest: request.sourceEventDigest,
      sourceBurnReceiptAddress: request.sourceBurnReceiptAddress,
      sourceReceiptHash: `0x${"ee".repeat(32)}`,
    });
    const fundedReceipt = structuredClone(bindingInput);
    fundedReceipt.transaction.meta.innerInstructions[0].instructions.splice(
      1,
      1,
    );
    fundedReceipt.transaction.meta.preBalances[
      indexOf(request.sourceBurnReceiptAddress)
    ] = 1;
    expect(
      parseFinalizedSolanaSourceBurnTransaction(fundedReceipt),
    ).toMatchObject({ nonce: "7" });
    for (const mutate of [
      (value: typeof bindingInput) => {
        value.transaction.meta.innerInstructions[0].instructions.splice(2, 1);
      },
      (value: typeof bindingInput) => {
        const instructions =
          value.transaction.meta.innerInstructions[0].instructions;
        [instructions[2], instructions[3]] = [instructions[3], instructions[2]];
      },
      (value: typeof bindingInput) => {
        const instructions =
          value.transaction.meta.innerInstructions[0].instructions;
        instructions.splice(3, 0, structuredClone(instructions[2]));
      },
      (value: typeof bindingInput) => {
        value.transaction.meta.innerInstructions[0].instructions.pop();
      },
    ]) {
      const changed = structuredClone(bindingInput);
      mutate(changed);
      expect(() => parseFinalizedSolanaSourceBurnTransaction(changed)).toThrow(
        /receipt|CPI/u,
      );
    }
    const missingVersion = structuredClone(bindingInput) as Record<
      string,
      unknown
    > & { transaction: Record<string, unknown> };
    delete missingVersion.transaction.version;
    expect(() =>
      parseFinalizedSolanaSourceBurnTransaction(missingVersion as never),
    ).toThrow(/legacy message format/u);
    for (const nonce of ["0", "18446744073709551615"]) {
      expect(normalizeSolanaSourceBurnNonce(nonce)).toBe(nonce);
      const boundary = buildTairaXorSolanaBurnTransactionRequest({
        manifest,
        ownerAddress: owner.toBase58(),
        sourceTokenAddress: sourceToken.toBase58(),
        tairaRecipient: custodyAccount,
        amountDecimal: "0.000000011",
        nonce,
      });
      expect(boundary.nonce).toBe(nonce);
      expect(
        Buffer.from(
          boundary.transaction.instructions[0].dataHex.slice(2),
          "hex",
        ).readBigUInt64LE(10),
      ).toBe(BigInt(nonce));
    }
  });
});
