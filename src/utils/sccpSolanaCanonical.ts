import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import {
  canonicalSccpPayloadBytes,
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaSourceIdentityHashesV1,
  normalizeSccpRegistry,
  sccpLaneIdHash,
  sccpMessageId,
  sccpPayloadHash,
  type SccpLaneIdV1,
  type SccpPayloadV1,
  type SccpSolanaDestinationDeploymentV1,
  type SccpSourceIdentityV1,
  type SccpTransferPayloadV1,
} from "@iroha/iroha-js/sccp";

export const SCCP_SOLANA_XOR_ROUTE_ID_V1 = "taira_sol_xor";
export const SCCP_XOR_ASSET_KEY_V1 = "xor";
export const SCCP_SOLANA_ROUTE_STATE_SEED_V1 = "sccp-route-state-v1";
export const SCCP_SOLANA_DESTINATION_RECEIPT_SEED_V1 =
  "sccp-destination-receipt-v1";
export const SCCP_SOLANA_DESTINATION_ROLE_V1 = 1;
export const SCCP_SOLANA_SOURCE_ROLE_V1 = 2;

const SOLANA_PROGRAM_DERIVED_ADDRESS_MARKER_V1 = new TextEncoder().encode(
  "ProgramDerivedAddress",
);
const SOLANA_MAX_PROGRAM_ADDRESS_SEEDS_V1 = 16;
const SOLANA_MAX_PROGRAM_ADDRESS_SEED_BYTES_V1 = 32;

const TAIRA_NETWORK_V1 = {
  network: "sora_taira",
  profile: null,
} as const;
const SOLANA_TESTNET_NETWORK_V1 = {
  network: "solana_testnet",
  profile: null,
} as const;

export const SCCP_TAIRA_TO_SOLANA_LANE_V1 = {
  source: TAIRA_NETWORK_V1,
  target: SOLANA_TESTNET_NETWORK_V1,
} as const satisfies SccpLaneIdV1;

export const SCCP_SOLANA_TO_TAIRA_LANE_V1 = {
  source: SOLANA_TESTNET_NETWORK_V1,
  target: TAIRA_NETWORK_V1,
} as const satisfies SccpLaneIdV1;

const bytesToHex = (bytes: Uint8Array): string =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;

const normalizeHex32 = (value: string, label: string): string => {
  const normalized = `0x${value.trim().toLowerCase().replace(/^0x/u, "")}`;
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex value.`);
  }
  return normalized;
};

const requireRecord = (
  value: unknown,
  label: string,
): Record<string, unknown> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
};

export const canonicalSccpTextWireHex = (value: string): string => {
  if (!value || value !== value.trim()) {
    throw new Error("SCCP canonical text must be non-empty and trimmed.");
  }
  return bytesToHex(new TextEncoder().encode(value));
};

export const canonicalSolanaPubkeyWireHex = (
  value: string,
  label: string,
): string => {
  let publicKey: PublicKey;
  try {
    publicKey = new PublicKey(value);
  } catch {
    throw new Error(`${label} must be a canonical Solana public key.`);
  }
  const canonical = publicKey.toBase58();
  if (canonical !== value || publicKey.toBytes().every((byte) => byte === 0)) {
    throw new Error(`${label} must be a canonical non-zero Solana public key.`);
  }
  return bytesToHex(publicKey.toBytes());
};

export const exactSccpTransferEnvelope = (
  transfer: SccpTransferPayloadV1,
): SccpPayloadV1 => ({ Transfer: transfer });

export const exactSccpPayloadBytes = (
  transfer: SccpTransferPayloadV1,
): Uint8Array => canonicalSccpPayloadBytes(exactSccpTransferEnvelope(transfer));

export const exactSccpPayloadHash = (transfer: SccpTransferPayloadV1): string =>
  sccpPayloadHash(exactSccpPayloadBytes(transfer));

export const exactSccpMessageId = (
  lane: SccpLaneIdV1,
  transfer: SccpTransferPayloadV1,
): string => sccpMessageId(lane, exactSccpTransferEnvelope(transfer));

export type GovernedSolanaRoutePinsV1 = {
  revision: number;
  routeProgramAddress: string;
  routeStateAddress: string;
  tokenMintAddress: string;
  nativeVerifierProgramAddress: string;
  nativeVerifierMaterialAddress: string;
  nativeVerifierConfigHash: string;
  verifierKeyHash: string;
  tokenMultiplier: 1;
  sourceBridgeProgramAddress: string;
  sourceStateAddress: string;
  destinationBindingHash: string;
  routeConfigurationHash: string;
  sourceEmitterIdentityHash: string;
  sourceIdentityHash: string;
};

const solanaAddressFromGovernedHex = (
  value: unknown,
  label: string,
): string => {
  if (typeof value !== "string" || !/^[0-9A-F]{64}$/u.test(value)) {
    throw new Error(`${label} must be an exact uppercase 32-byte hex value.`);
  }
  const bytes = Uint8Array.from(value.match(/../gu) ?? [], (byte) =>
    Number.parseInt(byte, 16),
  );
  if (bytes.every((byte) => byte === 0)) {
    throw new Error(`${label} must be non-zero.`);
  }
  return new PublicKey(bytes).toBase58();
};

export const deriveSolanaProgramAddressV1 = ({
  programAddress,
  seeds,
}: {
  programAddress: string;
  seeds: readonly Uint8Array[];
}): { address: string; bump: number } => {
  // The bump occupies the final runtime seed. Keep this implementation in the
  // renderer-safe module: web3.js' synchronous helper relies on Node Buffer
  // behavior and can exhaust every bump in a browser/jsdom environment.
  if (seeds.length >= SOLANA_MAX_PROGRAM_ADDRESS_SEEDS_V1) {
    throw new Error(
      "Solana program-derived-address seeds must contain at most 15 byte arrays of at most 32 bytes each.",
    );
  }
  const stableSeeds = seeds.map((seed) => {
    if (
      !ArrayBuffer.isView(seed) ||
      seed.BYTES_PER_ELEMENT !== 1 ||
      seed.length > SOLANA_MAX_PROGRAM_ADDRESS_SEED_BYTES_V1
    ) {
      throw new Error(
        "Solana program-derived-address seeds must contain at most 15 byte arrays of at most 32 bytes each.",
      );
    }
    return Uint8Array.from(seed);
  });
  const programBytes = new PublicKey(programAddress).toBytes();
  for (let bump = 255; bump >= 0; bump -= 1) {
    const parts = [
      ...stableSeeds,
      Uint8Array.of(bump),
      programBytes,
      SOLANA_PROGRAM_DERIVED_ADDRESS_MARKER_V1,
    ];
    const preimage = new Uint8Array(
      parts.reduce((length, part) => length + part.length, 0),
    );
    let offset = 0;
    for (const part of parts) {
      preimage.set(part, offset);
      offset += part.length;
    }
    const candidate = sha256(preimage);
    if (!PublicKey.isOnCurve(candidate)) {
      return Object.freeze({
        address: new PublicKey(candidate).toBase58(),
        bump,
      });
    }
  }
  throw new Error("Unable to derive the canonical Solana program address.");
};

export const deriveSccpSolanaRouteStateAddressV1 = ({
  routeProgramAddress,
  role,
  tokenMintAddress,
}: {
  routeProgramAddress: string;
  role: 1 | 2;
  tokenMintAddress: string;
}): string => {
  if (
    role !== SCCP_SOLANA_DESTINATION_ROLE_V1 &&
    role !== SCCP_SOLANA_SOURCE_ROLE_V1
  ) {
    throw new Error("Solana SCCP route-state role must be 1 or 2.");
  }
  return deriveSolanaProgramAddressV1({
    programAddress: routeProgramAddress,
    seeds: [
      new TextEncoder().encode(SCCP_SOLANA_ROUTE_STATE_SEED_V1),
      Uint8Array.of(role),
      new PublicKey(tokenMintAddress).toBytes(),
    ],
  }).address;
};

export const readGovernedSolanaRoutePinsV1 = (
  manifestValue: Record<string, unknown> | null | undefined,
): GovernedSolanaRoutePinsV1 => {
  const manifest = requireRecord(
    manifestValue,
    "governed taira_sol_xor route manifest",
  );
  if (manifest.route_id !== SCCP_SOLANA_XOR_ROUTE_ID_V1) {
    throw new Error(
      "The governed Solana route must have the exact taira_sol_xor route id.",
    );
  }
  if (manifest.asset_key !== SCCP_XOR_ASSET_KEY_V1) {
    throw new Error(
      "The governed Solana route must settle the exact XOR asset key.",
    );
  }
  if (
    !Number.isSafeInteger(manifest.revision) ||
    Number(manifest.revision) !== 1
  ) {
    throw new Error(
      "The governed first-release Solana route revision must be exactly 1.",
    );
  }
  const revision = Number(manifest.revision);
  const activation = requireRecord(
    manifest.activation,
    "governed taira_sol_xor activation",
  );
  if (
    activation.activation !== "bidirectional" ||
    activation.direction !== null
  ) {
    throw new Error(
      "The governed Solana route must be exactly bidirectional with a null direction.",
    );
  }
  if (manifest.inbound_finality_cutoff !== null) {
    throw new Error(
      "The active governed Solana route must have a null inbound finality cutoff.",
    );
  }
  const syntheticAnchorHash = "A5".repeat(32);
  try {
    normalizeSccpRegistry({
      version: 1,
      lanes: [
        {
          lane_id: manifest.lane_id,
          native_trust_anchors: [
            {
              backend: { backend: "solana_agave_v1", protocol: null },
              anchor_hash: syntheticAnchorHash,
              checkpoint_height: 1,
            },
          ],
          current_native_trust_anchor_hash: syntheticAnchorHash,
          routes: [manifest],
        },
      ],
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(
      `The governed Solana route is not an exact closed first-release registry route: ${reason}`,
    );
  }
  const lane = manifest.lane_id as SccpLaneIdV1;
  if (sccpLaneIdHash(lane) !== sccpLaneIdHash(SCCP_SOLANA_TO_TAIRA_LANE_V1)) {
    throw new Error(
      "The governed Solana route must use the exact Solana-testnet-to-TAIRA lane.",
    );
  }
  const destination = requireRecord(
    manifest.destination,
    "governed taira_sol_xor destination",
  );
  if (destination.family !== "solana") {
    throw new Error(
      "The governed taira_sol_xor destination family must be solana.",
    );
  }
  const deployment = requireRecord(
    destination.deployment,
    "governed taira_sol_xor Solana deployment",
  ) as unknown as SccpSolanaDestinationDeploymentV1;
  const sourceIdentity = requireRecord(
    manifest.source_identity,
    "governed taira_sol_xor source identity",
  ) as unknown as SccpSourceIdentityV1;
  const sourceHashes = deriveSccpSolanaSourceIdentityHashesV1(sourceIdentity);
  const sourceEmitterEnvelope = requireRecord(
    sourceIdentity.emitter,
    "governed taira_sol_xor source emitter",
  );
  if (sourceEmitterEnvelope.emitter !== "solana") {
    throw new Error(
      "The governed taira_sol_xor source emitter must be solana.",
    );
  }
  const sourceEmitter = requireRecord(
    sourceEmitterEnvelope.identity,
    "governed taira_sol_xor Solana source emitter identity",
  );
  const destinationHashes = deriveSccpSolanaDestinationHashesV1(
    deployment,
    sourceEmitter.program_id as string,
    revision,
  );
  if (Number(deployment.taira_to_token_multiplier) !== 1) {
    throw new Error(
      "The governed Solana destination multiplier must be exactly 1 for the 9-decimal SPL mint.",
    );
  }
  const pins: GovernedSolanaRoutePinsV1 = {
    revision,
    routeProgramAddress: solanaAddressFromGovernedHex(
      deployment.route_program_id,
      "governed Solana route program id",
    ),
    routeStateAddress: solanaAddressFromGovernedHex(
      deployment.route_state_account,
      "governed Solana route state account",
    ),
    tokenMintAddress: solanaAddressFromGovernedHex(
      deployment.token_mint_address,
      "governed Solana token mint",
    ),
    nativeVerifierProgramAddress: solanaAddressFromGovernedHex(
      deployment.native_verifier_program_id,
      "governed Solana native verifier program id",
    ),
    nativeVerifierMaterialAddress: solanaAddressFromGovernedHex(
      deployment.native_verifier_material_account,
      "governed Solana native verifier material account",
    ),
    nativeVerifierConfigHash: normalizeHex32(
      deployment.native_verifier_config_hash,
      "governed Solana native verifier config hash",
    ),
    verifierKeyHash: normalizeHex32(
      deployment.verifier_key_hash,
      "governed Solana verifier key hash",
    ),
    tokenMultiplier: 1,
    sourceBridgeProgramAddress: solanaAddressFromGovernedHex(
      sourceEmitter.program_id,
      "governed Solana source bridge program id",
    ),
    sourceStateAddress: solanaAddressFromGovernedHex(
      sourceEmitter.state_account,
      "governed Solana source state account",
    ),
    destinationBindingHash: normalizeHex32(
      destinationHashes.destination_binding_hash,
      "governed Solana destination binding hash",
    ),
    routeConfigurationHash: normalizeHex32(
      destinationHashes.route_configuration_hash,
      "governed Solana route configuration hash",
    ),
    sourceEmitterIdentityHash: normalizeHex32(
      sourceHashes.source_emitter_identity_hash,
      "governed Solana source emitter identity hash",
    ),
    sourceIdentityHash: normalizeHex32(
      sourceHashes.source_identity_hash,
      "governed Solana source identity hash",
    ),
  };
  const addressRoles = [
    pins.routeProgramAddress,
    pins.routeStateAddress,
    pins.tokenMintAddress,
    pins.nativeVerifierProgramAddress,
    pins.nativeVerifierMaterialAddress,
    pins.sourceBridgeProgramAddress,
    pins.sourceStateAddress,
  ];
  if (new Set(addressRoles).size !== addressRoles.length) {
    throw new Error(
      "The governed Solana route reuses role-separated program, state, mint, or verifier addresses.",
    );
  }
  const expectedDestinationState = deriveSccpSolanaRouteStateAddressV1({
    routeProgramAddress: pins.routeProgramAddress,
    role: SCCP_SOLANA_DESTINATION_ROLE_V1,
    tokenMintAddress: pins.tokenMintAddress,
  });
  const expectedSourceState = deriveSccpSolanaRouteStateAddressV1({
    routeProgramAddress: pins.sourceBridgeProgramAddress,
    role: SCCP_SOLANA_SOURCE_ROLE_V1,
    tokenMintAddress: pins.tokenMintAddress,
  });
  if (
    pins.routeStateAddress !== expectedDestinationState ||
    pins.sourceStateAddress !== expectedSourceState
  ) {
    throw new Error(
      "The governed Solana route states are not the exact role-and-mint PDAs.",
    );
  }
  return pins;
};
