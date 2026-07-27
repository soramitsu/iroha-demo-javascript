import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

type NativeBuildRequirement = {
  shouldBuild: boolean;
  reason: string;
  nativeModulePath: string;
  checksumManifestPath: string;
  expectedSha256?: string;
  actualSha256?: string;
  missingExports?: string[];
};

type NativeProvenanceRequirement = Readonly<{
  cargoProfile: "release";
  sourceGitRevision: string;
  sourceTreeClean: true;
}>;

type ResolveNativeBuildRequirement = (
  irohaPackagePath: string,
  platformKey?: string,
  loadNativeModule?: (nativeModulePath: string) => unknown,
  provenanceRequirement?: NativeProvenanceRequirement | null,
) => NativeBuildRequirement;

type ResolveNativeProvenanceRequirement = (
  environment?: Record<string, string | undefined>,
) => NativeProvenanceRequirement | null;

const postinstallNativeCheckModuleUrl = pathToFileURL(
  resolve(process.cwd(), "scripts", "postinstallNativeCheck.mjs"),
).href;
const {
  resolveNativeBuildRequirement,
  resolveNativeProvenanceRequirement,
}: {
  resolveNativeBuildRequirement: ResolveNativeBuildRequirement;
  resolveNativeProvenanceRequirement: ResolveNativeProvenanceRequirement;
} = await import(postinstallNativeCheckModuleUrl);

const makeTempPackage = () => {
  const root = mkdtempSync(join(tmpdir(), "iroha-postinstall-"));
  const nativeDir = join(root, "native");
  mkdirSync(nativeDir, { recursive: true });
  return { root, nativeDir };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");

const RELEASE_SOURCE_REVISION = "a".repeat(40);
const releaseProvenanceRequirement = (): NativeProvenanceRequirement => ({
  cargoProfile: "release",
  sourceGitRevision: RELEASE_SOURCE_REVISION,
  sourceTreeClean: true,
});
const releaseChecksumEntry = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sha256: sha256("native-binary"),
  cargo_profile: "release",
  source_git_revision: RELEASE_SOURCE_REVISION,
  source_tree_clean: true,
  mach_o_signing_independent_sha256: "b".repeat(64),
  ...overrides,
});

const writeNativeBundle = (
  nativeDir: string,
  checksumEntry: Record<string, unknown>,
) => {
  writeFileSync(join(nativeDir, "iroha_js_host.node"), "native-binary", "utf8");
  writeFileSync(
    join(nativeDir, "iroha_js_host.checksums.json"),
    `${JSON.stringify(
      {
        entries: {
          "darwin-arm64": checksumEntry,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

const compatibleNativeModule = () => ({
  accountAddressParseEncoded() {
    return null;
  },
  accountAddressRender() {
    return null;
  },
  deriveConfidentialReceiveAddressV2() {},
  buildConfidentialTransferProofV2() {},
  buildConfidentialUnshieldProofV2() {},
  buildConfidentialUnshieldProofV3() {},
  buildIvmProvedTransactionPayload() {},
  signQuotedIvmProvedTransactionPayload() {},
  noritoDecodeInstruction() {
    return JSON.stringify({});
  },
  noritoEncodeInstruction() {
    return Buffer.from([0]);
  },
  inspectSubscriptionTriggerAction() {
    return JSON.stringify({});
  },
  validationFeePolicyProposalFingerprintV1(
    _policy: unknown,
    _payoutLifecycleProposalId: unknown,
    _plainElectorateRules: unknown,
  ) {
    void _policy;
    void _payoutLifecycleProposalId;
    void _plainElectorateRules;
    return Buffer.from(
      "dc8dd81d73e9f562e57b7cb6cacc9d3da84fa6663da7cffd96b7282c4b0f68b6",
      "hex",
    );
  },
  validationFeePayoutLifecycleProposalFingerprintV1(
    _payoutBinding: unknown,
    _plainElectorateRules: unknown,
  ) {
    void _payoutBinding;
    void _plainElectorateRules;
    return Buffer.from(
      "f6bf20196ea6985c4fbbfdb902a77079e12c78638f760b6611b6916b9ec3e27e",
      "hex",
    );
  },
  connectNoritoBridgeAbiVersion() {
    return 21;
  },
});

const GOVERNANCE_FINGERPRINT_EXPORTS = [
  "validationFeePolicyProposalFingerprintV1",
  "validationFeePayoutLifecycleProposalFingerprintV1",
] as const;
const ACTIVE_RUNTIME_NATIVE_EXPORTS = [
  "accountAddressParseEncoded",
  "accountAddressRender",
  "noritoDecodeInstruction",
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
] as const;

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const target = tempRoots.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
});

describe("resolveNativeProvenanceRequirement", () => {
  it("derives the exact release provenance requirement from the environment", () => {
    expect(
      resolveNativeProvenanceRequirement({
        IROHA_JS_NATIVE_BUILD_PROFILE: "release",
        IROHA_JS_NATIVE_SOURCE_GIT_REVISION: RELEASE_SOURCE_REVISION,
      }),
    ).toEqual(releaseProvenanceRequirement());
  });

  it.each([undefined, "debug", "deploy", "release "])(
    "keeps non-release profile %s on the development compatibility path",
    (buildProfile) => {
      expect(
        resolveNativeProvenanceRequirement({
          IROHA_JS_NATIVE_BUILD_PROFILE: buildProfile,
        }),
      ).toBeNull();
    },
  );

  it.each([undefined, "", "a".repeat(39), "A".repeat(40), "g".repeat(40)])(
    "rejects missing or malformed release source revision %s",
    (sourceGitRevision) => {
      expect(() =>
        resolveNativeProvenanceRequirement({
          IROHA_JS_NATIVE_BUILD_PROFILE: "release",
          IROHA_JS_NATIVE_SOURCE_GIT_REVISION: sourceGitRevision,
        }),
      ).toThrow(
        "IROHA_JS_NATIVE_SOURCE_GIT_REVISION must be an explicit 40-character lowercase Git SHA",
      );
    },
  );
});

describe("resolveNativeBuildRequirement", () => {
  it("requests a rebuild when the native binary is missing", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe("missing native binary");
  });

  it("requests a rebuild when the checksum manifest does not match the binary", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("different-binary") },
      }),
      "utf8",
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe("checksum mismatch for darwin-arm64");
    expect(result.expectedSha256).toBe(sha256("different-binary"));
    expect(result.actualSha256).toBe(sha256("native-binary"));
  });

  it("accepts the current native binary when the checksum manifest matches", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
    );

    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
    expect(result.expectedSha256).toBe(sha256("native-binary"));
    expect(result.actualSha256).toBe(sha256("native-binary"));
  });

  it("accepts checksum manifests that wrap platform hashes under entries", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        entries: {
          "darwin-arm64": { sha256: sha256("native-binary") },
        },
      }),
      "utf8",
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
    );

    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
    expect(result.expectedSha256).toBe(sha256("native-binary"));
    expect(result.actualSha256).toBe(sha256("native-binary"));
  });

  it("requests a rebuild when required confidential v2 exports are missing", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => ({
        deriveConfidentialOwnerTagV2() {},
      }),
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toContain("missing native exports");
    expect(result.missingExports).toContain(
      "deriveConfidentialReceiveAddressV2",
    );
  });

  it("requests a rebuild when either validation-fee fingerprint export is missing", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    for (const exportName of GOVERNANCE_FINGERPRINT_EXPORTS) {
      const nativeModule = compatibleNativeModule();
      Reflect.deleteProperty(nativeModule, exportName);
      const result = resolveNativeBuildRequirement(
        tempPackage.root,
        "darwin-arm64",
        () => nativeModule,
      );

      expect(result.shouldBuild).toBe(true);
      expect(result.reason).toBe(`missing native exports: ${exportName}`);
      expect(result.missingExports).toEqual([exportName]);
    }
  });

  it("requests a rebuild when an active runtime native export is missing", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, {
      sha256: sha256("native-binary"),
    });

    for (const exportName of ACTIVE_RUNTIME_NATIVE_EXPORTS) {
      const nativeModule = compatibleNativeModule();
      Reflect.deleteProperty(nativeModule, exportName);
      const result = resolveNativeBuildRequirement(
        tempPackage.root,
        "darwin-arm64",
        () => nativeModule,
      );

      expect(result.shouldBuild).toBe(true);
      expect(result.reason).toBe(`missing native exports: ${exportName}`);
      expect(result.missingExports).toEqual([exportName]);
    }
  });

  it("requests a rebuild when validation-fee fingerprint exports have stale arities", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    const nativeModule = compatibleNativeModule();
    Reflect.set(
      nativeModule,
      "validationFeePolicyProposalFingerprintV1",
      (_policy: unknown) => {
        void _policy;
      },
    );
    Reflect.set(
      nativeModule,
      "validationFeePayoutLifecycleProposalFingerprintV1",
      (_payoutBinding: unknown) => {
        void _payoutBinding;
      },
    );
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "native export arity mismatch: validationFeePolicyProposalFingerprintV1 expected 3, observed 1; validationFeePayoutLifecycleProposalFingerprintV1 expected 2, observed 1",
    );
  });

  it("requests a rebuild when the native Connect bridge ABI is not exactly 21", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    const nativeModule = compatibleNativeModule();
    nativeModule.connectNoritoBridgeAbiVersion = () => 20;
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "connect Norito bridge ABI mismatch: expected 21, observed 20",
    );
  });

  it("requests a rebuild when native fingerprint semantics do not match the canonical Rust vectors", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        "darwin-arm64": { sha256: sha256("native-binary") },
      }),
      "utf8",
    );

    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      _policy: unknown,
      _payoutLifecycleProposalId: unknown,
      _plainElectorateRules: unknown,
    ) {
      void _policy;
      void _payoutLifecycleProposalId;
      void _plainElectorateRules;
      return Buffer.alloc(32);
    };
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "native fingerprint contract mismatch for validationFeePolicyProposalFingerprintV1: expected dc8dd81d73e9f562e57b7cb6cacc9d3da84fa6663da7cffd96b7282c4b0f68b6, observed 0000000000000000000000000000000000000000000000000000000000000000",
    );
  });

  it("accepts an exact clean release artifact from the required source revision", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );

    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
  });

  it("requests a release rebuild for a debug-profile artifact", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(
      tempPackage.nativeDir,
      releaseChecksumEntry({ cargo_profile: "debug" }),
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "native Cargo profile mismatch for darwin-arm64: expected release, observed debug",
    );
  });

  it("requests a release rebuild for an artifact from the wrong source revision", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(
      tempPackage.nativeDir,
      releaseChecksumEntry({ source_git_revision: "b".repeat(40) }),
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      `native source Git revision mismatch for darwin-arm64: expected ${RELEASE_SOURCE_REVISION}, observed ${"b".repeat(40)}`,
    );
  });

  it("requests a release rebuild for a dirty-source artifact", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(
      tempPackage.nativeDir,
      releaseChecksumEntry({ source_tree_clean: false }),
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "native source tree is not clean for darwin-arm64",
    );
  });

  it.each([
    "cargo_profile",
    "source_git_revision",
    "source_tree_clean",
    "mach_o_signing_independent_sha256",
  ])(
    "requests a release rebuild when provenance field %s is missing",
    (missingField) => {
      const tempPackage = makeTempPackage();
      tempRoots.push(tempPackage.root);
      const checksumEntry = releaseChecksumEntry();
      Reflect.deleteProperty(checksumEntry, missingField);
      writeNativeBundle(tempPackage.nativeDir, checksumEntry);

      const result = resolveNativeBuildRequirement(
        tempPackage.root,
        "darwin-arm64",
        compatibleNativeModule,
        releaseProvenanceRequirement(),
      );

      expect(result.shouldBuild).toBe(true);
      expect(result.reason).toBe(
        `missing release native provenance fields for darwin-arm64: ${missingField}`,
      );
    },
  );

  it.each([
    ["cargo_profile", 1],
    ["source_git_revision", "A".repeat(40)],
    ["source_tree_clean", "true"],
    ["mach_o_signing_independent_sha256", "B".repeat(64)],
  ])(
    "requests a release rebuild when provenance field %s is malformed",
    (field, malformedValue) => {
      const tempPackage = makeTempPackage();
      tempRoots.push(tempPackage.root);
      writeNativeBundle(
        tempPackage.nativeDir,
        releaseChecksumEntry({ [field]: malformedValue }),
      );

      const result = resolveNativeBuildRequirement(
        tempPackage.root,
        "darwin-arm64",
        compatibleNativeModule,
        releaseProvenanceRequirement(),
      );

      expect(result.shouldBuild).toBe(true);
    },
  );

  it("requests a release rebuild when the selected entry has an unknown provenance field", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(
      tempPackage.nativeDir,
      releaseChecksumEntry({ source_branch: "main" }),
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "unknown checksum manifest fields for darwin-arm64: source_branch",
    );
  });

  it("rejects release manifests with extra top-level or platform entries", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    const variants = [
      {
        entries: { "darwin-arm64": releaseChecksumEntry() },
        legacy: true,
      },
      {
        entries: {
          "darwin-arm64": releaseChecksumEntry(),
          "linux-x64": releaseChecksumEntry(),
        },
      },
    ];

    for (const manifest of variants) {
      writeFileSync(
        join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
        JSON.stringify(manifest),
        "utf8",
      );
      const result = resolveNativeBuildRequirement(
        tempPackage.root,
        "darwin-arm64",
        compatibleNativeModule,
        releaseProvenanceRequirement(),
      );
      expect(result.shouldBuild).toBe(true);
      expect(result.reason).toBe(
        "release checksum manifest must contain only entries.darwin-arm64",
      );
    }
  });

  it("rejects a non-canonical release manifest encoding", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.checksums.json"),
      JSON.stringify({
        entries: { "darwin-arm64": releaseChecksumEntry() },
      }),
      "utf8",
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
      releaseProvenanceRequirement(),
    );
    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "release checksum manifest encoding is not canonical",
    );
  });
});
