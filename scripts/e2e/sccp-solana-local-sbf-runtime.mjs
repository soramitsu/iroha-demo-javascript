#!/usr/bin/env node
/* global AggregateError, BigInt */

import { spawn } from "node:child_process";
import { createHash, randomInt } from "node:crypto";
import { createSocket } from "node:dgram";
import {
  lstat,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  unlink,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  SCCP_CODEC_CANONICAL_TEXT,
  SCCP_CODEC_SOLANA_PUBKEY32,
  SCCP_DOMAIN_SOLANA,
  SCCP_DOMAIN_SORA,
  canonicalSccpMessagePublicInputsBytes,
  canonicalSccpPayloadBytes,
  sccpMessageId,
  sccpPayloadHash,
} from "@iroha/iroha-js/sccp";
import { bn254 } from "@noble/curves/bn254";
import { blake2b } from "@noble/hashes/blake2b";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  SOLANA_EXACT_SCCP_ROLE_DESTINATION,
  SOLANA_EXACT_SCCP_ROLE_SOURCE,
  buildExactSolanaClassicMintCreationPlan,
  buildExactSolanaDestinationFinalizeInstruction,
  buildExactSolanaNativeMaterialUploadPlan,
  buildExactSolanaRouteStateInitializeInstruction,
  buildExactSolanaSourceBurnInstruction,
  deriveExactSolanaRouteStateAddress,
  inspectExactSolanaClassicMintAccount,
  inspectExactSolanaNativeMaterialAccount,
  inspectExactSolanaRouteStateAccount,
  zeroizeRuntimeSolanaSigner,
} from "../sccp-solana-deploy.mjs";
import {
  SOLANA_UPGRADEABLE_LOADER_ID,
  parseUpgradeableProgramAccountData,
} from "./sccp-solana-route-preflight.mjs";

const modulePath = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(modulePath), "../..");
const SBPF_E_FLAGS_OFFSET = 48;
const SBPF_V3_E_FLAGS = 3;
const SBPF_V3 = "V3";
const bridgeArtifact = path.join(
  repoRoot,
  "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
);
const sourceArtifact = path.join(
  repoRoot,
  "output/sccp-solana-program-artifacts/source/sccp_taira_xor_source.so",
);
const nativeArtifact = path.join(
  repoRoot,
  "output/sccp-solana-program-artifacts/native-verifier/sccp_native_recursive_verifier.so",
);

export const SOLANA_LOCAL_SBF_RUNTIME_USAGE = `Usage:
  node scripts/e2e/sccp-solana-local-sbf-runtime.mjs

Runs the exact local-only Solana SBF runtime harness. This command accepts no
runtime options and never proves a public testnet deployment.

Options:
  --help, -h  Show this help without reading artifacts or starting a validator
`;

export const parseSolanaLocalSbfRuntimeArgs = (argv) => {
  if (!Array.isArray(argv) || argv.some((value) => typeof value !== "string")) {
    throw new TypeError("Local SBF runtime arguments must be strings.");
  }
  if (argv.length === 0) return Object.freeze({ help: false });
  if (argv.length === 1 && (argv[0] === "--help" || argv[0] === "-h")) {
    return Object.freeze({ help: true });
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    throw new TypeError("--help and -h must be used alone.");
  }
  throw new TypeError("Local SBF runtime does not accept arguments.");
};

const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const UPGRADEABLE_LOADER_ID = new PublicKey(SOLANA_UPGRADEABLE_LOADER_ID);
const DESTINATION_LANE = Object.freeze({
  source: Object.freeze({ network: "sora_taira", profile: null }),
  target: Object.freeze({ network: "solana_testnet", profile: null }),
});
const ROUTE_ID = "taira_sol_xor";
const ASSET_KEY = "xor";
const ROUTE_REVISION = 1;
const SETTLEMENT_AMOUNT = 42n;
const BURN_AMOUNT = 17n;
const DESTINATION_NONCE = 7n;
const SOURCE_NONCE = 11n;
const MAX_COMPUTE_UNITS = 800_000;
const TOKEN_ACCOUNT_SPACE = 165;
const PROOF_CHUNK_BYTES = 512;
const PUBLIC_INPUT_BYTES = 141;
const GROTH16_PROOF_BYTES = 384;
const VERIFYING_KEY_BYTES = 1_216;
const PUBLIC_SIGNAL_SCHEMA_HASH = Buffer.from(
  "7567439f41173d6745a3d51923cb70371acc7d66f23cefb4100d6d5d7a432cbb",
  "hex",
);
const SIGNAL_LABELS = Object.freeze([
  "sccp:groth16-bn254:signal:message-id:v1",
  "sccp:groth16-bn254:signal:payload-hash:v1",
  "sccp:groth16-bn254:signal:target-domain:v1",
  "sccp:groth16-bn254:signal:commitment-root:v1",
  "sccp:groth16-bn254:signal:finality-height:v1",
  "sccp:groth16-bn254:signal:finality-block-hash:v1",
  "sccp:groth16-bn254:signal:source-domain:v1",
  "sccp:groth16-bn254:signal:statement-hash:v1",
  "sccp:groth16-bn254:signal:destination-binding-hash:v1",
  "sccp:groth16-bn254:signal:route-configuration-hash:v1",
  "sccp:groth16-bn254:signal:sora-finality-anchor-hash:v1",
]);
const G2_GENERATOR = Buffer.from(
  [
    "1800deef121f1e76426a00665e5c4479674322d4f75edadd46debd5cd992f6ed",
    "198e9393920d483a7260bfb731fb5d25f1aa493335a9e71297e485b7aef312c2",
    "12c85ea5db8c6deb4aab71808dcb408fe3d1e7690c43d37b4ce6cc0166fa7daa",
    "090689d0585ff075ec9e99ad690c3395bc4b313370b38ef355acdadcd122975b",
  ].join(""),
  "hex",
);
const SECRET_FILE_PATTERN =
  /(?:^|[-_.])(?:keypair|private[-_.]?key|secret|mnemonic|seed)(?:[-_.]|$)/iu;
const PROGRAMDATA_METADATA_BYTES = 45;
const VALIDATOR_STARTUP_TIMEOUT_MS = 120_000;
const VALIDATOR_STARTUP_POLL_MS = 250;
const VALIDATOR_HEALTH_PROBE_TIMEOUT_MS = 5_000;
const VALIDATOR_START_ATTEMPTS = 4;
const VALIDATOR_PORT_RESERVATION_ATTEMPTS = 32;
const VALIDATOR_PORT_BASE_MIN = 18_000;
const VALIDATOR_PORT_BASE_MAX = 42_000;
const VALIDATOR_DYNAMIC_PORT_OFFSET = 20;
const VALIDATOR_DYNAMIC_PORT_COUNT = 101;
const VALIDATOR_LOG_LIMIT_BYTES = 64 * 1024;

const sha256 = (value) => createHash("sha256").update(value).digest();
const hex = (value) => `0x${Buffer.from(value).toString("hex")}`;
const u16le = (value) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};
const u64le = (value) => {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
};
const wordBe = (value, size = 32) => {
  const out = Buffer.alloc(size);
  let remaining = BigInt(value);
  for (let index = size - 1; index >= 0; index -= 1) {
    out[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  if (remaining !== 0n) throw new Error("Integer exceeds canonical word.");
  return out;
};
const deterministicHash = (label) => sha256(Buffer.from(label, "utf8"));
const deterministicPublicKey = (label) =>
  new PublicKey(deterministicHash(`sccp-local-sbf-program:${label}:v1`));

const assertRegularArtifact = async (artifact, label) => {
  const canonical = await realpath(artifact);
  const stats = await lstat(canonical);
  if (
    !stats.isFile() ||
    stats.isSymbolicLink() ||
    stats.size < SBPF_E_FLAGS_OFFSET + 4
  ) {
    throw new Error(`${label} must be a regular SBF artifact.`);
  }
  const bytes = await readFile(canonical);
  if (!bytes.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
    throw new Error(`${label} is not an ELF artifact.`);
  }
  if (bytes.readUInt32LE(SBPF_E_FLAGS_OFFSET) !== SBPF_V3_E_FLAGS) {
    throw new Error(`${label} must be exact SBPF V3.`);
  }
  return {
    path: canonical,
    sha256: sha256(bytes).toString("hex"),
    blake2b256: Buffer.from(blake2b(bytes, { dkLen: 32 })).toString("hex"),
    bytes: bytes.length,
    sbpfVersion: SBPF_V3,
  };
};

export const assertDistinctSolanaLocalSbfRoleArtifacts = ({
  destination,
  source,
  nativeVerifier,
}) => {
  const roles = [destination, source, nativeVerifier];
  if (new Set(roles.map(({ sha256: value }) => value)).size !== roles.length) {
    throw new Error(
      "Destination, source, and native verifier SBF artifacts must have distinct SHA-256 hashes.",
    );
  }
  if (
    new Set(roles.map(({ blake2b256: value }) => value)).size !== roles.length
  ) {
    throw new Error(
      "Destination, source, and native verifier SBF programs must have distinct BLAKE2b-256 code hashes.",
    );
  }
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

const simulateRejectedAtomicBootstrap = async ({
  connection,
  payer,
  mint,
  mintPlan,
  materialPlan,
  mutate,
  label,
}) => {
  const instructions = [
    ...mintPlan.instructions.map(descriptorInstruction),
    descriptorInstruction(materialPlan.instructions.initialize),
  ];
  mutate(instructions);
  const result = await simulate({
    connection,
    payer,
    instructions,
    signers: [payer, mint],
  });
  const [mintReadback, materialReadback] = await Promise.all([
    connection.getAccountInfo(mint.publicKey, "confirmed"),
    connection.getAccountInfo(
      new PublicKey(materialPlan.nativeVerifierMaterialAddress),
      "confirmed",
    ),
  ]);
  if (
    result.err === null ||
    mintReadback !== null ||
    materialReadback !== null
  ) {
    throw new Error(
      `${label} did not fail atomically before mint/material account creation.`,
    );
  }
  return Object.freeze({
    rejected: true,
    mintCreated: false,
    materialCreated: false,
    unitsConsumed: result.unitsConsumed ?? null,
  });
};

const inspectImmutableGenesisProgramdata = (data, expectedArtifact) => {
  const bytes = Buffer.from(data);
  const canonicalNone =
    bytes[12] === 0 &&
    bytes
      .subarray(PROGRAMDATA_METADATA_BYTES, PROGRAMDATA_METADATA_BYTES + 4)
      .equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]));
  if (
    bytes.length < PROGRAMDATA_METADATA_BYTES + SBPF_E_FLAGS_OFFSET + 4 ||
    bytes.readUInt32LE(0) !== 3 ||
    !canonicalNone
  ) {
    throw new Error(
      `Genesis ProgramData is not immutable authority-free SBF code (length ${bytes.length}, prefix ${bytes.subarray(0, 64).toString("hex")}).`,
    );
  }
  const executable = bytes.subarray(PROGRAMDATA_METADATA_BYTES);
  if (executable.readUInt32LE(SBPF_E_FLAGS_OFFSET) !== SBPF_V3_E_FLAGS) {
    throw new Error("Genesis ProgramData executable must be exact SBPF V3.");
  }
  const executableSha256 = sha256(executable).toString("hex");
  const executableBlake2b256 = Buffer.from(
    blake2b(executable, { dkLen: 32 }),
  ).toString("hex");
  if (
    !expectedArtifact ||
    executable.length !== expectedArtifact.bytes ||
    executableSha256 !== expectedArtifact.sha256 ||
    executableBlake2b256 !== expectedArtifact.blake2b256
  ) {
    throw new Error(
      "Genesis ProgramData executable does not exactly match the reviewed local SBF artifact length, SHA-256, and BLAKE2b-256.",
    );
  }
  return {
    slot: bytes.readBigUInt64LE(4).toString(),
    executableLength: executable.length,
    executableSha256: `0x${executableSha256}`,
    executableBlake2b256: `0x${executableBlake2b256}`,
    authorityEncoding: "none",
    sbpfVersion: SBPF_V3,
  };
};

const inspectMutableGenesisProgramdata = (
  data,
  expectedAuthority,
  expectedArtifact,
) => {
  const bytes = Buffer.from(data);
  if (
    bytes.length < PROGRAMDATA_METADATA_BYTES + SBPF_E_FLAGS_OFFSET + 4 ||
    bytes.readUInt32LE(0) !== 3 ||
    bytes[12] !== 1 ||
    !bytes
      .subarray(13, PROGRAMDATA_METADATA_BYTES)
      .equals(expectedAuthority.toBuffer()) ||
    !bytes
      .subarray(PROGRAMDATA_METADATA_BYTES, PROGRAMDATA_METADATA_BYTES + 4)
      .equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))
  ) {
    throw new Error(
      "Genesis ProgramData did not start under the exact in-memory finalization authority.",
    );
  }
  const executable = bytes.subarray(PROGRAMDATA_METADATA_BYTES);
  if (executable.readUInt32LE(SBPF_E_FLAGS_OFFSET) !== SBPF_V3_E_FLAGS) {
    throw new Error(
      "Mutable genesis ProgramData executable must be exact SBPF V3.",
    );
  }
  if (
    executable.length !== expectedArtifact.bytes ||
    sha256(executable).toString("hex") !== expectedArtifact.sha256 ||
    Buffer.from(blake2b(executable, { dkLen: 32 })).toString("hex") !==
      expectedArtifact.blake2b256
  ) {
    throw new Error(
      "Mutable genesis ProgramData executable differs from the reviewed artifact.",
    );
  }
};

const setLoaderV3AuthorityNoneInstruction = ({
  programdataAddress,
  currentAuthority,
}) =>
  new TransactionInstruction({
    programId: UPGRADEABLE_LOADER_ID,
    keys: [
      { pubkey: programdataAddress, isSigner: false, isWritable: true },
      { pubkey: currentAuthority, isSigner: true, isWritable: false },
    ],
    data: Buffer.from([4, 0, 0, 0]),
  });

const compileTransaction = ({ payer, instructions, signers, blockhash }) => {
  const message = new TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToLegacyMessage();
  const transaction = new VersionedTransaction(message);
  transaction.sign(signers);
  return transaction;
};

const readTransaction = async (connection, signature) => {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Transaction ${signature} was not readable after confirmation.`,
  );
};

const waitForSignature = async (connection, signature, label) => {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const response = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = response.value[0];
    if (status?.err) {
      throw new Error(`${label} failed: ${JSON.stringify(status.err)}`);
    }
    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return status;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label} did not reach confirmed commitment.`);
};

const submit = async ({ connection, payer, instructions, signers, label }) => {
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = compileTransaction({
    payer,
    instructions,
    signers,
    blockhash: latest.blockhash,
  });
  const signature = await connection.sendTransaction(transaction, {
    skipPreflight: false,
    maxRetries: 5,
    preflightCommitment: "confirmed",
  });
  await waitForSignature(connection, signature, label);
  const readback = await readTransaction(connection, signature);
  if (readback.meta?.err) {
    throw new Error(`${label} failed: ${JSON.stringify(readback.meta.err)}`);
  }
  return {
    signature,
    slot: readback.slot,
    unitsConsumed: readback.meta?.computeUnitsConsumed ?? null,
    logs: readback.meta?.logMessages ?? [],
  };
};

const simulate = async ({ connection, payer, instructions, signers }) => {
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = compileTransaction({
    payer,
    instructions,
    signers,
    blockhash: latest.blockhash,
  });
  const result = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    sigVerify: true,
    replaceRecentBlockhash: false,
    innerInstructions: true,
  });
  return result.value;
};

const assertForbiddenRoleOpcode = async ({
  connection,
  payer,
  programId,
  forbiddenOpcode,
  label,
}) => {
  const simulation = await simulate({
    connection,
    payer,
    instructions: [
      new TransactionInstruction({
        programId,
        keys: [],
        data: Buffer.from([1, forbiddenOpcode]),
      }),
    ],
    signers: [payer],
  });
  const marker = "SCCP opcode is disabled for this immutable program role";
  if (
    simulation.err === null ||
    !(simulation.logs ?? []).some((line) => line.includes(marker))
  ) {
    throw new Error(`${label} did not enforce its compiled SBF role gate.`);
  }
  return {
    rejected: true,
    forbiddenOpcode,
    unitsConsumed: simulation.unitsConsumed ?? null,
    logMarker: marker,
  };
};

const listFiles = async (root) => {
  const files = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else files.push(candidate);
    }
  };
  await visit(root);
  return files;
};

const removeValidatorBootstrapKeypairs = async (ledger) => {
  const files = await listFiles(ledger);
  const bootstrap = files.filter((file) =>
    path.basename(file).endsWith("-keypair.json"),
  );
  await Promise.all(bootstrap.map((file) => unlink(file)));
  const remaining = (await listFiles(ledger)).filter((file) =>
    SECRET_FILE_PATTERN.test(path.basename(file)),
  );
  if (remaining.length !== 0) {
    throw new Error("Temporary validator ledger retained secret-like files.");
  }
  return bootstrap.length;
};

const boundedCollector = (limit = VALIDATOR_LOG_LIMIT_BYTES) => {
  let value = Buffer.alloc(0);
  return {
    append(chunk) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(String(chunk), "utf8");
      value = Buffer.concat([value, bytes]);
      if (value.length > limit) value = value.subarray(value.length - limit);
    },
    read: () => value.toString("utf8"),
  };
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const withTimeout = (promise, milliseconds, message) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), milliseconds);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });

const closeTcpReservation = (server) =>
  new Promise((resolve) => server.close(() => resolve()));

const closeUdpReservation = (socket) =>
  new Promise((resolve) => socket.close(() => resolve()));

const reserveTcpPort = (port, host = "127.0.0.1") =>
  new Promise((resolve, reject) => {
    const server = createServer();
    const onError = (error) => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = () => {
      server.removeListener("error", onError);
      resolve({ close: () => closeTcpReservation(server) });
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen({ host, port, exclusive: true });
  });

const reserveUdpPort = (port, host = "127.0.0.1") =>
  new Promise((resolve, reject) => {
    const socket = createSocket("udp4");
    const onError = (error) => {
      socket.removeListener("listening", onListening);
      try {
        socket.close();
      } catch {
        // A failed bind can leave the datagram socket unopened.
      }
      reject(error);
    };
    const onListening = () => {
      socket.removeListener("error", onError);
      resolve({ close: () => closeUdpReservation(socket) });
    };
    socket.once("error", onError);
    socket.once("listening", onListening);
    socket.bind({ address: host, port, exclusive: true });
  });

export const buildSolanaLocalValidatorPortPlan = (base) => {
  if (
    !Number.isSafeInteger(base) ||
    base < 1_024 ||
    base + VALIDATOR_DYNAMIC_PORT_OFFSET + VALIDATOR_DYNAMIC_PORT_COUNT - 1 >
      65_535
  ) {
    throw new TypeError("Solana local validator port base is out of range.");
  }
  const dynamicStart = base + VALIDATOR_DYNAMIC_PORT_OFFSET;
  const dynamicEnd = dynamicStart + VALIDATOR_DYNAMIC_PORT_COUNT - 1;
  return Object.freeze({
    rpcPort: base,
    rpcWebsocketPort: base + 1,
    faucetPort: base + 2,
    dynamicStart,
    dynamicEnd,
  });
};

const validatorPortPlanPorts = (plan) => {
  const ports = [plan.rpcPort, plan.rpcWebsocketPort, plan.faucetPort];
  for (let port = plan.dynamicStart; port <= plan.dynamicEnd; port += 1) {
    ports.push(port);
  }
  return ports;
};

const releaseReservations = async (reservations) => {
  const failures = [];
  for (const reservation of [...reservations].reverse()) {
    try {
      await reservation.close();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      "Failed to release Solana local validator port reservations.",
    );
  }
};

export const reserveSolanaLocalValidatorPortPlan = async (
  plan,
  { reserveTcp = reserveTcpPort, reserveUdp = reserveUdpPort } = {},
) => {
  const reservations = [];
  try {
    for (const port of validatorPortPlanPorts(plan)) {
      reservations.push(await reserveTcp(port));
      reservations.push(await reserveUdp(port));
    }
  } catch (error) {
    await releaseReservations(reservations).catch(() => {});
    throw error;
  }
  let released = false;
  return Object.freeze({
    plan,
    release: async () => {
      if (released) return;
      released = true;
      await releaseReservations(reservations);
    },
  });
};

const isPortCollisionError = (error) =>
  error?.code === "EADDRINUSE" ||
  /(?:address|port).*(?:already in use|in use)|failed to bind|addrinuse|eaddrinuse|os error (?:48|98)/iu.test(
    error instanceof Error ? error.message : String(error ?? ""),
  );

export const selectSolanaLocalValidatorPortReservation = async ({
  attempts = VALIDATOR_PORT_RESERVATION_ATTEMPTS,
  candidateBase = () =>
    randomInt(VALIDATOR_PORT_BASE_MIN, VALIDATOR_PORT_BASE_MAX + 1),
  reservePlan = reserveSolanaLocalValidatorPortPlan,
} = {}) => {
  if (!Number.isSafeInteger(attempts) || attempts <= 0) {
    throw new TypeError(
      "Validator port reservation attempts must be positive.",
    );
  }
  const tried = new Set();
  let lastCollision = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const base = candidateBase(attempt);
    const plan = buildSolanaLocalValidatorPortPlan(base);
    if (tried.has(base)) continue;
    tried.add(base);
    try {
      return await reservePlan(plan);
    } catch (error) {
      if (!isPortCollisionError(error)) throw error;
      lastCollision = error;
    }
  }
  const detail =
    lastCollision instanceof Error
      ? lastCollision.message
      : "unknown collision";
  throw new Error(
    `Could not reserve a collision-free Solana validator port range after ${tried.size} distinct attempts: ${detail}`,
    { cause: lastCollision },
  );
};

const validatorArgs = ({
  ledger,
  portPlan,
  destinationProgramId,
  sourceProgramId,
  nativeVerifierProgramId,
  destinationPath,
  sourcePath,
  nativePath,
  upgradeAuthorityAddress,
}) => [
  "--ledger",
  ledger,
  "--reset",
  "--log",
  "--rpc-port",
  String(portPlan.rpcPort),
  "--faucet-port",
  String(portPlan.faucetPort),
  "--dynamic-port-range",
  `${portPlan.dynamicStart}-${portPlan.dynamicEnd}`,
  "--compute-unit-limit",
  "1400000",
  "--ticks-per-slot",
  "8",
  "--upgradeable-program",
  destinationProgramId.toBase58(),
  destinationPath,
  upgradeAuthorityAddress,
  "--upgradeable-program",
  sourceProgramId.toBase58(),
  sourcePath,
  upgradeAuthorityAddress,
  "--upgradeable-program",
  nativeVerifierProgramId.toBase58(),
  nativePath,
  upgradeAuthorityAddress,
];

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error ?? "unknown error");

const validatorStartupDiagnostics = ({
  endpoint,
  portPlan,
  attempt,
  state,
  lastHealthError,
  stdout,
  stderr,
}) =>
  [
    `attempt=${attempt}`,
    `endpoint=${endpoint}`,
    `ports=rpc:${portPlan.rpcPort},rpc-websocket:${portPlan.rpcWebsocketPort},faucet:${portPlan.faucetPort},dynamic:${portPlan.dynamicStart}-${portPlan.dynamicEnd}`,
    `spawnError=${state.spawnError ? errorMessage(state.spawnError) : "none"}`,
    `exitCode=${state.exitCode ?? "none"}`,
    `signal=${state.signal ?? "none"}`,
    `lastHealthError=${lastHealthError ? errorMessage(lastHealthError) : "none"}`,
    `stdout(last ${VALIDATOR_LOG_LIMIT_BYTES} bytes):\n${stdout.read() || "<empty>"}`,
    `stderr(last ${VALIDATOR_LOG_LIMIT_BYTES} bytes):\n${stderr.read() || "<empty>"}`,
  ].join("\n");

const stopValidator = async (child) => {
  if (
    !child ||
    child.exitCode !== null ||
    child.signalCode !== null ||
    typeof child.kill !== "function"
  ) {
    return;
  }
  const waitForExit = () =>
    new Promise((resolve) => {
      const done = () => {
        child.removeListener("exit", done);
        child.removeListener("close", done);
        resolve();
      };
      child.once("exit", done);
      child.once("close", done);
    });
  const gracefulExit = waitForExit();
  child.kill("SIGTERM");
  await Promise.race([gracefulExit, sleep(3_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    const forcedExit = waitForExit();
    child.kill("SIGKILL");
    await Promise.race([forcedExit, sleep(3_000)]);
  }
};

export const startSolanaLocalValidator = async (
  options,
  {
    spawnImpl = spawn,
    connectionFactory = (endpoint) => new Connection(endpoint, "confirmed"),
    reservePortPlan = selectSolanaLocalValidatorPortReservation,
    startupTimeoutMs = VALIDATOR_STARTUP_TIMEOUT_MS,
    pollIntervalMs = VALIDATOR_STARTUP_POLL_MS,
    healthProbeTimeoutMs = VALIDATOR_HEALTH_PROBE_TIMEOUT_MS,
    startupAttempts = VALIDATOR_START_ATTEMPTS,
    sleepImpl = sleep,
    now = () => Date.now(),
  } = {},
) => {
  if (!Number.isSafeInteger(startupTimeoutMs) || startupTimeoutMs <= 0) {
    throw new TypeError("Validator startup timeout must be positive.");
  }
  if (!Number.isSafeInteger(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new TypeError("Validator startup poll interval must be positive.");
  }
  if (
    !Number.isSafeInteger(healthProbeTimeoutMs) ||
    healthProbeTimeoutMs <= 0
  ) {
    throw new TypeError("Validator health-probe timeout must be positive.");
  }
  if (!Number.isSafeInteger(startupAttempts) || startupAttempts <= 0) {
    throw new TypeError("Validator startup attempts must be positive.");
  }
  const deadline = now() + startupTimeoutMs;
  let lastFailure = null;
  for (let attempt = 1; attempt <= startupAttempts; attempt += 1) {
    if (now() >= deadline) break;
    const reservation = await reservePortPlan();
    const { plan: portPlan } = reservation;
    await reservation.release();

    const stdout = boundedCollector();
    const stderr = boundedCollector();
    const args = validatorArgs({ ...options, portPlan });
    const state = {
      spawnError: null,
      exited: false,
      exitCode: null,
      signal: null,
      closed: false,
      closePromise: null,
    };
    let child = null;
    try {
      child = spawnImpl("solana-test-validator", args, {
        cwd: repoRoot,
        env: { ...process.env, RUST_LOG: "warn" },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      state.spawnError = error;
    }
    if (child) {
      child.stdout?.on("data", (chunk) => stdout.append(chunk));
      child.stderr?.on("data", (chunk) => stderr.append(chunk));
      child.once("error", (error) => {
        state.spawnError = error;
      });
      child.once("exit", (code, signal) => {
        state.exited = true;
        state.exitCode = code;
        state.signal = signal;
      });
      state.closePromise = new Promise((resolve) => {
        child.once("close", () => {
          state.closed = true;
          resolve();
        });
      });
    }

    const endpoint = `http://127.0.0.1:${portPlan.rpcPort}`;
    let connection = null;
    let lastHealthError = null;
    try {
      connection = connectionFactory(endpoint);
    } catch (error) {
      lastHealthError = error;
    }
    while (
      !state.spawnError &&
      !state.exited &&
      connection &&
      now() < deadline
    ) {
      try {
        const remaining = deadline - now();
        await withTimeout(
          connection.getVersion(),
          Math.min(healthProbeTimeoutMs, remaining),
          "Validator RPC health probe timed out.",
        );
        return {
          child,
          connection,
          endpoint,
          stdout,
          stderr,
          portPlan,
          startupAttempt: attempt,
        };
      } catch (error) {
        lastHealthError = error;
      }
      const remaining = deadline - now();
      if (remaining <= 0) break;
      await sleepImpl(Math.min(pollIntervalMs, remaining));
    }

    if (state.exited && !state.closed && state.closePromise) {
      await Promise.race([state.closePromise, sleepImpl(250)]);
    }

    const diagnostics = validatorStartupDiagnostics({
      endpoint,
      portPlan,
      attempt,
      state,
      lastHealthError,
      stdout,
      stderr,
    });
    lastFailure = diagnostics;
    const reason = state.spawnError
      ? "failed to spawn"
      : state.exited
        ? "exited before becoming healthy"
        : "did not become healthy before the startup deadline";
    await stopValidator(child);
    const collision =
      isPortCollisionError(state.spawnError) ||
      isPortCollisionError(new Error(`${stdout.read()}\n${stderr.read()}`));
    if (collision && attempt < startupAttempts && now() < deadline) {
      await rm(options.ledger, { recursive: true, force: true });
      continue;
    }
    throw new Error(`solana-test-validator ${reason}.\n${diagnostics}`, {
      cause: state.spawnError ?? lastHealthError,
    });
  }
  throw new Error(
    `solana-test-validator did not become healthy before the ${startupTimeoutMs}ms startup deadline.${lastFailure ? `\n${lastFailure}` : ""}`,
  );
};

const g1Bytes = (point) => {
  const affine = point.toAffine();
  return Buffer.concat([wordBe(affine.x), wordBe(affine.y)]);
};

export const buildLocalTestVerifyingKey = () => {
  const g1 = g1Bytes(bn254.G1.Point.BASE);
  const chunks = [g1, G2_GENERATOR, G2_GENERATOR, G2_GENERATOR];
  for (let index = 0; index < 12; index += 1) chunks.push(g1);
  const verifyingKey = Buffer.concat(chunks);
  if (verifyingKey.length !== VERIFYING_KEY_BYTES) {
    throw new Error("Local test verifying key has a noncanonical length.");
  }
  return verifyingKey;
};

const scalarFromSignal = (label, value) => {
  const labelHash = keccak_256(Uint8Array.from(Buffer.from(label, "utf8")));
  const preimage = new Uint8Array(labelHash.length + value.length);
  preimage.set(labelHash, 0);
  preimage.set(value, labelHash.length);
  const digest = Buffer.from(keccak_256(preimage));
  return BigInt(`0x${digest.toString("hex")}`) % bn254.fields.Fr.ORDER;
};

const deriveSignals = ({
  publicInputs,
  statementHash,
  destinationBindingHash,
  routeConfigurationHash,
  soraAnchorHash,
}) => {
  if (publicInputs.length !== PUBLIC_INPUT_BYTES) {
    throw new Error("Local public inputs have a noncanonical length.");
  }
  const targetWord = wordBe(publicInputs.readUInt32LE(65));
  const heightWord = wordBe(publicInputs.readBigUInt64LE(101));
  const values = [
    publicInputs.subarray(1, 33),
    publicInputs.subarray(33, 65),
    targetWord,
    publicInputs.subarray(69, 101),
    heightWord,
    publicInputs.subarray(109, 141),
    Buffer.alloc(32),
    statementHash,
    destinationBindingHash,
    routeConfigurationHash,
    soraAnchorHash,
  ];
  return values.map((value, index) =>
    scalarFromSignal(SIGNAL_LABELS[index], value),
  );
};

export const buildCanonicalLocalDestinationTransfer = ({
  payerAddress,
  amount = SETTLEMENT_AMOUNT,
} = {}) => {
  const payer = new PublicKey(payerAddress);
  const transfer = {
    Transfer: {
      version: 1,
      source_domain: SCCP_DOMAIN_SORA,
      dest_domain: SCCP_DOMAIN_SOLANA,
      nonce: DESTINATION_NONCE.toString(),
      route_revision: ROUTE_REVISION,
      asset_home_domain: SCCP_DOMAIN_SORA,
      asset_id_codec: SCCP_CODEC_CANONICAL_TEXT,
      asset_id: hex(Buffer.from(ASSET_KEY, "utf8")),
      amount: BigInt(amount).toString(),
      sender_codec: SCCP_CODEC_CANONICAL_TEXT,
      sender: hex(Buffer.from("local-sbf-taira-sender", "utf8")),
      recipient_codec: SCCP_CODEC_SOLANA_PUBKEY32,
      recipient: hex(payer.toBuffer()),
      route_id_codec: SCCP_CODEC_CANONICAL_TEXT,
      route_id: hex(Buffer.from(ROUTE_ID, "utf8")),
    },
  };
  const payload = Buffer.from(canonicalSccpPayloadBytes(transfer));
  const messageId = sccpMessageId(DESTINATION_LANE, transfer);
  const payloadHash = sccpPayloadHash(payload);
  return {
    envelope: transfer,
    payload,
    messageId: Buffer.from(messageId.slice(2), "hex"),
    payloadHash: Buffer.from(payloadHash.slice(2), "hex"),
  };
};

export const buildLocalGroth16ProofFixture = ({
  payerAddress,
  destinationBindingHash,
  routeConfigurationHash,
  soraAnchorHash,
  amount = SETTLEMENT_AMOUNT,
} = {}) => {
  const transfer = buildCanonicalLocalDestinationTransfer({
    payerAddress,
    amount,
  });
  const commitmentRoot = Buffer.alloc(32, 3);
  const finalityBlockHash = Buffer.alloc(32, 4);
  const publicInputs = Buffer.from(
    canonicalSccpMessagePublicInputsBytes({
      version: 1,
      message_id: hex(transfer.messageId),
      payload_hash: hex(transfer.payloadHash),
      target_domain: SCCP_DOMAIN_SOLANA,
      commitment_root: hex(commitmentRoot),
      finality_height: "9",
      finality_block_hash: hex(finalityBlockHash),
    }),
  );
  const statementHash = sha256(
    Buffer.concat([
      Buffer.from("sccp:local-sbf:statement:v1", "utf8"),
      publicInputs,
      transfer.payload,
    ]),
  );
  const signals = deriveSignals({
    publicInputs,
    statementHash,
    destinationBindingHash,
    routeConfigurationHash,
    soraAnchorHash,
  });
  const aScalar =
    (3n + signals.reduce((total, signal) => total + signal, 0n)) %
    bn254.fields.Fr.ORDER;
  const a = g1Bytes(bn254.G1.Point.BASE.multiply(aScalar));
  const g1 = g1Bytes(bn254.G1.Point.BASE);
  const proof = Buffer.concat([
    wordBe(1),
    transfer.messageId,
    wordBe(SCCP_DOMAIN_SORA),
    commitmentRoot,
    a,
    G2_GENERATOR,
    g1,
  ]);
  if (proof.length !== GROTH16_PROOF_BYTES) {
    throw new Error("Local Groth16 proof has a noncanonical length.");
  }
  const body = Buffer.concat([
    publicInputs,
    statementHash,
    proof,
    u16le(transfer.payload.length),
    transfer.payload,
  ]);
  return {
    ...transfer,
    commitmentRoot,
    finalityBlockHash,
    publicInputs,
    statementHash,
    signals,
    proof,
    body,
    bodySha256: sha256(body),
  };
};

const buildProofInstructions = ({
  payer,
  destinationToken,
  nativeVerifierProgramId,
  materialAddress,
  fixture,
  amount,
}) => {
  const [proofAddress] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("sccp-proof-v1", "utf8"),
      materialAddress.toBuffer(),
      fixture.messageId,
      payer.publicKey.toBuffer(),
    ],
    nativeVerifierProgramId,
  );
  const initializeData = Buffer.concat([
    Buffer.from([1, 3]),
    u16le(fixture.body.length),
    fixture.bodySha256,
    fixture.messageId,
    fixture.payloadHash,
    fixture.statementHash,
    destinationToken.toBuffer(),
    u64le(amount),
  ]);
  const initialize = new TransactionInstruction({
    programId: nativeVerifierProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: true },
      { pubkey: proofAddress, isSigner: false, isWritable: true },
      { pubkey: materialAddress, isSigner: false, isWritable: false },
      { pubkey: destinationToken, isSigner: false, isWritable: false },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: initializeData,
  });
  const append = [];
  for (
    let offset = 0;
    offset < fixture.body.length;
    offset += PROOF_CHUNK_BYTES
  ) {
    const chunk = fixture.body.subarray(
      offset,
      Math.min(offset + PROOF_CHUNK_BYTES, fixture.body.length),
    );
    append.push(
      new TransactionInstruction({
        programId: nativeVerifierProgramId,
        keys: [
          { pubkey: payer.publicKey, isSigner: true, isWritable: false },
          { pubkey: proofAddress, isSigner: false, isWritable: true },
        ],
        data: Buffer.concat([
          Buffer.from([1, 4]),
          u16le(offset),
          u16le(chunk.length),
          chunk,
        ]),
      }),
    );
  }
  const seal = new TransactionInstruction({
    programId: nativeVerifierProgramId,
    keys: [
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: proofAddress, isSigner: false, isWritable: true },
      { pubkey: materialAddress, isSigner: false, isWritable: false },
      { pubkey: destinationToken, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1, 5]),
  });
  return { proofAddress, initialize, append, seal };
};

const createTokenAccountInstructions = async ({
  connection,
  payer,
  tokenAccount,
  mint,
}) => [
  SystemProgram.createAccount({
    fromPubkey: payer.publicKey,
    newAccountPubkey: tokenAccount.publicKey,
    lamports:
      await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE),
    space: TOKEN_ACCOUNT_SPACE,
    programId: TOKEN_PROGRAM_ID,
  }),
  new TransactionInstruction({
    programId: TOKEN_PROGRAM_ID,
    keys: [
      { pubkey: tokenAccount.publicKey, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
      { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
    ],
    data: Buffer.from([1]),
  }),
];

const accountOrThrow = async (connection, address, label) => {
  const account = await connection.getAccountInfo(address, "confirmed");
  if (!account) throw new Error(`${label} readback is missing.`);
  return account;
};

const clearKeypairs = (keypairs) => {
  for (const keypair of keypairs) {
    zeroizeRuntimeSolanaSigner(keypair);
  }
};

export const runSolanaLocalSbfRuntime = async () => {
  const [bridge, source, native] = await Promise.all([
    assertRegularArtifact(bridgeArtifact, "Destination bridge SBF artifact"),
    assertRegularArtifact(sourceArtifact, "Source bridge SBF artifact"),
    assertRegularArtifact(nativeArtifact, "Native verifier SBF artifact"),
  ]);
  assertDistinctSolanaLocalSbfRoleArtifacts({
    destination: bridge,
    source,
    nativeVerifier: native,
  });
  const destinationProgramId = deterministicPublicKey(
    `destination:${bridge.sha256}`,
  );
  const sourceProgramId = deterministicPublicKey(`source:${source.sha256}`);
  const nativeVerifierProgramId = deterministicPublicKey(
    `native:${native.sha256}`,
  );
  const programIds = [
    destinationProgramId,
    sourceProgramId,
    nativeVerifierProgramId,
  ];
  const programArtifacts = [bridge, source, native];
  if (new Set(programIds.map((key) => key.toBase58())).size !== 3) {
    throw new Error("Local SBF program roles collided.");
  }

  const scratch = await mkdtemp(path.join(tmpdir(), "sccp-solana-local-sbf-"));
  const ledger = path.join(scratch, "ledger");
  const payer = Keypair.generate();
  const mint = Keypair.generate();
  const programUpgradeAuthority = Keypair.generate();
  const destinationState = new PublicKey(
    deriveExactSolanaRouteStateAddress({
      routeProgramId: destinationProgramId,
      role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
      tokenMintAddress: mint.publicKey,
    }).address,
  );
  const sourceState = new PublicKey(
    deriveExactSolanaRouteStateAddress({
      routeProgramId: sourceProgramId,
      role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
      tokenMintAddress: mint.publicKey,
    }).address,
  );
  const destinationToken = Keypair.generate();
  const keypairs = [payer, mint, destinationToken, programUpgradeAuthority];
  let validator = null;
  let report = null;
  try {
    validator = await startSolanaLocalValidator({
      ledger,
      destinationProgramId,
      sourceProgramId,
      nativeVerifierProgramId,
      destinationPath: bridge.path,
      sourcePath: source.path,
      nativePath: native.path,
      upgradeAuthorityAddress: programUpgradeAuthority.publicKey.toBase58(),
    });
    const removedBootstrapKeypairFiles =
      await removeValidatorBootstrapKeypairs(ledger);
    const { connection } = validator;

    const executableAccounts = await Promise.all(
      programIds.map((programId) =>
        accountOrThrow(connection, programId, "SBF program"),
      ),
    );
    const programdataAddresses = [];
    for (const [index, account] of executableAccounts.entries()) {
      if (!account.executable || !account.owner.equals(UPGRADEABLE_LOADER_ID)) {
        throw new Error(
          `Genesis-loaded SBF program ${programIds[index].toBase58()} is not upgradeable-loader code (owner ${account.owner.toBase58()}, executable ${account.executable}).`,
        );
      }
      const parsedProgram = parseUpgradeableProgramAccountData(account.data);
      const programdataAddress = new PublicKey(
        parsedProgram.programdataAddress,
      );
      const programdata = await accountOrThrow(
        connection,
        programdataAddress,
        "SBF ProgramData",
      );
      if (
        programdata.executable ||
        !programdata.owner.equals(UPGRADEABLE_LOADER_ID)
      ) {
        throw new Error("Genesis-loaded ProgramData owner/state is invalid.");
      }
      inspectMutableGenesisProgramdata(
        programdata.data,
        programUpgradeAuthority.publicKey,
        programArtifacts[index],
      );
      programdataAddresses.push(programdataAddress);
    }

    const airdrop = await connection.requestAirdrop(
      payer.publicKey,
      100 * LAMPORTS_PER_SOL,
    );
    await waitForSignature(connection, airdrop, "local airdrop");
    const atomicProgramFinalization = await submit({
      connection,
      payer,
      instructions: programdataAddresses.map((programdataAddress) =>
        setLoaderV3AuthorityNoneInstruction({
          programdataAddress,
          currentAuthority: programUpgradeAuthority.publicKey,
        }),
      ),
      signers: [payer, programUpgradeAuthority],
      label: "atomic destination/source/native Loader-v3 finalization",
    });
    const immutableProgramdata = [];
    for (const [index, programdataAddress] of programdataAddresses.entries()) {
      const programdata = await accountOrThrow(
        connection,
        programdataAddress,
        "finalized SBF ProgramData",
      );
      if (
        programdata.executable ||
        !programdata.owner.equals(UPGRADEABLE_LOADER_ID)
      ) {
        throw new Error("Finalized ProgramData owner/state is invalid.");
      }
      const parsedProgramdata = inspectImmutableGenesisProgramdata(
        programdata.data,
        programArtifacts[index],
      );
      const residualAuthorityBytes = Buffer.from(programdata.data).subarray(
        13,
        PROGRAMDATA_METADATA_BYTES,
      );
      if (
        !residualAuthorityBytes.equals(
          programUpgradeAuthority.publicKey.toBuffer(),
        )
      ) {
        throw new Error(
          "Local Loader-v3 finalization did not preserve the expected residual former-authority bytes.",
        );
      }
      immutableProgramdata.push({
        programId: programIds[index].toBase58(),
        programdataAddress: programdataAddress.toBase58(),
        programdataSlot: parsedProgramdata.slot,
        executableLength: parsedProgramdata.executableLength,
        executableSha256: parsedProgramdata.executableSha256,
        executableBlake2b256: parsedProgramdata.executableBlake2b256,
        authorityEncoding: parsedProgramdata.authorityEncoding,
        sbpfVersion: parsedProgramdata.sbpfVersion,
        residualFormerAuthorityBytes: true,
        upgradeAuthority: null,
      });
    }

    const roleDispatch = {
      destinationRejectsSourceBurn: await assertForbiddenRoleOpcode({
        connection,
        payer,
        programId: destinationProgramId,
        forbiddenOpcode: 3,
        label: "Destination program source-burn opcode",
      }),
      sourceRejectsDestinationFinalize: await assertForbiddenRoleOpcode({
        connection,
        payer,
        programId: sourceProgramId,
        forbiddenOpcode: 2,
        label: "Source program destination-finalize opcode",
      }),
    };

    const mintRent = await connection.getMinimumBalanceForRentExemption(82);
    const mintPlan = buildExactSolanaClassicMintCreationPlan({
      payerAddress: payer.publicKey,
      mintAddress: mint.publicKey,
      destinationProgramId,
      destinationStateAddress: destinationState,
      rentLamports: String(mintRent),
    });
    const verifyingKey = buildLocalTestVerifyingKey();
    const destinationBindingHash = deterministicHash(
      "sccp:local-sbf:destination-binding:v1",
    );
    const routeConfigurationHash = deterministicHash(
      "sccp:local-sbf:route-configuration:v1",
    );
    const soraAnchorHash = deterministicHash(
      "sccp:local-sbf:sora-finality-anchor:v1",
    );
    const semanticProfileHash = deterministicHash(
      "sccp:local-sbf:semantic-profile:v1",
    );
    const circuitCommitmentHash = deterministicHash(
      "sccp:local-sbf:circuit-commitment:v1",
    );
    const witnessGeneratorCommitmentHash = deterministicHash(
      "sccp:local-sbf:witness-generator:v1",
    );
    const materialPlan = buildExactSolanaNativeMaterialUploadPlan({
      authorityAddress: payer.publicKey,
      nativeVerifierProgramId,
      destinationProgramId,
      sourceProgramId,
      destinationStateAddress: destinationState,
      tokenMintAddress: mint.publicKey,
      routeRevision: ROUTE_REVISION,
      verifyingKeyBytes: verifyingKey,
      destinationBindingHash: hex(destinationBindingHash),
      routeConfigurationHash: hex(routeConfigurationHash),
      soraAnchorHash: hex(soraAnchorHash),
      semanticProfileHash: hex(semanticProfileHash),
      circuitCommitmentHash: hex(circuitCommitmentHash),
      witnessGeneratorCommitmentHash: hex(witnessGeneratorCommitmentHash),
      publicSignalSchemaHash: hex(PUBLIC_SIGNAL_SCHEMA_HASH),
    });
    const materialAddress = new PublicKey(
      materialPlan.nativeVerifierMaterialAddress,
    );
    const [destinationProgramdata, sourceProgramdata] =
      immutableProgramdata.map(
        (entry) => new PublicKey(entry.programdataAddress),
      );
    const hostileBootstrap = {};
    for (const [name, label, mutate] of [
      [
        "wrongNativeProgramdataLink",
        "wrong native-verifier ProgramData link",
        (instructions) => {
          instructions[2].keys[3].pubkey = destinationProgramdata;
        },
      ],
      [
        "wrongDestinationProgramdataLink",
        "wrong destination ProgramData link",
        (instructions) => {
          instructions[2].keys[5].pubkey = sourceProgramdata;
        },
      ],
      [
        "wrongSourceProgramdataLink",
        "wrong source ProgramData link",
        (instructions) => {
          instructions[2].keys[7].pubkey = destinationProgramdata;
        },
      ],
      [
        "wrongProgramdataOwner",
        "system-owned source ProgramData impostor",
        (instructions) => {
          instructions[2].keys[7].pubkey = payer.publicKey;
        },
      ],
      [
        "wrongSourceProgram",
        "non-Loader source program impostor",
        (instructions) => {
          instructions[2].keys[6].pubkey = TOKEN_PROGRAM_ID;
        },
      ],
      [
        "wrongMintAccount",
        "wrong material-init mint account",
        (instructions) => {
          instructions[2].keys[10].pubkey = payer.publicKey;
        },
      ],
      [
        "wrongMintAuthority",
        "wrong SPL mint authority",
        (instructions) => {
          payer.publicKey.toBuffer().copy(instructions[1].data, 2);
        },
      ],
      [
        "wrongVerifierAuthority",
        "wrong destination verifier-authority PDA",
        (instructions) => {
          instructions[2].keys[9].pubkey = payer.publicKey;
        },
      ],
      [
        "wrongSourceBoundConfig",
        "source-program-bound native config mutation",
        (instructions) => {
          instructions[2].data[66] ^= 1;
        },
      ],
    ]) {
      hostileBootstrap[name] = await simulateRejectedAtomicBootstrap({
        connection,
        payer,
        mint,
        mintPlan,
        materialPlan,
        mutate,
        label,
      });
    }
    const materialBootstrap = await submit({
      connection,
      payer,
      instructions: [
        ...mintPlan.instructions.map(descriptorInstruction),
        descriptorInstruction(materialPlan.instructions.initialize),
      ],
      signers: [payer, mint],
      label: "atomic SPL mint and native verifier material initialization",
    });
    for (const [
      index,
      instruction,
    ] of materialPlan.instructions.append.entries()) {
      await submit({
        connection,
        payer,
        instructions: [descriptorInstruction(instruction)],
        signers: [payer],
        label: `native verifier material append ${index + 1}`,
      });
    }
    const materialSeal = await submit({
      connection,
      payer,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MAX_COMPUTE_UNITS,
        }),
        descriptorInstruction(materialPlan.instructions.seal),
      ],
      signers: [payer],
      label: "native verifier material seal",
    });

    const stateParameters = {
      initializerAddress: payer.publicKey,
      tokenMintAddress: mint.publicKey,
      nativeVerifierProgramId,
      nativeVerifierMaterialAddress: materialAddress,
      routeRevision: ROUTE_REVISION,
      destinationStateAddress: destinationState,
      destinationBindingHash: hex(destinationBindingHash),
      routeConfigurationHash: hex(routeConfigurationHash),
      verifierKeyHash: materialPlan.verifierKeyHash,
      nativeVerifierConfigHash: materialPlan.nativeVerifierConfigHash,
    };
    const poisonInitializeInstruction = descriptorInstruction(
      buildExactSolanaRouteStateInitializeInstruction({
        ...stateParameters,
        routeProgramId: destinationProgramId,
        stateAddress: destinationState,
        peerRouteProgramId: TOKEN_PROGRAM_ID,
        role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
      }),
    );
    const poisonInitializeSimulation = await simulate({
      connection,
      payer,
      instructions: [poisonInitializeInstruction],
      signers: [payer],
    });
    if (
      poisonInitializeSimulation.err === null ||
      (await connection.getAccountInfo(destinationState, "confirmed")) !== null
    ) {
      throw new Error(
        "Wrong-peer route initialization did not fail atomically before PDA creation.",
      );
    }
    const hostileRouteInitialization = {
      poisonWrongPeerInitialize: {
        rejected: true,
        statePdaCreated: false,
        unitsConsumed: poisonInitializeSimulation.unitsConsumed ?? null,
      },
    };
    for (const [name, label, mutate] of [
      [
        "wrongRouteMint",
        "wrong route mint account",
        (instruction) => {
          instruction.keys[2].pubkey = payer.publicKey;
        },
      ],
      [
        "wrongRouteMaterial",
        "wrong native material account",
        (instruction) => {
          instruction.keys[5].pubkey = payer.publicKey;
        },
      ],
      [
        "wrongRouteStatePda",
        "wrong destination route-state PDA",
        (instruction) => {
          instruction.keys[1].pubkey = sourceState;
        },
      ],
    ]) {
      const instruction = descriptorInstruction(
        buildExactSolanaRouteStateInitializeInstruction({
          ...stateParameters,
          routeProgramId: destinationProgramId,
          stateAddress: destinationState,
          peerRouteProgramId: sourceProgramId,
          role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
        }),
      );
      mutate(instruction);
      const result = await simulate({
        connection,
        payer,
        instructions: [instruction],
        signers: [payer],
      });
      const [destinationReadback, sourceReadback] = await Promise.all([
        connection.getAccountInfo(destinationState, "confirmed"),
        connection.getAccountInfo(sourceState, "confirmed"),
      ]);
      if (
        result.err === null ||
        destinationReadback !== null ||
        sourceReadback !== null
      ) {
        throw new Error(`${label} did not fail before route-state creation.`);
      }
      hostileRouteInitialization[name] = {
        rejected: true,
        statePdaCreated: false,
        unitsConsumed: result.unitsConsumed ?? null,
      };
    }
    await submit({
      connection,
      payer,
      instructions: [
        descriptorInstruction(
          buildExactSolanaRouteStateInitializeInstruction({
            ...stateParameters,
            routeProgramId: destinationProgramId,
            stateAddress: destinationState,
            peerRouteProgramId: sourceProgramId,
            role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
          }),
        ),
      ],
      signers: [payer],
      label: "destination route initialization",
    });
    await submit({
      connection,
      payer,
      instructions: [
        descriptorInstruction(
          buildExactSolanaRouteStateInitializeInstruction({
            ...stateParameters,
            routeProgramId: sourceProgramId,
            stateAddress: sourceState,
            peerRouteProgramId: destinationProgramId,
            role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
          }),
        ),
      ],
      signers: [payer],
      label: "source route initialization",
    });

    await submit({
      connection,
      payer,
      instructions: await createTokenAccountInstructions({
        connection,
        payer,
        tokenAccount: destinationToken,
        mint: mint.publicKey,
      }),
      signers: [payer, destinationToken],
      label: "destination SPL token account creation",
    });

    const invalidProofAmount = 13n;
    const invalidProofFixtureBase = buildLocalGroth16ProofFixture({
      payerAddress: payer.publicKey,
      destinationBindingHash,
      routeConfigurationHash,
      soraAnchorHash,
      amount: invalidProofAmount,
    });
    const invalidProofBody = Buffer.from(invalidProofFixtureBase.body);
    invalidProofBody[PUBLIC_INPUT_BYTES + 32 + 128] ^= 1;
    const invalidProofFixture = {
      ...invalidProofFixtureBase,
      body: invalidProofBody,
      bodySha256: sha256(invalidProofBody),
    };
    const invalidProofPlan = buildProofInstructions({
      payer,
      destinationToken: destinationToken.publicKey,
      nativeVerifierProgramId,
      materialAddress,
      fixture: invalidProofFixture,
      amount: invalidProofAmount,
    });
    await submit({
      connection,
      payer,
      instructions: [invalidProofPlan.initialize],
      signers: [payer],
      label: "invalid native proof initialization",
    });
    for (const [index, instruction] of invalidProofPlan.append.entries()) {
      await submit({
        connection,
        payer,
        instructions: [instruction],
        signers: [payer],
        label: `invalid native proof append ${index + 1}`,
      });
    }
    const invalidFinalizePlan = buildExactSolanaDestinationFinalizeInstruction({
      payerAddress: payer.publicKey,
      destinationProgramId,
      destinationStateAddress: destinationState,
      tokenMintAddress: mint.publicKey,
      destinationTokenAddress: destinationToken.publicKey,
      nativeVerifierProgramId,
      verifierKeyHash: materialPlan.verifierKeyHash,
      nativeVerifierConfigHash: materialPlan.nativeVerifierConfigHash,
      messageId: hex(invalidProofFixture.messageId),
      amountBaseUnits: invalidProofAmount.toString(),
      nativeVerifierMaterialAddress: materialAddress,
      nativeProofAddress: invalidProofPlan.proofAddress,
    });
    const invalidProofSimulation = await simulate({
      connection,
      payer,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units: MAX_COMPUTE_UNITS }),
        invalidProofPlan.seal,
        descriptorInstruction(invalidFinalizePlan.instruction),
      ],
      signers: [payer],
    });
    const [mintAfterInvalidProof, tokenAfterInvalidProof, invalidReceipt] =
      await Promise.all([
        accountOrThrow(connection, mint.publicKey, "mint after invalid proof"),
        accountOrThrow(
          connection,
          destinationToken.publicKey,
          "token after invalid proof",
        ),
        connection.getAccountInfo(
          new PublicKey(invalidFinalizePlan.receipt.address),
          "confirmed",
        ),
      ]);
    if (
      invalidProofSimulation.err === null ||
      mintAfterInvalidProof.data.readBigUInt64LE(36) !== 0n ||
      tokenAfterInvalidProof.data.readBigUInt64LE(64) !== 0n ||
      invalidReceipt !== null
    ) {
      throw new Error(
        "Mutated Groth16 proof did not fail with unchanged mint state.",
      );
    }

    const proofFixture = buildLocalGroth16ProofFixture({
      payerAddress: payer.publicKey,
      destinationBindingHash,
      routeConfigurationHash,
      soraAnchorHash,
      amount: SETTLEMENT_AMOUNT,
    });
    const proofPlan = buildProofInstructions({
      payer,
      destinationToken: destinationToken.publicKey,
      nativeVerifierProgramId,
      materialAddress,
      fixture: proofFixture,
      amount: SETTLEMENT_AMOUNT,
    });
    await submit({
      connection,
      payer,
      instructions: [proofPlan.initialize],
      signers: [payer],
      label: "native proof initialization",
    });
    for (const [index, instruction] of proofPlan.append.entries()) {
      await submit({
        connection,
        payer,
        instructions: [instruction],
        signers: [payer],
        label: `native proof append ${index + 1}`,
      });
    }

    const finalizePlan = buildExactSolanaDestinationFinalizeInstruction({
      payerAddress: payer.publicKey,
      destinationProgramId,
      destinationStateAddress: destinationState,
      tokenMintAddress: mint.publicKey,
      destinationTokenAddress: destinationToken.publicKey,
      nativeVerifierProgramId,
      verifierKeyHash: materialPlan.verifierKeyHash,
      nativeVerifierConfigHash: materialPlan.nativeVerifierConfigHash,
      messageId: hex(proofFixture.messageId),
      amountBaseUnits: SETTLEMENT_AMOUNT.toString(),
      nativeVerifierMaterialAddress: materialAddress,
      nativeProofAddress: proofPlan.proofAddress,
    });
    const finalizeInstruction = descriptorInstruction(finalizePlan.instruction);
    const defaultLimitSimulation = await simulate({
      connection,
      payer,
      instructions: [proofPlan.seal, finalizeInstruction],
      signers: [payer],
    });
    const destinationSettlement = await submit({
      connection,
      payer,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({
          units: MAX_COMPUTE_UNITS,
        }),
        proofPlan.seal,
        finalizeInstruction,
      ],
      signers: [payer],
      label: "same-transaction proof seal and destination finalize",
    });

    const mintAfterFinalize = await accountOrThrow(
      connection,
      mint.publicKey,
      "SPL XOR mint",
    );
    const tokenAfterFinalize = await accountOrThrow(
      connection,
      destinationToken.publicKey,
      "destination token",
    );
    const destinationReceipt = await accountOrThrow(
      connection,
      new PublicKey(finalizePlan.receipt.address),
      "destination receipt",
    );
    const proofAccount = await accountOrThrow(
      connection,
      proofPlan.proofAddress,
      "sealed proof",
    );
    if (
      mintAfterFinalize.data.readBigUInt64LE(36) !== SETTLEMENT_AMOUNT ||
      tokenAfterFinalize.data.readBigUInt64LE(64) !== SETTLEMENT_AMOUNT ||
      destinationReceipt.data.subarray(0, 8).toString("ascii") !== "SCCPDS01" ||
      destinationReceipt.data.readBigUInt64LE(240) !== SETTLEMENT_AMOUNT ||
      proofAccount.data[9] !== 2
    ) {
      throw new Error("Destination settlement readback is not exact.");
    }
    const destinationReplaySimulation = await simulate({
      connection,
      payer,
      instructions: [finalizeInstruction],
      signers: [payer],
    });
    const [mintAfterDestinationReplay, tokenAfterDestinationReplay] =
      await Promise.all([
        accountOrThrow(
          connection,
          mint.publicKey,
          "mint after destination replay",
        ),
        accountOrThrow(
          connection,
          destinationToken.publicKey,
          "token after destination replay",
        ),
      ]);
    if (
      destinationReplaySimulation.err === null ||
      mintAfterDestinationReplay.data.readBigUInt64LE(36) !==
        SETTLEMENT_AMOUNT ||
      tokenAfterDestinationReplay.data.readBigUInt64LE(64) !== SETTLEMENT_AMOUNT
    ) {
      throw new Error(
        "Destination message replay did not fail with unchanged mint state.",
      );
    }

    const tairaRecipient = AccountAddress.fromAccount({
      publicKey: Uint8Array.from(
        Buffer.from(
          "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
          "hex",
        ),
      ),
    }).toI105(369);
    const burnPlan = buildExactSolanaSourceBurnInstruction({
      payerAddress: payer.publicKey,
      sourceProgramId,
      sourceStateAddress: sourceState,
      destinationStateAddress: destinationState,
      tokenMintAddress: mint.publicKey,
      sourceTokenAddress: destinationToken.publicKey,
      amountBaseUnits: BURN_AMOUNT.toString(),
      nonce: SOURCE_NONCE.toString(),
      tairaRecipient,
    });
    const sourceBurn = await submit({
      connection,
      payer,
      instructions: [descriptorInstruction(burnPlan.instruction)],
      signers: [payer],
      label: "Solana-to-TAIRA source burn",
    });

    const [mintFinal, tokenFinal, destinationStateAccount, sourceStateAccount] =
      await Promise.all([
        accountOrThrow(connection, mint.publicKey, "final mint"),
        accountOrThrow(connection, destinationToken.publicKey, "final token"),
        accountOrThrow(connection, destinationState, "destination state"),
        accountOrThrow(connection, sourceState, "source state"),
      ]);
    const sourceReceipt = await accountOrThrow(
      connection,
      new PublicKey(burnPlan.receipt.address),
      "source burn receipt",
    );
    const materialAccount = await accountOrThrow(
      connection,
      materialAddress,
      "native material",
    );
    if (
      mintFinal.data.readBigUInt64LE(36) !== SETTLEMENT_AMOUNT - BURN_AMOUNT ||
      tokenFinal.data.readBigUInt64LE(64) !== SETTLEMENT_AMOUNT - BURN_AMOUNT ||
      sourceReceipt.data.subarray(0, 8).toString("ascii") !== "SCCPSR01" ||
      sourceReceipt.data.readBigUInt64LE(176) !== BURN_AMOUNT ||
      sourceReceipt.data.subarray(272, 304).toString("hex") !==
        burnPlan.messageId.slice(2)
    ) {
      throw new Error(
        "Source burn receipt or SPL balance readback is not exact.",
      );
    }
    const sourceReplaySimulation = await simulate({
      connection,
      payer,
      instructions: [descriptorInstruction(burnPlan.instruction)],
      signers: [payer],
    });
    const [mintAfterSourceReplay, tokenAfterSourceReplay, receiptAfterReplay] =
      await Promise.all([
        accountOrThrow(connection, mint.publicKey, "mint after source replay"),
        accountOrThrow(
          connection,
          destinationToken.publicKey,
          "token after source replay",
        ),
        accountOrThrow(
          connection,
          new PublicKey(burnPlan.receipt.address),
          "receipt after source replay",
        ),
      ]);
    if (
      sourceReplaySimulation.err === null ||
      mintAfterSourceReplay.data.readBigUInt64LE(36) !==
        SETTLEMENT_AMOUNT - BURN_AMOUNT ||
      tokenAfterSourceReplay.data.readBigUInt64LE(64) !==
        SETTLEMENT_AMOUNT - BURN_AMOUNT ||
      !Buffer.from(receiptAfterReplay.data).equals(
        Buffer.from(sourceReceipt.data),
      )
    ) {
      throw new Error(
        "Source burn replay did not fail with unchanged balance and receipt.",
      );
    }

    const inspectedMint = inspectExactSolanaClassicMintAccount({
      account: mintFinal,
      mintAddress: mint.publicKey,
      destinationProgramId,
      destinationStateAddress: destinationState,
    });
    const inspectedMaterial = inspectExactSolanaNativeMaterialAccount({
      account: materialAccount,
      materialAddress,
      nativeVerifierProgramId,
      expected: {
        destinationProgramId,
        sourceProgramId,
        destinationStateAddress: destinationState,
        tokenMintAddress: mint.publicKey,
        verifierKeyHash: materialPlan.verifierKeyHash,
        nativeVerifierConfigHash: materialPlan.nativeVerifierConfigHash,
      },
    });
    const inspectedDestination = inspectExactSolanaRouteStateAccount({
      account: destinationStateAccount,
      routeProgramId: destinationProgramId,
      stateAddress: destinationState,
      expected: {
        role: SOLANA_EXACT_SCCP_ROLE_DESTINATION,
        tokenMintAddress: mint.publicKey,
        peerRouteProgramId: sourceProgramId,
        destinationStateAddress: destinationState,
        nativeVerifierProgramId,
        nativeVerifierMaterialAddress: materialAddress,
      },
    });
    const inspectedSource = inspectExactSolanaRouteStateAccount({
      account: sourceStateAccount,
      routeProgramId: sourceProgramId,
      stateAddress: sourceState,
      expected: {
        role: SOLANA_EXACT_SCCP_ROLE_SOURCE,
        tokenMintAddress: mint.publicKey,
        peerRouteProgramId: destinationProgramId,
        destinationStateAddress: destinationState,
        nativeVerifierProgramId,
        nativeVerifierMaterialAddress: materialAddress,
      },
    });
    if (
      inspectedDestination.totalMinted !== SETTLEMENT_AMOUNT.toString() ||
      inspectedDestination.operationCount !== "1" ||
      inspectedSource.totalBurned !== BURN_AMOUNT.toString() ||
      inspectedSource.operationCount !== "1" ||
      inspectedMaterial.status !== "sealed" ||
      inspectedMint.decimals !== 9
    ) {
      throw new Error(
        "Exact state inspectors rejected final local runtime state.",
      );
    }

    const secretLikeFilesBeforeShutdown = (await listFiles(ledger)).filter(
      (file) => SECRET_FILE_PATTERN.test(path.basename(file)),
    );
    if (secretLikeFilesBeforeShutdown.length !== 0) {
      throw new Error(
        "Temporary ledger recreated secret-like files during the run.",
      );
    }

    report = {
      schema: "iroha-demo-sccp-solana-local-sbf-runtime/v1",
      passed: true,
      localOnly: true,
      routeId: ROUTE_ID,
      artifactHashes: {
        bridgeSha256: `0x${bridge.sha256}`,
        sourceBridgeSha256: `0x${source.sha256}`,
        nativeVerifierSha256: `0x${native.sha256}`,
      },
      sbpfVersion: SBPF_V3,
      immutablePrograms: {
        loaderProgramId: UPGRADEABLE_LOADER_ID.toBase58(),
        destinationProgramId: destinationProgramId.toBase58(),
        sourceProgramId: sourceProgramId.toBase58(),
        nativeVerifierProgramId: nativeVerifierProgramId.toBase58(),
        atomicFinalization: {
          signature: atomicProgramFinalization.signature,
          slot: atomicProgramFinalization.slot,
          unitsConsumed: atomicProgramFinalization.unitsConsumed,
        },
        programdata: immutableProgramdata,
      },
      roleDispatch,
      negativeRuntime: {
        ...hostileBootstrap,
        ...hostileRouteInitialization,
        mutatedGroth16Proof: {
          rejected: invalidProofSimulation.err !== null,
          mintSupplyUnchanged: "0",
          tokenBalanceUnchanged: "0",
          receiptCreated: false,
          unitsConsumed: invalidProofSimulation.unitsConsumed ?? null,
        },
        destinationMessageReplay: {
          rejected: destinationReplaySimulation.err !== null,
          mintSupplyUnchanged: SETTLEMENT_AMOUNT.toString(),
          tokenBalanceUnchanged: SETTLEMENT_AMOUNT.toString(),
          unitsConsumed: destinationReplaySimulation.unitsConsumed ?? null,
        },
        sourceBurnReplay: {
          rejected: sourceReplaySimulation.err !== null,
          mintSupplyUnchanged: (SETTLEMENT_AMOUNT - BURN_AMOUNT).toString(),
          tokenBalanceUnchanged: (SETTLEMENT_AMOUNT - BURN_AMOUNT).toString(),
          receiptSha256Unchanged: hex(sha256(sourceReceipt.data)),
          unitsConsumed: sourceReplaySimulation.unitsConsumed ?? null,
        },
      },
      material: {
        address: materialAddress.toBase58(),
        status: inspectedMaterial.status,
        verifierKeyBytes: verifyingKey.length,
        atomicMintMaterialBootstrap: {
          signature: materialBootstrap.signature,
          slot: materialBootstrap.slot,
          unitsConsumed: materialBootstrap.unitsConsumed,
        },
        sealUnitsConsumed: materialSeal.unitsConsumed,
      },
      destination: {
        messageId: hex(proofFixture.messageId),
        payloadHash: hex(proofFixture.payloadHash),
        proofAddress: proofPlan.proofAddress.toBase58(),
        receiptAddress: finalizePlan.receipt.address,
        amountBaseUnits: SETTLEMENT_AMOUNT.toString(),
        computeBudgetUnits: MAX_COMPUTE_UNITS,
        unitsConsumed: destinationSettlement.unitsConsumed,
        slot: destinationSettlement.slot,
        proofSealedAndFinalizedInSameTransaction: true,
        defaultLimitSimulation: {
          succeeded: defaultLimitSimulation.err === null,
          error: defaultLimitSimulation.err,
          unitsConsumed: defaultLimitSimulation.unitsConsumed ?? null,
          exhaustedComputeBudget:
            defaultLimitSimulation.err !== null &&
            (defaultLimitSimulation.logs ?? []).some((line) =>
              /computational budget exceeded|consumed .* of .* compute units/iu.test(
                line,
              ),
            ),
        },
        mintSupplyAfterFinalize: SETTLEMENT_AMOUNT.toString(),
        tokenBalanceAfterFinalize: SETTLEMENT_AMOUNT.toString(),
      },
      source: {
        messageId: burnPlan.messageId,
        payloadHash: burnPlan.payloadHash,
        receiptAddress: burnPlan.receipt.address,
        amountBaseUnits: BURN_AMOUNT.toString(),
        unitsConsumed: sourceBurn.unitsConsumed,
        slot: sourceBurn.slot,
        mintSupplyAfterBurn: (SETTLEMENT_AMOUNT - BURN_AMOUNT).toString(),
        tokenBalanceAfterBurn: (SETTLEMENT_AMOUNT - BURN_AMOUNT).toString(),
      },
      signerPolicy: {
        inMemoryWeb3Keypairs: true,
        persistedApplicationKeypairs: false,
        validatorBootstrapKeypairFilesRemoved: removedBootstrapKeypairFiles,
        secretLikeLedgerFilesBeforeShutdown: 0,
      },
    };
  } finally {
    clearKeypairs(keypairs);
    await stopValidator(validator?.child);
    await rm(scratch, { recursive: true, force: true });
  }
  return {
    ...report,
    signerPolicy: {
      ...report.signerPolicy,
      temporaryLedgerRemoved: true,
    },
  };
};

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    const args = parseSolanaLocalSbfRuntimeArgs(process.argv.slice(2));
    if (args.help) {
      process.stdout.write(SOLANA_LOCAL_SBF_RUNTIME_USAGE);
    } else {
      const report = await runSolanaLocalSbfRuntime();
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.stack : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
