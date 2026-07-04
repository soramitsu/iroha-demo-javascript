import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildSolanaProductionGateReport } from "../scripts/e2e/sccp-solana-production-gate.mjs";

const artifactFacts = (...files) =>
  Object.fromEntries(
    files.map((file) => [
      path.resolve(file),
      { path: path.resolve(file), exists: true, size: 1024 },
    ]),
  );

const deploymentVideoTranscript = ({ ready = false } = {}) => ({
  schema: "iroha-demo-sccp-solana-deployment-video/v1",
  routeId: "taira_sol_xor",
  ready,
  videoArtifacts: [
    { path: "/tmp/sccp-solana-deployment-video.mp4", mediaType: "video/mp4" },
    { path: "/tmp/sccp-solana-deployment-video.vtt", mediaType: "text/vtt" },
  ],
});

const liveVideoTranscript = () => ({
  schema: "iroha-demo-sccp-solana-live-video/v1",
  routeId: "taira_sol_xor",
  ready: true,
  preflightReady: true,
  liveEvidence: {
    tairaToSolana: { messageId: `0x${"11".repeat(32)}` },
    solanaToTaira: { tairaSettlementTx: `0x${"22".repeat(32)}` },
  },
  videoArtifacts: [
    { path: "/tmp/sccp-solana-live-video.mp4", mediaType: "video/mp4" },
    { path: "/tmp/sccp-solana-live-video.vtt", mediaType: "text/vtt" },
  ],
});

const readyPreflightReport = () => ({
  schema: "iroha-demo-sccp-solana-route-preflight/v1",
  routeId: "taira_sol_xor",
  ready: true,
  manifestSource: "public",
  checks: [{ id: "public-route-publication", status: "pass", detail: "ok" }],
});

const readyRequirementsReport = () => ({
  schema: "iroha-demo-sccp-solana-production-requirements/v1",
  routeId: "taira_sol_xor",
  readyToBuildIsi: true,
  readyToSubmitWithCurrentRuntime: false,
  blockers: [],
  requirements: {
    destinationProofAdmission: [
      { key: "admissionMode", status: "present" },
      { key: "proofSystem", status: "present" },
      { key: "entrypoint", status: "present" },
      { key: "verifierCodeHash", status: "present" },
      { key: "verifierKeyHash", status: "present" },
      { key: "destinationBindingHash", status: "present" },
      { key: "shapeOnly", status: "present", value: false },
      { key: "acceptsUnverifiedProofs", status: "present", value: false },
    ],
  },
});

const failedIds = (report) =>
  report.checks
    .filter((check) => check.status !== "pass")
    .map((check) => check.id);

describe("Solana SCCP production gate", () => {
  it("fails closed with the current incomplete public rollout evidence", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: {
        routeId: "taira_sol_xor",
        ready: false,
        manifestSource: "public",
        checks: [
          {
            id: "route-manifest-shape",
            status: "fail",
            detail: "No taira_sol_xor manifest.",
          },
        ],
      },
      requirementsReport: {
        readyToBuildIsi: false,
        blockers: [{ id: "destination-proof-admission" }],
        requirements: {
          destinationProofAdmission: [
            { key: "admissionMode", status: "invalid" },
            { key: "shapeOnly", status: "invalid", value: true },
          ],
        },
      },
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: null,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual([
      "public-preflight-ready",
      "production-requirements-ready",
      "destination-proof-admission",
      "live-bidirectional-video",
    ]);
    expect(
      report.checks.find((check) => check.id === "deployment-video-present")
        ?.status,
    ).toBe("pass");
  });

  it("passes only when public preflight, production material, deployment video, and live video are all ready", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(true);
    expect(failedIds(report)).toEqual([]);
  });

  it("rejects a deployment transcript that claims readiness before live proof is complete", () => {
    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: readyRequirementsReport(),
      deploymentVideoTranscript: deploymentVideoTranscript({ ready: true }),
      liveVideoTranscript: null,
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toContain("deployment-video-honest-status");
    expect(failedIds(report)).toContain("live-bidirectional-video");
  });

  it("does not trust a requirements report with invalid destination proof admission statuses", () => {
    const requirements = readyRequirementsReport();
    requirements.requirements.destinationProofAdmission = [
      {
        key: "admissionMode",
        status: "invalid",
        value: "envelope-recorder-v1",
      },
      { key: "shapeOnly", status: "invalid", value: true },
    ];

    const report = buildSolanaProductionGateReport({
      preflightReport: readyPreflightReport(),
      requirementsReport: requirements,
      deploymentVideoTranscript: deploymentVideoTranscript(),
      liveVideoTranscript: liveVideoTranscript(),
      artifactFacts: artifactFacts(
        "/tmp/sccp-solana-deployment-video.mp4",
        "/tmp/sccp-solana-deployment-video.vtt",
        "/tmp/sccp-solana-live-video.mp4",
        "/tmp/sccp-solana-live-video.vtt",
      ),
    });

    expect(report.ready).toBe(false);
    expect(failedIds(report)).toEqual(["destination-proof-admission"]);
  });
});
