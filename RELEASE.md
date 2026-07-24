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

- `IROHA_REF`: Exact lowercase 40-character commit SHA to check out from
  `hyperledger-iroha/iroha`. Moving branches, tags, abbreviations, and an absent
  value fail closed. Manual reruns require the same value through `iroha_ref`.

The release tag must be covered by an active GitHub tag-protection ruleset.
Before any build starts, the workflow requires GitHub to verify valid
cryptographic signatures on the annotated release tag, its wallet commit, and
the pinned Iroha commit. It also records all three immutable identities in
`SOURCE-IDENTITY.json`, adds that file to `SHA256SUMS.txt`, and signs both with
the release workflow's keyless Sigstore identity.

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

## Cutting a Release

1. Make sure `package.json` and both root version fields in `package-lock.json`
   contain the intended version, all release checks pass, both repositories are
   clean, and both release commits have GitHub-verifiable signatures.
2. Push the reviewed signed Iroha commit, then pin its exact SHA before creating
   the wallet tag:

   ```bash
   release_repo='soramitsu/iroha-demo-javascript'
   iroha_commit='<reviewed-signed-40-character-iroha-commit>'

   test "${#iroha_commit}" -eq 40
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .sha)" = "$iroha_commit"
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .commit.verification.verified)" = 'true'
   test "$(gh api "repos/hyperledger-iroha/iroha/commits/$iroha_commit" --jq .commit.verification.reason)" = 'valid'

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
