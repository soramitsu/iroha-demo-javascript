# AGENT NOTES — iroha-demo-javascript

Last updated: 2026-03-06

## Purpose

Modern Electron + Vue 3 wallet-demo that connects directly to Torii (TAIRA testnet). The UI shows account onboarding, wallet balances, NPOS staking for XOR, SORA Parliament governance flows, transfer/receive QR flows, and explorer metrics. Styling uses a glassmorphic theme with animated sakura particles. All code lives under plain Vite/Electron (no Nuxt). Pinia stores persist session/theme/locale state in localStorage.

## Key Concepts & Flows

- **Account onboarding (`/account`)**: Users generate recovery phrases, derive their accountId, register via `/v1/accounts/onboard`, and optionally bootstrap an IrohaConnect pairing session.
- **Network profile lock**: Setup/onboarding now lock connection selection to TAIRA testnet only (`https://taira.sora.org`, chain id `809574f5-fee7-5e69-bfcf-52451e42d50f`), and the public explorer link is `https://taira-explorer.sora.org`.
- **Torii Bridge (Electron preload)**: `window.iroha` exposes helpers wrapped around `@iroha/iroha-js` (register account, transfer asset, explorer metrics, Connect preview, NPOS staking tx builders) plus Nexus public-lane fetch endpoints. Remember to build native bindings after installing deps (`npm install` runs scripts/postinstall).
- **Wallet / Send / Receive**: Vue views in `src/views`. Receive uses QR generation; Send leverages ZXing for camera + file upload to populate transfer params, and includes a shield toggle that performs self-shielding only (`public -> shielded`) when policy mode supports it.
- **Offline move-to-online**: `/offline` includes an on-chain move action that now mirrors Send shield behavior (policy preflight + self-shielding constraints).
- **Staking (`/staking`)**: Dataspace-first validator nomination flow for public-lane NPOS. Lane is auto-resolved from `getSumeragiStatus` (with dataspace commitment fallback), validator list is loaded from `/v1/nexus/public_lanes/{lane_id}/validators`, stake balance is surfaced in-view, and stake/reward actions submit staking instructions via `buildTransaction`.
- **Parliament (`/parliament`)**: Governance helper screen for citizenship + voting. It fetches account permissions and governance payloads, supports a fixed `10,000 XOR` `RegisterCitizen` bond, can submit `CastPlainBallot`, and prepares finalize/enact governance drafts. Referendum/proposal history is persisted per active account in localStorage and chip clicks trigger instant lookup. Referendum lookup still runs when proposal input is invalid (proposal fetch is skipped), ballots enforce positive whole-number amounts that are <= available XOR balance, and stale async payloads are invalidated for both lookup and bootstrap refresh paths when refresh/account context changes.
- **Localization (`locale`)**: App text routes through `useAppI18n` with persisted locale in `useLocaleStore` (`iroha-demo:locale`). Supported locales now cover `en-US`, `ar-SA`, `az-AZ`, `ca-ES`, `cs-CZ`, `de-DE`, `es-ES`, `fa-IR`, `fi-FI`, `fr-FR`, `he-IL`, `hi-IN`, `hu-HU`, `id-ID`, `it-IT`, `ja-JP`, `ko-KR`, `ms-MY`, `nb-NO`, `nl-NL`, `pl-PL`, `pt-PT`, `ru-RU`, `sr-RS`, `sl-SI`, `tr-TR`, `uk-UA`, `ur-PK`, `vi-VN`, `zh-CN`, and `zh-TW` with English fallback for missing keys. Auto-generated locale tables live in `src/i18n/*Auto.ts`; governance/bonding terminology overrides remain in `src/i18n/messages.ts`. `detectPreferredLocale()` includes prefix fallbacks for the full locale set (including `iw` -> `he-IL`, `in` -> `id-ID`, `zh-hant` -> `zh-TW`, and `ur` -> `ur-PK`). Locale direction is tracked per locale (`LOCALE_DIRECTIONS`) and applied to `<html dir>` for RTL languages (`ar-SA`, `fa-IR`, `he-IL`, `ur-PK`). Subscription amount formatting accepts locale-aware number formatting callbacks (wired from `useAppI18n().n` in `SubscriptionHubView`). `tests/i18n.spec.ts` guards against missing non-English keys (including route/nav metadata + runtime subscription-format keys) and non-technical hardcoded placeholders in Vue templates.
- **Theme & Flair**: `useThemeStore` toggles light/dark by applying `data-theme` on `<html>`. Animated sakura petals (`SakuraScene.vue`) sit behind everything (canvas z-index 0) and read CSS `--parallax-x/y` to drift + “stick” to side walls. Ensure new overlays respect pointer-events so they don’t block the sidebar.

## Tooling & Commands

- **Dev**: `npm run dev` (electron-vite). Ensure `ELECTRON_RENDERER_URL` is set automatically by electron-vite.
- **Tests**: `npm test` (Vitest + jsdom). Current suites cover session, theme, and transaction helper logic.
- **Lint/Typecheck**: `npm run lint`, `npm run typecheck` (renderer + Electron), plus `npm run typecheck:renderer` / `npm run typecheck:electron`.
- **Live verification bundles**: `npm run verify:live` (base verify + strict live TAIRA E2E including onboarding + shield submit checks).
- **Verification bundles**: `npm run verify` (lint + typecheck + unit tests).
- **Live E2E**: `npm run e2e:live` (defaults to TAIRA Torii + chain ID, strict reachability preflight, supports `/v1/health` and `/health`, validates Explore metrics/QR and route-smoke checks for Setup/Wallet/Staking/Parliament/Subscriptions/Send/Receive/Offline, then runs onboarding + shield-submit checks). Requires UAID onboarding enabled on TAIRA, treats onboarding `HTTP 409` as reusable-account success, and hard-fails on onboarding `HTTP 403`.

## File Map (high level)

- `electron/main.ts` / `preload.ts`: window bootstrap + Torii bridge.
- `src/main.ts`: app entry, mounts Pinia + router + theme/locale hydration.
- `src/stores`: `session.ts`, `theme.ts`, `locale.ts` (persisting account/session/theme/locale state).
- `src/composables/useAppI18n.ts`: translation + locale-bound date/number formatting helpers.
- `src/i18n/messages.ts`: locale tables and interpolation helpers.
- `src/router/index.ts`: guards (`/account` required first).
- `src/views`: Account/Setup/Wallet/Staking/Parliament/Send/Receive/Explore/Offline screens.
- `src/components/SakuraScene.vue`: canvas particle layer.
- `src/styles/main.css`: dual-theme glassmorphism + layout styling.

## Gotchas

- Always keep UI layers above the sakura canvas (set container `z-index` if adding new wrappers). Canvas must stay `pointer-events: none`.
- Account guard will redirect to `/account` if `session.hasAccount` is false. When testing other routes, seed `session.accounts[]` with an active account containing `accountId` and `privateKeyHex`.
- Setup forces TAIRA testnet connection values (Torii URL / chain ID read-only), and account onboarding no longer exposes editable connection inputs.
- Route header titles/subtitles now use route meta keys (`titleKey`, `subtitleKey`) and are translated in `App.vue`.
- Onboarding/persistence now keeps explicit account literals (`0x...@domain`) as `accountId`; `ih58` is backfilled from Torii onboarding responses when local address-format derivation is unavailable.
- Live onboarding E2E reuses one deterministic onboarding account (`E2E_ONBOARDING_PRIVATE_KEY_HEX`) so repeated runs do not keep creating TAIRA onboarding records.
- Deprecated onboarding env vars (`E2E_STATEFUL_*`) now hard-fail in live E2E; use `E2E_ONBOARDING_*` names only.
- Shield mode in Send is limited to destination=active-account and whole-number base-unit amounts; unsupported confidential modes auto-disable the toggle after policy preflight.
- Offline "Move funds to online wallet" uses the same shield constraints as Send, including destination lock and whole-number amount validation.
- Parliament proposal IDs are expected to be 32-byte hex values (with or without `0x` prefix); referendum IDs are free-form strings from governance storage.
- The send view requires navigator media permissions. In headless test contexts, avoid invoking scanner logic.
- If `@iroha/iroha-js` native binding fails to build, rerun `npm run build:native` inside `node_modules/@iroha/iroha-js`.

## Pending Ideas

- Expand unit tests around receive/send helpers or theme toggling side effects if coverage is needed.
- More petal variations can live in `SakuraScene.vue` (color/size arrays already theme-aware).

## Testing Policy

- When adding **any new function**, also add at least one corresponding unit test.
- For functions with **non-trivial logic** (conditionals, loops, async/network behavior), write multiple tests covering edge cases and failure paths.

Keep this doc updated whenever major flows or tooling change.
