import { Buffer } from "node:buffer";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaNativeVerifierConfigHashV1,
} from "@iroha/iroha-js/sccp";
import { blake2b } from "@noble/hashes/blake2b";
import { PublicKey } from "@solana/web3.js";

const SOLANA_UPGRADEABLE_LOADER_ADDRESS =
  "BPFLoaderUpgradeab1e11111111111111111111111";

const upper = (byte, length = 32) =>
  byte.toString(16).padStart(2, "0").repeat(length).toUpperCase();

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

const loaderProgramDataHex = (programHex) =>
  Buffer.from(
    PublicKey.findProgramAddressSync(
      [Buffer.from(programHex, "hex")],
      new PublicKey(SOLANA_UPGRADEABLE_LOADER_ADDRESS),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();

const deriveRouteStateHex = ({
  routeDirection,
  tokenMintAddress,
  programAddress,
}) =>
  Buffer.from(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-route-state-v1", "utf8"),
        Buffer.from([routeDirection]),
        Buffer.from(tokenMintAddress, "hex"),
      ],
      new PublicKey(Buffer.from(programAddress, "hex")),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();

export const EXACT_SOLANA_SCCP_TEST_AUTHORITY = AccountAddress.fromAccount({
  publicKey: Uint8Array.from([0x58, ...Array(31).fill(0x66)]),
}).toI105(369);

export const buildExactSolanaOutboundPolicyFixture = () => ({
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

export const buildExactSoraOutboundExecutionPolicyFixture = () => ({
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

export const buildExactSolanaDeploymentFixture = ({
  tokenMintAddress = upper(0x11),
  routeProgramId = upper(0x12),
  routeProgramDataAddress = loaderProgramDataHex(routeProgramId),
  routeProgramDataSlot = 17,
  routeProgramCodeHash = orderedProgramCodeHashRaw(1),
  nativeVerifierProgramId = upper(0x16),
  nativeVerifierProgramDataAddress = loaderProgramDataHex(
    nativeVerifierProgramId,
  ),
  nativeVerifierProgramDataSlot = 18,
  nativeVerifierProgramCodeHash = orderedProgramCodeHashRaw(3),
  sourceProgramId = upper(0x31),
  routeRevision = 1,
  outboundProofPolicy = buildExactSolanaOutboundPolicyFixture(),
} = {}) => {
  const deployment = {
    token_mint_address: tokenMintAddress,
    route_program_id: routeProgramId,
    route_program_data_address: routeProgramDataAddress,
    route_program_data_slot: routeProgramDataSlot,
    route_state_account: "",
    route_program_code_hash: routeProgramCodeHash,
    native_verifier_program_id: nativeVerifierProgramId,
    native_verifier_program_data_address: nativeVerifierProgramDataAddress,
    native_verifier_program_data_slot: nativeVerifierProgramDataSlot,
    native_verifier_material_account: upper(0x18),
    native_verifier_program_code_hash: nativeVerifierProgramCodeHash,
    native_verifier_config_hash: upper(0x1a),
    verifying_key: verifyingKey(),
    verifier_key_hash:
      "6923E63427820AB42CC16C3C2BC0EB4097577919BB3911EA50CBB4F20CEBFDDB",
    outbound_proof_policy: outboundProofPolicy,
    taira_to_token_multiplier: 1,
  };

  deployment.route_state_account = deriveRouteStateHex({
    routeDirection: 1,
    tokenMintAddress: deployment.token_mint_address,
    programAddress: deployment.route_program_id,
  });
  deployment.native_verifier_config_hash =
    deriveSccpSolanaNativeVerifierConfigHashV1(
      deployment,
      sourceProgramId,
      routeRevision,
    )
      .slice(2)
      .toUpperCase();
  deployment.native_verifier_material_account = Buffer.from(
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-vk-v1", "utf8"),
        Buffer.from(deployment.verifier_key_hash, "hex"),
        Buffer.from(deployment.native_verifier_config_hash, "hex"),
      ],
      new PublicKey(Buffer.from(deployment.native_verifier_program_id, "hex")),
    )[0].toBytes(),
  )
    .toString("hex")
    .toUpperCase();

  return deployment;
};

export const buildExactSolanaGovernedRouteFixture = ({
  activation = "bidirectional",
} = {}) => {
  const destinationDeployment = buildExactSolanaDeploymentFixture();
  const destinationHashes = deriveSccpSolanaDestinationHashesV1(
    destinationDeployment,
    upper(0x31),
    1,
  );
  const sourceStateAddress = deriveRouteStateHex({
    routeDirection: 2,
    tokenMintAddress: destinationDeployment.token_mint_address,
    programAddress: upper(0x31),
  });

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
          program_data_address: loaderProgramDataHex(upper(0x31)),
          program_data_slot: 19,
          state_account: sourceStateAddress,
          program_code_hash: orderedProgramCodeHashRaw(2),
          route_config_hash: destinationHashes.route_configuration_hash
            .slice(2)
            .toUpperCase(),
        },
      },
    },
    destination: {
      family: "solana",
      deployment: destinationDeployment,
    },
    sora_outbound_execution_policy:
      buildExactSoraOutboundExecutionPolicyFixture(),
    settlement: {
      asset_definition_id: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      custody_account_id: EXACT_SOLANA_SCCP_TEST_AUTHORITY,
      payload_amount_scale: 9,
    },
  };
};

export const buildExactSolanaTrustAnchorFixture = () => ({
  backend: { backend: "solana_agave_v1", protocol: null },
  anchor_hash: upper(0x91),
  checkpoint_height: 1,
});

export const buildExactSolanaCapabilitiesFixture = () => ({
  version: 1,
  registry_revision: `0x${upper(0x41).toLowerCase()}`,
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

/**
 * Builds a fresh raw typed-registry fixture accepted by the exact Solana SCCP
 * registry parser. `mutateRegistry` runs after all dependent hashes and PDAs
 * are derived, making it useful for fail-closed/adversarial tests.
 */
export const buildExactSolanaRegistryFixture = ({
  activation = "bidirectional",
  mutateRegistry,
} = {}) => {
  const trustAnchor = buildExactSolanaTrustAnchorFixture();
  const registry = {
    version: 1,
    lanes: [
      {
        lane_id: lane(),
        native_trust_anchors: [trustAnchor],
        current_native_trust_anchor_hash: trustAnchor.anchor_hash,
        routes: [buildExactSolanaGovernedRouteFixture({ activation })],
      },
    ],
  };

  if (mutateRegistry !== undefined) {
    if (typeof mutateRegistry !== "function") {
      throw new TypeError("mutateRegistry must be a function when provided");
    }
    const replacement = mutateRegistry(registry);
    return replacement === undefined ? registry : replacement;
  }

  return registry;
};
