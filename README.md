# Iroha Demo (Electron + Vue 3)

A refreshed version of the original 2016 point-system demo. The app now runs as a desktop client with Electron, Vue 3, Pinia, and Vite, and talks directly to Torii using the in-repo `@iroha/iroha-js` SDK.

## Features

- 🔑 Modern onboarding workflow to configure Torii, generate/restore keys, and compute canonical account IDs (I105 literals).
- 🌐 Settings-driven Torii endpoint profile with automatic chain ID/network-prefix loading and a Minamoto explorer quick-link (`https://minamoto-explorer.sora.org`).
- 💸 Direct asset transfers signed locally via `@iroha/iroha-js` and submitted to Torii without an intermediate backend.
- 📊 Wallet dashboard with live balances + decoded transaction directions.
- 🏦 NPOS staking tab for dataspace-first validator nomination, XOR bonding, unbond scheduling/finalization, and reward claiming.
- 🏛️ Parliament tab with a fixed `10,000 XOR` citizenship bond flow, governance referendum/proposal lookup, and plain ballot submission helpers.
- 📱 Receive tab with account-ID display + QR payloads, and Send tab with an optional camera scanner powered by ZXing.
- 🛡️ Send tab and Offline "Move funds to online wallet" both support a shield toggle; current wallet flow performs self-shielding (public -> shielded) with policy preflight checks.
- 🔁 SCCP bridge workspace for TAIRA-only SCCP routes: live TRON/BSC/TON surfaces plus a fail-closed Solana testnet route preflight for `taira_sol_xor`.
- 📡 Explorer tab surfacing `/v1/explorer` metrics and share-ready QR payloads.
- 🌍 Locale selector with 31 supported UI locales (`en-US`, `ar-SA`, `az-AZ`, `ca-ES`, `cs-CZ`, `de-DE`, `es-ES`, `fa-IR`, `fi-FI`, `fr-FR`, `he-IL`, `hi-IN`, `hu-HU`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `ms-MY`, `nb-NO`, `nl-NL`, `pl-PL`, `pt-PT`, `ru-RU`, `sr-RS`, `sl-SI`, `tr-TR`, `uk-UA`, `ur-PK`, `vi-VN`, `zh-CN`, `zh-TW`) with automatic RTL layout for Arabic/Hebrew/Persian/Urdu.

## Prerequisites

- Node.js 20+
- Minamoto Torii endpoint access (`https://minamoto.sora.org`)
- TAIRA Torii endpoint access (`https://taira.sora.org`) for faucet-backed live E2E and the SCCP bridge route
- A Reown/WalletConnect project ID when testing TRON wallet connection (`VITE_WALLETCONNECT_PROJECT_ID`)
- Solana testnet RPC access (`https://api.testnet.solana.com`) when preflighting the gated `taira_sol_xor` route
- Rust toolchain for compiling the `iroha_js_host` native module

## Install & Run

```bash
npm install
npm run dev
```

`@iroha/iroha-js` is sourced from the sibling local checkout at `../iroha/javascript/iroha_js`.

The postinstall hook auto-builds the `@iroha/iroha-js` native binding when it is missing or its checksum manifest is stale. `npm run build` also refreshes the copied native bundle before staging `dist/native`. If you update the SDK manually, re-run:

```bash
(cd node_modules/@iroha/iroha-js && npm run build:native)
```

### Production build

```bash
npm run build
```

Artifacts land in `dist/` (main, preload, renderer bundles) and can be packaged with your preferred Electron builder.

### Tests

Run the Vitest suite (jsdom) after installing dependencies:

```bash
npm test
```

Use `npm run test:watch` while developing renderer logic or stores.
Use `npm run test:coverage` when you need a V8 coverage report; it runs Vitest's thread pool to avoid forked-process V8 coverage temp-file races.

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

For verification plus live E2E (read-only + onboarding pass; the faucet-backed harness still targets TAIRA by default):

```bash
npm run verify:live
```

### Live Electron E2E

Run the live Torii Electron E2E harness (defaults to TAIRA because it depends on testnet faucet bootstrapping):

```bash
npm run e2e:live
```

Optional env vars:

- `E2E_TORII_URL` (default: `https://taira.sora.org`)
- `E2E_CHAIN_ID` (default: `809574f5-fee7-5e69-bfcf-52451e42d50f`)
- `E2E_ASSET_DEFINITION_ID` (optional; when omitted, live E2E derives the funded asset bucket from the faucet response or funded wallet holdings)
- `E2E_NETWORK_PREFIX` (default: `369`)
- `E2E_EXPECTED_FAUCET_QUANTITY` (default: `25000`; fresh TAIRA faucet bootstraps fail if the observed funded balance differs)
- `E2E_REUSE_FUNDED_CACHE=1` (optional; reuses `output/e2e/live-funded-wallet.json` instead of forcing a fresh faucet bootstrap)
- `E2E_FUNDED_PRIVATE_KEY_HEX` (optional; bypasses the faucet path and uses an already funded TAIRA wallet for live shield / shielded-send checks)
- `E2E_FUNDED_DOMAIN` (default: `default`; used with `E2E_FUNDED_PRIVATE_KEY_HEX` when deriving the local wallet profile)
- `E2E_ONBOARDING_ALIAS` (default: `e2e-onboarding-shared@universal`)
- `E2E_ONBOARDING_PRIVATE_KEY_HEX` (default: deterministic built-in key; used for stable onboarding account reuse)
- `E2E_ONBOARDING_OFFLINE_BALANCE` (default: `100`; seeded offline balance for onboarding shield submission checks)

Deprecated `E2E_STATEFUL_*` onboarding env vars are no longer supported and now fail fast.
Rename legacy vars as follows:

- `E2E_STATEFUL_ALIAS` -> `E2E_ONBOARDING_ALIAS`
- `E2E_STATEFUL_PRIVATE_KEY_HEX` -> `E2E_ONBOARDING_PRIVATE_KEY_HEX`
- `E2E_STATEFUL_OFFLINE_BALANCE` -> `E2E_ONBOARDING_OFFLINE_BALANCE`

Example migration command:

```bash
E2E_ONBOARDING_ALIAS="e2e-onboarding-shared@universal" \
E2E_ONBOARDING_PRIVATE_KEY_HEX="<64-char-hex>" \
E2E_ONBOARDING_OFFLINE_BALANCE="100" \
E2E_FUNDED_PRIVATE_KEY_HEX="<64-char-funded-wallet-key>" \
npm run e2e:live
```

The desktop app defaults to Minamoto mainnet, but this live E2E harness remains TAIRA-faucet-oriented. Use `E2E_FUNDED_PRIVATE_KEY_HEX` and explicit endpoint settings before adapting it to non-faucet mainnet validation.

The preflight checks `GET /v1/health` first, then falls back to `GET /health`.

Live E2E always validates read-only navigation first (Account onboarding inputs, Explore metrics + explorer QR rendering, and route-smoke navigation across Setup/Wallet/Staking/Parliament/Subscriptions/Send/Receive/Offline/Explore), then runs onboarding plus confidential self-shield / shielded-recipient-transfer checks.

The onboarding pass reuses a deterministic account to avoid writing a new TAIRA account record on every run.

This onboarding pass requires UAID onboarding enabled on the target Torii.
If onboarding is disabled, the harness fails with an explicit `HTTP 403`.
If the deterministic account already exists, `HTTP 409` is treated as expected and the flow continues.

The onboarding pass submits shield actions from both Send and Offline views, then asserts that post-submit status messages are produced (success or backend rejection) to verify bridge submission paths.

If a test fails, screenshots are written under `output/playwright/`.

### SCCP bridge setup

The `/sccp` page is intentionally TAIRA-only. It remains disabled unless the active connection uses TAIRA chain ID `809574f5-fee7-5e69-bfcf-52451e42d50f` and network prefix `369`, even when another endpoint advertises SCCP metadata.

Set the WalletConnect project ID before starting the renderer if you need TRON wallet connection:

```bash
VITE_WALLETCONNECT_PROJECT_ID="<project-id>" npm run dev
```

Optional browser-safe prover module URLs:

- `VITE_SCCP_TRON_PROVER_MODULE_URL` for TAIRA -> TRON destination proofs.
- `VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL` for TRON -> TAIRA source proofs. If omitted, the worker falls back to `VITE_SCCP_TRON_PROVER_MODULE_URL`.

Prover module URLs must be deterministic package-relative paths, HTTPS URLs, or loopback HTTP URLs without credentials, query strings, or fragments.

End users must connect TRON mainnet wallets through WalletConnect/AppKit with namespace `tron`, chain ID `tron:0x2b6653dc`, method `tron_signTransaction`, and `tron_method_version: "v1"`. The app stores only non-secret WalletConnect session metadata, requires the stable WalletConnect topic before reusing a session for signing, and never imports TRON private keys, seed phrases, or generated end-user TRON wallets. Connected TRON TRX and `TairaXOR` token balances are read through Electron preload TRON gateway wrappers, not renderer `fetch()`.

TRON contract deployment uses the separate operator helper in the sibling SDK checkout:

```bash
(cd ../iroha && node scripts/sccp_tron_taira_xor_deploy.mjs generate-deployer)
(cd ../iroha && node scripts/sccp_tron_taira_xor_deploy.mjs doctor --require-secret true --require-verifier true)
(cd ../iroha && node scripts/sccp_tron_taira_xor_deploy.mjs estimate-budget)
```

Fund the printed deployer address before running broadcast deployment. The helper writes ignored artifacts under `../iroha/artifacts/sccp-tron/`; do not reuse the deployer for end-user bridge transfers. After TRON deployment and live readback, use the sibling helper's offline `route-manifest` command to generate the `taira_tron_xor` manifest draft. It validates deployment evidence, the TAIRA burn-record contract artifact, canonical settlement asset ID, verifier material, VK reference, and the computed destination binding hash/key before it can mark `productionReady: true`. Wallet-side route readiness rejects placeholder-sized or oversized burn-record artifacts before enabling live smoke.

After deployment evidence is activated on TAIRA, run the wallet-side read-only route preflight before live transfer smoke:

```bash
SCCP_TAIRA_TORII_URL="https://taira.sora.org" npm run e2e:sccp:preflight
```

The preflight checks TAIRA chain identity, SCCP submit capabilities, `taira_tron_xor` manifest readiness, TRON mainnet contract/verifier/binding material, and TAIRA burn-record material. It does not submit proofs or broadcast TRON transactions.

After the route manifest is live, add read-only TRON contract view checks:

```bash
npm run e2e:sccp:preflight -- --check-tron-contracts true --tron-endpoint https://api.trongrid.io
```

That mode verifies `TairaXOR.bridge()`, `TairaXOR.bridgeLocked()`, `SccpTronSourceBridge.owner()`, and both bridge/verifier `destinationBindingHash()` values against the advertised route manifest.

Before the two live transfer smokes, run the app-side readiness gate as well:

```bash
VITE_WALLETCONNECT_PROJECT_ID="<project-id>" \
VITE_SCCP_TRON_PROVER_MODULE_URL="https://example.invalid/sccp-tron-prover.js" \
VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL="https://example.invalid/sccp-tron-source-prover.js" \
npm run e2e:sccp:smoke-readiness -- --check-tron-contracts true --tron-endpoint https://api.trongrid.io
```

This still does not sign, submit, or broadcast. It combines route preflight with the renderer prerequisites required for a real tiny `TAIRA -> TRON` transfer and a real tiny `TRON -> TAIRA` transfer: WalletConnect project ID plus browser-safe destination/source prover modules.

Solana testnet SCCP is wired as a fail-closed route surface until the public TAIRA endpoint publishes a production-ready `taira_sol_xor` manifest and the app has the required Solana wallet/proof execution path. The `/sccp` tab can select Solana, display live route readiness, connect a Solana wallet, and build the TAIRA -> Solana finalize transaction only when the route manifest and proof job are real. Solana -> TAIRA remains blocked until the deployed Solana source bridge publishes executable burn and TAIRA settlement proof payloads.

The Solana deployment operator command generates ignored Solana testnet keypairs, checks or installs the Solana CLI with Homebrew when requested, requests bounded testnet airdrops, deploys the compiled SBF program to distinct immutable verifier/bridge/source program IDs, creates a real SPL TairaXOR mint plus verifier state account, collects live ProgramData evidence, and builds the route manifest from live program evidence. Public TAIRA route publication uses a signed `UpsertSccpRouteManifest` submitted through `https://taira.sora.org/v1/mcp`; the legacy governance proposal HTTP endpoint is not required.

```bash
npm run sccp:solana:deploy -- doctor
npm run sccp:solana:deploy -- generate-keypairs
npm run sccp:solana:deploy -- fund --install-solana-cli true
npm run sccp:solana:build-program
npm run sccp:solana:deploy -- deploy --program-so output/sccp-solana-build/sccp_taira_xor.so
npm run sccp:solana:deploy -- evidence
npm run sccp:solana:deploy -- live-evidence
npm run sccp:solana:deploy -- draft-manifest --program-so output/sccp-solana-build/sccp_taira_xor.so
npm run sccp:solana:deploy -- production-requirements
npm run sccp:solana:deploy -- all \
  --install-solana-cli true \
  --program-so output/sccp-solana-build/sccp_taira_xor.so \
  --template ../iroha/<production-taira-solana-xor-route-template>.json
```

`live-evidence` reads finalized Solana JSON-RPC ProgramData and writes
`output/sccp-solana-deploy/solana-live-evidence.summary.json`. Use its
`verifier_code_hash`, not the local `.so` SHA-256, as the Solana verifier code
hash in production manifests. The local `.so` SHA-256 is retained separately as
build artifact evidence.

Production-ready Solana manifests require governed destination proof admission,
governed source verifier material, and post-deploy route-canary evidence.
`production-requirements` writes
`output/sccp-solana-deploy/taira-solana-xor-production-requirements.json` with
the current deployment IDs, missing fields, runtime-only publication env var,
and exact helper commands. Generate and pin those inputs with the sibling
helpers before attempting TAIRA publication:

```bash
python3 ../iroha/scripts/sccp_solana_source_state_evidence.py \
  --source-trust-anchor-hash 0x... \
  --consensus-verifier-hash 0x... \
  --message-inclusion-verifier-hash 0x... \
  --source-state-verifier-hash 0x... \
  --finality-policy-hash 0x... \
  --adapter-verifier-vk-hash 0x... \
  --deployment-receipt-hash 0x... \
  --tower-replay-verifier-hash 0x... \
  --full-accountsdb-lattice-verifier-hash 0x... \
  --bank-fork-choice-verifier-hash 0x... \
  --expected-source-verifier-material-hash 0x... \
  --expected-source-adapter-engine-deployment-hash 0x... \
  --expected-full-light-client-gate-hash 0x... \
  --toml

python3 ../iroha/scripts/sccp_solana_live_evidence.py \
  --rpc-url https://api.testnet.solana.com \
  --verifier-program-id "$(node -e 'console.log(require("./output/sccp-solana-deploy/solana-deploy-public.json").verifierProgramId)')" \
  --expected-verifier-code-hash 0x... \
  --expected-programdata-address "<ProgramData address>" \
  --expected-programdata-slot "<ProgramData slot>" \
  --route-allowlist-hash 0x... \
  --source-verifier-material-hash 0x... \
  --source-adapter-engine-deployment-hash 0x... \
  --route-canary-evidence-hash 0x... \
  --expected-destination-binding-hash 0x078578f0aa27daa2972d6c19d1d26dbb6bf6ba1e8df84e283d7ef101fc46abf6 \
  --toml
```

To publish a reviewed production manifest, the signer must hold `CanManageSccpRouteManifests` and the private key must be supplied only at runtime:

```bash
npm run sccp:solana:deploy -- route-manifest-isi \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json

SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY="<runtime-only-private-key-hex>" \
npm run sccp:solana:deploy -- publish-route-manifest \
  --submit true \
  --authority "<route-manager-account-id>" \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json
```

Artifacts are written under `output/sccp-solana-deploy/`. If Solana testnet funding, the compiled program, proof material, or public TAIRA route publication is unavailable, the command writes a blocked report instead of creating placeholder deployment evidence or a fake manifest.

Run the Solana route preflight:

```bash
npm run e2e:sccp:solana-preflight
```

The preflight verifies TAIRA SCCP submit capabilities, public `taira_sol_xor` manifest publication, Solana testnet program/mint/verifier/source identities, live Solana ProgramData executable hash matching the manifest `verifierCodeHash`, immutable bridge/source programs, SPL mint authority binding to the verifier PDA, verifier-state stored mint binding, browser-safe source/destination prover module URLs, TAIRA burn-record material, post-deploy live evidence, and Solana testnet RPC health. It is read-only and exits non-zero if the public route is missing or incomplete. Local manifest checks can be run with `--manifest-file`, but that mode is local evidence only.

Run the Solana production completion gate:

```bash
npm run e2e:sccp:solana-production-gate
```

This read-only gate combines the public route preflight, production requirements report, deployment MP4/subtitles, and completed bidirectional live-video evidence into one final readiness report at `output/sccp-solana-production-gate/sccp-solana-production-gate.json`. Use `-- --allow-incomplete true` during rollout to write the report without treating the expected blocked state as a command failure.

The Solana video command is also a gate:

```bash
npm run e2e:sccp:solana-video
```

It refuses to generate an MP4 unless the route preflight is ready and real Solana execution is available. When blocked, `-- --allow-incomplete` writes a JSON transcript and VTT subtitles explaining the blocker, but still does not create a fake success video.

## Usage notes

1. **Account setup** — first-run wizard for creating or restoring a local SORA wallet. Generate a recovery phrase, derive the canonical `accountId`, save it in the secure vault, and optionally pair with IrohaConnect; on-chain onboarding/registration is no longer required for local wallet creation.
2. **Settings tab** — choose the Torii endpoint used by wallet, staking, governance, VPN, SCCP, and explorer requests. Checking an endpoint loads its chain ID and network prefix before saving. The default is Minamoto mainnet at `https://minamoto.sora.org` with chain ID `00000000-0000-0000-0000-000000000000`, network prefix `753`, XOR asset definition `6TEAJqbb8oEPmLncoNiMRbLEK6tw`, and explorer `https://minamoto-explorer.sora.org`; TAIRA testnet remains available as a selectable preset at `https://taira.sora.org`.
3. **Setup tab** — chain ID and network prefix are read-only and mirror the active Settings connection; use this tab for advanced asset, authority, and registration helpers. Saving the authority key enables the built-in “Register account” helper, which submits a Norito transaction via Torii.
4. **Wallet tab** — refresh balances and recent transactions, claim starter faucet funds, and manage transparent/self-shielded wallet state.
5. **Staking tab** — choose a dataspace, auto-resolve its public lane, nominate validators, review stake-token balance, and stake XOR with on-chain unbond delay handling (`Max` shortcuts for bond/unbond included).
6. **Parliament tab** — bond a fixed `10,000 XOR` amount via `RegisterCitizen`, inspect referendum/proposal/tally/locks payloads, submit plain ballots, and prepare finalize/enact draft calls for governance operations. Recent referendum/proposal chips are persisted per account and trigger lookup when clicked. If referendum ID is set, lookup continues even when proposal ID input is invalid (proposal lookup is skipped). Ballot submit requires a positive whole-number amount that does not exceed the current XOR balance.
7. **Send tab** — create transparent transfers, self-shield funds, or send shielded funds to another account when a recipient `v3` Receive QR is scanned. Shielded sends require whole-number base-unit amounts and wallet-recognizable confidential notes.
8. **Receive tab** — share privacy-first `iroha-confidential-payment-address/v3` QRs. The default QR omits plaintext account, asset, and amount while carrying the one-time receive key needed for note recovery.
9. **Explorer tab** — displays `/v1/explorer` metrics and the Torii-generated explorer QR payload for the active account.
10. **SCCP tab** — bridge XOR on TAIRA-only SCCP routes. TRON/BSC/TON use the existing live flows. Solana testnet (`taira_sol_xor`) is visible for readiness/preflight only and stays action-gated until the public route manifest and Solana wallet/proof execution are live.
11. **Offline tab** — "Move funds to online wallet" remains same-account only and keeps the stricter self-only shield constraints even though Send supports recipient shielded transfers.

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
- `getSccpCapabilities`, `getSccpProofManifests`, `getSccpMessageProofJob`, `submitSccpBridgeMessage`, `deriveZkIvmPayload`, `startZkIvmProveJob`
- `getTronTransaction`, `getTronTransactionReceipt`, `getTronTransactionEvents`, `getTronFinalityData`, `triggerTronSmartContract`, `broadcastTronTransaction`

A failing Torii call never crashes the renderer; errors bubble up as toast/status messages so users can retry after fixing connectivity or credentials.

## Security disclaimer

Wallet secrets and confidential receive keys are resolved from the Electron secure vault (`safeStorage`, with the Windows DPAPI fallback on native Windows/WSL2). Pinia/localStorage persistence is limited to non-secret UI/session metadata such as selected account, locale, theme, and WalletConnect session metadata. SCCP TRON signing must stay WalletConnect-based; do not add TRON private-key import or generated end-user TRON wallets.
