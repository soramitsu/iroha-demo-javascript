import { lstatSync, realpathSync, rmdirSync } from "node:fs";
import path from "node:path";

const isContainedPath = ({ root, candidate }) => {
  const relative = path.relative(root, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) &&
      relative !== ".." &&
      !relative.startsWith(`..${path.sep}`))
  );
};

const trustedFixtureAncestors = ({ root, start }) => {
  const ancestors = [];
  let current = path.resolve(start);
  while (isContainedPath({ root, candidate: current })) {
    ancestors.push(current);
    if (current === root) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return ancestors;
};

const pathWasAbsent = (candidate) => {
  try {
    lstatSync(candidate);
    return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
  }
};

export const captureAbsentLoaderV3FixtureAncestors = (paths) => {
  const root = path.resolve(paths?.root ?? "");
  const operationDirectory = path.resolve(paths?.operationDirectory ?? "");
  const authorityLease = path.resolve(paths?.authorityLease ?? "");
  if (
    !paths?.root ||
    !paths?.operationDirectory ||
    !paths?.authorityLease ||
    !isContainedPath({ root, candidate: operationDirectory }) ||
    !isContainedPath({ root, candidate: authorityLease }) ||
    operationDirectory === root ||
    authorityLease === root
  ) {
    throw new Error(
      "Loader-v3 fixture cleanup paths must remain inside their exact test root.",
    );
  }
  const candidates = new Set([
    ...trustedFixtureAncestors({
      root,
      start: path.dirname(operationDirectory),
    }),
    ...trustedFixtureAncestors({ root, start: path.dirname(authorityLease) }),
  ]);
  return Object.freeze({
    root,
    absentAncestors: Object.freeze(
      [...candidates].filter(pathWasAbsent).sort((left, right) => {
        const depth = (value) => value.split(path.sep).filter(Boolean).length;
        return depth(right) - depth(left) || right.localeCompare(left);
      }),
    ),
  });
};

const safeEmptyFixtureDirectory = ({ root, candidate }) => {
  if (!isContainedPath({ root, candidate })) return false;
  const expectedUid =
    typeof process.getuid === "function" ? process.getuid() : null;
  for (const current of trustedFixtureAncestors({ root, start: candidate })) {
    let stat;
    try {
      stat = lstatSync(current);
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
    if (
      stat.isSymbolicLink() ||
      !stat.isDirectory() ||
      (expectedUid !== null && stat.uid !== expectedUid) ||
      (stat.mode & 0o022) !== 0
    ) {
      return false;
    }
    try {
      if (realpathSync(current) !== current) return false;
    } catch (error) {
      if (error?.code === "ENOENT") return false;
      throw error;
    }
  }
  return true;
};

export const pruneCapturedLoaderV3FixtureAncestors = (captures) => {
  const candidates = new Map();
  for (const capture of captures) {
    const root = path.resolve(capture?.root ?? "");
    for (const candidateValue of capture?.absentAncestors ?? []) {
      const candidate = path.resolve(candidateValue);
      if (!isContainedPath({ root, candidate })) {
        throw new Error(
          "Captured Loader-v3 fixture ancestor escaped its exact test root.",
        );
      }
      candidates.set(`${root}\0${candidate}`, { root, candidate });
    }
  }
  const ordered = [...candidates.values()].sort((left, right) => {
    const depth = (value) => value.split(path.sep).filter(Boolean).length;
    return (
      depth(right.candidate) - depth(left.candidate) ||
      right.candidate.localeCompare(left.candidate)
    );
  });
  const removed = [];
  const preserved = [];
  for (const entry of ordered) {
    if (!safeEmptyFixtureDirectory(entry)) {
      preserved.push(entry.candidate);
      continue;
    }
    try {
      rmdirSync(entry.candidate);
      removed.push(entry.candidate);
    } catch (error) {
      if (
        error?.code === "ENOENT" ||
        error?.code === "ENOTEMPTY" ||
        error?.code === "EEXIST" ||
        error?.code === "ENOTDIR"
      ) {
        preserved.push(entry.candidate);
        continue;
      }
      throw error;
    }
  }
  return Object.freeze({
    removed: Object.freeze(removed),
    preserved: Object.freeze(preserved),
  });
};
