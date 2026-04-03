import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import { generateKeyPair, publicKeyFromPrivate, signEd25519 } from "@iroha/iroha-js";
import { deriveAccountAddressView } from "../electron/accountAddress.ts";
import { solveFaucetPowPuzzle } from "../electron/faucetPow.ts";
import { generatedSoraswapRegistry } from "../../soraswap_web/src/generated/soraswapRegistry.ts";
import {
  createConnectPreview,
  openConnectWebSocket,
  registerConnectSession,
} from "../../soraswap_web/src/services/connect.ts";
import { scaleDecimalToBaseUnits, formatBaseUnits } from "../../soraswap_web/src/services/amounts.ts";
import { buildDetachedConnectSignatureRequest } from "../../soraswap_web/src/services/connectSignature.ts";
import {
  base64ToBytes,
  buildApprovePreimage,
  bytesToHex,
  decodeConnectFrame,
  decryptConnectEnvelope,
  deriveConnectDirectionKeys,
  encodeApproveConnectFrame,
  encodeCiphertextConnectFrame,
  encodeControlConnectFrame,
  encodeOpenConnectFrame,
  encodePongConnectFrame,
  encryptConnectEnvelope,
  hexToBytes,
} from "../../soraswap_web/src/services/connectWire.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_TORII_URL = "https://taira.sora.org";
const DEFAULT_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const DEFAULT_GAS_LIMIT = 5000;
const DEFAULT_SLIPPAGE_BPS = 50n;
const DEFAULT_DERIVATION_LABEL = "default";
const DEFAULT_MODE = "spot";
const STATE_PATH = path.resolve(__dirname, "../output/soraswap-connect-wallet.json");
const TESTNET_CLIENT_CONFIG_PATH = path.resolve(
  __dirname,
  "../../soraswap/config/testnet/taira.client.toml",
);
const APP_NAME = "SoraSwap Live Trader";
const APP_URL = "https://taira.sora.org";
const CONNECT_PERMISSIONS = {
  methods: ["SIGN_REQUEST_TX", "SIGN_REQUEST_RAW"],
  events: ["DISPLAY_REQUEST"],
  resources: null,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const exists = async (targetPath) => {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
};

const trim = (value) => String(value ?? "").trim();

const tryParseIntegerUnits = (value) => {
  const normalized = trim(value);
  if (!/^-?\d+$/.test(normalized)) {
    return null;
  }
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
};

const readResponseMessage = async (response) => {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json")) {
    try {
      const payload = await response.json();
      if (payload && typeof payload === "object") {
        return trim(payload.detail ?? payload.message ?? payload.error ?? "");
      }
    } catch {
      return "";
    }
    return "";
  }
  try {
    return trim(await response.text());
  } catch {
    return "";
  }
};

const fetchJson = async (url, init) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || "request failed"}`);
  }
  return response.json();
};

const postJson = (url, body) =>
  fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

const deleteJson = async (url) => {
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  });
  if (!response.ok && response.status !== 404) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || "request failed"}`);
  }
};

const getRegistryAddress = (contractKey) => {
  const entry = generatedSoraswapRegistry.contracts.find(
    (contract) => contract.contractKey === contractKey,
  );
  return entry?.contractAddress ? trim(entry.contractAddress) : "";
};

const spotPoolAddress = getRegistryAddress("dlmm.dlmm_pool");
const spotRouterAddress = getRegistryAddress("dlmm.dlmm_router");
const n3xHubAddress = getRegistryAddress("n3x.n3x_hub");
const perpsEngineAddress = getRegistryAddress("perps.perps_engine");

const fetchAssetDefinition = (toriiUrl, assetDefinitionId) =>
  fetchJson(
    new URL(`/v1/assets/definitions/${encodeURIComponent(assetDefinitionId)}`, `${toriiUrl}/`),
  );

const normalizeAssetItem = (item) => {
  const quantity = trim(item?.quantity);
  const assetId =
    trim(item?.asset_id) ||
    trim(item?.asset?.id) ||
    trim(item?.asset?.asset_id) ||
    trim(item?.asset);
  return {
    assetId,
    assetDefinitionId: trim(assetId.split("##")[0]),
    quantity,
  };
};

const fetchAccountAssets = async (toriiUrl, accountId) => {
  const response = await fetch(
    new URL(`/v1/accounts/${encodeURIComponent(accountId)}/assets?limit=200`, `${toriiUrl}/`),
    {
      headers: {
        Accept: "application/json",
      },
    },
  );
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(`${response.status} ${response.statusText}: ${message || "request failed"}`);
  }
  const payload = await response.json();
  return Array.isArray(payload?.items) ? payload.items.map(normalizeAssetItem) : [];
};

const findPositiveBalance = (assets, assetDefinitionId) => {
  const match = assets.find((asset) => asset.assetDefinitionId === assetDefinitionId);
  if (!match) return null;
  try {
    return BigInt(match.quantity) > 0n ? match : null;
  } catch {
    return null;
  }
};

const ensureIntegerString = (label, value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const normalized = trim(value);
  if (!/^-?\d+$/.test(normalized)) {
    throw new Error(`${label} returned an unexpected integer value.`);
  }
  return normalized;
};

const fetchPoolConfig = async (toriiUrl, authority) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: spotPoolAddress,
    entrypoint: "pool_config",
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  if (!Array.isArray(response.result) || response.result.length < 6) {
    throw new Error("DLMM pool_config returned an unexpected tuple shape.");
  }
  const [baseAssetId, quoteAssetId, vaultAccountId, feePips, binStep, activeBin] = response.result;
  return {
    baseAssetId: trim(baseAssetId),
    quoteAssetId: trim(quoteAssetId),
    vaultAccountId: trim(vaultAccountId),
    feePips: Number(feePips),
    binStep: Number(binStep),
    activeBin: Number(activeBin),
  };
};

const fetchMirrorState = async (toriiUrl, authority) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: spotPoolAddress,
    entrypoint: "mirror_state",
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  if (!Array.isArray(response.result) || response.result.length < 13) {
    throw new Error("DLMM mirror_state returned an unexpected tuple shape.");
  }
  const [
    poolInitialized,
    activeBin,
    feePips,
    binStep,
    reserveBase,
    reserveQuote,
    _totalReserves,
    _binShareSupply,
    _impactCapBps,
    minReserveBase,
    minReserveQuote,
  ] = response.result;
  if (ensureIntegerString("pool_initialized", poolInitialized) !== "1") {
    throw new Error("The live DLMM pool is not initialized on this endpoint.");
  }
  return {
    activeBin: Number(activeBin),
    feePips: Number(feePips),
    binStep: Number(binStep),
    reserveBase: ensureIntegerString("reserve_base", reserveBase),
    reserveQuote: ensureIntegerString("reserve_quote", reserveQuote),
    minReserveBase: ensureIntegerString("min_reserve_base", minReserveBase),
    minReserveQuote: ensureIntegerString("min_reserve_quote", minReserveQuote),
  };
};

const fetchN3xHubConfig = async (toriiUrl, authority) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: n3xHubAddress,
    entrypoint: "hub_config",
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  if (!Array.isArray(response.result) || response.result.length < 10) {
    throw new Error("n3x hub_config returned an unexpected tuple shape.");
  }
  const [
    usdtAssetId,
    usdcAssetId,
    kusdAssetId,
    n3xAssetId,
    vaultAccountId,
    mintFeeBps,
    redeemFeeBps,
    targetUsdtBps,
    targetUsdcBps,
    targetKusdBps,
  ] = response.result;
  return {
    usdtAssetId: trim(usdtAssetId),
    usdcAssetId: trim(usdcAssetId),
    kusdAssetId: trim(kusdAssetId),
    n3xAssetId: trim(n3xAssetId),
    vaultAccountId: trim(vaultAccountId),
    mintFeeBps: Number(mintFeeBps),
    redeemFeeBps: Number(redeemFeeBps),
    targetUsdtBps: Number(targetUsdtBps),
    targetUsdcBps: Number(targetUsdcBps),
    targetKusdBps: Number(targetKusdBps),
  };
};

const quoteN3xMint = async (toriiUrl, authority, usdtIn, usdcIn, kusdIn) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: n3xHubAddress,
    entrypoint: "quote_mint",
    payload: {
      usdt_in: usdtIn,
      usdc_in: usdcIn,
      kusd_in: kusdIn,
    },
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  return ensureIntegerString("quote_mint", response.result);
};

const fetchPerpsEngineConfig = async (toriiUrl, authority) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: perpsEngineAddress,
    entrypoint: "engine_config",
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  if (!Array.isArray(response.result) || response.result.length < 6) {
    throw new Error("Perps engine_config returned an unexpected tuple shape.");
  }
  const [
    collateralAssetId,
    vaultAccountId,
    fundingBps,
    maxLeverageBps,
    maintenanceMarginBps,
    liquidationFeeBps,
  ] = response.result;
  return {
    collateralAssetId: trim(collateralAssetId),
    vaultAccountId: trim(vaultAccountId),
    fundingBps: Number(fundingBps),
    maxLeverageBps: Number(maxLeverageBps),
    maintenanceMarginBps: Number(maintenanceMarginBps),
    liquidationFeeBps: Number(liquidationFeeBps),
  };
};

const quoteActiveBin = async (toriiUrl, authority, input) => {
  const response = await postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), {
    authority,
    contract_address: spotRouterAddress,
    entrypoint: "quote_bin",
    payload: {
      reserve_base: input.reserveBase,
      reserve_quote: input.reserveQuote,
      amount_in: input.amountIn,
      fee_pips: input.feePips,
      bin_id: input.activeBin,
      bin_step: input.binStep,
      input_is_base: input.inputIsBase ? 1 : 0,
      min_reserve_base: input.minReserveBase,
      min_reserve_quote: input.minReserveQuote,
    },
    gas_limit: DEFAULT_GAS_LIMIT,
  });
  return ensureIntegerString("quote_bin", response.result);
};

const prepareContractCall = (toriiUrl, request) =>
  postJson(new URL("/v1/contracts/call", `${toriiUrl}/`), request);

const waitForPipelineStatus = async (toriiUrl, hashHex) => {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const response = await fetch(
      new URL(
        `/v1/pipeline/transactions/status?hash=${encodeURIComponent(hashHex)}&scope=auto`,
        `${toriiUrl}/`,
      ),
      {
        headers: {
          Accept: "application/json",
        },
      },
    );
    if (response.ok) {
      const payload = await response.json();
      const kind = trim(payload?.content?.status?.kind);
      if (kind) {
        if (kind === "Applied" || kind === "Committed" || kind === "Rejected" || kind === "Expired") {
          return payload;
        }
      }
    }
    if (attempt < 12) {
      await sleep(Math.min(250 * 2 ** (attempt - 1), 2000));
    }
  }
  return null;
};

const walletFileDir = path.dirname(STATE_PATH);

const decodeMultihashKey = (literal, prefix, label) => {
  const normalized = trim(literal).replace(/^0x/iu, "");
  if (normalized.length === 64 || normalized.length === 128) {
    return Buffer.from(normalized.slice(0, 64), "hex");
  }
  if (new RegExp(`^${prefix}`, "i").test(normalized) && normalized.length === 70) {
    return Buffer.from(normalized.slice(6), "hex");
  }
  throw new Error(`${label} is not a supported Ed25519 key literal.`);
};

const readTomlField = (content, pattern, label) => {
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`${label} is missing from ${TESTNET_CLIENT_CONFIG_PATH}.`);
  }
  return match[1];
};

const loadOrCreateWallet = async () => {
  if (await exists(STATE_PATH)) {
    const raw = JSON.parse(await readFile(STATE_PATH, "utf8"));
    const privateKeyHex = trim(raw.privateKeyHex).replace(/^0x/iu, "").toUpperCase();
    const publicKey = Buffer.from(publicKeyFromPrivate(Buffer.from(privateKeyHex, "hex")));
    const summary = deriveAccountAddressView({
      domain: DEFAULT_DERIVATION_LABEL,
      publicKeyHex: publicKey.toString("hex").toUpperCase(),
      networkPrefix: 369,
    });
    return {
      privateKeyHex,
      publicKeyHex: publicKey.toString("hex").toUpperCase(),
      accountId: summary.i105AccountId || summary.accountId,
      i105DefaultAccountId: summary.i105DefaultAccountId || summary.accountId,
      createdAt: raw.createdAt ?? null,
      reused: true,
    };
  }

  const pair = generateKeyPair();
  const publicKeyHex = Buffer.from(pair.publicKey).toString("hex").toUpperCase();
  const privateKeyHex = Buffer.from(pair.privateKey).toString("hex").toUpperCase();
  const summary = deriveAccountAddressView({
    domain: DEFAULT_DERIVATION_LABEL,
    publicKeyHex,
    networkPrefix: 369,
  });
  const wallet = {
    privateKeyHex,
    publicKeyHex,
    accountId: summary.i105AccountId || summary.accountId,
    i105DefaultAccountId: summary.i105DefaultAccountId || summary.accountId,
    createdAt: new Date().toISOString(),
    reused: false,
  };
  await mkdir(walletFileDir, { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(wallet, null, 2)}\n`, "utf8");
  return wallet;
};

const loadSiblingTestnetClientWallet = async () => {
  if (!(await exists(TESTNET_CLIENT_CONFIG_PATH))) {
    return null;
  }
  const config = await readFile(TESTNET_CLIENT_CONFIG_PATH, "utf8");
  const publicKey = decodeMultihashKey(
    readTomlField(config, /^\[account\][\s\S]*?^public_key *= "([^"]+)"/mu, "account.public_key"),
    "ed0120",
    "account.public_key",
  );
  const privateKey = decodeMultihashKey(
    readTomlField(config, /^\[account\][\s\S]*?^private_key = "([^"]+)"/mu, "account.private_key"),
    "802620",
    "account.private_key",
  );
  const derivedPublicKey = Buffer.from(publicKeyFromPrivate(privateKey));
  if (Buffer.compare(Buffer.from(publicKey), derivedPublicKey) !== 0) {
    throw new Error("The sibling TAIRA client private key does not match its public key.");
  }
  const publicKeyHex = Buffer.from(publicKey).toString("hex").toUpperCase();
  const summary = deriveAccountAddressView({
    domain: DEFAULT_DERIVATION_LABEL,
    publicKeyHex,
    networkPrefix: 369,
  });
  return {
    privateKeyHex: Buffer.from(privateKey).toString("hex").toUpperCase(),
    publicKeyHex,
    accountId: summary.i105AccountId || summary.accountId,
    i105DefaultAccountId: summary.i105DefaultAccountId || summary.accountId,
    createdAt: "from-sibling-client-config",
    reused: true,
    source: "sibling-testnet-client",
  };
};

const requestFaucetFunds = async (toriiUrl, accountId) => {
  const puzzleResponse = await fetchJson(new URL("/v1/accounts/faucet/puzzle", `${toriiUrl}/`));
  const powPayload =
    Number(puzzleResponse.difficulty_bits) > 0
      ? await solveFaucetPowPuzzle(accountId, puzzleResponse)
      : null;
  return await postJson(new URL("/v1/accounts/faucet", `${toriiUrl}/`), {
    account_id: accountId,
    ...(powPayload
      ? {
          pow_anchor_height: powPayload.anchorHeight,
          pow_nonce_hex: powPayload.nonceHex,
        }
      : {}),
  });
};

const waitForSocketOpen = (socket, label) =>
  new Promise((resolve, reject) => {
    if (socket.readyState === socket.OPEN) {
      resolve();
      return;
    }
    const cleanup = () => {
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("error", handleError);
      socket.removeEventListener("close", handleClose);
    };
    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error(`${label} WebSocket error before opening.`));
    };
    const handleClose = (event) => {
      cleanup();
      reject(new Error(`${label} WebSocket closed before opening: ${event.reason || event.code}`));
    };
    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
    socket.addEventListener("close", handleClose, { once: true });
  });

const readMessageBytes = async (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return new Uint8Array(value);
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new Error("Unsupported WebSocket message type.");
};

const deleteConnectSession = async (toriiUrl, sid) =>
  deleteJson(new URL(`/v1/connect/session/${encodeURIComponent(sid)}`, `${toriiUrl}/`));

const resolveWalletWithAssets = async (toriiUrl, wallet, assets, requiredAssetIds) => {
  const currentAsset = requiredAssetIds
    .map((assetId) => findPositiveBalance(assets, assetId))
    .find(Boolean);
  if (currentAsset) {
    return {
      wallet,
      assets,
      matchedAsset: currentAsset,
      source: "current",
    };
  }

  const siblingWallet = await loadSiblingTestnetClientWallet();
  if (!siblingWallet) {
    return null;
  }
  const siblingAssets = await fetchAccountAssets(toriiUrl, siblingWallet.accountId);
  const siblingAsset = requiredAssetIds
    .map((assetId) => findPositiveBalance(siblingAssets, assetId))
    .find(Boolean);
  if (!siblingAsset) {
    return null;
  }
  return {
    wallet: siblingWallet,
    assets: siblingAssets,
    matchedAsset: siblingAsset,
    source: "sibling",
  };
};

const performConnectSignature = async ({
  toriiUrl,
  chainId,
  accountId,
  privateKeyHex,
  draft,
  domainTag,
}) => {
  const preview = createConnectPreview(chainId);
  const session = await registerConnectSession(toriiUrl, preview.sid);
  if (!session?.token_app || !session?.token_wallet) {
    throw new Error("Torii Connect session registration did not return both app and wallet tokens.");
  }

  const signatureRequest = buildDetachedConnectSignatureRequest(draft, domainTag);
  const walletSessionKeys = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  );
  const walletSessionPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", walletSessionKeys.publicKey),
  );
  const walletSessionPublicKeyHex = bytesToHex(walletSessionPublicKey);
  const appSocket = openConnectWebSocket(toriiUrl, preview.sid, session.token_app, "app");
  const walletSocket = openConnectWebSocket(toriiUrl, preview.sid, session.token_wallet, "wallet");
  appSocket.binaryType = "arraybuffer";
  walletSocket.binaryType = "arraybuffer";

  let appDirectionKeys = null;
  let walletDirectionKeys = null;
  let appOutgoingSeq = 0;
  let walletOutgoingSeq = 0;
  let appOpenSent = false;

  const closeSockets = () => {
    try {
      appSocket.close(1000, "done");
    } catch {}
    try {
      walletSocket.close(1000, "done");
    } catch {}
  };

  const approvalPromise = new Promise((resolve, reject) => {
    const handleAppMessage = async (event) => {
      try {
        const frame = decodeConnectFrame(await readMessageBytes(event.data));
        if (frame.control?.type === "ping") {
          appOutgoingSeq += 1;
          appSocket.send(encodePongConnectFrame(preview.sid, appOutgoingSeq, frame.control.nonce));
          return;
        }
        if (frame.control?.type === "approve") {
          appDirectionKeys = deriveConnectDirectionKeys(preview, frame.control.walletPublicKeyHex);
          resolve(frame.control);
          return;
        }
      } catch (error) {
        reject(error);
      }
    };

    const handleFailure = (label) => (event) => {
      reject(new Error(`${label}: ${event.reason || event.message || event.type}`));
    };

    appSocket.addEventListener("message", handleAppMessage);
    appSocket.addEventListener("error", handleFailure("Connect app socket error"));
    appSocket.addEventListener("close", handleFailure("Connect app socket closed"));
  });

  const signResultPromise = new Promise((resolve, reject) => {
    const handleAppMessage = async (event) => {
      try {
        const frame = decodeConnectFrame(await readMessageBytes(event.data));
        if (frame.kind === "ciphertext" && frame.ciphertext && appDirectionKeys) {
          const envelope = decryptConnectEnvelope(
            appDirectionKeys.walletKey,
            preview.sid,
            frame.direction,
            frame.seq,
            hexToBytes(frame.ciphertext.aeadHex),
          );
          if (envelope.payload.type === "sign_result_ok") {
            resolve(envelope.payload.signature);
            return;
          }
          if (envelope.payload.type === "sign_result_err") {
            reject(new Error(`${envelope.payload.code}: ${envelope.payload.message}`));
          }
        }
      } catch (error) {
        reject(error);
      }
    };

    const handleFailure = (label) => (event) =>
      reject(new Error(`${label}: ${event.reason || event.message || event.type}`));

    appSocket.addEventListener("message", handleAppMessage);
    appSocket.addEventListener("error", handleFailure("Connect app socket error"));
    appSocket.addEventListener("close", handleFailure("Connect app socket closed"));
  });

  const walletReadyPromise = new Promise((resolve, reject) => {
    const handleWalletMessage = async (event) => {
      try {
        const frame = decodeConnectFrame(await readMessageBytes(event.data));
        if (frame.control?.type === "ping") {
          walletOutgoingSeq += 1;
          walletSocket.send(
            encodeControlConnectFrame({
              sid: preview.sid,
              direction: "wallet_to_app",
              seq: walletOutgoingSeq,
              control: {
                type: "pong",
                nonce: frame.control.nonce,
              },
            }),
          );
          return;
        }
        if (frame.control?.type === "open") {
          walletDirectionKeys = deriveConnectDirectionKeys(preview, walletSessionPublicKeyHex);
          const approvePreimage = buildApprovePreimage({
            sid: preview.sid,
            appPublicKeyHex: preview.publicKeyHex,
            walletPublicKeyHex: walletSessionPublicKeyHex,
            accountId,
            permissions: frame.control.permissions,
            proof: null,
          });
          const approveSignature = Buffer.from(
            signEd25519(approvePreimage, Buffer.from(privateKeyHex, "hex")),
          );
          walletOutgoingSeq += 1;
          walletSocket.send(
            encodeApproveConnectFrame(preview.sid, walletOutgoingSeq, {
              walletPublicKeyHex: walletSessionPublicKeyHex,
              accountId,
              permissions: frame.control.permissions,
              signature: {
                algorithmCode: 0,
                algorithmLabel: "Ed25519",
                signatureHex: approveSignature.toString("hex"),
                signatureBase64: approveSignature.toString("base64"),
              },
            }),
          );
          resolve(frame.control);
          return;
        }
        if (frame.kind === "ciphertext" && frame.ciphertext && walletDirectionKeys) {
          const envelope = decryptConnectEnvelope(
            walletDirectionKeys.appKey,
            preview.sid,
            frame.direction,
            frame.seq,
            hexToBytes(frame.ciphertext.aeadHex),
          );
          if (envelope.payload.type !== "sign_request_raw" && envelope.payload.type !== "sign_request_tx") {
            return;
          }
          const requestBytes =
            envelope.payload.type === "sign_request_raw"
              ? base64ToBytes(envelope.payload.bytesBase64)
              : base64ToBytes(envelope.payload.txBytesBase64);
          const resultSignature = Buffer.from(
            signEd25519(requestBytes, Buffer.from(privateKeyHex, "hex")),
          );
          walletOutgoingSeq += 1;
          const aead = encryptConnectEnvelope(
            walletDirectionKeys.walletKey,
            preview.sid,
            "wallet_to_app",
            walletOutgoingSeq,
            {
              type: "sign_result_ok",
              signature: {
                algorithmCode: 0,
                algorithmLabel: "Ed25519",
                signatureHex: resultSignature.toString("hex"),
                signatureBase64: resultSignature.toString("base64"),
              },
            },
          );
          walletSocket.send(
            encodeCiphertextConnectFrame({
              sid: preview.sid,
              direction: "wallet_to_app",
              seq: walletOutgoingSeq,
              aead,
            }),
          );
        }
      } catch (error) {
        reject(error);
      }
    };

    const handleFailure = (label) => (event) => {
      reject(new Error(`${label}: ${event.reason || event.message || event.type}`));
    };

    walletSocket.addEventListener("message", handleWalletMessage);
    walletSocket.addEventListener("error", handleFailure("Connect wallet socket error"));
    walletSocket.addEventListener("close", handleFailure("Connect wallet socket closed"));
  });

  try {
    await Promise.all([
      waitForSocketOpen(appSocket, "app"),
      waitForSocketOpen(walletSocket, "wallet"),
    ]);
    appSocket.send(
      encodeOpenConnectFrame(preview, {
        chainId,
        appName: APP_NAME,
        appUrl: APP_URL,
        permissions: CONNECT_PERMISSIONS,
      }),
    );
    appOutgoingSeq = 1;
    appOpenSent = true;
    await walletReadyPromise;
    await approvalPromise;
    if (!appDirectionKeys) {
      throw new Error("Connect approval did not derive shared session keys.");
    }
    appOutgoingSeq += 1;
    const aead = encryptConnectEnvelope(
      appDirectionKeys.appKey,
      preview.sid,
      "app_to_wallet",
      appOutgoingSeq,
      signatureRequest.type === "raw"
        ? {
            type: "sign_request_raw",
            domainTag: signatureRequest.domainTag,
            bytesHex: bytesToHex(base64ToBytes(signatureRequest.bytesBase64)),
            bytesBase64: signatureRequest.bytesBase64,
            bytesLength: base64ToBytes(signatureRequest.bytesBase64).length,
          }
        : {
            type: "sign_request_tx",
            txBytesHex: bytesToHex(base64ToBytes(signatureRequest.txBytesBase64)),
            txBytesBase64: signatureRequest.txBytesBase64,
            txBytesLength: base64ToBytes(signatureRequest.txBytesBase64).length,
          },
    );
    appSocket.send(
      encodeCiphertextConnectFrame({
        sid: preview.sid,
        direction: "app_to_wallet",
        seq: appOutgoingSeq,
        aead,
      }),
    );
    return {
      preview,
      session,
      signature: await signResultPromise,
    };
  } finally {
    closeSockets();
    if (appOpenSent) {
      await deleteConnectSession(toriiUrl, preview.sid).catch(() => undefined);
    }
  }
};

const prepareAndSubmitViaConnect = async ({
  toriiUrl,
  chainId,
  wallet,
  draftRequest,
  domainTag,
}) => {
  const draft = await prepareContractCall(toriiUrl, draftRequest);
  if (draft.submitted !== false) {
    throw new Error("Torii did not return a detached draft.");
  }
  if (!trim(draft.signing_message_b64) && !trim(draft.transaction_scaffold_b64) && !trim(draft.signed_transaction_b64)) {
    throw new Error("Torii draft did not include signable content.");
  }

  console.log(`Connect session draft created at ${draft.creation_time_ms}.`);
  const connect = await performConnectSignature({
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    privateKeyHex: wallet.privateKeyHex,
    draft,
    domainTag,
  });
  console.log(`IrohaConnect signed via sid ${connect.preview.sid} for ${wallet.accountId}.`);

  const submitResponse = await prepareContractCall(toriiUrl, {
    ...draftRequest,
    creation_time_ms: draft.creation_time_ms,
    public_key_hex: wallet.publicKeyHex,
    signature_b64: connect.signature.signatureBase64,
  });
  if (!trim(submitResponse.tx_hash_hex)) {
    throw new Error("Detached submit did not return a transaction hash.");
  }

  console.log(`Submitted tx: ${submitResponse.tx_hash_hex}`);
  const pipeline = await waitForPipelineStatus(toriiUrl, submitResponse.tx_hash_hex);
  const finalKind = trim(pipeline?.content?.status?.kind || "");
  console.log(`Pipeline status: ${finalKind || "pending"}`);

  return {
    draft,
    connect,
    submitResponse,
    pipeline,
    finalKind,
  };
};

const buildSpotTrade = async ({
  toriiUrl,
  wallet,
  assets,
  slippageBps,
  explicitTradeAmount,
}) => {
  if (!spotPoolAddress || !spotRouterAddress) {
    throw new Error("The generated SoraSwap testnet registry does not include the live DLMM pool/router addresses.");
  }
  const poolConfig = await fetchPoolConfig(toriiUrl, wallet.accountId);
  const mirrorState = await fetchMirrorState(toriiUrl, wallet.accountId);
  console.log(
    `Live pool pair: ${poolConfig.baseAssetId} / ${poolConfig.quoteAssetId} (vault ${poolConfig.vaultAccountId})`,
  );

  const walletSelection = await resolveWalletWithAssets(
    toriiUrl,
    wallet,
    assets,
    [poolConfig.baseAssetId, poolConfig.quoteAssetId],
  );
  if (!walletSelection?.matchedAsset) {
    throw new Error(
      `Neither the faucet wallet nor the sibling TAIRA client wallet currently holds ${poolConfig.baseAssetId} or ${poolConfig.quoteAssetId}.`,
    );
  }
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;
  const fundedAsset = walletSelection.matchedAsset;
  if (walletSelection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${wallet.accountId} because the public faucet account does not hold the live pool assets.`,
    );
  }

  const inputAssetId = fundedAsset.assetDefinitionId;
  const receiveAssetId =
    inputAssetId === poolConfig.baseAssetId ? poolConfig.quoteAssetId : poolConfig.baseAssetId;
  const [inputAssetDefinition, receiveAssetDefinition] = await Promise.all([
    fetchAssetDefinition(toriiUrl, inputAssetId),
    fetchAssetDefinition(toriiUrl, receiveAssetId),
  ]);
  const inputScale = Number(inputAssetDefinition?.spec?.scale ?? 0);
  const receiveScale = Number(receiveAssetDefinition?.spec?.scale ?? 0);
  const inputBalanceBaseUnits = BigInt(fundedAsset.quantity);
  const oneWhole = 10n ** BigInt(Math.max(0, inputScale));
  const defaultAmountBaseUnits =
    inputBalanceBaseUnits >= oneWhole
      ? oneWhole
      : inputBalanceBaseUnits > 10n
        ? inputBalanceBaseUnits / 10n
        : inputBalanceBaseUnits;
  const amountInBaseUnits = explicitTradeAmount
    ? BigInt(scaleDecimalToBaseUnits(explicitTradeAmount, inputScale, "Trade amount"))
    : defaultAmountBaseUnits;

  if (amountInBaseUnits <= 0n) {
    throw new Error("The funded wallet balance is too small to trade.");
  }
  if (amountInBaseUnits > inputBalanceBaseUnits) {
    throw new Error(
      `Requested trade amount ${explicitTradeAmount} exceeds the funded balance ${formatBaseUnits(
        inputBalanceBaseUnits.toString(),
        inputScale,
      )}.`,
    );
  }

  const amountCandidates = [];
  if (explicitTradeAmount) {
    amountCandidates.push(amountInBaseUnits);
  } else {
    let candidate = amountInBaseUnits;
    while (candidate > 0n && candidate <= inputBalanceBaseUnits) {
      if (!amountCandidates.some((value) => value === candidate)) {
        amountCandidates.push(candidate);
      }
      candidate *= 10n;
    }
    if (!amountCandidates.some((value) => value === inputBalanceBaseUnits)) {
      amountCandidates.push(inputBalanceBaseUnits);
    }
  }

  let selectedAmountBaseUnits = amountInBaseUnits;
  let quoteBaseUnits = 0n;
  for (const candidate of amountCandidates) {
    const candidateQuote = BigInt(
      await quoteActiveBin(toriiUrl, wallet.accountId, {
        reserveBase: mirrorState.reserveBase,
        reserveQuote: mirrorState.reserveQuote,
        amountIn: candidate.toString(),
        feePips: poolConfig.feePips,
        activeBin: mirrorState.activeBin,
        binStep: mirrorState.binStep,
        inputIsBase: inputAssetId === poolConfig.baseAssetId,
        minReserveBase: mirrorState.minReserveBase,
        minReserveQuote: mirrorState.minReserveQuote,
      }),
    );
    if (candidateQuote > 0n) {
      selectedAmountBaseUnits = candidate;
      quoteBaseUnits = candidateQuote;
      break;
    }
  }
  if (quoteBaseUnits <= 0n) {
    throw new Error("The live quote returned zero output for every tested amount on this wallet balance.");
  }
  const minOutBaseUnits = (quoteBaseUnits * (10000n - slippageBps)) / 10000n;
  if (minOutBaseUnits <= 0n) {
    throw new Error("The live quote collapses to zero after slippage protection.");
  }

  console.log(
    `Input: ${formatBaseUnits(selectedAmountBaseUnits.toString(), inputScale)} ${inputAssetDefinition.alias || inputAssetId}`,
  );
  console.log(
    `Quote: ${formatBaseUnits(quoteBaseUnits.toString(), receiveScale)} ${receiveAssetDefinition.alias || receiveAssetId}`,
  );
  console.log(
    `Min out: ${formatBaseUnits(minOutBaseUnits.toString(), receiveScale)} ${receiveAssetDefinition.alias || receiveAssetId}`,
  );

  return {
    mode: "spot",
    wallet,
    draftRequest: {
      authority: wallet.accountId,
      contract_address: spotPoolAddress,
      entrypoint: "swap_exact_in_with_assets",
      payload: {
        trader: wallet.accountId,
        input_asset: inputAssetId,
        vault: poolConfig.vaultAccountId,
        base_asset: poolConfig.baseAssetId,
        quote_asset: poolConfig.quoteAssetId,
        amount_in: selectedAmountBaseUnits.toString(),
        min_out: minOutBaseUnits.toString(),
      },
      gas_limit: DEFAULT_GAS_LIMIT,
    },
    artifact: {
      pool: {
        contractAddress: spotPoolAddress,
        baseAssetId: poolConfig.baseAssetId,
        quoteAssetId: poolConfig.quoteAssetId,
        vaultAccountId: poolConfig.vaultAccountId,
      },
      trade: {
        inputAssetId,
        receiveAssetId,
        amountInBaseUnits: selectedAmountBaseUnits.toString(),
        amountInDisplay: formatBaseUnits(selectedAmountBaseUnits.toString(), inputScale),
        quoteBaseUnits: quoteBaseUnits.toString(),
        quoteDisplay: formatBaseUnits(quoteBaseUnits.toString(), receiveScale),
        minOutBaseUnits: minOutBaseUnits.toString(),
        minOutDisplay: formatBaseUnits(minOutBaseUnits.toString(), receiveScale),
        slippageBps: slippageBps.toString(),
      },
    },
  };
};

const buildN3xMintTrade = async ({
  toriiUrl,
  wallet,
  assets,
  explicitTradeAmount,
}) => {
  if (!n3xHubAddress) {
    throw new Error("The generated SoraSwap testnet registry does not include the live n3x hub address.");
  }
  const hubConfig = await fetchN3xHubConfig(toriiUrl, wallet.accountId);
  console.log(
    `Live n3x basket: ${hubConfig.usdtAssetId} / ${hubConfig.usdcAssetId} / ${hubConfig.kusdAssetId} -> ${hubConfig.n3xAssetId}`,
  );

  const walletSelection = await resolveWalletWithAssets(
    toriiUrl,
    wallet,
    assets,
    [hubConfig.usdtAssetId, hubConfig.usdcAssetId, hubConfig.kusdAssetId],
  );
  if (!walletSelection) {
    throw new Error("No connected wallet currently holds a live n3x basket asset on TAIRA.");
  }
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;
  if (walletSelection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${wallet.accountId} because the faucet wallet does not hold the live n3x basket assets.`,
    );
  }

  const [usdtDefinition, usdcDefinition, kusdDefinition, n3xDefinition] = await Promise.all([
    fetchAssetDefinition(toriiUrl, hubConfig.usdtAssetId),
    fetchAssetDefinition(toriiUrl, hubConfig.usdcAssetId),
    fetchAssetDefinition(toriiUrl, hubConfig.kusdAssetId),
    fetchAssetDefinition(toriiUrl, hubConfig.n3xAssetId),
  ]);
  const usdtScale = Number(usdtDefinition?.spec?.scale ?? 0);
  const usdcScale = Number(usdcDefinition?.spec?.scale ?? 0);
  const kusdScale = Number(kusdDefinition?.spec?.scale ?? 0);
  const n3xScale = Number(n3xDefinition?.spec?.scale ?? 0);

  const usdtInput = trim(process.env.SORASWAP_N3X_USDT || explicitTradeAmount || "10");
  const usdcInput = trim(process.env.SORASWAP_N3X_USDC || "0");
  const kusdInput = trim(process.env.SORASWAP_N3X_KUSD || "0");
  const usdtIn = scaleDecimalToBaseUnits(usdtInput, usdtScale, "USDT in", { allowZero: true });
  const usdcIn = scaleDecimalToBaseUnits(usdcInput, usdcScale, "USDC in", { allowZero: true });
  const kusdIn = scaleDecimalToBaseUnits(kusdInput, kusdScale, "KUSD in", { allowZero: true });
  if (BigInt(usdtIn) + BigInt(usdcIn) + BigInt(kusdIn) <= 0n) {
    throw new Error("Enter at least one non-zero n3x basket input.");
  }

  const balances = new Map(
    assets
      .map((asset) => [asset.assetDefinitionId, tryParseIntegerUnits(asset.quantity)])
      .filter(([, quantity]) => quantity !== null),
  );
  const requiredBalances = [
    [hubConfig.usdtAssetId, usdtIn, usdtDefinition?.alias || hubConfig.usdtAssetId],
    [hubConfig.usdcAssetId, usdcIn, usdcDefinition?.alias || hubConfig.usdcAssetId],
    [hubConfig.kusdAssetId, kusdIn, kusdDefinition?.alias || hubConfig.kusdAssetId],
  ];
  for (const [assetId, amount, label] of requiredBalances) {
    if (BigInt(amount) <= 0n) continue;
    if ((balances.get(assetId) || 0n) < BigInt(amount)) {
      throw new Error(`Wallet ${wallet.accountId} does not hold enough ${label} for this n3x mint.`);
    }
  }

  const quotedMint = await quoteN3xMint(toriiUrl, wallet.accountId, usdtIn, usdcIn, kusdIn);
  console.log(
    `Mint inputs: ${usdtInput} ${usdtDefinition.alias || hubConfig.usdtAssetId}, ${usdcInput} ${usdcDefinition.alias || hubConfig.usdcAssetId}, ${kusdInput} ${kusdDefinition.alias || hubConfig.kusdAssetId}`,
  );
  console.log(
    `Quoted n3x out: ${formatBaseUnits(quotedMint, n3xScale)} ${n3xDefinition.alias || hubConfig.n3xAssetId}`,
  );

  return {
    mode: "n3x_mint",
    wallet,
    draftRequest: {
      authority: wallet.accountId,
      contract_address: n3xHubAddress,
      entrypoint: "deposit_and_mint_with_assets",
      payload: {
        user: wallet.accountId,
        vault: hubConfig.vaultAccountId,
        usdt_asset: hubConfig.usdtAssetId,
        usdc_asset: hubConfig.usdcAssetId,
        kusd_asset: hubConfig.kusdAssetId,
        n3x_asset: hubConfig.n3xAssetId,
        usdt_in: usdtIn,
        usdc_in: usdcIn,
        kusd_in: kusdIn,
      },
      gas_limit: DEFAULT_GAS_LIMIT,
    },
    artifact: {
      hub: {
        contractAddress: n3xHubAddress,
        vaultAccountId: hubConfig.vaultAccountId,
        usdtAssetId: hubConfig.usdtAssetId,
        usdcAssetId: hubConfig.usdcAssetId,
        kusdAssetId: hubConfig.kusdAssetId,
        n3xAssetId: hubConfig.n3xAssetId,
      },
      mint: {
        usdtIn,
        usdcIn,
        kusdIn,
        usdtDisplay: usdtInput,
        usdcDisplay: usdcInput,
        kusdDisplay: kusdInput,
        quotedN3xOut: quotedMint,
        quotedN3xDisplay: formatBaseUnits(quotedMint, n3xScale),
      },
    },
  };
};

const buildPerpsOpenTrade = async ({
  toriiUrl,
  wallet,
  assets,
}) => {
  if (!perpsEngineAddress) {
    throw new Error("The generated SoraSwap testnet registry does not include the live perps engine address.");
  }
  const engineConfig = await fetchPerpsEngineConfig(toriiUrl, wallet.accountId);
  console.log(
    `Live perps collateral: ${engineConfig.collateralAssetId} (vault ${engineConfig.vaultAccountId})`,
  );

  const walletSelection = await resolveWalletWithAssets(
    toriiUrl,
    wallet,
    assets,
    [engineConfig.collateralAssetId],
  );
  if (!walletSelection?.matchedAsset) {
    throw new Error(`No connected wallet currently holds the perps collateral asset ${engineConfig.collateralAssetId}.`);
  }
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;
  if (walletSelection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${wallet.accountId} because the faucet wallet does not hold live perps collateral.`,
    );
  }

  const collateralDefinition = await fetchAssetDefinition(toriiUrl, engineConfig.collateralAssetId);
  const collateralScale = Number(collateralDefinition?.spec?.scale ?? 0);
  const sizeInput = trim(process.env.SORASWAP_PERPS_SIZE || "10");
  const direction = trim(process.env.SORASWAP_PERPS_DIRECTION || "long").toLowerCase();
  const sizeBaseUnits = BigInt(scaleDecimalToBaseUnits(sizeInput, 0, "Perps size"));
  if (sizeBaseUnits <= 0n) {
    throw new Error("Perps size must be greater than zero.");
  }

  const minimumCollateral = BigInt(
    Math.ceil((Number(sizeBaseUnits) * 10000) / Math.max(1, engineConfig.maxLeverageBps)),
  );
  const collateralInput = trim(
    process.env.SORASWAP_PERPS_COLLATERAL || minimumCollateral.toString(),
  );
  const collateralBaseUnits = BigInt(
    scaleDecimalToBaseUnits(collateralInput, collateralScale, "Perps collateral"),
  );
  const balance = BigInt(walletSelection.matchedAsset.quantity);
  if (collateralBaseUnits > balance) {
    throw new Error(
      `Requested collateral ${collateralInput} exceeds the available ${collateralDefinition.alias || engineConfig.collateralAssetId} balance.`,
    );
  }
  const entryPriceBps = trim(process.env.SORASWAP_PERPS_ENTRY_PRICE_BPS || "10000");
  const positionId =
    trim(process.env.SORASWAP_POSITION_ID) ||
    `connect_live_${Date.now().toString(36)}`.replace(/[^a-z0-9_]/g, "_");
  const signedSize = direction === "short" ? (-sizeBaseUnits).toString() : sizeBaseUnits.toString();

  console.log(
    `Opening ${direction === "short" ? "short" : "long"} perps position ${positionId}: size ${sizeBaseUnits.toString()}, collateral ${formatBaseUnits(collateralBaseUnits.toString(), collateralScale)} ${collateralDefinition.alias || engineConfig.collateralAssetId}`,
  );

  return {
    mode: "perps_open",
    wallet,
    draftRequest: {
      authority: wallet.accountId,
      contract_address: perpsEngineAddress,
      entrypoint: "open_position_priced_with_assets",
      payload: {
        trader: wallet.accountId,
        position: positionId,
        vault_account: engineConfig.vaultAccountId,
        collateral_asset: engineConfig.collateralAssetId,
        size: signedSize,
        collateral: collateralBaseUnits.toString(),
        entry_price_bps: entryPriceBps,
      },
      gas_limit: DEFAULT_GAS_LIMIT,
    },
    artifact: {
      engine: {
        contractAddress: perpsEngineAddress,
        collateralAssetId: engineConfig.collateralAssetId,
        vaultAccountId: engineConfig.vaultAccountId,
        fundingBps: String(engineConfig.fundingBps),
        maxLeverageBps: String(engineConfig.maxLeverageBps),
        maintenanceMarginBps: String(engineConfig.maintenanceMarginBps),
        liquidationFeeBps: String(engineConfig.liquidationFeeBps),
      },
      trade: {
        positionId,
        direction: direction === "short" ? "short" : "long",
        size: sizeBaseUnits.toString(),
        collateralBaseUnits: collateralBaseUnits.toString(),
        collateralDisplay: formatBaseUnits(collateralBaseUnits.toString(), collateralScale),
        entryPriceBps,
      },
    },
  };
};

const main = async () => {
  const toriiUrl = trim(process.env.SORASWAP_TORII_URL || DEFAULT_TORII_URL);
  const chainId = trim(process.env.SORASWAP_CHAIN_ID || DEFAULT_CHAIN_ID);
  const slippageBps = BigInt(trim(process.env.SORASWAP_SLIPPAGE_BPS || DEFAULT_SLIPPAGE_BPS));
  const explicitTradeAmount = trim(process.env.SORASWAP_TRADE_AMOUNT || "");
  const mode = trim(process.env.SORASWAP_MODE || DEFAULT_MODE).toLowerCase();

  console.log(`Torii: ${toriiUrl}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Mode: ${mode}`);
  if (spotPoolAddress) console.log(`DLMM pool: ${spotPoolAddress}`);
  if (spotRouterAddress) console.log(`DLMM router: ${spotRouterAddress}`);
  if (n3xHubAddress) console.log(`n3x hub: ${n3xHubAddress}`);
  if (perpsEngineAddress) console.log(`Perps engine: ${perpsEngineAddress}`);

  let wallet = await loadOrCreateWallet();
  console.log(
    wallet.reused
      ? `Reusing demo wallet ${wallet.accountId}`
      : `Created demo wallet ${wallet.accountId}`,
  );

  let assets = await fetchAccountAssets(toriiUrl, wallet.accountId);

  if (!assets.some((asset) => {
    try {
      return BigInt(asset.quantity) > 0n;
    } catch {
      return false;
    }
  })) {
    console.log("Wallet has no visible on-chain assets yet. Requesting faucet funds.");
    try {
      const faucet = await requestFaucetFunds(toriiUrl, wallet.accountId);
      console.log(
        `Faucet accepted: ${trim(faucet.amount)} units on ${trim(faucet.asset_id || faucet.asset_definition_id)} (tx ${trim(faucet.tx_hash_hex)})`,
      );
    } catch (error) {
      console.log(`Faucet request returned: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      assets = await fetchAccountAssets(toriiUrl, wallet.accountId);
      if (assets.some((asset) => {
        try {
          return BigInt(asset.quantity) > 0n;
        } catch {
          return false;
        }
      })) break;
      await sleep(2000);
    }
  }

  if (!assets.some((asset) => {
    try {
      return BigInt(asset.quantity) > 0n;
    } catch {
      return false;
    }
  })) {
    throw new Error(`Wallet ${wallet.accountId} does not have a visible funded balance yet.`);
  }

  const operation =
    mode === "n3x_mint"
      ? await buildN3xMintTrade({ toriiUrl, wallet, assets, explicitTradeAmount })
      : mode === "perps_open"
        ? await buildPerpsOpenTrade({ toriiUrl, wallet, assets })
        : await buildSpotTrade({ toriiUrl, wallet, assets, slippageBps, explicitTradeAmount });
  wallet = operation.wallet;

  const submit = await prepareAndSubmitViaConnect({
    toriiUrl,
    chainId,
    wallet,
    draftRequest: operation.draftRequest,
    domainTag: "IROHA_TORII_CONTRACT_CALL",
  });

  const artifact = {
    ranAt: new Date().toISOString(),
    mode: operation.mode,
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    draftRequest: operation.draftRequest,
    ...operation.artifact,
    connect: {
      sid: submit.connect.preview.sid,
      appUri: submit.connect.preview.appUri,
      walletUri: submit.connect.preview.walletUri,
    },
    txHashHex: submit.submitResponse.tx_hash_hex,
    pipelineStatus: submit.pipeline,
  };
  await mkdir(walletFileDir, { recursive: true });
  const artifactPath = path.resolve(walletFileDir, `soraswap-live-${operation.mode}.last.json`);
  await writeFile(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );

  console.log(`Trade artifact written to ${artifactPath}`);

  if (submit.finalKind && submit.finalKind !== "Applied" && submit.finalKind !== "Committed") {
    throw new Error(`Trade reached unexpected terminal pipeline status: ${submit.finalKind}`);
  }
};

await main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
