import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fchmodSync,
  fsyncSync,
  lstatSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readFileSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const CHECKSUM_FILENAME = "iroha_js_host.checksums.json";
const REVIEWED_IROHA_SOURCE_GIT_REVISION =
  "1bcb05eb208d8bda1610789d827a7ed97e66e56c";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION = 3;
const REQUIRED_NATIVE_BUILD_EXECUTION_POLICY = "trusted-local-cargo-v1";
const MAX_CHECKSUM_MANIFEST_BYTES = 1024 * 1024;
const SNAPSHOT_DIRECTORY_PREFIX = "sora-iroha-js-native-v1-";
const SNAPSHOT_DIRECTORY_PATTERN =
  /^sora-iroha-js-native-v1-([1-9][0-9]{0,9})-([A-Za-z0-9]{6})$/u;
const MAX_STALE_SNAPSHOT_SCAN_ENTRIES = 256;
const MAX_STALE_SNAPSHOT_REMOVALS = 16;
const MAX_PROCESS_ID = 0x7fffffff;

const MACH_O_64_LE_MAGIC = 0xfeedfacf;
const MACH_O_64_HEADER_BYTES = 32;
const LC_SEGMENT_64 = 0x19;
const LC_CODE_SIGNATURE = 0x1d;
const MAX_LOAD_COMMANDS = 4096;

const PE_DOS_HEADER_BYTES = 64;
const PE_SIGNATURE_BYTES = Buffer.from([0x50, 0x45, 0x00, 0x00]);
const PE_COFF_HEADER_BYTES = 20;
const PE_OPTIONAL_MAGIC_32 = 0x10b;
const PE_OPTIONAL_MAGIC_64 = 0x20b;
const PE_CHECKSUM_OFFSET = 64;
const PE_CERTIFICATE_DIRECTORY_INDEX = 4;
const PE_CERTIFICATE_ALIGNMENT = 8;

type ReadBinaryFile = (path: string) => Buffer;
type JsonObject = Record<string, unknown>;

interface MaterializedSnapshot {
  key: string;
  directory: string;
  nativePath: string;
  nativeSha256: string;
  nativeSize: number;
}

const defaultReadBinaryFile: ReadBinaryFile = (path) => readFileSync(path);
const materializedSnapshotsByKey = new Map<string, MaterializedSnapshot>();
const materializedSnapshotKeysByDirectory = new Map<string, string>();
let snapshotExitCleanupRegistered = false;
let staleSnapshotCleanupAttempted = false;

type ProcessProbe = (pid: number) => void;

const defaultProcessProbe: ProcessProbe = (pid) => {
  process.kill(pid, 0);
};

export const isProcessDefinitelyAbsent = (
  pid: number,
  probeProcess: ProcessProbe = defaultProcessProbe,
): boolean => {
  try {
    probeProcess(pid);
    return false;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ESRCH"
    );
  }
};

export const cleanupStalePackagedIrohaJsNativeSnapshots = (
  temporaryRoot = tmpdir(),
  currentPid = process.pid,
  probeProcess: ProcessProbe = defaultProcessProbe,
): number => {
  let rootDirectory: ReturnType<typeof opendirSync>;
  try {
    rootDirectory = opendirSync(temporaryRoot);
  } catch {
    return 0;
  }

  let removed = 0;
  try {
    for (
      let inspected = 0;
      inspected < MAX_STALE_SNAPSHOT_SCAN_ENTRIES &&
      removed < MAX_STALE_SNAPSHOT_REMOVALS;
      inspected += 1
    ) {
      const entry = rootDirectory.readSync();
      if (entry === null) break;
      const match = SNAPSHOT_DIRECTORY_PATTERN.exec(entry.name);
      if (match === null || !entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }
      const ownerPidLiteral = match[1];
      const ownerPid = Number(ownerPidLiteral);
      if (
        !Number.isSafeInteger(ownerPid) ||
        ownerPid <= 0 ||
        ownerPid > MAX_PROCESS_ID ||
        String(ownerPid) !== ownerPidLiteral ||
        ownerPid === currentPid
      ) {
        continue;
      }
      if (!isProcessDefinitelyAbsent(ownerPid, probeProcess)) continue;

      const candidate = join(temporaryRoot, entry.name);
      const nativePath = join(candidate, NATIVE_MODULE_FILENAME);
      let candidateDirectory: ReturnType<typeof opendirSync> | undefined;
      try {
        const candidateStat = lstatSync(candidate);
        if (!candidateStat.isDirectory() || candidateStat.isSymbolicLink()) {
          continue;
        }
        candidateDirectory = opendirSync(candidate);
        const firstChild = candidateDirectory.readSync();
        const secondChild = candidateDirectory.readSync();
        if (
          firstChild === null ||
          firstChild.name !== NATIVE_MODULE_FILENAME ||
          !firstChild.isFile() ||
          firstChild.isSymbolicLink() ||
          secondChild !== null
        ) {
          continue;
        }
        const nativeStat = lstatSync(nativePath);
        if (!nativeStat.isFile() || nativeStat.isSymbolicLink()) continue;
        candidateDirectory.closeSync();
        candidateDirectory = undefined;
        unlinkSync(nativePath);
        rmdirSync(candidate);
        removed += 1;
      } catch {
        // Preserve any directory whose ownership or contents changed mid-scan.
      } finally {
        if (candidateDirectory !== undefined) {
          try {
            candidateDirectory.closeSync();
          } catch {
            // Preserve the fail-safe cleanup result.
          }
        }
      }
    }
  } catch {
    return removed;
  } finally {
    try {
      rootDirectory.closeSync();
    } catch {
      // Preserve the fail-safe cleanup result.
    }
  }
  return removed;
};

const cleanupStaleSnapshotsOnce = (): void => {
  if (staleSnapshotCleanupAttempted) return;
  staleSnapshotCleanupAttempted = true;
  if (process.platform === "win32") {
    try {
      cleanupStalePackagedIrohaJsNativeSnapshots();
    } catch {
      // Stale cleanup is best-effort and must never block a verified load.
    }
  }
};

const isPlainObject = (value: unknown): value is JsonObject => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactKeys = (
  value: JsonObject,
  expected: readonly string[],
): boolean => {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  return (
    actual.length === wanted.length &&
    actual.every((key, index) => key === wanted[index])
  );
};

const sha256 = (bytes: Buffer): string =>
  createHash("sha256").update(bytes).digest("hex");

const readMachOU32 = (bytes: Buffer, offset: number): number => {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new TypeError("Mach-O field is out of bounds");
  }
  return bytes.readUInt32LE(offset);
};

const hasExactSegmentName = (
  bytes: Buffer,
  offset: number,
  name: string,
): boolean => {
  const field = bytes.subarray(offset, offset + 16);
  const expected = Buffer.from(name, "ascii");
  return (
    field.subarray(0, expected.length).equals(expected) &&
    field.subarray(expected.length).every((byte) => byte === 0)
  );
};

const machOSigningIndependentSha256 = (
  bytes: Buffer,
  platformKey: string,
): string | null => {
  if (bytes.length < 4 || bytes.readUInt32LE(0) !== MACH_O_64_LE_MAGIC) {
    return null;
  }
  if (bytes.length < MACH_O_64_HEADER_BYTES) {
    throw new TypeError("Mach-O header is truncated");
  }

  const commandCount = readMachOU32(bytes, 16);
  const commandBytes = readMachOU32(bytes, 20);
  if (commandCount === 0 || commandCount > MAX_LOAD_COMMANDS) {
    throw new TypeError("Mach-O load-command count is invalid");
  }
  const commandEnd = MACH_O_64_HEADER_BYTES + commandBytes;
  if (commandEnd < MACH_O_64_HEADER_BYTES || commandEnd > bytes.length) {
    throw new TypeError("Mach-O load-command table is out of bounds");
  }

  let offset = MACH_O_64_HEADER_BYTES;
  let codeSignatureCommand: number | undefined;
  let linkeditSegment: number | undefined;
  for (let index = 0; index < commandCount; index += 1) {
    if (offset + 8 > commandEnd) {
      throw new TypeError("Mach-O load-command header is truncated");
    }
    const command = readMachOU32(bytes, offset);
    const size = readMachOU32(bytes, offset + 4);
    if (size < 8 || size % 8 !== 0 || offset + size > commandEnd) {
      throw new TypeError("Mach-O load-command size is invalid");
    }
    if (command === LC_CODE_SIGNATURE) {
      if (codeSignatureCommand !== undefined || size !== 16) {
        throw new TypeError("Mach-O code-signature command is invalid");
      }
      codeSignatureCommand = offset;
    } else if (
      command === LC_SEGMENT_64 &&
      size >= 72 &&
      hasExactSegmentName(bytes, offset + 8, "__LINKEDIT")
    ) {
      if (linkeditSegment !== undefined) {
        throw new TypeError("Mach-O __LINKEDIT segment is duplicated");
      }
      linkeditSegment = offset;
    }
    offset += size;
  }
  if (
    offset !== commandEnd ||
    codeSignatureCommand === undefined ||
    linkeditSegment === undefined
  ) {
    throw new TypeError("Mach-O signing layout is incomplete");
  }

  const signatureOffset = readMachOU32(bytes, codeSignatureCommand + 8);
  const signatureBytes = readMachOU32(bytes, codeSignatureCommand + 12);
  if (
    signatureOffset < commandEnd ||
    signatureBytes === 0 ||
    signatureOffset + signatureBytes !== bytes.length
  ) {
    throw new TypeError("Mach-O signature is not the final file region");
  }

  const linkeditFileOffset = Number(
    bytes.readBigUInt64LE(linkeditSegment + 40),
  );
  const linkeditFileBytes = Number(bytes.readBigUInt64LE(linkeditSegment + 48));
  const linkeditVirtualBytes = Number(
    bytes.readBigUInt64LE(linkeditSegment + 32),
  );
  const pageBytes =
    platformKey === "darwin-arm64"
      ? 0x4000
      : platformKey === "darwin-x64"
        ? 0x1000
        : null;
  if (pageBytes === null) {
    throw new TypeError("Mach-O platform is unsupported");
  }
  const expectedVirtualBytes =
    Math.ceil(linkeditFileBytes / pageBytes) * pageBytes;
  if (
    !Number.isSafeInteger(linkeditFileOffset) ||
    !Number.isSafeInteger(linkeditFileBytes) ||
    linkeditFileOffset > signatureOffset ||
    linkeditFileOffset + linkeditFileBytes !== bytes.length
  ) {
    throw new TypeError("Mach-O __LINKEDIT signing layout is invalid");
  }
  if (
    !Number.isSafeInteger(linkeditVirtualBytes) ||
    !Number.isSafeInteger(expectedVirtualBytes) ||
    linkeditVirtualBytes !== expectedVirtualBytes
  ) {
    throw new TypeError("Mach-O __LINKEDIT virtual size is non-canonical");
  }

  const normalized = Buffer.from(bytes.subarray(0, signatureOffset));
  normalized.fill(0, linkeditSegment + 32, linkeditSegment + 40);
  normalized.fill(0, linkeditSegment + 48, linkeditSegment + 56);
  normalized.fill(0, codeSignatureCommand + 12, codeSignatureCommand + 16);
  return sha256(normalized);
};

const readPeU16 = (bytes: Buffer, offset: number, limit: number): number => {
  if (offset < 0 || offset + 2 > limit || offset + 2 > bytes.length) {
    throw new TypeError("PE field is out of bounds");
  }
  return bytes.readUInt16LE(offset);
};

const readPeU32 = (bytes: Buffer, offset: number, limit: number): number => {
  if (offset < 0 || offset + 4 > limit || offset + 4 > bytes.length) {
    throw new TypeError("PE field is out of bounds");
  }
  return bytes.readUInt32LE(offset);
};

const peSigningIndependentSha256 = (
  bytes: Buffer,
  unsignedSize: number,
  requireSigned: boolean,
): string | null => {
  if (bytes.length < 2 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) {
    return null;
  }
  if (
    bytes.length < PE_DOS_HEADER_BYTES ||
    !Number.isSafeInteger(unsignedSize) ||
    unsignedSize < PE_DOS_HEADER_BYTES ||
    unsignedSize > bytes.length
  ) {
    throw new TypeError("PE unsigned size is invalid");
  }

  const peOffset = readPeU32(bytes, 0x3c, unsignedSize);
  if (
    peOffset < PE_DOS_HEADER_BYTES ||
    peOffset + PE_SIGNATURE_BYTES.length + PE_COFF_HEADER_BYTES >
      unsignedSize ||
    !bytes.subarray(peOffset, peOffset + 4).equals(PE_SIGNATURE_BYTES)
  ) {
    throw new TypeError("PE header is invalid");
  }

  const coffOffset = peOffset + PE_SIGNATURE_BYTES.length;
  const optionalBytes = readPeU16(bytes, coffOffset + 16, unsignedSize);
  const optionalOffset = coffOffset + PE_COFF_HEADER_BYTES;
  const optionalEnd = optionalOffset + optionalBytes;
  if (optionalBytes === 0 || optionalEnd > unsignedSize) {
    throw new TypeError("PE optional header is invalid");
  }
  const magic = readPeU16(bytes, optionalOffset, optionalEnd);
  const directoryCountOffset =
    magic === PE_OPTIONAL_MAGIC_32
      ? optionalOffset + 92
      : magic === PE_OPTIONAL_MAGIC_64
        ? optionalOffset + 108
        : -1;
  const directoryOffset =
    magic === PE_OPTIONAL_MAGIC_32
      ? optionalOffset + 96
      : magic === PE_OPTIONAL_MAGIC_64
        ? optionalOffset + 112
        : -1;
  if (directoryOffset < 0) {
    throw new TypeError("PE optional-header magic is unsupported");
  }
  const directoryCount = readPeU32(bytes, directoryCountOffset, optionalEnd);
  if (directoryCount <= PE_CERTIFICATE_DIRECTORY_INDEX) {
    throw new TypeError("PE certificate directory is absent");
  }
  const certificateDirectory =
    directoryOffset + PE_CERTIFICATE_DIRECTORY_INDEX * 8;
  const certificateOffset = readPeU32(bytes, certificateDirectory, optionalEnd);
  const certificateBytes = readPeU32(
    bytes,
    certificateDirectory + 4,
    optionalEnd,
  );
  const checksumOffset = optionalOffset + PE_CHECKSUM_OFFSET;
  readPeU32(bytes, checksumOffset, optionalEnd);

  if (certificateOffset === 0 || certificateBytes === 0) {
    if (
      certificateOffset !== 0 ||
      certificateBytes !== 0 ||
      unsignedSize !== bytes.length
    ) {
      throw new TypeError("PE unsigned certificate layout is invalid");
    }
    if (requireSigned) {
      throw new TypeError("PE Authenticode certificate table is absent");
    }
  } else if (
    certificateOffset % PE_CERTIFICATE_ALIGNMENT !== 0 ||
    certificateBytes < 8 ||
    certificateBytes % PE_CERTIFICATE_ALIGNMENT !== 0 ||
    certificateOffset < unsignedSize ||
    certificateOffset - unsignedSize >= PE_CERTIFICATE_ALIGNMENT ||
    certificateOffset + certificateBytes !== bytes.length ||
    !bytes.subarray(unsignedSize, certificateOffset).every((byte) => byte === 0)
  ) {
    throw new TypeError("PE certificate layout is invalid");
  }

  const normalized = Buffer.from(bytes.subarray(0, unsignedSize));
  normalized.fill(0, checksumOffset, checksumOffset + 4);
  normalized.fill(0, certificateDirectory, certificateDirectory + 8);
  return sha256(normalized);
};

const expectedEntryFields = (platformKey: string): readonly string[] | null => {
  const common = [
    "build_execution_policy",
    "build_provenance_version",
    "cargo_profile",
    "sha256",
    "source_git_revision",
    "source_tree_clean",
    "source_tree_sha256",
  ];
  if (platformKey.startsWith("darwin-")) {
    return [...common, "mach_o_signing_independent_sha256"];
  }
  if (platformKey.startsWith("win32-")) {
    return [...common, "pe_signing_independent_sha256", "pe_unsigned_size"];
  }
  if (platformKey.startsWith("linux-")) {
    return common;
  }
  return null;
};

const hasRequiredEntryIdentity = (
  entry: JsonObject,
  expectedFields: readonly string[],
): boolean =>
  hasExactKeys(entry, expectedFields) &&
  entry.build_provenance_version === REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION &&
  entry.build_execution_policy === REQUIRED_NATIVE_BUILD_EXECUTION_POLICY &&
  entry.cargo_profile === "release" &&
  entry.source_git_revision === REVIEWED_IROHA_SOURCE_GIT_REVISION &&
  entry.source_tree_clean === true &&
  typeof entry.source_tree_sha256 === "string" &&
  SHA256_PATTERN.test(entry.source_tree_sha256) &&
  typeof entry.sha256 === "string" &&
  SHA256_PATTERN.test(entry.sha256);

const hasRequiredPlatformIdentity = (
  entry: JsonObject,
  platformKey: string,
): boolean => {
  if (platformKey.startsWith("darwin-")) {
    return (
      typeof entry.mach_o_signing_independent_sha256 === "string" &&
      SHA256_PATTERN.test(entry.mach_o_signing_independent_sha256)
    );
  }
  if (platformKey.startsWith("win32-")) {
    return (
      typeof entry.pe_signing_independent_sha256 === "string" &&
      SHA256_PATTERN.test(entry.pe_signing_independent_sha256) &&
      Number.isSafeInteger(entry.pe_unsigned_size) &&
      Number(entry.pe_unsigned_size) >= PE_DOS_HEADER_BYTES
    );
  }
  return platformKey.startsWith("linux-");
};

const readVerifiedPackagedNativeBytes = (
  nativeDir: string,
  platformKey = `${process.platform}-${process.arch}`,
  readBinaryFile: ReadBinaryFile = defaultReadBinaryFile,
): Buffer | null => {
  try {
    const expectedFields = expectedEntryFields(platformKey);
    if (expectedFields === null) return null;

    const manifestBytes = readBinaryFile(join(nativeDir, CHECKSUM_FILENAME));
    if (
      !Buffer.isBuffer(manifestBytes) ||
      manifestBytes.length === 0 ||
      manifestBytes.length > MAX_CHECKSUM_MANIFEST_BYTES
    ) {
      return null;
    }
    const manifest: unknown = JSON.parse(manifestBytes.toString("utf8"));
    if (!isPlainObject(manifest) || !hasExactKeys(manifest, ["entries"])) {
      return null;
    }
    const entries = manifest.entries;
    if (
      !isPlainObject(entries) ||
      !hasExactKeys(entries, [platformKey]) ||
      !isPlainObject(entries[platformKey])
    ) {
      return null;
    }
    const entry = entries[platformKey];
    if (
      !hasRequiredEntryIdentity(entry, expectedFields) ||
      !hasRequiredPlatformIdentity(entry, platformKey)
    ) {
      return null;
    }

    const canonicalEntry: JsonObject = {
      sha256: entry.sha256,
      build_provenance_version: REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION,
      build_execution_policy: REQUIRED_NATIVE_BUILD_EXECUTION_POLICY,
      cargo_profile: "release",
      source_git_revision: REVIEWED_IROHA_SOURCE_GIT_REVISION,
      source_tree_clean: true,
      source_tree_sha256: entry.source_tree_sha256,
    };
    if (platformKey.startsWith("darwin-")) {
      canonicalEntry.mach_o_signing_independent_sha256 =
        entry.mach_o_signing_independent_sha256;
    } else if (platformKey.startsWith("win32-")) {
      canonicalEntry.pe_signing_independent_sha256 =
        entry.pe_signing_independent_sha256;
      canonicalEntry.pe_unsigned_size = entry.pe_unsigned_size;
    }
    const canonicalManifestBytes = Buffer.from(
      `${JSON.stringify(
        { entries: { [platformKey]: canonicalEntry } },
        null,
        2,
      )}\n`,
      "utf8",
    );
    if (!manifestBytes.equals(canonicalManifestBytes)) return null;

    const nativeBytes = readBinaryFile(join(nativeDir, NATIVE_MODULE_FILENAME));
    if (!Buffer.isBuffer(nativeBytes) || nativeBytes.length === 0) return null;

    const nativeSha256 = sha256(nativeBytes);
    if (platformKey.startsWith("darwin-")) {
      return machOSigningIndependentSha256(nativeBytes, platformKey) ===
        entry.mach_o_signing_independent_sha256
        ? nativeBytes
        : null;
    }
    if (platformKey.startsWith("win32-")) {
      return peSigningIndependentSha256(
        nativeBytes,
        Number(entry.pe_unsigned_size),
        nativeSha256 !== entry.sha256,
      ) === entry.pe_signing_independent_sha256
        ? nativeBytes
        : null;
    }
    return nativeSha256 === entry.sha256 ? nativeBytes : null;
  } catch {
    return null;
  }
};

export const hasRequiredPackagedIrohaJsNativeProvenance = (
  nativeDir: string,
  platformKey = `${process.platform}-${process.arch}`,
  readBinaryFile: ReadBinaryFile = defaultReadBinaryFile,
): boolean =>
  readVerifiedPackagedNativeBytes(nativeDir, platformKey, readBinaryFile) !==
  null;

const snapshotIsIntact = (snapshot: MaterializedSnapshot): boolean => {
  try {
    const snapshotStat = lstatSync(snapshot.nativePath);
    return (
      snapshotStat.isFile() &&
      !snapshotStat.isSymbolicLink() &&
      snapshotStat.size === snapshot.nativeSize &&
      sha256(readFileSync(snapshot.nativePath)) === snapshot.nativeSha256
    );
  } catch {
    return false;
  }
};

const discardMaterializedSnapshot = (
  snapshot: MaterializedSnapshot,
): boolean => {
  try {
    rmSync(snapshot.directory, { recursive: true, force: true });
  } catch {
    return false;
  }
  materializedSnapshotsByKey.delete(snapshot.key);
  materializedSnapshotKeysByDirectory.delete(snapshot.directory);
  return true;
};

const registerSnapshotExitCleanup = (): void => {
  if (snapshotExitCleanupRegistered) return;
  snapshotExitCleanupRegistered = true;
  process.once("exit", () => {
    for (const snapshot of [...materializedSnapshotsByKey.values()]) {
      discardMaterializedSnapshot(snapshot);
    }
  });
};

export const releaseMaterializedPackagedIrohaJsNativeSnapshot = (
  snapshotDirectory: string,
): boolean => {
  const key = materializedSnapshotKeysByDirectory.get(snapshotDirectory);
  if (key === undefined) return false;
  const snapshot = materializedSnapshotsByKey.get(key);
  if (snapshot === undefined || snapshot.directory !== snapshotDirectory) {
    return false;
  }
  return discardMaterializedSnapshot(snapshot);
};

export const materializeRequiredPackagedIrohaJsNativeSnapshot = (
  nativeDir: string,
  platformKey = `${process.platform}-${process.arch}`,
  readBinaryFile: ReadBinaryFile = defaultReadBinaryFile,
): string | null => {
  const snapshotKey = `${platformKey}\0${nativeDir}`;
  const cachedSnapshot = materializedSnapshotsByKey.get(snapshotKey);
  if (cachedSnapshot !== undefined) {
    if (snapshotIsIntact(cachedSnapshot)) return cachedSnapshot.directory;
    discardMaterializedSnapshot(cachedSnapshot);
    return null;
  }

  const nativeBytes = readVerifiedPackagedNativeBytes(
    nativeDir,
    platformKey,
    readBinaryFile,
  );
  if (nativeBytes === null) return null;
  cleanupStaleSnapshotsOnce();

  let snapshotDir: string | undefined;
  let fileDescriptor: number | undefined;
  try {
    snapshotDir = mkdtempSync(
      join(tmpdir(), `${SNAPSHOT_DIRECTORY_PREFIX}${process.pid}-`),
    );
    if (process.platform !== "win32") chmodSync(snapshotDir, 0o700);

    const snapshotPath = join(snapshotDir, NATIVE_MODULE_FILENAME);
    const noFollow =
      typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    fileDescriptor = openSync(
      snapshotPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
      0o500,
    );
    writeFileSync(fileDescriptor, nativeBytes);
    fsyncSync(fileDescriptor);
    if (process.platform !== "win32") fchmodSync(fileDescriptor, 0o500);
    closeSync(fileDescriptor);
    fileDescriptor = undefined;

    const snapshotStat = lstatSync(snapshotPath);
    if (
      !snapshotStat.isFile() ||
      snapshotStat.isSymbolicLink() ||
      snapshotStat.size !== nativeBytes.length ||
      sha256(readFileSync(snapshotPath)) !== sha256(nativeBytes)
    ) {
      throw new Error("Packaged native snapshot verification failed");
    }
    const snapshot: MaterializedSnapshot = {
      key: snapshotKey,
      directory: snapshotDir,
      nativePath: snapshotPath,
      nativeSha256: sha256(nativeBytes),
      nativeSize: nativeBytes.length,
    };
    registerSnapshotExitCleanup();
    materializedSnapshotsByKey.set(snapshotKey, snapshot);
    materializedSnapshotKeysByDirectory.set(snapshotDir, snapshotKey);
    return snapshotDir;
  } catch {
    if (fileDescriptor !== undefined) {
      try {
        closeSync(fileDescriptor);
      } catch {
        // Preserve the fail-closed result while cleaning up best-effort.
      }
    }
    if (snapshotDir !== undefined) {
      try {
        rmSync(snapshotDir, { recursive: true, force: true });
      } catch {
        // Preserve the fail-closed result while cleaning up best-effort.
      }
    }
    return null;
  }
};
