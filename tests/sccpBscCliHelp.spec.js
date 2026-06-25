import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const bscCliScripts = Object.freeze([
  "scripts/e2e/sccp-bsc-route-preflight.mjs",
  "scripts/e2e/sccp-bsc-route-manifest.mjs",
  "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
  "scripts/e2e/sccp-bsc-prover-manifest.mjs",
  "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
  "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
  "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
  "scripts/e2e/sccp-bsc-live-video.mjs",
  "scripts/e2e/sccp-bsc-production-gate.mjs",
]);

const profileSpecificBscProverEnvVars = Object.freeze([
  "VITE_WALLETCONNECT_PROJECT_ID",
  "VITE_SCCP_BSC_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_PROVER_CONFIG_URL",
  "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL",
  "VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL",
  "VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL",
  "VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL",
]);

const helpEnv = (outputDir) => ({
  ...process.env,
  SCCP_BSC_PREFLIGHT_OUTPUT_DIR: path.join(outputDir, "preflight"),
  SCCP_BSC_MATERIAL_INVENTORY_OUTPUT_DIR: path.join(outputDir, "material"),
  SCCP_BSC_SMOKE_READINESS_OUTPUT_DIR: path.join(outputDir, "smoke"),
  SCCP_BSC_PEER_AUDIT_OUTPUT_DIR: path.join(outputDir, "peer"),
  SCCP_BSC_VIDEO_OUTPUT_DIR: path.join(outputDir, "video"),
  SCCP_BSC_PRODUCTION_GATE_OUTPUT_DIR: path.join(outputDir, "gate"),
});

const runHelp = (script, outputDir) =>
  spawnSync(process.execPath, [script, "--help"], {
    cwd: repoRoot,
    env: helpEnv(outputDir),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

const acceptedCliFlags = (script) => {
  const text = readFileSync(path.join(repoRoot, script), "utf8");
  const flags = new Set();
  for (const pattern of [
    /args\["([a-z0-9-]+)"\]/gu,
    /args\.([a-zA-Z0-9_]+)/gu,
  ]) {
    for (const match of text.matchAll(pattern)) {
      flags.add(match[1].replace(/_/gu, "-"));
    }
  }
  for (const match of text.matchAll(/has\("([a-z0-9-]+)"\)/gu)) {
    flags.add(match[1]);
  }
  flags.delete("help");
  return [...flags].sort();
};

describe("BSC SCCP CLI help", () => {
  it.each(bscCliScripts)(
    "%s prints usage without writing reports",
    (script) => {
      const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-"));
      try {
        const result = runHelp(script, outputDir);

        expect(result.status).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("Usage:");
        expect(result.stdout).toContain("--help");
        expect(readdirSync(outputDir)).toEqual([]);
      } finally {
        rmSync(outputDir, { recursive: true, force: true });
      }
    },
  );

  it("accepts short -h before argument parsing", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-"));
    try {
      const result = spawnSync(
        process.execPath,
        ["scripts/e2e/sccp-bsc-production-gate.mjs", "-h"],
        {
          cwd: repoRoot,
          env: helpEnv(outputDir),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("Usage:");
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("documents peer audit as a stale local override check", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-"));
    try {
      const result = runHelp(
        "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        outputDir,
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        "stale local BSC SCCP route/prover overrides",
      );
      expect(result.stdout).not.toContain(
        "one identical BSC SCCP route stanza",
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported strict BSC CLI options before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-unknown-"));
    const cases = [
      {
        script: "scripts/e2e/sccp-bsc-route-preflight.mjs",
        args: [
          "--unknown-production-option",
          "--output-dir",
          path.join(outputDir, "preflight"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-route-manifest.mjs",
        args: [
          "--unknown-production-option",
          "--out",
          path.join(outputDir, "manifest.json"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
        args: [
          "--unknown-production-option",
          "--out",
          path.join(outputDir, "runtime.json"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-prover-manifest.mjs",
        args: [
          "--unknown-production-option",
          "--out",
          path.join(outputDir, "prover.json"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        args: [
          "--unknown-production-option",
          "--output-dir",
          path.join(outputDir, "peer"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
        args: [
          "--unknown-production-option",
          "--output-dir",
          path.join(outputDir, "smoke"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-video.mjs",
        args: [
          "--unknown-production-option",
          "--output-dir",
          path.join(outputDir, "video"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        args: [
          "--allow-not-ready",
          "--output-dir",
          path.join(outputDir, "gate"),
        ],
        message: "Unknown option: --allow-not-ready",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
        args: [
          "--unknown-production-option",
          "--output-dir",
          path.join(outputDir, "material"),
        ],
        message: "Unknown option: --unknown-production-option",
      },
    ];
    try {
      for (const { script, args, message } of cases) {
        const result = spawnSync(process.execPath, [script, ...args], {
          cwd: repoRoot,
          env: helpEnv(outputDir),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        });

        expect(result.status, script).toBe(1);
        expect(result.stderr, script).toContain(message);
        expect(result.stderr, script).toContain("--help");
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate singleton BSC CLI options before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-duplicate-"));
    try {
      for (const script of bscCliScripts) {
        const result = spawnSync(
          process.execPath,
          [script, "--bsc-network", "testnet", "--bsc-network", "mainnet"],
          {
            cwd: repoRoot,
            env: helpEnv(outputDir),
            encoding: "utf8",
            maxBuffer: 1024 * 1024,
          },
        );

        expect(result.status, script).toBe(1);
        expect(result.stderr, script).toContain(
          "Duplicate option: --bsc-network",
        );
        expect(result.stderr, script).toContain("--help");
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("requires incomplete mode for skipped BSC live-video preflight before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-video-skip-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/e2e/sccp-bsc-live-video.mjs",
          "--skip-preflight",
          "--output-dir",
          path.join(outputDir, "video"),
          "--duration-ms",
          "30000",
        ],
        {
          cwd: repoRoot,
          env: {
            ...helpEnv(outputDir),
            SCCP_BSC_VIDEO_ALLOW_INCOMPLETE: "false",
          },
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        },
      );

      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        "--skip-preflight requires --allow-incomplete",
      );
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects conflicting BSC CLI aliases before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-alias-"));
    const cases = [
      {
        script: "scripts/e2e/sccp-bsc-route-manifest.mjs",
        args: [
          "--evidence",
          path.join(outputDir, "a.json"),
          "--deployment-evidence",
          path.join(outputDir, "b.json"),
          "--out",
          path.join(outputDir, "route.json"),
        ],
        message: "Conflicting option aliases for BSC deployment evidence",
      },
      {
        script: "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
        args: [
          "--route-report",
          path.join(outputDir, "route-report.json"),
          "--manifest-file",
          path.join(outputDir, "route-manifest.json"),
          "--out",
          path.join(outputDir, "runtime.json"),
        ],
        message: "Conflicting option aliases for BSC route evidence source",
      },
      {
        script: "scripts/e2e/sccp-bsc-prover-manifest.mjs",
        args: [
          "--route-report",
          path.join(outputDir, "route-report.json"),
          "--manifest-file",
          path.join(outputDir, "route-manifest.json"),
          "--out",
          path.join(outputDir, "prover.json"),
        ],
        message: "Conflicting option aliases for BSC route evidence source",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
        args: [
          "--destination-module-url",
          "/sccp-bsc/a.js",
          "--destination-prover-module-url",
          "/sccp-bsc/b.js",
          "--output-dir",
          path.join(outputDir, "material"),
        ],
        message:
          "Conflicting option aliases for TAIRA-to-BSC prover module URL",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
        args: [
          "--runtime-prover-config-url",
          "/sccp-bsc/a.json",
          "--prover-config-url",
          "/sccp-bsc/b.json",
          "--output-dir",
          path.join(outputDir, "smoke"),
        ],
        message: "Conflicting option aliases for BSC runtime prover config URL",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-video.mjs",
        args: [
          "--auto-explorer",
          "--no-auto-explorer",
          "--output-dir",
          path.join(outputDir, "video"),
        ],
        message:
          "Conflicting option aliases for BSC live-video explorer automation",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        args: [
          "--destination-prover-module-url",
          "/sccp-bsc/a.js",
          "--module-url",
          "/sccp-bsc/b.js",
          "--output-dir",
          path.join(outputDir, "gate"),
        ],
        message:
          "Conflicting option aliases for TAIRA-to-BSC prover module URL",
      },
      {
        script: "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        args: [
          "--dir",
          path.join(outputDir, "local-peers"),
          "--ssh-host",
          "ops@taira.example",
          "--output-dir",
          path.join(outputDir, "peer-audit"),
        ],
        message: "Conflicting BSC peer-config audit sources",
      },
    ];
    try {
      for (const { script, args, message } of cases) {
        const result = spawnSync(process.execPath, [script, ...args], {
          cwd: repoRoot,
          env: helpEnv(outputDir),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        });

        expect(result.status, script).toBe(1);
        expect(result.stderr, script).toContain(message);
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects ambiguous BSC peer-audit SSH credential sources before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-ssh-"));
    const missingCredsFile = path.join(outputDir, "missing-creds.txt");
    const cases = [
      {
        script: "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        args: [
          "--ssh-host",
          "ops@taira.example",
          "--ssh-creds-file",
          missingCredsFile,
          "--output-dir",
          path.join(outputDir, "peer-audit"),
        ],
        message:
          "Conflicting BSC peer-config audit SSH host sources: sshHost, sshCredsFile",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        args: [
          "--refresh",
          "true",
          "--peer-audit-ssh-host",
          "ops@taira.example",
          "--peer-audit-ssh-creds-file",
          missingCredsFile,
          "--output-dir",
          path.join(outputDir, "gate"),
        ],
        message:
          "Conflicting BSC peer-config audit SSH host sources: sshHost, sshCredsFile",
      },
    ];

    try {
      for (const { script, args, message } of cases) {
        const result = spawnSync(process.execPath, [script, ...args], {
          cwd: repoRoot,
          env: helpEnv(outputDir),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        });

        expect(result.status, script).toBe(1);
        expect(result.stderr, script).toContain(message);
        expect(result.stderr, script).not.toContain("ENOENT");
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("rejects loose BSC CLI booleans before writing reports", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-bool-"));
    const cases = [
      {
        script: "scripts/e2e/sccp-bsc-route-preflight.mjs",
        args: [
          "--check-bsc-contracts",
          "yes",
          "--output-dir",
          path.join(outputDir, "preflight"),
        ],
        message: "--check-bsc-contracts must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-route-preflight.mjs",
        args: [
          "--allow-local-rpc",
          "0",
          "--output-dir",
          path.join(outputDir, "preflight-local"),
        ],
        message: "--allow-local-rpc must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
        args: [
          "--check-bsc-contracts",
          "on",
          "--out",
          path.join(outputDir, "runtime.json"),
        ],
        message: "--check-bsc-contracts must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-prover-manifest.mjs",
        args: [
          "--check-bsc-contracts",
          "1",
          "--out",
          path.join(outputDir, "prover.json"),
        ],
        message: "--check-bsc-contracts must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        args: [
          "--dir",
          path.join(outputDir, "missing-peers"),
          "--include-backups",
          "yes",
          "--output-dir",
          path.join(outputDir, "peer"),
        ],
        message: "--include-backups must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
        args: [
          "--allow-not-ready",
          "on",
          "--output-dir",
          path.join(outputDir, "smoke"),
        ],
        message: "--allow-not-ready must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-video.mjs",
        args: ["--output-dir", path.join(outputDir, "video")],
        env: { SCCP_BSC_VIDEO_SKIP_PREFLIGHT: "1" },
        message: "SCCP_BSC_VIDEO_SKIP_PREFLIGHT must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-live-video.mjs",
        args: ["--output-dir", path.join(outputDir, "video-incomplete")],
        env: { SCCP_BSC_VIDEO_ALLOW_INCOMPLETE: "FALSE" },
        message: "SCCP_BSC_VIDEO_ALLOW_INCOMPLETE must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
        args: [
          "--allow-not-ready",
          "yes",
          "--output-dir",
          path.join(outputDir, "material"),
        ],
        message: "--allow-not-ready must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        args: [
          "--refresh",
          "yes",
          "--output-dir",
          path.join(outputDir, "gate"),
        ],
        message: "--refresh must be true or false",
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        args: ["--output-dir", path.join(outputDir, "gate-env")],
        env: { SCCP_BSC_PRODUCTION_GATE_REFRESH: "FALSE" },
        message: "SCCP_BSC_PRODUCTION_GATE_REFRESH must be true or false",
      },
    ];

    try {
      for (const { script, args, env = {}, message } of cases) {
        const result = spawnSync(process.execPath, [script, ...args], {
          cwd: repoRoot,
          env: { ...helpEnv(outputDir), ...env },
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        });

        expect(result.status, script).toBe(1);
        expect(result.stderr, script).toContain(message);
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("accepts gate-style BSC material inventory prover module aliases", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-alias-"));
    const routeReportPath = path.join(outputDir, "route-report.json");
    const reportDir = path.join(outputDir, "report");
    try {
      writeFileSync(
        routeReportPath,
        `${JSON.stringify({
          ready: false,
          routeId: "taira_bsc_xor",
          assetKey: "xor",
          checks: [],
        })}\n`,
      );

      const result = spawnSync(
        process.execPath,
        [
          "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
          "--allow-not-ready",
          "--scan-path",
          path.join(outputDir, "missing-scan-root"),
          "--route-report",
          routeReportPath,
          "--destination-prover-module-url",
          "/sccp-bsc/destination.js",
          "--source-prover-module-url",
          "/sccp-bsc/source.js",
          "--output-dir",
          reportDir,
        ],
        {
          cwd: repoRoot,
          env: helpEnv(outputDir),
          encoding: "utf8",
          maxBuffer: 1024 * 1024,
        },
      );

      expect(result.status).toBe(0);
      expect(result.stderr).toBe("");
      const report = JSON.parse(
        readFileSync(path.join(reportDir, "latest.json"), "utf8"),
      );
      expect(report.browserProvers.destination.module.moduleUrl).toBe(
        "/sccp-bsc/destination.js",
      );
      expect(report.browserProvers.source.module.moduleUrl).toBe(
        "/sccp-bsc/source.js",
      );
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("documents every parsed BSC CLI option in help", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-flags-"));
    try {
      for (const script of bscCliScripts) {
        const result = runHelp(script, outputDir);
        const optionsHelp = result.stdout.split("Environment:")[0] ?? "";

        expect(result.status, script).toBe(0);
        expect(result.stderr, script).toBe("");
        for (const flag of acceptedCliFlags(script)) {
          expect(optionsHelp, `${script} --${flag}`).toContain(`--${flag}`);
        }
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("documents profile-specific BSC prover environment variables for live gates", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-env-"));
    const scripts = [
      "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
      "scripts/e2e/sccp-bsc-production-gate.mjs",
    ];
    try {
      for (const script of scripts) {
        const result = runHelp(script, outputDir);

        expect(result.status, script).toBe(0);
        expect(result.stderr, script).toBe("");
        expect(result.stdout, script).toContain("Environment:");
        for (const entry of profileSpecificBscProverEnvVars) {
          expect(result.stdout, `${script} ${entry}`).toContain(entry);
        }
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("declares BSC prover gate environment variables in the renderer Vite shim", () => {
    const shim = readFileSync(
      path.join(repoRoot, "src/shims-modules.d.ts"),
      "utf8",
    );
    for (const entry of [
      "VITE_SCCP_BSC_NETWORK",
      ...profileSpecificBscProverEnvVars,
    ]) {
      expect(shim, entry).toContain(`readonly ${entry}?: string;`);
    }
  });

  it("documents local BSC prover sidecar environment variables for production gates", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-paths-"));
    const scripts = [
      "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
      "scripts/e2e/sccp-bsc-production-gate.mjs",
    ];
    const required = [
      "SCCP_BSC_PROVER_MANIFEST_PATH",
      "SCCP_BSC_SOURCE_PROVER_MANIFEST_PATH",
    ];
    try {
      for (const script of scripts) {
        const result = runHelp(script, outputDir);

        expect(result.status, script).toBe(0);
        expect(result.stderr, script).toBe("");
        expect(result.stdout, script).toContain("Environment:");
        expect(result.stdout, script).toContain("--destination-sidecar");
        expect(result.stdout, script).toContain("--source-sidecar");
        for (const entry of required) {
          expect(result.stdout, `${script} ${entry}`).toContain(entry);
        }
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });

  it("documents operational BSC gate environment variables", () => {
    const outputDir = mkdtempSync(path.join(tmpdir(), "sccp-bsc-help-ops-"));
    const cases = [
      {
        script: "scripts/e2e/sccp-bsc-route-manifest.mjs",
        required: ["SCCP_BSC_NETWORK", "VITE_SCCP_BSC_NETWORK"],
      },
      {
        script: "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_TAIRA_TORII_URL",
          "TAIRA_TORII_URL",
          "E2E_TORII_URL",
          "SCCP_BSC_ROUTE_MANIFEST_FILE",
          "SCCP_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_RPC_URL",
          "BSC_RPC_URL",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-prover-manifest.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_TAIRA_TORII_URL",
          "TAIRA_TORII_URL",
          "E2E_TORII_URL",
          "SCCP_BSC_ROUTE_MANIFEST_FILE",
          "SCCP_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_RPC_URL",
          "BSC_RPC_URL",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-route-preflight.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_TAIRA_TORII_URL",
          "SCCP_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_RPC_URL",
          "BSC_RPC_URL",
          "SCCP_BSC_PREFLIGHT_OUTPUT_DIR",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-live-smoke-readiness.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_TAIRA_TORII_URL",
          "TAIRA_TORII_URL",
          "E2E_TORII_URL",
          "SCCP_BSC_ROUTE_MANIFEST_FILE",
          "SCCP_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_PEER_AUDIT_REPORT",
          "SCCP_BSC_RPC_URL",
          "BSC_RPC_URL",
          "SCCP_BSC_SMOKE_READINESS_OUTPUT_DIR",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-peer-config-audit.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "SCCP_BSC_PEER_AUDIT_OUTPUT_DIR",
          "SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR",
          "SCCP_BSC_PEER_AUDIT_SSH_HOST",
          "SCCP_BSC_PEER_AUDIT_SSH_PASSWORD",
          "SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE",
          "SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE",
          "SCCP_BSC_PEER_AUDIT_REMOTE_DIR",
          "SCCP_BSC_PEER_AUDIT_SSH",
          "SCCP_BSC_PEER_AUDIT_SSHPASS",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-live-video.mjs",
        required: [
          "SCCP_BSC_VIDEO_OUTPUT_DIR",
          "SCCP_BSC_VIDEO_DURATION_MS",
          "SCCP_BSC_VIDEO_SKIP_PREFLIGHT",
          "SCCP_BSC_VIDEO_AUTO_EXPLORER",
          "SCCP_BSC_VIDEO_ALLOW_INCOMPLETE",
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_TAIRA_TORII_URL",
          "SCCP_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_RPC_URL",
          "BSC_RPC_URL",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
        required: [
          "SCCP_BSC_NETWORK",
          "VITE_SCCP_BSC_NETWORK",
          "SCCP_BSC_ROUTE_REPORT",
          "SCCP_BSC_MATERIAL_SCAN_PATHS",
          "SCCP_BSC_MATERIAL_INVENTORY_OUTPUT_DIR",
        ],
      },
      {
        script: "scripts/e2e/sccp-bsc-production-gate.mjs",
        required: [
          "SCCP_BSC_ROUTE_REPORT",
          "SCCP_BSC_PEER_AUDIT_REPORT",
          "SCCP_BSC_SMOKE_READINESS_REPORT",
          "SCCP_BSC_MATERIAL_INVENTORY_REPORT",
          "SCCP_BSC_VIDEO_TRANSCRIPT",
          "SCCP_BSC_PRODUCTION_GATE_REFRESH",
          "SCCP_BSC_ROUTE_MANIFEST_FILE",
          "SCCP_BSC_PEER_AUDIT_EXPECTED_PEERS",
          "SCCP_BSC_MATERIAL_SCAN_PATHS",
          "SCCP_BSC_PRODUCTION_GATE_MAX_AGE_MS",
          "SCCP_BSC_PRODUCTION_GATE_FUTURE_SKEW_MS",
          "SCCP_BSC_PRODUCTION_GATE_TIMEOUT_MS",
          "SCCP_BSC_PRODUCTION_GATE_OUTPUT_DIR",
        ],
      },
    ];
    try {
      for (const { script, required } of cases) {
        const result = runHelp(script, outputDir);

        expect(result.status, script).toBe(0);
        expect(result.stderr, script).toBe("");
        expect(result.stdout, script).toContain("Environment:");
        for (const entry of required) {
          expect(result.stdout, `${script} ${entry}`).toContain(entry);
        }
      }
      expect(readdirSync(outputDir)).toEqual([]);
    } finally {
      rmSync(outputDir, { recursive: true, force: true });
    }
  });
});
