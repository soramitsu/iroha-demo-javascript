#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  DEFAULT_SOLANA_TESTNET_RPC_URL,
  DEFAULT_TAIRA_TORII_URL,
  SCCP_SOLANA_XOR_ROUTE_ID,
  SCCP_XOR_ASSET_KEY,
  SOLANA_DESTINATION_PROOF_BACKEND,
  SOLANA_DESTINATION_VERIFIER_PLAN,
  SOLANA_SOURCE_PROOF_BACKEND,
  SOLANA_TESTNET_CAIP_CHAIN_ID,
  SOLANA_TESTNET_GENESIS_HASH,
  SOLANA_TESTNET_NETWORK_ID,
  SOLANA_VERIFIER_TARGET,
  readBooleanArg,
  runSccpSolanaRoutePreflight,
} from "./sccp-solana-route-preflight.mjs";
import {
  WALLETCONNECT_PROJECT_ID_ENV,
  normalizeSccpBrowserModuleUrl,
  normalizeWalletConnectProjectId,
} from "./sccp-live-smoke-readiness.mjs";
import { validateSolanaProverKnownAnswerSummary } from "../sccp-solana-prover-known-answer.mjs";
import {
  SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV,
  SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA,
  SOLANA_PROVER_SIDECAR_SCHEMA,
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV,
  buildExactSolanaProductionProverApprovalValidation,
  canonicalSolanaExactProverApprovalJson,
  readStablePublicExactSolanaArtifact,
} from "./sccp-solana-exact-prover-governance.mjs";
import {
  DEFAULT_SOLANA_TEXT_MAX_BYTES,
  parseStrictCliArgs,
  readStableRegularFileSync,
  writeAtomicJsonFile,
} from "./sccp-solana-report-io.mjs";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const proverChildEnvironment = () => {
  const env = { LANG: "C", LC_ALL: "C", TZ: "UTC" };
  for (const key of ["SystemRoot", "WINDIR"]) {
    if (typeof process.env[key] === "string") {
      env[key] = process.env[key];
    }
  }
  return env;
};

const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-solana-smoke-readiness",
);

export const SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL";
export const SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL";
export const SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV =
  SOLANA_EXACT_PROVER_APPROVAL_SHA256_ENV;
export const SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV =
  SOLANA_EXACT_PROVER_APPROVAL_FILE_ENV;
export const DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-destination-prover.js";
export const DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-source-prover.js";
const SOLANA_SMOKE_ENV_FILE_ALLOWED_KEYS = new Set([
  WALLETCONNECT_PROJECT_ID_ENV,
  SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
  SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
]);
const SOLANA_ROUTE_PREFLIGHT_SCHEMA =
  "iroha-demo-sccp-solana-route-preflight/v2";
const SOLANA_ROUTE_PREFLIGHT_PROTOCOL_SOURCE = "typed-sccp-registry-v1";
const SOLANA_ROUTE_PREFLIGHT_MANIFEST_SOURCE = "public-registry";
const SCCP_SORA_DOMAIN = 0;
const SCCP_SOLANA_DOMAIN = 3;

export const SCCP_SOLANA_LIVE_SMOKE_STEPS = Object.freeze([
  "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
  "Connect a Solana testnet wallet through WalletConnect/AppKit.",
  "Run one tiny TAIRA -> Solana transfer and verify the Solana finalize transaction link.",
  "Run one tiny Solana -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
]);

const trimString = (value) => String(value ?? "").trim();

const isRecord = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseEnvFileLine = (line) => {
  const withoutComment = line.trim();
  if (!withoutComment || withoutComment.startsWith("#")) {
    return null;
  }
  const match = withoutComment.match(
    /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u,
  );
  if (!match) {
    return null;
  }
  let value = match[2] ?? "";
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith("`") && value.endsWith("`"))
  ) {
    value = value.slice(1, -1);
  } else {
    const commentIndex = value.search(/\s+#/u);
    if (commentIndex >= 0) {
      value = value.slice(0, commentIndex);
    }
    value = value.trim();
  }
  return { key: match[1], value };
};

const envFileLineKey = (line) =>
  line.trim().match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/u)?.[1] ??
  null;

const parseEnvFile = (file) => {
  const entries = [];
  const bytes = readStableRegularFileSync(file, {
    label: "Solana SCCP smoke environment file",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    root: path.dirname(file),
  });
  for (const line of bytes.toString("utf8").split(/\r?\n/u)) {
    const key = envFileLineKey(line);
    if (!key || !SOLANA_SMOKE_ENV_FILE_ALLOWED_KEYS.has(key)) {
      continue;
    }
    const parsed = parseEnvFileLine(line);
    if (parsed) {
      entries.push(parsed);
    }
  }
  return entries;
};

export const loadSolanaSccpSmokeEnvFiles = ({
  root = repoRoot,
  mode = process.env.SCCP_SOLANA_SMOKE_ENV_MODE ||
    process.env.MODE ||
    process.env.NODE_ENV ||
    "test",
  env = process.env,
} = {}) => {
  const normalizedMode = trimString(mode);
  const fileNames = [
    ".env",
    ".env.local",
    normalizedMode ? `.env.${normalizedMode}` : null,
    normalizedMode ? `.env.${normalizedMode}.local` : null,
  ].filter(Boolean);
  const preexistingKeys = new Set(Object.keys(env));
  const loaded = [];
  for (const fileName of fileNames) {
    const file = path.resolve(root, fileName);
    const keys = [];
    let entries;
    try {
      entries = parseEnvFile(file);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }
      throw error;
    }
    for (const { key, value } of entries) {
      if (
        preexistingKeys.has(key) ||
        !SOLANA_SMOKE_ENV_FILE_ALLOWED_KEYS.has(key)
      ) {
        continue;
      }
      env[key] = value;
      keys.push(key);
    }
    loaded.push({ file, keys });
  }
  return {
    mode: normalizedMode || null,
    files: loaded.map((entry) => ({
      file: entry.file,
      keys: [...new Set(entry.keys)].sort(),
    })),
  };
};

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

const failedPreflightChecks = (routePreflight) =>
  Array.isArray(routePreflight?.checks)
    ? routePreflight.checks
        .filter((check) => check?.status !== "pass")
        .map((check) => ({
          id: check.id,
          detail: check.detail ?? null,
        }))
    : [];

const solanaProverFallbackLabel = () => "the bundled fail-closed default";

const selectSolanaProverModuleUrl = ({ runtimeValue, bundledDefault }) =>
  runtimeValue === undefined || runtimeValue === null
    ? bundledDefault
    : runtimeValue;

const optionalEnvValue = (env, envNames) => {
  for (const envName of envNames) {
    const value = env?.[envName];
    if (value !== undefined) {
      return { value, envName };
    }
  }
  return { value: undefined, envName: null };
};

const solanaDestinationProverModuleUrlFromEnv = (env = process.env) =>
  optionalEnvValue(env, [SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV]);

const routePreflightSolanaBinding = (routePreflight) => {
  const solana = isRecord(routePreflight?.solana) ? routePreflight.solana : {};
  const network = trimString(
    solana.network ??
      solana.solanaNetwork ??
      solana.solana_network ??
      routePreflight?.solanaNetwork ??
      routePreflight?.solana_network ??
      "",
  );
  const caipChainId = trimString(
    solana.caipChainId ??
      solana.caip_chain_id ??
      routePreflight?.solanaCaipChainId ??
      routePreflight?.solana_caip_chain_id ??
      routePreflight?.caipChainId ??
      routePreflight?.caip_chain_id ??
      "",
  );
  const genesisHash = trimString(
    solana.genesisHash ??
      solana.genesis_hash ??
      routePreflight?.solanaGenesisHash ??
      routePreflight?.solana_genesis_hash ??
      "",
  );
  return {
    network: network || null,
    caipChainId: caipChainId || null,
    genesisHash: genesisHash || null,
    expectedNetwork: SOLANA_TESTNET_NETWORK_ID,
    expectedCaipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
    expectedGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    networkReady: network === SOLANA_TESTNET_NETWORK_ID,
    caipChainReady: caipChainId === SOLANA_TESTNET_CAIP_CHAIN_ID,
    genesisReady: genesisHash === SOLANA_TESTNET_GENESIS_HASH,
  };
};

const normalizeSolanaWalletConnectProjectId = (value) => {
  const projectId = normalizeWalletConnectProjectId(value);
  if (projectId && !/^[0-9a-f]{32}$/iu.test(projectId)) {
    throw new Error(
      `${WALLETCONNECT_PROJECT_ID_ENV} must be a 32-character hex WalletConnect Cloud project ID for Solana live smoke.`,
    );
  }
  return projectId;
};

const smokeRequiredInput = (id, kind, placeholder, description) =>
  Object.freeze({ id, kind, placeholder, description });

const smokeAction = ({
  id,
  title,
  detail,
  requiredInputs,
  blockedByChecks,
  commands,
}) =>
  Object.freeze({
    id,
    title,
    detail,
    requiredInputs: Object.freeze(requiredInputs),
    blockedByChecks: Object.freeze(blockedByChecks),
    commands: Object.freeze(commands),
  });

const missingProductionInputs = (nextActions) => {
  const byId = new Map();
  for (const action of nextActions) {
    for (const input of action.requiredInputs ?? []) {
      const existing = byId.get(input.id);
      if (existing) {
        if (!existing.blockedByActions.includes(action.id)) {
          existing.blockedByActions.push(action.id);
        }
        continue;
      }
      byId.set(input.id, { ...input, blockedByActions: [action.id] });
    }
  }
  return [...byId.values()];
};

export const solanaSccpLiveSmokeReadinessRunbookProblems = ({
  failedCheckIds,
  nextActions,
  missingProductionInputs,
}) => {
  const problems = [];
  const failed = new Set(failedCheckIds ?? []);
  const inputById = new Map(
    (missingProductionInputs ?? [])
      .filter((input) => typeof input?.id === "string")
      .map((input) => [input.id, input]),
  );
  const checkIdsCoveredByActions = new Set();

  for (const action of nextActions ?? []) {
    const actionId = trimString(action?.id);
    if (!actionId) {
      problems.push("Solana live smoke-readiness action is missing an id.");
      continue;
    }
    const blockedByChecks = Array.isArray(action?.blockedByChecks)
      ? action.blockedByChecks
      : [];
    if (blockedByChecks.length === 0) {
      problems.push(
        `Solana live smoke-readiness action ${actionId} is not tied to a failed check.`,
      );
    }
    for (const checkId of blockedByChecks) {
      if (typeof checkId !== "string" || !checkId.trim()) {
        problems.push(
          `Solana live smoke-readiness action ${actionId} has an invalid blockedByChecks entry.`,
        );
        continue;
      }
      if (!failed.has(checkId)) {
        problems.push(
          `Solana live smoke-readiness action ${actionId} is tied to non-failing check ${checkId}.`,
        );
      }
      checkIdsCoveredByActions.add(checkId);
    }
    for (const input of action.requiredInputs ?? []) {
      const inputId = trimString(input?.id);
      if (!inputId) {
        problems.push(
          `Solana live smoke-readiness action ${actionId} has a required input without an id.`,
        );
        continue;
      }
      const missingInput = inputById.get(inputId);
      if (!missingInput) {
        problems.push(
          `Solana live smoke-readiness action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
        );
        continue;
      }
      if (
        !Array.isArray(missingInput.blockedByActions) ||
        !missingInput.blockedByActions.includes(actionId)
      ) {
        problems.push(
          `Solana live smoke-readiness missing input ${inputId} is not linked back to action ${actionId}.`,
        );
      }
    }
  }

  for (const checkId of failed) {
    if (!checkIdsCoveredByActions.has(checkId)) {
      problems.push(
        `Solana live smoke-readiness failed check ${checkId} has no next action.`,
      );
    }
  }

  return problems;
};

const routePreflightCheck = ({
  routePreflight,
  routePreflightPath = null,
  routePreflightError = null,
} = {}) => {
  if (!isRecord(routePreflight)) {
    return makeCheck(
      "route-preflight",
      false,
      routePreflightError
        ? "Solana route preflight report could not be loaded."
        : "Solana route preflight report is missing.",
      {
        routePreflightPath: routePreflightPath
          ? "[public-report-supplied]"
          : null,
      },
    );
  }
  const routeId = trimString(routePreflight.routeId);
  const assetKey = trimString(routePreflight.assetKey);
  const routeRevision = routePreflight.routeRevision;
  const failed = failedPreflightChecks(routePreflight);
  const solana = routePreflightSolanaBinding(routePreflight);
  const exactPublicRegistrySourceReady =
    routePreflight.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA &&
    routePreflight.protocolSource === SOLANA_ROUTE_PREFLIGHT_PROTOCOL_SOURCE &&
    routePreflight.manifestSource === SOLANA_ROUTE_PREFLIGHT_MANIFEST_SOURCE;
  const ready =
    routePreflight.ready === true &&
    exactPublicRegistrySourceReady &&
    routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
    assetKey === SCCP_XOR_ASSET_KEY &&
    routeRevision === 1 &&
    solana.networkReady &&
    solana.caipChainReady &&
    solana.genesisReady &&
    failed.length === 0;
  const checkedAt = trimString(routePreflight.checkedAt);
  const checkedAtMs = Date.parse(checkedAt);
  const publicSolana = {
    network: solana.networkReady ? SOLANA_TESTNET_NETWORK_ID : null,
    caipChainId: solana.caipChainReady ? SOLANA_TESTNET_CAIP_CHAIN_ID : null,
    genesisHash: solana.genesisReady ? SOLANA_TESTNET_GENESIS_HASH : null,
    expectedNetwork: SOLANA_TESTNET_NETWORK_ID,
    expectedCaipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
    expectedGenesisHash: SOLANA_TESTNET_GENESIS_HASH,
    networkReady: solana.networkReady,
    caipChainReady: solana.caipChainReady,
    genesisReady: solana.genesisReady,
  };
  return makeCheck(
    "route-preflight",
    ready,
    ready
      ? "Public TAIRA Solana route preflight is ready."
      : routePreflight.ready === true &&
          (!solana.networkReady ||
            !solana.caipChainReady ||
            !solana.genesisReady)
        ? "Public TAIRA Solana route preflight is not bound to Solana testnet."
        : routePreflight.ready === true && !exactPublicRegistrySourceReady
          ? "Public TAIRA Solana route preflight is not an exact v2 typed-registry report."
          : "Public TAIRA Solana route preflight is not ready.",
    {
      routePreflightPath: routePreflightPath
        ? "[public-report-supplied]"
        : null,
      checkedAt:
        checkedAt &&
        Number.isFinite(checkedAtMs) &&
        new Date(checkedAtMs).toISOString() === checkedAt
          ? checkedAt
          : null,
      ready: routePreflight.ready === true,
      schema:
        routePreflight.schema === SOLANA_ROUTE_PREFLIGHT_SCHEMA
          ? SOLANA_ROUTE_PREFLIGHT_SCHEMA
          : null,
      protocolSource:
        routePreflight.protocolSource === SOLANA_ROUTE_PREFLIGHT_PROTOCOL_SOURCE
          ? SOLANA_ROUTE_PREFLIGHT_PROTOCOL_SOURCE
          : null,
      routeId: routeId === SCCP_SOLANA_XOR_ROUTE_ID ? routeId : null,
      assetKey: assetKey === SCCP_XOR_ASSET_KEY ? assetKey : null,
      routeRevision: routeRevision === 1 ? 1 : null,
      manifestSource:
        routePreflight.manifestSource === SOLANA_ROUTE_PREFLIGHT_MANIFEST_SOURCE
          ? SOLANA_ROUTE_PREFLIGHT_MANIFEST_SOURCE
          : null,
      solana: publicSolana,
      failedCheckCount: failed.length,
      failedChecks:
        failed.length > 0
          ? [
              {
                id: "public-route-preflight-failed",
                status: "fail",
                detail:
                  "Public route preflight contains failed or invalid checks.",
              },
            ]
          : [],
    },
  );
};

const walletConnectCheck = (walletConnectProjectId) => {
  try {
    const projectId = normalizeSolanaWalletConnectProjectId(
      walletConnectProjectId,
    );
    return makeCheck(
      "walletconnect-project-id",
      Boolean(projectId),
      projectId
        ? `${WALLETCONNECT_PROJECT_ID_ENV} is configured.`
        : `${WALLETCONNECT_PROJECT_ID_ENV} is required for Solana WalletConnect signing.`,
      {
        env: WALLETCONNECT_PROJECT_ID_ENV,
        configured: Boolean(projectId),
        valueStoredInReport: false,
      },
    );
  } catch (error) {
    return makeCheck(
      "walletconnect-project-id",
      false,
      error instanceof Error ? error.message : String(error),
      {
        env: WALLETCONNECT_PROJECT_ID_ENV,
        configured: true,
        valueStoredInReport: false,
      },
    );
  }
};

const localPublicModuleFile = (moduleUrl) => {
  if (
    typeof moduleUrl !== "string" ||
    !moduleUrl.startsWith("/") ||
    moduleUrl.startsWith("//")
  ) {
    return null;
  }
  return path.join(repoRoot, "public", moduleUrl.replace(/^\//u, ""));
};

const hexSha256Bytes = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const defaultSolanaProverSidecarUrl = (moduleUrl) =>
  normalizeSccpBrowserModuleUrl(
    moduleUrl.replace(/(?:\.m?js)?$/u, ".sidecar.json"),
    "Solana prover sidecar URL",
  );

const readSidecar = (moduleUrl) => {
  const sidecarUrl = defaultSolanaProverSidecarUrl(moduleUrl);
  const sidecarFile = localPublicModuleFile(sidecarUrl);
  if (!sidecarFile) {
    return {
      sidecarUrl,
      sidecarFile,
      sidecarReady: false,
      sidecarErrors: ["Solana prover sidecar file is missing."],
    };
  }
  try {
    const sidecarBytes = readStableRegularFileSync(sidecarFile, {
      label: "Solana prover sidecar",
      root: path.join(repoRoot, "public"),
    });
    let sidecar;
    try {
      sidecar = JSON.parse(sidecarBytes.toString("utf8"));
    } catch {
      throw new Error("Solana prover sidecar contains invalid JSON.");
    }
    return {
      sidecarUrl,
      sidecarFile,
      sidecar,
      sidecarHash: hexSha256Bytes(sidecarBytes),
      sidecarReady: true,
      sidecarErrors: [],
    };
  } catch (error) {
    return {
      sidecarUrl,
      sidecarFile,
      sidecarReady: false,
      sidecarErrors: [
        error?.code === "ENOENT"
          ? "Solana prover sidecar file is missing."
          : error instanceof Error
            ? error.message
            : String(error),
      ],
    };
  }
};

const readSidecarAliasValues = (sidecar, keys) =>
  keys
    .map((key) => ({ key, value: sidecar?.[key] }))
    .filter(({ value }) => value !== undefined);

const validPublicSha256 = (value) =>
  typeof value === "string" &&
  /^0x[0-9a-f]{64}$/u.test(value) &&
  !/^0x0{64}$/u.test(value);

export const loadSolanaExactProverApprovalForSmoke = async ({
  file,
  expectedApprovalSha256,
} = {}) => {
  const requestedFile = trimString(file);
  let artifact = null;
  let approvalRecord = null;
  const errors = [];
  if (!requestedFile) {
    errors.push(
      `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV} is required.`,
    );
  } else {
    try {
      artifact = await readStablePublicExactSolanaArtifact({
        file: requestedFile,
        label: "Solana exact prover governance approval",
        maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
      });
      let parsed = null;
      try {
        parsed = JSON.parse(artifact.bytes.toString("utf8"));
      } catch {
        errors.push(
          "Solana exact prover governance approval contains invalid JSON.",
        );
      }
      if (isRecord(parsed)) {
        const canonicalBytes = Buffer.from(
          `${canonicalSolanaExactProverApprovalJson(parsed)}\n`,
          "utf8",
        );
        if (!artifact.bytes.equals(canonicalBytes)) {
          errors.push(
            "Solana exact prover governance approval must be canonical UTF-8 JSON with sorted object keys, no insignificant whitespace, and one trailing newline.",
          );
        } else {
          approvalRecord = parsed;
        }
      } else if (parsed !== null) {
        errors.push(
          "Solana exact prover governance approval must be a JSON object.",
        );
      }
    } catch (error) {
      errors.push(
        error?.code === "ENOENT"
          ? "Solana exact prover governance approval file is missing."
          : error instanceof Error
            ? error.message
            : String(error),
      );
    }
  }
  const validation = buildExactSolanaProductionProverApprovalValidation({
    approvalRecord,
    approvalPath:
      artifact?.path ?? (requestedFile ? path.resolve(requestedFile) : null),
    approvalSha256: artifact?.sha256 ?? null,
    expectedApprovalSha256: expectedApprovalSha256 ?? null,
  });
  errors.push(
    ...validation.blockers.map(
      (blocker) =>
        blocker.error ||
        `Solana exact prover governance approval ${blocker.key} is ${blocker.status}.`,
    ),
  );
  return Object.freeze({
    validation,
    errors: Object.freeze([...new Set(errors)]),
    publicSummary: Object.freeze({
      schema: validation.schema,
      ready: validation.ready === true && errors.length === 0,
      approvalId: validation.approvalId ?? null,
      approvalSha256: validation.approvalSha256 ?? null,
      expectedApprovalSha256: validation.expectedApprovalSha256 ?? null,
      blockerIds: Object.freeze([...validation.blockerIds]),
    }),
  });
};

const containsSecretBearingField = (value) => {
  if (Array.isArray(value)) return value.some(containsSecretBearingField);
  if (!isRecord(value)) return false;
  return Object.entries(value).some(
    ([key, child]) =>
      /(?:private|secret|mnemonic|seed|credential|wallet.?connect|keypair|token)/iu.test(
        key,
      ) || containsSecretBearingField(child),
  );
};

const validateGovernanceApprovalBinding = ({
  sidecar,
  direction,
  moduleHash,
  expectedApprovalSha256,
  approvalValidation,
}) => {
  const errors = [];
  const binding = sidecar?.governanceApprovalBinding;
  const knownAnswer = sidecar?.knownAnswer;
  const expectedFields = [
    "schema",
    "ready",
    "direction",
    "approvalId",
    "approvalSha256",
    "expectedApprovalSha256",
    "governancePlanCanonicalSha256",
    "orderedInitializationEvidenceSha256",
    "approvedModuleHash",
    "approvedVectorHash",
    "moduleHash",
    "vectorHash",
    "errors",
  ].sort();
  if (!isRecord(binding)) {
    return ["Exact prover governance approval binding is missing."];
  }
  const actualFields = Object.keys(binding).sort();
  if (JSON.stringify(actualFields) !== JSON.stringify(expectedFields)) {
    errors.push(
      "Exact prover governance approval binding contains unknown or missing fields.",
    );
  }
  if (!validPublicSha256(expectedApprovalSha256)) {
    errors.push(
      `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV} must independently pin a nonzero lowercase 0x-prefixed SHA-256.`,
    );
  }
  if (!isRecord(approvalValidation) || approvalValidation.ready !== true) {
    errors.push(
      "Canonical exact prover governance approval validation is not ready.",
    );
  }
  if (binding.schema !== SOLANA_PROVER_GOVERNANCE_BINDING_SCHEMA) {
    errors.push("Exact prover governance approval binding schema is invalid.");
  }
  if (binding.ready !== true || binding.direction !== direction) {
    errors.push(
      "Exact prover governance approval binding is not ready for this direction.",
    );
  }
  if (
    typeof binding.approvalId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(binding.approvalId)
  ) {
    errors.push("Exact prover governance approval id is invalid.");
  }
  if (!Array.isArray(binding.errors) || binding.errors.length !== 0) {
    errors.push("Exact prover governance approval binding contains errors.");
  }
  for (const key of [
    "approvalSha256",
    "expectedApprovalSha256",
    "governancePlanCanonicalSha256",
    "orderedInitializationEvidenceSha256",
    "approvedModuleHash",
    "approvedVectorHash",
    "moduleHash",
    "vectorHash",
  ]) {
    if (!validPublicSha256(binding[key])) {
      errors.push(
        `Exact prover governance approval binding ${key} is invalid.`,
      );
    }
  }
  if (
    binding.approvalSha256 !== expectedApprovalSha256 ||
    binding.expectedApprovalSha256 !== expectedApprovalSha256
  ) {
    errors.push(
      "Exact prover sidecar does not match the independently supplied governance approval hash.",
    );
  }
  if (
    binding.moduleHash !== moduleHash ||
    binding.approvedModuleHash !== moduleHash
  ) {
    errors.push(
      "Exact prover sidecar module bytes do not match the governance-approved module hash.",
    );
  }
  if (
    binding.vectorHash !== binding.approvedVectorHash ||
    binding.vectorHash !== knownAnswer?.vectorHash ||
    knownAnswer?.governance?.vectorHashPin !== binding.approvedVectorHash
  ) {
    errors.push(
      "Exact prover sidecar known-answer vector does not match its governance approval pin.",
    );
  }
  if (
    knownAnswer?.governance?.approvalHash !== expectedApprovalSha256 ||
    knownAnswer?.governance?.expectedApprovalHash !== expectedApprovalSha256
  ) {
    errors.push(
      "Exact prover known-answer summary does not match the independent governance approval hash.",
    );
  }
  const approvalPins = isRecord(approvalValidation?.pins)
    ? approvalValidation.pins
    : {};
  const modulePinKey = `${direction}ProverModuleHash`;
  const vectorPinKey = `${direction}ProverKnownAnswerVectorHash`;
  for (const [field, expected] of [
    ["approvalSha256", approvalValidation?.approvalSha256],
    ["expectedApprovalSha256", approvalValidation?.expectedApprovalSha256],
    [
      "governancePlanCanonicalSha256",
      approvalPins.governancePlanCanonicalSha256,
    ],
    [
      "orderedInitializationEvidenceSha256",
      approvalPins.orderedInitializationEvidenceSha256,
    ],
    ["approvedModuleHash", approvalPins[modulePinKey]],
    ["approvedVectorHash", approvalPins[vectorPinKey]],
  ]) {
    if (!validPublicSha256(expected) || binding[field] !== expected) {
      errors.push(
        `Exact prover sidecar ${field} does not match the canonical approval descriptor.`,
      );
    }
  }
  if (binding.approvalId !== approvalValidation?.approvalId) {
    errors.push(
      "Exact prover sidecar approval id does not match the canonical approval descriptor.",
    );
  }
  return errors;
};

export const validateSolanaSccpProverSidecar = ({
  sidecar,
  direction,
  moduleUrl,
  moduleHash,
  proveExport,
  selfTestExport,
  expectedApprovalSha256,
  approvalValidation,
}) => {
  if (
    typeof sidecar !== "object" ||
    sidecar === null ||
    Array.isArray(sidecar)
  ) {
    return ["Solana prover sidecar is missing or not a JSON object."];
  }
  const errors = [];
  if (containsSecretBearingField(sidecar)) {
    errors.push("Solana prover sidecar contains secret-bearing fields.");
  }
  const expectString = (keys, expected, label) => {
    const values = readSidecarAliasValues(sidecar, keys);
    const normalized = values.map(({ value }) =>
      typeof value === "string" ? value.trim() : "",
    );
    const uniqueValues = [...new Set(normalized.filter(Boolean))];
    if (values.length === 0 || normalized.some((value) => !value)) {
      errors.push(`${label} must be ${expected}.`);
      return;
    }
    if (uniqueValues.length !== 1) {
      errors.push(`${label} aliases must agree.`);
      return;
    }
    if (uniqueValues[0] !== expected) {
      errors.push(`${label} must be ${expected}.`);
    }
  };
  const expectNumber = (keys, expected, label) => {
    const values = readSidecarAliasValues(sidecar, keys);
    const normalized = values.map(({ value }) => Number(value));
    if (
      values.length === 0 ||
      normalized.some((value) => !Number.isFinite(value))
    ) {
      errors.push(`${label} must be ${expected}.`);
      return;
    }
    if (new Set(normalized).size !== 1) {
      errors.push(`${label} aliases must agree.`);
      return;
    }
    if (normalized[0] !== expected) {
      errors.push(`${label} must be ${expected}.`);
    }
  };
  const expectBoolean = (keys, expected, label) => {
    const values = readSidecarAliasValues(sidecar, keys);
    const normalized = values.map(({ value }) =>
      typeof value === "boolean" ? value : null,
    );
    if (values.length === 0 || normalized.some((value) => value === null)) {
      errors.push(`${label} must be ${expected ? "true" : "false"}.`);
      return;
    }
    if (new Set(normalized).size !== 1) {
      errors.push(`${label} aliases must agree.`);
      return;
    }
    if (normalized[0] !== expected) {
      errors.push(`${label} must be ${expected ? "true" : "false"}.`);
    }
  };
  const destination = direction === "destination";
  const expectedProofBackend = destination
    ? SOLANA_DESTINATION_PROOF_BACKEND
    : SOLANA_SOURCE_PROOF_BACKEND;
  expectString(["schema"], SOLANA_PROVER_SIDECAR_SCHEMA, "schema");
  expectString(["routeId", "route_id"], SCCP_SOLANA_XOR_ROUTE_ID, "routeId");
  expectString(["assetKey", "asset_key"], SCCP_XOR_ASSET_KEY, "assetKey");
  expectString(["direction"], direction, "direction");
  expectString(
    ["network", "solanaNetwork", "solana_network", "sourceChain"],
    SOLANA_TESTNET_NETWORK_ID,
    "network",
  );
  expectString(
    ["genesisHash", "genesis_hash"],
    SOLANA_TESTNET_GENESIS_HASH,
    "genesisHash",
  );
  expectString(["moduleUrl", "module_url"], moduleUrl, "moduleUrl");
  expectString(["moduleHash", "module_hash"], moduleHash, "moduleHash");
  expectString(["proveExport", "prove_export"], proveExport, "proveExport");
  expectString(
    ["selfTestExport", "self_test_export"],
    selfTestExport,
    "selfTestExport",
  );
  expectString(
    ["proofBackend", "proof_backend"],
    expectedProofBackend,
    `${direction} proofBackend`,
  );
  expectString(
    ["requiredProofBackend", "required_proof_backend"],
    expectedProofBackend,
    `${direction} requiredProofBackend`,
  );
  if (destination) {
    expectString(
      ["destinationVerifierPlan", "destination_verifier_plan"],
      SOLANA_DESTINATION_VERIFIER_PLAN,
      "destinationVerifierPlan",
    );
    expectString(
      ["verifierTarget", "verifier_target"],
      SOLANA_VERIFIER_TARGET,
      "verifierTarget",
    );
  }
  expectNumber(
    ["sourceDomain", "source_domain"],
    destination ? SCCP_SORA_DOMAIN : SCCP_SOLANA_DOMAIN,
    "sourceDomain",
  );
  expectNumber(
    ["targetDomain", "target_domain"],
    destination ? SCCP_SOLANA_DOMAIN : SCCP_SORA_DOMAIN,
    "targetDomain",
  );
  expectBoolean(
    ["productionProofsReady", "production_proofs_ready"],
    true,
    "productionProofsReady",
  );
  if (
    Object.prototype.hasOwnProperty.call(sidecar, "knownAnswerProbe") ||
    Object.prototype.hasOwnProperty.call(sidecar, "known_answer_probe")
  ) {
    errors.push("Legacy prover-returned known-answer metadata is forbidden.");
  }
  errors.push(
    ...validateSolanaProverKnownAnswerSummary({
      direction,
      summary: sidecar.knownAnswer,
    }),
  );
  errors.push(
    ...validateGovernanceApprovalBinding({
      sidecar,
      direction,
      moduleHash,
      expectedApprovalSha256,
      approvalValidation,
    }),
  );
  return errors;
};

export const runLocalProverSelfTest = ({
  moduleUrl,
  proveExport,
  selfTestExport,
  expectedApprovalSha256,
  approvalValidation = null,
  approvalErrors = [],
  approvalSummary = null,
}) => {
  const moduleFile = localPublicModuleFile(moduleUrl);
  if (!moduleFile) {
    return null;
  }
  let moduleBytes;
  try {
    moduleBytes = readStableRegularFileSync(moduleFile, {
      label: "Solana prover module",
      root: path.join(repoRoot, "public"),
    });
  } catch (error) {
    return {
      inspected: true,
      moduleFile,
      exists: error?.code !== "ENOENT",
      exportsOk: false,
      ready: false,
      error:
        error?.code === "ENOENT"
          ? "Local Solana prover module file is missing."
          : "Local Solana prover module failed safe regular-file validation, including symbolic link rejection.",
    };
  }
  const moduleHash = hexSha256Bytes(moduleBytes);
  const sidecarRead = readSidecar(moduleUrl);
  const direction = proveExport.includes("Destination")
    ? "destination"
    : "source";
  const rawApprovalErrors = Array.isArray(approvalErrors)
    ? approvalErrors.filter((error) => typeof error === "string" && error)
    : ["invalid-approval-errors"];
  const rawSidecarReadErrors = Array.isArray(sidecarRead.sidecarErrors)
    ? sidecarRead.sidecarErrors.filter(
        (error) => typeof error === "string" && error,
      )
    : ["invalid-sidecar-read-errors"];
  const rawSidecarValidationErrors = validateSolanaSccpProverSidecar({
    sidecar: sidecarRead.sidecar,
    direction,
    moduleUrl,
    moduleHash,
    proveExport,
    selfTestExport,
    expectedApprovalSha256,
    approvalValidation,
  });
  const rawSidecarErrors = [
    ...rawApprovalErrors,
    ...rawSidecarReadErrors,
    ...rawSidecarValidationErrors,
  ];
  const sidecarApprovalOnlyFailure =
    rawSidecarValidationErrors.length > 0 &&
    rawSidecarValidationErrors.every((error) =>
      /(?:exact prover.*approval|governance approval|GOVERNANCE_APPROVAL_(?:FILE|SHA256))/iu.test(
        error,
      ),
    );
  const productionPackageFailure = rawSidecarValidationErrors.some((error) =>
    SOLANA_PROVER_PACKAGE_SIDECAR_ERRORS.has(error),
  );
  const sidecarErrors = [
    ...(rawApprovalErrors.length > 0
      ? ["Canonical exact prover governance approval validation failed."]
      : []),
    ...(rawSidecarReadErrors.length > 0
      ? [
          rawSidecarReadErrors.includes(
            "Solana prover sidecar file is missing.",
          )
            ? "Solana prover sidecar file is missing."
            : "Solana prover sidecar could not be read safely.",
        ]
      : []),
    ...(rawSidecarValidationErrors.length > 0
      ? ["Solana prover sidecar validation failed."]
      : []),
  ];
  const sidecarBinding = sidecarRead.sidecar?.governanceApprovalBinding;
  const publicGovernanceBinding =
    rawSidecarErrors.length === 0 && isRecord(sidecarBinding)
      ? Object.fromEntries(
          [
            "schema",
            "ready",
            "direction",
            "approvalId",
            "approvalSha256",
            "expectedApprovalSha256",
            "governancePlanCanonicalSha256",
            "orderedInitializationEvidenceSha256",
            "approvedModuleHash",
            "approvedVectorHash",
            "moduleHash",
            "vectorHash",
            "errors",
          ].map((key) => [key, sidecarBinding[key] ?? null]),
        )
      : null;
  const approvalSummaryReady = approvalSummary?.ready === true;
  const publicGovernanceApproval = isRecord(approvalSummary)
    ? {
        schema:
          approvalSummary.schema ===
          "iroha-sccp-solana-production-prover-approval-validation/v1"
            ? approvalSummary.schema
            : null,
        ready: approvalSummaryReady,
        approvalId:
          approvalSummaryReady &&
          typeof approvalSummary.approvalId === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(
            approvalSummary.approvalId,
          )
            ? approvalSummary.approvalId
            : null,
        approvalSha256: validPublicSha256(approvalSummary.approvalSha256)
          ? approvalSummary.approvalSha256
          : null,
        expectedApprovalSha256: validPublicSha256(
          approvalSummary.expectedApprovalSha256,
        )
          ? approvalSummary.expectedApprovalSha256
          : null,
        blockerIds:
          !approvalSummaryReady &&
          Array.isArray(approvalSummary.blockerIds) &&
          approvalSummary.blockerIds.length > 0
            ? ["solana-exact-prover-approval-invalid"]
            : [],
      }
    : null;
  const publicInspectionBase = {
    moduleFile,
    moduleHash,
    sidecarUrl: sidecarRead.sidecarUrl,
    sidecarFile: sidecarRead.sidecarFile,
    sidecarHash: sidecarRead.sidecarHash ?? null,
    productionPackageFailure,
    sidecarApprovalOnlyFailure,
    governanceApprovalBinding: publicGovernanceBinding,
    governanceApproval: publicGovernanceApproval,
  };
  if (rawSidecarErrors.length > 0) {
    return {
      ...publicInspectionBase,
      sidecarReady: false,
      sidecarErrors,
      inspected: true,
      exists: true,
      exportsOk: false,
      executionSkipped: true,
      ready: false,
      selfTest: null,
      proofProbe: null,
      error:
        "Solana prover execution was skipped until its public approval and sidecar validate.",
    };
  }
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      `
import { readFileSync } from "node:fs";
const [proveExport, selfTestExport, probeSpecifier, direction] = process.argv.slice(1);
try {
  const payload = JSON.parse(readFileSync(0, "utf8"));
  const { invokeSolanaProverKnownAnswer } = await import(probeSpecifier);
  const module = await import(\`data:text/javascript;base64,\${payload.moduleBase64}\`);
  const knownAnswer = payload.knownAnswer;
  const exportsOk = typeof module[proveExport] === "function" && typeof module[selfTestExport] === "function";
  const selfTest = typeof module[selfTestExport] === "function" ? await module[selfTestExport]() : null;
  const proofProbe = await invokeSolanaProverKnownAnswer({
    direction,
    prove: module[proveExport],
    vector: knownAnswer?.vector,
    governance: knownAnswer?.governance,
    artifactEvidence: knownAnswer?.artifactEvidence,
  });
  console.log(JSON.stringify({ inspected: true, exists: true, exportsOk, ready: selfTest?.ready === true && proofProbe.ready === true, selfTest, proofProbe }));
} catch (error) {
  console.log(JSON.stringify({ inspected: true, exists: true, exportsOk: false, ready: false, errorCategory: "execution-failed" }));
  process.exitCode = 1;
}
`,
      proveExport,
      selfTestExport,
      pathToFileURL(
        path.join(repoRoot, "scripts/sccp-solana-prover-known-answer.mjs"),
      ).href,
      direction,
    ],
    {
      encoding: "utf8",
      env: proverChildEnvironment(),
      input: JSON.stringify({
        moduleBase64: moduleBytes.toString("base64"),
        knownAnswer: sidecarRead.sidecar?.knownAnswer ?? null,
      }),
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 20_000,
    },
  );
  const outputLines = result.stdout.trim().split(/\r?\n/u).filter(Boolean);
  const outputJson = outputLines.at(-1);
  let parsed;
  if (outputJson) {
    try {
      parsed = JSON.parse(outputJson);
    } catch (error) {
      parsed = {
        inspected: true,
        exists: true,
        exportsOk: false,
        ready: false,
        errorCategory: "invalid-json",
      };
    }
  } else {
    parsed = {
      inspected: true,
      exists: true,
      exportsOk: false,
      ready: false,
      errorCategory: "no-output",
    };
  }
  if (result.status !== 0 && !parsed.errorCategory) {
    parsed.errorCategory = "execution-failed";
  }
  const publicSelfTest = isRecord(parsed.selfTest)
    ? {
        ready: parsed.selfTest.ready === true,
        linked: parsed.selfTest.linked === true,
        productionProofsReady:
          parsed.selfTest.productionProofsReady === true ||
          parsed.selfTest.production_proofs_ready === true,
      }
    : null;
  const publicProofProbe = isRecord(parsed.proofProbe)
    ? {
        ready: parsed.proofProbe.ready === true,
        invoked: parsed.proofProbe.invoked === true,
        errors:
          Array.isArray(parsed.proofProbe.errors) &&
          parsed.proofProbe.errors.length > 0
            ? ["Solana prover known-answer probe failed."]
            : [],
        vectorHash: validPublicSha256(parsed.proofProbe.vectorHash)
          ? parsed.proofProbe.vectorHash
          : null,
        packageHash: validPublicSha256(parsed.proofProbe.packageHash)
          ? parsed.proofProbe.packageHash
          : null,
      }
    : null;
  return {
    ...publicInspectionBase,
    sidecarReady: sidecarErrors.length === 0,
    sidecarErrors,
    inspected: parsed.inspected === true,
    exists: parsed.exists === true,
    exportsOk: parsed.exportsOk === true,
    ready: parsed.ready === true && sidecarErrors.length === 0,
    selfTest: publicSelfTest,
    proofProbe: publicProofProbe,
    ...(parsed.errorCategory
      ? { error: "Solana prover self-test execution failed." }
      : {}),
  };
};

const proverModuleCheck = ({
  id,
  label,
  env,
  envAliases = [],
  configuredEnv = null,
  value,
  defaultValue = null,
  defaultSource = "bundled-default",
  inspection = null,
}) => {
  try {
    const usingDefault = value === undefined || value === null;
    const moduleUrl = normalizeSccpBrowserModuleUrl(
      usingDefault ? defaultValue : value,
      label,
    );
    const configured = Boolean(moduleUrl);
    const inspectionReady =
      inspection != null &&
      inspection.ready === true &&
      inspection.exportsOk === true &&
      inspection.sidecarReady === true &&
      inspection.proofProbe?.ready === true &&
      inspection.proofProbe?.invoked === true &&
      inspection.governanceApprovalBinding?.ready === true &&
      inspection.governanceApproval?.ready === true;
    const ok = configured && inspectionReady;
    const inspectionReason =
      inspection == null
        ? "module package and sidecar were not inspected"
        : inspectionReady !== true
          ? inspection.sidecarErrors?.[0] ||
            inspection.proofProbe?.errors?.[0] ||
            inspection.selfTest?.reason ||
            (inspection.proofProbe == null
              ? "known-answer prove export was not invoked"
              : null) ||
            inspection.error ||
            null
          : null;
    const normalizedReason = inspectionReason
      ? trimString(inspectionReason).replace(/\.+$/u, "")
      : "self-test failed";
    const configuredSource = usingDefault ? defaultSource : "runtime";
    const notReadyDetail = usingDefault
      ? `${label} is using ${solanaProverFallbackLabel(configuredSource)} but not ready: ${normalizedReason}.`
      : `${label} is configured but not ready: ${normalizedReason}.`;
    return makeCheck(
      id,
      ok,
      !moduleUrl
        ? `${env} is required.`
        : ok
          ? `${label} is configured and ready.`
          : notReadyDetail,
      {
        env,
        envAliases,
        configuredEnv,
        configured,
        usingDefault,
        configuredSource,
        moduleUrl,
        inspection,
      },
    );
  } catch (error) {
    return makeCheck(
      id,
      false,
      error instanceof Error ? error.message : String(error),
      {
        env,
        envAliases,
        configuredEnv,
        configured: true,
        usingDefault: false,
        moduleUrl: null,
        inspection: null,
      },
    );
  }
};

const SOLANA_PROVER_PACKAGE_SIDECAR_ERRORS = new Set([
  "productionProofsReady must be true.",
  `destination proofBackend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
  `destination requiredProofBackend must be ${SOLANA_DESTINATION_PROOF_BACKEND}.`,
  `source proofBackend must be ${SOLANA_SOURCE_PROOF_BACKEND}.`,
  `source requiredProofBackend must be ${SOLANA_SOURCE_PROOF_BACKEND}.`,
  `genesisHash must be ${SOLANA_TESTNET_GENESIS_HASH}.`,
  `destinationVerifierPlan must be ${SOLANA_DESTINATION_VERIFIER_PLAN}.`,
  `verifierTarget must be ${SOLANA_VERIFIER_TARGET}.`,
]);

const proverFailureNeedsProductionPackages = (failedCheckRecords) =>
  failedCheckRecords
    .filter((check) =>
      ["destination-prover-module-url", "source-prover-module-url"].includes(
        check.id,
      ),
    )
    .some((check) => {
      const inspection = check.evidence?.inspection;
      return (
        check.evidence?.configured === true &&
        inspection?.exists === true &&
        (inspection?.exportsOk === true ||
          inspection?.productionPackageFailure === true) &&
        (inspection?.productionPackageFailure === true ||
          inspection?.selfTest?.ready === false ||
          (inspection?.sidecarErrors ?? []).some((error) =>
            SOLANA_PROVER_PACKAGE_SIDECAR_ERRORS.has(error),
          ))
      );
    });

const proverFailureNeedsExactApproval = (failedCheckRecords) =>
  failedCheckRecords
    .filter((check) =>
      ["destination-prover-module-url", "source-prover-module-url"].includes(
        check.id,
      ),
    )
    .some((check) => {
      const inspection = check.evidence?.inspection;
      return (
        (isRecord(inspection?.governanceApproval) &&
          inspection.governanceApproval.ready !== true) ||
        (inspection?.sidecarErrors ?? []).some((error) =>
          /exact prover governance approval|GOVERNANCE_APPROVAL_(?:FILE|SHA256)/iu.test(
            error,
          ),
        )
      );
    });

const exactApprovalSidecarError = (error) =>
  typeof error === "string" &&
  /(?:exact prover governance approval|canonical (?:exact prover )?governance approval|canonical approval descriptor|GOVERNANCE_APPROVAL_(?:FILE|SHA256))/iu.test(
    error,
  );

const proverFailureNeedsModuleAction = (failedCheckRecords) =>
  failedCheckRecords
    .filter((check) =>
      ["destination-prover-module-url", "source-prover-module-url"].includes(
        check.id,
      ),
    )
    .some((check) => {
      const inspection = check.evidence?.inspection;
      if (
        inspection?.executionSkipped === true &&
        inspection?.sidecarApprovalOnlyFailure === true &&
        inspection?.governanceApproval?.ready !== true
      ) {
        return false;
      }
      const sidecarErrors = Array.isArray(inspection?.sidecarErrors)
        ? inspection.sidecarErrors
        : [];
      return (
        check.evidence?.configured !== true ||
        inspection == null ||
        inspection.exists !== true ||
        inspection.exportsOk !== true ||
        inspection.selfTest?.ready !== true ||
        inspection.proofProbe?.ready !== true ||
        inspection.proofProbe?.invoked !== true ||
        sidecarErrors.some((error) => !exactApprovalSidecarError(error))
      );
    });

const proverCheckRootCauseBlockerId = (check) => {
  if (
    check?.id !== "destination-prover-module-url" &&
    check?.id !== "source-prover-module-url"
  ) {
    return null;
  }
  const inspection = check.evidence?.inspection;
  const needsProductionPackage =
    check.evidence?.configured === true &&
    inspection?.exists === true &&
    (inspection?.exportsOk === true ||
      inspection?.productionPackageFailure === true) &&
    (inspection?.selfTest?.ready === false ||
      inspection?.productionPackageFailure === true ||
      (inspection?.sidecarErrors ?? []).some((error) =>
        SOLANA_PROVER_PACKAGE_SIDECAR_ERRORS.has(error),
      ));
  if (!needsProductionPackage) {
    return check.id;
  }
  return check.id === "destination-prover-module-url"
    ? "solana-destination-production-prover-package"
    : "solana-source-production-prover-package";
};

const smokeRootCauseBlockerIds = (failedCheckRecords) => {
  const needsApproval = proverFailureNeedsExactApproval(failedCheckRecords);
  const needsModuleAction = proverFailureNeedsModuleAction(failedCheckRecords);
  return [
    ...new Set(
      [
        ...(needsApproval ? ["solana-exact-prover-governance-approval"] : []),
        ...failedCheckRecords.flatMap((check) => {
          if (check.id === "route-preflight") {
            return ["solana-public-route-report"];
          }
          if (
            needsApproval &&
            !needsModuleAction &&
            [
              "destination-prover-module-url",
              "source-prover-module-url",
            ].includes(check.id)
          ) {
            return [];
          }
          const proverRootCause = proverCheckRootCauseBlockerId(check);
          return [proverRootCause || check.id];
        }),
      ].filter(Boolean),
    ),
  ];
};

const nextActionsForFailedChecks = (
  failedCheckIds,
  failedCheckRecords = [],
) => {
  const actions = [];
  const failed = (id) => failedCheckIds.has(id);
  if (failed("route-preflight")) {
    actions.push(
      smokeAction({
        id: "refresh-solana-route-preflight",
        title: "Refresh Solana route preflight",
        detail:
          "Publish the production TAIRA/Solana route evidence, then rerun the read-only public route preflight.",
        requiredInputs: [
          smokeRequiredInput(
            "solana-public-route-report",
            "file",
            "<solana-route-preflight-report.json>",
            "Fresh public route preflight report proving taira_sol_xor is production-ready on TAIRA.",
          ),
        ],
        blockedByChecks: ["route-preflight"],
        commands: ["npm run e2e:sccp:solana-preflight"],
      }),
    );
  }
  if (failed("walletconnect-project-id")) {
    actions.push(
      smokeAction({
        id: "configure-solana-walletconnect",
        title: "Configure Solana WalletConnect",
        detail:
          "Provide a WalletConnect project id so the UI can request Solana wallet approvals for live smoke transfers.",
        requiredInputs: [
          smokeRequiredInput(
            "walletconnect-project-id",
            "operator-environment",
            "<walletconnect-project-id>",
            `${WALLETCONNECT_PROJECT_ID_ENV} configured outside report files for Solana wallet approval flows.`,
          ),
        ],
        blockedByChecks: ["walletconnect-project-id"],
        commands: [
          `${WALLETCONNECT_PROJECT_ID_ENV}=<walletconnect-project-id> npm run e2e:sccp:solana-smoke-readiness`,
        ],
      }),
    );
  }
  if (
    failed("destination-prover-module-url") ||
    failed("source-prover-module-url")
  ) {
    const failedProverCheckIds = [
      "destination-prover-module-url",
      "source-prover-module-url",
    ].filter(failed);
    if (proverFailureNeedsExactApproval(failedCheckRecords)) {
      actions.push(
        smokeAction({
          id: "provide-solana-exact-prover-approval",
          title: "Provide the exact prover approval",
          detail:
            "Provide the canonical public exact prover approval descriptor and its independently distributed SHA-256; sidecar-reported values cannot supply either trust input.",
          requiredInputs: [
            smokeRequiredInput(
              "solana-exact-prover-approval-file",
              "public-canonical-json",
              "<canonical-public-exact-prover-approval.json>",
              `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV} containing canonical exact approval bytes.`,
            ),
            smokeRequiredInput(
              "solana-exact-prover-approval-sha256",
              "independent-public-hash",
              "0x<independently-distributed-approval-sha256>",
              `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV} supplied independently of the descriptor and sidecars.`,
            ),
          ],
          blockedByChecks: failedProverCheckIds,
          commands: [
            `${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV}=<canonical-public-exact-prover-approval.json> ${SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV}=0x<independently-distributed-approval-sha256> npm run e2e:sccp:solana-smoke-readiness`,
          ],
        }),
      );
    }
    if (proverFailureNeedsModuleAction(failedCheckRecords)) {
      const needsProductionPackages =
        proverFailureNeedsProductionPackages(failedCheckRecords);
      actions.push(
        smokeAction({
          id: needsProductionPackages
            ? "publish-solana-production-prover-packages"
            : "publish-solana-prover-modules",
          title: needsProductionPackages
            ? "Publish governed Solana prover packages"
            : "Publish Solana browser prover modules",
          detail: needsProductionPackages
            ? "Replace fail-closed placeholder Solana destination/source prover modules with governed browser-safe packages whose sidecars set productionProofsReady=true and whose self-tests pass."
            : "Publish browser-safe Solana destination and source proof modules and point the renderer at deterministic package-relative, HTTPS, or loopback URLs.",
          requiredInputs: needsProductionPackages
            ? [
                smokeRequiredInput(
                  "solana-destination-production-prover-package",
                  "browser-module-package",
                  "<destination-solana-production-prover-module-and-sidecar>",
                  `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV} plus a matching sidecar with productionProofsReady=true for TAIRA -> Solana finalize proof construction.`,
                ),
                smokeRequiredInput(
                  "solana-source-production-prover-package",
                  "browser-module-package",
                  "<source-solana-production-prover-module-and-sidecar>",
                  `${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV} plus a matching sidecar with productionProofsReady=true for Solana -> TAIRA source proof construction.`,
                ),
              ]
            : [
                smokeRequiredInput(
                  "solana-destination-browser-prover-module",
                  "browser-module-url",
                  "<destination-solana-prover-module-url>",
                  `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV} for TAIRA -> Solana finalize proof construction.`,
                ),
                smokeRequiredInput(
                  "solana-source-browser-prover-module",
                  "browser-module-url",
                  "<source-solana-prover-module-url>",
                  `${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV} for Solana -> TAIRA source proof construction.`,
                ),
              ],
          blockedByChecks: failedProverCheckIds,
          commands: [
            `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV}=<destination-solana-prover-module-url> ${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV}=<source-solana-prover-module-url> npm run e2e:sccp:solana-smoke-readiness`,
          ],
        }),
      );
    }
  }
  return actions;
};

export const evaluateSolanaSccpLiveSmokeReadiness = ({
  routePreflight = null,
  routePreflightPath = null,
  routePreflightError = null,
  walletConnectProjectId = process.env[WALLETCONNECT_PROJECT_ID_ENV],
  destinationProverModuleUrl = solanaDestinationProverModuleUrlFromEnv().value,
  destinationProverModuleEnv = solanaDestinationProverModuleUrlFromEnv()
    .envName,
  sourceProverModuleUrl = process.env[SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV],
  sourceProverModuleEnv = process.env[
    SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV
  ] === undefined
    ? null
    : SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
  destinationProverInspection = null,
  sourceProverInspection = null,
  checkedAt = new Date().toISOString(),
} = {}) => {
  const checks = [
    routePreflightCheck({
      routePreflight,
      routePreflightPath,
      routePreflightError,
    }),
    walletConnectCheck(walletConnectProjectId),
    proverModuleCheck({
      id: "destination-prover-module-url",
      label: "Solana destination prover module URL",
      env: SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
      envAliases: [],
      configuredEnv: destinationProverModuleEnv,
      value: destinationProverModuleUrl,
      defaultValue: DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
      defaultSource: "bundled-default",
      inspection: destinationProverInspection,
    }),
    proverModuleCheck({
      id: "source-prover-module-url",
      label: "Solana source prover module URL",
      env: SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
      configuredEnv: sourceProverModuleEnv,
      value: sourceProverModuleUrl,
      defaultValue: DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
      defaultSource: "bundled-default",
      inspection: sourceProverInspection,
    }),
  ];
  const failedBeforeRunbook = failedChecks(checks);
  const failedCheckIds = new Set(failedBeforeRunbook.map((check) => check.id));
  const nextActions = nextActionsForFailedChecks(
    failedCheckIds,
    failedBeforeRunbook,
  );
  const requiredInputs = missingProductionInputs(nextActions);
  const runbookProblems = solanaSccpLiveSmokeReadinessRunbookProblems({
    failedCheckIds,
    nextActions,
    missingProductionInputs: requiredInputs,
  });
  checks.push(
    makeCheck(
      "smoke-readiness-runbook-contract",
      runbookProblems.length === 0,
      runbookProblems.length === 0
        ? "Solana live smoke-readiness exposes a complete operator runbook."
        : runbookProblems.join("; "),
      { problems: runbookProblems },
    ),
  );
  const failed = failedChecks(checks);
  const failedCheckIdList = failed.map((check) => check.id);
  const rootCauseBlockerIds = smokeRootCauseBlockerIds(failedBeforeRunbook);
  const nextActionIds = nextActions.map((action) => action.id);
  const missingProductionInputIds = requiredInputs.map((input) => input.id);
  return {
    schema: "iroha-demo-sccp-solana-live-smoke-readiness/v1",
    checkedAt,
    ready: failed.length === 0,
    routeId: SCCP_SOLANA_XOR_ROUTE_ID,
    assetKey: SCCP_XOR_ASSET_KEY,
    solana: {
      network: SOLANA_TESTNET_NETWORK_ID,
      caipChainId: SOLANA_TESTNET_CAIP_CHAIN_ID,
      genesisHash: SOLANA_TESTNET_GENESIS_HASH,
    },
    checks,
    failedCheckIds: failedCheckIdList,
    blockerIds: failedCheckIdList,
    rootCauseBlockerIds,
    nextActions,
    nextActionIds,
    missingProductionInputs: requiredInputs,
    missingProductionInputIds,
    requiredLiveSmokeSteps: SCCP_SOLANA_LIVE_SMOKE_STEPS,
  };
};

export const runSolanaSccpLiveSmokeReadiness = async ({
  toriiUrl = DEFAULT_TAIRA_TORII_URL,
  solanaRpcUrl = DEFAULT_SOLANA_TESTNET_RPC_URL,
  outputDir = DEFAULT_OUTPUT_DIR,
  manifestFile = undefined,
  skipSolanaRpc = true,
  envRoot = repoRoot,
  envMode = process.env.SCCP_SOLANA_SMOKE_ENV_MODE ||
    process.env.MODE ||
    process.env.NODE_ENV ||
    "test",
  walletConnectProjectId = undefined,
  destinationProverModuleUrl = undefined,
  sourceProverModuleUrl = undefined,
  proverGovernanceApprovalFile = undefined,
  proverGovernanceApprovalSha256 = undefined,
  routePreflight: suppliedRoutePreflight = undefined,
  routePreflightPath: suppliedRoutePreflightPath = null,
  routePreflightError: suppliedRoutePreflightError = null,
  fetchTimeoutMs = undefined,
  fetchAttempts = undefined,
} = {}) => {
  loadSolanaSccpSmokeEnvFiles({ root: envRoot, mode: envMode });
  const resolvedWalletConnectProjectId =
    walletConnectProjectId ?? process.env[WALLETCONNECT_PROJECT_ID_ENV];
  const destinationEnv = solanaDestinationProverModuleUrlFromEnv();
  const resolvedDestinationProverModuleUrl =
    destinationProverModuleUrl ?? destinationEnv.value;
  const resolvedDestinationProverModuleEnv =
    destinationProverModuleUrl === undefined
      ? destinationEnv.envName
      : "argument";
  const resolvedSourceProverModuleUrl =
    sourceProverModuleUrl ??
    process.env[SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV];
  const resolvedSourceProverModuleEnv =
    sourceProverModuleUrl === undefined
      ? process.env[SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV] === undefined
        ? null
        : SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV
      : "argument";
  const resolvedProverGovernanceApprovalSha256 =
    proverGovernanceApprovalSha256 ??
    process.env[SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV];
  const resolvedProverGovernanceApprovalFile =
    proverGovernanceApprovalFile ??
    process.env[SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV];
  const proverGovernanceApproval = await loadSolanaExactProverApprovalForSmoke({
    file: resolvedProverGovernanceApprovalFile,
    expectedApprovalSha256: resolvedProverGovernanceApprovalSha256,
  });
  let routePreflight = suppliedRoutePreflight ?? null;
  let routePreflightPath = suppliedRoutePreflightPath;
  let routePreflightError = suppliedRoutePreflightError;
  if (suppliedRoutePreflight === undefined) {
    try {
      const result = await runSccpSolanaRoutePreflight({
        toriiUrl,
        solanaRpcUrl,
        manifestFile,
        outputDir: path.join(outputDir, "preflight"),
        fetchTimeoutMs,
        fetchAttempts,
        skipSolanaRpc,
      });
      routePreflight = result.report;
      routePreflightPath = result.reportPath;
    } catch (error) {
      routePreflightError =
        error instanceof Error ? error.message : String(error);
    }
  }
  const destinationProverModuleUrlForInspection = selectSolanaProverModuleUrl({
    runtimeValue: resolvedDestinationProverModuleUrl,
    bundledDefault: DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
  });
  const sourceProverModuleUrlForInspection = selectSolanaProverModuleUrl({
    runtimeValue: resolvedSourceProverModuleUrl,
    bundledDefault: DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
  });
  const normalizedDestinationProverModuleUrl = normalizeSccpBrowserModuleUrl(
    destinationProverModuleUrlForInspection,
    "Solana destination prover module URL",
  );
  const normalizedSourceProverModuleUrl = normalizeSccpBrowserModuleUrl(
    sourceProverModuleUrlForInspection,
    "Solana source prover module URL",
  );
  const report = evaluateSolanaSccpLiveSmokeReadiness({
    routePreflight,
    routePreflightPath,
    routePreflightError,
    walletConnectProjectId: resolvedWalletConnectProjectId,
    destinationProverModuleUrl: resolvedDestinationProverModuleUrl,
    destinationProverModuleEnv: resolvedDestinationProverModuleEnv,
    sourceProverModuleUrl: resolvedSourceProverModuleUrl,
    sourceProverModuleEnv: resolvedSourceProverModuleEnv,
    destinationProverInspection: runLocalProverSelfTest({
      moduleUrl: normalizedDestinationProverModuleUrl,
      proveExport: "proveSolanaSccpDestination",
      selfTestExport: "solanaSccpDestinationProverSelfTest",
      expectedApprovalSha256: resolvedProverGovernanceApprovalSha256,
      approvalValidation: proverGovernanceApproval.validation,
      approvalErrors: proverGovernanceApproval.errors,
      approvalSummary: proverGovernanceApproval.publicSummary,
    }),
    sourceProverInspection: runLocalProverSelfTest({
      moduleUrl: normalizedSourceProverModuleUrl,
      proveExport: "proveSolanaSccpSource",
      selfTestExport: "solanaSccpSourceProverSelfTest",
      expectedApprovalSha256: resolvedProverGovernanceApprovalSha256,
      approvalValidation: proverGovernanceApproval.validation,
      approvalErrors: proverGovernanceApproval.errors,
      approvalSummary: proverGovernanceApproval.publicSummary,
    }),
  });
  const reportPath = await writeAtomicJsonFile(
    path.join(outputDir, "latest.json"),
    report,
  );
  return { report, reportPath };
};

export const parseArgs = (argv) =>
  parseStrictCliArgs(argv, {
    booleanFlags: ["help"],
    optionalBooleanFlags: [
      "skip-solana-rpc",
      "allow-incomplete",
      "allow-not-ready",
    ],
    valueFlags: [
      "torii-url",
      "solana-rpc-url",
      "manifest-file",
      "output-dir",
      "walletconnect-project-id",
      "destination-prover-module-url",
      "source-prover-module-url",
      "prover-governance-approval",
      "prover-governance-approval-sha256",
      "env-mode",
      "fetch-timeout-ms",
      "fetch-attempts",
    ],
  });

const usage = () => {
  console.log(`Usage: node scripts/e2e/sccp-solana-live-smoke-readiness.mjs [options]

Read-only app readiness gate for real TAIRA <-> Solana SCCP smoke transfers.

Options:
  --torii-url URL                      TAIRA Torii endpoint
  --solana-rpc-url URL                 Solana testnet RPC endpoint
  --manifest-file PATH                 Optional local manifest; public route still must pass for ready=true
  --output-dir PATH                    Output directory (default: output/sccp-solana-smoke-readiness)
  --walletconnect-project-id ID        WalletConnect project ID
  --destination-prover-module-url URL  Browser-safe Solana destination prover module URL
  --source-prover-module-url URL       Browser-safe Solana source prover module URL
  --prover-governance-approval PATH   Canonical public exact prover approval descriptor
  --prover-governance-approval-sha256 HASH
                                      Independent public SHA-256 pin for the exact prover approval
  --env-mode MODE                      Vite env mode to load from .env files (default: test)
  --fetch-timeout-ms MS                Per-request fetch timeout for fresh public reads
  --fetch-attempts N                   Per-request retry attempts for fresh public reads
  --skip-solana-rpc [true|false]       Skip Solana RPC health/readback checks during route preflight
  --allow-incomplete [true|false]      Write latest.json and exit 0 even when not ready
  --allow-not-ready [true|false]       Alias for --allow-incomplete
  --help                               Show this help
`);
};

const optionalArgOrEnv = (args, argName, envName) =>
  Object.prototype.hasOwnProperty.call(args, argName)
    ? args[argName]
    : process.env[envName];

const optionalArgOrEnvs = (args, argName, envNames) => {
  if (Object.prototype.hasOwnProperty.call(args, argName)) {
    return args[argName];
  }
  return optionalEnvValue(process.env, envNames).value;
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  const { report, reportPath } = await runSolanaSccpLiveSmokeReadiness({
    toriiUrl: args["torii-url"] || process.env.TAIRA_TORII_URL,
    solanaRpcUrl:
      args["solana-rpc-url"] || process.env.SCCP_SOLANA_TESTNET_RPC_URL,
    outputDir: args["output-dir"] || DEFAULT_OUTPUT_DIR,
    manifestFile: args["manifest-file"],
    fetchTimeoutMs: args["fetch-timeout-ms"],
    fetchAttempts: args["fetch-attempts"],
    envMode: args["env-mode"],
    skipSolanaRpc:
      args["skip-solana-rpc"] === undefined
        ? true
        : readBooleanArg(args["skip-solana-rpc"]),
    walletConnectProjectId: optionalArgOrEnv(
      args,
      "walletconnect-project-id",
      WALLETCONNECT_PROJECT_ID_ENV,
    ),
    destinationProverModuleUrl: optionalArgOrEnvs(
      args,
      "destination-prover-module-url",
      [SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV],
    ),
    sourceProverModuleUrl: optionalArgOrEnv(
      args,
      "source-prover-module-url",
      SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
    ),
    proverGovernanceApprovalFile: optionalArgOrEnv(
      args,
      "prover-governance-approval",
      SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_FILE_ENV,
    ),
    proverGovernanceApprovalSha256: optionalArgOrEnv(
      args,
      "prover-governance-approval-sha256",
      SCCP_SOLANA_PROVER_GOVERNANCE_APPROVAL_SHA256_ENV,
    ),
  });
  console.log(`Solana SCCP smoke-readiness report: ${reportPath}`);
  for (const check of failedChecks(report.checks)) {
    console.error(`- ${check.id}: ${check.detail}`);
  }
  if (
    !report.ready &&
    !readBooleanArg(args["allow-incomplete"]) &&
    !readBooleanArg(args["allow-not-ready"])
  ) {
    process.exitCode = 1;
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
