import { randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
} from "node:fs";
import { lstat, mkdir, open, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SOLANA_REPORT_MAX_BYTES = 16 * 1024 * 1024;
export const DEFAULT_SOLANA_TEXT_MAX_BYTES = 4 * 1024 * 1024;

const noFollow = constants.O_NOFOLLOW ?? 0;
const windowsDirectorySyncErrors = new Set([
  "EACCES",
  "EINVAL",
  "EISDIR",
  "ENOTSUP",
  "EPERM",
]);

const syncDirectory = async (dir) => {
  let handle;
  try {
    handle = await open(dir, constants.O_RDONLY);
    await handle.sync();
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !windowsDirectorySyncErrors.has(error?.code)
    ) {
      throw error;
    }
  } finally {
    await handle?.close().catch(() => {});
  }
};

const syncDirectorySync = (dir) => {
  let fd;
  try {
    fd = openSync(dir, constants.O_RDONLY);
    fsyncSync(fd);
  } catch (error) {
    if (
      process.platform !== "win32" ||
      !windowsDirectorySyncErrors.has(error?.code)
    ) {
      throw error;
    }
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

export const parseStrictCliArgs = (
  argv,
  { booleanFlags = [], optionalBooleanFlags = [], valueFlags = [] } = {},
) => {
  const booleanSet = new Set(booleanFlags);
  const optionalBooleanSet = new Set(optionalBooleanFlags);
  const valueSet = new Set(valueFlags);
  const known = new Set([...booleanSet, ...optionalBooleanSet, ...valueSet]);
  const result = {};
  const seen = new Set();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== "string" || !token.startsWith("--")) {
      throw new Error("Unexpected positional argument.");
    }
    if (token.includes("=")) {
      throw new Error(
        "Option=value syntax is not accepted; pass an explicit separate value.",
      );
    }
    const key = token.slice(2);
    if (!key || !known.has(key)) {
      throw new Error("Unknown option.");
    }
    if (seen.has(key)) {
      throw new Error(`--${key} may be supplied only once.`);
    }
    seen.add(key);
    if (booleanSet.has(key)) {
      result[key] = true;
      continue;
    }
    if (optionalBooleanSet.has(key)) {
      const next = argv[index + 1];
      if (next === "true" || next === "false") {
        result[key] = next;
        index += 1;
      } else if (typeof next === "string" && !next.startsWith("--")) {
        throw new Error(
          `--${key} must be true or false when a value is provided.`,
        );
      } else {
        result[key] = true;
      }
      continue;
    }
    const value = argv[index + 1];
    if (typeof value !== "string" || !value || value.startsWith("--")) {
      throw new Error(`--${key} requires an explicit value.`);
    }
    result[key] = value;
    index += 1;
  }
  return result;
};

const normalizeFilePath = (file, label) => {
  if (typeof file !== "string" || !file.trim() || file.includes("\0")) {
    throw new Error(`${label} path must be a non-empty string.`);
  }
  return path.resolve(file);
};

const identity = (info) => ({
  dev: String(info.dev),
  ino: String(info.ino),
  size: Number(info.size),
  mode: String(info.mode),
  uid: String(info.uid),
  gid: String(info.gid),
  mtimeMs: String(info.mtimeMs),
  ctimeMs: String(info.ctimeMs),
});

const sameIdentity = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.size === right.size &&
  left.mode === right.mode &&
  left.uid === right.uid &&
  left.gid === right.gid &&
  left.mtimeMs === right.mtimeMs &&
  left.ctimeMs === right.ctimeMs;

const sameNode = (left, right) =>
  left.dev === right.dev &&
  left.ino === right.ino &&
  left.mode === right.mode &&
  left.uid === right.uid &&
  left.gid === right.gid;

const sameCommittedFile = (left, right) =>
  sameNode(left, right) &&
  left.size === right.size &&
  left.mtimeMs === right.mtimeMs;

const assertRegular = (info, label) => {
  if (info.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
};

const assertBounded = (size, maxBytes, label) => {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error(`${label} byte limit must be a positive safe integer.`);
  }
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new Error(`${label} exceeds the ${maxBytes}-byte limit.`);
  }
};

const inside = (candidate, root) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!relative.startsWith(`..${path.sep}`) && relative !== "..")
  );
};

const assertRootBoundSync = (resolved, root, label) => {
  if (!root) return null;
  const canonicalRoot = realpathSync(path.resolve(root));
  const canonicalFile = realpathSync(resolved);
  if (!inside(canonicalFile, canonicalRoot)) {
    throw new Error(`${label} escapes its allowed root.`);
  }
  return { canonicalFile, canonicalRoot };
};

const assertRootBound = async (resolved, root, label) => {
  if (!root) return null;
  const [canonicalRoot, canonicalFile] = await Promise.all([
    realpath(path.resolve(root)),
    realpath(resolved),
  ]);
  if (!inside(canonicalFile, canonicalRoot)) {
    throw new Error(`${label} escapes its allowed root.`);
  }
  return { canonicalFile, canonicalRoot };
};

const assertStablePathSync = (resolved, expected, rootState, label) => {
  const after = lstatSync(resolved);
  assertRegular(after, label);
  if (!sameIdentity(identity(after), expected)) {
    throw new Error(`${label} changed while it was being read.`);
  }
  if (rootState) {
    const canonicalAfter = realpathSync(resolved);
    if (
      canonicalAfter !== rootState.canonicalFile ||
      !inside(canonicalAfter, rootState.canonicalRoot)
    ) {
      throw new Error(
        `${label} changed or escaped its allowed root while it was being read.`,
      );
    }
  }
};

const assertStablePath = async (resolved, expected, rootState, label) => {
  const after = await lstat(resolved);
  assertRegular(after, label);
  if (!sameIdentity(identity(after), expected)) {
    throw new Error(`${label} changed while it was being read.`);
  }
  if (rootState) {
    const canonicalAfter = await realpath(resolved);
    if (
      canonicalAfter !== rootState.canonicalFile ||
      !inside(canonicalAfter, rootState.canonicalRoot)
    ) {
      throw new Error(
        `${label} changed or escaped its allowed root while it was being read.`,
      );
    }
  }
};

export const readStableRegularFileSync = (
  file,
  {
    label = "Solana SCCP input",
    maxBytes = DEFAULT_SOLANA_REPORT_MAX_BYTES,
    root = null,
  } = {},
) => {
  const resolved = normalizeFilePath(file, label);
  const initialInfo = lstatSync(resolved);
  assertRegular(initialInfo, label);
  assertBounded(initialInfo.size, maxBytes, label);
  const initial = identity(initialInfo);
  const rootState = assertRootBoundSync(resolved, root, label);
  let fd;
  try {
    fd = openSync(resolved, constants.O_RDONLY | noFollow);
    const beforeInfo = fstatSync(fd);
    assertRegular(beforeInfo, label);
    const before = identity(beforeInfo);
    assertBounded(before.size, maxBytes, label);
    if (!sameIdentity(initial, before)) {
      throw new Error(`${label} changed before it could be read.`);
    }
    const bytes = readFileSync(fd);
    const after = identity(fstatSync(fd));
    if (!sameIdentity(before, after) || bytes.length !== before.size) {
      throw new Error(`${label} changed while it was being read.`);
    }
    assertStablePathSync(resolved, before, rootState, label);
    return bytes;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
};

export const withStableRegularFileDescriptorsSync = (
  file,
  callback,
  {
    label = "Solana SCCP input",
    maxBytes = DEFAULT_SOLANA_REPORT_MAX_BYTES,
    root = null,
    descriptorCount = 1,
  } = {},
) => {
  if (typeof callback !== "function") {
    throw new Error("Stable Solana SCCP descriptor callback is required.");
  }
  if (
    !Number.isSafeInteger(descriptorCount) ||
    descriptorCount < 1 ||
    descriptorCount > 8
  ) {
    throw new Error(
      "Stable Solana SCCP descriptor count must be between 1 and 8.",
    );
  }
  const resolved = normalizeFilePath(file, label);
  const initialInfo = lstatSync(resolved);
  assertRegular(initialInfo, label);
  assertBounded(initialInfo.size, maxBytes, label);
  const initial = identity(initialInfo);
  const rootState = assertRootBoundSync(resolved, root, label);
  const descriptors = [];
  try {
    for (let index = 0; index < descriptorCount; index += 1) {
      const fd = openSync(resolved, constants.O_RDONLY | noFollow);
      descriptors.push(fd);
      const openedInfo = fstatSync(fd);
      assertRegular(openedInfo, label);
      const opened = identity(openedInfo);
      assertBounded(opened.size, maxBytes, label);
      if (!sameIdentity(initial, opened)) {
        throw new Error(`${label} changed before it could be opened.`);
      }
    }
    const result = callback(Object.freeze([...descriptors]), resolved);
    for (const fd of descriptors) {
      if (!sameIdentity(initial, identity(fstatSync(fd)))) {
        throw new Error(`${label} changed while it was being used.`);
      }
    }
    assertStablePathSync(resolved, initial, rootState, label);
    return result;
  } finally {
    for (const fd of descriptors.reverse()) {
      closeSync(fd);
    }
  }
};

export const readStableRegularFile = async (
  file,
  {
    label = "Solana SCCP input",
    maxBytes = DEFAULT_SOLANA_REPORT_MAX_BYTES,
    root = null,
  } = {},
) => {
  const resolved = normalizeFilePath(file, label);
  const initialInfo = await lstat(resolved);
  assertRegular(initialInfo, label);
  assertBounded(initialInfo.size, maxBytes, label);
  const initial = identity(initialInfo);
  const rootState = await assertRootBound(resolved, root, label);
  let handle;
  try {
    handle = await open(resolved, constants.O_RDONLY | noFollow);
    const beforeInfo = await handle.stat();
    assertRegular(beforeInfo, label);
    const before = identity(beforeInfo);
    assertBounded(before.size, maxBytes, label);
    if (!sameIdentity(initial, before)) {
      throw new Error(`${label} changed before it could be read.`);
    }
    const bytes = await handle.readFile();
    const after = identity(await handle.stat());
    if (!sameIdentity(before, after) || bytes.length !== before.size) {
      throw new Error(`${label} changed while it was being read.`);
    }
    await assertStablePath(resolved, before, rootState, label);
    return bytes;
  } finally {
    await handle?.close().catch(() => {});
  }
};

const parseJson = (bytes, label) => {
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new Error(`${label} contains invalid JSON.`);
  }
};

export const readStableJsonFileSync = (file, options = {}) => {
  const label = options.label ?? "Solana SCCP JSON input";
  return parseJson(
    readStableRegularFileSync(file, { ...options, label }),
    label,
  );
};

export const readStableJsonFile = async (file, options = {}) => {
  const label = options.label ?? "Solana SCCP JSON input";
  return parseJson(
    await readStableRegularFile(file, { ...options, label }),
    label,
  );
};

export const readStableJsonFileIfExists = async (file, options = {}) => {
  if (!file) return null;
  try {
    return await readStableJsonFile(file, options);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
};

const assertSafeOutputDir = async (dir) => {
  const info = await lstat(dir);
  if (info.isSymbolicLink() || !info.isDirectory()) {
    throw new Error(
      `Solana SCCP output directory ${dir} must be a real directory.`,
    );
  }
  return { info: identity(info), canonical: await realpath(dir) };
};

export const ensureSafeOutputDirectory = async (dir) => {
  const resolved = path.resolve(dir);
  await mkdir(resolved, { recursive: true });
  await assertSafeOutputDir(resolved);
  return resolved;
};

const assertSafeDestination = async (file) => {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile()) {
      throw new Error(
        `Solana SCCP output ${file} must be a regular file and not a symbolic link.`,
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
};

export const assertSafeOutputDestination = async (file) => {
  const resolved = normalizeFilePath(file, "Solana SCCP output");
  await assertSafeDestination(resolved);
  return resolved;
};

export const writeAtomicFile = async (file, data, { mode = 0o600 } = {}) => {
  const resolved = normalizeFilePath(file, "Solana SCCP output");
  const outputDir = path.dirname(resolved);
  await mkdir(outputDir, { recursive: true });
  const directoryState = await assertSafeOutputDir(outputDir);
  await assertSafeDestination(resolved);
  const tempFile = path.join(
    outputDir,
    `.${path.basename(resolved)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  let tempIdentity;
  try {
    handle = await open(
      tempFile,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
      mode,
    );
    await handle.writeFile(data);
    await handle.sync();
    tempIdentity = identity(await handle.stat());
    await handle.close();
    handle = null;
    const rechecked = await assertSafeOutputDir(outputDir);
    if (
      rechecked.canonical !== directoryState.canonical ||
      !sameNode(rechecked.info, directoryState.info)
    ) {
      throw new Error("Solana SCCP output directory changed before commit.");
    }
    await assertSafeDestination(resolved);
    await rename(tempFile, resolved);
    const committed = await lstat(resolved);
    assertRegular(committed, "Solana SCCP committed output");
    if (!sameCommittedFile(identity(committed), tempIdentity)) {
      throw new Error("Solana SCCP output changed during commit.");
    }
    const committedDirectory = await assertSafeOutputDir(outputDir);
    if (
      committedDirectory.canonical !== directoryState.canonical ||
      !sameNode(committedDirectory.info, directoryState.info)
    ) {
      throw new Error("Solana SCCP output directory changed during commit.");
    }
    await syncDirectory(outputDir);
    return resolved;
  } catch (error) {
    await handle?.close().catch(() => {});
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
};

export const writeAtomicJsonFile = (file, value) =>
  writeAtomicFile(file, `${JSON.stringify(value, null, 2)}\n`);

export const commitGeneratedFileSync = (tempFile, destination) => {
  const resolvedTemp = normalizeFilePath(tempFile, "temporary media output");
  const resolvedDestination = normalizeFilePath(destination, "media output");
  if (path.dirname(resolvedTemp) !== path.dirname(resolvedDestination)) {
    throw new Error(
      "Temporary media output must be in the destination directory.",
    );
  }
  const tempInfo = lstatSync(resolvedTemp);
  assertRegular(tempInfo, "temporary media output");
  let fd;
  let opened;
  try {
    fd = openSync(resolvedTemp, constants.O_RDONLY | noFollow);
    opened = identity(fstatSync(fd));
    if (!sameIdentity(opened, identity(tempInfo))) {
      throw new Error("Temporary media output changed before commit.");
    }
    fsyncSync(fd);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
  const recheckedTemp = lstatSync(resolvedTemp);
  assertRegular(recheckedTemp, "temporary media output");
  if (!sameIdentity(identity(recheckedTemp), opened)) {
    throw new Error("Temporary media output changed before commit.");
  }
  try {
    const destinationInfo = lstatSync(resolvedDestination);
    if (destinationInfo.isSymbolicLink() || !destinationInfo.isFile()) {
      throw new Error(
        "Media output destination must be a regular file and not a symbolic link.",
      );
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  renameSync(resolvedTemp, resolvedDestination);
  const committed = lstatSync(resolvedDestination);
  assertRegular(committed, "committed media output");
  if (!sameCommittedFile(identity(committed), opened)) {
    throw new Error("Media output changed during commit.");
  }
  syncDirectorySync(path.dirname(resolvedDestination));
  return resolvedDestination;
};

export const removeGeneratedFileSync = (file) =>
  rmSync(path.resolve(file), { force: true });
