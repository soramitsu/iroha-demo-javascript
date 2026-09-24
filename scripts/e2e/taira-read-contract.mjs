#!/usr/bin/env node

import { ToriiClient } from "@iroha/iroha-js";
import {
  assertCurrentReadSurface,
  assertOfficialV2WriteSurface,
  classifyTairaIdentity,
  normalizeToriiBaseUrl,
  probeJson,
  validateAccountAssets,
  validateCitizenStatus,
  validateFinalizedTransactionRead,
  validateOwnedSubscriptions,
  validatePublicLaneValidators,
} from "./taira-read-contract-utils.mjs";

const toriiUrl = normalizeToriiBaseUrl(
  process.env.E2E_TORII_URL ?? "https://taira.sora.org",
);
const requireOfficialV2 = process.argv.includes("--require-v2");
const publicLaneId = 0;

const status = await probeJson(fetch, toriiUrl, "/status");
const openApi = await probeJson(fetch, toriiUrl, "/openapi.json");
const faucetPuzzle = await probeJson(
  fetch,
  toriiUrl,
  "/v1/accounts/faucet/puzzle",
);
const councilAudit = await probeJson(fetch, toriiUrl, "/v1/gov/council/audit");
const citizenCount = await probeJson(fetch, toriiUrl, "/v1/gov/citizens");
const lifecycle = await probeJson(fetch, toriiUrl, "/v1/nexus/lifecycle");
const validators = await probeJson(
  fetch,
  toriiUrl,
  `/v1/nexus/public-lanes/${publicLaneId}/validators`,
);
const validatedValidators = validatePublicLaneValidators(
  validators.payload,
  publicLaneId,
);
const stakeValidator = validatedValidators.items[0]?.validator;
if (!stakeValidator) {
  throw new Error(
    `Public lane ${publicLaneId} advertises no validator whose live stake can be checked.`,
  );
}
const stake = await probeJson(
  fetch,
  toriiUrl,
  `/v1/nexus/public-lanes/${publicLaneId}/stake?validator=${encodeURIComponent(stakeValidator)}`,
);
const configuration = await probeJson(
  fetch,
  toriiUrl,
  "/v1/configuration",
  [200, 401],
);
const sumeragi = await probeJson(fetch, toriiUrl, "/v1/sumeragi/status");
const vpnProfile = await probeJson(fetch, toriiUrl, "/v1/vpn/profile");
const soraCloud = await probeJson(fetch, toriiUrl, "/v1/soracloud/status");
const subscriptionPlans = await probeJson(
  fetch,
  toriiUrl,
  "/v1/subscriptions/plans",
);
const explorerMetrics = await probeJson(
  fetch,
  toriiUrl,
  "/v1/explorer/metrics",
);
const explorerTransactions = await probeJson(
  fetch,
  toriiUrl,
  "/v1/explorer/transactions?limit=1",
);
const latestTransaction = explorerTransactions.payload?.items?.[0];
if (
  !latestTransaction ||
  typeof latestTransaction !== "object" ||
  typeof latestTransaction.hash !== "string" ||
  !/^[0-9a-f]{64}$/u.test(latestTransaction.hash) ||
  !Number.isSafeInteger(latestTransaction.block) ||
  latestTransaction.block < 1
) {
  throw new Error(
    "Explorer transaction list did not expose a canonical transaction for the finality read check.",
  );
}
const toriiClient = new ToriiClient(toriiUrl);
const initialTransactionStatus = await toriiClient.getTransactionStatus(
  latestTransaction.hash,
  { scope: "global" },
);
const explorerTransaction = await probeJson(
  fetch,
  toriiUrl,
  `/v1/explorer/transactions/${encodeURIComponent(latestTransaction.hash)}`,
);
const explorerBlock = await probeJson(
  fetch,
  toriiUrl,
  `/v1/explorer/blocks/${encodeURIComponent(String(latestTransaction.block))}`,
);
const confirmationTransactionStatus = await toriiClient.getTransactionStatus(
  latestTransaction.hash,
  { scope: "global" },
);
const finalizedTransaction = validateFinalizedTransactionRead({
  expectedHash: latestTransaction.hash,
  initialStatus: initialTransactionStatus,
  confirmationStatus: confirmationTransactionStatus,
  transaction: explorerTransaction.payload,
  block: explorerBlock.payload,
  metrics: explorerMetrics.payload,
});
const kaigiRelayHealth = await probeJson(
  fetch,
  toriiUrl,
  "/v1/kaigi/relays/health",
);

assertCurrentReadSurface({
  openApi: openApi.payload,
  lifecycle: lifecycle.payload,
  validators: validators.payload,
  stake: stake.payload,
  vpnProfile: vpnProfile.payload,
  soraCloud: soraCloud.payload,
  subscriptionPlans: subscriptionPlans.payload,
  explorerMetrics: explorerMetrics.payload,
  kaigiRelayHealth: kaigiRelayHealth.payload,
  requestedLaneId: publicLaneId,
  requestedValidator: stakeValidator,
});

if (
  !status.payload ||
  typeof status.payload !== "object" ||
  !sumeragi.payload ||
  typeof sumeragi.payload !== "object"
) {
  throw new Error("Runtime status surfaces are malformed.");
}
if (
  !citizenCount.payload ||
  typeof citizenCount.payload !== "object" ||
  !Number.isSafeInteger(citizenCount.payload.total) ||
  citizenCount.payload.total < 0
) {
  throw new Error("Citizen count is malformed.");
}
if (configuration.status === 401) {
  const code = String(configuration.payload?.code ?? "");
  if (code !== "operator_signature_missing") {
    throw new Error(
      `Configuration rejected anonymously with unexpected code "${code}".`,
    );
  }
}

const requestedCitizenAccount = String(
  process.env.E2E_CITIZEN_ACCOUNT_ID ?? "",
).trim();
if (requestedCitizenAccount) {
  const encodedAccountId = encodeURIComponent(requestedCitizenAccount);
  const citizenStatus = await probeJson(
    fetch,
    toriiUrl,
    `/v1/gov/citizens/${encodedAccountId}`,
  );
  const ownedSubscriptions = await probeJson(
    fetch,
    toriiUrl,
    `/v1/subscriptions?owned_by=${encodedAccountId}`,
  );
  const accountAssets = await probeJson(
    fetch,
    toriiUrl,
    `/v1/accounts/${encodedAccountId}/assets?limit=200&offset=0&count_mode=exact`,
  );
  validateCitizenStatus(citizenStatus.payload, requestedCitizenAccount);
  validateOwnedSubscriptions(ownedSubscriptions.payload);
  validateAccountAssets(accountAssets.payload, requestedCitizenAccount);
}

const identity = classifyTairaIdentity({
  faucetPuzzle: faucetPuzzle.payload,
  councilAudit: councilAudit.payload,
});
if (identity.state === "conflicting" || identity.state === "unverified") {
  throw new Error(
    `Taira identity evidence is ${identity.state}; writes must remain blocked.`,
  );
}
if (requireOfficialV2 && identity.state !== "matched") {
  throw new Error(
    `Official Taira v2 is required, but the endpoint reports ${identity.chainId} (${identity.state}).`,
  );
}
if (requireOfficialV2) {
  assertOfficialV2WriteSurface(openApi.payload);
}

console.log(
  [
    `Taira read contract verified at ${toriiUrl}.`,
    `Identity: ${identity.state} (${identity.chainId}).`,
    `Access: ${identity.accessMode}.`,
    `Citizens: ${citizenCount.payload.total}.`,
    `Lane ${publicLaneId} validators: ${validators.payload.items.length}; stake filter verified.`,
    `Explorer block: ${explorerMetrics.payload.block}.`,
    `Finality read: ${finalizedTransaction.transactionHash} in finalized block ${finalizedTransaction.blockHeight}.`,
    `Kaigi relay reports: ${kaigiRelayHealth.payload.reports_total}.`,
    requestedCitizenAccount
      ? "Account-scoped citizenship, assets, and owned subscriptions: verified."
      : "Account-scoped reads: skipped (set E2E_CITIZEN_ACCOUNT_ID to verify them).",
  ].join(" "),
);
