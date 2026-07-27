import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
  renameSync,
  type Stats,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";

type FileIdentity = Readonly<{
  dev: number;
  ino: number;
  uid: number;
  gid: number;
  mode: number;
  nlink: number;
  size: number;
  mtimeMs: number;
  ctimeMs: number;
}>;

const fileIdentity = (stats: Stats): FileIdentity => ({
  dev: stats.dev,
  ino: stats.ino,
  uid: stats.uid,
  gid: stats.gid,
  mode: stats.mode,
  nlink: stats.nlink,
  size: stats.size,
  mtimeMs: stats.mtimeMs,
  ctimeMs: stats.ctimeMs,
});

const directoryIdentity = (stats: Stats) => ({
  dev: stats.dev,
  ino: stats.ino,
  uid: stats.uid,
  gid: stats.gid,
  mode: stats.mode,
});

const sameIdentity = (left: object, right: object): boolean =>
  JSON.stringify(left) === JSON.stringify(right);

const currentUid = (): number => {
  if (typeof process.getuid !== "function") {
    throw new Error(
      "Secure governance artifact loading requires POSIX uid support.",
    );
  }
  return process.getuid();
};

export type SecureBoundedFile = Readonly<{
  path: string;
  bytes: Buffer;
  sha256: string;
}>;

const isNotFoundError = (error: unknown): boolean =>
  Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as NodeJS.ErrnoException).code === "ENOENT",
  );

const assertSecureBoundedPathOptions = (
  path: string,
  options: { label: string; maximumBytes: number; expectedMode?: number },
): {
  label: string;
  expectedMode: number;
  noFollow: number;
  directory: number;
} => {
  const label = options.label;
  const expectedMode = options.expectedMode ?? 0o600;
  if (
    !isAbsolute(path) ||
    resolve(path) !== path ||
    !basename(path) ||
    !Number.isSafeInteger(options.maximumBytes) ||
    options.maximumBytes < 1 ||
    !Number.isSafeInteger(expectedMode) ||
    expectedMode < 0 ||
    expectedMode > 0o777
  ) {
    throw new Error(`${label} path, mode, or byte bound is invalid.`);
  }
  const noFollow = constants.O_NOFOLLOW;
  const directory = constants.O_DIRECTORY;
  if (typeof noFollow !== "number" || typeof directory !== "number") {
    throw new Error(`${label} requires POSIX no-follow directory opens.`);
  }
  return { label, expectedMode, noFollow, directory };
};

const assertProtectedOwnedDirectory = (path: string, label: string): Stats => {
  const stats = lstatSync(path);
  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink() ||
    stats.uid !== currentUid() ||
    (stats.mode & 0o022) !== 0
  ) {
    throw new Error(`${label} parent must be one protected owned directory.`);
  }
  return stats;
};

/**
 * Read one private artifact through no-follow descriptors, with bounded bytes
 * and path/descriptor/parent identity checks before and after the read.
 */
export const secureReadBoundedFile = (
  path: string,
  options: { label: string; maximumBytes: number; expectedMode?: number },
): SecureBoundedFile => {
  const { label, expectedMode, noFollow, directory } =
    assertSecureBoundedPathOptions(path, options);
  const parent = dirname(path);
  const parentBefore = assertProtectedOwnedDirectory(parent, label);
  const resolvedParentBefore = realpathSync.native(parent);
  const parentFd = openSync(parent, constants.O_RDONLY | directory | noFollow);
  let fileFd = -1;
  try {
    const parentOpened = fstatSync(parentFd);
    if (
      !sameIdentity(
        directoryIdentity(parentOpened),
        directoryIdentity(parentBefore),
      )
    ) {
      throw new Error(`${label} parent changed while it was opened.`);
    }
    const before = lstatSync(path);
    const resolvedPathBefore = realpathSync.native(path);
    if (
      !before.isFile() ||
      before.isSymbolicLink() ||
      before.uid !== currentUid() ||
      before.nlink !== 1 ||
      (before.mode & 0o777) !== expectedMode ||
      before.size < 1 ||
      before.size > options.maximumBytes
    ) {
      throw new Error(
        `${label} must be one bounded, single-link, owned mode-${expectedMode.toString(8)} file.`,
      );
    }
    fileFd = openSync(path, constants.O_RDONLY | noFollow);
    const openedBefore = fstatSync(fileFd);
    const chunks: Buffer[] = [];
    let total = 0;
    let count = 0;
    do {
      const remaining = options.maximumBytes + 1 - total;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      count = readSync(fileFd, buffer, 0, buffer.length, null);
      if (count > 0) {
        total += count;
        if (total > options.maximumBytes) {
          throw new Error(
            `${label} exceeds its ${options.maximumBytes}-byte bound.`,
          );
        }
        chunks.push(buffer.subarray(0, count));
      }
    } while (count !== 0);
    const openedAfter = fstatSync(fileFd);
    const namedAfter = lstatSync(path);
    const parentAfter = lstatSync(parent);
    const expectedFile = fileIdentity(before);
    const expectedParent = directoryIdentity(parentBefore);
    if (
      !sameIdentity(fileIdentity(openedBefore), expectedFile) ||
      !sameIdentity(fileIdentity(openedAfter), expectedFile) ||
      !sameIdentity(fileIdentity(namedAfter), expectedFile) ||
      !sameIdentity(directoryIdentity(fstatSync(parentFd)), expectedParent) ||
      !sameIdentity(directoryIdentity(parentAfter), expectedParent) ||
      realpathSync.native(parent) !== resolvedParentBefore ||
      realpathSync.native(path) !== resolvedPathBefore ||
      total !== before.size
    ) {
      throw new Error(`${label} changed identity or bytes while it was read.`);
    }
    const bytes = Buffer.concat(chunks, total);
    return {
      path,
      bytes,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
  } finally {
    if (fileFd >= 0) closeSync(fileFd);
    closeSync(parentFd);
  }
};

/**
 * Atomically replace one private file in an already-protected owned directory,
 * fsyncing both the temporary file and its directory before read-back.
 */
export const secureWriteBoundedFile = (
  path: string,
  bytes: Buffer,
  options: { label: string; maximumBytes: number; expectedMode?: number },
): SecureBoundedFile => {
  const { label, expectedMode, noFollow, directory } =
    assertSecureBoundedPathOptions(path, options);
  if (
    !Buffer.isBuffer(bytes) ||
    bytes.length < 1 ||
    bytes.length > options.maximumBytes
  ) {
    throw new Error(`${label} bytes exceed their non-empty bounded size.`);
  }
  const parent = dirname(path);
  const parentBefore = assertProtectedOwnedDirectory(parent, label);
  const resolvedParentBefore = realpathSync.native(parent);
  const expectedParent = directoryIdentity(parentBefore);
  const parentFd = openSync(parent, constants.O_RDONLY | directory | noFollow);
  const temporaryPath = join(
    parent,
    `.${basename(path)}.${process.pid}.${randomBytes(16).toString("hex")}.tmp`,
  );
  let temporaryFd = -1;
  let temporaryExists = false;
  try {
    if (!sameIdentity(directoryIdentity(fstatSync(parentFd)), expectedParent)) {
      throw new Error(`${label} parent changed while it was opened.`);
    }
    try {
      const existing = lstatSync(path);
      if (
        !existing.isFile() ||
        existing.isSymbolicLink() ||
        existing.uid !== currentUid() ||
        existing.nlink !== 1 ||
        (existing.mode & 0o777) !== expectedMode
      ) {
        throw new Error(
          `${label} existing target must be one single-link, owned mode-${expectedMode.toString(8)} file.`,
        );
      }
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
    }

    temporaryFd = openSync(
      temporaryPath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | noFollow,
      expectedMode,
    );
    temporaryExists = true;
    let offset = 0;
    while (offset < bytes.length) {
      const count = writeSync(
        temporaryFd,
        bytes,
        offset,
        bytes.length - offset,
      );
      if (count < 1) {
        throw new Error(`${label} atomic write made no progress.`);
      }
      offset += count;
    }
    fsyncSync(temporaryFd);
    const written = fstatSync(temporaryFd);
    if (
      !written.isFile() ||
      written.uid !== currentUid() ||
      written.nlink !== 1 ||
      (written.mode & 0o777) !== expectedMode ||
      written.size !== bytes.length
    ) {
      throw new Error(
        `${label} atomic temporary file is not private and exact.`,
      );
    }
    closeSync(temporaryFd);
    temporaryFd = -1;

    renameSync(temporaryPath, path);
    temporaryExists = false;
    fsyncSync(parentFd);
    const parentAfter = lstatSync(parent);
    if (
      !sameIdentity(directoryIdentity(parentAfter), expectedParent) ||
      !sameIdentity(directoryIdentity(fstatSync(parentFd)), expectedParent) ||
      realpathSync.native(parent) !== resolvedParentBefore
    ) {
      throw new Error(`${label} parent changed while it was replaced.`);
    }
    const loaded = secureReadBoundedFile(path, options);
    if (!loaded.bytes.equals(bytes)) {
      throw new Error(`${label} atomic write did not read back exactly.`);
    }
    return loaded;
  } finally {
    if (temporaryFd >= 0) closeSync(temporaryFd);
    if (temporaryExists) {
      try {
        unlinkSync(temporaryPath);
      } catch (error) {
        if (!isNotFoundError(error)) {
          // The primary operation remains fail-closed; cleanup errors must not
          // replace it or broaden the accepted state.
        }
      }
    }
    closeSync(parentFd);
  }
};

class StrictJsonScanner {
  private index = 0;
  private depth = 0;

  constructor(private readonly source: string) {}

  scan(): void {
    this.value();
    this.whitespace();
    if (this.index !== this.source.length) this.invalid();
  }

  private invalid(): never {
    throw new Error(`strict JSON syntax failed near byte ${this.index}`);
  }

  private whitespace(): void {
    while (/\s/u.test(this.source[this.index] ?? "")) this.index += 1;
  }

  private value(): void {
    this.whitespace();
    const token = this.source[this.index];
    if (token === "{") return this.object();
    if (token === "[") return this.array();
    if (token === '"') {
      this.string();
      return;
    }
    for (const literal of ["true", "false", "null"] as const) {
      if (this.source.startsWith(literal, this.index)) {
        this.index += literal.length;
        return;
      }
    }
    const number = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/uy;
    number.lastIndex = this.index;
    const match = number.exec(this.source);
    if (!match) this.invalid();
    this.index = number.lastIndex;
  }

  private enter(): void {
    this.depth += 1;
    if (this.depth > 128)
      throw new Error("strict JSON nesting exceeds 128 levels");
  }

  private object(): void {
    this.enter();
    this.index += 1;
    this.whitespace();
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index += 1;
      this.depth -= 1;
      return;
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== '"') this.invalid();
      const key = this.string();
      if (keys.has(key))
        throw new Error(`strict JSON has duplicate key ${key}.`);
      keys.add(key);
      this.whitespace();
      if (this.source[this.index] !== ":") this.invalid();
      this.index += 1;
      this.value();
      this.whitespace();
      if (this.source[this.index] === "}") {
        this.index += 1;
        this.depth -= 1;
        return;
      }
      if (this.source[this.index] !== ",") this.invalid();
      this.index += 1;
      this.whitespace();
    }
    this.invalid();
  }

  private array(): void {
    this.enter();
    this.index += 1;
    this.whitespace();
    if (this.source[this.index] === "]") {
      this.index += 1;
      this.depth -= 1;
      return;
    }
    while (this.index < this.source.length) {
      this.value();
      this.whitespace();
      if (this.source[this.index] === "]") {
        this.index += 1;
        this.depth -= 1;
        return;
      }
      if (this.source[this.index] !== ",") this.invalid();
      this.index += 1;
    }
    this.invalid();
  }

  private string(): string {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const token = this.source[this.index];
      if (token === '"') {
        this.index += 1;
        return JSON.parse(this.source.slice(start, this.index)) as string;
      }
      if (token === "\\") {
        this.index += 2;
      } else {
        if ((token?.codePointAt(0) ?? 0) < 0x20) this.invalid();
        this.index += 1;
      }
    }
    return this.invalid();
  }
}

export const parseStrictJson = (serialized: string, label: string): unknown => {
  try {
    new StrictJsonScanner(serialized).scan();
    return JSON.parse(serialized) as unknown;
  } catch (error) {
    throw new Error(
      `${label} is not unambiguous strict JSON: ${String(error)}`,
    );
  }
};

export const loadSecureBoundedJson = (
  path: string,
  options: { label: string; maximumBytes: number; expectedMode?: number },
): { value: unknown; sha256: string } => {
  const loaded = secureReadBoundedFile(path, options);
  let serialized: string;
  try {
    serialized = loaded.bytes.toString("utf8");
    if (!Buffer.from(serialized, "utf8").equals(loaded.bytes)) {
      throw new Error("non-canonical UTF-8");
    }
  } catch (error) {
    throw new Error(`${options.label} is not strict UTF-8: ${String(error)}`);
  }
  return {
    value: parseStrictJson(serialized, options.label),
    sha256: loaded.sha256,
  };
};
