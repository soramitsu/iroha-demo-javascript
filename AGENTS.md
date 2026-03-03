# AGENT NOTES — iroha-demo-javascript

Last updated: 2026-03-03

## Purpose
Modern Electron + Vue 3 wallet-demo that connects directly to Torii (Iroha SORA Nexus). The UI shows account onboarding, wallet balances, NPOS staking for XOR, transfer/receive QR flows, and explorer metrics. Styling uses a glassmorphic theme with animated sakura particles. All code lives under plain Vite/Electron (no Nuxt). Pinia stores persist session and theme state in localStorage.

## Key Concepts & Flows
- **Account onboarding (`/account`)**: Users generate recovery phrases, derive their SORA Nexus accountId, register via `/v1/accounts/onboard`, and optionally bootstrap an IrohaConnect pairing session.
- **Torii Bridge (Electron preload)**: `window.iroha` exposes helpers wrapped around `@iroha/iroha-js` (register account, transfer asset, explorer metrics, Connect preview, NPOS staking tx builders) plus Nexus public-lane fetch endpoints. Remember to build native bindings after installing deps (`npm install` runs scripts/postinstall).
- **Wallet / Send / Receive**: Vue views in `src/views`. Receive uses QR generation; Send leverages ZXing for camera + file upload to populate transfer params.
- **Staking (`/staking`)**: Dataspace-first validator nomination flow for public-lane NPOS. Lane is auto-resolved from `getSumeragiStatus` (with dataspace commitment fallback), validator list is loaded from `/v1/nexus/public_lanes/{lane_id}/validators`, stake balance is surfaced in-view, and stake/reward actions submit staking instructions via `buildTransaction`.
- **Theme & Flair**: `useThemeStore` toggles light/dark by applying `data-theme` on `<html>`. Animated sakura petals (`SakuraScene.vue`) sit behind everything (canvas z-index 0) and read CSS `--parallax-x/y` to drift + “stick” to side walls. Ensure new overlays respect pointer-events so they don’t block the sidebar.

## Tooling & Commands
- **Dev**: `npm run dev` (electron-vite). Ensure `ELECTRON_RENDERER_URL` is set automatically by electron-vite.
- **Tests**: `npm test` (Vitest + jsdom). Current suites cover session, theme, and transaction helper logic.
- **Lint/Typecheck**: `npm run lint`, `npm run typecheck` (renderer + Electron), plus `npm run typecheck:renderer` / `npm run typecheck:electron`.
- **Verification bundles**: `npm run verify` (lint + typecheck + unit tests), `npm run verify:localnet` / `npm run verify:localnet:stateful` to include live Electron E2E against generated localnet. Use `npm run verify:localnet:all` to run read-only + stateful localnet E2E after one base verify pass.
- **Live E2E**: `E2E_TORII_URL=<url> E2E_CHAIN_ID=<chain> npm run e2e:live` (strict live Torii reachability preflight, supports `/v1/health` and `/health`, validates Explore metrics/QR and route-smoke checks for Setup/Wallet/Staking/Subscriptions/Send/Receive/Offline). Optional write flow: `npm run e2e:live:stateful` (requires UAID onboarding enabled on the target Torii).
- **Localnet E2E**: `npm run e2e:localnet` (auto-generates localnet and runs live E2E), `npm run e2e:localnet:stateful` for onboarding flow.

## File Map (high level)
- `electron/main.ts` / `preload.ts`: window bootstrap + Torii bridge.
- `src/main.ts`: app entry, mounts Pinia + router + theme hydration.
- `src/stores`: `session.ts`, `theme.ts` (persisting account/session/theme state).
- `src/router/index.ts`: guards (`/account` required first).
- `src/views`: Account/Setup/Wallet/Staking/Send/Receive/Explore screens.
- `src/components/SakuraScene.vue`: canvas particle layer.
- `src/styles/main.css`: dual-theme glassmorphism + layout styling.

## Gotchas
- Always keep UI layers above the sakura canvas (set container `z-index` if adding new wrappers). Canvas must stay `pointer-events: none`.
- Account guard will redirect to `/account` if `session.hasAccount` is false. When testing other routes, seed `session.accounts[]` with an active account containing `accountId` and `privateKeyHex`.
- Onboarding/persistence now keeps explicit account literals (`0x...@domain`) as `accountId`; `ih58` is backfilled from Torii onboarding responses when local address-format derivation is unavailable.
- The send view requires navigator media permissions. In headless test contexts, avoid invoking scanner logic.
- If `@iroha/iroha-js` native binding fails to build, rerun `npm run build:native` inside `node_modules/@iroha/iroha-js`.

## Pending Ideas
- Expand unit tests around receive/send helpers or theme toggling side effects if coverage is needed.
- More petal variations can live in `SakuraScene.vue` (color/size arrays already theme-aware).

## Testing Policy
- When adding **any new function**, also add at least one corresponding unit test.
- For functions with **non-trivial logic** (conditionals, loops, async/network behavior), write multiple tests covering edge cases and failure paths.

Keep this doc updated whenever major flows or tooling change.
