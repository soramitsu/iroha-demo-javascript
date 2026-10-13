import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const between = (
  value: string,
  startMarker: string,
  endMarker: string,
): string => {
  const start = value.indexOf(startMarker);
  const end = value.indexOf(endMarker, start + startMarker.length);
  expect(start, `missing source marker ${startMarker}`).toBeGreaterThanOrEqual(
    0,
  );
  expect(end, `missing source marker ${endMarker}`).toBeGreaterThan(start);
  return value.slice(start, end);
};

describe("v2.0.1 governance release boundary", () => {
  it("ships only the current fc569 Taira identity and current SDK build", () => {
    const packageJson = JSON.parse(source("package.json")) as {
      version: string;
      scripts: Record<string, string>;
    };
    const packageLock = JSON.parse(source("package-lock.json")) as {
      packages: Record<string, Record<string, unknown>>;
    };
    const npmConfig = source(".npmrc");
    const chains = source("src/constants/chains.ts");
    const sdkCompatibility = source("scripts/iroha-sdk-compat.mjs");
    const releaseSource = source("scripts/iroha-js-release-source.mjs");
    const releaseSourcePreparation = source(
      "scripts/prepare-iroha-release-source.mjs",
    );
    const releaseWorkflow = source(".github/workflows/release.yml");
    const electronBuilder = source("electron-builder.yml");
    const postinstallNativeCheck = source("scripts/postinstallNativeCheck.mjs");
    const postinstall = source("scripts/postinstall.mjs");
    const copyNative = source("scripts/copy-iroha-native.mjs");
    const runtimeNativeCheck = source("electron/irohaJsNativeDir.ts");
    const runtimeNativeProvenance = source(
      "electron/irohaJsNativeProvenance.ts",
    );
    const releaseNotes = source("RELEASE.md");

    expect(packageJson.version).toBe("2.0.1");
    expect(packageJson.scripts.build).not.toContain("taira-v1");
    expect(packageJson.scripts).not.toHaveProperty("build:native:taira-v1");
    expect(chains).toContain("fc56984b-2be7-431d-840e-21514d1883f0");
    expect(chains).not.toContain("809574f5-fee7-5e69-bfcf-52451e42d50f");
    expect(chains.indexOf("TAIRA_CHAIN_PRESET")).toBeLessThan(
      chains.indexOf("MINAMOTO_CHAIN_PRESET"),
    );
    expect(sdkCompatibility).toContain(
      '"computeValidationFeePayoutLifecycleProposalFingerprintV1"',
    );
    expect(sdkCompatibility).toContain(
      '"computeValidationFeePolicyProposalFingerprintV1"',
    );
    expect(sdkCompatibility).toContain(
      '"@iroha/iroha-js/instruction-builders"',
    );
    expect(packageJson.scripts["install:release"]).toBe(
      "node scripts/install-iroha-js-release.mjs",
    );
    expect(packageJson.scripts["verify:release"]).toContain("verify:iroha-sdk");
    expect(packageJson.scripts["build:release"]).toContain("verify:iroha-sdk");
    expect(packageJson.scripts).not.toHaveProperty("dist:release");
    for (const command of ["dist", "dist:mac", "dist:win", "dist:linux"]) {
      expect(packageJson.scripts[command]).toMatch(
        /^npm run build:release &&/u,
      );
      expect(packageJson.scripts[command]).not.toContain("npm run build &&");
    }
    expect(packageLock.packages["node_modules/@iroha/iroha-js"]).toMatchObject({
      resolved: "file:../iroha/javascript/iroha_js",
      version: "0.0.3",
    });
    expect(
      packageLock.packages["node_modules/@iroha/iroha-js"],
    ).not.toHaveProperty("link");
    expect(packageLock.packages).not.toHaveProperty(
      "../iroha/javascript/iroha_js",
    );
    expect(npmConfig).toBe("install-links=true\n");
    expect(sdkCompatibility).toContain(
      "verifyInstalledReleaseDependencies(projectRoot, releaseRoot)",
    );
    expect(sdkCompatibility).toContain(
      "IROHA_JS_SDK_ROOT cannot override the reviewed IROHA_ROOT release source.",
    );
    expect(releaseSource).toContain(
      '"03b2bff298cabe1c1355d78379acb4a099e6d627"',
    );
    expect(releaseSource).toContain(
      '"1bcb05eb208d8bda1610789d827a7ed97e66e56c"',
    );
    expect(releaseSource).toContain(
      '"801349ba2350640643179c83821c43d8548ba021"',
    );
    expect(releaseSource).toContain(
      '"6ce1556f6b1e1bc62f20dbc63db3e3cca6148bdc"',
    );
    expect(releaseSource).toContain(
      '"28ca3f9224b55d89f6307f487462ec9f7b8027ccb0712323b779a568bc9ebfd1"',
    );
    for (const sealedReleaseDigest of [
      "32e6035d81d7e2b8c84d25db32f5d002b1af9664b9358f1b06a971f5c425d2d2",
      "3ae0f3fbb54f9144f9d96c92aa8fe0816cc0f6dcc2aa01952eb3ae5fe04c8b36",
      "a85f0afd79ae30a72c983272657fb9c1135db36e1a1fbc613b2fdb121dad96d1",
      "2ff667709ec8b915c68479707521981b8bc833138e0ba0d6a1dd2ee42726b8f8",
    ]) {
      expect(releaseSource).toContain(sealedReleaseDigest);
    }
    expect(releaseSource).toContain('cargo_profile: "release"');
    expect(releaseSource).not.toContain('cargo_profile: "debug"');
    expect(releaseSource).toContain("source_parent_commit");
    expect(releaseSource).toContain("source_tree");
    expect(releaseSource).not.toContain("source_base_commit");
    expect(releaseSource).not.toContain("source_base_js_tree");
    expect(releaseSource).toContain("--is-shallow-repository");
    expect(releaseSource).toContain("must not borrow Git objects");
    expect(releaseSource).toContain(
      "must use its canonical physical .git directory without shared Git state",
    );
    expect(releaseSource).toContain("must use a detached HEAD");
    expect(releaseSource).toContain("must not retain Git remotes");
    expect(releaseSource).toContain("must not use hard-linked Git metadata");
    expect(releaseSource).toContain("must not use partial or promisor Git");
    expect(releaseSource).toContain(
      "must be one canonical physical non-hard-linked file",
    );
    expect(releaseSource).toContain('flag: "wx"');
    expect(releaseSource).toContain("mode: 0o444");
    expect(releaseSource).toContain(
      'git(root, "fsck", "--full", "--strict", "--no-dangling")',
    );
    expect(releaseSource).toContain("GIT_ALTERNATE_OBJECT_DIRECTORIES");
    expect(releaseSource).toContain("GIT_CONFIG_COUNT");
    expect(releaseWorkflow).toContain('NODE_VERSION: "24"');
    expect(releaseWorkflow).toContain('RUST_TOOLCHAIN: "1.93.1"');
    expect(releaseWorkflow).toContain(
      'IROHA_JS_NATIVE_BUILD_PROFILE: "release"',
    );
    expect(releaseWorkflow).toContain(
      'IROHA_JS_NATIVE_SOURCE_GIT_REVISION: "1bcb05eb208d8bda1610789d827a7ed97e66e56c"',
    );
    expect(releaseWorkflow).toContain(
      'REVIEWED_IROHA_PARENT: "03b2bff298cabe1c1355d78379acb4a099e6d627"',
    );
    expect(releaseWorkflow).toContain("resources/release/iroha-v4-Cargo.lock");
    expect(
      releaseWorkflow.match(
        /- name: Prepare authenticated Iroha release source/gu,
      )?.length,
    ).toBe(2);
    expect(
      releaseWorkflow.match(/run: npm run install:release/gu)?.length,
    ).toBe(2);
    expect(
      releaseWorkflow.match(/run: npm run verify:iroha-sdk/gu)?.length,
    ).toBe(2);
    expect(releaseWorkflow).toContain(
      "secrets.IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64",
    );
    expect(releaseWorkflow).toContain(
      "IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64 is required",
    );
    expect(releaseWorkflow).not.toContain("copyFileSync(sourceNode");
    expect(
      releaseWorkflow.match(/- name: Build reviewed Iroha native binding/gu)
        ?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      releaseWorkflow.match(/CARGO_TARGET_DIR: \$\{\{ runner\.temp \}\}/gu)
        ?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(releaseWorkflow).toContain(
      "reviewed native build failed verification",
    );
    expect(releaseWorkflow).not.toContain("run: npm ci\n");
    expect(releaseSourcePreparation).toContain(
      "assertExactReviewedPublicKey(publicListing, secretListing)",
    );
    expect(releaseSourcePreparation).toContain("IROHA_ROOT: sourceRoot");
    expect(releaseSourcePreparation).toContain(
      '["-C", sourceRoot, "remote", "remove", "origin"]',
    );
    expect(releaseSource).toContain('"gpg.exe"');
    expect(releaseSource).toContain('"git.exe"');
    expect(releaseWorkflow).toContain(
      'test "$(git -C iroha rev-parse --is-shallow-repository)" = "false"',
    );
    expect(releaseWorkflow).toContain('"sora.wallet.release-source.v3"');
    expect(releaseWorkflow).not.toContain('"sora.wallet.release-source.v2"');
    expect(releaseWorkflow).not.toContain('"sora.wallet.release-source.v1"');
    expect(releaseWorkflow).not.toContain("rustup toolchain install stable");
    expect(releaseWorkflow).not.toContain("rustup default stable");
    expect(releaseWorkflow).toContain("connect_norito_bridge_abi_version: 29");
    expect(releaseWorkflow).not.toContain(
      "validation_fee_policy_fingerprint_arity",
    );
    expect(releaseWorkflow).not.toContain(
      "validation_fee_payout_lifecycle_fingerprint_arity",
    );
    expect(releaseWorkflow).toContain("secure_private_file_abi_version: 1");
    expect(releaseWorkflow).not.toContain(
      "secure_private_directory_ensure_arity",
    );
    expect(releaseWorkflow).not.toContain("secure_private_file_read_arity");
    expect(releaseWorkflow).not.toContain(
      "secure_private_file_write_atomic_arity",
    );
    for (const secureStorageExport of [
      "securePrivateFileAbiVersion",
      "securePrivateDirectoryEnsure",
      "securePrivateFileRead",
      "securePrivateFileWriteAtomic",
    ]) {
      expect(releaseWorkflow).toContain(`"${secureStorageExport}"`);
    }
    for (const fingerprint of [
      "4742b1f274928767564c6effa414e640e6f635874d74684b06b95414c5afa16e",
      "8fd84f6599e22db4da15f7152a914dc0091dd73a7906d5981cce37d485191c25",
    ]) {
      expect(releaseWorkflow).toContain(fingerprint);
      expect(postinstallNativeCheck).toContain(fingerprint);
      expect(runtimeNativeCheck).toContain(fingerprint);
      expect(releaseNotes).toContain(fingerprint);
    }
    for (const retiredFingerprint of [
      "85ecc42a75d3e0da96349b75f0c1ccd1ffb6dff2334486b67edb39f7a86f6a90",
      "fa1e71c8bec0601d590038626c2a8d3a4b2350f5dd23f76b0a2dfdbbf9e5a84b",
      "4ec93301681c32cc0d44c55939f6020a0c1a1aaa5ad24ff2723a7561873fbbf7",
      "baa786c7b6a595ecea019be7ba98c8be1eba3b141ef1527af11cd121889674b5",
    ]) {
      for (const releaseBoundary of [
        releaseWorkflow,
        postinstallNativeCheck,
        runtimeNativeCheck,
        releaseNotes,
      ]) {
        expect(releaseBoundary).not.toContain(retiredFingerprint);
      }
    }
    for (const nativeCheck of [postinstallNativeCheck, runtimeNativeCheck]) {
      for (const activeRuntimeExport of [
        "accountAddressParseEncoded",
        "accountAddressRender",
        "noritoDecodeInstruction",
        "noritoEncodeInstruction",
        "inspectSubscriptionTriggerAction",
      ]) {
        expect(nativeCheck).toContain(`"${activeRuntimeExport}"`);
      }
      expect(nativeCheck).not.toContain("REQUIRED_NATIVE_EXPORT_ARITIES");
      expect(nativeCheck).toContain("validationFeePolicyProposalFingerprintV1");
      expect(nativeCheck).toContain(
        "validationFeePayoutLifecycleProposalFingerprintV1",
      );
      expect(nativeCheck).toContain(
        "REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION = 29",
      );
      expect(nativeCheck).toContain("connectNoritoBridgeAbiVersion");
      expect(nativeCheck).toContain(
        "REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION = 1",
      );
      expect(nativeCheck).toContain("securePrivateFileAbiVersion");
      expect(nativeCheck).toContain('"7FF2EKZbaWzi5QTD6hewE2voveah"');
      expect(nativeCheck).toContain('"5dHF5UNffENuEg9mhjYwY1jcZ1K5"');
      expect(nativeCheck).toContain(
        '"irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw"',
      );
      expect(nativeCheck).toContain(
        "REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON",
      );
      expect(nativeCheck).toContain(
        "REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR",
      );
      expect(nativeCheck).toContain(
        "validation-fee policy must contain exactly",
      );
      expect(nativeCheck).toContain("payout binding must contain exactly");
    }
    for (const retiredConfidentialExport of [
      "buildConfidentialTransferProofV2",
      "buildConfidentialUnshieldProofV2",
      "buildConfidentialUnshieldProofV3",
    ]) {
      expect(releaseWorkflow).not.toContain(`"${retiredConfidentialExport}"`);
      expect(postinstallNativeCheck).not.toContain(
        `"${retiredConfidentialExport}"`,
      );
      expect(runtimeNativeCheck).not.toContain(
        `"${retiredConfidentialExport}"`,
      );
    }
    expect(releaseNotes).not.toContain("confidential-proof");
    expect(releaseNotes).not.toContain("rules-bound");
    expect(postinstallNativeCheck).toContain(
      "IROHA_JS_NATIVE_SOURCE_GIT_REVISION",
    );
    expect(postinstallNativeCheck).toContain(
      'checksumEntry.cargo_profile !== "release"',
    );
    expect(postinstallNativeCheck).toContain(
      "checksumEntry.source_tree_clean !== true",
    );
    for (const releaseNativeConsumer of [postinstall, copyNative]) {
      expect(releaseNativeConsumer).toContain(
        "Refusing to rebuild a release native binding from the installed package",
      );
    }
    expect(runtimeNativeCheck).toContain(
      "materializeRequiredPackagedIrohaJsNativeSnapshot",
    );
    expect(runtimeNativeCheck).toContain(
      "provenanceVerifiedPackagedNativeBindings",
    );
    expect(runtimeNativeCheck).toContain('"__IROHA_NORITO_BINDING__"');
    expect(runtimeNativeCheck).toContain("Object.freeze(nativeModule)");
    expect(runtimeNativeCheck).toContain(
      "cannot trust a pre-populated native binding",
    );
    expect(runtimeNativeProvenance).toContain(
      '"1bcb05eb208d8bda1610789d827a7ed97e66e56c"',
    );
    expect(runtimeNativeProvenance).toContain(
      'entry.cargo_profile === "release"',
    );
    expect(runtimeNativeProvenance).toContain(
      "entry.source_tree_clean === true",
    );
    expect(runtimeNativeProvenance).toContain(
      "machOSigningIndependentSha256(nativeBytes, platformKey)",
    );
    expect(runtimeNativeProvenance).toContain(
      "Mach-O __LINKEDIT virtual size is non-canonical",
    );
    expect(runtimeNativeProvenance).toContain("peSigningIndependentSha256(");
    expect(runtimeNativeProvenance).toContain(
      "hasExactKeys(entries, [platformKey])",
    );
    expect(runtimeNativeProvenance).toContain(
      "materializeRequiredPackagedIrohaJsNativeSnapshot",
    );
    expect(runtimeNativeProvenance).toContain("constants.O_NOFOLLOW");
    expect(electronBuilder).toContain("afterSign: scripts/after-sign.mjs");
    expect(electronBuilder).toContain(
      "asarUnpack:\n  - dist/native/iroha_js_host.node",
    );
    expect(electronBuilder).toContain('  - "!node_modules/@iroha/iroha-js/**"');
    expect(electronBuilder).toContain("- .node");
    expect(electronBuilder).not.toMatch(/^asar:\s*false\s*$/mu);
  });

  it("keeps governance renderer DTOs and bridge methods key-free", () => {
    const rendererTypes = between(
      source("src/types/iroha.d.ts"),
      "export interface GovernancePrepareContext",
      "export interface SigningAlgorithmOption",
    );
    const preloadTypes = between(
      source("electron/preload.ts"),
      "type GovernanceWriteOperation",
      "type SubscriptionStatusView",
    );
    const rendererService = between(
      source("src/services/iroha.ts"),
      "export const getGovernanceCapabilities",
      "export const getExplorerMetrics",
    );

    for (const value of [rendererTypes, preloadTypes, rendererService]) {
      expect(value).not.toMatch(/privateKey|secretKey|seedPhrase/u);
      expect(value).not.toMatch(/finalizeGovernance|GovernanceFinalize(?!d)/u);
    }
  });

  it("contains no legacy governance or validation-fee proof adapters", () => {
    const productionBoundary = [
      source("electron/governanceCapabilities.ts"),
      source("electron/governanceRoutes.ts"),
      source("electron/governanceValidationFee.ts"),
      source("electron/governanceValidationFeeDraft.ts"),
      source("electron/irohaJsNativeDir.ts"),
      source("scripts/iroha-sdk-compat.mjs"),
      source("scripts/postinstallNativeCheck.mjs"),
      source("src/governance/model.ts"),
      source("src/stores/parliament.ts"),
    ].join("\n");

    for (const forbidden of [
      "validationFeeCurrentPolicyProofRequestV1",
      "validationFeeVerifyCurrentPolicyProofV1",
      "normalizeValidationFeeLedgerBindingV1",
      "GOVERNANCE_VALIDATION_FEE_LEDGER_BINDING_JSON",
      "/v1/gov/finalize",
      'path: "/v1/gov/proposals/deploy-contract"',
      'path: "/v1/gov/proposals/runtime-upgrade"',
      'path: "/v1/gov/proposals/sccp-route-governance"',
    ]) {
      expect(productionBoundary).not.toContain(forbidden);
    }
  });

  it("loads runtime config and promotes finality only in trusted main IPC", () => {
    const main = source("electron/main.ts");
    const preload = source("electron/preload.ts");
    const runtimeConfig = source("electron/governanceRuntimeConfig.ts");

    expect(runtimeConfig).toContain('"sora.wallet.governance-runtime.v1"');
    expect(runtimeConfig).toContain('"governance-runtime.json"');
    expect(runtimeConfig).toContain(
      "refusing to mix environment and file runtime configuration",
    );
    expect(main).toContain("loadGovernanceRuntimeConfig({");
    expect(main).toContain('userDataPath: app.getPath("userData")');
    expect(main).toContain("fetchGovernanceValidationFeePolicyInMain({");
    expect(main).toContain("fetcher: nodeFetch");
    expect(source("electron/governanceValidationFee.ts")).not.toContain(
      "globalThis.fetch",
    );
    expect(preload).toContain(
      "parseGovernanceValidationFeePolicyView(\n    await ipcRenderer.invoke(GOVERNANCE_VALIDATION_FEE_POLICY_IPC_CHANNEL)",
    );
    expect(preload).not.toContain("fetchCoreGovernanceValidationFeePolicy");
    expect(preload).not.toContain("trustScopeHash");
  });

  it("does not ship or register the retired proposal-backed PLAIN electorate handoff", () => {
    const main = source("electron/main.ts");
    const preload = source("electron/preload.ts");
    const builder = source("electron-builder.yml");
    const bridge = source("src/types/iroha.d.ts");
    const services = source("src/services/iroha.ts");

    for (const production of [main, preload, bridge, services]) {
      expect(production).not.toMatch(
        /GovernancePlainReferendum|governancePlainReferendum|prepareGovernancePlainBallot|CastPlainBallot/u,
      );
    }
    expect(builder).not.toContain("governance-referendum-source.json");
  });
});
