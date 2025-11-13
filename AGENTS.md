# AGENT NOTES — iroha-demo-javascript

Last updated: 2025-11-12

## Purpose
Modern Electron + Vue 3 wallet-demo that connects directly to Torii (Iroha SORA Nexus). The UI shows UAID onboarding, wallet balances, transfer/receive QR flows, and explorer metrics. Styling uses a glassmorphic theme with animated sakura particles. All code lives under plain Vite/Electron (no Nuxt). Pinia stores persist session and theme state in localStorage.

## Key Concepts & Flows
- **UAID onboarding (`/uaid`)**: Users paste/verify their SORA Nexus UAID. Verification calls `ToriiClient.getUaidBindings` + `getUaidManifests` through the preload bridge. Session store requires this before other routes.
- **Torii Bridge (Electron preload)**: `window.iroha` exposes helpers wrapped around `@iroha/iroha-js` (register account, transfer asset, UAID overview, explorer metrics). Remember to build native bindings after installing deps (`npm install` runs scripts/postinstall).
- **Wallet / Send / Receive**: Vue views in `src/views`. Receive uses QR generation; Send leverages ZXing for camera + file upload to populate transfer params.
- **Theme & Flair**: `useThemeStore` toggles light/dark by applying `data-theme` on `<html>`. Animated sakura petals (`SakuraScene.vue`) sit behind everything (canvas z-index 0) and read CSS `--parallax-x/y` to drift + “stick” to side walls. Ensure new overlays respect pointer-events so they don’t block the sidebar.

## Tooling & Commands
- **Dev**: `npm run dev` (electron-vite). Ensure `ELECTRON_RENDERER_URL` is set automatically by electron-vite.
- **Tests**: `npm test` (Vitest + jsdom). Current suites cover session, theme, and transaction helper logic.
- **Lint/Typecheck**: `npm run lint`, `npm run typecheck` (ESLint & vue-tsc) if needed.

## File Map (high level)
- `electron/main.ts` / `preload.ts`: window bootstrap + Torii bridge.
- `src/main.ts`: app entry, mounts Pinia + router + theme hydration.
- `src/stores`: `session.ts`, `theme.ts` (persisting UAID/session/theme state).
- `src/router/index.ts`: guards (`/uaid` required first).
- `src/views`: UAID/Setup/Wallet/Send/Receive/Explore screens.
- `src/components/SakuraScene.vue`: canvas particle layer.
- `src/styles/main.css`: dual-theme glassmorphism + layout styling.

## Gotchas
- Always keep UI layers above the sakura canvas (set container `z-index` if adding new wrappers). Canvas must stay `pointer-events: none`.
- UAID guard will redirect to `/uaid` if `session.hasUaid` is false. When testing other routes, set `session.user.uaid` via store or localStorage.
- The send view requires navigator media permissions. In headless test contexts, avoid invoking scanner logic.
- If `@iroha/iroha-js` native binding fails to build, rerun `npm run build:native` inside `node_modules/@iroha/iroha-js`.

## Pending Ideas
- Expand unit tests around receive/send helpers or theme toggling side effects if coverage is needed.
- More petal variations can live in `SakuraScene.vue` (color/size arrays already theme-aware).

## Testing Policy
- When adding **any new function**, also add at least one corresponding unit test.
- For functions with **non-trivial logic** (conditionals, loops, async/network behavior), write multiple tests covering edge cases and failure paths.

Keep this doc updated whenever major flows or tooling change.
