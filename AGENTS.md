# AGENT NOTES — iroha-demo-javascript

Last updated: 2026-03-29

## Purpose

Modern Electron + Vue 3 wallet-demo that connects directly to Torii (TAIRA testnet). The UI now starts with local wallet creation first, then layers wallet balances, optional on-chain alias registration, NPOS staking for XOR, SORA Parliament governance flows, transfer/receive QR flows, and explorer metrics on top. Styling uses a glassmorphic theme with animated sakura particles. All code lives under plain Vite/Electron (no Nuxt). Pinia stores persist session/theme/locale state in localStorage.

## Key Concepts & Flows

- **Account setup (`/account`)**: Users generate recovery phrases, derive their accountId, and save the wallet locally without needing on-chain alias registration. The same screen now also restores wallets either from a pasted 12/24-word mnemonic or from an exported backup JSON file; backup exports now carry local wallet metadata such as display name and domain so imports can restore that local labeling when present, while still accepting older mnemonic-only backup files. `/v1/accounts/onboard` is now tucked behind an explicit Advanced panel and presented as optional alias registration rather than core wallet creation; the flow treats onboarding `HTTP 409` as an already-registered alias and falls back to a local wallet save when onboarding returns `HTTP 403`. IrohaConnect pairing bootstrap remains optional from the same screen.
- **Network profile lock**: Setup/onboarding now lock connection selection to TAIRA testnet only (`https://taira.sora.org`, chain id `809574f5-fee7-5e69-bfcf-52451e42d50f`), and the public explorer link is `https://taira-explorer.sora.org`.
- **Torii Bridge (Electron preload)**: `window.iroha` exposes helpers wrapped around `@iroha/iroha-js` (register account, transfer asset, explorer metrics, Connect preview, NPOS staking tx builders) plus Nexus public-lane fetch endpoints. Torii/Nexus HTTP traffic now uses a Node-side fetch shim from preload instead of renderer browser fetch, so the Electron window can keep normal web security enabled. TAIRA wire requests now normalize account IDs to canonical `sorau...` I105 literals before hitting Torii endpoints, and the raw `/v1/accounts/{account_id}/assets` bridge path now tolerates both legacy `{ asset_id, quantity }` items and the newer `{ asset, account_id, quantity }` shape that TAIRA currently returns. Remember to build native bindings after installing deps (`npm install` runs scripts/postinstall).
- **Wallet / Send / Receive**: Vue views in `src/views`. Wallet now includes a TAIRA starter-funds faucet action that first fetches `GET /v1/accounts/faucet/puzzle`, solves the returned memory-hard scrypt proof-of-work asynchronously in preload, and then submits `POST /v1/accounts/faucet`; puzzle difficulty can rise with recent committed plus queued faucet claim volume, and TAIRA currently requires finalized Sumeragi VRF seed material in the challenge whenever faucet PoW is enabled. The faucet proof is now solved against the canonical `sorau...` account literal that TAIRA verifies on-chain, even if the UI is showing a compatibility literal. During faucet claims the wallet shows a non-blocking status overlay with live bridge-reported phases (puzzle fetch, VRF wait, PoW solve, submit, wallet refresh) and, after submit succeeds, polls account balances for a short bounded window before falling back to a “still indexing” message. Local-only wallets now surface a note that balances may stay empty until the account is live on-chain, and a successful faucet claim clears the local-only marker. When a fresh account claims funds, the view stores the returned funded `asset_id` into `session.connection.assetDefinitionId` if that field was blank so later send/offline flows can reuse the exact faucet-funded asset bucket. Receive uses QR generation; Send leverages ZXing for camera + file upload to populate transfer params, and includes a shield toggle that performs self-shielding only (`public -> shielded`) when policy mode supports it.
- **Kaigi (`/kaigi`)**: Browser-native 1:1 audio/video call screen for wallet users. Kaigi now starts with a meeting-link flow: hosts create a scheduled meeting, generate a compact `iroha://kaigi/join?call=...&secret=...` / `#/kaigi?call=...&secret=...` invite, and share that link instead of copy/pasting the initial offer. Live wallets submit `CreateKaigi` / `JoinKaigi` / `EndKaigi` transactions through the preload bridge, fetch encrypted host offers from Torii, and carry encrypted answer metadata on-chain so the host can auto-apply the first answer by streaming or polling Kaigi call signals. Private live meetings now also attach proof-backed host create/end artifacts and proof-backed join artifacts through the sibling `../iroha` SDK/runtime path; Kaigi/Torii app-facing views hide host and participant wallet IDs for private calls, while local-only wallets still fall back to the Advanced raw packet section for manual answer exchange. Browser media transport remains self-contained inside this Electron app for now, and legacy long invites are still accepted during migration.
- **VPN (`/vpn`)**: Signed-in users can open a Sora VPN control page that talks to Torii VPN profile/session endpoints through the Electron preload bridge. Renderer state lives in `src/stores/vpn.ts` and only persists non-sensitive UI data. Electron main owns VPN runtime state in `electron/vpnRuntime.ts`, reconciles local controller state against remote Torii session state, exposes canonical receipt history, and surfaces repair/orphaned-session flows. The renderer never configures routes or DNS directly.
- **Offline move-to-online**: `/offline` includes an on-chain move action that now mirrors Send shield behavior (policy preflight + self-shielding constraints).
- **Staking (`/staking`)**: Dataspace-first validator nomination flow for public-lane NPOS. Lane is auto-resolved from `getSumeragiStatus` (with dataspace commitment fallback), validator list is loaded from `/v1/nexus/public_lanes/{lane_id}/validators`, stake balance is surfaced in-view, and stake/reward actions submit staking instructions via `buildTransaction`.
- **Parliament (`/parliament`)**: Governance helper screen for citizenship + voting. It fetches account permissions and governance payloads, supports a fixed `10,000 XOR` `RegisterCitizen` bond, can submit `CastPlainBallot`, and prepares finalize/enact governance drafts. Referendum/proposal history is persisted per active account in localStorage and chip clicks trigger instant lookup. Referendum lookup still runs when proposal input is invalid (proposal fetch is skipped), ballots enforce positive whole-number amounts that are <= available XOR balance, and stale async payloads are invalidated for both lookup and bootstrap refresh paths when refresh/account context changes.
- **Localization (`locale`)**: App text routes through `useAppI18n` with persisted locale in `useLocaleStore` (`iroha-demo:locale`). Supported locales now cover `en-US`, `ar-SA`, `az-AZ`, `ca-ES`, `cs-CZ`, `de-DE`, `es-ES`, `fa-IR`, `fi-FI`, `fr-FR`, `he-IL`, `hi-IN`, `hu-HU`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `ms-MY`, `nb-NO`, `nl-NL`, `pl-PL`, `pt-PT`, `ru-RU`, `sr-RS`, `sl-SI`, `tr-TR`, `uk-UA`, `ur-PK`, `vi-VN`, `zh-CN`, and `zh-TW` with English fallback for missing keys. Auto-generated locale tables live in `src/i18n/*Auto.ts`; targeted manual overrides for governance/bonding, onboarding, and high-visibility app chrome copy (Arabic/Persian/Hebrew/Urdu) live in `src/i18n/messages.ts`. `detectPreferredLocale()` includes prefix fallbacks for the full locale set (including `iw` -> `he-IL`, `in` -> `id-ID`, `zh-hant` -> `zh-TW`, and `ur` -> `ur-PK`). Locale direction is tracked per locale (`LOCALE_DIRECTIONS`) and applied to `<html dir>` for RTL languages (`ar-SA`, `fa-IR`, `he-IL`, `ur-PK`). RTL shell styling now mirrors app structure (`.app-shell` row reversal, mirrored sidebar/card accents, caret inversion) and uses `unicode-bidi: plaintext` on mixed technical-value surfaces to stabilize ID/URL rendering in RTL UIs. Subscription amount formatting accepts locale-aware number formatting callbacks (wired from `useAppI18n().n` in `SubscriptionHubView`). `tests/i18n.spec.ts` guards against missing non-English keys (including route/nav metadata + runtime subscription-format keys) and non-technical hardcoded placeholders in Vue templates.
- **Theme & Flair**: `useThemeStore` toggles light/dark by applying `data-theme` on `<html>`. Animated sakura petals (`SakuraScene.vue`) sit behind everything (canvas z-index 0) and read CSS `--parallax-x/y` to drift + “stick” to side walls. Ensure new overlays respect pointer-events so they don’t block the sidebar.

## Tooling & Commands

- **Dev**: `npm run dev` (electron-vite). Ensure `ELECTRON_RENDERER_URL` is set automatically by electron-vite.
- **VPN controller builds**: `npm run build:vpn:controllers`, `npm run build:vpn:macos-controller`, and `npm run build:vpn:linux-controller` compile the bundled local controller binaries used by the Electron VPN runtime.
- **Packaging**: `npm run dist`, `npm run dist:mac`, and `npm run dist:linux` run electron-vite builds, stage VPN controller binaries into `dist-native/vpn`, and package artifacts with `electron-builder`.
- **Tests**: `npm test` (Vitest + jsdom). Current suites cover session, theme, and transaction helper logic.
- **Lint/Typecheck**: `npm run lint`, `npm run typecheck` (renderer + Electron), plus `npm run typecheck:renderer` / `npm run typecheck:electron`.
- **Live verification bundles**: `npm run verify:live` (base verify + strict live TAIRA E2E including onboarding + shield submit checks).
- **Verification bundles**: `npm run verify` (lint + typecheck + unit tests).
- **Live VPN surface check**: `npm run verify:live:vpn-surface` verifies that the deployed TAIRA node is healthy, serves `/v1/mcp`, publishes the VPN paths in `/openapi.json`, exposes the `iroha.vpn.*` MCP aliases, and serves `/v1/vpn/profile` before attempting VPN-focused live bring-up.
- **Live E2E**: `npm run e2e:live` (defaults to TAIRA Torii + chain ID, strict reachability preflight, boots a fresh local wallet through the live faucet to discover the funded asset bucket, validates Explore metrics/QR and route-smoke checks for Setup/Wallet/Staking/Parliament/Subscriptions/Send/Receive/Offline, then runs optional alias-registration + shield-submit checks). `E2E_ASSET_DEFINITION_ID` is now optional because the harness can bootstrap it from the faucet response. The app itself no longer requires UAID onboarding to create a wallet; the live alias-registration probe treats onboarding `HTTP 409` as reusable-account success and skips cleanly when TAIRA returns onboarding `HTTP 403`.

## File Map (high level)

- `electron/main.ts` / `preload.ts`: window bootstrap + Torii bridge.
- `electron/vpnRuntime.ts` / `electron/vpnController.ts`: controller-backed VPN session orchestration and local controller bridge.
- `src/main.ts`: app entry, mounts Pinia + router + theme/locale hydration.
- `src/stores`: `session.ts`, `theme.ts`, `locale.ts`, `vpn.ts` (persisting account/session/theme/locale/VPN UI state).
- `src/composables/useAppI18n.ts`: translation + locale-bound date/number formatting helpers.
- `src/i18n/messages.ts`: locale tables and interpolation helpers.
- `src/router/index.ts`: guards (`/account` required first).
- `src/views`: Account/Setup/Wallet/Staking/Parliament/Send/Receive/Explore/Offline/VPN screens.
- `src/views/KaigiView.vue`: Meeting-link-first Kaigi screen with compact invites, private/transparent meeting modes, persisted host-session resume, and Advanced manual fallback for local-only wallets.
- `src/stores/kaigi.ts`: Persisted Kaigi host-session state used to resume live/private meeting watches after reload.
- `src/utils/kaigi.ts`: Kaigi packet helpers for participant ID normalization plus Advanced manual offer/answer packet build/parse logic.
- `src/utils/kaigiInvite.ts`: Compact Kaigi invite encoding/decoding and legacy invite compatibility helpers.
- `src/components/SakuraScene.vue`: canvas particle layer.
- `src/styles/main.css`: dual-theme glassmorphism + layout styling.

## Gotchas

- Always keep UI layers above the sakura canvas (set container `z-index` if adding new wrappers). Canvas must stay `pointer-events: none`.
- Account guard will redirect to `/account` if `session.hasAccount` is false. This is now a local-wallet guard, not proof that the account exists on-chain. When testing other routes, seed `session.accounts[]` with an active account containing `accountId` and `privateKeyHex`.
- Setup forces TAIRA testnet connection values (Torii URL / chain ID read-only), and account setup no longer exposes editable connection inputs.
- Route header titles/subtitles now use route meta keys (`titleKey`, `subtitleKey`) and are translated in `App.vue`.
- VPN actions require both an active local wallet account and a bundled `sora-vpn-controller` binary for the current platform. Build it explicitly in dev or stage it through the `dist` packaging scripts.
- VPN runtime persistence under Electron `userData` includes canonical receipt cache plus active-session reconciliation data. Do not persist session tickets or private controller secrets in Pinia/localStorage.
- Onboarding/persistence stores canonical account IDs as `accountId`; legacy snapshots containing `0x...@domain` / `ih58` / `compressed` fields are migrated during hydrate.
- Live onboarding E2E reuses one deterministic onboarding account (`E2E_ONBOARDING_PRIVATE_KEY_HEX`) so repeated runs do not keep creating TAIRA onboarding records.
- Deprecated onboarding env vars (`E2E_STATEFUL_*`) now hard-fail in live E2E. Rename `E2E_STATEFUL_ALIAS` -> `E2E_ONBOARDING_ALIAS`, `E2E_STATEFUL_PRIVATE_KEY_HEX` -> `E2E_ONBOARDING_PRIVATE_KEY_HEX`, and `E2E_STATEFUL_OFFLINE_BALANCE` -> `E2E_ONBOARDING_OFFLINE_BALANCE`.
- Private Kaigi invite links now carry only `call` + `secret`; do not reintroduce SDP, ICE candidates, or wallet IDs into shareable links.
- Private Kaigi host create/end and join flows rely on the sibling `../iroha` native host binding for proof generation. If the local SDK drifts, rebuild it with `npm run build:native` under `../iroha/javascript/iroha_js`.
- Shield mode in Send is limited to destination=active-account and whole-number base-unit amounts; unsupported confidential modes auto-disable the toggle after policy preflight.
- Offline "Move funds to online wallet" uses the same shield constraints as Send, including destination lock and whole-number amount validation.
- Parliament proposal IDs are expected to be 32-byte hex values (with or without `0x` prefix); referendum IDs are free-form strings from governance storage.
- The send view requires navigator media permissions. In headless test contexts, avoid invoking scanner logic.
- If `@iroha/iroha-js` native binding fails to build, rerun `npm run build:native` inside `node_modules/@iroha/iroha-js`.
- Electron main window keeps `webSecurity: true`. Torii/Nexus requests must stay inside the preload bridge's Node-backed HTTP transport rather than renderer `fetch()`, or TAIRA CORS failures will return.

## Pending Ideas

- Expand unit tests around receive/send helpers or theme toggling side effects if coverage is needed.
- More petal variations can live in `SakuraScene.vue` (color/size arrays already theme-aware).

## Testing Policy

- When adding **any new function**, also add at least one corresponding unit test.
- For functions with **non-trivial logic** (conditionals, loops, async/network behavior), write multiple tests covering edge cases and failure paths.

Keep this doc updated whenever major flows or tooling change.
