// @vitest-environment node

import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parseSolanaLocalSbfRuntimeArgs } from "../scripts/e2e/sccp-solana-local-sbf-runtime.mjs";
import {
  parseSolanaExactInitializerArgs,
  parseSolanaExactInitializerCliArgs,
} from "../scripts/sccp-solana-exact-initialize.mjs";
import {
  SOLANA_SBF_PROGRAMS,
  parseSolanaSbfBuildArgs,
} from "../scripts/build-sccp-solana-programs.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const scripts = Object.freeze({
  build: path.join(repoRoot, "scripts/build-sccp-solana-programs.mjs"),
  initialize: path.join(repoRoot, "scripts/sccp-solana-exact-initialize.mjs"),
  runtime: path.join(repoRoot, "scripts/e2e/sccp-solana-local-sbf-runtime.mjs"),
});
const hash = `0x${"51".repeat(32)}`;

const runNode = (script, args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (status, signal) => {
      resolve({ signal, status, stderr, stdout });
    });
  });

const snapshotDirectory = async (root) => {
  const entries = [];
  const visit = async (directory) => {
    const names = (await readdir(directory)).sort();
    for (const name of names) {
      const absolute = path.join(directory, name);
      const relative = path.relative(root, absolute);
      const stats = await lstat(absolute);
      if (stats.isDirectory()) {
        entries.push([relative, "directory"]);
        await visit(absolute);
      } else if (stats.isSymbolicLink()) {
        entries.push([relative, `link:${await readlink(absolute)}`]);
      } else {
        entries.push([
          relative,
          `file:${Buffer.from(await readFile(absolute)).toString("hex")}`,
        ]);
      }
    }
  };
  await visit(root);
  return entries;
};

const snapshotBuildArtifacts = async () =>
  Promise.all(
    Object.values(SOLANA_SBF_PROGRAMS).map(async (program) => {
      const target = path.join(repoRoot, program.outputPath);
      try {
        const stats = await lstat(target);
        return {
          bytes: Buffer.from(await readFile(target)).toString("hex"),
          inode: stats.ino,
          mode: stats.mode,
          mtimeMs: stats.mtimeMs,
          path: program.outputPath,
        };
      } catch (error) {
        if (error?.code === "ENOENT") {
          return { missing: true, path: program.outputPath };
        }
        throw error;
      }
    }),
  );

const snapshotOperatorOutputs = async (root) => ({
  artifacts: await snapshotBuildArtifacts(),
  temporary: await snapshotDirectory(root),
});

describe("Solana operator CLI side-effect boundaries", () => {
  let root;
  let env;
  let marker;
  let stateDirectory;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sccp-solana-cli-safety-"));
    const bin = path.join(root, "bin");
    const home = path.join(root, "home");
    stateDirectory = path.join(root, "state");
    marker = path.join(root, "external-tool-invoked");
    await Promise.all([mkdir(bin), mkdir(home), mkdir(stateDirectory)]);
    await writeFile(path.join(stateDirectory, "sentinel"), "unchanged");
    const fakeTool = `#!/bin/sh
printf invoked > "$CLI_SIDE_EFFECT_MARKER"
exit 97
`;
    await Promise.all(
      ["cargo", "solana-test-validator"].map(async (name) => {
        const target = path.join(bin, name);
        await writeFile(target, fakeTool, { mode: 0o700 });
        await chmod(target, 0o700);
      }),
    );
    env = {
      ...process.env,
      CLI_SIDE_EFFECT_MARKER: marker,
      HOME: home,
      PATH: `${bin}${path.delimiter}${process.env.PATH ?? ""}`,
      TEMP: root,
      TMP: root,
      TMPDIR: root,
    };
  });

  afterEach(async () => {
    await rm(root, { force: true, recursive: true });
  });

  it("parses help before mutation options and rejects unknown or duplicate arguments", () => {
    expect(parseSolanaLocalSbfRuntimeArgs([])).toEqual({ help: false });
    expect(parseSolanaLocalSbfRuntimeArgs(["--help"])).toEqual({ help: true });
    expect(parseSolanaLocalSbfRuntimeArgs(["-h"])).toEqual({ help: true });
    expect(() => parseSolanaLocalSbfRuntimeArgs(["--unknown"])).toThrow(
      /does not accept arguments/u,
    );
    expect(() => parseSolanaLocalSbfRuntimeArgs(["--help", "--help"])).toThrow(
      /must be used alone/u,
    );

    expect(parseSolanaExactInitializerCliArgs(["--help"])).toEqual({
      help: true,
      options: null,
    });
    expect(parseSolanaExactInitializerCliArgs(["-h"])).toEqual({
      help: true,
      options: null,
    });
    expect(() =>
      parseSolanaExactInitializerCliArgs(["--help", "--input", "ignored"]),
    ).toThrow(/must be used alone/u);

    const initializerArgs = [
      "--input",
      "input.json",
      "--expected-input-sha256",
      hash,
      "--journal",
      "journal.json",
      "--evidence",
      "evidence.json",
      "--submit",
      "true",
    ];
    expect(() =>
      parseSolanaExactInitializerArgs([
        ...initializerArgs,
        "--unknown",
        "value",
      ]),
    ).toThrow(/unsupported option/u);
    expect(() =>
      parseSolanaExactInitializerArgs([
        ...initializerArgs,
        "--journal",
        "duplicate.json",
      ]),
    ).toThrow(/may appear only once/u);

    expect(parseSolanaSbfBuildArgs([])).toEqual({
      help: false,
      selection: "all",
    });
    expect(parseSolanaSbfBuildArgs(["bridge"])).toEqual({
      help: false,
      selection: "bridge",
    });
    expect(parseSolanaSbfBuildArgs(["--help"])).toEqual({
      help: true,
      selection: null,
    });
    expect(parseSolanaSbfBuildArgs(["-h"])).toEqual({
      help: true,
      selection: null,
    });
    expect(() => parseSolanaSbfBuildArgs(["--unknown"])).toThrow(
      /unsupported option/u,
    );
    expect(() => parseSolanaSbfBuildArgs(["bridge", "bridge"])).toThrow(
      /must not be duplicated/u,
    );
  });

  it("prints help and rejects hostile CLI shapes without invoking tools or mutating output", async () => {
    for (const script of Object.values(scripts)) {
      for (const helpArg of ["--help", "-h"]) {
        const before = await snapshotOperatorOutputs(root);
        const result = await runNode(script, [helpArg], env);
        expect(result).toMatchObject({ signal: null, status: 0, stderr: "" });
        expect(result.stdout).toMatch(/^Usage:/u);
        expect(await snapshotOperatorOutputs(root)).toEqual(before);
      }
    }

    const initializerArgs = [
      "--input",
      path.join(stateDirectory, "missing-input.json"),
      "--expected-input-sha256",
      hash,
      "--journal",
      path.join(stateDirectory, "journal.json"),
      "--evidence",
      path.join(stateDirectory, "evidence.json"),
      "--submit",
      "true",
    ];
    const hostileCases = [
      {
        args: ["--unknown"],
        error: /does not accept arguments/u,
        script: scripts.runtime,
      },
      {
        args: ["--help", "--help"],
        error: /must be used alone/u,
        script: scripts.runtime,
      },
      {
        args: [...initializerArgs, "--unknown", "value"],
        error: /unsupported option/u,
        script: scripts.initialize,
      },
      {
        args: [
          ...initializerArgs,
          "--journal",
          path.join(stateDirectory, "duplicate.json"),
        ],
        error: /may appear only once/u,
        script: scripts.initialize,
      },
      {
        args: ["--unknown"],
        error: /unsupported option/u,
        script: scripts.build,
      },
      {
        args: ["bridge", "bridge"],
        error: /must not be duplicated/u,
        script: scripts.build,
      },
    ];
    for (const testCase of hostileCases) {
      const before = await snapshotOperatorOutputs(root);
      const result = await runNode(testCase.script, testCase.args, env);
      expect(result.signal).toBeNull();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toMatch(testCase.error);
      expect(await snapshotOperatorOutputs(root)).toEqual(before);
    }

    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(path.join(stateDirectory, "sentinel"), "utf8")).toBe(
      "unchanged",
    );
    expect((await readdir(stateDirectory)).sort()).toEqual(["sentinel"]);
  }, 60_000);
});
