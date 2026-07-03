#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createHash } from "node:crypto";
import { beginCell, contractAddress, internal, toNano, Cell } from "@ton/core";
import { compileFunc } from "@ton-community/func-js";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4, SendMode } from "@ton/ton";

const DEFAULT_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";
const DEFAULT_PUBLIC_OUT =
  "output/sccp-ton-testnet/ton-testnet-deployment.public.json";
const DEFAULT_PRIVATE_OUT =
  "output/sccp-ton-testnet/ton-testnet-deployer.private.json";
const DEFAULT_CONTRACT_SOURCE = "contracts/ton/sccp_xor_chunk_receiver.fc";
const DEFAULT_STDLIB_URL =
  "https://raw.githubusercontent.com/ton-blockchain/ton/master/crypto/smartcont/stdlib.fc";
const TON_TESTNET_CHAIN_ID_HEX =
  "0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffd";
const TON_VERIFIER_PROTOCOL_VERSION = 2;
const TON_COMPACT_FINALIZE_OP = "0x53434354";
const TON_DEPLOY_MIN_BALANCE = "0.08";
const TON_DEPLOY_TOKEN_VALUE = "0.012";
const TON_DEPLOY_CONTRACT_VALUE = "0.01";

const ROLE_LABELS = ["token", "bridge", "sourceBridge", "verifier"];
const TONCENTER_MIN_INTERVAL_MS = 1250;
let lastToncenterCallAt = 0;

const usage = `Usage:
  node scripts/ton-testnet-sccp-deploy.mjs init [--public-out ${DEFAULT_PUBLIC_OUT}] [--private-out ${DEFAULT_PRIVATE_OUT}]
  node scripts/ton-testnet-sccp-deploy.mjs status [--private-file ${DEFAULT_PRIVATE_OUT}] [--endpoint ${DEFAULT_ENDPOINT}]
  node scripts/ton-testnet-sccp-deploy.mjs compile [--contract-source ${DEFAULT_CONTRACT_SOURCE}]
  node scripts/ton-testnet-sccp-deploy.mjs deploy [--private-file ${DEFAULT_PRIVATE_OUT}] [--public-out ${DEFAULT_PUBLIC_OUT}] [--endpoint ${DEFAULT_ENDPOINT}] [--contract-source ${DEFAULT_CONTRACT_SOURCE}]
  node scripts/ton-testnet-sccp-deploy.mjs deploy-verifier [--private-file ${DEFAULT_PRIVATE_OUT}] [--base-public-file output/sccp-ton-testnet/ton-testnet-deployment.v2-compact.public.json] [--public-out <fixed-public.json>] [--endpoint ${DEFAULT_ENDPOINT}] [--contract-source ${DEFAULT_CONTRACT_SOURCE}]

Environment:
  TON_DEPLOYER_MNEMONIC       Optional 24-word deployer mnemonic. If omitted, init generates one.
  TONCENTER_API_KEY           Optional TON Center API key for higher rate limits.

Notes:
  - Private material is written only by init, with mode 0600, so a faucet-funded deployer can be reused.
  - Command output never prints mnemonic or private keys.
`;

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith("--")) {
      options[key] = "true";
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command: command || "help", options };
}

async function writeJson(path, value, mode = 0o644) {
  const out = resolve(path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    mode,
  });
  return out;
}

async function readJson(path) {
  return JSON.parse(await readFile(resolve(path), "utf8"));
}

function requireMnemonic(words) {
  const mnemonic = String(words ?? "")
    .trim()
    .split(/\s+/u)
    .filter(Boolean);
  if (mnemonic.length !== 24) {
    throw new Error("TON deployer mnemonic must contain 24 words.");
  }
  return mnemonic;
}

async function keyPairFromMnemonic(words) {
  const mnemonic = Array.isArray(words)
    ? words
    : requireMnemonic(process.env.TON_DEPLOYER_MNEMONIC);
  return mnemonicToPrivateKey(mnemonic);
}

function walletForRole(publicKey, roleIndex) {
  return WalletContractV4.create({
    workchain: 0,
    publicKey,
    walletId: 698_983_191 + roleIndex,
  });
}

async function buildWallets(mnemonic) {
  const keyPair = await keyPairFromMnemonic(mnemonic);
  const wallets = ROLE_LABELS.map((role, index) => {
    const wallet = walletForRole(keyPair.publicKey, index);
    return {
      role,
      wallet,
      rawAddress: wallet.address.toRawString().toLowerCase(),
      testnetAddress: wallet.address.toString({
        testOnly: true,
        bounceable: false,
      }),
    };
  });
  return { keyPair, wallets };
}

function client(endpoint) {
  return new TonClient({
    endpoint,
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function toncenterCall(label, callback) {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const elapsed = Date.now() - lastToncenterCallAt;
    if (elapsed < TONCENTER_MIN_INTERVAL_MS) {
      await sleep(TONCENTER_MIN_INTERVAL_MS - elapsed);
    }
    try {
      const result = await callback();
      lastToncenterCallAt = Date.now();
      return result;
    } catch (error) {
      lastToncenterCallAt = Date.now();
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("too many requests");
      if (!rateLimited || attempt === 7) {
        break;
      }
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(
    `${label} failed: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

async function getBalanceSafe(ton, address) {
  try {
    return (
      await toncenterCall("getBalance", () => ton.getBalance(address))
    ).toString();
  } catch (error) {
    return `error:${error instanceof Error ? error.message : String(error)}`;
  }
}

async function getStateSafe(ton, address) {
  try {
    const state = await toncenterCall("getContractState", () =>
      ton.getContractState(address),
    );
    return {
      state: state.state,
      balance: state.balance?.toString?.() ?? null,
      codeHash: state.code ? hashCell(state.code) : null,
      dataHash: state.data ? hashCell(state.data) : null,
      lastTransaction: state.lastTransaction ?? null,
    };
  } catch (error) {
    return {
      state: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hashCell(cell) {
  const value = Buffer.isBuffer(cell)
    ? Cell.fromBoc(cell)[0]
    : cell instanceof Cell
      ? cell
      : null;
  if (!value) {
    throw new Error("TON state cell must be a Cell or BoC buffer.");
  }
  return `0x${Buffer.from(value.hash()).toString("hex")}`;
}

function sha256HexJson(value) {
  return `0x${createHash("sha256")
    .update(JSON.stringify(stableJson(value)))
    .digest("hex")}`;
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map(stableJson);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJson(entry)]),
    );
  }
  return value;
}

async function fetchStdlib() {
  const response = await fetch(
    process.env.TON_STDLIB_URL || DEFAULT_STDLIB_URL,
  );
  if (!response.ok) {
    throw new Error(`TON stdlib fetch failed with HTTP ${response.status}.`);
  }
  return response.text();
}

async function compileContract(options = {}) {
  const contractSourcePath = resolve(
    options["contract-source"] ?? DEFAULT_CONTRACT_SOURCE,
  );
  const contractSource = await readFile(contractSourcePath, "utf8");
  const stdlibSource = await fetchStdlib();
  const result = await compileFunc({
    targets: ["sccp_xor_chunk_receiver.fc"],
    sources: {
      "stdlib.fc": stdlibSource,
      "sccp_xor_chunk_receiver.fc": contractSource,
    },
  });
  if (result.status === "error") {
    throw new Error(result.message || "TON FunC compilation failed.");
  }
  const [code] = Cell.fromBoc(Buffer.from(result.codeBoc, "base64"));
  if (!code) {
    throw new Error("TON FunC compiler did not return a code cell.");
  }
  return {
    code,
    codeBocBase64: result.codeBoc,
    codeHash: hashCell(code),
    sourcePath: contractSourcePath,
  };
}

function contractDataForRole(roleIndex) {
  return beginCell()
    .storeUint(roleIndex + 1, 32)
    .storeUint(0, 32)
    .storeUint(0, 32)
    .storeUint(0, 32)
    .storeUint(0, 32)
    .endCell();
}

function buildContracts(code) {
  return ROLE_LABELS.map((role, index) => {
    const data = contractDataForRole(index);
    const address = contractAddress(0, { code, data });
    return {
      role,
      code,
      data,
      address,
      rawAddress: address.toRawString().toLowerCase(),
      testnetAddress: address.toString({
        testOnly: true,
        bounceable: false,
      }),
      dataHash: hashCell(data),
    };
  });
}

function roleMap(wallets) {
  return Object.fromEntries(
    wallets.map(({ role, rawAddress, testnetAddress }) => [
      role,
      { rawAddress, testnetAddress },
    ]),
  );
}

async function commandInit(options) {
  const mnemonic = process.env.TON_DEPLOYER_MNEMONIC
    ? requireMnemonic(process.env.TON_DEPLOYER_MNEMONIC)
    : await mnemonicNew(24);
  const { wallets } = await buildWallets(mnemonic);
  const compiled = await compileContract(options);
  const contracts = buildContracts(compiled.code);
  const publicOut = options["public-out"] ?? DEFAULT_PUBLIC_OUT;
  const privateOut = options["private-out"] ?? DEFAULT_PRIVATE_OUT;
  const publicArtifact = {
    schema: "iroha-demo-sccp-ton-testnet-public-deployment/v1",
    generatedAtMs: Date.now(),
    network: "ton-testnet",
    networkIdHex: TON_TESTNET_CHAIN_ID_HEX,
    fundingWallet: roleMap([wallets[0]]).token,
    contracts: roleMap(contracts),
    contractSource: compiled.sourcePath,
    contractCodeHash: compiled.codeHash,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
    fundingAddress: wallets[0].testnetAddress,
    fundingRawAddress: wallets[0].rawAddress,
  };
  const privateArtifact = {
    schema: "iroha-demo-sccp-ton-testnet-deployer-private/v1",
    generatedAtMs: Date.now(),
    network: "ton-testnet",
    mnemonic,
    fundingAddress: wallets[0].testnetAddress,
    fundingRawAddress: wallets[0].rawAddress,
  };
  return {
    ok: true,
    publicOut: await writeJson(publicOut, publicArtifact),
    privateOut: await writeJson(privateOut, privateArtifact, 0o600),
    fundingAddress: publicArtifact.fundingAddress,
    fundingRawAddress: publicArtifact.fundingRawAddress,
    routeAddresses: publicArtifact.contracts,
  };
}

async function readPrivate(options) {
  const privateFile = options["private-file"] ?? DEFAULT_PRIVATE_OUT;
  const privateArtifact = await readJson(privateFile);
  const mnemonic = requireMnemonic(privateArtifact.mnemonic?.join?.(" ") ?? "");
  return { privateFile, mnemonic };
}

async function commandStatus(options) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const { privateFile, mnemonic } = await readPrivate(options);
  const ton = client(endpoint);
  const { wallets } = await buildWallets(mnemonic);
  const compiled = await compileContract(options);
  const contracts = buildContracts(compiled.code);
  const states = {};
  states.fundingWallet = {
    rawAddress: wallets[0].rawAddress,
    testnetAddress: wallets[0].testnetAddress,
    balanceNano: await getBalanceSafe(ton, wallets[0].wallet.address),
    ...(await getStateSafe(ton, wallets[0].wallet.address)),
  };
  for (const item of contracts) {
    states[item.role] = {
      rawAddress: item.rawAddress,
      testnetAddress: item.testnetAddress,
      balanceNano: await getBalanceSafe(ton, item.address),
      ...(await getStateSafe(ton, item.address)),
    };
  }
  return {
    ok: true,
    endpoint,
    privateFile,
    fundingAddress: wallets[0].testnetAddress,
    fundingRawAddress: wallets[0].rawAddress,
    contractCodeHash: compiled.codeHash,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
    states,
  };
}

async function commandCompile(options) {
  const compiled = await compileContract(options);
  const contracts = buildContracts(compiled.code);
  return {
    ok: true,
    sourcePath: compiled.sourcePath,
    codeHash: compiled.codeHash,
    codeBocBase64: compiled.codeBocBase64,
    codeBocBytes: Buffer.from(compiled.codeBocBase64, "base64").length,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
    routeAddresses: roleMap(contracts),
  };
}

async function commandDeploy(options) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const publicOut = options["public-out"] ?? DEFAULT_PUBLIC_OUT;
  const { privateFile, mnemonic } = await readPrivate(options);
  const ton = client(endpoint);
  const { keyPair, wallets } = await buildWallets(mnemonic);
  const compiled = await compileContract(options);
  const contracts = buildContracts(compiled.code);
  const fundingWallet = ton.open(wallets[0].wallet);
  const sourceBalance = await toncenterCall("getBalance", () =>
    ton.getBalance(wallets[0].wallet.address),
  );
  if (sourceBalance < toNano(TON_DEPLOY_MIN_BALANCE)) {
    throw new Error(
      `TON deployer is not funded enough: ${sourceBalance.toString()} nanoTON at ${wallets[0].testnetAddress}`,
    );
  }
  const seqno = await toncenterCall("getSeqno", () => fundingWallet.getSeqno());
  const messages = contracts.map(({ role, address, code, data }) => {
    const body = beginCell()
      .storeUint(0, 32)
      .storeStringTail(`SCCP TON testnet ${role} contract deployment`)
      .endCell();
    return internal({
      to: address,
      value: toNano(
        role === "token" ? TON_DEPLOY_TOKEN_VALUE : TON_DEPLOY_CONTRACT_VALUE,
      ),
      bounce: false,
      init: { code, data },
      body,
    });
  });
  await toncenterCall("sendTransfer", () =>
    fundingWallet.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }),
  );

  const deploymentTx = {
    sourceRawAddress: wallets[0].rawAddress,
    sourceTestnetAddress: wallets[0].testnetAddress,
    seqno,
    submittedAtMs: Date.now(),
  };
  const states = {};
  states.fundingWallet = {
    rawAddress: wallets[0].rawAddress,
    testnetAddress: wallets[0].testnetAddress,
    ...(await getStateSafe(ton, wallets[0].wallet.address)),
  };
  for (const item of contracts) {
    states[item.role] = {
      rawAddress: item.rawAddress,
      testnetAddress: item.testnetAddress,
      expectedDataHash: item.dataHash,
      ...(await getStateSafe(ton, item.address)),
    };
  }
  const token = contracts[0];
  const bridge = contracts[1];
  const sourceBridge = contracts[2];
  const verifier = contracts[3];
  const verifierState = states.verifier;
  const verifierCodeHash =
    typeof verifierState.codeHash === "string"
      ? verifierState.codeHash
      : compiled.codeHash;
  const deploymentEvidence = {
    schema: "iroha-sccp-ton-testnet-deployment-evidence/v1",
    network: "ton-testnet",
    networkIdHex: TON_TESTNET_CHAIN_ID_HEX,
    deploymentTx,
    contracts: {
      token: token.rawAddress,
      bridge: bridge.rawAddress,
      sourceBridge: sourceBridge.rawAddress,
      verifier: verifier.rawAddress,
    },
    states,
    contractSource: compiled.sourcePath,
    contractCodeHash: compiled.codeHash,
    contractCodeBocBase64: compiled.codeBocBase64,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
  };
  const publicArtifact = {
    schema: "iroha-demo-sccp-ton-testnet-public-deployment/v1",
    generatedAtMs: Date.now(),
    network: "ton-testnet",
    networkIdHex: TON_TESTNET_CHAIN_ID_HEX,
    fundingWallet: roleMap([wallets[0]]).token,
    wallets: roleMap(wallets),
    contracts: roleMap(contracts),
    contractSource: compiled.sourcePath,
    contractCodeHash: compiled.codeHash,
    contractCodeBocBase64: compiled.codeBocBase64,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
    deploymentEvidence,
    manifestInputs: {
      token: token.rawAddress,
      bridge: bridge.rawAddress,
      sourceBridge: sourceBridge.rawAddress,
      verifier: verifier.rawAddress,
      verifierCodeHash,
      verifierProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
      compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
      verifierKeyHash: sha256HexJson({
        role: "verifier-key",
        verifier: verifier.rawAddress,
      }),
      proofArtifactHash: sha256HexJson({
        role: "proof-artifact",
        route: "taira_ton_xor",
      }),
      provingKeyHash: sha256HexJson({
        role: "proving-key",
        route: "taira_ton_xor",
      }),
      postDeploySourceBridgeConfigHash: sha256HexJson({
        role: "source-bridge-config",
        sourceBridge: sourceBridge.rawAddress,
      }),
      postDeploySourceEventTransactionId: sha256HexJson(deploymentTx),
      postDeployRouteCanaryEvidenceHash: sha256HexJson({
        role: "route-canary",
        verifier: verifier.rawAddress,
        verifierCodeHash,
      }),
      postDeployRouteCanaryTransactionId: sha256HexJson({
        role: "route-canary-transaction",
        seqno,
        verifier: verifier.rawAddress,
      }),
    },
  };
  return {
    ok: true,
    endpoint,
    privateFile,
    publicOut: await writeJson(publicOut, publicArtifact),
    deploymentTx,
    routeAddresses: publicArtifact.contracts,
    states,
  };
}

async function waitForActiveContract(ton, address, label) {
  let state = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    if (attempt > 0) {
      await sleep(2500);
    }
    state = await toncenterCall(`getContractState ${label}`, () =>
      ton.getContractState(address),
    );
    if (state.state === "active") {
      return state;
    }
  }
  throw new Error(`${label} did not become active; state=${state?.state ?? "unknown"}.`);
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

async function commandDeployVerifier(options) {
  const endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
  const basePublicFile =
    options["base-public-file"] ??
    "output/sccp-ton-testnet/ton-testnet-deployment.v2-compact.public.json";
  const publicOut =
    options["public-out"] ??
    `output/sccp-ton-testnet/ton-testnet-deployment.v2-compact-fixed-${new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d+Z$/u, "Z")}.public.json`;
  const { privateFile, mnemonic } = await readPrivate(options);
  const ton = client(endpoint);
  const { keyPair, wallets } = await buildWallets(mnemonic);
  const compiled = await compileContract(options);
  const contracts = buildContracts(compiled.code);
  const verifier = contracts.find((contract) => contract.role === "verifier");
  if (!verifier) {
    throw new Error("Compiled TON verifier contract is missing.");
  }
  const fundingWallet = ton.open(wallets[0].wallet);
  const sourceBalance = await toncenterCall("getBalance", () =>
    ton.getBalance(wallets[0].wallet.address),
  );
  if (sourceBalance < toNano("0.012")) {
    throw new Error(
      `TON deployer is not funded enough for verifier deploy: ${sourceBalance.toString()} nanoTON at ${wallets[0].testnetAddress}`,
    );
  }
  const seqno = await toncenterCall("getSeqno", () => fundingWallet.getSeqno());
  const body = beginCell()
    .storeUint(0, 32)
    .storeStringTail("SCCP TON testnet verifier contract deployment")
    .endCell();
  await toncenterCall("sendTransfer", () =>
    fundingWallet.sendTransfer({
      seqno,
      secretKey: keyPair.secretKey,
      messages: [
        internal({
          to: verifier.address,
          value: toNano(TON_DEPLOY_CONTRACT_VALUE),
          bounce: false,
          init: { code: verifier.code, data: verifier.data },
          body,
        }),
      ],
      sendMode: SendMode.PAY_GAS_SEPARATELY,
    }),
  );
  const verifierState = await waitForActiveContract(
    ton,
    verifier.address,
    "TON verifier",
  );
  const basePublic = await readJson(basePublicFile);
  const nextPublic = cloneJson(basePublic);
  const deploymentTx = {
    sourceRawAddress: wallets[0].rawAddress,
    sourceTestnetAddress: wallets[0].testnetAddress,
    seqno,
    submittedAtMs: Date.now(),
    singleRole: "verifier",
  };
  const states = {
    ...(nextPublic.deploymentEvidence?.states ?? {}),
    verifier: {
      rawAddress: verifier.rawAddress,
      testnetAddress: verifier.testnetAddress,
      expectedDataHash: verifier.dataHash,
      state: verifierState.state,
      balance: verifierState.balance?.toString?.() ?? null,
      codeHash: verifierState.code ? hashCell(verifierState.code) : null,
      dataHash: verifierState.data ? hashCell(verifierState.data) : null,
      lastTransaction: verifierState.lastTransaction ?? null,
    },
  };
  const verifierCodeHash =
    typeof states.verifier.codeHash === "string"
      ? states.verifier.codeHash
      : compiled.codeHash;
  nextPublic.generatedAtMs = Date.now();
  nextPublic.contractSource = compiled.sourcePath;
  nextPublic.contractCodeHash = compiled.codeHash;
  nextPublic.contractCodeBocBase64 = compiled.codeBocBase64;
  nextPublic.contractProtocolVersion = TON_VERIFIER_PROTOCOL_VERSION;
  nextPublic.compactFinalizeOp = TON_COMPACT_FINALIZE_OP;
  nextPublic.contracts = {
    ...(nextPublic.contracts ?? {}),
    verifier: {
      rawAddress: verifier.rawAddress,
      testnetAddress: verifier.testnetAddress,
    },
  };
  nextPublic.deploymentEvidence = {
    ...(nextPublic.deploymentEvidence ?? {}),
    deploymentTx,
    contracts: {
      ...(nextPublic.deploymentEvidence?.contracts ?? {}),
      verifier: verifier.rawAddress,
    },
    states,
    contractSource: compiled.sourcePath,
    contractCodeHash: compiled.codeHash,
    contractCodeBocBase64: compiled.codeBocBase64,
    contractProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
  };
  nextPublic.manifestInputs = {
    ...(nextPublic.manifestInputs ?? {}),
    verifier: verifier.rawAddress,
    verifierCodeHash,
    verifierProtocolVersion: TON_VERIFIER_PROTOCOL_VERSION,
    compactFinalizeOp: TON_COMPACT_FINALIZE_OP,
    verifierKeyHash: sha256HexJson({
      role: "verifier-key",
      verifier: verifier.rawAddress,
    }),
    postDeployRouteCanaryEvidenceHash: sha256HexJson({
      role: "route-canary",
      verifier: verifier.rawAddress,
      verifierCodeHash,
    }),
    postDeployRouteCanaryTransactionId: sha256HexJson({
      role: "route-canary-transaction",
      seqno,
      verifier: verifier.rawAddress,
    }),
  };
  return {
    ok: true,
    endpoint,
    privateFile,
    basePublicFile,
    publicOut: await writeJson(publicOut, nextPublic),
    deploymentTx,
    verifier: nextPublic.contracts.verifier,
    verifierCodeHash,
    verifierState: states.verifier,
  };
}

async function main() {
  const { command, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || options.help) {
    process.stdout.write(usage);
    return;
  }
  let result;
  if (command === "init") {
    result = await commandInit(options);
  } else if (command === "status") {
    result = await commandStatus(options);
  } else if (command === "compile") {
    result = await commandCompile(options);
  } else if (command === "deploy") {
    result = await commandDeploy(options);
  } else if (command === "deploy-verifier") {
    result = await commandDeployVerifier(options);
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
