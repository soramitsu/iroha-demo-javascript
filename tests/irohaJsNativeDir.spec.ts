import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import {
  configureIrohaJsNativeDir,
  hasRequiredIrohaJsNativeExports,
  installGlobalIrohaJsNativeBinding,
  resolveIrohaJsNativeDir,
} from "../electron/irohaJsNativeDir";
import { hasRequiredPackagedIrohaJsNativeProvenance } from "../electron/irohaJsNativeProvenance";

const REVIEWED_IROHA_SOURCE_GIT_REVISION =
  "1bcb05eb208d8bda1610789d827a7ed97e66e56c";
const DEVELOPMENT_MODULE_URL =
  "file:///Users/test/app/dist/preload/preload.mjs";
const DEVELOPMENT_ACTIVE_NATIVE_DIR =
  "/Users/test/app/node_modules/.cache/iroha-sdk-compat/active/native";
const DEVELOPMENT_ACTIVE_NATIVE_PATH = `${DEVELOPMENT_ACTIVE_NATIVE_DIR}/iroha_js_host.node`;
const developmentNativeExists = (path: string): boolean =>
  path === DEVELOPMENT_ACTIVE_NATIVE_PATH;

const PROPOSAL_OPERATOR =
  "sorauﾛ1Pｽp8zXFQﾗｷPsFﾒｶﾑ3ｵmﾉbｼｽUｱｶヱﾚBXヱﾊCﾋﾘﾈvuKFKM346";
const SECOND_PROPOSAL_OPERATOR =
  "sorauﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";
// Pinned native fingerprint vectors for the SDK retail_fee_native_policy_v1 /
// retail_fee_native_conversion_v1 fixtures (the crates/iroha_js_host
// validation_fee_tests.rs fixtures; those tests pin no hex literals).
const POLICY_FINGERPRINT = Buffer.from(
  "7ea3f657b77099f869d1aae9a47845d66094154e26e664c971434722cb0b31c4",
  "hex",
);
const SECOND_OPERATOR_POLICY_FINGERPRINT = Buffer.from(
  "e6fae2d16761eb221142b5e236ad09d31e1bdd1c4245538f08a932fb8136f7f1",
  "hex",
);
const PAYOUT_FINGERPRINT = Buffer.from(
  "8e28c5de8ce8928696065b15e09073b9bbebbaa30e690d4c6bd2ca75b9a3c1b4",
  "hex",
);
const SECOND_OPERATOR_PAYOUT_FINGERPRINT = Buffer.from(
  "8ff01a1ac68e79c64901830452ba2ff4185cf4a41b140704b8101e1b747d2bcd",
  "hex",
);
const POLICY_FIELDS = [
  "schema_version",
  "network_id",
  "policy_version",
  "previous_policy_hash",
  "ds_asset_id",
  "ds_scale",
  "retail_schedule",
  "effective_from_ms",
  "notice_published_at_ms",
  "fee",
  "treasury_account_id",
  "charging_mode",
  "exemption_classes",
  "reward_custody",
];
const PAYOUT_BINDING_FIELDS = [
  "contract_address",
  "code_hash",
  "entrypoint",
  "treasury_account_id",
  "ds_asset_id",
  "xor_asset_id",
  "pool_contract_address",
  "pool_code_hash",
  "pool_vault_account_id",
  "reward_pool_account_id",
  "reference_feed_id",
  "reference_feed_config_version",
  "reference_provider_accounts",
  "max_sbd_per_attempt_minor",
  "max_sbd_per_day_minor",
  "min_interval_ms",
  "max_source_age_ms",
  "max_slippage_bps",
  "validator_lane_id",
  "min_reward_claim_xor_minor",
];

const currentOperatorBoundFingerprint = (...args: unknown[]): Buffer => {
  expect(args).toHaveLength(2);
  const [proposalOperator, policyJson] = args;
  if (policyJson === "{}") {
    throw new Error(
      "validation-fee policy must contain exactly [current fields]",
    );
  }
  const policy = JSON.parse(String(policyJson)) as Record<string, unknown>;
  expect(Object.keys(policy)).toEqual(POLICY_FIELDS);
  expect(policy.network_id).toBe(
    "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1",
  );
  expect(policy.charging_mode).toEqual({
    charging_mode: "RETAIL_MONTHLY_ALLOWANCE",
    value: null,
  });
  if (proposalOperator === PROPOSAL_OPERATOR) return POLICY_FINGERPRINT;
  if (proposalOperator === SECOND_PROPOSAL_OPERATOR) {
    return SECOND_OPERATOR_POLICY_FINGERPRINT;
  }
  throw new Error("unexpected proposal operator");
};

const currentOperatorBoundPayoutFingerprint = (...args: unknown[]): Buffer => {
  expect(args).toHaveLength(2);
  const [proposalOperator, payoutBindingJson] = args;
  if (payoutBindingJson === "{}") {
    throw new Error("payout binding must contain exactly [contract_address]");
  }
  const payoutBinding = JSON.parse(String(payoutBindingJson)) as Record<
    string,
    unknown
  >;
  expect(Object.keys(payoutBinding)).toEqual(PAYOUT_BINDING_FIELDS);
  expect(payoutBinding.ds_asset_id).toBe("7FF2EKZbaWzi5QTD6hewE2voveah");
  expect(payoutBinding.xor_asset_id).toBe("5dHF5UNffENuEg9mhjYwY1jcZ1K5");
  expect(payoutBinding.reference_feed_id).toEqual(["xor_per_sbd"]);
  if (proposalOperator === PROPOSAL_OPERATOR) return PAYOUT_FINGERPRINT;
  if (proposalOperator === SECOND_PROPOSAL_OPERATOR) {
    return SECOND_OPERATOR_PAYOUT_FINGERPRINT;
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
    return JSON.stringify({ trusted: "decode" });
  },
  noritoDecodeInstructionBoxArchive() {
    return JSON.stringify({ trusted: "archive-decode" });
  },
  noritoEncodeInstruction() {
    return Buffer.from([0]);
  },
  inspectSubscriptionTriggerAction() {
    return JSON.stringify({ trusted: "inspection" });
  },
  validationFeePolicyProposalFingerprintV1(...args: unknown[]) {
    return currentOperatorBoundFingerprint(...args);
  },
  validationFeePayoutLifecycleProposalFingerprintV1(...args: unknown[]) {
    return currentOperatorBoundPayoutFingerprint(...args);
  },
  connectNoritoBridgeAbiVersion() {
    return 29;
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
const TRANSACTION_RUNTIME_NATIVE_EXPORTS = [
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "encodeSignedTransactionVersioned",
  "hashSignedTransaction",
  "decodeTransactionReceiptJson",
] as const;

describe("irohaJsNativeDir", () => {
  it("resolves the active SDK native directory from TypeScript source layout", () => {
    const resolved = resolveIrohaJsNativeDir(
      "file:///Users/test/app/electron/secureBoundedJson.ts",
      (path) =>
        path ===
        "/Users/test/app/node_modules/.cache/iroha-sdk-compat/active/native/iroha_js_host.node",
      () => compatibleNativeModule(),
    );

    expect(resolved).toBe(
      "/Users/test/app/node_modules/.cache/iroha-sdk-compat/active/native",
    );
  });

  it("resolves the active SDK native directory from built Electron layout", () => {
    const seenPaths: string[] = [];
    const resolved = resolveIrohaJsNativeDir(
      DEVELOPMENT_MODULE_URL,
      (path) => {
        seenPaths.push(path);
        return developmentNativeExists(path);
      },
      () => compatibleNativeModule(),
    );

    expect(resolved).toBe(DEVELOPMENT_ACTIVE_NATIVE_DIR);
    expect(seenPaths[1]).toBe(DEVELOPMENT_ACTIVE_NATIVE_PATH);
  });

  it("accepts only a native-dir setting that matches the active SDK", () => {
    const env = {
      IROHA_JS_NATIVE_DIR: DEVELOPMENT_ACTIVE_NATIVE_DIR,
    } as NodeJS.ProcessEnv;

    const resolved = configureIrohaJsNativeDir(
      DEVELOPMENT_MODULE_URL,
      env,
      developmentNativeExists,
      () => compatibleNativeModule(),
    );

    expect(resolved).toBe(DEVELOPMENT_ACTIVE_NATIVE_DIR);
    expect(env.IROHA_JS_NATIVE_DIR).toBe(DEVELOPMENT_ACTIVE_NATIVE_DIR);
  });

  it("rejects a development native-dir override from another SDK root", () => {
    expect(() =>
      configureIrohaJsNativeDir(
        DEVELOPMENT_MODULE_URL,
        { IROHA_JS_NATIVE_DIR: "/custom/native" } as NodeJS.ProcessEnv,
        developmentNativeExists,
        () => compatibleNativeModule(),
      ),
    ).toThrow("must identify the native directory from the active SDK");
  });

  it("rejects an explicit native-dir override inside a packaged Electron app", () => {
    expect(() =>
      configureIrohaJsNativeDir(
        "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
        { IROHA_JS_NATIVE_DIR: "/custom/native" } as NodeJS.ProcessEnv,
      ),
    ).toThrow(
      "IROHA_JS_NATIVE_DIR cannot override the provenance-bound native binding",
    );
  });

  it("does not inspect physical installed-package or non-ASAR dist fallbacks", () => {
    const seenPaths: string[] = [];
    const resolved = resolveIrohaJsNativeDir(
      DEVELOPMENT_MODULE_URL,
      (path) => {
        seenPaths.push(path);
        return (
          path.endsWith(
            "/node_modules/@iroha/iroha-js/native/iroha_js_host.node",
          ) || path.endsWith("/dist/native/iroha_js_host.node")
        );
      },
      () => compatibleNativeModule(),
    );

    expect(resolved).toBeNull();
    expect(seenPaths).not.toHaveLength(0);
    expect(
      seenPaths.some(
        (path) =>
          path.includes("node_modules/@iroha/iroha-js") ||
          path.endsWith("/dist/native/iroha_js_host.node"),
      ),
    ).toBe(false);
  });

  it("never returns a packaged binding whose release provenance is invalid", () => {
    const resolved = resolveIrohaJsNativeDir(
      "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
      (path) => path.endsWith("app.asar/dist/native/iroha_js_host.node"),
      () => compatibleNativeModule(),
      () => null,
    );

    expect(resolved).toBeNull();
  });

  it("considers only the staged native pair when running from app.asar", () => {
    const checked: string[] = [];
    const resolved = resolveIrohaJsNativeDir(
      "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
      (path) => path.endsWith("iroha_js_host.node"),
      () => compatibleNativeModule(),
      (nativeDir) => {
        checked.push(nativeDir);
        return nativeDir.endsWith("app.asar/dist/native") ? nativeDir : null;
      },
    );

    expect(resolved).toBe(
      "/Applications/SORA.app/Contents/Resources/app.asar/dist/native",
    );
    expect(checked).toEqual([
      "/Applications/SORA.app/Contents/Resources/app.asar/dist/native",
    ]);
  });

  it("rejects unowned packaged globals before invoking accessors or binding traps", () => {
    let bindingTrapCalls = 0;
    let globalGetterCalls = 0;
    const unownedBinding = new Proxy(compatibleNativeModule(), {
      get(target, property, receiver) {
        bindingTrapCalls += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    for (const slot of [
      "__IROHA_NATIVE_BINDING__",
      "__IROHA_NORITO_BINDING__",
    ] as const) {
      const unownedTarget = {};
      Object.defineProperty(unownedTarget, slot, {
        configurable: true,
        value: unownedBinding,
      });
      expect(() =>
        installGlobalIrohaJsNativeBinding(
          "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
          process.env,
          undefined,
          undefined,
          undefined,
          unownedTarget,
        ),
      ).toThrow("cannot trust a pre-populated native binding");
      expect(bindingTrapCalls).toBe(0);

      const accessorTarget = {};
      Object.defineProperty(accessorTarget, slot, {
        configurable: true,
        get() {
          globalGetterCalls += 1;
          return unownedBinding;
        },
      });
      expect(() =>
        installGlobalIrohaJsNativeBinding(
          "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
          process.env,
          undefined,
          undefined,
          undefined,
          accessorTarget,
        ),
      ).toThrow("native binding global slot must be an own data property");
      expect(globalGetterCalls).toBe(0);
      expect(bindingTrapCalls).toBe(0);
    }
  });

  it("does not promote a development binding to packaged provenance trust", () => {
    const globalTarget = {};
    const nativeModule = compatibleNativeModule();
    expect(
      installGlobalIrohaJsNativeBinding(
        DEVELOPMENT_MODULE_URL,
        {} as NodeJS.ProcessEnv,
        () => nativeModule,
        developmentNativeExists,
        undefined,
        globalTarget,
      ),
    ).toBe(nativeModule);
    expect(() =>
      installGlobalIrohaJsNativeBinding(
        "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs",
        process.env,
        undefined,
        undefined,
        undefined,
        globalTarget,
      ),
    ).toThrow("cannot trust a pre-populated native binding");
  });

  it("configures then installs the packaged binding without creating an override", () => {
    const moduleUrl =
      "file:///Applications/SORA.app/Contents/Resources/app.asar/dist/preload/preload.mjs";
    const nativePath =
      "/Applications/SORA.app/Contents/Resources/app.asar/dist/native/iroha_js_host.node";
    const env = {} as NodeJS.ProcessEnv;
    const nativeModule = compatibleNativeModule();
    const fileExists = (path: string) => path === nativePath;
    const loadNativeModule = () => nativeModule;
    const materializeSnapshot = (nativeDir: string) =>
      nativeDir.endsWith("app.asar/dist/native") ? nativeDir : null;
    const globalTarget = {} as Record<string, unknown>;

    expect(
      configureIrohaJsNativeDir(
        moduleUrl,
        env,
        fileExists,
        loadNativeModule,
        materializeSnapshot,
      ),
    ).toBe("/Applications/SORA.app/Contents/Resources/app.asar/dist/native");
    expect(env.IROHA_JS_NATIVE_DIR).toBeUndefined();

    expect(
      installGlobalIrohaJsNativeBinding(
        moduleUrl,
        env,
        loadNativeModule,
        fileExists,
        materializeSnapshot,
        globalTarget,
      ),
    ).toBe(nativeModule);
    expect(globalTarget.__IROHA_NATIVE_BINDING__).toBe(nativeModule);
    expect(globalTarget.__IROHA_NORITO_BINDING__).toBe(nativeModule);
    expect(Object.isFrozen(nativeModule)).toBe(true);
    for (const slot of [
      "__IROHA_NATIVE_BINDING__",
      "__IROHA_NORITO_BINDING__",
    ] as const) {
      expect(Object.getOwnPropertyDescriptor(globalTarget, slot)).toMatchObject(
        {
          configurable: false,
          enumerable: false,
          writable: false,
        },
      );
      expect(Reflect.set(globalTarget, slot, compatibleNativeModule())).toBe(
        false,
      );
    }
    expect(
      installGlobalIrohaJsNativeBinding(
        moduleUrl,
        env,
        () => {
          throw new Error("trusted global binding should be reused");
        },
        fileExists,
        () => null,
        globalTarget,
      ),
    ).toBe(nativeModule);
    expect(env.IROHA_JS_NATIVE_DIR).toBeUndefined();
  });
});

describe("active SDK native binding", () => {
  it("passes the exact pinned validation-fee fingerprint probe", () => {
    const moduleUrl = pathToFileURL(
      resolve(process.cwd(), "electron", "irohaJsNativeDir.ts"),
    ).href;
    const nativeDir = resolveIrohaJsNativeDir(moduleUrl);
    expect(nativeDir).not.toBeNull();
    const nativeModule = createRequire(moduleUrl)(
      join(nativeDir as string, "iroha_js_host.node"),
    ) as Record<string, (...args: unknown[]) => unknown>;
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(true);
    expect(() =>
      nativeModule.validationFeePolicyProposalFingerprintV1(
        PROPOSAL_OPERATOR,
        "{}",
      ),
    ).toThrow(
      "validation-fee policy must contain exactly [schema_version, network_id, policy_version, previous_policy_hash, ds_asset_id, ds_scale, retail_schedule, effective_from_ms, notice_published_at_ms, fee, treasury_account_id, charging_mode, exemption_classes, reward_custody]",
    );
    expect(() =>
      nativeModule.validationFeePayoutLifecycleProposalFingerprintV1(
        PROPOSAL_OPERATOR,
        "{}",
      ),
    ).toThrow(
      "payout binding must contain exactly [contract_address, code_hash, entrypoint, treasury_account_id, ds_asset_id, xor_asset_id, pool_contract_address, pool_code_hash, pool_vault_account_id, reward_pool_account_id, reference_feed_id, reference_feed_config_version, reference_provider_accounts, max_sbd_per_attempt_minor, max_sbd_per_day_minor, min_interval_ms, max_source_age_ms, max_slippage_bps, validator_lane_id, min_reward_claim_xor_minor]",
    );
  });
});

describe("hasRequiredPackagedIrohaJsNativeProvenance", () => {
  const nativeDir = "/mock/dist/native";
  const nativeBytes = Buffer.from("reviewed-v4-native-fixture");
  const nativeSha256 = createHash("sha256").update(nativeBytes).digest("hex");
  const exactEntry = {
    sha256: nativeSha256,
    build_provenance_version: 4,
    build_execution_policy: "trusted-local-cargo-v1",
    cargo_profile: "release",
    source_git_revision: REVIEWED_IROHA_SOURCE_GIT_REVISION,
    source_tree_clean: true,
    source_tree_sha256: "c".repeat(64),
  };
  const check = (manifest: unknown, bytes = nativeBytes) =>
    hasRequiredPackagedIrohaJsNativeProvenance(
      nativeDir,
      "linux-x64",
      (path) =>
        path.endsWith("iroha_js_host.checksums.json")
          ? Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
          : bytes,
    );

  it("accepts an exact release manifest bound to the packaged native bytes", () => {
    expect(
      check({
        entries: {
          "linux-x64": exactEntry,
        },
      }),
    ).toBe(true);
  });

  it.each([
    [
      "wrong build provenance version",
      { ...exactEntry, build_provenance_version: 2 },
    ],
    [
      "wrong build execution policy",
      { ...exactEntry, build_execution_policy: "untrusted-shell-v0" },
    ],
    ["debug profile", { ...exactEntry, cargo_profile: "debug" }],
    [
      "different source revision",
      { ...exactEntry, source_git_revision: "a".repeat(40) },
    ],
    ["dirty source", { ...exactEntry, source_tree_clean: false }],
    [
      "malformed source tree SHA-256",
      { ...exactEntry, source_tree_sha256: "C".repeat(64) },
    ],
    ["unknown field", { ...exactEntry, legacy_signature: "allowed" }],
    ["wrong native checksum", { ...exactEntry, sha256: "b".repeat(64) }],
  ])("rejects a packaged manifest with %s", (_label, entry) => {
    expect(
      check({
        entries: {
          "linux-x64": entry,
        },
      }),
    ).toBe(false);
  });

  it("rejects extra platform entries and top-level compatibility fields", () => {
    expect(
      check({
        entries: {
          "linux-x64": exactEntry,
          "linux-arm64": exactEntry,
        },
      }),
    ).toBe(false);
    expect(
      check({
        entries: { "linux-x64": exactEntry },
        legacy: true,
      }),
    ).toBe(false);
  });

  it("rejects a semantically equivalent but non-canonical manifest encoding", () => {
    const manifest = { entries: { "linux-x64": exactEntry } };
    expect(
      hasRequiredPackagedIrohaJsNativeProvenance(
        nativeDir,
        "linux-x64",
        (path) =>
          path.endsWith("iroha_js_host.checksums.json")
            ? Buffer.from(JSON.stringify(manifest))
            : nativeBytes,
      ),
    ).toBe(false);
  });

  it("rejects malformed, missing, oversized, and unreadable manifests", () => {
    const variants = [
      Buffer.from("not-json"),
      Buffer.alloc(0),
      Buffer.alloc(1024 * 1024 + 1),
    ];
    for (const manifestBytes of variants) {
      expect(
        hasRequiredPackagedIrohaJsNativeProvenance(
          nativeDir,
          "linux-x64",
          (path) => {
            if (path.endsWith("iroha_js_host.checksums.json")) {
              return manifestBytes;
            }
            return nativeBytes;
          },
        ),
      ).toBe(false);
    }
    expect(
      hasRequiredPackagedIrohaJsNativeProvenance(nativeDir, "linux-x64", () => {
        throw new Error("missing");
      }),
    ).toBe(false);
  });
});

describe("hasRequiredIrohaJsNativeExports", () => {
  it("accepts binaries that expose receive-address, quoted IVM, and governance helpers", () => {
    expect(hasRequiredIrohaJsNativeExports(compatibleNativeModule())).toBe(
      true,
    );
  });

  it("rejects binaries missing required production helpers", () => {
    expect(
      hasRequiredIrohaJsNativeExports({
        deriveConfidentialReceiveAddressV2() {},
      }),
    ).toBe(false);
  });

  it("rejects binaries missing either validation-fee fingerprint export", () => {
    for (const exportName of GOVERNANCE_FINGERPRINT_EXPORTS) {
      const nativeModule = compatibleNativeModule();
      Reflect.deleteProperty(nativeModule, exportName);
      expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
    }
  });

  it("rejects binaries missing an active transaction runtime export", () => {
    for (const exportName of TRANSACTION_RUNTIME_NATIVE_EXPORTS) {
      const nativeModule = compatibleNativeModule();
      Reflect.deleteProperty(nativeModule, exportName);
      expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
    }
  });

  it("rejects binaries missing any secure private-file export", () => {
    for (const exportName of [
      "securePrivateFileAbiVersion",
      "securePrivateDirectoryEnsure",
      "securePrivateFileRead",
      "securePrivateFileWriteAtomic",
    ] as const) {
      const nativeModule = compatibleNativeModule();
      Reflect.deleteProperty(nativeModule, exportName);
      expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
    }
  });

  it("uses the explicit secure private-file ABI instead of JavaScript arity", () => {
    const nativeModule = compatibleNativeModule();
    for (const exportName of [
      "securePrivateDirectoryEnsure",
      "securePrivateFileRead",
      "securePrivateFileWriteAtomic",
    ] as const) {
      Reflect.set(nativeModule, exportName, () => undefined);
    }
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(true);
  });

  it.each([0, 2, "1", null])(
    "rejects secure private-file ABI version %j",
    (abiVersion) => {
      const nativeModule = compatibleNativeModule();
      Reflect.set(
        nativeModule,
        "securePrivateFileAbiVersion",
        () => abiVersion,
      );
      expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
    },
  );

  it("rejects a secure private-file ABI probe that throws", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.securePrivateFileAbiVersion = () => {
      throw new Error("probe failed");
    };
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("accepts opaque N-API fingerprint arities when semantic probes pass", () => {
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

    expect(nativeModule.validationFeePolicyProposalFingerprintV1.length).toBe(
      0,
    );
    expect(
      nativeModule.validationFeePayoutLifecycleProposalFingerprintV1.length,
    ).toBe(0);
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(true);
  });

  it("rejects deterministic fingerprints that miss either exact known-answer vector", () => {
    const wrongPolicyModule = compatibleNativeModule();
    wrongPolicyModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      const result = currentOperatorBoundFingerprint(...args);
      return args[0] === PROPOSAL_OPERATOR ? Buffer.alloc(32, 0x47) : result;
    };
    expect(hasRequiredIrohaJsNativeExports(wrongPolicyModule)).toBe(false);

    const wrongPayoutModule = compatibleNativeModule();
    wrongPayoutModule.validationFeePayoutLifecycleProposalFingerprintV1 =
      function (...args: unknown[]) {
        const result = currentOperatorBoundPayoutFingerprint(...args);
        return args[0] === PROPOSAL_OPERATOR ? Buffer.alloc(32, 0x8f) : result;
      };
    expect(hasRequiredIrohaJsNativeExports(wrongPayoutModule)).toBe(false);
  });

  it("rejects fingerprints that miss either exact second-operator vector", () => {
    const wrongPolicyModule = compatibleNativeModule();
    wrongPolicyModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      const result = currentOperatorBoundFingerprint(...args);
      return args[0] === SECOND_PROPOSAL_OPERATOR
        ? Buffer.alloc(32, 0x86)
        : result;
    };
    expect(hasRequiredIrohaJsNativeExports(wrongPolicyModule)).toBe(false);

    const wrongPayoutModule = compatibleNativeModule();
    wrongPayoutModule.validationFeePayoutLifecycleProposalFingerprintV1 =
      function (...args: unknown[]) {
        const result = currentOperatorBoundPayoutFingerprint(...args);
        return args[0] === SECOND_PROPOSAL_OPERATOR
          ? Buffer.alloc(32, 0x90)
          : result;
      };
    expect(hasRequiredIrohaJsNativeExports(wrongPayoutModule)).toBe(false);
  });

  it("probes both fingerprint helpers with exactly the operator and JSON arguments", () => {
    const calls: unknown[][] = [];
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      calls.push(args);
      return currentOperatorBoundFingerprint(...args);
    };
    nativeModule.validationFeePayoutLifecycleProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      calls.push(args);
      return currentOperatorBoundPayoutFingerprint(...args);
    };
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(true);
    expect(calls).toHaveLength(8);
    for (const call of calls) {
      expect(call).toHaveLength(2);
      expect(typeof call[0]).toBe("string");
      expect(typeof call[1]).toBe("string");
    }
  });

  it("rejects the retired policy fixture and its trailing lifecycle argument", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      const policy = JSON.parse(String(args[1])) as Record<string, unknown>;
      if (
        "effective_from_height" in policy ||
        "treasury_payout_binding" in policy ||
        args.length !== 2
      ) {
        return POLICY_FINGERPRINT;
      }
      throw new Error(
        "validation-fee policy must contain exactly [schema_version, network_id, policy_version, previous_policy_hash, ds_asset_id, ds_scale, effective_from_height, expires_after_height, treasury_payout_binding]",
      );
    };
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects nondeterministic or operator-insensitive policy fingerprints", () => {
    const nondeterministicModule = compatibleNativeModule();
    let primaryCalls = 0;
    nondeterministicModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      const result = currentOperatorBoundFingerprint(...args);
      if (args[0] !== PROPOSAL_OPERATOR || args[1] === "{}") {
        return result;
      }
      primaryCalls += 1;
      return primaryCalls === 1 ? result : Buffer.alloc(32, 0x48);
    };
    expect(hasRequiredIrohaJsNativeExports(nondeterministicModule)).toBe(false);

    const insensitiveModule = compatibleNativeModule();
    insensitiveModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      if (args[1] === "{}") {
        throw new Error(
          "validation-fee policy must contain exactly [current fields]",
        );
      }
      return POLICY_FINGERPRINT;
    };
    expect(hasRequiredIrohaJsNativeExports(insensitiveModule)).toBe(false);

    const insensitivePayoutModule = compatibleNativeModule();
    insensitivePayoutModule.validationFeePayoutLifecycleProposalFingerprintV1 =
      function (...args: unknown[]) {
        if (args[1] === "{}") {
          throw new Error("payout binding must contain exactly [current]");
        }
        return PAYOUT_FINGERPRINT;
      };
    expect(hasRequiredIrohaJsNativeExports(insensitivePayoutModule)).toBe(
      false,
    );
  });

  it("rejects a policy helper that accepts the malformed rejection probe", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      if (args[1] === "{}") return Buffer.alloc(32);
      return currentOperatorBoundFingerprint(...args);
    };
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects a rejection probe that fails with an unrelated error", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePolicyProposalFingerprintV1 = function (
      ...args: unknown[]
    ) {
      if (args[1] === "{}") {
        throw new Error("ERR_UNSUPPORTED_ADDRESS_FORMAT");
      }
      return currentOperatorBoundFingerprint(...args);
    };
    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects a native Connect bridge ABI other than 29", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.connectNoritoBridgeAbiVersion = () => 20;

    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects a native Connect bridge ABI probe that throws", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.connectNoritoBridgeAbiVersion = () => {
      throw new Error("probe failed");
    };

    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects binaries whose payout fingerprint helper accepts the invalid probe", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePayoutLifecycleProposalFingerprintV1 = function (
      _proposalOperator: unknown,
      _payoutBindingJson: unknown,
    ) {
      void _proposalOperator;
      void _payoutBindingJson;
      return Buffer.alloc(32);
    };

    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("configures the active SDK native pair before installing the app singleton", () => {
    const nativeModule = compatibleNativeModule();
    const globalTarget = {} as Record<string, unknown>;
    const env = {} as NodeJS.ProcessEnv;

    const installed = installGlobalIrohaJsNativeBinding(
      DEVELOPMENT_MODULE_URL,
      env,
      () => nativeModule,
      developmentNativeExists,
      undefined,
      globalTarget,
    );

    expect(installed).toBe(nativeModule);
    expect(env.IROHA_JS_NATIVE_DIR).toBe(DEVELOPMENT_ACTIVE_NATIVE_DIR);
    expect(globalTarget.__IROHA_NATIVE_BINDING__).toBe(nativeModule);
    expect(globalTarget.__IROHA_NORITO_BINDING__).toBe(nativeModule);
  });
});
