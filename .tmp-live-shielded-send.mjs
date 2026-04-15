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
    if (window.__codexFaucetCaptureInstalled) {
      window.__codexLastFaucetResult = null;
      return;
    }
    const original = window.iroha.requestFaucetFunds.bind(window.iroha);
    window.__codexLastFaucetResult = null;
    window.iroha.requestFaucetFunds = async (...args) => {
      const response = await original(...args);
      window.__codexLastFaucetResult = response;
      return response;
    };
    window.__codexFaucetCaptureInstalled = true;
  });
}

async function readCapturedFaucetResult(page) {
  return await page.evaluate(() => window.__codexLastFaucetResult ?? null);
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

function extractHash(text, pattern) {
  return String(text ?? "").match(pattern)?.[1] ?? null;
}

async function claimFaucet(page, label, accountId, excludeHashes = new Set()) {
  await gotoRoute(page, "#/wallet");
  await waitForWallet(page);
  await armFaucetResultCapture(page);
  const claimButton = page.getByRole("button", {
    name: /Claim(?: Testnet)? XOR/i,
  });
  await claimButton.waitFor({ state: "visible", timeout: 60_000 });
  if (await claimButton.isDisabled()) {
    throw new Error(`${label}: faucet button disabled before claim`);
  }
  const startedAtMs = Date.now() - 5_000;
  await claimButton.click();
  let balanceMatch = null;
  let balanceWaitError = null;
  try {
    balanceMatch = await waitForAccountAsset(page, accountId, 25_000, 300_000);
  } catch (error) {
    balanceWaitError = error;
  }
  const captured = await readCapturedFaucetResult(page);
  let tx = null;
  if (captured?.tx_hash_hex) {
    tx = {
      hash: String(captured.tx_hash_hex).trim(),
      authority: faucetAuthority,
      createdAt: null,
      createdAtMs: null,
      block: null,
    };
  } else {
    tx = await waitForExplorerCommittedTx({
      authority: faucetAuthority,
      createdAfterMs: startedAtMs,
      excludeHashes,
    });
  }
  const state = await page.evaluate(() => {
    const raw = localStorage.getItem("iroha-demo:session");
    const session = raw ? JSON.parse(raw) : null;
    return {
      assetDefinitionId: String(session?.connection?.assetDefinitionId ?? ""),
      faucetMessage:
        document.querySelector(".wallet-faucet-message")?.textContent?.trim() ??
        "",
      faucetError:
        document
          .querySelector(".wallet-faucet-message.wallet-faucet-error")
          ?.textContent?.trim() ?? "",
    };
  });
  if (balanceWaitError) {
    const acceptedMessage = String(state.faucetMessage ?? "");
    if (!/accepted|requested|claimed/i.test(acceptedMessage)) {
      throw balanceWaitError;
    }
  }
  return {
    tx_hash_hex: tx.hash,
    asset_definition_id:
      String(captured?.asset_definition_id ?? "").trim() || state.assetDefinitionId,
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
      throw new Error(state.shieldError);
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

async function submitShieldedSend(page, receiverAccountId, amount) {
  await gotoRoute(page, "#/send");
  await page.locator(".send-shell").first().waitFor({
    state: "visible",
    timeout: 60_000,
  });
  const destinationInput = page
    .locator(".send-form label")
    .filter({ hasText: "Destination Account ID" })
    .locator("input")
    .first();
  await destinationInput.waitFor({ state: "visible", timeout: 60_000 });
  await destinationInput.fill(receiverAccountId);
  const amountInput = page.locator('input[type="number"]').first();
  await amountInput.fill(String(amount));
  const shieldToggle = page
    .locator('.shield-option input[type="checkbox"]')
    .first();
  await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await shieldToggle.isEnabled())) {
    const notes = await page
      .locator(".send-feedback .send-note")
      .allTextContents();
    throw new Error(`send shield toggle disabled: ${notes.join(" | ")}`);
  }
  await shieldToggle.check();
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
    if (reuseResultPath) {
      const prior = JSON.parse(readFileSync(reuseResultPath, "utf8"));
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
      await waitForAccountAsset(page, result.accounts.sender.accountId, 25_000, 60_000);
      await setActiveAccount(page, result.accounts.receiver.accountId);
      await waitForAccountAsset(page, result.accounts.receiver.accountId, 25_000, 60_000);
      await setActiveAccount(page, result.accounts.sender.accountId);
      await shot(page, "01-reused-funded-accounts");
      saveResult();
    }

    await setActiveAccount(page, result.accounts.sender.accountId);
    result.shield = await createShieldedBalance(page, 5);
    log("sender-shield", { hash: result.shield.hash });
    await shot(page, "03-sender-after-shield");
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
