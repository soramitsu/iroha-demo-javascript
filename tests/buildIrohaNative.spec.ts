import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildIrohaNative,
  resolveIrohaNativeBuildEnvironment,
} from "../scripts/build-iroha-native.mjs";

const roots: string[] = [];

const makeFixture = () => {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "sora-wallet-native-build-")),
  );
  roots.push(root);
  const projectRoot = join(root, "wallet");
  const repoRoot = join(root, "iroha");
  const sdkRoot = join(repoRoot, "javascript", "iroha_js");
  const target = join(root, "cargo-target");
  const toolchainBin = join(root, "toolchains", "1.93.1-test", "bin");
  mkdirSync(projectRoot, { recursive: true });
  mkdirSync(sdkRoot, { recursive: true });
  mkdirSync(toolchainBin, { recursive: true });
  writeFileSync(join(repoRoot, "Cargo.toml"), "[workspace]\n", "utf8");
  writeFileSync(join(repoRoot, "Cargo.lock"), "version = 4\n", "utf8");
  writeFileSync(
    join(repoRoot, "rust-toolchain.toml"),
    '[toolchain]\nchannel = "1.93.1"\n',
    "utf8",
  );
  const tools = Object.fromEntries(
    ["cargo", "rustc", "rustdoc"].map((name) => {
      const filename = process.platform === "win32" ? `${name}.exe` : name;
      const path = join(toolchainBin, filename);
      writeFileSync(path, "tool", "utf8");
      chmodSync(path, 0o700);
      return [name, path];
    }),
  ) as Record<string, string>;
  return { projectRoot, repoRoot, sdkRoot, target, tools };
};

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("Iroha native build environment", () => {
  it("pins the official serialized offline build to one disjoint warm target", () => {
    const fixture = makeFixture();
    const runProcess = vi.fn((_command: string, args: readonly string[]) => ({
      status: 0,
      stdout: `${fixture.tools[args[1] ?? ""]}\n`,
    }));
    const result = resolveIrohaNativeBuildEnvironment({
      environment: { CARGO_TARGET_DIR: fixture.target },
      projectRoot: fixture.projectRoot,
      runProcess,
      sdkRoot: fixture.sdkRoot,
    });

    expect(result).toMatchObject({
      cargoManifest: join(fixture.repoRoot, "Cargo.toml"),
      cargoPath: fixture.tools.cargo,
      cargoTargetDirectory: fixture.target,
      repoRoot: fixture.repoRoot,
      sdkRoot: fixture.sdkRoot,
    });
    expect(result.buildEnvironment).toMatchObject({
      CARGO_BUILD_JOBS: "1",
      CARGO_INCREMENTAL: "0",
      CARGO_NET_OFFLINE: "true",
      CARGO_TARGET_DIR: fixture.target,
      IROHA_JS_CARGO_LOCKFILE_PATH: join(fixture.repoRoot, "Cargo.lock"),
      IROHA_JS_CARGO_PATH: fixture.tools.cargo,
      RUSTC: fixture.tools.rustc,
      RUSTC_BOOTSTRAP: "1",
      RUSTDOC: fixture.tools.rustdoc,
    });
    expect(runProcess).toHaveBeenCalledTimes(3);
  });

  it("rejects a target nested inside the authenticated source", () => {
    const fixture = makeFixture();
    const runProcess = vi.fn((_command: string, args: readonly string[]) => ({
      status: 0,
      stdout: `${fixture.tools[args[1] ?? ""]}\n`,
    }));

    expect(() =>
      resolveIrohaNativeBuildEnvironment({
        environment: { CARGO_TARGET_DIR: join(fixture.repoRoot, "target") },
        projectRoot: fixture.projectRoot,
        runProcess,
        sdkRoot: fixture.sdkRoot,
      }),
    ).toThrow("must be disjoint from source");
  });

  it("fetches the locked closure before invoking the offline SDK build", () => {
    const fixture = makeFixture();
    const calls: Array<{
      args: readonly string[];
      command: string;
      environment: Record<string, string | undefined>;
    }> = [];
    const runProcess = vi.fn(
      (
        command: string,
        args: readonly string[],
        options: { env?: Record<string, string | undefined> },
      ) => {
        if (basename(command).startsWith("rustup")) {
          return {
            status: 0,
            stdout: `${fixture.tools[args[1] ?? ""]}\n`,
          };
        }
        calls.push({
          args,
          command,
          environment: options.env ?? {},
        });
        return { status: 0 };
      },
    );

    buildIrohaNative({
      environment: {
        CARGO_TARGET_DIR: fixture.target,
        npm_execpath: join(fixture.projectRoot, "npm-cli.js"),
      },
      projectRoot: fixture.projectRoot,
      runProcess,
      sdkRoot: fixture.sdkRoot,
    });

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      args: [
        "fetch",
        "--locked",
        "--manifest-path",
        join(fixture.repoRoot, "Cargo.toml"),
      ],
      command: fixture.tools.cargo,
    });
    expect(calls[0]?.environment).not.toHaveProperty("CARGO_NET_OFFLINE");
    expect(calls[1]?.args).toEqual([
      join(fixture.projectRoot, "npm-cli.js"),
      "run",
      "build:native",
    ]);
    expect(calls[1]?.environment.CARGO_NET_OFFLINE).toBe("true");
  });
});
