# Iroha Demo (Electron + Vue 3)

A refreshed version of the original 2016 point-system demo. The app now runs as a desktop client with Electron, Vue 3, Pinia, and Vite, and talks directly to Torii using the in-repo `@iroha/iroha-js` SDK.

## Features

- 🔑 Modern onboarding workflow to configure Torii, generate/restore keys, and compute canonical account IDs (IH58/compressed formats included).
- 🌐 Network profile locked to TAIRA testnet (`https://taira.sora.org`) with explorer quick-link (`https://taira-explorer.sora.org`).
- 💸 Direct asset transfers signed locally via `@iroha/iroha-js` and submitted to Torii without an intermediate backend.
- 📊 Wallet dashboard with live balances + decoded transaction directions.
- 🏦 NPOS staking tab for dataspace-first validator nomination, XOR bonding, unbond scheduling/finalization, and reward claiming.
- 🏛️ Parliament tab with a fixed `10,000 XOR` citizenship bond flow, governance referendum/proposal lookup, and plain ballot submission helpers.
- 📱 Receive tab with IH58 display + QR payloads, and Send tab with an optional camera scanner powered by ZXing.
- 🛡️ Send tab and Offline "Move funds to online wallet" both support a shield toggle; current wallet flow performs self-shielding (public -> shielded) with policy preflight checks.
- 📡 Explorer tab surfacing `/v1/explorer` metrics and share-ready QR payloads.
- 🌍 Locale selector with 31 supported UI locales (`en-US`, `ar-SA`, `az-AZ`, `ca-ES`, `cs-CZ`, `de-DE`, `es-ES`, `fa-IR`, `fi-FI`, `fr-FR`, `he-IL`, `hi-IN`, `hu-HU`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `ms-MY`, `nb-NO`, `nl-NL`, `pl-PL`, `pt-PT`, `ru-RU`, `sr-RS`, `sl-SI`, `tr-TR`, `uk-UA`, `ur-PK`, `vi-VN`, `zh-CN`, `zh-TW`) with automatic RTL layout for Arabic/Hebrew/Persian/Urdu.

## Prerequisites

- Node.js 20+
- TAIRA Torii endpoint access (`https://taira.sora.org`)
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

For verification plus live TAIRA E2E (read-only + onboarding pass):

```bash
npm run verify:live
```

### Live Electron E2E

Run the live Torii Electron E2E harness (defaults to TAIRA):

```bash
npm run e2e:live
```

Optional env vars:

- `E2E_TORII_URL` (default: `https://taira.sora.org`)
- `E2E_CHAIN_ID` (default: `809574f5-fee7-5e69-bfcf-52451e42d50f`)
- `E2E_ASSET_DEFINITION_ID` (default: `rose#wonderland`)
- `E2E_NETWORK_PREFIX` (default: `42`)
- `E2E_ACCOUNT_ID` (optional seed account for read-only Explore QR assertions)
- `E2E_ONBOARDING_ALIAS` (default: `E2E Onboarding Shared`)
- `E2E_ONBOARDING_PRIVATE_KEY_HEX` (default: deterministic built-in key; used for stable onboarding account reuse)
- `E2E_ONBOARDING_OFFLINE_BALANCE` (default: `100`; seeded offline balance for onboarding shield submission checks)

Deprecated `E2E_STATEFUL_*` onboarding env vars are no longer supported and now fail fast.
Rename legacy vars as follows:

- `E2E_STATEFUL_ALIAS` -> `E2E_ONBOARDING_ALIAS`
- `E2E_STATEFUL_PRIVATE_KEY_HEX` -> `E2E_ONBOARDING_PRIVATE_KEY_HEX`
- `E2E_STATEFUL_OFFLINE_BALANCE` -> `E2E_ONBOARDING_OFFLINE_BALANCE`

In this TAIRA-only wallet build, live E2E only supports TAIRA Torii + chain ID values.

The preflight checks `GET /v1/health` first, then falls back to `GET /health`.

Live E2E always validates read-only navigation first (Account onboarding inputs, Explore metrics + explorer QR rendering, and route-smoke navigation across Setup/Wallet/Staking/Parliament/Subscriptions/Send/Receive/Offline/Explore), then runs onboarding/shield-submit checks.

The onboarding pass reuses a deterministic account to avoid writing a new TAIRA account record on every run.

This onboarding pass requires UAID onboarding enabled on the target Torii.
If onboarding is disabled, the harness fails with an explicit `HTTP 403`.
If the deterministic account already exists, `HTTP 409` is treated as expected and the flow continues.

The onboarding pass submits shield actions from both Send and Offline views, then asserts that post-submit status messages are produced (success or backend rejection) to verify bridge submission paths.

If a test fails, screenshots are written under `output/playwright/`.

## Usage notes

1. **Account setup** — first-run wizard for provisioning a TAIRA testnet account. Generate a recovery phrase, derive the canonical `accountId`, register it via `/v1/accounts/onboard`, and pair with IrohaConnect if you want to keep signing on mobile devices.
2. **Setup tab** — TAIRA Torii URL + chain ID are locked; set your asset definition and key material. Generate or import a key pair to derive the canonical `accountId` (for example `0x…@wonderland`, with IH58 shown after onboarding). Saving the authority key enables the built-in “Register account” helper, which submits a Norito transaction via Torii.
3. **Wallet tab** — refresh balances and recent transactions. Transfers are decoded when the instructions include `Transfer::Asset` payloads.
4. **Staking tab** — choose a dataspace, auto-resolve its public lane, nominate validators, review stake-token balance, and stake XOR with on-chain unbond delay handling (`Max` shortcuts for bond/unbond included).
5. **Parliament tab** — bond a fixed `10,000 XOR` amount via `RegisterCitizen`, inspect referendum/proposal/tally/locks payloads, submit plain ballots, and prepare finalize/enact draft calls for governance operations. Recent referendum/proposal chips are persisted per account and trigger lookup when clicked. If referendum ID is set, lookup continues even when proposal ID input is invalid (proposal lookup is skipped). Ballot submit requires a positive whole-number amount that does not exceed the current XOR balance.
6. **Send tab** — create transfers signed with the local private key. Optional QR scanning populates destination + amount. Shield mode is available from the send form and currently supports self-shielding only (destination is locked to the active account and amount must be whole-number base units).
7. **Receive tab** — share IH58 plus a QR encoding `{ accountId, assetDefinitionId, amount }`.
8. **Explorer tab** — displays `/v1/explorer` metrics and the Torii-generated explorer QR payload for the active account.
9. **Offline tab** — "Move funds to online wallet" mirrors shield behavior from Send: shield mode locks destination to the active account and requires whole-number base units.

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
- `transferAsset` → `buildTransferAssetTransaction` (transparent) or `buildShieldTransaction` (when shield mode is enabled with supported policy mode)
- `fetchAccountAssets`, `fetchAccountTransactions`, `getExplorerMetrics`, `getExplorerAccountQr`
- `listAccountPermissions`, `registerCitizen`, `getGovernanceProposal`, `getGovernanceReferendum`, `getGovernanceTally`, `getGovernanceLocks`, `getGovernanceCouncilCurrent`
- `submitGovernancePlainBallot`, `finalizeGovernanceReferendum`, `enactGovernanceProposal`
- `getSumeragiStatus`, `getNexusPublicLaneValidators`, `getNexusPublicLaneStake`, `getNexusPublicLaneRewards`, `getNexusStakingPolicy`
- `bondPublicLaneStake`, `schedulePublicLaneUnbond`, `finalizePublicLaneUnbond`, `claimPublicLaneRewards`

A failing Torii call never crashes the renderer; errors bubble up as toast/status messages so users can retry after fixing connectivity or credentials.

## Security disclaimer

This demo persists private keys in local storage for convenience, which is **not appropriate** for production wallets. Integrate with a secure keystore/OS enclave before using with real funds.
