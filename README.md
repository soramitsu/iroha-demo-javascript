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

Solana testnet SCCP is wired as a fail-closed route surface until the public TAIRA endpoint publishes a production-ready `taira_sol_xor` manifest and governed Solana proof material. The deployed Solana SBF now requires a configured native recursive verifier program and calls it over CPI before minting SPL TairaXOR; finalization gates require the CPI marker, immutable ProgramData, and absence of the old unlinked-verifier sentinel. The `/sccp` tab can select Solana, display live route readiness, connect a Solana wallet, and build the TAIRA -> Solana finalize transaction only when the route manifest and proof job are real. Solana -> TAIRA now builds and broadcasts the wallet-approved SPL burn against the deployed Solana source bridge, waits for Solana confirmation, collects transaction evidence through preload RPC, and hands it to the browser source-proof worker; TAIRA settlement is submitted only after a bound `finalize_inbound` source proof package matches the selected Solana sender, TAIRA recipient, amount, route, and message bundle.

The Solana operator tooling never generates, reads, migrates, or persists signer files. It reuses separately reviewed public Program/ProgramData identities, accepts mutation authority only as runtime secret bytes, and keeps new stable Program deployment disabled. Its canonical readback captures all four Loader-v3 roles, both state accounts, the mint, and the reviewed owner's complete mint-token-account set in one finalized account vector fenced by pre/post enumeration and a final testnet-identity recheck. Public TAIRA route publication uses a signed `UpsertSccpRouteManifest` submitted through the selected validator's `/v1/mcp`; the legacy governance proposal HTTP endpoint is not required.

Before attempting a real Solana transfer smoke through the app, run the Solana app-side readiness gate:

```bash
VITE_WALLETCONNECT_PROJECT_ID="<32-hex-walletconnect-project-id>" \
VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL="/sccp-solana/taira-solana-xor-destination-prover.js" \
VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL="/sccp-solana/taira-solana-xor-source-prover.js" \
npm run e2e:sccp:solana-smoke-readiness
```

The Solana smoke-readiness gate requires a production-shaped 32-character hex
WalletConnect Cloud project ID; labels such as `project-123` are reported as
blocked placeholders and are never written into reports.
`VITE_SCCP_SOLANA_PROVER_MODULE_URL` remains accepted as a legacy alias for the
destination prover, but new operator runbooks use
`VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL`.

This is read-only and writes `output/sccp-solana-smoke-readiness/latest.json`.
It combines public `taira_sol_xor` route preflight with renderer prerequisites
for real wallet-approved smokes: WalletConnect project ID, destination proof
module URL, and source proof module URL. The public preflight report must also
bind the route to Solana testnet (`solana-testnet`,
`solana:4uhcVJyU9pJkvQyS88uRDiswHXSCkY3z`) before the app-side smoke gate can
pass. During rollout,
`-- --allow-incomplete` refreshes the report without treating the expected
missing public route/proof stack as a command failure.

```bash
npm run sccp:solana:deploy -- doctor
npm run sccp:solana:build-program
npm run sccp:solana:deploy -- evidence
npm run sccp:solana:deploy -- live-evidence
npm run sccp:solana:deploy -- post-deploy-evidence
npm run sccp:solana:deploy -- route-canary --amount-base-units 1 --confirm-route-canary true --route-canary-skip-preflight true
npm run sccp:solana:deploy -- source-burn-readiness --amount-base-units 1
npm run sccp:solana:deploy -- source-burn-proof-request
npm run sccp:solana:deploy -- prover-sidecars
npm run sccp:solana:deploy -- post-deploy-manifest-evidence --apply true
npm run sccp:solana:deploy -- post-deploy-full-toml \
  --source-verifier-material-hash 0x... \
  --source-adapter-engine-deployment-hash 0x... \
  --route-allowlist-hash 0x... \
  --apply true
npm run sccp:solana:deploy -- prover-readiness
npm run sccp:solana:deploy -- production-material-inventory \
  --governance-approval-file <reviewed-approval.json> \
  --expected-governance-approval-sha256 0x<independently-pinned-sha256>
npm run sccp:solana:deploy -- production-material-validate \
  --material-file <reviewed-governed-solana-material.json-or-toml> \
  --governance-approval-file <reviewed-approval.json> \
  --expected-governance-approval-sha256 0x<independently-pinned-sha256>
npm run sccp:solana:deploy -- source-material-handoff
npm run sccp:solana:deploy -- verify-source-material-handoff
npm run sccp:solana:deploy -- proof-material-request
npm run sccp:solana:deploy -- production-material-template
npm run sccp:solana:deploy -- proof-material-bundle
npm run sccp:solana:deploy -- proof-material-ceremony-package
npm run sccp:solana:deploy -- draft-manifest --program-so output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so
npm run sccp:solana:deploy -- production-requirements
export SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY="<taira-route-manager-account-id>"
npm run sccp:solana:deploy -- publish-readiness \
  --torii-url https://taira-validator-1.sora.org \
  --mcp-url https://taira-validator-1.sora.org/v1/mcp
npm run sccp:solana:deploy -- route-publication-request
npm run sccp:solana:deploy -- route-manager-access-request
npm run sccp:solana:deploy -- operator-handoff
npm run sccp:solana:deploy -- lane-activation-proposal
npm run sccp:solana:refresh-evidence
npm run sccp:solana:refresh-live-evidence
```

`evidence` writes one authoritative
`solana-program.evidence.json` document with schema
`iroha-demo-sccp-solana-finalized-readback-evidence/v1`. Historical
per-role evidence files are ignored and are no longer produced. The canonical
snapshot hash covers direct finalized RPC observations plus the exact public
deployment-config and native-verifier-config byte hashes. Manifest bytes and
the manifest's expected source-config pin are deliberately outside that hash in
`manifestComparison`; otherwise a manifest embedding its own evidence would
form an impossible hash cycle. Generated route manifests contain stable live
deployment pins only and never embed the full readback report, its context slot,
or `canonicalSnapshotSha256`.

Production consumers of an existing evidence or manifest file require both
independently reviewed exact-byte pins:

```bash
npm run sccp:solana:deploy -- production-requirements \
  --evidence output/sccp-solana-deploy/solana-program.evidence.json \
  --expected-evidence-sha256 0x<sha256-of-exact-evidence-bytes> \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<sha256-of-exact-manifest-bytes>
```

`refresh-live-evidence` and `finish-production --skip-solana-rpc false`
capture the evidence in-process and thread those exact hashes through every
downstream step automatically. A source-config mismatch never rewrites a
governed pin: refresh post-deploy evidence, create the reviewable manifest
patch evidence, draft the candidate, then regenerate
`post-deploy-manifest-evidence` to bind the exact final manifest bytes to the
same evidence-artifact hash and canonical snapshot.

The first-release build wrapper compiles both the bridge and native recursive
verifier into `output/sccp-solana-program-artifacts/` while placing a non-key
directory sentinel at cargo-build-sbf's automatic keypair path. This suppresses the
upstream build tool's otherwise automatic private-key generation; the wrapper
then verifies that the sentinel remained intact and installs only ELF bytes.
The production build is fail-closed on `cargo-build-sbf 4.1.0`, platform-tools
`v1.54` / SBF rustc `1.89.0`, SBF arch `v0`, the committed lockfile for each
program, and each crate's Rust `1.91.0` toolchain manifest. It forwards
`--locked`, hashes the manifest, lockfile, and toolchain file before and after
the build, and reports those hashes with the ELF hashes. The child process gets
only a minimal Cargo/rustup/OS environment; SCCP authorities, signer material,
wallet configuration, mnemonics, private keys, and unrelated API credentials
from the operator shell are not forwarded to Cargo or dependency build scripts.
Do not replace it with a raw `cargo build-sbf --sbf-out-dir ...` command, which
generates a new `*-keypair.json` file when that path is absent. The deployment
helper never creates, reads, rotates, echoes, or persists Solana keypair files.
The staged public addresses in
`solana-deploy-public.json` are the source of truth. `generate-keypairs`,
`rotate-deployment-keypairs`, the program-byte forms of `deploy` and
`deploy-native-verifier`, and `all` fail closed because the available Solana
CLI path for creating a new stable Program id requires signer files.
The integrated `upgrade-existing-program` transport is limited to an exact,
already-existing reviewed Loader-v3 Program/ProgramData identity; it cannot
create a stable Program id. `deploy --final true
--confirm-finalize-programs true --confirm-finalize-linked-verifier true` is
only a legacy alias for finalizing an
existing deployment; `deploy-native-verifier --configure-only true` and
`configure-native-verifier` only verify/configure an existing deployment.
Creating a new Program must use an independently approved hardware- or
remote-signer workflow that preserves those reviewed public addresses.

For a governed upgrade of an existing Program, first obtain canonical public
plan bytes, the exact target SBF, governance-pinned local `solana-sbpf 0.21.0`
structural-preflight evidence, and an independently distributed plan SHA-256.
The evidence must come from the authenticated release x86_64 Linux helper and
bind its exact binary SHA-256, source bundle, Cargo.lock, rustc identity, target,
profile, and compiled-JIT result. It is not exact-cluster admission; the two
signed rollback-sentinel simulations remain authoritative. Run the read-only
command first; it reads no signer environment, creates no journal, and reports
the fixed trusted journal/lease paths without touching them:

```bash
npm run sccp:solana:build-sbf-validator
npm run sccp:solana:deploy -- upgrade-existing-program-readiness \
  --upgrade-plan <canonical-upgrade-plan.json> \
  --target-program-so <reviewed-target.so> \
  --sbf-validation-evidence <canonical-agave-sbf-validation-evidence.json> \
  --expected-upgrade-plan-sha256 0x<independently-distributed-plan-sha256>
```

Only after reviewing that report, inject separate authority and payer keys at
runtime and submit the exact plan. The custody confirmation asserts that no
other host or custodian can use the authority concurrently; the durable lease
enforces same-host exclusivity but cannot itself prevent remote key use.
Plan/target/evidence bytes, authenticated helper provenance, cluster version and
feature set, finalized live ProgramData, packet bytes, fetched transactions, and
two rollback-sentinel cluster simulations are all checked before the
irreversible upgrade completes:

```bash
# Inject SCCP_SOLANA_UPGRADE_AUTHORITY_SECRET_KEY and
# SCCP_SOLANA_UPGRADE_PAYER_SECRET_KEY from the runtime secret manager.
npm run sccp:solana:deploy -- upgrade-existing-program \
  --upgrade-plan <canonical-upgrade-plan.json> \
  --target-program-so <reviewed-target.so> \
  --sbf-validation-evidence <canonical-agave-sbf-validation-evidence.json> \
  --expected-upgrade-plan-sha256 0x<independently-distributed-plan-sha256> \
  --submit true \
  --confirm-upgrade-existing-program true \
  --confirm-exclusive-upgrade-authority-custody true
```

The mutation path uses one authority-global scope,
`solana-testnet:<genesis-hash>:<authority-address>`, rather than a scope tied to
one Program or operation. Generation 1 is a two-phase claim: the helper first
fsyncs a provisional authority lease, then creates and fsyncs the exact claim
journal, rewrites the same lease inode to its claimed state, and only then
returns the opaque signer capability. Its lifetime is bounded by the reviewed
finalized-slot expiry, which is checked again after RPC identity verification
at every broadcast boundary. Recovery generations use a strictly increasing
lease generation and an owner-death/capability lifetime instead of reusing the
generation-1 slot expiry. The host fence is an OS `flock` held by a fixed,
isolated `/usr/bin/python3 -I -S` helper over the already-open lease descriptor;
production Linux hosts must provide that canonical root-owned, non-writable
executable and `fcntl.flock` support.

Journal JSONL is canonical and schema-exact. Every mutation records one full
signed transaction tuple before broadcast (all signatures, blockhash and last
valid height, message/packet hashes, and packet length), permits only its exact
terminal resolution, and never automatically retries an aborted, expired, or
failed tuple. Ambiguous resolution is read-only: the resolver deserializes and
re-hashes the exact signed packet and can only prove finalized, definitively
failed, definitively expired, or still ambiguous. Claim, validation,
resolution, stage, recovery-start, and completion slots must be nondecreasing;
completion must still match the exact finalized transaction and ProgramData
slot relationships. The global lease is released only when the runtime report
exactly matches the durable completion tuple and finalized readback, or when
the reducer proves a failure with no possible ProgramData mutation and an
absent/finalized-closed buffer.

Before a successful command unlinks any lock, it atomically writes and fsyncs
the configured report, then writes a small canonical
`completion.receipt.json` in the fixed operation directory. The receipt binds
the operation, target, authority lease generation/scope, exact terminal
transaction (or safe-abort classification), journal SHA-256, and configured
report path/SHA-256. Recovery then closes the journal, removes the exact
completed recovery candidate while the authority fence is still held, and
only releases the global authority lease if candidate cleanup succeeded. A
report, receipt, journal-close, or candidate-cleanup error retains the lease.

If the durable journal reports an orphan ephemeral buffer, independently pin
the exact first claim-event bytes, then run recovery with the same canonical
plan, target, and evidence. `--upgrade-journal` must exactly equal the fixed
path reported by readiness; recovery refuses alternate paths, completed or
ambiguous journals, missing/mismatched authority leases, and duplicate local
recovery claims:

```bash
npm run sccp:solana:deploy -- recover-existing-program-upgrade-buffer \
  --upgrade-plan <canonical-upgrade-plan.json> \
  --target-program-so <reviewed-target.so> \
  --sbf-validation-evidence <canonical-agave-sbf-validation-evidence.json> \
  --expected-upgrade-plan-sha256 0x<independently-distributed-plan-sha256> \
  --upgrade-journal <exact-canonical-journal-path-from-readiness> \
  --expected-upgrade-claim-sha256 0x<independent-canonical-claim-sha256> \
  --submit true \
  --confirm-recover-upgrade-buffer true
```

Before an irreversible recovery takeover, the CLI performs a read-only testnet
genesis check and requires the finalized slot to be at least both the original
claim slot, the reviewed plan floor, and any earlier recovery-start slot. A
dead provisional recovery candidate, a promoted higher-generation candidate
that crashed before durable `recovery-start`, or an exact
`recovery-start`-only WAL segment can be reclaimed only while the journal is
byte-for-byte unchanged and the OS owner fence proves death; the next takeover
uses a new nonce and a strictly higher generation. The start-only case is safe
because every broadcast requires a preceding durable intent. Exact ordinary
completion/safe-abort and exact finalized recovery-close journals can likewise
release a dead-owner lease without reading signer environment variables. If a
process died before writing its configured report, this reconciler writes a
journal-derived canonical receipt with `configuredReport: null`; it never
claims that the richer configurable report exists. For completed recovery it
removes a remaining candidate first and then releases the lease, while also
tolerating an already-absent candidate from a crash between those two steps.

Unresolved prepared/ambiguous intents, any recovery segment beyond its exact
start without an exact finalized recovery close, recovery failure or
absent-buffer states that require ProgramData inspection, finalized checked
extension, and finalized Upgrade without the exact completion/readback record
remain manual inspection states. Do not delete or edit their journal, authority
lease, receipt, or recovery candidate to force a retry.

Supported wallet mutations (`fund`, `accounts`, `route-canary`, and
`source-burn`) accept only 64-byte runtime signer material injected by the
operator's secret manager through `SCCP_SOLANA_DEPLOYER_SECRET_KEY` (or a
validated env name selected with `--solana-signer-env`). Initial account
creation additionally requires runtime-only state and mint signers in
`SCCP_SOLANA_VERIFIER_STATE_SECRET_KEY`,
`SCCP_SOLANA_SOURCE_STATE_SECRET_KEY`, and
`SCCP_SOLANA_TOKEN_MINT_SECRET_KEY`. Never pass an existing keypair path or put
signer bytes in command arguments, reports, shell history, or deployment
artifacts.

`live-evidence` reads finalized Solana JSON-RPC ProgramData and writes
`output/sccp-solana-deploy/solana-live-evidence.summary.json`. Use its
`verifier_code_hash`, not the local `.so` SHA-256, as the Solana verifier code
hash in production manifests. The local `.so` SHA-256 is retained separately as
build artifact evidence.

`post-deploy-evidence` reads the live Solana SPL mint, verifier state, source
bridge state, and deployed program accounts from finalized testnet RPC. It
writes `output/sccp-solana-deploy/taira-solana-xor-post-deploy-evidence.json`
with observed state hashes, the source bridge config hash candidate, and any
remaining source-burn / route-canary blockers. This is readback evidence only;
it does not replace governed proof material or signed TAIRA route publication.

`route-canary` submits a real diagnostic Solana transaction to the deployed
verifier program and, when needed, creates a real SPL token account for the
deployer before minting the requested base units through the program PDA mint
authority. The artifact
`output/sccp-solana-deploy/taira-solana-xor-route-canary.submission.json`
records the transaction signature, token account, canary evidence hash, and
explicit `diagnosticOnly: true` / `productionProof: false` flags. This canary is
useful for proving the deployed Solana destination path executes, but it is not
governed TAIRA proof material and must not make production gates pass.

`prover-readiness` imports the bundled Solana destination/source browser prover
modules, runs their self-tests, and then invokes both real `prove*` exports with
deterministic route/profile-bound known-answer inputs. Prover output is never a
trust anchor and must not contain `knownAnswerProbe`, a vector, or any other
self-attestation. The computed canonical package hash and path-bound proof
material hash must exactly match a separately supplied canonical known-answer
vector. That vector also pins the public verifier-key bytes, verifier artifact,
and independent verification-receipt bytes. Its canonical SHA-256 must match
the direction-specific pin in the independently hash-pinned production
governance approval. Missing files, non-canonical vector JSON, duplicate/unknown
fields, changed proof bytes, changed verifier evidence, or either missing hash
pin prevents the prove export from being invoked and keeps readiness false.
After comparing module hashes against the route manifest, the command writes
`output/sccp-solana-deploy/taira-solana-xor-prover-readiness.json`. Placeholder
or missing proof packages keep the route fail-closed. `prover-sidecars` writes
route-bound sidecar JSON next to the configured Solana browser modules using the
current module bytes, self-test result, and governance-pinned KAT validation.
Current placeholder modules generate `productionProofsReady: false` sidecars;
governed modules must self-test ready and reproduce the exact approved vector
before the sidecars can satisfy the production gate.

The sidecar builder reads only public evidence from these runtime variables
(use the `SOURCE` names for the reverse direction):

```bash
export SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_FILE="<reviewed-public-approval.json>"
export SCCP_SOLANA_KNOWN_ANSWER_GOVERNANCE_APPROVAL_SHA256="0x<independently-distributed-approval-sha256>"
export SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VECTOR_FILE="<canonical-destination-vector.json>"
export SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFIER_KEY_FILE="<reviewed-public-verifier-key>"
export SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFIER_ARTIFACT_FILE="<reviewed-verifier-artifact>"
export SCCP_SOLANA_DESTINATION_KNOWN_ANSWER_VERIFICATION_RECEIPT_FILE="<independent-verification-receipt>"
export SCCP_SOLANA_SOURCE_KNOWN_ANSWER_VECTOR_FILE="<canonical-source-vector.json>"
export SCCP_SOLANA_SOURCE_KNOWN_ANSWER_VERIFIER_KEY_FILE="<reviewed-public-verifier-key>"
export SCCP_SOLANA_SOURCE_KNOWN_ANSWER_VERIFIER_ARTIFACT_FILE="<reviewed-verifier-artifact>"
export SCCP_SOLANA_SOURCE_KNOWN_ANSWER_VERIFICATION_RECEIPT_FILE="<independent-verification-receipt>"
npm run build:sccp-solana-prover-sidecars
```

Vector files use
`iroha-demo-sccp-solana-prover-known-answer-vector/v1`, must be the canonical
sorted-key JSON encoding with one trailing newline, and are pinned by
`pins.destinationProverKnownAnswerVectorHash` or
`pins.sourceProverKnownAnswerVectorHash` in the approval descriptor. The build
does not generate, approve, or infer these production values. Verification
receipts use
`iroha-demo-sccp-solana-prover-known-answer-verification-receipt/v1` and must
canonically bind the challenge/input, exact package and proof hashes, verifier
key, verifier artifact, direction, network, and an explicit `verified: true`;
their exact byte hash is itself pinned by the vector.

`production-material-inventory` scans public artifact roots for candidate
Solana source verifier material, source adapter deployment records, reviewed
final TOML evidence, and browser proof readiness. Scan location is never a trust
anchor: `--material-roots` does not make a candidate governed, and the default
governed root is exactly `../iroha/artifacts/sccp-solana` rather than every
adjacent checkout. Production readiness additionally requires a separate
`iroha-demo-sccp-solana-production-governance-approval/v1` descriptor whose
exact bytes match an independently supplied
`--expected-governance-approval-sha256`. That descriptor pins every selected
source, adapter, TOML, destination admission, browser prover, and native
verifier hash, including both browser-prover known-answer vector hashes;
conflicting ready candidates fail closed instead of being chosen by search
order. The command writes
`output/sccp-solana-deploy/taira-solana-xor-production-material-inventory.json`,
skips secret-like keypair paths and derived reports, and is refreshed by
`production-requirements` so the operator report includes the observed material
blockers.

`production-material-validate` writes
`output/sccp-solana-deploy/taira-solana-xor-production-material.validation.json`
from an explicit `--material-file` or `--material-roots` value. It uses the same
inventory parser and readiness checks as the production gate, but it does not
overwrite the canonical production-material inventory. Use it on a reviewed copy
of the generated template before running
`production-manifest-patch --from-inventory true`; if the supplied file still
contains `templateOnly`, `placeholderMaterial`, or placeholder hashes, the
validation report stays not ready. A `reviewed: true` field, an embedded
approval hash, an explicit material root, or a confirmation flag cannot replace
the independently pinned approval descriptor. Mutation and finalization paths
reread and revalidate the package, approval, and artifact bytes immediately
before use rather than trusting a persisted readiness report.

`source-material-handoff` writes
`output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.json`, a
non-secret proof-material handoff package containing the real verifier
ProgramData pins, source bridge config hash, route-canary transaction/evidence,
and source-burn transaction/burn hash. It also emits the exact sibling helper
commands for rendering source-material TOML and final live Solana TOML once the
governed source verifier/adaptor hashes exist. The handoff is not production
proof material and must not make the route gates pass by itself.

`verify-source-material-handoff` writes
`output/sccp-solana-deploy/taira-solana-xor-source-material-handoff.verification.json`.
It rereads the handoff's pinned Solana program, mint, verifier-state, and
source-state accounts from live Solana RPC, checks the route-canary and
source-burn signatures are finalized, and confirms the source-state burn hash
still matches the handoff. This gives the proof-material ceremony a live
readback check without weakening the production route gates.

`proof-material-request` writes
`output/sccp-solana-deploy/taira-solana-xor-proof-material-request.json`, a
single non-secret operator package that combines the live handoff pins,
handoff verification status, production-requirements blockers, publish-readiness
blockers, and exact sibling renderer commands for governed Solana source
material. It is a request package only; it does not contain private keys,
runtime signing material, or synthetic production proofs.

`production-material-template` writes
`output/sccp-solana-deploy/taira-solana-xor-production-material-template.json`,
a non-secret JSON template for the governed Solana source verifier material,
source adapter deployment record, reviewed final Solana TOML hash, destination
proof admission, and production browser prover sidecars. The template is marked
`templateOnly: true` and nested source records carry `placeholderMaterial: true`,
so `production-material-inventory` rejects it until every placeholder is
replaced with reviewed hashes and the template flags are removed. This gives the
proof-material ceremony a concrete input contract without making the route look
production-ready.

`proof-material-bundle` writes
`output/sccp-solana-deploy/taira-solana-xor-proof-material-bundle.json`, a
deterministic hash manifest for the non-secret handoff/request/report files
that the governed proof-material ceremony consumes, including the exact public
deployment config, native-verifier configuration report, canonical finalized
readback, final route manifest, manifest-conformance report, and route-bound
browser prover sidecars. It rejects hard links, symlinks, malformed UTF-8,
legacy evidence schemas, and any cross-artifact snapshot, evidence-byte,
manifest-byte, source-config, or proof-request pin mismatch. The legacy
`solana-live-evidence` summary is diagnostic and is not bundled as a second
deployment truth. This manifest makes the handoff reproducible, but it is still
not governed proof material and does not publish the TAIRA route.

`proof-material-ceremony-package` writes
`output/sccp-solana-deploy/taira-solana-xor-proof-material-ceremony-package.json`,
a non-secret review package that binds the live handoff, handoff verification,
proof-material bundle hash, latest source-burn proof scaffold, production
material inventory, prover readiness, and production-requirements blockers. It
is the artifact referenced by operator and activation packages for the
governed proof-material ceremony; it still does not contain TAIRA signer keys,
does not publish proof material, and keeps production gates blocked until the
governed source/destination proof packages and final TOML evidence exist.

`source-burn-readiness` scans the selected Solana owner's actual SPL TairaXOR
token accounts and writes
`output/sccp-solana-deploy/taira-solana-xor-source-burn-readiness.json`. It
does not mint or fabricate bridge value. A live Solana-origin burn can only be
broadcast when that report has an existing token account with enough balance:

The operator's secret manager must inject the matching runtime-only
`SCCP_SOLANA_DEPLOYER_SECRET_KEY` for the following mutation.

```bash
npm run sccp:solana:deploy -- source-burn \
  --amount-base-units "<base-units>" \
  --taira-recipient "<taira-account-id>" \
  --confirm-source-burn true
```

`source-burn` generates a cryptographically random positive `u64` nonce, encodes
it as exactly eight little-endian bytes, and submits the canonical seven-account
ABI: writable owner, source state, source token, mint, SPL Token program,
nonce-bound burn-receipt PDA, and System Program. The receipt PDA prevents nonce
replay. After the burn reaches finalized Solana RPC readback, refresh the
scaffolded source-proof request:

```bash
npm run sccp:solana:deploy -- source-burn-proof-request
```

That command updates
`output/sccp-solana-deploy/taira-solana-xor-source-burn.submission.json` with
the canonical source-burn message id, commitment root, payload hash, and a
`finalize_inbound` message bundle with `finalityProof: null`. It is handoff
material for the governed source prover, not a production proof package.

`post-deploy-manifest-evidence` binds the real
`post-deploy-evidence`, `route-canary`, and `source-burn` artifacts into a
reviewable `postDeployLiveEvidence` patch. With `--apply true`, it updates the
local route manifest draft with the observed source bridge config hash, route
canary evidence hash, source-event transaction signature, and route-canary
transaction signature. Applying this local patch does not recapture Solana or
advance to a different context slot: the command regenerates its conformance
section against the same canonical snapshot and records the exact manifest and
evidence artifact SHA-256 values. It intentionally keeps `fullTomlReady: false` unless
`--offline-full-toml` or `--offline-full-toml-sha256` is supplied from a
reviewed final Solana evidence TOML, so it cannot turn a partial rollout into a
production-ready manifest.

`post-deploy-full-toml` is the non-manual path for that final TOML. It reads
the current Solana deployment pins, post-deploy canary/source-burn evidence,
and governed source material hashes, then invokes
`../iroha/scripts/sccp_solana_live_evidence.py --toml` against finalized
Solana RPC. Missing hashes write a blocked report at
`output/sccp-solana-deploy/taira-solana-xor-post-deploy-full-toml.json`
instead of fabricating material. When the helper emits `full_toml_ready=true`,
the command writes
`output/sccp-solana-deploy/taira-solana-xor-post-deploy-full.toml`, records its
SHA-256, and `--apply true` feeds that TOML into
`post-deploy-manifest-evidence --offline-full-toml ... --apply true`.

Production-ready Solana manifests require governed destination proof admission,
governed source verifier material, and post-deploy route-canary evidence.
`production-requirements` writes
`output/sccp-solana-deploy/taira-solana-xor-production-requirements.json` with
the current deployment IDs, missing fields, runtime-only publication env var,
and exact helper commands. Generate and pin those inputs with the sibling
helpers before attempting TAIRA publication:

The Solana production-material inventory rejects obvious fixture hashes such as
repeated-byte `0x1111...` or `0xa1a1...` values for governed source verifier and
source-adapter records. Use hashes from the reviewed source-state helper output;
diagnostic route-allowlist examples are not accepted as production proof
material.

`publish-readiness` is read-only and writes
`output/sccp-solana-deploy/taira-solana-xor-route.publish-readiness.json`. It
refreshes production requirements, checks public TAIRA SCCP endpoint
capabilities, attempts to build the reviewable ISI artifact, and records whether
`--authority` or `SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY` is a concrete TAIRA
testnet `testu...` I105 account plus whether the runtime-only
`SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY` env var is present without storing the
private key. A Solana deployer pubkey such as the funded
program-deploy account is not a valid TAIRA route-manager authority, and short
labels such as `testu-route-manager` or legacy account-form strings such as
`testu4route_manager:taira` are rejected instead of being treated as canonical
I105 accounts. Missing public `taira_sol_xor` publication is reported separately
from endpoint readiness so the gate is not circular before the first real
publish.

`route-publication-request` writes
`output/sccp-solana-deploy/taira-solana-xor-route-publication-request.json`, a
non-secret route-manager handoff that joins the route manifest hash,
proof-material bundle hash, production-requirements status, public TAIRA
publish-readiness status, and runtime signer requirements. It can be ready for
route-manager review while still correctly reporting that submission is blocked
by missing governed proof material or runtime-only signer inputs; it is not a
signed transaction and does not publish the TAIRA route.

`route-manager-access-request` writes
`output/sccp-solana-deploy/taira-solana-xor-route-manager-access-request.json`,
a non-secret operator handoff focused on the TAIRA route-manager side. It
records the live `iroha.accounts.permissions` audit for the supplied authority,
the required `CanManageSccpRouteManifests` permission, the runtime-only private
key environment variable name, the signed-transaction MCP submission mode, and
the current route-publication request hash. It never stores private keys and it
does not grant permissions; it rejects non-TAIRA authorities that do not start
with `testu`, and makes the remaining permission/signing action explicit for the
operator who can publish the reviewed route.

`operator-handoff` writes
`output/sccp-solana-deploy/taira-solana-xor-operator-handoff.json`, a
single non-secret TAIRA operator package that references the proof-material
ceremony package hash, proof-material bundle hash, route-publication review
hash, route-manager access request hash, required `testu...` authority,
required permission, runtime-only private-key env var name, and exact publish
commands. Its `handoffHash` is stable across timestamp-only refreshes and does
not include private keys or generated signer material.

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

npm run sccp:solana:deploy -- route-allowlist-hash \
  --source-verifier-material-hash 0x... \
  --source-adapter-engine-deployment-hash 0x...

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

# After production-material-inventory finds approval-pinned governed material:
npm run sccp:solana:deploy -- production-manifest-patch \
  --confirm-governed-solana-material true \
  --from-inventory true \
  --governance-approval-file <reviewed-approval.json> \
  --expected-governance-approval-sha256 0x<independently-pinned-sha256> \
  --apply true
```

`production-manifest-patch` writes
`output/sccp-solana-deploy/taira-solana-xor-production-manifest-patch.json`.
It derives the canonical route allowlist hash from the governed source records,
installs production-safe destination proof admission metadata, applies the
reviewed final TOML hash to `postDeployLiveEvidence`, removes fail-closed
`disabledReason` fields, and can update the local manifest draft only when
`--apply true` is passed. With `--from-inventory true`, it refreshes
`production-material-inventory` and uses only ready governed source material
records plus the reviewed final TOML hash from that report. Direct CLI material
hashes are not accepted as governed records, so `--from-inventory true` and the
independently pinned governance approval are mandatory. It also keeps the
Solana native verifier program id as governed admission material; it does not
generate proofs or replace the governed proof-material ceremony.

The irreversible Solana program step is a separate runtime-only operation. The
approval descriptor must pin `programFinalizationAuthority` plus the exact
Program, ProgramData, deployment-slot, artifact SHA-256, and executable-code
hash for the outer verifier, destination bridge, source bridge, and native
verifier. Supply the matching 64-byte authority only through the configured
runtime signer environment variable; signer files are rejected:

```bash
SCCP_SOLANA_DEPLOYER_SECRET_KEY="hex:<128-hex-runtime-secret>" \
npm run sccp:solana:finalize-programs -- \
  --confirm-finalize-programs true \
  --confirm-finalize-linked-verifier true \
  --governance-approval-file <reviewed-approval.json> \
  --expected-governance-approval-sha256 0x<independent-approval-byte-hash> \
  --solana-rpc-url https://api.testnet.solana.com
```

`finalize-programs` first recomputes the complete program-finalization readiness
gate in the same process, then performs fresh finalized readbacks and removes
the upgrade authority from every still-mutable role with one atomic Loader-v3
transaction. Both explicit confirmation flags are mandatory; a stale readiness
report cannot authorize the irreversible operation.
Immediately before signer loading and again before broadcast, the command
requires cache-bypassed, finalized-height-bound route-absence reads from all
four canonical TAIRA validator roots at one common manifest height. A
single-node response, a lagging-height mix, or cached evidence cannot authorize
program finalization or native-verifier configuration.
It succeeds without submitting only when all four roles are already immutable
and still match every governance and local-artifact pin. The runtime signer is
zeroized, and the atomic hash-chained report is written to
`output/sccp-solana-deploy/taira-solana-xor-program-finalization.json`.
Before either one-shot Solana transaction is broadcast, the exact locally
signed packet, deterministic signature, blockhash lifetime, message/packet
hashes, governed input hashes, and route-absence artifact hash are written and
fsynced as an exclusive public intent. Finalized status is reconciled only by
that locally expected signature and exact transaction message, then written as
a durable resolution. An unresolved, failed, expired, or partially written
intent blocks every replacement signer/broadcast attempt; it is never treated
as permission to retry. These intent/resolution files contain no secret key
bytes.
`finish-production` runs this step before production requirements and cannot
complete without a valid immutable post-readback report. Its mutation order is
read-only prerequisites, public-route status, pre-finalization readiness,
atomic finalization, an atomic four-role readback, then one-shot native-verifier
state configuration against the now-immutable outer/native ProgramData
accounts. A second atomic readback becomes the sole source for post-deploy
evidence, the candidate manifest, final TOML, production patch, proof bundle,
and exact manifest-conformance report. If the route is already public, any
remaining Solana program mutation is blocked until an explicit governed
deactivation/upgrade procedure exists. Publication is followed by a new public
preflight; smoke, media, and production gates never reuse the pre-publication
snapshot. `--submit false` is a strict
chain-mutation dry-run and disables those Solana mutations as well as TAIRA
publication while still refreshing local reports. `finish-production` has no
implicit submission default: omitting `--submit`, or providing anything other
than the exact values `true` and `false`, fails before report, endpoint, signer,
or mutation access. The finish report records `submissionMode`,
`mutationAuthorized`, and a structured `submission` decision. A dry-run may
report `ready: true` when fresh evidence proves the deployment is already
complete and no mutation is required; authorization being disabled is kept as
an execution decision rather than a production blocker.
Every generated post-proof handoff (publication request, route-manager access,
lane request/proposal, operator handoff, and activation package) is atomically
written, stable-read, and propagated with its exact byte SHA-256. Downstream
video and production gates reopen the selected paths only with matching pins
and reject mixed proof-bundle generations. These are first-release schemas;
path-only legacy overrides are intentionally unsupported.

Use the explicit read-only assessment form when auditing current state:

```bash
npm run sccp:solana:finish-production -- \
  --submit false \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256> \
  --output-dir output/sccp-solana-deploy \
  --torii-url https://taira-validator-1.sora.org \
  --mcp-url https://taira-validator-1.sora.org/v1/mcp \
  --solana-rpc-url https://api.testnet.solana.com \
  --skip-solana-rpc false
```

The final mutation-authorized run must retain all explicit irreversible
confirmations; a prior readiness report or an omitted flag cannot authorize
finalization:

```bash
SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY="<taira-route-manager-account-id>" \
SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY="<runtime-only-private-key-hex>" \
SCCP_SOLANA_DEPLOYER_SECRET_KEY="hex:<128-hex-runtime-secret>" \
VITE_WALLETCONNECT_PROJECT_ID="<32-hex-walletconnect-project-id>" \
VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL="<browser-safe-destination-prover-module-url>" \
VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL="<browser-safe-source-prover-module-url>" \
npm run sccp:solana:finish-production -- \
  --submit true \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256> \
  --confirm-finalize-programs true \
  --confirm-finalize-linked-verifier true \
  --governed-native-verifier-package <reviewed-native-verifier-package.json> \
  --expected-governed-native-verifier-package-sha256 0x<independently-reviewed-package-byte-sha256> \
  --confirm-governed-native-verifier true \
  --governance-approval-file <reviewed-approval.json> \
  --expected-governance-approval-sha256 0x<independent-approval-byte-hash> \
  --material-roots <reviewed-artifact-root> \
  --output-dir output/sccp-solana-deploy \
  --torii-url https://taira-validator-1.sora.org \
  --mcp-url https://taira-validator-1.sora.org/v1/mcp \
  --solana-rpc-url https://api.testnet.solana.com \
  --skip-solana-rpc false
```

If the production-requirements audit finds historical file-backed Solana key
material under `output/sccp-solana*`, it is a canonical root-cause production
blocker. An authorized operator must rotate or revoke every affected authority,
remove those files, and retain custody evidence before rerunning the audit;
`finish-production` never automates that destructive remediation.

To publish a reviewed production manifest, the signer must be a TAIRA testnet
`testu...` account holding `CanManageSccpRouteManifests`, and the private key
must be supplied only at runtime. The authority account is public and can be
passed with `--authority` or `SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY`; the private
key must stay in `SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY` only for the process
that signs:

```bash
export SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY="<taira-route-manager-account-id>"

npm run sccp:solana:deploy -- route-manifest-isi \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256>

npm run sccp:solana:deploy -- publish-readiness \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256> \
  --torii-url https://taira-validator-1.sora.org \
  --mcp-url https://taira-validator-1.sora.org/v1/mcp

npm run sccp:solana:deploy -- route-publication-request \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256>

npm run sccp:solana:deploy -- route-manager-access-request \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256>

npm run sccp:solana:deploy -- operator-handoff \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256>

SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY="<runtime-only-private-key-hex>" \
npm run sccp:solana:deploy -- publish-route-manifest \
  --submit true \
  --manifest output/sccp-solana-deploy/taira-solana-xor-route.manifest.json \
  --expected-manifest-sha256 0x<independently-reviewed-exact-manifest-byte-sha256> \
  --torii-url https://taira-validator-1.sora.org \
  --mcp-url https://taira-validator-1.sora.org/v1/mcp
```

`publish-readiness` also audits the configured TAIRA MCP endpoint for
`iroha.transactions.submit` and `iroha.transactions.submit_and_wait`, so a
blocked report can distinguish missing route/proof/signing material from a
missing transaction-submission surface. When `--authority` or
`SCCP_TAIRA_ROUTE_MANIFEST_AUTHORITY` is supplied it also uses
`iroha.accounts.permissions` to verify the account holds
`CanManageSccpRouteManifests`; signing material still comes only from the runtime
`SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY` environment variable.
`publish-route-manifest --submit true` reruns the same readiness audit before
submitting and writes `taira-solana-xor-route.publish-blocked.json` instead of
attempting a partial publication when prerequisites are missing.
Every publication-stage command must carry the same independently reviewed
`--expected-manifest-sha256` for the exact manifest file bytes. This pin is not
the canonical/object manifest hash and must not be recomputed silently at the
signing boundary. If fresh public readback proves that exact canonical manifest
is already published, `publish-route-manifest --submit true` returns a verified
no-op before ISI generation, route-manager permission lookup, runtime signer
environment inspection, or signer invocation.
Publication accepts only the canonical
`https://taira-validator-{1,2,3,4}.sora.org` roots and requires `--mcp-url` to
equal the selected root plus `/v1/mcp`; an arbitrary non-default URL, mixed
validator roots, query/credential URL, convenience root, or HTTP endpoint can
never satisfy rollout readiness.

`lane-activation-proposal` writes
`output/sccp-solana-deploy/taira-solana-xor-lane-activation-proposal.json`, a
non-secret TAIRA governance review package that binds the public Solana lane
activation request hash, deployed Solana verifier/source pins, destination
binding evidence, and the governed proof-material inputs still required before
the lane can be marked production-ready. It does not publish the route, grant
permissions, submit a transaction, or claim governance activation.

Artifacts are written under `output/sccp-solana-deploy/`. If Solana testnet funding, the compiled program, proof material, or public TAIRA route publication is unavailable, the command writes a blocked report instead of creating placeholder deployment evidence or a fake manifest.
`npm run sccp:solana:deploy -- deployment-video` also reads the latest app smoke-readiness report from `output/sccp-solana-smoke-readiness/latest.json` by default, or a custom path via `--smoke-readiness`. The MP4/subtitle walkthrough includes real Solana deployment evidence, the public-lane activation request, activation-package hash, route-manager handoff state, and current WalletConnect/prover/preflight blockers instead of implying a live bidirectional smoke has completed.
`npm run sccp:solana:refresh-evidence` refreshes the non-secret Solana SCCP evidence chain in dependency order. With live RPC enabled it first captures one canonical atomic snapshot, derives post-deploy evidence from that in-memory result, creates manifest patch evidence, drafts the route, and regenerates exact manifest conformance before any handoff, proof bundle, lane activation, media, or production gate runs. It forwards `--walletconnect-project-id`, `--destination-prover-module-url`, `--source-prover-module-url`, and `--manifest-file` into the smoke-readiness step without storing the WalletConnect project id value in the report. It writes `output/sccp-solana-deploy/taira-solana-xor-evidence-refresh.json` so route operators can see exactly which refreshed artifacts share one evidence hash and which real production blockers remain. The same implementation is also available as `npm run sccp:solana:deploy -- refresh-evidence`.
`npm run sccp:solana:refresh-live-evidence` runs the same chain with `--skip-solana-rpc false`, so the lane activation, production gate, smoke-readiness, and live-video diagnostics include a live Solana testnet RPC health check in addition to the public TAIRA reads.

Run the Solana route preflight:

```bash
npm run e2e:sccp:solana-preflight
```

The preflight verifies TAIRA SCCP submit capabilities, public `taira_sol_xor` manifest publication, Solana testnet program/mint/verifier/source identities, live Solana ProgramData executable hash matching the manifest `verifierCodeHash`, immutable bridge/source programs, SPL mint authority binding to the verifier PDA, verifier-state stored mint binding, browser-safe source/destination prover module URLs, TAIRA burn-record material, post-deploy live evidence, and Solana testnet RPC health. It is read-only and exits non-zero if the public route is missing or incomplete. Local manifest checks can be run with `--manifest-file`, but that mode is local evidence only.

Run the Solana production completion gate:

```bash
npm run e2e:sccp:solana-production-gate
```

This read-only gate combines the public route preflight, production requirements
report, publish-readiness report, source-material handoff verification, Solana
source-burn submission with its canonical source-proof request scaffold, Solana
proof-material bundle manifest, smoke-readiness report, deployment
MP4/subtitles, and completed bidirectional live-video evidence into one final
readiness report at
`output/sccp-solana-production-gate/sccp-solana-production-gate.json`. Use
`-- --allow-incomplete true` during rollout to write the report without treating
the expected blocked state as a command failure.
Each run also records a canonical `preLiveInputSnapshot` with the resolved
path, presence, byte length, and SHA-256 of every JSON, deployment MP4, and VTT
input that affected the gate. The report byte SHA returned by
`finish-production`, together with that snapshot hash, is the only custom-output
handoff accepted by the live-video success path; a caller-supplied collection
of allegedly trusted paths is never accepted.
For MP4 artifacts, the gate uses `ffprobe` to verify the container has a video
stream and an embedded subtitle stream, and checks VTT subtitle files start with
`WEBVTT`; a renamed or subtitle-less MP4 will not satisfy the video
requirements.
The report includes a `completionAudit` array that maps the original Solana
SCCP objective to concrete evidence: real Solana deployment, public TAIRA route
publication, governed proof material, wallet/prover smoke readiness,
bidirectional live-transfer video, deployment walkthrough MP4/subtitles, and
absence of fake completion claims.
It also rejects stale handoff packages by comparing embedded summaries against
the direct generated artifacts for post-deploy evidence, prover readiness,
production-material inventory, route publish-readiness, blocked publish
attempts, route-publication requests, route-manager access, activation packages,
and smoke readiness. Override those inputs with the matching gate flags such as
`--post-deploy-evidence`, `--prover-readiness`,
`--production-material-inventory`, `--route-publish-blocked`,
`--route-publication-request`, `--route-manager-access-request`,
`--activation-package`, and `--smoke-readiness` when validating an alternate
artifact directory.

The Solana video command is also a gate:

```bash
npm run e2e:sccp:solana-live-evidence-template
```

This writes
`output/sccp-solana-live-video/completed-solana-bidirectional-live-evidence.template.json`.
It is a non-secret template for the real `--live-evidence` file. The generated
file is marked `templateOnly: true`, and the video gate rejects it until every
placeholder is replaced with completed TAIRA -> Solana and Solana -> TAIRA
transaction evidence, `templateOnly` is removed or set to `false`, and the
schema is changed to
`iroha-demo-sccp-solana-live-transfer-evidence/v1`.

```bash
npm run e2e:sccp:solana-video -- \
  --live-evidence <completed-solana-bidirectional-live-evidence.json> \
  --production-gate-snapshot output/sccp-solana-production-gate/sccp-solana-production-gate.json \
  --production-gate-snapshot-sha256 0x<independently-reviewed-report-byte-sha256> \
  --skip-solana-rpc false
```

It exact-loads that report and every input in its pre-live snapshot, reruns a
fresh production gate against the same snapshot, and refuses to generate an MP4
unless the route preflight is ready, the fresh gate has no non-video failures,
and the supplied live-evidence file proves completed TAIRA -> Solana and Solana
-> TAIRA transfers. A blocked or dry-run invocation preserves any prior
successful MP4/VTT/JSON evidence. When blocked, `-- --allow-incomplete` writes a
JSON transcript and VTT subtitles explaining the blocker, but still does not
create a fake success video.
The blocked transcript also summarizes the latest production-requirements,
publish-readiness, Solana smoke-readiness, source-material handoff
verification, and proof-material bundle reports so the production gate can show
the verified Solana deployment evidence separately from the still-missing public
route/proof/signing inputs. Override those inputs with
`--production-requirements`, `--publish-readiness`, `--smoke-readiness`,
`--handoff-verification`, and `--proof-material-bundle` when testing
non-default artifact locations.

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
10. **SCCP tab** — bridge XOR on TAIRA-only SCCP routes. TRON/BSC/TON use the existing live flows. Solana testnet (`taira_sol_xor`) is visible with readiness/preflight, wallet connection, TAIRA -> Solana finalize preparation, and Solana -> TAIRA burn/source-proof wiring. It remains action-gated for production completion until the public route manifest and governed Solana source/destination proof modules are live.
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
