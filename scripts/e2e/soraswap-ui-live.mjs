#!/usr/bin/env node

import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
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

const chainId = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const networkPrefix = 369;
const toriiUrl = process.env.SORASWAP_TORII_URL || "https://taira.sora.org";
const nodeToriiUrl = process.env.SORASWAP_NODE_TORII_URL || toriiUrl;
const dappUrl =
  process.env.SORASWAP_UI_URL || "https://test.soraswap.org/#/launchpad";
const disableBrowserCors =
  process.env.SORASWAP_UI_DISABLE_BROWSER_CORS === "1";
const blockServiceWorkers =
  process.env.SORASWAP_UI_BLOCK_SERVICE_WORKERS === "1";
const hostResolverRules = process.env.SORASWAP_UI_HOST_RESOLVER_RULES || "";
const ignoreCertificateErrors =
  process.env.SORASWAP_UI_IGNORE_CERTIFICATE_ERRORS === "1";
const safariUserAgent =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.4 Safari/605.1.15";

const readConnectStatus = async (session) => {
  const token = session?.token_management;
  const sid = session?.sid;
  if (!token || !sid) return null;
  const url = new URL(
    `/v1/connect/status?sid=${encodeURIComponent(sid)}`,
    `${nodeToriiUrl}/`,
  );
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!response.ok) {
    return {
      sid,
      error: `${response.status} ${response.statusText}`,
    };
  }
  const status = await response.json();
  return {
    sid,
    app_attached: status.app_attached,
    wallet_attached: status.wallet_attached,
    approved: status.approved,
    buffered_frames: status.buffered_frames,
    last_seq_app_to_wallet: status.last_seq_app_to_wallet,
    last_seq_wallet_to_app: status.last_seq_wallet_to_app,
    origin: status.origin,
  };
};

const chromiumNetworkArgs = () => [
  ...(hostResolverRules ? [`--host-resolver-rules=${hostResolverRules}`] : []),
  ...(ignoreCertificateErrors ? ["--ignore-certificate-errors"] : []),
];

const dappChromiumArgs = () => [
  ...chromiumNetworkArgs(),
  ...(disableBrowserCors
    ? ["--disable-web-security", "--disable-features=IsolateOrigins,site-per-process"]
    : []),
];

const routeUrl = (path) => {
  const url = new URL(dappUrl);
  url.hash = path;
  return url.toString();
};

const summarizeDappState = async (page, label) => {
  const state = await page
    .evaluate(() => ({
      href: globalThis.location.href,
      title: document.title,
      body: document.body?.innerText?.slice(0, 1000) ?? "",
      scripts: [...document.scripts].map(
        (script) => script.src || script.textContent?.slice(0, 80) || "",
      ),
      appHtml: document.querySelector("#app")?.innerHTML.slice(0, 500) ?? "",
    }))
    .catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
  console.log(`${label}: ${JSON.stringify(state)}`);
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
    `${nodeToriiUrl}/`,
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

const finishWalletConnectionApproval = async (walletPage) => {
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

const approveWalletConnection = async (walletPage) => {
  await walletPage
    .getByRole("heading", { name: "Approve connection?" })
    .waitFor({ state: "visible", timeout: 45_000 });
  await finishWalletConnectionApproval(walletPage);
};

const writeWalletQr = async (walletHref) => {
  await QRCode.toFile(walletQrPath, walletHref, {
    errorCorrectionLevel: "M",
    margin: 8,
    width: 1024,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
};

const uploadWalletQr = async (walletPage) => {
  const panel = walletPage.locator("details.header-connect");
  const isOpen = await panel
    .evaluate((element) => element.open)
    .catch(() => false);
  if (!isOpen) {
    await walletPage.getByTestId("header-irohaconnect-button").click();
  }
  await walletPage
    .getByText(/^(?:IrohaConnect Pairing|Connect pairing)$/)
    .waitFor({ state: "visible", timeout: 15_000 });
  await walletPage
    .getByRole("button", { name: "Upload QR image" })
    .waitFor({ state: "visible", timeout: 15_000 });
  await walletPage
    .locator(".header-connect input[type='file']")
    .setInputFiles(walletQrPath);
};

const logConnectDiagnostics = async (dappPage, walletPage, label) => {
  const dapp = dappPage
    ? await dappPage
        .evaluate(() => ({
          href: globalThis.location.href,
          session: globalThis.__soraswapLastConnectSession ?? null,
          body: document.body?.innerText?.slice(0, 700) ?? "",
        }))
        .catch((error) => ({
          error: error instanceof Error ? error.message : String(error),
        }))
    : null;
  const status = dapp?.session
    ? await readConnectStatus(dapp.session).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }))
    : null;
  const wallet = await walletPage
    .evaluate(() => ({
      dialogHeading:
        document.querySelector('[role="dialog"] h2')?.textContent?.trim() ??
        null,
      pendingSignature:
        document.body?.innerText?.includes("Approve transaction signature?") ??
        false,
      connectMenuOpen:
        document.querySelector("details.header-connect")?.open ?? null,
      body: document.body?.innerText?.slice(0, 700) ?? "",
    }))
    .catch((error) => ({
      error: error instanceof Error ? error.message : String(error),
    }));
  console.log(
    `${label} connect diagnostics: ${JSON.stringify({ status, dapp, wallet })}`,
  );
};

const approveWalletSignature = async (walletPage, label, dappPage) => {
  const heading = walletPage.getByRole("heading", {
    name: "Approve transaction signature?",
  });
  const deadline = Date.now() + 90_000;
  let nextLog = Date.now() + 10_000;
  while (!(await heading.isVisible().catch(() => false))) {
    if (Date.now() >= deadline) {
      await logConnectDiagnostics(
        dappPage,
        walletPage,
        `${label} signature timeout`,
      );
      throw new Error(`${label} wallet signature dialog did not appear.`);
    }
    if (Date.now() >= nextLog) {
      await logConnectDiagnostics(
        dappPage,
        walletPage,
        `${label} waiting for signature`,
      );
      nextLog += 15_000;
    }
    await walletPage.waitForTimeout(500);
  }
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
  await writeWalletQr(walletHref);

  await uploadWalletQr(walletPage);
  const decodeError = walletPage.getByText(
    "No MultiFormat Readers were able to detect the code.",
    { exact: true },
  );
  const uploadResult = await Promise.race([
    walletPage
      .getByRole("heading", { name: "Approve connection?" })
      .waitFor({ state: "visible", timeout: 45_000 })
      .then(() => "approval"),
    decodeError.waitFor({ state: "visible", timeout: 45_000 }).then(
      () => "decode-error",
    ),
  ]);
  if (uploadResult === "decode-error") {
    await walletPage.keyboard.press("Escape");
    await writeWalletQr(walletHref);
    await uploadWalletQr(walletPage);
    await approveWalletConnection(walletPage);
  } else {
    await finishWalletConnectionApproval(walletPage);
  }

  const connectSession = await dappPage.evaluate(
    () => globalThis.__soraswapLastConnectSession ?? null,
  );
  const connectStatus = await readConnectStatus(connectSession).catch(
    (error) => ({
      sid: connectSession?.sid ?? null,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  console.log(
    `Connect status after wallet approval: ${JSON.stringify(connectStatus)}`,
  );

  const useApprovedWallet = dappPage.getByRole("button", {
    name: "Use approved wallet",
  });
  const connectedState = () =>
    document.body.innerText.includes("WALLET SESSION\nReady") ||
    document.body.innerText.includes("Connected account");
  const state = await Promise.race([
    useApprovedWallet
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => "confirmation"),
    dappPage.waitForFunction(connectedState, undefined, {
      timeout: 60_000,
    }).then(() => "ready"),
  ]);
  if (state === "confirmation") {
    const nextAction = await dappPage
      .waitForFunction(
        () => {
          if (
            document.body.innerText.includes("WALLET SESSION\nReady") ||
            document.body.innerText.includes("Connected account")
          ) {
            return "ready";
          }
          const button = Array.from(document.querySelectorAll("button")).find(
            (candidate) =>
              candidate.textContent?.trim() === "Use approved wallet",
          );
          return button && !button.disabled ? "click" : false;
        },
        undefined,
        { timeout: 30_000 },
      )
      .then((handle) => handle.jsonValue());
    if (nextAction === "click") {
      await dappPage.evaluate(() => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (candidate) =>
            candidate.textContent?.trim() === "Use approved wallet",
        );
        button?.click();
      });
    }
  }
  await dappPage.waitForFunction(connectedState, undefined, {
    timeout: 30_000,
  });
};

const waitForSuccessNotice = async (locator, label) => {
  await locator.waitFor({ state: "visible", timeout: 300_000 });
  const text = (await locator.innerText()).trim();
  if (
    !/Pipeline confirmation reached/i.test(text) &&
    !/Live launchpad state includes sale/i.test(text)
  ) {
    throw new Error(`${label} did not reach live confirmation: ${text}`);
  }
  console.log(`${label}: ${text}`);
  return text;
};

const runPreparedSubmit = async ({
  dappPage,
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
  await walletPage.waitForTimeout(2_000);
  await logConnectDiagnostics(dappPage, walletPage, `${label} after submit`);
  await approveWalletSignature(walletPage, label, dappPage);
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
  await fillInputByLabel(dappPage, "Initial supply", "1500");
  await fillInputByLabel(dappPage, "Claim inventory", "1000");
  await fillInputByLabel(dappPage, "Seed inventory", "100");
  await fillInputByLabel(dappPage, "Unit price", "1");
  await fillInputByLabel(dappPage, "Soft cap", "1");
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
        hasText: /Live launchpad state includes sale/i,
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
      args: [...chromiumNetworkArgs(), mainEntry],
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
      args: dappChromiumArgs(),
    });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      userAgent: safariUserAgent,
      ignoreHTTPSErrors: true,
      serviceWorkers: blockServiceWorkers ? "block" : "allow",
    });
    await context.addInitScript(
      ({ toriiUrl, chainId, shouldOverrideRuntime }) => {
        const originalFetch = globalThis.fetch.bind(globalThis);
        globalThis.__soraswapLastConnectSession = null;
        globalThis.fetch = async (...args) => {
          const response = await originalFetch(...args);
          try {
            const requestUrl =
              typeof args[0] === "string"
                ? args[0]
                : args[0] instanceof URL
                  ? args[0].toString()
                  : args[0]?.url;
            const method =
              args[1]?.method ??
              (typeof args[0] === "object" && args[0]?.method) ??
              "GET";
            if (
              String(method).toUpperCase() === "POST" &&
              requestUrl &&
              new URL(requestUrl, globalThis.location.href).pathname ===
                "/v1/connect/session"
            ) {
              globalThis.__soraswapLastConnectSession = await response
                .clone()
                .json();
            }
            if (requestUrl) {
              const parsedUrl = new URL(requestUrl, globalThis.location.href);
              if (
                parsedUrl.pathname === "/v1/contracts/call" ||
                /\/v1\/accounts\/.+\/transactions$/u.test(parsedUrl.pathname)
              ) {
                response
                  .clone()
                  .json()
                  .then((body) => {
                    if (parsedUrl.pathname === "/v1/contracts/call") {
                      const summary = {
                        ok: body?.ok,
                        submitted: body?.submitted,
                        tx_hash_hex: body?.tx_hash_hex ?? null,
                        entrypoint_hash_hex: body?.entrypoint_hash_hex ?? null,
                        pipeline_status:
                          body?.pipeline_status?.content?.status?.kind ?? null,
                        creation_time_ms: body?.creation_time_ms ?? null,
                        entrypoint: body?.entrypoint ?? null,
                      };
                      console.log(
                        `[soraswap-contract-call] ${response.status} ${JSON.stringify(summary)}`,
                      );
                      return;
                    }
                    const first = Array.isArray(body?.items)
                      ? body.items[0] ?? null
                      : null;
                    console.log(
                      `[soraswap-account-transactions] ${response.status} ${JSON.stringify(
                        {
                          total: body?.total ?? null,
                          first: first
                            ? {
                                entrypoint_hash: first.entrypoint_hash,
                                result_ok: first.result_ok,
                                timestamp_ms: first.timestamp_ms,
                              }
                            : null,
                        },
                      )}`,
                    );
                  })
                  .catch(() => {});
              }
            }
          } catch {
            // Diagnostic only.
          }
          return response;
        };
        if (shouldOverrideRuntime) {
          localStorage.setItem(
            "soraswap.runtime-config.v2",
            JSON.stringify({
              toriiUrl,
              dataspace: "universal",
              connectChainId: chainId,
              connectAppName: "SoraSwap",
              connectAppUrl: "https://test.soraswap.org/",
              refreshMs: 15000,
            }),
          );
        }
      },
      {
        toriiUrl,
        chainId,
        shouldOverrideRuntime: Boolean(process.env.SORASWAP_TORII_URL),
      },
    );
    dappPage = await context.newPage();
    dappPage.on("console", (message) =>
      console.log(`[dapp:${message.type()}] ${message.text()}`),
    );
    dappPage.on("pageerror", (error) =>
      console.log(`[dapp:pageerror] ${error.message}`),
    );
    dappPage.on("response", (response) => {
      const url = response.url();
      const status = response.status();
      const relevant =
        url.includes("test.soraswap.org") ||
        url.includes("/v1/connect/session") ||
        url.includes("/v1/connect/status") ||
        status >= 400;
      if (relevant) {
        console.log(`[dapp:response] ${response.status()} ${url}`);
      }
    });
    dappPage.on("requestfailed", (request) => {
      console.log(
        `[dapp:requestfailed] ${request.failure()?.errorText ?? "unknown"} ${request.url()}`,
      );
    });
    dappPage.setDefaultTimeout(45_000);
    await dappPage.goto(dappUrl, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await dappPage.waitForTimeout(12_000);
    await summarizeDappState(dappPage, "Dapp state after initial launchpad load");
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
      await summarizeDappState(dappPage, "Dapp state at failure");
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
