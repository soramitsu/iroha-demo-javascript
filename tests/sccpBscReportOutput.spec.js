import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertSafeJsonReportDestination,
  assertSafeJsonReportOutputDir,
  writeJsonReportFile,
} from "../scripts/e2e/sccp-bsc-report-output.mjs";

describe("BSC SCCP report output safety", () => {
  it("writes JSON reports through a regular latest.json file", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-report-output-"));
    const reportPath = path.join(dir, "latest.json");

    await expect(
      writeJsonReportFile(reportPath, { ready: false, checks: [] }),
    ).resolves.toBe(path.resolve(reportPath));

    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual({
      ready: false,
      checks: [],
    });
  });

  it("atomically replaces stale JSON reports without temp-file leftovers", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-report-output-"));
    const reportPath = path.join(dir, "latest.json");
    await writeFile(reportPath, '{"ready":true,"stale":true}\n', "utf8");

    await expect(
      writeJsonReportFile(reportPath, {
        ready: false,
        checks: [{ id: "production-gate", ok: false }],
      }),
    ).resolves.toBe(path.resolve(reportPath));

    expect(JSON.parse(await readFile(reportPath, "utf8"))).toEqual({
      ready: false,
      checks: [{ id: "production-gate", ok: false }],
    });
    expect(
      (await readdir(dir)).filter(
        (name) => name.startsWith(".latest.json.") && name.endsWith(".tmp"),
      ),
    ).toEqual([]);
  });

  it("rejects symlinked JSON report output directories", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-report-output-"));
    const actualDir = path.join(dir, "actual");
    const symlinkDir = path.join(dir, "reports");
    await mkdir(actualDir);
    await symlink(actualDir, symlinkDir);

    await expect(assertSafeJsonReportOutputDir(symlinkDir)).rejects.toThrow(
      /must not be a symbolic link/u,
    );
    await expect(
      writeJsonReportFile(path.join(symlinkDir, "latest.json"), {
        ready: false,
      }),
    ).rejects.toThrow(/must not be a symbolic link/u);
  });

  it("rejects symlinked JSON report files before writing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-report-output-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-report-output-outside-"),
    );
    const reportPath = path.join(dir, "latest.json");
    const targetPath = path.join(outside, "target.json");
    await writeFile(targetPath, "must-not-overwrite\n", "utf8");
    await symlink(targetPath, reportPath);

    await expect(assertSafeJsonReportDestination(reportPath)).rejects.toThrow(
      /must not be a symbolic link/u,
    );
    await expect(
      writeJsonReportFile(reportPath, { ready: true }),
    ).rejects.toThrow(/must not be a symbolic link/u);
    await expect(readFile(targetPath, "utf8")).resolves.toBe(
      "must-not-overwrite\n",
    );
  });
});
