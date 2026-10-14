# Iroha Desktop Wallet

An Electron and Vue 3 wallet for a live Iroha network. The renderer uses a
typed preload bridge; network access, Norito encoding, fee quotation, vault
access, signing, and transaction submission stay in Electron.

## Requirements

- Node.js 24 or newer
- The current Iroha checkout at `../iroha` (or another checkout selected with
  `IROHA_JS_SDK_ROOT`, see below)
- Rust and the native build prerequisites required by `@iroha/iroha-js`

The SDK dependency is intentionally local:

```text
@iroha/iroha-js -> ../iroha/javascript/iroha_js
```

There is no cached full-SDK, historical-revision signer, or compatibility
fallback. The wallet checks that the sibling SDK's generated `dist` exactly
matches its current `src`; rebuild it after updating Iroha. The wallet's native
build wrapper rebuilds an outdated native binding before a development build.

## Development

```bash
npm --prefix ../iroha/javascript/iroha_js run build:dist
npm install
npm run dev
```

On macOS, the native build performed by `npm install` or `npm run build`
defaults `MACOSX_DEPLOYMENT_TARGET` to `13.0`. Set it explicitly to use a
different deployment target during development.

Useful verification commands:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

`npm run verify` runs lint, both renderer and Electron typechecks, and the test
suite.

### Selecting the smart-bond SDK runtime

Every build consumer (Vite, Vitest, `tsc`, native staging, the Electron
native loader) resolves the SDK through `scripts/iroha-sdk-compat.mjs`, which
honours one absolute `IROHA_JS_SDK_ROOT`. To run against the SDK being
used for the Palmatrix smart-bond demo on SORA Nexus Taira, select the prepared
`iroha-sdk-poc` runtime checkout. Its source is the signed `bond-poc-sdk` branch;
the runtime checkout remains detached so building does not alter that branch:

```bash
# One-time, in the SDK worktree (writes only gitignored dist/, native/ and
# node_modules/; coordinate with whoever owns that worktree):
cd ../iroha-sdk-poc/javascript/iroha_js
npm ci
npm run build:dist

# In this wallet checkout, for every shell that builds or runs the wallet:
cd ../../../iroha-demo-javascript
export IROHA_JS_SDK_ROOT="$(cd ../iroha-sdk-poc/javascript/iroha_js && pwd)"
node scripts/iroha-sdk-compat.mjs        # activates and verifies the root
node scripts/build-iroha-native.mjs --sdk-root "$IROHA_JS_SDK_ROOT"
npm run dev
```

`build-iroha-native.mjs` builds into a Cargo target outside both checkouts
(`../.iroha-js-native-targets/`), so it does not contend with Cargo builds in
the worktree itself. Unset `IROHA_JS_SDK_ROOT` to return to
`../iroha/javascript/iroha_js`. The wallet requires the current native bridge
(Connect Norito bridge ABI 29, `noritoDecodeInstructionBoxArchive`); an older
`native/iroha_js_host.node` is rejected until it is rebuilt.

## IrohaConnect dApp signing (Palmatrix demo)

A web dApp pairs with the wallet through IrohaConnect and asks it to sign
transactions it submits itself:

1. The dApp creates a session (`createConnectSessionPreview` /
   `registerConnectSession`) and shows the wallet-role URI as a QR code and an
   "Open in wallet" link:
   `iroha://connect?sid=…&network_id=…&app_pk=…&nonce=…&node=…&v=1&role=wallet&token=…&relay=…`.
   The wallet handles that link from the OS (`iroha://` protocol) or a QR scan
   and shows the same approval modal either way.
2. The session's `network_id` must equal the endpoint's pinned NetworkId (see
   Settings). A session may request `sign_transaction` and `sign_raw`
   together; raw signing is limited to the exact requested domain tags.
3. For `SignRequestTx` the dApp sends the unsigned payload bytes from
   `buildTransactionPayload`. The wallet decodes them, checks that the
   authority is the paired account and the payload NetworkId is the
   session's, lists every instruction in a native approval dialog, and signs
   the Iroha payload hash (`HashOf<TransactionPayload>`), which the dApp
   finalizes with the native `finalizeSignedTransaction`.

The live TAIRA relay decodes and re-encodes every plaintext frame. It requires
element-framed `[u8; 32]` values (`frame.sid`, `open.app_pk`,
`approve.wallet_pk`: each byte a u64-length-prefixed element) and an Approve
`sig_wallet` made of a u32 algorithm discriminant plus an element-framed
signature; it closes any socket that sends the older raw arrays. The wallet
emits that layout (pinned by frames captured from the live relay in
`tests/irohaConnectRelayLayout.spec.ts`). The selected `bond-poc-sdk` implements
the same layout directly; no socket adapter is used. The encrypted envelope
layout is unchanged. Readable approvals include settlement movements and every
escrow leg, conditional escrow open/attest/expire, and repo cash principal,
collateral, rate, maturity, and the initiator's early-repayment permission.
`tests/connectTransactionReview.spec.ts` builds those instructions with the SDK
and decodes their real native archives, including four escrow legs and two
issuer bond movements.

The opt-in live test proves pairing and payload-hash signing against Taira. It
creates an ephemeral relay session and finalizes the signature locally without
submitting a transaction:

```bash
LIVE_TAIRA=1 npx vitest run tests/liveTaira.spec.ts
```

For a complete headless rehearsal, first run a local demo server with
`BOND_LEDGER=taira` and finish its setup. Then run:

```bash
LIVE_BOND_CONNECT=1 BOND_DEMO_URL=http://127.0.0.1:18990 \
  npx vitest run tests/liveBondConnect.spec.ts
```

The opt-in harness uses the wallet's production Connect boundary, wire codec,
and transaction review. It pairs via `POST /api/wallet/connect`, keeps a fresh
investor key only in memory, and approves two purchases, a repo, and early
repayment. These are real testnet submissions. It only accepts loopback demo
URLs, disconnects afterwards, and leaves investor signing in `connect` mode.
Supply a local presenter's `BOND_ACCESS_CODE` through the environment if needed;
never put it in a tracked file. `BOND_CONNECT_PAIR_ONLY=1` proves just the
server pairing, while the server may still fund the new wallet. The interactive
wallet continues to require its approval modal and native confirmation dialog.

### Network identity after a TAIRA reset

TAIRA is reset periodically. The wallet derives the NetworkId from
`/v1/accounts/capabilities` and the genesis block. For the official
`https://taira.sora.org` profile (chain `fc56984b-2be7-431d-840e-21514d1883f0`,
prefix `369`), agreeing sources automatically refresh the trusted identity
after a reset. A historical genesis hash does not block fresh writes or
Connect pairing, and no Settings confirmation is needed. Signing and
network-scoped state still use the current NetworkId; conflicting sources,
wrong profiles, and unavailable identity reads remain blocked. Other
endpoints retain explicit confirmation for identity changes. Trusted identities
live in `network-identity-pins.json` under the Electron `userData` directory.

## SCCP operator artifacts (runtime disabled)

The first desktop release does not ship an SCCP route or preload API. The
current sibling SDK does not provide the exact governed first-release
implementation, so exposing bridge reads, proving, signing, or submission
would create an unsafe compatibility path. The /sccp route is therefore absent,
SCCP WalletConnect/runtime configuration is not exposed, and no SCCP payload
can reach a wallet write.

The SCCP source, tests, and operator scripts below are dormant development
artifacts only. They are not imported by either renderer or preload runtime.
They may be used to prepare and independently review exact Solana testnet
governance/deployment material, but they do not enable the desktop bridge.

## Solana testnet SCCP: exact first release

Solana testnet remains fail-closed until the public TAIRA typed registry exposes
the exact bidirectional `taira_sol_xor` revision. The first release has exactly
three distinct Loader-v3 programs: destination bridge, source bridge, and native
BN254 Groth16 verifier. Each reviewed artifact and deployed executable must be
different where its role differs, must be exact SBPF V3 (`ELF e_flags = 3`),
and must use a fresh Program/ProgramData identity. SBPF V0/V1/V2, shared bridge
bytes, mutable programs, local manifests, and unreviewed prover packages cannot
satisfy production completion.

The immutable deployment and initialization order is strict:

1. Build and independently review the three artifacts.
2. Deploy them under fresh Loader-v3 Program IDs.
3. Remove all three upgrade authorities in one atomic three-instruction
   `SetAuthority(None)` transaction.
4. Only then create the classic nine-decimal SPL mint, initialize and seal the
   `SCCPMAT1` verifier material, and initialize both deterministic revision-1
   route-state PDAs.
5. Prepare the exact typed route and current `solana_agave_v1` trust anchor.
6. Submit and enact staged registration through Parliament.
7. Submit and enact the separate staged-to-bidirectional activation.
8. Pass public route, wallet, and independently approved destination/source
   prover readiness.
9. Complete both real transfer directions and derive the final MP4/VTT from the
   independently hash-pinned screen capture.

Build the three signer-free SBPF V3 artifacts with the repository wrapper:

```bash
npm run sccp:solana:build-program
```

Do not replace this with a raw Cargo/Agave invocation that may create a signer
file. The local SBF runtime checks are useful test evidence, but they are not
cluster deployment evidence.

### Fresh immutable deployment

The production operator is one continuous, signer-file-free ceremony. First
capture and independently hash a bounded canonical Solana-testnet context:

```bash
npm run sccp:solana:fresh-deploy -- snapshot-context \
  --solana-rpc-url https://api.testnet.solana.com \
  --valid-for-slots 1500 \
  --out output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-context.json
```

Then start the ceremony with independently reviewed hashes for the context,
all three exact SBPF V3 artifacts, all three authenticated SBF validation
evidence files, and the release validator binary:

```bash
npm run sccp:solana:fresh-deploy -- ceremony \
  --solana-rpc-url https://api.testnet.solana.com \
  --context output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-context.json \
  --expected-context-sha256 0x<reviewed-context-sha256> \
  --native-verifier-artifact output/sccp-solana-program-artifacts/native-verifier/sccp_native_recursive_verifier.so \
  --native-verifier-artifact-sha256 0x<reviewed-native-verifier-artifact-sha256> \
  --destination-artifact output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so \
  --destination-artifact-sha256 0x<reviewed-destination-artifact-sha256> \
  --source-artifact output/sccp-solana-program-artifacts/source/sccp_taira_xor_source.so \
  --source-artifact-sha256 0x<reviewed-source-artifact-sha256> \
  --native-verifier-sbf-evidence output/sccp-solana-deploy/native-verifier-sbf-evidence.json \
  --native-verifier-sbf-evidence-sha256 0x<reviewed-native-verifier-evidence-sha256> \
  --destination-sbf-evidence output/sccp-solana-deploy/destination-sbf-evidence.json \
  --destination-sbf-evidence-sha256 0x<reviewed-destination-evidence-sha256> \
  --source-sbf-evidence output/sccp-solana-deploy/source-sbf-evidence.json \
  --source-sbf-evidence-sha256 0x<reviewed-source-evidence-sha256> \
  --expected-validator-sha256 0x<reviewed-validator-binary-sha256> \
  --plan output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-plan.json \
  --confirmation-template output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-confirmation.template.json \
  --confirmation output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-confirmation.json \
  --confirmation-sha256-file output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-confirmation.sha256 \
  --journal output/sccp-solana-deploy/taira-solana-xor-fresh-deploy.journal.jsonl \
  --report output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-report.json \
  --review-timeout-ms 900000 \
  --submit true
```

The live process validates every public input and authenticated validator result
before generating exactly eight OS-CSPRNG signers in memory. It exclusively
writes and fsyncs the public plan and a non-submitting confirmation template,
then prints the new payer address. During the bounded wait, fund only that payer
and independently review the exact plan. Write a separate canonical
confirmation with `submit`, both irreversible acknowledgements, and the exact
program IDs set to the reviewed values; write its exact lowercase `0x` SHA-256
as the sole line of the `.sha256` sidecar. The same process reopens both stable
files, rechecks the live slot window, deploys each mutation once, records every
intent and resolution in the durable public journal, performs the one atomic
three-instruction authority revocation, writes the canonical report, and
zeroizes all signer buffers. A timeout, signal before mutation, path race,
ambiguous transaction, or post-claim failure never retries automatically.
The retained `.journal.jsonl.lock` has separate context-claim and plan-bound
records so manual recovery identifies the exact operation and plan. If a
post-claim failure occurs, preserve that lease, the journal, and any retained
`${report}.staging` file as recovery evidence; do not remove them or rerun the
ceremony until the submitted signatures and on-chain program state have been
reconciled independently.

That report must prove fresh program creation, exact deployed bytes and
ProgramData deployment slots, and one atomic finalization transaction in
destination/source/native-verifier order. ProgramData byte 12 is the
authoritative upgrade-authority option tag and must be zero after finalization;
residual bytes 13 through 45 are evidence, not an additional zero requirement.
No mint, verifier material, or route-state account may predate this immutable
finalization.

### Exact post-immutability initialization

Independently review and byte-pin the exact initializer input and fresh-deploy
report, then run:

```bash
npm run sccp:solana:exact-initialize -- \
  --input output/sccp-solana-deploy/taira-solana-xor-exact-initializer-input.json \
  --expected-input-sha256 0x<reviewed-initializer-input-sha256> \
  --fresh-deploy-report output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-report.json \
  --expected-fresh-deploy-report-sha256 0x<reviewed-fresh-deploy-report-sha256> \
  --journal output/sccp-solana-deploy/taira-solana-xor-exact-initialization.journal.jsonl \
  --evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --submit true
```

Inject the payer and preselected mint signers from the runtime secret manager
through the default signer environment variables, or select different
environment-variable names with `--payer-env` and `--mint-env`. Never put
secret bytes in command arguments, shell history, JSON input, journals, or
reports. The initializer verifies the pinned fresh-deploy report before signer
access, derives every hash/PDA from the preselected mint and governed
destination material, zeroizes signer buffers, and writes canonical ordered
evidence only after finalized transaction and account readback.

### Typed route and Parliament governance

Prepare and independently byte-pin the small TAIRA-local policy/settlement
artifact. Its schema is `iroha-sccp-solana-route-policy-settlement/v1`; it
contains only the exact SORA outbound execution policy and settlement fields.
The settlement is fixed to asset definition `6TEAJqbb8oEPmLncoNiMRbLEK6tw`,
scale `9`, and a canonical network-prefix-`369` `testu...` custody account.
The canonical JSON shape is:

```json
{
  "schema": "iroha-sccp-solana-route-policy-settlement/v1",
  "settlement": {
    "asset_definition_id": "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    "custody_account_id": "<canonical-testu-custody-account>",
    "payload_amount_scale": 9
  },
  "sora_outbound_execution_policy": {
    "version": 1,
    "semantics": "ivm_proved_record_sccp_message_v1",
    "contract_artifact_sha256": "<REVIEWED-UPPERCASE-32-BYTE-HEX>",
    "vk_ref": {
      "backend": "<reviewed-portable-backend-reference>",
      "name": "<reviewed-portable-vk-reference>",
      "version": 1,
      "commitment": "<REVIEWED-UPPERCASE-32-BYTE-HEX>"
    },
    "gas_limit": 50000000
  }
}
```

Replace every placeholder with separately reviewed material; placeholder bytes
and settlement aliases are rejected. Then derive the route without credentials:

```bash
npm run sccp:solana:governed-route -- \
  --initializer-input output/sccp-solana-deploy/taira-solana-xor-exact-initializer-input.json \
  --expected-initializer-input-sha256 0x<reviewed-initializer-input-sha256> \
  --fresh-deploy-report output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-report.json \
  --expected-fresh-deploy-report-sha256 0x<reviewed-fresh-deploy-report-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --expected-ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --taira-policy-settlement output/sccp-solana-deploy/taira-solana-xor-taira-policy-settlement.json \
  --expected-taira-policy-settlement-sha256 0x<reviewed-policy-settlement-sha256> \
  --out output/sccp-solana-deploy/taira-solana-xor-governed-route.json
```

The builder revalidates all four exact byte pins and their cross-bindings. It
derives the mint, three fresh program IDs, ProgramData addresses and deployment
slots, route-state PDAs, code/configuration hashes, and source identity directly
from deployment and initialization evidence; none can be manually transcribed
or overridden. Independently review its canonical route output and the current
native trust anchor before building the Parliament plan. A local route manifest
or renderer-supplied bytecode, verifier key, gas setting, or settlement alias is
not a substitute.

The deterministic plan builder is credential-free:

```bash
npm run sccp:solana:governance-plan -- \
  --route output/sccp-solana-deploy/taira-solana-xor-governed-route.json \
  --expected-route-sha256 0x<reviewed-route-sha256> \
  --native-trust-anchor output/sccp-solana-deploy/taira-solana-xor-native-trust-anchor.json \
  --expected-native-trust-anchor-sha256 0x<reviewed-native-trust-anchor-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --expected-ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --out output/sccp-solana-deploy/taira-solana-xor-governance-plan.json
```

Submit registration first, retaining the exact result bytes:

```bash
npm run sccp:solana:governance -- \
  --plan output/sccp-solana-deploy/taira-solana-xor-governance-plan.json \
  --expected-plan-sha256 0x<reviewed-governance-plan-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --expected-ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --phase register \
  --submit true \
  --authority <canonical-testu-proposer> \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --out output/sccp-solana-deploy/taira-solana-xor-governance-register.json
```

The governance signing key must be injected only at runtime through the
configured secret environment variable; never include its value in a command or
artifact. The submitted transaction proposes registration but does not enact
it. Parliament must enact that proposal, after which a fresh public typed
registry read must show the exact revision in `staged` state.

Only after that readback, submit the distinct activation proposal:

```bash
npm run sccp:solana:governance -- \
  --plan output/sccp-solana-deploy/taira-solana-xor-governance-plan.json \
  --expected-plan-sha256 0x<reviewed-governance-plan-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --expected-ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --phase activate \
  --submit true \
  --authority <canonical-testu-proposer> \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --out output/sccp-solana-deploy/taira-solana-xor-governance-activate.json
```

Retain both submitted proposal receipts; an already-enacted observation cannot
replace their transaction provenance. Parliament must enact activation
separately. Production truth is the fresh public typed-registry readback of the
exact `bidirectional` revision, plus committed/finalized readback of both
different proposal transactions.

### Public readiness and real transfer media

Run the read-only public route preflight against an explicit canonical TAIRA
validator root:

```bash
npm run e2e:sccp:solana-preflight -- \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --skip-solana-rpc false
```

The preflight uses the typed registry as public truth, rederives the governed
destination/source identities and hashes, and compares all three immutable
ProgramData accounts and deployment slots with live Solana testnet readback.
The TAIRA-origin path must obtain the exact governed IVM bytes and policy from
`/v1/sccp/routes/{source_profile}/{route_id}/{asset_key}/{revision}/sora-outbound-material`;
no fallback material is accepted.

Before approving the prover packages or recording any media, create the
canonical capture-review policy at
`output/sccp-solana-deploy/taira-solana-xor-capture-review-policy.json`.
Its reviewers are public Ed25519 identities, not wallet or deployment keys:

```json
{
  "schema": "iroha-demo-sccp-solana-live-capture-review-policy/v1",
  "routeId": "taira_sol_xor",
  "assetKey": "xor",
  "routeRevision": 1,
  "policyNonce": "0x<non-zero-32-byte-random-nonce>",
  "algorithm": "ed25519",
  "threshold": 2,
  "requiredClaims": {
    "captureBytesIndependentlyPinned": true,
    "continuousBidirectionalUiFlowReviewed": true,
    "publicRegistryRevisionVisible": true,
    "tairaToSolanaReceiptsVisible": true,
    "solanaToTairaReceiptsVisible": true,
    "unrelatedMediaAbsent": true,
    "qrOverlayOnly": false
  },
  "markerIds": [
    "public-registry",
    "taira-to-solana",
    "solana-to-taira",
    "completed-readback"
  ],
  "reviewers": [
    {
      "reviewerId": "reviewer-1",
      "publicKeySpkiDerBase64": "<canonical-44-byte-ed25519-spki-der-base64>",
      "publicKeySpkiSha256": "0x<sha256-of-exact-spki-der>"
    },
    {
      "reviewerId": "reviewer-2",
      "publicKeySpkiDerBase64": "<canonical-44-byte-ed25519-spki-der-base64>",
      "publicKeySpkiSha256": "0x<sha256-of-exact-spki-der>"
    }
  ]
}
```

Replace the example threshold and reviewers with the approved set, keep
reviewers uniquely sorted by `reviewerId`, and serialize the policy as compact
canonical SCCP JSON. Independently hash those exact bytes. Only then issue the
`iroha-sccp-solana-production-prover-approval/v2` descriptor: its
`pins.captureReviewPolicySha256` must equal that policy hash. Approval v1 is not
valid for production, and neither a policy nor its hash may be substituted
after recording.

With separately reviewed real destination and source prover packages installed,
run the app readiness gate:

```bash
npm run e2e:sccp:solana-smoke-readiness -- \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --walletconnect-project-id <walletconnect-project-id> \
  --destination-prover-module-url /sccp-solana/taira-solana-xor-destination-prover.js \
  --source-prover-module-url /sccp-solana/taira-solana-xor-source-prover.js \
  --prover-governance-approval output/sccp-solana-deploy/taira-solana-xor-prover-approval.json \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256> \
  --skip-solana-rpc false
```

Before recording, run the production gate with the pinned governance plan,
fresh Loader-v3 deployment report, registration result, activation result,
ordered-initialization evidence, smoke report, and prover approval:

```bash
npm run e2e:sccp:solana-production-gate -- \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --fresh-deploy-report output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-report.json \
  --fresh-deploy-report-sha256 0x<reviewed-fresh-deploy-report-sha256> \
  --governance-plan output/sccp-solana-deploy/taira-solana-xor-governance-plan.json \
  --governance-plan-sha256 0x<reviewed-governance-plan-sha256> \
  --governance-register-result output/sccp-solana-deploy/taira-solana-xor-governance-register.json \
  --governance-register-result-sha256 0x<reviewed-registration-result-sha256> \
  --governance-activate-result output/sccp-solana-deploy/taira-solana-xor-governance-activate.json \
  --governance-activate-result-sha256 0x<reviewed-activation-result-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --smoke-readiness output/sccp-solana-smoke-readiness/latest.json \
  --prover-governance-approval output/sccp-solana-deploy/taira-solana-xor-prover-approval.json \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256> \
  --capture-review-policy output/sccp-solana-deploy/taira-solana-xor-capture-review-policy.json \
  --capture-review-policy-sha256 0x<reviewed-capture-review-policy-sha256> \
  --allow-incomplete true \
  --skip-solana-rpc false
```

During this pre-live pass, `--allow-incomplete true` is acceptable only for the
missing media. Review the report to ensure every non-media check passes, then
independently pin its exact bytes and `preLiveInputSnapshot`.

Create the non-secret live-evidence template:

```bash
npm run e2e:sccp:solana-live-evidence-template
```

Then use the app to complete a real wallet-approved TAIRA-to-Solana transfer and
a real wallet-approved Solana-to-TAIRA transfer. Replace every template
placeholder with committed/finalized transaction, message, proof, balance-delta,
and registry evidence. Generate the signer-free visual witness kit from those
exact receipts and the pinned pre-live snapshot:

```bash
npm run e2e:sccp:solana-video -- \
  --write-live-capture-witness-kit output/sccp-solana-live-video/witness-kit \
  --live-evidence <completed-solana-bidirectional-live-evidence.json> \
  --production-gate-snapshot output/sccp-solana-production-gate/sccp-solana-production-gate.json \
  --production-gate-snapshot-sha256 0x<reviewed-pre-live-gate-sha256> \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256>
```

Record a continuous walkthrough of the genuine completed UI receipts and public
registry, then show the kit's four QR cards in order for at least one second
each. The kit never opens, overlays, or modifies the capture. Independently
hash-pin that original capture. Note the center time of each QR dwell and create
a review request; the scanner verifies each exact payload at center ±250 ms and
pins the four normalized center frames:

```bash
npm run e2e:sccp:solana-video -- \
  --write-live-capture-witness-review-request output/sccp-solana-live-video/capture-witness-review-request.json \
  --live-capture-marker-times-ms <registry-ms>,<forward-ms>,<reverse-ms>,<complete-ms> \
  --live-capture-video <real-bidirectional-screen-recording.mp4> \
  --live-capture-video-sha256 0x<reviewed-original-capture-sha256> \
  --live-evidence <completed-solana-bidirectional-live-evidence.json> \
  --production-gate-snapshot output/sccp-solana-production-gate/sccp-solana-production-gate.json \
  --production-gate-snapshot-sha256 0x<reviewed-pre-live-gate-sha256> \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256>
```

Each authorized reviewer must inspect the exact pinned capture, confirm the
continuous bidirectional UI flow and human-visible registry/receipt evidence,
and reject unrelated or QR-overlay-only footage. Save the request's
`candidateWitness` as a standalone compact canonical JSON object only after
setting the six positive review fields to `true` and `qrOverlayOnly` to
`false`, then independently hash-pin those exact witness bytes.

Before any external signature is produced, emit the deterministic signer-free
package for that exact witness. This command accepts no reviewer private key;
it outputs the domain bytes, canonical signed-payload JSON, full payload bytes,
and payload SHA-256 that external Ed25519 tooling must sign:

```bash
npm run e2e:sccp:solana-video -- \
  --write-live-capture-review-signing-package output/sccp-solana-live-video/capture-review-signing-package.json \
  --live-capture-witness <reviewed-live-capture-witness.json> \
  --live-capture-witness-sha256 0x<reviewed-witness-sha256>
```

Reviewers sign outside this repository. The detached attestation uses schema
`iroha-demo-sccp-solana-live-capture-review-attestation/v1` and contains the
exact reconstructed `signedPayload` plus uniquely reviewer-ID-sorted Ed25519
signatures. Each signature covers the UTF-8 domain
`iroha-demo:sccp-solana:live-capture-review:v1\0` followed by compact canonical
JSON for the signed payload. That payload binds the route, revision, exact
witness artifact hash, original capture hash, evidence binding, pre-live
snapshot, review policy, every review claim, and every ordered marker time and
frame hash. Obtain the policy threshold from distinct approved reviewer keys,
then independently hash-pin the canonical detached-attestation bytes. Never
provide reviewer private keys to this repository or add a local signing helper.

Run the media gate with all three independently pinned review artifacts:

```bash
npm run e2e:sccp:solana-video -- \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --live-evidence <completed-solana-bidirectional-live-evidence.json> \
  --production-gate-snapshot output/sccp-solana-production-gate/sccp-solana-production-gate.json \
  --production-gate-snapshot-sha256 0x<reviewed-pre-live-gate-sha256> \
  --live-capture-video <real-bidirectional-screen-recording.mp4> \
  --live-capture-video-sha256 0x<reviewed-original-capture-sha256> \
  --live-capture-witness <reviewed-live-capture-witness.json> \
  --live-capture-witness-sha256 0x<reviewed-witness-sha256> \
  --live-capture-review-attestation <detached-live-capture-review-attestation.json> \
  --live-capture-review-attestation-sha256 0x<reviewed-attestation-sha256> \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256> \
  --skip-solana-rpc false
```

A successful run writes:

- `output/sccp-solana-live-video/sccp-solana-live-video.mp4`
- `output/sccp-solana-live-video/sccp-solana-live-video.vtt`
- `output/sccp-solana-live-video/sccp-solana-live-video.json`

The success MP4 must be derived from the independently pinned real capture,
contain changing visible frames and non-silent audio, decode all four ordered
registry/receipt witness payloads throughout their dwell windows, use H.264/AAC,
and embed the exact explanatory VTT. The production gate independently reopens
and hashes the original capture, verifies the detached signatures, decodes the
same witness frames again from the final MP4, and compares the full decoded
video and audio essence, exact per-stream timelines, duration, dimensions, and
sample sequences of source and derived media. The raw source must contain
exactly one H.264 video and one AAC audio stream with no extras; the final MP4
must add exactly one `mov_text` subtitle stream and no other streams. Both files
are limited to 2 GiB and 40–3,600 seconds; the exact VTT is limited to 4 MiB.

Rerun the production gate without `--allow-incomplete`, supplying the original
capture and every review artifact independently rather than trusting paths or
hashes copied from the generated transcript:

```bash
npm run e2e:sccp:solana-production-gate -- \
  --torii-url https://taira-validator-1.sora.org \
  --solana-rpc-url https://api.testnet.solana.com \
  --fresh-deploy-report output/sccp-solana-deploy/taira-solana-xor-fresh-deploy-report.json \
  --fresh-deploy-report-sha256 0x<reviewed-fresh-deploy-report-sha256> \
  --governance-plan output/sccp-solana-deploy/taira-solana-xor-governance-plan.json \
  --governance-plan-sha256 0x<reviewed-governance-plan-sha256> \
  --governance-register-result output/sccp-solana-deploy/taira-solana-xor-governance-register.json \
  --governance-register-result-sha256 0x<reviewed-registration-result-sha256> \
  --governance-activate-result output/sccp-solana-deploy/taira-solana-xor-governance-activate.json \
  --governance-activate-result-sha256 0x<reviewed-activation-result-sha256> \
  --ordered-initialization-evidence output/sccp-solana-deploy/taira-solana-xor-ordered-initialization-evidence.json \
  --ordered-initialization-evidence-sha256 0x<reviewed-ordered-initialization-sha256> \
  --smoke-readiness output/sccp-solana-smoke-readiness/latest.json \
  --prover-governance-approval output/sccp-solana-deploy/taira-solana-xor-prover-approval.json \
  --prover-governance-approval-sha256 0x<reviewed-prover-approval-sha256> \
  --capture-review-policy output/sccp-solana-deploy/taira-solana-xor-capture-review-policy.json \
  --capture-review-policy-sha256 0x<reviewed-capture-review-policy-sha256> \
  --expected-pre-live-input-snapshot-sha256 0x<reviewed-pre-live-input-snapshot-sha256> \
  --live-capture-video <real-bidirectional-screen-recording.mp4> \
  --live-capture-video-sha256 0x<reviewed-original-capture-sha256> \
  --live-capture-witness <reviewed-live-capture-witness.json> \
  --live-capture-witness-sha256 0x<reviewed-witness-sha256> \
  --live-capture-review-attestation <detached-live-capture-review-attestation.json> \
  --live-capture-review-attestation-sha256 0x<reviewed-attestation-sha256> \
  --live-video-transcript output/sccp-solana-live-video/sccp-solana-live-video.json \
  --live-video-mp4 output/sccp-solana-live-video/sccp-solana-live-video.mp4 \
  --live-video-vtt output/sccp-solana-live-video/sccp-solana-live-video.vtt \
  --skip-solana-rpc false
```

`sccp:solana:finish-production` is also a read-only audit and accepts only
`--submit false`; it cannot deploy programs, initialize accounts, enact
Parliament proposals, or manufacture missing live evidence. When using that
wrapper, pass the exact `--fresh-deploy-report{,-sha256}` pair and, when an
independently reviewed pre-live input snapshot is available,
`--expected-pre-live-input-snapshot-sha256`. Also pass the same
`--capture-review-policy{,-sha256}`,
`--live-capture-video{,-sha256}`, `--live-capture-witness{,-sha256}`, and
`--live-capture-review-attestation{,-sha256}` pairs; it forwards them to the
pre-live and final production gates without deriving any independent hash from
another artifact.

When a rollout prerequisite is absent, `--allow-incomplete true` may be used
only to write a blocked report. A blocked transcript, VTT, or generated
diagnostic MP4 is marked `diagnosticOnly`,
`notLiveTransferEvidence`, and `productionReady: false`; it is not the
requested transfer video and can never satisfy production completion. Local
runtime checks, refresh reports, and synthetic solid-color or silent media are
diagnostics only.

## Governance workspace

The `/governance` route is a live, ledger-backed Parliament workspace. It
supports:

- fail-closed `/v1/gov/capabilities` validation for the exact Taira chain
  `fc56984b-2be7-431d-840e-21514d1883f0`, network prefix `369`, ABI `1`, and
  data model `4`;
- typed validation-fee list/detail reads with exact-ID deep links;
- exact inspection of the ten-body timed-OVN Parliament capability contract;
- validation-fee lifecycle, certificate, and finalized-evidence inspection;
- reviewed citizenship registration through the Core citizen-draft route;
- retail validation-fee policy revisions (the exact native 14-field policy:
  monthly allowance schedule, Honiara month-start activation with thirty days
  of notice, and the immutable reward custody);
- quote, review, vault-backed signing, and commit in separate prepare/confirm
  phases. A Torii draft instruction is admitted only when its concrete
  instruction frame is byte-identical to the native encoding of the exact
  reviewed instruction.

Conversion-and-reward payout-lifecycle proposals (the exact native 20-field
binding) are inspect-only: the reviewed Iroha SDK has no native JSON codec for
`ProposeValidationFeePayoutLifecycle`, so the wallet cannot decode that draft
for review and does not draft or sign it.

The wallet exposes no ballot, Parliament ceremony/transition, or enactment
control. Standalone PLAIN/ZK and timed-OVN routes required by the capability
contract remain server capabilities, not callable renderer or preload APIs.
Unsupported proposal kinds are inspect-only and there is no fallback ballot
or signing path.

Governance transactions never accept private keys from renderer or HTTP
fields. The explicit **Decode and quote** action permits Electron to resolve
the vault key only to authenticate the exact draft and fee-quote requests; it
cannot sign or submit the transaction. The separate **Sign and commit** action
revalidates the capability contract, account, and signing algorithm before
resolving the key again and signing the already-reviewed payload. There is no
manual finalize action, ballot action, enactment action, historical signer, or
signed-policy fallback.

## Validation-fee trust boundary

Validation-fee policy state is fail-closed. The wallet does not trust a server
boolean, one endpoint in isolation, or a value copied from proposal state.
Policy fields remain unavailable unless the Electron host receives the exact
generated enabled config:

```json
{
  "enabled": true,
  "ledgerBinding": {
    "schema": "cbsi.mobile-validation-fee-ledger-binding.v2",
    "networkId": "hash:...#....",
    "genesisHash": "...",
    "policyChainGenesisHash": "...",
    "checkpoint": {
      "height": 1,
      "contextId": "...",
      "canonicalBase64": "..."
    }
  },
  "expected": {
    "rewardCustody": {
      "contractAddress": "irohac1...",
      "treasuryAccountId": "testu...",
      "xorAssetDefinitionId": "...",
      "rewardPoolAccountId": "testu...",
      "validatorLaneId": 0
    }
  }
}
```

`ledgerBinding` is the exact CBSI Core `ValidationFeeLedgerBindingV2` emitted
by Core's `validation_fee_parliament_evidence_verify`: `networkId` must be the
canonical checksummed NetworkId derived from `genesisHash`, and
`checkpoint.canonicalBase64` carries the Core-verified native finality
checkpoint. The wallet exports no native checkpoint verifier, so it checks
only canonical standard Base64 within the native 68 MiB checkpoint bound and
accepts Core projections whose network, genesis, policy-chain, and checkpoint
coordinates equal the binding exactly. The config and runtime manifest size
limits leave room for a checkpoint of that size.

`expected` pins only the immutable reward custody. Fee amounts, retail
schedules, activation months, and Parliament authorities are governed
revisions and are verified structurally, never pinned.

For normal packaged launches, install that exact generated object in the
versioned runtime manifest at:

```text
<Electron app.getPath("userData")>/governance-runtime.json
```

The manifest shape is exact:

```json
{
  "schema": "sora.wallet.governance-runtime.v1",
  "validationFee": {
    "enabled": true,
    "ledgerBinding": {
      "schema": "cbsi.mobile-validation-fee-ledger-binding.v2",
      "networkId": "hash:...#....",
      "genesisHash": "...",
      "policyChainGenesisHash": "...",
      "checkpoint": {
        "height": 1,
        "contextId": "...",
        "canonicalBase64": "..."
      }
    },
    "expected": {
      "rewardCustody": { "...": "immutable reward custody" }
    }
  },
  "cbsiCoreApiBaseUrl": "https://cbsi-core.soramitsu.io"
}
```

Provision the file with an atomic replacement before launching the packaged
app from Finder, the Start menu, or a desktop entry. Electron's `userData`
directory is normally under `~/Library/Application Support` on macOS,
`%APPDATA%` on Windows, and `~/.config` on Linux. The privileged main process
reads the file again for every validation-fee policy refresh, so deleting,
truncating, or replacing it with invalid data immediately fails closed instead
of serving stale policy state.

For managed or diagnostic launches, `GOVERNANCE_VALIDATION_FEE_CONFIG_JSON`
and `CBSI_CORE_API_BASE_URL` remain an all-or-nothing environment override. If
either variable is present, both are required and the file is not used; an
empty, partial, or malformed override fails closed. Unknown fields are rejected
at every manifest, config, and projection level.

The host concurrently reads Core's raw `/v1/validation-fee/policy` projection
and `/v1/validation-fee/status` (`cbsi.validation-fee-ledger-projection.v1`:
the governed monthly-allowance policy, its Parliament certificate authority,
the conversion policy with its 20-field binding, and ledger finality), requires
the status wrapper to contain the exact same projection, re-checks Core's
policy, reward-custody, conversion, certificate-binding, activation-time, and
finality invariants, matches the runtime ledger binding and reward custody, and
rejects rollback or same-coordinate equivocation. Any failed read clears the
renderer state; no stale cached policy is served. The effective policy is
mapped onto the exact native `ValidationFeePolicyV1` JSON so the next revision
extends the verified registry head; while a scheduled revision is pending the
head carries no version and composition is blocked.

Governance proposal lifecycle, certificate, and finalized evidence use only
the strict typed validation-fee proposal-detail response and canonical
decimal-string fields. No generic tally, lock, referendum, ballot, or enactment
bridge helper is part of the first-release API.

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

Every installer-producing command first verifies the exact reviewed Iroha SDK
release source and native provenance. `npm run build` is the local development
build; there is intentionally no ungated development-installer command.
GitHub release jobs import the reviewed public OpenPGP key into an isolated
keyring, run `install:release`, and make Vite/native staging use that same
verified physical SDK package.

See [RELEASE.md](RELEASE.md) for signing variables and the tag-based release
workflow.
