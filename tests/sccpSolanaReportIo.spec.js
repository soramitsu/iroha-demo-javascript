import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseArgs as parseLiveVideoArgs } from "../scripts/e2e/sccp-solana-live-video.mjs";
import { parseArgs as parseProductionGateArgs } from "../scripts/e2e/sccp-solana-production-gate.mjs";
import { parseArgs as parsePreflightArgs } from "../scripts/e2e/sccp-solana-route-preflight.mjs";
import { parseArgs as parseSmokeArgs } from "../scripts/e2e/sccp-solana-live-smoke-readiness.mjs";
import {
  loadSolanaSccpSmokeEnvFiles,
  runLocalProverSelfTest,
} from "../scripts/e2e/sccp-solana-live-smoke-readiness.mjs";
import { buildSccpSolanaSuccessNetworkPolicy } from "../scripts/e2e/sccp-solana-success-evidence-policy.mjs";
import {
  commitGeneratedFileSync,
  readStableJsonFile,
  readStableJsonFileSync,
  readStableRegularFile,
  readStableRegularFileSync,
  writeAtomicFile,
  writeAtomicJsonFile,
  withStableRegularFileDescriptorsSync,
} from "../scripts/e2e/sccp-solana-report-io.mjs";

const repoRoot = path.resolve(".");
const cleanup = [];

afterEach(async () => {
  await Promise.all(
    cleanup
      .splice(0)
      .map((entry) => rm(entry, { recursive: true, force: true })),
  );
});

const tempDir = async () => {
  const value = await mkdtemp(path.join(os.tmpdir(), "sccp-solana-io-"));
  cleanup.push(value);
  return value;
};

const tempDirSync = () => {
  const value = mkdtempSync(path.join(os.tmpdir(), "sccp-solana-io-sync-"));
  cleanup.push(value);
  return value;
};

const errorMessage = (action) => {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("Expected action to fail.");
};

describe("Solana SCCP stable report I/O", () => {
  it("reads one stable regular-file snapshot in async and sync modes", async () => {
    const root = await tempDir();
    const file = path.join(root, "report.json");
    await writeFile(file, '{"ready":true}\n');

    await expect(readStableJsonFile(file, { root })).resolves.toEqual({
      ready: true,
    });
    expect(readStableJsonFileSync(file, { root })).toEqual({ ready: true });
    await expect(readStableRegularFile(file, { root })).resolves.toEqual(
      Buffer.from('{"ready":true}\n'),
    );
    expect(readStableRegularFileSync(file, { root })).toEqual(
      Buffer.from('{"ready":true}\n'),
    );
  });

  it("rejects direct input symlinks without reading their target", async () => {
    const root = await tempDir();
    const secret = path.join(root, "secret.json");
    const link = path.join(root, "report.json");
    await writeFile(secret, '{"opaque-secret":"never-echo-this"}');
    await symlink(secret, link);

    await expect(readStableJsonFile(link)).rejects.toThrow(/symbolic link/u);
    expect(() => readStableJsonFileSync(link)).toThrow(/symbolic link/u);
  });

  it("rejects ancestor-symlink escapes from an allowed root", async () => {
    const root = await tempDir();
    const outside = await tempDir();
    await writeFile(path.join(outside, "report.json"), '{"ready":true}');
    await symlink(outside, path.join(root, "escaped"));

    await expect(
      readStableJsonFile(path.join(root, "escaped/report.json"), { root }),
    ).rejects.toThrow(/escapes its allowed root/u);
    expect(() =>
      readStableJsonFileSync(path.join(root, "escaped/report.json"), { root }),
    ).toThrow(/escapes its allowed root/u);
  });

  it("rejects directories and oversized files before parsing", async () => {
    const root = await tempDir();
    const oversized = path.join(root, "large.json");
    await writeFile(oversized, "123456789");

    await expect(readStableRegularFile(root)).rejects.toThrow(/regular file/u);
    await expect(
      readStableRegularFile(oversized, { maxBytes: 8 }),
    ).rejects.toThrow(/8-byte limit/u);
    expect(() => readStableRegularFileSync(oversized, { maxBytes: 8 })).toThrow(
      /8-byte limit/u,
    );
  });

  it("redacts invalid JSON contents from parse failures", async () => {
    const root = await tempDir();
    const file = path.join(root, "bad.json");
    const secret = "opaque-private-key-never-echo";
    await writeFile(file, `{"${secret}":`);

    await expect(readStableJsonFile(file)).rejects.toThrow(
      "contains invalid JSON",
    );
    const message = errorMessage(() => readStableJsonFileSync(file));
    expect(message).not.toContain(secret);
  });

  it("uses O_NOFOLLOW and verifies descriptor/path identity before and after reads", () => {
    const source = readFileSync(
      path.join(repoRoot, "scripts/e2e/sccp-solana-report-io.mjs"),
      "utf8",
    );
    expect(source).toContain("constants.O_NOFOLLOW");
    expect(source.match(/fstatSync\(/gu)?.length).toBeGreaterThanOrEqual(2);
    expect(source.match(/handle\.stat\(\)/gu)?.length).toBeGreaterThanOrEqual(
      2,
    );
    expect(source).toContain("assertStablePathSync(resolved");
    expect(source).toContain("await assertStablePath(resolved");
    expect(source).toContain("canonicalAfter !== rootState.canonicalFile");
  });

  it("detects a same-size path replacement while a stable descriptor is held", () => {
    const root = tempDirSync();
    const file = path.join(root, "evidence.mp4");
    const original = path.join(root, "evidence.original.mp4");
    const replacement = path.join(root, "replacement.mp4");
    writeFileSync(file, "AAAA");
    writeFileSync(replacement, "BBBB");

    expect(() =>
      withStableRegularFileDescriptorsSync(file, ([fd]) => {
        expect(readFileSync(fd, "utf8")).toBe("AAAA");
        renameSync(file, original);
        renameSync(replacement, file);
      }),
    ).toThrow(
      /changed while it was being used|changed while it was being read/u,
    );
    expect(readFileSync(file, "utf8")).toBe("BBBB");
    expect(readFileSync(original, "utf8")).toBe("AAAA");
  });
});

describe("Solana SCCP success-policy redaction", () => {
  it("does not echo malformed endpoint credentials from URL parser errors", () => {
    const secret = "opaque-endpoint-password-never-log";
    const policy = buildSccpSolanaSuccessNetworkPolicy({
      toriiUrl: `https://operator:${secret}@%`,
      solanaRpcUrl: "https://api.testnet.solana.com",
    });
    expect(policy.ready).toBe(false);
    expect(JSON.stringify(policy)).not.toContain(secret);
    expect(policy.problems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "canonical-taira-validator-root",
          detail: "TAIRA success-evidence endpoint is invalid.",
        }),
      ]),
    );
  });

  it("does not invoke endpoint coercion outside the redaction boundary", () => {
    const secret = "coercion-secret-never-log";
    const policy = buildSccpSolanaSuccessNetworkPolicy({
      toriiUrl: {
        toString() {
          throw new Error(secret);
        },
      },
      solanaRpcUrl: "https://api.testnet.solana.com",
    });
    expect(policy.ready).toBe(false);
    expect(JSON.stringify(policy)).not.toContain(secret);
    expect(policy.problems[0]?.detail).toBe(
      "TAIRA success-evidence endpoint is invalid.",
    );
  });

  it("fails closed on hostile option descriptor traps without leaking them", () => {
    const secret = "descriptor-trap-secret-never-log";
    const hostile = new Proxy(
      {},
      {
        getOwnPropertyDescriptor() {
          throw new Error(secret);
        },
      },
    );
    const policy = buildSccpSolanaSuccessNetworkPolicy(hostile);
    expect(policy.ready).toBe(false);
    expect(JSON.stringify(policy)).not.toContain(secret);
    expect(policy.problems.map((problem) => problem.id)).toEqual(
      expect.arrayContaining([
        "canonical-taira-validator-root",
        "canonical-solana-testnet-rpc",
      ]),
    );
  });
});

describe("Solana SCCP atomic report output", () => {
  it("atomically replaces a regular report and leaves no temporary sidecar", async () => {
    const root = await tempDir();
    const report = path.join(root, "report.json");
    await writeFile(report, '{"old":true}\n');

    await writeAtomicJsonFile(report, { ready: true });

    expect(JSON.parse(await readFile(report, "utf8"))).toEqual({ ready: true });
    await expect(readdir(root)).resolves.not.toEqual(
      expect.arrayContaining([expect.stringMatching(/\.tmp$/u)]),
    );
  });

  it("refuses an output symlink and preserves its target bytes", async () => {
    const root = await tempDir();
    const target = path.join(root, "target.json");
    const report = path.join(root, "report.json");
    await writeFile(target, "operator-owned");
    await symlink(target, report);

    await expect(writeAtomicJsonFile(report, { ready: true })).rejects.toThrow(
      /not a symbolic link/u,
    );
    await expect(readFile(target, "utf8")).resolves.toBe("operator-owned");
  });

  it("refuses an output-directory symlink and writes nothing outside", async () => {
    const root = await tempDir();
    const outside = await tempDir();
    const linkedDir = path.join(root, "output");
    await symlink(outside, linkedDir);

    await expect(
      writeAtomicFile(path.join(linkedDir, "report.json"), "blocked"),
    ).rejects.toThrow(/must be a real directory/u);
    await expect(
      readFile(path.join(outside, "report.json")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});

const CLI_CONTRACTS = [
  {
    name: "route preflight",
    parser: parsePreflightArgs,
    script: "scripts/e2e/sccp-solana-route-preflight.mjs",
    valueFlag: "output-dir",
    standaloneFlags: ["skip-solana-rpc", "allow-incomplete", "help"],
    flags: [
      "torii-url",
      "solana-rpc-url",
      "manifest-file",
      "output-dir",
      "fetch-timeout-ms",
      "fetch-attempts",
      "skip-solana-rpc",
      "allow-incomplete",
      "help",
    ],
  },
  {
    name: "live smoke-readiness",
    parser: parseSmokeArgs,
    script: "scripts/e2e/sccp-solana-live-smoke-readiness.mjs",
    valueFlag: "output-dir",
    standaloneFlags: [
      "skip-solana-rpc",
      "allow-incomplete",
      "allow-not-ready",
      "help",
    ],
    flags: [
      "torii-url",
      "solana-rpc-url",
      "manifest-file",
      "output-dir",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
      "env-mode",
      "fetch-timeout-ms",
      "fetch-attempts",
      "skip-solana-rpc",
      "allow-incomplete",
      "allow-not-ready",
      "help",
    ],
  },
  {
    name: "production gate",
    parser: parseProductionGateArgs,
    script: "scripts/e2e/sccp-solana-production-gate.mjs",
    valueFlag: "output-dir",
    standaloneFlags: ["allow-incomplete", "skip-solana-rpc", "help"],
    flags: [
      "torii-url",
      "solana-rpc-url",
      "fetch-timeout-ms",
      "fetch-attempts",
      "preflight-report",
      "requirements",
      "post-deploy-evidence",
      "prover-readiness",
      "production-material-inventory",
      "route-manifest",
      "publish-readiness",
      "route-publish-blocked",
      "route-publication-request",
      "route-publication-request-sha256",
      "route-manager-access-request",
      "route-manager-access-request-sha256",
      "operator-handoff",
      "operator-handoff-sha256",
      "activation-package",
      "activation-package-sha256",
      "lane-activation-request",
      "lane-activation-request-sha256",
      "lane-activation-proposal",
      "lane-activation-proposal-sha256",
      "source-material-handoff",
      "handoff-verification",
      "source-burn-readiness",
      "source-burn-submission",
      "proof-material-request",
      "proof-material-bundle",
      "proof-material-ceremony-package",
      "smoke-readiness",
      "deployment-video-transcript",
      "deployment-video-mp4",
      "deployment-video-vtt",
      "expected-pre-live-input-snapshot-sha256",
      "live-video-transcript",
      "live-video-mp4",
      "live-video-vtt",
      "blocked-live-video-transcript",
      "blocked-live-video-mp4",
      "blocked-live-video-vtt",
      "deploy-dir",
      "output-dir",
      "allow-incomplete",
      "skip-solana-rpc",
      "help",
    ],
  },
  {
    name: "live video",
    parser: parseLiveVideoArgs,
    script: "scripts/e2e/sccp-solana-live-video.mjs",
    valueFlag: "output-dir",
    standaloneFlags: ["allow-incomplete", "skip-solana-rpc", "help"],
    flags: [
      "torii-url",
      "solana-rpc-url",
      "fetch-timeout-ms",
      "fetch-attempts",
      "live-evidence",
      "write-live-evidence-template",
      "production-requirements",
      "preflight-report",
      "publish-readiness",
      "route-publication-request",
      "smoke-readiness",
      "handoff-verification",
      "proof-material-bundle",
      "activation-package",
      "deployment-video-transcript",
      "operator-handoff",
      "production-gate",
      "production-gate-snapshot",
      "production-gate-snapshot-sha256",
      "output-dir",
      "allow-incomplete",
      "skip-solana-rpc",
      "help",
    ],
  },
];

describe.each(CLI_CONTRACTS)("$name strict CLI", (contract) => {
  it("rejects unknown, duplicate, key=value, positional, and missing-value inputs", () => {
    expect(() => contract.parser(["--not-a-real-option"])).toThrow(
      "Unknown option",
    );
    expect(() =>
      contract.parser([
        `--${contract.valueFlag}`,
        "one",
        `--${contract.valueFlag}`,
        "two",
      ]),
    ).toThrow(/only once/u);
    expect(() =>
      contract.parser([`--${contract.valueFlag}=operator-secret`]),
    ).toThrow(/Option=value syntax/u);
    expect(() => contract.parser(["operator-secret"])).toThrow(
      /Unexpected positional/u,
    );
    expect(() => contract.parser([`--${contract.valueFlag}`])).toThrow(
      /requires an explicit value/u,
    );
  });

  it("does not echo rejected option values or positional secrets", () => {
    const secret = "opaque-runtime-private-key-never-log";
    expect(errorMessage(() => contract.parser([secret]))).not.toContain(secret);
    expect(
      errorMessage(() => contract.parser([`--unknown-${secret}`])),
    ).not.toContain(secret);
    expect(
      errorMessage(() =>
        contract.parser([`--${contract.valueFlag}=${secret}`]),
      ),
    ).not.toContain(secret);
    expect(
      errorMessage(() => contract.parser(["--skip-solana-rpc", secret])),
    ).not.toContain(secret);
  });

  it("documents every accepted option and keeps --help no-write", () => {
    const root = tempDirSync();
    const output = path.join(root, "must-not-exist");
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, contract.script),
        `--${contract.valueFlag}`,
        output,
        "--help",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
    for (const flag of contract.flags) {
      expect(result.stdout).toContain(`--${flag}`);
      const args = contract.standaloneFlags.includes(flag)
        ? [`--${flag}`]
        : [`--${flag}`, "test-value"];
      expect(() => contract.parser(args)).not.toThrow();
    }
    const documentedFlags = [
      ...new Set(
        [...result.stdout.matchAll(/^\s+--([a-z0-9-]+)/gmu)].map(
          (match) => match[1],
        ),
      ),
    ].sort();
    expect(documentedFlags).toEqual([...contract.flags].sort());
    expect(() => readFileSync(output)).toThrow();
  });
});

describe("Solana SCCP sync filesystem adversaries", () => {
  it("rejects a direct sync symlink input and leaves the target unchanged", () => {
    const root = tempDirSync();
    const target = path.join(root, "target.json");
    const link = path.join(root, "link.json");
    writeFileSync(target, '{"secret":"operator-owned"}');
    symlinkSync(target, link);
    expect(() => readStableRegularFileSync(link)).toThrow(/symbolic link/u);
    expect(readFileSync(target, "utf8")).toContain("operator-owned");
  });

  it("rejects a symlinked Vite env file before importing any secret", () => {
    const root = tempDirSync();
    const outside = tempDirSync();
    const secret = "wallet-project-id-never-import";
    const target = path.join(outside, "operator.env");
    writeFileSync(target, `VITE_WALLETCONNECT_PROJECT_ID=${secret}\n`);
    symlinkSync(target, path.join(root, ".env"));
    const env = {};

    expect(() =>
      loadSolanaSccpSmokeEnvFiles({ root, mode: "test", env }),
    ).toThrow(/symbolic link/u);
    expect(env).not.toHaveProperty("VITE_WALLETCONNECT_PROJECT_ID");
  });

  it("rejects a public prover module symlink without importing its target", () => {
    const root = tempDirSync();
    const secret = "module-secret-never-evaluate";
    const target = path.join(root, "attacker.mjs");
    writeFileSync(target, `throw new Error(${JSON.stringify(secret)});\n`);
    const name = `sccp-solana-io-${process.pid}-${Date.now()}.js`;
    const moduleLink = path.join(repoRoot, "public", name);
    symlinkSync(target, moduleLink);
    try {
      const result = runLocalProverSelfTest({
        moduleUrl: `/${name}`,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
      });
      expect(result).toMatchObject({
        inspected: true,
        exportsOk: false,
        ready: false,
      });
      expect(result.error).toMatch(/symbolic link/u);
      expect(result.error).not.toContain(secret);
    } finally {
      rmSync(moduleLink, { force: true });
    }
  });

  it("executes prover snapshots without inheriting wallet or API secrets", () => {
    const publicRoot = mkdtempSync(
      path.join(repoRoot, "public/sccp-solana/io-env-test-"),
    );
    const moduleFile = path.join(publicRoot, "prover.js");
    const sidecarFile = path.join(publicRoot, "prover.sidecar.json");
    const moduleUrl = `/sccp-solana/${path.basename(publicRoot)}/prover.js`;
    const secretName = "SCCP_SOLANA_OPERATOR_PRIVATE_KEY";
    const secret = "opaque-runtime-key-never-inherit";
    const previous = process.env[secretName];
    const moduleSource = [
      `export const solanaSccpDestinationProverSelfTest = async () => ({ ready: false, inheritedSecret: process.env.${secretName} ?? null });`,
      "export const proveSolanaSccpDestination = async () => ({ request: {}, submission: {} });",
    ].join("\n");
    const moduleHash = `0x${createHash("sha256")
      .update(moduleSource)
      .digest("hex")}`;
    const baseSidecar = JSON.parse(
      readFileSync(
        path.join(
          repoRoot,
          "public/sccp-solana/taira-solana-xor-destination-prover.sidecar.json",
        ),
        "utf8",
      ),
    );
    writeFileSync(moduleFile, moduleSource);
    writeFileSync(
      sidecarFile,
      JSON.stringify({
        ...baseSidecar,
        moduleUrl,
        module_url: moduleUrl,
        moduleHash,
        module_hash: moduleHash,
      }),
    );
    process.env[secretName] = secret;
    try {
      const result = runLocalProverSelfTest({
        moduleUrl,
        proveExport: "proveSolanaSccpDestination",
        selfTestExport: "solanaSccpDestinationProverSelfTest",
      });
      expect(result.selfTest).toMatchObject({
        ready: false,
        inheritedSecret: null,
      });
      expect(JSON.stringify(result)).not.toContain(secret);
    } finally {
      if (previous === undefined) {
        delete process.env[secretName];
      } else {
        process.env[secretName] = previous;
      }
      rmSync(publicRoot, { recursive: true, force: true });
    }
  });

  it("refuses to commit generated media over a symlink destination", () => {
    const root = tempDirSync();
    const generated = path.join(root, ".video.tmp.mp4");
    const target = path.join(root, "operator-owned.mp4");
    const destination = path.join(root, "video.mp4");
    writeFileSync(generated, "generated-media");
    writeFileSync(target, "operator-owned");
    symlinkSync(target, destination);

    expect(() => commitGeneratedFileSync(generated, destination)).toThrow(
      /not a symbolic link/u,
    );
    expect(readFileSync(target, "utf8")).toBe("operator-owned");
    expect(readFileSync(generated, "utf8")).toBe("generated-media");
  });
});
