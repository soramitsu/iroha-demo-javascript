#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AccountAddress,
  publicKeyFromPrivate,
  encodeI105AccountAddress,
} from "@iroha/iroha-js";
import { _electron as electron, chromium } from "playwright";
import QRCode from "qrcode";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..", "..");
const soraswapRoot = resolve(projectRoot, "..", "soraswap");
const mainEntry = join(projectRoot, "dist", "main", "index.cjs");
const outputDir = join(projectRoot, "output", "e2e");
const walletQrPath = join(outputDir, "soraswap-connect-wallet-qr.png");
const walletScreenshotPath = join(outputDir, "soraswap-wallet-final.png");
const dappScreenshotPath = join(outputDir, "soraswap-dapp-final.png");
const testnetClientConfig = join(
  soraswapRoot,
  "config",
  "testnet",
  "taira.client.toml",
);

const toriiUrl = "https://taira.sora.org";
const chainId = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const networkPrefix = 369;
const dappUrl =
  process.env.SORASWAP_UI_URL || "https://test.soraswap.org/#/launchpad";
const safariUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";

const routeUrl = (path) => {
  const url = new URL(dappUrl);
  url.hash = path;
  return url.toString();
};

const readTomlString = (content, key) => {
  const match = content.match(new RegExp(`${key}\\s*=\\s*"([^"]+)"`));
  if (!match) {
    throw new Error(`${key} is missing from ${testnetClientConfig}.`);
  }
  return match[1];
};

const stripMultihashPrefix = (value, prefix, label) => {
  const normalized = String(value ?? "").trim();
  if (!normalized.toLowerCase().startsWith(prefix.toLowerCase())) {
    throw new Error(`${label} does not start with ${prefix}.`);
  }
  const raw = normalized.slice(prefix.length);
  if (!/^[0-9a-f]{64}$/i.test(raw)) {
    throw new Error(`${label} raw key must be 64 hex characters.`);
  }
  return raw.toUpperCase();
};

const loadFundedTairaWallet = async () => {
  const config = await readFile(testnetClientConfig, "utf8");
  const privateKeyHex = stripMultihashPrefix(
    readTomlString(config, "private_key"),
    "802620",
    "account.private_key",
  );
  const configuredPublicKeyHex = stripMultihashPrefix(
    readTomlString(config, "public_key"),
    "ed0120",
    "account.public_key",
  );
  const publicKeyHex = Buffer.from(
    publicKeyFromPrivate(Buffer.from(privateKeyHex, "hex")),
  )
    .toString("hex")
    .toUpperCase();
  if (publicKeyHex !== configuredPublicKeyHex) {
    throw new Error(
      "TAIRA client private key does not match configured public key.",
    );
  }
  const address = AccountAddress.fromAccount({
    publicKey: Buffer.from(publicKeyHex, "hex"),
  });
  const canonicalBytes = Uint8Array.from(address.canonicalBytes());
  const accountId = encodeI105AccountAddress(canonicalBytes, {
    chainDiscriminant: networkPrefix,
  });
  return {
    accountId,
    i105AccountId: accountId,
    i105DefaultAccountId: encodeI105AccountAddress(canonicalBytes, {
      chainDiscriminant: networkPrefix,
    }),
    publicKeyHex,
    privateKeyHex,
  };
};

const assertFundedAssets = async (accountId) => {
  const url = new URL(
    `/v1/accounts/${encodeURIComponent(accountId)}/assets`,
    `${toriiUrl}/`,
  );
  url.searchParams.set("limit", "100");
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Unable to read TAIRA assets for E2E wallet: ${response.status} ${response.statusText}`,
    );
  }
  const payload = await response.json();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const byAlias = new Map(
    items.map((item) => [
      String(item.asset_alias ?? item.asset_name ?? "").toLowerCase(),
      item,
    ]),
  );
  for (const alias of ["n3x#soraswap.universal", "usdt#soraswap.universal"]) {
    const item = byAlias.get(alias);
    const quantity = Number(item?.quantity ?? 0);
    if (!item || !Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`E2E wallet is missing a positive ${alias} balance.`);
    }
  }
  return items;
};

const waitForWalletBridge = async (page) => {
  await page.waitForFunction(
    () =>
      Boolean(
        window.iroha?.deriveAccountAddress && window.iroha?.storeAccountSecret,
      ),
    undefined,
    { timeout: 45_000 },
  );
};

const seedWalletSession = async (page, wallet) => {
  await waitForWalletBridge(page);
  await page.evaluate(
    async ({ wallet, toriiUrl, chainId, networkPrefix }) => {
      await window.iroha.storeAccountSecret({
        accountId: wallet.accountId,
        privateKeyHex: wallet.privateKeyHex,
      });
      localStorage.setItem("iroha-demo:locale", "en-US");
      localStorage.setItem(
        "iroha-demo:session",
        JSON.stringify({
          hydrated: true,
          connection: {
            toriiUrl,
            chainId,
            assetDefinitionId: "usdt#soraswap.universal",
            networkPrefix,
          },
          authority: {
            accountId: "",
            privateKeyHex: "",
          },
          accounts: [
            {
              displayName: "SoraSwap TAIRA E2E",
              domain: "default",
              accountId: wallet.accountId,
              i105AccountId: wallet.i105AccountId,
              i105DefaultAccountId: wallet.i105DefaultAccountId,
              publicKeyHex: wallet.publicKeyHex,
              privateKeyHex: wallet.privateKeyHex,
              hasStoredSecret: true,
              localOnly: false,
            },
          ],
          activeAccountId: wallet.accountId,
          customChains: [],
        }),
      );
    },
    { wallet, toriiUrl, chainId, networkPrefix },
  );
  await page.reload();
  await page.getByTestId("header-irohaconnect-button").waitFor({
    state: "visible",
    timeout: 45_000,
  });
};

const approveWalletConnection = async (walletPage) => {
  await walletPage
    .getByRole("heading", { name: "Approve connection?" })
    .waitFor({ state: "visible", timeout: 45_000 });
  await walletPage.getByRole("button", { name: "Approve connection" }).click();
  const modalHeading = walletPage.getByRole("heading", {
    name: "Approve connection?",
  });
  const errorMessage = walletPage.getByText(
    "IrohaConnect relay connection failed.",
    {
      exact: true,
    },
  );
  const result = await Promise.race([
    modalHeading
      .waitFor({ state: "hidden", timeout: 45_000 })
      .then(() => "approved"),
    errorMessage
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => "relay-error"),
  ]);
  if (result === "relay-error") {
    throw new Error("Wallet failed to open the IrohaConnect relay WebSocket.");
  }
};

const approveWalletSignature = async (walletPage, label) => {
  await walletPage
    .getByRole("heading", { name: "Approve transaction signature?" })
    .waitFor({ state: "visible", timeout: 90_000 });
  await walletPage.getByRole("button", { name: "Approve and sign" }).click();
  await walletPage
    .getByRole("heading", { name: "Approve transaction signature?" })
    .waitFor({ state: "hidden", timeout: 90_000 });
  console.log(`${label}: wallet signature approved`);
};

const pairWallet = async (dappPage, walletPage) => {
  await dappPage
    .getByRole("button", { name: /^Connect$/ })
    .first()
    .click();
  const qr = dappPage.getByAltText("IrohaConnect wallet QR");
  await qr.waitFor({ state: "visible", timeout: 45_000 });
  let walletHref = await dappPage
    .getByRole("link", { name: /Open wallet link/i })
    .getAttribute("href");
  if (!walletHref || !new URL(walletHref).searchParams.get("token")) {
    throw new Error(
      "SoraSwap Connect wallet link did not include a wallet token.",
    );
  }
  await dappPage.waitForTimeout(1500);
  walletHref = await dappPage
    .getByRole("link", { name: /Open wallet link/i })
    .getAttribute("href");
  if (!walletHref || !new URL(walletHref).searchParams.get("token")) {
    throw new Error("SoraSwap Connect wallet link lost its wallet token.");
  }
  console.log(`Connect sid: ${new URL(walletHref).searchParams.get("sid")}`);
  const qrSrc = await qr.getAttribute("src");
  if (qrSrc?.startsWith("data:image/")) {
    const [, encoded] = qrSrc.split(",", 2);
    if (!encoded) {
      throw new Error("SoraSwap Connect QR image data was empty.");
    }
    await writeFile(walletQrPath, Buffer.from(encoded, "base64"));
  } else {
    await QRCode.toFile(walletQrPath, walletHref, {
      errorCorrectionLevel: "L",
      margin: 4,
      width: 720,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  }

  await walletPage.getByTestId("header-irohaconnect-button").click();
  await walletPage
    .locator(".header-connect input[type='file']")
    .setInputFiles(walletQrPath);
  await approveWalletConnection(walletPage);

  await dappPage
    .getByText("Wallet connected", { exact: true })
    .waitFor({ state: "visible", timeout: 60_000 });
  await dappPage.getByRole("button", { name: "Use approved wallet" }).click();
  await dappPage
    .getByText("Connected account", { exact: true })
    .waitFor({ state: "visible", timeout: 30_000 });
};

const waitForSuccessNotice = async (locator, label) => {
  await locator.waitFor({ state: "visible", timeout: 120_000 });
  const text = (await locator.innerText()).trim();
  if (!/Pipeline confirmation reached/i.test(text)) {
    throw new Error(`${label} did not reach pipeline confirmation: ${text}`);
  }
  console.log(`${label}: ${text}`);
  return text;
};

const runPreparedSubmit = async ({
  walletPage,
  label,
  prepareButton,
  submitButton,
  successNotice,
}) => {
  await prepareButton.waitFor({ state: "visible", timeout: 45_000 });
  await prepareButton.click();
  await submitButton.waitFor({ state: "visible", timeout: 60_000 });
  await submitButton.click();
  await approveWalletSignature(walletPage, label);
  return waitForSuccessNotice(successNotice, label);
};

const fillInputByLabel = async (page, label, value) => {
  const input = page.getByLabel(label, { exact: true });
  await input.waitFor({ state: "visible", timeout: 30_000 });
  await input.fill(value);
};

const createLaunchpadTokenSale = async (dappPage, walletPage, wallet) => {
  const stamp = Date.now().toString(36);
  const saleId = `ui_sale_${stamp}`;
  const tokenHandle = `uit${stamp}`;

  await dappPage.goto(routeUrl("/launchpad/create"), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await dappPage.getByRole("heading", { name: "Configure sale" }).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  await fillInputByLabel(dappPage, "Sale id", saleId);
  await dappPage.getByLabel("Create sale token", { exact: true }).check();
  await fillInputByLabel(dappPage, "Token handle", tokenHandle);
  await fillInputByLabel(
    dappPage,
    "Payment asset id or alias",
    "usdt#soraswap.universal",
  );
  await fillInputByLabel(dappPage, "Treasury account", wallet.accountId);
  await fillInputByLabel(dappPage, "Initial supply", "1000");
  await fillInputByLabel(dappPage, "Claim inventory", "500");
  await fillInputByLabel(dappPage, "Seed inventory", "100");
  await fillInputByLabel(dappPage, "Unit price", "1");
  await fillInputByLabel(dappPage, "Soft cap", "0");
  await fillInputByLabel(dappPage, "Hard cap", "1000");
  await fillInputByLabel(dappPage, "Claim start slot", "0");
  await fillInputByLabel(dappPage, "Claim end slot", "0");

  await runPreparedSubmit({
    dappPage,
    walletPage,
    label: "launchpad token sale",
    prepareButton: dappPage.getByRole("button", { name: "Prepare draft" }),
    submitButton: dappPage.getByRole("button", { name: "Sign and submit" }),
    successNotice: dappPage.locator(".notice.is-success").filter({
      hasText: /Pipeline confirmation reached/i,
    }),
  });

  return { saleId, tokenHandle };
};

const runLiquidity = async (dappPage, walletPage) => {
  await dappPage.goto(routeUrl("/swap/n3x/usdt"), {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await dappPage.getByRole("heading", { name: "Add DLMM position" }).waitFor({
    state: "visible",
    timeout: 45_000,
  });
  const liquiditySection = dappPage
    .locator("section")
    .filter({
      has: dappPage.getByRole("heading", { name: "Add DLMM position" }),
    })
    .first();
  const inputs = liquiditySection.locator("input");
  await inputs.nth(0).fill(`ui_lp_${Date.now().toString(36)}`);
  await dappPage.waitForFunction(
    () => {
      const headings = Array.from(document.querySelectorAll("h3"));
      const liquidityHeading = headings.find((heading) =>
        heading.textContent?.includes("Add DLMM position"),
      );
      const section = liquidityHeading?.closest("section");
      const input = section?.querySelectorAll("input")?.[1];
      return Boolean(input && input.value.trim());
    },
    undefined,
    { timeout: 45_000 },
  );
  await inputs.nth(2).fill("1");
  await inputs.nth(3).fill("1");
  await inputs.nth(4).fill("1");

  await runPreparedSubmit({
    dappPage,
    walletPage,
    label: "DLMM liquidity",
    prepareButton: liquiditySection.getByRole("button", {
      name: "Prepare liquidity",
    }),
    submitButton: liquiditySection.getByRole("button", {
      name: "Sign and submit liquidity",
    }),
    successNotice: liquiditySection.locator(".notice.is-success").filter({
      hasText: /Pipeline confirmation reached/i,
    }),
  });
};

const runSwap = async (dappPage, walletPage) => {
  await dappPage.locator(".input--amount").first().fill("1");
  await runPreparedSubmit({
    dappPage,
    walletPage,
    label: "spot swap",
    prepareButton: dappPage.getByRole("button", { name: "Prepare trade" }),
    submitButton: dappPage.getByRole("button", { name: "Sign and submit" }),
    successNotice: dappPage
      .locator(".trade-sidebar .notice.is-success")
      .filter({
        hasText: /Pipeline confirmation reached/i,
      }),
  });
};

const main = async () => {
  if (!existsSync(mainEntry)) {
    throw new Error(
      `Built Electron entrypoint not found: ${mainEntry}. Run npm run build first.`,
    );
  }
  await mkdir(outputDir, { recursive: true });
  const wallet = await loadFundedTairaWallet();
  const assets = await assertFundedAssets(wallet.accountId);
  console.log(
    `Using TAIRA wallet ${wallet.accountId} with ${assets.length} visible assets.`,
  );

  let walletApp;
  let browser;
  let walletPage;
  let dappPage;
  try {
    walletApp = await electron.launch({
      args: [mainEntry],
      env: process.env,
    });
    walletPage = await walletApp.firstWindow();
    walletPage.on("console", (message) =>
      console.log(`[wallet:${message.type()}] ${message.text()}`),
    );
    walletPage.on("pageerror", (error) =>
      console.log(`[wallet:pageerror] ${error.message}`),
    );
    walletPage.setDefaultTimeout(45_000);
    await seedWalletSession(walletPage, wallet);

    browser = await chromium.launch({
      headless: process.env.HEADLESS === "1",
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      userAgent: safariUserAgent,
      ignoreHTTPSErrors: true,
    });
    dappPage = await context.newPage();
    dappPage.on("console", (message) =>
      console.log(`[dapp:${message.type()}] ${message.text()}`),
    );
    dappPage.on("pageerror", (error) =>
      console.log(`[dapp:pageerror] ${error.message}`),
    );
    dappPage.setDefaultTimeout(45_000);
    await dappPage.goto(dappUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await dappPage
      .getByText("genesis_sale_usdt")
      .waitFor({ state: "visible", timeout: 60_000 });
    await pairWallet(dappPage, walletPage);

    const launchpad = await createLaunchpadTokenSale(
      dappPage,
      walletPage,
      wallet,
    );
    await runLiquidity(dappPage, walletPage);
    await runSwap(dappPage, walletPage);

    await walletPage.screenshot({ path: walletScreenshotPath, fullPage: true });
    await dappPage.screenshot({ path: dappScreenshotPath, fullPage: true });
    console.log(
      JSON.stringify(
        {
          ok: true,
          accountId: wallet.accountId,
          launchpad,
          screenshots: {
            wallet: walletScreenshotPath,
            dapp: dappScreenshotPath,
          },
        },
        null,
        2,
      ),
    );
  } catch (error) {
    if (walletPage) {
      await walletPage
        .screenshot({
          path: join(outputDir, "soraswap-wallet-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    }
    if (dappPage) {
      await dappPage
        .screenshot({
          path: join(outputDir, "soraswap-dapp-failure.png"),
          fullPage: true,
        })
        .catch(() => {});
    }
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    await walletApp?.close().catch(() => {});
  }
};

await main().catch((error) => {
  console.error("SoraSwap UI live E2E failed:", error);
  process.exitCode = 1;
});
