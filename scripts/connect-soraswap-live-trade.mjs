/* global BigInt */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Buffer } from "node:buffer";
import {
  generateKeyPair,
  publicKeyFromPrivate,
  signEd25519,
} from "@iroha/iroha-js";
import { deriveAccountAddressView } from "../electron/accountAddress.ts";
import { solveFaucetPowPuzzle } from "../electron/faucetPow.ts";
import { generatedSoraswapRegistry } from "../../soraswap_web/src/generated/soraswapRegistry.ts";
import {
  createConnectPreview,
  openConnectWebSocket,
  registerConnectSession,
} from "../../soraswap_web/src/services/connect.ts";
import {
  scaleDecimalToBaseUnits,
  formatBaseUnits,
} from "../../soraswap_web/src/services/amounts.ts";
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
const DEFAULT_MAX_RETRIES = 4;
const STATE_PATH = path.resolve(
  __dirname,
  "../output/soraswap-connect-wallet.json",
);
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
  let response;
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(url, {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init?.headers ?? {}),
        },
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_MAX_RETRIES) {
        break;
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), 2500));
    }
  }
  if (lastError) {
    throw lastError;
  }
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(
      `${response.status} ${response.statusText}: ${message || "request failed"}`,
    );
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
  let response;
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(url, {
        method: "DELETE",
        headers: {
          Accept: "application/json",
        },
      });
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_MAX_RETRIES) {
        break;
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), 2500));
    }
  }
  if (lastError) {
    throw lastError;
  }
  if (!response.ok && response.status !== 404) {
    const message = await readResponseMessage(response);
    throw new Error(
      `${response.status} ${response.statusText}: ${message || "request failed"}`,
    );
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
const farmsFarmAddress = getRegistryAddress("farms.farm");
const optionsSeriesManagerAddress = getRegistryAddress(
  "options.series_manager",
);
const coverPolicyManagerAddress = getRegistryAddress("cover.policy_manager");
const automationJobQueueAddress = getRegistryAddress("automation.job_queue");
const launchpadSaleFactoryAddress = getRegistryAddress(
  "launchpad.sale_factory",
);
const sccpBridgeAddress = getRegistryAddress("bridge.sccp_bridge");

const fetchAssetDefinition = (toriiUrl, assetDefinitionId) =>
  fetchJson(
    new URL(
      `/v1/assets/definitions/${encodeURIComponent(assetDefinitionId)}`,
      `${toriiUrl}/`,
    ),
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
  let response;
  let lastError = null;
  for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt += 1) {
    try {
      response = await fetch(
        new URL(
          `/v1/accounts/${encodeURIComponent(accountId)}/assets?limit=200`,
          `${toriiUrl}/`,
        ),
        {
          headers: {
            Accept: "application/json",
          },
        },
      );
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      if (attempt >= DEFAULT_MAX_RETRIES) {
        break;
      }
      await sleep(Math.min(500 * 2 ** (attempt - 1), 2500));
    }
  }
  if (lastError) {
    throw lastError;
  }
  if (response.status === 404) {
    return [];
  }
  if (!response.ok) {
    const message = await readResponseMessage(response);
    throw new Error(
      `${response.status} ${response.statusText}: ${message || "request failed"}`,
    );
  }
  const payload = await response.json();
  return Array.isArray(payload?.items)
    ? payload.items.map(normalizeAssetItem)
    : [];
};

const findPositiveBalance = (assets, assetDefinitionId) => {
  const match = assets.find(
    (asset) => asset.assetDefinitionId === assetDefinitionId,
  );
  if (!match) return null;
  try {
    return BigInt(match.quantity) > 0n ? match : null;
  } catch {
    return null;
  }
};

const findAssetQuantity = (assets, assetDefinitionId) => {
  const match = assets.find(
    (asset) => asset.assetDefinitionId === assetDefinitionId,
  );
  return trim(match?.quantity) || "0";
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

const retryAsync = async (label, fn, attempts = DEFAULT_MAX_RETRIES) => {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= attempts) {
        break;
      }
      console.log(`${label} attempt ${attempt}/${attempts} failed: ${message}`);
      await sleep(Math.min(500 * 2 ** (attempt - 1), 2500));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const makeLiveName = (prefix) =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`.replace(
    /[^a-z0-9_]/g,
    "_",
  );

const hasVisibleBalance = (assets) =>
  assets.some((asset) => {
    try {
      return BigInt(asset.quantity) > 0n;
    } catch {
      return false;
    }
  });

const viewContract = async (
  toriiUrl,
  authority,
  contractAddress,
  entrypoint,
  payload = null,
) => {
  const body = {
    authority,
    contract_address: contractAddress,
    entrypoint,
    gas_limit: DEFAULT_GAS_LIMIT,
  };
  if (payload !== null) {
    body.payload = payload;
  }
  return postJson(new URL("/v1/contracts/view", `${toriiUrl}/`), body);
};

const fetchPoolConfig = async (toriiUrl, authority) => {
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
      authority,
      contract_address: spotPoolAddress,
      entrypoint: "pool_config",
      gas_limit: DEFAULT_GAS_LIMIT,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 6) {
    throw new Error("DLMM pool_config returned an unexpected tuple shape.");
  }
  const [
    baseAssetId,
    quoteAssetId,
    vaultAccountId,
    feePips,
    binStep,
    activeBin,
  ] = response.result;
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
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
      authority,
      contract_address: spotPoolAddress,
      entrypoint: "mirror_state",
      gas_limit: DEFAULT_GAS_LIMIT,
    },
  );
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
    ,
    ,
    ,
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
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
      authority,
      contract_address: n3xHubAddress,
      entrypoint: "hub_config",
      gas_limit: DEFAULT_GAS_LIMIT,
    },
  );
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
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
      authority,
      contract_address: n3xHubAddress,
      entrypoint: "quote_mint",
      payload: {
        usdt_in: usdtIn,
        usdc_in: usdcIn,
        kusd_in: kusdIn,
      },
      gas_limit: DEFAULT_GAS_LIMIT,
    },
  );
  return ensureIntegerString("quote_mint", response.result);
};

const fetchPerpsEngineConfig = async (toriiUrl, authority) => {
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
      authority,
      contract_address: perpsEngineAddress,
      entrypoint: "engine_config",
      gas_limit: DEFAULT_GAS_LIMIT,
    },
  );
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

const quoteN3xRedeem = async (toriiUrl, authority, n3xAmount) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    n3xHubAddress,
    "quote_redeem",
    {
      n3x_amount: n3xAmount,
    },
  );
  return ensureIntegerString("quote_redeem", response.result);
};

const fetchFarmConfig = async (toriiUrl, authority) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    farmsFarmAddress,
    "farm_config",
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error("farm_config returned an unexpected tuple shape.");
  }
  const [stakeAssetId, rewardAssetId, treasuryAccountId, rewardRate] =
    response.result;
  return {
    stakeAssetId: trim(stakeAssetId),
    rewardAssetId: trim(rewardAssetId),
    treasuryAccountId: trim(treasuryAccountId),
    rewardRate: Number(rewardRate),
  };
};

const fetchFarmMirrorPosition = async (toriiUrl, authority, position) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    farmsFarmAddress,
    "mirror_position",
    {
      position,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 8) {
    throw new Error("farm mirror_position returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("farm_mirror_position", value),
  );
};

const fetchPerpsMirrorPosition = async (toriiUrl, authority, position) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    perpsEngineAddress,
    "mirror_position",
    {
      position,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 13) {
    throw new Error(
      "perps mirror_position returned an unexpected tuple shape.",
    );
  }
  return response.result.map((value) =>
    ensureIntegerString("perps_mirror_position", value),
  );
};

const fetchSeriesConfig = async (toriiUrl, authority, series) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    optionsSeriesManagerAddress,
    "series_config",
    { series },
  );
  if (!Array.isArray(response.result) || response.result.length < 7) {
    throw new Error("series_config returned an unexpected tuple shape.");
  }
  const [
    underlyingAssetId,
    settlementAssetId,
    treasuryAccountId,
    strikePrice,
    premium,
    expirySlot,
    active,
  ] = response.result;
  return {
    underlyingAssetId: trim(underlyingAssetId),
    settlementAssetId: trim(settlementAssetId),
    treasuryAccountId: trim(treasuryAccountId),
    strikePrice: Number(strikePrice),
    premium: Number(premium),
    expirySlot: Number(expirySlot),
    active: Number(active),
  };
};

const fetchSeriesMirror = async (toriiUrl, authority, series) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    optionsSeriesManagerAddress,
    "mirror_series",
    { series },
  );
  if (!Array.isArray(response.result) || response.result.length < 10) {
    throw new Error("mirror_series returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("options_mirror_series", value),
  );
};

const fetchTicketMirror = async (toriiUrl, authority, ticket) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    optionsSeriesManagerAddress,
    "mirror_ticket",
    { ticket },
  );
  if (!Array.isArray(response.result) || response.result.length < 6) {
    throw new Error("mirror_ticket returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("options_mirror_ticket", value),
  );
};

const fetchPolicyConfig = async (toriiUrl, authority, policy) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    coverPolicyManagerAddress,
    "policy_config",
    { policy },
  );
  if (!Array.isArray(response.result) || response.result.length < 5) {
    throw new Error("policy_config returned an unexpected tuple shape.");
  }
  const [settlementAssetId, vaultAccountId, durationSlots, payoutBps, premium] =
    response.result;
  return {
    settlementAssetId: trim(settlementAssetId),
    vaultAccountId: trim(vaultAccountId),
    durationSlots: Number(durationSlots),
    payoutBps: Number(payoutBps),
    premium: Number(premium),
  };
};

const fetchPolicyMirror = async (toriiUrl, authority, policy) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    coverPolicyManagerAddress,
    "mirror_policy",
    { policy },
  );
  if (!Array.isArray(response.result) || response.result.length < 9) {
    throw new Error("mirror_policy returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("cover_mirror_policy", value),
  );
};

const fetchBridgeListingConfig = async (toriiUrl, authority) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "listing_config",
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error(
      "bridge listing_config returned an unexpected tuple shape.",
    );
  }
  const [
    listingFeeAssetId,
    treasuryAccountId,
    listingFeeAmount,
    registryEnabled,
  ] = response.result;
  return {
    listingFeeAssetId: trim(listingFeeAssetId),
    treasuryAccountId: trim(treasuryAccountId),
    listingFeeAmount: Number(listingFeeAmount),
    registryEnabled: Number(registryEnabled),
  };
};

const fetchBridgeAssetMirror = async (toriiUrl, authority, assetKey) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "mirror_asset",
    {
      asset_key: assetKey,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error("bridge mirror_asset returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("bridge_mirror_asset", value),
  );
};

const fetchBridgeAssetConfig = async (toriiUrl, authority, assetKey) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "asset_config",
    {
      asset_key: assetKey,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 3) {
    throw new Error("bridge asset_config returned an unexpected tuple shape.");
  }
  const [assetDefinitionId, homeDomain, decimals] = response.result;
  return {
    assetDefinitionId: trim(assetDefinitionId),
    homeDomain: Number(homeDomain),
    decimals: Number(decimals),
  };
};

const fetchBridgeRouteMirror = async (toriiUrl, authority, route) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "mirror_route",
    {
      route,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error("bridge mirror_route returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("bridge_mirror_route", value),
  );
};

const fetchBridgeRouteConfig = async (toriiUrl, authority, route) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "route_config",
    {
      route,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error("bridge route_config returned an unexpected tuple shape.");
  }
  const [assetKey, remoteDomain, localAssetId, vaultAccountId] =
    response.result;
  return {
    assetKey: trim(assetKey),
    remoteDomain: Number(remoteDomain),
    localAssetId: trim(localAssetId),
    vaultAccountId: trim(vaultAccountId),
  };
};

const fetchBridgeOutboundMirror = async (toriiUrl, authority, transfer) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "mirror_outbound",
    {
      transfer,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error(
      "bridge mirror_outbound returned an unexpected tuple shape.",
    );
  }
  return response.result.map((value) =>
    ensureIntegerString("bridge_mirror_outbound", value),
  );
};

const fetchBridgeOutboundConfig = async (toriiUrl, authority, transfer) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "outbound_config",
    {
      transfer,
    },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error(
      "bridge outbound_config returned an unexpected tuple shape.",
    );
  }
  const [route, senderAccountId, recipient, amount] = response.result;
  return {
    route: trim(route),
    senderAccountId: trim(senderAccountId),
    recipient: trim(recipient),
    amount: ensureIntegerString("bridge_outbound_amount", amount),
  };
};

const fetchBridgeInboundConsumed = async (toriiUrl, authority, messageId) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    sccpBridgeAddress,
    "inbound_consumed",
    { message_id: messageId },
  );
  return ensureIntegerString("bridge_inbound_consumed", response.result);
};

const fetchJobMirror = async (toriiUrl, authority, job) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    automationJobQueueAddress,
    "mirror_job",
    { job },
  );
  if (!Array.isArray(response.result) || response.result.length < 11) {
    throw new Error("mirror_job returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("automation_mirror_job", value),
  );
};

const fetchLaunchpadSaleConfig = async (toriiUrl, authority, sale) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    launchpadSaleFactoryAddress,
    "sale_config",
    { sale },
  );
  if (!Array.isArray(response.result) || response.result.length < 8) {
    throw new Error("sale_config returned an unexpected tuple shape.");
  }
  const [
    saleAssetId,
    paymentAssetId,
    treasuryAccountId,
    unitPrice,
    softCap,
    hardCap,
    claimStartSlot,
    claimEndSlot,
  ] = response.result;
  return {
    saleAssetId: trim(saleAssetId),
    paymentAssetId: trim(paymentAssetId),
    treasuryAccountId: trim(treasuryAccountId),
    unitPrice: Number(unitPrice),
    softCap: Number(softCap),
    hardCap: Number(hardCap),
    claimStartSlot: Number(claimStartSlot),
    claimEndSlot: Number(claimEndSlot),
  };
};

const fetchLaunchpadMirrorSale = async (toriiUrl, authority, sale) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    launchpadSaleFactoryAddress,
    "mirror_sale",
    { sale },
  );
  if (!Array.isArray(response.result) || response.result.length < 13) {
    throw new Error("mirror_sale returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("launchpad_mirror_sale", value),
  );
};

const fetchLaunchpadMirrorAccounting = async (toriiUrl, authority, sale) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    launchpadSaleFactoryAddress,
    "mirror_sale_accounting",
    { sale },
  );
  if (!Array.isArray(response.result) || response.result.length < 4) {
    throw new Error(
      "mirror_sale_accounting returned an unexpected tuple shape.",
    );
  }
  return response.result.map((value) =>
    ensureIntegerString("launchpad_mirror_accounting", value),
  );
};

const fetchLaunchpadMirrorAllocation = async (
  toriiUrl,
  authority,
  allocation,
) => {
  const response = await viewContract(
    toriiUrl,
    authority,
    launchpadSaleFactoryAddress,
    "mirror_allocation",
    { allocation },
  );
  if (!Array.isArray(response.result) || response.result.length < 5) {
    throw new Error("mirror_allocation returned an unexpected tuple shape.");
  }
  return response.result.map((value) =>
    ensureIntegerString("launchpad_mirror_allocation", value),
  );
};

const quoteActiveBin = async (toriiUrl, authority, input) => {
  const response = await postJson(
    new URL("/v1/contracts/view", `${toriiUrl}/`),
    {
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
    },
  );
  return ensureIntegerString("quote_bin", response.result);
};

const prepareContractCall = (toriiUrl, request) =>
  postJson(new URL("/v1/contracts/call", `${toriiUrl}/`), request);

const waitForPipelineStatus = async (toriiUrl, hashHex) => {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
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
          if (
            kind === "Applied" ||
            kind === "Committed" ||
            kind === "Rejected" ||
            kind === "Expired"
          ) {
            return payload;
          }
        }
      }
    } catch (error) {
      void error;
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
  if (
    new RegExp(`^${prefix}`, "i").test(normalized) &&
    normalized.length === 70
  ) {
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
    const privateKeyHex = trim(raw.privateKeyHex)
      .replace(/^0x/iu, "")
      .toUpperCase();
    const publicKey = Buffer.from(
      publicKeyFromPrivate(Buffer.from(privateKeyHex, "hex")),
    );
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
  const publicKeyHex = Buffer.from(pair.publicKey)
    .toString("hex")
    .toUpperCase();
  const privateKeyHex = Buffer.from(pair.privateKey)
    .toString("hex")
    .toUpperCase();
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
    readTomlField(
      config,
      /^\[account\][\s\S]*?^public_key *= "([^"]+)"/mu,
      "account.public_key",
    ),
    "ed0120",
    "account.public_key",
  );
  const privateKey = decodeMultihashKey(
    readTomlField(
      config,
      /^\[account\][\s\S]*?^private_key = "([^"]+)"/mu,
      "account.private_key",
    ),
    "802620",
    "account.private_key",
  );
  const derivedPublicKey = Buffer.from(publicKeyFromPrivate(privateKey));
  if (Buffer.compare(Buffer.from(publicKey), derivedPublicKey) !== 0) {
    throw new Error(
      "The sibling TAIRA client private key does not match its public key.",
    );
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
  const puzzleResponse = await fetchJson(
    new URL("/v1/accounts/faucet/puzzle", `${toriiUrl}/`),
  );
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
      reject(
        new Error(
          `${label} WebSocket closed before opening: ${event.reason || event.code}`,
        ),
      );
    };
    socket.addEventListener("open", handleOpen, { once: true });
    socket.addEventListener("error", handleError, { once: true });
    socket.addEventListener("close", handleClose, { once: true });
  });

const readMessageBytes = async (value) => {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
    return new Uint8Array(value);
  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return new Uint8Array(await value.arrayBuffer());
  }
  if (typeof value === "string") {
    return new TextEncoder().encode(value);
  }
  throw new Error("Unsupported WebSocket message type.");
};

const deleteConnectSession = async (toriiUrl, sid) =>
  deleteJson(
    new URL(`/v1/connect/session/${encodeURIComponent(sid)}`, `${toriiUrl}/`),
  );

const resolveWalletWithAssets = async (
  toriiUrl,
  wallet,
  assets,
  requiredAssetIds,
) => {
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
  const siblingAssets = await fetchAccountAssets(
    toriiUrl,
    siblingWallet.accountId,
  );
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
    throw new Error(
      "Torii Connect session registration did not return both app and wallet tokens.",
    );
  }

  const signatureRequest = buildDetachedConnectSignatureRequest(
    draft,
    domainTag,
  );
  const walletSessionKeys = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits"],
  );
  const walletSessionPublicKey = new Uint8Array(
    await crypto.subtle.exportKey("raw", walletSessionKeys.publicKey),
  );
  const walletSessionPublicKeyHex = bytesToHex(walletSessionPublicKey);
  const appSocket = openConnectWebSocket(
    toriiUrl,
    preview.sid,
    session.token_app,
    "app",
  );
  const walletSocket = openConnectWebSocket(
    toriiUrl,
    preview.sid,
    session.token_wallet,
    "wallet",
  );
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
    } catch (error) {
      void error;
    }
    try {
      walletSocket.close(1000, "done");
    } catch (error) {
      void error;
    }
  };

  const approvalPromise = new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const handleAppMessage = async (event) => {
      try {
        const frame = decodeConnectFrame(await readMessageBytes(event.data));
        if (frame.control?.type === "ping") {
          appOutgoingSeq += 1;
          appSocket.send(
            encodePongConnectFrame(
              preview.sid,
              appOutgoingSeq,
              frame.control.nonce,
            ),
          );
          return;
        }
        if (frame.control?.type === "approve") {
          appDirectionKeys = deriveConnectDirectionKeys(
            preview,
            frame.control.walletPublicKeyHex,
          );
          safeResolve(frame.control);
          return;
        }
      } catch (error) {
        safeReject(error);
      }
    };

    const handleFailure = (label) => (event) => {
      safeReject(
        new Error(`${label}: ${event.reason || event.message || event.type}`),
      );
    };

    appSocket.addEventListener("message", handleAppMessage);
    appSocket.addEventListener(
      "error",
      handleFailure("Connect app socket error"),
    );
    appSocket.addEventListener(
      "close",
      handleFailure("Connect app socket closed"),
    );
  });

  const signResultPromise = new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const handleAppMessage = async (event) => {
      try {
        const frame = decodeConnectFrame(await readMessageBytes(event.data));
        if (
          frame.kind === "ciphertext" &&
          frame.ciphertext &&
          appDirectionKeys
        ) {
          const envelope = decryptConnectEnvelope(
            appDirectionKeys.walletKey,
            preview.sid,
            frame.direction,
            frame.seq,
            hexToBytes(frame.ciphertext.aeadHex),
          );
          if (envelope.payload.type === "sign_result_ok") {
            safeResolve(envelope.payload.signature);
            return;
          }
          if (envelope.payload.type === "sign_result_err") {
            safeReject(
              new Error(
                `${envelope.payload.code}: ${envelope.payload.message}`,
              ),
            );
          }
        }
      } catch (error) {
        safeReject(error);
      }
    };

    const handleFailure = (label) => (event) =>
      safeReject(
        new Error(`${label}: ${event.reason || event.message || event.type}`),
      );

    appSocket.addEventListener("message", handleAppMessage);
    appSocket.addEventListener(
      "error",
      handleFailure("Connect app socket error"),
    );
    appSocket.addEventListener(
      "close",
      handleFailure("Connect app socket closed"),
    );
  });

  const walletReadyPromise = new Promise((resolve, reject) => {
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
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
          walletDirectionKeys = deriveConnectDirectionKeys(
            preview,
            walletSessionPublicKeyHex,
          );
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
          safeResolve(frame.control);
          return;
        }
        if (
          frame.kind === "ciphertext" &&
          frame.ciphertext &&
          walletDirectionKeys
        ) {
          const envelope = decryptConnectEnvelope(
            walletDirectionKeys.appKey,
            preview.sid,
            frame.direction,
            frame.seq,
            hexToBytes(frame.ciphertext.aeadHex),
          );
          if (
            envelope.payload.type !== "sign_request_raw" &&
            envelope.payload.type !== "sign_request_tx"
          ) {
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
        safeReject(error);
      }
    };

    const handleFailure = (label) => (event) => {
      safeReject(
        new Error(`${label}: ${event.reason || event.message || event.type}`),
      );
    };

    walletSocket.addEventListener("message", handleWalletMessage);
    walletSocket.addEventListener(
      "error",
      handleFailure("Connect wallet socket error"),
    );
    walletSocket.addEventListener(
      "close",
      handleFailure("Connect wallet socket closed"),
    );
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
            txBytesHex: bytesToHex(
              base64ToBytes(signatureRequest.txBytesBase64),
            ),
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
  if (
    !trim(draft.signing_message_b64) &&
    !trim(draft.transaction_scaffold_b64) &&
    !trim(draft.signed_transaction_b64)
  ) {
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
  console.log(
    `IrohaConnect signed via sid ${connect.preview.sid} for ${wallet.accountId}.`,
  );

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
  const pipeline = await waitForPipelineStatus(
    toriiUrl,
    submitResponse.tx_hash_hex,
  );
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

const assertExpectedPipelineStatus = (label, finalKind) => {
  if (finalKind && finalKind !== "Applied" && finalKind !== "Committed") {
    throw new Error(
      `${label} reached unexpected terminal pipeline status: ${finalKind}`,
    );
  }
};

const submitConnectedStep = async ({
  name,
  toriiUrl,
  chainId,
  wallet,
  draftRequest,
}) => {
  const startedAt = new Date().toISOString();
  const submit = await retryAsync(name, () =>
    prepareAndSubmitViaConnect({
      toriiUrl,
      chainId,
      wallet,
      draftRequest,
      domainTag: "IROHA_TORII_CONTRACT_CALL",
    }),
  );
  assertExpectedPipelineStatus(name, submit.finalKind);
  return {
    name,
    startedAt,
    finishedAt: new Date().toISOString(),
    txHashHex: submit.submitResponse.tx_hash_hex,
    pipelineKind: submit.finalKind || null,
    request: draftRequest,
    connect: {
      sid: submit.connect.preview.sid,
      appUri: submit.connect.preview.appUri,
      walletUri: submit.connect.preview.walletUri,
    },
  };
};

const resolveWalletSelection = async (
  toriiUrl,
  wallet,
  assets,
  requiredAssetIds,
  label,
) => {
  const selection = await resolveWalletWithAssets(
    toriiUrl,
    wallet,
    assets,
    requiredAssetIds,
  );
  if (!selection?.matchedAsset) {
    throw new Error(label);
  }
  if (selection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${selection.wallet.accountId} because the demo wallet does not hold the required live assets.`,
    );
  }
  return selection;
};

const buildSpotTrade = async ({
  toriiUrl,
  wallet,
  assets,
  slippageBps,
  explicitTradeAmount,
}) => {
  if (!spotPoolAddress || !spotRouterAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live DLMM pool/router addresses.",
    );
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
    inputAssetId === poolConfig.baseAssetId
      ? poolConfig.quoteAssetId
      : poolConfig.baseAssetId;
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
    ? BigInt(
        scaleDecimalToBaseUnits(
          explicitTradeAmount,
          inputScale,
          "Trade amount",
        ),
      )
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
    throw new Error(
      "The live quote returned zero output for every tested amount on this wallet balance.",
    );
  }
  const minOutBaseUnits = (quoteBaseUnits * (10000n - slippageBps)) / 10000n;
  if (minOutBaseUnits <= 0n) {
    throw new Error(
      "The live quote collapses to zero after slippage protection.",
    );
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
        amountInDisplay: formatBaseUnits(
          selectedAmountBaseUnits.toString(),
          inputScale,
        ),
        quoteBaseUnits: quoteBaseUnits.toString(),
        quoteDisplay: formatBaseUnits(quoteBaseUnits.toString(), receiveScale),
        minOutBaseUnits: minOutBaseUnits.toString(),
        minOutDisplay: formatBaseUnits(
          minOutBaseUnits.toString(),
          receiveScale,
        ),
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
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live n3x hub address.",
    );
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
    throw new Error(
      "No connected wallet currently holds a live n3x basket asset on TAIRA.",
    );
  }
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;
  if (walletSelection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${wallet.accountId} because the faucet wallet does not hold the live n3x basket assets.`,
    );
  }

  const [usdtDefinition, usdcDefinition, kusdDefinition, n3xDefinition] =
    await Promise.all([
      fetchAssetDefinition(toriiUrl, hubConfig.usdtAssetId),
      fetchAssetDefinition(toriiUrl, hubConfig.usdcAssetId),
      fetchAssetDefinition(toriiUrl, hubConfig.kusdAssetId),
      fetchAssetDefinition(toriiUrl, hubConfig.n3xAssetId),
    ]);
  const usdtScale = Number(usdtDefinition?.spec?.scale ?? 0);
  const usdcScale = Number(usdcDefinition?.spec?.scale ?? 0);
  const kusdScale = Number(kusdDefinition?.spec?.scale ?? 0);
  const n3xScale = Number(n3xDefinition?.spec?.scale ?? 0);

  const usdtInput = trim(
    process.env.SORASWAP_N3X_USDT || explicitTradeAmount || "10",
  );
  const usdcInput = trim(process.env.SORASWAP_N3X_USDC || "0");
  const kusdInput = trim(process.env.SORASWAP_N3X_KUSD || "0");
  const usdtIn = scaleDecimalToBaseUnits(usdtInput, usdtScale, "USDT in", {
    allowZero: true,
  });
  const usdcIn = scaleDecimalToBaseUnits(usdcInput, usdcScale, "USDC in", {
    allowZero: true,
  });
  const kusdIn = scaleDecimalToBaseUnits(kusdInput, kusdScale, "KUSD in", {
    allowZero: true,
  });
  if (BigInt(usdtIn) + BigInt(usdcIn) + BigInt(kusdIn) <= 0n) {
    throw new Error("Enter at least one non-zero n3x basket input.");
  }

  const balances = new Map(
    assets
      .map((asset) => [
        asset.assetDefinitionId,
        tryParseIntegerUnits(asset.quantity),
      ])
      .filter(([, quantity]) => quantity !== null),
  );
  const requiredBalances = [
    [
      hubConfig.usdtAssetId,
      usdtIn,
      usdtDefinition?.alias || hubConfig.usdtAssetId,
    ],
    [
      hubConfig.usdcAssetId,
      usdcIn,
      usdcDefinition?.alias || hubConfig.usdcAssetId,
    ],
    [
      hubConfig.kusdAssetId,
      kusdIn,
      kusdDefinition?.alias || hubConfig.kusdAssetId,
    ],
  ];
  for (const [assetId, amount, label] of requiredBalances) {
    if (BigInt(amount) <= 0n) continue;
    if ((balances.get(assetId) || 0n) < BigInt(amount)) {
      throw new Error(
        `Wallet ${wallet.accountId} does not hold enough ${label} for this n3x mint.`,
      );
    }
  }

  const quotedMint = await quoteN3xMint(
    toriiUrl,
    wallet.accountId,
    usdtIn,
    usdcIn,
    kusdIn,
  );
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

const buildPerpsOpenTrade = async ({ toriiUrl, wallet, assets }) => {
  if (!perpsEngineAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live perps engine address.",
    );
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
    throw new Error(
      `No connected wallet currently holds the perps collateral asset ${engineConfig.collateralAssetId}.`,
    );
  }
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;
  if (walletSelection.source === "sibling") {
    console.log(
      `Using sibling TAIRA client wallet ${wallet.accountId} because the faucet wallet does not hold live perps collateral.`,
    );
  }

  const collateralDefinition = await fetchAssetDefinition(
    toriiUrl,
    engineConfig.collateralAssetId,
  );
  const collateralScale = Number(collateralDefinition?.spec?.scale ?? 0);
  const sizeInput = trim(process.env.SORASWAP_PERPS_SIZE || "10");
  const direction = trim(
    process.env.SORASWAP_PERPS_DIRECTION || "long",
  ).toLowerCase();
  const sizeBaseUnits = BigInt(
    scaleDecimalToBaseUnits(sizeInput, 0, "Perps size"),
  );
  if (sizeBaseUnits <= 0n) {
    throw new Error("Perps size must be greater than zero.");
  }

  const minimumCollateral = BigInt(
    Math.ceil(
      (Number(sizeBaseUnits) * 10000) /
        Math.max(1, engineConfig.maxLeverageBps),
    ),
  );
  const collateralInput = trim(
    process.env.SORASWAP_PERPS_COLLATERAL || minimumCollateral.toString(),
  );
  const collateralBaseUnits = BigInt(
    scaleDecimalToBaseUnits(
      collateralInput,
      collateralScale,
      "Perps collateral",
    ),
  );
  const balance = BigInt(walletSelection.matchedAsset.quantity);
  if (collateralBaseUnits > balance) {
    throw new Error(
      `Requested collateral ${collateralInput} exceeds the available ${collateralDefinition.alias || engineConfig.collateralAssetId} balance.`,
    );
  }
  const entryPriceBps = trim(
    process.env.SORASWAP_PERPS_ENTRY_PRICE_BPS || "10000",
  );
  const positionId =
    trim(process.env.SORASWAP_POSITION_ID) ||
    `connect_live_${Date.now().toString(36)}`.replace(/[^a-z0-9_]/g, "_");
  const signedSize =
    direction === "short"
      ? (-sizeBaseUnits).toString()
      : sizeBaseUnits.toString();

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
        collateralDisplay: formatBaseUnits(
          collateralBaseUnits.toString(),
          collateralScale,
        ),
        entryPriceBps,
      },
    },
  };
};

const buildN3xRedeemTrade = async ({
  toriiUrl,
  wallet,
  assets,
  explicitTradeAmount,
}) => {
  if (!n3xHubAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live n3x hub address.",
    );
  }
  const hubConfig = await fetchN3xHubConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [hubConfig.n3xAssetId],
    `No connected wallet currently holds the live n3x asset ${hubConfig.n3xAssetId}.`,
  );
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;

  const n3xDefinition = await fetchAssetDefinition(
    toriiUrl,
    hubConfig.n3xAssetId,
  );
  const n3xScale = Number(n3xDefinition?.spec?.scale ?? 0);
  const n3xBalance = BigInt(walletSelection.matchedAsset.quantity);
  const defaultAmount = 10n ** BigInt(Math.max(0, n3xScale));
  const redeemAmount = explicitTradeAmount
    ? BigInt(
        scaleDecimalToBaseUnits(
          explicitTradeAmount,
          n3xScale,
          "n3x redeem amount",
        ),
      )
    : n3xBalance >= defaultAmount
      ? defaultAmount
      : n3xBalance;
  if (redeemAmount <= 0n) {
    throw new Error("The selected wallet does not hold enough n3x to redeem.");
  }
  if (redeemAmount > n3xBalance) {
    throw new Error(
      "Requested n3x redeem amount exceeds the available balance.",
    );
  }

  const redeemQuote = await quoteN3xRedeem(
    toriiUrl,
    wallet.accountId,
    redeemAmount.toString(),
  );
  console.log(
    `Redeeming ${formatBaseUnits(redeemAmount.toString(), n3xScale)} ${n3xDefinition.alias || hubConfig.n3xAssetId} for quoted basket output ${redeemQuote}.`,
  );

  return {
    mode: "n3x_redeem",
    wallet,
    draftRequest: {
      authority: wallet.accountId,
      contract_address: n3xHubAddress,
      entrypoint: "burn_and_redeem_with_assets",
      payload: {
        user: wallet.accountId,
        vault: hubConfig.vaultAccountId,
        usdt_asset: hubConfig.usdtAssetId,
        usdc_asset: hubConfig.usdcAssetId,
        kusd_asset: hubConfig.kusdAssetId,
        n3x_asset: hubConfig.n3xAssetId,
        n3x_amount: redeemAmount.toString(),
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
      redeem: {
        n3xAmountBaseUnits: redeemAmount.toString(),
        n3xAmountDisplay: formatBaseUnits(redeemAmount.toString(), n3xScale),
        quotedBasketOut: redeemQuote,
      },
    },
  };
};

const runFarmCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!farmsFarmAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live farm address.",
    );
  }
  const farmConfig = await fetchFarmConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [farmConfig.stakeAssetId, farmConfig.rewardAssetId],
    `No connected wallet currently holds the live farm assets ${farmConfig.stakeAssetId} or ${farmConfig.rewardAssetId}.`,
  );
  wallet = walletSelection.wallet;
  const positionId = trim(
    process.env.SORASWAP_FARM_POSITION || makeLiveName("live_farm"),
  );
  const rewardFundAmount = trim(process.env.SORASWAP_FARM_REWARD_FUND || "100");
  const stakeAmount = trim(process.env.SORASWAP_FARM_STAKE_AMOUNT || "3");
  const unstakeAmount = trim(process.env.SORASWAP_FARM_UNSTAKE_AMOUNT || "1");
  const rewardRate = Number(
    trim(process.env.SORASWAP_FARM_REWARD_RATE || farmConfig.rewardRate),
  );
  const stakeDefinition = await fetchAssetDefinition(
    toriiUrl,
    farmConfig.stakeAssetId,
  );
  const rewardDefinition = await fetchAssetDefinition(
    toriiUrl,
    farmConfig.rewardAssetId,
  );

  console.log(
    `Farm cycle on position ${positionId}: stake ${stakeAmount} ${stakeDefinition.alias || farmConfig.stakeAssetId}, reward fund ${rewardFundAmount} ${rewardDefinition.alias || farmConfig.rewardAssetId}.`,
  );

  const steps = [];
  steps.push(
    await submitConnectedStep({
      name: "farm_configure",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: farmsFarmAddress,
        entrypoint: "configure_farm",
        payload: { reward_rate: rewardRate },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "farm_fund_rewards",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: farmsFarmAddress,
        entrypoint: "fund_rewards_with_assets",
        payload: {
          funder: wallet.accountId,
          treasury: farmConfig.treasuryAccountId,
          reward_asset: farmConfig.rewardAssetId,
          amount: rewardFundAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "farm_stake",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: farmsFarmAddress,
        entrypoint: "stake_with_assets",
        payload: {
          staker: wallet.accountId,
          position: positionId,
          treasury: farmConfig.treasuryAccountId,
          stake_asset: farmConfig.stakeAssetId,
          amount: stakeAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "farm_claim",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: farmsFarmAddress,
        entrypoint: "claim_with_assets",
        payload: {
          staker: wallet.accountId,
          position: positionId,
          treasury: farmConfig.treasuryAccountId,
          reward_asset: farmConfig.rewardAssetId,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "farm_unstake",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: farmsFarmAddress,
        entrypoint: "unstake_with_assets",
        payload: {
          staker: wallet.accountId,
          position: positionId,
          treasury: farmConfig.treasuryAccountId,
          stake_asset: farmConfig.stakeAssetId,
          amount: unstakeAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const finalMirror = await retryAsync("farm mirror_position", () =>
    fetchFarmMirrorPosition(toriiUrl, wallet.accountId, positionId),
  );

  return {
    ranAt: new Date().toISOString(),
    mode: "farm_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    farm: {
      contractAddress: farmsFarmAddress,
      stakeAssetId: farmConfig.stakeAssetId,
      rewardAssetId: farmConfig.rewardAssetId,
      treasuryAccountId: farmConfig.treasuryAccountId,
      rewardRate,
    },
    positionId,
    rewardFundAmount,
    stakeAmount,
    unstakeAmount,
    steps,
    finalMirror,
  };
};

const runPerpsCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!perpsEngineAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live perps engine address.",
    );
  }
  const engineConfig = await fetchPerpsEngineConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [engineConfig.collateralAssetId],
    `No connected wallet currently holds the live perps collateral asset ${engineConfig.collateralAssetId}.`,
  );
  wallet = walletSelection.wallet;

  const collateralDefinition = await fetchAssetDefinition(
    toriiUrl,
    engineConfig.collateralAssetId,
  );
  const collateralScale = Number(collateralDefinition?.spec?.scale ?? 0);
  const positionId = trim(
    process.env.SORASWAP_PERPS_POSITION || makeLiveName("live_perps"),
  );
  const size = trim(process.env.SORASWAP_PERPS_SIZE || "1000");
  const initialCollateral = trim(
    process.env.SORASWAP_PERPS_INITIAL_COLLATERAL || "250",
  );
  const addCollateral = trim(process.env.SORASWAP_PERPS_ADD_COLLATERAL || "50");
  const removeCollateral = trim(
    process.env.SORASWAP_PERPS_REMOVE_COLLATERAL || "40",
  );
  const entryPriceBps = Number(
    trim(process.env.SORASWAP_PERPS_ENTRY_PRICE_BPS || "10000"),
  );
  const fundingMarkPriceBps = Number(
    trim(process.env.SORASWAP_PERPS_FUNDING_MARK_PRICE_BPS || "11000"),
  );
  const fundingIndexPriceBps = Number(
    trim(process.env.SORASWAP_PERPS_FUNDING_INDEX_PRICE_BPS || "10000"),
  );
  const exitMarkPriceBps = Number(
    trim(process.env.SORASWAP_PERPS_EXIT_MARK_PRICE_BPS || "10200"),
  );

  console.log(
    `Perps cycle on ${positionId}: size ${size}, collateral ${formatBaseUnits(initialCollateral, collateralScale)} ${collateralDefinition.alias || engineConfig.collateralAssetId}.`,
  );

  const steps = [];
  steps.push(
    await submitConnectedStep({
      name: "perps_configure_risk",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: perpsEngineAddress,
        entrypoint: "configure_risk",
        payload: {
          funding_bps: engineConfig.fundingBps,
          max_leverage_bps: engineConfig.maxLeverageBps,
          maintenance_margin_bps: engineConfig.maintenanceMarginBps,
          liquidation_fee_bps: engineConfig.liquidationFeeBps,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "perps_open",
      toriiUrl,
      chainId,
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
          size,
          collateral: initialCollateral,
          entry_price_bps: entryPriceBps,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "perps_add_collateral",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: perpsEngineAddress,
        entrypoint: "add_collateral_with_assets",
        payload: {
          trader: wallet.accountId,
          position: positionId,
          vault_account: engineConfig.vaultAccountId,
          collateral_asset: engineConfig.collateralAssetId,
          amount: addCollateral,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "perps_settle_funding",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: perpsEngineAddress,
        entrypoint: "settle_funding_with_assets",
        payload: {
          trader: wallet.accountId,
          position: positionId,
          vault_account: engineConfig.vaultAccountId,
          collateral_asset: engineConfig.collateralAssetId,
          funding_bps: engineConfig.fundingBps,
          mark_price: fundingMarkPriceBps,
          index_price: fundingIndexPriceBps,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "perps_remove_collateral",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: perpsEngineAddress,
        entrypoint: "remove_collateral_with_assets",
        payload: {
          trader: wallet.accountId,
          position: positionId,
          vault_account: engineConfig.vaultAccountId,
          collateral_asset: engineConfig.collateralAssetId,
          amount: removeCollateral,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "perps_close",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: perpsEngineAddress,
        entrypoint: "close_position_marked_with_assets",
        payload: {
          trader: wallet.accountId,
          position: positionId,
          vault_account: engineConfig.vaultAccountId,
          collateral_asset: engineConfig.collateralAssetId,
          mark_price: exitMarkPriceBps,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const finalMirror = await retryAsync("perps mirror_position", () =>
    fetchPerpsMirrorPosition(toriiUrl, wallet.accountId, positionId),
  );

  return {
    ranAt: new Date().toISOString(),
    mode: "perps_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    engine: {
      contractAddress: perpsEngineAddress,
      collateralAssetId: engineConfig.collateralAssetId,
      vaultAccountId: engineConfig.vaultAccountId,
      fundingBps: engineConfig.fundingBps,
      maxLeverageBps: engineConfig.maxLeverageBps,
      maintenanceMarginBps: engineConfig.maintenanceMarginBps,
      liquidationFeeBps: engineConfig.liquidationFeeBps,
    },
    trade: {
      positionId,
      size,
      initialCollateral,
      addCollateral,
      removeCollateral,
      entryPriceBps,
      fundingMarkPriceBps,
      fundingIndexPriceBps,
      exitMarkPriceBps,
    },
    steps,
    finalMirror,
  };
};

const runOptionsCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!optionsSeriesManagerAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live options manager address.",
    );
  }
  const poolConfig = await fetchPoolConfig(toriiUrl, wallet.accountId);
  const hubConfig = await fetchN3xHubConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [hubConfig.usdtAssetId],
    `No connected wallet currently holds the live options settlement asset ${hubConfig.usdtAssetId}.`,
  );
  wallet = walletSelection.wallet;

  const seriesId = trim(
    process.env.SORASWAP_OPTIONS_SERIES || makeLiveName("live_series"),
  );
  const primaryTicketId = trim(
    process.env.SORASWAP_OPTIONS_TICKET || makeLiveName("live_option_ticket"),
  );
  const voidTicketId = trim(
    process.env.SORASWAP_OPTIONS_VOID_TICKET ||
      makeLiveName("live_option_void"),
  );
  const strikePrice = Number(
    trim(process.env.SORASWAP_OPTIONS_STRIKE_PRICE || "2"),
  );
  const premium = Number(trim(process.env.SORASWAP_OPTIONS_PREMIUM || "1"));
  const collateralAmount = Number(
    trim(process.env.SORASWAP_OPTIONS_COLLATERAL || "4"),
  );
  const exercisePayout = Number(
    trim(process.env.SORASWAP_OPTIONS_EXERCISE_PAYOUT || "2"),
  );
  const expirySlot = Number(
    trim(process.env.SORASWAP_OPTIONS_EXPIRY_SLOT || "12"),
  );

  console.log(
    `Options cycle on ${seriesId}: strike ${strikePrice}, premium ${premium}, collateral ${collateralAmount}.`,
  );

  const steps = [];
  steps.push(
    await submitConnectedStep({
      name: "options_init_series",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "init_series",
        payload: {
          series: seriesId,
          underlying_asset: poolConfig.baseAssetId,
          settlement_asset: hubConfig.usdtAssetId,
          treasury: hubConfig.vaultAccountId,
          strike_price: strikePrice,
          premium,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "options_configure_series",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "configure_series",
        payload: {
          series: seriesId,
          strike_price: strikePrice,
          premium,
          expiry_slot: expirySlot,
          active: 1,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "options_deposit_collateral",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "deposit_collateral_with_assets",
        payload: {
          owner: wallet.accountId,
          series: seriesId,
          treasury: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          amount: collateralAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  for (const [stepName, ticketId] of [
    ["options_buy", primaryTicketId],
    ["options_buy_void_ticket", voidTicketId],
  ]) {
    steps.push(
      await submitConnectedStep({
        name: stepName,
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: optionsSeriesManagerAddress,
          entrypoint: "buy_option_sized_with_assets",
          payload: {
            buyer: wallet.accountId,
            series: seriesId,
            ticket: ticketId,
            treasury: hubConfig.vaultAccountId,
            settlement_asset: hubConfig.usdtAssetId,
            premium,
            contracts: 1,
          },
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
  }
  steps.push(
    await submitConnectedStep({
      name: "options_exercise",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "exercise_with_assets",
        payload: {
          buyer: wallet.accountId,
          ticket: primaryTicketId,
          treasury: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          payout: exercisePayout,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "options_expire_series",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "expire_series",
        payload: {
          series: seriesId,
          current_slot: expirySlot,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "options_void_expired_ticket",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: optionsSeriesManagerAddress,
        entrypoint: "void_expired_ticket",
        payload: {
          ticket: voidTicketId,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const [seriesConfig, seriesMirror, primaryTicketMirror, voidTicketMirror] =
    await Promise.all([
      retryAsync("options series_config", () =>
        fetchSeriesConfig(toriiUrl, wallet.accountId, seriesId),
      ),
      retryAsync("options mirror_series", () =>
        fetchSeriesMirror(toriiUrl, wallet.accountId, seriesId),
      ),
      retryAsync("options mirror_ticket", () =>
        fetchTicketMirror(toriiUrl, wallet.accountId, primaryTicketId),
      ),
      retryAsync("options mirror_void_ticket", () =>
        fetchTicketMirror(toriiUrl, wallet.accountId, voidTicketId),
      ),
    ]);

  return {
    ranAt: new Date().toISOString(),
    mode: "options_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    seriesId,
    primaryTicketId,
    voidTicketId,
    seriesConfig,
    steps,
    seriesMirror,
    primaryTicketMirror,
    voidTicketMirror,
  };
};

const runCoverCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!coverPolicyManagerAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live cover manager address.",
    );
  }
  const hubConfig = await fetchN3xHubConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [hubConfig.usdtAssetId],
    `No connected wallet currently holds the live cover settlement asset ${hubConfig.usdtAssetId}.`,
  );
  wallet = walletSelection.wallet;

  const claimPolicyId = trim(
    process.env.SORASWAP_COVER_POLICY || makeLiveName("live_cover_claim"),
  );
  const cancelPolicyId = trim(
    process.env.SORASWAP_COVER_CANCEL_POLICY ||
      makeLiveName("live_cover_cancel"),
  );
  const expirePolicyId = trim(
    process.env.SORASWAP_COVER_EXPIRE_POLICY ||
      makeLiveName("live_cover_expire"),
  );
  const durationSlots = Number(
    trim(process.env.SORASWAP_COVER_DURATION_SLOTS || "10"),
  );
  const payoutBps = Number(
    trim(process.env.SORASWAP_COVER_PAYOUT_BPS || "8000"),
  );
  const premium = Number(trim(process.env.SORASWAP_COVER_PREMIUM || "5"));
  const coveredNotional = Number(
    trim(process.env.SORASWAP_COVER_NOTIONAL || "10"),
  );
  const cancelRefundBps = Number(
    trim(process.env.SORASWAP_COVER_CANCEL_REFUND_BPS || "5000"),
  );

  const initAndConfigure = async (policyId, stepPrefix) => {
    const steps = [];
    steps.push(
      await submitConnectedStep({
        name: `${stepPrefix}_init`,
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: coverPolicyManagerAddress,
          entrypoint: "init_policy",
          payload: {
            policy: policyId,
            settlement_asset: hubConfig.usdtAssetId,
            vault_account: hubConfig.vaultAccountId,
            duration_slots: durationSlots,
            payout_bps: payoutBps,
            premium,
          },
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
    steps.push(
      await submitConnectedStep({
        name: `${stepPrefix}_configure`,
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: coverPolicyManagerAddress,
          entrypoint: "configure_policy",
          payload: {
            policy: policyId,
            duration_slots: durationSlots,
            payout_bps: payoutBps,
            premium,
          },
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
    return steps;
  };

  const steps = [];
  steps.push(...(await initAndConfigure(claimPolicyId, "cover_claim_policy")));
  steps.push(
    await submitConnectedStep({
      name: "cover_buy_claim_policy",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "buy_policy_sized_with_assets",
        payload: {
          buyer: wallet.accountId,
          policy: claimPolicyId,
          vault_account: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          premium,
          covered_notional: coveredNotional,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_record_breach",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "record_breach",
        payload: {
          policy: claimPolicyId,
          elapsed_slots: durationSlots,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_settle_claim",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "settle_claim_with_assets",
        payload: {
          claimant: wallet.accountId,
          policy: claimPolicyId,
          vault_account: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          covered_notional: coveredNotional,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  steps.push(
    ...(await initAndConfigure(cancelPolicyId, "cover_cancel_policy")),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_buy_cancel_policy",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "buy_policy_sized_with_assets",
        payload: {
          buyer: wallet.accountId,
          policy: cancelPolicyId,
          vault_account: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          premium,
          covered_notional: coveredNotional,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_cancel_policy",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "cancel_policy_with_assets",
        payload: {
          buyer: wallet.accountId,
          policy: cancelPolicyId,
          vault_account: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          refund_bps: cancelRefundBps,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  steps.push(
    ...(await initAndConfigure(expirePolicyId, "cover_expire_policy")),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_buy_expire_policy",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "buy_policy_sized_with_assets",
        payload: {
          buyer: wallet.accountId,
          policy: expirePolicyId,
          vault_account: hubConfig.vaultAccountId,
          settlement_asset: hubConfig.usdtAssetId,
          premium,
          covered_notional: coveredNotional,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );
  steps.push(
    await submitConnectedStep({
      name: "cover_expire_policy",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: coverPolicyManagerAddress,
        entrypoint: "expire_policy",
        payload: {
          policy: expirePolicyId,
          elapsed_slots: durationSlots,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const [
    claimPolicyConfig,
    claimPolicyMirror,
    cancelPolicyMirror,
    expirePolicyMirror,
  ] = await Promise.all([
    retryAsync("cover policy_config", () =>
      fetchPolicyConfig(toriiUrl, wallet.accountId, claimPolicyId),
    ),
    retryAsync("cover claim mirror", () =>
      fetchPolicyMirror(toriiUrl, wallet.accountId, claimPolicyId),
    ),
    retryAsync("cover cancel mirror", () =>
      fetchPolicyMirror(toriiUrl, wallet.accountId, cancelPolicyId),
    ),
    retryAsync("cover expire mirror", () =>
      fetchPolicyMirror(toriiUrl, wallet.accountId, expirePolicyId),
    ),
  ]);

  return {
    ranAt: new Date().toISOString(),
    mode: "cover_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    claimPolicyId,
    cancelPolicyId,
    expirePolicyId,
    claimPolicyConfig,
    steps,
    claimPolicyMirror,
    cancelPolicyMirror,
    expirePolicyMirror,
  };
};

const runBridgeCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!sccpBridgeAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live bridge contract address.",
    );
  }

  const [hubConfig, poolConfig] = await Promise.all([
    fetchN3xHubConfig(toriiUrl, wallet.accountId),
    fetchPoolConfig(toriiUrl, wallet.accountId),
  ]);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [
      hubConfig.usdtAssetId,
      hubConfig.n3xAssetId,
      poolConfig.baseAssetId,
      poolConfig.quoteAssetId,
    ],
    "Neither the demo wallet nor the sibling TAIRA wallet currently holds an asset usable for the bridge cycle.",
  );
  wallet = walletSelection.wallet;
  assets = walletSelection.assets;

  const fundedAsset = walletSelection.matchedAsset;
  const assetDefinition = await fetchAssetDefinition(
    toriiUrl,
    fundedAsset.assetDefinitionId,
  );
  const assetDecimals = Number(assetDefinition?.spec?.scale ?? 0);
  const remoteDomain = Number(
    trim(process.env.SORASWAP_BRIDGE_REMOTE_DOMAIN || "1"),
  );
  const listingFeeAmount = Number(
    trim(process.env.SORASWAP_BRIDGE_LISTING_FEE_AMOUNT || "0"),
  );
  const bridgeAmount = ensureIntegerString(
    "bridge amount",
    trim(process.env.SORASWAP_BRIDGE_AMOUNT || "1"),
  );
  const assetKey = trim(
    process.env.SORASWAP_BRIDGE_ASSET_KEY || makeLiveName("live_bridge_asset"),
  );
  const route = trim(
    process.env.SORASWAP_BRIDGE_ROUTE || makeLiveName("live_bridge_route"),
  );
  const transferId = trim(
    process.env.SORASWAP_BRIDGE_TRANSFER_ID ||
      makeLiveName("live_bridge_transfer"),
  );
  const inboundMessageId = trim(
    process.env.SORASWAP_BRIDGE_MESSAGE_ID ||
      makeLiveName("live_bridge_message"),
  );
  const recipient = trim(
    process.env.SORASWAP_BRIDGE_RECIPIENT ||
      makeLiveName("remote_bridge_recipient"),
  );
  const assetBalanceBefore = findAssetQuantity(
    assets,
    fundedAsset.assetDefinitionId,
  );

  let listingConfig = await retryAsync("bridge listing_config", async () => {
    try {
      return await fetchBridgeListingConfig(toriiUrl, wallet.accountId);
    } catch (error) {
      if (
        error instanceof Error &&
        /bridge not initialized|assertion failed|constraint violation/i.test(
          error.message,
        )
      ) {
        return null;
      }
      throw error;
    }
  });

  const steps = [];
  if (!listingConfig) {
    steps.push(
      await submitConnectedStep({
        name: "bridge_init",
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: sccpBridgeAddress,
          entrypoint: "init_bridge",
          payload: {
            listing_fee_asset: poolConfig.baseAssetId,
            treasury: hubConfig.vaultAccountId,
            listing_fee_amount: listingFeeAmount,
          },
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
  } else if (listingConfig.registryEnabled !== 1) {
    steps.push(
      await submitConnectedStep({
        name: "bridge_configure_listing",
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: sccpBridgeAddress,
          entrypoint: "configure_listing",
          payload: {
            listing_fee_asset:
              listingConfig.listingFeeAssetId || poolConfig.baseAssetId,
            treasury:
              listingConfig.treasuryAccountId || hubConfig.vaultAccountId,
            listing_fee_amount:
              Number.isFinite(listingConfig.listingFeeAmount) &&
              listingConfig.listingFeeAmount >= 0
                ? listingConfig.listingFeeAmount
                : listingFeeAmount,
            registry_enabled: 1,
          },
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
  }

  steps.push(
    await submitConnectedStep({
      name: "bridge_register_asset",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: sccpBridgeAddress,
        entrypoint: "register_asset",
        payload: {
          asset_key: assetKey,
          registrant: wallet.accountId,
          asset: fundedAsset.assetDefinitionId,
          home_domain: remoteDomain,
          decimals: assetDecimals,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  steps.push(
    await submitConnectedStep({
      name: "bridge_activate_route",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: sccpBridgeAddress,
        entrypoint: "activate_route",
        payload: {
          route,
          asset_key: assetKey,
          remote_domain: remoteDomain,
          local_asset: fundedAsset.assetDefinitionId,
          vault_account: hubConfig.vaultAccountId,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  steps.push(
    await submitConnectedStep({
      name: "bridge_lock_to_remote",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: sccpBridgeAddress,
        entrypoint: "lock_to_remote",
        payload: {
          route,
          transfer: transferId,
          sender: wallet.accountId,
          recipient,
          amount: bridgeAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const assetBalanceAfterLock = findAssetQuantity(
    await retryAsync("bridge balance after lock", () =>
      fetchAccountAssets(toriiUrl, wallet.accountId),
    ),
    fundedAsset.assetDefinitionId,
  );

  steps.push(
    await submitConnectedStep({
      name: "bridge_finalize_inbound",
      toriiUrl,
      chainId,
      wallet,
      draftRequest: {
        authority: wallet.accountId,
        contract_address: sccpBridgeAddress,
        entrypoint: "finalize_inbound",
        payload: {
          route,
          message_id: inboundMessageId,
          recipient: wallet.accountId,
          amount: bridgeAmount,
        },
        gas_limit: DEFAULT_GAS_LIMIT,
      },
    }),
  );

  const assetBalanceAfterFinalize = findAssetQuantity(
    await retryAsync("bridge balance after finalize", () =>
      fetchAccountAssets(toriiUrl, wallet.accountId),
    ),
    fundedAsset.assetDefinitionId,
  );

  const [
    finalListingConfig,
    assetMirror,
    assetConfig,
    routeMirror,
    routeConfig,
    outboundMirror,
    outboundConfig,
    inboundConsumed,
  ] = await Promise.all([
    retryAsync("bridge listing_config final", () =>
      fetchBridgeListingConfig(toriiUrl, wallet.accountId),
    ),
    retryAsync("bridge mirror_asset", () =>
      fetchBridgeAssetMirror(toriiUrl, wallet.accountId, assetKey),
    ),
    retryAsync("bridge asset_config", () =>
      fetchBridgeAssetConfig(toriiUrl, wallet.accountId, assetKey),
    ),
    retryAsync("bridge mirror_route", () =>
      fetchBridgeRouteMirror(toriiUrl, wallet.accountId, route),
    ),
    retryAsync("bridge route_config", () =>
      fetchBridgeRouteConfig(toriiUrl, wallet.accountId, route),
    ),
    retryAsync("bridge mirror_outbound", () =>
      fetchBridgeOutboundMirror(toriiUrl, wallet.accountId, transferId),
    ),
    retryAsync("bridge outbound_config", () =>
      fetchBridgeOutboundConfig(toriiUrl, wallet.accountId, transferId),
    ),
    retryAsync("bridge inbound_consumed", () =>
      fetchBridgeInboundConsumed(toriiUrl, wallet.accountId, inboundMessageId),
    ),
  ]);

  return {
    ranAt: new Date().toISOString(),
    mode: "bridge_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    assetKey,
    route,
    transferId,
    inboundMessageId,
    selectedAssetDefinitionId: fundedAsset.assetDefinitionId,
    selectedAssetId: fundedAsset.assetId,
    bridgeAmount,
    steps,
    listingConfig: finalListingConfig,
    assetMirror,
    assetConfig,
    routeMirror,
    routeConfig,
    outboundMirror,
    outboundConfig,
    inboundConsumed,
    assetBalanceBefore,
    assetBalanceAfterLock,
    assetBalanceAfterFinalize,
  };
};

const runAutomationCycle = async ({ toriiUrl, chainId, wallet }) => {
  if (!automationJobQueueAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live automation queue address.",
    );
  }
  const jobId = trim(
    process.env.SORASWAP_AUTOMATION_JOB || makeLiveName("live_job"),
  );
  const executor = trim(
    process.env.SORASWAP_AUTOMATION_EXECUTOR || wallet.accountId,
  );
  const payloadHash = Number(
    trim(process.env.SORASWAP_AUTOMATION_PAYLOAD_HASH || "123456"),
  );
  const nextSlot = Number(
    trim(process.env.SORASWAP_AUTOMATION_NEXT_SLOT || "5"),
  );
  const resumeSlot = Number(
    trim(process.env.SORASWAP_AUTOMATION_RESUME_SLOT || "6"),
  );
  const retryDelaySlots = Number(
    trim(process.env.SORASWAP_AUTOMATION_RETRY_DELAY_SLOTS || "3"),
  );
  const maxRetries = Number(
    trim(process.env.SORASWAP_AUTOMATION_MAX_RETRIES || "2"),
  );
  const cronIntervalSlots = Number(
    trim(process.env.SORASWAP_AUTOMATION_CRON_INTERVAL_SLOTS || "4"),
  );
  const retryRunSlot = resumeSlot + retryDelaySlots;

  console.log(
    `Automation cycle on ${jobId}: next slot ${nextSlot}, retry run slot ${retryRunSlot}.`,
  );

  const steps = [];
  for (const [name, entrypoint, payload] of [
    [
      "automation_enqueue",
      "enqueue",
      { job: jobId, owner: wallet.accountId, payload_hash: payloadHash },
    ],
    [
      "automation_configure",
      "configure_job",
      {
        job: jobId,
        next_slot: nextSlot,
        max_retries: maxRetries,
        retry_delay_slots: retryDelaySlots,
      },
    ],
    ["automation_assign_executor", "assign_executor", { job: jobId, executor }],
    [
      "automation_configure_cron",
      "configure_cron",
      { job: jobId, interval_slots: cronIntervalSlots },
    ],
    [
      "automation_dispatch",
      "dispatch_job",
      { job: jobId, executor, current_slot: nextSlot },
    ],
    ["automation_pause", "pause_job", { job: jobId }],
    [
      "automation_resume",
      "resume_job",
      { job: jobId, current_slot: resumeSlot },
    ],
    ["automation_retry", "retry_at", { job: jobId, current_slot: resumeSlot }],
    [
      "automation_retry_dispatch",
      "dispatch_job",
      { job: jobId, executor, current_slot: retryRunSlot },
    ],
    [
      "automation_complete_run",
      "complete_run",
      { job: jobId, executor, current_slot: retryRunSlot },
    ],
  ]) {
    steps.push(
      await submitConnectedStep({
        name,
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: automationJobQueueAddress,
          entrypoint,
          payload,
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
  }

  const finalMirror = await retryAsync("automation mirror_job", () =>
    fetchJobMirror(toriiUrl, wallet.accountId, jobId),
  );

  return {
    ranAt: new Date().toISOString(),
    mode: "automation_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    jobId,
    executor,
    payloadHash,
    nextSlot,
    resumeSlot,
    retryDelaySlots,
    maxRetries,
    cronIntervalSlots,
    steps,
    finalMirror,
  };
};

const runLaunchpadCycle = async ({ toriiUrl, chainId, wallet, assets }) => {
  if (!launchpadSaleFactoryAddress) {
    throw new Error(
      "The generated SoraSwap testnet registry does not include the live launchpad factory address.",
    );
  }
  const poolConfig = await fetchPoolConfig(toriiUrl, wallet.accountId);
  const hubConfig = await fetchN3xHubConfig(toriiUrl, wallet.accountId);
  const walletSelection = await resolveWalletSelection(
    toriiUrl,
    wallet,
    assets,
    [poolConfig.baseAssetId, hubConfig.n3xAssetId],
    `No connected wallet currently holds the live launchpad payment asset ${poolConfig.baseAssetId} or sale asset ${hubConfig.n3xAssetId}.`,
  );
  wallet = walletSelection.wallet;

  const saleId = trim(
    process.env.SORASWAP_LAUNCHPAD_SALE || makeLiveName("live_sale"),
  );
  const allocationId = trim(
    process.env.SORASWAP_LAUNCHPAD_ALLOCATION ||
      makeLiveName("live_allocation"),
  );
  const refundSaleId = trim(
    process.env.SORASWAP_LAUNCHPAD_REFUND_SALE ||
      makeLiveName("live_refund_sale"),
  );
  const refundAllocationId = trim(
    process.env.SORASWAP_LAUNCHPAD_REFUND_ALLOCATION ||
      makeLiveName("live_refund_allocation"),
  );
  const seedPositionId = trim(
    process.env.SORASWAP_LAUNCHPAD_SEED_POSITION ||
      makeLiveName("live_seed_lp"),
  );
  const unitPrice = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_UNIT_PRICE || "1"),
  );
  const paymentAmount = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_PAYMENT_AMOUNT || "10"),
  );
  const claimInventoryAmount = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_CLAIM_INVENTORY_AMOUNT || "10"),
  );
  const claimSlot = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_CLAIM_SLOT || "0"),
  );
  const seedPaymentAmount = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_SEED_PAYMENT_AMOUNT || "4"),
  );
  const seedSaleAmount = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_SEED_SALE_AMOUNT || "6"),
  );
  const refundPaymentAmount = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_REFUND_PAYMENT_AMOUNT || "10"),
  );
  const refundSoftCap = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_REFUND_SOFT_CAP || "20"),
  );
  const hardCap = Number(
    trim(process.env.SORASWAP_LAUNCHPAD_HARD_CAP || "100000"),
  );

  console.log(`Launchpad cycle on ${saleId} and ${refundSaleId}.`);

  const steps = [];
  const pushLaunchpadStep = async (name, entrypoint, payload) => {
    steps.push(
      await submitConnectedStep({
        name,
        toriiUrl,
        chainId,
        wallet,
        draftRequest: {
          authority: wallet.accountId,
          contract_address: launchpadSaleFactoryAddress,
          entrypoint,
          payload,
          gas_limit: DEFAULT_GAS_LIMIT,
        },
      }),
    );
  };

  await pushLaunchpadStep("launchpad_init_sale", "init_sale", {
    sale: saleId,
    sale_asset: hubConfig.n3xAssetId,
    payment_asset: poolConfig.baseAssetId,
    treasury: hubConfig.vaultAccountId,
    unit_price: unitPrice,
    hard_cap: hardCap,
  });
  await pushLaunchpadStep("launchpad_configure_sale", "configure_sale", {
    sale: saleId,
    unit_price: unitPrice,
    soft_cap: 1,
    hard_cap: hardCap,
  });
  await pushLaunchpadStep("launchpad_configure_vesting", "configure_vesting", {
    sale: saleId,
    claim_start_slot: 0,
    claim_end_slot: 0,
  });
  await pushLaunchpadStep(
    "launchpad_contribute_recorded",
    "contribute_recorded_with_assets",
    {
      buyer: wallet.accountId,
      sale: saleId,
      allocation: allocationId,
      treasury: hubConfig.vaultAccountId,
      payment_asset: poolConfig.baseAssetId,
      payment_amount: paymentAmount,
    },
  );
  await pushLaunchpadStep("launchpad_close_sale", "close_sale", {
    sale: saleId,
  });
  await pushLaunchpadStep(
    "launchpad_deposit_claim_inventory",
    "deposit_claim_inventory_with_assets",
    {
      owner: wallet.accountId,
      sale: saleId,
      treasury: hubConfig.vaultAccountId,
      sale_asset: hubConfig.n3xAssetId,
      amount: claimInventoryAmount,
    },
  );
  await pushLaunchpadStep(
    "launchpad_settle_claim_assets",
    "settle_claim_assets",
    {
      buyer: wallet.accountId,
      allocation: allocationId,
      treasury: hubConfig.vaultAccountId,
      sale_asset: hubConfig.n3xAssetId,
      current_slot: claimSlot,
    },
  );
  await pushLaunchpadStep(
    "launchpad_deposit_seed_inventory",
    "deposit_seed_inventory_with_assets",
    {
      owner: wallet.accountId,
      sale: saleId,
      treasury: hubConfig.vaultAccountId,
      sale_asset: hubConfig.n3xAssetId,
      amount: seedSaleAmount,
    },
  );
  await pushLaunchpadStep(
    "launchpad_register_seed_liquidity",
    "register_seed_liquidity",
    {
      sale: saleId,
      position_id: seedPositionId,
      vault_account: hubConfig.vaultAccountId,
      bin_id: poolConfig.activeBin,
      payment_amount: seedPaymentAmount,
      sale_amount: seedSaleAmount,
    },
  );
  await pushLaunchpadStep(
    "launchpad_seed_liquidity",
    "seed_liquidity_with_assets",
    {
      sale: saleId,
      treasury: hubConfig.vaultAccountId,
      vault_account: hubConfig.vaultAccountId,
      payment_asset: poolConfig.baseAssetId,
      sale_asset: hubConfig.n3xAssetId,
    },
  );

  await pushLaunchpadStep("launchpad_refund_init_sale", "init_sale", {
    sale: refundSaleId,
    sale_asset: hubConfig.n3xAssetId,
    payment_asset: poolConfig.baseAssetId,
    treasury: hubConfig.vaultAccountId,
    unit_price: unitPrice,
    hard_cap: hardCap,
  });
  await pushLaunchpadStep("launchpad_refund_configure_sale", "configure_sale", {
    sale: refundSaleId,
    unit_price: unitPrice,
    soft_cap: refundSoftCap,
    hard_cap: hardCap,
  });
  await pushLaunchpadStep(
    "launchpad_refund_contribute_recorded",
    "contribute_recorded_with_assets",
    {
      buyer: wallet.accountId,
      sale: refundSaleId,
      allocation: refundAllocationId,
      treasury: hubConfig.vaultAccountId,
      payment_asset: poolConfig.baseAssetId,
      payment_amount: refundPaymentAmount,
    },
  );
  await pushLaunchpadStep("launchpad_refund_close_sale", "close_sale", {
    sale: refundSaleId,
  });
  await pushLaunchpadStep(
    "launchpad_settle_refund_assets",
    "settle_refund_assets",
    {
      buyer: wallet.accountId,
      allocation: refundAllocationId,
      treasury: hubConfig.vaultAccountId,
      payment_asset: poolConfig.baseAssetId,
    },
  );

  const [
    saleConfig,
    saleMirror,
    saleAccountingMirror,
    allocationMirror,
    refundSaleConfig,
    refundSaleMirror,
    refundSaleAccountingMirror,
    refundAllocationMirror,
  ] = await Promise.all([
    retryAsync("launchpad sale_config", () =>
      fetchLaunchpadSaleConfig(toriiUrl, wallet.accountId, saleId),
    ),
    retryAsync("launchpad mirror_sale", () =>
      fetchLaunchpadMirrorSale(toriiUrl, wallet.accountId, saleId),
    ),
    retryAsync("launchpad mirror_sale_accounting", () =>
      fetchLaunchpadMirrorAccounting(toriiUrl, wallet.accountId, saleId),
    ),
    retryAsync("launchpad mirror_allocation", () =>
      fetchLaunchpadMirrorAllocation(toriiUrl, wallet.accountId, allocationId),
    ),
    retryAsync("launchpad refund sale_config", () =>
      fetchLaunchpadSaleConfig(toriiUrl, wallet.accountId, refundSaleId),
    ),
    retryAsync("launchpad refund mirror_sale", () =>
      fetchLaunchpadMirrorSale(toriiUrl, wallet.accountId, refundSaleId),
    ),
    retryAsync("launchpad refund mirror_sale_accounting", () =>
      fetchLaunchpadMirrorAccounting(toriiUrl, wallet.accountId, refundSaleId),
    ),
    retryAsync("launchpad refund mirror_allocation", () =>
      fetchLaunchpadMirrorAllocation(
        toriiUrl,
        wallet.accountId,
        refundAllocationId,
      ),
    ),
  ]);

  return {
    ranAt: new Date().toISOString(),
    mode: "launchpad_cycle",
    toriiUrl,
    chainId,
    accountId: wallet.accountId,
    publicKeyHex: wallet.publicKeyHex,
    saleId,
    allocationId,
    refundSaleId,
    refundAllocationId,
    seedPositionId,
    steps,
    saleConfig,
    saleMirror,
    saleAccountingMirror,
    allocationMirror,
    refundSaleConfig,
    refundSaleMirror,
    refundSaleAccountingMirror,
    refundAllocationMirror,
  };
};

const main = async () => {
  const toriiUrl = trim(process.env.SORASWAP_TORII_URL || DEFAULT_TORII_URL);
  const chainId = trim(process.env.SORASWAP_CHAIN_ID || DEFAULT_CHAIN_ID);
  const slippageBps = BigInt(
    trim(process.env.SORASWAP_SLIPPAGE_BPS || DEFAULT_SLIPPAGE_BPS),
  );
  const explicitTradeAmount = trim(process.env.SORASWAP_TRADE_AMOUNT || "");
  const mode = trim(process.env.SORASWAP_MODE || DEFAULT_MODE).toLowerCase();

  console.log(`Torii: ${toriiUrl}`);
  console.log(`Chain ID: ${chainId}`);
  console.log(`Mode: ${mode}`);
  if (spotPoolAddress) console.log(`DLMM pool: ${spotPoolAddress}`);
  if (spotRouterAddress) console.log(`DLMM router: ${spotRouterAddress}`);
  if (n3xHubAddress) console.log(`n3x hub: ${n3xHubAddress}`);
  if (perpsEngineAddress) console.log(`Perps engine: ${perpsEngineAddress}`);
  if (farmsFarmAddress) console.log(`Farm: ${farmsFarmAddress}`);
  if (optionsSeriesManagerAddress)
    console.log(`Options manager: ${optionsSeriesManagerAddress}`);
  if (coverPolicyManagerAddress)
    console.log(`Cover manager: ${coverPolicyManagerAddress}`);
  if (automationJobQueueAddress)
    console.log(`Automation queue: ${automationJobQueueAddress}`);
  if (launchpadSaleFactoryAddress)
    console.log(`Launchpad factory: ${launchpadSaleFactoryAddress}`);
  if (sccpBridgeAddress) console.log(`Bridge: ${sccpBridgeAddress}`);

  let wallet = await loadOrCreateWallet();
  console.log(
    wallet.reused
      ? `Reusing demo wallet ${wallet.accountId}`
      : `Created demo wallet ${wallet.accountId}`,
  );

  let assets = await fetchAccountAssets(toriiUrl, wallet.accountId);

  if (!hasVisibleBalance(assets)) {
    console.log(
      "Wallet has no visible on-chain assets yet. Requesting faucet funds.",
    );
    try {
      const faucet = await requestFaucetFunds(toriiUrl, wallet.accountId);
      console.log(
        `Faucet accepted: ${trim(faucet.amount)} units on ${trim(faucet.asset_id || faucet.asset_definition_id)} (tx ${trim(faucet.tx_hash_hex)})`,
      );
    } catch (error) {
      console.log(
        `Faucet request returned: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    for (let attempt = 1; attempt <= 30; attempt += 1) {
      assets = await fetchAccountAssets(toriiUrl, wallet.accountId);
      if (hasVisibleBalance(assets)) break;
      await sleep(2000);
    }
  }

  if (!hasVisibleBalance(assets)) {
    console.log(
      `Wallet ${wallet.accountId} still has no visible funded balance. Continuing because asset-backed modes can fall back to the sibling TAIRA wallet.`,
    );
  }

  const cycleArtifact =
    mode === "farm_cycle"
      ? await runFarmCycle({ toriiUrl, chainId, wallet, assets })
      : mode === "perps_cycle"
        ? await runPerpsCycle({ toriiUrl, chainId, wallet, assets })
        : mode === "options_cycle"
          ? await runOptionsCycle({ toriiUrl, chainId, wallet, assets })
          : mode === "cover_cycle"
            ? await runCoverCycle({ toriiUrl, chainId, wallet, assets })
            : mode === "bridge_cycle"
              ? await runBridgeCycle({ toriiUrl, chainId, wallet, assets })
              : mode === "automation_cycle"
                ? await runAutomationCycle({ toriiUrl, chainId, wallet })
                : mode === "launchpad_cycle"
                  ? await runLaunchpadCycle({
                      toriiUrl,
                      chainId,
                      wallet,
                      assets,
                    })
                  : null;

  let artifact;
  if (cycleArtifact) {
    artifact = cycleArtifact;
  } else {
    const operation =
      mode === "n3x_mint"
        ? await buildN3xMintTrade({
            toriiUrl,
            wallet,
            assets,
            explicitTradeAmount,
          })
        : mode === "n3x_redeem"
          ? await buildN3xRedeemTrade({
              toriiUrl,
              wallet,
              assets,
              explicitTradeAmount,
            })
          : mode === "perps_open"
            ? await buildPerpsOpenTrade({ toriiUrl, wallet, assets })
            : await buildSpotTrade({
                toriiUrl,
                wallet,
                assets,
                slippageBps,
                explicitTradeAmount,
              });
    wallet = operation.wallet;

    const submit = await prepareAndSubmitViaConnect({
      toriiUrl,
      chainId,
      wallet,
      draftRequest: operation.draftRequest,
      domainTag: "IROHA_TORII_CONTRACT_CALL",
    });
    assertExpectedPipelineStatus(operation.mode, submit.finalKind);

    artifact = {
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
  }

  await mkdir(walletFileDir, { recursive: true });
  const artifactPath = path.resolve(
    walletFileDir,
    `soraswap-live-${artifact.mode}.last.json`,
  );
  await writeFile(
    artifactPath,
    `${JSON.stringify(artifact, null, 2)}\n`,
    "utf8",
  );

  console.log(`Trade artifact written to ${artifactPath}`);
};

await main().catch((error) => {
  console.error(
    error instanceof Error ? error.stack || error.message : String(error),
  );
  process.exit(1);
});
