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
The Sigstore step needs no long-lived signing key. The draft-release job alone
receives `id-token: write`; build and verification jobs remain `contents:
read`. Authenticated Iroha source verification separately uses the public-only
OpenPGP input documented below; that input cannot sign releases or commits.

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
Windows Authenticode signing. Those are independent mandatory release gates:
the workflow verifies the final macOS app, nested VPN code, notarization ticket,
Windows app, native addon, and installer before it creates or replaces a draft.

## Required authenticated Iroha source inputs

Repository variable:

- `IROHA_REF`: Exact lowercase 40-character reviewed Iroha commit SHA. It must
  equal the checked-in `REVIEWED_IROHA_REF`; the manual workflow input cannot
  override that pin.

GitHub Actions secret:

- `IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64`: Canonical unwrapped standard-base64
  encoding of a public-only OpenPGP export. The decoded keyring must contain
  exactly one primary key with fingerprint
  `9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB` and no private key.

Provision the public verifier input from an already authenticated local GPG
keyring. `gpg --export` emits public material even if the local keyring also
holds the private key:

```bash
release_repo='soramitsu/iroha-demo-javascript'
iroha_release_signer='9D1C8BFA5A0C1FEF5A8B1E5F552C2D0FD7C40BEB'
iroha_release_public_key="$(mktemp)"

gpg --batch --export --armor "$iroha_release_signer" > "$iroha_release_public_key"
test -s "$iroha_release_public_key"
test "$(
  gpg --batch --show-keys --with-colons --fingerprint "$iroha_release_public_key" |
    awk -F: '$1 == "pub" { primary = 1; next } primary && $1 == "fpr" { print $10; primary = 0 }'
)" = "$iroha_release_signer"

iroha_release_public_key_base64="$(base64 < "$iroha_release_public_key" | tr -d '\r\n')"
gh secret set IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64 \
  --repo "$release_repo" \
  --body "$iroha_release_public_key_base64"
rm -f "$iroha_release_public_key"
```

The preflight fails before build work when this secret is absent. Each build
job decodes it into a new isolated `GNUPGHOME`, rejects extra primary keys and
all private keys, checks the exact fingerprint, and removes only the expected
checkout `origin` remote. It then runs `install:release` followed by
`verify:iroha-sdk`. The resulting provenance marker makes the resolver, Vite,
native staging, and every installer-producing `dist*` command select the same
physical reviewed SDK package. The workflow has no manual SDK/native copy
bypass.

## Required production platform signing secrets

macOS signing and notarization:

- `MAC_CERTIFICATE_P12_BASE64`: Base64-encoded Developer ID Application `.p12` containing the private key.
- `MAC_CERTIFICATE_PASSWORD`: Password for the `.p12`.
- `APPLE_DEVELOPMENT_TEAM`: Apple Developer Team ID.
- `APPLE_API_KEY_P8_BASE64`: Base64-encoded App Store Connect API key `.p8`.
- `APPLE_API_KEY_ID`: App Store Connect API key ID.
- `APPLE_API_ISSUER`: App Store Connect issuer UUID.

Windows signing:

- `WIN_CSC_LINK`: Base64-encoded Windows Authenticode `.pfx`.
- `WIN_CSC_KEY_PASSWORD`: Password for the Windows signing certificate.

The release workflow does not produce unsigned platform packages. Missing,
expired, malformed, wrong-team, wrong-purpose, or partial signing credentials
fail the corresponding build before any draft asset is uploaded. Unsigned local
builds remain development-only and cannot pass the release workflow.

The checked-in release corridor is still sealed to authenticated baseline
`1bcb05eb208d8bda1610789d827a7ed97e66e56c`. That baseline predates the
mandatory native ABI 23 contract described below, so it is an intentional
release blocker rather than a publishable source pin. Do not create a release
tag until the revision, parent, trees, Cargo lock, workflow constants, and this
document have been replaced together from one reviewed signed commit. Until
that refresh, `IROHA_REF` and the manual `iroha_ref` input can only equal the
baseline—the workflow rejects every other value and the ABI gate rejects the
baseline itself.

The baseline directly descends from signed parent
`03b2bff298cabe1c1355d78379acb4a099e6d627`, has tree
`801349ba2350640643179c83821c43d8548ba021`, and contains Iroha JS tree
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
closed. The reviewed addon must report exactly `23` from
`connectNoritoBridgeAbiVersion()`, export the exact address, confidential
receive-address, versioned-transaction, subscription, Hijiri quote,
governance fingerprint, and secure private-file methods enforced by
`postinstallNativeCheck.mjs`, and report exactly `1` from
`securePrivateFileAbiVersion()`. JavaScript function arity is not an ABI signal
for N-API exports. `SOURCE-IDENTITY.json` records provenance version `3`, the
`trusted-local-cargo-v1` execution policy, both ABI versions, and the same exact
required-export inventory. Packaged Electron loading also binds the native
bytes to that manifest, using the signing-independent identity on macOS and
Windows so platform signing cannot silently replace the reviewed addon. Windows
packaging signs both `.exe` and `.node` files. The packaged runtime contains one
canonical `dist/native/iroha_js_host.node`; the SDK source package is excluded.
Every platform's `afterPack` gate opens the ASAR and requires exactly that
unpacked addon plus its sealed checksum manifest, rejecting stale native layouts
and any packaged `@iroha/iroha-js` source tree.
The post-sign hook requires the unpacked application and canonical native addon
to report `Valid`, carry a trusted timestamp, and match the exact certificate
thumbprint loaded from the release PFX; the finished NSIS installer is checked
against the same certificate and timestamp requirement.
Windows artifacts remain x64-only until the release matrix builds and seals a
genuine `win32-arm64` native addon.

macOS packaging accepts exactly one current `SoraVpnController.app`, containing
one packet-engine app and one bundle-ID-matched PacketTunnel system extension.
Both the controller and provider signatures must carry exactly Apple's
Developer-ID system-extension value, `packet-tunnel-provider-systemextension`;
the app-extension-only `packet-tunnel-provider` value is rejected.
It rejects symlinks, legacy `.bundle`/`.appex` alternatives, missing nested
executables, stripped VPN entitlements, a wrong Apple team, an unstapled app,
debugger-enabled or untimestamped signatures, or failed Gatekeeper assessment.
Electron's general signer explicitly leaves the separately signed VPN helper
tree untouched so its restricted entitlements cannot be replaced with host-app
entitlements. Linux packages copy only the exact
`sora-vpn-controller` file. The release artifact inventory is fixed at nine
non-empty regular files (the platform matrix above); missing or extra
distributables fail before checksums or Sigstore bundles are created.

The native compatibility gate also executes the current operator-bound
validation-fee proposal known-answer tests. The policy fixture binds the exact
`hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1`
network, seed-7 proposal operator, seed-1 treasury,
`7FF2EKZbaWzi5QTD6hewE2voveah` DS asset, and no payout; its fingerprint is
`4742b1f274928767564c6effa414e640e6f635874d74684b06b95414c5afa16e`.
The payout fixture binds the same operator to the upstream
`validation_fee_payout_binding_fixture`, including its immutable contract,
code hash, seed-2 pool vault, seed-3 through seed-6 recipients, DS asset, and
`5dHF5UNffENuEg9mhjYwY1jcZ1K5` XOR asset; its fingerprint is
`8fd84f6599e22db4da15f7152a914dc0091dd73a7906d5981cce37d485191c25`.
Both probes require the exact positive vector, deterministic repetition,
operator sensitivity, and strict rejection of malformed input. These fixture
identities are compatibility test data, not runtime governance configuration.

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

## Refreshing the sealed Iroha release source

The checked-in Iroha revision, tree, JavaScript tree, and sealed Cargo-lock
values below predate the secure private-file ABI. They remain only as the last
fully authenticated baseline and must not be used to publish this release.
Replace the entire pin set together from one clean signed Iroha commit that
contains bridge ABI 23 and secure private-file ABI 1, then rebuild every
platform artifact from that exact source. Do not advance an individual digest
or revision in isolation.

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
