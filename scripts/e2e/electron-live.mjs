#!/usr/bin/env node

import { mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";
import {
  isOnboardingConflictError,
  isOnboardingDisabledError,
  isSupportedAccountIdLiteral,
  parseNetworkPrefix,
} from "./electron-live-utils.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const screenshotDir = join(projectRoot, "output", "playwright");
const tairaToriiUrl = "https://taira.sora.org";
const tairaChainId = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const tairaToriiHosts = new Set(["taira.sora.org", "www.taira.sora.org"]);

const toriiUrl = readEnv("E2E_TORII_URL", tairaToriiUrl);
const chainId = readEnv("E2E_CHAIN_ID", tairaChainId);
const assetDefinitionId =
  process.env.E2E_ASSET_DEFINITION_ID || "rose#wonderland";
const networkPrefix = parseNetworkPrefix(process.env.E2E_NETWORK_PREFIX);
const stateful = process.env.E2E_STATEFUL === "1";
const statefulAlias = readEnv("E2E_STATEFUL_ALIAS", "E2E Stateful Shared");
const statefulPrivateKeyHex = readEnv(
  "E2E_STATEFUL_PRIVATE_KEY_HEX",
  "c1f4e0837b224bf67dd4bd8fb94f8f78e6d1856e6f6a2f89f5cb9184160a95c7",
).toLowerCase();
const statefulOfflineSeedBalance = readEnv(
  "E2E_STATEFUL_OFFLINE_BALANCE",
  "100",
);

if (!/^[0-9a-f]{64}$/i.test(statefulPrivateKeyHex)) {
  throw new Error(
    "E2E_STATEFUL_PRIVATE_KEY_HEX must be a 64-character hexadecimal string.",
  );
}
if (
  !Number.isFinite(Number(statefulOfflineSeedBalance)) ||
  Number(statefulOfflineSeedBalance) <= 0
) {
  throw new Error(
    "E2E_STATEFUL_OFFLINE_BALANCE must be a positive numeric string.",
  );
}

const defaultAccountId =
  process.env.E2E_ACCOUNT_ID ||
  "ed0120CE7FA46C9DCE7EA4B125E2E36BDB63EA33073E7590AC92816AE1E861B7048B03@wonderland";
const syntheticPublicKeyHex =
  `ed0120${randomBytes(32).toString("hex")}`.toUpperCase();
const syntheticPrivateKeyHex = randomBytes(32).toString("hex");

async function main() {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run "npm run build" first.`,
    );
  }

  assertTairaTarget(toriiUrl, chainId);
  await preflightToriiHealth(toriiUrl);
  const seededAccountId = await resolveSeedAccountId(toriiUrl);
  mkdirSync(screenshotDir, { recursive: true });

  let app;
  let page;
  try {
    app = await electron.launch({
      args: [mainEntry],
      env: process.env,
    });
    page = await app.firstWindow();
    page.setDefaultTimeout(45_000);

    await runReadOnlyFlow(page, seededAccountId);
    if (stateful) {
      await runStatefulFlow(page);
    }

    console.log(
      stateful
        ? "Live Electron E2E passed (read-only + stateful flows)."
        : "Live Electron E2E passed (read-only flow).",
    );
  } catch (error) {
    if (page) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      const screenshotPath = join(
        screenshotDir,
        `electron-live-failure-${stamp}.png`,
      );
      try {
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.error(`Saved failure screenshot: ${screenshotPath}`);
      } catch (screenshotError) {
        console.error("Failed to capture failure screenshot:", screenshotError);
      }
    }
    throw error;
  } finally {
    if (app) {
      await app.close();
    }
  }
}

function readEnv(name, fallback) {
  const value = process.env[name]?.trim();
  return value || fallback;
}

function normalizeHost(url) {
  const parsed = new URL(url);
  return parsed.host.toLowerCase();
}

function assertTairaTarget(baseUrl, chain) {
  const host = normalizeHost(baseUrl);
  if (!tairaToriiHosts.has(host) || chain !== tairaChainId) {
    throw new Error(
      [
        "This wallet build is TAIRA-only.",
        `Use Torii URL ${tairaToriiUrl} and chain ID ${tairaChainId}.`,
        `Received Torii URL ${baseUrl} and chain ID ${chain}.`,
      ].join(" "),
    );
  }
}

async function preflightToriiHealth(baseUrl) {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const healthUrls = ["v1/health", "health"].map((path) =>
    new URL(path, normalizedBase).toString(),
  );
  const attempts = [];

  for (const healthUrl of healthUrls) {
    const timeout = AbortSignal.timeout(15_000);
    try {
      const response = await fetch(healthUrl, {
        method: "GET",
        signal: timeout,
      });
      if (response.ok) return;
      const bodySnippet = await response.text().catch(() => "");
      attempts.push(
        `${healthUrl} -> ${response.status} ${response.statusText}${bodySnippet ? `: ${bodySnippet.slice(0, 120)}` : ""}`,
      );
    } catch (error) {
      attempts.push(`${healthUrl} -> ${String(error)}`);
    }
  }

  throw new Error(
    `Torii health preflight failed. Attempts: ${attempts.join(" | ")}`,
  );
}

async function runReadOnlyFlow(page, seededAccountId) {
  await waitForAccountView(page);
  await configureConnection(page);

  await fill(page, "Display Name", `E2E Synthetic ${Date.now()}`);
  await clickButton(page, "Generate recovery phrase");
  await waitVisible(page, ".mnemonic-grid");

  await page.evaluate(
    ({
      accountId,
      publicKeyHex,
      privateKeyHex,
      torii,
      chain,
      assetId,
      prefix,
    }) => {
      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [
            {
              displayName: "E2E Synthetic",
              domain: "wonderland",
              accountId,
              publicKeyHex,
              privateKeyHex,
              ih58: "",
              compressed: "",
              compressedWarning: "",
            },
          ],
          activeAccountId: accountId,
          customChains: [],
        }),
      );
    },
    {
      accountId: seededAccountId,
      publicKeyHex: syntheticPublicKeyHex,
      privateKeyHex: syntheticPrivateKeyHex,
      torii: toriiUrl,
      chain: chainId,
      assetId: assetDefinitionId,
      prefix: networkPrefix,
    },
  );

  await page.reload();
  await page.evaluate(() => {
    window.location.hash = "#/explore";
  });

  await page.waitForFunction(() => window.location.hash === "#/explore", {
    timeout: 45_000,
  });
  await page.waitForTimeout(2_000);

  const bridgeProbe = await page.evaluate(
    async ({ torii, accountId }) => {
      const out = {
        metrics: null,
        metricsError: null,
        qr: null,
        qrError: null,
        hash: window.location.hash,
        hasExplorerMetricsText:
          document.body.textContent?.includes("Explorer Metrics") ?? false,
        hasExploreHeading:
          document.body.textContent?.includes("Explore") ?? false,
        cardCount: document.querySelectorAll(".card").length,
      };
      try {
        out.metrics = await window.iroha.getExplorerMetrics({
          toriiUrl: torii,
        });
      } catch (error) {
        out.metricsError = String(error);
      }
      try {
        out.qr = await window.iroha.getExplorerAccountQr({
          toriiUrl: torii,
          accountId,
        });
      } catch (error) {
        out.qrError = String(error);
      }
      return out;
    },
    { torii: toriiUrl, accountId: seededAccountId },
  );

  if (!bridgeProbe.metrics) {
    throw new Error(
      `Expected explorer metrics to resolve, but got null/error. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  if (!bridgeProbe.qr) {
    throw new Error(
      `Expected explorer QR payload to resolve, but got null/error. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  const metricsUnavailable = page.getByText(
    "Metrics unavailable. Check Torii status.",
  );
  if (await metricsUnavailable.isVisible().catch(() => false)) {
    throw new Error(
      `Expected explorer metrics panel to render, but fallback text remained. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  const noQrMessage = page.getByText(
    "No QR payload yet. Connect to Torii and pick an account.",
  );
  if (await noQrMessage.isVisible().catch(() => false)) {
    throw new Error(
      `Expected explorer QR panel to render, but fallback text remained. Probe: ${JSON.stringify(
        bridgeProbe,
      ).slice(0, 1200)}`,
    );
  }

  await page
    .getByAltText("Explorer account QR")
    .waitFor({ state: "visible", timeout: 30_000 });

  await page.getByRole("heading", { name: "Explorer", exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  await runNavigationSmokeFlow(page);
}

async function resolveSeedAccountId(baseUrl) {
  if (process.env.E2E_ACCOUNT_ID?.trim()) {
    const fromEnv = process.env.E2E_ACCOUNT_ID.trim();
    if (isSupportedAccountIdLiteral(fromEnv)) {
      return fromEnv;
    }
    throw new Error(
      `E2E_ACCOUNT_ID has unsupported format: ${fromEnv}. Provide IH58/sora/0x/uaid/opaque or <alias|public_key>@domain.`,
    );
  }
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  const accountsUrl = new URL("v1/accounts?limit=1", normalizedBase).toString();
  try {
    const response = await fetch(accountsUrl, {
      method: "GET",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return defaultAccountId;
    const payload = await response.json().catch(() => null);
    const firstId = payload?.items?.[0]?.id;
    if (isSupportedAccountIdLiteral(firstId)) {
      return firstId;
    }
  } catch (_error) {
    // Fall back to the deterministic bootstrap account id below.
  }
  return defaultAccountId;
}

async function runStatefulFlow(page) {
  await page.evaluate(() => {
    localStorage.removeItem("iroha-demo:session");
    localStorage.removeItem("iroha-demo:offline");
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);
  const statefulBootstrap = await page.evaluate(
    async ({
      torii,
      chain,
      assetId,
      prefix,
      alias,
      privateKeyHex,
      offlineBalance,
    }) => {
      const { publicKeyHex } = window.iroha.derivePublicKey(privateKeyHex);
      const summary = window.iroha.deriveAccountAddress({
        domain: "wonderland",
        publicKeyHex,
        networkPrefix: prefix,
      });
      const accountProfile = {
        displayName: alias,
        domain: "wonderland",
        accountId: summary.accountId,
        publicKeyHex,
        privateKeyHex,
        ih58: summary.ih58 ?? "",
        compressed: summary.compressed ?? "",
        compressedWarning: summary.compressedWarning ?? "",
      };

      let onboarding = { status: "ok", detail: "" };
      try {
        await window.iroha.onboardAccount({
          toriiUrl: torii,
          alias,
          accountId: summary.accountId,
          identity: {
            source: "electron-live-stateful",
            managed_by: "e2e-harness",
          },
        });
      } catch (error) {
        onboarding = {
          status: "error",
          detail: String(error ?? ""),
        };
      }

      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl: torii,
            chainId: chain,
            assetDefinitionId: assetId,
            networkPrefix: prefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [accountProfile],
          activeAccountId: accountProfile.accountId,
          customChains: [],
        }),
      );

      localStorage.setItem(
        "iroha-demo:offline",
        JSON.stringify({
          hydrated: true,
          wallet: {
            balance: offlineBalance,
            nextCounter: 0,
            replayLog: [],
            history: [],
            syncedAtMs: null,
            nextPolicyExpiryMs: null,
            nextRefreshMs: null,
          },
          hardware: {
            supported: false,
            registered: false,
            credentialId: null,
            registeredAtMs: null,
          },
        }),
      );

      return {
        accountId: accountProfile.accountId,
        onboarding,
      };
    },
    {
      torii: toriiUrl,
      chain: chainId,
      assetId: assetDefinitionId,
      prefix: networkPrefix,
      alias: statefulAlias,
      privateKeyHex: statefulPrivateKeyHex,
      offlineBalance: statefulOfflineSeedBalance,
    },
  );

  const onboardingStatus = statefulBootstrap?.onboarding?.status ?? "";
  const onboardingDetail = String(statefulBootstrap?.onboarding?.detail ?? "");
  if (onboardingStatus === "error") {
    if (isOnboardingDisabledError(onboardingDetail)) {
      throw new Error(
        `Stateful onboarding is disabled on ${toriiUrl} (HTTP 403). Enable UAID onboarding on the target Torii and rerun e2e:live:stateful.`,
      );
    }
    if (!isOnboardingConflictError(onboardingDetail)) {
      throw new Error(
        `Stateful onboarding probe failed: ${onboardingDetail || "unknown error"}`,
      );
    }
  }

  const persistedAccountId = statefulBootstrap?.accountId ?? null;
  if (
    typeof persistedAccountId !== "string" ||
    !persistedAccountId.includes("@")
  ) {
    throw new Error(
      `Stateful onboarding persisted an ambiguous account id literal: ${String(persistedAccountId)}`,
    );
  }

  await page.reload();

  await page.evaluate(() => {
    window.location.hash = "#/send";
  });
  await page.waitForFunction(() => window.location.hash === "#/send", {
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: "Send Points", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const sendCard = page
    .locator("section.card")
    .filter({ hasText: "Transfer Asset" })
    .first();
  const sendShieldToggle = sendCard.getByLabel("Shield transfer", {
    exact: true,
  });
  await sendShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await sendShieldToggle.isEnabled())) {
    throw new Error(
      "Expected send shield toggle to be enabled in stateful flow.",
    );
  }
  await sendShieldToggle.check();
  const sendDestination = sendCard.getByPlaceholder(
    "34m... or 0x...@wonderland",
  );
  if (!(await sendDestination.isDisabled())) {
    throw new Error(
      "Expected send destination to lock when shield transfer is enabled in stateful flow.",
    );
  }
  if ((await sendDestination.inputValue()).trim() !== persistedAccountId) {
    throw new Error(
      `Expected send shield destination to auto-lock to active account ${persistedAccountId}.`,
    );
  }
  const sendAmountInput = sendCard.locator('input[type="number"]').first();
  await sendAmountInput.fill("1");
  const sendSubmitButton = sendCard.getByRole("button", {
    name: "Shield",
    exact: true,
  });
  if (await sendSubmitButton.isDisabled()) {
    throw new Error("Expected send shield submit button to be enabled.");
  }
  const sendStatusBefore = await sendCard
    .locator("p.helper")
    .last()
    .textContent()
    .then((value) => String(value ?? "").trim());
  await sendSubmitButton.click();
  const sendStatusAfter = await page
    .waitForFunction(
      ({ baseline }) => {
        const cards = [...document.querySelectorAll("section.card")];
        const card = cards.find((node) =>
          node.querySelector("h2")?.textContent?.includes("Transfer Asset"),
        );
        if (!card) return null;
        const helpers = [...card.querySelectorAll("p.helper")]
          .map((node) => (node.textContent ?? "").trim())
          .filter(Boolean);
        if (!helpers.length) return null;
        const last = helpers[helpers.length - 1];
        return last && last !== baseline ? last : null;
      },
      { baseline: sendStatusBefore },
      { timeout: 90_000 },
    )
    .then((handle) => handle.jsonValue());
  const sendStatus = String(sendStatusAfter ?? "").trim();
  if (!sendStatus) {
    throw new Error("Send shield submission did not produce a status message.");
  }
  if (
    [
      "Configure Torii + account first.",
      "Shield mode is unavailable.",
      "Shield mode requires destination to be your active account.",
      "Shield amount must be a whole number greater than zero.",
    ].includes(sendStatus)
  ) {
    throw new Error(
      `Send shield submission did not reach bridge submission path: ${sendStatus}`,
    );
  }

  await page.evaluate(() => {
    window.location.hash = "#/offline";
  });
  await page.waitForFunction(() => window.location.hash === "#/offline", {
    timeout: 45_000,
  });
  await page
    .getByRole("heading", { name: "Offline", exact: true, level: 1 })
    .waitFor({ state: "visible", timeout: 45_000 });

  const moveCard = page
    .locator("section.card")
    .filter({ hasText: "Move funds to online wallet" })
    .first();
  const moveShieldToggle = moveCard.getByLabel("Shield transfer", {
    exact: true,
  });
  await moveShieldToggle.waitFor({ state: "visible", timeout: 30_000 });
  if (!(await moveShieldToggle.isEnabled())) {
    throw new Error(
      'Expected offline "Shield transfer" toggle to be enabled in stateful flow.',
    );
  }
  await moveShieldToggle.check();
  const moveDestination = moveCard.getByPlaceholder(
    "34m... or 0x...@wonderland",
  );
  if (!(await moveDestination.isDisabled())) {
    throw new Error(
      'Expected offline destination to lock when "Shield transfer" is enabled in stateful flow.',
    );
  }
  if ((await moveDestination.inputValue()).trim() !== persistedAccountId) {
    throw new Error(
      `Expected offline shield destination to auto-lock to active account ${persistedAccountId}.`,
    );
  }
  const moveAmountInput = moveCard.locator('input[type="text"]').first();
  await moveAmountInput.fill("1");
  const moveSubmitButton = moveCard.getByRole("button", {
    name: "Shield to online wallet",
    exact: true,
  });
  if (await moveSubmitButton.isDisabled()) {
    throw new Error(
      'Expected offline "Shield to online wallet" submit button to be enabled.',
    );
  }
  const moveStatusBefore = await moveCard
    .locator("p.helper")
    .last()
    .textContent()
    .then((value) => String(value ?? "").trim());
  await moveSubmitButton.click();
  const moveStatusAfter = await page
    .waitForFunction(
      ({ baseline }) => {
        const cards = [...document.querySelectorAll("section.card")];
        const card = cards.find((node) =>
          node
            .querySelector("h2")
            ?.textContent?.includes("Move funds to online wallet"),
        );
        if (!card) return null;
        const helpers = [...card.querySelectorAll("p.helper")]
          .map((node) => (node.textContent ?? "").trim())
          .filter(Boolean);
        if (!helpers.length) return null;
        const last = helpers[helpers.length - 1];
        return last && last !== baseline ? last : null;
      },
      { baseline: moveStatusBefore },
      { timeout: 90_000 },
    )
    .then((handle) => handle.jsonValue());
  const moveStatus = String(moveStatusAfter ?? "").trim();
  if (!moveStatus) {
    throw new Error(
      'Offline "Shield to online wallet" submission did not produce a status message.',
    );
  }
  if (
    [
      "Configure Torii and account first.",
      "Shield mode is unavailable.",
      "Shield mode requires destination to be your active account.",
      "Shield amount must be a whole number greater than zero.",
      "Enter an amount to move online.",
      "Insufficient offline balance for this withdrawal.",
    ].includes(moveStatus)
  ) {
    throw new Error(
      `Offline shield submission did not reach bridge submission path: ${moveStatus}`,
    );
  }
}

async function runNavigationSmokeFlow(page) {
  const checks = [
    {
      hash: "#/setup",
      heading: "Session Setup",
      sectionText: "Torii Connection",
    },
    {
      hash: "#/wallet",
      heading: "Wallet Overview",
      sectionText: "Balances",
    },
    {
      hash: "#/staking",
      heading: "NPOS Staking",
      sectionText: "Nominate Validators",
    },
    {
      hash: "#/parliament",
      heading: "SORA Parliament",
      sectionText: "Citizenship Bond",
    },
    {
      hash: "#/subscriptions",
      heading: "Subscription Hub",
      sectionText: "Add subscription",
    },
    {
      hash: "#/send",
      heading: "Send Points",
      sectionText: "Transfer Asset",
    },
    {
      hash: "#/receive",
      heading: "Receive Points",
      sectionText: "Share Payment QR",
    },
    {
      hash: "#/offline",
      heading: "Offline",
      sectionText: "Offline wallet & hardware",
    },
    {
      hash: "#/explore",
      heading: "Explorer",
      sectionText: "Explorer Metrics",
    },
  ];

  for (const check of checks) {
    await page.evaluate((hash) => {
      window.location.hash = hash;
    }, check.hash);

    await page.waitForFunction(
      (expectedHash) => window.location.hash === expectedHash,
      check.hash,
      {
        timeout: 45_000,
      },
    );
    await page
      .getByRole("heading", { name: check.heading, exact: true, level: 1 })
      .waitFor({
        state: "visible",
        timeout: 45_000,
      });
    await page.getByText(check.sectionText, { exact: true }).first().waitFor({
      state: "visible",
      timeout: 45_000,
    });

    if (check.hash === "#/staking") {
      const claimRewardsButton = page.getByRole("button", {
        name: "Claim Rewards",
        exact: true,
      });
      await claimRewardsButton.waitFor({
        state: "visible",
        timeout: 45_000,
      });
      const noRewardsMessage = page.getByText(
        "No pending rewards for this lane/account.",
        {
          exact: true,
        },
      );
      const noRewardsVisible = await noRewardsMessage
        .waitFor({ state: "visible", timeout: 8_000 })
        .then(() => true)
        .catch(() => false);
      if (noRewardsVisible && !(await claimRewardsButton.isDisabled())) {
        throw new Error(
          "Expected Claim Rewards button to be disabled when no pending rewards are shown.",
        );
      }
    }

    if (check.hash === "#/parliament") {
      await page
        .getByRole("button", { name: "Bond 10000 XOR", exact: true })
        .waitFor({
          state: "visible",
          timeout: 45_000,
        });
      await page
        .getByRole("button", { name: "Submit ballot", exact: true })
        .waitFor({
          state: "visible",
          timeout: 45_000,
        });
    }

    if (check.hash === "#/send") {
      const shieldToggle = page.getByLabel("Shield transfer", { exact: true });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await page
          .getByRole("button", { name: "Send", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = page.getByPlaceholder(
        "34m... or 0x...@wonderland",
      );
      const amountInput = page.locator('input[type="number"]').first();
      const transparentDestination = "restore-send@wonderland";
      await destinationInput.fill(transparentDestination);

      const transparentStep = await amountInput.getAttribute("step");
      if (transparentStep !== "0.01") {
        throw new Error(
          `Expected send amount step to be 0.01 before shielding, got ${String(transparentStep)}.`,
        );
      }

      await shieldToggle.check();

      if (!(await destinationInput.isDisabled())) {
        throw new Error(
          "Expected send destination to lock when shield transfer is enabled.",
        );
      }
      const shieldStep = await amountInput.getAttribute("step");
      if (shieldStep !== "1") {
        throw new Error(
          `Expected send amount step to be 1 in shield mode, got ${String(shieldStep)}.`,
        );
      }
      const shieldSubmitButton = page.getByRole("button", {
        name: "Shield",
        exact: true,
      });
      await amountInput.fill("10.5");
      if (!(await shieldSubmitButton.isDisabled())) {
        throw new Error(
          "Expected send shield action to be disabled for decimal amounts.",
        );
      }
      await amountInput.fill("10");
      if (await shieldSubmitButton.isDisabled()) {
        throw new Error(
          "Expected send shield action to become enabled for whole-number amounts.",
        );
      }

      await page
        .getByRole("button", { name: "Shield", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
      if (await shieldToggle.isChecked()) {
        let attemptedManualUncheck = false;
        if (await shieldToggle.isEnabled()) {
          attemptedManualUncheck = true;
          await shieldToggle.uncheck({ timeout: 3_000 }).catch(() => undefined);
        }
        if (await shieldToggle.isChecked()) {
          await page.waitForTimeout(1_000);
        }
        if (await shieldToggle.isChecked()) {
          throw new Error(
            attemptedManualUncheck
              ? "Send shield toggle stayed checked after uncheck attempt."
              : "Send shield toggle stayed checked after becoming disabled.",
          );
        }
      }
      if ((await destinationInput.inputValue()) !== transparentDestination) {
        throw new Error(
          "Expected send destination to restore the previous transparent value after disabling shield transfer.",
        );
      }
      const restoredStep = await amountInput.getAttribute("step");
      if (restoredStep !== "0.01") {
        throw new Error(
          `Expected send amount step to return to 0.01 after disabling shield mode, got ${String(restoredStep)}.`,
        );
      }
      await page
        .getByRole("button", { name: "Send", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
    }

    if (check.hash === "#/offline") {
      const moveCard = page
        .locator("section.card")
        .filter({ hasText: "Move funds to online wallet" })
        .first();
      const shieldToggle = moveCard.getByLabel("Shield transfer", {
        exact: true,
      });
      await shieldToggle.waitFor({ state: "visible", timeout: 30_000 });
      if (!(await shieldToggle.isEnabled())) {
        await moveCard
          .getByRole("button", { name: "Send to online wallet", exact: true })
          .waitFor({ state: "visible", timeout: 30_000 });
        continue;
      }
      const destinationInput = moveCard.getByPlaceholder(
        "34m... or 0x...@wonderland",
      );
      const transparentDestination = "restore-offline@wonderland";
      await destinationInput.fill(transparentDestination);
      await shieldToggle.check();

      if (!(await destinationInput.isDisabled())) {
        throw new Error(
          'Expected offline "Move funds to online wallet" destination to lock when shield transfer is enabled.',
        );
      }

      await moveCard
        .getByRole("button", { name: "Shield to online wallet", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
      const moveAmountInput = moveCard.locator('input[type="text"]').first();
      const moveSubmitButton = moveCard.getByRole("button", {
        name: "Shield to online wallet",
        exact: true,
      });
      await moveAmountInput.fill("10.5");
      if (!(await moveSubmitButton.isDisabled())) {
        throw new Error(
          'Expected offline "Shield to online wallet" action to be disabled for decimal amounts.',
        );
      }
      await moveAmountInput.fill("10");
      if (await moveSubmitButton.isDisabled()) {
        throw new Error(
          'Expected offline "Shield to online wallet" action to become enabled for whole-number amounts.',
        );
      }

      if (await shieldToggle.isChecked()) {
        let attemptedManualUncheck = false;
        if (await shieldToggle.isEnabled()) {
          attemptedManualUncheck = true;
          await shieldToggle.uncheck({ timeout: 3_000 }).catch(() => undefined);
        }
        if (await shieldToggle.isChecked()) {
          await page.waitForTimeout(1_000);
        }
        if (await shieldToggle.isChecked()) {
          throw new Error(
            attemptedManualUncheck
              ? 'Offline "Shield transfer" toggle stayed checked after uncheck attempt.'
              : 'Offline "Shield transfer" toggle stayed checked after becoming disabled.',
          );
        }
      }
      if ((await destinationInput.inputValue()) !== transparentDestination) {
        throw new Error(
          'Expected offline "Move funds to online wallet" destination to restore the previous transparent value after disabling shield transfer.',
        );
      }
      await moveCard
        .getByRole("button", { name: "Send to online wallet", exact: true })
        .waitFor({ state: "visible", timeout: 30_000 });
    }
  }

  // Ensure receive page still renders a QR payload in the hydrated account flow.
  await page.evaluate(() => {
    window.location.hash = "#/receive";
  });
  await page.waitForFunction(() => window.location.hash === "#/receive", {
    timeout: 45_000,
  });
  await clickButton(page, "Show QR Code");
  await page
    .locator(".qr svg")
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });
}

async function waitForAccountView(page) {
  await waitVisibleText(page, "TAIRA Testnet Account");
  await waitVisibleText(
    page,
    "TAIRA testnet connection is fixed for onboarding in this build.",
  );
}

async function configureConnection(page) {
  // Connection fields are not editable in TAIRA-only builds.
  await waitVisibleText(
    page,
    "TAIRA testnet connection is fixed for onboarding in this build.",
  );
}

async function fill(page, label, value) {
  await page.getByLabel(label, { exact: false }).first().fill(value);
}

async function clickButton(page, name) {
  await page.getByRole("button", { name, exact: true }).click();
}

async function waitVisible(page, selector) {
  await page
    .locator(selector)
    .first()
    .waitFor({ state: "visible", timeout: 45_000 });
}

async function waitVisibleText(page, text) {
  await page
    .getByText(text, { exact: true })
    .waitFor({ state: "visible", timeout: 45_000 });
}

await main().catch((error) => {
  console.error(error);
  process.exit(1);
});
