#!/usr/bin/env node

import { mkdirSync, existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const screenshotDir = join(projectRoot, "output", "playwright");

const toriiUrl = mustEnv("E2E_TORII_URL");
const chainId = mustEnv("E2E_CHAIN_ID");
const assetDefinitionId =
  process.env.E2E_ASSET_DEFINITION_ID || "rose#wonderland";
const networkPrefix = parseNetworkPrefix(process.env.E2E_NETWORK_PREFIX);
const stateful = process.env.E2E_STATEFUL === "1";

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

function mustEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseNetworkPrefix(rawValue) {
  if (!rawValue) return 42;
  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
    throw new Error("E2E_NETWORK_PREFIX must be an integer from 0 to 255.");
  }
  return parsed;
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
    return process.env.E2E_ACCOUNT_ID.trim();
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
    if (typeof firstId === "string" && firstId.length > 0) {
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
  });
  await page.reload();

  await waitForAccountView(page);
  await configureConnection(page);
  await fill(page, "Display Name", `E2E Stateful ${Date.now()}`);

  await clickButton(page, "Generate recovery phrase");
  await waitVisible(page, ".mnemonic-grid");

  await page.getByLabel("I stored my recovery phrase safely.").check();

  await clickButton(page, "Register account");

  try {
    await page.waitForURL(/#\/setup/, { timeout: 90_000 });
  } catch (error) {
    const onboardingError = await page
      .locator(".helper.error")
      .allTextContents()
      .then((lines) => lines.join(" | "))
      .catch(() => "");
    throw new Error(
      `Stateful onboarding flow did not reach #/setup. UI errors: ${onboardingError || "none reported"}`,
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
  await waitVisibleText(page, "SORA Nexus Account");
  await waitVisibleText(page, "Torii URL");
}

async function configureConnection(page) {
  await fill(page, "Torii URL", toriiUrl);
  await fill(page, "Chain ID", chainId);
  await clickButton(page, "Save connection");
  await waitVisibleText(page, "Connection saved.");
}

async function fill(page, label, value) {
  await page.getByLabel(label, { exact: true }).fill(value);
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
