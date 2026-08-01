// @vitest-environment node
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import bs58 from "bs58";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  canonicalSccpPayloadBytes,
  canonicalTairaSccpMessageBundleBytes,
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaNativeVerifierConfigHashV1,
  sccpCommitmentLeafHash,
  sccpMessageId,
  sccpPayloadHash,
  type SccpSolanaDestinationDeploymentV1,
  type SccpTransferPayloadV1,
} from "@iroha/iroha-js/sccp";
import { describe, expect, it } from "vitest";
import {
  buildSolanaDestinationProofBodyV1,
  buildSolanaDestinationTransactionPlanV1,
  bindFinalizedSolanaDestinationTransactionV1,
  prepareSolanaDestinationProverInputV1,
  validateSolanaDestinationProofResultV1,
  SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1,
  SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1,
  SCCP_SOLANA_COMPUTE_BUDGET_PROGRAM_ID_V1,
  SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1,
  type SolanaDestinationProofResultV1,
} from "@/utils/sccpSolanaDestination";
import {
  SCCP_SOLANA_TO_TAIRA_LANE_V1,
  SCCP_TAIRA_TO_SOLANA_LANE_V1,
  canonicalSccpTextWireHex,
  canonicalSolanaPubkeyWireHex,
  deriveSccpSolanaRouteStateAddressV1,
} from "@/utils/sccpSolanaCanonical";

const lowerHex = (bytes: Uint8Array): string =>
  `0x${Buffer.from(bytes).toString("hex")}`;
const upperWord = (value: bigint): string =>
  value.toString(16).padStart(64, "0").toUpperCase();
const upperBytes = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("hex").toUpperCase();
const hash = (byte: number): string =>
  `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const key = (byte: number): PublicKey =>
  new PublicKey(Uint8Array.from({ length: 32 }, () => byte));
const b64 = (bytes: Uint8Array): string =>
  Buffer.from(bytes).toString("base64");

const g1 = { x: upperWord(1n), y: upperWord(2n) };
const g2 = {
  x_c0: "1800DEEF121F1E76426A00665E5C4479674322D4F75EDADD46DEBD5CD992F6ED",
  x_c1: "198E9393920D483A7260BFB731FB5D25F1AA493335A9E71297E485B7AEF312C2",
  y_c0: "12C85EA5DB8C6DEB4AAB71808DCB408FE3D1E7690C43D37B4CE6CC0166FA7DAA",
  y_c1: "090689D0585FF075EC9E99AD690C3395BC4B313370B38EF355ACDADCD122975B",
};

const verifyingKey = () => {
  const ic: Record<string, typeof g1> = { constant: g1 };
  for (let index = 0; index < 11; index += 1) ic[`signal_${index}`] = g1;
  return {
    version: 1 as const,
    alpha1: g1,
    beta2: g2,
    gamma2: g2,
    delta2: g2,
    ic,
  };
};

const verifyingKeyBytes = (
  value: ReturnType<typeof verifyingKey>,
): Uint8Array => {
  const words: string[] = [];
  const addG1 = (point: typeof g1) => words.push(point.x, point.y);
  const addG2 = (point: typeof g2) =>
    words.push(point.x_c0, point.x_c1, point.y_c0, point.y_c1);
  addG1(value.alpha1);
  addG2(value.beta2);
  addG2(value.gamma2);
  addG2(value.delta2);
  addG1(value.ic.constant);
  for (let index = 0; index < 11; index += 1)
    addG1(value.ic[`signal_${index}`]);
  return Uint8Array.from(Buffer.from(words.join(""), "hex"));
};

const network = (name: "sora_taira" | "solana_testnet") => ({
  network: name,
  profile: null,
});

const custodyAccount = AccountAddress.fromAccount({
  publicKey: Uint8Array.from([0x58, ...Array(31).fill(0x66)]),
}).toI105(369);

const semanticProfile = () => ({
  profile: "sora_taira_finality_inclusion_groth16_bn254",
  commitments: {
    version: 1,
    circuit_commitment: "C1".repeat(32),
    witness_generator_commitment: "C2".repeat(32),
    public_signal_schema_hash:
      "7567439F41173D6745A3D51923CB70371ACC7D66F23CEFB4100D6D5D7A432CBB",
  },
});

const finalityAnchor = () => ({
  version: 1,
  source_network: network("sora_taira"),
  protocol_version: 3,
  chain_id_hash:
    "CF1CFC0F57B0BFA4C21882A9870317A1F4812F86533897095E3944BE34C5BBA7",
  checkpoint_height: 7,
  checkpoint_block_hash: "A1".repeat(32),
  checkpoint_context_id: "A2".repeat(32),
  checkpoint_finality_artifact_hash: "A3".repeat(32),
});

const soraOutboundExecutionPolicy = () => ({
  version: 1,
  semantics: "ivm_proved_record_sccp_message_v1",
  contract_artifact_sha256: "B1".repeat(32),
  vk_ref: {
    backend: "stark/fri/v1",
    name: "ivm-execution-v1",
    version: 7,
    commitment: "B2".repeat(32),
  },
  gas_limit: 50_000_000,
});

const u64Le = (value: bigint): Uint8Array => {
  const output = new Uint8Array(8);
  for (let index = 0; index < output.length; index += 1) {
    output[index] = Number((value >> BigInt(index * 8)) & 0xffn);
  }
  return output;
};

const u16Le = (value: number): Uint8Array =>
  Uint8Array.of(value & 0xff, (value >> 8) & 0xff);

const concat = (...parts: Uint8Array[]): Uint8Array => {
  const result = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
};

const policyHashes = () => {
  const semantic = semanticProfile();
  const anchor = finalityAnchor();
  const semanticBytes = concat(
    new TextEncoder().encode("sccp:semantic-proof-profile:v1"),
    Uint8Array.of(1, 0, 1),
    Uint8Array.from(
      Buffer.from(semantic.commitments.circuit_commitment, "hex"),
    ),
    Uint8Array.from(
      Buffer.from(semantic.commitments.witness_generator_commitment, "hex"),
    ),
    Uint8Array.from(
      Buffer.from(semantic.commitments.public_signal_schema_hash, "hex"),
    ),
  );
  const anchorBytes = concat(
    new TextEncoder().encode("sccp:sora-finality-anchor:v1"),
    Uint8Array.of(1, 1),
    u16Le(anchor.protocol_version),
    Uint8Array.from(Buffer.from(anchor.chain_id_hash, "hex")),
    u64Le(BigInt(anchor.checkpoint_height)),
    Uint8Array.from(Buffer.from(anchor.checkpoint_block_hash, "hex")),
    Uint8Array.from(Buffer.from(anchor.checkpoint_context_id, "hex")),
    Uint8Array.from(
      Buffer.from(anchor.checkpoint_finality_artifact_hash, "hex"),
    ),
  );
  return {
    semantic: lowerHex(keccak_256(semanticBytes)),
    anchor: lowerHex(keccak_256(anchorBytes)),
  };
};

const fixture = () => {
  const routeProgram = key(0x12);
  const mint = key(0x11);
  const routeState = new PublicKey(
    deriveSccpSolanaRouteStateAddressV1({
      routeProgramAddress: routeProgram.toBase58(),
      role: 1,
      tokenMintAddress: mint.toBase58(),
    }),
  );
  const sourceProgram = key(0x31);
  const sourceState = new PublicKey(
    deriveSccpSolanaRouteStateAddressV1({
      routeProgramAddress: sourceProgram.toBase58(),
      role: 2,
      tokenMintAddress: mint.toBase58(),
    }),
  );
  const verifierProgram = key(0x16);
  const verifierKey = verifyingKey();
  const verifierKeyHash = Uint8Array.from(
    keccak_256(verifyingKeyBytes(verifierKey)),
  );
  const provisionalDeployment: SccpSolanaDestinationDeploymentV1 = {
    token_mint_address: upperBytes(mint.toBytes()),
    route_program_id: upperBytes(routeProgram.toBytes()),
    route_program_data_address: upperBytes(key(0x13).toBytes()),
    route_program_data_slot: 17,
    route_state_account: upperBytes(routeState.toBytes()),
    route_program_code_hash: "15".repeat(32).toUpperCase(),
    native_verifier_program_id: upperBytes(verifierProgram.toBytes()),
    native_verifier_program_data_address: upperBytes(key(0x17).toBytes()),
    native_verifier_program_data_slot: 18,
    native_verifier_material_account: upperBytes(key(0x18).toBytes()),
    native_verifier_program_code_hash: "19".repeat(32).toUpperCase(),
    native_verifier_config_hash: "1A".repeat(32),
    verifying_key: verifierKey as never,
    verifier_key_hash: upperBytes(verifierKeyHash),
    outbound_proof_policy: {
      version: 1,
      semantic_profile: semanticProfile() as never,
      sora_finality_anchor: finalityAnchor() as never,
    },
    taira_to_token_multiplier: 1 as never,
  };
  const verifierConfigHash = Uint8Array.from(
    Buffer.from(
      deriveSccpSolanaNativeVerifierConfigHashV1(
        provisionalDeployment,
        upperBytes(sourceProgram.toBytes()),
        1,
      ).slice(2),
      "hex",
    ),
  );
  const material = PublicKey.findProgramAddressSync(
    [
      new TextEncoder().encode("sccp-vk-v1"),
      verifierKeyHash,
      verifierConfigHash,
    ],
    verifierProgram,
  )[0];
  const deployment: SccpSolanaDestinationDeploymentV1 = {
    ...provisionalDeployment,
    native_verifier_material_account: upperBytes(material.toBytes()),
    native_verifier_config_hash: upperBytes(verifierConfigHash),
  };
  const hashes = deriveSccpSolanaDestinationHashesV1(
    deployment,
    upperBytes(sourceProgram.toBytes()),
    1,
  );
  const manifest = {
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
          program_id: upperBytes(sourceProgram.toBytes()),
          program_data_address: upperBytes(key(0x32).toBytes()),
          program_data_slot: 19,
          state_account: upperBytes(sourceState.toBytes()),
          program_code_hash: "34".repeat(32).toUpperCase(),
          route_config_hash: hashes.route_configuration_hash
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
  const recipient = key(0x41);
  const destinationToken = key(0x42);
  const transfer: SccpTransferPayloadV1 = {
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
    recipient: canonicalSolanaPubkeyWireHex(recipient.toBase58(), "recipient"),
    route_id_codec: 1,
    route_id: canonicalSccpTextWireHex("taira_sol_xor"),
  };
  const payload = { Transfer: transfer } as const;
  const messageId = sccpMessageId(SCCP_TAIRA_TO_SOLANA_LANE_V1, payload);
  const bundle = {
    version: 1,
    commitment_root: hash(0x51),
    commitment: {
      version: 1,
      kind: "Transfer",
      context: {
        lane: SCCP_TAIRA_TO_SOLANA_LANE_V1,
        destination_binding_hash: hashes.destination_binding_hash,
        route_configuration_hash: hashes.route_configuration_hash,
      },
      message_id: messageId,
      payload_hash: "",
    },
    merkle_proof: { steps: [] },
    payload,
    finality_proof: "0x0102",
  };
  // The SDK remains the sole canonical payload codec used by the browser path.
  const canonicalPayload = canonicalSccpPayloadBytes(payload);
  bundle.commitment.payload_hash = sccpPayloadHash(canonicalPayload);
  bundle.commitment_root = sccpCommitmentLeafHash(bundle.commitment as never);
  const policy = policyHashes();
  const request = {
    version: 1,
    backend: { backend: "solana_groth16_bn254_v1", family: null },
    source_network: network("sora_taira"),
    target_network: network("solana_testnet"),
    public_inputs: {
      version: 1,
      message_id: messageId,
      payload_hash: bundle.commitment.payload_hash,
      target_domain: 3,
      commitment_root: bundle.commitment_root,
      finality_height: "9",
      finality_block_hash: hash(0x52),
    },
    verifying_key: verifierKey,
    verifier_key_hash: lowerHex(verifierKeyHash),
    semantic_proof_profile: semanticProfile(),
    semantic_proof_profile_hash: policy.semantic,
    sora_finality_anchor: finalityAnchor(),
    sora_finality_anchor_hash: policy.anchor,
    bundle_bytes: lowerHex(
      canonicalTairaSccpMessageBundleBytes(bundle as never),
    ),
    statement_hash: hash(0x61),
    destination_binding_hash: hashes.destination_binding_hash,
    route_configuration_hash: hashes.route_configuration_hash,
    request_hash: hash(0x64),
  };
  const proverInput = prepareSolanaDestinationProverInputV1({
    manifest,
    proofRequest: request,
    messageBundle: bundle,
    messageId,
    recipientAddress: recipient.toBase58(),
    destinationTokenAddress: destinationToken.toBase58(),
  });
  const proof = Uint8Array.from({ length: 384 }, (_, index) => index & 0xff);
  const proofBody = buildSolanaDestinationProofBodyV1({
    publicInputsB64: proverInput.public_inputs_b64,
    statementHashHex: proverInput.statement_hash_hex,
    proofB64: b64(proof),
    payloadB64: proverInput.payload_b64,
  });
  const result: SolanaDestinationProofResultV1 = {
    version: 1,
    route_id: "taira_sol_xor",
    revision: 1,
    message_id_hex: proverInput.message_id_hex,
    payload_amount_u64: "11",
    amount_u64_base_units: "11",
    destination_token: destinationToken.toBase58(),
    public_inputs_b64: proverInput.public_inputs_b64,
    statement_hash_hex: proverInput.statement_hash_hex,
    proof_b64: b64(proof),
    payload_b64: proverInput.payload_b64,
    proof_body_b64: b64(proofBody),
    body_sha256_hex: lowerHex(sha256(proofBody)),
  };
  return {
    manifest,
    recipient,
    destinationToken,
    proverInput,
    result,
    proofBody,
  };
};

const finalizedDestinationFixture = () => {
  const base = fixture();
  const plan = buildSolanaDestinationTransactionPlanV1({
    manifest: base.manifest,
    payerAddress: base.recipient.toBase58(),
    proverInput: base.proverInput,
    proofResult: base.result,
  });
  const finalStage = plan.transactions.at(-1)!;
  const transaction = new Transaction({
    feePayer: base.recipient,
    recentBlockhash: key(0x70).toBase58(),
  });
  for (const instruction of finalStage.instructions) {
    transaction.add(
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
  }
  const compiled = transaction.compileMessage();
  const accountKeys = compiled.accountKeys.map((value) => value.toBase58());
  const finalize = finalStage.instructions[2];
  const [
    payer,
    state,
    mint,
    destinationToken,
    material,
    proof,
    verifier,
    verifierAuthority,
    mintAuthority,
    receipt,
  ] = finalize.accounts.map(({ pubkey }) => pubkey);
  const accountIndex = (address: string): number =>
    accountKeys.indexOf(address);
  const systemTransfer = Buffer.alloc(12);
  systemTransfer.writeUInt32LE(2, 0);
  systemTransfer.writeBigUInt64LE(1n, 4);
  const systemAllocate = Buffer.alloc(12);
  systemAllocate.writeUInt32LE(8, 0);
  systemAllocate.writeBigUInt64LE(272n, 4);
  const systemAssign = Buffer.alloc(36);
  systemAssign.writeUInt32LE(1, 0);
  systemAssign.set(new PublicKey(finalize.programId).toBytes(), 4);
  const mintTo = Buffer.concat([Buffer.from([7]), Buffer.from(u64Le(11n))]);
  const verifierWire = Buffer.concat([
    Buffer.from([1, 6]),
    Buffer.from(base.result.message_id_hex.slice(2), "hex"),
    Buffer.from(u64Le(11n)),
  ]);
  const [, receiptBump] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-destination-receipt-v1"),
      new PublicKey(state).toBytes(),
      Buffer.from(base.result.message_id_hex.slice(2), "hex"),
    ],
    new PublicKey(finalize.programId),
  );
  const receiptData = Buffer.alloc(272);
  receiptData.set(Buffer.from("SCCPDS01"), 0);
  receiptData[8] = 1;
  receiptData[9] = receiptBump;
  for (const [offset, address] of [
    [16, state],
    [48, mint],
    [80, payer],
    [112, destinationToken],
    [144, material],
    [176, proof],
  ] as const) {
    receiptData.set(new PublicKey(address).toBytes(), offset);
  }
  receiptData.set(Buffer.from(base.result.message_id_hex.slice(2), "hex"), 208);
  receiptData.writeBigUInt64LE(11n, 240);
  receiptData.writeBigUInt64LE(9n, 248);
  const raw = {
    slot: 9,
    version: "legacy",
    transaction: {
      signatures: [bs58.encode(Uint8Array.from({ length: 64 }, () => 0x77))],
      message: {
        header: compiled.header,
        accountKeys,
        recentBlockhash: compiled.recentBlockhash,
        instructions: compiled.compiledInstructions.map((instruction) => ({
          programIdIndex: instruction.programIdIndex,
          accounts: [...instruction.accountKeyIndexes],
          data: bs58.encode(instruction.data),
        })),
      },
    },
    meta: {
      err: null,
      loadedAddresses: { writable: [], readonly: [] },
      innerInstructions: [
        {
          index: 2,
          instructions: [
            {
              programIdIndex: accountIndex(verifier),
              accounts: [
                payer,
                verifierAuthority,
                finalize.accounts[1].pubkey,
                mint,
                destinationToken,
                finalize.accounts[4].pubkey,
                proof,
              ].map(accountIndex),
              data: bs58.encode(verifierWire),
            },
            {
              programIdIndex: accountIndex(SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1),
              accounts: [payer, receipt].map(accountIndex),
              data: bs58.encode(systemTransfer),
            },
            {
              programIdIndex: accountIndex(SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1),
              accounts: [receipt].map(accountIndex),
              data: bs58.encode(systemAllocate),
            },
            {
              programIdIndex: accountIndex(SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1),
              accounts: [receipt].map(accountIndex),
              data: bs58.encode(systemAssign),
            },
            {
              programIdIndex: accountIndex(SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1),
              accounts: [mint, destinationToken, mintAuthority].map(
                accountIndex,
              ),
              data: bs58.encode(mintTo),
            },
          ],
        },
      ],
      preBalances: accountKeys.map(() => 0),
      postBalances: accountKeys.map((_, index) =>
        index === accountIndex(receipt) ? 1 : 0,
      ),
      preTokenBalances: [
        {
          accountIndex: accountIndex(destinationToken),
          mint,
          owner: payer,
          programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1,
          uiTokenAmount: { amount: "20", decimals: 9 },
        },
      ],
      postTokenBalances: [
        {
          accountIndex: accountIndex(destinationToken),
          mint,
          owner: payer,
          programId: SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1,
          uiTokenAmount: { amount: "31", decimals: 9 },
        },
      ],
    },
  };
  const status = {
    slot: 9,
    confirmations: null,
    err: null,
    confirmationStatus: "finalized",
  };
  const receiptAccount = {
    context: { slot: 9 },
    value: {
      data: [receiptData.toString("base64"), "base64"],
      executable: false,
      lamports: 1,
      owner: finalize.programId,
      rentEpoch: 0,
      space: 272,
    },
  };
  return {
    plan,
    transaction: raw,
    signatureStatus: status,
    finality: structuredClone(status),
    receiptAccount,
    txId: raw.transaction.signatures[0],
  };
};

describe("exact Solana SCCP destination proof admission", () => {
  it("separates payload units from SPL units and builds the frozen proof body", () => {
    const { proverInput, result, proofBody } = fixture();
    expect(proverInput).toMatchObject({
      revision: 1,
      payload_amount_u64: "11",
      amount_u64_base_units: "11",
    });
    expect(validateSolanaDestinationProofResultV1(result, proverInput)).toEqual(
      result,
    );
    expect(proofBody.length).toBe(
      141 +
        32 +
        384 +
        2 +
        Buffer.from(proverInput.payload_b64, "base64").length,
    );
    expect(Buffer.from(proofBody.subarray(141, 173)).toString("hex")).toBe(
      result.statement_hash_hex.slice(2),
    );
  });

  it("derives all PDAs and emits staged frozen verifier/bridge instructions", () => {
    const { manifest, recipient, proverInput, result, proofBody } = fixture();
    const plan = buildSolanaDestinationTransactionPlanV1({
      manifest,
      payerAddress: recipient.toBase58(),
      proverInput,
      proofResult: result,
    });
    expect(plan.transactions.map(({ phase }) => phase)).toEqual([
      "initialize-proof",
      "append-proof",
      "append-proof",
      "seal-and-finalize",
    ]);
    const initialize = plan.transactions[0].instructions[0];
    expect(initialize.dataHex.startsWith("0x0103")).toBe(true);
    expect(
      initialize.accounts.map(({ isSigner, isWritable }) => [
        isSigner,
        isWritable,
      ]),
    ).toEqual([
      [true, true],
      [false, true],
      [false, false],
      [false, false],
      [false, false],
    ]);
    const appendBytes = plan.transactions
      .filter(({ phase }) => phase === "append-proof")
      .map(({ instructions }) =>
        Buffer.from(instructions[0].dataHex.slice(2), "hex"),
      );
    expect(appendBytes.map((bytes) => bytes.readUInt16LE(2))).toEqual([0, 512]);
    expect(appendBytes.map((bytes) => bytes.readUInt16LE(4))).toEqual([
      512,
      proofBody.length - 512,
    ]);
    const finalStage = plan.transactions.at(-1)?.instructions;
    const computeLimit = finalStage?.[0];
    const finalize = finalStage?.[2];
    expect(computeLimit).toEqual({
      programId: SCCP_SOLANA_COMPUTE_BUDGET_PROGRAM_ID_V1,
      accounts: [],
      dataHex: `0x02${Buffer.from(
        Uint8Array.of(
          SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1 & 0xff,
          (SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1 >>> 8) & 0xff,
          (SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1 >>> 16) & 0xff,
          (SCCP_SOLANA_FINALIZE_COMPUTE_UNIT_LIMIT_V1 >>> 24) & 0xff,
        ),
      ).toString("hex")}`,
    });
    expect(finalize?.dataHex).toBe(
      `0x0102${result.message_id_hex.slice(2)}${Buffer.from(u64Le(11n)).toString("hex")}`,
    );
    expect(finalize?.accounts.map(({ pubkey }) => pubkey).slice(-2)).toEqual([
      SCCP_SOLANA_SPL_TOKEN_PROGRAM_ID_V1,
      SCCP_SOLANA_SYSTEM_PROGRAM_ID_V1,
    ]);
    expect(finalize?.accounts).toHaveLength(12);
  });

  it("rejects aliases, transaction injection, proof mutations, and unit ambiguity", () => {
    const { proverInput, result } = fixture();
    for (const mutation of [
      { ...result, amount_u64: result.amount_u64_base_units },
      { ...result, accounts: [] },
      { ...result, metas: [] },
      { ...result, transaction: {} },
      { ...result, payload_amount_u64: "12" },
      { ...result, amount_u64_base_units: "12" },
      { ...result, proof_b64: b64(new Uint8Array(383)) },
      { ...result, public_inputs_b64: b64(new Uint8Array(140)) },
      { ...result, payload_b64: b64(new Uint8Array(513)) },
      { ...result, proof_body_b64: b64(new Uint8Array(1)) },
      { ...result, body_sha256_hex: hash(0xfe) },
      { ...result, message_id_hex: hash(0xfd) },
      { ...result, destination_token: key(0x55).toBase58() },
      { ...result, statement_hash_hex: hash(0xfc) },
    ]) {
      expect(() =>
        validateSolanaDestinationProofResultV1(mutation, proverInput),
      ).toThrow();
    }
  });

  it("rejects multiplier overflow and legacy proof-request aliases", () => {
    const valid = fixture();
    const oversizedAmount = "18446744073709551616";
    expect(() =>
      validateSolanaDestinationProofResultV1(
        {
          ...valid.result,
          payload_amount_u64: oversizedAmount,
          amount_u64_base_units: oversizedAmount,
        },
        {
          ...valid.proverInput,
          payload_amount_u64: oversizedAmount,
          amount_u64_base_units: oversizedAmount,
        },
      ),
    ).toThrow(/64-bit/u);
    const legacyResult = { ...valid.result } as Record<string, unknown>;
    delete legacyResult.payload_amount_u64;
    legacyResult.amount_u64 = "11";
    expect(() =>
      validateSolanaDestinationProofResultV1(legacyResult, valid.proverInput),
    ).toThrow(/exactly|legacy/u);
  });

  it("binds unfunded and funded receipt shapes plus the finalized receipt account", () => {
    const finalized = finalizedDestinationFixture();
    expect(
      bindFinalizedSolanaDestinationTransactionV1(finalized),
    ).toMatchObject({
      txId: finalized.txId,
      finalizedSlot: "9",
      amountBaseUnits: "11",
      messageId: fixture().result.message_id_hex,
      receiptAddress: finalized.plan.receiptAddress,
    });
    const funded = finalizedDestinationFixture();
    const fundedInstructions =
      funded.transaction.meta.innerInstructions[0].instructions;
    fundedInstructions.splice(1, 1);
    const receiptIndex =
      funded.transaction.transaction.message.accountKeys.indexOf(
        funded.plan.receiptAddress,
      );
    funded.transaction.meta.preBalances[receiptIndex] = 1;
    expect(bindFinalizedSolanaDestinationTransactionV1(funded)).toMatchObject({
      receiptAddress: funded.plan.receiptAddress,
    });
  });

  it("rejects omitted, reordered, and extra receipt CPIs", () => {
    for (const mutate of [
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.innerInstructions[0].instructions.splice(2, 1);
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        const instructions =
          value.transaction.meta.innerInstructions[0].instructions;
        [instructions[2], instructions[3]] = [instructions[3], instructions[2]];
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        const instructions =
          value.transaction.meta.innerInstructions[0].instructions;
        instructions.splice(3, 0, structuredClone(instructions[2]));
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.innerInstructions[0].instructions.splice(3, 1);
      },
    ]) {
      const value = finalizedDestinationFixture();
      mutate(value);
      expect(() =>
        bindFinalizedSolanaDestinationTransactionV1(value),
      ).toThrow();
    }
  });

  it("fails closed when verifier, receipt state, mint, or finality evidence mutates", () => {
    for (const mutate of [
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        const instructions = value.transaction.transaction.message.instructions;
        [instructions[0], instructions[1]] = [instructions[1], instructions[0]];
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.transaction.message.instructions[0].data =
          bs58.encode(Uint8Array.of(3, 1, 0, 0, 0, 0, 0, 0, 0));
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.transaction.message.instructions.splice(
          1,
          0,
          structuredClone(
            value.transaction.transaction.message.instructions[0],
          ),
        );
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.innerInstructions[0].instructions.shift();
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.innerInstructions[0].instructions.push(
          structuredClone(
            value.transaction.meta.innerInstructions[0].instructions[0],
          ),
        );
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.innerInstructions[0].instructions[1].data =
          bs58.encode(new Uint8Array(12));
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.transaction.meta.postTokenBalances[0].uiTokenAmount.amount = "30";
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.receiptAccount.value.owner = key(0xfe).toBase58();
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        const data = Buffer.from(value.receiptAccount.value.data[0], "base64");
        data[0] ^= 1;
        value.receiptAccount.value.data[0] = data.toString("base64");
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.receiptAccount.context.slot = 8;
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.receiptAccount.value.lamports = 2;
      },
      (value: ReturnType<typeof finalizedDestinationFixture>) => {
        value.finality.confirmationStatus = "confirmed";
      },
    ]) {
      const value = finalizedDestinationFixture();
      mutate(value);
      expect(() =>
        bindFinalizedSolanaDestinationTransactionV1(value),
      ).toThrow();
    }
  });
});
