import {
  mkdirSync,
  mkdtempSync,
  linkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  collectReleaseArtifacts,
  expectedReleaseArtifactNames,
  validateReleaseArtifactInventory,
} from "../scripts/collect-release-artifacts.mjs";

const roots: string[] = [];
const version = "2.0.1";

const makeRoot = (): string => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "sora-wallet-release-artifacts-")),
  );
  roots.push(root);
  return root;
};

const writeArtifacts = (directory: string, names: readonly string[]): void => {
  mkdirSync(directory, { recursive: true });
  for (const name of names) {
    writeFileSync(join(directory, name), `artifact:${name}`, "utf8");
  }
};

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("release artifact inventory", () => {
  it("defines the exact nine-file first-release matrix", () => {
    expect(expectedReleaseArtifactNames({ platform: "all", version })).toEqual([
      "SORA-Wallet-2.0.1-linux-x64.AppImage",
      "SORA-Wallet-2.0.1-linux-x64.deb",
      "SORA-Wallet-2.0.1-linux-x64.rpm",
      "SORA-Wallet-2.0.1-mac-arm64.dmg",
      "SORA-Wallet-2.0.1-mac-arm64.zip",
      "SORA-Wallet-2.0.1-mac-x64.dmg",
      "SORA-Wallet-2.0.1-mac-x64.zip",
      "SORA-Wallet-2.0.1-win-x64.exe",
      "SORA-Wallet-2.0.1-win-x64.zip",
    ]);
  });

  it("collects only the exact matrix entry for a build job", () => {
    const root = makeRoot();
    const release = join(root, "release");
    const output = join(root, "artifact-output");
    const expected = expectedReleaseArtifactNames({
      arch: "arm64",
      platform: "mac",
      version,
    });
    writeArtifacts(release, expected);

    expect(
      collectReleaseArtifacts({
        arch: "arm64",
        outputDirectory: output,
        platform: "mac",
        sourceDirectory: release,
        version,
      }),
    ).toEqual(expected);
    expect(
      validateReleaseArtifactInventory({
        arch: "arm64",
        platform: "mac",
        sourceDirectory: output,
        version,
      }),
    ).toEqual(expected);
  });

  it("rejects missing and unexpected distributables", () => {
    const root = makeRoot();
    const release = join(root, "release");
    writeArtifacts(release, ["SORA-Wallet-2.0.1-win-x64.exe"]);
    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("inventory mismatch");

    writeFileSync(
      join(release, "SORA-Wallet-2.0.1-win-x64.zip"),
      "zip",
      "utf8",
    );
    writeFileSync(
      join(release, "SORA-Wallet-2.0.1-win-arm64.zip"),
      "unexpected",
      "utf8",
    );
    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("inventory mismatch");
  });

  it("rejects every unexpected entry in the merged publish inventory", () => {
    const root = makeRoot();
    const release = join(root, "release");
    const names = expectedReleaseArtifactNames({
      platform: "all",
      version,
    });
    writeArtifacts(release, names);
    writeFileSync(
      join(release, "unreviewed-sidecar.txt"),
      "unexpected",
      "utf8",
    );

    expect(() =>
      validateReleaseArtifactInventory({
        platform: "all",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("inventory mismatch");
  });

  it("rejects empty files and symlinks", () => {
    const root = makeRoot();
    const release = join(root, "release");
    const names = expectedReleaseArtifactNames({
      arch: "x64",
      platform: "win",
      version,
    });
    writeArtifacts(release, names);
    writeFileSync(join(release, names[0] ?? "missing"), "");
    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("non-empty canonical physical file");

    rmSync(join(release, names[0] ?? "missing"));
    symlinkSync(
      join(release, names[1] ?? "missing"),
      join(release, names[0] ?? "missing"),
    );
    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("canonical physical file");
  });

  it("refuses to traverse a symlinked artifact directory", () => {
    const root = makeRoot();
    const release = join(root, "release");
    const linkedRelease = join(root, "linked-release");
    const names = expectedReleaseArtifactNames({
      arch: "x64",
      platform: "win",
      version,
    });
    writeArtifacts(release, names);
    symlinkSync(release, linkedRelease);

    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: linkedRelease,
        version,
      }),
    ).toThrow("canonical physical directory");
  });

  it("refuses source paths that traverse a symlinked parent", () => {
    const root = makeRoot();
    const physicalParent = join(root, "physical");
    const linkedParent = join(root, "linked-parent");
    const release = join(physicalParent, "release");
    const names = expectedReleaseArtifactNames({
      arch: "x64",
      platform: "win",
      version,
    });
    writeArtifacts(release, names);
    symlinkSync(physicalParent, linkedParent);

    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: join(linkedParent, "release"),
        version,
      }),
    ).toThrow("canonical physical directory");
  });

  it("rejects hard-linked artifacts and symlinked output parents", () => {
    const root = makeRoot();
    const release = join(root, "release");
    const names = expectedReleaseArtifactNames({
      arch: "x64",
      platform: "win",
      version,
    });
    writeArtifacts(release, names);
    const first = join(release, names[0] ?? "missing");
    const external = join(root, "external-artifact");
    linkSync(first, external);
    expect(() =>
      validateReleaseArtifactInventory({
        arch: "x64",
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("canonical physical file");

    rmSync(external);
    const physicalOutputParent = join(root, "physical-output");
    mkdirSync(physicalOutputParent);
    const linkedOutputParent = join(root, "linked-output");
    symlinkSync(physicalOutputParent, linkedOutputParent);
    expect(() =>
      collectReleaseArtifacts({
        arch: "x64",
        outputDirectory: join(linkedOutputParent, "artifacts"),
        platform: "win",
        sourceDirectory: release,
        version,
      }),
    ).toThrow("output parent must be a canonical physical directory");
  });
});
