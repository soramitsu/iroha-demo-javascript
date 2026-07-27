import { createHash } from "node:crypto";

import {
  inspectSubscriptionTriggerAction,
  noritoDecodeInstruction,
} from "@iroha/iroha-js";
import { describe, expect, it, vi } from "vitest";
import {
  configureIrohaJsNativeDir,
  hasRequiredIrohaJsNativeExports,
  installGlobalIrohaJsNativeBinding,
  resolveIrohaJsNativeDir,
} from "../electron/irohaJsNativeDir";
import { hasRequiredPackagedIrohaJsNativeProvenance } from "../electron/irohaJsNativeProvenance";

const REVIEWED_IROHA_SOURCE_GIT_REVISION =
  "1bcb05eb208d8bda1610789d827a7ed97e66e56c";

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
    return JSON.stringify({ trusted: "decode" });
  },
  noritoEncodeInstruction() {
    return Buffer.from([0]);
  },
  inspectSubscriptionTriggerAction() {
    return JSON.stringify({ trusted: "inspection" });
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

describe("irohaJsNativeDir", () => {
  it("prefers the installed iroha-js native directory when dist/native is absent", () => {
    const seenPaths: string[] = [];
    const resolved = resolveIrohaJsNativeDir(
      "file:///Users/test/app/dist/preload/preload.mjs",
      (path) => {
        seenPaths.push(path);
        return path.endsWith(
          "/node_modules/@iroha/iroha-js/native/iroha_js_host.node",
        );
      },
      () => compatibleNativeModule(),
    );

    expect(resolved).toBe(
      "/Users/test/app/node_modules/@iroha/iroha-js/native",
    );
    expect(seenPaths[0]).toBe(
      "/Users/test/app/node_modules/@iroha/iroha-js/native/iroha_js_host.node",
    );
  });

  it("does not overwrite an explicit native-dir override", () => {
    const env = {
      IROHA_JS_NATIVE_DIR: "/custom/native",
    } as NodeJS.ProcessEnv;

    const resolved = configureIrohaJsNativeDir(
      "file:///Users/test/app/dist/preload/preload.mjs",
      env,
      () => false,
    );

    expect(resolved).toBe("/custom/native");
    expect(env.IROHA_JS_NATIVE_DIR).toBe("/custom/native");
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

  it("falls back to dist/native when the installed package native binary is incompatible", () => {
    const resolved = resolveIrohaJsNativeDir(
      "file:///Users/test/app/dist/preload/preload.mjs",
      (path) =>
        path.endsWith(
          "/node_modules/@iroha/iroha-js/native/iroha_js_host.node",
        ) || path.endsWith("/dist/native/iroha_js_host.node"),
      (_moduleUrl, nativeModulePath) =>
        nativeModulePath.endsWith("/dist/native/iroha_js_host.node")
          ? compatibleNativeModule()
          : {},
      (nativeDir) => nativeDir,
    );

    expect(resolved).toBe("/Users/test/app/dist/native");
  });

  it("never returns a packaged binding whose release provenance is invalid", () => {
    const resolved = resolveIrohaJsNativeDir(
      "file:///Users/test/app/dist/preload/preload.mjs",
      (path) => path.endsWith("/dist/native/iroha_js_host.node"),
      () => compatibleNativeModule(),
      () => null,
    );

    expect(resolved).toBeNull();
  });

  it("requires provenance for every candidate when running from app.asar", () => {
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
      "/Applications/SORA.app/Contents/Resources/app.asar/node_modules/@iroha/iroha-js/native",
      "/Applications/SORA.app/Contents/Resources/node_modules/@iroha/iroha-js/native",
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
        "file:///Users/test/app/dist/preload/preload.mjs",
        { IROHA_JS_NATIVE_DIR: "/mock/native" } as NodeJS.ProcessEnv,
        () => nativeModule,
        undefined,
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

describe("hasRequiredPackagedIrohaJsNativeProvenance", () => {
  const nativeDir = "/mock/dist/native";
  const nativeBytes = Buffer.from("reviewed-v4-native-fixture");
  const nativeSha256 = createHash("sha256").update(nativeBytes).digest("hex");
  const exactEntry = {
    sha256: nativeSha256,
    cargo_profile: "release",
    source_git_revision: REVIEWED_IROHA_SOURCE_GIT_REVISION,
    source_tree_clean: true,
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
    ["debug profile", { ...exactEntry, cargo_profile: "debug" }],
    [
      "different source revision",
      { ...exactEntry, source_git_revision: "a".repeat(40) },
    ],
    ["dirty source", { ...exactEntry, source_tree_clean: false }],
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
  it("accepts binaries that expose confidential, quoted IVM, and governance helpers", () => {
    expect(hasRequiredIrohaJsNativeExports(compatibleNativeModule())).toBe(
      true,
    );
  });

  it("rejects binaries missing required production helpers", () => {
    expect(
      hasRequiredIrohaJsNativeExports({
        deriveConfidentialReceiveAddressV2() {},
        buildConfidentialTransferProofV2() {},
        buildConfidentialUnshieldProofV2() {},
        buildConfidentialUnshieldProofV3() {},
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

  it("rejects stale validation-fee fingerprint arities", () => {
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

    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("rejects a native Connect bridge ABI other than 21", () => {
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

  it("rejects binaries whose fingerprint helpers fail the canonical Rust vectors", () => {
    const nativeModule = compatibleNativeModule();
    nativeModule.validationFeePayoutLifecycleProposalFingerprintV1 = function (
      _payoutBinding: unknown,
      _plainElectorateRules: unknown,
    ) {
      void _payoutBinding;
      void _plainElectorateRules;
      return Buffer.alloc(32);
    };

    expect(hasRequiredIrohaJsNativeExports(nativeModule)).toBe(false);
  });

  it("installs the resolved native module for SDK calls bundled through Electron", () => {
    const nativeModule = compatibleNativeModule();
    const globalTarget = {} as Record<string, unknown>;

    const installed = installGlobalIrohaJsNativeBinding(
      "file:///Users/test/app/dist/preload/preload.mjs",
      { IROHA_JS_NATIVE_DIR: "/mock/native" } as NodeJS.ProcessEnv,
      () => nativeModule,
      undefined,
      undefined,
      globalTarget,
    );

    expect(installed).toBe(nativeModule);
    expect(globalTarget.__IROHA_NATIVE_BINDING__).toBe(nativeModule);
    expect(globalTarget.__IROHA_NORITO_BINDING__).toBe(nativeModule);
  });

  it("routes active SDK Norito surfaces through the one installed binding", () => {
    const nativeDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "__IROHA_NATIVE_BINDING__",
    );
    const noritoDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      "__IROHA_NORITO_BINDING__",
    );
    const nativeModule = compatibleNativeModule();
    const decode = vi.spyOn(nativeModule, "noritoDecodeInstruction");
    const inspect = vi.spyOn(nativeModule, "inspectSubscriptionTriggerAction");

    try {
      Reflect.deleteProperty(globalThis, "__IROHA_NATIVE_BINDING__");
      Reflect.deleteProperty(globalThis, "__IROHA_NORITO_BINDING__");
      installGlobalIrohaJsNativeBinding(
        "file:///Users/test/app/dist/preload/preload.mjs",
        { IROHA_JS_NATIVE_DIR: "/mock/native" } as NodeJS.ProcessEnv,
        () => nativeModule,
      );

      expect(noritoDecodeInstruction(Buffer.from([0]))).toEqual({
        trusted: "decode",
      });
      expect(inspectSubscriptionTriggerAction("canonical-action")).toEqual({
        trusted: "inspection",
      });
      expect(decode).toHaveBeenCalledOnce();
      expect(inspect).toHaveBeenCalledOnce();
    } finally {
      for (const [slot, descriptor] of [
        ["__IROHA_NATIVE_BINDING__", nativeDescriptor],
        ["__IROHA_NORITO_BINDING__", noritoDescriptor],
      ] as const) {
        Reflect.deleteProperty(globalThis, slot);
        if (descriptor !== undefined) {
          Object.defineProperty(globalThis, slot, descriptor);
        }
      }
    }
  });
});
