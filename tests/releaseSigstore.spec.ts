import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("release Sigstore boundary", () => {
  const agentNotes = source("AGENTS.md");
  const workflow = source(".github/workflows/release.yml");
  const releaseGuide = source("RELEASE.md");
  const nativeGate = source("scripts/postinstallNativeCheck.mjs");
  const nativeRuntime = source("electron/irohaJsNativeDir.ts");
  const sourcePreparation = source("scripts/prepare-iroha-release-source.mjs");

  it("grants OIDC only to the draft-release job and signs every release blob", () => {
    expect(workflow).toContain("permissions:\n  contents: read");

    const draftJob = workflow.slice(workflow.indexOf("  publish:"));
    expect(draftJob).toContain("contents: write");
    expect(draftJob).toContain("id-token: write");
    expect(draftJob).toContain(
      "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6",
    );
    expect(draftJob).toContain("cosign sign-blob");
    expect(draftJob).toContain('--bundle "$file.sigstore.json"');
    expect(draftJob).toContain("-o -name 'SHA256SUMS.txt'");
    expect(draftJob).toContain("https://token.actions.githubusercontent.com");
    expect(draftJob).toContain(
      '--certificate-github-workflow-ref "$GITHUB_REF"',
    );
    expect(draftJob).toContain(
      '--certificate-github-workflow-repository "$GITHUB_REPOSITORY"',
    );
    expect(draftJob).toContain(
      '--certificate-github-workflow-sha "$GITHUB_SHA"',
    );

    const actionRefs = Array.from(
      workflow.matchAll(/^\s+uses:\s+\S+@([^\s#]+)/gm),
      (match) => match[1],
    );
    expect(actionRefs.length).toBeGreaterThan(0);
    expect(actionRefs.every((ref) => /^[0-9a-f]{40}$/.test(ref))).toBe(true);
  });

  it("binds signing to the exact tag and verifies before bundle upload", () => {
    expect(workflow).toContain('expected_ref="refs/tags/$RELEASE_TAG"');
    expect(workflow).toContain(
      'SIGSTORE_CERTIFICATE_IDENTITY: "https://github.com/${{ github.workflow_ref }}"',
    );

    const sign = workflow.indexOf(
      "- name: Sign release artifacts with GitHub OIDC",
    );
    const verify = workflow.indexOf("- name: Verify every Sigstore bundle");
    const releaseUpload = workflow.indexOf(
      "- name: Replace draft release with the verified local inventory",
    );
    const inventory = workflow.indexOf(
      "- name: Verify draft release asset inventory",
    );

    expect(sign).toBeGreaterThanOrEqual(0);
    expect(verify).toBeGreaterThan(sign);
    expect(releaseUpload).toBeGreaterThan(verify);
    expect(inventory).toBeGreaterThan(releaseUpload);
    expect(workflow).not.toContain("--clobber");
    expect(workflow).not.toContain("--draft=false");
  });

  it("fails closed unless every release source has a signed immutable identity", () => {
    expect(workflow).toContain(
      "IROHA_REF: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.iroha_ref || vars.IROHA_REF }}",
    );
    expect(workflow).not.toContain("vars.IROHA_REF || 'main'");
    expect(workflow).not.toContain('default: "main"');
    expect(workflow).toContain('"$IROHA_REF" =~ ^[0-9a-f]{40}$');
    expect(workflow).toContain(
      'REVIEWED_IROHA_REF: "1bcb05eb208d8bda1610789d827a7ed97e66e56c"',
    );
    expect(workflow).toContain('"$IROHA_REF" != "$REVIEWED_IROHA_REF"');
    expect(workflow).toContain('GITHUB_REF_PROTECTED" != "true"');
    expect(workflow).toContain(
      "Release tag $RELEASE_TAG must be covered by an active GitHub tag-protection ruleset.",
    );
    expect(workflow).toContain(
      'local_tag_type="$(git -C iroha-demo-javascript cat-file -t "refs/tags/$RELEASE_TAG")"',
    );
    expect(workflow).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/git/tags/$tag_object_sha"',
    );
    expect(workflow).toContain(
      'gh api "repos/$GITHUB_REPOSITORY/commits/$wallet_sha"',
    );
    expect(workflow).toContain(
      'gh api "repos/hyperledger-iroha/iroha/commits/$iroha_sha"',
    );
    expect(workflow).toContain(
      'gh api "repos/hyperledger-iroha/iroha/commits/$iroha_parent"',
    );
    expect(
      workflow.match(/\.verification\.verified/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      workflow.match(/\.verification\.reason/g)?.length,
    ).toBeGreaterThanOrEqual(4);
    expect(workflow).not.toContain("git apply");
    expect(workflow).toContain(
      "HAS_IROHA_RELEASE_SIGNER_KEY: ${{ secrets.IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64 != '' }}",
    );
    expect(workflow).toContain('"$HAS_IROHA_RELEASE_SIGNER_KEY" != "true"');
    expect(workflow).toContain(
      "IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64 is required",
    );
    expect(agentNotes).toContain(
      "release workflow must never patch the checked-out sibling Iroha SDK",
    );
  });

  it("uses one authenticated SDK install and resolver corridor", () => {
    expect(
      workflow.match(/- name: Prepare authenticated Iroha release source/gu)
        ?.length,
    ).toBe(2);
    expect(workflow.match(/run: npm run install:release/gu)?.length).toBe(2);
    expect(workflow.match(/run: npm run verify:iroha-sdk/gu)?.length).toBe(2);
    expect(workflow).not.toContain("copyFileSync(sourceNode");
    expect(workflow).not.toContain(
      "physical SDK package unexpectedly contains a native binary",
    );

    expect(sourcePreparation).toContain(
      "decodeCanonicalSignerPublicKey(encodedPublicKey)",
    );
    expect(sourcePreparation).toContain(
      "assertExactReviewedPublicKey(publicListing, secretListing)",
    );
    expect(sourcePreparation).toContain("GNUPGHOME: gpgHome");
    expect(sourcePreparation).toContain("IROHA_ROOT: sourceRoot");
    expect(sourcePreparation).toContain(
      '["-C", sourceRoot, "remote", "remove", "origin"]',
    );
    expect(sourcePreparation).not.toContain("--recv-keys");
    expect(sourcePreparation).not.toContain("keyserver");
    expect(releaseGuide).toContain("`IROHA_RELEASE_SIGNER_PUBLIC_KEY_BASE64`");
    expect(releaseGuide).toMatch(
      /The workflow has no manual SDK\/native copy\s+bypass\./u,
    );
  });

  it("binds the pinned source identities into signed release metadata", () => {
    expect(workflow).toContain('"sora.wallet.release-source.v3"');
    expect(workflow).not.toContain('"sora.wallet.release-source.v2"');
    expect(workflow).not.toContain('"sora.wallet.release-source.v1"');
    expect(workflow).toContain("SOURCE-IDENTITY.json");
    expect(workflow).toContain("SOURCE-IDENTITY.json.sigstore.json");
    expect(workflow).toContain(
      "IROHA_COMMIT_SHA: ${{ needs.preflight.outputs.iroha_sha }}",
    );
    expect(workflow).toContain(
      "RELEASE_TAG_OBJECT_SHA: ${{ needs.preflight.outputs.tag_object_sha }}",
    );
    expect(workflow).toContain(
      "WALLET_COMMIT_SHA: ${{ needs.preflight.outputs.wallet_sha }}",
    );
    expect(workflow).toContain("parent_commit: $iroha_parent_commit");
    expect(workflow).toContain("tree: $iroha_tree");
    expect(workflow).toContain("javascript_tree: $iroha_js_tree");
    expect(workflow).toContain("sha256: $iroha_cargo_lock_sha256");
    expect(workflow).toContain("size_bytes: $iroha_cargo_lock_size");
    expect(workflow).toContain("source_tree_clean: true");
    expect(workflow).toContain("build_provenance_version: 3");
    expect(workflow).toContain(
      'build_execution_policy: "trusted-local-cargo-v1"',
    );
    for (const requiredExport of [
      "encodeSignedTransactionVersioned",
      "decodeTransactionReceiptJson",
      "noritoDecodeInstructionBoxArchive",
      "securePrivateFileWriteAtomic",
    ]) {
      expect(workflow).toContain(`"${requiredExport}"`);
    }
    expect(workflow).toContain("exact_artifact_count: 9");
    expect(workflow).toContain(
      'macos_developer_id_notarization: "required-and-verified"',
    );
    expect(workflow).toContain('windows_authenticode: "required-and-verified"');
    expect(workflow).toContain("resources/release/iroha-v4-Cargo.lock");
    expect(
      workflow.match(/-o -name 'SOURCE-IDENTITY\.json'/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain("--bundle SOURCE-IDENTITY.json.sigstore.json");
  });

  it("pins the macOS deployment target before native compilation in both macOS release builds", () => {
    const buildJob = workflow.slice(
      workflow.indexOf("  build:"),
      workflow.indexOf("  publish:"),
    );
    expect(buildJob).toContain("- platform: mac\n            arch: x64");
    expect(buildJob).toContain("- platform: mac\n            arch: arm64");
    const pinStep = buildJob.indexOf(
      "- name: Pin macOS native deployment target",
    );
    const buildStep = buildJob.indexOf(
      "- name: Build reviewed Iroha native binding",
    );
    const installStep = buildJob.indexOf(
      "- name: Install exact reviewed release dependencies",
    );
    expect(pinStep).toBeGreaterThanOrEqual(0);
    expect(buildStep).toBeGreaterThan(pinStep);
    expect(installStep).toBeGreaterThan(buildStep);
    const pinStepBody = buildJob.slice(
      pinStep,
      buildJob.indexOf("\n      - name:", pinStep + 1),
    );
    expect(pinStepBody).toContain("if: matrix.platform == 'mac'");
    expect(pinStepBody).toContain(
      "echo 'MACOSX_DEPLOYMENT_TARGET=13.0' >> \"$GITHUB_ENV\"",
    );
  });

  it("records the exact runtime native-export contract in source identity", () => {
    const nativeExportsSource = nativeGate.match(
      /const REQUIRED_NATIVE_EXPORTS = \[(?<body>[\s\S]*?)\n\];/u,
    )?.groups?.body;
    const identityExportsSource = workflow.match(
      /required_exports: \[(?<body>[\s\S]*?)\n\s+\]/u,
    )?.groups?.body;
    const runtimeExportsSource = nativeRuntime.match(
      /const REQUIRED_NATIVE_EXPORTS = \[(?<body>[\s\S]*?)\n\] as const;/u,
    )?.groups?.body;
    expect(nativeExportsSource).toBeDefined();
    expect(identityExportsSource).toBeDefined();
    expect(runtimeExportsSource).toBeDefined();

    const quotedValues = (value: string | undefined): string[] =>
      Array.from(value?.matchAll(/"(?<name>[A-Za-z0-9]+)"/gu) ?? [], (match) =>
        String(match.groups?.name),
      );
    const nativeExports = quotedValues(nativeExportsSource);
    expect(quotedValues(identityExportsSource)).toEqual(nativeExports);
    expect(quotedValues(runtimeExportsSource)).toEqual(nativeExports);
  });

  it("documents verification and does not conflate provenance with OS signing", () => {
    expect(releaseGuide).toContain("Sigstore keyless provenance");
    expect(releaseGuide).toContain("cosign verify-blob");
    expect(releaseGuide).toContain("SHA256SUMS.txt.sigstore.json");
    expect(releaseGuide).toContain("does **not** provide macOS Developer ID");
    expect(releaseGuide).toContain(
      "The release workflow does not produce unsigned platform packages",
    );
    expect(releaseGuide).toContain(
      'git tag -s -u "$release_signing_key" -a "$release_tag"',
    );
    expect(releaseGuide).toContain('git verify-commit "$wallet_commit"');
    expect(releaseGuide).toContain('git verify-tag "$release_tag"');
    expect(releaseGuide).toContain(
      'gh variable set IROHA_REF --repo "$release_repo" --body "$iroha_commit"',
    );
    expect(releaseGuide).toContain("1bcb05eb208d8bda1610789d827a7ed97e66e56c");
    expect(releaseGuide).toContain("03b2bff298cabe1c1355d78379acb4a099e6d627");
    expect(releaseGuide).toContain("resources/release/iroha-v4-Cargo.lock");
    expect(releaseGuide).toContain('"include": ["refs/tags/v*"]');
    expect(releaseGuide).toContain('{"type": "update"}');
    expect(releaseGuide).toContain('{"type": "deletion"}');
    expect(releaseGuide).toContain('{"type": "non_fast_forward"}');
    expect(releaseGuide).toContain("SOURCE-IDENTITY.json");
    expect(releaseGuide).toContain(
      "gh release edit v2.0.1 \\\n     --repo soramitsu/iroha-demo-javascript \\\n     --draft=false",
    );
  });

  it("fails closed on platform signing and exact artifact inventory", () => {
    expect(workflow).toContain("- name: Require production platform signing");
    expect(workflow).toContain(
      "Every release requires complete macOS Developer ID signing and notarization credentials.",
    );
    expect(workflow).toContain(
      "Every release requires complete Windows Authenticode signing credentials.",
    );
    expect(workflow).not.toContain("Building unsigned draft artifacts");
    expect(workflow).toContain("WIN_EXPECTED_CERT_THUMBPRINT=$thumbprint");
    expect(workflow).toContain(
      "WIN_CSC_LINK must use canonical unwrapped base64 encoding.",
    );
    expect(workflow).toContain(
      "APPLE_API_KEY_ID must be an exact ten-character key ID.",
    );
    expect(workflow).toContain("- name: Verify notarized macOS application");
    expect(workflow).toContain('xcrun stapler validate "$app_path"');
    expect(workflow).toContain("- name: Verify signed Windows installer");
    expect(workflow).toContain("$signature.TimeStamperCertificate");
    expect(workflow).toContain("collect-release-artifacts.mjs");
    expect(workflow).toContain("--platform all");
    expect(workflow).toContain(
      'test "$(wc -l < artifacts/SHA256SUMS.txt | tr -d \' \')" = "10"',
    );
    expect(workflow).toContain("group: release-${{ github.ref }}");
  });
});
