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
};

type ResolveNativeBuildRequirement = (
  irohaPackagePath: string,
  platformKey?: string,
) => NativeBuildRequirement;

const postinstallNativeCheckModuleUrl = pathToFileURL(
  resolve(process.cwd(), "scripts", "postinstallNativeCheck.mjs"),
).href;
const {
  resolveNativeBuildRequirement,
}: {
  resolveNativeBuildRequirement: ResolveNativeBuildRequirement;
} = await import(postinstallNativeCheckModuleUrl);

const makeTempPackage = () => {
  const root = mkdtempSync(join(tmpdir(), "iroha-postinstall-"));
  const nativeDir = join(root, "native");
  mkdirSync(nativeDir, { recursive: true });
  return { root, nativeDir };
};

const sha256 = (value: string): string =>
  createHash("sha256").update(Buffer.from(value, "utf8")).digest("hex");

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const target = tempRoots.pop();
    if (target) {
      rmSync(target, { recursive: true, force: true });
    }
  }
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
    );

    expect(result.shouldBuild).toBe(false);
    expect(result.reason).toBe("native binding is current");
    expect(result.expectedSha256).toBe(sha256("native-binary"));
    expect(result.actualSha256).toBe(sha256("native-binary"));
  });
});
