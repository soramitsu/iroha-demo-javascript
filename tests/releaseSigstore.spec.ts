import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("release Sigstore boundary", () => {
  const agentNotes = source("AGENTS.md");
  const workflow = source(".github/workflows/release.yml");
  const releaseGuide = source("RELEASE.md");

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

    const draftUpload = workflow.indexOf(
      "- name: Upload draft distributables and checksums",
    );
    const sign = workflow.indexOf(
      "- name: Sign release artifacts with GitHub OIDC",
    );
    const verify = workflow.indexOf("- name: Verify every Sigstore bundle");
    const bundleUpload = workflow.indexOf(
      "- name: Upload Sigstore bundles and verification instructions",
    );
    const inventory = workflow.indexOf(
      "- name: Verify draft release asset inventory",
    );

    expect(draftUpload).toBeGreaterThanOrEqual(0);
    expect(sign).toBeGreaterThan(draftUpload);
    expect(verify).toBeGreaterThan(sign);
    expect(bundleUpload).toBeGreaterThan(verify);
    expect(inventory).toBeGreaterThan(bundleUpload);
    expect(workflow).not.toContain("--draft=false");
  });

  it("fails closed unless every release source has a signed immutable identity", () => {
    expect(workflow).toContain(
      "IROHA_REF: ${{ github.event_name == 'workflow_dispatch' && github.event.inputs.iroha_ref || vars.IROHA_REF }}",
    );
    expect(workflow).not.toContain("vars.IROHA_REF || 'main'");
    expect(workflow).not.toContain('default: "main"');
    expect(workflow).toContain('"$IROHA_REF" =~ ^[0-9a-f]{40}$');
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
    expect(
      workflow.match(/\.verification\.verified/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      workflow.match(/\.verification\.reason/g)?.length,
    ).toBeGreaterThanOrEqual(3);
    expect(workflow).not.toContain("git apply");
    expect(agentNotes).toContain(
      "release workflow must never patch the checked-out sibling Iroha SDK",
    );
  });

  it("binds the pinned source identities into signed release metadata", () => {
    expect(workflow).toContain('"sora.wallet.release-source.v1"');
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
    expect(
      workflow.match(/-o -name 'SOURCE-IDENTITY\.json'/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(workflow).toContain("--bundle SOURCE-IDENTITY.json.sigstore.json");
  });

  it("documents verification and does not conflate provenance with OS signing", () => {
    expect(releaseGuide).toContain("Sigstore keyless provenance");
    expect(releaseGuide).toContain("cosign verify-blob");
    expect(releaseGuide).toContain("SHA256SUMS.txt.sigstore.json");
    expect(releaseGuide).toContain("does **not** provide macOS Developer ID");
    expect(releaseGuide).toContain(
      "Do not describe those packages as notarized",
    );
    expect(releaseGuide).toContain(
      'git tag -s -u "$release_signing_key" -a "$release_tag"',
    );
    expect(releaseGuide).toContain('git verify-commit "$wallet_commit"');
    expect(releaseGuide).toContain('git verify-tag "$release_tag"');
    expect(releaseGuide).toContain(
      'gh variable set IROHA_REF --repo "$release_repo" --body "$iroha_commit"',
    );
    expect(releaseGuide).toContain('"include": ["refs/tags/v*"]');
    expect(releaseGuide).toContain('{"type": "update"}');
    expect(releaseGuide).toContain('{"type": "deletion"}');
    expect(releaseGuide).toContain('{"type": "non_fast_forward"}');
    expect(releaseGuide).toContain("SOURCE-IDENTITY.json");
    expect(releaseGuide).toContain(
      "gh release edit v2.0.1 \\\n     --repo soramitsu/iroha-demo-javascript \\\n     --draft=false",
    );
  });
});
