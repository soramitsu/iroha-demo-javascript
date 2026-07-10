import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SOLANA_SBF_PROGRAMS,
  buildSolanaSbfProgram,
  buildSolanaSbfPrograms,
  normalizeSolanaSbfBuildSelection,
} from "../scripts/build-sccp-solana-programs.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const ELF = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);

const fakeCargoSource = `#!/usr/bin/env node
import { existsSync, lstatSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const behavior = readFileSync(new URL("./fake-cargo-behavior", import.meta.url), "utf8").trim();
if (args[0] === "metadata") {
  if (!args.includes("--locked") || !args.includes("--no-deps")) process.exit(88);
  if (behavior === "stale-lock") process.exit(101);
  process.exit(0);
}
if (args[0] !== "build-sbf") process.exit(81);
if (args[1] === "--version") {
  if (behavior === "wrong-version") {
    process.stdout.write("cargo-build-sbf 9.9.9\\nplatform-tools v1.54\\nrustc 1.89.0\\n");
  } else {
    process.stdout.write("cargo-build-sbf 4.1.0\\nplatform-tools v1.54\\nrustc 1.89.0\\n");
  }
  process.exit(0);
}
const manifestIndex = args.indexOf("--manifest-path");
const outputIndex = args.indexOf("--sbf-out-dir");
if (manifestIndex < 0 || outputIndex < 0) process.exit(82);
const archIndex = args.indexOf("--arch");
const toolsIndex = args.indexOf("--tools-version");
const separatorIndex = args.indexOf("--");
if (archIndex < 0 || args[archIndex + 1] !== "v0") process.exit(84);
if (toolsIndex < 0 || args[toolsIndex + 1] !== "v1.54") process.exit(85);
if (separatorIndex < 0 || args[separatorIndex + 1] !== "--locked") process.exit(86);
const manifest = args[manifestIndex + 1];
const output = args[outputIndex + 1];
if (process.cwd() !== path.dirname(manifest)) process.exit(87);
const native = manifest.includes("sccp-native-recursive-verifier");
const artifact = native ? "sccp_native_recursive_verifier.so" : "sccp_taira_xor.so";
const keypair = native ? "sccp_native_recursive_verifier-keypair.json" : "sccp_taira_xor-keypair.json";
const sentinel = path.join(output, keypair);
const marker = path.join(sentinel, ".iroha-signer-free-sbf-build-sentinel");
if (!existsSync(marker) || !lstatSync(sentinel).isDirectory()) process.exit(83);

if (behavior === "fail") process.exit(23);
if (behavior === "replace-sentinel") {
  rmSync(sentinel, { recursive: true, force: true });
  writeFileSync(sentinel, "synthetic-secret-material", { mode: 0o600 });
}
if (behavior === "mutate-sentinel") {
  writeFileSync(path.join(sentinel, "unexpected"), "not-a-key");
}
if (behavior === "mutate-lock") {
  writeFileSync(path.join(path.dirname(manifest), "Cargo.lock"), "drifted lock");
}
if (behavior === "bad-elf") {
  writeFileSync(path.join(output, artifact), "not an elf");
} else if (behavior === "artifact-symlink") {
  const target = path.join(output, "artifact-target.so");
  writeFileSync(target, Buffer.from([0x7f, 0x45, 0x4c, 0x46, 1]));
  symlinkSync(target, path.join(output, artifact));
} else {
  writeFileSync(path.join(output, artifact), Buffer.from([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0]));
}
`;

const regularKeypairPaths = async (root) => {
  const paths = [];
  const visit = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const candidate = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(candidate);
      else if (entry.name.endsWith("-keypair.json")) paths.push(candidate);
    }
  };
  await visit(root);
  return paths;
};

describe("signer-free Solana SBF program build", () => {
  let root;
  let outputRoot;
  let scratchParent;
  let cargoBin;
  let behaviorPath;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "sccp-solana-signer-free-test-"));
    outputRoot = path.join(root, "final");
    scratchParent = path.join(root, "scratch");
    cargoBin = path.join(root, "fake-cargo.mjs");
    behaviorPath = path.join(root, "fake-cargo-behavior");
    await Promise.all([
      mkdir(outputRoot, { recursive: true }),
      mkdir(scratchParent, { recursive: true }),
      writeFile(cargoBin, fakeCargoSource, { mode: 0o700 }),
      writeFile(behaviorPath, "success"),
    ]);
    await chmod(cargoBin, 0o700);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const buildOptions = (extra = {}) => ({
    repoRoot,
    outputRoot,
    scratchParent,
    cargoBin,
    env: process.env,
    ...extra,
  });

  const setBehavior = (behavior) => writeFile(behaviorPath, behavior);

  it("builds both exact artifacts without creating a regular keypair path", async () => {
    const results = await buildSolanaSbfPrograms(buildOptions());

    expect(results).toHaveLength(2);
    expect(results.map(({ program }) => program)).toEqual(["bridge", "native"]);
    for (const result of results) {
      expect(result.signerMaterialWritten).toBe(false);
      expect(result.sha256).toMatch(/^0x[0-9a-f]{64}$/u);
      expect(await readFile(result.artifactPath)).toEqual(ELF);
    }
    expect(await regularKeypairPaths(outputRoot)).toEqual([]);
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("builds each program independently at its canonical artifact-only path", async () => {
    for (const program of ["bridge", "native"]) {
      const result = await buildSolanaSbfProgram({
        ...buildOptions(),
        program,
      });
      const canonicalOutputRoot = await realpath(outputRoot);
      expect(result.artifactPath).toBe(
        path.join(canonicalOutputRoot, SOLANA_SBF_PROGRAMS[program].outputPath),
      );
    }
  });

  it("does not read, overwrite, or remove a legacy keypair outside the artifact-only path", async () => {
    const legacyKey = path.join(
      outputRoot,
      "output/sccp-solana-build/sccp_taira_xor-keypair.json",
    );
    await mkdir(path.dirname(legacyKey), { recursive: true });
    await writeFile(legacyKey, "legacy-operator-material", { mode: 0o600 });

    await buildSolanaSbfProgram({ ...buildOptions(), program: "bridge" });

    expect(await readFile(legacyKey, "utf8")).toBe("legacy-operator-material");
  });

  it("erases scratch immediately if cargo replaces the sentinel with signer material", async () => {
    await setBehavior("replace-sentinel");
    await expect(
      buildSolanaSbfProgram({
        ...buildOptions(),
        program: "bridge",
      }),
    ).rejects.toThrow(
      /Scratch output was erased without inspecting signer bytes/u,
    );

    expect(await regularKeypairPaths(scratchParent)).toEqual([]);
    expect(await readdir(scratchParent)).toEqual([]);
    await expect(
      lstat(path.join(outputRoot, SOLANA_SBF_PROGRAMS.bridge.outputPath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects any mutation inside the signer-blocking directory", async () => {
    await setBehavior("mutate-sentinel");
    await expect(
      buildSolanaSbfProgram({
        ...buildOptions(),
        program: "native",
      }),
    ).rejects.toThrow(/modified the signer-blocking directory/u);
  });

  it.each(["bad-elf", "artifact-symlink"])(
    "rejects a %s cargo output before installing it",
    async (behavior) => {
      await setBehavior(behavior);
      await expect(
        buildSolanaSbfProgram({
          ...buildOptions(),
          program: "bridge",
        }),
      ).rejects.toThrow(/ELF program artifact|regular file/u);
      await expect(
        lstat(path.join(outputRoot, SOLANA_SBF_PROGRAMS.bridge.outputPath)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    },
  );

  it("preserves a previously verified artifact when cargo fails", async () => {
    const destination = path.join(
      outputRoot,
      SOLANA_SBF_PROGRAMS.bridge.outputPath,
    );
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, Buffer.concat([ELF, Buffer.from("old")]));
    await setBehavior("fail");

    await expect(
      buildSolanaSbfProgram({
        ...buildOptions(),
        program: "bridge",
      }),
    ).rejects.toThrow("cargo build-sbf exited with status 23");
    expect(await readFile(destination)).toEqual(
      Buffer.concat([ELF, Buffer.from("old")]),
    );
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("does not forward operator, wallet, or unrelated process secrets to cargo", async () => {
    let observedEnv;
    const spawnImpl = (command, args, options) => {
      observedEnv = options.env;
      return spawn(command, args, options);
    };

    await buildSolanaSbfProgram({
      ...buildOptions({
        env: {
          ...process.env,
          OPENAI_API_KEY: "must-not-leak",
          SCCP_SOLANA_DEPLOYER_SECRET_KEY: "must-not-leak",
          SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY: "must-not-leak",
          VITE_WALLETCONNECT_PROJECT_ID: "must-not-leak",
          WALLET_MNEMONIC: "must-not-leak",
        },
        spawnImpl,
      }),
      program: "bridge",
    });

    expect(observedEnv).toBeDefined();
    expect(Object.keys(observedEnv)).not.toEqual(
      expect.arrayContaining([
        "OPENAI_API_KEY",
        "SCCP_SOLANA_DEPLOYER_SECRET_KEY",
        "SCCP_TAIRA_ROUTE_MANIFEST_PRIVATE_KEY",
        "VITE_WALLETCONNECT_PROJECT_ID",
        "WALLET_MNEMONIC",
      ]),
    );
    expect(observedEnv).toMatchObject({
      CARGO_TERM_COLOR: "never",
      LANG: "C",
      LC_ALL: "C",
      SOURCE_DATE_EPOCH: "0",
      TZ: "UTC",
    });
  });

  it("fails before cargo when the exact lockfile is missing", async () => {
    const isolatedRepo = path.join(root, "missing-lock-repo");
    const crateDirectory = path.join(isolatedRepo, "solana/sccp-taira-xor");
    await mkdir(crateDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(crateDirectory, "Cargo.toml"),
        await readFile(
          path.join(repoRoot, SOLANA_SBF_PROGRAMS.bridge.manifestPath),
        ),
      ),
      writeFile(
        path.join(crateDirectory, "rust-toolchain.toml"),
        await readFile(
          path.join(repoRoot, SOLANA_SBF_PROGRAMS.bridge.rustToolchainPath),
        ),
      ),
    ]);

    await expect(
      buildSolanaSbfProgram({
        ...buildOptions({ repoRoot: isolatedRepo }),
        program: "bridge",
      }),
    ).rejects.toThrow("Cargo lockfile must be a regular file");
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("fails if cargo mutates the locked dependency graph", async () => {
    await setBehavior("mutate-lock");
    const originalLock = await readFile(
      path.join(repoRoot, SOLANA_SBF_PROGRAMS.bridge.lockPath),
    );
    const isolatedRepo = path.join(root, "lock-drift-repo");
    const crateDirectory = path.join(isolatedRepo, "solana/sccp-taira-xor");
    await mkdir(crateDirectory, { recursive: true });
    await Promise.all([
      writeFile(
        path.join(crateDirectory, "Cargo.toml"),
        await readFile(
          path.join(repoRoot, SOLANA_SBF_PROGRAMS.bridge.manifestPath),
        ),
      ),
      writeFile(path.join(crateDirectory, "Cargo.lock"), originalLock),
      writeFile(
        path.join(crateDirectory, "rust-toolchain.toml"),
        await readFile(
          path.join(repoRoot, SOLANA_SBF_PROGRAMS.bridge.rustToolchainPath),
        ),
      ),
    ]);

    await expect(
      buildSolanaSbfProgram({
        ...buildOptions({ repoRoot: isolatedRepo }),
        program: "bridge",
      }),
    ).rejects.toThrow("modified locked Solana SBF build metadata");
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("passes --locked through so stale manifest dependency resolution fails", async () => {
    await setBehavior("stale-lock");
    await expect(
      buildSolanaSbfProgram({ ...buildOptions(), program: "bridge" }),
    ).rejects.toThrow("cargo metadata --locked exited with status 101");
    await expect(
      lstat(path.join(outputRoot, SOLANA_SBF_PROGRAMS.bridge.outputPath)),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("rejects an unpinned cargo-build-sbf toolchain before compilation", async () => {
    await setBehavior("wrong-version");
    await expect(
      buildSolanaSbfProgram({ ...buildOptions(), program: "bridge" }),
    ).rejects.toThrow("does not match the pinned production build toolchain");
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("rejects symlinked output roots before invoking cargo", async () => {
    const realOutput = path.join(root, "real-output");
    const linkedOutput = path.join(root, "linked-output");
    await mkdir(realOutput);
    await symlink(realOutput, linkedOutput);

    await expect(
      buildSolanaSbfProgram({
        ...buildOptions({ outputRoot: linkedOutput }),
        program: "bridge",
      }),
    ).rejects.toThrow("output root must not be a symbolic link");
    expect(await readdir(scratchParent)).toEqual([]);
  });

  it("rejects a symlinked parent inside the artifact output path", async () => {
    const escaped = path.join(root, "escaped");
    const outputComponent = path.join(outputRoot, "output");
    await mkdir(escaped);
    await symlink(escaped, outputComponent);

    await expect(
      buildSolanaSbfProgram({ ...buildOptions(), program: "bridge" }),
    ).rejects.toThrow("must not contain symbolic-link components");
    expect(await readdir(scratchParent)).toEqual([]);
    expect(await readdir(escaped)).toEqual([]);
  });

  it.each(["Bridge", "destination", "", true, null])(
    "rejects non-canonical build selection %j",
    (selection) => {
      expect(() => normalizeSolanaSbfBuildSelection(selection)).toThrow(
        "must be bridge, native, or all",
      );
    },
  );
});
