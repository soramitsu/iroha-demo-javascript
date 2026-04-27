# Release

This app releases through GitHub Actions from an existing `v*` tag. The workflow checks out this repo beside `hyperledger-iroha/iroha` because `@iroha/iroha-js` is a local `file:../iroha/javascript/iroha_js` dependency.

## Platforms

- macOS x64: `dmg`, `zip`
- macOS arm64: `dmg`, `zip`
- Windows x64: NSIS `exe`, `zip`
- Windows arm64: NSIS `exe`, `zip`
- Linux x64: `AppImage`, `deb`, `rpm`

## Required GitHub Secrets

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

Optional repository variable:

- `IROHA_REF`: Ref to check out from `hyperledger-iroha/iroha`. Defaults to `21e81d23beae46ff42344bfab771d3e311208e9d`, the local `../iroha` commit used when this release workflow was prepared.
- `SORANET_VPN_HELPER_BUNDLE_ID`: macOS VPN helper bundle ID override.
- `SORANET_VPN_PACKET_TUNNEL_BUNDLE_ID`: macOS PacketTunnel bundle ID override.
- `SORANET_VPN_APP_GROUP_ID`: macOS app-group ID override.
- `SORANET_VPN_MANAGER_DESCRIPTION`: macOS VPN manager display-name override.

## Cutting a Release

1. Make sure `package.json` has the intended version.
2. Push the tag:

   ```bash
   git tag v2.0.0
   git push origin v2.0.0
   ```

3. Wait for the `Release` workflow to finish.
4. Inspect the draft release artifacts on GitHub, smoke test them, then publish the draft.

You can also run the workflow manually from GitHub Actions with an existing tag and an optional `iroha_ref`.
