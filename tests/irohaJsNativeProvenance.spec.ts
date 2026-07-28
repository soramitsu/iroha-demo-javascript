import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupStalePackagedIrohaJsNativeSnapshots,
  hasRequiredPackagedIrohaJsNativeProvenance,
  isProcessDefinitelyAbsent,
  materializeRequiredPackagedIrohaJsNativeSnapshot,
  releaseMaterializedPackagedIrohaJsNativeSnapshot,
} from "../electron/irohaJsNativeProvenance";
import { resolveIrohaJsNativeDir } from "../electron/irohaJsNativeDir";

const SOURCE_GIT_REVISION = "1bcb05eb208d8bda1610789d827a7ed97e66e56c";
const SOURCE_TREE_SHA256 = "c".repeat(64);
const NATIVE_FILENAME = "iroha_js_host.node";
const MANIFEST_FILENAME = "iroha_js_host.checksums.json";

const MACH_SIGNATURE_OFFSET = 120;
const MACH_LINKEDIT_COMMAND_OFFSET = 32;
const MACH_CODE_SIGNATURE_COMMAND_OFFSET = 104;

const PE_UNSIGNED_SIZE = 512;
const PE_HEADER_OFFSET = 64;
const PE_COFF_OFFSET = PE_HEADER_OFFSET + 4;
const PE_OPTIONAL_OFFSET = PE_COFF_OFFSET + 20;
const PE_CHECKSUM_OFFSET = PE_OPTIONAL_OFFSET + 64;
const PE_CERTIFICATE_DIRECTORY_OFFSET = PE_OPTIONAL_OFFSET + 112 + 4 * 8;

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const canonicalManifest = (
  platformKey: string,
  nativeSha256: string,
  platformFields: Record<string, unknown> = {},
): Buffer =>
  Buffer.from(
    `${JSON.stringify(
      {
        entries: {
          [platformKey]: {
            sha256: nativeSha256,
            build_provenance_version: 3,
            build_execution_policy: "trusted-local-cargo-v1",
            cargo_profile: "release",
            source_git_revision: SOURCE_GIT_REVISION,
            source_tree_clean: true,
            source_tree_sha256: SOURCE_TREE_SHA256,
            ...platformFields,
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

const checkFixture = (
  platformKey: string,
  nativeBytes: Buffer,
  manifestBytes: Buffer,
): boolean =>
  hasRequiredPackagedIrohaJsNativeProvenance(
    "/fixture/native",
    platformKey,
    (path) => (path.endsWith(MANIFEST_FILENAME) ? manifestBytes : nativeBytes),
  );

const makeMachO = (signatureBytes: Buffer, pageBytes = 0x4000): Buffer => {
  const bytes = Buffer.alloc(MACH_SIGNATURE_OFFSET + signatureBytes.length);

  bytes.writeUInt32LE(0xfeedfacf, 0);
  bytes.writeUInt32LE(2, 16);
  bytes.writeUInt32LE(88, 20);

  bytes.writeUInt32LE(0x19, MACH_LINKEDIT_COMMAND_OFFSET);
  bytes.writeUInt32LE(72, MACH_LINKEDIT_COMMAND_OFFSET + 4);
  Buffer.from("__LINKEDIT", "ascii").copy(
    bytes,
    MACH_LINKEDIT_COMMAND_OFFSET + 8,
  );
  bytes.writeBigUInt64LE(
    BigInt(Math.ceil(signatureBytes.length / pageBytes) * pageBytes),
    MACH_LINKEDIT_COMMAND_OFFSET + 32,
  );
  bytes.writeBigUInt64LE(
    BigInt(MACH_SIGNATURE_OFFSET),
    MACH_LINKEDIT_COMMAND_OFFSET + 40,
  );
  bytes.writeBigUInt64LE(
    BigInt(signatureBytes.length),
    MACH_LINKEDIT_COMMAND_OFFSET + 48,
  );

  bytes.writeUInt32LE(0x1d, MACH_CODE_SIGNATURE_COMMAND_OFFSET);
  bytes.writeUInt32LE(16, MACH_CODE_SIGNATURE_COMMAND_OFFSET + 4);
  bytes.writeUInt32LE(
    MACH_SIGNATURE_OFFSET,
    MACH_CODE_SIGNATURE_COMMAND_OFFSET + 8,
  );
  bytes.writeUInt32LE(
    signatureBytes.length,
    MACH_CODE_SIGNATURE_COMMAND_OFFSET + 12,
  );
  signatureBytes.copy(bytes, MACH_SIGNATURE_OFFSET);

  return bytes;
};

const machOSigningIndependentSha256 = (bytes: Buffer): string => {
  const normalized = Buffer.from(bytes.subarray(0, MACH_SIGNATURE_OFFSET));
  normalized.fill(
    0,
    MACH_LINKEDIT_COMMAND_OFFSET + 32,
    MACH_LINKEDIT_COMMAND_OFFSET + 40,
  );
  normalized.fill(
    0,
    MACH_LINKEDIT_COMMAND_OFFSET + 48,
    MACH_LINKEDIT_COMMAND_OFFSET + 56,
  );
  normalized.fill(
    0,
    MACH_CODE_SIGNATURE_COMMAND_OFFSET + 12,
    MACH_CODE_SIGNATURE_COMMAND_OFFSET + 16,
  );
  return sha256(normalized);
};

const makeUnsignedPe32Plus = (): Buffer => {
  const bytes = Buffer.alloc(PE_UNSIGNED_SIZE);
  bytes[0] = 0x4d;
  bytes[1] = 0x5a;
  bytes.writeUInt32LE(PE_HEADER_OFFSET, 0x3c);
  Buffer.from([0x50, 0x45, 0x00, 0x00]).copy(bytes, PE_HEADER_OFFSET);
  bytes.writeUInt16LE(240, PE_COFF_OFFSET + 16);
  bytes.writeUInt16LE(0x20b, PE_OPTIONAL_OFFSET);
  bytes.writeUInt32LE(16, PE_OPTIONAL_OFFSET + 108);
  Buffer.from("reviewed-pe-code", "ascii").copy(bytes, 384);
  return bytes;
};

const signPe = (
  unsignedBytes: Buffer,
  certificateBytes: Buffer,
  checksum: number,
): Buffer => {
  const bytes = Buffer.alloc(unsignedBytes.length + certificateBytes.length);
  unsignedBytes.copy(bytes);
  bytes.writeUInt32LE(checksum, PE_CHECKSUM_OFFSET);
  bytes.writeUInt32LE(unsignedBytes.length, PE_CERTIFICATE_DIRECTORY_OFFSET);
  bytes.writeUInt32LE(
    certificateBytes.length,
    PE_CERTIFICATE_DIRECTORY_OFFSET + 4,
  );
  certificateBytes.copy(bytes, unsignedBytes.length);
  return bytes;
};

const peSigningIndependentSha256 = (
  bytes: Buffer,
  unsignedSize = PE_UNSIGNED_SIZE,
): string => {
  const normalized = Buffer.from(bytes.subarray(0, unsignedSize));
  normalized.fill(0, PE_CHECKSUM_OFFSET, PE_CHECKSUM_OFFSET + 4);
  normalized.fill(
    0,
    PE_CERTIFICATE_DIRECTORY_OFFSET,
    PE_CERTIFICATE_DIRECTORY_OFFSET + 8,
  );
  return sha256(normalized);
};

const temporaryPaths: string[] = [];

afterEach(() => {
  while (temporaryPaths.length > 0) {
    const path = temporaryPaths.pop();
    if (path) rmSync(path, { recursive: true, force: true });
  }
});

describe("packaged Iroha native provenance fixtures", () => {
  it("removes only stale, process-owned snapshot directories", () => {
    const temporaryRoot = mkdtempSync(join(tmpdir(), "iroha-stale-scan-"));
    temporaryPaths.push(temporaryRoot);
    const stale = join(temporaryRoot, "sora-iroha-js-native-v1-111111-dead01");
    const live = join(temporaryRoot, "sora-iroha-js-native-v1-222222-alive1");
    const current = join(
      temporaryRoot,
      "sora-iroha-js-native-v1-333333-self01",
    );
    const unknown = join(
      temporaryRoot,
      "sora-iroha-js-native-v1-444444-unknow",
    );
    const nonDirectory = join(
      temporaryRoot,
      "sora-iroha-js-native-v1-555555-file01",
    );
    const malformed = join(
      temporaryRoot,
      "sora-iroha-js-native-v1-not-a-pid-bad001",
    );
    const unexpectedContents = join(
      temporaryRoot,
      "sora-iroha-js-native-v1-666666-extra1",
    );
    for (const directory of [
      stale,
      live,
      current,
      unknown,
      malformed,
      unexpectedContents,
    ]) {
      mkdirSync(directory);
    }
    for (const directory of [
      stale,
      live,
      current,
      unknown,
      unexpectedContents,
    ]) {
      writeFileSync(join(directory, NATIVE_FILENAME), "snapshot", "utf8");
    }
    writeFileSync(join(unexpectedContents, "unexpected"), "preserve", "utf8");
    writeFileSync(nonDirectory, "preserve", "utf8");

    const checkedPids: number[] = [];
    const removed = cleanupStalePackagedIrohaJsNativeSnapshots(
      temporaryRoot,
      333333,
      (pid) => {
        checkedPids.push(pid);
        if (pid === 111111 || pid === 666666) {
          throw Object.assign(new Error("gone"), { code: "ESRCH" });
        }
        if (pid === 444444) {
          throw Object.assign(new Error("protected"), { code: "EPERM" });
        }
      },
    );

    expect(removed).toBe(1);
    expect(existsSync(stale)).toBe(false);
    for (const preserved of [
      live,
      current,
      unknown,
      nonDirectory,
      malformed,
      unexpectedContents,
    ]) {
      expect(existsSync(preserved)).toBe(true);
    }
    expect(checkedPids).not.toContain(333333);
  });

  it("treats only an exact ESRCH process probe as definitely absent", () => {
    expect(isProcessDefinitelyAbsent(1, () => undefined)).toBe(false);
    expect(
      isProcessDefinitelyAbsent(1, () => {
        throw Object.assign(new Error("gone"), { code: "ESRCH" });
      }),
    ).toBe(true);
    for (const error of [
      Object.assign(new Error("protected"), { code: "EPERM" }),
      Object.assign(new Error("invalid"), { code: "EINVAL" }),
      new RangeError("invalid pid"),
      "unknown",
    ]) {
      expect(
        isProcessDefinitelyAbsent(1, () => {
          throw error;
        }),
      ).toBe(false);
    }
  });

  it("accepts an exact canonical Linux release manifest and binary", () => {
    const nativeBytes = Buffer.from("reviewed-linux-native", "utf8");
    const manifestBytes = canonicalManifest("linux-x64", sha256(nativeBytes));

    expect(checkFixture("linux-x64", nativeBytes, manifestBytes)).toBe(true);
  });

  it("rejects malformed common field types even when the raw SHA-256 matches", () => {
    const nativeBytes = Buffer.from("reviewed-linux-native", "utf8");
    const manifestBytes = Buffer.from(
      `${JSON.stringify(
        {
          entries: {
            "linux-x64": {
              sha256: sha256(nativeBytes),
              build_provenance_version: 3,
              build_execution_policy: "trusted-local-cargo-v1",
              cargo_profile: "release",
              source_git_revision: SOURCE_GIT_REVISION,
              source_tree_clean: "true",
              source_tree_sha256: SOURCE_TREE_SHA256,
            },
          },
        },
        null,
        2,
      )}\n`,
      "utf8",
    );

    expect(checkFixture("linux-x64", nativeBytes, manifestBytes)).toBe(false);
  });

  describe("thin 64-bit little-endian Mach-O", () => {
    const reviewedMachO = makeMachO(Buffer.alloc(16, 0xa5));
    const signingIndependentSha256 =
      machOSigningIndependentSha256(reviewedMachO);

    const manifestFor = (
      nativeSha256 = sha256(reviewedMachO),
      platformField: unknown = signingIndependentSha256,
    ): Buffer =>
      canonicalManifest("darwin-arm64", nativeSha256, {
        mach_o_signing_independent_sha256: platformField,
      });

    it("accepts the exact reviewed raw binary", () => {
      expect(checkFixture("darwin-arm64", reviewedMachO, manifestFor())).toBe(
        true,
      );
    });

    it("rejects a malformed signing-independent hash type even when the raw SHA-256 matches", () => {
      expect(
        checkFixture(
          "darwin-arm64",
          reviewedMachO,
          manifestFor(sha256(reviewedMachO), 42),
        ),
      ).toBe(false);
    });

    it("rejects an inconsistent signing-independent hash even when the raw SHA-256 matches", () => {
      expect(
        checkFixture(
          "darwin-arm64",
          reviewedMachO,
          manifestFor(sha256(reviewedMachO), "f".repeat(64)),
        ),
      ).toBe(false);
    });

    it("accepts a re-signed binary with different signature bytes and size", () => {
      const resignedMachO = makeMachO(Buffer.alloc(24, 0x5a));

      expect(checkFixture("darwin-arm64", resignedMachO, manifestFor())).toBe(
        true,
      );
    });

    it("rejects mutations to signed code and malformed signature bounds", () => {
      const codeMutation = makeMachO(Buffer.alloc(24, 0x5a));
      codeMutation[24] = 1;

      const malformedBounds = makeMachO(Buffer.alloc(24, 0x5a));
      malformedBounds.writeUInt32LE(
        MACH_SIGNATURE_OFFSET + 1,
        MACH_CODE_SIGNATURE_COMMAND_OFFSET + 8,
      );

      const noncanonicalVirtualSize = makeMachO(Buffer.alloc(24, 0x5a));
      noncanonicalVirtualSize.writeBigUInt64LE(
        0x8000n,
        MACH_LINKEDIT_COMMAND_OFFSET + 32,
      );

      expect(checkFixture("darwin-arm64", codeMutation, manifestFor())).toBe(
        false,
      );
      expect(checkFixture("darwin-arm64", malformedBounds, manifestFor())).toBe(
        false,
      );
      expect(
        checkFixture("darwin-arm64", noncanonicalVirtualSize, manifestFor()),
      ).toBe(false);
    });

    it("requires the canonical x64 __LINKEDIT page rounding", () => {
      const reviewedX64MachO = makeMachO(Buffer.alloc(16, 0xa5), 0x1000);
      const x64Manifest = canonicalManifest(
        "darwin-x64",
        sha256(reviewedX64MachO),
        {
          mach_o_signing_independent_sha256:
            machOSigningIndependentSha256(reviewedX64MachO),
        },
      );
      const arm64RoundedMachO = makeMachO(Buffer.alloc(16, 0xa5), 0x4000);

      expect(checkFixture("darwin-x64", reviewedX64MachO, x64Manifest)).toBe(
        true,
      );
      expect(checkFixture("darwin-x64", arm64RoundedMachO, x64Manifest)).toBe(
        false,
      );
    });
  });

  describe("PE32+ Authenticode", () => {
    const reviewedUnsignedPe = makeUnsignedPe32Plus();
    const signingIndependentSha256 =
      peSigningIndependentSha256(reviewedUnsignedPe);

    const manifestFor = (
      nativeSha256 = sha256(reviewedUnsignedPe),
      signingHash: unknown = signingIndependentSha256,
      unsignedSize: unknown = PE_UNSIGNED_SIZE,
    ): Buffer =>
      canonicalManifest("win32-x64", nativeSha256, {
        pe_signing_independent_sha256: signingHash,
        pe_unsigned_size: unsignedSize,
      });

    it("accepts the exact reviewed unsigned binary", () => {
      expect(checkFixture("win32-x64", reviewedUnsignedPe, manifestFor())).toBe(
        true,
      );
    });

    it.each([
      ["signing-independent hash", 42, PE_UNSIGNED_SIZE],
      ["unsigned size", signingIndependentSha256, String(PE_UNSIGNED_SIZE)],
      ["out-of-bounds unsigned size", signingIndependentSha256, 513],
      ["inconsistent signing hash", "f".repeat(64), PE_UNSIGNED_SIZE],
    ])(
      "rejects a malformed %s even when the raw SHA-256 matches",
      (_label, signingHash, unsignedSize) => {
        expect(
          checkFixture(
            "win32-x64",
            reviewedUnsignedPe,
            manifestFor(sha256(reviewedUnsignedPe), signingHash, unsignedSize),
          ),
        ).toBe(false);
      },
    );

    it("accepts Authenticode re-signing with different certificates and checksums", () => {
      const firstSignature = signPe(
        reviewedUnsignedPe,
        Buffer.alloc(8, 0x11),
        0x11111111,
      );
      const secondSignature = signPe(
        reviewedUnsignedPe,
        Buffer.alloc(16, 0x22),
        0x22222222,
      );

      expect(checkFixture("win32-x64", firstSignature, manifestFor())).toBe(
        true,
      );
      expect(checkFixture("win32-x64", secondSignature, manifestFor())).toBe(
        true,
      );
    });

    it("accepts zero Authenticode alignment padding and rejects nonzero padding", () => {
      const unalignedUnsignedPe = Buffer.from(
        reviewedUnsignedPe.subarray(0, PE_UNSIGNED_SIZE - 3),
      );
      const paddedSignature = Buffer.alloc(PE_UNSIGNED_SIZE + 8);
      unalignedUnsignedPe.copy(paddedSignature);
      paddedSignature.writeUInt32LE(0x55555555, PE_CHECKSUM_OFFSET);
      paddedSignature.writeUInt32LE(
        PE_UNSIGNED_SIZE,
        PE_CERTIFICATE_DIRECTORY_OFFSET,
      );
      paddedSignature.writeUInt32LE(8, PE_CERTIFICATE_DIRECTORY_OFFSET + 4);
      paddedSignature.fill(0x55, PE_UNSIGNED_SIZE);
      const paddedManifest = canonicalManifest(
        "win32-x64",
        sha256(unalignedUnsignedPe),
        {
          pe_signing_independent_sha256: peSigningIndependentSha256(
            unalignedUnsignedPe,
            unalignedUnsignedPe.length,
          ),
          pe_unsigned_size: unalignedUnsignedPe.length,
        },
      );

      expect(checkFixture("win32-x64", paddedSignature, paddedManifest)).toBe(
        true,
      );

      const nonzeroPadding = Buffer.from(paddedSignature);
      nonzeroPadding[PE_UNSIGNED_SIZE - 1] = 1;
      expect(checkFixture("win32-x64", nonzeroPadding, paddedManifest)).toBe(
        false,
      );
    });

    it("rejects unsigned checksum drift instead of treating it as signing", () => {
      const checksumDrift = Buffer.from(reviewedUnsignedPe);
      checksumDrift.writeUInt32LE(0x12345678, PE_CHECKSUM_OFFSET);

      expect(checkFixture("win32-x64", checksumDrift, manifestFor())).toBe(
        false,
      );
    });

    it("rejects signed code mutation and a malformed certificate table", () => {
      const codeMutation = signPe(
        reviewedUnsignedPe,
        Buffer.alloc(8, 0x33),
        0x33333333,
      );
      codeMutation[384] ^= 0xff;

      const malformedCertificate = signPe(
        reviewedUnsignedPe,
        Buffer.alloc(8, 0x44),
        0x44444444,
      );
      malformedCertificate.writeUInt32LE(
        PE_UNSIGNED_SIZE + 1,
        PE_CERTIFICATE_DIRECTORY_OFFSET,
      );

      expect(checkFixture("win32-x64", codeMutation, manifestFor())).toBe(
        false,
      );
      expect(
        checkFixture("win32-x64", malformedCertificate, manifestFor()),
      ).toBe(false);
    });

    it("rejects signing-independent fallback when the certificate is missing", () => {
      expect(
        checkFixture(
          "win32-x64",
          reviewedUnsignedPe,
          manifestFor("f".repeat(64)),
        ),
      ).toBe(false);
    });
  });

  it("reuses and releases one private snapshot of the verified bytes", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "iroha-native-source-"));
    temporaryPaths.push(sourceRoot);
    const sourceNativeDir = join(sourceRoot, "native");
    mkdirSync(sourceNativeDir);
    const nativeBytes = Buffer.from("reviewed-linux-snapshot", "utf8");
    writeFileSync(join(sourceNativeDir, NATIVE_FILENAME), nativeBytes);
    writeFileSync(
      join(sourceNativeDir, MANIFEST_FILENAME),
      canonicalManifest("linux-x64", sha256(nativeBytes)),
    );

    const snapshotDir = materializeRequiredPackagedIrohaJsNativeSnapshot(
      sourceNativeDir,
      "linux-x64",
    );
    expect(snapshotDir).not.toBeNull();
    if (snapshotDir === null) return;
    temporaryPaths.push(snapshotDir);
    expect(snapshotDir).not.toBe(sourceNativeDir);

    const snapshotPath = join(snapshotDir, NATIVE_FILENAME);
    const snapshotStats = lstatSync(snapshotPath);
    expect(snapshotStats.isFile()).toBe(true);
    expect(snapshotStats.isSymbolicLink()).toBe(false);
    if (process.platform !== "win32") {
      expect(snapshotStats.mode & 0o777).toBe(0o500);
    }

    writeFileSync(
      join(sourceNativeDir, NATIVE_FILENAME),
      "substituted-after-verification",
      "utf8",
    );
    expect(readFileSync(snapshotPath)).toEqual(nativeBytes);
    expect(
      materializeRequiredPackagedIrohaJsNativeSnapshot(
        sourceNativeDir,
        "linux-x64",
      ),
    ).toBe(snapshotDir);
    expect(releaseMaterializedPackagedIrohaJsNativeSnapshot(snapshotDir)).toBe(
      true,
    );
    expect(existsSync(snapshotDir)).toBe(false);
  });

  it("cleans a verified snapshot immediately when its native module is incompatible", () => {
    const sourceRoot = mkdtempSync(join(tmpdir(), "iroha-native-resolver-"));
    temporaryPaths.push(sourceRoot);
    const preloadPath = join(
      sourceRoot,
      "app.asar",
      "dist",
      "preload",
      "preload.mjs",
    );
    const sourceNativeDir = join(sourceRoot, "app.asar", "dist", "native");
    mkdirSync(join(sourceRoot, "app.asar", "dist", "preload"), {
      recursive: true,
    });
    mkdirSync(sourceNativeDir, { recursive: true });
    const nativeBytes = Buffer.from("reviewed-incompatible-native", "utf8");
    writeFileSync(join(sourceNativeDir, NATIVE_FILENAME), nativeBytes);
    writeFileSync(
      join(sourceNativeDir, MANIFEST_FILENAME),
      canonicalManifest("linux-x64", sha256(nativeBytes)),
    );

    let snapshotDir: string | null = null;
    const resolved = resolveIrohaJsNativeDir(
      pathToFileURL(preloadPath).href,
      existsSync,
      () => ({}),
      (nativeDir) => {
        snapshotDir = materializeRequiredPackagedIrohaJsNativeSnapshot(
          nativeDir,
          "linux-x64",
        );
        return snapshotDir;
      },
    );

    expect(resolved).toBeNull();
    expect(snapshotDir).not.toBeNull();
    if (snapshotDir !== null) expect(existsSync(snapshotDir)).toBe(false);
  });
});
