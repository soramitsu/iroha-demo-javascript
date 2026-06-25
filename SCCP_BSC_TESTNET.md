# SCCP BSC Rollout

This app now exposes BSC testnet and BSC mainnet SCCP route profiles for
`taira_bsc_xor`. The local app and sibling `../iroha` SDK/tooling paths
understand profile-specific BSC chain ids, network ids, explorer hosts, native
EVM prover bundles, and proof bindings. The BSC testnet contracts are deployed
from the diagnostic rollout, and the latest public TAIRA preflight now finds a
matching `taira_bsc_xor` testnet manifest with live BSC contract readback.
The current public testnet manifest publishes production-shaped verifier,
proof, proving-key, destination-binding, and post-deploy evidence hashes, but
still omits the SDK-valid native EVM prover bundle hash and destination/source
browser prover references required before live transfers can run. Public TAIRA
does not yet advertise the BSC mainnet route manifest. Hardened readiness
checks intentionally keep both profiles disabled for production execution until
SDK-valid native EVM prover bundles, route-bound browser prover modules, clean
production route artifacts, and live UI proof evidence are available.

## Current Gate Snapshot

As of 2026-06-25T11:13:28.012Z,
`output/sccp-bsc-production-gate-current/latest.json` reports `ready: false`.
The refreshed public route preflight
(`output/sccp-bsc-preflight-current/latest.json`) passes route discovery, SCCP
submit paths, post-deploy live evidence, production verifier/prover hash
checks, and BSC contract readback. It fails closed only on the missing
`nativeEvmProverBundleHash`, missing SDK-valid native EVM prover bundle, and
missing destination/source browser prover references. The smoke-readiness
report (`output/sccp-bsc-smoke-readiness-current/latest.json`) is now aligned
with the on-chain route-manifest model: peer config audit passes when no local
BSC route/prover overrides are present, while readiness still fails because the
public route is not ready and WalletConnect plus destination/source prover
module URLs are not configured. The refreshed production material inventory
(`output/sccp-bsc-material-inventory-current/latest.json`) is bound to the
current public BSC testnet deployment, passes the secret/diagnostic artifact
scan, and fails only on missing production artifacts.

Remaining blockers:

- public TAIRA route preflight finds the BSC testnet manifest and confirms live
  BSC contract readback, but the route is not production-ready until it
  publishes the route-bound native EVM prover bundle hash and both browser
  prover references;
- no clean production-ready route artifact, offline full-TOML evidence,
  route-referenced TAIRA burn-record material, production Groth16 material
  manifest, attestation request/handoff, proof self-test report, `.r1cs`,
  `.zkey`, or SDK-validated native EVM prover bundle is present locally;
- the checked-in BSC browser prover loader hashes correctly, but no
  route-bound production prover manifest is checked in yet; destination/source
  sidecars must be generated from a ready public route report and no runtime
  prover config exists;
- WalletConnect and BSC destination/source browser prover module URLs are not
  configured for live smoke; and
- the live UI video proof for TAIRA -> BSC -> TAIRA is not recorded.

The current blocker is not verifier redeployment. Do not replace the deployed
BSC verifier unless live readback or verifier-key evidence changes. The next
operator path is to generate SDK-valid native prover material, generate
route-bound browser sidecars from a ready public route report, publish the
production route manifest through the on-chain route-manifest path, and rerun
the read-only gates:

```sh
npm run e2e:sccp:bsc-material-inventory -- --bsc-network testnet
npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet
npm run e2e:sccp:bsc-production-gate -- --bsc-network testnet
```

After the missing production material exists, the route manifest generator must
receive the native EVM prover bundle and both browser prover sidecars before
`--production-ready true` is allowed:

```sh
node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest \
  --bsc-network testnet \
  --evidence <testnet-deployment-evidence.json> \
  --taira-contract <taira-burn-record.contract.json> \
  --settlement-asset-definition-id <canonical-asset-definition-id> \
  --proof-artifact-hash <0x...> \
  --proving-key-hash <0x...> \
  --native-prover-bundle <native-evm-prover-bundle.json> \
  --destination-browser-prover-manifest <destination-browser-prover-manifest.json> \
  --source-browser-prover-manifest <source-browser-prover-manifest.json> \
  --offline-full-toml-evidence <offline-full-toml-evidence.json> \
  --production-ready true \
  --live-readback-checked true \
  --confirm-testnet taira_bsc_xor \
  --out <production-route.manifest.json>
```

## Current Status

As of 2026-06-21, the app-side BSC testnet/mainnet surface, read-only preflight,
sibling contract chain-id guard, JS SDK facade, deployment-evidence helpers,
source bridge evidence helper, canonical BSC route-config generator,
production-ready route manifest validation, and release-bundle profile checks
are implemented. Public TAIRA now returns a matching BSC testnet
`taira_bsc_xor` / `xor` manifest from the live manifest endpoint, and live BSC
contract readback passes for the deployed testnet contracts. The BSC mainnet
route is not public yet.

Profile selection is explicit everywhere:

- Testnet: `--bsc-network testnet`, `SCCP_BSC_NETWORK=testnet`, or
  `VITE_SCCP_BSC_NETWORK=testnet`; BSC chain id `0x61`, network id
  `0x0000000000000000000000000000000000000000000000000000000000000061`,
  explorer host `testnet.bscscan.com`.
- Mainnet: `--bsc-network mainnet`, `SCCP_BSC_NETWORK=mainnet`, or
  `VITE_SCCP_BSC_NETWORK=mainnet`; BSC chain id `0x38`, network id
  `0x0000000000000000000000000000000000000000000000000000000000000038`,
  explorer host `bscscan.com`.

Cross-profile evidence is rejected. A testnet route report, BscScan testnet
link, runtime config, browser sidecar, native prover bundle, or video proof
transcript cannot satisfy a mainnet gate, and mainnet evidence cannot satisfy a
testnet gate.

Production readiness is currently blocked by the diagnostic BSC verifier key
hash
`0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4`.
The route-manifest generator now refuses to emit `productionReady: true` for
that material, the public preflight reports `bsc-production-verifier-material`
as failed, and the renderer readiness path surfaces the same diagnostic reason
before enabling bridge actions.

Public TAIRA has also been updated so the advertised `taira_bsc_xor` manifest
now carries `production_ready = false` with disabled reason
`BSC verifier material is diagnostic and must be replaced before production readiness.`
The four peer config backups from that remote change use suffix
`.bak-bsc-diagnostic-disabled-20260606T083812Z`, and the peers were restarted
with the existing
`irohad.sccp-nile-20260604T014041Z-native-finalize-mint-zeroarg` binary.

BSC testnet contracts are deployed and live readback passes:

- Verifier: `0x109197a81221db7bb79e5763e4a6319af9e4e6d6`
- Source bridge: `0xc54750cf75e6eeb19770cdcdfe6e134ac9525ec5`
- TairaXOR token: `0x02ef3c154964890f57ba37db2027a4ab855109cd`
- Route bridge: `0xa3cebb2c206939f7fc740ec73bbf59c87dbe21de`
- Destination binding hash:
  `0x9be4e84ab3cc24c6411938ca5babe375100edfa84c10d20672e60c4cf63dbf7b`

Live BSC canary evidence:

- TAIRA-style BSC finalize/mint canary:
  `https://testnet.bscscan.com/tx/0x9a8a5ad1a617395725c2222e33f1490fa84fc7e5009353dca8f9f589286e8d22`
- BSC-origin burn/source-event canary:
  `https://testnet.bscscan.com/tx/0x596885f5c3f41e460a63aa299f7badc78f0d6f088d6a3ee9efbdc2292664f34c`

Generated operator artifacts from the diagnostic rollout:

- Quarantined legacy route manifest generated before the diagnostic verifier
  gate:
  `output/sccp-bsc-deploy/quarantine-diagnostic-production-ready-20260610T1153Z/taira-bsc-xor-route.manifest.production-ready.json`
  - SHA-256:
    `677ec3423706ba7c5b3055e5a36128108311afaa3f7aebbe991d4c7bb29c333b`
- Quarantined legacy TAIRA config overlay generated before the diagnostic
  verifier gate:
  `output/sccp-bsc-deploy/quarantine-diagnostic-production-ready-20260610T1153Z/taira-bsc-xor-route.production-ready.torii.toml`
  - SHA-256:
    `ff0e3493fc99b4990df3701e5eb114eb37bdeb3d7db91b23bcf53cffdfc35697`
- Quarantined legacy merged TAIRA config dry-run generated before the
  diagnostic verifier gate:
  `output/sccp-bsc-deploy/quarantine-diagnostic-production-ready-20260610T1153Z/taira-bsc-xor-route.production-ready.full-taira-config.toml`
  - SHA-256:
    `97123937f7cfb9a30ee362c8e53543ee7933c5bc90794b3ebff971b8b2ad6ae8`
- Quarantined legacy remote-compat overlay with TRON-named aliases:
  `output/sccp-bsc-deploy/quarantine-legacy-alias-20260610T1305Z/taira-bsc-xor-route.remote-compat.toml`
  - SHA-256:
    `3124f2e72f5f308689b9206f111b2c69790a6ce6bf2db89e24b0ad390c1b9fbe`
- Canonical staged route manifest draft:
  `output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.staged.json`
  - SHA-256:
    `b1a7379c90b22d26a2256d6e35820dc61376bfaa704d5406fafaf2e382f87d98`
- Canonical staged TAIRA config overlay:
  `output/sccp-bsc-deploy/taira-bsc-xor-route.torii.toml`
  - SHA-256:
    `44804cb80c91dc414220ff29f71a295d9dea64075f1620c7bf2f14f0df06c403`
- Canonical staged merged TAIRA config dry-run:
  `output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.toml`
  - SHA-256:
    `6127877defad30b03fae6ff23ae5353f10a8c0cd09f0ff1ec65a6cfe68a9e8aa`
- Diagnostic-disabled route manifest:
  `output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.diagnostic-disabled.json`
  - SHA-256:
    `3067dbfe2fc812fc541960c1c68ea72083b74804edc389134e2e22b5ad2ff586`
- Diagnostic-disabled TAIRA config overlay:
  `output/sccp-bsc-deploy/taira-bsc-xor-route.diagnostic-disabled.torii.toml`
  - SHA-256:
    `44804cb80c91dc414220ff29f71a295d9dea64075f1620c7bf2f14f0df06c403`

The public deployment was verified with live BSC contract readback before the
diagnostic verifier gate was added:

```sh
npm run e2e:sccp:bsc-preflight -- \
  --output-dir output/sccp-bsc-preflight/public-taira-after-compat \
  --check-bsc-contracts true
```

The resulting report is
`output/sccp-bsc-preflight/public-taira-after-compat/latest.json` and has
`ready: true` under the older criteria. Current hardened preflight must be
rerun and now reports `ready: false` until the diagnostic verifier is replaced:

```sh
npm run e2e:sccp:bsc-preflight -- \
  --output-dir output/sccp-bsc-preflight/public-taira-diagnostic-gate \
  --check-bsc-contracts true
```

The current report after the public TAIRA config update is
`output/sccp-bsc-preflight/public-taira-diagnostic-disabled-rerun/latest.json`;
live BSC contract readback passes, while `bsc-production-ready` and
`bsc-production-verifier-material` fail on the diagnostic verifier material.
The latest live recheck with BSC contract readback is
`output/sccp-bsc-preflight/live-recheck-20260606T202430Z-public-contract-readback/latest.json`;
it confirms the same deployed contracts, explicit BSC testnet
`chainIdHex = "0x61"`, and the same fail-closed production gate. It also
reports missing `proofArtifactHash` / `provingKeyHash` directly as
`bsc-production-prover-material` failure instead of treating proof material as
optional for disabled routes.
The public route currently has `proofArtifactHash: null` and
`provingKeyHash: null`; those hashes must be published with the production
verifier/prover rollout before the UI smoke gate can become ready.

The current read-only live preflight commands are:

```sh
npm run e2e:sccp:bsc-preflight -- --bsc-network testnet --timeout-ms 10000
npm run e2e:sccp:bsc-preflight -- --bsc-network mainnet --timeout-ms 10000
```

The BSC route preflight reads remote TAIRA SCCP capability and manifest
responses, plus optional BSC JSON-RPC contract-readback responses, through a
bounded JSON loader. These remote JSON bodies must be objects no larger than
4 MiB; larger or array-shaped responses fail closed before route evidence is
parsed, matching the local `--manifest-file` evidence limit.

On 2026-06-21, the testnet command still failed closed because the public
manifest uses the known diagnostic verifier key hash
`0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4`, has no
`proofArtifactHash`, has no `provingKeyHash`, and has no SDK-valid native EVM
prover bundle. The mainnet command failed closed because no public TAIRA
`taira_bsc_xor` / `xor` BSC mainnet manifest is advertised yet.
The production material inventory gate was added after the diagnostic rollout
to make stale local artifacts explicit. The latest run is
`output/sccp-bsc-production-material-inventory/testnet/latest.json`, checked at
`2026-06-21T21:00:36.457Z`;
it fails closed on missing production route artifact roots, no clean
production-ready route artifact, no clean local offline full-TOML evidence
matching the public `offlineFullTomlSha256`, no production verifier material,
no SDK-validated native EVM prover bundle, no `.r1cs` / `.zkey` production
proof files under the stricter
size/diversity/hash-binding rules, missing configured destination/source BSC
browser prover module URLs, and the non-ready public route report. It also
rejects deterministic smoke-test Groth16 fixture verifier key shapes when they
appear in scanned material.
The inventory now also treats descriptor-only native prover bundles as
insufficient: a clean `sccp-native-evm-groth16-prover-bundle-v1` must be
generated by `../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs
native-prover-bundle`, match the public route verifier/proof/proving/destination
hashes, and resolve every JavaScript, Swift, Kotlin, Java Android, and .NET SDK
implementation artifact byte-for-byte through the sibling SDK verifier.
The sibling SDK and deploy-helper now also reject native prover report hash
role collisions: parity reports, native self-test reports, audit hashes,
attestation hashes, proof/proving/verifier hashes, destination-binding hashes,
and report payload hashes must remain role-separated even when the JSON reports
and SDK result maps are otherwise self-consistent.
The native EVM prover bundle contract now also requires an explicit
`verifierKeyArtifactHash` / `verifier_key_artifact_hash` for the raw verifier
key artifact bytes. That value must equal the SHA-256 of the verifier-key
artifact and must remain distinct from the semantic `verifierKeyHash`
commitment exposed by the verifier contract; descriptor-only bundles or bundles
that silently reuse the semantic verifier-key hash now fail SDK validation.
The sibling SDK declarations enforce the same rule with a required-alias input
type for Ethereum/BSC native EVM prover bundles, so TypeScript callers cannot
construct descriptor-only BSC bundle inputs without a compile-time error.
The sibling route-config helper now writes an
`iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1` JSON artifact in full
config mode. That artifact carries both the exact rendered TOML SHA-256 and the
production `offlineFullTomlSha256`, computed over the canonical merged peer
config with only the self-referential
`post_deploy_offline_full_toml_sha256` line omitted. The route-manifest
generators in both repos can consume that evidence through
`--offline-full-toml-evidence` and reject any copied CLI hash that disagrees.
Inventory reports now redact paths for files whose basename is secret-shaped,
so a failed scan can report `secret-like-file-name` without publishing operator
vault or private-artifact filenames.
The same assignment-shaped secret scanner is now enforced by BSC route
preflight, route-manifest generation, prover-manifest generation, smoke
readiness, peer-config audit snapshots, material inventory, and the aggregate
production gate so evidence strings such as `privateKey=...` fail without being
serialized into reports.
The latest smoke-readiness run is
`output/sccp-bsc-smoke-readiness/testnet/latest.json`, checked at
`2026-06-21T21:00:36.425Z`, and remains `ready: false` with failed checks for
the public route, peer audit production readiness, WalletConnect project id,
runtime prover config, and destination/source prover manifest production
binding. The latest aggregate production gate
run with refreshed route, peer, smoke, and material-inventory inputs is
`output/sccp-bsc-production-gate/testnet/latest.json`, checked at
`2026-06-21T21:00:36.632Z`;
it remains `ready: false` with 27 failed checks and 45 unique missing
production inputs. The aggregate gate now carries the lower-level blockers
directly: diagnostic verifier material in route, peer, smoke, and
material-inventory inputs, missing production `proofArtifactHash` /
`provingKeyHash` /
`nativeEvmProverBundleHash`, mismatched local offline full-TOML evidence for
the public post-deploy config hash, missing production-ready route manifest /
route
overlay / full TAIRA config artifacts, missing production TAIRA burn-record
material, audited but non-production TAIRA peer route configs, missing BSC
WalletConnect/prover module settings, and the missing complete live UI video
proof transcript. A generated local offline full-TOML evidence artifact exists
at
`output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.evidence.json`
with `offlineFullTomlSha256` =
`0x75d0acd5a0adb40c4dd59018445dfeff82e35e659780566a9ea493f9f300b072`, but it
does not satisfy production until the same hash is attached to the public
post-deploy route evidence and peer configs. The
`publish-offline-full-toml-evidence` next action therefore requires the
production route manifest,
offline full-TOML evidence, testnet BSC deployment evidence, TAIRA burn-record
contract, canonical settlement asset definition id, native EVM prover bundle,
post-deploy live evidence, deployed TAIRA base config, TAIRA route publication
channel, and peer-config audit source before it can unblock the route. The
peer audit scanner now prefers exact `peer0.toml` through `peerN.toml` files
when `--expected-peers N` is supplied, so the aggregate refresh can read the
normal stanza directory even if it also contains stale generated
`peer0-peer0.toml` style evidence from previous runs.
The latest aggregate refresh reports
`peerAuditRefresh.inputSource = "remote-ssh"`, so the gate no longer relies on a
preserved stale peer-audit report or manual clean snapshot.
The material inventory now enforces the
25-input production-requirements contract, including
`testnet-bsc-deployment-evidence`,
`canonical-settlement-asset-definition-id`, `deployed-taira-base-config`, and
`offline-full-toml-evidence`. The refreshed scan at
`2026-06-21T14:55:32.049Z` accepts the regenerated 25-input handoff
artifacts with `productionRequirementsArtifacts = 2` and
`contractHash = expectedContractHash =
0x4e465e279054e277332d275dc7461cc4ee84d68398b727d7c619aed6bfb23874`; the
overall report still has `criticalFindings = 2` from the diagnostic deployment
evidence and diagnostic verifier key hash. The
legacy raw CLI hash handoff blocker is no longer present locally. The same scan
binds the local browser prover module hash
`0x77ae38b3eb8be1fbfdb1bb0a5f5c96175c26bc6a93aa3b619e325151ec53d1f6` and
sidecar hash
`0xc7d4fb4094b9dad0f6a57a6d7a2d5c35371caacb9f7b836b5d44c656b5a8d973`;
the sidecar's `moduleSha256Actual` matches the declared module hash.
The sibling `../iroha` route-manifest helper now also enforces that rule at the
source: `--production-ready true` refuses raw `--offline-full-toml-sha256`
input unless the same value came from a generated
`--offline-full-toml-evidence` artifact emitted by `route-config`.
The standalone material inventory report and the aggregate gate's embedded
material inventory summary now also publish structured `nextActions` for
route artifacts, proof material/native bundle, browser prover modules/runtime
config, and public route evidence refresh. They also deduplicate those actions
into `missingProductionInputs` for the production route manifest/overlay,
offline full-TOML evidence, Groth16 verifier key, proof artifact, proving key,
native EVM prover bundle, testnet browser prover modules/runtime config, and
fresh public route report. Action text and missing-input fields are redacted
before aggregate publication if any prerequisite report tries to carry
secret-shaped operator strings.
The aggregate production-gate schema now explicitly accepts and validates those
material-inventory `nextActions` / `missingProductionInputs` fields, including
their nested required-input records, so the report fails only on real missing
materials rather than rejecting its own structured handoff metadata.
The aggregate gate now merges those sanitized material-inventory inputs into
its top-level `missingProductionInputs` as well, so the latest top-level handoff
has 45 unique missing inputs and no longer omits `production-route-overlay`,
`testnet-runtime-prover-config`, `public-route-report`, or the production
route-publication evidence inputs required by the route preflight report.
Aggregate `blockedByActions` now references only aggregate `nextActions`; any
embedded material-inventory workflow IDs are preserved separately under
`blockedByMaterialActions`, so the handoff has no dangling action references
while still showing which child material workflow reported each missing input.
The route preflight report now also publishes structured `nextActions` and
`missingProductionInputs` for the source route blockers:
`replace-diagnostic-bsc-verifier`, `publish-production-proof-material`, and
`publish-post-deploy-full-toml-evidence`. The aggregate gate sanitizes and
merges those inputs under `blockedByRouteActions`, so route-origin requirements
such as the production verifier key, funded BSC deployer/RPC endpoint,
proof/proving artifacts, native EVM prover bundle, offline full-TOML evidence,
and post-deploy live evidence are visible in the top-level handoff without
turning child route workflow IDs into aggregate actions.
The peer-config audit report now publishes its own structured `nextActions`
and `missingProductionInputs` too. The current peer source action is
`deploy-production-peer-route-config`, with seven peer-origin required inputs:
production route manifest, production route overlay, TAIRA peer config targets,
peer config audit source, native EVM prover bundle, TAIRA burn-record contract,
and offline full-TOML evidence. The aggregate gate sanitizes and merges these
under `blockedByPeerActions`, so peer-origin blockers are visible without
turning child peer workflow IDs into aggregate actions.
The smoke-readiness report now publishes its own structured `nextActions` and
`missingProductionInputs` for route-preflight, peer-audit, WalletConnect, and
browser prover configuration failures; the aggregate gate sanitizes and merges
those under `blockedBySmokeActions` so smoke-origin inputs are visible without
turning child smoke workflow IDs into aggregate actions.
It also independently rescans every input report for
deterministic smoke-test Groth16 verifier fixtures before the final gate can
pass, and it explicitly requires the material inventory report's
`material-scan-complete` check so truncated or stale inventory scans cannot be
accepted by aggregate readiness.
All BSC SCCP E2E CLIs now treat `--help` / `-h` as a side-effect-free usage
path: they print usage, exit successfully, and do not run live checks, launch
Electron, read remote peer configs, or write `latest.json` reports.
The help output for the route-manifest generator, route preflight,
runtime-prover config generator, browser-prover sidecar generator,
peer-config audit, live video recorder, material inventory, smoke-readiness, and
aggregate production gate also lists every parsed option and the operational
environment variables it consumes, including BSC profile selection,
route-manifest inputs, report/output paths, runtime prover sidecars,
peer-audit SSH inputs, age-window overrides, refresh timeout overrides, and
video debug controls. Treat those variable names as runtime-only knobs; do not
persist secret values in repo files or reports.
The aggregate gate also rechecks route identity, deployment, and BSC profile
alias ambiguity across route, smoke-readiness, peer audit, material inventory,
and video proof summaries, so a forged prerequisite report cannot publish a
valid canonical route, deployment, or profile field beside a duplicate
snake-case or legacy role alias even when both values match. That check also
covers BSC profile fields embedded directly in destination/source browser prover
manifests and runtime prover config manifests, where the canonical fields are
`bscNetwork`, `bscChain`, `bscChainIdHex`, and `bscNetworkIdHex`.
Nested material-inventory route, verifier, and native prover bundle file
summaries are checked the same way for route identity and hash aliases before
they can satisfy aggregate artifact counts.
Prerequisite report `checks[]` entries must also publish a single canonical
`id`; duplicate `checkId` / `check_id` aliases are rejected before those checks
can satisfy route, smoke, peer, or material readiness. The same check-integrity
rule is reapplied to the smoke-readiness embedded peer-audit copy and each
peer-level `failedChecks` array before the aggregate gate accepts the embedded
peer audit as matching the standalone peer-audit report. New peer-config audit
reports therefore emit failed check summaries with `ok: false` and
`status: "fail"` instead of id/message-only failure summaries, and
smoke-readiness preserves that machine-readable state when embedding the public
peer-audit summary while omitting operator-only failed-check details.
The video-proof gate also requires exactly one captured WebM recording and
cross-checks the nested transcript summary against the captured artifact's
relative path, byte size, SHA-256, and media type, so hand-edited transcripts
with duplicate or mismatched recordings fail closed. Nested video evidence
arrays must also be present and empty when `proofComplete` is true, and
file-backed video/screenshot entries must declare the expected media type
instead of relying on the production gate to repair missing transcript fields
from disk bytes. Each required explorer screenshot must also use a distinct
transcript-relative proof file path; reusing one captured PNG for multiple
transaction slots fails both live-video evidence evaluation and aggregate
file-backed reverification.
The video readiness binding also rejects post-deploy route evidence whose
source-event or route-canary BscScan URL does not contain the matching
transaction id, or whose source-event and route-canary transaction ids are the
same.
Peer-audit sanitized stanza file reverification is also scoped to the peer
audit report directory: repo-root-relative stanza paths are accepted only when
their real path resolves back under that report directory, so a forged peer
audit cannot satisfy stanza evidence by pointing at an unrelated checked-in
file with a matching hash.
The peer-config TOML parser now rejects duplicate keys inside a single
`[[zk.sccp_route_manifests]]` stanza before an override can hide from alias
checks, and the peer audit rejects duplicate route metadata aliases for
production-ready status, BSC chain id, counterparty domain, account-codec
key/id, and destination source/target domains even when the duplicate value
matches.
BSC -> TAIRA source proof-package binding rejects contradictory alias surfaces:
settlement `route` / `route_id`, message-bundle `commitmentRoot` /
`commitment_root`, `targetDomain` / `target_domain`, commitment hash aliases,
Merkle-proof object aliases, Merkle-step direction/hash aliases, and top-level
source proof material hash aliases (`proofArtifactHash` /
`proof_artifact_hash` / `proverArtifactHash` / `prover_artifact_hash`,
`provingKeyHash` / `proving_key_hash`, and `nativeEvmProverBundleHash` /
`native_evm_prover_bundle_hash`) must normalize to one value, and the source
commitment target domain must be SORA.
The TAIRA message-bundle submit serializer applies the same alias-consistency
rule before building submission payloads: duplicate commitment-root, commitment
message-id, commitment payload-hash, target-domain, Merkle-proof object,
Merkle-step hash/direction, transfer-payload byte/text, and finality-proof
fields must agree exactly after canonical normalization.
BSC RPC evidence binding for source proofs also rejects contradictory aliases
before source proof generation: transaction hash aliases, transaction
`input`/`data`, receipt transaction/block aliases, receipt/indexed log
transaction/block aliases, block hash/number aliases, and object transaction
hash aliases inside block payloads must normalize to the same value.
The app-side BSC route-readiness parser now applies the same consistency rule
to BSC network/profile aliases, BSC RPC URL aliases, route id and asset key
aliases, production-ready and disabled-reason aliases, EVM account-codec
aliases, post-deploy evidence object aliases, live evidence hashes and
transaction IDs, and BscScan explorer URL aliases before exposing the route as
ready in the UI. It also fails closed when a manifest claims
`productionReady: true` while still carrying a disabled reason, matching the
aggregate preflight gate's production-ready/disabled conflict check.
The BSC route-manifest generator applies the same rule to deployment identity
aliases and live contract-readback aliases, including chain id, bytecode
presence, bridge lock state, bridge/source/verifier addresses, verifier hashes,
network id, and SCCP bridge domains, before it can emit a production-ready
route manifest.
It also rejects duplicate production evidence container aliases for
`destinationRollout`, `bscContractReadback`, `postDeployLiveEvidence`,
`codePresent`, verifier-material objects, and TAIRA burn-record `vkRef`.
Verifier-code, verifier-key, proof-artifact, proving-key, destination-binding,
burn-record artifact/hash/code, and settlement-asset material must agree across
explicit CLI options, top-level deployment evidence, burn-record contract JSON,
and `destinationRollout` before operator route artifacts are written.
The BSC browser prover sidecar generator also rejects forged ready route
reports whose `deployment` object includes duplicate canonical, snake-case, or
role-alias fields for bridge/token/source/verifier addresses, verifier hashes,
proof/proving/native-bundle hashes, destination binding, network id, or
settlement asset before hashing or publishing a prover module sidecar.
The BSC route preflight now applies the same fail-closed alias consistency to
`productionReady` / `production_ready`, BSC chain id, counterparty domain,
account codec key/id, and destination-binding version/source/target domains, so
a manifest cannot pass by publishing a valid camel-case value with a conflicting
snake-case or rollout alias.
It also rejects duplicate same-source BSC bridge/token/source/verifier address
aliases before address normalization, even when the duplicate aliases carry the
same value, and rejects TRON-named source-bridge/verifier aliases on BSC route
evidence even when they appear alone. Public route reports must publish exactly
one BSC/generic alias per address source. The sibling Torii route-manifest DTO
now emits TRON-specific route aliases only for TRON routes, so BSC public route
reports stop advertising `sccp_tron_source_bridge_address`,
`tron_verifier_address`, and `sccp_tron_destination_verifier_address` after the
patched Torii build is deployed.
SCCP capability submit paths must also be internally consistent before route
readiness can pass: duplicate proof/message submit path aliases across the
top-level capability object and nested `submit`, `submissions`, or `paths`
containers are accepted only when they normalize to the same route.
TAIRA -> BSC runtime proof/finalize binding now applies the same fail-closed
rule to destination-binding keys and domains, public-input destination binding
hashes, platform destination-binding hashes, proof-package canonical payload
aliases, BSC calldata aliases, SCCP message IDs, commitment roots, statement
hashes, and public-input / commitment payload hashes before the UI can request
wallet approval.

The operator peer-config audit gate is now available as
`npm run e2e:sccp:bsc-peer-config-audit`. It parses TAIRA peer TOML files only
to prove peers do not carry stale local `taira_bsc_xor` / `xor` route or prover
overrides. Production route material is expected to come from the on-chain
`UpsertSccpRouteManifest` / `/v1/sccp/manifests` path; if historical peer
stanzas are found, the audit treats them as stale local overrides without
serializing full TOML, private material, or burn-record bytecode into the
report.
The latest live remote peer audit is
`output/sccp-bsc-peer-config-audit/live-remote-20260606T112800Z/report/latest.json`.
After the peer-route fingerprint was widened to include top-level route
metadata (`version`, `verifier_target`, and counterparty codec fields), the
preserved remote stanza snapshot was re-evaluated at
`output/sccp-bsc-peer-config-audit/live-remote-snapshot-recheck-20260606T162200Z/report/latest.json`;
it confirms all four captured peer stanzas are identical under the stricter
fingerprint, then fails only the production-readiness peer check because the
shared stanza still uses the diagnostic verifier material.
The latest live remote peer audit pulled the four active
`/Users/administrator/dev/iroha/dist/taira-localnet/peer*.toml` files over SSH
into a temporary local directory, deleted the raw TOML after audit, and wrote
`output/sccp-bsc-peer-config-audit/live-remote-20260606T123500Z-postdeploy-hash-parser/latest.json`.
It confirms exactly one identical `taira_bsc_xor` / `xor` stanza on each active
peer, with fingerprint
`sha256:de8231f83646eeee537f70fcdea53def092a4c2708974084f41f7491fb68f712`,
and fails only on the disabled diagnostic verifier material.
For new live audits, avoid copying raw validator TOML files because active
peer configs contain private-key fields outside the SCCP route section. Use the
remote peer-audit path so each remote peer config is streamed over SSH, parsed in
memory, and persisted only as a route-only `[[zk.sccp_route_manifests]]`
snapshot:

```sh
run_dir=output/sccp-bsc-peer-config-audit/live-$(date -u +%Y%m%dT%H%M%SZ)-ssh-sanitized
npm run e2e:sccp:bsc-peer-config-audit -- \
  --ssh-creds-file ../creds.txt \
  --expected-peers 4 \
  --sanitized-stanzas-dir "$run_dir/stanzas" \
  --output-dir "$run_dir/report"
```

The latest secret-safe live audit used that CLI path, hashed each raw remote
peer TOML in memory, hashed each deterministic sanitized route-only snapshot,
and wrote sanitized route snapshots only under its report directory:
`output/sccp-bsc-peer-config-audit/live-recheck-20260606T202350Z-cli-ssh-fresh-sanitized/report/latest.json`.
It reports the same four-peer fingerprint
`sha256:de8231f83646eeee537f70fcdea53def092a4c2708974084f41f7491fb68f712`
and the same fail-closed production-readiness result. The report carries
per-peer `rawTomlSha256` plus `sanitizedStanzaSha256` evidence so later
smoke/production-gate reports can bind back to the exact remote configs that
were streamed and the exact route-only snapshots that were stored, without
storing raw configs. Remote peer TOML streamed over SSH is capped at 2 MiB
before parsing, matching explicit local peer config file inputs.
Smoke-readiness and the aggregate production gate now
require valid non-zero values for both hashes on every audited peer plus
verified sanitized route-only snapshot file evidence. File-backed aggregate gate
runs also re-read the sanitized route-only snapshot paths from the peer-audit
report through a constrained resolver and fail if any snapshot is missing,
path-traversal-shaped, symlinked, non-regular, oversized, unreadable, or
hash-mismatched. Sanitized route-only snapshots are capped at 256 KiB before
hashing.
BSC peer-config audit local directory scans now ignore symlinked
`peer*.toml` entries, and explicit peer config file inputs reject symlinks
or raw TOML larger than 2 MiB before parsing, so local peer evidence cannot be
substituted through an out-of-tree or oversized TOML link.

The current live peer audit was refreshed on 2026-06-21 through the aggregate
gate's secret-safe remote SSH path and wrote only route-only sanitized stanza
snapshots under
`output/sccp-bsc-peer-config-audit/testnet/sanitized-stanzas-regenerated/`;
the canonical report is
`output/sccp-bsc-peer-config-audit/testnet/latest.json`, generated at
`2026-06-21T17:20:22.987Z`. It reports `peerCount: 4`,
`sanitizedStanzaFilesChecked: true`, one `taira_bsc_xor` / `xor` stanza per
peer, and a shared manifest fingerprint
`sha256:7983393de88a0750a7dbeb4265a1b413eaf030ae6ef008d0111c78b077d14359`.
All four active peer stanzas are identical, carry production-shaped burn-record
material, and verify their sanitized stanza hashes, but the audit remains
`ready: false` because each stanza still uses diagnostic verifier material and
omits the native EVM prover bundle hash. The aggregate gate was refreshed from
that remote SSH source, producing
`output/sccp-bsc-production-gate/testnet/latest.json`, checked at
`2026-06-21T17:20:26.869Z`. It remains fail-closed on real production blockers
with 27 failed checks.
The matching refreshed public preflight report is
`output/sccp-bsc-preflight/testnet/latest.json`.
The material blockers are missing `proofArtifactHash`, missing
`provingKeyHash`, missing `nativeEvmProverBundleHash`, missing
route-bound offline full-TOML evidence matching the public post-deploy config
hash, missing production TAIRA burn-record material, missing BSC
WalletConnect/runtime prover config, non-production BSC prover manifests, and
missing live UI video proof. The refreshed material inventory accepts the
regenerated 25-input production requirements handoff, is bound to the current
public BSC testnet deployment, and reports no critical findings for that
artifact.
The aggregate `publish-offline-full-toml-evidence` action now also declares the
deployment evidence, burn-record contract, canonical settlement asset id,
native EVM prover bundle, post-deploy evidence, deployed base config, route
publication channel, and peer audit source as required inputs, so operators do
not publish a full-TOML hash detached from the production cryptographic bundle.
Smoke-readiness now reports the missing `offlineFullTomlSha256` directly in
the route-preflight detail instead of relying only on downstream aggregate
cross-report checks.
The latest local hardening also rejects placeholder/test-only BSC
WalletConnect project IDs, all-zero BSC WalletConnect transaction hashes,
missing or mismatched BSC `chainId` values in WalletConnect transaction
requests, non-zero native BNB `value` transfers in SCCP WalletConnect contract
calls, oversized WalletConnect calldata, over-wide 256-bit JSON-RPC quantity
fields, accessor-backed WalletConnect transaction fields, symbol-keyed or
non-enumerable hidden WalletConnect request fields, unsupported edited
WalletConnect transaction fields, accessor-backed or non-enumerable SCCP prover
module exports before the worker can read them, inherited SCCP prover module
exports, BSC browser prover modules that define the checked runtime adapter
pipeline as dead code while exported prover/self-test entrypoints bypass
`withRuntime` / `withRuntimeSelfTest`, alias-export modules where private
same-named helpers call the checked adapter but the exported SCCP entrypoints
resolve to bypass functions, duplicate JSON object keys in hosted BSC runtime prover configs,
native EVM prover bundles, and native support artifacts before backend prover
execution, forged runtime route reports that carry
diagnostic or secret-like material, unsupported fields in hosted runtime prover
config JSON at the browser runtime, smoke-readiness, and aggregate production
gates, unsupported fields in browser prover sidecar manifests at smoke-readiness
and production-material inventory gates, and `bscChain` labels that drift from
the configured BSC profile before any backend prover code is invoked or
readiness can pass. Runtime prover config generation also rejects duplicate
direction/material URL aliases, such as a
direction-specific proof artifact URL plus the generic `proofArtifactUrl`,
before any referenced material is read. It now also accumulates route-report
readiness blockers before reading runtime material, so the current public
diagnostic route reports the diagnostic verifier, non-ready preflight checks,
missing `proofArtifactHash`, missing `provingKeyHash`, and missing
`nativeEvmProverBundleHash` together instead of stopping at the first absent
hash. Live smoke-readiness also rejects route reports that reuse BSC token,
bridge, source bridge, or verifier addresses before downstream prover checks
run. BSC destination finalization also requires the proof package to carry the
same canonical TAIRA transfer payload bytes as the active bridge request before
wallet approval is requested. Browser
prover sidecar validation also rejects browser module SHA-256 values that are
reused as verifier, destination-binding, proof-artifact, proving-key, or
native-prover-bundle hashes, so a packaged prover module cannot double as
production cryptographic material in route-bound smoke evidence. The
runtime prover config generator also normalizes required
preflight check IDs per BSC profile, so a forged mainnet route report that only
carries the stale `bsc-testnet-chain-id` check is rejected before any prover
artifact URL is read. Live smoke-readiness now enforces the same route
preflight check contract as BSC browser prover sidecar generation, including
the manifest secret scan, disabled/ready conflict check, and profile-specific
BSC chain-id/network-id checks, `bsc-production-verifier-material`, and the raw
verifier `verifyingKeyHash()` readback. The aggregate production gate also requires each
individual BSC readback check, so a stale route report cannot pass with only
the aggregate `bsc-contract-readback` bit set.
The production material inventory uses the same required route-check contract
before binding local files to a route report. It also refuses symlink scan
entries and requires native prover bundle support artifacts to resolve inside
their scanned artifact roots before hashing, so a symlink to bytes outside the
operator artifact set cannot satisfy SDK artifact verification. Browser prover
sidecar generation, browser module/manifest public paths, package-relative
prover paths, and runtime prover material URLs now go through the same
regular-file and realpath containment checks before bytes are read, so a local
symlink cannot substitute out-of-tree proof material or JavaScript while
preserving a safe-looking URL. The shared browser prover URL normalizer, the
checked-in browser runtime adapter, runtime config generator, and sibling
native-prover-bundle generator additionally reject raw, percent-encoded, and
recursively over-encoded parent-directory material URLs and native-bundle
artifact paths, and constrain `file:` material URLs to the active runtime
config directory during local file-backed verification, so an edited config,
prover URL, or
native bundle cannot point hash-matching proof, proving, support,
implementation, or native prover artifacts at arbitrary absolute file paths or
outside the hosted config directory. The checked-in browser runtime adapter also
streams hosted runtime config, native bundle, proof, proving-key, verifier, SDK
support, and backend module responses through the same byte caps before hashing
or parsing them, so a CDN response without `Content-Length` cannot force the UI
to buffer unbounded prover material before failing closed. Backend JavaScript is
then imported from the exact SHA-256-verified bytes rather than re-importing
the original URL, and backend modules are required to be self-contained with no
static imports, static re-exports, dynamic imports, or `import.meta` follow-on
resolution. The browser runtime uses a lexical scanner for that check so inert
strings and comments do not cause false failures, while hidden imports inside
template expressions still fail before backend execution. Runtime config,
production material inventory, production gate, and live-smoke readiness reports
now also carry and require `backendSelfContained: true` for each direction, so
forwarded operator evidence proves the backend self-containment check ran rather
than merely presenting a hash and export list. That prevents a mutable remote
prover backend from swapping code between the hash check and execution or
delegating proof construction to unverified follow-on modules.
Local route-preflight `--manifest-file` inputs also reject symlinked manifest
paths, oversized files, and non-object JSON before parsing, so dry-run route
evidence cannot be swapped through an out-of-tree JSON link or hidden inside
ambiguous payload shapes.
BSC sidecar generation, runtime-prover config generation, smoke-readiness,
material inventory, and aggregate production-gate report ingestion now reject
symlinked, non-regular, oversized, or non-object explicit JSON report inputs
before parsing. The BSC route-manifest generator applies the same check to
deployment evidence, TAIRA burn-record contract JSON, and native EVM prover
bundle JSON, so production-ready manifests cannot be assembled from swapped
local links or malformed evidence files.
Remote peer-config audit SSH credential and password file inputs are also
regular-file-only, capped at 64 KiB, and reject symlinks before any SSH command
is built. Remote peer TOML returned by SSH is capped at 2 MiB before parsing.
The runtime adapter, runtime-config generator, material inventory, and sibling
native-prover bundle builder also reject repeated-pattern, arithmetic-sequence,
dominant-byte-padded, and malformed-container proof material. Proof artifacts
must be real SnarkJS `.r1cs` files or valid WASM modules, and proving keys must
be real SnarkJS `.zkey` files; high-entropy bytes with the wrong header are not
accepted as production cryptography. Material inventory also caps scanned
production material files at 512 MiB before hashing and applies the same cap to
`.r1cs` / `.wasm` proof artifacts and `.zkey` proving keys before byte-profile
inspection. The material scan also fails closed when more matching files are
present than the configured scan limit, because production readiness must be
based on a complete artifact inventory. The sibling BSC native-prover bundle
builder now also rejects symlinked or non-regular route/deployment JSON,
proof/proving/verifier, SDK implementation, parity/self-test, and audit files
before hashing those inputs or attaching hashes to a route manifest.
Material inventory native SDK/support artifact replay also caps each resolved
native prover artifact at 512 MiB before handing bytes to the sibling SDK
verifier.
The live video proof and aggregate production gate now also require captured
recording artifacts to be WebM/Matroska files with a `webm` EBML doctype and
explorer screenshots to carry a PNG signature; extension, size, and SHA-256 are
not enough for a proof artifact to pass. The live-video runner requires proof
artifacts to be regular files before reading bytes, and the aggregate gate
applies the same regular-file-only check while re-reading transcript-relative
`.webm` and `.png` files. The same proof-file path now enforces bounded media
sizes before hashing: 512 MiB maximum for WebM recordings and 16 MiB maximum
for PNG explorer screenshots. Symlinks are not marked verified even when they
resolve inside the proof output directory. The live-video readiness evaluator
also rejects duplicate route, BSC profile, deployment hash, post-deploy,
peer-audit, and check-id aliases before a transcript can become complete.
Transcript-relative video and
screenshot paths must also be plain relative paths without URI schemes, empty
segments, or raw/percent-encoded/over-encoded parent-directory traversal.
The aggregate gate also requires the video transcript to be loaded through its
file-backed verifier, which re-reads the `.webm` and `.png` files from the
transcript directory and stamps an internal verifier marker before
`video-proof-files-reverified` can pass; a forged JSON transcript with
`fileVerified: true` is not sufficient.
The sibling BSC deployment helper now also reads
`SccpGroth16Bn254MessageVerifier.verifyingKeyHash()` from the deployed verifier
and rejects evidence when it does not match the route bridge's
`verifierKeyHash`, so a hand-entered verifier key hash cannot diverge from the
actual verifier contract.
A recheck of that sanitized stanza set after the proof-hash preflight hardening
is
`output/sccp-bsc-peer-config-audit/live-recheck-20260606T145457Z-preflight-proof-hashes/report/latest.json`;
every peer now reports the missing `proofArtifactHash` and `provingKeyHash` as
`bsc-production-prover-material` failures in addition to the diagnostic
verifier blocker.
The current SSH-sanitized replay over active peer stanzas is the CLI report
above; it keeps the same fingerprint and confirms the peer audit report remains
secret-clean while failing only the production-readiness route check.

`npm run e2e:sccp:bsc-smoke-readiness` also fails closed because
`VITE_WALLETCONNECT_PROJECT_ID` is unset, browser-safe BSC destination/source
prover module URLs and route-bound prover sidecar manifests are unset, and the
route preflight and peer-config audit are not production-ready. The smoke gate
also requires each sidecar manifest's `proofArtifactHash` and `provingKeyHash`
to match the public TAIRA route deployment snapshot.

The checked-in browser runtime adapter is available at
`/sccp-bsc/taira-bsc-xor-prover.js`. Set both
`VITE_SCCP_BSC_PROVER_MODULE_URL` and
`VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL` to that module when using one
combined BSC prover package, set `VITE_SCCP_BSC_PROVER_CONFIG_URL` to the
published config URL, then generate the route-bound runtime config with
`npm run e2e:sccp:bsc-runtime-prover-config` and the route-bound sidecars with
`npm run e2e:sccp:bsc-prover-manifest` after the public route publishes
production `proofArtifactHash` and `provingKeyHash` values. If
`VITE_SCCP_BSC_PROVER_CONFIG_URL` is omitted, the checked-in adapter defaults to
`/sccp-bsc/taira-bsc-xor-prover.config.json`. The module verifies SHA-256 for
the native prover bundle, proof artifact, proving key, verifier key, and backend
module, checks the loaded bundle against the SDK-bound route request, and
delegates only after all material matches. It does not embed proof bytes or
generated outputs; an operator must publish the real artifact files and a real
backend module next to the config before the smoke gate can pass.

For profile-specific prover packages, use the profile-specific env vars:

- Testnet: `VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL`,
  `VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL`,
  `VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL`,
  `VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL`,
  `VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL`.
- Mainnet: `VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL`,
  `VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL`,
  `VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL`,
  `VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL`,
  `VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL`.

The generic `VITE_SCCP_BSC_PROVER_MODULE_URL`,
`VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL`,
`VITE_SCCP_BSC_PROVER_MANIFEST_URL`,
`VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL`, and
`VITE_SCCP_BSC_PROVER_CONFIG_URL` remain fallbacks. Do not point a mainnet gate
at testnet sidecars or testnet native prover bundles; the smoke-readiness,
material-inventory, live-video, and aggregate production gates reject that
cross-profile evidence.

The runtime config schema is
`iroha-demo-sccp-bsc-runtime-prover/v1` and must bind:

- `routeId = "taira_bsc_xor"`, `assetKey = "xor"`, TAIRA chain id
  `809574f5-fee7-5e69-bfcf-52451e42d50f`, network prefix `369`, and the
  selected BSC profile's chain/network ids: testnet `0x61` /
  `0x0000000000000000000000000000000000000000000000000000000000000061`, or
  mainnet `0x38` /
  `0x0000000000000000000000000000000000000000000000000000000000000038`.
- `destination` and `source` sections containing `nativeProverBundleUrl` /
  `nativeProverBundleSha256`, `proofArtifactUrl` / `proofArtifactSha256`,
  `provingKeyUrl` / `provingKeySha256`, `verifierKeyUrl` /
  `verifierKeySha256`, and `backendModuleUrl` / `backendModuleSha256`.
  Within each direction, the raw native bundle hash, canonical native EVM
  descriptor hash, proof artifact hash, proving-key hash, semantic verifier-key
  hash, and raw verifier-key artifact hash must be role-separated. The browser
  adapter also rejects material-hash alias
  smuggling such as publishing both `proofArtifactSha256` and
  `proofArtifactHash` in the same direction. Source material is never inferred
  from destination inputs; operators may reuse the same audited URLs only by
  supplying them explicitly in both sections or through the generic CLI flags.
  A common audited native bundle can still be used for both source and
  destination only when the public route deployment intentionally binds both
  directions to that same bundle.
- Backend exports `bscSccpProve` for TAIRA -> BSC and `bscSccpSourceProve` for
  BSC -> TAIRA. The destination backend receives route-bound request and
  artifact bytes and must return production Groth16 `proofBytes`; the SDK wraps
  and validates those bytes before calldata or TAIRA submission is accepted.
- Smoke-readiness now checks the runtime config when the checked-in adapter is
  selected, so a module/sidecar pair cannot pass live readiness unless the
  config is present and its destination/source hashes match the public TAIRA
  route deployment.
- Production material inventory performs the stronger local check: when the
  checked-in adapter or an explicit `VITE_SCCP_BSC_PROVER_CONFIG_URL` is used,
  the inventory must load the runtime config, re-hash every referenced native
  bundle/proof/proving/verifier/backend artifact, and verify the canonical
  config against the same public route report.

The current report is
`output/sccp-bsc-smoke-readiness/testnet/latest.json`.
The current aggregate production-gate report is
`output/sccp-bsc-production-gate/testnet/latest.json`;
it fails closed on the same route, peer-audit, smoke-readiness, missing
video-transcript evidence, missing verified `.webm` recording evidence, and
missing verified explorer `.png` evidence. Its top-level
`route-preflight-ready`, `peer-config-audit-ready`, `smoke-readiness-ready`,
and `production-material-inventory` checks now include the underlying failed
check IDs and safe details, including the `bsc-production-prover-material`
detail that reports `proofArtifactHash is required; provingKeyHash is required`.
The standalone peer audit section in that aggregate report has
`sanitizedStanzaFilesChecked: true`; all four peers have
`sanitizedStanzaFileVerified: true` and the same sanitized stanza file hash.
Remote TAIRA peer configs were rechecked on 2026-06-06: the active four-peer
cluster advertises one identical `taira_bsc_xor` route stanza per peer, all
with `production_ready = false`; no production BSC `.zkey`, `.r1cs`, browser
WASM, or BSC prover sidecar manifest was present in the remote Iroha checkout.

The latest live recheck after the public BSC alias-tight rollout is:

- Public preflight:
  `output/sccp-bsc-preflight/testnet/latest.json`
- Remote peer audit:
  `output/sccp-bsc-peer-config-audit/testnet/latest.json`
- Smoke readiness:
  `output/sccp-bsc-smoke-readiness/testnet/latest.json`
- Production material inventory:
  `output/sccp-bsc-production-material-inventory/testnet/latest.json`
- Aggregate production gate:
  `output/sccp-bsc-production-gate/testnet/latest.json`

That bundle confirms public TAIRA publishes the BSC route, stale local peer
route/prover overrides are not required, and BSC testnet contract readback still
passes. It also confirms `ready: false` for real production blockers only:
missing native EVM prover bundle hash/material and missing destination/source
browser prover references in preflight; missing WalletConnect/prover
configuration in smoke readiness; no clean production route, offline
full-TOML, burn-record, Groth16, proof, proving-key, or native-prover material
in inventory; and no complete UI video transcript. A workspace and remote
peer-host artifact search found no production BSC `.zkey`, `.r1cs`, browser
prover WASM, native EVM prover bundle, or route-bound BSC prover sidecar beyond
the checked-in loader/validator module.

## Remaining UI Rollout

1. Provide WalletConnect configuration:
   - `VITE_WALLETCONNECT_PROJECT_ID`
   - Must be a real production WalletConnect project ID; BSC smoke-readiness
     rejects short fixture values, all-zero/repeated values, and
     demo/test/placeholder strings such as `walletconnect-project-id`.
2. Provide browser-safe production prover modules:
   - `VITE_SCCP_BSC_PROVER_MODULE_URL`
   - `VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL`
3. Provide public sidecar manifests for those modules:
   - `VITE_SCCP_BSC_PROVER_MANIFEST_URL`
   - `VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL`
   - If omitted, smoke-readiness derives
     `<module-url>.manifest.json` beside each configured module.
   - Generate package-local sidecars from a ready public route report with
     `npm run e2e:sccp:bsc-prover-manifest`.
4. Run the assisted UI proof flow and record the final transaction video:
   - `npm run e2e:sccp:bsc-video -- --duration-ms 600000`

## Route Manifest Draft

The sibling repo now provides a BSC deployment/evidence helper. It is gated by
explicit testnet confirmation and reads the deployer key only from a runtime
environment variable:

```sh
cd ../iroha
NODE_PATH=/path/to/node_modules \
  node scripts/sccp_bsc_taira_xor_deploy.mjs compile
SCCP_BSC_DEPLOYER_PRIVATE_KEY=<runtime-only-funded-testnet-key> \
NODE_PATH=/path/to/node_modules \
  node scripts/sccp_bsc_taira_xor_deploy.mjs deploy \
    --verifier artifacts/sccp-bsc/bsc-testnet-verifier-key.json \
    --broadcast true \
    --confirm-testnet taira_bsc_xor \
    --out artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json
```

Generate the operator route-manifest draft from BSC deployment evidence and the
TAIRA burn-record contract artifact:

```sh
npm run e2e:sccp:bsc-route-manifest -- \
  --evidence ../iroha/artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json \
  --taira-contract ../iroha/artifacts/sccp-bsc/taira-bsc-xor-burn-record.contract.json \
  --settlement-asset-definition-id 6TEAJqbb8oEPmLncoNiMRbLEK6tw
```

The generator is offline and signer-free. It rejects deployment evidence that
does not identify `taira_bsc_xor` / `xor`, mainnet or cross-network evidence,
secret-like fields, aliases such as `xor#universal`, malformed Base64
artifacts, mismatched artifact SHA-256 hashes, duplicate BSC contract
addresses, and forged destination binding material before writing an operator
artifact.

The sibling route-config publisher also rejects production-ready manifests that
carry known diagnostic BSC verifier material, and the deploy command refuses to
broadcast diagnostic verifier material unless an operator explicitly supplies
`--allow-diagnostic-verifier true`. Deterministic smoke-test Groth16 verifier
fixtures are rejected by the deploy command even with that diagnostic override,
before the helper reads a deployer key or opens a BSC RPC connection.
The app-side route-manifest draft generator also rejects smoke-test Groth16
fixture point arrays when a hand-authored deployment evidence file carries
top-level or `destinationRollout` verifier material, even if the verifier hash
is not one of the known diagnostic hashes. The public route preflight applies
the same exact-match check to TAIRA-advertised manifests before passing
`bsc-production-verifier-material`. Browser prover sidecar validation applies
the same recursive check to top-level and nested sidecar manifest material
before live smoke readiness can pass, and sidecar generation rejects forged
ready route reports that embed the same fixture material before writing a
manifest. The live smoke-readiness evaluator also rejects forged ready route
reports that embed the fixture material before route readiness can pass.
The sibling `iroha_config` runtime parser also rejects hand-authored BSC route
TOML that is not bound to BSC testnet `chain_id_hex = "0x61"` or that sets
`production_ready = true` with the known diagnostic verifier hash; disabled
diagnostic manifests receive the same default disabled reason if the operator
omits one.

BSC operator CLIs accept only exact `true` or `false` for boolean values. Loose
truthy values such as `1`, `yes`, and `on` fail before reports or manifests are
written. Bare documented flags still work where the command intentionally
supports them, for example `--allow-incomplete`.

The renderer's BSC route-readiness check also requires a non-zero 32-byte
`artifactSha256` and recomputes it from `contractArtifactB64` before enabling
BSC bridge actions. The read-only preflight remains the stronger production
gate because it also checks the live BSC contracts.

After the final evidence is attached, generate a TAIRA runtime config overlay
from the production-ready route manifest:

```sh
node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config \
  --manifest output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json \
  --out output/sccp-bsc-deploy/taira-bsc-xor-route.production-ready.torii.toml
```

To produce the `offlineFullTomlSha256` needed by that final manifest, first
render a temporary pre-evidence manifest with the production deployment,
proof, native-prover, source-event, and route-canary material, but without
`--production-ready true`, `--full-toml-ready true`, or any raw
`--offline-full-toml-sha256` value. Do not publish that pre-evidence manifest.
Then merge it into the deployed TAIRA peer config and write the offline
full-TOML evidence:

```sh
npm run e2e:sccp:bsc-route-manifest -- \
  --evidence ../iroha/artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json \
  --taira-contract ../iroha/artifacts/sccp-bsc/taira-bsc-xor-burn-record.contract.json \
  --settlement-asset-definition-id 6TEAJqbb8oEPmLncoNiMRbLEK6tw \
  --proof-artifact-hash <0x...> \
  --proving-key-hash <0x...> \
  --native-prover-bundle ../iroha/artifacts/sccp-bsc/bsc-testnet-native-evm-prover-bundle.json \
  --source-bridge-config-hash <0x...> \
  --source-event-transaction-id <0x...> \
  --source-event-explorer-url https://testnet.bscscan.com/tx/<0x...> \
  --route-canary-evidence-hash <0x...> \
  --route-canary-transaction-id <0x...> \
  --route-canary-explorer-url https://testnet.bscscan.com/tx/<0x...> \
  --live-readback-checked true \
  --out output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.pre-offline-evidence.json

node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config \
  --manifest output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.pre-offline-evidence.json \
  --base-config <deployed-taira-config.toml> \
  --out output/sccp-bsc-deploy/taira-bsc-xor-route.pre-offline-evidence.full-taira-config.toml \
  --allow-unready true \
  --write-offline-full-toml-evidence output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.evidence.json
```

Use that evidence file when regenerating the final production-ready route
manifest:

```sh
npm run e2e:sccp:bsc-route-manifest -- \
  --evidence ../iroha/artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json \
  --taira-contract ../iroha/artifacts/sccp-bsc/taira-bsc-xor-burn-record.contract.json \
  --settlement-asset-definition-id 6TEAJqbb8oEPmLncoNiMRbLEK6tw \
  --proof-artifact-hash <0x...> \
  --proving-key-hash <0x...> \
  --native-prover-bundle ../iroha/artifacts/sccp-bsc/bsc-testnet-native-evm-prover-bundle.json \
  --source-bridge-config-hash <0x...> \
  --source-event-transaction-id <0x...> \
  --source-event-explorer-url https://testnet.bscscan.com/tx/<0x...> \
  --route-canary-evidence-hash <0x...> \
  --route-canary-transaction-id <0x...> \
  --route-canary-explorer-url https://testnet.bscscan.com/tx/<0x...> \
  --full-toml-ready true \
  --offline-full-toml-evidence output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.evidence.json \
  --production-ready true \
  --live-readback-checked true \
  --confirm-testnet taira_bsc_xor \
  --out output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json
```

Finally regenerate the merged full config from the final manifest and confirm
the reported `offlineFullTomlSha256` still matches the evidence artifact:

```sh
node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs route-config \
  --manifest output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json \
  --base-config <deployed-taira-config.toml> \
  --out output/sccp-bsc-deploy/taira-bsc-xor-route.production-ready.full-taira-config.toml \
  --write-offline-full-toml-evidence output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.final.evidence.json
```

The current backend still parses legacy generic and BSC-specific route address
aliases for diagnostics, but TRON-named source-bridge/verifier aliases are now
rejected for BSC production evidence. Newly generated BSC artifacts are
canonical and duplicate-free. Route manifest JSON emits only
`bscTokenAddress`, `bscBridgeAddress`, `sccpBscSourceBridgeAddress`, and
`bscVerifierAddress`; route-config TOML emits only `taira_xor_token_address`,
`taira_xor_bridge_address`, `sccp_bsc_source_bridge_address`, and
`sccp_bsc_destination_verifier_address`. Proof material is emitted once as
`proofArtifactHash` in JSON and `proof_artifact_hash` in TOML. Conflicting or
same-valued duplicate aliases are rejected instead of silently choosing one.
The route-manifest generator, browser prover sidecar generator, runtime prover
config generator, public preflight, peer audit, and aggregate gate also reject
the legacy `sccp_tron_source_bridge_address` and `tron_verifier_address`
mirrors on BSC evidence. The route-config publisher applies that same
consistency rule to nested rollout/binding fields and post-deploy canary
evidence, so a correct top-level value cannot hide a stale nested verifier
hash, proof hash, binding hash, or explorer URL before operator TOML is
generated.

For a local non-secret deployment rehearsal before using BSC testnet keys:

```sh
cd ../iroha
tmpdir=$(mktemp -d /tmp/iroha-bsc-smoke-deps.XXXXXX)
npm install --prefix "$tmpdir" --silent solc@0.7.4 ethers@6.16.0 ganache@7.9.2 >/dev/null
NODE_PATH="$tmpdir/node_modules" node scripts/sccp_bsc_taira_xor_deploy_smoke.mjs
rm -rf "$tmpdir"
```

That smoke starts a BSC-testnet-shaped Ganache chain, deploys and configures
the BSC SCCP contracts through the same helper, validates route-bridge readback,
and rejects any secret-like material in the public evidence artifact. It does
not connect to BSC testnet or TAIRA.

Build the native EVM prover bundle from real artifact files before marking a
route production-ready. First materialize a productionReady Groth16 material
manifest from the full SCCP message circuit, proving key, SnarkJS verifier key,
and semantic/security/setup/reproducible-build attestations signed by an Ed25519
attestation key; then pass that manifest into `native-prover-bundle` with the
same `--trusted-attestation-signer <0x...>` fingerprint. The material manifest must carry
`selfChecks.circuitSource` proving that the circuit is the full-message profile,
is not the signal-binding fixture, has no unresolved placeholders, derives the
public signals with `Keccak(512, 256)`, reduces digest signals modulo the scalar
field, boolean-constrains SCCP value bits, constrains all 9 public signals, and
binds all 9 Solidity signal labels in circuit code. It must also carry
`attestationTrustPolicy` and verified signature summaries for each attestation;
the native bundle helper re-reads the referenced attestation files and verifies
the detached signatures against the configured trust root. The helper hashes the proof
artifact, proving key, verifier key, parity fixture, self-test fixture, Groth16
material manifest, and all required SDK implementations, validates the bundle
with the sibling JS SDK, verifies the parity/self-test JSON, and can attach the
resulting `nativeEvmProverBundle` to the route manifest. The parity and
self-test audit hashes are derived from those files unless explicit matching
hashes are supplied.

```sh
node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle \
  --route-manifest output/sccp-bsc-production/taira-bsc-xor-route.manifest.json \
  --artifact-root output/sccp-bsc-production/native-prover \
  --proof-artifact proof-artifact.r1cs \
  --proving-key proving-key.zkey \
  --verifier-key verifier-key.json \
  --groth16-material-manifest bsc-groth16-material.manifest.json \
  --cross-sdk-parity cross-sdk-parity.json \
  --native-prover-self-test native-prover-self-test.json \
  --javascript-implementation javascript-implementation.bin \
  --swift-implementation swift-implementation.bin \
  --kotlin-implementation kotlin-implementation.bin \
  --java-android-implementation java-android-implementation.bin \
  --dotnet-implementation dotnet-implementation.bin \
  --audit-circuit-security circuit-security-audit.bin \
  --audit-native-implementation native-implementation-audit.bin \
  --audit-reproducible-build reproducible-build-attestation.bin \
  --audit-no-wasm-no-remote-scan no-wasm-no-remote-scan.bin \
  --out output/sccp-bsc-production/native-prover/bsc-testnet-native-evm-prover-bundle.json \
  --attach-route-manifest-out output/sccp-bsc-production/taira-bsc-xor-route.manifest.with-native-prover.json
```

To mark the draft as production-ready, rerun only after live BSC readback and
TAIRA canary evidence are complete with production verifier material:

```sh
npm run e2e:sccp:bsc-route-manifest -- \
  --evidence output/sccp-bsc-production/deployment-evidence.json \
  --taira-contract output/sccp-bsc-production/taira-burn-record-contract.json \
  --settlement-asset-definition-id 6TEAJqbb8oEPmLncoNiMRbLEK6tw \
  --full-toml-ready true \
  --source-bridge-config-hash 0x... \
  --source-event-transaction-id 0x... \
  --source-event-explorer-url https://testnet.bscscan.com/tx/0x... \
  --route-canary-evidence-hash 0x... \
  --route-canary-transaction-id 0x... \
  --route-canary-explorer-url https://testnet.bscscan.com/tx/0x... \
  --proof-artifact-hash 0x... \
  --proving-key-hash 0x... \
  --native-prover-bundle output/sccp-bsc-production/native-prover/bsc-testnet-native-evm-prover-bundle.json \
  --production-ready true \
  --live-readback-checked true \
  --confirm-testnet taira_bsc_xor
```

Production-ready evidence must include BSC testnet `eth_chainId` readback,
bytecode at the token, bridge, source bridge, and verifier addresses,
an SDK-valid BSC testnet native EVM prover bundle bound to the verifier,
proof artifact, proving key, and destination binding hashes,
`TairaXOR.bridge()`, `TairaXOR.bridgeLocked()`,
`SccpBscSourceBridge.owner()`,
`TairaXorSccpBridge.destinationBindingHash()`, and route bridge verifier
identity readbacks (`verifier()`, `verifierCodeHash()`, `verifierKeyHash()`,
`networkId()`, `expectedSourceDomain()`, `expectedTargetDomain()`), plus the
raw verifier contract's `verifyingKeyHash()` readback. The raw BSC verifier
address is distinct and does not expose `destinationBindingHash()`.
Production-ready route manifests must also declare BSC testnet
`chainIdHex: "0x61"`; legacy/offline TOML evidence uses the equivalent
`chain_id_hex = "0x61"` only for hashing proof. The app preflight,
deployment helper, material inventory, aggregate production gate, and
`iroha_config` runtime parser reject mainnet or missing BSC chain IDs before UI
smoke can pass, while the peer-config audit rejects local route/prover
overrides instead of treating peer configs as a route source.
Evidence must also include post-deploy source-event plus route-canary hashes,
transaction ids, and canonical BSC testnet explorer URLs
(`https://testnet.bscscan.com/tx/0x...`) matching those transaction ids. The
source-event and route-canary evidence must be independent: reused
source/canary transaction ids or reused source/canary evidence hashes are
rejected by both the manifest generator and the public preflight.
Production-ready post-deploy evidence must also include
`offlineFullTomlSha256`, the SHA-256 of the canonical full TAIRA peer TOML
bundle being published with only the self-referential
`post_deploy_offline_full_toml_sha256` line omitted from the hash input.
Disabled legacy/diagnostic manifests may still be parsed for inspection, but
production-ready manifests, public preflight, and peer-config audit now fail
closed without explicit explorer URLs and the offline full-TOML hash.
Production-ready manifests must also publish role-separated
`proofArtifactHash` and `provingKeyHash` values. The manifest generator, TAIRA
route-config publisher, and `iroha_config` parser reject missing paired hashes
and reject reuse of the verifier code hash, verifier key hash, destination
binding hash, proof artifact hash, or proving key hash across incompatible
roles.
Production native prover bundles must additionally publish a role-separated
`verifierKeyArtifactHash` that binds the raw verifier-key file bytes and is not
allowed to fall back to the verifier contract's semantic `verifierKeyHash`.
The proof artifact hash must identify a real production `.r1cs` or `.wasm`
artifact, and the proving-key hash must identify a real production `.zkey`.
Fixture-shaped files, files dominated by one byte, or high-entropy files with
invalid SnarkJS/WASM headers are rejected before a native prover bundle or UI
smoke report can pass.
Known diagnostic verifier hashes, diagnostic evidence flags, or diagnostic
schema/warning text are rejected before a manifest can be marked
production-ready.

## Preflight Gates

The BSC preflight is deliberately fail-closed. A ready report requires:

- TAIRA chain id `809574f5-fee7-5e69-bfcf-52451e42d50f` and network prefix `369`
- SCCP proof and bridge-message submit paths
- production-ready `taira_bsc_xor` / `xor` manifest
- EVM account codec (`evm_hex`, codec id `2`)
- BSC testnet chain id `0x61` in production-ready route manifests and peer
  configs
- BSC testnet network id `0x0000000000000000000000000000000000000000000000000000000000000061`
- distinct token, route bridge, source bridge, and verifier addresses
- non-zero verifier code hash, verifier key hash, and destination binding hash
- production verifier material; known diagnostic verifier hashes and explicit
  diagnostic flags fail `bsc-production-verifier-material`, and deterministic
  smoke-test Groth16 fixture keys fail public preflight, browser prover
  sidecar validation, material inventory, and the aggregate production gate
- production prover material; BSC route readiness requires role-separated
  `proofArtifactHash` and `provingKeyHash` values that later bind to valid
  `.r1cs` / `.wasm` proof artifacts and `.zkey` proving keys
- SDK-valid native EVM prover bundles with explicit role-separated
  `verifierKeyArtifactHash` material for the raw verifier key bytes
- destination binding key/hash matching the normalized BSC deployment material
- non-zero post-deploy source-event and route-canary evidence hashes/tx ids
  with distinct source/canary hashes and transaction ids, plus canonical BSC
  testnet explorer URLs matching those transaction ids, and
  `offlineFullTomlSha256` binding the canonical full TAIRA peer config with the
  self-reference hash line omitted
- bounded non-placeholder TAIRA burn-record contract artifact, matching
  artifact SHA-256, canonical Base58 settlement asset definition id, complete
  VK reference, and positive gas limit when provided
- BSC testnet `eth_chainId`, deployed bytecode at all four manifest addresses,
  `TairaXOR.bridge()`, `TairaXOR.bridgeLocked()`,
  `SccpBscSourceBridge.owner()`,
  `TairaXorSccpBridge.destinationBindingHash()`, and route bridge verifier
  identity/domain readbacks matching the manifest
- no TAIRA peer config carries local `taira_bsc_xor` / `xor` route or prover
  overrides; `npm run e2e:sccp:bsc-peer-config-audit` verifies that the
  on-chain manifest path is the only production route source

## Local Verification Commands

```sh
cargo test -p iroha_config --test sccp_route_manifest_aliases
cargo check -p iroha_config
cargo check -p iroha_torii -p iroha_core
cargo test -p iroha_config sccp_route_manifest_user_config_tests
node --test ../iroha/scripts/sccp_bsc_taira_xor_deploy.test.mjs
npm test -- tests/sccpBscRoutePreflight.spec.js tests/sccp.spec.ts tests/sccpBscRouteManifest.spec.js
npm test -- tests/sccpBscCliHelp.spec.js
npm test -- tests/sccpBscPeerConfigAudit.spec.js
npm test -- \
  tests/sccpBscRoutePreflight.spec.js \
  tests/sccpBscRouteManifest.spec.js \
  tests/sccpBscRuntimeProverConfig.spec.js \
  tests/sccpBscProverManifest.spec.js \
  tests/sccpBscPeerConfigAudit.spec.js \
  tests/sccpBscLiveSmokeReadiness.spec.js \
  tests/sccpBscProductionMaterialInventory.spec.js \
  tests/sccpBscProductionGate.spec.js \
  tests/sccpBscLiveVideo.spec.js \
  tests/sccpBscCliHelp.spec.js
npm run e2e:sccp:bsc-peer-config-audit -- --dir <taira-peer-config-dir> --expected-peers 4
npm run e2e:sccp:bsc-peer-config-audit -- --ssh-creds-file ../creds.txt --expected-peers 4
npm run e2e:sccp:bsc-preflight -- --manifest-file output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json
npm run e2e:sccp:bsc-preflight
npm run e2e:sccp:bsc-smoke-readiness -- --peer-audit-report output/sccp-bsc-peer-config-audit/testnet/latest.json
npm run e2e:sccp:bsc-material-inventory -- --route-report output/sccp-bsc-preflight/testnet/latest.json
npm run e2e:sccp:bsc-material-inventory -- \
  --route-report output/sccp-bsc-preflight/testnet/latest.json \
  --destination-prover-module-url /sccp-bsc/destination-prover.js \
  --source-prover-module-url /sccp-bsc/source-prover.js \
  --runtime-prover-config-url /sccp-bsc/taira-bsc-xor-prover.config.json
npm run e2e:sccp:bsc-video -- --duration-ms 600000
npm run e2e:sccp:bsc-production-gate -- \
  --peer-audit-ssh-creds-file ../creds.txt \
  --peer-audit-remote-peer-count 4
npm run e2e:sccp:bsc-production-gate -- \
  --route-report output/sccp-bsc-preflight/testnet/latest.json \
  --peer-audit-report output/sccp-bsc-peer-config-audit/testnet/latest.json \
  --smoke-readiness-report output/sccp-bsc-smoke-readiness/testnet/latest.json \
  --material-inventory-report output/sccp-bsc-production-material-inventory/testnet/latest.json \
  --video-transcript output/sccp-bsc-live-proof/latest/transcript.json
```

The aggregate production gate intentionally has no `--allow-not-ready` mode:
unsupported flags fail before reports are regenerated or written.
All BSC SCCP operator CLIs now reject unsupported options and duplicate
singleton options before reading operator material or writing reports. Repeated
`--file` remains valid for peer-config audit, and repeated `--export` remains
valid for prover-manifest generation; other repeated flags fail closed so a
later value cannot silently override the evidence path, network, or prover
configuration. They also reject conflicting aliases for the same logical input,
such as `--evidence` with `--deployment-evidence`, `--route-report` with
`--manifest-file`, or profile-specific prover URLs alongside their generic
fallback aliases, before any referenced files are opened. The material inventory
accepts the same
`--destination-prover-module-url` and `--source-prover-module-url` aliases used
by smoke-readiness and the aggregate gate. The peer-config audit CLI also
rejects mixed local and remote audit sources, including a local `--dir` or
`--file` combined with `--ssh-host`, `--ssh-creds-file`, or their environment
equivalents, before reading peer configs or writing reports. Remote peer
audits also reject multiple password sources
(`SCCP_BSC_PEER_AUDIT_SSH_PASSWORD`, `--ssh-password-file`, and
`--ssh-creds-file`) before credential files are opened or SSH runs. Because
`--ssh-creds-file` can also carry the SSH host, it must not be combined with an
explicit `--ssh-host`. The aggregate production gate applies the same
peer-audit source and credential guards before a `--refresh true` run writes
any regenerated prerequisite reports. The sibling `../iroha` BSC deploy helper
also rejects malformed `--private-key-env` selectors before reading deployer
key material or validating RPC settings; use an uppercase environment variable
name containing only letters, digits, and underscores.

`e2e:sccp:bsc-preflight` is read-only and validates the public TAIRA route
manifest, deployment evidence, and live BSC testnet contracts through JSON-RPC.
The default RPC is the public BSC testnet seed; override it with
`--bsc-rpc-url` or `SCCP_BSC_RPC_URL`. RPC URLs must be HTTPS unless
`--allow-local-rpc` is set for localhost, and must not carry credentials, query
strings, or fragments. The underlying script still accepts
`--check-bsc-contracts false` for private dry runs, but that is not a
production-readiness gate. The public preflight also rejects inconsistent
top-level and nested aliases for BSC network id, verifier/proof hashes,
destination binding material, and post-deploy canary evidence instead of
normalizing only the first value it sees. The same preflight now fails
ambiguous route identity aliases (`routeId` / `route_id`, `assetKey` /
`asset_key`) and duplicate object aliases such as `postDeployLiveEvidence` plus
`post_deploy_live_evidence`, even when both objects carry matching values.
Production-ready route placeholder scans now also reject common handoff tokens
such as `TODO`, `changeme`, `example`, `sample`, `replace-me`, and `your-*`
fields in both the route-preflight CLI and renderer-side SCCP readiness checks,
while still allowing legitimate `bsc-testnet` and native bundle
`cross_sdk_parity` identifiers. Production BSC native bundles must not use the
legacy `cross_sdk_fixture_parity` audit hash key.
The production material inventory now applies the same handoff-token policy to
raw production-route JSON/text and route/native artifact paths, while skipping
opaque hash, URL, and base64 contract bytes so legitimate generated material is
not misclassified.

`e2e:sccp:bsc-smoke-readiness` layers the app-side prerequisites on top:
a non-placeholder production `VITE_WALLETCONNECT_PROJECT_ID`, the selected
profile's BSC destination/source
prover module URLs (`VITE_SCCP_BSC_TESTNET_*` or
`VITE_SCCP_BSC_MAINNET_*`, with generic `VITE_SCCP_BSC_*` values only as
fallbacks), a ready peer-config audit report from `--peer-audit-report` /
`SCCP_BSC_PEER_AUDIT_REPORT`, optional endpoint/manifest/RPC overrides
(`SCCP_TAIRA_TORII_URL`, `SCCP_BSC_ROUTE_MANIFEST_FILE`,
`SCCP_BSC_RPC_URL`, `BSC_RPC_URL`), the profile selector
(`SCCP_BSC_NETWORK` / `VITE_SCCP_BSC_NETWORK`), and route-bound sidecar
manifests using schema
`iroha-demo-sccp-bsc-browser-prover-manifest/v1`.
The file-backed peer-audit report must be a normal non-symlinked JSON object no
larger than 4 MiB before the smoke-readiness evaluator will bind it to the route.
Remote browser prover modules and sidecar manifests are streamed through bounded
readers before hashing or parsing, so oversized responses fail closed even when
the server omits `Content-Length`. Local browser prover modules and sidecar
manifests are also checked against the same byte limits before they are read
from disk.
Forged ready route reports that still contain secret-like fields, diagnostic
verifier material, or deterministic smoke-test Groth16 verifier fixtures are
treated as non-ready route reports even when all expected ready flags are true.
Explicit manifest URLs come from the profile-specific
`VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL` /
`VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL` or
`VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL` /
`VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL` variables first, falling back
to `VITE_SCCP_BSC_PROVER_MANIFEST_URL` and
`VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL`; otherwise the CLI derives
`<module-url>.manifest.json`. Each sidecar must bind the module to
`taira_bsc_xor` / `xor`, TAIRA chain id
`809574f5-fee7-5e69-bfcf-52451e42d50f`, network prefix `369`, BSC testnet
chain id `0x61`, BSC network id `0x...0061`, the live route deployment
addresses and hashes, a non-zero `moduleSha256`, `proofArtifactHash`, and
`provingKeyHash`, plus the expected destination/source export names. All-zero
32-byte hashes are rejected as missing production evidence, not accepted as
placeholder-safe values. If a manifest carries the same deployment or
post-deploy evidence through multiple aliases or nested sections, every
occurrence must match the public route report; a correct top-level value cannot
hide stale nested deployment or canary evidence. BSC deployment address fields,
post-deploy canary evidence, verifier code/key, destination-binding,
proof/proving, and native-bundle hash fields also reject same-object duplicate
aliases even when the duplicate value matches. Route identity and object
container aliases are also mandatory preflight checks for sidecar generation,
smoke-readiness, and the production gate, so stale reports generated before
those checks cannot satisfy current readiness. Manifests with secret-looking
keys, diagnostic verifier text/flags, or deterministic smoke-test Groth16
verifier point fixtures fail closed. Sidecars must use the canonical top-level, `deployment`, and
`postDeployLiveEvidence` field sets
generated by `e2e:sccp:bsc-prover-manifest`; unsupported top-level fields,
legacy alias containers such as `artifacts`, or edited nested
deployment/post-deploy fields are rejected before live smoke or material
inventory readiness can pass, and secret-looking unsupported field names are
redacted from reports.
The smoke-readiness evaluator requires explicit browser module availability
checks; a valid sidecar without a fetched module whose SHA-256 matches
`moduleSha256` is not enough to mark live smoke ready.
Renderer route readiness also drops a selected route manifest from the returned
readiness object when the manifest contains secret-like material, so a failed
readiness result cannot serialize leaked operator keys or recovery phrases.
The browser SCCP proof worker also rejects secret-like input/output fields and
pre-signed helper payloads with generic errors before any BSC prover module is
loaded or any result is posted back to the UI.

`e2e:sccp:bsc-material-inventory` scans the local BSC SCCP production-material
bundle before the aggregate release gate can pass. It checks the sibling
`../iroha/artifacts/sccp-bsc` directory, `output/sccp-bsc-production`, and
`public/sccp-bsc` by default; override with `--scan-path` /
`SCCP_BSC_MATERIAL_SCAN_PATHS` for a prepared release bundle. Historical
operator scratch output such as `output/sccp-bsc-deploy` and
`output/sccp-bsc-prover-manifest-cli` is not scanned by default because those
directories may intentionally contain disabled diagnostic attempts, placeholder
modules, and runtime-only private deploy files. Pass them explicitly only when
auditing stale diagnostics. The inventory
also rejects route or verifier artifacts that carry conflicting nested or
duplicate TOML aliases for route id, production-ready status, verifier/proof
hashes, network binding, post-deploy canary evidence, or SCCP domains; a
production-looking top-level value cannot mask stale nested material. The
inventory requires:

- a clean production-ready `taira_bsc_xor` route artifact with
  `proofArtifactHash` and `provingKeyHash`
- selected-network deployment evidence with no handoff placeholder material
  such as `TODO`, `example`, `replace-me`, or `your-*` operator notes; the
  evidence must identify the selected BSC network, carry distinct token,
  bridge, source-bridge, and verifier addresses, recompute the destination
  binding key/hash from the verifier and bridge material, match live BSC
  contract readback, and match the public route report's deployment fields
- production verifier material that is not flagged diagnostic and does not use
  any known diagnostic verifier key hash or deterministic smoke-test Groth16
  fixture shape, and is explicitly bound to BSC testnet plus SORA -> BSC SCCP
  domains, with `verifierKeyHash` matching the public route report and the
  deployed verifier's raw `verifyingKeyHash()` readback
- at least one production-sized circuit/proof artifact file and one
  production-sized proving-key file whose SHA-256 values match the public route
  report's `proofArtifactHash` and `provingKeyHash`; proof artifacts must be
  valid SnarkJS `.r1cs` or WASM containers, proving keys must be valid SnarkJS
  `.zkey` containers, and tiny files, all-zero files, repeated-byte files,
  repeated-pattern files, arithmetic-sequence files, dominant-byte-padded files,
  fixture-shaped binary material, malformed high-entropy containers, and
  proof/proving-key hash mismatches are fail-closed
- a productionReady Groth16 material manifest whose public signals match the
  canonical BSC SCCP message/finality binding, whose SnarkJS R1CS self-check
  reports exactly 9 public inputs and at least 4096 constraints, whose exported
  verifier key hash matches the public route verifier key hash, whose
  `selfChecks.circuitSource` reports full-message, Keccak-derived,
  placeholder-free circuit code with all 9 public signal constraints and all 9
  Solidity label bindings, and whose semantic circuit, circuit security,
  trusted setup, and reproducible-build attestations are hash-bound to the proof
  artifact, proving key, verifier key, and circuit source, signed with detached
  Ed25519 signatures, and covered by a non-empty trusted signer policy
- a sibling-SDK-validated
  `sccp-native-evm-groth16-prover-bundle-v1` manifest for BSC testnet
  (`sccp:bsc:native-evm-groth16-prover:bsc-testnet:v1`) whose verifier,
  proof, proving-key, and destination-binding hashes match the public route
  report; Ethereum-mainnet bundles, diagnostic bundle paths, handoff placeholder
  fields, and hash-drifted native bundles are rejected before the aggregate
  production gate can pass.
  Native bundle support artifacts and per-SDK support result rows must also use
  one canonical alias for each proof/hash/signal field; duplicate same-valued
  aliases are rejected by the browser runtime and material inventory. The
  browser runtime now applies the same fail-closed alias rule to backend native
  self-test outputs, destination proof byte aliases, source proof top-level
  hashes, nested message-bundle and Merkle-proof aliases, Merkle-step side/hash
  fields, and `value` / `Transfer` payload wrappers before accepting SCCP proof
  packages. Runtime config parsing also rejects duplicate aliases for BSC
  profile selection, native artifact base URLs, native SDK allowlists, material
  URLs/hashes, backend module URLs/hashes, and backend export names before any
  proof backend execution. Runtime native support artifact loading now consumes
  the strict, hash-bound native EVM prover bundle descriptor instead of
  re-reading the original bundle JSON with a separate alias order, so duplicate
  bundle path, audit-hash, SDK-artifact, and SDK-row aliases fail before any
  native support artifact or SDK implementation bytes are loaded. Native
  support artifacts also reject duplicate `proofBackend` / `proof_backend`
  aliases before any native support proof backend can execute. The production
  material inventory sidecar scanner also rejects duplicate
  `moduleSha256` / `module_sha256` / `sha256` aliases instead of accepting
  same-valued hash aliases as equivalent. The live-smoke proof-binding checks
  now apply the same rule to module availability proofs and prover-manifest
  inspection proofs, including duplicate URL aliases (`moduleUrl` / `url`,
  `manifestUrl` / `url`, `moduleUrl` / `module_url`) and duplicate
  `expectedSha256` / `expectedModuleSha256` aliases. The aggregate production
  gate applies the same duplicate URL-alias rejection to embedded smoke prover
  summaries before binding their manifest URLs and module URLs. The sibling
  `../iroha` BSC route-config helper now also rejects duplicate route manifest
  container, scalar, and required string aliases before rendering production
  TAIRA route TOML, including `destinationRollout` / `destination_rollout`,
  `tairaXorBurnRecord` / `taira_xor_burn_record`, `routeId` / `route_id`,
  `assetKey` / `asset_key`, `chainIdHex` / `chain_id_hex`, `productionReady` /
  `production_ready`, BSC domain aliases, burn-record material aliases, and
  settlement `routeId` / `assetKey` aliases. The same sibling helper now also
  rejects duplicate deployment-evidence aliases before route-manifest
  generation, including BSC profile fields, destination rollout/binding
  containers, contract address aliases, verifier hash aliases, destination
  binding hash/key aliases, optional prover hash aliases, and post-deploy
  evidence containers. Its `native-prover-bundle` command also rejects
  conflicting route-source aliases (`--route-manifest` / `--manifest`,
  `--evidence` / `--deployment-evidence`, or route and deployment sources
  together) and the sibling CLI rejects duplicate identical options before
  reading operator artifact paths.
- configured destination and source BSC browser prover module URLs plus
  canonical sidecars whose `moduleSha256` matches the local module bytes and
  whose top-level, `deployment`, and `postDeployLiveEvidence` fields contain no
  unsupported operator-edited material
- when the checked-in runtime adapter is selected, or
  `--runtime-prover-config-url` / `VITE_SCCP_BSC_PROVER_CONFIG_URL` is set, a
  canonical `iroha-demo-sccp-bsc-runtime-prover/v1` config whose referenced
  native bundle, proof artifact, proving key, verifier key, and backend module
  all exist locally or at safe URLs and re-hash to the public route deployment
- a ready public TAIRA route preflight report bound to the same deployment

Example:

```sh
npm run e2e:sccp:bsc-material-inventory -- \
  --route-report output/sccp-bsc-preflight/public-taira-production/latest.json \
  --destination-module-url /sccp-bsc-prover.js \
  --source-module-url /sccp-bsc-source-prover.js \
  --runtime-prover-config-url /sccp-bsc/taira-bsc-xor-prover.config.json \
  --output-dir output/sccp-bsc-production-material-inventory/public-taira-production
```

The inventory report serializes only relative paths, sizes, SHA-256 hashes,
public deployment summaries, and finding ids/messages. It does not serialize
raw route TOML, verifier JSON bodies, prover module source, private deploy env
values, recovery phrases, or wallet keys. Stale local files named
`production-ready` with diagnostic hashes are critical findings even if the
public TAIRA route is currently disabled.

`e2e:sccp:bsc-production-gate` is the final aggregate release gate. It consumes
the public route preflight report, TAIRA peer-config audit report, BSC
smoke-readiness report, production material inventory report, and live UI proof
transcript plus recorded video artifact, then fails closed unless all five
evidence groups are ready and bound to the same public TAIRA/BSC deployment
material.
The aggregate report keeps only public deployment summaries, peer fingerprints,
check ids, and transaction URLs; it does not echo raw peer TOML or arbitrary
operator report fields. Every aggregate input is rescanned for secret-like
material and deterministic smoke-test Groth16 verifier fixtures before readiness
can pass, so a forged lower-level report cannot smuggle fixture verifier points
through the final gate. File-backed aggregate report inputs must be normal
non-symlinked JSON object files no larger than 4 MiB; oversized files, arrays,
and primitive JSON payloads are rejected before readiness evaluation. For
file-backed peer audit reports, it re-hashes each referenced sanitized
route-only stanza file and fails
`peer-config-audit-ready` when a stanza file is missing, unsafe, symlinked,
non-regular, oversized, unreadable, or hash-mismatched. It also rejects missing,
stale, future-dated, date-only,
locale-formatted, or timezone-ambiguous report timestamps so old readiness
bundles cannot be replayed as current proof. Evidence timestamps must be integer
epoch milliseconds or canonical UTC ISO-8601 strings such as
`2026-06-06T00:00:00.000Z`. The default max report age is six hours; override
only for controlled incident
review with `--max-age-ms` / `SCCP_BSC_PRODUCTION_GATE_MAX_AGE_MS` and
`--future-skew-ms` / `SCCP_BSC_PRODUCTION_GATE_FUTURE_SKEW_MS`. Route,
smoke-readiness, material-inventory, and every peer-audit deployment summary
must also carry non-zero `proofArtifactHash` and `provingKeyHash` values before
the aggregate gate can pass. The aggregate gate also rejects stale inventory
reports that omit passing `native-evm-prover-bundle` or `runtime-prover-config`
checks, forged runtime config reports whose destination/source proof,
proving-key, or verifier hashes drift from the public route deployment, and
runtime config summaries with missing native-bundle/backend/config SHA-256
values. Runtime config and material URLs in aggregate inputs must also retain
the same safe URL policy as the generator: public paths, package-relative paths,
HTTPS URLs, or loopback HTTP URLs only, with no credentials, query strings,
fragments, or parent-directory traversal. These checks apply even if an older
report claims `ready: true`. Smoke-readiness reports must also include passing
route preflight, peer-config audit, WalletConnect, runtime-config, destination
prover module/manifest, and source prover module/manifest checks. Their
embedded destination/source prover manifests must use safe URLs and bind to the
same route, asset, TAIRA chain, BSC testnet chain, module hash, expected export,
production proof/proving-key hashes, deployment material, and post-deploy
evidence as the public route report. The UI video transcript must include the
same smoke-readiness `checkedAt`, required smoke-readiness check results, route
deployment summary, and peer-audit fingerprint; copied or forged transcripts
from another readiness run fail `video-readiness-binding`. The BSC finalize and
BSC burn slots in the UI proof must be the operator-recorded end-to-end flow
transactions, not the route post-deploy source-event or canary transactions;
the aggregate gate rejects BSC video links that reuse those post-deploy hashes.
Browser prover module summaries in the inventory report are also revalidated at
the aggregate layer: destination/source module URLs and sidecar paths must obey
the safe browser-module URL policy, module and sidecar sizes must be positive,
module/sidecar SHA-256 values must be non-zero, and sidecar `moduleSha256` must
match the module bytes hash reported by the inventory.
The aggregate gate also treats the generated offline full-TOML evidence as a
first-class inventory file summary: stale material-inventory reports that lack
the `offline-full-toml-evidence-artifact` check, forged evidence counts, hash
drift against public post-deploy `offlineFullTomlSha256`, or evidence summaries
attached to non-evidence files fail before the final gate can pass.
The transcript must also reference at least one runner-captured `.webm`
artifact and one runner-captured explorer `.png` per required transaction slot
under the transcript directory with non-zero SHA-256 and sufficient byte size;
the aggregate gate re-hashes each referenced file, validates the WebM/PNG media
signatures, and requires verifier-issued file recheck state before passing
`video-proof-files-reverified`, `video-artifact-captured`, and
`video-proof-complete`.

The smoke-readiness CLI runs BSC contract readback by default and refuses a
`--manifest-file` report because a local manifest does not prove public TAIRA
route publication. Browser prover module and manifest URLs must be
package-relative paths without parent-directory segments, HTTPS URLs, or
loopback HTTP URLs, and must not contain credentials, query strings, or
fragments. For package-relative Vite-public paths such as
`/sccp-bsc-prover.js`, the CLI verifies that the file exists under `public/`
and hashes the bytes without executing the module. For HTTPS or loopback HTTP
module URLs it performs a read-only `GET`, validates that the fetched JavaScript
is production-shaped and exports the expected prover/self-test entrypoints, and
then checks `moduleSha256` when the sidecar supplies it.

Generate sidecars only after the public preflight report is ready. The generator
hashes local package-relative module bytes without executing them, copies only
public route deployment fields, and revalidates the generated JSON with the same
smoke-readiness sidecar validator. It also rescans the input route report for
secret-like material, diagnostic verifier material, and deterministic
smoke-test Groth16 verifier fixtures before writing any sidecar:

```sh
npm run e2e:sccp:bsc-preflight -- \
  --output-dir output/sccp-bsc-preflight/public-taira-production \
  --check-bsc-contracts true

npm run e2e:sccp:bsc-prover-manifest -- \
  --route-report output/sccp-bsc-preflight/public-taira-production/latest.json \
  --module-url /sccp-bsc-prover.js \
  --direction destination \
  --export bscSccpProve \
  --out public/sccp-bsc-prover.js.manifest.json

npm run e2e:sccp:bsc-prover-manifest -- \
  --route-report output/sccp-bsc-preflight/public-taira-production/latest.json \
  --module-url /sccp-bsc-source-prover.js \
  --direction source \
  --export bscSccpSourceProve \
  --out public/sccp-bsc-source-prover.js.manifest.json
```

The route-manifest generator accepts deployment evidence, TAIRA contract,
offline full-TOML evidence, and native prover bundle JSON only as normal
non-symlinked JSON object files no larger than 4 MiB. The sidecar and
runtime-config generators apply the same bounded-object policy to
`--route-report`, then refuse local `--manifest-file` route reports, non-ready
route reports, missing or failed required preflight checks, malformed or reused
BSC deployment addresses/hashes, missing `proofArtifactHash` /
`provingKeyHash`, remote module URLs, parent-directory module paths, sidecars
whose exports do not match the selected destination/source role,
destination-only runtime configs that omit explicit source material, and
oversized local or streamed remote runtime material. The production material
inventory uses the same bounded local and remote read paths for explicit
runtime prover config URLs before parsing or canonicalizing the config. It also
requires a generated
`iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1` artifact whose
`offlineFullTomlSha256` matches the public route post-deploy evidence;
malformed evidence or evidence that serializes peer TOML/config material is a
critical inventory finding.

The sibling `../iroha` BSC deployment helper also refuses to write generated
JSON/TOML artifacts that contain private-key material, recovery phrases,
passwords, API keys/tokens, bearer tokens, session tokens, refresh tokens, or
assignment-shaped secret strings. Those checks apply before production
requirements, deployment evidence, route manifests, burn-record contracts,
native prover bundles, and offline full-TOML evidence are written.
The route-manifest, preflight, and sidecar generators fail on secret-like
manifest material without serializing the offending key path or value into
generated readiness artifacts.

The video script runs the smoke-readiness gate by default and is
operator-assisted because WalletConnect approvals, secure-vault TAIRA signing,
BSC gas, and explorer proof navigation require live wallet control.
The transcript builder only persists canonical public proof links for the four
required slots and replaces UI link labels with stable labels, so arbitrary
renderer text cannot leak into the proof transcript.
Renderer console and page-error output printed by the runner is also redacted
for assignment-shaped secrets, PEM private keys, and BIP39 recovery phrases
before it reaches stdout.

After the operator completes the UI flow, the video runner writes:

- `transaction-links.json` with canonical public SCCP proof transaction links
  only, using stable labels and stripped query strings/fragments
- `transcript.json` with inferred `tairaSourceTx`, `bscFinalizeTx`,
  `bscBurnTx`, and `tairaSettlementTx` links when the canonical explorer hosts
  and labels are present, `videoArtifacts` with relative `.webm` path, byte
  size, SHA-256, and verification status, plus `proofComplete` and
  `missingEvidence` fields
- `explorer-*.png` screenshots for captured TAIRA/BSC explorer transaction
  links, unless `--no-auto-explorer` or `SCCP_BSC_VIDEO_AUTO_EXPLORER=0` is set

Treat `proofComplete: false` as a failed proof bundle. The runner exits
non-zero after writing `transcript.json` unless the transcript is complete, or
unless `--allow-incomplete` / `SCCP_BSC_VIDEO_ALLOW_INCOMPLETE=true` is set for
a debug capture. The runner only marks proof complete when the BSC
smoke-readiness report is present and ready, all four required transaction
links are visible, the BSC finalize/burn links do not reuse the route
post-deploy source-event or canary transactions, and each required TAIRA/BSC
explorer page was captured
successfully. The transcript must also include a runner-verified `.webm` video
artifact with a non-zero hash and enough bytes to prove an actual browser
recording was captured. Each explorer screenshot must also include a
runner-verified relative `.png` path, byte size, and non-zero SHA-256 that the
aggregate gate can re-hash from disk. Relative artifact paths cannot use URI
schemes, empty segments, or raw/percent-encoded/over-encoded parent-directory
traversal. Required explorer screenshot proof paths must be distinct across the
four transaction slots. The four links must also point to distinct transactions
and to the correct explorer network for their slot; reused TAIRA or BSC hashes
are reported in `missingEvidence.duplicateTransactionSlots` and fail the
bundle.
Explorer screenshots only count when navigation remains on the same canonical
transaction URL; redirects to mainnet explorers, other hashes, or unrelated
hosts are recorded as failed screenshots. The captured explorer page must also
show the requested transaction hash in the page title or body text, so empty,
404, delayed, or transaction-not-found pages do not satisfy the proof bundle.

Use `--skip-preflight` only with `--allow-incomplete` when intentionally
recording a debug capture against a private or staged deployment whose public
TAIRA route readiness has already been verified out of band. Skipped or failed
readiness is recorded in `missingEvidence.readiness` and keeps
`proofComplete` false; the default preflight is the authoritative
public-readiness gate.
