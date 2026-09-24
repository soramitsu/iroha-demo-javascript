// @vitest-environment node

import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  FIRST_RELEASE_FORBIDDEN_RUNTIME_MARKERS,
  verifyFirstReleaseRuntimeBuild,
} from "../scripts/verify-first-release-runtime.mjs";

const roots: string[] = [];

const makeBuild = () => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "sora-wallet-runtime-build-")),
  );
  roots.push(root);
  const distRoot = join(root, "dist");
  for (const [relativePath, contents] of [
    ["main/index.cjs", "exports.ready=true;"],
    ["preload/preload.mjs", "export const ready=true;"],
    [
      "renderer/index.html",
      "<!doctype html><script src='./assets/index.js'></script>",
    ],
    ["renderer/assets/index.js", "globalThis.ready=true;"],
  ] as const) {
    const path = join(distRoot, ...relativePath.split("/"));
    mkdirSync(join(path, ".."), { recursive: true });
    writeFileSync(path, contents, "utf8");
  }
  return distRoot;
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("first-release runtime build verifier", () => {
  it("accepts the exact clean main, preload, and renderer graph", () => {
    const distRoot = makeBuild();
    expect(verifyFirstReleaseRuntimeBuild({ distRoot })).toEqual([
      "main/index.cjs",
      "preload/preload.mjs",
      "renderer/assets/index.js",
      "renderer/index.html",
    ]);
  });

  it.each(FIRST_RELEASE_FORBIDDEN_RUNTIME_MARKERS)(
    "rejects retired semantic marker %s",
    (marker) => {
      const distRoot = makeBuild();
      writeFileSync(
        join(distRoot, "renderer", "assets", "index.js"),
        `globalThis.label=${JSON.stringify(marker)};`,
        "utf8",
      );
      expect(() => verifyFirstReleaseRuntimeBuild({ distRoot })).toThrow(
        "Retired first-release runtime marker",
      );
    },
  );

  it("rejects retired filenames and symlinked runtime entries", () => {
    const distRoot = makeBuild();
    writeFileSync(
      join(distRoot, "renderer", "assets", "sccpProver.worker.js"),
      "export {};",
      "utf8",
    );
    expect(() => verifyFirstReleaseRuntimeBuild({ distRoot })).toThrow(
      "Retired first-release asset",
    );

    rmSync(join(distRoot, "renderer", "assets", "sccpProver.worker.js"));
    symlinkSync(
      join(distRoot, "renderer", "assets", "index.js"),
      join(distRoot, "renderer", "assets", "linked.js"),
    );
    expect(() => verifyFirstReleaseRuntimeBuild({ distRoot })).toThrow(
      "contains a symlink",
    );
  });
});
