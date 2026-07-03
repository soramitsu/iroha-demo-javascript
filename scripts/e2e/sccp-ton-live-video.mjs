#!/usr/bin/env node

import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Address, Cell, internal } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { SendMode, TonClient, WalletContractV4 } from "@ton/ton";
import { _electron as electron } from "playwright";
import { runSccpTonRoutePreflight } from "./sccp-ton-route-preflight.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const mainEntry = path.join(repoRoot, "dist", "main", "index.cjs");
const defaultOutputRoot = path.join(repoRoot, "output/sccp-ton-live-proof");
const defaultTonPrivateFile = path.join(
  repoRoot,
  "output/sccp-ton-testnet/ton-testnet-deployer.private.json",
);
const defaultTonPublicFile = path.join(
  repoRoot,
  "output/sccp-ton-testnet/ton-testnet-deployment.public.json",
);
const defaultFundedTairaWalletFile = path.join(
  repoRoot,
  "output/e2e/sccp-bsc-funded-sibling-wallet.json",
);
const DEFAULT_TAIRA_TORII_URL = "https://taira.sora.org";
const DEFAULT_TONCENTER_ENDPOINT =
  "https://testnet.toncenter.com/api/v2/jsonRPC";
const TON_TESTNET_EXPLORER_URL = "https://testnet.tonscan.org";
const DEFAULT_AMOUNT = "0.000001";
const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const TAIRA_NETWORK_PREFIX = 369;
const TON_TOKEN_WALLET_ID = 698_983_191;
const MIN_VIDEO_ARTIFACT_BYTES = 64 * 1024;
const TONCENTER_MIN_INTERVAL_MS = 1500;
let lastToncenterCallAt = 0;

const usage = `Usage:
  node scripts/e2e/sccp-ton-live-video.mjs [options]

Options:
  --output-dir PATH          Proof artifact directory (default: output/sccp-ton-live-proof/<timestamp>)
  --direction forward|reverse
                             UI leg to drive (default: forward)
  --amount DECIMAL           XOR amount for TAIRA -> TON (default: ${DEFAULT_AMOUNT})
  --taira-recipient ACCOUNT  TAIRA recipient for reverse TON -> TAIRA marker (default: active wallet)
  --message-id HEX           Existing TAIRA SCCP message id; skips source submit and drives Fetch proof job
  --taira-source-tx HEX      TAIRA source transaction hash to show when --message-id is used
  --duration-ms NUMBER       Extra wait after submit attempt (default: 15000)
  --submit-timeout-ms NUMBER Bound the bridge submit wait (default: 300000)
  --torii-url URL            TAIRA Torii endpoint (default: ${DEFAULT_TAIRA_TORII_URL})
  --ton-endpoint URL         TON Center JSON-RPC endpoint (default: ${DEFAULT_TONCENTER_ENDPOINT})
  --ton-private-file PATH    TON deployer private JSON (default: output/sccp-ton-testnet/ton-testnet-deployer.private.json)
  --ton-public-file PATH     TON deployment public JSON (default: output/sccp-ton-testnet/ton-testnet-deployment.public.json)
  --funded-wallet-file PATH  Funded TAIRA wallet JSON for secure-vault bootstrap
  --skip-preflight           Record even if the read-only TON preflight fails
  --allow-incomplete         Keep artifacts even when the live route rejects submission
  --help, -h                 Show this help
`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeLogText = (value) =>
  String(value ?? "")
    .replace(
      /(^|[^A-Za-z0-9_-])((?:"|')?(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)(?:"|')?\s*[:=]\s*)(?!\[redacted)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu,
      "$1$2[redacted]",
    )
    .replace(
      /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/giu,
      "[redacted token]",
    )
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 2000);

const describeError = (error) => {
  const record =
    error && typeof error === "object" && !Array.isArray(error) ? error : null;
  const parts = [error instanceof Error ? error.message : String(error)];
  const response = record?.response;
  if (response && typeof response === "object" && !Array.isArray(response)) {
    const status = response.status;
    const statusText = response.statusText;
    if (status || statusText) {
      parts.push(
        `HTTP ${String(status ?? "")} ${String(statusText ?? "")}`.trim(),
      );
    }
    if (response.data !== undefined) {
      parts.push(
        typeof response.data === "string"
          ? response.data
          : JSON.stringify(response.data, (_key, value) =>
              typeof value === "bigint" ? value.toString(10) : value,
            ),
      );
    }
  }
  const cause = record?.cause;
  if (cause) {
    parts.push(cause instanceof Error ? cause.message : String(cause));
  }
  return sanitizeLogText(parts.filter(Boolean).join(" | "));
};

export const isTairaEndpointUnavailableError = (error) =>
  /\b(?:HTTP\s+(?:502|503|504)|status(?:\s+code)?\s+(?:502|503|504)|econnrefused|enotfound|etimedout|eai_again|network error|failed to fetch|request timed out|aborted)\b/iu.test(
    describeError(error),
  );

export const buildTonPreflightFailureReport = ({
  toriiUrl,
  error,
  checkedAt = new Date().toISOString(),
}) => {
  const detail = describeError(error);
  const endpointUnavailable = isTairaEndpointUnavailableError(error);
  const blocker = endpointUnavailable
    ? `TAIRA Torii is unavailable from ${toriiUrl}: ${detail}. The live transaction video is blocked until the endpoint recovers.`
    : `TON route preflight failed before recording: ${detail}. The live transaction video is blocked until route readiness can be proven.`;
  return {
    checkedAt,
    ready: false,
    endpointAvailable: !endpointUnavailable,
    routeReady: false,
    blockers: [blocker],
    error: detail,
  };
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
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const parseBoolean = (value) => value === true || value === "true";

const normalizeAmount = (value) => {
  const normalized = String(value ?? DEFAULT_AMOUNT).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/u.test(normalized)) {
    throw new Error("TON SCCP amount must be a decimal with up to 18 places.");
  }
  if (/^0(?:\.0{1,18})?$/u.test(normalized)) {
    throw new Error("TON SCCP amount must be greater than zero.");
  }
  return normalized;
};

const normalizeMessageId = (value) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^0x/iu, "")
    .toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error("--message-id must be a 32-byte hex SCCP message id.");
  }
  return normalized;
};

const normalizeOptionalTxHash = (value, label) => {
  if (value === undefined || value === null || value === "") {
    return "";
  }
  const normalized = String(value).trim().replace(/^0x/iu, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/u.test(normalized)) {
    throw new Error(`${label} must be a 32-byte hex transaction hash.`);
  }
  return normalized;
};

const normalizeDirection = (value) => {
  const normalized = String(value ?? "forward")
    .trim()
    .toLowerCase();
  if (
    !normalized ||
    normalized === "forward" ||
    normalized === "taira-to-ton"
  ) {
    return "forward";
  }
  if (
    normalized === "reverse" ||
    normalized === "ton-to-taira" ||
    normalized === "return"
  ) {
    return "reverse";
  }
  throw new Error("--direction must be forward or reverse.");
};

const normalizeBaseUrl = (value, label) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\/+$/u, "");
  if (!/^https?:\/\/[^/\s]+/u.test(normalized)) {
    throw new Error(`${label} must be an absolute HTTP(S) URL.`);
  }
  return normalized;
};

const timestampForPath = () =>
  new Date().toISOString().replace(/[:.]/gu, "-").replace(/Z$/u, "Z");

const readJsonFile = async (filePath) =>
  JSON.parse(await readFile(path.resolve(filePath), "utf8"));

const writeJsonFile = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const normalizeTonRawAddress = (value, label = "TON raw address") => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  const match = /^(-?(?:0|[1-9]\d*)):([0-9a-f]{64})$/u.exec(normalized);
  if (!match) {
    throw new Error(`${label} must use workchain:32-byte-hex form.`);
  }
  const workchain = Number(match[1]);
  if (!Number.isSafeInteger(workchain) || workchain < -1 || workchain > 255) {
    throw new Error(`${label} workchain is outside the supported range.`);
  }
  if (/^0{64}$/u.test(match[2])) {
    throw new Error(`${label} account hash must be non-zero.`);
  }
  return `${workchain}:${match[2]}`;
};

const requireMnemonic = (value) => {
  const words = Array.isArray(value)
    ? value.map((entry) => String(entry ?? "").trim()).filter(Boolean)
    : String(value ?? "")
        .trim()
        .split(/\s+/u)
        .filter(Boolean);
  if (words.length !== 24) {
    throw new Error(
      "TON deployer private JSON must contain a 24-word mnemonic.",
    );
  }
  return words;
};

const tokenWalletFromPublicKey = (publicKey) =>
  WalletContractV4.create({
    workchain: 0,
    publicKey,
    walletId: TON_TOKEN_WALLET_ID,
  });

const buildTonSigner = async ({ privateFile, endpoint }) => {
  const privateArtifact = await readJsonFile(privateFile);
  const mnemonic = requireMnemonic(privateArtifact.mnemonic);
  const keyPair = await mnemonicToPrivateKey(mnemonic);
  const wallet = tokenWalletFromPublicKey(keyPair.publicKey);
  const client = new TonClient({
    endpoint,
    apiKey: process.env.TONCENTER_API_KEY || undefined,
  });
  const opened = client.open(wallet);
  return {
    client,
    keyPair,
    wallet,
    opened,
    rawAddress: wallet.address.toRawString().toLowerCase(),
  };
};

const withTimeout = async (label, promise, timeoutMs = 20_000) => {
  let timeout = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs} ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
  }
};

const toncenterCall = async (label, callback, { timeoutMs = 20_000 } = {}) => {
  let lastError = null;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const elapsed = Date.now() - lastToncenterCallAt;
    if (elapsed < TONCENTER_MIN_INTERVAL_MS) {
      await wait(TONCENTER_MIN_INTERVAL_MS - elapsed);
    }
    try {
      const result = await withTimeout(
        label,
        Promise.resolve().then(callback),
        timeoutMs,
      );
      lastToncenterCallAt = Date.now();
      return result;
    } catch (error) {
      lastToncenterCallAt = Date.now();
      lastError = error;
      const message = describeError(error);
      const rateLimited =
        message.includes("429") ||
        message.toLowerCase().includes("rate limit") ||
        message.toLowerCase().includes("too many requests");
      if (!rateLimited || attempt === 7) {
        break;
      }
      await wait(2000 * (attempt + 1));
    }
  }
  throw new Error(`${label} failed: ${describeError(lastError)}`);
};

const decodePayloadCell = (payload) => {
  const normalized = String(payload ?? "").trim();
  if (!normalized) {
    return undefined;
  }
  const cells = Cell.fromBoc(Buffer.from(normalized, "base64"));
  if (cells.length !== 1) {
    throw new Error("TON transaction payload must contain exactly one cell.");
  }
  return cells[0];
};

const TON_HARNESS_MAX_MESSAGES = 2;
const TON_HARNESS_MAX_EXTERNAL_BOC_BYTES = 64 * 1024;

const validateTonMessageRequest = (transaction, expectedFrom) => {
  if (
    !transaction ||
    typeof transaction !== "object" ||
    Array.isArray(transaction)
  ) {
    throw new Error("TON transaction request must be an object.");
  }
  if (
    transaction.from &&
    normalizeTonRawAddress(transaction.from, "TON transaction sender") !==
      expectedFrom
  ) {
    throw new Error("TON transaction sender does not match the live signer.");
  }
  if (transaction.network && transaction.network !== "-3") {
    throw new Error("TON transaction request must target testnet.");
  }
  const validUntil = Number(transaction.validUntil);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (
    !Number.isSafeInteger(validUntil) ||
    validUntil <= nowSeconds ||
    validUntil > nowSeconds + 60 * 60
  ) {
    throw new Error("TON transaction validUntil is outside bounds.");
  }
  if (
    !Array.isArray(transaction.messages) ||
    transaction.messages.length < 1 ||
    transaction.messages.length > TON_HARNESS_MAX_MESSAGES
  ) {
    throw new Error(
      `TON transaction request must include between 1 and ${TON_HARNESS_MAX_MESSAGES} messages.`,
    );
  }
  return {
    messages: transaction.messages.map((message, index) => {
      const amount = String(message?.amount ?? "").trim();
      if (!/^[1-9]\d*$/u.test(amount)) {
        throw new Error(
          `TON transaction message ${index + 1} amount must be a positive nanoTON integer.`,
        );
      }
      return {
        to: Address.parse(String(message.address ?? "")),
        amount,
        payload: decodePayloadCell(message.payload),
      };
    }),
    validUntil,
  };
};

const readTonTransactionStatus = async (client, address, lastTransaction) => {
  const expectedLt = String(lastTransaction?.lt ?? "").trim();
  const expectedHash = String(lastTransaction?.hash ?? "").trim();
  const txs = await toncenterCall("TON destination transaction status", () =>
    client.getTransactions(address, { limit: 12 }),
  );
  const tx =
    txs.find((entry) => {
      const ltMatches = !expectedLt || String(entry.lt) === expectedLt;
      const hash = Buffer.from(entry.hash()).toString("base64");
      const hashMatches = !expectedHash || hash === expectedHash;
      return ltMatches && hashMatches;
    }) ?? txs[0];
  if (!tx) {
    throw new Error(
      "TON destination transaction was not found after broadcast.",
    );
  }
  const computePhase = tx.description?.computePhase;
  const actionPhase = tx.description?.actionPhase;
  return {
    lt: tx.lt?.toString(),
    hash: Buffer.from(tx.hash()).toString("base64"),
    aborted: Boolean(tx.description?.aborted),
    computeType: computePhase?.type ?? null,
    exitCode:
      typeof computePhase?.exitCode === "number" ? computePhase.exitCode : null,
    actionResultCode:
      typeof actionPhase?.resultCode === "number"
        ? actionPhase.resultCode
        : null,
    success: computePhase?.type === "vm" ? Boolean(computePhase.success) : null,
  };
};

const tonTransactionHashToHex = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (/^(?:0x)?[0-9a-f]{64}$/iu.test(normalized)) {
    return normalized.startsWith("0x")
      ? normalized.toLowerCase()
      : `0x${normalized.toLowerCase()}`;
  }
  const base64 = normalized.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded =
    base64.length % 4 === 0
      ? base64
      : `${base64}${"=".repeat(4 - (base64.length % 4))}`;
  const bytes = Buffer.from(padded, "base64");
  if (bytes.length !== 32) {
    throw new Error(`${label} is not a 32-byte TON transaction hash.`);
  }
  return `0x${bytes.toString("hex")}`;
};

const bigIntToHex32 = (value) =>
  `0x${value.toString(16).padStart(64, "0").toLowerCase()}`;

const tryDecodeTonSourceRecordPayload = (payload) => {
  if (!payload) {
    return null;
  }
  try {
    const slice = payload.beginParse();
    const op = slice.loadUint(32);
    if (op !== 0x53434353) {
      return { opHex: `0x${op.toString(16).padStart(8, "0")}` };
    }
    return {
      opHex: "0x53434353",
      timestampMs: slice.loadUintBig(64).toString(10),
      version: slice.loadUint(16),
      messageId: bigIntToHex32(slice.loadUintBig(256)),
      payloadHash: bigIntToHex32(slice.loadUintBig(256)),
      commitmentRoot: bigIntToHex32(slice.loadUintBig(256)),
      amountBaseUnits: slice.loadUintBig(128).toString(10),
    };
  } catch (error) {
    return { error: describeError(error) };
  }
};

const createTonHarnessServer = async ({ signer, runDir }) => {
  const requests = [];
  let nextSeqno = null;
  const waitForWalletSeqnoAdvance = async (seqno, timeoutMs = 45_000) => {
    const deadline = Date.now() + timeoutMs;
    let observed = seqno;
    while (Date.now() <= deadline) {
      observed = await toncenterCall("TON wallet seqno confirmation", () =>
        signer.opened.getSeqno(),
      );
      if (observed > seqno) {
        return observed;
      }
      await wait(2_000);
    }
    throw new Error(
      `TON wallet seqno did not advance after broadcast; expected > ${seqno}, last observed ${observed}.`,
    );
  };
  const isRetryableTonExternalBroadcastError = (error) =>
    /(?:External message was not accepted|cannot apply external message|LITE_SERVER_UNKNOWN|timeout|rate limit|too many requests)/iu.test(
      describeError(error),
    );
  const isDuplicateSeqnoTonBroadcastError = (error) =>
    /Duplicate msg_seqno/iu.test(describeError(error));
  const broadcastTransferAndWait = async ({ buildTransfer, seqno }) => {
    const deadline = Date.now() + 210_000;
    let lastError = null;
    let attempt = 0;
    let activeSeqno = seqno;
    while (Date.now() <= deadline) {
      attempt += 1;
      const transfer = buildTransfer(activeSeqno);
      const transferBocBytes = transfer.toBoc({ idx: false }).length;
      if (transferBocBytes > TON_HARNESS_MAX_EXTERNAL_BOC_BYTES) {
        throw new Error(
          `TON external message is ${transferBocBytes} bytes, above the ${TON_HARNESS_MAX_EXTERNAL_BOC_BYTES}-byte live-demo safety limit; reduce the proof upload batch size.`,
        );
      }
      try {
        await toncenterCall(
          `TON external message broadcast attempt ${attempt}`,
          () => signer.client.sendExternalMessage(signer.wallet, transfer),
        );
      } catch (error) {
        lastError = error;
        if (isDuplicateSeqnoTonBroadcastError(error)) {
          try {
            const confirmedSeqno = await waitForWalletSeqnoAdvance(
              activeSeqno,
              120_000,
            );
            return {
              transfer,
              seqno: activeSeqno,
              confirmedSeqno,
              attempts: attempt,
            };
          } catch (confirmationError) {
            lastError = confirmationError;
          }
        }
        if (!isRetryableTonExternalBroadcastError(error)) {
          throw error;
        }
        const observed = await toncenterCall("TON wallet seqno refresh", () =>
          signer.opened.getSeqno(),
        );
        activeSeqno = observed;
        await wait(Math.min(3_000 * attempt, 15_000));
        continue;
      }
      try {
        const confirmedSeqno = await waitForWalletSeqnoAdvance(activeSeqno);
        return {
          transfer,
          seqno: activeSeqno,
          confirmedSeqno,
          attempts: attempt,
        };
      } catch (error) {
        lastError = error;
        const observed = await toncenterCall(
          "TON wallet seqno retry check",
          () => signer.opened.getSeqno(),
        );
        if (observed > activeSeqno) {
          return {
            transfer,
            seqno: activeSeqno,
            confirmedSeqno: observed,
            attempts: attempt,
          };
        }
        activeSeqno = observed;
        await wait(Math.min(5_000 * attempt, 20_000));
      }
    }
    throw new Error(
      `TON wallet seqno did not advance after ${attempt} broadcast attempts; ${describeError(lastError)}`,
    );
  };
  const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Headers", "content-type");
    response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    if (request.method === "OPTIONS") {
      response.writeHead(204).end();
      return;
    }
    if (request.method !== "POST" || request.url !== "/ton-send") {
      response
        .writeHead(404, { "content-type": "application/json" })
        .end(JSON.stringify({ error: "not_found" }));
      return;
    }
    try {
      const chunks = [];
      for await (const chunk of request) {
        chunks.push(chunk);
      }
      const transaction = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      const messageRequest = validateTonMessageRequest(
        transaction,
        signer.rawAddress,
      );
      if (nextSeqno === null) {
        nextSeqno = await toncenterCall("TON wallet seqno", () =>
          signer.opened.getSeqno(),
        );
      }
      const seqno = nextSeqno;
      const buildTransfer = (transferSeqno = seqno) =>
        signer.wallet.createTransfer({
          seqno: transferSeqno,
          secretKey: signer.keyPair.secretKey,
          timeout: messageRequest.validUntil,
          sendMode: SendMode.PAY_GAS_SEPARATELY,
          messages: messageRequest.messages.map((message) =>
            internal({
              to: message.to,
              // eslint-disable-next-line no-undef
              value: BigInt(message.amount),
              bounce: false,
              body: message.payload,
            }),
          ),
        });
      const {
        transfer,
        seqno: submittedSeqno,
        confirmedSeqno,
        attempts,
      } = await broadcastTransferAndWait({
        buildTransfer,
        seqno,
      });
      nextSeqno = confirmedSeqno;
      const entries = [];
      for (const message of messageRequest.messages) {
        const destinationState = await toncenterCall(
          "TON destination state",
          () => signer.client.getContractState(message.to),
        );
        const destinationTransactionStatus = await readTonTransactionStatus(
          signer.client,
          message.to,
          destinationState.lastTransaction ?? null,
        );
        if (
          destinationTransactionStatus.aborted ||
          destinationTransactionStatus.exitCode !== 0 ||
          (destinationTransactionStatus.actionResultCode !== null &&
            destinationTransactionStatus.actionResultCode !== 0)
        ) {
          throw new Error(
            `TON destination transaction rejected: exit=${destinationTransactionStatus.exitCode}, action=${destinationTransactionStatus.actionResultCode}, aborted=${destinationTransactionStatus.aborted}`,
          );
        }
        const destinationTransactionHash = tonTransactionHashToHex(
          destinationTransactionStatus.hash ??
            destinationState.lastTransaction?.hash,
          "TON destination transaction hash",
        );
        const entry = {
          submittedAtMs: Date.now(),
          seqno: submittedSeqno,
          confirmedSeqno,
          from: signer.rawAddress,
          to: message.to.toRawString().toLowerCase(),
          amountNano: message.amount,
          payloadBocHex: message.payload
            ? `0x${message.payload.toBoc({ idx: false }).toString("hex")}`
            : "",
          decodedSourceRecord: tryDecodeTonSourceRecordPayload(message.payload),
          bocSha256: Buffer.from(transfer.hash()).toString("hex"),
          hash: destinationTransactionHash,
          txHash: destinationTransactionHash,
          transactionHash: destinationTransactionHash,
          attempts,
          destinationLastTransaction: destinationState.lastTransaction ?? null,
          destinationTransactionStatus,
          batchSize: messageRequest.messages.length,
        };
        requests.push(entry);
        entries.push(entry);
      }
      const entry = entries.at(-1);
      await writeJsonFile(
        path.join(runDir, "ton-harness-sends.json"),
        requests,
      );
      response.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          boc: transfer.toBoc().toString("base64"),
          entries,
          ...entry,
        }),
      );
    } catch (error) {
      const message = describeError(error);
      response
        .writeHead(500, { "content-type": "application/json" })
        .end(JSON.stringify({ error: sanitizeLogText(message) }));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("TON harness server did not bind to a TCP port.");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
    requests,
  };
};

const installTonWalletHarness = async (page, { harnessUrl, tonAddress }) => {
  await page.exposeFunction("__irohaTonHarnessConnect", async () => ({
    address: tonAddress,
    topic: "sccp-ton-testnet-test-signer",
    connectedAtMs: Date.now(),
  }));
  await page.exposeFunction("__irohaTonHarnessDisconnect", async () => ({}));
  await page.exposeFunction("__irohaTonHarnessSendTransaction", async (tx) => {
    const response = await fetch(`${harnessUrl}/ton-send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(tx),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        payload.error || `TON harness returned HTTP ${response.status}`,
      );
    }
    return payload;
  });
  const installScript = () => {
    window.__irohaTonWalletHarness = {
      connect: () => window.__irohaTonHarnessConnect(),
      disconnect: () => window.__irohaTonHarnessDisconnect(),
      maxMessages: () => 2,
      sendTransaction: (transaction) =>
        window.__irohaTonHarnessSendTransaction(transaction),
    };
  };
  await page.addInitScript(installScript);
  await page.evaluate(installScript);
};

const bootstrapFundedTairaWallet = async (
  page,
  fundedWallet,
  { toriiUrl, chainId, networkPrefix },
) =>
  page.evaluate(
    async ({ wallet, torii, chain, prefix }) => {
      localStorage.removeItem("iroha-demo:offline");
      localStorage.setItem("iroha-demo:locale", "en-US");
      const summary = window.iroha.deriveAccountAddress({
        domain: wallet.domain,
        publicKeyHex: wallet.publicKeyHex,
        networkPrefix: prefix,
      });
      const vaultAvailable = await window.iroha
        .isSecureVaultAvailable()
        .catch(() => false);
      if (!vaultAvailable) {
        throw new Error(
          "Secure vault is unavailable for SCCP TON live bootstrap.",
        );
      }
      await window.iroha.storeAccountSecret({
        accountId: summary.accountId,
        privateKeyHex: wallet.privateKeyHex,
      });
      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: wallet.assetDefinitionId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
            hasStoredSecret: false,
          },
          accounts: [
            {
              displayName: "SCCP TON Live Proof",
              domain: wallet.domain,
              accountId: summary.accountId,
              i105AccountId: summary.i105AccountId,
              i105DefaultAccountId: summary.i105DefaultAccountId,
              publicKeyHex: wallet.publicKeyHex,
              signingAlgorithm: "ed25519",
              privateKeyHex: "",
              hasStoredSecret: true,
              localOnly: false,
            },
          ],
          activeAccountId: summary.accountId,
          customChains: [],
        }),
      );
      return {
        accountId: summary.accountId,
        i105AccountId: summary.i105AccountId,
      };
    },
    {
      wallet: fundedWallet,
      torii: toriiUrl,
      chain: chainId,
      prefix: networkPrefix,
    },
  );

const installVisibleUiPointer = async (page) => {
  const installScript = () => {
    const mountPointer = () => {
      if (!document.head || !document.body) {
        return;
      }
      if (document.getElementById("__sccp-ton-demo-pointer")) {
        return;
      }
      const style = document.createElement("style");
      style.id = "__sccp-ton-demo-pointer-style";
      style.textContent = `
      #__sccp-ton-demo-pointer {
        position: fixed;
        left: 0;
        top: 0;
        width: 24px;
        height: 24px;
        z-index: 2147483647;
        pointer-events: none;
        transform: translate(80px, 80px);
        transition: transform 260ms ease;
      }
      #__sccp-ton-demo-pointer::before {
        content: "";
        position: absolute;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #2a7fff;
        border: 3px solid #ffffff;
        box-shadow: 0 0 0 5px rgba(42, 127, 255, 0.28), 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      #__sccp-ton-demo-pointer.clicking::before {
        transform: scale(0.78);
        box-shadow: 0 0 0 12px rgba(42, 127, 255, 0.34), 0 8px 24px rgba(0, 0, 0, 0.35);
      }
      #__sccp-ton-demo-pointer-label {
        position: absolute;
        left: 28px;
        top: -10px;
        min-width: 170px;
        max-width: 420px;
        padding: 8px 11px;
        border-radius: 8px;
        background: rgba(20, 23, 31, 0.86);
        color: #ffffff;
        font: 700 14px/1.25 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      }
      #__sccp-ton-demo-caption {
        position: fixed;
        top: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483647;
        width: min(1120px, calc(100vw - 48px));
        padding: 13px 18px;
        border-radius: 8px;
        background: rgba(12, 16, 24, 0.9);
        color: #ffffff;
        font: 750 20px/1.32 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
        text-align: center;
        box-shadow: 0 12px 38px rgba(0, 0, 0, 0.34);
        pointer-events: none;
      }
    `;
      document.head.appendChild(style);
      const pointer = document.createElement("div");
      pointer.id = "__sccp-ton-demo-pointer";
      const label = document.createElement("div");
      label.id = "__sccp-ton-demo-pointer-label";
      label.textContent = "SCCP TON testnet transfer";
      pointer.appendChild(label);
      document.body.appendChild(pointer);
      const caption = document.createElement("div");
      caption.id = "__sccp-ton-demo-caption";
      caption.textContent =
        "SCCP TON testnet: route and wallet are being prepared";
      document.body.appendChild(caption);
      window.__sccpTonDemoPointer = {
        move(x, y, text) {
          pointer.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
          label.textContent = String(text || "SCCP TON testnet transfer");
        },
        click(text) {
          if (text) label.textContent = String(text);
          pointer.classList.add("clicking");
          window.setTimeout(() => pointer.classList.remove("clicking"), 320);
        },
      };
      window.__sccpTonDemoCaption = {
        set(text) {
          caption.textContent = String(text || "");
        },
      };
    };
    if (!document.head || !document.body) {
      window.addEventListener("DOMContentLoaded", mountPointer, { once: true });
      return;
    }
    mountPointer();
  };
  await page.addInitScript(installScript);
  await page.evaluate(installScript).catch(() => {});
};

const setTopCaption = async (page, text) => {
  await page
    .evaluate(
      ({ captionText }) => window.__sccpTonDemoCaption?.set(captionText),
      { captionText: text },
    )
    .catch(() => {});
};

const waitForLocatorEnabled = async (
  locator,
  label,
  { timeoutMs = 60_000, pollMs = 500 } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (
      (await locator.count().catch(() => 0)) > 0 &&
      (await locator
        .first()
        .isVisible()
        .catch(() => false)) &&
      (await locator
        .first()
        .isEnabled()
        .catch(() => false))
    ) {
      return locator.first();
    }
    await wait(pollMs);
  }
  throw new Error(`Timed out waiting for ${label} to become enabled.`);
};

const clickWithPointer = async (page, locator, label, options) => {
  const target = await waitForLocatorEnabled(locator, label, options);
  await target.scrollIntoViewIfNeeded().catch(() => {});
  const box = await target.boundingBox().catch(() => null);
  if (box) {
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page
      .evaluate(
        ({ pointerX, pointerY, pointerLabel }) =>
          window.__sccpTonDemoPointer?.move(pointerX, pointerY, pointerLabel),
        { pointerX: x, pointerY: y, pointerLabel: label },
      )
      .catch(() => {});
    await page.mouse.move(x, y, { steps: 12 }).catch(() => {});
    await wait(250);
    await page
      .evaluate(
        ({ pointerLabel }) => window.__sccpTonDemoPointer?.click(pointerLabel),
        { pointerLabel: label },
      )
      .catch(() => {});
    await page.mouse.click(x, y, { delay: 120 }).catch(async () => {
      await target.click({ timeout: 10_000 });
    });
  } else {
    await target.click({ timeout: 10_000 });
  }
  await wait(450);
  return target;
};

const fillWithPointer = async (page, locator, value, label) => {
  const target = await clickWithPointer(page, locator, label, {
    timeoutMs: 60_000,
  });
  await target.fill(value);
  await page
    .evaluate(
      ({ pointerLabel }) => window.__sccpTonDemoPointer?.click(pointerLabel),
      { pointerLabel: `${label}: filled` },
    )
    .catch(() => {});
  await wait(350);
};

const collectTransactionLinks = async (page) => {
  const links = await page
    .locator("a[href]")
    .evaluateAll((anchors) =>
      anchors.map((anchor) => ({
        label: anchor.textContent?.trim() ?? "",
        href: anchor.href,
      })),
    )
    .catch(() => []);
  const seen = new Set();
  return links.filter((link) => {
    if (!link.href || seen.has(link.href)) return false;
    seen.add(link.href);
    return true;
  });
};

const collectProofTimings = async (page) =>
  page
    .evaluate(() =>
      Array.isArray(window.__sccpProofTimings) ? window.__sccpProofTimings : [],
    )
    .catch(() => []);

const summarizeTonUploadPlan = (proofTimings) => {
  const upload = [...proofTimings]
    .reverse()
    .find((timing) => timing?.phaseId === "ton-proof-upload");
  const metadata =
    upload && typeof upload.metadata === "object" && upload.metadata !== null
      ? upload.metadata
      : {};
  const readNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    chunkCount: readNumber(metadata.chunkCount),
    batchCount: readNumber(metadata.batchCount),
    uploadBatchSize: readNumber(metadata.uploadBatchSize),
    maxPayloadBytes: readNumber(metadata.maxPayloadBytes),
    durationMs: readNumber(upload?.durationMs),
  };
};

const summarizeUniqueTonExternalTransactions = (tonHarnessSends) =>
  new Set(
    tonHarnessSends
      .map((entry) => entry.hash || entry.txHash || entry.transactionHash)
      .filter(Boolean),
  ).size;

const captureScreenshot = async (page, filePath) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  await page.screenshot({ path: filePath, fullPage: true });
  return filePath;
};

const tonExplorerAddressUrl = (rawAddress) => {
  try {
    const userFriendly = Address.parse(String(rawAddress)).toString({
      testOnly: true,
      bounceable: true,
      urlSafe: true,
    });
    return `${TON_TESTNET_EXPLORER_URL}/address/${userFriendly}`;
  } catch {
    return `${TON_TESTNET_EXPLORER_URL}/address/${encodeURIComponent(String(rawAddress ?? ""))}`;
  }
};

const tonExplorerAddressLiteral = (rawAddress) =>
  Address.parse(String(rawAddress)).toString({
    testOnly: true,
    bounceable: true,
    urlSafe: true,
  });

const tonHashBase64Url = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is empty.`);
  }
  if (/^(?:0x)?[0-9a-f]{64}$/iu.test(normalized)) {
    const hex = normalized.replace(/^0x/iu, "");
    return Buffer.from(hex, "hex").toString("base64url");
  }
  const base64 = normalized.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded =
    base64.length % 4 === 0
      ? base64
      : `${base64}${"=".repeat(4 - (base64.length % 4))}`;
  const bytes = Buffer.from(padded, "base64");
  if (bytes.length !== 32) {
    throw new Error(`${label} is not a 32-byte TON transaction hash.`);
  }
  return bytes.toString("base64url");
};

const tonExplorerTxUrlFromSend = (send) => {
  if (!send) {
    return "";
  }
  try {
    const lt = String(
      send.destinationTransactionStatus?.lt ??
        send.destinationLastTransaction?.lt ??
        "",
    ).trim();
    if (!/^[1-9]\d*$/u.test(lt)) {
      throw new Error("TON explorer transaction lt is missing.");
    }
    const hash = tonHashBase64Url(
      send.destinationTransactionStatus?.hash ??
        send.destinationLastTransaction?.hash ??
        send.hash ??
        send.txHash ??
        send.transactionHash,
      "TON explorer transaction hash",
    );
    const account = tonExplorerAddressLiteral(send.to);
    return `${TON_TESTNET_EXPLORER_URL}/tx/${lt}:${hash}:${account}`;
  } catch {
    return "";
  }
};

const buildExplorerProofLinks = ({
  links,
  tonHarnessSends,
  direction,
  tairaSourceTxHash = "",
}) => {
  const tairaExplorerLink =
    links.find((link) =>
      /taira-explorer\.sora\.org\/transactions\//iu.test(link.href),
    ) ??
    (tairaSourceTxHash
      ? {
          label:
            direction === "reverse"
              ? "TAIRA settlement transaction"
              : "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${tairaSourceTxHash}`,
        }
      : null);
  const lastTonSend = tonHarnessSends.at(-1) ?? null;
  const tonTransactionHref =
    tonExplorerTxUrlFromSend(lastTonSend) ||
    links.find((link) => /testnet\.tonscan\.org\/tx\//iu.test(link.href))
      ?.href ||
    "";
  const tonExplorerLink = tonTransactionHref
    ? {
        label:
          direction === "reverse"
            ? "TON source transaction"
            : "TON verifier transaction",
        href: tonTransactionHref,
      }
    : (links.find((link) =>
        /testnet\.tonscan\.org\/address\//iu.test(link.href),
      ) ??
      (tonHarnessSends.length
        ? {
            label:
              direction === "reverse" ? "TON source bridge" : "TON verifier",
            href: tonExplorerAddressUrl(tonHarnessSends.at(-1)?.to),
          }
        : null));
  return {
    tairaExplorerLink,
    tonExplorerLink,
  };
};

const openProofUrl = async (page, url, caption, screenshotPath) => {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await installVisibleUiPointer(page);
  await setTopCaption(page, caption);
  await wait(7_000);
  await captureScreenshot(page, screenshotPath);
};

const showExplorerProof = async (
  page,
  { links, tonHarnessSends, runDir, direction, tairaSourceTxHash },
) => {
  const { tairaExplorerLink, tonExplorerLink } = buildExplorerProofLinks({
    links,
    tonHarnessSends,
    direction,
    tairaSourceTxHash,
  });
  if (tairaExplorerLink) {
    await openProofUrl(
      page,
      tairaExplorerLink.href,
      direction === "reverse"
        ? "TAIRA Explorer: settlement transaction recorded on TAIRA testnet"
        : "TAIRA Explorer: source transaction recorded on TAIRA testnet",
      path.join(runDir, "taira-explorer.png"),
    ).catch(async (error) => {
      await setTopCaption(
        page,
        `TAIRA Explorer link: ${tairaExplorerLink.href} (${describeError(error)})`,
      );
    });
  }

  if (tonExplorerLink?.href) {
    await openProofUrl(
      page,
      tonExplorerLink.href,
      direction === "reverse"
        ? "TON Explorer: source bridge transaction is confirmed on TON testnet"
        : "TON Explorer: verifier contract received the chunked proof messages",
      path.join(runDir, "ton-explorer.png"),
    );
  }
};

const waitForRouteReadyOrDiagnostic = async (
  page,
  { timeoutMs = 45_000 } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() <= deadline) {
    const text = await page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => "");
    if (/Route ready/u.test(text)) {
      await setTopCaption(
        page,
        "TAIRA testnet route manifest is loaded and ready for TON testnet",
      );
      return { ready: true, text };
    }
    const digest = text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) =>
        /route|ton|sccp|ready|disabled|missing|proof/iu.test(line),
      )
      .slice(-18)
      .join(" | ");
    if (digest && digest !== lastText) {
      console.log(`TON UI readiness: ${sanitizeLogText(digest)}`);
      lastText = digest;
    }
    const refreshButton = page.getByRole("button", {
      name: /Refresh route|Refreshing/iu,
    });
    if (
      (await refreshButton.count().catch(() => 0)) > 0 &&
      (await refreshButton
        .first()
        .isEnabled()
        .catch(() => false))
    ) {
      await refreshButton
        .first()
        .click()
        .catch(() => {});
    }
    await wait(5_000);
  }
  const text = await page
    .locator("body")
    .innerText({ timeout: 5_000 })
    .catch(() => "");
  return { ready: false, text };
};

const waitForTonSubmitOutcome = async (
  page,
  { timeoutMs = 300_000, direction = "forward" } = {},
) => {
  const deadline = Date.now() + timeoutMs;
  let lastDiagnostic = "";
  let nextDiagnosticAt = 0;
  while (Date.now() <= deadline) {
    const [links, bodyText] = await Promise.all([
      collectTransactionLinks(page),
      page
        .locator("body")
        .innerText({ timeout: 5_000 })
        .catch(() => ""),
    ]);
    if (
      direction === "reverse" &&
      links.some((link) =>
        /TAIRA settlement transaction|taira.*explorer|explorer\.sora/iu.test(
          `${link.label} ${link.href}`,
        ),
      ) &&
      /TAIRA settlement confirmed/iu.test(bodyText)
    ) {
      return { status: "settled", links, bodyText };
    }
    if (
      direction === "forward" &&
      links.some((link) =>
        /tonviewer|testnet\.tonviewer|TON verifier contract/iu.test(
          `${link.label} ${link.href}`,
        ),
      ) &&
      /TON wallet (?:returned|accepted)|TON internal message payload is ready/iu.test(
        bodyText,
      )
    ) {
      return { status: "submitted", links, bodyText };
    }
    const diagnostic = bodyText
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) =>
        /proof|route|transaction|waiting|submitted|complete|failed|rejected|missing|disabled|timed out|error|queueing|generating|wallet approval|zk ivm/iu.test(
          line,
        ),
      )
      .slice(-24)
      .join(" | ");
    if (Date.now() >= nextDiagnosticAt) {
      if (diagnostic && diagnostic !== lastDiagnostic) {
        console.log(`TON submit state: ${sanitizeLogText(diagnostic)}`);
        lastDiagnostic = diagnostic;
        if (/split into \d+ bounded chunks/iu.test(diagnostic)) {
          await setTopCaption(
            page,
            "The TON proof is split into bounded chunks before wallet approval",
          );
        } else if (
          /proof chunks? \d+(?:-\d+)?\/\d+ accepted/iu.test(diagnostic)
        ) {
          await setTopCaption(
            page,
            "TON testnet is accepting the proof chunks one transaction at a time",
          );
        } else if (
          /signed chunked finalize|accepted the chunked finalize/iu.test(
            diagnostic,
          )
        ) {
          await setTopCaption(
            page,
            "TON testnet accepted the chunked finalize transaction",
          );
        }
      }
      nextDiagnosticAt = Date.now() + 10_000;
    }
    if (/failed|rejected|missing|disabled|timed out|error/iu.test(bodyText)) {
      if (
        /SCCP operation failed|Route readiness must be true|disabled until|TON -> TAIRA is blocked|ZK IVM prove request failed|ZK IVM prove job failed|Timed out waiting for the ZK IVM proof job|verifying key not found|Too many references|Request failed with status code/iu.test(
          bodyText,
        )
      ) {
        return { status: "failed", links, bodyText };
      }
    }
    await wait(2_000);
  }
  const [links, bodyText] = await Promise.all([
    collectTransactionLinks(page),
    page
      .locator("body")
      .innerText({ timeout: 5_000 })
      .catch(() => ""),
  ]);
  return { status: "timeout", links, bodyText };
};

const runTonAutoFlow = async (
  page,
  { amount, recipient, tairaRecipient, timeoutMs, messageId = "", direction },
) => {
  await setTopCaption(
    page,
    direction === "reverse"
      ? "TON to TAIRA testnet: checking route readiness before broadcast"
      : "TAIRA to TON testnet: checking route readiness before signing",
  );
  const readiness = await waitForRouteReadyOrDiagnostic(page);
  if (!readiness.ready) {
    await setTopCaption(
      page,
      direction === "reverse"
        ? "TON to TAIRA is blocked before broadcast: source proof material is not production-ready"
        : "TAIRA to TON is blocked: the route is not production-ready",
    );
    throw new Error(
      `TON route did not become ready in the UI: ${sanitizeLogText(readiness.text)}`,
    );
  }
  const connectButton = page.getByRole("button", {
    name: /Connect TON wallet/iu,
  });
  if ((await connectButton.count().catch(() => 0)) > 0) {
    await setTopCaption(page, "Connecting the TON testnet wallet for approval");
    await clickWithPointer(page, connectButton, "Click: Connect TON wallet", {
      timeoutMs: 60_000,
    });
  }
  await waitForRouteReadyOrDiagnostic(page);
  await setTopCaption(page, "Entering the XOR amount for the live bridge test");
  await fillWithPointer(
    page,
    page.getByLabel("Amount (XOR)"),
    amount,
    "Type amount",
  );
  if (direction === "reverse") {
    await setTopCaption(page, "Switching to TON testnet back to TAIRA");
    await clickWithPointer(
      page,
      page.getByRole("button", { name: "TON -> TAIRA" }),
      "Click: TON to TAIRA",
      { timeoutMs: 60_000 },
    );
    await fillWithPointer(
      page,
      page.getByLabel("TAIRA recipient"),
      tairaRecipient,
      "Type TAIRA recipient",
    );
    await setTopCaption(
      page,
      "Checking the TON source proof path before any return transaction is broadcast",
    );
    const reverseSubmit = page.getByRole("button", {
      name: "Prepare TON -> TAIRA",
    });
    if (
      !(await reverseSubmit.isEnabled({ timeout: 5_000 }).catch(() => false))
    ) {
      return {
        status: "failed",
        links: await collectTransactionLinks(page),
        bodyText: await page
          .locator("body")
          .innerText({ timeout: 5_000 })
          .catch(() => ""),
      };
    }
    await clickWithPointer(page, reverseSubmit, "Click: Prepare TON to TAIRA", {
      timeoutMs: 120_000,
    });
    return waitForTonSubmitOutcome(page, { timeoutMs, direction });
  }
  await fillWithPointer(
    page,
    page.getByLabel("TON recipient"),
    recipient,
    "Type TON recipient",
  );
  if (messageId) {
    await setTopCaption(page, "Fetching the existing TAIRA SCCP proof job");
    await fillWithPointer(
      page,
      page.getByLabel("Message ID"),
      messageId,
      "Type SCCP message id",
    );
    await clickWithPointer(
      page,
      page.getByRole("button", { name: "Fetch proof job" }),
      "Click: Fetch proof job",
      { timeoutMs: 120_000 },
    );
  } else {
    await setTopCaption(
      page,
      "TAIRA signs the burn-and-record transaction for TON testnet",
    );
    await clickWithPointer(
      page,
      page.getByRole("button", { name: "Prepare TAIRA -> TON" }),
      "Click: Prepare TAIRA to TON",
      { timeoutMs: 120_000 },
    );
  }
  return waitForTonSubmitOutcome(page, { timeoutMs, direction });
};

const collectVideoArtifacts = async (video, runDir) => {
  if (!video) {
    return [];
  }
  const sourcePath = await video.path().catch(() => "");
  if (!sourcePath || !existsSync(sourcePath)) {
    return [];
  }
  const stats = await import("node:fs/promises").then((fs) =>
    fs.stat(sourcePath),
  );
  return [
    {
      status: stats.size >= MIN_VIDEO_ARTIFACT_BYTES ? "captured" : "too-small",
      path: sourcePath,
      sizeBytes: stats.size,
      relativePath: path.relative(runDir, sourcePath),
    },
  ];
};

const runFfmpeg = (args) =>
  new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => {
      stderr.push(chunk);
    });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `ffmpeg exited with ${code}: ${sanitizeLogText(Buffer.concat(stderr).toString("utf8"))}`,
        ),
      );
    });
  });

const convertCapturedVideosToMp4 = async (artifacts, { runDir, direction }) => {
  const converted = [];
  for (const artifact of artifacts) {
    if (artifact.status !== "captured" || !artifact.path) {
      continue;
    }
    const outputPath = path.join(
      runDir,
      `sccp-ton-testnet-${direction}-proof.mp4`,
    );
    await runFfmpeg([
      "-y",
      "-i",
      artifact.path,
      "-vf",
      "scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "22",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-an",
      outputPath,
    ]);
    const stats = await import("node:fs/promises").then((fs) =>
      fs.stat(outputPath),
    );
    converted.push({
      status:
        stats.size >= MIN_VIDEO_ARTIFACT_BYTES ? "converted" : "too-small",
      path: outputPath,
      sizeBytes: stats.size,
      relativePath: path.relative(runDir, outputPath),
      sourcePath: artifact.path,
    });
  }
  return converted;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage);
    return;
  }

  const toriiUrl = normalizeBaseUrl(
    args["torii-url"] || DEFAULT_TAIRA_TORII_URL,
    "TAIRA Torii URL",
  );
  const tonEndpoint = normalizeBaseUrl(
    args["ton-endpoint"] || DEFAULT_TONCENTER_ENDPOINT,
    "TON endpoint",
  );
  const direction = normalizeDirection(args.direction);
  const amount = normalizeAmount(args.amount);
  const messageId =
    args["message-id"] === undefined
      ? ""
      : normalizeMessageId(args["message-id"]);
  const tairaSourceTxHash = normalizeOptionalTxHash(
    args["taira-source-tx"],
    "--taira-source-tx",
  );
  const durationMs = Number.isFinite(Number(args["duration-ms"]))
    ? Math.max(0, Math.trunc(Number(args["duration-ms"])))
    : 15_000;
  const submitTimeoutMs = Number.isFinite(Number(args["submit-timeout-ms"]))
    ? Math.max(30_000, Math.trunc(Number(args["submit-timeout-ms"])))
    : 300_000;
  const skipPreflight = parseBoolean(args["skip-preflight"]);
  const allowIncomplete = parseBoolean(args["allow-incomplete"]);
  const runDir = path.resolve(
    args["output-dir"] || path.join(defaultOutputRoot, timestampForPath()),
  );
  const tonPrivateFile = path.resolve(
    args["ton-private-file"] || defaultTonPrivateFile,
  );
  const tonPublicFile = path.resolve(
    args["ton-public-file"] || defaultTonPublicFile,
  );
  const fundedWalletFile = path.resolve(
    args["funded-wallet-file"] || defaultFundedTairaWalletFile,
  );

  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run "npm run build" first.`,
    );
  }

  await mkdir(runDir, { recursive: true });
  const [tonPublic, fundedWallet] = await Promise.all([
    readJsonFile(tonPublicFile),
    readJsonFile(fundedWalletFile),
  ]);
  const recipient = normalizeTonRawAddress(
    tonPublic?.wallets?.token?.rawAddress || tonPublic?.fundingRawAddress,
    "TON recipient",
  );
  if (!fundedWallet?.publicKeyHex || !fundedWallet?.privateKeyHex) {
    throw new Error(
      "Funded TAIRA wallet file must include publicKeyHex and privateKeyHex.",
    );
  }

  let preflight = null;
  if (!skipPreflight) {
    try {
      preflight = await runSccpTonRoutePreflight({ toriiUrl });
    } catch (error) {
      preflight = buildTonPreflightFailureReport({ toriiUrl, error });
      await writeJsonFile(
        path.join(runDir, "readiness-preflight.json"),
        preflight,
      );
      if (!allowIncomplete) {
        throw new Error(
          `${preflight.blockers.join("; ")} Use --allow-incomplete only for an incomplete diagnostic capture.`,
        );
      }
    }
    await writeJsonFile(
      path.join(runDir, "readiness-preflight.json"),
      preflight,
    );
    if (preflight.ready !== true && !allowIncomplete) {
      throw new Error(
        `TON preflight is not ready: ${preflight.blockers.join("; ")}. Use --allow-incomplete to capture the current UI rejection.`,
      );
    }
  }

  const signer = await buildTonSigner({
    privateFile: tonPrivateFile,
    endpoint: tonEndpoint,
  });
  const harnessServer = await createTonHarnessServer({ signer, runDir });

  let app = null;
  let page = null;
  let pageVideo = null;
  let flowOutcome = null;
  let mp4ConversionError = null;
  try {
    const electronEnv = {
      ...process.env,
      VITE_SCCP_TON_NETWORK: "testnet",
      VITE_SCCP_TON_E2E_WALLET: "1",
      VITE_SCCP_TONCONNECT_MANIFEST_URL:
        "https://ton-connect.github.io/demo-dapp-with-react-ui/tonconnect-manifest.json",
      SCCP_BSC_PROVER_V8_HEAP_MB:
        process.env.SCCP_BSC_PROVER_V8_HEAP_MB || "12288",
    };
    app = await electron.launch({
      args: [mainEntry],
      env: electronEnv,
      recordVideo: {
        dir: runDir,
        size: { width: 1440, height: 1000 },
      },
    });
    page = await app.firstWindow();
    pageVideo = page.video?.() ?? null;
    page.setDefaultTimeout(45_000);
    page.on("console", (message) =>
      console.log(
        `[wallet:${message.type()}] ${sanitizeLogText(message.text())}`,
      ),
    );
    page.on("pageerror", (error) =>
      console.log(`[wallet:pageerror] ${sanitizeLogText(error.message)}`),
    );
    await page.setViewportSize({ width: 1440, height: 1000 }).catch(() => {});
    await installVisibleUiPointer(page);
    await installTonWalletHarness(page, {
      harnessUrl: harnessServer.url,
      tonAddress: signer.rawAddress,
    });
    const bootstrapSummary = await bootstrapFundedTairaWallet(
      page,
      fundedWallet,
      {
        toriiUrl,
        chainId: TAIRA_CHAIN_ID,
        networkPrefix: TAIRA_NETWORK_PREFIX,
      },
    );
    const tairaRecipient = String(
      args["taira-recipient"] ||
        bootstrapSummary.i105AccountId ||
        bootstrapSummary.accountId ||
        "",
    ).trim();
    if (direction === "reverse" && !tairaRecipient) {
      throw new Error(
        "A TAIRA recipient is required for reverse TON -> TAIRA.",
      );
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.location.hash = "#/sccp";
    });
    await page
      .getByRole("main")
      .getByRole("heading", { name: "SCCP Bridge" })
      .first()
      .waitFor();
    await clickWithPointer(
      page,
      page.getByRole("button", { name: /TON testnet/iu }),
      "Click: TON testnet route tab",
      { timeoutMs: 60_000 },
    );
    await setTopCaption(
      page,
      direction === "reverse"
        ? "TON to TAIRA testnet: route and wallet are being prepared"
        : "TAIRA to TON testnet: route and wallet are being prepared",
    );
    await captureScreenshot(page, path.join(runDir, "start.png"));
    try {
      flowOutcome = await runTonAutoFlow(page, {
        amount,
        recipient,
        tairaRecipient,
        timeoutMs: submitTimeoutMs,
        messageId,
        direction,
      });
    } catch (error) {
      flowOutcome = {
        status: "error",
        error: error instanceof Error ? error.message : String(error),
        links: await collectTransactionLinks(page),
        bodyText: await page
          .locator("body")
          .innerText({ timeout: 5_000 })
          .catch(() => ""),
      };
      if (!allowIncomplete) {
        throw error;
      }
    }
    await wait(durationMs);
    await captureScreenshot(page, path.join(runDir, "app-end.png"));
    const finalLinks =
      flowOutcome?.links || (await collectTransactionLinks(page));
    const proofTimings = await collectProofTimings(page);
    const tonUploadPlan = summarizeTonUploadPlan(proofTimings);
    const uniqueTonExternalTransactions =
      summarizeUniqueTonExternalTransactions(harnessServer.requests);
    const explorerProofLinks = buildExplorerProofLinks({
      links: finalLinks,
      tonHarnessSends: harnessServer.requests,
      direction,
      tairaSourceTxHash,
    });
    await writeJsonFile(path.join(runDir, "transaction-links.json"), {
      links: finalLinks,
      tonHarnessSends: harnessServer.requests,
      explorerProofLinks,
      proofTimings,
      tonUploadPlan,
      uniqueTonExternalTransactions,
    });
    await writeJsonFile(path.join(runDir, "transcript.json"), {
      route: "taira_ton_xor",
      toriiUrl,
      tonEndpoint,
      amount,
      direction,
      messageId: messageId || null,
      tairaSourceTxHash: tairaSourceTxHash || null,
      tonSignerAddress: signer.rawAddress,
      tonRecipient: recipient,
      tairaRecipient: direction === "reverse" ? tairaRecipient : null,
      preflight,
      flowOutcome: flowOutcome
        ? {
            ...flowOutcome,
            bodyText: sanitizeLogText(flowOutcome.bodyText),
            error: flowOutcome.error
              ? sanitizeLogText(flowOutcome.error)
              : undefined,
          }
        : null,
      proofTimings,
      tonUploadPlan,
      uniqueTonExternalTransactions,
      tonHarnessSends: harnessServer.requests,
      explorerProofLinks,
      completedAtMs: Date.now(),
    });
    if (
      flowOutcome?.status !==
        (direction === "reverse" ? "settled" : "submitted") &&
      !allowIncomplete
    ) {
      throw new Error(
        `TON SCCP UI flow did not submit successfully: ${flowOutcome?.status || "unknown"}`,
      );
    }
    await showExplorerProof(page, {
      links: finalLinks,
      tonHarnessSends: harnessServer.requests,
      runDir,
      direction,
      tairaSourceTxHash,
    });
    await captureScreenshot(page, path.join(runDir, "end.png"));
  } finally {
    if (app) {
      await app.close().catch(() => {});
    }
    if (pageVideo) {
      const videoArtifacts = await collectVideoArtifacts(
        pageVideo,
        runDir,
      ).catch((error) => [
        {
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        },
      ]);
      let mp4Artifacts = [];
      try {
        mp4Artifacts = await convertCapturedVideosToMp4(videoArtifacts, {
          runDir,
          direction,
        });
      } catch (error) {
        mp4ConversionError = error;
        mp4Artifacts = [
          {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          },
        ];
      }
      await writeJsonFile(path.join(runDir, "video-artifacts.json"), [
        ...videoArtifacts,
        ...mp4Artifacts,
      ]).catch(() => {});
      for (const artifact of videoArtifacts) {
        if (artifact.status === "captured") {
          console.log(`Video artifact: ${artifact.path}`);
        } else if (artifact.error) {
          console.warn(
            `Video artifact capture failed: ${sanitizeLogText(artifact.error)}`,
          );
        }
      }
      for (const artifact of mp4Artifacts) {
        if (artifact.status === "converted") {
          console.log(`MP4 artifact: ${artifact.path}`);
        } else if (artifact.error) {
          console.warn(
            `MP4 conversion failed: ${sanitizeLogText(artifact.error)}`,
          );
        }
      }
    }
    await harnessServer.close().catch(() => {});
  }
  if (mp4ConversionError && !allowIncomplete) {
    throw mp4ConversionError;
  }
  console.log(`SCCP TON live proof artifacts: ${runDir}`);
};

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? "")) {
  main().catch((error) => {
    console.error(
      sanitizeLogText(error instanceof Error ? error.message : String(error)),
    );
    process.exit(1);
  });
}
