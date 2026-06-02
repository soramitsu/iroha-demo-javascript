#!/usr/bin/env node
/* global globalThis */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_TAIRA_TORII_URL,
  DEFAULT_TRON_GATEWAY_URL,
  normalizeToriiEndpoint,
  normalizeTronGatewayEndpoint,
  runSccpRoutePreflight,
} from "./sccp-route-preflight.mjs";

export const WALLETCONNECT_PROJECT_ID_ENV = "VITE_WALLETCONNECT_PROJECT_ID";
export const SCCP_TRON_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_TRON_PROVER_MODULE_URL";
export const SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_TRON_SOURCE_PROVER_MODULE_URL";

export const SCCP_LIVE_SMOKE_STEPS = Object.freeze([
  "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
  "Connect a TRON mainnet wallet through WalletConnect/AppKit; do not import TRON keys.",
  "Run one tiny TAIRA -> TRON bridge transfer and verify the TRON finalize transaction link.",
  "Run one tiny TRON -> TAIRA bridge transfer and verify the TAIRA finalize_inbound transaction link.",
]);

const trimString = (value) => String(value ?? "").trim();

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
  walletConnectProjectId,
  destinationProverModuleUrl,
  sourceProverModuleUrl,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const checks = [];
  const reasons = [];
  const nextSteps = [];

  const routeReady = routeReport?.ready === true;
  checks.push(
    check(
      "route-preflight",
      "TAIRA/TRON SCCP route preflight is ready.",
      routeReady ? "pass" : "fail",
      routeReady
        ? "Route manifest, capabilities, and deployment evidence are ready."
        : "Run npm run e2e:sccp:preflight and activate the route manifest before live transfer smoke.",
    ),
  );
  if (!routeReady) {
    reasons.push("SCCP route preflight is not ready.");
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
      `Set ${WALLETCONNECT_PROJECT_ID_ENV} before launching the Electron renderer.`,
    );
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

  const sourceInput = sourceProverModuleUrl || destinationProver.value || "";
  const sourceProver = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        sourceInput,
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
        `${SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV} or ${SCCP_TRON_PROVER_MODULE_URL_ENV} is required for source proof generation.`,
      ),
    );
    reasons.push("TRON -> TAIRA browser source prover module URL is missing.");
    nextSteps.push(
      `Set ${SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV}, or use ${SCCP_TRON_PROVER_MODULE_URL_ENV} only if that module exports both prover functions.`,
    );
  } else {
    checks.push(
      check(
        "source-prover-module",
        "TRON -> TAIRA browser source prover module is configured.",
        "pass",
        sourceProverModuleUrl
          ? sourceProver.value
          : `${sourceProver.value} (using ${SCCP_TRON_PROVER_MODULE_URL_ENV} fallback)`,
      ),
    );
  }

  if (
    routeReady &&
    project.value &&
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
          routeId: routeReport.routeId ?? null,
          assetKey: routeReport.assetKey ?? null,
          deployment: routeReport.deployment ?? null,
        }
      : null,
  };
};

export const runSccpLiveSmokeReadiness = async ({
  endpoint = DEFAULT_TAIRA_TORII_URL,
  tronEndpoint = DEFAULT_TRON_GATEWAY_URL,
  checkTronContracts = true,
  walletConnectProjectId = process.env[WALLETCONNECT_PROJECT_ID_ENV],
  destinationProverModuleUrl = process.env[SCCP_TRON_PROVER_MODULE_URL_ENV],
  sourceProverModuleUrl = process.env[SCCP_TRON_SOURCE_PROVER_MODULE_URL_ENV],
  fetchImpl = globalThis.fetch,
  timeoutMs = 10_000,
  checkedAt,
} = {}) => {
  const routeReport = await runSccpRoutePreflight({
    endpoint,
    tronEndpoint,
    checkTronContracts,
    fetchImpl,
    timeoutMs,
  });
  return evaluateSccpLiveSmokeReadiness({
    routeReport,
    walletConnectProjectId,
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

const parseBoolean = (value) =>
  ["1", "true", "yes", "on"].includes(trimString(value).toLowerCase());

const cli = async () => {
  const args = parseArgs(process.argv.slice(2));
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
      DEFAULT_TRON_GATEWAY_URL,
  );
  const timeoutMs = Number(args["timeout-ms"] ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  const report = await runSccpLiveSmokeReadiness({
    endpoint,
    tronEndpoint,
    checkTronContracts:
      args["check-tron-contracts"] === undefined
        ? true
        : parseBoolean(args["check-tron-contracts"]),
    walletConnectProjectId:
      args["walletconnect-project-id"] ||
      process.env[WALLETCONNECT_PROJECT_ID_ENV],
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
