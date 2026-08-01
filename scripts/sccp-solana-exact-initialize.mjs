#!/usr/bin/env node
/* global BigInt */
import { createHash, randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { lstat, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bs58 from "bs58";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  deriveSccpSolanaDestinationHashesV1,
  deriveSccpSolanaNativeVerifierConfigHashV1,
  deriveSccpSolanaSourceIdentityHashesV1,
} from "@iroha/iroha-js/sccp";
import {
  ComputeBudgetProgram,
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  SOLANA_EXACT_SCCP_ROLE_DESTINATION,
  SOLANA_EXACT_SCCP_ROLE_SOURCE,
  buildExactSolanaClassicMintCreationPlan,
  buildExactSolanaNativeMaterialUploadPlan,
  buildExactSolanaRouteStateInitializeInstruction,
  deriveExactSolanaNativeVerifierConfig,
  deriveExactSolanaRouteStateAddress,
  inspectExactSolanaClassicMintAccount,
  inspectExactSolanaNativeMaterialAccount,
  inspectExactSolanaRouteStateAccount,
  loadRuntimeSolanaSigner,
  normalizeRuntimeSecretEnvName,
  zeroizeRuntimeSolanaSigner,
} from "./sccp-solana-deploy.mjs";
import {
  SOLANA_ORDERED_INITIALIZATION_SCHEMA,
  SOLANA_TESTNET_RPC_URL,
  validateSolanaOrderedInitializationEvidence,
  verifySolanaAtomicProgramFinalizationTransaction,
  verifySolanaOrderedInitializationTransactions,
} from "./e2e/sccp-solana-ordered-initialization.mjs";
import {
  parseUpgradeableProgramAccountData,
  parseUpgradeableProgramDataAccountData,
} from "./e2e/sccp-solana-route-preflight.mjs";
import {
  validateSolanaLoaderV3FreshDeployReport,
  verifySolanaLoaderV3FreshDeployReportTransactions,
} from "./solana-loader-v3-fresh-deploy.mjs";

export const SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA =
  "iroha-sccp-solana-exact-initializer-input/v2";
export const SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA =
  "iroha-sccp-solana-exact-initializer-journal/v1";
export const DEFAULT_SOLANA_EXACT_INITIALIZER_PAYER_ENV =
  "SCCP_SOLANA_INITIALIZER_SIGNER";
export const DEFAULT_SOLANA_EXACT_INITIALIZER_MINT_ENV =
  "SCCP_SOLANA_INITIALIZER_MINT_SIGNER";

export const SOLANA_EXACT_INITIALIZER_USAGE = `Usage:
  node scripts/sccp-solana-exact-initialize.mjs \\
    --input PATH --expected-input-sha256 0xHASH \\
    --fresh-deploy-report PATH --expected-fresh-deploy-report-sha256 0xHASH \\
    --journal PATH --evidence PATH --submit true \\
    [--payer-env NAME] [--mint-env NAME]

Initializes the exact immutable three-program Solana SCCP route after verifying
the pinned atomic Loader-v3 finalization. This command mutates public testnet
state only with the explicit --submit true opt-in.

Options:
  --input PATH                    Reviewed initializer input JSON
  --expected-input-sha256 0xHASH  Exact lowercase SHA-256 pin
  --fresh-deploy-report PATH      Canonical completed fresh-deploy report
  --expected-fresh-deploy-report-sha256 0xHASH
                                  Independent exact report-byte SHA-256 pin
  --journal PATH                  Durable initialization journal
  --evidence PATH                 Ordered-initialization evidence output
  --payer-env NAME                Runtime-only signer environment variable
  --mint-env NAME                 Runtime-only preselected mint signer variable
  --submit true                   Required irreversible-mutation opt-in
  --help, -h                      Show help without reading files or environment
`;

const modulePath = fileURLToPath(import.meta.url);
const HASH32 = /^0x[0-9a-f]{64}$/u;
const UPPER_HEX32 = /^[0-9A-F]{64}$/u;
const ROUTE_ID = "taira_sol_xor";
const ASSET_KEY = "xor";
const REVISION = 1;
const MAX_COMPUTE_UNITS = 800_000;
const MAX_SOLANA_TRANSACTION_BYTES = 1_232;
const UPGRADEABLE_LOADER_ADDRESS =
  "BPFLoaderUpgradeab1e11111111111111111111111";
const TRUSTED_OUTPUT_PERMISSION_MASK = 0o022;
const NO_FOLLOW = fsConstants.O_NOFOLLOW;
const SEMANTIC_PROOF_PROFILE_PREFIX = Buffer.from(
  "sccp:semantic-proof-profile:v1",
  "utf8",
);
const SORA_FINALITY_ANCHOR_PREFIX = Buffer.from(
  "sccp:sora-finality-anchor:v1",
  "utf8",
);

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const canonicalJson = (value) =>
  JSON.stringify(value, (_key, child) =>
    typeof child === "bigint" ? child.toString() : child,
  );

const exactRecord = (value, keys, label) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains an unknown or missing field.`);
  }
  return value;
};

const publicKey = (value, label) => {
  let key;
  try {
    key = new PublicKey(value);
  } catch {
    throw new TypeError(`${label} must be a canonical Solana public key.`);
  }
  if (key.toBase58() !== value || key.toBytes().every((byte) => byte === 0)) {
    throw new TypeError(
      `${label} must be a canonical nonzero Solana public key.`,
    );
  }
  return key;
};

const hash32 = (value, label) => {
  if (
    typeof value !== "string" ||
    !HASH32.test(value) ||
    /^0x0{64}$/u.test(value)
  ) {
    throw new TypeError(`${label} must be nonzero lowercase 32-byte hex.`);
  }
  return value;
};

const upperHex32 = (value, label) => {
  if (typeof value !== "string" || !UPPER_HEX32.test(value)) {
    throw new TypeError(`${label} must be exact uppercase 32-byte hex.`);
  }
  return value;
};

const publicKeyUpperHex = (value, label) =>
  Buffer.from(publicKey(value, label).toBytes()).toString("hex").toUpperCase();

const prefixedLowerHash = (upperHex) => `0x${upperHex.toLowerCase()}`;

const littleEndian = (value, bytes, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  const encoded = Buffer.alloc(bytes);
  let remaining = BigInt(value);
  for (let index = 0; index < bytes; index += 1) {
    encoded[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) {
    throw new TypeError(`${label} does not fit its canonical width.`);
  }
  return encoded;
};

const keccakHash = (...parts) =>
  `0x${Buffer.from(keccak_256(Buffer.concat(parts))).toString("hex")}`;

const encodeGovernedVerifyingKey = (value) => {
  const word = (input, label) => Buffer.from(upperHex32(input, label), "hex");
  const g1 = (point, label) => {
    const record = exactRecord(point, ["x", "y"], label);
    return Buffer.concat([
      word(record.x, `${label}.x`),
      word(record.y, `${label}.y`),
    ]);
  };
  const g2 = (point, label) => {
    const record = exactRecord(point, ["x_c0", "x_c1", "y_c0", "y_c1"], label);
    return Buffer.concat(
      ["x_c0", "x_c1", "y_c0", "y_c1"].map((field) =>
        word(record[field], `${label}.${field}`),
      ),
    );
  };
  const key = exactRecord(
    value,
    ["version", "alpha1", "beta2", "gamma2", "delta2", "ic"],
    "governed_destination_deployment.verifying_key",
  );
  if (key.version !== 1) {
    throw new TypeError("Governed Solana verifying-key version must be 1.");
  }
  const icFields = [
    "constant",
    ...Array.from({ length: 11 }, (_, index) => `signal_${index}`),
  ];
  const ic = exactRecord(key.ic, icFields, "governed verifying-key IC");
  const bytes = Buffer.concat([
    g1(key.alpha1, "governed verifying-key alpha1"),
    g2(key.beta2, "governed verifying-key beta2"),
    g2(key.gamma2, "governed verifying-key gamma2"),
    g2(key.delta2, "governed verifying-key delta2"),
    ...icFields.map((field) =>
      g1(ic[field], `governed verifying-key ic.${field}`),
    ),
  ]);
  if (bytes.length !== 1_216) {
    throw new TypeError(
      "Governed Solana verifying key must encode exactly 1216 bytes.",
    );
  }
  return bytes;
};

const deriveGovernedProofPolicyHashes = (deployment) => {
  const policy = deployment.outbound_proof_policy;
  const commitments = policy.semantic_profile.commitments;
  const circuitCommitmentHash = prefixedLowerHash(
    upperHex32(commitments.circuit_commitment, "circuit commitment"),
  );
  const witnessGeneratorCommitmentHash = prefixedLowerHash(
    upperHex32(
      commitments.witness_generator_commitment,
      "witness generator commitment",
    ),
  );
  const publicSignalSchemaHash = prefixedLowerHash(
    upperHex32(
      commitments.public_signal_schema_hash,
      "public signal schema hash",
    ),
  );
  const semanticProfileHash = keccakHash(
    SEMANTIC_PROOF_PROFILE_PREFIX,
    Buffer.from([1, 0, 1]),
    Buffer.from(circuitCommitmentHash.slice(2), "hex"),
    Buffer.from(witnessGeneratorCommitmentHash.slice(2), "hex"),
    Buffer.from(publicSignalSchemaHash.slice(2), "hex"),
  );
  const anchor = policy.sora_finality_anchor;
  const soraAnchorHash = keccakHash(
    SORA_FINALITY_ANCHOR_PREFIX,
    Buffer.from([1, 1]),
    littleEndian(anchor.protocol_version, 2, "SORA finality protocol version"),
    Buffer.from(upperHex32(anchor.chain_id_hash, "Taira chain hash"), "hex"),
    littleEndian(anchor.checkpoint_height, 8, "SORA checkpoint height"),
    Buffer.from(
      upperHex32(anchor.checkpoint_block_hash, "SORA checkpoint block hash"),
      "hex",
    ),
    Buffer.from(
      upperHex32(anchor.checkpoint_context_id, "SORA checkpoint context"),
      "hex",
    ),
    Buffer.from(
      upperHex32(
        anchor.checkpoint_finality_artifact_hash,
        "SORA finality artifact hash",
      ),
      "hex",
    ),
  );
  return Object.freeze({
    soraAnchorHash,
    semanticProfileHash,
    circuitCommitmentHash,
    witnessGeneratorCommitmentHash,
    publicSignalSchemaHash,
  });
};

const positiveSlot = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finalized slot.`);
  }
  return value;
};

const signature = (value, label) => {
  let bytes;
  try {
    bytes = bs58.decode(value);
  } catch {
    throw new TypeError(`${label} must be a canonical Solana signature.`);
  }
  if (bytes.length !== 64 || bs58.encode(bytes) !== value) {
    throw new TypeError(`${label} must encode exactly 64 bytes.`);
  }
  return value;
};

const finalizationRecord = (value, role) => {
  const record = exactRecord(
    value,
    [
      "program_address",
      "programdata_address",
      "artifact_sha256",
      "program_code_hash",
      "programdata_deployment_slot",
      "transaction_signature",
      "finalized_slot",
    ],
    `${role} program finalization`,
  );
  const programdataDeploymentSlot = positiveSlot(
    record.programdata_deployment_slot,
    `${role} ProgramData deployment slot`,
  );
  const finalizedSlot = positiveSlot(
    record.finalized_slot,
    `${role} finalization slot`,
  );
  if (programdataDeploymentSlot >= finalizedSlot) {
    throw new TypeError(
      `${role} ProgramData must be deployed before atomic authority removal.`,
    );
  }
  return {
    program_address: publicKey(
      record.program_address,
      `${role} program`,
    ).toBase58(),
    programdata_address: publicKey(
      record.programdata_address,
      `${role} ProgramData`,
    ).toBase58(),
    artifact_sha256: hash32(record.artifact_sha256, `${role} artifact SHA-256`),
    program_code_hash: hash32(record.program_code_hash, `${role} code hash`),
    programdata_deployment_slot: programdataDeploymentSlot,
    transaction_signature: signature(
      record.transaction_signature,
      `${role} finalization signature`,
    ),
    finalized_slot: finalizedSlot,
  };
};

export const validateSolanaExactInitializerInput = (value) => {
  const input = exactRecord(
    value,
    [
      "schema",
      "solana_rpc_url",
      "fresh_deploy_report_sha256",
      "payer_address",
      "mint_address",
      "program_finalizations",
      "route",
      "governed_destination_deployment",
    ],
    "Solana exact initializer input",
  );
  if (
    input.schema !== SOLANA_EXACT_INITIALIZER_INPUT_SCHEMA ||
    input.solana_rpc_url !== SOLANA_TESTNET_RPC_URL
  ) {
    throw new TypeError(
      "Initializer input must target exact Solana testnet revision 1.",
    );
  }
  const freshDeployReportSha256 = hash32(
    input.fresh_deploy_report_sha256,
    "fresh deployment report SHA-256",
  );
  const payerAddress = publicKey(
    input.payer_address,
    "initializer payer",
  ).toBase58();
  const mintAddress = publicKey(
    input.mint_address,
    "preselected fresh SPL XOR mint",
  ).toBase58();
  if (mintAddress === payerAddress) {
    throw new TypeError(
      "Initializer payer and preselected mint signer must be distinct.",
    );
  }
  const programFinalizations = exactRecord(
    input.program_finalizations,
    ["destination", "source", "native_verifier"],
    "program finalizations",
  );
  const normalizedFinalizations = Object.fromEntries(
    Object.entries(programFinalizations).map(([role, record]) => [
      role,
      finalizationRecord(record, role),
    ]),
  );
  if (
    new Set(
      Object.values(normalizedFinalizations).map(
        (entry) => entry.transaction_signature,
      ),
    ).size !== 1 ||
    new Set(
      Object.values(normalizedFinalizations).map(
        (entry) => entry.finalized_slot,
      ),
    ).size !== 1
  ) {
    throw new TypeError(
      "All three Loader-v3 authority removals must be one atomic finalized transaction.",
    );
  }
  for (const field of ["artifact_sha256", "program_code_hash"]) {
    if (
      new Set(
        Object.values(normalizedFinalizations).map((entry) => entry[field]),
      ).size !== 3
    ) {
      throw new TypeError(
        "Destination, source, and native-verifier finalization hashes must be distinct.",
      );
    }
  }
  const route = exactRecord(
    input.route,
    [
      "destination_program_id",
      "source_program_id",
      "native_verifier_program_id",
      "route_revision",
    ],
    "initializer route",
  );
  if (route.route_revision !== REVISION) {
    throw new TypeError("Initializer route revision must be exactly 1.");
  }
  const programs = {
    destination: publicKey(
      route.destination_program_id,
      "destination program",
    ).toBase58(),
    source: publicKey(route.source_program_id, "source program").toBase58(),
    native_verifier: publicKey(
      route.native_verifier_program_id,
      "native verifier program",
    ).toBase58(),
  };
  if (
    new Set(Object.values(programs)).size !== 3 ||
    Object.values(programs).includes(mintAddress) ||
    Object.entries(programs).some(
      ([role, address]) =>
        normalizedFinalizations[role].program_address !== address,
    )
  ) {
    throw new TypeError(
      "Initializer program roles are aliased or differ from finalization evidence.",
    );
  }
  const loader = new PublicKey(UPGRADEABLE_LOADER_ADDRESS);
  for (const [role, programAddress] of Object.entries(programs)) {
    const canonicalProgramdata = PublicKey.findProgramAddressSync(
      [new PublicKey(programAddress).toBuffer()],
      loader,
    )[0].toBase58();
    if (
      normalizedFinalizations[role].programdata_address !== canonicalProgramdata
    ) {
      throw new TypeError(
        `${role} ProgramData must be the canonical Loader-v3 PDA for its program.`,
      );
    }
  }
  const addresses = deriveSolanaExactInitializerAddresses({
    programs,
    mintAddress,
  });
  const deployment = exactRecord(
    input.governed_destination_deployment,
    [
      "token_mint_address",
      "route_program_id",
      "route_program_data_address",
      "route_program_data_slot",
      "route_state_account",
      "route_program_code_hash",
      "native_verifier_program_id",
      "native_verifier_program_data_address",
      "native_verifier_program_data_slot",
      "native_verifier_material_account",
      "native_verifier_program_code_hash",
      "native_verifier_config_hash",
      "verifying_key",
      "verifier_key_hash",
      "outbound_proof_policy",
      "taira_to_token_multiplier",
    ],
    "governed_destination_deployment",
  );
  const sourceProgramHex = publicKeyUpperHex(programs.source, "source program");
  const derivedDestinationHashes = deriveSccpSolanaDestinationHashesV1(
    deployment,
    sourceProgramHex,
    REVISION,
  );
  const derivedNativeConfigHash = deriveSccpSolanaNativeVerifierConfigHashV1(
    deployment,
    sourceProgramHex,
    REVISION,
  );
  const expectedDeploymentFields = {
    token_mint_address: publicKeyUpperHex(mintAddress, "mint"),
    route_program_id: publicKeyUpperHex(
      programs.destination,
      "destination program",
    ),
    route_program_data_address: publicKeyUpperHex(
      normalizedFinalizations.destination.programdata_address,
      "destination ProgramData",
    ),
    route_program_data_slot:
      normalizedFinalizations.destination.programdata_deployment_slot,
    route_state_account: publicKeyUpperHex(
      addresses.destinationStateAddress,
      "destination route state",
    ),
    route_program_code_hash:
      normalizedFinalizations.destination.program_code_hash
        .slice(2)
        .toUpperCase(),
    native_verifier_program_id: publicKeyUpperHex(
      programs.native_verifier,
      "native verifier program",
    ),
    native_verifier_program_data_address: publicKeyUpperHex(
      normalizedFinalizations.native_verifier.programdata_address,
      "native verifier ProgramData",
    ),
    native_verifier_program_data_slot:
      normalizedFinalizations.native_verifier.programdata_deployment_slot,
    native_verifier_program_code_hash:
      normalizedFinalizations.native_verifier.program_code_hash
        .slice(2)
        .toUpperCase(),
    native_verifier_config_hash: derivedNativeConfigHash.slice(2).toUpperCase(),
    taira_to_token_multiplier: 1,
  };
  for (const [field, expected] of Object.entries(expectedDeploymentFields)) {
    if (deployment[field] !== expected) {
      throw new TypeError(
        `governed_destination_deployment.${field} differs from the pinned fresh deployment.`,
      );
    }
  }
  const verifyingKey = encodeGovernedVerifyingKey(deployment.verifying_key);
  const verifierKeyHash = `0x${Buffer.from(keccak_256(verifyingKey)).toString(
    "hex",
  )}`;
  if (
    upperHex32(deployment.verifier_key_hash, "governed verifier key hash") !==
    verifierKeyHash.slice(2).toUpperCase()
  ) {
    throw new TypeError(
      "Governed verifier-key hash differs from the canonical 1216-byte key.",
    );
  }
  const proofPolicyHashes = deriveGovernedProofPolicyHashes(deployment);
  const hashes = Object.freeze({
    destinationBindingHash: hash32(
      derivedDestinationHashes.destination_binding_hash,
      "derived destination binding hash",
    ),
    routeConfigurationHash: hash32(
      derivedDestinationHashes.route_configuration_hash,
      "derived route configuration hash",
    ),
    ...proofPolicyHashes,
  });
  const nativeConfig = deriveExactSolanaNativeVerifierConfig({
    nativeVerifierProgramId: programs.native_verifier,
    destinationProgramId: programs.destination,
    sourceProgramId: programs.source,
    destinationStateAddress: addresses.destinationStateAddress,
    tokenMintAddress: mintAddress,
    routeRevision: REVISION,
    verifierKeyHash,
    ...hashes,
  });
  if (
    nativeConfig.nativeVerifierConfigHash !== derivedNativeConfigHash ||
    publicKeyUpperHex(
      nativeConfig.nativeVerifierMaterialAddress,
      "derived native-verifier material",
    ) !== deployment.native_verifier_material_account
  ) {
    throw new TypeError(
      "Governed native-verifier config or material PDA differs from the canonical initializer derivation.",
    );
  }
  const sourceIdentity = {
    lane: {
      source: { network: "solana_testnet", profile: null },
      target: { network: "sora_taira", profile: null },
    },
    emitter: {
      emitter: "solana",
      identity: {
        program_id: sourceProgramHex,
        program_data_address: publicKeyUpperHex(
          normalizedFinalizations.source.programdata_address,
          "source ProgramData",
        ),
        program_data_slot:
          normalizedFinalizations.source.programdata_deployment_slot,
        state_account: publicKeyUpperHex(
          addresses.sourceStateAddress,
          "source route state",
        ),
        program_code_hash: normalizedFinalizations.source.program_code_hash
          .slice(2)
          .toUpperCase(),
        route_config_hash: hashes.routeConfigurationHash.slice(2).toUpperCase(),
      },
    },
  };
  const sourceIdentityHashes =
    deriveSccpSolanaSourceIdentityHashesV1(sourceIdentity);
  return Object.freeze({
    input,
    freshDeployReportSha256,
    payerAddress,
    mintAddress,
    programs: Object.freeze(programs),
    programFinalizations: Object.freeze(normalizedFinalizations),
    governedDestinationDeployment: deployment,
    sourceIdentity: Object.freeze(sourceIdentity),
    sourceIdentityHashes,
    hashes,
    verifyingKey,
  });
};

export const assertSolanaExactFreshDeployReportBinding = ({
  normalized,
  freshDeployReport,
}) => {
  if (freshDeployReport?.reportSha256 !== normalized.freshDeployReportSha256) {
    throw new Error(
      "Fresh deployment report hash differs from the reviewed initializer input.",
    );
  }
  const roleMap = {
    destination: "destination",
    source: "source",
    native_verifier: "nativeVerifier",
  };
  for (const [initializerRole, reportRole] of Object.entries(roleMap)) {
    const expected = normalized.programFinalizations[initializerRole];
    const observed = freshDeployReport.programsByRole?.[reportRole];
    if (
      observed?.programId !== expected.program_address ||
      observed?.programdataAddress !== expected.programdata_address ||
      observed?.artifactSha256 !== expected.artifact_sha256 ||
      observed?.codeHash !== expected.program_code_hash ||
      observed?.deploy?.finalizedSlot !==
        expected.programdata_deployment_slot ||
      observed?.immutableProgramdataReadback?.deploymentSlot !==
        expected.programdata_deployment_slot ||
      observed?.immutableProgramdataReadback?.immutable !== true ||
      observed?.immutableFinalization?.signature !==
        expected.transaction_signature ||
      observed?.immutableFinalization?.finalizedSlot !== expected.finalized_slot
    ) {
      throw new Error(
        `${initializerRole} initializer evidence differs from the canonical fresh-deploy report.`,
      );
    }
  }
  const atomic = freshDeployReport.immutableFinalization;
  const finalization = normalized.programFinalizations.destination;
  if (
    atomic?.oneAtomicTransaction !== true ||
    atomic?.signature !== finalization.transaction_signature ||
    atomic?.finalizedSlot !== finalization.finalized_slot
  ) {
    throw new Error(
      "Initializer authority removal differs from the fresh report's one atomic transaction.",
    );
  }
  return Object.freeze({
    ready: true,
    freshDeployReportSha256: freshDeployReport.reportSha256,
    operationId: freshDeployReport.operationId,
    planSha256: freshDeployReport.planSha256,
  });
};

export const deriveSolanaExactInitializerAddresses = ({
  programs,
  mintAddress,
}) => {
  const mint = publicKey(mintAddress, "fresh SPL XOR mint");
  const destinationState = deriveExactSolanaRouteStateAddress({
    routeProgramId: programs.destination,
    role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
    tokenMintAddress: mint,
  }).address;
  const sourceState = deriveExactSolanaRouteStateAddress({
    routeProgramId: programs.source,
    role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
    tokenMintAddress: mint,
  }).address;
  return Object.freeze({
    mintAddress: mint.toBase58(),
    destinationStateAddress: destinationState,
    sourceStateAddress: sourceState,
  });
};

const descriptorInstruction = (descriptor) =>
  new TransactionInstruction({
    programId: new PublicKey(descriptor.programId),
    keys: descriptor.keys.map((meta) => ({
      pubkey: new PublicKey(meta.pubkey),
      isSigner: meta.isSigner,
      isWritable: meta.isWritable,
    })),
    data: Buffer.from(descriptor.dataHex.slice(2), "hex"),
  });

const effectiveUid = () => {
  if (
    typeof process.geteuid !== "function" ||
    NO_FOLLOW === undefined ||
    fsConstants.O_DIRECTORY === undefined
  ) {
    throw new Error(
      "Exact Solana initialization requires POSIX no-follow filesystem controls.",
    );
  }
  return process.geteuid();
};

const sameInode = (left, right) =>
  String(left.dev) === String(right.dev) &&
  String(left.ino) === String(right.ino);

const assertPrivateOwnedDirectoryStat = (value, directory) => {
  if (
    !value.isDirectory() ||
    value.isSymbolicLink() ||
    value.uid !== effectiveUid() ||
    (value.mode & TRUSTED_OUTPUT_PERMISSION_MASK) !== 0
  ) {
    throw new Error(
      `Exact initializer output directory ${directory} must be a pre-existing, euid-owned, non-group/world-writable real directory.`,
    );
  }
};

const assertNoSymlinkDirectoryComponents = async (directory) => {
  const resolved = path.resolve(directory);
  const parsed = path.parse(resolved);
  let current = parsed.root;
  const relative = resolved.slice(parsed.root.length);
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const value = await lstat(current);
    if (
      value.isSymbolicLink() ||
      !value.isDirectory() ||
      (value.mode & TRUSTED_OUTPUT_PERMISSION_MASK) !== 0
    ) {
      throw new Error(
        `Exact initializer output path component ${current} is symlinked or writable by another principal.`,
      );
    }
  }
  const canonical = await realpath(resolved);
  if (canonical !== resolved) {
    throw new Error(
      "Exact initializer output directories must use their canonical real paths without symlink components.",
    );
  }
};

export const pinSolanaExactOutputDirectory = async (target) => {
  const output = path.resolve(target);
  const directory = path.dirname(output);
  await assertNoSymlinkDirectoryComponents(directory);
  const pathStat = await lstat(directory);
  assertPrivateOwnedDirectoryStat(pathStat, directory);
  const handle = await open(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | NO_FOLLOW,
  );
  try {
    const handleStat = await handle.stat();
    assertPrivateOwnedDirectoryStat(handleStat, directory);
    if (!sameInode(pathStat, handleStat)) {
      throw new Error(
        "Exact initializer output directory changed while it was being pinned.",
      );
    }
    return Object.freeze({
      directory,
      dev: String(handleStat.dev),
      ino: String(handleStat.ino),
      handle,
    });
  } catch (error) {
    await handle.close().catch(() => {});
    throw error;
  }
};

export const assertSolanaExactOutputDirectoryPin = async (pin, target) => {
  const output = path.resolve(target);
  if (!pin || pin.directory !== path.dirname(output)) {
    throw new Error(
      "Exact initializer output directory pin does not match target.",
    );
  }
  await assertNoSymlinkDirectoryComponents(pin.directory);
  const [pathStat, handleStat] = await Promise.all([
    lstat(pin.directory),
    pin.handle.stat(),
  ]);
  assertPrivateOwnedDirectoryStat(pathStat, pin.directory);
  assertPrivateOwnedDirectoryStat(handleStat, pin.directory);
  const expected = { dev: pin.dev, ino: pin.ino };
  if (!sameInode(pathStat, expected) || !sameInode(handleStat, expected)) {
    throw new Error(
      "Exact initializer output directory identity changed during execution.",
    );
  }
};

const assertSafeOutputTarget = async (target, { allowMissing }) => {
  let value;
  try {
    value = await lstat(target);
  } catch (error) {
    if (allowMissing && error?.code === "ENOENT") return null;
    throw error;
  }
  if (
    value.isSymbolicLink() ||
    !value.isFile() ||
    value.uid !== effectiveUid() ||
    (value.mode & TRUSTED_OUTPUT_PERMISSION_MASK) !== 0 ||
    value.nlink !== 1
  ) {
    throw new Error(
      "Exact initializer output must be an euid-owned, private, single-link regular file.",
    );
  }
  return value;
};

const withPinnedOutputDirectory = async (target, suppliedPin, operation) => {
  const owned = !suppliedPin;
  const pin = suppliedPin ?? (await pinSolanaExactOutputDirectory(target));
  try {
    await assertSolanaExactOutputDirectoryPin(pin, target);
    return await operation(pin);
  } finally {
    if (owned) await pin.handle.close();
  }
};

export const writeSolanaExactJsonAtomically = async (
  target,
  value,
  { directoryPin = null } = {},
) => {
  const output = path.resolve(target);
  const contents = `${canonicalJson(value)}\n`;
  return withPinnedOutputDirectory(output, directoryPin, async (pin) => {
    await assertSafeOutputTarget(output, { allowMissing: true });
    const temporary = `${output}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`;
    let handle = null;
    try {
      handle = await open(
        temporary,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_WRONLY |
          NO_FOLLOW,
        0o600,
      );
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      const writtenStat = await handle.stat();
      if (
        !writtenStat.isFile() ||
        writtenStat.uid !== effectiveUid() ||
        (writtenStat.mode & 0o777) !== 0o600 ||
        writtenStat.nlink !== 1
      ) {
        throw new Error("Exact initializer temporary output is not private.");
      }
      await handle.close();
      handle = null;
      await assertSolanaExactOutputDirectoryPin(pin, output);
      await rename(temporary, output);
      await assertSolanaExactOutputDirectoryPin(pin, output);
      await assertSafeOutputTarget(output, { allowMissing: false });
      await pin.handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      await rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
  });
};

export const createSolanaExactJsonExclusively = async (
  target,
  value,
  { directoryPin = null } = {},
) => {
  const output = path.resolve(target);
  const contents = `${canonicalJson(value)}\n`;
  return withPinnedOutputDirectory(output, directoryPin, async (pin) => {
    await assertSafeOutputTarget(output, { allowMissing: true });
    let handle = null;
    try {
      handle = await open(
        output,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_WRONLY |
          NO_FOLLOW,
        0o600,
      );
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      await handle.close();
      handle = null;
      await assertSolanaExactOutputDirectoryPin(pin, output);
      await assertSafeOutputTarget(output, { allowMissing: false });
      await pin.handle.sync();
    } catch (error) {
      await handle?.close().catch(() => {});
      throw error;
    }
  });
};

const atomicWriteJson = writeSolanaExactJsonAtomically;

export const parseSolanaExactCanonicalJsonBytes = (bytes, label) => {
  try {
    const contents = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const value = JSON.parse(contents);
    if (contents !== `${canonicalJson(value)}\n`) {
      throw new SyntaxError(
        "JSON bytes must be the exact single-line canonical encoding with one trailing newline.",
      );
    }
    return { bytes, value };
  } catch (cause) {
    throw new Error(
      `${label} must contain canonical, duplicate-free UTF-8 JSON.`,
      { cause },
    );
  }
};

const loadJson = async (target, label) => {
  let bytes;
  try {
    bytes = await readFile(target);
  } catch (cause) {
    throw new Error(`${label} could not be read.`, { cause });
  }
  return parseSolanaExactCanonicalJsonBytes(bytes, label);
};

const parseJsonBytes = parseSolanaExactCanonicalJsonBytes;

const loadTrustedJson = async (target, label, directoryPin) => {
  const output = path.resolve(target);
  return withPinnedOutputDirectory(output, directoryPin, async (pin) => {
    await assertSafeOutputTarget(output, { allowMissing: false });
    let handle = null;
    try {
      handle = await open(output, fsConstants.O_RDONLY | NO_FOLLOW);
      const openedStat = await handle.stat();
      if (
        !openedStat.isFile() ||
        openedStat.uid !== effectiveUid() ||
        (openedStat.mode & TRUSTED_OUTPUT_PERMISSION_MASK) !== 0 ||
        openedStat.nlink !== 1
      ) {
        throw new Error(`${label} is not a trusted private regular file.`);
      }
      const bytes = await handle.readFile();
      await assertSolanaExactOutputDirectoryPin(pin, output);
      const pathStat = await assertSafeOutputTarget(output, {
        allowMissing: false,
      });
      if (!sameInode(openedStat, pathStat)) {
        throw new Error(`${label} changed while it was being read.`);
      }
      return parseJsonBytes(bytes, label);
    } catch (cause) {
      if (cause?.code === "ENOENT") {
        throw new Error(`${label} could not be read.`, { cause });
      }
      throw cause;
    } finally {
      await handle?.close().catch(() => {});
    }
  });
};

export const acquireSolanaExactInitializerLease = async ({
  journalPath,
  inputSha256,
  directoryPin = null,
}) => {
  const lockPath = `${path.resolve(journalPath)}.lock`;
  const ownsDirectoryPin = !directoryPin;
  const pin = directoryPin ?? (await pinSolanaExactOutputDirectory(lockPath));
  try {
    await assertSolanaExactOutputDirectoryPin(pin, lockPath);
    await assertSafeOutputTarget(lockPath, { allowMissing: true });
    let handle = null;
    try {
      handle = await open(
        lockPath,
        fsConstants.O_CREAT |
          fsConstants.O_EXCL |
          fsConstants.O_RDWR |
          NO_FOLLOW,
        0o600,
      );
      const token = randomBytes(32).toString("hex");
      const contents = `${canonicalJson({
        schema: "iroha-sccp-solana-exact-initializer-lease/v1",
        input_sha256: inputSha256,
        pid: process.pid,
        token,
        acquired_at: new Date().toISOString(),
      })}\n`;
      await handle.writeFile(contents, "utf8");
      await handle.sync();
      const value = await handle.stat();
      if (
        !value.isFile() ||
        value.uid !== effectiveUid() ||
        (value.mode & 0o777) !== 0o600 ||
        value.nlink !== 1
      ) {
        throw new Error(
          "Exact initializer lease is not a private regular file.",
        );
      }
      await assertSolanaExactOutputDirectoryPin(pin, lockPath);
      await pin.handle.sync();
      return Object.freeze({
        lockPath,
        token,
        dev: String(value.dev),
        ino: String(value.ino),
        handle,
        directoryPin: pin,
        ownsDirectoryPin,
      });
    } catch (cause) {
      await handle?.close().catch(() => {});
      if (cause?.code === "EEXIST") {
        throw new Error(
          `Exact initializer lease already exists at ${lockPath}; inspect it manually and never auto-break it.`,
          { cause },
        );
      }
      throw cause;
    }
  } catch (error) {
    if (ownsDirectoryPin) await pin.handle.close().catch(() => {});
    throw error;
  }
};

export const releaseSolanaExactInitializerLease = async (lease) => {
  if (!lease?.handle || !lease?.directoryPin) {
    throw new Error("Exact initializer lease handle is missing.");
  }
  try {
    await assertSolanaExactOutputDirectoryPin(
      lease.directoryPin,
      lease.lockPath,
    );
    const [pathStat, handleStat] = await Promise.all([
      assertSafeOutputTarget(lease.lockPath, { allowMissing: false }),
      lease.handle.stat(),
    ]);
    const expected = { dev: lease.dev, ino: lease.ino };
    if (!sameInode(pathStat, expected) || !sameInode(handleStat, expected)) {
      throw new Error(
        "Exact initializer lease identity changed; refusing to remove it.",
      );
    }
    await rm(lease.lockPath);
    await lease.directoryPin.handle.sync();
  } finally {
    await lease.handle.close().catch(() => {});
    if (lease.ownsDirectoryPin) {
      await lease.directoryPin.handle.close().catch(() => {});
    }
  }
};

const transactionRecord = ({ programAddress, accountAddress, result }) => ({
  program_address: new PublicKey(programAddress).toBase58(),
  account_address: new PublicKey(accountAddress).toBase58(),
  transaction_signature: result.signature,
  finalized_slot: result.slot,
});

const isoTimestamp = (value, label) => {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    throw new TypeError(`${label} must be an ISO timestamp.`);
  }
  return value;
};

const nonnegativeInteger = (value, label) => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a nonnegative safe integer.`);
  }
  return value;
};

const canonicalSignedWire = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(
      `${label} must be canonical signed transaction base64.`,
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (
    bytes.length === 0 ||
    bytes.length > MAX_SOLANA_TRANSACTION_BYTES ||
    bytes.toString("base64") !== value
  ) {
    throw new TypeError(
      `${label} must be canonical signed transaction base64.`,
    );
  }
  return value;
};

const journalTransactionRecord = (value, label, { append = false } = {}) => {
  const keys = [
    "program_address",
    "account_address",
    "transaction_signature",
    "finalized_slot",
  ];
  if (append) keys.push("offset");
  const record = exactRecord(value, keys, label);
  publicKey(record.program_address, `${label} program`);
  publicKey(record.account_address, `${label} account`);
  signature(record.transaction_signature, `${label} signature`);
  positiveSlot(record.finalized_slot, `${label} finalized slot`);
  if (append) nonnegativeInteger(record.offset, `${label} offset`);
  return record;
};

const validateJournalBootstrap = (value) => {
  if (value === null) return null;
  if (value?.status === "prepared") {
    exactRecord(
      value,
      [
        "status",
        "transaction_signature",
        "transaction_base64",
        "transaction_sha256",
        "message_sha256",
        "blockhash",
        "last_valid_block_height",
      ],
      "initializer prepared bootstrap",
    );
    canonicalSignedWire(value.transaction_base64, "prepared bootstrap wire");
  } else if (value?.status === "finalized") {
    exactRecord(
      value,
      [
        "status",
        "transaction_signature",
        "transaction_base64",
        "transaction_sha256",
        "message_sha256",
        "blockhash",
        "last_valid_block_height",
        "finalized_slot",
      ],
      "initializer finalized bootstrap",
    );
    if (value.transaction_base64 !== null) {
      throw new TypeError(
        "Finalized bootstrap must not retain signed wire bytes.",
      );
    }
    positiveSlot(value.finalized_slot, "bootstrap finalized slot");
  } else {
    throw new TypeError("Initializer bootstrap status is invalid.");
  }
  signature(value.transaction_signature, "bootstrap signature");
  hash32(value.transaction_sha256, "bootstrap transaction SHA-256");
  hash32(value.message_sha256, "bootstrap message SHA-256");
  publicKey(value.blockhash, "bootstrap blockhash");
  nonnegativeInteger(
    value.last_valid_block_height,
    "bootstrap last valid block height",
  );
  return value;
};

const validatePreparedAttempt = (value, action) => {
  const attempt = exactRecord(
    value,
    [
      "status",
      "action",
      "program_address",
      "account_address",
      "transaction_signature",
      "message_sha256",
      "transaction_sha256",
      "transaction_base64",
      "blockhash",
      "last_valid_block_height",
      "finalized_slot",
    ],
    `initializer prepared action ${action}`,
  );
  if (
    !["prepared", "finalized", "expired"].includes(attempt.status) ||
    attempt.action !== action
  ) {
    throw new TypeError(`Initializer prepared action ${action} is malformed.`);
  }
  publicKey(attempt.program_address, `${action} program`);
  publicKey(attempt.account_address, `${action} account`);
  signature(attempt.transaction_signature, `${action} signature`);
  hash32(attempt.message_sha256, `${action} message SHA-256`);
  hash32(attempt.transaction_sha256, `${action} transaction SHA-256`);
  publicKey(attempt.blockhash, `${action} blockhash`);
  nonnegativeInteger(
    attempt.last_valid_block_height,
    `${action} last valid block height`,
  );
  if (attempt.status === "prepared") {
    canonicalSignedWire(attempt.transaction_base64, `${action} signed wire`);
    if (attempt.finalized_slot !== null) {
      throw new TypeError(`${action} prepared attempt has a finalized slot.`);
    }
  } else {
    if (attempt.transaction_base64 !== null) {
      throw new TypeError(
        `${action} terminal attempt retains signed wire bytes.`,
      );
    }
    if (attempt.status === "finalized") {
      positiveSlot(attempt.finalized_slot, `${action} finalized slot`);
    } else if (attempt.finalized_slot !== null) {
      throw new TypeError(`${action} expired attempt has a finalized slot.`);
    }
  }
  return attempt;
};

export const validateSolanaExactInitializerJournal = ({
  value,
  normalized,
  inputSha256,
}) => {
  const complete = value?.status === "complete";
  const keys = [
    "schema",
    "input_sha256",
    "payer_address",
    "addresses",
    "bootstrap",
    "prepared_actions",
    "transactions",
    "status",
    "updated_at",
  ];
  if (complete) {
    keys.push("evidence_path", "evidence_sha256", "rpc_verification");
  }
  const journal = exactRecord(value, keys, "Solana exact initializer journal");
  if (
    journal.schema !== SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA ||
    journal.input_sha256 !== inputSha256 ||
    journal.payer_address !== normalized.payerAddress ||
    !["created", "complete"].includes(journal.status)
  ) {
    throw new Error(
      "Initializer journal identity differs from the pinned input.",
    );
  }
  isoTimestamp(journal.updated_at, "initializer journal updated_at");
  const addresses = exactRecord(
    journal.addresses,
    [
      "mintAddress",
      "destinationStateAddress",
      "sourceStateAddress",
      "materialAddress",
    ],
    "initializer journal addresses",
  );
  for (const [name, address] of Object.entries(addresses)) {
    if (name === "materialAddress" && address === null) continue;
    publicKey(address, `initializer journal ${name}`);
  }
  const expectedAddresses = deriveSolanaExactInitializerAddresses({
    programs: normalized.programs,
    mintAddress: normalized.mintAddress,
  });
  const expectedMaterialAddress = new PublicKey(
    Buffer.from(
      normalized.governedDestinationDeployment.native_verifier_material_account,
      "hex",
    ),
  ).toBase58();
  if (
    addresses.mintAddress !== expectedAddresses.mintAddress ||
    addresses.destinationStateAddress !==
      expectedAddresses.destinationStateAddress ||
    addresses.sourceStateAddress !== expectedAddresses.sourceStateAddress ||
    (addresses.materialAddress !== null &&
      addresses.materialAddress !== expectedMaterialAddress)
  ) {
    throw new Error(
      "Initializer journal addresses differ from the pinned mint and governed deployment.",
    );
  }
  validateJournalBootstrap(journal.bootstrap);
  if (
    journal.prepared_actions === null ||
    typeof journal.prepared_actions !== "object" ||
    Array.isArray(journal.prepared_actions)
  ) {
    throw new TypeError("Initializer prepared-action journal is malformed.");
  }
  for (const [action, attempts] of Object.entries(journal.prepared_actions)) {
    if (
      !/^(?:material_append_(?:0|[1-9][0-9]*)|material_seal|destination_route_initialize|source_route_initialize)$/u.test(
        action,
      ) ||
      !Array.isArray(attempts) ||
      attempts.length === 0
    ) {
      throw new TypeError(
        `Initializer prepared action ${action} is malformed.`,
      );
    }
    attempts.forEach((attempt) => validatePreparedAttempt(attempt, action));
  }
  const transactions = exactRecord(
    journal.transactions,
    [
      "material_appends",
      "material_seal",
      "destination_route_initialize",
      "source_route_initialize",
    ],
    "initializer journal transactions",
  );
  if (!Array.isArray(transactions.material_appends)) {
    throw new TypeError("Initializer material append records are malformed.");
  }
  transactions.material_appends.forEach((record, index) =>
    journalTransactionRecord(record, `material append record ${index}`, {
      append: true,
    }),
  );
  if (
    new Set(transactions.material_appends.map(({ offset }) => offset)).size !==
    transactions.material_appends.length
  ) {
    throw new TypeError("Initializer material append offsets are duplicated.");
  }
  for (const role of [
    "material_seal",
    "destination_route_initialize",
    "source_route_initialize",
  ]) {
    if (transactions[role] !== null) {
      journalTransactionRecord(transactions[role], role);
    }
  }
  if (complete) {
    if (
      typeof journal.evidence_path !== "string" ||
      path.resolve(journal.evidence_path) !== journal.evidence_path
    ) {
      throw new TypeError(
        "Completed initializer evidence path is not absolute.",
      );
    }
    hash32(journal.evidence_sha256, "completed evidence SHA-256");
    const rpc = exactRecord(
      journal.rpc_verification,
      ["ready", "transaction_count", "checked_at"],
      "completed initializer RPC verification",
    );
    if (rpc.ready !== true || !Number.isSafeInteger(rpc.transaction_count)) {
      throw new TypeError(
        "Completed initializer RPC verification is malformed.",
      );
    }
    positiveSlot(rpc.transaction_count, "RPC verification transaction count");
    isoTimestamp(rpc.checked_at, "RPC verification checked_at");
    if (
      journal.bootstrap?.status !== "finalized" ||
      addresses.materialAddress === null ||
      transactions.material_appends.length === 0 ||
      [
        transactions.material_seal,
        transactions.destination_route_initialize,
        transactions.source_route_initialize,
      ].some((record) => record === null)
    ) {
      throw new TypeError("Completed initializer journal is incomplete.");
    }
    const requirePreparedRecord = (action, record) => {
      const matching = journal.prepared_actions[action]?.some(
        (attempt) =>
          attempt.status === "finalized" &&
          attempt.program_address === record.program_address &&
          attempt.account_address === record.account_address &&
          attempt.transaction_signature === record.transaction_signature &&
          attempt.finalized_slot === record.finalized_slot,
      );
      if (!matching) {
        throw new TypeError(
          `Completed initializer record ${action} lacks its exact finalized prepared intent.`,
        );
      }
    };
    for (const record of transactions.material_appends) {
      requirePreparedRecord(`material_append_${record.offset}`, record);
    }
    requirePreparedRecord("material_seal", transactions.material_seal);
    requirePreparedRecord(
      "destination_route_initialize",
      transactions.destination_route_initialize,
    );
    requirePreparedRecord(
      "source_route_initialize",
      transactions.source_route_initialize,
    );
  }
  return journal;
};

const transactionMessageSha256 = (message) =>
  sha256Hex(Buffer.from(message.serialize()));

const exactPreparedMessageSha256 = ({
  payerAddress,
  blockhash,
  instructions,
}) =>
  transactionMessageSha256(
    new TransactionMessage({
      payerKey: new PublicKey(payerAddress),
      recentBlockhash: publicKey(blockhash, "prepared blockhash").toBase58(),
      instructions,
    }).compileToLegacyMessage(),
  );

export const assertSolanaExactPreparedIntentBinding = ({
  attempt,
  payerAddress,
  instructions,
  action,
  programAddress,
  accountAddress,
  label,
}) => {
  if (
    attempt.action !== action ||
    attempt.program_address !== new PublicKey(programAddress).toBase58() ||
    attempt.account_address !== new PublicKey(accountAddress).toBase58() ||
    attempt.message_sha256 !==
      exactPreparedMessageSha256({
        payerAddress,
        blockhash: attempt.blockhash,
        instructions,
      })
  ) {
    throw new Error(
      `${label} prepared signed message is not the current exact instruction intent.`,
    );
  }
  return attempt;
};

export const assertSolanaExactFinalizedTransactionReadback = ({
  readback,
  expectedSignature,
  expectedMessageSha256,
  label,
}) => {
  if (
    !readback ||
    readback.meta?.err ||
    readback.transaction?.signatures?.[0] !== expectedSignature ||
    transactionMessageSha256(readback.transaction.message) !==
      expectedMessageSha256 ||
    !Number.isSafeInteger(readback.slot) ||
    readback.slot <= 0
  ) {
    throw new Error(
      `${label} finalized readback differs from its locally signed intent.`,
    );
  }
  return Object.freeze({ signature: expectedSignature, slot: readback.slot });
};

const preparedAttemptsFor = (journal, action) => {
  journal.prepared_actions ??= {};
  if (
    journal.prepared_actions === null ||
    typeof journal.prepared_actions !== "object" ||
    Array.isArray(journal.prepared_actions)
  ) {
    throw new Error("Initializer prepared-action journal is malformed.");
  }
  const attempts = (journal.prepared_actions[action] ??= []);
  if (!Array.isArray(attempts)) {
    throw new Error(`Initializer prepared action ${action} is malformed.`);
  }
  return attempts;
};

export const resolveSolanaExactObservedPreparedAction = async ({
  connection,
  journal,
  action,
  payerAddress,
  instructions,
  programAddress,
  accountAddress,
  label,
}) => {
  const attempts = preparedAttemptsFor(journal, action);
  const active = [...attempts]
    .reverse()
    .find((attempt) => attempt.status !== "expired");
  if (!active) {
    throw new Error(
      `${label} exists without a journaled locally signed prepared intent.`,
    );
  }
  assertSolanaExactPreparedIntentBinding({
    attempt: active,
    payerAddress,
    instructions,
    action,
    programAddress,
    accountAddress,
    label,
  });
  const discovered = await finalizedReadback({
    connection,
    signature: active.transaction_signature,
    messageSha256: active.message_sha256,
    label,
  });
  if (!discovered) {
    throw new Error(
      `${label} state advanced without the exact prepared transaction readback.`,
    );
  }
  if (
    active.finalized_slot !== null &&
    active.finalized_slot !== undefined &&
    active.finalized_slot !== discovered.slot
  ) {
    throw new Error(
      `${label} finalized slot differs from its prepared intent.`,
    );
  }
  active.status = "finalized";
  active.finalized_slot = discovered.slot;
  active.transaction_base64 = null;
  return discovered;
};

const decodePreparedWire = (attempt, label) => {
  const encoded = attempt.transaction_base64 ?? "";
  const wire = Buffer.from(encoded, "base64");
  let transaction;
  try {
    transaction = VersionedTransaction.deserialize(wire);
  } catch {
    throw new Error(`${label} prepared signed wire is invalid.`);
  }
  const wireSignature = bs58.encode(transaction.signatures[0]);
  if (
    wire.length === 0 ||
    wire.length > MAX_SOLANA_TRANSACTION_BYTES ||
    wire.toString("base64") !== encoded ||
    sha256Hex(wire) !== attempt.transaction_sha256 ||
    wireSignature !== attempt.transaction_signature ||
    transactionMessageSha256(transaction.message) !== attempt.message_sha256
  ) {
    throw new Error(`${label} prepared signed wire differs from its journal.`);
  }
  return { transaction, wire };
};

const finalizedReadback = async ({
  connection,
  signature: expectedSignature,
  messageSha256,
  label,
}) => {
  const readback = await connection.getTransaction(expectedSignature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!readback) return null;
  return assertSolanaExactFinalizedTransactionReadback({
    readback,
    expectedSignature,
    expectedMessageSha256: messageSha256,
    label,
  });
};

const broadcastPreparedAttempt = async ({ connection, attempt, label }) => {
  const { wire } = decodePreparedWire(attempt, label);
  const submitted = await connection.sendRawTransaction(wire, {
    maxRetries: 0,
    preflightCommitment: "finalized",
    skipPreflight: false,
  });
  if (submitted !== attempt.transaction_signature) {
    throw new Error(`${label} RPC returned a different transaction signature.`);
  }
  const confirmation = await connection.confirmTransaction(
    {
      signature: attempt.transaction_signature,
      blockhash: attempt.blockhash,
      lastValidBlockHeight: attempt.last_valid_block_height,
    },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(
      `${label} failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  const result = await finalizedReadback({
    connection,
    signature: attempt.transaction_signature,
    messageSha256: attempt.message_sha256,
    label,
  });
  if (!result) throw new Error(`${label} lacks a finalized readback.`);
  return result;
};

export const submitSolanaExactPreparedTransaction = async ({
  connection,
  payerAddress,
  acquirePayer,
  instructions,
  label,
  action,
  programAddress,
  accountAddress,
  journal,
  journalPath,
  writeJournal = atomicWriteJson,
}) => {
  const attempts = preparedAttemptsFor(journal, action);
  const prior = attempts.at(-1) ?? null;
  if (prior && prior.status !== "expired") {
    assertSolanaExactPreparedIntentBinding({
      attempt: prior,
      payerAddress,
      instructions,
      action,
      programAddress,
      accountAddress,
      label,
    });
    const readback = await finalizedReadback({
      connection,
      signature: prior.transaction_signature,
      messageSha256: prior.message_sha256,
      label,
    });
    if (readback) {
      prior.status = "finalized";
      prior.finalized_slot = readback.slot;
      prior.transaction_base64 = null;
      journal.updated_at = new Date().toISOString();
      await writeJournal(journalPath, journal);
      return readback;
    }
    if (prior.status === "finalized") {
      throw new Error(`${label} finalized journal record has no RPC readback.`);
    }
    const status = await connection.getSignatureStatuses(
      [prior.transaction_signature],
      { searchTransactionHistory: true },
    );
    const signatureStatus = status?.value?.[0] ?? null;
    if (signatureStatus?.err) {
      throw new Error(`${label} prepared transaction finalized with an error.`);
    }
    if (signatureStatus !== null) {
      if (signatureStatus.confirmationStatus === "finalized") {
        throw new Error(
          `${label} is finalized but its exact transaction readback is unavailable.`,
        );
      }
      const result = await broadcastPreparedAttempt({
        connection,
        attempt: prior,
        label,
      });
      prior.status = "finalized";
      prior.finalized_slot = result.slot;
      prior.transaction_base64 = null;
      journal.updated_at = new Date().toISOString();
      await writeJournal(journalPath, journal);
      return result;
    }
    const blockHeight = await connection.getBlockHeight("finalized");
    if (blockHeight <= prior.last_valid_block_height) {
      const result = await broadcastPreparedAttempt({
        connection,
        attempt: prior,
        label,
      });
      prior.status = "finalized";
      prior.finalized_slot = result.slot;
      prior.transaction_base64 = null;
      journal.updated_at = new Date().toISOString();
      await writeJournal(journalPath, journal);
      return result;
    }
    prior.status = "expired";
    prior.transaction_base64 = null;
    journal.updated_at = new Date().toISOString();
    await writeJournal(journalPath, journal);
    throw new Error(
      `${label} prepared transaction expired; review the recorded signature before explicitly retrying.`,
    );
  }

  if (typeof acquirePayer !== "function") {
    throw new Error(`${label} requires a lazy runtime signer loader.`);
  }
  const payer = acquirePayer();
  if (payer.publicKey.toBase58() !== new PublicKey(payerAddress).toBase58()) {
    throw new Error(`${label} runtime signer differs from its reviewed payer.`);
  }
  const latest = await connection.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToLegacyMessage();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer]);
  const wire = Buffer.from(transaction.serialize());
  const expectedSignature = bs58.encode(transaction.signatures[0]);
  const attempt = {
    status: "prepared",
    action,
    program_address: new PublicKey(programAddress).toBase58(),
    account_address: new PublicKey(accountAddress).toBase58(),
    transaction_signature: expectedSignature,
    message_sha256: transactionMessageSha256(transaction.message),
    transaction_sha256: sha256Hex(wire),
    transaction_base64: wire.toString("base64"),
    blockhash: latest.blockhash,
    last_valid_block_height: latest.lastValidBlockHeight,
    finalized_slot: null,
  };
  attempts.push(attempt);
  journal.updated_at = new Date().toISOString();
  await writeJournal(journalPath, journal);
  const result = await broadcastPreparedAttempt({
    connection,
    attempt,
    label,
  });
  attempt.status = "finalized";
  attempt.finalized_slot = result.slot;
  attempt.transaction_base64 = null;
  journal.updated_at = new Date().toISOString();
  await writeJournal(journalPath, journal);
  return result;
};

const submitPreparedBootstrap = async ({
  connection,
  payer,
  mint,
  instructions,
  journal,
  journalPath,
  writeJournal,
}) => {
  const latest = await connection.getLatestBlockhash("finalized");
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: latest.blockhash,
    instructions,
  }).compileToLegacyMessage();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, mint]);
  const wire = transaction.serialize();
  const expectedSignature = bs58.encode(transaction.signatures[0]);
  journal.bootstrap = {
    status: "prepared",
    transaction_signature: expectedSignature,
    transaction_base64: Buffer.from(wire).toString("base64"),
    transaction_sha256: sha256Hex(wire),
    message_sha256: transactionMessageSha256(transaction.message),
    blockhash: latest.blockhash,
    last_valid_block_height: latest.lastValidBlockHeight,
  };
  await writeJournal(journalPath, journal);
  const submitted = await connection.sendRawTransaction(wire, {
    maxRetries: 0,
    preflightCommitment: "finalized",
    skipPreflight: false,
  });
  if (submitted !== expectedSignature) {
    throw new Error(
      "Atomic bootstrap signature differs from its prepared public journal.",
    );
  }
  const confirmation = await connection.confirmTransaction(
    { signature: submitted, ...latest },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(
      `Atomic bootstrap failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  const readback = await connection.getTransaction(submitted, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  const result = assertSolanaExactFinalizedTransactionReadback({
    readback,
    expectedSignature,
    expectedMessageSha256: journal.bootstrap.message_sha256,
    label: "Atomic bootstrap",
  });
  journal.bootstrap = {
    status: "finalized",
    transaction_signature: submitted,
    transaction_base64: null,
    transaction_sha256: journal.bootstrap.transaction_sha256,
    message_sha256: journal.bootstrap.message_sha256,
    blockhash: latest.blockhash,
    last_valid_block_height: latest.lastValidBlockHeight,
    finalized_slot: result.slot,
  };
  await writeJournal(journalPath, journal);
  return result;
};

export const assertSolanaExactImmutableProgram = async (
  connection,
  finalization,
  label,
) => {
  const [program, programdata] = await Promise.all([
    connection.getAccountInfo(
      new PublicKey(finalization.program_address),
      "finalized",
    ),
    connection.getAccountInfo(
      new PublicKey(finalization.programdata_address),
      "finalized",
    ),
  ]);
  if (
    !program ||
    !programdata ||
    !program.executable ||
    programdata.executable ||
    new PublicKey(program.owner).toBase58() !== UPGRADEABLE_LOADER_ADDRESS ||
    new PublicKey(programdata.owner).toBase58() !== UPGRADEABLE_LOADER_ADDRESS
  ) {
    throw new Error(`${label} immutable Loader-v3 readback is missing.`);
  }
  const parsedProgram = parseUpgradeableProgramAccountData(program.data);
  const parsedProgramdata = parseUpgradeableProgramDataAccountData(
    programdata.data,
  );
  if (
    parsedProgram.programdataAddress !== finalization.programdata_address ||
    parsedProgramdata.artifactSha256 !== finalization.artifact_sha256 ||
    parsedProgramdata.executableHash !== finalization.program_code_hash ||
    parsedProgramdata.sbpfVersion !== "V3" ||
    parsedProgramdata.executableLength < 52 ||
    parsedProgramdata.executableLength !==
      Buffer.from(programdata.data).length - 45 ||
    BigInt(parsedProgramdata.slot) !==
      BigInt(finalization.programdata_deployment_slot) ||
    BigInt(parsedProgramdata.slot) >= BigInt(finalization.finalized_slot)
  ) {
    throw new Error(
      `${label} immutable Loader-v3 pins differ from reviewed finalization evidence.`,
    );
  }
};

const plansFor = async ({ connection, normalized, payer, addresses }) => {
  const mintRent = await connection.getMinimumBalanceForRentExemption(
    82,
    "finalized",
  );
  const mint = buildExactSolanaClassicMintCreationPlan({
    payerAddress: payer.publicKey,
    mintAddress: addresses.mintAddress,
    destinationProgramId: normalized.programs.destination,
    destinationStateAddress: addresses.destinationStateAddress,
    rentLamports: String(mintRent),
  });
  const material = buildExactSolanaNativeMaterialUploadPlan({
    authorityAddress: payer.publicKey,
    nativeVerifierProgramId: normalized.programs.native_verifier,
    destinationProgramId: normalized.programs.destination,
    sourceProgramId: normalized.programs.source,
    destinationStateAddress: addresses.destinationStateAddress,
    tokenMintAddress: addresses.mintAddress,
    routeRevision: REVISION,
    verifyingKeyBytes: normalized.verifyingKey,
    ...normalized.hashes,
  });
  const common = {
    initializerAddress: payer.publicKey,
    tokenMintAddress: addresses.mintAddress,
    nativeVerifierProgramId: normalized.programs.native_verifier,
    nativeVerifierMaterialAddress: material.nativeVerifierMaterialAddress,
    routeRevision: REVISION,
    destinationStateAddress: addresses.destinationStateAddress,
    destinationBindingHash: normalized.hashes.destinationBindingHash,
    routeConfigurationHash: normalized.hashes.routeConfigurationHash,
    verifierKeyHash: material.verifierKeyHash,
    nativeVerifierConfigHash: material.nativeVerifierConfigHash,
  };
  const destination = buildExactSolanaRouteStateInitializeInstruction({
    ...common,
    routeProgramId: normalized.programs.destination,
    stateAddress: addresses.destinationStateAddress,
    peerRouteProgramId: normalized.programs.source,
    role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
  });
  const source = buildExactSolanaRouteStateInitializeInstruction({
    ...common,
    routeProgramId: normalized.programs.source,
    stateAddress: addresses.sourceStateAddress,
    peerRouteProgramId: normalized.programs.destination,
    role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
  });
  return Object.freeze({ mint, material, destination, source });
};

const assertSolanaExactJournalLifecycleIdentities = ({
  journal,
  normalized,
  addresses,
}) => {
  const materialAddress = journal.addresses.materialAddress;
  for (const record of journal.transactions.material_appends) {
    if (
      record.program_address !== normalized.programs.native_verifier ||
      record.account_address !== materialAddress
    ) {
      throw new Error("Initializer material append journal identity is wrong.");
    }
  }
  const expected = {
    material_seal: [normalized.programs.native_verifier, materialAddress],
    destination_route_initialize: [
      normalized.programs.destination,
      addresses.destinationStateAddress,
    ],
    source_route_initialize: [
      normalized.programs.source,
      addresses.sourceStateAddress,
    ],
  };
  for (const [action, [programAddress, accountAddress]] of Object.entries(
    expected,
  )) {
    const record = journal.transactions[action];
    if (
      record &&
      (record.program_address !== programAddress ||
        record.account_address !== accountAddress)
    ) {
      throw new Error(`Initializer ${action} journal identity is wrong.`);
    }
  }
};

const resumePreparedBootstrap = async ({
  connection,
  journal,
  journalPath,
  payerAddress,
  instructions,
  writeJournal,
}) => {
  if (journal.bootstrap?.status !== "prepared") return null;
  assertSolanaExactBootstrapIntentBinding({
    bootstrap: journal.bootstrap,
    payerAddress,
    instructions,
  });
  const { wire } = decodePreparedWire(
    {
      ...journal.bootstrap,
      transaction_sha256: journal.bootstrap.transaction_sha256,
      message_sha256: journal.bootstrap.message_sha256,
    },
    "Atomic bootstrap",
  );
  const existing = await connection.getTransaction(
    journal.bootstrap.transaction_signature,
    { commitment: "finalized", maxSupportedTransactionVersion: 0 },
  );
  if (existing) {
    const result = assertSolanaExactFinalizedTransactionReadback({
      readback: existing,
      expectedSignature: journal.bootstrap.transaction_signature,
      expectedMessageSha256: journal.bootstrap.message_sha256,
      label: "Atomic bootstrap",
    });
    journal.bootstrap = {
      ...journal.bootstrap,
      status: "finalized",
      transaction_base64: null,
      finalized_slot: result.slot,
    };
    await writeJournal(journalPath, journal);
    return Object.freeze({
      signature: journal.bootstrap.transaction_signature,
      slot: result.slot,
    });
  }
  const submitted = await connection.sendRawTransaction(wire, {
    maxRetries: 0,
    preflightCommitment: "finalized",
    skipPreflight: false,
  });
  if (submitted !== journal.bootstrap.transaction_signature) {
    throw new Error("Prepared bootstrap wire signature is not journal-bound.");
  }
  const confirmation = await connection.confirmTransaction(
    {
      signature: submitted,
      blockhash: journal.bootstrap.blockhash,
      lastValidBlockHeight: journal.bootstrap.last_valid_block_height,
    },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(
      "Prepared bootstrap did not land; its fresh mint signer was intentionally not persisted. Start with a new journal after reviewing the failed signature.",
    );
  }
  const readback = await connection.getTransaction(submitted, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  const result = assertSolanaExactFinalizedTransactionReadback({
    readback,
    expectedSignature: submitted,
    expectedMessageSha256: journal.bootstrap.message_sha256,
    label: "Resumed atomic bootstrap",
  });
  journal.bootstrap = {
    ...journal.bootstrap,
    status: "finalized",
    transaction_base64: null,
    finalized_slot: result.slot,
  };
  await writeJournal(journalPath, journal);
  return result;
};

export const assertSolanaExactBootstrapIntentBinding = ({
  bootstrap,
  payerAddress,
  instructions,
}) => {
  const expectedMessageSha256 = exactPreparedMessageSha256({
    payerAddress,
    blockhash: bootstrap.blockhash,
    instructions,
  });
  if (bootstrap.message_sha256 !== expectedMessageSha256) {
    throw new Error(
      "Atomic bootstrap prepared signed message is not the current exact instruction intent.",
    );
  }
  return bootstrap;
};

export const buildSolanaExactOrderedEvidence = ({ normalized, journal }) => {
  const bootstrap = journal.bootstrap;
  const tx = journal.transactions;
  const record = (programAddress, accountAddress, value) => ({
    program_address: programAddress,
    account_address: accountAddress,
    transaction_signature: value.transaction_signature,
    finalized_slot: value.finalized_slot,
  });
  const evidence = {
    schema: SOLANA_ORDERED_INITIALIZATION_SCHEMA,
    route_id: ROUTE_ID,
    asset_key: ASSET_KEY,
    revision: REVISION,
    solana_rpc_url: SOLANA_TESTNET_RPC_URL,
    fresh_deploy_report_sha256: normalized.freshDeployReportSha256,
    program_finalizations: normalized.programFinalizations,
    initialization_transactions: {
      token_mint_create: record(
        "11111111111111111111111111111111",
        journal.addresses.mintAddress,
        bootstrap,
      ),
      token_mint_initialize: record(
        "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
        journal.addresses.mintAddress,
        bootstrap,
      ),
      native_verifier_material_initialize: record(
        normalized.programs.native_verifier,
        journal.addresses.materialAddress,
        bootstrap,
      ),
      native_verifier_material_appends: tx.material_appends.map((entry) =>
        record(
          normalized.programs.native_verifier,
          journal.addresses.materialAddress,
          entry,
        ),
      ),
      native_verifier_material_seal: record(
        normalized.programs.native_verifier,
        journal.addresses.materialAddress,
        tx.material_seal,
      ),
      destination_route_initialize: record(
        normalized.programs.destination,
        journal.addresses.destinationStateAddress,
        tx.destination_route_initialize,
      ),
      source_route_initialize: record(
        normalized.programs.source,
        journal.addresses.sourceStateAddress,
        tx.source_route_initialize,
      ),
    },
    captured_at: new Date().toISOString(),
  };
  validateSolanaOrderedInitializationEvidence(evidence);
  return evidence;
};

export const assertSolanaExactCompletedEvidenceBinding = ({
  normalized,
  journal,
  evidence,
}) => {
  const expected = buildSolanaExactOrderedEvidence({ normalized, journal });
  expected.captured_at = evidence?.captured_at;
  if (canonicalJson(expected) !== canonicalJson(evidence)) {
    throw new Error(
      "Completed ordered-initialization evidence is not exactly bound to the current input and journal.",
    );
  }
  return validateSolanaOrderedInitializationEvidence(evidence);
};

const registrySummaryFor = ({ normalized, journal, addresses, plans }) => ({
  revision: REVISION,
  programs: {
    destination: normalized.programs.destination,
    source: normalized.programs.source,
    nativeVerifier: normalized.programs.native_verifier,
  },
  accounts: {
    tokenMint: addresses.mintAddress,
    destinationState: addresses.destinationStateAddress,
    sourceState: addresses.sourceStateAddress,
    nativeVerifierMaterial: journal.addresses.materialAddress,
    destinationProgramData:
      normalized.programFinalizations.destination.programdata_address,
    sourceProgramData:
      normalized.programFinalizations.source.programdata_address,
    nativeVerifierProgramData:
      normalized.programFinalizations.native_verifier.programdata_address,
  },
  codeHashes: {
    destination: normalized.programFinalizations.destination.program_code_hash,
    source: normalized.programFinalizations.source.program_code_hash,
    nativeVerifier:
      normalized.programFinalizations.native_verifier.program_code_hash,
  },
  programDataSlots: {
    destination:
      normalized.programFinalizations.destination.programdata_deployment_slot,
    source: normalized.programFinalizations.source.programdata_deployment_slot,
    nativeVerifier:
      normalized.programFinalizations.native_verifier
        .programdata_deployment_slot,
  },
  destinationBindingHash: normalized.hashes.destinationBindingHash,
  routeConfigurationHash: normalized.hashes.routeConfigurationHash,
  verifierKeyHash: plans.material.verifierKeyHash,
  nativeVerifierConfigHash: plans.material.nativeVerifierConfigHash,
  proofPolicy: {
    soraFinalityAnchorHash: normalized.hashes.soraAnchorHash,
    semanticProfileHash: normalized.hashes.semanticProfileHash,
    circuitCommitment: normalized.hashes.circuitCommitmentHash,
    witnessGeneratorCommitment:
      normalized.hashes.witnessGeneratorCommitmentHash,
    publicSignalSchemaHash: normalized.hashes.publicSignalSchemaHash,
  },
});

const exactRouteStateExpected = ({
  role,
  normalized,
  journal,
  addresses,
  plans,
}) => {
  const destination = role === SOLANA_EXACT_SCCP_ROLE_DESTINATION;
  return {
    role,
    routeRevision: REVISION,
    tokenMintAddress: addresses.mintAddress,
    peerRouteProgramId: destination
      ? normalized.programs.source
      : normalized.programs.destination,
    destinationStateAddress: addresses.destinationStateAddress,
    nativeVerifierProgramId: normalized.programs.native_verifier,
    nativeVerifierMaterialAddress: journal.addresses.materialAddress,
    destinationBindingHash: normalized.hashes.destinationBindingHash,
    routeConfigurationHash: normalized.hashes.routeConfigurationHash,
    verifierKeyHash: plans.material.verifierKeyHash,
    nativeVerifierConfigHash: plans.material.nativeVerifierConfigHash,
  };
};

const verifySolanaExactInitializedAccountReadbacks = async ({
  connection,
  normalized,
  journal,
  addresses,
  plans,
}) => {
  const [mint, material, destination, source] = await Promise.all([
    accountOrNull(connection, addresses.mintAddress),
    accountOrNull(connection, journal.addresses.materialAddress),
    accountOrNull(connection, addresses.destinationStateAddress),
    accountOrNull(connection, addresses.sourceStateAddress),
  ]);
  if (!mint || !material || !destination || !source) {
    throw new Error(
      "Completed initializer finalized account readback is incomplete.",
    );
  }
  inspectExactSolanaClassicMintAccount({
    account: mint,
    mintAddress: addresses.mintAddress,
    destinationProgramId: normalized.programs.destination,
    destinationStateAddress: addresses.destinationStateAddress,
  });
  inspectExactSolanaNativeMaterialAccount({
    account: material,
    materialAddress: journal.addresses.materialAddress,
    nativeVerifierProgramId: normalized.programs.native_verifier,
    expected: {
      routeRevision: REVISION,
      destinationProgramId: normalized.programs.destination,
      sourceProgramId: normalized.programs.source,
      destinationStateAddress: addresses.destinationStateAddress,
      tokenMintAddress: addresses.mintAddress,
      verifierKeyHash: plans.material.verifierKeyHash,
      nativeVerifierConfigHash: plans.material.nativeVerifierConfigHash,
      destinationBindingHash: normalized.hashes.destinationBindingHash,
      routeConfigurationHash: normalized.hashes.routeConfigurationHash,
      soraAnchorHash: normalized.hashes.soraAnchorHash,
      semanticProfileHash: normalized.hashes.semanticProfileHash,
      circuitCommitmentHash: normalized.hashes.circuitCommitmentHash,
      witnessGeneratorCommitmentHash:
        normalized.hashes.witnessGeneratorCommitmentHash,
      publicSignalSchemaHash: normalized.hashes.publicSignalSchemaHash,
    },
    requireSealed: true,
  });
  inspectExactSolanaRouteStateAccount({
    account: destination,
    routeProgramId: normalized.programs.destination,
    stateAddress: addresses.destinationStateAddress,
    expected: exactRouteStateExpected({
      role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
      normalized,
      journal,
      addresses,
      plans,
    }),
  });
  inspectExactSolanaRouteStateAccount({
    account: source,
    routeProgramId: normalized.programs.source,
    stateAddress: addresses.sourceStateAddress,
    expected: exactRouteStateExpected({
      role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
      normalized,
      journal,
      addresses,
      plans,
    }),
  });
};

const accountOrNull = (connection, address) =>
  connection.getAccountInfo(new PublicKey(address), "finalized");

export const runSolanaExactInitializer = async ({
  inputPath,
  expectedInputSha256,
  freshDeployReportPath,
  expectedFreshDeployReportSha256,
  journalPath,
  evidencePath,
  payerEnv = DEFAULT_SOLANA_EXACT_INITIALIZER_PAYER_ENV,
  mintEnv = DEFAULT_SOLANA_EXACT_INITIALIZER_MINT_ENV,
  env = process.env,
  connection: suppliedConnection = null,
  runtimeSignerLoader = loadRuntimeSolanaSigner,
  orderedTransactionVerifier = verifySolanaOrderedInitializationTransactions,
  initializedAccountVerifier = verifySolanaExactInitializedAccountReadbacks,
  freshDeployReportValidator = validateSolanaLoaderV3FreshDeployReport,
  freshDeployTransactionVerifier = verifySolanaLoaderV3FreshDeployReportTransactions,
}) => {
  inputPath = path.resolve(inputPath);
  freshDeployReportPath = path.resolve(freshDeployReportPath);
  journalPath = path.resolve(journalPath);
  evidencePath = path.resolve(evidencePath);
  const lockPath = `${journalPath}.lock`;
  if (
    new Set([
      inputPath,
      freshDeployReportPath,
      journalPath,
      evidencePath,
      lockPath,
    ]).size !== 5
  ) {
    throw new Error(
      "Initializer input, fresh-deploy report, journal, evidence, and lease paths must be distinct.",
    );
  }
  const loaded = await loadJson(inputPath, "Initializer input");
  const inputSha256 = sha256Hex(loaded.bytes);
  if (inputSha256 !== expectedInputSha256) {
    throw new Error(
      "Initializer input bytes do not match the explicit SHA-256 pin.",
    );
  }
  const normalized = validateSolanaExactInitializerInput(loaded.value);
  hash32(
    expectedFreshDeployReportSha256,
    "independent fresh deployment report SHA-256 pin",
  );
  if (expectedFreshDeployReportSha256 !== normalized.freshDeployReportSha256) {
    throw new Error(
      "Independent fresh-deploy report SHA-256 differs from the reviewed initializer input.",
    );
  }
  let freshDeployReportBytes;
  try {
    freshDeployReportBytes = await readFile(freshDeployReportPath);
  } catch (cause) {
    throw new Error("Fresh deployment report could not be read.", { cause });
  }
  const freshDeployReport = freshDeployReportValidator({
    reportBytes: freshDeployReportBytes,
    expectedReportSha256: expectedFreshDeployReportSha256,
  });
  assertSolanaExactFreshDeployReportBinding({
    normalized,
    freshDeployReport,
  });
  let payer = null;
  let mintSigner = null;
  let lease = null;
  let result = null;
  let cleanupError = null;
  const directoryPins = [];
  try {
    initialization: {
      const connection =
        suppliedConnection ??
        new Connection(normalized.input.solana_rpc_url, {
          commitment: "finalized",
          confirmTransactionInitialTimeout: 90_000,
        });
      const genesis = await connection.getGenesisHash();
      if (genesis !== "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY") {
        throw new Error(
          "Exact initializer RPC is not canonical Solana testnet.",
        );
      }
      const freshDeployTransactionVerification =
        await freshDeployTransactionVerifier(connection, freshDeployReport);
      if (
        freshDeployTransactionVerification?.ready !== true ||
        freshDeployTransactionVerification.reportSha256 !==
          normalized.freshDeployReportSha256
      ) {
        throw new Error(
          "Fresh-deploy report transactions were not independently reverified from finalized Solana RPC.",
        );
      }
      await verifySolanaAtomicProgramFinalizationTransaction(
        connection,
        Object.fromEntries(
          Object.entries(normalized.programFinalizations).map(
            ([role, record]) => [
              role,
              {
                programAddress: record.program_address,
                programdataAddress: record.programdata_address,
                transactionSignature: record.transaction_signature,
                finalizedSlot: record.finalized_slot,
              },
            ],
          ),
        ),
      );
      await Promise.all(
        Object.entries(normalized.programFinalizations).map(([role, record]) =>
          assertSolanaExactImmutableProgram(connection, record, role),
        ),
      );

      const journalPin = await pinSolanaExactOutputDirectory(journalPath);
      directoryPins.push(journalPin);
      const evidencePin =
        path.dirname(evidencePath) === journalPin.directory
          ? journalPin
          : await pinSolanaExactOutputDirectory(evidencePath);
      if (evidencePin !== journalPin) directoryPins.push(evidencePin);
      lease = await acquireSolanaExactInitializerLease({
        journalPath,
        inputSha256,
        directoryPin: journalPin,
      });
      const writeJournal = (target, value) =>
        writeSolanaExactJsonAtomically(target, value, {
          directoryPin: journalPin,
        });
      const writeEvidence = (target, value) =>
        writeSolanaExactJsonAtomically(target, value, {
          directoryPin: evidencePin,
        });

      let journal;
      try {
        const loadedJournal = await loadTrustedJson(
          journalPath,
          "Initializer journal",
          journalPin,
        );
        journal = validateSolanaExactInitializerJournal({
          value: loadedJournal.value,
          normalized,
          inputSha256,
        });
      } catch (cause) {
        if (cause?.code !== "ENOENT" && cause?.cause?.code !== "ENOENT") {
          throw cause;
        }
        const addresses = deriveSolanaExactInitializerAddresses({
          programs: normalized.programs,
          mintAddress: normalized.mintAddress,
        });
        journal = {
          schema: SOLANA_EXACT_INITIALIZER_JOURNAL_SCHEMA,
          input_sha256: inputSha256,
          payer_address: normalized.payerAddress,
          addresses: { ...addresses, materialAddress: null },
          bootstrap: null,
          prepared_actions: {},
          transactions: {
            material_appends: [],
            material_seal: null,
            destination_route_initialize: null,
            source_route_initialize: null,
          },
          status: "created",
          updated_at: new Date().toISOString(),
        };
        await createSolanaExactJsonExclusively(journalPath, journal, {
          directoryPin: journalPin,
        });
        journal = validateSolanaExactInitializerJournal({
          value: journal,
          normalized,
          inputSha256,
        });
      }

      const addresses = deriveSolanaExactInitializerAddresses({
        programs: normalized.programs,
        mintAddress: journal.addresses.mintAddress,
      });
      if (
        addresses.destinationStateAddress !==
          journal.addresses.destinationStateAddress ||
        addresses.sourceStateAddress !== journal.addresses.sourceStateAddress
      ) {
        throw new Error(
          "Initializer journal route-state PDAs are not canonical.",
        );
      }
      const publicPayer = { publicKey: new PublicKey(normalized.payerAddress) };
      const plans = await plansFor({
        connection,
        normalized,
        payer: publicPayer,
        addresses,
      });
      if (
        journal.addresses.materialAddress !== null &&
        journal.addresses.materialAddress !==
          plans.material.nativeVerifierMaterialAddress
      ) {
        throw new Error(
          "Initializer journal native-verifier material PDA is not canonical.",
        );
      }
      if (journal.addresses.materialAddress !== null) {
        assertSolanaExactJournalLifecycleIdentities({
          journal,
          normalized,
          addresses,
        });
      }
      if (journal.status === "complete") {
        const completedEvidence = await loadTrustedJson(
          evidencePath,
          "Completed ordered-initialization evidence",
          evidencePin,
        );
        if (
          sha256Hex(completedEvidence.bytes) !== journal.evidence_sha256 ||
          journal.evidence_path !== evidencePath
        ) {
          throw new Error(
            "Completed initializer evidence differs from its public journal pin.",
          );
        }
        const normalizedEvidence = assertSolanaExactCompletedEvidenceBinding({
          normalized,
          journal,
          evidence: completedEvidence.value,
        });
        await initializedAccountVerifier({
          connection,
          normalized,
          journal,
          addresses,
          plans,
        });
        const rpcVerification = await orderedTransactionVerifier(
          normalizedEvidence,
          {
            registrySummary: registrySummaryFor({
              normalized,
              journal,
              addresses,
              plans,
            }),
          },
        );
        if (
          rpcVerification?.ready !== true ||
          rpcVerification.transactions.length !==
            journal.rpc_verification.transaction_count
        ) {
          throw new Error(
            "Completed initializer RPC verification differs from its journal.",
          );
        }
        result = Object.freeze({
          ready: true,
          mintAddress: addresses.mintAddress,
          destinationStateAddress: addresses.destinationStateAddress,
          sourceStateAddress: addresses.sourceStateAddress,
          materialAddress: journal.addresses.materialAddress,
          evidenceSha256: journal.evidence_sha256,
          freshDeployReportSha256: normalized.freshDeployReportSha256,
        });
        break initialization;
      }
      journal.addresses.materialAddress =
        plans.material.nativeVerifierMaterialAddress;
      await writeJournal(journalPath, journal);

      const acquirePayer = () => {
        payer ??= runtimeSignerLoader({
          env,
          envName: payerEnv,
          expectedAddress: normalized.payerAddress,
          label: "exact Solana initializer payer",
        });
        return payer;
      };
      const acquireMintSigner = () => {
        mintSigner ??= runtimeSignerLoader({
          env,
          envName: mintEnv,
          expectedAddress: normalized.mintAddress,
          label: "preselected exact SPL XOR mint",
        });
        return mintSigner;
      };
      const bootstrapInstructions = [
        ...plans.mint.instructions.map(descriptorInstruction),
        descriptorInstruction(plans.material.instructions.initialize),
      ];

      await resumePreparedBootstrap({
        connection,
        journal,
        journalPath,
        payerAddress: normalized.payerAddress,
        instructions: bootstrapInstructions,
        writeJournal,
      });
      let [mintAccount, materialAccount] = await Promise.all([
        accountOrNull(connection, addresses.mintAddress),
        accountOrNull(connection, journal.addresses.materialAddress),
      ]);
      if (!mintAccount || !materialAccount) {
        await submitPreparedBootstrap({
          connection,
          payer: acquirePayer(),
          mint: acquireMintSigner(),
          instructions: bootstrapInstructions,
          journal,
          journalPath,
          writeJournal,
        });
        [mintAccount, materialAccount] = await Promise.all([
          accountOrNull(connection, addresses.mintAddress),
          accountOrNull(connection, journal.addresses.materialAddress),
        ]);
      }
      if (!mintAccount || !materialAccount) {
        throw new Error("Atomic mint/material bootstrap readback is missing.");
      }
      inspectExactSolanaClassicMintAccount({
        account: mintAccount,
        mintAddress: addresses.mintAddress,
        destinationProgramId: normalized.programs.destination,
        destinationStateAddress: addresses.destinationStateAddress,
      });
      let material = inspectExactSolanaNativeMaterialAccount({
        account: materialAccount,
        materialAddress: journal.addresses.materialAddress,
        nativeVerifierProgramId: normalized.programs.native_verifier,
        expected: {
          destinationProgramId: normalized.programs.destination,
          sourceProgramId: normalized.programs.source,
          destinationStateAddress: addresses.destinationStateAddress,
          tokenMintAddress: addresses.mintAddress,
          destinationBindingHash: normalized.hashes.destinationBindingHash,
          routeConfigurationHash: normalized.hashes.routeConfigurationHash,
        },
        requireSealed: false,
      });
      if (!journal.bootstrap?.finalized_slot) {
        throw new Error(
          "Atomic bootstrap finalized signature is absent from the public journal.",
        );
      }

      for (const instruction of plans.material.instructions.append) {
        const bytes = Buffer.from(instruction.dataHex.slice(2), "hex");
        const offset = bytes.readUInt16LE(2);
        const length = bytes.readUInt16LE(4);
        const appendInstructions = [descriptorInstruction(instruction)];
        if (material.written >= offset + length) {
          if (
            !journal.transactions.material_appends.some(
              (entry) => entry.offset === offset,
            )
          ) {
            const discovered = await resolveSolanaExactObservedPreparedAction({
              connection,
              journal,
              action: `material_append_${offset}`,
              payerAddress: normalized.payerAddress,
              instructions: appendInstructions,
              programAddress: normalized.programs.native_verifier,
              accountAddress: journal.addresses.materialAddress,
              label: `material append at ${offset}`,
            });
            journal.transactions.material_appends.push({
              ...transactionRecord({
                programAddress: normalized.programs.native_verifier,
                accountAddress: journal.addresses.materialAddress,
                result: discovered,
              }),
              offset,
            });
            journal.transactions.material_appends.sort(
              (left, right) => left.offset - right.offset,
            );
            await writeJournal(journalPath, journal);
          }
          continue;
        }
        if (material.status !== "writing" || material.written !== offset) {
          throw new Error(
            "Material append readback is not on an exact resumable chunk boundary.",
          );
        }
        const result = await submitSolanaExactPreparedTransaction({
          connection,
          payerAddress: normalized.payerAddress,
          acquirePayer,
          instructions: appendInstructions,
          label: `material append at ${offset}`,
          action: `material_append_${offset}`,
          programAddress: normalized.programs.native_verifier,
          accountAddress: journal.addresses.materialAddress,
          journal,
          journalPath,
          writeJournal,
        });
        journal.transactions.material_appends.push({
          ...transactionRecord({
            programAddress: normalized.programs.native_verifier,
            accountAddress: journal.addresses.materialAddress,
            result,
          }),
          offset,
        });
        journal.updated_at = new Date().toISOString();
        await writeJournal(journalPath, journal);
        materialAccount = await accountOrNull(
          connection,
          journal.addresses.materialAddress,
        );
        material = inspectExactSolanaNativeMaterialAccount({
          account: materialAccount,
          materialAddress: journal.addresses.materialAddress,
          nativeVerifierProgramId: normalized.programs.native_verifier,
          expected: { sourceProgramId: normalized.programs.source },
          requireSealed: false,
        });
      }
      const materialSealInstructions = [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MAX_COMPUTE_UNITS,
        }),
        descriptorInstruction(plans.material.instructions.seal),
      ];
      if (material.status !== "sealed") {
        const result = await submitSolanaExactPreparedTransaction({
          connection,
          payerAddress: normalized.payerAddress,
          acquirePayer,
          instructions: materialSealInstructions,
          label: "material seal",
          action: "material_seal",
          programAddress: normalized.programs.native_verifier,
          accountAddress: journal.addresses.materialAddress,
          journal,
          journalPath,
          writeJournal,
        });
        journal.transactions.material_seal = transactionRecord({
          programAddress: normalized.programs.native_verifier,
          accountAddress: journal.addresses.materialAddress,
          result,
        });
        await writeJournal(journalPath, journal);
      } else if (!journal.transactions.material_seal) {
        const discovered = await resolveSolanaExactObservedPreparedAction({
          connection,
          journal,
          action: "material_seal",
          payerAddress: normalized.payerAddress,
          instructions: materialSealInstructions,
          programAddress: normalized.programs.native_verifier,
          accountAddress: journal.addresses.materialAddress,
          label: "material seal",
        });
        journal.transactions.material_seal = transactionRecord({
          programAddress: normalized.programs.native_verifier,
          accountAddress: journal.addresses.materialAddress,
          result: discovered,
        });
        await writeJournal(journalPath, journal);
      }

      for (const [role, descriptor, stateAddress, programAddress] of [
        [
          "destination_route_initialize",
          plans.destination,
          addresses.destinationStateAddress,
          normalized.programs.destination,
        ],
        [
          "source_route_initialize",
          plans.source,
          addresses.sourceStateAddress,
          normalized.programs.source,
        ],
      ]) {
        const destinationRole = role === "destination_route_initialize";
        const roleByte = destinationRole
          ? SOLANA_EXACT_SCCP_ROLE_DESTINATION
          : SOLANA_EXACT_SCCP_ROLE_SOURCE;
        const peerProgramAddress = destinationRole
          ? normalized.programs.source
          : normalized.programs.destination;
        const expectedState = {
          role: roleByte,
          routeRevision: REVISION,
          tokenMintAddress: addresses.mintAddress,
          peerRouteProgramId: peerProgramAddress,
          destinationStateAddress: addresses.destinationStateAddress,
          nativeVerifierProgramId: normalized.programs.native_verifier,
          nativeVerifierMaterialAddress: journal.addresses.materialAddress,
          destinationBindingHash: normalized.hashes.destinationBindingHash,
          routeConfigurationHash: normalized.hashes.routeConfigurationHash,
          verifierKeyHash: plans.material.verifierKeyHash,
          nativeVerifierConfigHash: plans.material.nativeVerifierConfigHash,
        };
        const routeInstructions = [descriptorInstruction(descriptor)];
        const existing = await accountOrNull(connection, stateAddress);
        if (existing) {
          inspectExactSolanaRouteStateAccount({
            account: existing,
            routeProgramId: programAddress,
            stateAddress,
            expected: expectedState,
          });
          if (!journal.transactions[role]) {
            const discovered = await resolveSolanaExactObservedPreparedAction({
              connection,
              journal,
              action: role,
              payerAddress: normalized.payerAddress,
              instructions: routeInstructions,
              programAddress,
              accountAddress: stateAddress,
              label: role,
            });
            journal.transactions[role] = transactionRecord({
              programAddress,
              accountAddress: stateAddress,
              result: discovered,
            });
            await writeJournal(journalPath, journal);
          }
          continue;
        }
        const result = await submitSolanaExactPreparedTransaction({
          connection,
          payerAddress: normalized.payerAddress,
          acquirePayer,
          instructions: routeInstructions,
          label: role,
          action: role,
          programAddress,
          accountAddress: stateAddress,
          journal,
          journalPath,
          writeJournal,
        });
        journal.transactions[role] = transactionRecord({
          programAddress,
          accountAddress: stateAddress,
          result,
        });
        const created = await accountOrNull(connection, stateAddress);
        inspectExactSolanaRouteStateAccount({
          account: created,
          routeProgramId: programAddress,
          stateAddress,
          expected: expectedState,
        });
        await writeJournal(journalPath, journal);
      }

      await initializedAccountVerifier({
        connection,
        normalized,
        journal,
        addresses,
        plans,
      });
      const evidence = buildSolanaExactOrderedEvidence({ normalized, journal });
      const normalizedEvidence =
        validateSolanaOrderedInitializationEvidence(evidence);
      const registrySummary = registrySummaryFor({
        normalized,
        journal,
        addresses,
        plans,
      });
      const rpcVerification = await orderedTransactionVerifier(
        normalizedEvidence,
        { registrySummary },
      );
      if (rpcVerification?.ready !== true) {
        throw new Error("Exact ordered transaction verification is not ready.");
      }
      await writeEvidence(evidencePath, evidence);
      journal.status = "complete";
      journal.evidence_path = evidencePath;
      journal.evidence_sha256 = sha256Hex(
        Buffer.from(`${canonicalJson(evidence)}\n`),
      );
      journal.rpc_verification = {
        ready: rpcVerification.ready,
        transaction_count: rpcVerification.transactions.length,
        checked_at: new Date().toISOString(),
      };
      journal.updated_at = new Date().toISOString();
      validateSolanaExactInitializerJournal({
        value: journal,
        normalized,
        inputSha256,
      });
      await writeJournal(journalPath, journal);
      result = Object.freeze({
        ready: true,
        mintAddress: addresses.mintAddress,
        destinationStateAddress: addresses.destinationStateAddress,
        sourceStateAddress: addresses.sourceStateAddress,
        materialAddress: journal.addresses.materialAddress,
        evidenceSha256: journal.evidence_sha256,
        freshDeployReportSha256: normalized.freshDeployReportSha256,
      });
    }
  } finally {
    zeroizeRuntimeSolanaSigner(mintSigner);
    zeroizeRuntimeSolanaSigner(payer);
    if (lease) {
      try {
        await releaseSolanaExactInitializerLease(lease);
      } catch (error) {
        cleanupError = error;
      }
    }
    for (const pin of directoryPins) {
      try {
        await pin.handle.close();
      } catch (error) {
        cleanupError ??= error;
      }
    }
  }
  if (cleanupError) throw cleanupError;
  return result;
};

export const parseSolanaExactInitializerArgs = (argv) => {
  if (!Array.isArray(argv) || argv.length % 2 !== 0) {
    throw new TypeError("Initializer arguments must be --name value pairs.");
  }
  const options = Object.create(null);
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      typeof name !== "string" ||
      !/^--[a-z][a-z0-9-]*$/u.test(name) ||
      typeof value !== "string" ||
      value.length === 0 ||
      value.startsWith("--")
    ) {
      throw new TypeError("Initializer arguments must be --name value pairs.");
    }
    const option = name.slice(2);
    if (Object.hasOwn(options, option)) {
      throw new TypeError(
        `Initializer option --${option} may appear only once.`,
      );
    }
    options[option] = value;
  }
  const allowed = new Set([
    "input",
    "expected-input-sha256",
    "fresh-deploy-report",
    "expected-fresh-deploy-report-sha256",
    "journal",
    "evidence",
    "payer-env",
    "mint-env",
    "submit",
  ]);
  if (Object.keys(options).some((name) => !allowed.has(name))) {
    throw new TypeError("Initializer received an unsupported option.");
  }
  for (const required of [
    "input",
    "expected-input-sha256",
    "fresh-deploy-report",
    "expected-fresh-deploy-report-sha256",
    "journal",
    "evidence",
  ]) {
    if (!options[required]) throw new TypeError(`--${required} is required.`);
  }
  if (options.submit !== "true") {
    throw new TypeError(
      "Irreversible initialization requires explicit --submit true.",
    );
  }
  hash32(options["expected-input-sha256"], "initializer input SHA-256 pin");
  hash32(
    options["expected-fresh-deploy-report-sha256"],
    "fresh deployment report SHA-256 pin",
  );
  const resolvedPaths = [
    path.resolve(options.input),
    path.resolve(options["fresh-deploy-report"]),
    path.resolve(options.journal),
    path.resolve(options.evidence),
  ];
  const leasePath = `${resolvedPaths[2]}.lock`;
  if (new Set([...resolvedPaths, leasePath]).size !== 5) {
    throw new TypeError(
      "Initializer input, fresh-deploy report, journal, evidence, and lease paths must be distinct.",
    );
  }
  return Object.freeze({
    inputPath: resolvedPaths[0],
    expectedInputSha256: options["expected-input-sha256"],
    freshDeployReportPath: resolvedPaths[1],
    expectedFreshDeployReportSha256:
      options["expected-fresh-deploy-report-sha256"],
    journalPath: resolvedPaths[2],
    evidencePath: resolvedPaths[3],
    payerEnv: normalizeRuntimeSecretEnvName(
      options["payer-env"],
      DEFAULT_SOLANA_EXACT_INITIALIZER_PAYER_ENV,
    ),
    mintEnv: normalizeRuntimeSecretEnvName(
      options["mint-env"],
      DEFAULT_SOLANA_EXACT_INITIALIZER_MINT_ENV,
    ),
  });
};

export const parseSolanaExactInitializerCliArgs = (argv) => {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    throw new TypeError("Initializer CLI arguments must be strings.");
  }
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return Object.freeze({ help: true, options: null });
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    throw new TypeError("--help and -h must be used alone.");
  }
  return Object.freeze({
    help: false,
    options: parseSolanaExactInitializerArgs(argv),
  });
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(modulePath)
) {
  Promise.resolve()
    .then(async () => {
      const args = parseSolanaExactInitializerCliArgs(process.argv.slice(2));
      if (args.help) {
        process.stdout.write(SOLANA_EXACT_INITIALIZER_USAGE);
        return;
      }
      const result = await runSolanaExactInitializer(args.options);
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
