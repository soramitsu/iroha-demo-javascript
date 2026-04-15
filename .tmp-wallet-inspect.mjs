import { join } from 'node:path';
import { _electron as electron } from 'playwright';
const projectRoot = '/Users/takemiyamakoto/dev/iroha-demo-javascript';
const mainEntry = join(projectRoot, 'dist', 'main', 'index.cjs');
const app = await electron.launch({ args: [mainEntry], env: process.env });
const page = await app.firstWindow();
page.setDefaultTimeout(60000);
await page.waitForFunction(() => Boolean(window.iroha), { timeout: 60000 });
const seeded = await page.evaluate(() => {
  localStorage.removeItem('iroha-demo:session');
  localStorage.setItem('iroha-demo:locale', 'en-US');
  const { publicKeyHex, privateKeyHex } = window.iroha.generateKeyPair();
  const summary = window.iroha.deriveAccountAddress({ domain: 'inspect', publicKeyHex, networkPrefix: 369 });
  localStorage.setItem('iroha-demo:session', JSON.stringify({
    hydrated: true,
    connection: { toriiUrl: 'https://taira.sora.org', chainId: '809574f5-fee7-5e69-bfcf-52451e42d50f', assetDefinitionId: '', networkPrefix: 369 },
    authority: { accountId: '', privateKeyHex: '' },
    accounts: [{ displayName: 'Inspect', domain: 'inspect', accountId: summary.accountId, i105AccountId: summary.i105AccountId, i105DefaultAccountId: summary.i105DefaultAccountId, publicKeyHex, privateKeyHex, localOnly: true }],
    activeAccountId: summary.accountId,
    customChains: [],
  }));
  return summary;
});
console.log('seeded', JSON.stringify(seeded));
await page.reload();
await page.evaluate(() => { window.location.hash = '#/wallet'; });
await page.waitForTimeout(3000);
const before = await page.evaluate(() => ({
  hash: window.location.hash,
  title: document.title,
  body: (document.body.textContent ?? '').slice(0, 2000),
  buttons: [...document.querySelectorAll('button')].map((node) => (node.textContent ?? '').trim()).filter(Boolean),
  claimDisabled: document.querySelector('.wallet-faucet-button')?.getAttribute('disabled'),
}));
console.log('before', JSON.stringify(before));
await page.screenshot({ path: join(projectRoot, 'output', 'playwright', 'inspect-before.png'), fullPage: true });
const claimButton = page.locator('.wallet-faucet-button').first();
await claimButton.click();
await page.waitForTimeout(10000);
const after = await page.evaluate(() => ({
  hash: window.location.hash,
  body: (document.body.textContent ?? '').slice(0, 3000),
  buttons: [...document.querySelectorAll('button')].map((node) => ({ text: (node.textContent ?? '').trim(), disabled: node.hasAttribute('disabled') })),
  faucetMessage: document.querySelector('.wallet-faucet-message')?.textContent?.trim() ?? '',
  faucetError: document.querySelector('.wallet-faucet-error')?.textContent?.trim() ?? '',
  modalTitle: document.querySelector('.wallet-faucet-modal-title')?.textContent?.trim() ?? '',
  modalDetail: document.querySelector('.wallet-faucet-modal-detail')?.textContent?.trim() ?? '',
}));
console.log('after', JSON.stringify(after));
await page.screenshot({ path: join(projectRoot, 'output', 'playwright', 'inspect-after.png'), fullPage: true });
await app.close();
