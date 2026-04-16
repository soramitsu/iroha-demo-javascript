import { chromium } from "playwright";

const DEFAULT_EXPLORER_ROOT = "https://taira-explorer.sora.org";

const explorerRoot = String(
  process.env.TAIRA_EXPLORER_URL ?? DEFAULT_EXPLORER_ROOT,
).replace(/\/+$/, "");
const txHashes = String(process.env.EXPLORER_TX_HASHES ?? "")
  .split(/[,\s]+/)
  .map((hash) => hash.trim())
  .filter(Boolean);

if (!txHashes.length) {
  throw new Error(
    "Set EXPLORER_TX_HASHES to one or more comma-separated transaction hashes.",
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  for (const hash of txHashes) {
    if (!/^[0-9a-f]{64}$/i.test(hash)) {
      throw new Error(`Invalid transaction hash: ${hash}`);
    }
    const url = `${explorerRoot}/transactions/${hash}`;
    const response = await page.goto(url, {
      waitUntil: "networkidle",
      timeout: 45_000,
    });
    if (!response?.ok()) {
      throw new Error(
        `Explorer page ${url} returned ${response?.status() ?? "no response"}.`,
      );
    }
    await page.getByText(hash, { exact: false }).first().waitFor({
      state: "visible",
      timeout: 30_000,
    });
    await page
      .getByText(/Committed|Rejected/i)
      .first()
      .waitFor({
        state: "visible",
        timeout: 30_000,
      });
    const bodyText = await page.locator("body").innerText({ timeout: 10_000 });
    if (
      !/(Shield|ZkTransfer|Unshield|Transfer|Register|Mint|Burn)/.test(bodyText)
    ) {
      throw new Error(`Explorer page ${url} did not render instructions.`);
    }
    console.log(`ok ${url}`);
  }
} finally {
  await browser.close();
}
