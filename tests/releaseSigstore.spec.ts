import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("release Sigstore boundary", () => {
  const workflow = source(".github/workflows/release.yml");
  const releaseGuide = source("RELEASE.md");

  it("grants OIDC only to the draft-release job and signs every release blob", () => {
    expect(workflow).toContain("permissions:\n  contents: read");

    const draftJob = workflow.slice(workflow.indexOf("  publish:"));
    expect(draftJob).toContain("contents: write");
    expect(draftJob).toContain("id-token: write");
    expect(draftJob).toContain("sigstore/cosign-installer@v4.1.2");
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

  it("documents verification and does not conflate provenance with OS signing", () => {
    expect(releaseGuide).toContain("Sigstore keyless provenance");
    expect(releaseGuide).toContain("cosign verify-blob");
    expect(releaseGuide).toContain("SHA256SUMS.txt.sigstore.json");
    expect(releaseGuide).toContain("does **not** provide macOS Developer ID");
    expect(releaseGuide).toContain(
      "Do not describe those packages as notarized",
    );
    expect(releaseGuide).toContain(
      "gh release edit v2.0.1 \\\n     --repo soramitsu/iroha-demo-javascript \\\n     --draft=false",
    );
  });
});
