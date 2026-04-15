import { describe, expect, it } from "vitest";
import {
  configureIrohaJsNativeDir,
  resolveIrohaJsNativeDir,
} from "../electron/irohaJsNativeDir";

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
    );

    expect(resolved).toBe(
      "/Users/test/app/node_modules/@iroha/iroha-js/native",
    );
    expect(seenPaths[0]).toBe("/Users/test/app/dist/native/iroha_js_host.node");
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
});
