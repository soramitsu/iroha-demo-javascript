#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { _electron as electron } from "playwright";

const projectRoot = "/Users/takemiyamakoto/dev/iroha-demo-javascript";
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outputDir = join(
  projectRoot,
  "output",
  "playwright",
  `live-ui-shielded-send-${stamp}`,
);
mkdirSync(outputDir, { recursive: true });

const toriiUrl = "https://taira.sora.org";
const chainId = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const networkPrefix = 369;
const faucetAuthority =
  "testuロ1NrpスモaMメフNhziルZfvWn9ルリvFqxセmUモマ2ハキヘhqzセ71P2D3";
const reuseResultPath = String(process.env.REUSE_RESULT_JSON ?? "").trim();

const result = {
  stamp,
  outputDir,
  toriiUrl,
  chainId,
  networkPrefix,
  accounts: {},
  faucet: {},
  shield: {},
  shieldedSend: {},
  receiverWallet: {},
  screenshots: [],
};

function saveResult() {
  writeFileSync(join(outputDir, "result.json"), JSON.stringify(result, null, 2));
}

function log(message, payload) {
  if (payload === undefined) {
    console.log(message);
  } else {
    console.log(message, JSON.stringify(payload));
  }
}

async function shot(page, name) {
  const path = join(outputDir, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  result.screenshots.push(path);
  saveResult();
}

async function armFaucetResultCapture(page) {
  await page.evaluate(() => {
    // The bridge is exposed as a sealed object in preload, so live runs must
    // capture faucet hashes from visible UI state instead of monkeypatching it.
    window.__codexLastFaucetResult = null;
    window.__codexLastFaucetProgress = null;
    window.__codexFaucetCaptureInstalled = true;
  });
}

async function readCapturedFaucetResult(page) {
  return await page.evaluate(() => ({
    result: window.__codexLastFaucetResult ?? null,
    progress: window.__codexLastFaucetProgress ?? null,
  }));
}

async function waitForWallet(page) {
  await page.waitForFunction(() => window.location.hash === "#/wallet", {
    timeout: 60_000,
  });
  await page
    .getByRole("heading", { name: "Wallet", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 60_000 });
}

async function gotoRoute(page, hash) {
  await page.evaluate((nextHash) => {
    window.location.hash = nextHash;
  }, hash);
  await page.waitForFunction(
    (expected) => window.location.hash === expected,
    hash,
    { timeout: 60_000 },
  );
}

async function setActiveAccount(page, accountId) {
  await page.evaluate((nextAccountId) => {
    const raw = localStorage.getItem("iroha-demo:session");
    if (!raw) throw new Error("session missing");
    const session = JSON.parse(raw);
    session.activeAccountId = nextAccountId;
    localStorage.setItem("iroha-demo:session", JSON.stringify(session));
  }, accountId);
  await page.reload();
}

async function createSeedSession(page) {
  const makeAccounts = await page.evaluate(
    ({ networkPrefix }) => {
      const makeAccount = (displayName, domain) => {
        const { publicKeyHex, privateKeyHex } = window.iroha.generateKeyPair();
        const summary = window.iroha.deriveAccountAddress({
          domain,
          publicKeyHex,
          networkPrefix,
        });
        return {
          displayName,
          domain,
          accountId: summary.accountId,
          i105AccountId: summary.i105AccountId,
          i105DefaultAccountId: summary.i105DefaultAccountId,
          publicKeyHex,
          privateKeyHex,
          localOnly: true,
        };
      };
      return {
        sender: makeAccount("E2E Sender", "sender"),
        receiver: makeAccount("E2E Receiver", "receiver"),
      };
    },
    { networkPrefix },
  );
  await seedSessionWithAccounts(page, makeAccounts, "");
  return makeAccounts;
}

async function seedSessionWithAccounts(page, accounts, assetDefinitionId = "") {
  await page.evaluate(
    ({ toriiUrl, chainId, networkPrefix, accounts, assetDefinitionId }) => {
      const sender = accounts.sender;
      const receiver = accounts.receiver;
      localStorage.removeItem("iroha-demo:session");
      localStorage.removeItem("iroha-demo:offline");
      localStorage.setItem("iroha-demo:locale", "en-US");
      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl,
            chainId,
            assetDefinitionId,
            networkPrefix,
          },
          authority: { accountId: "", privateKeyHex: "" },
          accounts: [sender, receiver],
          activeAccountId: sender.accountId,
          customChains: [],
        }),
      );
    },
    { toriiUrl, chainId, networkPrefix, accounts, assetDefinitionId },
  );
}

async function waitForAccountAsset(page, accountId, minimumQuantity, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const response = await page.evaluate(
      async ({ toriiUrl, accountId }) => {
        try {
          return await window.iroha.fetchAccountAssets({
            toriiUrl,
            accountId,
            limit: 100,
            offset: 0,
          });
        } catch (error) {
          return {
            items: [],
            total: 0,
            error: String(error?.stack || error),
          };
        }
      },
      { toriiUrl, accountId },
    );
    const match = Array.isArray(response?.items)
      ? response.items.find(
          (item) => Number(String(item?.quantity ?? "0")) >= minimumQuantity,
        )
      : null;
    if (match) {
      return match;
    }
    await page.waitForTimeout(1_500);
  }
  throw new Error(
    `Timed out waiting for asset balance >= ${minimumQuantity} on ${accountId}`,
  );
}

async function waitForExplorerCommittedTx({
  authority,
  createdAfterMs,
  excludeHashes = new Set(),
  timeoutMs = 180_000,
}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const matches = [];
    for (let page = 1; page <= 16; page += 1) {
      const url = new URL("/v1/explorer/transactions", toriiUrl);
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", "50");
      const response = await fetch(url, { method: "GET" });
      if (!response.ok) {
        throw new Error(`Explorer tx list failed: ${response.status}`);
      }
      const payload = await response.json();
      for (const item of payload?.items ?? []) {
        const hash = String(item?.hash ?? "").trim();
        const itemAuthority = String(item?.authority ?? "").trim();
        const createdAtMs = Date.parse(String(item?.created_at ?? ""));
        if (
          hash &&
          item?.status === "Committed" &&
          itemAuthority === authority &&
          Number.isFinite(createdAtMs) &&
          createdAtMs >= createdAfterMs &&
          !excludeHashes.has(hash)
        ) {
          matches.push({
            hash,
            authority: itemAuthority,
            createdAt: String(item.created_at),
            createdAtMs,
            block: item?.block ?? null,
          });
        }
      }
    }
    if (matches.length) {
      matches.sort((left, right) => left.createdAtMs - right.createdAtMs);
      return matches[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(
    `Timed out waiting for committed explorer tx from ${authority}`,
  );
}

async function waitForPipelineTransactionOutcome(hash, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  const trimmedHash = String(hash ?? "").trim();
  while (Date.now() < deadline) {
    const url = new URL("/v1/pipeline/transactions/status", toriiUrl);
    url.searchParams.set("hash", trimmedHash);
    url.searchParams.set("scope", "auto");
    const response = await fetch(url, { method: "GET" });
    if (!response.ok) {
      throw new Error(
        `Pipeline status failed for ${trimmedHash}: ${response.status} ${response.statusText}`,
      );
    }
    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    const status = payload?.status ?? payload?.content?.status ?? null;
    const kind = String(status?.kind ?? "").trim();
    if (/^(Applied|Committed)$/i.test(kind)) {
      return {
        hash: trimmedHash,
        kind,
        payload,
      };
    }
    if (/^Rejected$/i.test(kind)) {
      throw new Error(
        `Transaction ${trimmedHash} rejected: ${JSON.stringify(payload)}`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`Timed out waiting for pipeline status on ${trimmedHash}`);
}

function extractHash(text, pattern) {
  return String(text ?? "").match(pattern)?.[1] ?? null;
}

async function claimFaucet(page, label, accountId, excludeHashes = new Set()) {
  await gotoRoute(page, "#/wallet");
  await waitForWallet(page);
  await armFaucetResultCapture(page);
  await shot(page, `${label}-wallet-before-faucet`);
  const claimButton = page.getByRole("button", {
    name: /Claim(?: Testnet)? XOR/i,
  });
  await claimButton.waitFor({ state: "visible", timeout: 60_000 });
  if (await claimButton.isDisabled()) {
    throw new Error(`${label}: faucet button disabled before claim`);
  }
  const startedAtMs = Date.now() - 5_000;
  log(`${label}-faucet-click`);
  await claimButton.click();
  await shot(page, `${label}-wallet-after-faucet-click`);
  const state = await page
    .waitForFunction(
      () => {
        const raw = localStorage.getItem("iroha-demo:session");
        if (!raw) {
          return null;
        }
        try {
          const session = JSON.parse(raw);
          const activeAccount = Array.isArray(session?.accounts)
            ? session.accounts.find(
                (account) => account?.accountId === session?.activeAccountId,
              )
            : null;
          const faucetMessage =
            document.querySelector(".wallet-faucet-message")?.textContent?.trim() ??
            "";
          const faucetError =
            document
              .querySelector(".wallet-faucet-message.wallet-faucet-error")
              ?.textContent?.trim() ?? "";
          const assetDefinitionId = String(
            session?.connection?.assetDefinitionId ?? "",
          ).trim();
          if (faucetError) {
            return {
              assetDefinitionId,
              faucetMessage,
              faucetError,
              localOnly: activeAccount?.localOnly ?? null,
            };
          }
          if (assetDefinitionId && activeAccount && activeAccount.localOnly === false) {
            return {
              assetDefinitionId,
              faucetMessage,
              faucetError,
              localOnly: false,
            };
          }
        } catch {
          return null;
        }
        return null;
      },
      { timeout: 180_000 },
    )
    .then((handle) => handle.jsonValue());
  if (state?.faucetError) {
    throw new Error(`${label}: ${state.faucetError}`);
  }
  log(`${label}-faucet-accepted`, state);
  const captured = await readCapturedFaucetResult(page).catch(() => null);
  const capturedProgress = captured?.progress ?? null;
  if (capturedProgress) {
    log(`${label}-faucet-progress`, capturedProgress);
  }
  const uiHash = extractHash(
    String(state?.faucetMessage ?? ""),
    /([0-9a-f]{64})/i,
  );
  if (uiHash) {
    try {
      await waitForPipelineTransactionOutcome(uiHash);
    } catch (error) {
      log(`${label}-faucet-pipeline-wait-skipped`, {
        hash: uiHash,
        error: String(error?.message ?? error),
      });
    }
  }
  let balanceMatch = null;
  try {
    balanceMatch = await waitForAccountAsset(page, accountId, 25_000, 45_000);
  } catch (error) {
    log(`${label}-faucet-balance-wait-skipped`, {
      error: String(error?.message ?? error),
    });
  }
  let tx = null;
  if (uiHash) {
    tx = {
      hash: uiHash,
      authority: faucetAuthority,
      createdAt: null,
      createdAtMs: null,
      block: null,
    };
  } else {
    try {
      tx = await waitForExplorerCommittedTx({
        authority: faucetAuthority,
        createdAfterMs: startedAtMs,
        excludeHashes,
        timeoutMs: 30_000,
      });
    } catch (error) {
      if (label === "sender") {
        throw error;
      }
      log(`${label}-faucet-hash-skipped`, {
        error: String(error?.message ?? error),
      });
    }
  }
  return {
    tx_hash_hex: tx?.hash ?? "",
    asset_definition_id: state.assetDefinitionId,
    explorer: tx,
    state,
    balanceMatch,
  };
}

async function createShieldedBalance(page, amount) {
  await gotoRoute(page, "#/wallet");
  await waitForWallet(page);
  const shieldPanel = page.locator(".wallet-shield-panel").first();
  await shieldPanel.waitFor({ state: "visible", timeout: 60_000 });
  const capabilityText = await shieldPanel.textContent();
  if (String(capabilityText).includes("Shield mode unavailable:")) {
    throw new Error(`wallet shield unavailable: ${String(capabilityText)}`);
  }
  const amountInput = shieldPanel.locator(".wallet-shield-input input").first();
  await amountInput.fill(String(amount));
  const button = page.getByRole("button", {
    name: "Create shielded balance",
    exact: true,
  });
  await button.waitFor({ state: "visible", timeout: 30_000 });
  if (await button.isDisabled()) {
    throw new Error("wallet shield button disabled");
  }
  const startedAtMs = Date.now() - 5_000;
  await button.click();
  const deadline = Date.now() + 180_000;
  let tx = null;
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(() => ({
      shieldMessage:
        document.querySelector(".wallet-shield-panel .wallet-faucet-message")
          ?.textContent?.trim() ?? "",
      shieldError:
        document
          .querySelector(
            ".wallet-shield-panel .wallet-faucet-message.wallet-faucet-error",
          )
          ?.textContent?.trim() ?? "",
      shieldBalance:
        document.querySelector(".wallet-shield-panel .wallet-shield-balance")
          ?.textContent?.trim() ?? "",
    }));
    if (state.shieldError) {
      if (!/timed out waiting for transaction status/i.test(state.shieldError)) {
        throw new Error(state.shieldError);
      }
    }
    const uiHash = extractHash(
      state.shieldMessage,
      /([0-9a-f]{64})/i,
    );
    if (uiHash) {
      tx = {
        hash: uiHash,
        authority: result.accounts.sender.accountId,
        createdAt: null,
        createdAtMs: null,
        block: null,
      };
      break;
    }
    try {
      tx = await waitForExplorerCommittedTx({
        authority: result.accounts.sender.accountId,
        createdAfterMs: startedAtMs,
        timeoutMs: 1_500,
      });
      break;
    } catch (_error) {
      tx = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!tx) {
    throw new Error(
      `Timed out waiting for shield outcome. Last state: ${JSON.stringify(state)}`,
    );
  }
  return {
    hash: tx.hash,
    explorer: tx,
    state,
  };
}

async function waitForSpendableShieldedBalance(
  page,
  account,
  assetDefinitionId,
  minimumQuantity,
  timeoutMs = 120_000,
) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (Date.now() < deadline) {
    last = await page.evaluate(
      async ({ toriiUrl, chainId, account, assetDefinitionId }) => {
        try {
          return await window.iroha.getConfidentialAssetBalance({
            toriiUrl,
            chainId,
            accountId: account.accountId,
            privateKeyHex: account.privateKeyHex,
            assetDefinitionId,
          });
        } catch (error) {
          return {
            error: String(error?.stack || error),
          };
        }
      },
      { toriiUrl, chainId, account, assetDefinitionId },
    );
    const spendable = Number(
      String(last?.spendableQuantity ?? last?.quantity ?? "0"),
    );
    if (Number.isFinite(spendable) && spendable >= minimumQuantity) {
      return last;
    }
    await page.waitForTimeout(5_000);
  }
  throw new Error(
    `Timed out waiting for shielded spendable balance >= ${minimumQuantity}: ${JSON.stringify(last)}`,
  );
}

async function submitShieldedSend(page, receiverAccountId, amount) {
  await gotoRoute(page, "#/send");
  await page.locator(".send-shell").first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  const destinationInput = page
    .locator(".send-form label")
    .filter({ hasText: /Destination Account ID|To/i })
    .locator("input")
    .first();
  const fallbackTextInputs = page.locator(
    '.send-form-pane input:not([type="file"]):not([type="checkbox"])',
  );
  if ((await destinationInput.count()) === 0) {
    await fallbackTextInputs.first().waitFor({ state: "visible", timeout: 60_000 });
  } else {
    await destinationInput.waitFor({ state: "visible", timeout: 60_000 });
  }
  await ((await destinationInput.count()) === 0
    ? fallbackTextInputs.nth(0)
    : destinationInput
  ).fill(receiverAccountId);
  const amountInput =
    (await page.locator('input[type="number"]').count())
      ? page.locator('input[type="number"]').first()
      : fallbackTextInputs.nth(1);
  await amountInput.fill(String(amount));
  const shieldToggle = page
    .locator('.shield-option input[type="checkbox"]')
    .first();
  const fallbackShieldToggle = page
    .locator('.send-form-pane input[type="checkbox"]')
    .first();
  const activeShieldToggle =
    (await shieldToggle.count()) > 0 ? shieldToggle : fallbackShieldToggle;
  await activeShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await activeShieldToggle.isEnabled())) {
    const notes = await page
      .locator(".send-feedback .send-note")
      .allTextContents();
    throw new Error(`send shield toggle disabled: ${notes.join(" | ")}`);
  }
  await activeShieldToggle.check();
  const submitButton = page.locator(".actions button").first();
  await submitButton.waitFor({ state: "visible", timeout: 30_000 });
  if (await submitButton.isDisabled()) {
    const notes = await page
      .locator(".send-feedback .send-note")
      .allTextContents();
    throw new Error(`shield submit button disabled: ${notes.join(" | ")}`);
  }
  const startedAtMs = Date.now() - 5_000;
  await submitButton.click();
  const excludeHashes = new Set([
    String(result.shield.hash ?? "").trim(),
  ]);
  const deadline = Date.now() + 180_000;
  let tx = null;
  let state = null;
  while (Date.now() < deadline) {
    state = await page.evaluate(() => ({
      notes: [...document.querySelectorAll(".send-feedback .send-note")]
        .map((node) => (node.textContent ?? "").trim())
        .filter(Boolean),
      destination:
        document
          .querySelector(".send-form label input")
          ?.value?.trim() ?? "",
    }));
    const errorNote = state.notes.find((note) =>
      /failed|unavailable|error/i.test(note),
    );
    if (errorNote) {
      throw new Error(errorNote);
    }
    const uiHash = extractHash(
      state.notes.join(" "),
      /([0-9a-f]{64})/i,
    );
    if (uiHash && !excludeHashes.has(uiHash)) {
      tx = {
        hash: uiHash,
        authority: result.accounts.sender.accountId,
        createdAt: null,
        createdAtMs: null,
        block: null,
      };
      break;
    }
    try {
      tx = await waitForExplorerCommittedTx({
        authority: result.accounts.sender.accountId,
        createdAfterMs: startedAtMs,
        excludeHashes,
        timeoutMs: 1_500,
      });
      break;
    } catch (_error) {
      tx = null;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  if (!tx) {
    throw new Error(
      `Timed out waiting for shielded send outcome. Last state: ${JSON.stringify(state)}`,
    );
  }
  return {
    hash: tx.hash,
    explorer: tx,
    state,
  };
}

async function captureReceiverWallet(page) {
  await gotoRoute(page, "#/wallet");
  await waitForWallet(page);
  const refreshButton = page.getByRole("button", {
    name: "Refresh",
    exact: true,
  });
  if (await refreshButton.isVisible().catch(() => false)) {
    await refreshButton.click().catch(() => undefined);
  }
  await page.waitForTimeout(5_000);
  return await page.evaluate(() => ({
    faucetMessage:
      document.querySelector(".wallet-faucet-message")?.textContent?.trim() ??
      "",
    shieldBalance:
      document.querySelector(".wallet-shield-panel .wallet-shield-balance")
        ?.textContent?.trim() ?? "",
    shieldAsset:
      document.querySelector(".wallet-shield-panel .wallet-shield-asset")
        ?.textContent?.trim() ?? "",
  }));
}

async function main() {
  const app = await electron.launch({ args: [mainEntry], env: process.env });
  const page = await app.firstWindow();
  page.setDefaultTimeout(60_000);

  try {
    await page.waitForFunction(() => Boolean(window.iroha), { timeout: 60_000 });
    let prior = null;
    if (reuseResultPath) {
      prior = JSON.parse(readFileSync(reuseResultPath, "utf8"));
      result.accounts = prior.accounts;
      result.faucet = prior.faucet ?? {};
      await seedSessionWithAccounts(
        page,
        result.accounts,
        String(
          prior?.faucet?.sender?.asset_definition_id ??
            prior?.faucet?.receiver?.asset_definition_id ??
            "",
        ).trim(),
      );
    } else {
      result.accounts = await createSeedSession(page);
    }
    saveResult();
    log("seeded-accounts", result.accounts);

    await page.reload();

    if (!reuseResultPath) {
      result.faucet.sender = await claimFaucet(
        page,
        "sender",
        result.accounts.sender.accountId,
      );
      log("sender-faucet", { hash: result.faucet.sender.tx_hash_hex });
      await shot(page, "01-sender-after-faucet");
      saveResult();

      await setActiveAccount(page, result.accounts.receiver.accountId);
      result.faucet.receiver = await claimFaucet(
        page,
        "receiver",
        result.accounts.receiver.accountId,
        new Set([String(result.faucet.sender.tx_hash_hex ?? "").trim()]),
      );
      log("receiver-faucet", { hash: result.faucet.receiver.tx_hash_hex });
      await shot(page, "02-receiver-after-faucet");
      saveResult();
    } else {
      await setActiveAccount(page, result.accounts.sender.accountId);
      await gotoRoute(page, "#/wallet");
      await waitForWallet(page);
      await shot(page, "01-reused-funded-accounts");
      saveResult();
    }

    await setActiveAccount(page, result.accounts.sender.accountId);
    if (prior?.shield?.hash) {
      result.shield = prior.shield;
      log("sender-shield-reused", { hash: result.shield.hash });
      await shot(page, "03-reused-shielded-balance");
      saveResult();
    } else {
      result.shield = await createShieldedBalance(page, 5);
      log("sender-shield", { hash: result.shield.hash });
      await shot(page, "03-sender-after-shield");
      saveResult();
    }

    result.shield.balance = await waitForSpendableShieldedBalance(
      page,
      result.accounts.sender,
      String(result.faucet.sender.asset_definition_id ?? "").trim(),
      1,
    );
    saveResult();

    result.shieldedSend = await submitShieldedSend(
      page,
      result.accounts.receiver.accountId,
      1,
    );
    log("shielded-send", { hash: result.shieldedSend.hash });
    await shot(page, "04-after-shielded-send");
    saveResult();

    await setActiveAccount(page, result.accounts.receiver.accountId);
    result.receiverWallet = await captureReceiverWallet(page);
    await shot(page, "05-receiver-wallet-post-send");
    saveResult();
  } catch (error) {
    result.error = String(error?.stack || error);
    saveResult();
    try {
      await shot(page, "failure");
    } catch {}
    throw error;
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
