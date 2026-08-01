// @vitest-environment node
/* global BigInt */
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountAddress } from "@iroha/iroha-js/address";
import { blake2b } from "@noble/hashes/blake2b";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaNativeVerifierConfigHashV1,
} from "@iroha/iroha-js/sccp";
import {
  SOLANA_SCCP_GOVERNANCE_DRAFT_PATH,
  SOLANA_SCCP_REGISTRY_PATH,
  buildSolanaRouteActivationDraft,
  buildSolanaRouteGovernancePlan,
  buildSolanaRouteRegistrationDraft,
  canonicalSccpObjectSha256,
  canonicalSccpRegistrySha256,
  inspectExactSolanaRegistryState,
  selectExactSolanaRegistryRoute,
  summarizeExactSolanaRegistryRoute,
  validateExactSolanaSccpCapabilities,
  validateSolanaRouteGovernancePlan,
} from "../scripts/e2e/sccp-solana-exact-registry.mjs";
import {
  evaluateTairaSccpGovernancePhase,
  parseTairaSccpGovernanceArgs,
  runTairaSccpGovernance,
  validateSccpGovernanceDraftResponse,
  validateTairaSccpGovernanceIntent,
  validateTairaSccpGovernanceEndpoint,
} from "../scripts/taira-sccp-route-governance.mjs";
import {
  buildPinnedSolanaGovernancePlan,
  parseSolanaGovernancePlanArgs,
} from "../scripts/sccp-solana-governance-plan.mjs";
import {
  buildSolanaGovernanceEvidenceChecks,
  validateSolanaGovernanceSubmissionEvidence,
} from "../scripts/e2e/sccp-solana-governance-evidence.mjs";
import {
  SOLANA_ORDERED_INITIALIZATION_SCHEMA,
  SOLANA_TESTNET_RPC_URL,
  validateSolanaOrderedInitializationEvidence,
  verifySolanaOrderedInitializationTransactions,
} from "../scripts/e2e/sccp-solana-ordered-initialization.mjs";
import {
  SOLANA_SPL_TOKEN_PROGRAM_ID,
  deriveExactSccpSolanaMaterialConfigHash,
} from "../scripts/e2e/sccp-solana-route-preflight.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.SCCP_TEST_GOVERNANCE_PRIVATE_KEY;
});

const upper = (byte, length = 32) =>
  byte.toString(16).padStart(2, "0").repeat(length).toUpperCase();
const prefixed = (byte) => `0x${upper(byte).toLowerCase()}`;
const orderedProgramExecutable = (marker) => {
  const bytes = Buffer.alloc(64);
  Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0]).copy(bytes);
  bytes.writeUInt32LE(3, 48);
  bytes[63] = marker;
  return bytes;
};
const orderedProgramCodeHashRaw = (marker) =>
  Buffer.from(blake2b(orderedProgramExecutable(marker), { dkLen: 32 }))
    .toString("hex")
    .toUpperCase();
const orderedProgramArtifactSha256 = (marker) =>
  `0x${createHash("sha256")
    .update(orderedProgramExecutable(marker))
    .digest("hex")}`;
const loaderProgramdataHex = (programHex) =>
  Buffer.from(
    PublicKey.findProgramAddressSync(
      [Buffer.from(programHex, "hex")],
      new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111"),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();
const network = (name) => ({ network: name, profile: null });
const lane = () => ({
  source: network("solana_testnet"),
  target: network("sora_taira"),
});
const scalarWord = (value) =>
  value.toString(16).padStart(64, "0").toUpperCase();
const g1 = () => ({ x: scalarWord(1), y: scalarWord(2) });
const g2 = () => ({
  x_c0: "1800DEEF121F1E76426A00665E5C4479674322D4F75EDADD46DEBD5CD992F6ED",
  x_c1: "198E9393920D483A7260BFB731FB5D25F1AA493335A9E71297E485B7AEF312C2",
  y_c0: "12C85EA5DB8C6DEB4AAB71808DCB408FE3D1E7690C43D37B4CE6CC0166FA7DAA",
  y_c1: "090689D0585FF075EC9E99AD690C3395BC4B313370B38EF355ACDADCD122975B",
});
const verifyingKey = () => ({
  version: 1,
  alpha1: g1(),
  beta2: g2(),
  gamma2: g2(),
  delta2: g2(),
  ic: Object.fromEntries([
    ["constant", g1()],
    ...Array.from({ length: 11 }, (_, index) => [`signal_${index}`, g1()]),
  ]),
});
const verifyingKeyBytes = () => {
  const key = verifyingKey();
  const words = [];
  const addG1 = (point) => words.push(point.x, point.y);
  const addG2 = (point) =>
    words.push(point.x_c0, point.x_c1, point.y_c0, point.y_c1);
  addG1(key.alpha1);
  addG2(key.beta2);
  addG2(key.gamma2);
  addG2(key.delta2);
  addG1(key.ic.constant);
  for (let index = 0; index < 11; index += 1) {
    addG1(key.ic[`signal_${index}`]);
  }
  return Buffer.from(words.join(""), "hex");
};
const authority = AccountAddress.fromAccount({
  publicKey: Uint8Array.from([0x58, ...Array(31).fill(0x66)]),
}).toI105(369);
const alternateAuthority = AccountAddress.fromAccount({
  publicKey: Uint8Array.from(
    Buffer.from(
      "79b5562e8fe654f94078b112e8a98ba7901f853ae695bed7e0e3910bad049664",
      "hex",
    ),
  ),
}).toI105(369);

const outboundPolicy = () => ({
  version: 1,
  semantic_profile: {
    profile: "sora_taira_finality_inclusion_groth16_bn254",
    commitments: {
      version: 1,
      circuit_commitment: upper(0xc1),
      witness_generator_commitment: upper(0xc2),
      public_signal_schema_hash:
        "7567439F41173D6745A3D51923CB70371ACC7D66F23CEFB4100D6D5D7A432CBB",
    },
  },
  sora_finality_anchor: {
    version: 1,
    source_network: network("sora_taira"),
    protocol_version: 3,
    chain_id_hash:
      "CF1CFC0F57B0BFA4C21882A9870317A1F4812F86533897095E3944BE34C5BBA7",
    checkpoint_height: 7,
    checkpoint_block_hash: upper(0xa1),
    checkpoint_context_id: upper(0xa2),
    checkpoint_finality_artifact_hash: upper(0xa3),
  },
});

const soraOutboundExecutionPolicy = () => ({
  version: 1,
  semantics: "ivm_proved_record_sccp_message_v1",
  contract_artifact_sha256: upper(0xb1),
  vk_ref: {
    backend: "stark/fri/v1",
    name: "ivm-execution-v1",
    version: 1,
    commitment: upper(0xb2),
  },
  gas_limit: 50_000_000,
});

const deployment = () => {
  const value = {
    token_mint_address: upper(0x11),
    route_program_id: upper(0x12),
    route_program_data_address: loaderProgramdataHex(upper(0x12)),
    route_program_data_slot: 17,
    route_state_account: upper(0x14),
    route_program_code_hash: orderedProgramCodeHashRaw(1),
    native_verifier_program_id: upper(0x16),
    native_verifier_program_data_address: loaderProgramdataHex(upper(0x16)),
    native_verifier_program_data_slot: 18,
    native_verifier_material_account: upper(0x18),
    native_verifier_program_code_hash: orderedProgramCodeHashRaw(3),
    native_verifier_config_hash: upper(0x1a),
    verifying_key: verifyingKey(),
    verifier_key_hash:
      "6923E63427820AB42CC16C3C2BC0EB4097577919BB3911EA50CBB4F20CEBFDDB",
    outbound_proof_policy: outboundPolicy(),
    taira_to_token_multiplier: 1,
  };
  value.route_state_account = Buffer.from(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-route-state-v1", "utf8"),
        Buffer.from([1]),
        Buffer.from(value.token_mint_address, "hex"),
      ],
      new PublicKey(Buffer.from(value.route_program_id, "hex")),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();
  const configHash = deriveSccpSolanaNativeVerifierConfigHashV1(
    value,
    upper(0x31),
    1,
  );
  value.native_verifier_config_hash = configHash.slice(2).toUpperCase();
  value.native_verifier_material_account = Buffer.from(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-vk-v1", "utf8"),
        Buffer.from(value.verifier_key_hash, "hex"),
        Buffer.from(value.native_verifier_config_hash, "hex"),
      ],
      new PublicKey(Buffer.from(value.native_verifier_program_id, "hex")),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();
  return value;
};

const governedRoute = ({ activation = "bidirectional" } = {}) => {
  const exactDeployment = deployment();
  const hashes = deriveSccpSolanaDestinationHashesV1(
    exactDeployment,
    upper(0x31),
    1,
  );
  const sourceState = Buffer.from(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-route-state-v1", "utf8"),
        Buffer.from([2]),
        Buffer.from(exactDeployment.token_mint_address, "hex"),
      ],
      new PublicKey(Buffer.from(upper(0x31), "hex")),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();
  return {
    lane_id: lane(),
    route_id: "taira_sol_xor",
    asset_key: "xor",
    revision: 1,
    activation: { activation, direction: null },
    inbound_finality_cutoff: null,
    source_identity: {
      lane: lane(),
      emitter: {
        emitter: "solana",
        identity: {
          program_id: upper(0x31),
          program_data_address: loaderProgramdataHex(upper(0x31)),
          program_data_slot: 19,
          state_account: sourceState,
          program_code_hash: orderedProgramCodeHashRaw(2),
          route_config_hash: hashes.route_configuration_hash
            .slice(2)
            .toUpperCase(),
        },
      },
    },
    destination: { family: "solana", deployment: exactDeployment },
    sora_outbound_execution_policy: soraOutboundExecutionPolicy(),
    settlement: {
      asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      custody_account_id: authority,
      payload_amount_scale: 9,
    },
  };
};

const trustAnchor = () => ({
  backend: { backend: "solana_agave_v1", protocol: null },
  anchor_hash: upper(0x91),
  checkpoint_height: 1,
});

const registry = (route = governedRoute()) => ({
  version: 1,
  lanes: [
    {
      lane_id: lane(),
      native_trust_anchors: [trustAnchor()],
      current_native_trust_anchor_hash: trustAnchor().anchor_hash,
      routes: [route],
    },
  ],
});

const capabilities = () => ({
  version: 1,
  registry_revision: prefixed(0x41),
  registry_path: "/v1/sccp/registry",
  message_bundle_path: "/v1/sccp/proofs/message/{message_id}",
  proof_request_path: "/v1/sccp/proof-requests/{message_id}",
  recent_messages_path: "/v1/sccp/messages/recent",
  sora_outbound_material_path:
    "/v1/sccp/routes/{source_profile}/{route_id}/{asset_key}/{revision}/sora-outbound-material",
  registry_limits: {
    max_governed_lanes: 16,
    max_live_governed_routes: 64,
    max_live_routes_per_lane: 8,
    max_retained_routes_per_lane: 64,
    max_retained_native_trust_anchors_per_lane: 4096,
  },
  resource_limits: {
    max_outbound_messages_per_block: 512,
    max_outbound_message_payload_bytes: 4096,
    max_pending_outbound_messages: 65_536,
    max_pending_outbound_payload_bytes: 256 * 1024 * 1024,
    max_proofs_per_transaction: 1,
    max_proofs_per_block: 4,
    max_proof_bytes_per_proof: 8 * 1024 * 1024,
    max_proof_bytes_per_transaction: 8 * 1024 * 1024,
    max_proof_bytes_per_block: 32 * 1024 * 1024,
    max_native_headers_per_transaction: 1004,
    max_native_headers_per_block: 4016,
    max_ethereum_light_client_updates_per_transaction: 128,
    max_ethereum_light_client_updates_per_block: 512,
    max_native_header_bytes_per_transaction: 8 * 1024 * 1024,
    max_native_header_bytes_per_block: 32 * 1024 * 1024,
    max_secp256k1_recoveries_per_transaction: 1005,
    max_secp256k1_recoveries_per_block: 4020,
    max_bls_aggregate_checks_per_transaction: 1004,
    max_bls_aggregate_checks_per_block: 4016,
    max_bls_signer_contributions_per_transaction: 131_713,
    max_bls_signer_contributions_per_block: 526_852,
    max_bn254_pairing_checks_per_transaction: 1,
    max_bn254_pairing_checks_per_block: 4,
  },
  proof_submit_path: "/v1/bridge/proofs/submit",
  native_message_submit_path: "/v1/bridge/messages",
});

const ORDERED_INITIALIZATION_ARTIFACT_SHA256 = prefixed(0xa3);
const FRESH_DEPLOY_REPORT_SHA256 = `0x${"ab".repeat(32)}`;
const PROGRAM_ARTIFACT_SHA256 = Object.freeze({
  destination: orderedProgramArtifactSha256(1),
  source: orderedProgramArtifactSha256(2),
  native_verifier: orderedProgramArtifactSha256(3),
});

const transactionSignature = (byte) =>
  bs58.encode(Uint8Array.from({ length: 64 }, () => byte));

const orderedInitializationEvidence = () => {
  const summary = summarizeExactSolanaRegistryRoute(registry(), {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  });
  const transaction = (
    programAddress,
    accountAddress,
    byte,
    finalizedSlot,
  ) => ({
    program_address: programAddress,
    account_address: accountAddress,
    transaction_signature: transactionSignature(byte),
    finalized_slot: finalizedSlot,
  });
  return {
    schema: SOLANA_ORDERED_INITIALIZATION_SCHEMA,
    route_id: "taira_sol_xor",
    asset_key: "xor",
    revision: 1,
    solana_rpc_url: SOLANA_TESTNET_RPC_URL,
    fresh_deploy_report_sha256: FRESH_DEPLOY_REPORT_SHA256,
    program_finalizations: {
      destination: {
        program_address: summary.programs.destination,
        programdata_address: summary.accounts.destinationProgramData,
        artifact_sha256: PROGRAM_ARTIFACT_SHA256.destination,
        program_code_hash: summary.codeHashes.destination,
        programdata_deployment_slot: 17,
        transaction_signature: transactionSignature(0x41),
        finalized_slot: 22,
      },
      source: {
        program_address: summary.programs.source,
        programdata_address: summary.accounts.sourceProgramData,
        artifact_sha256: PROGRAM_ARTIFACT_SHA256.source,
        program_code_hash: summary.codeHashes.source,
        programdata_deployment_slot: 19,
        transaction_signature: transactionSignature(0x41),
        finalized_slot: 22,
      },
      native_verifier: {
        program_address: summary.programs.nativeVerifier,
        programdata_address: summary.accounts.nativeVerifierProgramData,
        artifact_sha256: PROGRAM_ARTIFACT_SHA256.native_verifier,
        program_code_hash: summary.codeHashes.nativeVerifier,
        programdata_deployment_slot: 18,
        transaction_signature: transactionSignature(0x41),
        finalized_slot: 22,
      },
    },
    initialization_transactions: {
      token_mint_create: transaction(
        "11111111111111111111111111111111",
        summary.accounts.tokenMint,
        0x51,
        30,
      ),
      token_mint_initialize: transaction(
        SOLANA_SPL_TOKEN_PROGRAM_ID,
        summary.accounts.tokenMint,
        0x51,
        30,
      ),
      native_verifier_material_initialize: transaction(
        summary.programs.nativeVerifier,
        summary.accounts.nativeVerifierMaterial,
        0x51,
        30,
      ),
      native_verifier_material_appends: [
        transaction(
          summary.programs.nativeVerifier,
          summary.accounts.nativeVerifierMaterial,
          0x57,
          31,
        ),
        transaction(
          summary.programs.nativeVerifier,
          summary.accounts.nativeVerifierMaterial,
          0x58,
          32,
        ),
        transaction(
          summary.programs.nativeVerifier,
          summary.accounts.nativeVerifierMaterial,
          0x59,
          33,
        ),
      ],
      native_verifier_material_seal: transaction(
        summary.programs.nativeVerifier,
        summary.accounts.nativeVerifierMaterial,
        0x5a,
        34,
      ),
      destination_route_initialize: transaction(
        summary.programs.destination,
        summary.accounts.destinationState,
        0x5b,
        35,
      ),
      source_route_initialize: transaction(
        summary.programs.source,
        summary.accounts.sourceState,
        0x5c,
        36,
      ),
    },
    captured_at: "2026-07-14T00:00:00.000Z",
  };
};

const orderedHashBytes = (value) => Buffer.from(value.slice(2), "hex");
const orderedInstruction = (programId, accounts, data) => ({
  programId,
  accounts,
  data: bs58.encode(data),
});
const ORDERED_TEST_AUTHORITY = new PublicKey(
  Uint8Array.from({ length: 32 }, () => 0x77),
).toBase58();

const orderedRpcFixtures = (evidence = orderedInitializationEvidence()) => {
  const summary = summarizeExactSolanaRegistryRoute(registry(), {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  });
  const transactions = new Map();
  const addTransaction = (entry, instructions) => {
    const existing = transactions.get(entry.transaction_signature);
    if (existing) {
      if (existing.slot !== entry.finalized_slot) {
        throw new Error("Ordered RPC fixture signature has conflicting slots.");
      }
      existing.instructions.push(...instructions);
      return;
    }
    transactions.set(entry.transaction_signature, {
      slot: entry.finalized_slot,
      instructions: [...instructions],
    });
  };
  for (const entry of Object.values(evidence.program_finalizations)) {
    addTransaction(entry, [
      orderedInstruction(
        "BPFLoaderUpgradeab1e11111111111111111111111",
        [entry.programdata_address, ORDERED_TEST_AUTHORITY],
        Buffer.from([4, 0, 0, 0]),
      ),
    ]);
  }

  const mintAuthority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-mint-authority-v1", "utf8"),
      new PublicKey(summary.accounts.destinationState).toBuffer(),
    ],
    new PublicKey(summary.programs.destination),
  )[0].toBase58();
  const bridgeAuthority = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-verify-authority-v1", "utf8"),
      new PublicKey(summary.accounts.destinationState).toBuffer(),
    ],
    new PublicKey(summary.programs.destination),
  )[0].toBase58();
  const mintCreate = Buffer.alloc(52);
  mintCreate.writeUInt32LE(0, 0);
  mintCreate.writeBigUInt64LE(1_000_000n, 4);
  mintCreate.writeBigUInt64LE(82n, 12);
  new PublicKey(SOLANA_SPL_TOKEN_PROGRAM_ID).toBuffer().copy(mintCreate, 20);
  const mintInitialize = Buffer.concat([
    Buffer.from([20, 9]),
    new PublicKey(mintAuthority).toBuffer(),
    Buffer.from([0]),
  ]);
  const keyBytes = verifyingKeyBytes();
  const keySha256 = createHash("sha256").update(keyBytes).digest();
  const materialRevision = Buffer.alloc(4);
  materialRevision.writeUInt32LE(1);
  const materialInitialize = Buffer.concat([
    Buffer.from([1, 0]),
    keySha256,
    orderedHashBytes(summary.verifierKeyHash),
    orderedHashBytes(summary.nativeVerifierConfigHash),
    materialRevision,
    Buffer.from([3]),
    Buffer.from("xor", "utf8"),
    ...[
      summary.destinationBindingHash,
      summary.routeConfigurationHash,
      summary.proofPolicy.soraFinalityAnchorHash,
      summary.proofPolicy.semanticProfileHash,
      summary.proofPolicy.circuitCommitment,
      summary.proofPolicy.witnessGeneratorCommitment,
      summary.proofPolicy.publicSignalSchemaHash,
    ].map(orderedHashBytes),
  ]);
  const bootstrap = evidence.initialization_transactions.token_mint_create;
  addTransaction(bootstrap, [
    orderedInstruction(
      "11111111111111111111111111111111",
      [ORDERED_TEST_AUTHORITY, summary.accounts.tokenMint],
      mintCreate,
    ),
    orderedInstruction(
      SOLANA_SPL_TOKEN_PROGRAM_ID,
      [summary.accounts.tokenMint],
      mintInitialize,
    ),
    orderedInstruction(
      summary.programs.nativeVerifier,
      [
        ORDERED_TEST_AUTHORITY,
        summary.accounts.nativeVerifierMaterial,
        summary.programs.nativeVerifier,
        summary.accounts.nativeVerifierProgramData,
        summary.programs.destination,
        summary.accounts.destinationProgramData,
        summary.programs.source,
        summary.accounts.sourceProgramData,
        summary.accounts.destinationState,
        bridgeAuthority,
        summary.accounts.tokenMint,
        SOLANA_SPL_TOKEN_PROGRAM_ID,
        "11111111111111111111111111111111",
      ],
      materialInitialize,
    ),
  ]);

  let offset = 0;
  for (const entry of evidence.initialization_transactions
    .native_verifier_material_appends) {
    const length = Math.min(512, keyBytes.length - offset);
    const header = Buffer.alloc(6);
    header[0] = 1;
    header[1] = 1;
    header.writeUInt16LE(offset, 2);
    header.writeUInt16LE(length, 4);
    addTransaction(entry, [
      orderedInstruction(
        summary.programs.nativeVerifier,
        [ORDERED_TEST_AUTHORITY, summary.accounts.nativeVerifierMaterial],
        Buffer.concat([header, keyBytes.subarray(offset, offset + length)]),
      ),
    ]);
    offset += length;
  }
  addTransaction(
    evidence.initialization_transactions.native_verifier_material_seal,
    [
      orderedInstruction(
        summary.programs.nativeVerifier,
        [ORDERED_TEST_AUTHORITY, summary.accounts.nativeVerifierMaterial],
        Buffer.from([1, 2]),
      ),
    ],
  );

  const routeInitialize = (role) => {
    const destination = role === 1;
    const program = destination
      ? summary.programs.destination
      : summary.programs.source;
    const state = destination
      ? summary.accounts.destinationState
      : summary.accounts.sourceState;
    const peer = destination
      ? summary.programs.source
      : summary.programs.destination;
    const revisionBytes = Buffer.alloc(4);
    revisionBytes.writeUInt32LE(1);
    return orderedInstruction(
      program,
      [
        ORDERED_TEST_AUTHORITY,
        state,
        summary.accounts.tokenMint,
        peer,
        summary.programs.nativeVerifier,
        summary.accounts.nativeVerifierMaterial,
        SOLANA_SPL_TOKEN_PROGRAM_ID,
        "11111111111111111111111111111111",
      ],
      Buffer.concat([
        Buffer.from([1, 1, role]),
        revisionBytes,
        new PublicKey(summary.accounts.destinationState).toBuffer(),
        orderedHashBytes(summary.destinationBindingHash),
        orderedHashBytes(summary.routeConfigurationHash),
        orderedHashBytes(summary.verifierKeyHash),
        orderedHashBytes(summary.nativeVerifierConfigHash),
      ]),
    );
  };
  addTransaction(
    evidence.initialization_transactions.destination_route_initialize,
    [routeInitialize(1)],
  );
  addTransaction(evidence.initialization_transactions.source_route_initialize, [
    routeInitialize(2),
  ]);

  const rpcTransaction = (signature, fixture) => {
    const accountKeys = Array.from(
      new Set(
        fixture.instructions.flatMap((instruction) => [
          instruction.programId,
          ...instruction.accounts,
        ]),
      ),
    ).map((pubkey) => ({
      pubkey,
      signer:
        pubkey === ORDERED_TEST_AUTHORITY ||
        pubkey === summary.accounts.tokenMint,
      writable: ![
        "BPFLoaderUpgradeab1e11111111111111111111111",
        SOLANA_SPL_TOKEN_PROGRAM_ID,
        "11111111111111111111111111111111",
        summary.programs.destination,
        summary.programs.source,
        summary.programs.nativeVerifier,
      ].includes(pubkey),
    }));
    return {
      slot: fixture.slot,
      meta: { err: null, innerInstructions: [] },
      transaction: {
        signatures: [signature],
        message: { accountKeys, instructions: fixture.instructions },
      },
    };
  };
  const programdataAccount = (slotValue, marker) => {
    const executable = orderedProgramExecutable(marker);
    const data = Buffer.alloc(45 + executable.length);
    data.writeUInt32LE(3, 0);
    data.writeBigUInt64LE(BigInt(slotValue), 4);
    data[12] = 0;
    executable.copy(data, 45);
    return {
      data: [data.toString("base64"), "base64"],
      executable: false,
      owner: "BPFLoaderUpgradeab1e11111111111111111111111",
    };
  };
  const programdataReadback = {
    context: {
      slot: evidence.initialization_transactions.source_route_initialize
        .finalized_slot,
    },
    value: [
      programdataAccount(summary.programDataSlots.destination, 1),
      programdataAccount(summary.programDataSlots.source, 2),
      programdataAccount(summary.programDataSlots.nativeVerifier, 3),
    ],
  };
  return {
    evidence,
    summary,
    transactions,
    programdataReadback,
    rpcTransaction,
  };
};

const orderedRpcVerificationClaim = (evidence, summary) => {
  const groups = new Map();
  const add = (role, entry) => {
    const existing = groups.get(entry.transaction_signature);
    if (existing) {
      existing.roles.push(role);
      return;
    }
    groups.set(entry.transaction_signature, {
      roles: [role],
      signature: entry.transaction_signature,
      finalizedSlot: entry.finalized_slot,
    });
  };
  for (const [role, entry] of Object.entries(evidence.program_finalizations)) {
    add(`program_finalizations.${role}`, entry);
  }
  for (const [role, value] of Object.entries(
    evidence.initialization_transactions,
  )) {
    for (const [index, entry] of (Array.isArray(value)
      ? value
      : [value]
    ).entries()) {
      add(Array.isArray(value) ? `${role}[${index}]` : role, entry);
    }
  }
  return {
    ready: true,
    transactions: [...groups.values()],
    programdataReadback: {
      destination: {
        role: "destination",
        programdataSlot: summary.programDataSlots.destination,
        upgradeAuthority: null,
        artifactSha256: PROGRAM_ARTIFACT_SHA256.destination,
        executableCodeHash: summary.codeHashes.destination,
        executableLength: orderedProgramExecutable(1).length,
        sbpfVersion: "V3",
      },
      source: {
        role: "source",
        programdataSlot: summary.programDataSlots.source,
        upgradeAuthority: null,
        artifactSha256: PROGRAM_ARTIFACT_SHA256.source,
        executableCodeHash: summary.codeHashes.source,
        executableLength: orderedProgramExecutable(2).length,
        sbpfVersion: "V3",
      },
      native_verifier: {
        role: "native_verifier",
        programdataSlot: summary.programDataSlots.nativeVerifier,
        upgradeAuthority: null,
        artifactSha256: PROGRAM_ARTIFACT_SHA256.native_verifier,
        executableCodeHash: summary.codeHashes.nativeVerifier,
        executableLength: orderedProgramExecutable(3).length,
        sbpfVersion: "V3",
      },
    },
    verifyingKey: {
      length: verifyingKeyBytes().length,
      sha256: `0x${createHash("sha256")
        .update(verifyingKeyBytes())
        .digest("hex")}`,
      keccak256: summary.verifierKeyHash,
    },
  };
};

const governanceResult = ({
  phase,
  planSha256,
  toriiUrl,
  orderedInitializationEvidenceSha256 = ORDERED_INITIALIZATION_ARTIFACT_SHA256,
}) => {
  const proposalId = (phase === "register" ? "51" : "52").repeat(32);
  const transactionHash = (phase === "register" ? "61" : "62").repeat(32);
  return {
    schema: "iroha-sccp-route-governance-submission/v1",
    checked_at: "2026-07-14T00:00:00.000Z",
    phase,
    plan_sha256: planSha256,
    fresh_deploy_report_sha256: FRESH_DEPLOY_REPORT_SHA256,
    ordered_initialization_evidence_sha256: orderedInitializationEvidenceSha256,
    torii_url: toriiUrl,
    authority,
    submitted: true,
    already_enacted: false,
    proposal_id: proposalId,
    transaction_hash: transactionHash,
    instruction_wire_id:
      "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
    instruction_payload_sha256: prefixed(phase === "register" ? 0x71 : 0x72),
    status: {
      kind: "Transaction",
      content: {
        hash: transactionHash,
        authority,
        status: { kind: "Applied", content: { block_height: 40 } },
      },
    },
    next_required_action:
      "Parliament must enact this proposal; verify typed registry readback before the next phase.",
  };
};

const governanceReadbackFetch = (evidence, mutate = (entry) => entry) => {
  const phaseFor = (url) => {
    for (const phase of ["register", "activate"]) {
      const receipt =
        phase === "register" ? evidence.registration : evidence.activation;
      if (
        url.pathname.includes(receipt.transaction_hash) ||
        url.pathname.includes(receipt.proposal_id) ||
        url.searchParams.get("hash") === receipt.transaction_hash
      ) {
        return phase;
      }
    }
    return null;
  };
  return vi.fn(async (input, options = {}) => {
    const url = new URL(input);
    const method = options.method ?? "GET";
    const phase = phaseFor(url);
    const receipt =
      phase === "register" ? evidence.registration : evidence.activation;
    const proposal =
      phase === "register"
        ? evidence.plan.registration
        : evidence.plan.activation;
    const encoded =
      phase === "register"
        ? Buffer.from("a1b2c3", "hex")
        : Buffer.from("d4e5f6", "hex");
    let endpoint;
    let payload;
    if (url.pathname === SOLANA_SCCP_REGISTRY_PATH) {
      endpoint = "registry";
      payload = registry();
    } else if (url.pathname === "/v1/explorer/metrics") {
      endpoint = "metrics";
      payload = { finalized_block: 50 };
    } else if (url.pathname === "/v1/pipeline/transactions/status") {
      endpoint = "pipeline";
      payload = {
        kind: "Transaction",
        content: {
          hash: receipt.transaction_hash,
          authority: receipt.authority,
          status: { kind: "Applied", content: { block_height: 40 } },
        },
      };
    } else if (url.pathname.startsWith("/v1/explorer/transactions/")) {
      endpoint = "transaction";
      payload = {
        authority: receipt.authority,
        hash: receipt.transaction_hash,
        block: 40,
        created_at: "2026-07-14T00:00:00Z",
        executable: "Instructions",
        status: "Committed",
        rejection_reason: null,
        executable_payload: { instruction_count: 1 },
        metadata: {
          action: "propose_sccp_route_governance",
          route_id: evidence.plan.route_id,
          asset_key: evidence.plan.asset_key,
          route_revision: evidence.plan.revision,
          governance_phase: phase,
          governance_proposal_id: receipt.proposal_id,
          reviewed_plan_sha256: evidence.plan.plan_sha256,
          fresh_deploy_report_sha256: evidence.plan.fresh_deploy_report_sha256,
          ordered_initialization_evidence_sha256:
            evidence.plan.ordered_initialization_evidence_sha256,
        },
      };
    } else if (url.pathname.startsWith("/v1/explorer/instructions/")) {
      endpoint = "instruction";
      payload = {
        authority: receipt.authority,
        created_at: "2026-07-14T00:00:00Z",
        kind: "ProposeSccpRouteGovernance",
        box: {
          encoded: `0x${encoded.toString("hex")}`,
          framed_sha256: receipt.instruction_payload_sha256,
          json: {
            kind: "Custom",
            payload: {
              variant: "ProposeSccpRouteGovernance",
              value: structuredClone(proposal),
            },
            wire_id:
              "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
            encoded: encoded.toString("hex"),
          },
        },
        transaction_hash: receipt.transaction_hash,
        transaction_status: "Committed",
        block: 40,
        index: 0,
      };
    } else if (url.pathname.startsWith("/v1/gov/proposals/")) {
      endpoint = "proposal";
      payload = {
        found: true,
        proposal: {
          proposer: receipt.authority,
          kind: {
            SccpRouteGovernance: { action: structuredClone(proposal.action) },
          },
          created_height: 40,
          status: "Enacted",
        },
      };
    } else {
      throw new Error(`Unexpected governance readback URL ${url}`);
    }
    const changed = mutate({
      phase,
      endpoint,
      payload: structuredClone(payload),
      url,
      method,
    });
    if (changed?.error) throw changed.error;
    const responseBody =
      typeof changed?.rawText === "string"
        ? changed.rawText
        : JSON.stringify(changed?.payload ?? changed);
    return new Response(responseBody, {
      status: changed?.status ?? 200,
      headers: {
        "content-type": changed?.contentType ?? "application/json",
      },
    });
  });
};

const governancePreflight = () => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v2",
  protocolSource: "typed-sccp-registry-v1",
  manifestSource: "public-registry",
  taira: { toriiUrl: "https://taira-validator-1.sora.org" },
  registryState: {
    lanePresent: true,
    routePresent: true,
    activation: "bidirectional",
    currentNativeTrustAnchorHash: trustAnchor().anchor_hash,
  },
  registrySummary: summarizeExactSolanaRegistryRoute(registry(), {
    requireBidirectional: true,
    requireCurrentTrustAnchor: true,
  }),
});

describe("exact Solana SCCP typed registry", () => {
  it("distinguishes a readable empty registry from absent and staged route state", () => {
    expect(
      inspectExactSolanaRegistryState({ version: 1, lanes: [] }),
    ).toMatchObject({
      lanePresent: false,
      routePresent: false,
      activation: null,
    });
    const staged = inspectExactSolanaRegistryState(
      registry(governedRoute({ activation: "staged" })),
    );
    expect(staged).toMatchObject({
      lanePresent: true,
      routePresent: true,
      activation: "staged",
    });

    const duplicate = registry();
    duplicate.lanes.push(structuredClone(duplicate.lanes[0]));
    expect(() => inspectExactSolanaRegistryState(duplicate)).toThrow(
      /duplicate lane|at most one|found 2/u,
    );
  });

  it("selects and independently derives every governed Solana route hash", () => {
    const summary = summarizeExactSolanaRegistryRoute(registry(), {
      requireBidirectional: true,
      requireCurrentTrustAnchor: true,
    });
    expect(summary).toMatchObject({
      routeId: "taira_sol_xor",
      assetKey: "xor",
      revision: 1,
      activation: "bidirectional",
      destinationBindingHash:
        "0xa2d6c15ef8c7e480cc59854d3aa1738adfa51cdd80c9a40c81e422de54a2c862",
      deploymentConfigHash:
        "0x7517a61eab798d8278c632354d450addb4c68e2698d7bbc22c4f2ae66dfaca85",
      routeConfigurationHash:
        "0x568eeafdd9ee9cd5924dc5b344733ded1a2c5e1d0ed4789dff2306ebf564eda4",
      sourceEmitterIdentityHash:
        "0x21c5cfde7d26ac6112735f015421d26abc0a0c200ad057654de8c9bfd746012e",
      sourceIdentityHash:
        "0xcb0b4d9aa96576f640276d4a6b174569fb2219ef365cb4ab0aed5fd99fcaf04d",
      proofPolicy: {
        soraFinalityAnchorHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        semanticProfileHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        circuitCommitment: prefixed(0xc1),
        witnessGeneratorCommitment: prefixed(0xc2),
        publicSignalSchemaHash:
          "0x7567439f41173d6745a3d51923cb70371acc7d66f23cefb4100d6d5d7a432cbb",
      },
    });
    expect(new Set(Object.values(summary.programs)).size).toBe(3);
    expect(
      deriveExactSccpSolanaMaterialConfigHash({
        verifierProgram: summary.programs.nativeVerifier,
        material: {
          routeRevision: summary.revision,
          asset: summary.assetKey,
          vkKeccak: summary.verifierKeyHash,
          bridgeProgram: summary.programs.destination,
          sourceProgram: summary.programs.source,
          bridgeState: summary.accounts.destinationState,
          mint: summary.accounts.tokenMint,
          tokenProgram: SOLANA_SPL_TOKEN_PROGRAM_ID,
          soraFinalityAnchorHash: summary.proofPolicy.soraFinalityAnchorHash,
          semanticProfileHash: summary.proofPolicy.semanticProfileHash,
          circuitHash: summary.proofPolicy.circuitCommitment,
          witnessGeneratorCommitment:
            summary.proofPolicy.witnessGeneratorCommitment,
          schemaCommitment: summary.proofPolicy.publicSignalSchemaHash,
        },
      }),
    ).toBe(summary.nativeVerifierConfigHash);
    expect(summary.registrySha256).toBe(
      canonicalSccpRegistrySha256(registry()),
    );
  });

  it("rejects staged production, absent anchors, extra fields, and role aliases", () => {
    expect(() =>
      selectExactSolanaRegistryRoute(
        registry(governedRoute({ activation: "staged" })),
        {
          requireBidirectional: true,
        },
      ),
    ).toThrow(/bidirectional/u);
    const missingAnchor = registry();
    missingAnchor.lanes[0].native_trust_anchors = [];
    missingAnchor.lanes[0].current_native_trust_anchor_hash = null;
    expect(() =>
      selectExactSolanaRegistryRoute(missingAnchor, {
        requireBidirectional: true,
        requireCurrentTrustAnchor: true,
      }),
    ).toThrow(/trust anchor|anchor/u);
    const extended = registry();
    extended.lanes[0].routes[0].legacy_manifest = {};
    expect(() => selectExactSolanaRegistryRoute(extended)).toThrow(
      /unknown|retired/u,
    );
    const aliased = registry();
    aliased.lanes[0].routes[0].source_identity.emitter.identity.program_id =
      aliased.lanes[0].routes[0].destination.deployment.route_program_id;
    expect(() => summarizeExactSolanaRegistryRoute(aliased)).toThrow(
      /aliases|reuses/u,
    );
    const sharedCode = registry();
    sharedCode.lanes[0].routes[0].source_identity.emitter.identity.program_code_hash =
      sharedCode.lanes[0].routes[0].destination.deployment.route_program_code_hash;
    expect(() => summarizeExactSolanaRegistryRoute(sharedCode)).toThrow(
      /aliases a Solana source role|distinct executable code hashes/u,
    );
  });

  it("accepts only the exact closed capability surface", () => {
    expect(validateExactSolanaSccpCapabilities(capabilities())).toMatchObject({
      registry_path: SOLANA_SCCP_REGISTRY_PATH,
      proof_submit_path: "/v1/bridge/proofs/submit",
      native_message_submit_path: "/v1/bridge/messages",
    });
    const legacy = capabilities();
    legacy.registry_path = "/v1/sccp/manifests";
    expect(() => validateExactSolanaSccpCapabilities(legacy)).toThrow(
      /registry_path|V1 endpoint/u,
    );
    expect(SOLANA_SCCP_GOVERNANCE_DRAFT_PATH).toBe(
      "/v1/gov/proposals/sccp-route-governance",
    );
  });

  it("builds separate closed register and activation governance proposals", () => {
    const route = governedRoute();
    const registration = buildSolanaRouteRegistrationDraft({
      route,
      nativeTrustAnchor: trustAnchor(),
    });
    expect(registration).toMatchObject({
      action: {
        action: "Register",
        route: {
          route: { activation: { activation: "staged", direction: null } },
          native_trust_anchor: trustAnchor(),
        },
      },
      window: null,
      mode: "Zk",
    });
    expect(JSON.stringify(registration)).not.toMatch(
      /private.?key|route.?manager/iu,
    );

    const activation = buildSolanaRouteActivationDraft({ route });
    expect(activation).toMatchObject({
      action: {
        action: "SetActivation",
        route: {
          expected_current: { activation: "staged", direction: null },
          next: { activation: "bidirectional", direction: null },
          inbound_finality_cutoff: null,
        },
      },
    });
  });

  it("builds a hash-pinned plan and rejects every plan mutation", () => {
    const plan = buildSolanaRouteGovernancePlan({
      route: governedRoute(),
      nativeTrustAnchor: trustAnchor(),
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      orderedInitializationEvidenceSha256:
        ORDERED_INITIALIZATION_ARTIFACT_SHA256,
      programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
    });
    expect(validateSolanaRouteGovernancePlan(plan).plan).toEqual(plan);
    expect(plan).toMatchObject({
      schema: "iroha-sccp-solana-route-governance-plan/v1",
      route_id: "taira_sol_xor",
      revision: 1,
      fresh_deploy_report_sha256: FRESH_DEPLOY_REPORT_SHA256,
      program_artifact_sha256: PROGRAM_ARTIFACT_SHA256,
      registration: {
        mode: "Zk",
        action: {
          route: { route: { activation: { activation: "staged" } } },
        },
      },
      activation: {
        mode: "Zk",
        action: {
          route: { next: { activation: "bidirectional" } },
        },
      },
    });
    for (const mutate of [
      (copy) => {
        copy.route_hashes.destination_binding_hash = prefixed(0xfe);
      },
      (copy) => {
        copy.activation.action.route.expected_current.activation = "paused";
      },
      (copy) => {
        copy.registration.action.route.route.revision = 2;
      },
      (copy) => {
        copy.program_artifact_sha256.source =
          copy.program_artifact_sha256.destination;
      },
      (copy) => {
        copy.fresh_deploy_report_sha256 = prefixed(0xfd);
      },
      (copy) => {
        copy.private_key = "never";
      },
      (copy) => {
        copy.plan_sha256 = prefixed(0xee);
      },
    ]) {
      const copy = structuredClone(plan);
      mutate(copy);
      expect(() => validateSolanaRouteGovernancePlan(copy)).toThrow();
    }
    expect(() =>
      buildSolanaRouteGovernancePlan({
        route: governedRoute(),
        nativeTrustAnchor: null,
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        orderedInitializationEvidenceSha256:
          ORDERED_INITIALIZATION_ARTIFACT_SHA256,
        programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
      }),
    ).toThrow(/solana_agave_v1 trust anchor/u);
    expect(() =>
      buildSolanaRouteGovernancePlan({
        route: governedRoute(),
        nativeTrustAnchor: trustAnchor(),
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        orderedInitializationEvidenceSha256:
          ORDERED_INITIALIZATION_ARTIFACT_SHA256,
        programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
        mode: "Plain",
      }),
    ).toThrow(/Zk voting mode/u);
  });

  it("builds a reviewed plan only from independently pinned route and anchor bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sccp-solana-plan-"));
    try {
      const routePath = join(directory, "route.json");
      const anchorPath = join(directory, "anchor.json");
      const orderedInitializationPath = join(directory, "ordered-init.json");
      const outputPath = join(directory, "plan.json");
      const routeBytes = Buffer.from(`${JSON.stringify(governedRoute())}\n`);
      const anchorBytes = Buffer.from(`${JSON.stringify(trustAnchor())}\n`);
      const orderedInitializationBytes = Buffer.from(
        `${JSON.stringify(orderedInitializationEvidence())}\n`,
      );
      const hash = (bytes) =>
        `0x${createHash("sha256").update(bytes).digest("hex")}`;
      await writeFile(routePath, routeBytes);
      await writeFile(anchorPath, anchorBytes);
      await writeFile(orderedInitializationPath, orderedInitializationBytes);
      const result = await buildPinnedSolanaGovernancePlan({
        route: routePath,
        "expected-route-sha256": hash(routeBytes),
        "native-trust-anchor": anchorPath,
        "expected-native-trust-anchor-sha256": hash(anchorBytes),
        "ordered-initialization-evidence": orderedInitializationPath,
        "expected-ordered-initialization-evidence-sha256": hash(
          orderedInitializationBytes,
        ),
        out: outputPath,
      });
      expect(validateSolanaRouteGovernancePlan(result.plan).plan).toEqual(
        result.plan,
      );
      expect(JSON.parse(await readFile(outputPath, "utf8"))).toEqual(
        result.plan,
      );
      await expect(
        buildPinnedSolanaGovernancePlan({
          route: routePath,
          "expected-route-sha256": prefixed(0xee),
          "native-trust-anchor": anchorPath,
          "expected-native-trust-anchor-sha256": hash(anchorBytes),
          "ordered-initialization-evidence": orderedInitializationPath,
          "expected-ordered-initialization-evidence-sha256": hash(
            orderedInitializationBytes,
          ),
          out: outputPath,
        }),
      ).rejects.toThrow(/review pin/u);
      await expect(
        buildPinnedSolanaGovernancePlan({
          route: routePath,
          "expected-route-sha256": hash(routeBytes),
          "native-trust-anchor": anchorPath,
          "expected-native-trust-anchor-sha256": hash(anchorBytes),
          "ordered-initialization-evidence": orderedInitializationPath,
          "expected-ordered-initialization-evidence-sha256": hash(
            orderedInitializationBytes,
          ),
          out: routePath,
        }),
      ).rejects.toThrow(/differ/u);
      expect(() =>
        parseSolanaGovernancePlanArgs(["--route", routePath, "--unknown", "x"]),
      ).toThrow(/Unknown/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("enforces staged compare-and-swap before either proposal phase", () => {
    const plan = buildSolanaRouteGovernancePlan({
      route: governedRoute(),
      nativeTrustAnchor: trustAnchor(),
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      orderedInitializationEvidenceSha256:
        ORDERED_INITIALIZATION_ARTIFACT_SHA256,
      programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
    });
    expect(
      evaluateTairaSccpGovernancePhase({
        registry: { version: 1, lanes: [] },
        plan,
        phase: "register",
      }),
    ).toEqual({ readyToPropose: true, alreadyEnacted: false });
    expect(() =>
      evaluateTairaSccpGovernancePhase({
        registry: { version: 1, lanes: [] },
        plan,
        phase: "activate",
      }),
    ).toThrow(/before staged registration/u);

    const stagedRegistry = registry(governedRoute({ activation: "staged" }));
    expect(
      evaluateTairaSccpGovernancePhase({
        registry: stagedRegistry,
        plan,
        phase: "register",
      }),
    ).toEqual({ readyToPropose: false, alreadyEnacted: true });
    expect(
      evaluateTairaSccpGovernancePhase({
        registry: stagedRegistry,
        plan,
        phase: "activate",
      }),
    ).toEqual({ readyToPropose: true, alreadyEnacted: false });
    expect(
      evaluateTairaSccpGovernancePhase({
        registry: registry(),
        plan,
        phase: "activate",
      }),
    ).toEqual({ readyToPropose: false, alreadyEnacted: true });

    const divergent = registry(governedRoute({ activation: "staged" }));
    divergent.lanes[0].routes[0].destination.deployment.route_program_data_slot = 99;
    expect(() =>
      evaluateTairaSccpGovernancePhase({
        registry: divergent,
        plan,
        phase: "activate",
      }),
    ).toThrow(/exact reviewed route|divergent|route_config_hash/u);

    const staleAnchor = registry(governedRoute({ activation: "staged" }));
    staleAnchor.lanes[0].native_trust_anchors.push({
      ...trustAnchor(),
      anchor_hash: upper(0x92),
      checkpoint_height: 2,
    });
    staleAnchor.lanes[0].current_native_trust_anchor_hash = upper(0x92);
    expect(() =>
      evaluateTairaSccpGovernancePhase({
        registry: staleAnchor,
        plan,
        phase: "activate",
      }),
    ).toThrow(/current trust anchor differs/u);
  });

  it("accepts only explicit validator roots and canonical draft responses", () => {
    expect(
      validateTairaSccpGovernanceEndpoint("https://taira-validator-1.sora.org"),
    ).toBe("https://taira-validator-1.sora.org");
    for (const endpoint of [
      "https://taira.sora.org",
      "http://taira-validator-1.sora.org",
      "https://user:pass@taira-validator-1.sora.org",
      "https://taira-validator-1.sora.org/v1/mcp",
      "https://taira-validator-5.sora.org",
    ]) {
      expect(() => validateTairaSccpGovernanceEndpoint(endpoint)).toThrow();
    }
    const draft = {
      ok: true,
      proposal_id: upper(0x61).toLowerCase(),
      tx_instructions: [{ wire_id: "governance", payload_hex: "00" }],
    };
    expect(validateSccpGovernanceDraftResponse(draft)).toEqual(draft);
    for (const invalid of [
      { ...draft, proposal_id: upper(0xab) },
      { ...draft, private_key: "x" },
      { ...draft, tx_instructions: [] },
      {
        ...draft,
        tx_instructions: [{ wire_id: "governance", payload_hex: "ABC0" }],
      },
    ]) {
      expect(() => validateSccpGovernanceDraftResponse(invalid)).toThrow();
    }
    expect(
      parseTairaSccpGovernanceArgs([
        "--phase",
        "register",
        "--submit",
        "false",
      ]),
    ).toEqual({ phase: "register", submit: "false" });
    expect(() =>
      parseTairaSccpGovernanceArgs([
        "--phase",
        "register",
        "--phase",
        "activate",
      ]),
    ).toThrow(/Duplicate/u);
  });

  it("drafts from exact public registry state without reading a signing key", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sccp-solana-governance-"));
    try {
      const orderedInitialization = orderedInitializationEvidence();
      const orderedInitializationBytes = Buffer.from(
        `${JSON.stringify(orderedInitialization)}\n`,
      );
      const orderedInitializationSha256 = `0x${createHash("sha256")
        .update(orderedInitializationBytes)
        .digest("hex")}`;
      const plan = buildSolanaRouteGovernancePlan({
        route: governedRoute(),
        nativeTrustAnchor: trustAnchor(),
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        orderedInitializationEvidenceSha256: orderedInitializationSha256,
        programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
      });
      const planPath = join(directory, "plan.json");
      const orderedInitializationPath = join(directory, "ordered-init.json");
      const outPath = join(directory, "result.json");
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      await writeFile(orderedInitializationPath, orderedInitializationBytes);
      const orderedRpc = orderedRpcFixtures(orderedInitialization);
      const governanceInstructionPayload = Buffer.from("00", "hex");
      const requests = [];
      vi.stubGlobal(
        "fetch",
        vi.fn(async (input, options = {}) => {
          const url = String(input);
          requests.push({ url, options });
          if (url === SOLANA_TESTNET_RPC_URL) {
            const body = JSON.parse(options.body);
            if (body.method === "getMultipleAccounts") {
              return new Response(
                JSON.stringify({
                  jsonrpc: "2.0",
                  id: 1,
                  result: orderedRpc.programdataReadback,
                }),
                {
                  status: 200,
                  headers: { "content-type": "application/json" },
                },
              );
            }
            const signature = body.params[0];
            const transaction = orderedRpc.transactions.get(signature);
            return new Response(
              JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                result: orderedRpc.rpcTransaction(signature, transaction),
              }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
          if (url.endsWith("/v1/sccp/registry")) {
            return new Response(JSON.stringify({ version: 1, lanes: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (url.endsWith("/v1/gov/proposals/sccp-route-governance")) {
            return new Response(
              JSON.stringify({
                ok: true,
                proposal_id: upper(0x62).toLowerCase(),
                tx_instructions: [
                  {
                    wire_id:
                      "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
                    payload_hex: governanceInstructionPayload.toString("hex"),
                  },
                ],
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw new Error(`unexpected URL ${url}`);
        }),
      );
      const { result } = await runTairaSccpGovernance({
        plan: planPath,
        phase: "register",
        "expected-plan-sha256": plan.plan_sha256,
        "ordered-initialization-evidence": orderedInitializationPath,
        "expected-ordered-initialization-evidence-sha256":
          orderedInitializationSha256,
        "torii-url": "https://taira-validator-1.sora.org",
        "solana-rpc-url": SOLANA_TESTNET_RPC_URL,
        out: outPath,
        submit: "false",
      });
      expect(result).toMatchObject({
        phase: "register",
        submitted: false,
        already_enacted: false,
        plan_sha256: plan.plan_sha256,
        instruction_wire_id:
          "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
        instruction_payload_sha256: `0x${createHash("sha256")
          .update(governanceInstructionPayload)
          .digest("hex")}`,
      });
      const toriiRequests = requests.filter(
        ({ url }) => url !== SOLANA_TESTNET_RPC_URL,
      );
      expect(toriiRequests).toHaveLength(2);
      expect(
        requests.every(({ options }) => options.redirect === "error"),
      ).toBe(true);
      expect(JSON.parse(toriiRequests[1].options.body)).toEqual(
        plan.registration,
      );
      const serialized = await readFile(outPath, "utf8");
      expect(serialized).not.toMatch(/private|secret|mnemonic/iu);
      await expect(
        runTairaSccpGovernance({
          plan: planPath,
          phase: "register",
          "expected-plan-sha256": plan.plan_sha256,
          "ordered-initialization-evidence": orderedInitializationPath,
          "expected-ordered-initialization-evidence-sha256":
            orderedInitializationSha256,
          "torii-url": "https://taira-validator-1.sora.org",
          "solana-rpc-url": SOLANA_TESTNET_RPC_URL,
          out: planPath,
          submit: "false",
        }),
      ).rejects.toThrow(/must be distinct/u);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("durably reconciles an accepted governance transaction after a lost response without replacement", async () => {
    const directory = await mkdtemp(
      join(tmpdir(), "sccp-solana-governance-intent-"),
    );
    try {
      const orderedInitialization = orderedInitializationEvidence();
      const orderedInitializationBytes = Buffer.from(
        `${JSON.stringify(orderedInitialization)}\n`,
      );
      const orderedInitializationSha256 = `0x${createHash("sha256")
        .update(orderedInitializationBytes)
        .digest("hex")}`;
      const plan = buildSolanaRouteGovernancePlan({
        route: governedRoute(),
        nativeTrustAnchor: trustAnchor(),
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        orderedInitializationEvidenceSha256: orderedInitializationSha256,
        programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
      });
      const planPath = join(directory, "plan.json");
      const orderedInitializationPath = join(directory, "ordered-init.json");
      const outPath = join(directory, "result.json");
      const intentPath = join(directory, "result.intent.json");
      await writeFile(planPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
      await writeFile(orderedInitializationPath, orderedInitializationBytes);
      const orderedRpc = orderedRpcFixtures(orderedInitialization);
      const requests = [];
      const installFetch = (allowTorii) => {
        const fetchImpl = vi.fn(async (input, options = {}) => {
          const url = String(input);
          requests.push({ url, options });
          if (url === SOLANA_TESTNET_RPC_URL) {
            const body = JSON.parse(options.body);
            const result =
              body.method === "getMultipleAccounts"
                ? orderedRpc.programdataReadback
                : orderedRpc.rpcTransaction(
                    body.params[0],
                    orderedRpc.transactions.get(body.params[0]),
                  );
            return new Response(
              JSON.stringify({ jsonrpc: "2.0", id: 1, result }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }
          if (!allowTorii) {
            throw new Error(`unexpected post-intent request ${url}`);
          }
          if (url.endsWith(SOLANA_SCCP_REGISTRY_PATH)) {
            return new Response(JSON.stringify({ version: 1, lanes: [] }), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          if (url.endsWith(SOLANA_SCCP_GOVERNANCE_DRAFT_PATH)) {
            return new Response(
              JSON.stringify({
                ok: true,
                proposal_id: upper(0x72).toLowerCase(),
                tx_instructions: [
                  {
                    wire_id:
                      "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
                    payload_hex: "00",
                  },
                ],
              }),
              {
                status: 200,
                headers: { "content-type": "application/json" },
              },
            );
          }
          throw new Error(`unexpected URL ${url}`);
        });
        vi.stubGlobal("fetch", fetchImpl);
        return fetchImpl;
      };

      const signedTransaction = Buffer.from("durable-governance-transaction");
      const transactionHash = "73".repeat(32);
      const transactionSignature = {
        algorithm: "Ed25519",
        payload: upper(0x74, 64),
      };
      const transactionInspection = {
        transactionHash,
        transactionPayloadHash: "75".repeat(32),
        signedTransactionSha256: `0x${createHash("sha256")
          .update(signedTransaction)
          .digest("hex")}`,
        transactionSignature,
        transactionSignatureSha256:
          canonicalSccpObjectSha256(transactionSignature),
      };
      let capturedPrivateKey = null;
      const transactionBuilder = vi.fn(({ privateKey }) => {
        capturedPrivateKey = privateKey;
        return {
          signedTransaction,
          hash: Buffer.from(transactionHash, "hex"),
        };
      });
      const transactionInspector = vi.fn(() => transactionInspection);
      process.env.SCCP_TEST_GOVERNANCE_PRIVATE_KEY = "76".repeat(32);
      const baseOptions = {
        plan: planPath,
        phase: "register",
        "expected-plan-sha256": plan.plan_sha256,
        "ordered-initialization-evidence": orderedInitializationPath,
        "expected-ordered-initialization-evidence-sha256":
          orderedInitializationSha256,
        "torii-url": "https://taira-validator-1.sora.org",
        "solana-rpc-url": SOLANA_TESTNET_RPC_URL,
        authority,
        "private-key-env": "SCCP_TEST_GOVERNANCE_PRIVATE_KEY",
        submit: "true",
        nonce: "4242",
        out: outPath,
        intent: intentPath,
        transactionBuilder,
        transactionInspector,
      };
      const lostResponseClient = {
        submitTransaction: vi.fn(async () => {
          throw new Error("accepted but response lost");
        }),
        getTransactionStatusTyped: vi.fn(),
        waitForTransactionStatusTyped: vi.fn(),
      };
      installFetch(true);
      await expect(
        runTairaSccpGovernance({
          ...baseOptions,
          toriiClientFactory: () => lostResponseClient,
        }),
      ).rejects.toThrow(/accepted but response lost/u);
      expect(lostResponseClient.submitTransaction).toHaveBeenCalledTimes(1);
      expect(transactionBuilder).toHaveBeenCalledTimes(1);
      expect(capturedPrivateKey).not.toBeNull();
      expect([...capturedPrivateKey]).toEqual(Array(32).fill(0));
      await expect(readFile(outPath)).rejects.toHaveProperty("code", "ENOENT");
      const durableIntentBytes = await readFile(intentPath, "utf8");
      const durableIntent = validateTairaSccpGovernanceIntent(
        JSON.parse(durableIntentBytes),
      );
      expect(durableIntent).toMatchObject({
        phase: "register",
        plan_sha256: plan.plan_sha256,
        authority,
        torii_url: "https://taira-validator-1.sora.org",
        proposal_id: upper(0x72).toLowerCase(),
        transaction_hash: transactionHash,
        transaction_payload_hash: transactionInspection.transactionPayloadHash,
        transaction_signature: transactionSignature,
        nonce: 4242,
      });
      expect(durableIntentBytes).not.toMatch(
        /private.?key|secret|seed|mnemonic|password/iu,
      );

      delete process.env.SCCP_TEST_GOVERNANCE_PRIVATE_KEY;
      const replacementBuilder = vi.fn(() => {
        throw new Error("must not build a replacement transaction");
      });
      const unresolvedClient = {
        submitTransaction: vi.fn(),
        getTransactionStatusTyped: vi.fn(async () => null),
        waitForTransactionStatusTyped: vi.fn(async () => {
          throw new Error("status timeout");
        }),
      };
      installFetch(false);
      await expect(
        runTairaSccpGovernance({
          ...baseOptions,
          transactionBuilder: replacementBuilder,
          toriiClientFactory: () => unresolvedClient,
        }),
      ).rejects.toThrow(/unresolved.*refusing.*replacement/iu);
      expect(unresolvedClient.submitTransaction).not.toHaveBeenCalled();
      expect(replacementBuilder).not.toHaveBeenCalled();

      const mismatchedClient = {
        submitTransaction: vi.fn(),
        getTransactionStatusTyped: vi.fn(),
        waitForTransactionStatusTyped: vi.fn(),
      };
      await expect(
        runTairaSccpGovernance({
          ...baseOptions,
          authority: alternateAuthority,
          transactionBuilder: replacementBuilder,
          toriiClientFactory: () => mismatchedClient,
        }),
      ).rejects.toThrow(/intent differs.*authority/iu);
      expect(mismatchedClient.getTransactionStatusTyped).not.toHaveBeenCalled();
      expect(mismatchedClient.submitTransaction).not.toHaveBeenCalled();
      expect(replacementBuilder).not.toHaveBeenCalled();

      const appliedStatus = {
        kind: "Transaction",
        hashHex: transactionHash,
        status: { kind: "Applied", content: { block_height: 44 } },
      };
      const recoveredClient = {
        submitTransaction: vi.fn(),
        getTransactionStatusTyped: vi.fn(async () => appliedStatus),
        waitForTransactionStatusTyped: vi.fn(),
      };
      const { result, recovered } = await runTairaSccpGovernance({
        ...baseOptions,
        transactionBuilder: replacementBuilder,
        toriiClientFactory: () => recoveredClient,
      });
      expect(recovered).toBe(true);
      expect(result).toMatchObject({
        submitted: true,
        transaction_hash: transactionHash,
        recovered_from_durable_intent: true,
        status: appliedStatus,
      });
      expect(recoveredClient.getTransactionStatusTyped).toHaveBeenCalledWith(
        transactionHash,
        { scope: "global" },
      );
      expect(
        recoveredClient.waitForTransactionStatusTyped,
      ).not.toHaveBeenCalled();
      expect(recoveredClient.submitTransaction).not.toHaveBeenCalled();
      expect(replacementBuilder).not.toHaveBeenCalled();
      expect(await readFile(intentPath, "utf8")).toBe(durableIntentBytes);
      expect(
        requests.filter(({ url }) =>
          url.endsWith(SOLANA_SCCP_GOVERNANCE_DRAFT_PATH),
        ),
      ).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("Solana ordered initialization finalized RPC decoding", () => {
  const fetchFor = (fixture) =>
    vi.fn(async (_input, options = {}) => {
      const body = JSON.parse(options.body);
      const result =
        body.method === "getMultipleAccounts"
          ? fixture.programdataReadback
          : fixture.rpcTransaction(
              body.params[0],
              fixture.transactions.get(body.params[0]),
            );
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

  it("decodes every exact action once and reconstructs the governed verifying key", async () => {
    const fixture = orderedRpcFixtures();
    const normalized = validateSolanaOrderedInitializationEvidence(
      fixture.evidence,
    );
    const fetchImpl = fetchFor(fixture);
    const result = await verifySolanaOrderedInitializationTransactions(
      normalized,
      { fetchImpl, registrySummary: fixture.summary },
    );
    expect(result).toMatchObject({
      ready: true,
      verifyingKey: {
        length: 1_216,
        keccak256: fixture.summary.verifierKeyHash,
      },
      programdataReadback: {
        destination: { upgradeAuthority: null },
        source: { upgradeAuthority: null },
        native_verifier: { upgradeAuthority: null },
      },
    });
    expect(result.transactions).toHaveLength(8);
    expect(
      result.transactions.filter((entry) =>
        entry.roles.includes("native_verifier_material_initialize"),
      ),
    ).toHaveLength(1);
    const methods = fetchImpl.mock.calls.map(
      ([, options]) => JSON.parse(options.body).method,
    );
    expect(
      methods.filter((method) => method === "getTransaction"),
    ).toHaveLength(8);
    expect(
      methods.filter((method) => method === "getMultipleAccounts"),
    ).toHaveLength(1);
  });

  it("rejects account-only impostors and checked Loader authority variants", async () => {
    const accountOnly = orderedRpcFixtures();
    const destination = accountOnly.evidence.program_finalizations.destination;
    accountOnly.transactions.get(
      destination.transaction_signature,
    ).instructions = [
      orderedInstruction(
        "11111111111111111111111111111111",
        [
          destination.programdata_address,
          "BPFLoaderUpgradeab1e11111111111111111111111",
        ],
        Buffer.alloc(4),
      ),
    ];
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(accountOnly.evidence),
        {
          fetchImpl: fetchFor(accountOnly),
          registrySummary: accountOnly.summary,
        },
      ),
    ).rejects.toThrow(/exactly three instructions/u);

    const checked = orderedRpcFixtures();
    const checkedDestination =
      checked.evidence.program_finalizations.destination;
    const loaderInstruction = checked.transactions.get(
      checkedDestination.transaction_signature,
    ).instructions[0];
    loaderInstruction.data = bs58.encode(Buffer.from([7, 0, 0, 0]));
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(checked.evidence),
        { fetchImpl: fetchFor(checked), registrySummary: checked.summary },
      ),
    ).rejects.toThrow(/SetAuthority\(None\)/u);
  });

  it("rejects mixed atomic-finalization identities, append gaps, and mutable ProgramData", async () => {
    const mixed = orderedInitializationEvidence();
    mixed.program_finalizations.source.transaction_signature =
      transactionSignature(0x42);
    expect(() => validateSolanaOrderedInitializationEvidence(mixed)).toThrow(
      /one atomic transaction signature/u,
    );
    const mixedSlot = orderedInitializationEvidence();
    mixedSlot.program_finalizations.source.finalized_slot = 23;
    expect(() =>
      validateSolanaOrderedInitializationEvidence(mixedSlot),
    ).toThrow(/one atomic transaction signature/u);

    const deploymentSlotDriftEvidence = orderedInitializationEvidence();
    deploymentSlotDriftEvidence.program_finalizations.source.programdata_deployment_slot = 18;
    const deploymentSlotDrift = orderedRpcFixtures(deploymentSlotDriftEvidence);
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(
          deploymentSlotDrift.evidence,
        ),
        {
          fetchImpl: fetchFor(deploymentSlotDrift),
          registrySummary: deploymentSlotDrift.summary,
        },
      ),
    ).rejects.toThrow(/differs from exact typed governance/u);

    const gap = orderedRpcFixtures();
    const firstAppend =
      gap.evidence.initialization_transactions
        .native_verifier_material_appends[0];
    const appendInstruction = gap.transactions.get(
      firstAppend.transaction_signature,
    ).instructions[0];
    const appendData = Buffer.from(bs58.decode(appendInstruction.data));
    appendData.writeUInt16LE(1, 2);
    appendInstruction.data = bs58.encode(appendData);
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(gap.evidence),
        { fetchImpl: fetchFor(gap), registrySummary: gap.summary },
      ),
    ).rejects.toThrow(/not contiguous/u);

    const mutable = orderedRpcFixtures();
    const mutableBytes = Buffer.from(
      mutable.programdataReadback.value[1].data[0],
      "base64",
    );
    mutableBytes[12] = 1;
    mutable.programdataReadback.value[1].data[0] =
      mutableBytes.toString("base64");
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(mutable.evidence),
        { fetchImpl: fetchFor(mutable), registrySummary: mutable.summary },
      ),
    ).rejects.toThrow(/not immutable/u);

    const dirtyNone = orderedRpcFixtures();
    const dirtyNoneBytes = Buffer.from(
      dirtyNone.programdataReadback.value[1].data[0],
      "base64",
    );
    dirtyNoneBytes[13] = 1;
    dirtyNone.programdataReadback.value[1].data[0] =
      dirtyNoneBytes.toString("base64");
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(dirtyNone.evidence),
        {
          fetchImpl: fetchFor(dirtyNone),
          registrySummary: dirtyNone.summary,
        },
      ),
    ).resolves.toMatchObject({ ready: true });

    const downgraded = orderedRpcFixtures();
    const downgradedBytes = Buffer.from(
      downgraded.programdataReadback.value[1].data[0],
      "base64",
    );
    downgradedBytes.writeUInt32LE(2, 45 + 48);
    downgraded.programdataReadback.value[1].data[0] =
      downgradedBytes.toString("base64");
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(downgraded.evidence),
        {
          fetchImpl: fetchFor(downgraded),
          registrySummary: downgraded.summary,
        },
      ),
    ).rejects.toThrow(/exact SBPF V3/u);

    const artifactDrift = orderedRpcFixtures();
    const artifactBytes = Buffer.from(
      artifactDrift.programdataReadback.value[1].data[0],
      "base64",
    );
    artifactBytes[artifactBytes.length - 1] ^= 1;
    artifactDrift.programdataReadback.value[1].data[0] =
      artifactBytes.toString("base64");
    await expect(
      verifySolanaOrderedInitializationTransactions(
        validateSolanaOrderedInitializationEvidence(artifactDrift.evidence),
        {
          fetchImpl: fetchFor(artifactDrift),
          registrySummary: artifactDrift.summary,
        },
      ),
    ).rejects.toThrow(/reviewed artifact/u);
  });

  it("rejects missing, duplicated, reordered, extra, and partial Loader finalization actions", async () => {
    const expectRejected = async (mutate) => {
      const fixture = orderedRpcFixtures();
      const signatureValue =
        fixture.evidence.program_finalizations.destination
          .transaction_signature;
      mutate(fixture.transactions.get(signatureValue).instructions);
      await expect(
        verifySolanaOrderedInitializationTransactions(
          validateSolanaOrderedInitializationEvidence(fixture.evidence),
          { fetchImpl: fetchFor(fixture), registrySummary: fixture.summary },
        ),
      ).rejects.toThrow(/Atomic Loader-v3 finalization/u);
    };
    await expectRejected((instructions) => instructions.pop());
    await expectRejected((instructions) => {
      instructions[1] = structuredClone(instructions[0]);
    });
    await expectRejected((instructions) => {
      [instructions[0], instructions[1]] = [instructions[1], instructions[0]];
    });
    await expectRejected((instructions) => {
      instructions.push(structuredClone(instructions[2]));
    });
    await expectRejected((instructions) => {
      instructions.splice(1);
    });
  });
});

describe("Solana SCCP governance completion evidence", () => {
  const exactEvidence = () => {
    const plan = buildSolanaRouteGovernancePlan({
      route: governedRoute(),
      nativeTrustAnchor: trustAnchor(),
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      orderedInitializationEvidenceSha256:
        ORDERED_INITIALIZATION_ARTIFACT_SHA256,
      programArtifactSha256: PROGRAM_ARTIFACT_SHA256,
    });
    const toriiUrl = "https://taira-validator-1.sora.org";
    const registrationArtifactSha256 = prefixed(0xa4);
    const activationArtifactSha256 = prefixed(0xa5);
    const orderedInitialization = orderedInitializationEvidence();
    const preflight = governancePreflight();
    return {
      plan,
      toriiUrl,
      orderedInitialization,
      orderedInitializationArtifactSha256:
        ORDERED_INITIALIZATION_ARTIFACT_SHA256,
      orderedInitializationRpcVerification: orderedRpcVerificationClaim(
        orderedInitialization,
        preflight.registrySummary,
      ),
      registrationArtifactSha256,
      activationArtifactSha256,
      registration: governanceResult({
        phase: "register",
        planSha256: plan.plan_sha256,
        toriiUrl,
      }),
      activation: governanceResult({
        phase: "activate",
        planSha256: plan.plan_sha256,
        toriiUrl,
      }),
      preflight,
    };
  };

  const buildChecks = (evidence, fetchImpl) =>
    buildSolanaGovernanceEvidenceChecks({
      governancePlan: evidence.plan,
      expectedPlanSha256: evidence.plan.plan_sha256,
      registrationResult: evidence.registration,
      registrationArtifactSha256: evidence.registrationArtifactSha256,
      expectedRegistrationArtifactSha256: evidence.registrationArtifactSha256,
      activationResult: evidence.activation,
      activationArtifactSha256: evidence.activationArtifactSha256,
      expectedActivationArtifactSha256: evidence.activationArtifactSha256,
      orderedInitializationEvidence: evidence.orderedInitialization,
      orderedInitializationArtifactSha256:
        evidence.orderedInitializationArtifactSha256,
      expectedOrderedInitializationArtifactSha256:
        evidence.orderedInitializationArtifactSha256,
      orderedInitializationRpcVerification:
        evidence.orderedInitializationRpcVerification,
      preflightReport: evidence.preflight,
      fetchImpl,
    });

  it("requires both pinned governance phases and exact bidirectional registry readback", async () => {
    const evidence = exactEvidence();
    const fetchImpl = governanceReadbackFetch(evidence);
    const result = await buildSolanaGovernanceEvidenceChecks({
      governancePlan: evidence.plan,
      expectedPlanSha256: evidence.plan.plan_sha256,
      registrationResult: evidence.registration,
      registrationArtifactSha256: evidence.registrationArtifactSha256,
      expectedRegistrationArtifactSha256: evidence.registrationArtifactSha256,
      activationResult: evidence.activation,
      activationArtifactSha256: evidence.activationArtifactSha256,
      expectedActivationArtifactSha256: evidence.activationArtifactSha256,
      orderedInitializationEvidence: evidence.orderedInitialization,
      orderedInitializationArtifactSha256:
        evidence.orderedInitializationArtifactSha256,
      expectedOrderedInitializationArtifactSha256:
        evidence.orderedInitializationArtifactSha256,
      orderedInitializationRpcVerification:
        evidence.orderedInitializationRpcVerification,
      preflightReport: evidence.preflight,
      fetchImpl,
    });
    expect(result.ready).toBe(true);
    expect(result.checks.map(({ id, status }) => ({ id, status }))).toEqual([
      { id: "governance-plan-reviewed", status: "pass" },
      {
        id: "governance-ordered-initialization-evidence",
        status: "pass",
      },
      { id: "governance-register-evidence", status: "pass" },
      { id: "governance-activate-evidence", status: "pass" },
      { id: "governance-phases-distinct", status: "pass" },
      { id: "governance-enactment-readback", status: "pass" },
    ]);
    expect(fetchImpl).toHaveBeenCalledTimes(11);
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options).toMatchObject({ method: "GET", redirect: "error" });
      expect(options.body).toBeUndefined();
    }
  });

  it("accepts only exact ordinary or durable-intent-recovered governance receipts", () => {
    const evidence = exactEvidence();
    const context = {
      phase: "register",
      planSha256: evidence.plan.plan_sha256,
      orderedInitializationEvidenceSha256:
        evidence.orderedInitializationArtifactSha256,
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      toriiUrl: evidence.toriiUrl,
    };
    expect(
      validateSolanaGovernanceSubmissionEvidence(
        evidence.registration,
        context,
      ),
    ).toMatchObject({
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      recoveredFromDurableIntent: false,
      checkedAt: evidence.registration.checked_at,
    });
    expect(
      validateSolanaGovernanceSubmissionEvidence(
        {
          ...evidence.registration,
          recovered_from_durable_intent: true,
        },
        context,
      ),
    ).toMatchObject({
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      recoveredFromDurableIntent: true,
    });
  });

  it("rejects unknown, missing, or fresh-deployment-divergent receipt fields", () => {
    const evidence = exactEvidence();
    const context = {
      phase: "register",
      planSha256: evidence.plan.plan_sha256,
      orderedInitializationEvidenceSha256:
        evidence.orderedInitializationArtifactSha256,
      freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
      toriiUrl: evidence.toriiUrl,
    };
    const missingFreshDeployHash = structuredClone(evidence.registration);
    delete missingFreshDeployHash.fresh_deploy_report_sha256;
    for (const receipt of [
      { ...evidence.registration, extra_unreviewed: true },
      missingFreshDeployHash,
      {
        ...evidence.registration,
        fresh_deploy_report_sha256: prefixed(0x99),
      },
      {
        ...evidence.registration,
        recovered_from_durable_intent: false,
      },
    ]) {
      expect(() =>
        validateSolanaGovernanceSubmissionEvidence(receipt, context),
      ).toThrow(/unknown or missing field|identity|fields are not exact/u);
    }
  });

  it("rejects draft-only, swapped, secret-bearing, and fabricated enacted receipts", () => {
    const evidence = exactEvidence();
    const draftOnly = {
      ...evidence.registration,
      submitted: false,
      already_enacted: false,
      proposal_id: upper(0x52).toLowerCase(),
    };
    expect(() =>
      validateSolanaGovernanceSubmissionEvidence(draftOnly, {
        phase: "register",
        planSha256: evidence.plan.plan_sha256,
        orderedInitializationEvidenceSha256:
          evidence.orderedInitializationArtifactSha256,
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        toriiUrl: evidence.toriiUrl,
      }),
    ).toThrow(/submitted Parliament transaction/u);
    expect(() =>
      validateSolanaGovernanceSubmissionEvidence(evidence.activation, {
        phase: "register",
        planSha256: evidence.plan.plan_sha256,
        orderedInitializationEvidenceSha256:
          evidence.orderedInitializationArtifactSha256,
        freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
        toriiUrl: evidence.toriiUrl,
      }),
    ).toThrow(/identity/u);
    expect(() =>
      validateSolanaGovernanceSubmissionEvidence(
        { ...evidence.registration, private_key: "forbidden" },
        {
          phase: "register",
          planSha256: evidence.plan.plan_sha256,
          orderedInitializationEvidenceSha256:
            evidence.orderedInitializationArtifactSha256,
          freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
          toriiUrl: evidence.toriiUrl,
        },
      ),
    ).toThrow(/non-secret/u);
    expect(() =>
      validateSolanaGovernanceSubmissionEvidence(
        {
          ...evidence.registration,
          submitted: false,
          already_enacted: true,
          proposal_id: upper(0x53).toLowerCase(),
        },
        {
          phase: "register",
          planSha256: evidence.plan.plan_sha256,
          orderedInitializationEvidenceSha256:
            evidence.orderedInitializationArtifactSha256,
          freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
          toriiUrl: evidence.toriiUrl,
        },
      ),
    ).toThrow(/submitted Parliament transaction/u);
    for (const status of [
      null,
      { kind: "Rejected" },
      { kind: "Expired" },
      { kind: "Unknown" },
      { kind: "Applied" },
      { kind: "Applied", raw: { status: { kind: "Rejected" } } },
    ]) {
      expect(() =>
        validateSolanaGovernanceSubmissionEvidence(
          { ...evidence.registration, status },
          {
            phase: "register",
            planSha256: evidence.plan.plan_sha256,
            orderedInitializationEvidenceSha256:
              evidence.orderedInitializationArtifactSha256,
            freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
            toriiUrl: evidence.toriiUrl,
          },
        ),
      ).toThrow(/Applied|applied proposal transaction|bind/u);
    }
    for (const field of ["instruction_wire_id", "instruction_payload_sha256"]) {
      expect(() =>
        validateSolanaGovernanceSubmissionEvidence(
          { ...evidence.registration, [field]: null },
          {
            phase: "register",
            planSha256: evidence.plan.plan_sha256,
            orderedInitializationEvidenceSha256:
              evidence.orderedInitializationArtifactSha256,
            freshDeployReportSha256: FRESH_DEPLOY_REPORT_SHA256,
            toriiUrl: evidence.toriiUrl,
          },
        ),
      ).toThrow(/applied proposal transaction/u);
    }
  });

  it("rejects registration and activation receipts that reuse a proposal or transaction", async () => {
    for (const field of ["proposal_id", "transaction_hash"]) {
      const evidence = exactEvidence();
      evidence.activation[field] = evidence.registration[field];
      const result = await buildSolanaGovernanceEvidenceChecks({
        governancePlan: evidence.plan,
        expectedPlanSha256: evidence.plan.plan_sha256,
        registrationResult: evidence.registration,
        registrationArtifactSha256: evidence.registrationArtifactSha256,
        expectedRegistrationArtifactSha256: evidence.registrationArtifactSha256,
        activationResult: evidence.activation,
        activationArtifactSha256: evidence.activationArtifactSha256,
        expectedActivationArtifactSha256: evidence.activationArtifactSha256,
        orderedInitializationEvidence: evidence.orderedInitialization,
        orderedInitializationArtifactSha256:
          evidence.orderedInitializationArtifactSha256,
        expectedOrderedInitializationArtifactSha256:
          evidence.orderedInitializationArtifactSha256,
        orderedInitializationRpcVerification:
          evidence.orderedInitializationRpcVerification,
        preflightReport: evidence.preflight,
        fetchImpl: governanceReadbackFetch(evidence),
      });
      expect(result.ready).toBe(false);
      expect(
        result.checks.find(({ id }) => id === "governance-phases-distinct"),
      ).toMatchObject({ status: "fail" });
    }
  });

  it("rejects fabricated transaction hashes and swapped live governance phases", async () => {
    const publicEvidence = exactEvidence();
    const fabricated = exactEvidence();
    fabricated.registration.transaction_hash = "71".repeat(32);
    fabricated.registration.status.content.hash =
      fabricated.registration.transaction_hash;
    expect(
      (await buildChecks(fabricated, governanceReadbackFetch(publicEvidence)))
        .ready,
    ).toBe(false);

    const swapped = exactEvidence();
    const swappedFetch = governanceReadbackFetch(swapped, (entry) => {
      if (entry.phase === "activate" && entry.endpoint === "transaction") {
        entry.payload.metadata.governance_phase = "register";
      }
      if (entry.phase === "activate" && entry.endpoint === "proposal") {
        entry.payload.proposal.kind.SccpRouteGovernance.action =
          structuredClone(swapped.plan.registration.action);
      }
      return entry;
    });
    const result = await buildChecks(swapped, swappedFetch);
    expect(result.ready).toBe(false);
    expect(
      result.checks.find(({ id }) => id === "governance-activate-evidence"),
    ).toMatchObject({ status: "fail" });
  });

  it("rejects live readback drift, read errors, and unfinalized transactions", async () => {
    for (const mutate of [
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "instruction") {
          entry.payload.box.encoded = `${entry.payload.box.encoded.slice(0, -1)}0`;
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "instruction") {
          entry.payload.box.framed_sha256 = prefixed(0x73);
        }
        return entry;
      },
      (entry) => {
        if (entry.endpoint === "metrics") entry.payload.finalized_block = 39;
        return entry;
      },
      (entry) => {
        if (entry.phase === "activate" && entry.endpoint === "proposal") {
          return { ...entry, status: 503 };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "activate" && entry.endpoint === "proposal") {
          return { ...entry, contentType: "text/plain" };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "pipeline") {
          entry.payload.content.status = { kind: "Rejected" };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "pipeline") {
          entry.payload.content.status = { kind: "Expired" };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "pipeline") {
          return {
            ...entry,
            rawText: `{"kind":"Rejected",${JSON.stringify(entry.payload).slice(1)}`,
          };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "instruction") {
          entry.payload.box.json.payload = {
            variant: "ProposeSccpRouteGovernance",
            value: {
              wire_id:
                "iroha_data_model::isi::governance::ProposeSccpRouteGovernance",
              encoded: entry.payload.box.json.encoded,
            },
          };
        }
        return entry;
      },
      (entry) => {
        if (entry.phase === "register" && entry.endpoint === "instruction") {
          entry.payload.private_key = "forbidden";
        }
        return entry;
      },
    ]) {
      const evidence = exactEvidence();
      const result = await buildChecks(
        evidence,
        governanceReadbackFetch(evidence, mutate),
      );
      expect(result.ready).toBe(false);
    }
  });

  it("rejects full enacted route and trust-anchor drift outside route_hashes", async () => {
    const cases = [
      (liveRegistry) => {
        liveRegistry.lanes[0].routes[0].settlement.asset_definition_id =
          "61CtjvNd9T3THAR65GsMVHr82Bjc";
      },
      (liveRegistry) => {
        liveRegistry.lanes[0].routes[0].settlement.custody_account_id =
          alternateAuthority;
      },
      (liveRegistry) => {
        liveRegistry.lanes[0].routes[0].settlement.payload_amount_scale = 8;
      },
      (liveRegistry) => {
        liveRegistry.lanes[0].routes[0].sora_outbound_execution_policy.gas_limit -= 1;
      },
      (liveRegistry) => {
        liveRegistry.lanes[0].native_trust_anchors[0].checkpoint_height = 2;
      },
    ];
    for (const mutateRegistry of cases) {
      const evidence = exactEvidence();
      const fetchImpl = governanceReadbackFetch(evidence, (entry) => {
        if (entry.endpoint === "registry") mutateRegistry(entry.payload);
        return entry;
      });
      const result = await buildChecks(evidence, fetchImpl);
      expect(
        result.checks.find(({ id }) => id === "governance-enactment-readback"),
      ).toMatchObject({
        status: "fail",
        evidence: {
          error: expect.any(String),
        },
      });
      expect(result.ready).toBe(false);
    }
  });

  it("fails closed without network access and never attempts a mutation", async () => {
    const evidence = exactEvidence();
    const methods = [];
    const fetchImpl = vi.fn(async (_url, options = {}) => {
      methods.push(options.method);
      throw new Error("offline");
    });
    const result = await buildChecks(evidence, fetchImpl);
    expect(result.ready).toBe(false);
    expect(fetchImpl).toHaveBeenCalled();
    expect(new Set(methods)).toEqual(new Set(["GET"]));
  });

  it("fails closed on chronology, byte-pin, plan, activation, route-hash, and anchor drift", async () => {
    const mutate = async (change) => {
      const evidence = exactEvidence();
      change(evidence);
      return buildSolanaGovernanceEvidenceChecks({
        governancePlan: evidence.plan,
        expectedPlanSha256:
          evidence.expectedPlanSha256 ?? evidence.plan.plan_sha256,
        registrationResult: evidence.registration,
        registrationArtifactSha256: evidence.registrationArtifactSha256,
        expectedRegistrationArtifactSha256:
          evidence.expectedRegistrationArtifactSha256 ??
          evidence.registrationArtifactSha256,
        activationResult: evidence.activation,
        activationArtifactSha256: evidence.activationArtifactSha256,
        expectedActivationArtifactSha256: evidence.activationArtifactSha256,
        orderedInitializationEvidence: evidence.orderedInitialization,
        orderedInitializationArtifactSha256:
          evidence.orderedInitializationArtifactSha256,
        expectedOrderedInitializationArtifactSha256:
          evidence.expectedOrderedInitializationArtifactSha256 ??
          evidence.orderedInitializationArtifactSha256,
        orderedInitializationRpcVerification:
          evidence.orderedInitializationRpcVerification,
        preflightReport: evidence.preflight,
        fetchImpl: governanceReadbackFetch(evidence),
      });
    };
    expect(
      (
        await mutate((evidence) => {
          evidence.expectedOrderedInitializationArtifactSha256 = prefixed(0xfb);
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await mutate((evidence) => {
          evidence.orderedInitializationRpcVerification = {
            ready: false,
            transactions: [],
          };
        })
      ).ready,
    ).toBe(false);
    expect(() => {
      const reordered = orderedInitializationEvidence();
      reordered.initialization_transactions.token_mint_create.finalized_slot = 22;
      validateSolanaOrderedInitializationEvidence(reordered);
    }).toThrow(/strictly after/u);
    expect(() => {
      const sharedArtifact = orderedInitializationEvidence();
      sharedArtifact.program_finalizations.source.artifact_sha256 =
        sharedArtifact.program_finalizations.destination.artifact_sha256;
      validateSolanaOrderedInitializationEvidence(sharedArtifact);
    }).toThrow(/distinct artifact bytes/u);
    expect(
      (
        await mutate((evidence) => {
          evidence.expectedRegistrationArtifactSha256 = prefixed(0xff);
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await mutate((evidence) => {
          evidence.expectedPlanSha256 = prefixed(0xfe);
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await mutate((evidence) => {
          evidence.preflight.registryState.activation = "staged";
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await mutate((evidence) => {
          evidence.preflight.registrySummary = {
            ...evidence.preflight.registrySummary,
            destinationBindingHash: prefixed(0xfd),
          };
        })
      ).ready,
    ).toBe(false);
    expect(
      (
        await mutate((evidence) => {
          evidence.preflight.registryState.currentNativeTrustAnchorHash =
            upper(0xfc);
        })
      ).ready,
    ).toBe(false);
  });
});
