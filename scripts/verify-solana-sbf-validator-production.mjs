import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
  assertSolanaSbfValidatorIntegrationPrerequisites,
  generateSolanaLoaderV3SbfValidationEvidence,
} from "./solana-sbf-validation-evidence.mjs";
import { solanaSha256 } from "./solana-loader-v3-runtime.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const manifest = path.join(repoRoot, "native/solana-sbf-validator/Cargo.toml");
const artifacts = Object.freeze([
  Object.freeze({
    name: "bridge",
    path: path.join(
      repoRoot,
      "output/sccp-solana-program-artifacts/bridge/sccp_taira_xor.so",
    ),
    expectedSha256:
      "0xcc2c7a8b91dd15fd561d9d9841546bace247e6967a4051137cb7ebd40f88b47c",
  }),
  Object.freeze({
    name: "native-verifier",
    path: path.join(
      repoRoot,
      "output/sccp-solana-program-artifacts/native-verifier/sccp_native_recursive_verifier.so",
    ),
    expectedSha256:
      "0x9f366f14d586c3c5e79d915cde4ce3dc82822a1aa7311091b98b5fdcbe184bfb",
  }),
]);

const childEnvironment = (extra = {}) => {
  const allowed = [
    "CARGO_HOME",
    "CI",
    "GITHUB_ACTIONS",
    "HOME",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "LOGNAME",
    "PATH",
    "RUSTUP_HOME",
    "SYSTEMROOT",
    "TEMP",
    "TMP",
    "TMPDIR",
    "USER",
    "WINDIR",
  ];
  const env = Object.create(null);
  for (const key of allowed) {
    if (typeof process.env[key] === "string" && process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return Object.assign(env, {
    CARGO_TERM_COLOR: "never",
    LANG: "C",
    LC_ALL: "C",
    SOURCE_DATE_EPOCH: "0",
    TZ: "UTC",
    ...extra,
  });
};

const run = (command, args, label, extraEnv = {}) => {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: childEnvironment(extraEnv),
    encoding: null,
    maxBuffer: 64 * 1024 * 1024,
    stdio: "inherit",
    shell: false,
  });
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error(`${label} failed closed.`);
  }
};

export const verifySolanaSbfValidatorProduction = () => {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(
      "Production SBF validator verification requires x86_64 Linux.",
    );
  }

  run(
    process.execPath,
    [path.join(scriptDir, "build-sccp-solana-programs.mjs"), "all"],
    "Reviewed Solana SBF program build",
  );
  run(
    "cargo",
    ["build", "--release", "--locked", "--manifest-path", manifest],
    "Release SBF validator build",
  );
  run(
    "cargo",
    ["test", "--locked", "--manifest-path", manifest],
    "SBF validator Rust tests",
  );

  assertSolanaSbfValidatorIntegrationPrerequisites({
    required: true,
    paths: [
      ...artifacts.map((entry) => entry.path),
      DEFAULT_SOLANA_SBF_VALIDATOR_BIN,
    ],
  });
  const helperSha256 = solanaSha256(
    readFileSync(DEFAULT_SOLANA_SBF_VALIDATOR_BIN),
  );
  const evidence = artifacts.map((artifact) => {
    const generated = generateSolanaLoaderV3SbfValidationEvidence({
      artifactPath: artifact.path,
      artifactRoot: repoRoot,
      expectedArtifactSha256: artifact.expectedSha256,
      expectedValidatorSha256: helperSha256,
    });
    if (generated.evidence.productionEligible !== true) {
      throw new Error(
        "Release SBF validator did not produce production-eligible evidence.",
      );
    }
    return Object.freeze({
      name: artifact.name,
      artifactSha256: generated.evidence.artifactSha256,
      evidenceSha256: generated.evidenceSha256,
    });
  });

  run(
    process.execPath,
    [
      path.join(repoRoot, "node_modules/vitest/vitest.mjs"),
      "run",
      "tests/solanaSbfValidationEvidence.spec.js",
    ],
    "Required production SBF validator integration tests",
    { SCCP_SOLANA_REQUIRE_SBF_VALIDATOR_INTEGRATION: "1" },
  );

  const report = Object.freeze({
    schema: "iroha-demo-solana-sbf-validator-production-verification/v1",
    verified: true,
    exactClusterAdmission: false,
    exactClusterAdmissionAuthority: "rollback-sentinel-simulation",
    helperBinarySha256: helperSha256,
    helperPath: path.relative(repoRoot, DEFAULT_SOLANA_SBF_VALIDATOR_BIN),
    artifacts: evidence,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  return report;
};

const isMain =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  try {
    verifySolanaSbfValidatorProduction();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Verification failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
