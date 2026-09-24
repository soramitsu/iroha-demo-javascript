import { createHash } from "node:crypto";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
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
const RELEASE_SOURCE_TREE_SHA256 = "c".repeat(64);
const releaseProvenanceRequirement = (): NativeProvenanceRequirement => ({
  cargoProfile: "release",
  sourceGitRevision: RELEASE_SOURCE_REVISION,
  sourceTreeClean: true,
});
const releaseChecksumEntry = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  sha256: sha256("native-binary"),
  build_provenance_version: 3,
  build_execution_policy: "trusted-local-cargo-v1",
  cargo_profile: "release",
  source_git_revision: RELEASE_SOURCE_REVISION,
  source_tree_clean: true,
  source_tree_sha256: RELEASE_SOURCE_TREE_SHA256,
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

const PROPOSAL_OPERATOR =
  "sorauﾛ1Pｽp8zXFQﾗｷPsFﾒｶﾑ3ｵmﾉbｼｽUｱｶヱﾚBXヱﾊCﾋﾘﾈvuKFKM346";
const SECOND_PROPOSAL_OPERATOR =
  "sorauﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";
const POLICY_FINGERPRINT = Buffer.from(
  "4742b1f274928767564c6effa414e640e6f635874d74684b06b95414c5afa16e",
  "hex",
);
const PAYOUT_FINGERPRINT = Buffer.from(
  "8fd84f6599e22db4da15f7152a914dc0091dd73a7906d5981cce37d485191c25",
  "hex",
);

const currentOperatorBoundFingerprint = (
  proposalOperator: unknown,
  policyJson: unknown,
  payoutLifecycleProposalId: unknown,
): Buffer => {
  if (policyJson === "{}") {
    throw new Error(
      "validation-fee policy must contain exactly [current fields]",
    );
  }
  const policy = JSON.parse(String(policyJson)) as Record<string, unknown>;
  expect(policy.network_id).toBe(
    "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1",
  );
  expect(payoutLifecycleProposalId).toBeNull();
  if (proposalOperator === PROPOSAL_OPERATOR) return POLICY_FINGERPRINT;
  if (proposalOperator === SECOND_PROPOSAL_OPERATOR) {
    return Buffer.alloc(32, 0x86);
  }
  throw new Error("unexpected proposal operator");
};

const compatibleNativeModule = () => ({
  accountAddressParseEncoded() {
    return null;
  },
  accountAddressRender() {
    return null;
  },
  deriveConfidentialReceiveAddressV2() {},
  buildIvmProvedTransactionPayload() {},
  signQuotedIvmProvedTransactionPayload() {},
  buildTransactionPayload() {},
  signQuotedTransactionPayload() {},
  encodeSignedTransactionVersioned(bytes: Uint8Array) {
    return Buffer.from(bytes);
  },
  hashSignedTransaction() {
    return Buffer.alloc(32);
  },
  decodeTransactionReceiptJson() {
    return "{}";
  },
  noritoDecodeInstruction() {
    return JSON.stringify({});
  },
  noritoEncodeInstruction() {
    return Buffer.from([0]);
  },
  inspectSubscriptionTriggerAction() {
    return JSON.stringify({});
  },
  validationFeeHijiriQuoteRequestV1() {},
  validationFeeVerifyHijiriQuoteResponseV1() {},
  validationFeePolicyProposalFingerprintV1(
    proposalOperator: unknown,
    policyJson: unknown,
    _payoutLifecycleProposalId: unknown,
  ) {
    return currentOperatorBoundFingerprint(
      proposalOperator,
      policyJson,
      _payoutLifecycleProposalId,
    );
  },
  validationFeePayoutLifecycleProposalFingerprintV1(
    proposalOperator: unknown,
    payoutBindingJson: unknown,
  ) {
    if (payoutBindingJson === "{}") {
      throw new Error("payout binding must contain exactly [contract_address]");
    }
    const payoutBinding = JSON.parse(String(payoutBindingJson)) as Record<
      string,
      unknown
    >;
    expect(payoutBinding.ds_asset_id).toBe("7FF2EKZbaWzi5QTD6hewE2voveah");
    expect(payoutBinding.xor_asset_id).toBe("5dHF5UNffENuEg9mhjYwY1jcZ1K5");
    if (proposalOperator === PROPOSAL_OPERATOR) return PAYOUT_FINGERPRINT;
    if (proposalOperator === SECOND_PROPOSAL_OPERATOR) {
      return Buffer.alloc(32, 0x90);
    }
    throw new Error("unexpected proposal operator");
  },
  connectNoritoBridgeAbiVersion() {
    return 23;
  },
  securePrivateFileAbiVersion() {
    return 1;
  },
  securePrivateDirectoryEnsure(_rootPath: string) {
    void _rootPath;
  },
  securePrivateFileRead(
    _rootPath: string,
    _filename: string,
    _maximumBytes: number,
  ) {
    void _rootPath;
    void _filename;
    void _maximumBytes;
    return null;
  },
  securePrivateFileWriteAtomic(
    _rootPath: string,
    _filename: string,
    bytes: Uint8Array,
    _maximumBytes: number,
  ) {
    void _rootPath;
    void _filename;
    void _maximumBytes;
    return Buffer.from(bytes);
  },
});

const GOVERNANCE_FINGERPRINT_EXPORTS = [
  "validationFeePolicyProposalFingerprintV1",
  "validationFeePayoutLifecycleProposalFingerprintV1",
] as const;
const ACTIVE_RUNTIME_NATIVE_EXPORTS = [
  "accountAddressParseEncoded",
  "accountAddressRender",
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "encodeSignedTransactionVersioned",
  "hashSignedTransaction",
  "decodeTransactionReceiptJson",
  "noritoDecodeInstruction",
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
  "validationFeeHijiriQuoteRequestV1",
  "validationFeeVerifyHijiriQuoteResponseV1",
  "securePrivateFileAbiVersion",
  "securePrivateDirectoryEnsure",
  "securePrivateFileRead",
  "securePrivateFileWriteAtomic",
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

  it.each([
    ["empty", 0],
    ["oversized", 256 * 1024 * 1024 + 1],
  ])("rejects an %s native binary before reading it", (_label, size) => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    const nativeModulePath = join(tempPackage.nativeDir, "iroha_js_host.node");
    writeFileSync(nativeModulePath, "", "utf8");
    truncateSync(nativeModulePath, size);

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "native binary is not a bounded regular non-symbolic-link file",
    );
  });

  it("rejects an oversized checksum manifest before parsing it", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeFileSync(
      join(tempPackage.nativeDir, "iroha_js_host.node"),
      "native-binary",
      "utf8",
    );
    const checksumManifestPath = join(
      tempPackage.nativeDir,
      "iroha_js_host.checksums.json",
    );
    writeFileSync(checksumManifestPath, "", "utf8");
    truncateSync(checksumManifestPath, 1024 * 1024 + 1);

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "checksum manifest is not a bounded regular non-symbolic-link file",
    );
  });

  it("requests a rebuild when the checksum manifest does not match the binary", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(
      tempPackage.nativeDir,
      releaseChecksumEntry({ sha256: sha256("different-binary") }),
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

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

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

  it("rejects a current wrapper whose provenance profile is incomplete", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(tempPackage.nativeDir, {
      sha256: sha256("native-binary"),
    });

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      compatibleNativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toMatch(/missing native provenance fields/u);
  });

  it("requests a rebuild when required confidential v2 exports are missing", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

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

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

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
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

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

  it("accepts opaque N-API fingerprint arities when semantic probes pass", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    const policyFingerprint =
      nativeModule.validationFeePolicyProposalFingerprintV1;
    const payoutFingerprint =
      nativeModule.validationFeePayoutLifecycleProposalFingerprintV1;
    Reflect.set(
      nativeModule,
      "validationFeePolicyProposalFingerprintV1",
      (...args: unknown[]) =>
        Reflect.apply(policyFingerprint, nativeModule, args),
    );
    Reflect.set(
      nativeModule,
      "validationFeePayoutLifecycleProposalFingerprintV1",
      (...args: unknown[]) =>
        Reflect.apply(payoutFingerprint, nativeModule, args),
    );
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(nativeModule.validationFeePolicyProposalFingerprintV1.length).toBe(
      0,
    );
    expect(
      nativeModule.validationFeePayoutLifecycleProposalFingerprintV1.length,
    ).toBe(0);
    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
  });

  it("uses the secure-storage ABI probe instead of JavaScript arities", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    Reflect.set(nativeModule, "securePrivateDirectoryEnsure", () => {});
    Reflect.set(nativeModule, "securePrivateFileRead", (_rootPath: string) => {
      void _rootPath;
    });
    Reflect.set(
      nativeModule,
      "securePrivateFileWriteAtomic",
      (_rootPath: string, _filename: string) => {
        void _rootPath;
        void _filename;
      },
    );

    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
  });

  it("requests a rebuild when the secure private-file ABI is not exactly 1", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    nativeModule.securePrivateFileAbiVersion = () => 2;
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "secure private-file ABI mismatch: expected 1, observed 2",
    );
  });

  it("requests a rebuild when the secure private-file ABI probe throws", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);
    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    nativeModule.securePrivateFileAbiVersion = () => {
      throw new Error("probe failed");
    };
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "securePrivateFileAbiVersion failed: probe failed",
    );
  });

  it("requests a rebuild when the native Connect bridge ABI is not exactly 23", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    nativeModule.connectNoritoBridgeAbiVersion = () => 20;
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toBe(
      "connect Norito bridge ABI mismatch: expected 23, observed 20",
    );
  });

  it("requests a rebuild when policy fingerprints are not operator-bound", () => {
    const tempPackage = makeTempPackage();
    tempRoots.push(tempPackage.root);

    writeNativeBundle(tempPackage.nativeDir, releaseChecksumEntry());

    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      _proposalOperator: unknown,
      _policyJson: unknown,
      _payoutLifecycleProposalId: unknown,
    ) {
      void _proposalOperator;
      void _policyJson;
      void _payoutLifecycleProposalId;
      return Buffer.alloc(32);
    };
    const result = resolveNativeBuildRequirement(
      tempPackage.root,
      "darwin-arm64",
      () => nativeModule,
    );

    expect(result.shouldBuild).toBe(true);
    expect(result.reason).toContain(
      "native fingerprint contract mismatch for validationFeePolicyProposalFingerprintV1: expected deterministic operator-bound vector 4742b1f274928767564c6effa414e640e6f635874d74684b06b95414c5afa16e",
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
    "build_execution_policy",
    "build_provenance_version",
    "cargo_profile",
    "source_git_revision",
    "source_tree_clean",
    "source_tree_sha256",
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
        `missing native provenance fields for darwin-arm64: ${missingField}`,
      );
    },
  );

  it.each([
    ["build_execution_policy", "untrusted-shell-v0"],
    ["build_provenance_version", 2],
    ["cargo_profile", 1],
    ["source_git_revision", "A".repeat(40)],
    ["source_tree_clean", "true"],
    ["source_tree_sha256", "C".repeat(64)],
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
        "checksum manifest must contain only entries.darwin-arm64",
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
    expect(result.reason).toBe("checksum manifest encoding is not canonical");
  });
});
