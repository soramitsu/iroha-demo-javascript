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

Every distributable and `SHA256SUMS.txt` receives an adjacent
`.sigstore.json` bundle. Before the workflow finishes, it verifies every bundle
against this exact tagged-workflow identity:

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

## Optional platform signing secrets

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

When these secrets are absent, the operating-system packages remain unsigned
at the OS layer, but the workflow still creates and verifies their keyless
Sigstore provenance bundles. Do not describe those packages as notarized or
Authenticode-signed.

Optional repository variable:

- `IROHA_REF`: Ref to check out from `hyperledger-iroha/iroha`. Defaults to the current `main` SDK. Pin this to the reviewed release commit before publishing production artifacts.
- `SORANET_VPN_HELPER_BUNDLE_ID`: macOS VPN helper bundle ID override.
- `SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID`: macOS PacketTunnel bundle ID override.
- `SORANET_VPN_APP_GROUP_ID`: macOS app-group ID override.
- `SORANET_VPN_MANAGER_DESCRIPTION`: macOS VPN manager display-name override.

The v2.0.1 Taira governance runtime also requires these non-secret launch
inputs:

- `GOVERNANCE_VALIDATION_FEE_CONFIG_JSON`: the exact generated
  `{enabled, ledgerBinding, expected}` release config.
- `CBSI_CORE_API_BASE_URL`: the credential-free HTTPS CBSI Core origin serving
  both `/v1/validation-fee/policy` and `/v1/validation-fee/status`.

Do not hand-edit or synthesize the Parliament evidence in the generated config.
Missing or mismatched inputs intentionally leave validation-fee policy writes
unavailable.

## Cutting a Release

1. Make sure `package.json` and `package-lock.json` contain the intended
   version, all release checks pass, and both repositories are committed.
2. Pin `iroha_ref` to the reviewed immutable Iroha commit. Do not release from
   the moving `main` ref.
3. Create and push the tag:

   ```bash
   git tag v2.0.1
   git push origin v2.0.1
   ```

4. Prepare or rerun the signed draft from the tag itself:

   ```bash
   gh workflow run Release \
     --ref v2.0.1 \
     -f tag=v2.0.1 \
     -f iroha_ref=<reviewed-immutable-iroha-commit>
   ```

5. Wait for the workflow to upload the draft distributables and checksums,
   create every Sigstore bundle, verify them locally, upload the bundles and
   `SIGSTORE-VERIFY.md`, and confirm the remote draft inventory exactly matches.
   Any failure leaves the release unpublished.
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
