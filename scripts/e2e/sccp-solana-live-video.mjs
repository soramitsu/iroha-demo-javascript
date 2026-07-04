#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runSccpSolanaRoutePreflight } from "./sccp-solana-route-preflight.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const DEFAULT_OUTPUT_DIR = path.join(repoRoot, "output/sccp-solana-live-video");
const SOLANA_SIGNATURE = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/u;
const HEX32 = /^(?:0x)?[0-9a-f]{64}$/iu;

const commandExists = (command) =>
  spawnSync("sh", ["-c", `command -v ${command}`], {
    encoding: "utf8",
  }).status === 0;

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
      args[key] = true;
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
  console.log(`Usage: node scripts/e2e/sccp-solana-live-video.mjs [options]

Strict live-video gate for TAIRA <-> Solana testnet SCCP.

This command refuses to record an MP4 unless a real public TAIRA Solana
testnet route is preflight-ready and Solana wallet/proof execution is available
in the app. It never creates a fake success video.

Options:
  --torii-url URL        TAIRA Torii endpoint
  --solana-rpc-url URL   Solana testnet RPC endpoint
  --live-evidence PATH   JSON evidence from completed real bidirectional transfers
  --output-dir PATH      Output directory (default: output/sccp-solana-live-video)
  --allow-incomplete     Write blocked transcript/subtitles and exit 0
  --skip-solana-rpc      Skip Solana RPC health check during preflight
  --help                 Show this help
`);
};

const writeBlockedArtifacts = async ({
  outputDir,
  preflightReport,
  reason,
}) => {
  await mkdir(outputDir, { recursive: true });
  const transcript = {
    schema: "iroha-demo-sccp-solana-live-video-blocked/v1",
    ready: false,
    routeId: "taira_sol_xor",
    checkedAt: new Date().toISOString(),
    reason,
    preflightReady: preflightReport.ready,
    failedChecks: preflightReport.checks.filter(
      (check) => check.status !== "pass",
    ),
    requiredRealSteps: [
      "TAIRA public endpoint publishes a production-ready taira_sol_xor Solana testnet manifest.",
      "Solana testnet bridge/token/source/verifier programs and TAIRA burn-record material pass preflight.",
      "A connected Solana testnet wallet approves the destination finalize transaction.",
      "A real TAIRA -> Solana transfer and a real Solana -> TAIRA transfer complete with validated transaction links.",
    ],
    videoArtifacts: [],
  };
  const subtitleText = `WEBVTT

00:00.000 --> 00:05.000
Solana SCCP live video blocked before recording.

00:05.000 --> 00:10.000
TAIRA preflight did not prove a production-ready taira_sol_xor Solana testnet route.

00:10.000 --> 00:16.000
No MP4 was generated because the run must not fake deployment or transaction evidence.

00:16.000 --> 00:22.000
Publish the real route manifest and enable Solana wallet/proof execution, then rerun this command.
`;
  const transcriptPath = path.join(
    outputDir,
    "sccp-solana-live-video-blocked.json",
  );
  const subtitlesPath = path.join(
    outputDir,
    "sccp-solana-live-video-blocked.vtt",
  );
  await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  await writeFile(subtitlesPath, subtitleText);
  return { transcriptPath, subtitlesPath };
};

const readString = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const readRecord = (record, ...keys) => {
  for (const key of keys) {
    const value = record?.[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value;
    }
  }
  return null;
};

const normalizeHex32 = (value, label) => {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^0x/iu, "")
    .toLowerCase();
  if (!HEX32.test(normalized)) {
    throw new Error(`${label} must be a 32-byte transaction/message hash.`);
  }
  return normalized;
};

const normalizeSolanaSignature = (value, label) => {
  const normalized = String(value ?? "").trim();
  if (!SOLANA_SIGNATURE.test(normalized)) {
    throw new Error(`${label} must be a Solana transaction signature.`);
  }
  return normalized;
};

const normalizeUrl = (value, label) => {
  const normalized = String(value ?? "").trim();
  const url = new URL(normalized);
  if (url.protocol !== "https:") {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
  return url.toString();
};

const loadLiveEvidence = async (file) => {
  if (!file) {
    throw new Error(
      "--live-evidence is required after route preflight passes.",
    );
  }
  const liveEvidencePath = path.resolve(file);
  const evidence = JSON.parse(await readFile(liveEvidencePath, "utf8"));
  if (
    readString(evidence, "routeId", "route_id", "route") !== "taira_sol_xor"
  ) {
    throw new Error("live evidence routeId must be taira_sol_xor.");
  }
  const forward = readRecord(evidence, "tairaToSolana", "taira_to_solana");
  const reverse = readRecord(evidence, "solanaToTaira", "solana_to_taira");
  if (!forward || !reverse) {
    throw new Error(
      "live evidence must include both tairaToSolana and solanaToTaira records.",
    );
  }
  const normalized = {
    schema: "iroha-demo-sccp-solana-live-transfer-evidence/v1",
    routeId: "taira_sol_xor",
    evidencePath: liveEvidencePath,
    checkedAt: new Date().toISOString(),
    tairaToSolana: {
      amount: readString(forward, "amount", "amountXor", "amount_xor"),
      messageId: normalizeHex32(
        readString(forward, "messageId", "message_id"),
        "tairaToSolana.messageId",
      ),
      tairaSourceTx: normalizeHex32(
        readString(forward, "tairaSourceTx", "taira_source_tx", "sourceTx"),
        "tairaToSolana.tairaSourceTx",
      ),
      solanaTxId: normalizeSolanaSignature(
        readString(forward, "solanaTxId", "solana_tx_id", "signature", "txId"),
        "tairaToSolana.solanaTxId",
      ),
      solanaExplorerUrl: normalizeUrl(
        readString(forward, "solanaExplorerUrl", "solana_explorer_url"),
        "tairaToSolana.solanaExplorerUrl",
      ),
    },
    solanaToTaira: {
      amount: readString(reverse, "amount", "amountXor", "amount_xor"),
      solanaSourceTx: normalizeSolanaSignature(
        readString(
          reverse,
          "solanaSourceTx",
          "solana_source_tx",
          "signature",
          "txId",
        ),
        "solanaToTaira.solanaSourceTx",
      ),
      tairaSettlementTx: normalizeHex32(
        readString(
          reverse,
          "tairaSettlementTx",
          "taira_settlement_tx",
          "settlementTx",
        ),
        "solanaToTaira.tairaSettlementTx",
      ),
      tairaExplorerUrl: normalizeUrl(
        readString(reverse, "tairaExplorerUrl", "taira_explorer_url"),
        "solanaToTaira.tairaExplorerUrl",
      ),
    },
  };
  return normalized;
};

const writeSuccessfulArtifacts = async ({
  outputDir,
  preflightReport,
  liveEvidence,
}) => {
  await mkdir(outputDir, { recursive: true });
  const transcript = {
    schema: "iroha-demo-sccp-solana-live-video/v1",
    ready: true,
    routeId: "taira_sol_xor",
    checkedAt: new Date().toISOString(),
    preflightReady: preflightReport.ready,
    liveEvidence,
  };
  const subtitleText = `WEBVTT

00:00.000 --> 00:05.000
Step 1: Public TAIRA published a production-ready taira_sol_xor manifest and the route preflight passed.

00:05.000 --> 00:10.000
Step 2: The TAIRA wallet submitted the burn-record SCCP message ${liveEvidence.tairaToSolana.messageId}.

00:10.000 --> 00:15.000
Step 3: The connected Solana wallet approved finalize on testnet transaction ${liveEvidence.tairaToSolana.solanaTxId}.

00:15.000 --> 00:20.000
Step 4: The Solana wallet submitted the return burn transaction ${liveEvidence.solanaToTaira.solanaSourceTx}.

00:20.000 --> 00:25.000
Step 5: TAIRA accepted the bound Solana source proof in settlement transaction ${liveEvidence.solanaToTaira.tairaSettlementTx}.
`;
  const transcriptPath = path.join(outputDir, "sccp-solana-live-video.json");
  const subtitlesPath = path.join(outputDir, "sccp-solana-live-video.vtt");
  const videoPath = path.join(outputDir, "sccp-solana-live-video.mp4");
  await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  await writeFile(subtitlesPath, subtitleText);
  if (!commandExists("ffmpeg")) {
    throw new Error("ffmpeg is required to render the Solana SCCP MP4.");
  }
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x111827:s=1280x720:r=30:d=25",
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=48000",
      "-i",
      subtitlesPath,
      "-shortest",
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-map",
      "2:s:0",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-c:s",
      "mov_text",
      videoPath,
    ],
    { encoding: "utf8" },
  );
  if (ffmpeg.status !== 0) {
    throw new Error(
      `ffmpeg failed to render Solana SCCP MP4: ${ffmpeg.stderr || ffmpeg.stdout}`,
    );
  }
  transcript.videoArtifacts = [
    { path: videoPath, mediaType: "video/mp4" },
    { path: subtitlesPath, mediaType: "text/vtt" },
  ];
  await writeFile(transcriptPath, `${JSON.stringify(transcript, null, 2)}\n`);
  return { transcriptPath, subtitlesPath, videoPath };
};

export const runSccpSolanaLiveVideoGate = async (options = {}) => {
  const outputDir = path.resolve(options.outputDir || DEFAULT_OUTPUT_DIR);
  const { report: preflightReport, reportPath } =
    await runSccpSolanaRoutePreflight({
      toriiUrl: options.toriiUrl,
      solanaRpcUrl: options.solanaRpcUrl,
      outputDir: path.join(outputDir, "preflight"),
      skipSolanaRpc: options.skipSolanaRpc,
    });
  if (!preflightReport.ready) {
    const reason =
      "Solana SCCP live video blocked: public TAIRA Solana route preflight is not ready.";
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
    });
    return {
      ready: false,
      reason,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  let liveEvidence;
  try {
    liveEvidence = await loadLiveEvidence(options.liveEvidence);
  } catch (error) {
    const reason = `Solana SCCP live video blocked: ${
      error instanceof Error ? error.message : String(error)
    }`;
    const blocked = await writeBlockedArtifacts({
      outputDir,
      preflightReport,
      reason,
    });
    return {
      ready: false,
      reason,
      preflightReportPath: reportPath,
      ...blocked,
    };
  }
  const artifacts = await writeSuccessfulArtifacts({
    outputDir,
    preflightReport,
    liveEvidence,
  });
  return {
    ready: true,
    reason: "Solana SCCP live video generated from validated live evidence.",
    preflightReportPath: reportPath,
    ...artifacts,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const result = await runSccpSolanaLiveVideoGate({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    liveEvidence: args["live-evidence"],
    outputDir: args["output-dir"],
    skipSolanaRpc: args["skip-solana-rpc"],
  });
  console.log(`Solana SCCP video gate report: ${result.transcriptPath}`);
  console.log(`Solana SCCP video subtitles: ${result.subtitlesPath}`);
  if (result.videoPath) {
    console.log(`Solana SCCP MP4: ${result.videoPath}`);
  }
  console.log(`Solana SCCP preflight report: ${result.preflightReportPath}`);
  if (!result.ready) {
    console.error(result.reason);
    if (!args["allow-incomplete"]) {
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
