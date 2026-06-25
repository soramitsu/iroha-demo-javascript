import { constants } from "node:fs";
import { lstat, mkdir, open, rename, rm } from "node:fs/promises";
import path from "node:path";

const tempSuffix = () =>
  `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;

export const assertSafeJsonReportOutputDir = async (dir) => {
  const info = await lstat(dir);
  if (info.isSymbolicLink()) {
    throw new Error(
      `JSON report output directory ${dir} must not be a symbolic link.`,
    );
  }
  if (!info.isDirectory()) {
    throw new Error(`JSON report output directory ${dir} must be a directory.`);
  }
};

export const assertSafeJsonReportDestination = async (file) => {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) {
      throw new Error(
        `JSON report output file ${file} must not be a symbolic link.`,
      );
    }
    if (!info.isFile()) {
      throw new Error(
        `JSON report output file ${file} must be a regular file.`,
      );
    }
  } catch (error) {
    if (error?.code === "ENOENT") {
      return;
    }
    throw error;
  }
};

export const writeJsonReportFile = async (file, report) => {
  const resolved = path.resolve(file);
  const outputDir = path.dirname(resolved);
  await mkdir(outputDir, { recursive: true });
  await assertSafeJsonReportOutputDir(outputDir);
  await assertSafeJsonReportDestination(resolved);

  const tempFile = path.join(
    outputDir,
    `.${path.basename(resolved)}.${tempSuffix()}.tmp`,
  );
  let handle = null;
  try {
    handle = await open(
      tempFile,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await handle.writeFile(`${JSON.stringify(report, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await assertSafeJsonReportOutputDir(outputDir);
    await assertSafeJsonReportDestination(resolved);
    await rename(tempFile, resolved);
    return resolved;
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
};
