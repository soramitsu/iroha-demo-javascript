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

`@iroha/iroha-js` is sourced from the sibling local checkout at `../iroha/javascript/iroha_js`.

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

### Type checking

`npm run typecheck` now validates both renderer and Electron preload/main code paths:

```bash
npm run typecheck
```

Equivalent sub-commands:

```bash
npm run typecheck:renderer
npm run typecheck:electron
```

### Full verification

For local development checks without E2E:

```bash
npm run verify
```

For full validation including generated localnet Electron E2E:

```bash
npm run verify:localnet
```

Stateful onboarding variant:

```bash
npm run verify:localnet:stateful
```

Run both read-only and stateful localnet E2E after a single lint/typecheck/test pass:

```bash
npm run verify:localnet:all
```

### Live Electron E2E

Run the live Torii Electron E2E harness:

```bash
E2E_TORII_URL=https://your-torii.example:8080 \
E2E_CHAIN_ID=00000000-0000-0000-0000-000000000753 \
npm run e2e:live
```

Required env vars:

- `E2E_TORII_URL`
- `E2E_CHAIN_ID`

Optional env vars:

- `E2E_ASSET_DEFINITION_ID` (default: `rose#wonderland`)
- `E2E_NETWORK_PREFIX` (default: `42`)
- `E2E_ACCOUNT_ID` (optional seed account for read-only Explore QR assertions)
- `E2E_STATEFUL=1` (enables onboarding write flow)

The preflight checks `GET /v1/health` first, then falls back to `GET /health` for localnet deployments.

Read-only mode validates Account onboarding inputs, Explore metrics + explorer QR rendering, and route-smoke navigation across Setup/Wallet/Subscriptions/Send/Receive/Offline/Explore (including Receive QR rendering).

Stateful mode writes test onboarding records to the configured live Torii endpoint:

```bash
E2E_TORII_URL=https://your-torii.example:8080 \
E2E_CHAIN_ID=00000000-0000-0000-0000-000000000753 \
npm run e2e:live:stateful
```

Stateful mode requires a Torii endpoint with UAID onboarding enabled.

If a test fails, screenshots are written under `output/playwright/`.

### One-command localnet E2E

To run against a generated localnet (with UAID onboarding enabled) in one command:

```bash
npm run e2e:localnet
```

Stateful onboarding variant:

```bash
npm run e2e:localnet:stateful
```

Useful overrides:

- `E2E_IROHA_DIR` (default: `../iroha`)
- `E2E_IROHA_TARGET_DIR` (default: `../iroha/target_codex_iroha_demo` when present, otherwise `../iroha/target`)
- `E2E_IROHA_PROFILE` (`debug` or `release`, default: `debug`)
- `E2E_LOCALNET_OUT_DIR` (default: `/tmp/iroha-localnet-e2e`)
- `E2E_LOCALNET_API_PORT` (default: `39080`)
- `E2E_LOCALNET_P2P_PORT` (default: `39337`)
- `E2E_KEEP_LOCALNET=1` (skip auto-stop for debugging)

## Usage notes

1. **Account setup** — first-run wizard for provisioning a SORA Nexus account. Generate a recovery phrase, derive the canonical `accountId`, register it via `/v1/accounts/onboard`, and pair with IrohaConnect if you want to keep signing on mobile devices.
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
├─ scripts/e2e/electron-live.mjs  # Live Torii Electron E2E harness
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
