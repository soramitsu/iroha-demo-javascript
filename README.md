# Iroha Desktop Wallet

An Electron and Vue 3 wallet for a live Iroha network. The renderer uses a
typed preload bridge; network access, Norito encoding, fee quotation, vault
access, signing, and transaction submission stay in Electron.

## Requirements

- Node.js 20 or newer
- The current Iroha checkout at `../iroha`
- Rust and the native build prerequisites required by `@iroha/iroha-js`

The SDK dependency is intentionally local:

```text
@iroha/iroha-js -> ../iroha/javascript/iroha_js
```

There is no cached full-SDK, historical-revision signer, or compatibility
fallback. Build the current sibling SDK when its native bindings are missing or
stale.

## Development

```bash
npm install
npm run dev
```

Useful verification commands:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run verify` runs lint, both renderer and Electron typechecks, and the test
suite.

## Governance workspace

The `/governance` route is a live, ledger-backed Parliament workspace. It
supports:

- fail-closed `/v1/gov/capabilities` validation for the exact Taira chain
  `fc56984b-2be7-431d-840e-21514d1883f0`, network prefix `369`, ABI `1`, and
  data model `3`;
- typed validation-fee list/detail reads with exact-ID deep links;
- the seven concurrent Parliament bodies, including members-only FMA voting;
- automatic PLAIN finalization, lifecycle inspection, and enactment only after
  genuine finalized evidence is present;
- reviewed citizenship registration through the Core citizen-draft route;
- typed payout-lifecycle composition followed by an exact linked
  validation-fee policy;
- quote, review, vault-backed signing, and commit in separate prepare/confirm
  phases.

ZK voting is disabled unless the current SDK exposes the complete supported
flow. The application does not silently downgrade a requested ZK ballot to a
Plain ballot.

Governance transactions never accept private keys from renderer or HTTP
fields. The Electron bridge reviews the exact Core draft and fee quote, then
resolves the signer from the OS vault only when the user confirms. There is no
manual finalize action or legacy signed-policy path.

## Validation-fee trust boundary

Validation-fee policy state is fail-closed. The wallet does not trust a server
boolean, one endpoint in isolation, or a value copied from proposal state.
Policy fields remain unavailable unless the Electron host receives the exact
generated enabled config:

```json
{
  "enabled": true,
  "ledgerBinding": {
    "schema": "cbsi.mobile-validation-fee-ledger-binding.v1",
    "chainId": "fc56984b-2be7-431d-840e-21514d1883f0",
    "genesisHash": "...",
    "policyChainGenesisHash": "...",
    "checkpoint": {
      "height": 1,
      "contextId": "..."
    }
  },
  "expected": {
    "...": "generated release evidence only"
  }
}
```

Set that object as `GOVERNANCE_VALIDATION_FEE_CONFIG_JSON` and set
`CBSI_CORE_API_BASE_URL` to the credential-free HTTPS Core origin. Unknown
fields are rejected at every config and projection level. The host concurrently
reads Core's raw `/v1/validation-fee/policy` projection and
`/v1/validation-fee/status`, requires the status wrapper to contain the exact
same projection, checks every runtime ledger/Parliament/payout coordinate, and
rejects rollback or same-coordinate equivocation. Any failed read clears the
renderer state; no stale cached policy is served.

## Architecture

- `src/` contains the Vue renderer, Pinia stores, routes, and typed governance
  model.
- `electron/preload.ts` exposes the narrow renderer bridge and owns network,
  encoding, fee, signing, and commit operations.
- `electron/main.ts` owns Electron lifecycle and privileged IPC.
- `scripts/iroha-sdk-compat.mjs` validates and resolves the current sibling SDK.
- `tests/` contains unit and component coverage.

The renderer must not receive private key material. Secrets are resolved only
after review and only inside the privileged process.

## Packaging

```bash
npm run dist:mac
npm run dist:win
npm run dist:linux
```

See [RELEASE.md](RELEASE.md) for signing variables and the tag-based release
workflow.
