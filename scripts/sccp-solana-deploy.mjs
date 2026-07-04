#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-solana-deploy");
const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
const DEFAULT_TAIRA_MCP_URL = "https://taira.sora.org/v1/mcp";
const DEFAULT_SOLANA_RPC_URL = "https://api.testnet.solana.com";
const DEFAULT_MIN_BALANCE_SOL = 3;
const DEFAULT_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY_ENV =
  "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY";
const DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_ASSET_ID =
  "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_LIMIT = 2_000_000;
const DEFAULT_PROGRAM_SO = path.join(
  repoRoot,
  "output/sccp-solana-build/sccp_taira_xor.so",
);
const SCCP_SOLANA_STATE_SPACE = 272;
const SPL_TOKEN_MINT_SPACE = 82;
const SPL_TOKEN_DECIMALS = 9;
const SOLANA_TESTNET_NETWORK_ID = "solana-testnet";
const SOLANA_TESTNET_CHAIN_ID_HEX = "0x736f6c616e612d746573746e6574";
const SCCP_SOLANA_XOR_ROUTE_ID = "taira_sol_xor";
const SCCP_XOR_ASSET_KEY = "xor";
const SCCP_SORA_DOMAIN = 0;
const SCCP_SOLANA_DOMAIN = 3;
const SCCP_SOLANA_BASE58_CODEC = 3;
const SOLANA_DESTINATION_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-destination-prover.js";
const SOLANA_SOURCE_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-source-prover.js";
const SOLANA_DESTINATION_BINDING_KEY = "sccp:0:3:sol:solana-program-v1:2";
const SOLANA_DESTINATION_BINDING_HASH =
  "0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6";
const SOLANA_PRODUCTION_ADMISSION_MODE = "governed-zk-verifier-v1";
const SOLANA_DRAFT_ADMISSION_MODE = "envelope-recorder-v1";
const SOLANA_DESTINATION_PROOF_SYSTEM = "stark-fri-v1";
const SOLANA_SUBMIT_ENTRYPOINT = "submit_sccp_message_proof";
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const SCCP_SOLANA_MINT_AUTHORITY_SEED = "sccp-taira-xor-mint-authority";
const SCCP_SOLANA_INITIALIZE_ENTRYPOINT = "initialize_sccp_state";
const siblingDeployScript = path.resolve(
  repoRoot,
  "../iroha/scripts/sccp_solana_taira_xor_deploy.mjs",
);
const siblingLiveEvidenceScript = path.resolve(
  repoRoot,
  "../iroha/scripts/sccp_solana_live_evidence.py",
);
const submitUpsertScript = path.resolve(
  repoRoot,
  "scripts/taira-submit-upsert-sccp-route-manifest.mjs",
);

const usage = () => {
  console.log(`Usage:
  node scripts/sccp-solana-deploy.mjs <command> [options]

Commands:
  doctor
    Check Solana CLI, Solana testnet RPC, sibling helper, and TAIRA manifest endpoint.

  generate-keypairs
    Generate ignored Solana deployer, verifier, bridge, source, state, source-state, and mint keypairs.

  rotate-deployment-keypairs
    Preserve the funded deployer keypair and replace verifier/bridge/source/state/source-state/mint keypairs.

  fund
    Check deployer testnet SOL balance and request bounded airdrops when needed.

  accounts
    Create or validate the SPL mint plus verifier/source SCCP state accounts without redeploying programs.

  deploy [--program-so PATH]
    Deploy the compiled Solana SCCP program to verifier/bridge/source program IDs,
    then create the SPL mint plus verifier and source state accounts.

  evidence
    Capture live Solana ProgramData evidence with the sibling helper.

  live-evidence
    Capture finalized Solana JSON-RPC evidence, including live ProgramData code hash.

  draft-manifest
    Write a local fail-closed taira_sol_xor draft manifest from live deployment evidence.

  deployment-video
    Render an MP4 + VTT subtitle walkthrough of the real Solana testnet deployment evidence.

  production-requirements
    Write a machine-readable report with the remaining governed proof material,
    post-deploy evidence, and route publication inputs required for production.

  route-manifest --template PATH
    Build a production-ready route manifest from template plus live evidence.

  route-manifest-isi
    Write a reviewable UpsertSccpRouteManifest ISI artifact for TAIRA.

  publish-route-manifest [--submit true --authority ACCOUNT_ID]
    Write the ISI artifact and optionally submit it to TAIRA MCP.

  propose
    Legacy HTTP governance proposal path. Public TAIRA currently does not expose it.

  all [--program-so PATH] --template PATH
    Run doctor, keypair generation, funding, deploy, evidence, manifest, propose.

Options:
  --output-dir PATH              Artifact directory (default: output/sccp-solana-deploy)
  --program-so PATH              Compiled SBF program (default: ${path.relative(repoRoot, DEFAULT_PROGRAM_SO)})
  --solana-rpc-url URL           Solana testnet RPC (default: ${DEFAULT_SOLANA_RPC_URL})
  --torii-url URL                TAIRA Torii endpoint (default: ${DEFAULT_TAIRA_TORII_URL})
  --mcp-url URL                  TAIRA MCP endpoint (default: ${DEFAULT_TAIRA_MCP_URL})
  --authority ACCOUNT_ID         TAIRA route-manifest manager for --submit true
  --private-key-env NAME         Runtime env var for route-manager private key
                                  (default: ${DEFAULT_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY_ENV})
  --install-solana-cli true      Install Solana CLI with Homebrew when missing
  --min-balance-sol NUMBER       Minimum deployer balance before deploy (default: ${DEFAULT_MIN_BALANCE_SOL})
  --airdrop-sol NUMBER           SOL to request per airdrop attempt (default: 1)
  --airdrop-attempts NUMBER      Maximum airdrop attempts (default: 5)
  --force true                   Overwrite generated keypairs
`);
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      args.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    index += 1;
  }
  return args;
};

const asBoolean = (value) => value === true || value === "true";

const asPositiveNumber = (value, fallback, label) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
};

const asNonNegativeInteger = (value, fallback, label) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return parsed;
};

const requireOption = (args, key) => {
  const value = args[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`--${key} is required.`);
  }
  return value.trim();
};

const artifactPaths = (args) => {
  const outputDir = path.resolve(args["output-dir"] || DEFAULT_OUTPUT_DIR);
  return {
    outputDir,
    deployerKeypair: path.join(outputDir, "solana-deployer-keypair.json"),
    programIdKeypair: path.join(outputDir, "solana-program-id-keypair.json"),
    bridgeProgramIdKeypair: path.join(
      outputDir,
      "solana-bridge-program-id-keypair.json",
    ),
    sourceBridgeProgramIdKeypair: path.join(
      outputDir,
      "solana-source-bridge-program-id-keypair.json",
    ),
    stateKeypair: path.join(outputDir, "solana-verifier-state-keypair.json"),
    sourceStateKeypair: path.join(
      outputDir,
      "solana-source-state-keypair.json",
    ),
    tokenMintKeypair: path.join(outputDir, "solana-tairaxor-mint-keypair.json"),
    publicConfig: path.join(outputDir, "solana-deploy-public.json"),
    doctorReport: path.join(outputDir, "doctor.json"),
    fundingReport: path.join(outputDir, "funding.json"),
    deployLog: path.join(outputDir, "deploy.log"),
    deployBlocked: path.join(outputDir, "deploy-blocked.json"),
    accountsReport: path.join(outputDir, "solana-accounts.json"),
    evidence: path.join(outputDir, "solana-program.evidence.json"),
    liveEvidence: path.join(outputDir, "solana-live-evidence.summary.json"),
    bridgeEvidence: path.join(outputDir, "solana-bridge-program.evidence.json"),
    sourceBridgeEvidence: path.join(
      outputDir,
      "solana-source-bridge-program.evidence.json",
    ),
    routeManifest: path.join(outputDir, "taira-solana-xor-route.manifest.json"),
    routeManifestIsi: path.join(
      outputDir,
      "taira-solana-xor-route.upsert-isi.json",
    ),
    routeManifestSubmission: path.join(
      outputDir,
      "taira-solana-xor-route.submission.json",
    ),
    routeManifestPublishBlocked: path.join(
      outputDir,
      "taira-solana-xor-route.publish-blocked.json",
    ),
    productionRequirements: path.join(
      outputDir,
      "taira-solana-xor-production-requirements.json",
    ),
    proposalResponse: path.join(
      outputDir,
      "taira-solana-xor-route.proposal.json",
    ),
  };
};

const commandExists = (command) =>
  spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  }).status === 0;

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed:\n${output}`);
  }
  return result.stdout?.trim() ?? "";
};

const runNodeHelper = (args, options = {}) =>
  run(process.execPath, [siblingDeployScript, ...args], options);

const writeJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  await chmod(file, 0o600);
};

const writePublicJson = async (file, value) => {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
};

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));

const readOptionalJson = async (file) =>
  existsSync(file) ? readJson(file) : null;

const readKeypair = async (file) =>
  Keypair.fromSecretKey(Uint8Array.from(await readJson(file)));

const keypairPubkey = async (file) => (await readKeypair(file)).publicKey;

const deriveMintAuthority = (verifierProgramId, verifierStateAddress) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from(SCCP_SOLANA_MINT_AUTHORITY_SEED, "utf8"),
      verifierStateAddress.toBytes(),
    ],
    verifierProgramId,
  );

const createKeypairFile = async (file) => {
  const keypair = Keypair.generate();
  await writeJson(file, Array.from(keypair.secretKey));
  return keypair;
};

const ensureKeypairFile = async (file) =>
  existsSync(file) ? readKeypair(file) : createKeypairFile(file);

const encodeBorshVecs = (...values) =>
  Buffer.concat(
    values.flatMap((value) => {
      const bytes = Buffer.isBuffer(value)
        ? value
        : Buffer.from(String(value), "utf8");
      const length = Buffer.alloc(4);
      length.writeUInt32LE(bytes.length, 0);
      return [length, bytes];
    }),
  );

const createConnection = (args) =>
  new Connection(args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL, "confirmed");

const sendSolanaTransaction = async (connection, transaction, signers) =>
  sendAndConfirmTransaction(connection, transaction, signers, {
    commitment: "confirmed",
    maxRetries: 5,
  });

const getAccount = async (connection, publicKey) =>
  connection.getAccountInfo(publicKey, "confirmed");

const sha256Hex = (value) => createHash("sha256").update(value).digest("hex");

const sha256FileHex = async (file) => sha256Hex(await readFile(file));

const hex32 = (value) => `0x${String(value).replace(/^0x/u, "")}`;

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const clonePublicJson = (value) => JSON.parse(JSON.stringify(value));

const sha256JsonHex = (value) => hex32(sha256Hex(JSON.stringify(value)));

const readFirstManifestString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readFirstManifestRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
};

const readManifestBooleanAlias = (record, camelKey, snakeKey, label) => {
  const camel = record?.[camelKey];
  const snake = record?.[snakeKey];
  const values = [camel, snake].filter((value) => value !== undefined);
  if (values.length === 0) {
    throw new Error(`${label} is missing.`);
  }
  if (values.some((value) => typeof value !== "boolean")) {
    throw new Error(`${label} must be boolean.`);
  }
  if (values.length === 2 && values[0] !== values[1]) {
    throw new Error(`${label} aliases disagree.`);
  }
  return values[0];
};

const requireManifestString = (record, keys, label) => {
  const value = readFirstManifestString(record, ...keys);
  if (!value) {
    throw new Error(`${label} is missing.`);
  }
  return value;
};

const normalizeManifestHex32 = (value, label) => {
  const body = String(value ?? "")
    .trim()
    .replace(/^0x/u, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(body) || /^0{64}$/u.test(body)) {
    throw new Error(`${label} must be a non-zero 32-byte hex value.`);
  }
  return `0x${body}`;
};

const assertNoForbiddenManifestFields = (value, pathLabel = "manifest") => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return;
  }
  const entries = Array.isArray(value)
    ? value.map((entry, index) => [String(index), entry])
    : Object.entries(value);
  for (const [key, entry] of entries) {
    const nextPath = `${pathLabel}.${key}`;
    if (
      [
        "tron_network",
        "tronNetwork",
        "tron_verifier_address",
        "tronVerifierAddress",
        "sccp_tron_source_bridge_address",
        "sccpTronSourceBridgeAddress",
      ].includes(key)
    ) {
      throw new Error(
        `Solana route manifest must not carry TRON field ${nextPath}.`,
      );
    }
    if (key === "placeholderMaterial" || key === "placeholder_material") {
      if (entry === true) {
        throw new Error(
          `Solana route manifest contains placeholder material at ${nextPath}.`,
        );
      }
    }
    if (
      key === "disabledReason" ||
      key === "disabled_reason" ||
      key === "disabled"
    ) {
      if (entry !== undefined && entry !== null && String(entry).trim()) {
        throw new Error(
          `Production Solana route manifest must not include ${nextPath}.`,
        );
      }
    }
    assertNoForbiddenManifestFields(entry, nextPath);
  }
};

const assertSourceVerifierMaterial = (manifest) => {
  const material = readFirstManifestRecord(
    manifest,
    "sourceVerifierMaterial",
    "source_verifier_material",
  );
  if (!material) {
    throw new Error("Solana source verifier material is missing.");
  }
  for (const [camel, snake] of [
    ["sourceTrustAnchorHash", "source_trust_anchor_hash"],
    ["consensusVerifierHash", "consensus_verifier_hash"],
    ["messageInclusionVerifierHash", "message_inclusion_verifier_hash"],
    ["finalityPolicyHash", "finality_policy_hash"],
    ["sourceStateVerifierHash", "source_state_verifier_hash"],
  ]) {
    normalizeManifestHex32(
      requireManifestString(
        material,
        [camel, snake],
        `sourceVerifierMaterial.${camel}`,
      ),
      `sourceVerifierMaterial.${camel}`,
    );
  }
};

const assertPostDeployEvidence = (manifest) => {
  const evidence = readFirstManifestRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  if (!evidence) {
    throw new Error("Solana post-deploy live evidence is missing.");
  }
  if (evidence.fullTomlReady !== true && evidence.full_toml_ready !== true) {
    throw new Error("postDeployLiveEvidence.fullTomlReady must be true.");
  }
  for (const [camel, snake] of [
    ["sourceBridgeConfigHash", "source_bridge_config_hash"],
    ["routeCanaryEvidenceHash", "route_canary_evidence_hash"],
    ["offlineFullTomlSha256", "offline_full_toml_sha256"],
  ]) {
    normalizeManifestHex32(
      requireManifestString(
        evidence,
        [camel, snake],
        `postDeployLiveEvidence.${camel}`,
      ),
      `postDeployLiveEvidence.${camel}`,
    );
  }
  const sourceSignature = requireManifestString(
    evidence,
    [
      "sourceEventTransactionSignature",
      "source_event_transaction_signature",
      "sourceEventSignature",
      "source_event_signature",
      "sourceEventTransactionId",
      "source_event_transaction_id",
    ],
    "postDeployLiveEvidence.sourceEventTransactionSignature",
  );
  const canarySignature = requireManifestString(
    evidence,
    [
      "routeCanaryTransactionSignature",
      "route_canary_transaction_signature",
      "routeCanarySignature",
      "route_canary_signature",
      "routeCanaryTransactionId",
      "route_canary_transaction_id",
    ],
    "postDeployLiveEvidence.routeCanaryTransactionSignature",
  );
  if (sourceSignature === canarySignature) {
    throw new Error(
      "postDeployLiveEvidence source event and route canary signatures must be distinct.",
    );
  }
};

const assertBrowserProver = (manifest, keys, label) => {
  const prover = readFirstManifestRecord(manifest, ...keys);
  if (!prover) {
    throw new Error(`${label} is missing.`);
  }
  requireManifestString(
    prover,
    ["moduleUrl", "module_url"],
    `${label}.moduleUrl`,
  );
  normalizeManifestHex32(
    requireManifestString(
      prover,
      ["moduleHash", "module_hash"],
      `${label}.moduleHash`,
    ),
    `${label}.moduleHash`,
  );
  normalizeManifestHex32(
    requireManifestString(
      prover,
      ["manifestHash", "manifest_hash"],
      `${label}.manifestHash`,
    ),
    `${label}.manifestHash`,
  );
};

const readDestinationProofAdmission = (manifest) =>
  readFirstManifestRecord(
    manifest,
    "destinationProofAdmission",
    "destination_proof_admission",
    "solanaDestinationProofAdmission",
    "solana_destination_proof_admission",
    "verifierAdmission",
    "verifier_admission",
  );

const requireAdmissionString = (admission, keys, label) =>
  requireManifestString(admission, keys, `destinationProofAdmission.${label}`);

const assertSolanaDestinationProofAdmission = (manifest) => {
  const admission = readDestinationProofAdmission(manifest);
  if (!admission) {
    throw new Error("Solana destination proof admission material is missing.");
  }
  const admissionMode = requireAdmissionString(
    admission,
    ["admissionMode", "admission_mode", "mode"],
    "admissionMode",
  );
  if (admissionMode !== SOLANA_PRODUCTION_ADMISSION_MODE) {
    throw new Error(
      `Solana destination proof admission mode must be ${SOLANA_PRODUCTION_ADMISSION_MODE}.`,
    );
  }
  const proofSystem = requireAdmissionString(
    admission,
    ["proofSystem", "proof_system", "proofFamily", "proof_family"],
    "proofSystem",
  );
  if (proofSystem !== SOLANA_DESTINATION_PROOF_SYSTEM) {
    throw new Error(
      `Solana destination proof admission proof system must be ${SOLANA_DESTINATION_PROOF_SYSTEM}.`,
    );
  }
  const entrypoint = requireAdmissionString(
    admission,
    ["entrypoint", "entry_point", "verifierEntrypoint", "verifier_entrypoint"],
    "entrypoint",
  );
  if (entrypoint !== SOLANA_SUBMIT_ENTRYPOINT) {
    throw new Error(
      `Solana destination proof admission entrypoint must be ${SOLANA_SUBMIT_ENTRYPOINT}.`,
    );
  }
  for (const [keys, label] of [
    [["verifierCodeHash", "verifier_code_hash"], "verifierCodeHash"],
    [["verifierKeyHash", "verifier_key_hash"], "verifierKeyHash"],
    [
      ["destinationBindingHash", "destination_binding_hash"],
      "destinationBindingHash",
    ],
  ]) {
    const expected = normalizeManifestHex32(
      requireManifestString(manifest, keys, `Solana ${label}`),
      `Solana ${label}`,
    );
    const actual = normalizeManifestHex32(
      requireAdmissionString(admission, keys, label),
      `destinationProofAdmission.${label}`,
    );
    if (actual !== expected) {
      throw new Error(
        `Solana destination proof admission ${label} must match the route manifest.`,
      );
    }
  }
  for (const [camel, snake] of [
    ["shapeOnly", "shape_only"],
    ["envelopeOnly", "envelope_only"],
    ["acceptsUnverifiedProofs", "accepts_unverified_proofs"],
  ]) {
    const value = admission[camel] ?? admission[snake];
    if (value === true || value === "true") {
      throw new Error(
        `Solana destination proof admission ${camel} must be false for production.`,
      );
    }
  }
};

const SOLANA_SOURCE_VERIFIER_REQUIREMENTS = [
  {
    key: "sourceTrustAnchorHash",
    snakeKey: "source_trust_anchor_hash",
    helperArg: "--source-trust-anchor-hash",
    description: "Governed Solana source trust anchor hash.",
  },
  {
    key: "consensusVerifierHash",
    snakeKey: "consensus_verifier_hash",
    helperArg: "--consensus-verifier-hash",
    description: "Governed finalized-slot consensus verifier hash.",
  },
  {
    key: "messageInclusionVerifierHash",
    snakeKey: "message_inclusion_verifier_hash",
    helperArg: "--message-inclusion-verifier-hash",
    description: "Governed transaction-status message inclusion verifier hash.",
  },
  {
    key: "finalityPolicyHash",
    snakeKey: "finality_policy_hash",
    helperArg: "--finality-policy-hash",
    description: "Governed Solana finalized-slot finality policy hash.",
  },
  {
    key: "sourceStateVerifierHash",
    snakeKey: "source_state_verifier_hash",
    helperArg: "--source-state-verifier-hash",
    description: "Governed Solana AccountsDB source-state verifier hash.",
  },
];

const SOLANA_SOURCE_ADAPTER_REQUIREMENTS = [
  ...SOLANA_SOURCE_VERIFIER_REQUIREMENTS,
  {
    key: "adapterVerifierVkHash",
    snakeKey: "adapter_verifier_vk_hash",
    helperArg: "--adapter-verifier-vk-hash",
    description: "Source adapter verifier-key hash for the Solana lane.",
  },
  {
    key: "deploymentReceiptHash",
    snakeKey: "deployment_receipt_hash",
    helperArg: "--deployment-receipt-hash",
    description: "Governed source adapter deployment receipt hash.",
  },
];

const SOLANA_FULL_LIGHT_CLIENT_REQUIREMENTS = [
  {
    key: "towerReplayVerifierHash",
    snakeKey: "tower_replay_verifier_hash",
    helperArg: "--tower-replay-verifier-hash",
    description: "Tower replay verifier hash for the full Solana light client.",
  },
  {
    key: "fullAccountsdbLatticeVerifierHash",
    snakeKey: "full_accountsdb_lattice_verifier_hash",
    helperArg: "--full-accountsdb-lattice-verifier-hash",
    description: "Full AccountsDB lattice verifier hash.",
  },
  {
    key: "bankForkChoiceVerifierHash",
    snakeKey: "bank_fork_choice_verifier_hash",
    helperArg: "--bank-fork-choice-verifier-hash",
    description: "Bank fork-choice verifier hash.",
  },
];

const SOLANA_EXPECTED_SOURCE_RECORD_REQUIREMENTS = [
  {
    key: "expectedSourceVerifierMaterialHash",
    snakeKey: "expected_source_verifier_material_hash",
    helperArg: "--expected-source-verifier-material-hash",
    description:
      "Pinned source verifier material record hash expected by governance.",
  },
  {
    key: "expectedSourceAdapterEngineDeploymentHash",
    snakeKey: "expected_source_adapter_engine_deployment_hash",
    helperArg: "--expected-source-adapter-engine-deployment-hash",
    description:
      "Pinned source adapter engine deployment record hash expected by governance.",
  },
  {
    key: "expectedFullLightClientGateHash",
    snakeKey: "expected_full_light_client_gate_hash",
    helperArg: "--expected-full-light-client-gate-hash",
    description: "Pinned full Solana light-client gate hash.",
  },
];

const SOLANA_DESTINATION_ADMISSION_REQUIREMENTS = [
  {
    key: "admissionMode",
    snakeKey: "admission_mode",
    description: `Must be ${SOLANA_PRODUCTION_ADMISSION_MODE}.`,
    expectedValue: SOLANA_PRODUCTION_ADMISSION_MODE,
  },
  {
    key: "proofSystem",
    snakeKey: "proof_system",
    aliases: ["proofFamily", "proof_family"],
    description: `Must be ${SOLANA_DESTINATION_PROOF_SYSTEM}.`,
    expectedValue: SOLANA_DESTINATION_PROOF_SYSTEM,
  },
  {
    key: "entrypoint",
    snakeKey: "entry_point",
    aliases: ["verifierEntrypoint", "verifier_entrypoint"],
    description: `Must be ${SOLANA_SUBMIT_ENTRYPOINT}.`,
    expectedValue: SOLANA_SUBMIT_ENTRYPOINT,
  },
];

const SOLANA_POST_DEPLOY_HASH_REQUIREMENTS = [
  {
    key: "sourceBridgeConfigHash",
    snakeKey: "source_bridge_config_hash",
    description: "Hash of the published Solana source bridge configuration.",
  },
  {
    key: "routeCanaryEvidenceHash",
    snakeKey: "route_canary_evidence_hash",
    description: "Hash of the live route-canary evidence bundle.",
  },
  {
    key: "offlineFullTomlSha256",
    snakeKey: "offline_full_toml_sha256",
    description: "SHA-256 of the final offline TOML route evidence.",
  },
];

const SOLANA_POST_DEPLOY_SIGNATURE_REQUIREMENTS = [
  {
    key: "sourceEventTransactionSignature",
    snakeKey: "source_event_transaction_signature",
    aliases: [
      "sourceEventSignature",
      "source_event_signature",
      "sourceEventTransactionId",
      "source_event_transaction_id",
    ],
    description: "Solana transaction signature for the source bridge event.",
  },
  {
    key: "routeCanaryTransactionSignature",
    snakeKey: "route_canary_transaction_signature",
    aliases: [
      "routeCanarySignature",
      "route_canary_signature",
      "routeCanaryTransactionId",
      "route_canary_transaction_id",
    ],
    description: "Distinct Solana transaction signature for the route canary.",
  },
];

const placeholderFor = (key) => `0x<${key}>`;

const valueStatus = ({ record, requirement, label, validator }) => {
  const keys = [
    requirement.key,
    requirement.snakeKey,
    ...(requirement.aliases ?? []),
  ].filter(Boolean);
  const value = readFirstManifestString(record, ...keys);
  if (!value) {
    return {
      key: requirement.key,
      manifestKeys: keys,
      helperArg: requirement.helperArg,
      description: requirement.description,
      status: "missing",
    };
  }
  try {
    return {
      key: requirement.key,
      manifestKeys: keys,
      helperArg: requirement.helperArg,
      description: requirement.description,
      status: "present",
      value: validator(value, `${label}.${requirement.key}`),
    };
  } catch (error) {
    return {
      key: requirement.key,
      manifestKeys: keys,
      helperArg: requirement.helperArg,
      description: requirement.description,
      status: "invalid",
      value,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const hexRequirementStatuses = (record, requirements, label) =>
  requirements.map((requirement) =>
    valueStatus({
      record,
      requirement,
      label,
      validator: normalizeManifestHex32,
    }),
  );

const signatureRequirementStatuses = (record, requirements, label) =>
  requirements.map((requirement) =>
    valueStatus({
      record,
      requirement,
      label,
      validator: (value) => {
        const normalized = String(value ?? "").trim();
        if (!/^[1-9A-HJ-NP-Za-km-z]{64,88}$/u.test(normalized)) {
          throw new Error("Solana signature must be Base58.");
        }
        return normalized;
      },
    }),
  );

const exactStringRequirementStatuses = (record, requirements, label) =>
  requirements.map((requirement) =>
    valueStatus({
      record,
      requirement,
      label,
      validator: (value) => {
        const normalized = String(value ?? "").trim();
        if (normalized !== requirement.expectedValue) {
          throw new Error(
            `${label}.${requirement.key} must be ${requirement.expectedValue}.`,
          );
        }
        return normalized;
      },
    }),
  );

const missingOrInvalid = (statuses) =>
  statuses.filter((status) => status.status !== "present");

const readManifestHash = (record, requirement) =>
  readFirstManifestString(record, requirement.key, requirement.snakeKey);

const admissionHashBindingStatuses = (admission, manifest) =>
  [
    {
      key: "verifierCodeHash",
      snakeKey: "verifier_code_hash",
      description: "Must match the route manifest verifierCodeHash.",
    },
    {
      key: "verifierKeyHash",
      snakeKey: "verifier_key_hash",
      description: "Must match the route manifest verifierKeyHash.",
    },
    {
      key: "destinationBindingHash",
      snakeKey: "destination_binding_hash",
      description: "Must match the route manifest destinationBindingHash.",
    },
  ].map((requirement) => {
    const base = valueStatus({
      record: admission,
      requirement,
      label: "destinationProofAdmission",
      validator: normalizeManifestHex32,
    });
    if (base.status !== "present") {
      return base;
    }
    try {
      const expected = normalizeManifestHex32(
        requireManifestString(
          manifest,
          [requirement.key, requirement.snakeKey],
          `Solana ${requirement.key}`,
        ),
        `Solana ${requirement.key}`,
      );
      if (base.value !== expected) {
        return {
          ...base,
          status: "invalid",
          expected,
          error: `${requirement.key} does not match the route manifest.`,
        };
      }
      return { ...base, expected };
    } catch (error) {
      return {
        ...base,
        status: "invalid",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

const buildSourceEvidenceCommand = () => [
  "python3",
  "../iroha/scripts/sccp_solana_source_state_evidence.py",
  ...[
    ...SOLANA_SOURCE_ADAPTER_REQUIREMENTS,
    ...SOLANA_FULL_LIGHT_CLIENT_REQUIREMENTS,
    ...SOLANA_EXPECTED_SOURCE_RECORD_REQUIREMENTS,
  ].flatMap((requirement) => [
    requirement.helperArg,
    placeholderFor(requirement.snakeKey),
  ]),
  "--toml",
];

const buildLiveEvidenceCommand = ({
  args,
  publicConfig,
  verifierEvidence,
  verifierLiveEvidence,
  manifest,
}) => [
  "python3",
  "../iroha/scripts/sccp_solana_live_evidence.py",
  "--rpc-url",
  args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
  "--verifier-program-id",
  publicConfig?.verifierProgramId ??
    publicConfig?.programId ??
    "<solana-verifier-program-id>",
  "--expected-verifier-code-hash",
  readFirstManifestString(manifest, "verifierCodeHash", "verifier_code_hash") ||
    verifierLiveEvidence?.verifier_code_hash ||
    placeholderFor("verifier_code_hash"),
  "--expected-programdata-address",
  verifierEvidence?.programDataAddress ?? "<programdata-address>",
  "--expected-programdata-slot",
  String(verifierEvidence?.programDataSlot ?? "<programdata-slot>"),
  "--route-allowlist-hash",
  placeholderFor("route_allowlist_hash"),
  "--source-verifier-material-hash",
  placeholderFor("source_verifier_material_hash"),
  "--source-adapter-engine-deployment-hash",
  placeholderFor("source_adapter_engine_deployment_hash"),
  "--route-canary-evidence-hash",
  placeholderFor("route_canary_evidence_hash"),
  "--expected-destination-binding-hash",
  SOLANA_DESTINATION_BINDING_HASH,
  "--toml",
];

export const buildSolanaProductionRequirementsReportBody = ({
  args = {},
  manifest = null,
  manifestPath = null,
  publicConfig = null,
  verifierEvidence = null,
  verifierLiveEvidence = null,
  accounts = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const sourceVerifierMaterial = readFirstManifestRecord(
    manifest,
    "sourceVerifierMaterial",
    "source_verifier_material",
  );
  const sourceAdapterEngineDeployment = readFirstManifestRecord(
    manifest,
    "sourceAdapterEngineDeployment",
    "source_adapter_engine_deployment",
    "sourceAdapterDeployment",
    "source_adapter_deployment",
  );
  const postDeployLiveEvidence = readFirstManifestRecord(
    manifest,
    "postDeployLiveEvidence",
    "post_deploy_live_evidence",
  );
  const destinationProofAdmission = readDestinationProofAdmission(manifest);
  const admissionModeStatuses = exactStringRequirementStatuses(
    destinationProofAdmission,
    SOLANA_DESTINATION_ADMISSION_REQUIREMENTS,
    "destinationProofAdmission",
  );
  const admissionHashStatuses = admissionHashBindingStatuses(
    destinationProofAdmission,
    manifest,
  );
  const admissionUnsafeBooleanStatuses = [
    {
      key: "shapeOnly",
      manifestKeys: ["shapeOnly", "shape_only"],
      description: "Must be false for a production Solana SCCP verifier.",
      status:
        destinationProofAdmission?.shapeOnly === true ||
        destinationProofAdmission?.shape_only === true ||
        destinationProofAdmission?.shapeOnly === "true" ||
        destinationProofAdmission?.shape_only === "true"
          ? "invalid"
          : "present",
      value:
        destinationProofAdmission?.shapeOnly ??
        destinationProofAdmission?.shape_only ??
        false,
    },
    {
      key: "acceptsUnverifiedProofs",
      manifestKeys: ["acceptsUnverifiedProofs", "accepts_unverified_proofs"],
      description: "Must be false for a production Solana SCCP verifier.",
      status:
        destinationProofAdmission?.acceptsUnverifiedProofs === true ||
        destinationProofAdmission?.accepts_unverified_proofs === true ||
        destinationProofAdmission?.acceptsUnverifiedProofs === "true" ||
        destinationProofAdmission?.accepts_unverified_proofs === "true"
          ? "invalid"
          : "present",
      value:
        destinationProofAdmission?.acceptsUnverifiedProofs ??
        destinationProofAdmission?.accepts_unverified_proofs ??
        false,
    },
  ];
  const sourceVerifierStatuses = hexRequirementStatuses(
    sourceVerifierMaterial,
    SOLANA_SOURCE_VERIFIER_REQUIREMENTS,
    "sourceVerifierMaterial",
  );
  const sourceAdapterStatuses = hexRequirementStatuses(
    sourceAdapterEngineDeployment,
    SOLANA_SOURCE_ADAPTER_REQUIREMENTS,
    "sourceAdapterEngineDeployment",
  );
  const postDeployHashStatuses = hexRequirementStatuses(
    postDeployLiveEvidence,
    SOLANA_POST_DEPLOY_HASH_REQUIREMENTS,
    "postDeployLiveEvidence",
  );
  const postDeploySignatureStatuses = signatureRequirementStatuses(
    postDeployLiveEvidence,
    SOLANA_POST_DEPLOY_SIGNATURE_REQUIREMENTS,
    "postDeployLiveEvidence",
  );
  const fullTomlReady =
    postDeployLiveEvidence?.fullTomlReady === true ||
    postDeployLiveEvidence?.full_toml_ready === true;
  const sourceEventSignature = readFirstManifestString(
    postDeployLiveEvidence,
    "sourceEventTransactionSignature",
    "source_event_transaction_signature",
    "sourceEventSignature",
    "source_event_signature",
    "sourceEventTransactionId",
    "source_event_transaction_id",
  );
  const routeCanarySignature = readFirstManifestString(
    postDeployLiveEvidence,
    "routeCanaryTransactionSignature",
    "route_canary_transaction_signature",
    "routeCanarySignature",
    "route_canary_signature",
    "routeCanaryTransactionId",
    "route_canary_transaction_id",
  );
  const blockers = [];
  if (!manifest) {
    blockers.push({
      id: "route-manifest",
      detail: "No Solana route manifest is available to inspect.",
    });
  }
  if (
    manifest?.productionReady !== true &&
    manifest?.production_ready !== true
  ) {
    blockers.push({
      id: "production-ready-flag",
      detail: "The Solana route manifest is not marked productionReady.",
    });
  }
  const disabledReason = readFirstManifestString(
    manifest,
    "disabledReason",
    "disabled_reason",
  );
  if (disabledReason) {
    blockers.push({
      id: "disabled-reason",
      detail: disabledReason,
    });
  }
  for (const [id, statuses] of [
    [
      "destination-proof-admission",
      [
        ...admissionModeStatuses,
        ...admissionHashStatuses,
        ...admissionUnsafeBooleanStatuses,
      ],
    ],
    ["source-verifier-material", sourceVerifierStatuses],
    ["source-adapter-engine-deployment", sourceAdapterStatuses],
    ["post-deploy-live-evidence-hashes", postDeployHashStatuses],
    ["post-deploy-live-evidence-signatures", postDeploySignatureStatuses],
  ]) {
    const missing = missingOrInvalid(statuses);
    if (missing.length > 0) {
      blockers.push({
        id,
        missingOrInvalid: missing.map((status) => status.key),
      });
    }
  }
  if (!fullTomlReady) {
    blockers.push({
      id: "post-deploy-full-toml",
      detail: "postDeployLiveEvidence.fullTomlReady must be true.",
    });
  }
  if (
    sourceEventSignature &&
    routeCanarySignature &&
    sourceEventSignature === routeCanarySignature
  ) {
    blockers.push({
      id: "post-deploy-distinct-signatures",
      detail:
        "source event and route canary transaction signatures must be distinct.",
    });
  }
  const readyToBuildIsi = blockers.length === 0;
  const privateKeyEnv =
    args["private-key-env"] || DEFAULT_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY_ENV;
  const authority = typeof args.authority === "string" ? args.authority : "";
  return {
    schema: "iroha-demo-sccp-solana-production-requirements/v1",
    checkedAt,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    readyToBuildIsi,
    readyToSubmitWithCurrentRuntime:
      readyToBuildIsi &&
      Boolean(authority) &&
      typeof process.env[privateKeyEnv] === "string" &&
      Boolean(process.env[privateKeyEnv]),
    manifestPath,
    manifestPresent: Boolean(manifest),
    taira: {
      toriiUrl: args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
      mcpUrl: args["mcp-url"] || DEFAULT_TAIRA_MCP_URL,
      requiredPermission: "CanManageSccpRouteManifests",
      authority: authority || null,
      privateKeyEnv,
      privateKeyEnvPresent:
        typeof process.env[privateKeyEnv] === "string" &&
        Boolean(process.env[privateKeyEnv]),
    },
    solanaDeployment: {
      deployerAddress: publicConfig?.deployerAddress ?? null,
      verifierProgramId:
        publicConfig?.verifierProgramId ?? publicConfig?.programId ?? null,
      bridgeProgramId: publicConfig?.bridgeProgramId ?? null,
      sourceBridgeProgramId: publicConfig?.sourceBridgeProgramId ?? null,
      tokenMintAddress: publicConfig?.tokenMintAddress ?? null,
      mintAuthorityAddress: publicConfig?.mintAuthorityAddress ?? null,
      verifierStateAddress: publicConfig?.verifierStateAddress ?? null,
      sourceStateAddress: publicConfig?.sourceStateAddress ?? null,
      programdataAddress:
        verifierEvidence?.programDataAddress ??
        verifierLiveEvidence?.programdata_address ??
        null,
      programdataSlot:
        verifierEvidence?.programDataSlot ??
        verifierLiveEvidence?.programdata_slot ??
        null,
      verifierCodeHash:
        verifierLiveEvidence?.verifier_code_hash ||
        readFirstManifestString(
          manifest,
          "verifierCodeHash",
          "verifier_code_hash",
        ) ||
        null,
      accounts,
    },
    requirements: {
      destinationProofAdmission: [
        ...admissionModeStatuses,
        ...admissionHashStatuses,
        ...admissionUnsafeBooleanStatuses,
      ],
      sourceVerifierMaterial: sourceVerifierStatuses,
      sourceAdapterEngineDeployment: sourceAdapterStatuses,
      fullLightClientHelperInputs: SOLANA_FULL_LIGHT_CLIENT_REQUIREMENTS,
      expectedSourceRecordPins: SOLANA_EXPECTED_SOURCE_RECORD_REQUIREMENTS,
      postDeployLiveEvidence: [
        {
          key: "fullTomlReady",
          manifestKeys: ["fullTomlReady", "full_toml_ready"],
          description: "Final generated TOML evidence passed all live pins.",
          status: fullTomlReady ? "present" : "missing",
          value: fullTomlReady,
        },
        ...postDeployHashStatuses,
        ...postDeploySignatureStatuses,
      ],
    },
    derivedRecordHashes: {
      sourceVerifierMaterialHash: readManifestHash(sourceVerifierMaterial, {
        key: "sourceVerifierMaterialHash",
        snakeKey: "source_verifier_material_hash",
      }),
      sourceAdapterEngineDeploymentHash: readManifestHash(
        sourceAdapterEngineDeployment,
        {
          key: "sourceAdapterEngineDeploymentHash",
          snakeKey: "source_adapter_engine_deployment_hash",
        },
      ),
    },
    commands: {
      sourceEvidenceToml: buildSourceEvidenceCommand(),
      liveEvidenceToml: buildLiveEvidenceCommand({
        args,
        publicConfig,
        verifierEvidence,
        verifierLiveEvidence,
        manifest,
      }),
      buildIsi: [
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "route-manifest-isi",
        "--manifest",
        manifestPath ??
          "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      ],
      publish: [
        `${privateKeyEnv}=<runtime-only-private-key-hex>`,
        "npm",
        "run",
        "sccp:solana:deploy",
        "--",
        "publish-route-manifest",
        "--submit",
        "true",
        "--authority",
        authority || "<route-manager-account-id>",
        "--manifest",
        manifestPath ??
          "output/sccp-solana-deploy/taira-solana-xor-route.manifest.json",
      ],
      publicPreflight: ["npm", "run", "e2e:sccp:solana-preflight"],
    },
    blockers,
  };
};

const productionRequirements = async (args) => {
  const paths = artifactPaths(args);
  const manifestPath = path.resolve(args.manifest || paths.routeManifest);
  const report = buildSolanaProductionRequirementsReportBody({
    args,
    manifest: await readOptionalJson(manifestPath),
    manifestPath,
    publicConfig: await readOptionalJson(paths.publicConfig),
    verifierEvidence: await readOptionalJson(paths.evidence),
    verifierLiveEvidence: await readOptionalJson(paths.liveEvidence),
    accounts: await readOptionalJson(paths.accountsReport),
  });
  await writePublicJson(paths.productionRequirements, report);
  return {
    productionRequirementsPath: paths.productionRequirements,
    report,
  };
};

export const assertProductionSolanaManifest = (manifest) => {
  if (!isRecord(manifest)) {
    throw new Error("Solana route manifest must be an object.");
  }
  assertNoForbiddenManifestFields(manifest);
  if (
    requireManifestString(
      manifest,
      ["route_id", "routeId"],
      "Solana route id",
    ) !== SCCP_SOLANA_XOR_ROUTE_ID
  ) {
    throw new Error("Solana route manifest route_id must be taira_sol_xor.");
  }
  if (
    requireManifestString(
      manifest,
      ["asset_key", "assetKey"],
      "Solana asset key",
    ) !== SCCP_XOR_ASSET_KEY
  ) {
    throw new Error("Solana route manifest asset_key must be xor.");
  }
  if (
    Number(manifest.counterparty_domain ?? manifest.counterpartyDomain) !==
    SCCP_SOLANA_DOMAIN
  ) {
    throw new Error("Solana route manifest counterparty_domain must be 3.");
  }
  if (
    requireManifestString(
      manifest,
      ["chain_id_hex", "chainIdHex"],
      "Solana chain id",
    ) !== SOLANA_TESTNET_CHAIN_ID_HEX
  ) {
    throw new Error("Solana route manifest must target Solana testnet.");
  }
  const productionReady = readManifestBooleanAlias(
    manifest,
    "productionReady",
    "production_ready",
    "Solana production-ready flag",
  );
  if (!productionReady) {
    throw new Error("Solana route manifest is not production-ready.");
  }
  for (const [keys, label] of [
    [
      [
        "solanaTokenMint",
        "solana_token_mint",
        "tairaXorTokenAddress",
        "taira_xor_token_address",
      ],
      "Solana token mint",
    ],
    [
      [
        "solanaProgramId",
        "solana_program_id",
        "tairaXorSolanaProgramId",
        "taira_xor_solana_program_id",
      ],
      "Solana bridge program",
    ],
    [
      [
        "sccpSolanaSourceBridgeAddress",
        "sccp_solana_source_bridge_address",
        "solanaSourceBridgeAddress",
        "solana_source_bridge_address",
      ],
      "Solana source bridge program",
    ],
    [
      [
        "sccpSolanaSourceStateAddress",
        "sccp_solana_source_state_address",
        "solanaSourceStateAddress",
        "solana_source_state_address",
        "sourceBridgeStateAddress",
        "source_bridge_state_address",
      ],
      "Solana source bridge state",
    ],
    [
      ["solanaVerifierProgramId", "solana_verifier_program_id"],
      "Solana verifier program",
    ],
    [
      ["destinationBindingKey", "destination_binding_key"],
      "destination binding key",
    ],
  ]) {
    requireManifestString(manifest, keys, label);
  }
  for (const [keys, label] of [
    [["verifierCodeHash", "verifier_code_hash"], "Solana verifier code hash"],
    [["verifierKeyHash", "verifier_key_hash"], "Solana verifier key hash"],
    [
      ["destinationBindingHash", "destination_binding_hash"],
      "destination binding hash",
    ],
  ]) {
    normalizeManifestHex32(requireManifestString(manifest, keys, label), label);
  }
  assertBrowserProver(
    manifest,
    [
      "destinationBrowserProver",
      "destination_browser_prover",
      "solanaDestinationBrowserProver",
      "solana_destination_browser_prover",
    ],
    "Solana destination browser prover",
  );
  assertBrowserProver(
    manifest,
    [
      "sourceBrowserProver",
      "source_browser_prover",
      "solanaSourceBrowserProver",
      "solana_source_browser_prover",
    ],
    "Solana source browser prover",
  );
  assertSolanaDestinationProofAdmission(manifest);
  assertSourceVerifierMaterial(manifest);
  if (
    !readFirstManifestRecord(
      manifest,
      "sourceAdapterEngineDeployment",
      "source_adapter_engine_deployment",
    )
  ) {
    throw new Error("Solana source adapter engine deployment is missing.");
  }
  assertPostDeployEvidence(manifest);
};

export const buildSolanaRouteManifestIsiArtifact = ({
  manifest,
  gasAssetId = DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_ASSET_ID,
  gasLimit = DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_LIMIT,
}) => {
  assertProductionSolanaManifest(manifest);
  const instructionManifest = clonePublicJson(manifest);
  const instruction = {
    UpsertSccpRouteManifest: {
      manifest: instructionManifest,
    },
  };
  return {
    schema: "iroha-sccp-route-manifest-isi/v1",
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    routeKey: {
      routeId: SCCP_SOLANA_XOR_ROUTE_ID,
      assetKey: SCCP_XOR_ASSET_KEY,
      counterpartyDomain: SCCP_SOLANA_DOMAIN,
      chainIdHex: SOLANA_TESTNET_CHAIN_ID_HEX,
    },
    requiredPermission: "CanManageSccpRouteManifests",
    instruction,
    manifestSha256: sha256JsonHex(manifest),
    instructionManifestSha256: sha256JsonHex(instructionManifest),
    productionReady: true,
    gasAssetId,
    gasLimit,
  };
};

const readBurnRecordMaterial = async () => {
  const file = path.resolve(
    repoRoot,
    "../iroha/artifacts/sccp-taira/taira-xor-burn-record.contract.json",
  );
  const burnRecord = await readJson(file);
  return {
    sourceFile: file,
    artifactB64: burnRecord.artifact_b64,
    artifactSha256: hex32(burnRecord.artifact_sha256),
    codeHash: hex32(burnRecord.code_hash),
    vkBackend: burnRecord.vkRef?.backend ?? "halo2/ipa",
    vkName: burnRecord.vkRef?.name ?? "taira_xor_burn_record_v1",
  };
};

const installSolanaCliIfRequested = (args) => {
  if (commandExists("solana")) {
    return { installed: false, reason: "already-installed" };
  }
  if (!asBoolean(args["install-solana-cli"])) {
    return { installed: false, reason: "not-requested" };
  }
  if (!commandExists("brew")) {
    throw new Error(
      "Solana CLI is missing and Homebrew is not available for automatic install.",
    );
  }
  run("brew", ["install", "solana"], { stdio: "inherit" });
  if (!commandExists("solana")) {
    throw new Error(
      "Homebrew install completed but solana is still not on PATH.",
    );
  }
  return { installed: true, reason: "homebrew" };
};

const readProgramId = async (paths) => {
  if (existsSync(paths.publicConfig)) {
    const config = await readJson(paths.publicConfig);
    if (typeof config.programId === "string" && config.programId) {
      return config.programId;
    }
  }
  if (!existsSync(paths.programIdKeypair)) {
    throw new Error(
      "Program-id keypair is missing; run generate-keypairs first.",
    );
  }
  return run("solana-keygen", ["pubkey", paths.programIdKeypair]);
};

const doctor = async (args) => {
  const paths = artifactPaths(args);
  await mkdir(paths.outputDir, { recursive: true });
  const install = installSolanaCliIfRequested(args);
  const checks = [
    {
      name: "sibling-deploy-helper",
      ok: existsSync(siblingDeployScript),
      path: siblingDeployScript,
    },
    {
      name: "solana-cli",
      ok: commandExists("solana"),
      install,
    },
    {
      name: "solana-keygen",
      ok: commandExists("solana-keygen"),
    },
  ];
  let siblingDoctor = null;
  try {
    siblingDoctor = JSON.parse(
      runNodeHelper([
        "doctor",
        "--solana-rpc-url",
        args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
        "--torii-url",
        args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
      ]),
    );
    checks.push(...siblingDoctor.checks);
  } catch (error) {
    checks.push({
      name: "sibling-doctor",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  const report = {
    schema: "iroha-demo-sccp-solana-deploy-doctor/v1",
    checkedAt: new Date().toISOString(),
    ok: checks.every((check) => check.ok || check.optional),
    outputDir: paths.outputDir,
    solanaRpcUrl: args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
    toriiUrl: args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
    siblingDoctor,
    checks,
  };
  await writePublicJson(paths.doctorReport, report);
  return { report, reportPath: paths.doctorReport };
};

const generateKeypairs = async (args) => {
  const paths = artifactPaths(args);
  await mkdir(paths.outputDir, { recursive: true });
  const rotateDeployment = asBoolean(args["rotate-deployment"]);
  const filesToForce = asBoolean(args.force)
    ? [
        paths.deployerKeypair,
        paths.programIdKeypair,
        paths.bridgeProgramIdKeypair,
        paths.sourceBridgeProgramIdKeypair,
        paths.stateKeypair,
        paths.sourceStateKeypair,
        paths.tokenMintKeypair,
      ]
    : rotateDeployment
      ? [
          paths.programIdKeypair,
          paths.bridgeProgramIdKeypair,
          paths.sourceBridgeProgramIdKeypair,
          paths.stateKeypair,
          paths.sourceStateKeypair,
          paths.tokenMintKeypair,
        ]
      : [];
  for (const file of filesToForce) {
    await createKeypairFile(file);
  }
  const deployer = await ensureKeypairFile(paths.deployerKeypair);
  const program = await ensureKeypairFile(paths.programIdKeypair);
  const bridgeProgram = await ensureKeypairFile(paths.bridgeProgramIdKeypair);
  const sourceBridgeProgram = await ensureKeypairFile(
    paths.sourceBridgeProgramIdKeypair,
  );
  const state = await ensureKeypairFile(paths.stateKeypair);
  const sourceState = await ensureKeypairFile(paths.sourceStateKeypair);
  const tokenMint = await ensureKeypairFile(paths.tokenMintKeypair);
  const [mintAuthority, mintAuthorityBump] = deriveMintAuthority(
    program.publicKey,
    state.publicKey,
  );
  const publicConfig = {
    schema: "iroha-demo-sccp-solana-generated-keypairs/v1",
    generatedAt: new Date().toISOString(),
    deployerAddress: deployer.publicKey.toBase58(),
    programId: program.publicKey.toBase58(),
    verifierProgramId: program.publicKey.toBase58(),
    bridgeProgramId: bridgeProgram.publicKey.toBase58(),
    sourceBridgeProgramId: sourceBridgeProgram.publicKey.toBase58(),
    verifierStateAddress: state.publicKey.toBase58(),
    sourceStateAddress: sourceState.publicKey.toBase58(),
    tokenMintAddress: tokenMint.publicKey.toBase58(),
    mintAuthorityAddress: mintAuthority.toBase58(),
    mintAuthorityBump,
    deployerKeypairFile: paths.deployerKeypair,
    programIdKeypairFile: paths.programIdKeypair,
    verifierProgramIdKeypairFile: paths.programIdKeypair,
    bridgeProgramIdKeypairFile: paths.bridgeProgramIdKeypair,
    sourceBridgeProgramIdKeypairFile: paths.sourceBridgeProgramIdKeypair,
    verifierStateKeypairFile: paths.stateKeypair,
    sourceStateKeypairFile: paths.sourceStateKeypair,
    tokenMintKeypairFile: paths.tokenMintKeypair,
    solanaRpcUrl: args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
    explorerProgramUrl: `https://explorer.solana.com/address/${program.publicKey.toBase58()}?cluster=testnet`,
    explorerBridgeProgramUrl: `https://explorer.solana.com/address/${bridgeProgram.publicKey.toBase58()}?cluster=testnet`,
    explorerSourceBridgeProgramUrl: `https://explorer.solana.com/address/${sourceBridgeProgram.publicKey.toBase58()}?cluster=testnet`,
    explorerSourceStateUrl: `https://explorer.solana.com/address/${sourceState.publicKey.toBase58()}?cluster=testnet`,
    explorerTokenMintUrl: `https://explorer.solana.com/address/${tokenMint.publicKey.toBase58()}?cluster=testnet`,
    explorerMintAuthorityUrl: `https://explorer.solana.com/address/${mintAuthority.toBase58()}?cluster=testnet`,
  };
  await writePublicJson(paths.publicConfig, publicConfig);
  return { publicConfig, publicConfigPath: paths.publicConfig };
};

const rotateDeploymentKeypairs = (args) =>
  generateKeypairs({ ...args, "rotate-deployment": "true" });

const parseSolanaBalance = (output) => {
  const match = output.match(/([0-9]+(?:\.[0-9]+)?)\s*SOL/u);
  if (!match) {
    throw new Error(`Could not parse Solana balance output: ${output}`);
  }
  return Number(match[1]);
};

const fund = async (args) => {
  const paths = artifactPaths(args);
  installSolanaCliIfRequested(args);
  if (!commandExists("solana")) {
    throw new Error(
      "Solana CLI is missing; rerun with --install-solana-cli true.",
    );
  }
  if (!existsSync(paths.deployerKeypair)) {
    throw new Error(
      "Deployer keypair is missing; run generate-keypairs first.",
    );
  }
  const rpcUrl = args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL;
  const minBalance = asPositiveNumber(
    args["min-balance-sol"],
    DEFAULT_MIN_BALANCE_SOL,
    "--min-balance-sol",
  );
  const airdropSol = asPositiveNumber(args["airdrop-sol"], 1, "--airdrop-sol");
  const attempts = asNonNegativeInteger(
    args["airdrop-attempts"],
    5,
    "--airdrop-attempts",
  );
  const balanceArgs = [
    "balance",
    "--url",
    rpcUrl,
    "--keypair",
    paths.deployerKeypair,
  ];
  const events = [];
  let balance = parseSolanaBalance(run("solana", balanceArgs));
  for (
    let attempt = 1;
    balance < minBalance && attempt <= attempts;
    attempt += 1
  ) {
    try {
      const output = run("solana", [
        "airdrop",
        String(airdropSol),
        "--url",
        rpcUrl,
        "--keypair",
        paths.deployerKeypair,
      ]);
      events.push({ attempt, ok: true, output });
    } catch (error) {
      events.push({
        attempt,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    balance = parseSolanaBalance(run("solana", balanceArgs));
  }
  const publicConfig = await readJson(paths.publicConfig);
  const report = {
    schema: "iroha-demo-sccp-solana-funding/v1",
    checkedAt: new Date().toISOString(),
    ready: balance >= minBalance,
    deployerAddress: publicConfig.deployerAddress,
    balanceSol: balance,
    minBalanceSol: minBalance,
    rpcUrl,
    airdropEvents: events,
    fundingInstruction:
      balance >= minBalance
        ? null
        : `Fund ${publicConfig.deployerAddress} on Solana testnet with at least ${
            minBalance - balance
          } SOL, then rerun this command.`,
  };
  await writePublicJson(paths.fundingReport, report);
  if (!report.ready) {
    throw new Error(report.fundingInstruction);
  }
  return { report, reportPath: paths.fundingReport };
};

const createSplMintInstructionData = (mintAuthority) => {
  const data = Buffer.alloc(67);
  data[0] = 0;
  data[1] = SPL_TOKEN_DECIMALS;
  Buffer.from(mintAuthority.toBytes()).copy(data, 2);
  data.writeUInt32LE(0, 34);
  return data;
};

const readSplMintAuthority = (account) => {
  if (!account?.data || account.data.length < SPL_TOKEN_MINT_SPACE) {
    return null;
  }
  const authorityOption = account.data.readUInt32LE(0);
  if (authorityOption !== 1) {
    return null;
  }
  return new PublicKey(account.data.subarray(4, 36));
};

const createTokenMintIfMissing = async ({
  connection,
  deployer,
  mint,
  mintAuthority,
}) => {
  const existing = await getAccount(connection, mint.publicKey);
  if (existing) {
    if (!existing.owner.equals(TOKEN_PROGRAM_ID)) {
      throw new Error(
        `Existing Solana token mint ${mint.publicKey.toBase58()} is not owned by SPL Token.`,
      );
    }
    const existingAuthority = readSplMintAuthority(existing);
    if (!existingAuthority?.equals(mintAuthority)) {
      throw new Error(
        `Existing Solana token mint ${mint.publicKey.toBase58()} is not controlled by mint authority PDA ${mintAuthority.toBase58()}.`,
      );
    }
    return {
      created: false,
      address: mint.publicKey.toBase58(),
      mintAuthorityAddress: mintAuthority.toBase58(),
    };
  }
  const lamports =
    await connection.getMinimumBalanceForRentExemption(SPL_TOKEN_MINT_SPACE);
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: mint.publicKey,
      lamports,
      space: SPL_TOKEN_MINT_SPACE,
      programId: TOKEN_PROGRAM_ID,
    }),
    new TransactionInstruction({
      programId: TOKEN_PROGRAM_ID,
      keys: [
        { pubkey: mint.publicKey, isSigner: false, isWritable: true },
        { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
      ],
      data: createSplMintInstructionData(mintAuthority),
    }),
  );
  const signature = await sendSolanaTransaction(connection, transaction, [
    deployer,
    mint,
  ]);
  return {
    created: true,
    address: mint.publicKey.toBase58(),
    signature,
    decimals: SPL_TOKEN_DECIMALS,
    mintAuthorityAddress: mintAuthority.toBase58(),
  };
};

const createProgramStateIfMissing = async ({
  connection,
  deployer,
  state,
  programId,
  label,
}) => {
  const existing = await getAccount(connection, state.publicKey);
  if (existing) {
    if (!existing.owner.equals(programId)) {
      throw new Error(
        `Existing Solana ${label} state ${state.publicKey.toBase58()} is not owned by ${programId.toBase58()}.`,
      );
    }
    return { created: false, address: state.publicKey.toBase58() };
  }
  const lamports = await connection.getMinimumBalanceForRentExemption(
    SCCP_SOLANA_STATE_SPACE,
  );
  const transaction = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: deployer.publicKey,
      newAccountPubkey: state.publicKey,
      lamports,
      space: SCCP_SOLANA_STATE_SPACE,
      programId,
    }),
  );
  const signature = await sendSolanaTransaction(connection, transaction, [
    deployer,
    state,
  ]);
  return { created: true, address: state.publicKey.toBase58(), signature };
};

const initializeProgramState = async ({
  connection,
  deployer,
  state,
  mint,
  programId,
}) => {
  const transaction = new Transaction().add(
    new TransactionInstruction({
      programId,
      keys: [
        { pubkey: deployer.publicKey, isSigner: true, isWritable: false },
        { pubkey: state.publicKey, isSigner: false, isWritable: true },
        { pubkey: mint.publicKey, isSigner: false, isWritable: false },
      ],
      data: encodeBorshVecs(SCCP_SOLANA_INITIALIZE_ENTRYPOINT),
    }),
  );
  const signature = await sendSolanaTransaction(connection, transaction, [
    deployer,
  ]);
  return { initialized: true, signature };
};

const initializeSolanaAccounts = async (args) => {
  const paths = artifactPaths(args);
  const connection = createConnection(args);
  const deployer = await readKeypair(paths.deployerKeypair);
  const state = await readKeypair(paths.stateKeypair);
  const sourceState = await ensureKeypairFile(paths.sourceStateKeypair);
  const mint = await readKeypair(paths.tokenMintKeypair);
  const verifierProgramId = await keypairPubkey(paths.programIdKeypair);
  const sourceBridgeProgramId = await keypairPubkey(
    paths.sourceBridgeProgramIdKeypair,
  );
  const [mintAuthority, mintAuthorityBump] = deriveMintAuthority(
    verifierProgramId,
    state.publicKey,
  );
  const tokenMint = await createTokenMintIfMissing({
    connection,
    deployer,
    mint,
    mintAuthority,
  });
  const verifierState = await createProgramStateIfMissing({
    connection,
    deployer,
    state,
    programId: verifierProgramId,
    label: "verifier",
  });
  const sourceStateReport = await createProgramStateIfMissing({
    connection,
    deployer,
    state: sourceState,
    programId: sourceBridgeProgramId,
    label: "source bridge",
  });
  const stateInitialization = await initializeProgramState({
    connection,
    deployer,
    state,
    mint,
    programId: verifierProgramId,
  });
  const sourceStateInitialization = await initializeProgramState({
    connection,
    deployer,
    state: sourceState,
    mint,
    programId: sourceBridgeProgramId,
  });
  const report = {
    schema: "iroha-demo-sccp-solana-accounts/v1",
    checkedAt: new Date().toISOString(),
    tokenMint,
    mintAuthority: {
      address: mintAuthority.toBase58(),
      bump: mintAuthorityBump,
      seed: SCCP_SOLANA_MINT_AUTHORITY_SEED,
    },
    verifierState,
    sourceState: sourceStateReport,
    stateInitialization,
    sourceStateInitialization,
  };
  await writePublicJson(paths.accountsReport, report);
  return { report, reportPath: paths.accountsReport };
};

const deploy = async (args) => {
  const paths = artifactPaths(args);
  const programSo = path.resolve(args["program-so"] || DEFAULT_PROGRAM_SO);
  if (!existsSync(programSo)) {
    const publicConfig = existsSync(paths.publicConfig)
      ? await readJson(paths.publicConfig)
      : null;
    const report = {
      schema: "iroha-demo-sccp-solana-deploy-blocked/v1",
      checkedAt: new Date().toISOString(),
      ready: false,
      reason: "compiled Solana SCCP program .so is missing",
      programSo,
      deployerAddress: publicConfig?.deployerAddress ?? null,
      programId: publicConfig?.programId ?? null,
    };
    await writePublicJson(paths.deployBlocked, report);
    throw new Error(`Compiled Solana SCCP program not found: ${programSo}`);
  }
  if (
    ![
      paths.deployerKeypair,
      paths.programIdKeypair,
      paths.bridgeProgramIdKeypair,
      paths.sourceBridgeProgramIdKeypair,
      paths.stateKeypair,
      paths.sourceStateKeypair,
      paths.tokenMintKeypair,
    ].every((file) => existsSync(file))
  ) {
    await generateKeypairs(args);
  }
  const deployOne = (label, keypairFile) => {
    const output = runNodeHelper([
      "deploy",
      "--program-so",
      programSo,
      "--program-id-keypair",
      keypairFile,
      "--keypair",
      paths.deployerKeypair,
      "--solana-rpc-url",
      args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
      "--broadcast",
      "true",
      "--confirm-testnet",
      "solana-testnet",
      "--final",
      "true",
    ]);
    return { label, keypairFile, output };
  };
  const deployments = [
    deployOne("verifier", paths.programIdKeypair),
    deployOne("bridge", paths.bridgeProgramIdKeypair),
    deployOne("source-bridge", paths.sourceBridgeProgramIdKeypair),
  ];
  await mkdir(paths.outputDir, { recursive: true });
  await writeFile(
    paths.deployLog,
    `${deployments
      .map((entry) => `# ${entry.label}\n${entry.output}`)
      .join("\n\n")}\n`,
  );
  await initializeSolanaAccounts(args);
  return { deployments, deployLogPath: paths.deployLog };
};

const evidence = async (args) => {
  const paths = artifactPaths(args);
  const programId = args["program-id"] || (await readProgramId(paths));
  const capture = (id, output) =>
    runNodeHelper([
      "evidence",
      "--program-id",
      id,
      "--solana-rpc-url",
      args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
      "--keypair",
      paths.deployerKeypair,
      "--output",
      output,
    ]);
  capture(programId, paths.evidence);
  if (existsSync(paths.bridgeProgramIdKeypair)) {
    capture(
      run("solana-keygen", ["pubkey", paths.bridgeProgramIdKeypair]),
      paths.bridgeEvidence,
    );
  }
  if (existsSync(paths.sourceBridgeProgramIdKeypair)) {
    capture(
      run("solana-keygen", ["pubkey", paths.sourceBridgeProgramIdKeypair]),
      paths.sourceBridgeEvidence,
    );
  }
  return {
    evidencePath: paths.evidence,
    evidence: await readJson(paths.evidence),
    bridgeEvidencePath: existsSync(paths.bridgeEvidence)
      ? paths.bridgeEvidence
      : null,
    sourceBridgeEvidencePath: existsSync(paths.sourceBridgeEvidence)
      ? paths.sourceBridgeEvidence
      : null,
  };
};

const liveEvidence = async (args) => {
  const paths = artifactPaths(args);
  if (!existsSync(siblingLiveEvidenceScript)) {
    throw new Error(
      `Solana live evidence helper is missing: ${siblingLiveEvidenceScript}`,
    );
  }
  const publicConfig = await readJson(paths.publicConfig);
  const verifierProgramId =
    args["program-id"] ||
    publicConfig.verifierProgramId ||
    publicConfig.programId ||
    (await readProgramId(paths));
  const result = spawnSync(
    "python3",
    [
      siblingLiveEvidenceScript,
      "--rpc-url",
      args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
      "--verifier-program-id",
      verifierProgramId,
      "--commitment",
      args.commitment || "finalized",
    ],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `python3 ${siblingLiveEvidenceScript} failed:\n${result.stderr || result.stdout}`,
    );
  }
  const parsed = JSON.parse(result.stdout);
  await writePublicJson(paths.liveEvidence, parsed);
  return {
    liveEvidencePath: paths.liveEvidence,
    liveEvidence: parsed,
  };
};

const draftManifest = async (args) => {
  const paths = artifactPaths(args);
  if (!existsSync(paths.evidence)) {
    await evidence(args);
  }
  if (!existsSync(paths.liveEvidence) || asBoolean(args["refresh-live"])) {
    await liveEvidence(args);
  }
  const publicConfig = await readJson(paths.publicConfig);
  const verifierEvidence = await readJson(paths.evidence);
  const verifierLiveEvidence = existsSync(paths.liveEvidence)
    ? await readJson(paths.liveEvidence)
    : null;
  const bridgeEvidence = existsSync(paths.bridgeEvidence)
    ? await readJson(paths.bridgeEvidence)
    : null;
  const sourceBridgeEvidence = existsSync(paths.sourceBridgeEvidence)
    ? await readJson(paths.sourceBridgeEvidence)
    : null;
  const accounts = existsSync(paths.accountsReport)
    ? await readJson(paths.accountsReport)
    : null;
  const sourceStateAddress =
    publicConfig.sourceStateAddress ?? accounts?.sourceState?.address ?? null;
  if (typeof sourceStateAddress !== "string" || !sourceStateAddress) {
    throw new Error(
      "Solana source state address is missing; rerun generate-keypairs and deploy/accounts initialization.",
    );
  }
  const [derivedMintAuthority, derivedMintAuthorityBump] = deriveMintAuthority(
    new PublicKey(publicConfig.verifierProgramId),
    new PublicKey(publicConfig.verifierStateAddress),
  );
  const mintAuthorityAddress =
    publicConfig.mintAuthorityAddress ?? derivedMintAuthority.toBase58();
  const mintAuthorityBump =
    publicConfig.mintAuthorityBump ?? derivedMintAuthorityBump;
  const programSo = path.resolve(args["program-so"] || DEFAULT_PROGRAM_SO);
  const programArtifactSha256 = existsSync(programSo)
    ? hex32(await sha256FileHex(programSo))
    : null;
  const verifierCodeHash =
    typeof verifierLiveEvidence?.verifier_code_hash === "string"
      ? verifierLiveEvidence.verifier_code_hash
      : programArtifactSha256;
  const destinationModuleFile = path.join(
    repoRoot,
    "public",
    SOLANA_DESTINATION_PROVER_MODULE_URL.replace(/^\//u, ""),
  );
  const sourceModuleFile = path.join(
    repoRoot,
    "public",
    SOLANA_SOURCE_PROVER_MODULE_URL.replace(/^\//u, ""),
  );
  const destinationModuleHash = hex32(
    await sha256FileHex(destinationModuleFile),
  );
  const sourceModuleHash = hex32(await sha256FileHex(sourceModuleFile));
  const burnRecord = await readBurnRecordMaterial();
  const verifierKeyHash = hex32(
    sha256Hex(
      [
        publicConfig.verifierProgramId,
        verifierEvidence.programDataAddress,
        verifierEvidence.programDataSlot,
        verifierCodeHash,
      ].join("\n"),
    ),
  );
  const now = new Date().toISOString();
  const sourceVerifierMaterial = {
    schema: "iroha-sccp-solana-source-verifier-material-public/v1",
    sourceDomain: SCCP_SOLANA_DOMAIN,
    targetDomain: SCCP_SORA_DOMAIN,
    sourceChain: SOLANA_TESTNET_NETWORK_ID,
    placeholderMaterial: true,
    disabledReason:
      "Solana source light-client proof material is not published for taira_sol_xor.",
  };
  const sourceAdapterEngineDeployment = {
    schema: "iroha-sccp-solana-source-adapter-engine-deployment-public/v1",
    sourceDomain: SCCP_SOLANA_DOMAIN,
    targetDomain: SCCP_SORA_DOMAIN,
    sourceChain: SOLANA_TESTNET_NETWORK_ID,
    adapterCircuitId: "sccp-source-adapter-v1",
    adapterProofFamily: "unavailable",
    solanaProgramdataAddress: verifierEvidence.programDataAddress,
    solanaProgramdataSlot: verifierEvidence.programDataSlot,
    placeholderMaterial: true,
    disabledReason:
      "Solana source adapter proof executor is not published for taira_sol_xor.",
  };
  const manifest = {
    schema: "iroha-sccp-taira-solana-xor-route-manifest-draft/v1",
    createdAt: now,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    route_id: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    asset_key: SCCP_XOR_ASSET_KEY,
    solanaNetwork: "testnet",
    solana_network: "testnet",
    chain: SOLANA_TESTNET_NETWORK_ID,
    chainIdHex: SOLANA_TESTNET_CHAIN_ID_HEX,
    chain_id_hex: SOLANA_TESTNET_CHAIN_ID_HEX,
    networkId: SOLANA_TESTNET_NETWORK_ID,
    network_id: SOLANA_TESTNET_NETWORK_ID,
    counterpartyDomain: SCCP_SOLANA_DOMAIN,
    counterparty_domain: SCCP_SOLANA_DOMAIN,
    counterpartyAccountCodecKey: "solana_base58",
    counterparty_account_codec_key: "solana_base58",
    counterpartyAccountCodec: SCCP_SOLANA_BASE58_CODEC,
    counterparty_account_codec: SCCP_SOLANA_BASE58_CODEC,
    verifierTarget: "SolanaProgram",
    verifier_target: "SolanaProgram",
    productionReady: false,
    production_ready: false,
    disabledReason:
      "Solana programs, mint, and state are deployed on testnet, but governed source/destination proof packages and public TAIRA route-manifest publication are not available.",
    solanaRpcUrl: args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
    solana_rpc_url: args["solana-rpc-url"] || DEFAULT_SOLANA_RPC_URL,
    solanaProgramId: publicConfig.bridgeProgramId,
    solana_program_id: publicConfig.bridgeProgramId,
    tairaXorSolanaProgramId: publicConfig.bridgeProgramId,
    taira_xor_solana_program_id: publicConfig.bridgeProgramId,
    tairaXorTokenAddress: publicConfig.tokenMintAddress,
    taira_xor_token_address: publicConfig.tokenMintAddress,
    solanaTokenMint: publicConfig.tokenMintAddress,
    solana_token_mint: publicConfig.tokenMintAddress,
    solanaMintAuthorityAddress: mintAuthorityAddress,
    solana_mint_authority_address: mintAuthorityAddress,
    solanaMintAuthorityBump: mintAuthorityBump,
    solana_mint_authority_bump: mintAuthorityBump,
    solanaVerifierStateAddress: publicConfig.verifierStateAddress,
    solana_verifier_state_address: publicConfig.verifierStateAddress,
    solanaSourceStateAddress: sourceStateAddress,
    solana_source_state_address: sourceStateAddress,
    sccpSolanaSourceStateAddress: sourceStateAddress,
    sccp_solana_source_state_address: sourceStateAddress,
    sccpSolanaSourceBridgeAddress: publicConfig.sourceBridgeProgramId,
    sccp_solana_source_bridge_address: publicConfig.sourceBridgeProgramId,
    solanaVerifierProgramId: publicConfig.verifierProgramId,
    solana_verifier_program_id: publicConfig.verifierProgramId,
    solanaProgramdataAddress: verifierEvidence.programDataAddress,
    solana_programdata_address: verifierEvidence.programDataAddress,
    solanaProgramdataSlot: verifierEvidence.programDataSlot,
    solana_programdata_slot: verifierEvidence.programDataSlot,
    verifierCodeHash,
    verifier_code_hash: verifierCodeHash,
    verifierProgramArtifactSha256: programArtifactSha256,
    verifier_program_artifact_sha256: programArtifactSha256,
    verifierKeyHash: verifierKeyHash,
    verifier_key_hash: verifierKeyHash,
    destinationBindingHash: SOLANA_DESTINATION_BINDING_HASH,
    destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
    destinationBindingKey: SOLANA_DESTINATION_BINDING_KEY,
    destination_binding_key: SOLANA_DESTINATION_BINDING_KEY,
    destinationBinding: {
      version: 1,
      key: SOLANA_DESTINATION_BINDING_KEY,
      sourceDomain: SCCP_SORA_DOMAIN,
      targetDomain: SCCP_SOLANA_DOMAIN,
      bindingHash: SOLANA_DESTINATION_BINDING_HASH,
      networkId: SOLANA_TESTNET_NETWORK_ID,
    },
    destination_rollout: {
      version: 1,
      destination_network_id: SOLANA_TESTNET_NETWORK_ID,
      source_domain: SCCP_SORA_DOMAIN,
      target_domain: SCCP_SOLANA_DOMAIN,
      verifier_identity: publicConfig.verifierProgramId,
      verifier_backend: "solana-program-v1",
      proof_family: "stark-fri-v1",
      verifier_code_hash: verifierCodeHash,
      verifier_key_hash: verifierKeyHash,
      destination_bridge_address: publicConfig.bridgeProgramId,
      destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
      destination_binding_key: SOLANA_DESTINATION_BINDING_KEY,
      programdata_address: verifierEvidence.programDataAddress,
      programdata_slot: verifierEvidence.programDataSlot,
      live_evidence: verifierLiveEvidence,
    },
    destinationProofAdmission: {
      schema: "iroha-sccp-solana-destination-proof-admission-draft/v1",
      admissionMode: SOLANA_DRAFT_ADMISSION_MODE,
      admission_mode: SOLANA_DRAFT_ADMISSION_MODE,
      proofSystem: "none",
      proof_system: "none",
      entrypoint: SOLANA_SUBMIT_ENTRYPOINT,
      verifierCodeHash,
      verifier_code_hash: verifierCodeHash,
      verifierKeyHash: verifierKeyHash,
      verifier_key_hash: verifierKeyHash,
      destinationBindingHash: SOLANA_DESTINATION_BINDING_HASH,
      destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
      shapeOnly: true,
      shape_only: true,
      acceptsUnverifiedProofs: true,
      accepts_unverified_proofs: true,
      disabledReason:
        "The deployed Solana program records bounded SCCP envelopes but does not include governed proof verification material.",
    },
    destination_proof_admission: {
      schema: "iroha-sccp-solana-destination-proof-admission-draft/v1",
      admission_mode: SOLANA_DRAFT_ADMISSION_MODE,
      proof_system: "none",
      entrypoint: SOLANA_SUBMIT_ENTRYPOINT,
      verifier_code_hash: verifierCodeHash,
      verifier_key_hash: verifierKeyHash,
      destination_binding_hash: SOLANA_DESTINATION_BINDING_HASH,
      shape_only: true,
      accepts_unverified_proofs: true,
      disabled_reason:
        "The deployed Solana program records bounded SCCP envelopes but does not include governed proof verification material.",
    },
    destinationBrowserProver: {
      moduleUrl: SOLANA_DESTINATION_PROVER_MODULE_URL,
      moduleHash: destinationModuleHash,
      manifestHash: destinationModuleHash,
      expectedExports: [
        "proveSolanaSccpDestination",
        "solanaSccpDestinationProverSelfTest",
      ],
      boundRouteHash: SOLANA_DESTINATION_BINDING_HASH,
      boundProofHash: verifierCodeHash,
    },
    sourceBrowserProver: {
      moduleUrl: SOLANA_SOURCE_PROVER_MODULE_URL,
      moduleHash: sourceModuleHash,
      manifestHash: sourceModuleHash,
      expectedExports: [
        "proveSolanaSccpSource",
        "solanaSccpSourceProverSelfTest",
      ],
      boundRouteHash: SOLANA_DESTINATION_BINDING_HASH,
      boundProofHash: verifierCodeHash,
    },
    solanaVerifierInstructionAccounts: [
      { pubkey: "$payer", isSigner: true, isWritable: false },
      {
        pubkey: publicConfig.verifierStateAddress,
        isSigner: false,
        isWritable: true,
      },
    ],
    solanaVerifierMintInstructionAccounts: [
      { pubkey: "$payer", isSigner: true, isWritable: false },
      {
        pubkey: publicConfig.verifierStateAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: publicConfig.tokenMintAddress,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: "$destinationToken", isSigner: false, isWritable: true },
      { pubkey: mintAuthorityAddress, isSigner: false, isWritable: false },
      {
        pubkey: TOKEN_PROGRAM_ID.toBase58(),
        isSigner: false,
        isWritable: false,
      },
    ],
    solanaSourceBurnInstructionAccounts: [
      { pubkey: "$owner", isSigner: true, isWritable: false },
      {
        pubkey: sourceStateAddress,
        isSigner: false,
        isWritable: true,
      },
      { pubkey: "$sourceToken", isSigner: false, isWritable: true },
      {
        pubkey: publicConfig.tokenMintAddress,
        isSigner: false,
        isWritable: true,
      },
      {
        pubkey: TOKEN_PROGRAM_ID.toBase58(),
        isSigner: false,
        isWritable: false,
      },
    ],
    sourceVerifierMaterial: sourceVerifierMaterial,
    source_verifier_material: sourceVerifierMaterial,
    sourceAdapterEngineDeployment: sourceAdapterEngineDeployment,
    source_adapter_engine_deployment: sourceAdapterEngineDeployment,
    tairaBurnRecordMaterialSource: burnRecord.sourceFile,
    taira_burn_record_settlement_asset_definition_id:
      "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    taira_burn_record_contract_artifact_b64: burnRecord.artifactB64,
    taira_burn_record_artifact_sha256: burnRecord.artifactSha256,
    taira_burn_record_code_hash: burnRecord.codeHash,
    taira_burn_record_vk_backend: burnRecord.vkBackend,
    taira_burn_record_vk_name: burnRecord.vkName,
    taira_burn_record_gas_limit: 2_000_000,
    tairaXorBurnRecord: {
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      contractArtifactB64: burnRecord.artifactB64,
      artifactSha256: burnRecord.artifactSha256,
      codeHash: burnRecord.codeHash,
      vkRef: {
        backend: burnRecord.vkBackend,
        name: burnRecord.vkName,
      },
      gasLimit: 2_000_000,
    },
    settlement: {
      submitPath: "/v1/bridge/messages",
      mode: "finalize_inbound",
      routeId: SCCP_SOLANA_XOR_ROUTE_ID,
      assetKey: SCCP_XOR_ASSET_KEY,
    },
    deploymentEvidence: {
      verifier: verifierEvidence,
      verifierLive: verifierLiveEvidence,
      bridge: bridgeEvidence,
      sourceBridge: sourceBridgeEvidence,
      accounts,
    },
  };
  await writePublicJson(paths.routeManifest, manifest);
  return { routeManifestPath: paths.routeManifest, manifest };
};

const parseDeploySignatures = async (paths) => {
  if (!existsSync(paths.deployLog)) {
    return {};
  }
  const text = await readFile(paths.deployLog, "utf8");
  const entries = {};
  for (const match of text.matchAll(
    /^#\s+([^\n]+)\n[\s\S]*?Signature:\s+([1-9A-HJ-NP-Za-km-z]+)/gmu,
  )) {
    entries[match[1].trim()] = match[2];
  }
  return entries;
};

const renderDeploymentVideo = async (args) => {
  const paths = artifactPaths(args);
  const outputDir = paths.outputDir;
  await mkdir(outputDir, { recursive: true });
  const publicConfig = await readJson(paths.publicConfig);
  const accounts = existsSync(paths.accountsReport)
    ? await readJson(paths.accountsReport)
    : null;
  const funding = existsSync(paths.fundingReport)
    ? await readJson(paths.fundingReport)
    : null;
  const verifierEvidence = existsSync(paths.evidence)
    ? await readJson(paths.evidence)
    : null;
  const verifierLiveEvidence = existsSync(paths.liveEvidence)
    ? await readJson(paths.liveEvidence)
    : null;
  const [derivedMintAuthority, derivedMintAuthorityBump] = deriveMintAuthority(
    new PublicKey(publicConfig.verifierProgramId),
    new PublicKey(publicConfig.verifierStateAddress),
  );
  const mintAuthorityAddress =
    publicConfig.mintAuthorityAddress ?? derivedMintAuthority.toBase58();
  const mintAuthorityBump =
    publicConfig.mintAuthorityBump ?? derivedMintAuthorityBump;
  const signatures = await parseDeploySignatures(paths);
  const programSo = path.resolve(args["program-so"] || DEFAULT_PROGRAM_SO);
  const programArtifactSha256 = existsSync(programSo)
    ? hex32(await sha256FileHex(programSo))
    : "missing";
  const verifierCodeHash =
    typeof verifierLiveEvidence?.verifier_code_hash === "string"
      ? verifierLiveEvidence.verifier_code_hash
      : programArtifactSha256;
  const transcript = {
    schema: "iroha-demo-sccp-solana-deployment-video/v1",
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    ready: false,
    checkedAt: new Date().toISOString(),
    reason:
      "Solana testnet deployment evidence is real, but public TAIRA route publication, governed Solana proof admission, and source proof packages are still blocked.",
    deployment: {
      deployerAddress: publicConfig.deployerAddress,
      verifierProgramId: publicConfig.verifierProgramId,
      bridgeProgramId: publicConfig.bridgeProgramId,
      sourceBridgeProgramId: publicConfig.sourceBridgeProgramId,
      tokenMintAddress: publicConfig.tokenMintAddress,
      mintAuthorityAddress,
      mintAuthorityBump,
      verifierStateAddress: publicConfig.verifierStateAddress,
      sourceStateAddress:
        publicConfig.sourceStateAddress ??
        accounts?.sourceState?.address ??
        null,
      verifierProgramdataAddress: verifierEvidence?.programDataAddress ?? null,
      verifierProgramdataSlot: verifierEvidence?.programDataSlot ?? null,
      verifierCodeHash,
      programArtifactSha256,
      verifierLiveEvidence,
      signatures,
      accounts,
      funding,
    },
  };
  const subtitles = `WEBVTT

00:00.000 --> 00:05.000
Step 1: Built the Solana SBF program for taira_sol_xor. Artifact SHA-256 ${programArtifactSha256}.

00:05.000 --> 00:10.000
Step 2: Verified deployer ${publicConfig.deployerAddress} on Solana testnet with ${funding?.balanceSol ?? "unknown"} SOL.

00:10.000 --> 00:15.000
Step 3: Deployed immutable verifier ${publicConfig.verifierProgramId}; signature ${signatures.verifier ?? "recorded in deploy.log"}.

00:15.000 --> 00:20.000
Step 4: Deployed immutable bridge ${publicConfig.bridgeProgramId} and source bridge ${publicConfig.sourceBridgeProgramId}.

00:20.000 --> 00:25.000
Step 5: Created SPL TairaXOR mint ${publicConfig.tokenMintAddress} with program PDA mint authority ${mintAuthorityAddress}.

00:25.000 --> 00:31.000
Step 6: Initialized verifier state ${publicConfig.verifierStateAddress} and source burn state ${publicConfig.sourceStateAddress ?? accounts?.sourceState?.address ?? "unavailable"}.

00:31.000 --> 00:38.000
Step 7: Captured finalized ProgramData evidence at ${verifierEvidence?.programDataAddress ?? "unavailable"} slot ${verifierEvidence?.programDataSlot ?? "unavailable"} with verifier hash ${verifierCodeHash}.

00:38.000 --> 00:44.000
Blocked: public TAIRA has no production taira_sol_xor manifest and governed Solana proof packages are not published.
`;
  const transcriptPath = path.join(
    outputDir,
    "sccp-solana-deployment-video.json",
  );
  const subtitlesPath = path.join(
    outputDir,
    "sccp-solana-deployment-video.vtt",
  );
  const videoPath = path.join(outputDir, "sccp-solana-deployment-video.mp4");
  await writePublicJson(transcriptPath, transcript);
  await writeFile(subtitlesPath, subtitles);
  if (!commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required to render the Solana deployment MP4.");
  }
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x0f172a:s=1280x720:r=30:d=44",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-i",
      subtitlesPath,
      "-shortest",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-map",
      "2:s:0",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-c:s",
      "mov_text",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  if (ffmpeg.status !== 0) {
    throw new Error(
      `ffmpeg failed to render Solana deployment MP4: ${ffmpeg.stderr || ffmpeg.stdout}`,
    );
  }
  transcript.videoArtifacts = [
    { path: videoPath, mediaType: "video/mp4" },
    { path: subtitlesPath, mediaType: "text/vtt" },
  ];
  await writePublicJson(transcriptPath, transcript);
  return { transcriptPath, subtitlesPath, videoPath };
};

const routeManifest = async (args) => {
  const paths = artifactPaths(args);
  runNodeHelper([
    "route-manifest",
    "--template",
    path.resolve(requireOption(args, "template")),
    "--evidence",
    path.resolve(args.evidence || paths.evidence),
    "--output",
    paths.routeManifest,
  ]);
  return {
    routeManifestPath: paths.routeManifest,
    manifest: await readJson(paths.routeManifest),
  };
};

const routeManifestIsi = async (args) => {
  const paths = artifactPaths(args);
  const manifestPath = path.resolve(args.manifest || paths.routeManifest);
  const manifest = await readJson(manifestPath);
  const gasLimit = asPositiveNumber(
    args["gas-limit"],
    DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_LIMIT,
    "--gas-limit",
  );
  if (!Number.isSafeInteger(gasLimit)) {
    throw new Error("--gas-limit must be an integer.");
  }
  const artifact = buildSolanaRouteManifestIsiArtifact({
    manifest,
    gasAssetId:
      args["gas-asset-id"] || DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_ASSET_ID,
    gasLimit,
  });
  await writePublicJson(paths.routeManifestIsi, artifact);
  return {
    routeManifestIsiPath: paths.routeManifestIsi,
    artifact,
  };
};

const publishRouteManifest = async (args) => {
  const paths = artifactPaths(args);
  let isiResult;
  try {
    isiResult = await routeManifestIsi(args);
  } catch (error) {
    const blocked = {
      schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
      checkedAt: new Date().toISOString(),
      ready: false,
      stage: "route-manifest-isi",
      error: error instanceof Error ? error.message : String(error),
      routeManifest: path.resolve(args.manifest || paths.routeManifest),
      requiredPermission: "CanManageSccpRouteManifests",
    };
    await writePublicJson(paths.routeManifestPublishBlocked, blocked);
    throw error;
  }
  if (!asBoolean(args.submit)) {
    return {
      submitted: false,
      routeManifestIsiPath: isiResult.routeManifestIsiPath,
      nextStep:
        "Review the ISI artifact, then rerun with --submit true --authority <TAIRA route manager> and SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY set at runtime.",
    };
  }
  const authority = requireOption(args, "authority");
  const privateKeyEnv =
    args["private-key-env"] || DEFAULT_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY_ENV;
  const gasLimit = asPositiveNumber(
    args["gas-limit"],
    DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_LIMIT,
    "--gas-limit",
  );
  if (!Number.isSafeInteger(gasLimit)) {
    throw new Error("--gas-limit must be an integer.");
  }
  if (
    typeof process.env[privateKeyEnv] !== "string" ||
    !process.env[privateKeyEnv]
  ) {
    const blocked = {
      schema: "iroha-demo-sccp-solana-route-publish-blocked/v1",
      checkedAt: new Date().toISOString(),
      ready: false,
      stage: "runtime-signing-key",
      error: `${privateKeyEnv} is not set at runtime.`,
      routeManifestIsiPath: isiResult.routeManifestIsiPath,
      authority,
      requiredPermission: "CanManageSccpRouteManifests",
    };
    await writePublicJson(paths.routeManifestPublishBlocked, blocked);
    throw new Error(blocked.error);
  }
  run(process.execPath, [
    submitUpsertScript,
    "--isi",
    isiResult.routeManifestIsiPath,
    "--authority",
    authority,
    "--out",
    paths.routeManifestSubmission,
    "--torii-url",
    args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
    "--mcp-url",
    args["mcp-url"] || DEFAULT_TAIRA_MCP_URL,
    "--submit-via",
    "mcp",
    "--private-key-env",
    privateKeyEnv,
    "--gas-asset-id",
    args["gas-asset-id"] || DEFAULT_TAIRA_ROUTE_MANIFEST_GAS_ASSET_ID,
    "--gas-limit",
    String(gasLimit),
    "--wait-for-commit",
    args["wait-for-commit"] || "true",
    "--commit-timeout-ms",
    args["commit-timeout-ms"] || "180000",
  ]);
  return {
    submitted: true,
    routeManifestIsiPath: isiResult.routeManifestIsiPath,
    submissionPath: paths.routeManifestSubmission,
    submission: await readJson(paths.routeManifestSubmission),
  };
};

const propose = async (args) => {
  const paths = artifactPaths(args);
  runNodeHelper([
    "propose-route-manifest",
    "--manifest",
    path.resolve(args.manifest || paths.routeManifest),
    "--torii-url",
    args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
    "--mode",
    args.mode || "Plain",
    "--output",
    paths.proposalResponse,
  ]);
  return {
    proposalResponsePath: paths.proposalResponse,
    response: await readJson(paths.proposalResponse),
  };
};

const all = async (args) => {
  const steps = [];
  const record = async (name, fn) => {
    const result = await fn();
    steps.push({ name, ok: true, result });
    return result;
  };
  try {
    await record("doctor", () => doctor(args));
    if (
      !existsSync(artifactPaths(args).publicConfig) ||
      asBoolean(args.force)
    ) {
      await record("generate-keypairs", () => generateKeypairs(args));
    }
    await record("fund", () => fund(args));
    await record("deploy", () => deploy(args));
    await record("evidence", () => evidence(args));
    await record("live-evidence", () => liveEvidence(args));
    if (typeof args.template === "string" && args.template.trim()) {
      await record("route-manifest", () => routeManifest(args));
      await record("publish-route-manifest", () => publishRouteManifest(args));
    } else {
      await record("draft-manifest", () => draftManifest(args));
      throw new Error(
        "--template is required before publishing a production-ready Solana SCCP route manifest.",
      );
    }
  } catch (error) {
    const paths = artifactPaths(args);
    const blocked = {
      schema: "iroha-demo-sccp-solana-deploy-run/v1",
      checkedAt: new Date().toISOString(),
      ready: false,
      failedStep: steps.length,
      completedSteps: steps,
      error: error instanceof Error ? error.message : String(error),
      nextArtifacts: {
        outputDir: paths.outputDir,
        publicConfig: paths.publicConfig,
        fundingReport: paths.fundingReport,
        deployBlocked: paths.deployBlocked,
        accountsReport: paths.accountsReport,
        evidence: paths.evidence,
        routeManifest: paths.routeManifest,
        routeManifestIsi: paths.routeManifestIsi,
        productionRequirements: paths.productionRequirements,
        routeManifestSubmission: paths.routeManifestSubmission,
        routeManifestPublishBlocked: paths.routeManifestPublishBlocked,
        proposalResponse: paths.proposalResponse,
      },
    };
    await writePublicJson(
      path.join(paths.outputDir, "run-blocked.json"),
      blocked,
    );
    throw error;
  }
  return { ready: true, steps };
};

const main = async () => {
  const [command, ...rest] = process.argv.slice(2);
  if (!command || command === "--help" || command === "-h") {
    usage();
    return;
  }
  const args = parseArgs(rest);
  if (args.help) {
    usage();
    return;
  }
  const commands = {
    doctor,
    "generate-keypairs": generateKeypairs,
    "rotate-deployment-keypairs": rotateDeploymentKeypairs,
    fund,
    accounts: initializeSolanaAccounts,
    deploy,
    evidence,
    "live-evidence": liveEvidence,
    "draft-manifest": draftManifest,
    "deployment-video": renderDeploymentVideo,
    "production-requirements": productionRequirements,
    requirements: productionRequirements,
    "route-manifest": routeManifest,
    "route-manifest-isi": routeManifestIsi,
    "publish-route-manifest": publishRouteManifest,
    "submit-route-manifest": publishRouteManifest,
    propose,
    all,
  };
  const fn = commands[command];
  if (!fn) {
    throw new Error(`Unknown command: ${command}`);
  }
  const result = await fn(args);
  console.log(JSON.stringify(result, null, 2));
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exitCode = 1;
  });
}
