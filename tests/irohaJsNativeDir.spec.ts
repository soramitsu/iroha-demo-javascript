import { describe, expect, it } from "vitest";
import {
  configureIrohaJsNativeDir,
  hasRequiredIrohaJsNativeExports,
  installGlobalIrohaJsNativeBinding,
  resolveIrohaJsNativeDir,
} from "../electron/irohaJsNativeDir";

const compatibleNativeModule = () => ({
  deriveConfidentialReceiveAddressV2() {},
  buildConfidentialTransferProofV2() {},
  buildConfidentialUnshieldProofV2() {},
  buildConfidentialUnshieldProofV3() {},
  buildIvmProvedTransactionPayload() {},
  signQuotedIvmProvedTransactionPayload() {},
  connectNoritoBridgeAbiVersion() {
    return 21;
  },
});

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
    );

    expect(resolved).toBe("/Users/test/app/dist/native");
  });
});

describe("hasRequiredIrohaJsNativeExports", () => {
  it("accepts binaries that expose confidential and quoted IVM helpers", () => {
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

  it("installs the resolved native module for SDK calls bundled through Electron", () => {
    const previous = (
      globalThis as typeof globalThis & { __IROHA_NATIVE_BINDING__?: unknown }
    ).__IROHA_NATIVE_BINDING__;
    try {
      delete (
        globalThis as typeof globalThis & { __IROHA_NATIVE_BINDING__?: unknown }
      ).__IROHA_NATIVE_BINDING__;
      const nativeModule = compatibleNativeModule();

      const installed = installGlobalIrohaJsNativeBinding(
        "file:///Users/test/app/dist/preload/preload.mjs",
        { IROHA_JS_NATIVE_DIR: "/mock/native" } as NodeJS.ProcessEnv,
        () => nativeModule,
      );

      expect(installed).toBe(nativeModule);
      expect(
        (
          globalThis as typeof globalThis & {
            __IROHA_NATIVE_BINDING__?: unknown;
          }
        ).__IROHA_NATIVE_BINDING__,
      ).toBe(nativeModule);
    } finally {
      if (previous === undefined) {
        delete (
          globalThis as typeof globalThis & {
            __IROHA_NATIVE_BINDING__?: unknown;
          }
        ).__IROHA_NATIVE_BINDING__;
      } else {
        (
          globalThis as typeof globalThis & {
            __IROHA_NATIVE_BINDING__?: unknown;
          }
        ).__IROHA_NATIVE_BINDING__ = previous;
      }
    }
  });
});
