// @vitest-environment node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
  DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
  SOLANA_SBF_VALIDATOR_SOURCE_FILES,
  assertSolanaSbfValidatorIntegrationPrerequisites,
  canonicalSolanaSbfValidatorSourceBundle,
  executeAuthenticatedSolanaSbfValidatorBinary,
  generateSolanaLoaderV3SbfValidationEvidence,
  parseSolanaSbfValidationEvidenceArgs,
  runSolanaSbfValidationEvidenceCli,
  sha256CanonicalEvidenceBytes,
  withStableSolanaSbfArtifactSnapshot,
} from "../scripts/solana-sbf-validation-evidence.mjs";

const repoRoot = path.resolve(".");
const manifest = path.join(repoRoot, "native/solana-sbf-validator/Cargo.toml");
const bridge = path.join(
  repoRoot,
  "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
);
const nativeVerifier = path.join(
  repoRoot,
  "output/sccp-solana-program-artifacts/native-verifier/sccp_native_recursive_verifier.so",
);
const bridgeSha =
  "0xcc2c7a8b91dd15fd561d9d9841546bace247e6967a4051137cb7ebd40f88b47c";
const nativeSha =
  "0x9f366f14d586c3c5e79d915cde4ce3dc82822a1aa7311091b98b5fdcbe184bfb";
const requiredIntegration =
  process.env.SCCP_SOLANA_REQUIRE_SBF_VALIDATOR_INTEGRATION === "1";
const cargoAvailable =
  spawnSync("cargo", ["--version"], { encoding: null }).status === 0;
const artifactsAvailable = [bridge, nativeVerifier].every(existsSync);
const integrationPossible =
  requiredIntegration ||
  (artifactsAvailable &&
    (existsSync(DEFAULT_SOLANA_SBF_VALIDATOR_BIN) || cargoAvailable));
const integrationIt = integrationPossible ? it : it.skip;
const requiredIt = requiredIntegration ? it : it.skip;
const cleanup = [];
let helper = DEFAULT_SOLANA_SBF_VALIDATOR_BIN;
let helperRoot = DEFAULT_SOLANA_SBF_VALIDATOR_ROOT;
let helperSha256;
let validationMode = requiredIntegration ? "production" : "diagnostic";

const sha256 = (bytes) =>
  `0x${createHash("sha256").update(Buffer.from(bytes)).digest("hex")}`;

const tempRoot = () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "solana-sbf-evidence-"));
  cleanup.push(root);
  return root;
};

beforeAll(() => {
  if (requiredIntegration) {
    assertSolanaSbfValidatorIntegrationPrerequisites({
      required: true,
      paths: [bridge, nativeVerifier, DEFAULT_SOLANA_SBF_VALIDATOR_BIN],
    });
    if (process.platform !== "linux" || process.arch !== "x64") {
      throw new Error(
        "Required production SBF validator integration must run on x86_64 Linux.",
      );
    }
  } else if (!integrationPossible) {
    return;
  } else {
    const targetDir = tempRoot();
    const result = spawnSync(
      "cargo",
      [
        "build",
        "--locked",
        "--offline",
        "--manifest-path",
        manifest,
        "--target-dir",
        targetDir,
      ],
      { encoding: null, maxBuffer: 4 * 1024 * 1024 },
    );
    if (result.status !== 0) {
      throw new Error("Pinned SBF validator test helper could not be built.");
    }
    helper = path.join(
      targetDir,
      "debug",
      process.platform === "win32"
        ? "iroha-demo-solana-sbf-validator.exe"
        : "iroha-demo-solana-sbf-validator",
    );
    helperRoot = targetDir;
  }
  if (integrationPossible) {
    assertSolanaSbfValidatorIntegrationPrerequisites({
      required: true,
      paths: [bridge, nativeVerifier, helper],
    });
    helperSha256 = sha256(readFileSync(helper));
  }
});

afterAll(() => {
  for (const entry of cleanup.splice(0)) {
    rmSync(entry, { recursive: true, force: true });
  }
});

const runHelper = (bytes, args = []) =>
  spawnSync(helper, args, {
    input: bytes,
    encoding: null,
    env: { LANG: "C", LC_ALL: "C", TZ: "UTC" },
  });

const generate = (artifactPath, expectedArtifactSha256, extra = {}) =>
  generateSolanaLoaderV3SbfValidationEvidence({
    artifactPath,
    artifactRoot: repoRoot,
    expectedArtifactSha256,
    expectedValidatorSha256: helperSha256,
    validatorBin: helper,
    validatorRoot: helperRoot,
    validatorSourceRoot: DEFAULT_SOLANA_SBF_VALIDATOR_ROOT,
    validationMode,
    ...extra,
  });

describe("pinned local solana-sbpf V0 helper", () => {
  integrationIt("accepts both exact reviewed bridge artifacts", () => {
    for (const artifact of [bridge, nativeVerifier]) {
      const result = runHelper(readFileSync(artifact));
      expect(result.status).toBe(0);
      expect(result.stderr).toEqual(Buffer.alloc(0));
      const output = JSON.parse(result.stdout.toString("utf8"));
      expect(output).toMatchObject({
        valid: true,
        validationScope: "local-solana-sbpf-structural-preflight",
        exactClusterAdmission: false,
        validatorVersion: "0.21.0",
        sbpfVersion: "V0",
      });
      expect(result.stdout.at(-1)).toBe("}".charCodeAt(0));
    }
  });

  integrationIt(
    "rejects magic-prefixed junk and a corrupted real artifact",
    () => {
      const junk = Buffer.concat([
        Buffer.from("\x7fELF", "binary"),
        Buffer.alloc(512),
      ]);
      expect(runHelper(junk).status).not.toBe(0);

      const corrupted = Buffer.from(readFileSync(bridge));
      corrupted[18] = 0;
      corrupted[19] = 0;
      expect(corrupted.subarray(0, 4)).toEqual(
        Buffer.from("\x7fELF", "binary"),
      );
      expect(runHelper(corrupted).status).not.toBe(0);
    },
  );

  integrationIt("rejects every command-line argument", () => {
    const result = runHelper(readFileSync(nativeVerifier), ["--unexpected"]);
    expect(result.status).not.toBe(0);
    expect(result.stdout).toEqual(Buffer.alloc(0));
    expect(result.stderr.toString("utf8")).toBe("SBF validation failed.\n");
  });
});

describe("stable public SBF snapshots", () => {
  it("rejects direct links, root escapes, replacements, and oversize files", () => {
    const root = tempRoot();
    const outside = tempRoot();
    const artifact = path.join(root, "artifact.so");
    const original = path.join(root, "artifact-original.so");
    const replacement = path.join(root, "replacement.so");
    writeFileSync(artifact, "AAAA");
    writeFileSync(replacement, "BBBB");
    symlinkSync(artifact, path.join(root, "artifact-link.so"));
    expect(() =>
      withStableSolanaSbfArtifactSnapshot(
        path.join(root, "artifact-link.so"),
        { root },
        () => null,
      ),
    ).toThrow(/symbolic[- ]link/u);

    writeFileSync(path.join(outside, "outside.so"), "public");
    symlinkSync(outside, path.join(root, "escaped"));
    expect(() =>
      withStableSolanaSbfArtifactSnapshot(
        path.join(root, "escaped/outside.so"),
        { root },
        () => null,
      ),
    ).toThrow(/symbolic-link components|escapes/u);

    expect(() =>
      withStableSolanaSbfArtifactSnapshot(artifact, { root }, (bytes) => {
        expect(bytes.toString("utf8")).toBe("AAAA");
        renameSync(artifact, original);
        renameSync(replacement, artifact);
      }),
    ).toThrow(/changed while it was being consumed/u);

    expect(() =>
      withStableSolanaSbfArtifactSnapshot(
        artifact,
        { root, maxBytes: 3 },
        () => null,
      ),
    ).toThrow(/approved byte limit/u);
  });

  it("rejects secret-like paths without echoing them", () => {
    const root = tempRoot();
    const secret = "opaque-secret-material-never-read";
    const secretPath = path.join(root, `${secret}.so`);
    try {
      withStableSolanaSbfArtifactSnapshot(secretPath, { root }, () => null);
      throw new Error("expected secret-like path rejection");
    } catch (error) {
      expect(String(error)).toContain("non-secret public path");
      expect(String(error)).not.toContain(secret);
    }
  });
});

describe("authenticated helper execution", () => {
  it("rejects a fake helper before execution when its hash is not approved", () => {
    if (process.platform === "win32") return;
    const root = tempRoot();
    const fake = path.join(root, "validator-helper");
    const marker = path.join(root, "executed-marker");
    writeFileSync(fake, `#!/bin/sh\ntouch '${marker}'\nprintf forged`);
    chmodSync(fake, 0o755);
    expect(() =>
      executeAuthenticatedSolanaSbfValidatorBinary({
        validatorBin: fake,
        validatorRoot: root,
        expectedValidatorSha256: sha256(Buffer.from("approved-real-helper")),
        executableBytes: Buffer.from("\x7fELFpublic", "binary"),
      }),
    ).toThrow(/independently approved SHA-256/u);
    expect(existsSync(marker)).toBe(false);
  });

  it("executes the authenticated private copy despite a source-path swap", () => {
    if (process.platform === "win32") return;
    const root = tempRoot();
    const original = path.join(root, "validator-helper");
    const replacement = path.join(root, "replacement-helper");
    writeFileSync(
      original,
      `#!/bin/sh\nmv '${replacement}' '${original}'\nprintf approved-copy`,
    );
    writeFileSync(replacement, "#!/bin/sh\nprintf substituted-copy");
    chmodSync(original, 0o755);
    chmodSync(replacement, 0o755);
    const expectedValidatorSha256 = sha256(readFileSync(original));
    const result = executeAuthenticatedSolanaSbfValidatorBinary({
      validatorBin: original,
      validatorRoot: root,
      expectedValidatorSha256,
      executableBytes: Buffer.from("public"),
    });
    expect(result.stdout.toString("utf8")).toBe("approved-copy");
    expect(spawnSync(original, [], { encoding: "utf8" }).stdout).toBe(
      "substituted-copy",
    );
  });

  it("fails closed on helper timeout", () => {
    if (process.platform === "win32") return;
    const root = tempRoot();
    const helperPath = path.join(root, "validator-helper");
    writeFileSync(helperPath, "#!/bin/sh\n/bin/sleep 5\nprintf late");
    chmodSync(helperPath, 0o755);
    expect(() =>
      executeAuthenticatedSolanaSbfValidatorBinary({
        validatorBin: helperPath,
        validatorRoot: root,
        expectedValidatorSha256: sha256(readFileSync(helperPath)),
        executableBytes: Buffer.from("public"),
        timeoutMs: 100,
      }),
    ).toThrow(/failed closed/u);
  });

  it("uses a stripped helper environment and never propagates stderr", () => {
    if (process.platform === "win32") return;
    const root = tempRoot();
    const helperPath = path.join(root, "validator-helper");
    writeFileSync(
      helperPath,
      '#!/bin/sh\ntest -z "$SBF_WRAPPER_SECRET" || exit 9\nprintf clean',
    );
    chmodSync(helperPath, 0o755);
    const before = process.env.SBF_WRAPPER_SECRET;
    process.env.SBF_WRAPPER_SECRET = "must-not-reach-helper";
    try {
      const result = executeAuthenticatedSolanaSbfValidatorBinary({
        validatorBin: helperPath,
        validatorRoot: root,
        expectedValidatorSha256: sha256(readFileSync(helperPath)),
        executableBytes: Buffer.from("public"),
      });
      expect(result.stdout.toString("utf8")).toBe("clean");
    } finally {
      if (before === undefined) delete process.env.SBF_WRAPPER_SECRET;
      else process.env.SBF_WRAPPER_SECRET = before;
    }

    writeFileSync(
      helperPath,
      "#!/bin/sh\nprintf 'opaque-never-log' >&2\nexit 1",
    );
    chmodSync(helperPath, 0o755);
    try {
      executeAuthenticatedSolanaSbfValidatorBinary({
        validatorBin: helperPath,
        validatorRoot: root,
        expectedValidatorSha256: sha256(readFileSync(helperPath)),
        executableBytes: Buffer.from("public"),
      });
    } catch (error) {
      expect(String(error)).toBe(
        "Error: Pinned local SBF structural validation failed closed.",
      );
      expect(String(error)).not.toContain("opaque-never-log");
    }
  });
});

describe("canonical Loader-v3 SBF evidence", () => {
  integrationIt(
    "binds exact helper, source, Cargo, rustc, host and JIT provenance",
    () => {
      const sourceBundle = canonicalSolanaSbfValidatorSourceBundle();
      expect(sourceBundle.manifest.files.map((entry) => entry.path)).toEqual(
        SOLANA_SBF_VALIDATOR_SOURCE_FILES,
      );
      for (const [artifactPath, expectedArtifactSha256] of [
        [bridge, bridgeSha],
        [nativeVerifier, nativeSha],
      ]) {
        const first = generate(artifactPath, expectedArtifactSha256);
        const second = generate(artifactPath, expectedArtifactSha256);
        expect(first.evidenceBytes).toEqual(second.evidenceBytes);
        expect(first.evidenceSha256).toBe(second.evidenceSha256);
        expect(first.evidenceSha256).toBe(
          sha256CanonicalEvidenceBytes(first.evidenceBytes),
        );
        expect(first.evidence).toMatchObject({
          valid: true,
          deterministic: true,
          validationScope: "local-solana-sbpf-structural-preflight",
          exactClusterAdmission: false,
          helperBinarySha256: helperSha256,
          validatorSourceBundleSha256: sourceBundle.sourceBundleSha256,
          cargoLockSha256: sourceBundle.cargoLockSha256,
        });
        expect(first.evidence.productionEligible).toBe(requiredIntegration);
        expect(first.evidence.rustcIdentitySha256).toBe(
          sha256(Buffer.from(first.evidence.rustcIdentity, "utf8")),
        );
        expect(first.evidenceBytes.at(-1)).toBe("}".charCodeAt(0));
        expect(first.evidenceBytes.includes(0x0a)).toBe(false);
      }
    },
  );

  integrationIt("fails on artifact or helper hash mismatch", () => {
    expect(() => generate(bridge, nativeSha)).toThrow(
      /independently reviewed/u,
    );
    expect(() =>
      generate(bridge, bridgeSha, {
        expectedValidatorSha256: sha256(Buffer.from("wrong-helper")),
      }),
    ).toThrow(/independently approved/u);
  });

  requiredIt("uses the exact production release helper path", () => {
    expect(helper).toBe(DEFAULT_SOLANA_SBF_VALIDATOR_BIN);
    expect(helper).toContain(`${path.sep}target${path.sep}release${path.sep}`);
    const evidence = generate(bridge, bridgeSha).evidence;
    expect(evidence).toMatchObject({
      productionEligible: true,
      helperTargetTriple: expect.stringMatching(/^x86_64-unknown-linux-/u),
      jitOutcome: "compiled",
      buildProfile: "release",
      resourceLimits: "unix-rlimit-v1",
    });
  });

  it("forbids production helper overrides even when their hash is supplied", () => {
    const root = tempRoot();
    const artifact = path.join(root, "artifact.so");
    const fake = path.join(root, "validator-helper");
    writeFileSync(artifact, Buffer.from("\x7fELFpublic", "binary"));
    writeFileSync(fake, "not an approved production helper");
    chmodSync(fake, 0o755);
    expect(() =>
      generateSolanaLoaderV3SbfValidationEvidence({
        artifactPath: artifact,
        artifactRoot: root,
        expectedArtifactSha256: sha256(readFileSync(artifact)),
        expectedValidatorSha256: sha256(readFileSync(fake)),
        validatorBin: fake,
        validatorRoot: root,
        validationMode: "production",
      }),
    ).toThrow(/forbids helper path overrides/u);
  });

  it("strictly parses CLI flags and rejects the removed helper override", () => {
    expect(() => parseSolanaSbfValidationEvidenceArgs(["--wat", "x"])).toThrow(
      "Unknown option.",
    );
    expect(() =>
      parseSolanaSbfValidationEvidenceArgs(["--validator-bin", "/tmp/fake"]),
    ).toThrow("Unknown option.");
    expect(() =>
      parseSolanaSbfValidationEvidenceArgs(["--artifact=x"]),
    ).toThrow("Option=value syntax is not accepted.");
    const help = runSolanaSbfValidationEvidenceCli(["--help"]);
    expect(help.toString("utf8")).toContain("local structural");
    expect(help.toString("utf8")).not.toContain("--validator-bin");
  });

  it("fails required integration mode when production artifacts are missing", () => {
    const root = tempRoot();
    expect(() =>
      assertSolanaSbfValidatorIntegrationPrerequisites({
        required: true,
        paths: [path.join(root, "missing-bridge.so")],
      }),
    ).toThrow(/Required production SBF validator integration artifacts/u);
  });

  requiredIt("CLI stdout is exact canonical production evidence", () => {
    const result = spawnSync(
      process.execPath,
      [
        path.join(repoRoot, "scripts/solana-sbf-validation-evidence.mjs"),
        "--artifact",
        bridge,
        "--artifact-root",
        repoRoot,
        "--expected-artifact-sha256",
        bridgeSha,
        "--expected-validator-sha256",
        helperSha256,
      ],
      { encoding: null },
    );
    expect(result.status).toBe(0);
    expect(result.stderr).toEqual(Buffer.alloc(0));
    expect(result.stdout.at(-1)).toBe("}".charCodeAt(0));
    expect(result.stdout.includes(0x0a)).toBe(false);
  });
});
