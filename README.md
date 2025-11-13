# Iroha Demo (Electron + Vue 3)

A refreshed version of the original 2016 point-system demo. The app now runs as a desktop client with Electron, Vue 3, Pinia, and Vite, and talks directly to Torii using the in-repo `@iroha/iroha-js` SDK.

## Features

- 🔑 Modern onboarding workflow to configure Torii, generate/restore keys, and compute canonical account IDs (IH58/compressed formats included).
- 💸 Direct asset transfers signed locally via `@iroha/iroha-js` and submitted to Torii without an intermediate backend.
- 📊 Wallet dashboard with live balances + decoded transaction directions.
- 📱 Receive tab with IH58 display + QR payloads, and Send tab with an optional camera scanner powered by ZXing.
- 📡 Explorer tab surfacing `/v1/explorer` metrics and share-ready QR payloads.

## Prerequisites

- Node.js 20+
- A Torii endpoint you can talk to (local or remote)
- Rust toolchain for compiling the `iroha_js_host` native module

## Install & Run

```bash
npm install
npm run dev
```

The postinstall hook auto-builds the `@iroha/iroha-js` native binding the first time you install dependencies. If you update the SDK manually, re-run:

```bash
(cd node_modules/@iroha/iroha-js && npm run build:native)
```

### Production build

```bash
npm run build
```

Artifacts land in `dist/` (main, preload, renderer bundles) and can be packaged with your preferred Electron builder.

### Tests

Run the Vitest suite (jsdom + coverage) after installing dependencies:

```bash
npm test
```

Use `npm run test:watch` while developing renderer logic or stores.

## Usage notes

1. **UAID setup** — new first-run wizard that walks users through SORA Nexus UAID registration. Paste the issued `uaid:<hex>` value, optionally verify it against Torii (bindings + manifests), and save it locally so the rest of the app can derive dataspace context.
2. **Setup tab** — configure Torii URL, chain ID, and your asset definition. Generate or import a key pair to derive the canonical `accountId` (e.g. `ed0120…@wonderland`). Saving the authority key enables the built-in “Register account” helper, which submits a Norito transaction via Torii.
3. **Wallet tab** — refresh balances and recent transactions. Transfers are decoded when the instructions include `Transfer::Asset` payloads.
4. **Send tab** — create transfers signed with the local private key. Optional QR scanning populates destination + amount.
5. **Receive tab** — share IH58 plus a QR encoding `{ accountId, assetDefinitionId, amount }`.
6. **Explorer tab** — displays `/v1/explorer` metrics and the Torii-generated explorer QR payload for the active account.

## Folder structure

```
├─ electron/          # Main + preload processes
├─ src/
│  ├─ components/
│  ├─ services/      # Bridge wrappers around window.iroha
│  ├─ stores/        # Pinia session store with persistence
│  ├─ views/         # Route-aligned pages (Setup, Wallet, etc.)
│  └─ styles/
├─ scripts/postinstall.mjs  # Builds iroha_js_host when needed
├─ electron.vite.config.ts  # electron-vite configuration
└─ package.json
```

## Torii connectivity

All network calls go straight to Torii using the `ToriiClient` inside `@iroha/iroha-js`. The preload script keeps a small client cache and exposes safe IPC-free helpers via `window.iroha`:

- `ping` → `/v1/health`
- `registerAccount` → `buildRegisterAccountAndTransferTransaction` + `/v1/pipeline/transactions`
- `transferAsset` → `buildTransferAssetTransaction`
- `fetchAccountAssets`, `fetchAccountTransactions`, `getExplorerMetrics`, `getExplorerAccountQr`

A failing Torii call never crashes the renderer; errors bubble up as toast/status messages so users can retry after fixing connectivity or credentials.

## Security disclaimer

This demo persists private keys in local storage for convenience, which is **not appropriate** for production wallets. Integrate with a secure keystore/OS enclave before using with real funds.
