#!/usr/bin/env node
/* global globalThis */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TAIRA_TORII_URL,
  DEFAULT_TRON_GATEWAY_URL,
  SCCP_XOR_ASSET_KEY,
  SCCP_XOR_ROUTE_ID,
  isValidTronBase58CheckAddress,
  resolveSccpTronNetworkProfile,
  normalizeToriiEndpoint,
  normalizeTronGatewayEndpoint,
  runSccpRoutePreflight,
} from "./sccp-route-preflight.mjs";

export const WALLETCONNECT_PROJECT_ID_ENV = "VITE_WALLETCONNECT_PROJECT_ID";
export const SCCP_TRON_NILE_TEST_SIGNER_ENV = "SCCP_TRON_NILE_TEST_SIGNER";
export const SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV =
  "SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE";
export const SCCP_TRON_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_TRON_PROVER_MODULE_URL";
export const SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL";

export const SCCP_LIVE_SMOKE_STEPS = Object.freeze([
  "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
  "Connect a wallet for the selected TRON network through WalletConnect/AppKit, or use the explicit Nile-only Electron test signer for this test run.",
  "Run one tiny TAIRA -> TRON bridge transfer and verify the TRON finalize transaction link.",
  "Run one tiny TRON -> TAIRA bridge transfer and verify the TAIRA finalize_inbound transaction link.",
]);

const trimString = (value) => String(value ?? "").trim();

const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(trimString(value).toLowerCase());

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const PUBLIC_ROUTE_DEPLOYMENT_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
  "networkIdHex",
  "settlementAssetDefinitionId",
]);

const PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS = Object.freeze([
  "sourceBridgeConfigHash",
  "sourceEventTransactionId",
  "routeCanaryEvidenceHash",
  "routeCanaryTransactionId",
]);

const readPublicDeploymentString = (deployment, key) => {
  if (!isRecord(deployment)) {
    return null;
  }
  const value = deployment[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};

const publicRouteDeployment = (deployment) => {
  if (!isRecord(deployment)) {
    return null;
  }
  return Object.fromEntries(
    PUBLIC_ROUTE_DEPLOYMENT_FIELDS.map((key) => [
      key,
      readPublicDeploymentString(deployment, key),
    ]),
  );
};

const readPublicEvidenceString = (evidence, key) => {
  if (!isRecord(evidence)) {
    return null;
  }
  const value = evidence[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
};

const isNonZeroHex32 = (value) =>
  typeof value === "string" &&
  /^0x[0-9a-f]{64}$/u.test(value) &&
  !/^0x0{64}$/u.test(value);

const publicPostDeployLiveEvidence = (evidence) => {
  if (!isRecord(evidence)) {
    return null;
  }
  return {
    fullTomlReady: evidence.fullTomlReady === true,
    ...Object.fromEntries(
      PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS.map((key) => [
        key,
        readPublicEvidenceString(evidence, key),
      ]),
    ),
    ...(readPublicEvidenceString(evidence, "offlineFullTomlSha256")
      ? {
          offlineFullTomlSha256: readPublicEvidenceString(
            evidence,
            "offlineFullTomlSha256",
          ),
        }
      : {}),
  };
};

const routeReportHasPassedCheck = (routeReport, id) =>
  Array.isArray(routeReport.checks) &&
  routeReport.checks.some(
    (check) =>
      isRecord(check) && check.id === id && trimString(check.status) === "pass",
  );

const routeReportProblems = (routeReport, tronNetwork = "mainnet") => {
  const problems = [];
  const tronProfile = resolveSccpTronNetworkProfile(
    routeReport?.tronNetwork ?? tronNetwork,
  );
  if (!isRecord(routeReport)) {
    return ["route report is missing."];
  }
  if (routeReport.manifestSource === "file") {
    problems.push(
      "route preflight used a local manifest file; public TAIRA route publication is not proven.",
    );
  }

  const routeId = readPublicDeploymentString(routeReport, "routeId");
  const assetKey = readPublicDeploymentString(routeReport, "assetKey");
  if (routeId !== SCCP_XOR_ROUTE_ID || assetKey !== SCCP_XOR_ASSET_KEY) {
    problems.push(
      `expected route ${SCCP_XOR_ROUTE_ID}/${SCCP_XOR_ASSET_KEY}, received ${routeId || "<missing>"}/${assetKey || "<missing>"}.`,
    );
  }

  const deployment = publicRouteDeployment(routeReport.deployment);
  if (!deployment) {
    problems.push("deployment evidence is missing.");
    return problems;
  }

  for (const key of PUBLIC_ROUTE_DEPLOYMENT_FIELDS) {
    if (!deployment[key]) {
      problems.push(`${key} is missing.`);
    }
  }

  for (const key of [
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
  ]) {
    const value = deployment[key];
    if (value && !isValidTronBase58CheckAddress(value)) {
      problems.push(`${key} must be a valid TRON Base58Check address.`);
    }
  }

  if (
    deployment.networkIdHex &&
    deployment.networkIdHex.toLowerCase() !== tronProfile.networkIdHex
  ) {
    problems.push(`networkIdHex must be the ${tronProfile.label} network id.`);
  }
  if (!routeReportHasPassedCheck(routeReport, "post-deploy-live-evidence")) {
    problems.push("post-deploy live evidence preflight check has not passed.");
  }
  const postDeployLiveEvidence = publicPostDeployLiveEvidence(
    routeReport.postDeployLiveEvidence,
  );
  if (!postDeployLiveEvidence && tronProfile.key === "mainnet") {
    problems.push("postDeployLiveEvidence is missing.");
  } else if (postDeployLiveEvidence) {
    if (!postDeployLiveEvidence.fullTomlReady) {
      problems.push("postDeployLiveEvidence.fullTomlReady must be true.");
    }
    for (const key of PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS) {
      if (!isNonZeroHex32(postDeployLiveEvidence[key])) {
        problems.push(`${key} must be a non-zero 32-byte hex value.`);
      }
    }
    if (!postDeployLiveEvidence.offlineFullTomlSha256) {
      problems.push("offlineFullTomlSha256 is required.");
    }
    if (
      postDeployLiveEvidence.offlineFullTomlSha256 &&
      !isNonZeroHex32(postDeployLiveEvidence.offlineFullTomlSha256)
    ) {
      problems.push(
        "offlineFullTomlSha256 must be a non-zero 32-byte hex value.",
      );
    }
  }

  return problems;
};

const isLoopbackHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeUrlCharacter = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const hasParentDirectorySegment = (value) => {
  let normalized = value.replace(/\\/gu, "/");
  for (let depth = 0; depth < 8; depth += 1) {
    if (/(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
      return true;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/gu, "/");
    } catch (_error) {
      return true;
    }
    if (decoded === normalized) {
      return false;
    }
    normalized = decoded;
  }
  // Values that are still changing after several decode passes are
  // intentionally treated as unsafe instead of guessing how many layers an
  // intermediary might decode.
  return true;
};

export const normalizeWalletConnectProjectId = (value) => {
  const projectId = trimString(value);
  if (!projectId) {
    return null;
  }
  if (
    projectId.length > 128 ||
    hasUnsafeUrlCharacter(projectId) ||
    /[/:?#@\\]/u.test(projectId)
  ) {
    throw new Error(
      "WalletConnect project ID must be a non-empty opaque identifier without URL syntax.",
    );
  }
  return projectId;
};

export const isSccpNileTestSignerConfigured = ({
  tronNetwork = "nile",
  enabled = process.env[SCCP_TRON_NILE_TEST_SIGNER_ENV] ??
    process.env.SCCP_ENABLE_NILE_TEST_SIGNER,
  secretFile = process.env[SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV] ??
    process.env.SCCP_TRON_TEST_SIGNER_SECRET_FILE,
} = {}) =>
  resolveSccpTronNetworkProfile(tronNetwork).key === "nile" &&
  parseBoolean(enabled) &&
  Boolean(trimString(secretFile));

export const normalizeSccpBrowserModuleUrl = (value, label) => {
  const moduleUrl = trimString(value);
  if (!moduleUrl) {
    return null;
  }
  if (hasUnsafeUrlCharacter(moduleUrl)) {
    throw new Error(
      `${label} must not contain whitespace or control characters.`,
    );
  }
  if (/[?#]/u.test(moduleUrl)) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (hasParentDirectorySegment(moduleUrl)) {
    throw new Error(`${label} must not include parent directory segments.`);
  }
  if (/^(?:\/(?!\/)|\.{1,2}\/)/u.test(moduleUrl)) {
    return moduleUrl;
  }

  let parsed;
  try {
    parsed = new URL(moduleUrl);
  } catch (_error) {
    throw new Error(
      `${label} must be a relative path, HTTPS URL, or loopback HTTP URL.`,
    );
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not include credentials.`);
  }
  if (parsed.search || parsed.hash) {
    throw new Error(`${label} must not include query strings or fragments.`);
  }
  if (parsed.protocol === "https:") {
    return parsed.toString();
  }
  if (parsed.protocol === "http:" && isLoopbackHost(parsed.hostname)) {
    return parsed.toString();
  }
  throw new Error(
    `${label} must be a relative path, HTTPS URL, or loopback HTTP URL.`,
  );
};

const check = (id, label, status, detail) => ({ id, label, status, detail });

const safeNormalize = (fn, fallbackMessage) => {
  try {
    return { value: fn(), error: null };
  } catch (error) {
    return {
      value: null,
      error: error instanceof Error ? error.message : fallbackMessage,
    };
  }
};

export const evaluateSccpLiveSmokeReadiness = ({
  routeReport,
  tronNetwork = "mainnet",
  walletConnectProjectId,
  nileTestSignerConfigured = false,
  destinationProverModuleUrl,
  sourceProverModuleUrl,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const checks = [];
  const reasons = [];
  const nextSteps = [];
  const tronProfile = resolveSccpTronNetworkProfile(
    routeReport?.tronNetwork ?? tronNetwork,
  );

  const rawRouteReady = routeReport?.ready === true;
  const routeProblems = rawRouteReady
    ? routeReportProblems(routeReport, tronProfile.key)
    : [];
  const routeReady = rawRouteReady && routeProblems.length === 0;
  checks.push(
    check(
      "route-preflight",
      "TAIRA/TRON SCCP route preflight is ready.",
      routeReady ? "pass" : "fail",
      routeReady
        ? `Route manifest, capabilities, and ${tronProfile.label} deployment evidence are ready.`
        : routeProblems.length
          ? `Route preflight report is not for ${SCCP_XOR_ROUTE_ID}/${SCCP_XOR_ASSET_KEY}: ${routeProblems.join(" ")}`
          : "Run npm run e2e:sccp:preflight and activate the route manifest before live transfer smoke.",
    ),
  );
  if (!routeReady) {
    reasons.push(
      routeProblems.length
        ? "SCCP route preflight report is not bound to TAIRA/TRON XOR."
        : "SCCP route preflight is not ready.",
    );
    nextSteps.push(
      ...(Array.isArray(routeReport?.nextSteps) && routeReport.nextSteps.length
        ? routeReport.nextSteps
        : [
            "Deploy or activate the missing TRON contracts, verifier material, TAIRA burn-record contract material, and route manifest evidence.",
          ]),
    );
  }

  const project = safeNormalize(
    () => normalizeWalletConnectProjectId(walletConnectProjectId),
    "Unable to validate WalletConnect project ID.",
  );
  if (project.error) {
    checks.push(
      check(
        "walletconnect-project-id",
        "WalletConnect project ID is configured.",
        "fail",
        project.error,
      ),
    );
    reasons.push(project.error);
  } else if (!project.value) {
    if (nileTestSignerConfigured && tronProfile.key === "nile") {
      checks.push(
        check(
          "walletconnect-project-id",
          "WalletConnect project ID is configured.",
          "pass",
          "Using explicit Nile-only Electron test signer for this test run.",
        ),
      );
    } else {
      checks.push(
        check(
          "walletconnect-project-id",
          "WalletConnect project ID is configured.",
          "fail",
          `${WALLETCONNECT_PROJECT_ID_ENV} is required for TRON WalletConnect signing.`,
        ),
      );
      reasons.push("WalletConnect project ID is missing.");
      nextSteps.push(
        `Set ${WALLETCONNECT_PROJECT_ID_ENV} before launching the Electron renderer, or set ${SCCP_TRON_NILE_TEST_SIGNER_ENV}=1 plus ${SCCP_TRON_NILE_TEST_SIGNER_SECRET_FILE_ENV}=... for a Nile-only test run.`,
      );
    }
  } else {
    checks.push(
      check(
        "walletconnect-project-id",
        "WalletConnect project ID is configured.",
        "pass",
        "Configured.",
      ),
    );
  }

  const destinationProver = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        destinationProverModuleUrl,
        "TAIRA -> TRON prover module URL",
      ),
    "Unable to validate TAIRA -> TRON prover module URL.",
  );
  if (destinationProver.error) {
    checks.push(
      check(
        "destination-prover-module",
        "TAIRA -> TRON browser prover module is configured.",
        "fail",
        destinationProver.error,
      ),
    );
    reasons.push(destinationProver.error);
  } else if (!destinationProver.value) {
    checks.push(
      check(
        "destination-prover-module",
        "TAIRA -> TRON browser prover module is configured.",
        "fail",
        `${SCCP_TRON_PROVER_MODULE_URL_ENV} is required for destination proof generation.`,
      ),
    );
    reasons.push("TAIRA -> TRON browser prover module URL is missing.");
    nextSteps.push(
      `Set ${SCCP_TRON_PROVER_MODULE_URL_ENV} to a browser-safe TRON Groth16 prover module.`,
    );
  } else {
    checks.push(
      check(
        "destination-prover-module",
        "TAIRA -> TRON browser prover module is configured.",
        "pass",
        destinationProver.value,
      ),
    );
  }

  const sourceProver = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        sourceProverModuleUrl,
        "TRON -> TAIRA source prover module URL",
      ),
    "Unable to validate TRON -> TAIRA source prover module URL.",
  );
  if (sourceProver.error) {
    checks.push(
      check(
        "source-prover-module",
        "TRON -> TAIRA browser source prover module is configured.",
        "fail",
        sourceProver.error,
      ),
    );
    reasons.push(sourceProver.error);
  } else if (!sourceProver.value) {
    checks.push(
      check(
        "source-prover-module",
        "TRON -> TAIRA browser source prover module is configured.",
        "fail",
        `${SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV} is required for source proof generation.`,
      ),
    );
    reasons.push("TRON -> TAIRA browser source prover module URL is missing.");
    nextSteps.push(
      `Set ${SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV} to a browser-safe TRON source proof module. If one module exports both prover functions, set both SCCP prover env vars to that same URL.`,
    );
  } else {
    checks.push(
      check(
        "source-prover-module",
        "TRON -> TAIRA browser source prover module is configured.",
        "pass",
        sourceProver.value,
      ),
    );
  }

  if (
    routeReady &&
    (project.value ||
      (nileTestSignerConfigured && tronProfile.key === "nile")) &&
    destinationProver.value &&
    sourceProver.value
  ) {
    nextSteps.push(...SCCP_LIVE_SMOKE_STEPS);
  }

  return {
    ready: checks.every((entry) => entry.status === "pass"),
    checkedAt,
    routeReady,
    checks,
    reasons: [...new Set(reasons)],
    nextSteps: [...new Set(nextSteps)],
    route: routeReport
      ? {
          endpoint: routeReport.endpoint ?? null,
          tronNetwork: routeReport.tronNetwork ?? tronProfile.key,
          manifestSource: routeReport.manifestSource ?? null,
          routeId: routeReport.routeId ?? null,
          assetKey: routeReport.assetKey ?? null,
          deployment: publicRouteDeployment(routeReport.deployment),
          postDeployLiveEvidence: publicPostDeployLiveEvidence(
            routeReport.postDeployLiveEvidence,
          ),
        }
      : null,
  };
};

export const runSccpLiveSmokeReadiness = async ({
  endpoint = DEFAULT_TAIRA_TORII_URL,
  tronNetwork = "mainnet",
  tronEndpoint,
  manifestFilePath,
  checkTronContracts = true,
  walletConnectProjectId = process.env[WALLETCONNECT_PROJECT_ID_ENV],
  nileTestSignerConfigured = isSccpNileTestSignerConfigured({ tronNetwork }),
  destinationProverModuleUrl = process.env[SCCP_TRON_PROVER_MODULE_URL_ENV],
  sourceProverModuleUrl = process.env[SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV],
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  checkedAt,
} = {}) => {
  const tronProfile = resolveSccpTronNetworkProfile(tronNetwork);
  const routeReport = await runSccpRoutePreflight({
    endpoint,
    tronNetwork: tronProfile.key,
    tronEndpoint: tronEndpoint ?? tronProfile.gatewayUrl,
    manifestFilePath,
    checkTronContracts,
    fetchImpl,
    timeoutMs,
  });
  return evaluateSccpLiveSmokeReadiness({
    routeReport,
    tronNetwork: tronProfile.key,
    walletConnectProjectId,
    nileTestSignerConfigured,
    destinationProverModuleUrl,
    sourceProverModuleUrl,
    checkedAt,
  });
};

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
    } else {
      args[key] = next;
      index += 1;
    }
  }
  return args;
};

const cli = async () => {
  const args = parseArgs(process.argv.slice(2));
  const tronProfile = resolveSccpTronNetworkProfile(
    args["tron-network"] ||
      process.env.SCCP_TRON_NETWORK ||
      process.env.VITE_SCCP_TRON_NETWORK ||
      "mainnet",
  );
  const endpoint = normalizeToriiEndpoint(
    args.endpoint ||
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      process.env.TAIRA_TORII_URL ||
      process.env.E2E_TORII_URL ||
      DEFAULT_TAIRA_TORII_URL,
    { allowLocal: parseBoolean(args["allow-local"]) },
  );
  const tronEndpoint = normalizeTronGatewayEndpoint(
    args["tron-endpoint"] ||
      process.env.SCCP_TRON_GATEWAY_URL ||
      process.env.TRON_GATEWAY_URL ||
      tronProfile.gatewayUrl ||
      DEFAULT_TRON_GATEWAY_URL,
  );
  const timeoutMs = Number(args["timeout-ms"] ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  const report = await runSccpLiveSmokeReadiness({
    endpoint,
    tronNetwork: tronProfile.key,
    tronEndpoint,
    manifestFilePath:
      args["manifest-file"] ||
      process.env.SCCP_ROUTE_MANIFEST_FILE ||
      process.env.VITE_SCCP_ROUTE_MANIFEST_FILE ||
      undefined,
    checkTronContracts:
      args["check-tron-contracts"] === undefined
        ? true
        : parseBoolean(args["check-tron-contracts"]),
    walletConnectProjectId:
      args["walletconnect-project-id"] ||
      process.env[WALLETCONNECT_PROJECT_ID_ENV],
    nileTestSignerConfigured:
      args["nile-test-signer"] === undefined
        ? isSccpNileTestSignerConfigured({ tronNetwork: tronProfile.key })
        : parseBoolean(args["nile-test-signer"]),
    destinationProverModuleUrl:
      args["destination-prover-module-url"] ||
      process.env[SCCP_TRON_PROVER_MODULE_URL_ENV],
    sourceProverModuleUrl:
      args["source-prover-module-url"] ||
      process.env[SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV],
    timeoutMs,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ready && !parseBoolean(args["allow-not-ready"])) {
    process.exitCode = 1;
  }
};

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  cli().catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
