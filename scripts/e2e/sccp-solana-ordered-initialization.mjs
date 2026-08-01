/* global BigInt, globalThis */
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { blake2b } from "@noble/hashes/blake2b";
import { keccak_256 } from "@noble/hashes/sha3";
import { PublicKey } from "@solana/web3.js";

export const SOLANA_ORDERED_INITIALIZATION_SCHEMA =
  "iroha-sccp-solana-ordered-initialization-evidence/v2";
export const SOLANA_TESTNET_RPC_URL = "https://api.testnet.solana.com";

const ROUTE_ID = "taira_sol_xor";
const ASSET_KEY = "xor";
const REVISION = 1;
const BPF_UPGRADEABLE_LOADER = "BPFLoaderUpgradeab1e11111111111111111111111";
const BPF_UPGRADEABLE_LOADER_KEY = new PublicKey(BPF_UPGRADEABLE_LOADER);
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const HASH32 = /^0x[0-9a-f]{64}$/u;
const MATERIAL_VERIFYING_KEY_LEN = 38 * 32;
const MATERIAL_MAX_CHUNK_LEN = 512;
const PROGRAMDATA_METADATA_LEN = 45;
const SBPF_E_FLAGS_OFFSET = 48;
const SBPF_V3_E_FLAGS = 3;
const SBPF_V3 = "V3";
const SPL_MINT_ACCOUNT_LEN = 82;
const SPL_MINT_DECIMALS = 9;

const PROGRAM_ROLES = ["destination", "source", "native_verifier"];
const REQUIRED_INITIALIZATION_ROLES = [
  "token_mint_create",
  "token_mint_initialize",
  "native_verifier_material_initialize",
  "native_verifier_material_appends",
  "native_verifier_material_seal",
  "destination_route_initialize",
  "source_route_initialize",
];

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const exactKeys = (value, keys, label) => {
  if (!isRecord(value)) throw new TypeError(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new TypeError(`${label} contains an unknown or missing field.`);
  }
  return value;
};

const containsSecretField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect)/iu.test(
        key,
      ) || containsSecretField(child),
  );
};

const publicKey = (value, label) => {
  if (typeof value !== "string" || !value) {
    throw new TypeError(`${label} must be a canonical Solana public key.`);
  }
  let normalized;
  try {
    normalized = new PublicKey(value).toBase58();
  } catch {
    throw new TypeError(`${label} must be a canonical Solana public key.`);
  }
  if (normalized !== value) {
    throw new TypeError(`${label} must use canonical Solana Base58.`);
  }
  return normalized;
};

const signature = (value, label) => {
  if (typeof value !== "string" || !value) {
    throw new TypeError(`${label} must be a canonical Solana signature.`);
  }
  let decoded;
  try {
    decoded = bs58.decode(value);
  } catch {
    throw new TypeError(`${label} must be a canonical Solana signature.`);
  }
  if (
    decoded.length !== 64 ||
    decoded.every((byte) => byte === 0) ||
    bs58.encode(decoded) !== value
  ) {
    throw new TypeError(`${label} must encode exactly 64 signature bytes.`);
  }
  return value;
};

const slot = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError(`${label} must be a positive finalized slot.`);
  }
  return value;
};

const finalizationRecord = (value, role) => {
  const record = exactKeys(
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
    `${role} finalization evidence`,
  );
  const artifactSha256 = record.artifact_sha256;
  const codeHash = record.program_code_hash;
  if (
    !HASH32.test(artifactSha256) ||
    /^0x0{64}$/u.test(artifactSha256) ||
    !HASH32.test(codeHash) ||
    /^0x0{64}$/u.test(codeHash)
  ) {
    throw new TypeError(
      `${role} finalization artifact SHA-256 and executable hash must be nonzero lowercase hex.`,
    );
  }
  const programdataDeploymentSlot = slot(
    record.programdata_deployment_slot,
    `${role} ProgramData deployment`,
  );
  const finalizedSlot = slot(record.finalized_slot, `${role} finalization`);
  if (programdataDeploymentSlot >= finalizedSlot) {
    throw new TypeError(
      `${role} ProgramData deployment must precede atomic authority removal.`,
    );
  }
  return Object.freeze({
    programAddress: publicKey(record.program_address, `${role} program`),
    programdataAddress: publicKey(
      record.programdata_address,
      `${role} ProgramData`,
    ),
    artifactSha256,
    programCodeHash: codeHash,
    programdataDeploymentSlot,
    transactionSignature: signature(
      record.transaction_signature,
      `${role} finalization transaction`,
    ),
    finalizedSlot,
  });
};

const initializationRecord = (value, role) => {
  const record = exactKeys(
    value,
    [
      "program_address",
      "account_address",
      "transaction_signature",
      "finalized_slot",
    ],
    `${role} initialization evidence`,
  );
  return Object.freeze({
    programAddress: publicKey(record.program_address, `${role} program`),
    accountAddress: publicKey(record.account_address, `${role} account`),
    transactionSignature: signature(
      record.transaction_signature,
      `${role} transaction`,
    ),
    finalizedSlot: slot(record.finalized_slot, role),
  });
};

const requireStrictlyIncreasing = (values, label) => {
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] <= values[index - 1]) {
      throw new TypeError(
        `${label} transaction slots must be strictly increasing.`,
      );
    }
  }
};

/**
 * Validate the independently reviewed transaction chronology. Current account
 * state alone cannot prove that immutable programs preceded initialization.
 */
export const validateSolanaOrderedInitializationEvidence = (value) => {
  const evidence = exactKeys(
    value,
    [
      "schema",
      "route_id",
      "asset_key",
      "revision",
      "solana_rpc_url",
      "fresh_deploy_report_sha256",
      "program_finalizations",
      "initialization_transactions",
      "captured_at",
    ],
    "Solana ordered-initialization evidence",
  );
  if (containsSecretField(evidence)) {
    throw new TypeError(
      "Solana ordered-initialization evidence must not contain secrets.",
    );
  }
  if (
    evidence.schema !== SOLANA_ORDERED_INITIALIZATION_SCHEMA ||
    evidence.route_id !== ROUTE_ID ||
    evidence.asset_key !== ASSET_KEY ||
    evidence.revision !== REVISION ||
    evidence.solana_rpc_url !== SOLANA_TESTNET_RPC_URL ||
    typeof evidence.captured_at !== "string" ||
    !Number.isFinite(Date.parse(evidence.captured_at))
  ) {
    throw new TypeError(
      "Solana ordered-initialization evidence identity is not exact revision 1 testnet evidence.",
    );
  }
  if (
    !HASH32.test(evidence.fresh_deploy_report_sha256) ||
    /^0x0{64}$/u.test(evidence.fresh_deploy_report_sha256)
  ) {
    throw new TypeError(
      "Solana ordered-initialization evidence must pin the canonical fresh-deploy report bytes.",
    );
  }
  exactKeys(
    evidence.program_finalizations,
    PROGRAM_ROLES,
    "Solana program finalizations",
  );
  const programFinalizations = Object.freeze(
    Object.fromEntries(
      PROGRAM_ROLES.map((role) => [
        role,
        finalizationRecord(evidence.program_finalizations[role], role),
      ]),
    ),
  );
  const artifactHashes = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].artifactSha256,
  );
  const codeHashes = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].programCodeHash,
  );
  if (
    new Set(artifactHashes).size !== PROGRAM_ROLES.length ||
    new Set(codeHashes).size !== PROGRAM_ROLES.length
  ) {
    throw new TypeError(
      "Exact Solana destination, source, and native-verifier roles require distinct artifact bytes and executable code hashes.",
    );
  }
  const finalizationSignatures = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].transactionSignature,
  );
  const finalizationSlots = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].finalizedSlot,
  );
  if (
    new Set(finalizationSignatures).size !== 1 ||
    new Set(finalizationSlots).size !== 1
  ) {
    throw new TypeError(
      "All three Loader-v3 authority removals must share one atomic transaction signature and finalized slot.",
    );
  }
  exactKeys(
    evidence.initialization_transactions,
    REQUIRED_INITIALIZATION_ROLES,
    "Solana initialization transactions",
  );
  const initializationTransactions = {};
  for (const role of REQUIRED_INITIALIZATION_ROLES) {
    if (role === "native_verifier_material_appends") {
      const appends = evidence.initialization_transactions[role];
      if (!Array.isArray(appends) || appends.length === 0) {
        throw new TypeError(
          "Native-verifier material append evidence must be non-empty.",
        );
      }
      initializationTransactions[role] = Object.freeze(
        appends.map((entry, index) =>
          initializationRecord(entry, `${role}[${index}]`),
        ),
      );
    } else {
      initializationTransactions[role] = initializationRecord(
        evidence.initialization_transactions[role],
        role,
      );
    }
  }
  const maxFinalizationSlot = Math.max(...finalizationSlots);
  const initializationEntries = Object.entries(
    initializationTransactions,
  ).flatMap(([role, entry]) =>
    Array.isArray(entry)
      ? entry.map((child, index) => [`${role}[${index}]`, child])
      : [[role, entry]],
  );
  for (const [role, entry] of initializationEntries) {
    if (entry.finalizedSlot <= maxFinalizationSlot) {
      throw new TypeError(
        `${role} must finalize strictly after all three program finalizations.`,
      );
    }
  }
  const init = initializationTransactions;
  const bootstrap = [
    init.token_mint_create,
    init.token_mint_initialize,
    init.native_verifier_material_initialize,
  ];
  if (
    new Set(bootstrap.map((entry) => entry.transactionSignature)).size !== 1 ||
    new Set(bootstrap.map((entry) => entry.finalizedSlot)).size !== 1
  ) {
    throw new TypeError(
      "Mint create, mint initialize, and native material initialize must be one atomic transaction.",
    );
  }
  const independentSignatures = [
    programFinalizations.destination.transactionSignature,
    init.native_verifier_material_initialize.transactionSignature,
    ...init.native_verifier_material_appends.map(
      (entry) => entry.transactionSignature,
    ),
    init.native_verifier_material_seal.transactionSignature,
    init.destination_route_initialize.transactionSignature,
    init.source_route_initialize.transactionSignature,
  ];
  if (new Set(independentSignatures).size !== independentSignatures.length) {
    throw new TypeError(
      "Independent Solana lifecycle actions must use distinct transaction signatures.",
    );
  }
  const lifecycleSlots = [
    init.native_verifier_material_initialize.finalizedSlot,
    ...init.native_verifier_material_appends.map(
      (entry) => entry.finalizedSlot,
    ),
    init.native_verifier_material_seal.finalizedSlot,
    init.destination_route_initialize.finalizedSlot,
    init.source_route_initialize.finalizedSlot,
  ];
  requireStrictlyIncreasing(
    lifecycleSlots,
    "Atomic bootstrap, verifier material, and route-state lifecycle",
  );
  return Object.freeze({
    evidence,
    freshDeployReportSha256: evidence.fresh_deploy_report_sha256,
    programFinalizations,
    initializationTransactions: Object.freeze(initializationTransactions),
    maxFinalizationSlot,
    firstInitializationSlot: Math.min(
      ...initializationEntries.map(([, entry]) => entry.finalizedSlot),
    ),
  });
};

/** Direct artifact pins committed by the reviewed Parliament plan. */
export const solanaOrderedProgramArtifactSha256 = (normalized) =>
  Object.freeze({
    destination: normalized.programFinalizations.destination.artifactSha256,
    source: normalized.programFinalizations.source.artifactSha256,
    native_verifier:
      normalized.programFinalizations.native_verifier.artifactSha256,
  });

const allowedPrograms = (summary) => ({
  token_mint_create: new Set([SYSTEM_PROGRAM]),
  token_mint_initialize: new Set([TOKEN_PROGRAM]),
  native_verifier_material_initialize: new Set([
    summary.programs.nativeVerifier,
  ]),
  native_verifier_material_appends: new Set([summary.programs.nativeVerifier]),
  native_verifier_material_seal: new Set([summary.programs.nativeVerifier]),
  destination_route_initialize: new Set([summary.programs.destination]),
  source_route_initialize: new Set([summary.programs.source]),
});

/** Bind chronology evidence to the exact public typed-registry identities. */
export const checkSolanaOrderedInitializationAgainstRegistry = (
  normalized,
  summary,
) => {
  if (summary?.revision !== REVISION) {
    throw new TypeError("Ordered initialization is valid only for revision 1.");
  }
  for (const [role, summaryRole] of [
    ["destination", "destination"],
    ["source", "source"],
    ["native_verifier", "nativeVerifier"],
  ]) {
    const actual = normalized.programFinalizations[role];
    if (
      actual.programAddress !== summary.programs?.[summaryRole] ||
      actual.programdataAddress !==
        summary.accounts?.[`${summaryRole}ProgramData`] ||
      actual.programCodeHash !== summary.codeHashes?.[summaryRole] ||
      actual.programdataDeploymentSlot !==
        summary.programDataSlots?.[summaryRole] ||
      actual.programdataDeploymentSlot >= actual.finalizedSlot
    ) {
      throw new TypeError(
        `${role} finalization evidence differs from exact typed governance.`,
      );
    }
  }
  const init = normalized.initializationTransactions;
  const expectedAccounts = {
    token_mint_create: summary.accounts.tokenMint,
    token_mint_initialize: summary.accounts.tokenMint,
    native_verifier_material_initialize:
      summary.accounts.nativeVerifierMaterial,
    native_verifier_material_appends: summary.accounts.nativeVerifierMaterial,
    native_verifier_material_seal: summary.accounts.nativeVerifierMaterial,
    destination_route_initialize: summary.accounts.destinationState,
    source_route_initialize: summary.accounts.sourceState,
  };
  const mint = new PublicKey(summary.accounts.tokenMint);
  const deriveState = (program, role) =>
    PublicKey.findProgramAddressSync(
      [
        Buffer.from("sccp-route-state-v1", "utf8"),
        Buffer.from([role]),
        mint.toBuffer(),
      ],
      new PublicKey(program),
    )[0].toBase58();
  if (
    summary.accounts.destinationState !==
      deriveState(summary.programs.destination, 1) ||
    summary.accounts.sourceState !== deriveState(summary.programs.source, 2)
  ) {
    throw new TypeError(
      "Ordered initialization route states are not the exact role-and-mint PDAs.",
    );
  }
  const programs = allowedPrograms(summary);
  for (const [role, entry] of Object.entries(init)) {
    for (const child of Array.isArray(entry) ? entry : [entry]) {
      if (
        child.accountAddress !== expectedAccounts[role] ||
        !programs[role].has(child.programAddress)
      ) {
        throw new TypeError(
          `${role} evidence differs from exact typed-registry identities.`,
        );
      }
    }
  }
  return Object.freeze({
    ready: true,
    maxFinalizationSlot: normalized.maxFinalizationSlot,
    firstInitializationSlot: normalized.firstInitializationSlot,
  });
};

const transactionEntries = (normalized) => [
  ...Object.entries(normalized.programFinalizations).map(([role, entry]) => ({
    role: `program_finalizations.${role}`,
    entry,
  })),
  ...Object.entries(normalized.initializationTransactions).flatMap(
    ([role, entry]) =>
      (Array.isArray(entry) ? entry : [entry]).map((child, index) => ({
        role: Array.isArray(entry) ? `${role}[${index}]` : role,
        entry: child,
      })),
  ),
];

const hashHex = (bytes) => `0x${Buffer.from(bytes).toString("hex")}`;

const accountKey = (value) =>
  typeof value === "string"
    ? value
    : typeof value?.pubkey === "string"
      ? value.pubkey
      : null;

const normalizeMessageAccountKeys = (result) => {
  const raw = result?.transaction?.message?.accountKeys;
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new TypeError("Finalized Solana transaction has no account keys.");
  }
  const keys = raw.map((value, index) => {
    const key = publicKey(
      accountKey(value),
      `transaction account key ${index}`,
    );
    return Object.freeze({
      pubkey: key,
      signer: typeof value?.signer === "boolean" ? value.signer : null,
      writable: typeof value?.writable === "boolean" ? value.writable : null,
    });
  });
  // jsonParsed resolves address-table keys into accountKeys. Raw compiled
  // responses do not, so append loaded addresses only for the latter shape.
  if (raw.every((value) => typeof value === "string")) {
    for (const [kind, writable] of [
      ["writable", true],
      ["readonly", false],
    ]) {
      for (const value of result?.meta?.loadedAddresses?.[kind] ?? []) {
        keys.push(
          Object.freeze({
            pubkey: publicKey(value, `loaded ${kind} account key`),
            signer: false,
            writable,
          }),
        );
      }
    }
  }
  return Object.freeze(keys);
};

const normalizeInstruction = (instruction, keys, location) => {
  if (!isRecord(instruction)) {
    throw new TypeError(`${location} instruction is not an object.`);
  }
  const directProgram = accountKey(instruction.programId);
  const indexedProgram = Number.isSafeInteger(instruction.programIdIndex)
    ? keys[instruction.programIdIndex]?.pubkey
    : null;
  const programId = publicKey(
    directProgram ?? indexedProgram,
    `${location} instruction program`,
  );
  const accounts = Array.isArray(instruction.accounts)
    ? instruction.accounts.map((value, index) => {
        const resolved = Number.isSafeInteger(value)
          ? keys[value]?.pubkey
          : accountKey(value);
        return publicKey(resolved, `${location} account ${index}`);
      })
    : [];
  let data = null;
  if (typeof instruction.data === "string") {
    try {
      data = Buffer.from(bs58.decode(instruction.data));
    } catch {
      throw new TypeError(`${location} instruction data is not Base58.`);
    }
  }
  return Object.freeze({
    programId,
    accounts: Object.freeze(accounts),
    data,
    parsed: isRecord(instruction.parsed) ? instruction.parsed : null,
    topLevel: location.startsWith("top-level"),
    location,
  });
};

const normalizeRpcTransaction = (result, signatureValue, finalizedSlot) => {
  if (
    !isRecord(result) ||
    result.slot !== finalizedSlot ||
    result.meta?.err !== null ||
    result.transaction?.signatures?.[0] !== signatureValue ||
    ![undefined, null, "legacy", 0].includes(result.version)
  ) {
    throw new TypeError(
      "Solana transaction is not the claimed successful finalized version-0-compatible transaction.",
    );
  }
  const keys = normalizeMessageAccountKeys(result);
  const top = result.transaction?.message?.instructions;
  if (!Array.isArray(top) || top.length === 0) {
    throw new TypeError("Finalized Solana transaction has no instructions.");
  }
  const instructions = top.map((instruction, index) =>
    normalizeInstruction(instruction, keys, `top-level[${index}]`),
  );
  for (const group of result.meta?.innerInstructions ?? []) {
    if (
      !Number.isSafeInteger(group?.index) ||
      !Array.isArray(group?.instructions)
    ) {
      throw new TypeError("Finalized Solana inner instructions are malformed.");
    }
    for (const [index, instruction] of group.instructions.entries()) {
      instructions.push(
        normalizeInstruction(
          instruction,
          keys,
          `inner[${group.index}][${index}]`,
        ),
      );
    }
  }
  return Object.freeze({
    signature: signatureValue,
    finalizedSlot,
    keys,
    instructions: Object.freeze(instructions),
  });
};

const keyMetadata = (transaction, address) =>
  transaction.keys.find((entry) => entry.pubkey === address) ?? null;

const requireSigner = (transaction, address, label) => {
  const metadata = keyMetadata(transaction, address);
  if (metadata?.signer !== true) {
    throw new TypeError(`${label} is not a transaction signer.`);
  }
};

const requireWritable = (transaction, address, label) => {
  const metadata = keyMetadata(transaction, address);
  if (metadata?.writable !== true) {
    throw new TypeError(`${label} is not writable.`);
  }
};

const sameAccounts = (actual, expected) =>
  actual.length === expected.length &&
  actual.every((value, index) => value === expected[index]);

const oneInstruction = (instructions, label) => {
  if (instructions.length !== 1) {
    throw new TypeError(
      `${label} requires exactly one decoded top-level instruction; found ${instructions.length}.`,
    );
  }
  return instructions[0];
};

const topLevelForProgram = (transaction, programId) =>
  transaction.instructions.filter(
    (instruction) =>
      instruction.topLevel && instruction.programId === programId,
  );

const decodeAtomicLoaderFinalization = (transaction, normalized) => {
  if (transaction.instructions.length !== PROGRAM_ROLES.length) {
    throw new TypeError(
      "Atomic Loader-v3 finalization must contain exactly three instructions and no extras.",
    );
  }
  const rows = [];
  let sharedAuthority = null;
  for (const [index, role] of PROGRAM_ROLES.entries()) {
    const instruction = transaction.instructions[index];
    const finalization = normalized.programFinalizations[role];
    const programdataAddress = finalization.programdataAddress;
    const derivedProgramdataAddress = PublicKey.findProgramAddressSync(
      [new PublicKey(finalization.programAddress).toBuffer()],
      BPF_UPGRADEABLE_LOADER_KEY,
    )[0].toBase58();
    if (
      programdataAddress !== derivedProgramdataAddress ||
      !instruction.topLevel ||
      instruction.programId !== BPF_UPGRADEABLE_LOADER ||
      !instruction.data?.equals(Buffer.from([4, 0, 0, 0])) ||
      !sameAccounts(instruction.accounts, [
        programdataAddress,
        instruction.accounts[1],
      ])
    ) {
      throw new TypeError(
        "Atomic Loader-v3 finalization must contain canonical role-ordered SetAuthority(None) instructions.",
      );
    }
    if (sharedAuthority === null) {
      sharedAuthority = instruction.accounts[1];
    } else if (instruction.accounts[1] !== sharedAuthority) {
      throw new TypeError(
        "Atomic Loader-v3 finalization must use one shared current authority.",
      );
    }
    requireSigner(
      transaction,
      instruction.accounts[1],
      `${role} Loader-v3 current authority`,
    );
    requireWritable(
      transaction,
      programdataAddress,
      `${role} Loader-v3 ProgramData`,
    );
    rows.push(
      Object.freeze({
        role,
        programdataAddress,
        currentAuthority: instruction.accounts[1],
      }),
    );
  }
  return Object.freeze(rows);
};

const normalizeAtomicFinalizationPins = (value) => {
  if (!isRecord(value)) {
    throw new TypeError("Atomic Loader-v3 finalization pins are missing.");
  }
  const programFinalizations = Object.freeze(
    Object.fromEntries(
      PROGRAM_ROLES.map((role) => {
        const entry = value[role];
        if (!isRecord(entry)) {
          throw new TypeError(`${role} atomic finalization pin is missing.`);
        }
        return [
          role,
          Object.freeze({
            programAddress: publicKey(
              entry.programAddress,
              `${role} finalization program`,
            ),
            programdataAddress: publicKey(
              entry.programdataAddress,
              `${role} finalization ProgramData`,
            ),
            transactionSignature: signature(
              entry.transactionSignature,
              `${role} finalization transaction`,
            ),
            finalizedSlot: slot(entry.finalizedSlot, `${role} finalization`),
          }),
        ];
      }),
    ),
  );
  const signatures = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].transactionSignature,
  );
  const slots = PROGRAM_ROLES.map(
    (role) => programFinalizations[role].finalizedSlot,
  );
  if (new Set(signatures).size !== 1 || new Set(slots).size !== 1) {
    throw new TypeError(
      "All three Loader-v3 authority removals must share one atomic transaction signature and finalized slot.",
    );
  }
  return Object.freeze({
    programFinalizations,
    signature: signatures[0],
    finalizedSlot: slots[0],
  });
};

/**
 * Pre-mutation verifier for the irreversible Solana initializer. It fetches
 * the one claimed finalized transaction and proves that it contains exactly
 * the three role-ordered SetAuthority(None) instructions, all signed by one
 * shared authority and bound to the canonical ProgramData PDA of each
 * reviewed program id.
 */
export const verifySolanaAtomicProgramFinalizationTransaction = async (
  connection,
  finalizationPins,
) => {
  if (!connection || typeof connection.getParsedTransaction !== "function") {
    throw new TypeError(
      "A Solana connection with finalized parsed-transaction reads is required.",
    );
  }
  const normalized = normalizeAtomicFinalizationPins(finalizationPins);
  const readback = await connection.getParsedTransaction(normalized.signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  const transaction = normalizeRpcTransaction(
    readback,
    normalized.signature,
    normalized.finalizedSlot,
  );
  const rows = decodeAtomicLoaderFinalization(transaction, normalized);
  return Object.freeze({
    ready: true,
    signature: normalized.signature,
    finalizedSlot: normalized.finalizedSlot,
    authorityAddress: rows[0].currentAuthority,
    roles: Object.freeze(rows.map(({ role }) => role)),
    programdataAddresses: Object.freeze(
      Object.fromEntries(
        rows.map(({ role, programdataAddress }) => [role, programdataAddress]),
      ),
    ),
  });
};

const bigintValue = (value, label) => {
  try {
    const parsed = BigInt(value);
    if (parsed < 0n) throw new Error("negative");
    return parsed;
  } catch {
    throw new TypeError(`${label} is not an unsigned integer.`);
  }
};

const decodedParsedInfo = (instruction, type) =>
  instruction.parsed?.type === type && isRecord(instruction.parsed.info)
    ? instruction.parsed.info
    : null;

const decodeMintCreate = (transaction, mintAddress) => {
  const candidates = topLevelForProgram(transaction, SYSTEM_PROGRAM).filter(
    (instruction) =>
      instruction.accounts[1] === mintAddress ||
      instruction.parsed?.info?.newAccount === mintAddress,
  );
  const instruction = oneInstruction(candidates, "SPL mint createAccount");
  let payer;
  let lamports;
  if (instruction.data !== null) {
    if (
      instruction.data.length !== 52 ||
      instruction.data.readUInt32LE(0) !== 0 ||
      instruction.data.readBigUInt64LE(12) !== BigInt(SPL_MINT_ACCOUNT_LEN) ||
      new PublicKey(instruction.data.subarray(20, 52)).toBase58() !==
        TOKEN_PROGRAM ||
      !sameAccounts(instruction.accounts, [
        instruction.accounts[0],
        mintAddress,
      ])
    ) {
      throw new TypeError(
        "SPL mint creation is not exact SystemProgram createAccount.",
      );
    }
    payer = instruction.accounts[0];
    lamports = instruction.data.readBigUInt64LE(4);
  } else {
    const info = decodedParsedInfo(instruction, "createAccount");
    if (
      !info ||
      info.newAccount !== mintAddress ||
      info.owner !== TOKEN_PROGRAM ||
      bigintValue(info.space, "SPL mint space") !== BigInt(SPL_MINT_ACCOUNT_LEN)
    ) {
      throw new TypeError(
        "Parsed SPL mint creation is not exact SystemProgram createAccount.",
      );
    }
    payer = publicKey(info.source, "SPL mint createAccount payer");
    lamports = bigintValue(info.lamports, "SPL mint rent lamports");
  }
  if (lamports <= 0n || payer === mintAddress) {
    throw new TypeError("SPL mint createAccount funding or payer is invalid.");
  }
  requireSigner(transaction, payer, "SPL mint payer");
  requireSigner(transaction, mintAddress, "SPL mint account");
  requireWritable(transaction, payer, "SPL mint payer");
  requireWritable(transaction, mintAddress, "SPL mint account");
  return Object.freeze({ payer, lamports: lamports.toString() });
};

const destinationMintAuthority = (summary) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-mint-authority-v1", "utf8"),
      new PublicKey(summary.accounts.destinationState).toBuffer(),
    ],
    new PublicKey(summary.programs.destination),
  )[0].toBase58();

const decodeMintInitialize = (transaction, summary) => {
  const mintAddress = summary.accounts.tokenMint;
  const expectedAuthority = destinationMintAuthority(summary);
  const candidates = topLevelForProgram(transaction, TOKEN_PROGRAM).filter(
    (instruction) =>
      instruction.accounts[0] === mintAddress ||
      instruction.parsed?.info?.mint === mintAddress,
  );
  const instruction = oneInstruction(
    candidates,
    "classic SPL Token InitializeMint2",
  );
  if (instruction.data !== null) {
    if (
      instruction.data.length !== 35 ||
      instruction.data[0] !== 20 ||
      instruction.data[1] !== SPL_MINT_DECIMALS ||
      new PublicKey(instruction.data.subarray(2, 34)).toBase58() !==
        expectedAuthority ||
      instruction.data[34] !== 0 ||
      !sameAccounts(instruction.accounts, [mintAddress])
    ) {
      throw new TypeError(
        "SPL mint initialization must be exact InitializeMint2(9, PDA, None).",
      );
    }
  } else {
    const info = decodedParsedInfo(instruction, "initializeMint2");
    if (
      !info ||
      info.mint !== mintAddress ||
      info.decimals !== SPL_MINT_DECIMALS ||
      info.mintAuthority !== expectedAuthority ||
      info.freezeAuthority !== null
    ) {
      throw new TypeError(
        "Parsed SPL mint initialization is not exact InitializeMint2.",
      );
    }
  }
  requireWritable(transaction, mintAddress, "SPL mint initialization");
  return Object.freeze({
    mintAddress,
    decimals: SPL_MINT_DECIMALS,
    mintAuthority: expectedAuthority,
    freezeAuthority: null,
  });
};

const bridgeAuthority = (summary) =>
  PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-verify-authority-v1", "utf8"),
      new PublicKey(summary.accounts.destinationState).toBuffer(),
    ],
    new PublicKey(summary.programs.destination),
  )[0].toBase58();

const exactHashAt = (data, offset, expected, label) => {
  const actual = hashHex(data.subarray(offset, offset + 32));
  if (actual !== expected) {
    throw new TypeError(`${label} differs from exact typed governance.`);
  }
  return actual;
};

const decodeMaterialInitialize = (transaction, summary, expectedPayer) => {
  const material = summary.accounts.nativeVerifierMaterial;
  const candidates = topLevelForProgram(
    transaction,
    summary.programs.nativeVerifier,
  ).filter(
    (instruction) =>
      instruction.accounts[1] === material && instruction.data?.[1] === 0,
  );
  const instruction = oneInstruction(
    candidates,
    "native verifier material initialize",
  );
  const data = instruction.data;
  const assetLength = data?.[102];
  if (
    !data ||
    data.length !== 330 ||
    data[0] !== 1 ||
    data[1] !== 0 ||
    data.readUInt32LE(98) !== REVISION ||
    assetLength !== 3 ||
    data.subarray(103, 106).toString("utf8") !== ASSET_KEY
  ) {
    throw new TypeError(
      "Native verifier material initialize data is not exact revision 1 XOR material.",
    );
  }
  const authority = instruction.accounts[0];
  const expectedAccounts = [
    authority,
    material,
    summary.programs.nativeVerifier,
    summary.accounts.nativeVerifierProgramData,
    summary.programs.destination,
    summary.accounts.destinationProgramData,
    summary.programs.source,
    summary.accounts.sourceProgramData,
    summary.accounts.destinationState,
    bridgeAuthority(summary),
    summary.accounts.tokenMint,
    TOKEN_PROGRAM,
    SYSTEM_PROGRAM,
  ];
  if (!sameAccounts(instruction.accounts, expectedAccounts)) {
    throw new TypeError(
      "Native verifier material initialize accounts differ from the exact 13-account ABI.",
    );
  }
  if (authority !== expectedPayer) {
    throw new TypeError(
      "Atomic mint/material bootstrap must use one payer and material authority.",
    );
  }
  requireSigner(transaction, authority, "native material authority");
  requireSigner(transaction, summary.accounts.tokenMint, "SPL mint account");
  requireWritable(transaction, authority, "native material authority");
  requireWritable(transaction, material, "native material PDA");
  const verifierKeySha256 = hashHex(data.subarray(2, 34));
  const verifierKeyKeccak = exactHashAt(
    data,
    34,
    summary.verifierKeyHash,
    "native verifier key Keccak-256",
  );
  exactHashAt(
    data,
    66,
    summary.nativeVerifierConfigHash,
    "native verifier config hash",
  );
  const governedHashes = [
    [summary.destinationBindingHash, "destination binding hash"],
    [summary.routeConfigurationHash, "route configuration hash"],
    [summary.proofPolicy?.soraFinalityAnchorHash, "SORA finality anchor hash"],
    [summary.proofPolicy?.semanticProfileHash, "semantic profile hash"],
    [summary.proofPolicy?.circuitCommitment, "circuit commitment"],
    [
      summary.proofPolicy?.witnessGeneratorCommitment,
      "witness-generator commitment",
    ],
    [summary.proofPolicy?.publicSignalSchemaHash, "public-signal schema hash"],
  ];
  for (const [index, [expected, label]] of governedHashes.entries()) {
    exactHashAt(data, 106 + index * 32, expected, label);
  }
  return Object.freeze({
    authority,
    material,
    verifierKeySha256,
    verifierKeyKeccak,
  });
};

const decodeMaterialAppend = (transaction, summary, expectedAuthority) => {
  const material = summary.accounts.nativeVerifierMaterial;
  const candidates = topLevelForProgram(
    transaction,
    summary.programs.nativeVerifier,
  ).filter((instruction) => instruction.accounts[1] === material);
  const instruction = oneInstruction(candidates, "native material append");
  const data = instruction.data;
  const length = data?.length >= 6 ? data.readUInt16LE(4) : 0;
  if (
    !data ||
    data[0] !== 1 ||
    data[1] !== 1 ||
    data.length !== 6 + length ||
    length <= 0 ||
    length > MATERIAL_MAX_CHUNK_LEN ||
    !sameAccounts(instruction.accounts, [expectedAuthority, material])
  ) {
    throw new TypeError(
      "Native verifier material append is not the exact bounded two-account ABI.",
    );
  }
  requireSigner(transaction, expectedAuthority, "native material authority");
  requireWritable(transaction, material, "native material PDA");
  return Object.freeze({
    offset: data.readUInt16LE(2),
    chunk: Buffer.from(data.subarray(6)),
  });
};

const decodeMaterialSeal = (transaction, summary, expectedAuthority) => {
  const material = summary.accounts.nativeVerifierMaterial;
  const candidates = topLevelForProgram(
    transaction,
    summary.programs.nativeVerifier,
  ).filter((instruction) => instruction.accounts[1] === material);
  const instruction = oneInstruction(candidates, "native material seal");
  if (
    !instruction.data?.equals(Buffer.from([1, 2])) ||
    !sameAccounts(instruction.accounts, [expectedAuthority, material])
  ) {
    throw new TypeError(
      "Native verifier material seal is not the exact two-account ABI.",
    );
  }
  requireSigner(transaction, expectedAuthority, "native material authority");
  requireWritable(transaction, material, "native material PDA");
  return Object.freeze({ action: "seal-native-verifier-material", material });
};

const decodeRouteInitialize = (transaction, summary, role) => {
  const destination = role === "destination";
  const program = destination
    ? summary.programs.destination
    : summary.programs.source;
  const state = destination
    ? summary.accounts.destinationState
    : summary.accounts.sourceState;
  const peer = destination
    ? summary.programs.source
    : summary.programs.destination;
  const roleByte = destination ? 1 : 2;
  const candidates = topLevelForProgram(transaction, program).filter(
    (instruction) => instruction.accounts[1] === state,
  );
  const instruction = oneInstruction(
    candidates,
    `${role} route-state initialize`,
  );
  const data = instruction.data;
  if (
    !data ||
    data.length !== 167 ||
    data[0] !== 1 ||
    data[1] !== 1 ||
    data[2] !== roleByte ||
    data.readUInt32LE(3) !== REVISION ||
    new PublicKey(data.subarray(7, 39)).toBase58() !==
      summary.accounts.destinationState
  ) {
    throw new TypeError(
      `${role} route initialize data is not exact revision 1 PDA initialization.`,
    );
  }
  const initializer = instruction.accounts[0];
  const expectedAccounts = [
    initializer,
    state,
    summary.accounts.tokenMint,
    peer,
    summary.programs.nativeVerifier,
    summary.accounts.nativeVerifierMaterial,
    TOKEN_PROGRAM,
    SYSTEM_PROGRAM,
  ];
  if (!sameAccounts(instruction.accounts, expectedAccounts)) {
    throw new TypeError(
      `${role} route initialize accounts differ from the exact eight-account ABI.`,
    );
  }
  for (const [offset, expected, label] of [
    [39, summary.destinationBindingHash, "destination binding hash"],
    [71, summary.routeConfigurationHash, "route configuration hash"],
    [103, summary.verifierKeyHash, "verifier key hash"],
    [135, summary.nativeVerifierConfigHash, "verifier config hash"],
  ]) {
    exactHashAt(data, offset, expected, `${role} ${label}`);
  }
  requireSigner(transaction, initializer, `${role} route initializer`);
  requireWritable(transaction, initializer, `${role} route initializer`);
  requireWritable(transaction, state, `${role} route-state PDA`);
  return Object.freeze({
    action: "initialize-route-state-pda",
    role,
    initializer,
    state,
  });
};

const rpcRequest = async (fetchImpl, timeoutMs, method, params, label) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(SOLANA_TESTNET_RPC_URL, {
      method: "POST",
      redirect: "error",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response?.ok) {
    throw new TypeError(`${label} finalized RPC read failed.`);
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new TypeError(`${label} finalized RPC response is not JSON.`);
  }
  if (payload?.error || payload?.result === undefined) {
    throw new TypeError(`${label} finalized RPC returned an error.`);
  }
  return payload.result;
};

const groupedTransactions = (normalized) => {
  const groups = new Map();
  for (const { role, entry } of transactionEntries(normalized)) {
    const existing = groups.get(entry.transactionSignature);
    if (existing) {
      if (existing.finalizedSlot !== entry.finalizedSlot) {
        throw new TypeError(
          "One Solana signature is assigned conflicting finalized slots.",
        );
      }
      existing.roles.push(role);
    } else {
      groups.set(entry.transactionSignature, {
        signature: entry.transactionSignature,
        finalizedSlot: entry.finalizedSlot,
        roles: [role],
      });
    }
  }
  return [...groups.values()];
};

/** Validate the compact, non-secret result emitted by the live RPC decoder. */
export const validateSolanaOrderedInitializationRpcVerification = (
  normalized,
  summary,
  value,
) => {
  checkSolanaOrderedInitializationAgainstRegistry(normalized, summary);
  const verification = exactKeys(
    value,
    ["ready", "transactions", "programdataReadback", "verifyingKey"],
    "Solana ordered-initialization RPC verification",
  );
  if (containsSecretField(verification) || verification.ready !== true) {
    throw new TypeError(
      "Solana ordered-initialization RPC verification is not ready or is secret-bearing.",
    );
  }
  const expectedTransactions = groupedTransactions(normalized);
  if (
    !Array.isArray(verification.transactions) ||
    verification.transactions.length !== expectedTransactions.length
  ) {
    throw new TypeError(
      "Solana ordered-initialization RPC verification has the wrong unique transaction count.",
    );
  }
  for (const [index, expected] of expectedTransactions.entries()) {
    const actual = exactKeys(
      verification.transactions[index],
      ["roles", "signature", "finalizedSlot"],
      `Solana ordered transaction ${index}`,
    );
    if (
      JSON.stringify(actual.roles) !== JSON.stringify(expected.roles) ||
      actual.signature !== expected.signature ||
      actual.finalizedSlot !== expected.finalizedSlot
    ) {
      throw new TypeError(
        "Solana ordered-initialization RPC transaction identity is stale or reordered.",
      );
    }
  }
  const readbacks = exactKeys(
    verification.programdataReadback,
    PROGRAM_ROLES,
    "Solana immutable ProgramData readbacks",
  );
  for (const [role, summaryRole] of [
    ["destination", "destination"],
    ["source", "source"],
    ["native_verifier", "nativeVerifier"],
  ]) {
    const readback = exactKeys(
      readbacks[role],
      [
        "role",
        "programdataSlot",
        "upgradeAuthority",
        "artifactSha256",
        "executableCodeHash",
        "executableLength",
        "sbpfVersion",
      ],
      `${role} immutable ProgramData readback`,
    );
    const finalizationRole =
      role === "native_verifier" ? "native_verifier" : role;
    if (
      readback.role !== role ||
      readback.programdataSlot !== summary.programDataSlots[summaryRole] ||
      readback.upgradeAuthority !== null ||
      readback.artifactSha256 !==
        normalized.programFinalizations[finalizationRole].artifactSha256 ||
      readback.executableCodeHash !== summary.codeHashes[summaryRole] ||
      readback.sbpfVersion !== SBPF_V3 ||
      !Number.isSafeInteger(readback.executableLength) ||
      readback.executableLength < SBPF_E_FLAGS_OFFSET + 4
    ) {
      throw new TypeError(
        `${role} immutable ProgramData readback differs from typed governance.`,
      );
    }
  }
  const key = exactKeys(
    verification.verifyingKey,
    ["length", "sha256", "keccak256"],
    "Reconstructed Solana verifying key",
  );
  if (
    key.length !== MATERIAL_VERIFYING_KEY_LEN ||
    !HASH32.test(key.sha256) ||
    /^0x0{64}$/u.test(key.sha256) ||
    key.keccak256 !== summary.verifierKeyHash
  ) {
    throw new TypeError(
      "Reconstructed Solana verifying-key RPC evidence differs from typed governance.",
    );
  }
  return verification;
};

const parseImmutableProgramdataReadback = (
  value,
  role,
  expectedSlot,
  expectedArtifactSha256,
  expectedCodeHash,
) => {
  if (
    !isRecord(value) ||
    value.owner !== BPF_UPGRADEABLE_LOADER ||
    value.executable !== false ||
    !Array.isArray(value.data) ||
    value.data[1] !== "base64"
  ) {
    throw new TypeError(`${role} ProgramData readback is not loader-owned.`);
  }
  let data;
  try {
    data = Buffer.from(value.data[0], "base64");
  } catch {
    throw new TypeError(`${role} ProgramData readback is not Base64.`);
  }
  if (
    data.length < PROGRAMDATA_METADATA_LEN + SBPF_E_FLAGS_OFFSET + 4 ||
    data.readUInt32LE(0) !== 3 ||
    data.readBigUInt64LE(4) !== BigInt(expectedSlot) ||
    data[12] !== 0 ||
    !data.subarray(45, 49).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  ) {
    throw new TypeError(
      `${role} ProgramData readback is not immutable Loader-v3 state.`,
    );
  }
  const executable = data.subarray(PROGRAMDATA_METADATA_LEN);
  if (executable.readUInt32LE(SBPF_E_FLAGS_OFFSET) !== SBPF_V3_E_FLAGS) {
    throw new TypeError(
      `${role} ProgramData executable must be exact SBPF V3.`,
    );
  }
  const artifactSha256 = `0x${createHash("sha256")
    .update(executable)
    .digest("hex")}`;
  const executableCodeHash = hashHex(blake2b(executable, { dkLen: 32 }));
  if (
    artifactSha256 !== expectedArtifactSha256 ||
    executableCodeHash !== expectedCodeHash
  ) {
    throw new TypeError(
      `${role} ProgramData executable differs from reviewed artifact and typed governance.`,
    );
  }
  return Object.freeze({
    role,
    programdataSlot: expectedSlot,
    upgradeAuthority: null,
    artifactSha256,
    executableCodeHash,
    executableLength: executable.length,
    sbpfVersion: SBPF_V3,
  });
};

const verifyImmutableProgramdataReadbacks = async (
  fetchImpl,
  timeoutMs,
  normalized,
  summary,
) => {
  const roles = [
    ["destination", "destination", "destinationProgramData"],
    ["source", "source", "sourceProgramData"],
    ["native_verifier", "nativeVerifier", "nativeVerifierProgramData"],
  ];
  const addresses = roles.map(
    ([, summaryRole, accountRole]) =>
      summary.accounts?.[accountRole] ??
      normalized.programFinalizations[
        summaryRole === "nativeVerifier" ? "native_verifier" : summaryRole
      ].programdataAddress,
  );
  const result = await rpcRequest(
    fetchImpl,
    timeoutMs,
    "getMultipleAccounts",
    [addresses, { commitment: "finalized", encoding: "base64" }],
    "immutable ProgramData",
  );
  if (
    !Array.isArray(result?.value) ||
    result.value.length !== roles.length ||
    !Number.isSafeInteger(result?.context?.slot) ||
    result.context.slot <
      normalized.initializationTransactions.source_route_initialize
        .finalizedSlot
  ) {
    throw new TypeError(
      "Immutable ProgramData readback is missing a fresh finalized context.",
    );
  }
  return Object.freeze(
    Object.fromEntries(
      roles.map(([role, summaryRole], index) => [
        role,
        parseImmutableProgramdataReadback(
          result.value[index],
          role,
          summary.programDataSlots[summaryRole],
          normalized.programFinalizations[
            role === "native_verifier" ? "native_verifier" : role
          ].artifactSha256,
          summary.codeHashes[summaryRole],
        ),
      ]),
    ),
  );
};

/**
 * Revalidate every persisted signature at finalized commitment and decode the
 * exact action executed by that signature. Merely mentioning an account in a
 * successful transaction is deliberately insufficient production evidence.
 */
export const verifySolanaOrderedInitializationTransactions = async (
  normalized,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = 20_000,
    registrySummary = null,
  } = {},
) => {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("A fetch implementation is required for Solana RPC.");
  }
  checkSolanaOrderedInitializationAgainstRegistry(normalized, registrySummary);
  const groups = groupedTransactions(normalized);
  const results = await Promise.all(
    groups.map((group) =>
      rpcRequest(
        fetchImpl,
        timeoutMs,
        "getTransaction",
        [
          group.signature,
          {
            commitment: "finalized",
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
          },
        ],
        group.roles.join(", "),
      ),
    ),
  );
  const transactions = new Map(
    groups.map((group, index) => [
      group.signature,
      normalizeRpcTransaction(
        results[index],
        group.signature,
        group.finalizedSlot,
      ),
    ]),
  );

  decodeAtomicLoaderFinalization(
    transactions.get(
      normalized.programFinalizations.destination.transactionSignature,
    ),
    normalized,
  );

  const init = normalized.initializationTransactions;
  const bootstrap = transactions.get(
    init.native_verifier_material_initialize.transactionSignature,
  );
  const mintCreate = decodeMintCreate(
    bootstrap,
    registrySummary.accounts.tokenMint,
  );
  decodeMintInitialize(bootstrap, registrySummary);
  const materialInitialize = decodeMaterialInitialize(
    bootstrap,
    registrySummary,
    mintCreate.payer,
  );

  const chunks = [];
  let nextOffset = 0;
  for (const entry of init.native_verifier_material_appends) {
    const append = decodeMaterialAppend(
      transactions.get(entry.transactionSignature),
      registrySummary,
      materialInitialize.authority,
    );
    if (append.offset !== nextOffset) {
      throw new TypeError(
        "Native verifier key append offsets are not contiguous from zero.",
      );
    }
    chunks.push(append.chunk);
    nextOffset += append.chunk.length;
  }
  if (nextOffset !== MATERIAL_VERIFYING_KEY_LEN) {
    throw new TypeError(
      "Native verifier key appends do not reconstruct exactly 1216 bytes.",
    );
  }
  const verifyingKey = Buffer.concat(chunks);
  const verifyingKeySha256 = `0x${createHash("sha256")
    .update(verifyingKey)
    .digest("hex")}`;
  const verifyingKeyKeccak = hashHex(keccak_256(verifyingKey));
  if (
    verifyingKeySha256 !== materialInitialize.verifierKeySha256 ||
    verifyingKeyKeccak !== materialInitialize.verifierKeyKeccak ||
    verifyingKeyKeccak !== registrySummary.verifierKeyHash
  ) {
    throw new TypeError(
      "Reconstructed verifier key bytes do not match initialize or typed-registry hashes.",
    );
  }
  decodeMaterialSeal(
    transactions.get(init.native_verifier_material_seal.transactionSignature),
    registrySummary,
    materialInitialize.authority,
  );
  decodeRouteInitialize(
    transactions.get(init.destination_route_initialize.transactionSignature),
    registrySummary,
    "destination",
  );
  decodeRouteInitialize(
    transactions.get(init.source_route_initialize.transactionSignature),
    registrySummary,
    "source",
  );

  const programdataReadback = await verifyImmutableProgramdataReadbacks(
    fetchImpl,
    timeoutMs,
    normalized,
    registrySummary,
  );
  const rows = groups.map((group) =>
    Object.freeze({
      roles: Object.freeze([...group.roles]),
      signature: group.signature,
      finalizedSlot: group.finalizedSlot,
    }),
  );
  const verification = Object.freeze({
    ready: true,
    transactions: Object.freeze(rows),
    programdataReadback,
    verifyingKey: Object.freeze({
      length: verifyingKey.length,
      sha256: verifyingKeySha256,
      keccak256: verifyingKeyKeccak,
    }),
  });
  validateSolanaOrderedInitializationRpcVerification(
    normalized,
    registrySummary,
    verification,
  );
  return verification;
};
