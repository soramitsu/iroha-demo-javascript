#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SOLANA_TESTNET_RPC_URL,
  DEFAULT_TAIRA_TORII_URL,
  SCCP_SOLANA_XOR_ROUTE_ID,
  runSccpSolanaRoutePreflight,
} from "./sccp-solana-route-preflight.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-solana-production-gate",
);
const DEFAULT_DEPLOY_DIR = path.join(repoRoot, "output/sccp-solana-deploy");
const DEFAULT_LIVE_VIDEO_DIR = path.join(
  repoRoot,
  "output/sccp-solana-live-video",
);
const DEFAULT_REQUIREMENTS_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "taira-solana-xor-production-requirements.json",
);
const DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.json",
);
const DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.mp4",
);
const DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH = path.join(
  DEFAULT_DEPLOY_DIR,
  "sccp-solana-deployment-video.vtt",
);
const DEFAULT_LIVE_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.json",
);
const DEFAULT_LIVE_VIDEO_MP4_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.mp4",
);
const DEFAULT_LIVE_VIDEO_VTT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video.vtt",
);
const DEFAULT_BLOCKED_LIVE_VIDEO_TRANSCRIPT_PATH = path.join(
  DEFAULT_LIVE_VIDEO_DIR,
  "sccp-solana-live-video-blocked.json",
);
const REPORT_FILE = "sccp-solana-production-gate.json";

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const trimString = (value) => String(value ?? "").trim();

const readBoolArg = (value) => value === true || value === "true";

const makeCheck = (id, ok, detail, evidence = undefined) => {
  const check = {
    id,
    status: ok ? "pass" : "fail",
    detail,
  };
  if (evidence !== undefined) {
    check.evidence = evidence;
  }
  return check;
};

const failedChecks = (checks) =>
  checks.filter((check) => check.status !== "pass");

const readFirstRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (isRecord(value)) {
      return value;
    }
  }
  return null;
};

const readFirstArray = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (Array.isArray(value)) {
      return value;
    }
  }
  return [];
};

const readFirstString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const normalizePath = (file) => path.resolve(trimString(file));

const artifactFact = (artifactFacts, file) => {
  const normalized = normalizePath(file);
  return (
    artifactFacts[normalized] ?? {
      path: normalized,
      exists: false,
      size: 0,
    }
  );
};

const artifactExists = (artifactFacts, file) => {
  const fact = artifactFact(artifactFacts, file);
  return fact.exists === true && Number(fact.size) > 0;
};

const videoArtifactPaths = ({
  transcript,
  fallbackMp4Path,
  fallbackVttPath,
}) => {
  const artifacts = readFirstArray(
    transcript,
    "videoArtifacts",
    "video_artifacts",
  );
  const mp4 =
    artifacts
      .map((artifact) =>
        readFirstString(artifact, "path", "file", "filePath", "file_path"),
      )
      .find((file) => file.endsWith(".mp4")) || fallbackMp4Path;
  const vtt =
    artifacts
      .map((artifact) =>
        readFirstString(artifact, "path", "file", "filePath", "file_path"),
      )
      .find((file) => file.endsWith(".vtt")) || fallbackVttPath;
  return { mp4: normalizePath(mp4), vtt: normalizePath(vtt) };
};

const destinationAdmissionStatuses = (requirementsReport) =>
  readFirstArray(
    readFirstRecord(requirementsReport, "requirements") ?? {},
    "destinationProofAdmission",
    "destination_proof_admission",
  );

const statusIsPresent = (status) => status?.status === "present";

export const checkPublicPreflightReady = ({
  preflightReport,
  preflightReportPath = null,
} = {}) => {
  if (!isRecord(preflightReport)) {
    return makeCheck(
      "public-preflight-ready",
      false,
      "No public Solana route preflight report is available.",
      { reportPath: preflightReportPath },
    );
  }
  const failed = failedChecks(readFirstArray(preflightReport, "checks"));
  const ready =
    preflightReport.ready === true &&
    readFirstString(preflightReport, "routeId", "route_id") ===
      SCCP_SOLANA_XOR_ROUTE_ID &&
    preflightReport.manifestSource === "public" &&
    failed.length === 0;
  return makeCheck(
    "public-preflight-ready",
    ready,
    ready
      ? "Public TAIRA Solana route preflight is ready."
      : "Public TAIRA Solana route preflight is not ready.",
    {
      reportPath: preflightReportPath,
      ready: preflightReport.ready === true,
      manifestSource: preflightReport.manifestSource ?? null,
      failedChecks: failed.map((check) => ({
        id: check.id,
        detail: check.detail,
      })),
    },
  );
};

export const checkProductionRequirementsReady = ({
  requirementsReport,
  requirementsPath = null,
} = {}) => {
  if (!isRecord(requirementsReport)) {
    return makeCheck(
      "production-requirements-ready",
      false,
      "No Solana production requirements report is available.",
      { requirementsPath },
    );
  }
  const blockers = readFirstArray(requirementsReport, "blockers");
  const ready =
    requirementsReport.readyToBuildIsi === true && blockers.length === 0;
  return makeCheck(
    "production-requirements-ready",
    ready,
    ready
      ? "Production Solana route material is ready to build the TAIRA manifest ISI."
      : "Production Solana route material is incomplete.",
    {
      requirementsPath,
      readyToBuildIsi: requirementsReport.readyToBuildIsi === true,
      readyToSubmitWithCurrentRuntime:
        requirementsReport.readyToSubmitWithCurrentRuntime === true,
      blockers,
    },
  );
};

export const checkDestinationProofAdmissionReady = ({
  requirementsReport,
  requirementsPath = null,
} = {}) => {
  const statuses = destinationAdmissionStatuses(requirementsReport);
  if (statuses.length === 0) {
    return makeCheck(
      "destination-proof-admission",
      false,
      "Solana destination proof admission requirements are missing.",
      { requirementsPath },
    );
  }
  const missingOrInvalid = statuses.filter(
    (status) => !statusIsPresent(status),
  );
  return makeCheck(
    "destination-proof-admission",
    missingOrInvalid.length === 0,
    missingOrInvalid.length === 0
      ? "Solana destination proof admission is governed and production-safe."
      : "Solana destination proof admission is not production-safe.",
    {
      requirementsPath,
      missingOrInvalid: missingOrInvalid.map((status) => ({
        key: status.key,
        status: status.status ?? null,
        value: status.value ?? null,
      })),
    },
  );
};

export const checkDeploymentVideoPresent = ({
  deploymentVideoTranscript,
  deploymentVideoTranscriptPath = null,
  deploymentVideoMp4Path = DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  deploymentVideoVttPath = DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  artifactFacts = {},
} = {}) => {
  if (!isRecord(deploymentVideoTranscript)) {
    return makeCheck(
      "deployment-video-present",
      false,
      "No Solana deployment video transcript is available.",
      { transcriptPath: deploymentVideoTranscriptPath },
    );
  }
  const paths = videoArtifactPaths({
    transcript: deploymentVideoTranscript,
    fallbackMp4Path: deploymentVideoMp4Path,
    fallbackVttPath: deploymentVideoVttPath,
  });
  const schemaOk =
    deploymentVideoTranscript.schema ===
    "iroha-demo-sccp-solana-deployment-video/v1";
  const routeOk =
    readFirstString(deploymentVideoTranscript, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const mp4Ok = artifactExists(artifactFacts, paths.mp4);
  const vttOk = artifactExists(artifactFacts, paths.vtt);
  const ok = schemaOk && routeOk && mp4Ok && vttOk;
  return makeCheck(
    "deployment-video-present",
    ok,
    ok
      ? "Solana deployment MP4 and subtitle artifacts are present."
      : "Solana deployment MP4 or subtitle artifacts are missing or invalid.",
    {
      transcriptPath: deploymentVideoTranscriptPath,
      schemaOk,
      routeOk,
      mp4: artifactFact(artifactFacts, paths.mp4),
      vtt: artifactFact(artifactFacts, paths.vtt),
    },
  );
};

export const checkDeploymentVideoHonestStatus = ({
  deploymentVideoTranscript,
  publicPreflightReady,
  productionRequirementsReady,
  liveVideoReady,
} = {}) => {
  if (!isRecord(deploymentVideoTranscript)) {
    return makeCheck(
      "deployment-video-honest-status",
      false,
      "No Solana deployment video transcript is available.",
    );
  }
  const claimsReady = deploymentVideoTranscript.ready === true;
  const completionReady =
    publicPreflightReady && productionRequirementsReady && liveVideoReady;
  const ok = !claimsReady || completionReady;
  return makeCheck(
    "deployment-video-honest-status",
    ok,
    ok
      ? "Solana deployment video status does not claim completed production transfer evidence prematurely."
      : "Solana deployment video claims ready before the production gate is ready.",
    {
      transcriptReady: claimsReady,
      publicPreflightReady,
      productionRequirementsReady,
      liveVideoReady,
    },
  );
};

export const checkLiveBidirectionalVideo = ({
  liveVideoTranscript,
  liveVideoTranscriptPath = null,
  liveVideoMp4Path = DEFAULT_LIVE_VIDEO_MP4_PATH,
  liveVideoVttPath = DEFAULT_LIVE_VIDEO_VTT_PATH,
  blockedLiveVideoTranscript = null,
  blockedLiveVideoTranscriptPath = null,
  artifactFacts = {},
} = {}) => {
  if (!isRecord(liveVideoTranscript)) {
    return makeCheck(
      "live-bidirectional-video",
      false,
      "No completed Solana bidirectional live-video transcript is available.",
      {
        transcriptPath: liveVideoTranscriptPath,
        blockedTranscriptPath: blockedLiveVideoTranscriptPath,
        blockedReason: isRecord(blockedLiveVideoTranscript)
          ? readFirstString(blockedLiveVideoTranscript, "reason")
          : null,
      },
    );
  }
  const paths = videoArtifactPaths({
    transcript: liveVideoTranscript,
    fallbackMp4Path: liveVideoMp4Path,
    fallbackVttPath: liveVideoVttPath,
  });
  const liveEvidence = readFirstRecord(liveVideoTranscript, "liveEvidence");
  const forward = readFirstRecord(
    liveEvidence,
    "tairaToSolana",
    "taira_to_solana",
  );
  const reverse = readFirstRecord(
    liveEvidence,
    "solanaToTaira",
    "solana_to_taira",
  );
  const schemaOk =
    liveVideoTranscript.schema === "iroha-demo-sccp-solana-live-video/v1";
  const routeOk =
    readFirstString(liveVideoTranscript, "routeId", "route_id") ===
    SCCP_SOLANA_XOR_ROUTE_ID;
  const readyOk =
    liveVideoTranscript.ready === true &&
    liveVideoTranscript.preflightReady === true;
  const evidenceOk = Boolean(forward && reverse);
  const mp4Ok = artifactExists(artifactFacts, paths.mp4);
  const vttOk = artifactExists(artifactFacts, paths.vtt);
  const ok = schemaOk && routeOk && readyOk && evidenceOk && mp4Ok && vttOk;
  return makeCheck(
    "live-bidirectional-video",
    ok,
    ok
      ? "Solana bidirectional SCCP live MP4 and subtitles are present."
      : "Solana bidirectional SCCP live video evidence is missing or incomplete.",
    {
      transcriptPath: liveVideoTranscriptPath,
      schemaOk,
      routeOk,
      readyOk,
      evidenceOk,
      mp4: artifactFact(artifactFacts, paths.mp4),
      vtt: artifactFact(artifactFacts, paths.vtt),
    },
  );
};

export const buildSolanaProductionGateReport = ({
  preflightReport = null,
  preflightReportPath = null,
  requirementsReport = null,
  requirementsPath = null,
  deploymentVideoTranscript = null,
  deploymentVideoTranscriptPath = null,
  deploymentVideoMp4Path = DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  deploymentVideoVttPath = DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  liveVideoTranscript = null,
  liveVideoTranscriptPath = null,
  liveVideoMp4Path = DEFAULT_LIVE_VIDEO_MP4_PATH,
  liveVideoVttPath = DEFAULT_LIVE_VIDEO_VTT_PATH,
  blockedLiveVideoTranscript = null,
  blockedLiveVideoTranscriptPath = null,
  artifactFacts = {},
  checkedAt = new Date().toISOString(),
} = {}) => {
  const publicPreflight = checkPublicPreflightReady({
    preflightReport,
    preflightReportPath,
  });
  const productionRequirements = checkProductionRequirementsReady({
    requirementsReport,
    requirementsPath,
  });
  const destinationProofAdmission = checkDestinationProofAdmissionReady({
    requirementsReport,
    requirementsPath,
  });
  const deploymentVideo = checkDeploymentVideoPresent({
    deploymentVideoTranscript,
    deploymentVideoTranscriptPath,
    deploymentVideoMp4Path,
    deploymentVideoVttPath,
    artifactFacts,
  });
  const liveVideo = checkLiveBidirectionalVideo({
    liveVideoTranscript,
    liveVideoTranscriptPath,
    liveVideoMp4Path,
    liveVideoVttPath,
    blockedLiveVideoTranscript,
    blockedLiveVideoTranscriptPath,
    artifactFacts,
  });
  const deploymentVideoStatus = checkDeploymentVideoHonestStatus({
    deploymentVideoTranscript,
    publicPreflightReady: publicPreflight.status === "pass",
    productionRequirementsReady: productionRequirements.status === "pass",
    liveVideoReady: liveVideo.status === "pass",
  });
  const checks = [
    publicPreflight,
    productionRequirements,
    destinationProofAdmission,
    deploymentVideo,
    deploymentVideoStatus,
    liveVideo,
  ];
  const ready = checks.every((check) => check.status === "pass");
  return {
    schema: "iroha-demo-sccp-solana-production-gate/v1",
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    ready,
    checkedAt,
    checks,
    artifacts: {
      preflightReportPath,
      requirementsPath,
      deploymentVideoTranscriptPath,
      liveVideoTranscriptPath,
      blockedLiveVideoTranscriptPath,
    },
    nextRequiredActions: ready
      ? []
      : [
          "Publish a production-ready public TAIRA taira_sol_xor manifest.",
          "Replace envelope-recorder Solana admission with governed-zk-verifier-v1 proof admission.",
          "Publish governed Solana source proof packages and post-deploy live evidence.",
          "Record a real bidirectional TAIRA <-> Solana SCCP MP4 after public preflight passes.",
        ],
  };
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (!raw.startsWith("--")) {
      throw new Error(`Unexpected argument ${raw}`);
    }
    const key = raw.slice(2);
    if (
      key === "help" ||
      key === "allow-incomplete" ||
      key === "skip-solana-rpc"
    ) {
      const value = argv[index + 1];
      if (value && !value.startsWith("--")) {
        args[key] = value;
        index += 1;
      } else {
        args[key] = true;
      }
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`--${key} requires a value.`);
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-production-gate.mjs [options]

Read-only production completion gate for TAIRA <-> Solana SCCP.

Options:
  --torii-url URL                         TAIRA Torii endpoint (default: ${DEFAULT_TAIRA_TORII_URL})
  --solana-rpc-url URL                    Solana testnet RPC endpoint (default: ${DEFAULT_SOLANA_TESTNET_RPC_URL})
  --preflight-report PATH                 Reuse an existing public preflight report instead of fetching
  --requirements PATH                     Production requirements report
  --deployment-video-transcript PATH      Deployment video transcript JSON
  --deployment-video-mp4 PATH             Deployment MP4 path
  --deployment-video-vtt PATH             Deployment subtitle VTT path
  --live-video-transcript PATH            Completed bidirectional live-video transcript JSON
  --live-video-mp4 PATH                   Completed bidirectional live MP4 path
  --live-video-vtt PATH                   Completed bidirectional live subtitle VTT path
  --blocked-live-video-transcript PATH    Blocked live-video transcript JSON for diagnostics
  --output-dir PATH                       Report directory (default: output/sccp-solana-production-gate)
  --allow-incomplete [true|false]         Write report and exit 0 even when incomplete
  --skip-solana-rpc [true|false]          Skip Solana RPC health checks in generated preflight
  --help                                  Show this help
`);
};

const readJsonIfExists = async (file) => {
  if (!file) {
    return null;
  }
  const resolved = normalizePath(file);
  if (!existsSync(resolved)) {
    return null;
  }
  return JSON.parse(await readFile(resolved, "utf8"));
};

const collectArtifactFacts = async (pathsToCheck) => {
  const facts = {};
  for (const file of pathsToCheck) {
    if (!file) {
      continue;
    }
    const resolved = normalizePath(file);
    try {
      const info = await stat(resolved);
      facts[resolved] = {
        path: resolved,
        exists: info.isFile(),
        size: info.size,
      };
    } catch {
      facts[resolved] = {
        path: resolved,
        exists: false,
        size: 0,
      };
    }
  }
  return facts;
};

const collectVideoPaths = ({
  deploymentVideoTranscript,
  deploymentVideoMp4Path,
  deploymentVideoVttPath,
  liveVideoTranscript,
  liveVideoMp4Path,
  liveVideoVttPath,
}) => {
  const deploymentPaths = videoArtifactPaths({
    transcript: deploymentVideoTranscript,
    fallbackMp4Path: deploymentVideoMp4Path,
    fallbackVttPath: deploymentVideoVttPath,
  });
  const livePaths = videoArtifactPaths({
    transcript: liveVideoTranscript,
    fallbackMp4Path: liveVideoMp4Path,
    fallbackVttPath: liveVideoVttPath,
  });
  return [
    deploymentPaths.mp4,
    deploymentPaths.vtt,
    livePaths.mp4,
    livePaths.vtt,
  ];
};

export const runSccpSolanaProductionGate = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const requirementsPath = path.resolve(
    options.requirements || DEFAULT_REQUIREMENTS_PATH,
  );
  const deploymentVideoTranscriptPath = path.resolve(
    options.deploymentVideoTranscript ||
      DEFAULT_DEPLOYMENT_VIDEO_TRANSCRIPT_PATH,
  );
  const deploymentVideoMp4Path = path.resolve(
    options.deploymentVideoMp4 || DEFAULT_DEPLOYMENT_VIDEO_MP4_PATH,
  );
  const deploymentVideoVttPath = path.resolve(
    options.deploymentVideoVtt || DEFAULT_DEPLOYMENT_VIDEO_VTT_PATH,
  );
  const liveVideoTranscriptPath = path.resolve(
    options.liveVideoTranscript || DEFAULT_LIVE_VIDEO_TRANSCRIPT_PATH,
  );
  const liveVideoMp4Path = path.resolve(
    options.liveVideoMp4 || DEFAULT_LIVE_VIDEO_MP4_PATH,
  );
  const liveVideoVttPath = path.resolve(
    options.liveVideoVtt || DEFAULT_LIVE_VIDEO_VTT_PATH,
  );
  const blockedLiveVideoTranscriptPath = path.resolve(
    options.blockedLiveVideoTranscript ||
      DEFAULT_BLOCKED_LIVE_VIDEO_TRANSCRIPT_PATH,
  );

  let preflightReportPath = options.preflightReport
    ? path.resolve(options.preflightReport)
    : null;
  let preflightReport;
  if (preflightReportPath) {
    preflightReport = await readJsonIfExists(preflightReportPath);
  } else {
    const preflight = await runSccpSolanaRoutePreflight({
      toriiUrl: options.toriiUrl,
      solanaRpcUrl: options.solanaRpcUrl,
      outputDir: path.join(outputDir, "preflight"),
      skipSolanaRpc: options.skipSolanaRpc,
    });
    preflightReport = preflight.report;
    preflightReportPath = preflight.reportPath;
  }

  const requirementsReport = await readJsonIfExists(requirementsPath);
  const deploymentVideoTranscript = await readJsonIfExists(
    deploymentVideoTranscriptPath,
  );
  const liveVideoTranscript = await readJsonIfExists(liveVideoTranscriptPath);
  const blockedLiveVideoTranscript = await readJsonIfExists(
    blockedLiveVideoTranscriptPath,
  );
  const artifactFacts = await collectArtifactFacts(
    collectVideoPaths({
      deploymentVideoTranscript,
      deploymentVideoMp4Path,
      deploymentVideoVttPath,
      liveVideoTranscript,
      liveVideoMp4Path,
      liveVideoVttPath,
    }),
  );

  const report = buildSolanaProductionGateReport({
    preflightReport,
    preflightReportPath,
    requirementsReport,
    requirementsPath,
    deploymentVideoTranscript,
    deploymentVideoTranscriptPath,
    deploymentVideoMp4Path,
    deploymentVideoVttPath,
    liveVideoTranscript,
    liveVideoTranscriptPath,
    liveVideoMp4Path,
    liveVideoVttPath,
    blockedLiveVideoTranscript,
    blockedLiveVideoTranscriptPath,
    artifactFacts,
  });
  await mkdir(outputDir, { recursive: true });
  const reportPath = path.join(outputDir, REPORT_FILE);
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { report, reportPath };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const { report, reportPath } = await runSccpSolanaProductionGate({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    preflightReport: args["preflight-report"],
    requirements: args.requirements,
    deploymentVideoTranscript: args["deployment-video-transcript"],
    deploymentVideoMp4: args["deployment-video-mp4"],
    deploymentVideoVtt: args["deployment-video-vtt"],
    liveVideoTranscript: args["live-video-transcript"],
    liveVideoMp4: args["live-video-mp4"],
    liveVideoVtt: args["live-video-vtt"],
    blockedLiveVideoTranscript: args["blocked-live-video-transcript"],
    outputDir: args["output-dir"],
    skipSolanaRpc: readBoolArg(args["skip-solana-rpc"]),
  });
  console.log(`Solana SCCP production gate report: ${reportPath}`);
  if (!report.ready) {
    console.error(
      failedChecks(report.checks)
        .map((check) => `- ${check.id}: ${check.detail}`)
        .join("\n"),
    );
    if (!readBoolArg(args["allow-incomplete"])) {
      process.exitCode = 1;
    }
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.stack || error.message : error,
    );
    process.exitCode = 1;
  });
}
