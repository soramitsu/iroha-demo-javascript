# Release

This app releases through GitHub Actions from an existing `v*` tag. The workflow checks out this repo beside `hyperledger-iroha/iroha` because `@iroha/iroha-js` is a local `file:../iroha/javascript/iroha_js` dependency.

The checked-out Iroha SDK already contains its Windows MSVC compatibility gates. Release jobs keep the current SDK source unmodified; historical signer or proof-SDK compatibility paths are not packaged.

## Platforms

- macOS x64: `dmg`, `zip`
- macOS arm64: `dmg`, `zip`
- Windows x64: NSIS `exe`, `zip`
- Linux x64: `AppImage`, `deb`, `rpm`

## Sigstore keyless provenance

The release workflow uses GitHub Actions OIDC and Cosign keyless blob signing.
It needs no long-lived signing key or repository secret. The draft-release job
alone receives `id-token: write`; build and verification jobs remain
`contents: read`.

Every distributable, `SOURCE-IDENTITY.json`, and `SHA256SUMS.txt` receives an
adjacent `.sigstore.json` bundle. Before the workflow finishes, it verifies
every bundle against this exact tagged-workflow identity:

```text
https://github.com/soramitsu/iroha-demo-javascript/.github/workflows/release.yml@refs/tags/v2.0.1
```

The issuer must be:

```text
https://token.actions.githubusercontent.com
```

The workflow refuses keyless signing unless `GITHUB_REF` is the same immutable
tag as the requested release. Manual dispatches must therefore use the release
tag as both `--ref` and the `tag` input.

Sigstore proves which tagged GitHub Actions workflow produced a byte-for-byte
artifact. It does **not** provide macOS Developer ID signing/notarization or
Windows Authenticode signing. The workflow and generated verification guide
state that distinction explicitly.

## Required production platform signing secrets

macOS signing and notarization:

- `MAC_CERTIFICATE_P12_BASE64`: Base64-encoded Developer ID Application `.p12` containing the private key.
- `MAC_CERTIFICATE_PASSWORD`: Password for the `.p12`.
- `APPLE_DEVELOPMENT_TEAM`: Apple Developer Team ID.
- `APPLE_API_KEY_P8_BASE64`: Base64-encoded App Store Connect API key `.p8`.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer UUID.

Optional macOS signing overrides:

- `APPLE_SIGN_IDENTITY`: Full codesign identity, for example `Developer ID Application: Example Corp (TEAMID)`.
- `APPLE_XCODE_SIGN_IDENTITY`: Xcode identity for the VPN helper and PacketTunnel builds. Defaults to `Developer ID Application`.

Windows signing:

- `WIN_CSC_LINK`: Base64-encoded Windows Authenticode `.pfx`.
- `WIN_CSC_KEY_PASSWORD`: Password for the Windows signing certificate.

When these secrets are absent, the workflow may still prepare unsigned draft
packages for internal diagnostics and attach keyless Sigstore provenance. Do
not publish that draft as a production release.
Do not describe those packages as notarized or Authenticode-signed.

Required repository variable for tag-push releases:

- `IROHA_REF`: Must be the reviewed v4 commit
  `1bcb05eb208d8bda1610789d827a7ed97e66e56c`. Moving branches, tags,
  abbreviations, any other commit, and an absent value fail closed. Manual
  reruns require the same value through `iroha_ref`.

That commit must directly descend from signed parent
`03b2bff298cabe1c1355d78379acb4a099e6d627`, have tree
`801349ba2350640643179c83821c43d8548ba021`, and contain Iroha JS tree
`6ce1556f6b1e1bc62f20dbc63db3e3cca6148bdc`. The workflow verifies both Iroha
commit signatures, does a complete non-shallow checkout without replacement
objects or submodules, and installs the wallet-tracked
`resources/release/iroha-v4-Cargo.lock` only after checking its exact 306,362
byte size and SHA-256
`28ca3f9224b55d89f6307f487462ec9f7b8027ccb0712323b779a568bc9ebfd1`.
It never patches the signed Iroha source.

Release-native manifests must use provenance version `3`, execution policy
`trusted-local-cargo-v1`, identify the one revision and canonical source-tree
SHA-256 selected by the complete reviewed pin set, and set
`cargo_profile: "release"` plus
`source_tree_clean: true`; missing, malformed, or unknown provenance fields fail
closed. The reviewed addon must export the native governance private-file
boundary, report exactly `1` from `securePrivateFileAbiVersion()`, and provide
the directory-ensure, bounded-read, and atomic-write methods covered by that
versioned contract. JavaScript function arity is not an ABI signal for N-API
exports. `SOURCE-IDENTITY.json` records this contract as
`secure_private_file_abi_version: 1` and lists the version probe plus all three
operations as required exports. Packaged Electron loading also binds the native
bytes to that manifest, using the signing-independent identity on macOS and
Windows so platform signing cannot silently replace the reviewed addon. Windows
packaging signs both `.exe` and `.node` files and the
post-sign hook requires Windows to report the exact unpacked
`iroha_js_host.node` signature as `Valid` whenever production signing is
enabled. Windows artifacts remain x64-only until the release matrix builds and
seals a genuine `win32-arm64` native addon.

The native compatibility gate also executes the current rules-bound
validation-fee proposal known-answer tests. The frozen rules fixture includes
the exact seed-8 bond-escrow and seed-9 slash-receiver I105 account literals;
its policy fingerprint is
`4ec93301681c32cc0d44c55939f6020a0c1a1aaa5ad24ff2723a7561873fbbf7`
and its payout-lifecycle fingerprint is
`baa786c7b6a595ecea019be7ba98c8be1eba3b141ef1527af11cd121889674b5`.
Runtime custody accounts are never copied from that test fixture: they must
match the exact `bond_escrow_account` and `slash_receiver_account` carried by
the live capabilities and retained proposal rules, and both must equal the
reviewed Taira governance escrow account.

The release tag must be covered by an active GitHub tag-protection ruleset.
Before any build starts, the workflow requires GitHub to verify valid
cryptographic signatures on the annotated release tag, its wallet commit, the
pinned Iroha commit, and that commit's reviewed parent. It records the complete
source identities in `SOURCE-IDENTITY.json`, adds that file to
`SHA256SUMS.txt`, and signs both with the release workflow's keyless Sigstore
identity.

Create this repository ruleset once before pushing the first release tag. The
absence of a `creation` rule intentionally permits authorized users to create a
new signed `v*` tag; the three listed rules prevent replacing, deleting, or
force-moving it afterward:

```bash
gh api \
  --method POST \
  repos/soramitsu/iroha-demo-javascript/rulesets \
  --input - <<'JSON'
{
  "name": "Immutable release tags",
  "target": "tag",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": {
    "ref_name": {
      "include": ["refs/tags/v*"],
      "exclude": []
    }
  },
  "rules": [
    {"type": "update"},
    {"type": "deletion"},
    {"type": "non_fast_forward"}
  ]
}
JSON
```

Optional repository variables:

- `SORANET_VPN_HELPER_BUNDLE_ID`: macOS VPN helper bundle ID override.
- `SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID`: macOS PacketTunnel bundle ID override.
- `SORANET_VPN_APP_GROUP_ID`: macOS app-group ID override.
- `SORANET_VPN_MANAGER_DESCRIPTION`: macOS VPN manager display-name override.

The v2.0.1 Taira governance runtime also requires the non-secret
`governance-runtime.json` manifest in Electron's per-user application-data
directory:

```text
<Electron app.getPath("userData")>/governance-runtime.json
```

Its only fields are `schema`, `validationFee`, and `cbsiCoreApiBaseUrl`.
`schema` must be `sora.wallet.governance-runtime.v1`; `validationFee` must be
the exact generated `{enabled, ledgerBinding, expected}` config; and
`cbsiCoreApiBaseUrl` must be the credential-free HTTPS CBSI Core origin serving
both `/v1/validation-fee/policy` and `/v1/validation-fee/status`. Install the
manifest atomically before a Finder, Start-menu, or desktop-entry launch. The
app reloads it on every policy read and fails closed if it is missing or
invalid.

`GOVERNANCE_VALIDATION_FEE_CONFIG_JSON` and `CBSI_CORE_API_BASE_URL` remain a
strict managed-launch override. If either variable is present, both are
required and the manifest is not used. Partial or malformed overrides fail
closed.

Do not hand-edit or synthesize the Parliament evidence in the generated config.
Missing or mismatched inputs intentionally leave validation-fee policy writes
unavailable.

## Local sealed Iroha release source

The checked-in Iroha revision, tree, JavaScript tree, and sealed Cargo-lock
values below predate the secure private-file ABI. They remain only as the last
fully authenticated baseline and must not be used to publish this release.
Replace the entire pin set together from one clean signed Iroha commit that
contains ABI v1, then rebuild every platform artifact from that exact source.
Do not advance an individual digest or revision in isolation.

These commands are local only; they do not contact Taira or deploy anything.
Create the install source through Git transport. Never use `git clone --local`,
a linked worktree, alternates, or a shallow or partial clone.

```bash
build_source='/absolute/path/to/clean-signed-build-source'
sealed_source='/absolute/path/to/iroha-native-plain-parliament-cash-handoff-v4-arity-signed-source'
wallet_root='/absolute/path/to/iroha-demo-javascript'
reviewed_commit='1bcb05eb208d8bda1610789d827a7ed97e66e56c'

test -d "$build_source"
test ! -e "$sealed_source"

GIT_CONFIG_GLOBAL=/dev/null \
GIT_CONFIG_NOSYSTEM=1 \
GIT_NO_LAZY_FETCH=1 \
GIT_NO_REPLACE_OBJECTS=1 \
GIT_TERMINAL_PROMPT=0 \
  /usr/bin/git clone --no-local --no-checkout \
    "$build_source" "$sealed_source"

/usr/bin/git -C "$sealed_source" checkout --detach "$reviewed_commit"
/usr/bin/git -C "$sealed_source" remote remove origin

test "$(git -C "$sealed_source" rev-parse HEAD)" = "$reviewed_commit"
test "$(git -C "$sealed_source" rev-parse 'HEAD^{tree}')" = \
  '801349ba2350640643179c83821c43d8548ba021'
test "$(git -C "$sealed_source" rev-parse HEAD:javascript/iroha_js)" = \
  '6ce1556f6b1e1bc62f20dbc63db3e3cca6148bdc'
test "$(git -C "$sealed_source" rev-parse --abbrev-ref HEAD)" = HEAD
test "$(git -C "$sealed_source" rev-parse --is-shallow-repository)" = false
test -z "$(git -C "$sealed_source" remote)"
/usr/bin/git -C "$sealed_source" verify-commit "$reviewed_commit"
/usr/bin/git -C "$sealed_source" fsck --full --strict --no-dangling

native_dir="$sealed_source/javascript/iroha_js/native"
mkdir -p "$native_dir"
test ! -e "$sealed_source/Cargo.lock"
test ! -e "$native_dir/iroha_js_host.node"
test ! -e "$native_dir/iroha_js_host.checksums.json"

/usr/bin/install -m 0444 \
  "$wallet_root/resources/release/iroha-v4-Cargo.lock" \
  "$sealed_source/Cargo.lock"
/usr/bin/install -m 0444 \
  "$build_source/javascript/iroha_js/native/iroha_js_host.node" \
  "$native_dir/iroha_js_host.node"
/usr/bin/install -m 0444 \
  "$build_source/javascript/iroha_js/native/iroha_js_host.checksums.json" \
  "$native_dir/iroha_js_host.checksums.json"

test "$(shasum -a 256 "$native_dir/iroha_js_host.node" | awk '{print $1}')" = \
  '3ae0f3fbb54f9144f9d96c92aa8fe0816cc0f6dcc2aa01952eb3ae5fe04c8b36'
test "$(shasum -a 256 "$native_dir/iroha_js_host.checksums.json" | awk '{print $1}')" = \
  'a85f0afd79ae30a72c983272657fb9c1135db36e1a1fbc613b2fdb121dad96d1'

cd "$wallet_root"
IROHA_ROOT="$sealed_source" npm run test:iroha-sdk-source
IROHA_ROOT="$sealed_source" npm run install:release
IROHA_ROOT="$sealed_source" npm run verify:iroha-sdk
```

The resulting wallet-lock installation digest is
`32e6035d81d7e2b8c84d25db32f5d002b1af9664b9358f1b06a971f5c425d2d2`.
It deliberately includes the SDK's nested `@noble/ciphers` 1.3.0 dependency;
hashing only the bare npm package payload is not equivalent to verifying the
installed runtime closure.

## Cutting a Release

1. Make sure `package.json` and both root version fields in `package-lock.json`
   contain the intended version, all release checks pass, both repositories are
   clean, and both release commits have GitHub-verifiable signatures. Run the
   read-only Taira contract check before any signed live flow, then require the
   official v2 identity:

   ```bash
   npm run verify:live:taira-reads
   npm run verify:live:taira-v2
   ```

   The first command accepts the known archived deployment for diagnostic
   reads and reports it as read-only. The second must observe chain
   `fc56984b-2be7-431d-840e-21514d1883f0` with prefix `369` and the complete
   first-release OpenAPI write inventory; an archived, incomplete,
   conflicting, unverified, or unreachable endpoint blocks the release.
   Both checks are GET-only. Run `npm run verify:live` separately only after
   this gate passes to exercise signed mutations.

2. Push the reviewed signed Iroha commit and its signed parent, then pin the
   exact reviewed SHA before creating the wallet tag:

   ```bash
   release_repo='soramitsu/iroha-demo-javascript'
   iroha_commit='1bcb05eb208d8bda1610789d827a7ed97e66e56c'
   iroha_parent='03b2bff298cabe1c1355d78379acb4a099e6d627'

   test "${#iroha_commit}" -eq 40
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .sha)" = "$iroha_commit"
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .commit.verification.verified)" = 'true'
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .commit.verification.reason)" = 'valid'
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_parent" --jq .sha)" = "$iroha_parent"
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_parent" --jq .commit.verification.verified)" = 'true'
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_parent" --jq .commit.verification.reason)" = 'valid'

   gh variable set IROHA_REF --repo "$release_repo" --body "$iroha_commit"
   test "$(gh variable get IROHA_REF --repo "$release_repo")" = "$iroha_commit"
   ```

3. Create one signed annotated tag on the signed wallet release commit. Never
   move, replace, delete, or force-push a release tag:

   ```bash
   release_tag='v2.0.1'
   release_signing_key='<release-GPG-key-id>'
   wallet_commit="$(git rev-parse HEAD)"

   test -z "$(git status --porcelain=v1)"
   git verify-commit "$wallet_commit"
   test "$(node -p "require('./package.json').version")" = "${release_tag#v}"
   test "$(node -p "require('./package-lock.json').version")" = "${release_tag#v}"
   test "$(node -p "require('./package-lock.json').packages[''].version")" = "${release_tag#v}"

   git tag -s -u "$release_signing_key" -a "$release_tag" "$wallet_commit" \
     -m "SORA Wallet $release_tag"
   git verify-tag "$release_tag"
   test "$(git rev-list -n 1 "$release_tag")" = "$wallet_commit"
   git push --atomic origin master "refs/tags/$release_tag"
   ```

   The tag push starts the workflow with the pinned `IROHA_REF`. Do not start a
   duplicate manual run unless that automatic run needs to be replaced.

4. To rerun the signed draft, dispatch only from the same protected tag and
   supply the same immutable Iroha SHA explicitly:

   ```bash
   gh workflow run Release \
     --ref v2.0.1 \
     -f tag=v2.0.1 \
     -f iroha_ref=<reviewed-immutable-iroha-commit>
   ```

5. Wait for the workflow to upload the draft distributables,
   `SOURCE-IDENTITY.json`, and checksums, create every Sigstore bundle, verify
   them locally, upload the bundles and `SIGSTORE-VERIFY.md`, and confirm the
   remote draft inventory exactly matches. Any failure leaves the release
   unpublished.
6. Download and smoke-test the draft packages. Verify an artifact and the
   checksum manifest before publishing:

   ```bash
   certificate_identity='https://github.com/soramitsu/iroha-demo-javascript/.github/workflows/release.yml@refs/tags/v2.0.1'
   certificate_oidc_issuer='https://token.actions.githubusercontent.com'
   certificate_github_workflow_ref='refs/tags/v2.0.1'
   certificate_github_workflow_repository='soramitsu/iroha-demo-javascript'
   certificate_github_workflow_sha='<v2.0.1-tagged-commit-sha>'
   artifact='SORA-Wallet-2.0.1-mac-arm64.dmg'

   cosign verify-blob "$artifact" \
     --bundle "$artifact.sigstore.json" \
     --certificate-identity "$certificate_identity" \
     --certificate-oidc-issuer "$certificate_oidc_issuer" \
     --certificate-github-workflow-ref "$certificate_github_workflow_ref" \
     --certificate-github-workflow-repository "$certificate_github_workflow_repository" \
     --certificate-github-workflow-sha "$certificate_github_workflow_sha"

   cosign verify-blob SOURCE-IDENTITY.json \
     --bundle SOURCE-IDENTITY.json.sigstore.json \
     --certificate-identity "$certificate_identity" \
     --certificate-oidc-issuer "$certificate_oidc_issuer" \
     --certificate-github-workflow-ref "$certificate_github_workflow_ref" \
     --certificate-github-workflow-repository "$certificate_github_workflow_repository" \
     --certificate-github-workflow-sha "$certificate_github_workflow_sha"

   cosign verify-blob SHA256SUMS.txt \
     --bundle SHA256SUMS.txt.sigstore.json \
     --certificate-identity "$certificate_identity" \
     --certificate-oidc-issuer "$certificate_oidc_issuer" \
     --certificate-github-workflow-ref "$certificate_github_workflow_ref" \
     --certificate-github-workflow-repository "$certificate_github_workflow_repository" \
     --certificate-github-workflow-sha "$certificate_github_workflow_sha"

   shasum -a 256 -c SHA256SUMS.txt
   ```

7. Only after every draft artifact passes those checks, publish exactly that
   draft:

   ```bash
   gh release edit v2.0.1 \
     --repo soramitsu/iroha-demo-javascript \
     --draft=false \
     --latest
   ```

The workflow itself never makes a release public.
