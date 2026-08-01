/* global BigInt */

import { createHash } from "node:crypto";
import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";
import {
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaSourceIdentityHashesV1,
  normalizeSccpCapabilities,
  normalizeSccpRegistry,
  normalizeSccpRouteGovernanceAction,
} from "@iroha/iroha-js/sccp";

export const SOLANA_SCCP_REGISTRY_PATH = "/v1/sccp/registry";
export const SOLANA_SCCP_GOVERNANCE_DRAFT_PATH =
  "/v1/gov/proposals/sccp-route-governance";
export const SOLANA_SCCP_SOURCE_NETWORK = "solana_testnet";
export const SOLANA_SCCP_TARGET_NETWORK = "sora_taira";
export const SOLANA_SCCP_ROUTE_ID = "taira_sol_xor";
export const SOLANA_SCCP_ASSET_KEY = "xor";
export const SOLANA_SCCP_REVISION = 1;
export const SOLANA_SCCP_ROUTE_STATE_SEED = "sccp-route-state-v1";
export const SOLANA_SCCP_DESTINATION_ROLE = 1;
export const SOLANA_SCCP_SOURCE_ROLE = 2;
const SOLANA_BPF_UPGRADEABLE_LOADER =
  "BPFLoaderUpgradeab1e11111111111111111111111";
const RESERVED_SOLANA_PROGRAM_IDS = new Set([
  "11111111111111111111111111111111",
  "ComputeBudget111111111111111111111111111111",
  SOLANA_BPF_UPGRADEABLE_LOADER,
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
]);

const canonicalJsonValue = (value) => {
  if (Array.isArray(value)) {
    return value.map(canonicalJsonValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonicalJsonValue(value[key])]),
  );
};

/** Stable JSON used for reviewed public SCCP governance artifacts. */
export const canonicalSccpJson = (value) =>
  JSON.stringify(canonicalJsonValue(value));

export const canonicalSccpObjectSha256 = (value) =>
  `0x${createHash("sha256").update(canonicalSccpJson(value)).digest("hex")}`;

export const canonicalSccpRegistrySha256 = (registry) =>
  canonicalSccpObjectSha256(normalizeSccpRegistry(registry));

const exactNetwork = (value, expected, label) => {
  if (
    value?.network !== expected ||
    value?.profile !== null ||
    Object.keys(value ?? {})
      .sort()
      .join("\0") !== "network\0profile"
  ) {
    throw new TypeError(`${label} must be the exact ${expected} network tag.`);
  }
};

const isExactSolanaLane = (lane) => {
  try {
    exactNetwork(
      lane?.lane_id?.source,
      SOLANA_SCCP_SOURCE_NETWORK,
      "lane source",
    );
    exactNetwork(
      lane?.lane_id?.target,
      SOLANA_SCCP_TARGET_NETWORK,
      "lane target",
    );
    return true;
  } catch {
    return false;
  }
};

const rawPubkeyToBase58 = (value, label) => {
  if (typeof value !== "string" || !/^[0-9A-F]{64}$/u.test(value)) {
    throw new TypeError(
      `${label} must be canonical uppercase raw 32-byte hex.`,
    );
  }
  return new PublicKey(Buffer.from(value, "hex")).toBase58();
};

const exactUpperHexBytes = (value, label) => {
  if (typeof value !== "string" || !/^[0-9A-F]{64}$/u.test(value)) {
    throw new TypeError(`${label} must be canonical uppercase 32-byte hex.`);
  }
  return Uint8Array.from(Buffer.from(value, "hex"));
};

const littleEndian = (value, width, label) => {
  let remaining;
  try {
    remaining = BigInt(value);
  } catch {
    throw new TypeError(`${label} must be an unsigned integer.`);
  }
  if (remaining < 0n || remaining >= 1n << BigInt(width * 8)) {
    throw new TypeError(`${label} is outside its canonical integer width.`);
  }
  const bytes = new Uint8Array(width);
  for (let index = 0; index < width; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
};

const concatBytes = (...parts) => {
  const output = new Uint8Array(
    parts.reduce((total, part) => total + part.length, 0),
  );
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

/** Re-derive the exact governed policy roles stored in SCCPMAT1. */
export const deriveExactSolanaProofPolicyHashes = (deployment) => {
  const policy = deployment?.outbound_proof_policy;
  const commitments = policy?.semantic_profile?.commitments;
  const anchor = policy?.sora_finality_anchor;
  if (
    policy?.version !== 1 ||
    policy?.semantic_profile?.profile !==
      "sora_taira_finality_inclusion_groth16_bn254" ||
    commitments?.version !== 1 ||
    anchor?.version !== 1 ||
    anchor?.source_network?.network !== "sora_taira" ||
    anchor?.source_network?.profile !== null ||
    anchor?.protocol_version !== 3
  ) {
    throw new TypeError("Solana outbound proof policy is not exact SCCP V1.");
  }
  const circuit = exactUpperHexBytes(
    commitments.circuit_commitment,
    "circuit commitment",
  );
  const witnessGenerator = exactUpperHexBytes(
    commitments.witness_generator_commitment,
    "witness-generator commitment",
  );
  const schema = exactUpperHexBytes(
    commitments.public_signal_schema_hash,
    "public-signal schema commitment",
  );
  const semanticCanonical = concatBytes(
    Uint8Array.of(1, 0, 1),
    circuit,
    witnessGenerator,
    schema,
  );
  const semanticProfileHash = keccak_256(
    concatBytes(
      new TextEncoder().encode("sccp:semantic-proof-profile:v1"),
      semanticCanonical,
    ),
  );
  const anchorCanonical = concatBytes(
    Uint8Array.of(1, 1),
    littleEndian(anchor.protocol_version, 2, "anchor protocol version"),
    exactUpperHexBytes(anchor.chain_id_hash, "anchor chain-id hash"),
    littleEndian(anchor.checkpoint_height, 8, "anchor checkpoint height"),
    exactUpperHexBytes(anchor.checkpoint_block_hash, "anchor block hash"),
    exactUpperHexBytes(anchor.checkpoint_context_id, "anchor context id"),
    exactUpperHexBytes(
      anchor.checkpoint_finality_artifact_hash,
      "anchor finality artifact hash",
    ),
  );
  const soraFinalityAnchorHash = keccak_256(
    concatBytes(
      new TextEncoder().encode("sccp:sora-finality-anchor:v1"),
      anchorCanonical,
    ),
  );
  const hex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;
  return Object.freeze({
    soraFinalityAnchorHash: hex(soraFinalityAnchorHash),
    semanticProfileHash: hex(semanticProfileHash),
    circuitCommitment: hex(circuit),
    witnessGeneratorCommitment: hex(witnessGenerator),
    publicSignalSchemaHash: hex(schema),
  });
};

const requireOne = (values, label) => {
  if (values.length !== 1) {
    throw new TypeError(
      `Expected exactly one ${label}; found ${values.length}.`,
    );
  }
  return values[0];
};

const activationName = (route) => route?.activation?.activation;

/**
 * Inspect exact lane/route presence without conflating an absent route with a
 * failed registry read. Duplicate exact identities are always rejected.
 */
export const inspectExactSolanaRegistryState = (registryValue) => {
  const registry = normalizeSccpRegistry(registryValue);
  const lanes = registry.lanes.filter(isExactSolanaLane);
  if (lanes.length > 1) {
    throw new TypeError(
      `Expected at most one Solana-testnet to SORA-TAIRA SCCP lane; found ${lanes.length}.`,
    );
  }
  const lane = lanes[0] ?? null;
  const routes = (lane?.routes ?? []).filter(
    (candidate) =>
      candidate?.route_id === SOLANA_SCCP_ROUTE_ID &&
      candidate?.asset_key === SOLANA_SCCP_ASSET_KEY &&
      candidate?.revision === SOLANA_SCCP_REVISION,
  );
  if (routes.length > 1) {
    throw new TypeError(
      `Expected at most one taira_sol_xor revision-1 route; found ${routes.length}.`,
    );
  }
  const route = routes[0] ?? null;
  return Object.freeze({
    registry,
    lane,
    route,
    lanePresent: lane !== null,
    routePresent: route !== null,
    activation: route === null ? null : activationName(route),
    currentNativeTrustAnchorHash:
      lane?.current_native_trust_anchor_hash ?? null,
  });
};

export const selectExactSolanaRegistryRoute = (registryValue, options = {}) => {
  const state = inspectExactSolanaRegistryState(registryValue);
  const { registry } = state;
  const lane = requireOne(
    state.lane === null ? [] : [state.lane],
    "Solana-testnet to SORA-TAIRA SCCP lane",
  );
  const route = requireOne(
    state.route === null ? [] : [state.route],
    "taira_sol_xor revision-1 route",
  );
  if (route?.destination?.family !== "solana") {
    throw new TypeError(
      "taira_sol_xor destination must be the exact Solana family.",
    );
  }
  if (route?.source_identity?.emitter?.emitter !== "solana") {
    throw new TypeError(
      "taira_sol_xor source identity must be the exact Solana family.",
    );
  }
  if (
    options.requireBidirectional === true &&
    activationName(route) !== "bidirectional"
  ) {
    throw new TypeError(
      "taira_sol_xor must be bidirectional before production acceptance.",
    );
  }
  if (options.requireCurrentTrustAnchor === true) {
    const current = lane.current_native_trust_anchor_hash;
    const anchor = lane.native_trust_anchors.at(-1);
    if (
      !anchor ||
      current !== anchor.anchor_hash ||
      anchor?.backend?.backend !== "solana_agave_v1"
    ) {
      throw new TypeError(
        "taira_sol_xor requires the exact current solana_agave_v1 trust anchor.",
      );
    }
  }
  return Object.freeze({ registry, lane, route });
};

const assertDistinctSolanaRoles = (route) => {
  const deployment = route.destination.deployment;
  const source = route.source_identity.emitter.identity;
  const programCodeHashes = {
    destination: deployment.route_program_code_hash,
    source: source.program_code_hash,
    nativeVerifier: deployment.native_verifier_program_code_hash,
  };
  if (new Set(Object.values(programCodeHashes)).size !== 3) {
    throw new TypeError(
      "Exact Solana destination, source, and native-verifier roles require distinct executable code hashes.",
    );
  }
  const addressRoles = {
    tokenMint: deployment.token_mint_address,
    destinationProgram: deployment.route_program_id,
    destinationProgramData: deployment.route_program_data_address,
    destinationState: deployment.route_state_account,
    nativeVerifierProgram: deployment.native_verifier_program_id,
    nativeVerifierProgramData: deployment.native_verifier_program_data_address,
    nativeVerifierMaterial: deployment.native_verifier_material_account,
    sourceProgram: source.program_id,
    sourceProgramData: source.program_data_address,
    sourceState: source.state_account,
  };
  const duplicates = Object.entries(addressRoles).filter(
    ([, value], index, entries) =>
      entries.findIndex(([, other]) => other === value) !== index,
  );
  if (duplicates.length > 0) {
    throw new TypeError(
      `Solana governed deployment aliases role-separated accounts: ${duplicates
        .map(([role]) => role)
        .join(", ")}.`,
    );
  }
  const tokenMint = rawPubkeyToBase58(
    addressRoles.tokenMint,
    "Solana token mint",
  );
  const destinationProgram = rawPubkeyToBase58(
    addressRoles.destinationProgram,
    "Solana destination program",
  );
  const sourceProgram = rawPubkeyToBase58(
    addressRoles.sourceProgram,
    "Solana source program",
  );
  const nativeVerifierProgram = rawPubkeyToBase58(
    addressRoles.nativeVerifierProgram,
    "Solana native verifier program",
  );
  if (
    [destinationProgram, sourceProgram, nativeVerifierProgram].some((program) =>
      RESERVED_SOLANA_PROGRAM_IDS.has(program),
    )
  ) {
    throw new TypeError(
      "Exact Solana deployment roles must use fresh non-builtin program IDs.",
    );
  }
  const deriveProgramData = (program) =>
    PublicKey.findProgramAddressSync(
      [new PublicKey(program).toBuffer()],
      new PublicKey(SOLANA_BPF_UPGRADEABLE_LOADER),
    )[0].toBase58();
  if (
    rawPubkeyToBase58(
      addressRoles.destinationProgramData,
      "Solana destination ProgramData",
    ) !== deriveProgramData(destinationProgram) ||
    rawPubkeyToBase58(
      addressRoles.sourceProgramData,
      "Solana source ProgramData",
    ) !== deriveProgramData(sourceProgram) ||
    rawPubkeyToBase58(
      addressRoles.nativeVerifierProgramData,
      "Solana native verifier ProgramData",
    ) !== deriveProgramData(nativeVerifierProgram)
  ) {
    throw new TypeError(
      "Exact Solana ProgramData accounts must be the Loader-v3 PDAs for their role programs.",
    );
  }
  const deriveState = (program, role) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from(SOLANA_SCCP_ROUTE_STATE_SEED, "utf8"),
        Buffer.from([role]),
        new PublicKey(tokenMint).toBuffer(),
      ],
      new PublicKey(program),
    )[0].toBase58();
  if (
    rawPubkeyToBase58(
      addressRoles.destinationState,
      "Solana destination state",
    ) !== deriveState(destinationProgram, SOLANA_SCCP_DESTINATION_ROLE) ||
    rawPubkeyToBase58(addressRoles.sourceState, "Solana source state") !==
      deriveState(sourceProgram, SOLANA_SCCP_SOURCE_ROLE)
  ) {
    throw new TypeError(
      "Exact Solana route states must be the role-and-mint PDAs.",
    );
  }
  return addressRoles;
};

export const summarizeExactSolanaRegistryRoute = (
  registryValue,
  options = {},
) => {
  const { registry, lane, route } = selectExactSolanaRegistryRoute(
    registryValue,
    options,
  );
  const deployment = route.destination.deployment;
  const source = route.source_identity.emitter.identity;
  const hashes = deriveSccpSolanaDestinationHashesV1(
    deployment,
    source.program_id,
    route.revision,
  );
  const sourceHashes = deriveSccpSolanaSourceIdentityHashesV1(
    route.source_identity,
  );
  const proofPolicy = deriveExactSolanaProofPolicyHashes(deployment);
  const roles = assertDistinctSolanaRoles(route);
  return Object.freeze({
    registrySha256: canonicalSccpRegistrySha256(registry),
    routeId: route.route_id,
    assetKey: route.asset_key,
    revision: route.revision,
    activation: activationName(route),
    currentNativeTrustAnchorHash: lane.current_native_trust_anchor_hash,
    destinationBindingHash: hashes.destination_binding_hash,
    deploymentConfigHash: hashes.deployment_config_hash,
    routeConfigurationHash: hashes.route_configuration_hash,
    sourceEmitterIdentityHash: sourceHashes.source_emitter_identity_hash,
    sourceIdentityHash: sourceHashes.source_identity_hash,
    settlementAssetDefinitionId: route.settlement.asset_definition_id,
    custodyAccountId: route.settlement.custody_account_id,
    payloadAmountScale: route.settlement.payload_amount_scale,
    programs: Object.freeze({
      destination: rawPubkeyToBase58(
        deployment.route_program_id,
        "destination program",
      ),
      source: rawPubkeyToBase58(source.program_id, "source program"),
      nativeVerifier: rawPubkeyToBase58(
        deployment.native_verifier_program_id,
        "native verifier program",
      ),
    }),
    accounts: Object.freeze(
      Object.fromEntries(
        Object.entries(roles).map(([role, value]) => [
          role,
          rawPubkeyToBase58(value, `Solana ${role}`),
        ]),
      ),
    ),
    programDataSlots: Object.freeze({
      destination: deployment.route_program_data_slot,
      source: source.program_data_slot,
      nativeVerifier: deployment.native_verifier_program_data_slot,
    }),
    codeHashes: Object.freeze({
      destination: `0x${deployment.route_program_code_hash.toLowerCase()}`,
      source: `0x${source.program_code_hash.toLowerCase()}`,
      nativeVerifier: `0x${deployment.native_verifier_program_code_hash.toLowerCase()}`,
    }),
    verifierKeyHash: `0x${deployment.verifier_key_hash.toLowerCase()}`,
    nativeVerifierConfigHash: `0x${deployment.native_verifier_config_hash.toLowerCase()}`,
    proofPolicy,
  });
};

export const validateExactSolanaSccpCapabilities = (value) => {
  const capabilities = normalizeSccpCapabilities(value);
  if (
    capabilities.registry_path !== SOLANA_SCCP_REGISTRY_PATH ||
    capabilities.proof_submit_path === null ||
    capabilities.native_message_submit_path === null
  ) {
    throw new TypeError(
      "TAIRA must expose the exact registry and both SCCP proof submission paths.",
    );
  }
  return capabilities;
};

export const buildSolanaRouteRegistrationDraft = ({
  route,
  nativeTrustAnchor,
  window = null,
  mode = "Zk",
}) => {
  if (
    nativeTrustAnchor?.backend?.backend !== "solana_agave_v1" ||
    nativeTrustAnchor.backend.protocol !== null ||
    typeof nativeTrustAnchor.anchor_hash !== "string" ||
    !/^[0-9A-F]{64}$/u.test(nativeTrustAnchor.anchor_hash) ||
    /^0{64}$/u.test(nativeTrustAnchor.anchor_hash) ||
    !Number.isSafeInteger(nativeTrustAnchor.checkpoint_height) ||
    nativeTrustAnchor.checkpoint_height <= 0
  ) {
    throw new TypeError(
      "Solana route registration requires the exact nonzero solana_agave_v1 trust anchor.",
    );
  }
  if (mode !== "Zk") {
    throw new TypeError("Solana route governance requires Zk voting mode.");
  }
  const stagedRoute = structuredClone(route);
  stagedRoute.activation = { activation: "staged", direction: null };
  stagedRoute.inbound_finality_cutoff = null;
  const action = {
    action: "Register",
    route: {
      route: stagedRoute,
      native_trust_anchor: nativeTrustAnchor ?? null,
    },
  };
  normalizeSccpRouteGovernanceAction(action);
  return Object.freeze({ action, window, mode });
};

export const buildSolanaRouteActivationDraft = ({
  route,
  window = null,
  mode = "Zk",
}) => {
  if (mode !== "Zk") {
    throw new TypeError("Solana route governance requires Zk voting mode.");
  }
  const action = {
    action: "SetActivation",
    route: {
      key: {
        lane_id: structuredClone(route.lane_id),
        route_id: route.route_id,
        asset_key: route.asset_key,
        revision: route.revision,
      },
      expected_current: { activation: "staged", direction: null },
      next: { activation: "bidirectional", direction: null },
      inbound_finality_cutoff: null,
    },
  };
  normalizeSccpRouteGovernanceAction(action);
  return Object.freeze({ action, window, mode });
};

const jsonEqual = (left, right) =>
  canonicalSccpJson(left) === canonicalSccpJson(right);

const exactKeys = (value, expected, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (!jsonEqual(actual, wanted)) {
    throw new TypeError(`${label} contains an unknown or missing field.`);
  }
  return value;
};

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const normalizeProgramArtifactSha256 = (value) => {
  const pins = exactKeys(
    value,
    ["destination", "source", "native_verifier"],
    "Solana program artifact SHA-256 pins",
  );
  const hashes = Object.values(pins);
  if (
    hashes.some(
      (hash) =>
        typeof hash !== "string" ||
        !/^0x[0-9a-f]{64}$/u.test(hash) ||
        /^0x0{64}$/u.test(hash),
    ) ||
    new Set(hashes).size !== hashes.length
  ) {
    throw new TypeError(
      "Solana destination, source, and native-verifier artifact SHA-256 pins must be nonzero and distinct.",
    );
  }
  return Object.freeze({ ...pins });
};

/**
 * Build the two reviewed, separately enacted actions for first-release
 * taira_sol_xor governance. Registration is always staged; activation is a
 * second proposal and cannot be conflated with registration.
 */
export const buildSolanaRouteGovernancePlan = ({
  route,
  nativeTrustAnchor,
  orderedInitializationEvidenceSha256,
  freshDeployReportSha256,
  programArtifactSha256,
  window = null,
  mode = "Zk",
}) => {
  if (
    typeof orderedInitializationEvidenceSha256 !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(orderedInitializationEvidenceSha256) ||
    /^0x0{64}$/u.test(orderedInitializationEvidenceSha256)
  ) {
    throw new TypeError(
      "Solana governance requires a nonzero ordered-initialization evidence SHA-256 pin.",
    );
  }
  if (
    typeof freshDeployReportSha256 !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(freshDeployReportSha256) ||
    /^0x0{64}$/u.test(freshDeployReportSha256)
  ) {
    throw new TypeError(
      "Solana governance requires a nonzero canonical fresh-deploy report SHA-256 pin.",
    );
  }
  const registration = buildSolanaRouteRegistrationDraft({
    route,
    nativeTrustAnchor,
    window,
    mode,
  });
  const artifactPins = normalizeProgramArtifactSha256(programArtifactSha256);
  const activation = buildSolanaRouteActivationDraft({ route, window, mode });
  const stagedRoute = registration.action.route.route;
  const syntheticRegistry = {
    version: 1,
    lanes: [
      {
        lane_id: structuredClone(stagedRoute.lane_id),
        native_trust_anchors:
          nativeTrustAnchor === null
            ? []
            : [structuredClone(nativeTrustAnchor)],
        current_native_trust_anchor_hash:
          nativeTrustAnchor === null ? null : nativeTrustAnchor.anchor_hash,
        routes: [structuredClone(stagedRoute)],
      },
    ],
  };
  const summary = summarizeExactSolanaRegistryRoute(syntheticRegistry);
  const body = {
    schema: "iroha-sccp-solana-route-governance-plan/v1",
    route_id: SOLANA_SCCP_ROUTE_ID,
    asset_key: SOLANA_SCCP_ASSET_KEY,
    revision: SOLANA_SCCP_REVISION,
    fresh_deploy_report_sha256: freshDeployReportSha256,
    ordered_initialization_evidence_sha256: orderedInitializationEvidenceSha256,
    program_artifact_sha256: artifactPins,
    route_hashes: {
      destination_binding_hash: summary.destinationBindingHash,
      deployment_config_hash: summary.deploymentConfigHash,
      route_configuration_hash: summary.routeConfigurationHash,
      source_emitter_identity_hash: summary.sourceEmitterIdentityHash,
      source_identity_hash: summary.sourceIdentityHash,
    },
    registration,
    activation,
  };
  return Object.freeze({
    ...body,
    plan_sha256: canonicalSccpObjectSha256(body),
  });
};

/** Validate a reviewed plan and rederive every action and governed hash. */
export const validateSolanaRouteGovernancePlan = (value) => {
  const plan = exactKeys(
    value,
    [
      "schema",
      "route_id",
      "asset_key",
      "revision",
      "fresh_deploy_report_sha256",
      "ordered_initialization_evidence_sha256",
      "program_artifact_sha256",
      "route_hashes",
      "registration",
      "activation",
      "plan_sha256",
    ],
    "Solana SCCP governance plan",
  );
  if (containsSecretField(plan)) {
    throw new TypeError(
      "Solana SCCP governance plans must not contain secret-bearing fields.",
    );
  }
  if (
    plan.schema !== "iroha-sccp-solana-route-governance-plan/v1" ||
    plan.route_id !== SOLANA_SCCP_ROUTE_ID ||
    plan.asset_key !== SOLANA_SCCP_ASSET_KEY ||
    plan.revision !== SOLANA_SCCP_REVISION
  ) {
    throw new TypeError("Solana SCCP governance plan identity is not exact.");
  }
  const registration = exactKeys(
    plan.registration,
    ["action", "window", "mode"],
    "Solana SCCP registration draft",
  );
  const activation = exactKeys(
    plan.activation,
    ["action", "window", "mode"],
    "Solana SCCP activation draft",
  );
  normalizeSccpRouteGovernanceAction(registration.action);
  normalizeSccpRouteGovernanceAction(activation.action);
  const route = registration.action?.route?.route;
  const anchor = registration.action?.route?.native_trust_anchor ?? null;
  const rebuilt = buildSolanaRouteGovernancePlan({
    route,
    nativeTrustAnchor: anchor,
    orderedInitializationEvidenceSha256:
      plan.ordered_initialization_evidence_sha256,
    freshDeployReportSha256: plan.fresh_deploy_report_sha256,
    programArtifactSha256: plan.program_artifact_sha256,
    window: registration.window,
    mode: registration.mode,
  });
  if (
    !jsonEqual(activation.window, registration.window) ||
    activation.mode !== registration.mode ||
    !jsonEqual(plan.program_artifact_sha256, rebuilt.program_artifact_sha256) ||
    !jsonEqual(plan.route_hashes, rebuilt.route_hashes) ||
    !jsonEqual(plan.registration, rebuilt.registration) ||
    !jsonEqual(plan.activation, rebuilt.activation)
  ) {
    throw new TypeError(
      "Solana SCCP governance plan actions or hash pins do not rederive exactly.",
    );
  }
  const unsigned = Object.fromEntries(
    Object.entries(plan).filter(([key]) => key !== "plan_sha256"),
  );
  if (
    typeof plan.plan_sha256 !== "string" ||
    !/^0x[0-9a-f]{64}$/u.test(plan.plan_sha256) ||
    plan.plan_sha256 !== canonicalSccpObjectSha256(unsigned)
  ) {
    throw new TypeError(
      "Solana SCCP governance plan SHA-256 does not match its canonical body.",
    );
  }
  return Object.freeze({
    plan,
    registration,
    activation,
    route,
    nativeTrustAnchor: anchor,
  });
};
