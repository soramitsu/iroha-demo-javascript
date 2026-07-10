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
export const SCCP_SOLANA_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_SOLANA_PROVER_MODULE_URL";
export const SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL";
export const DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-destination-prover.js";
export const DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL =
  "/sccp-solana/taira-solana-xor-source-prover.js";
const SOLANA_PROVER_SIDECAR_SCHEMA =
  "iroha-demo-sccp-solana-browser-prover-sidecar/v1";
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

const parseEnvFile = (file) => {
  const entries = [];
  const bytes = readStableRegularFileSync(file, {
    label: "Solana SCCP smoke environment file",
    maxBytes: DEFAULT_SOLANA_TEXT_MAX_BYTES,
    root: path.dirname(file),
  });
  for (const line of bytes.toString("utf8").split(/\r?\n/u)) {
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
      if (preexistingKeys.has(key)) {
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

const routePreflightCheckEvidence = (routePreflight, id) =>
  Array.isArray(routePreflight?.checks)
    ? routePreflight.checks.find((check) => check?.id === id)?.evidence
    : null;

const routePreflightBrowserProofModules = (routePreflight) => {
  const evidence = routePreflightCheckEvidence(
    routePreflight,
    "browser-proof-modules",
  );
  if (!isRecord(evidence)) {
    return null;
  }
  return {
    destinationModuleUrl: trimString(evidence.destinationModuleUrl),
    destinationModuleHash: trimString(evidence.destinationModuleHash),
    destinationSidecarHash: trimString(evidence.destinationSidecarHash),
    sourceModuleUrl: trimString(evidence.sourceModuleUrl),
    sourceModuleHash: trimString(evidence.sourceModuleHash),
    sourceSidecarHash: trimString(evidence.sourceSidecarHash),
  };
};

const routePublishedProverModuleUrl = (browserProofModules, key) => {
  const value = trimString(browserProofModules?.[key]);
  return value || null;
};

const solanaProverFallbackLabel = (source) =>
  source === "public-route"
    ? "the public route-published module"
    : "the bundled fail-closed default";

const selectSolanaProverModuleUrl = ({
  runtimeValue,
  routeValue,
  bundledDefault,
}) =>
  runtimeValue === undefined || runtimeValue === null
    ? routeValue || bundledDefault
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
  optionalEnvValue(env, [
    SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
    SCCP_SOLANA_PROVER_MODULE_URL_ENV,
  ]);

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
      routePreflightError || "Solana route preflight report is missing.",
      { routePreflightPath },
    );
  }
  const routeId = trimString(routePreflight.routeId);
  const assetKey = trimString(routePreflight.assetKey);
  const failed = failedPreflightChecks(routePreflight);
  const browserProofModules = routePreflightBrowserProofModules(routePreflight);
  const browserProofModulesReady =
    Boolean(browserProofModules?.destinationModuleUrl) &&
    Boolean(browserProofModules?.destinationModuleHash) &&
    Boolean(browserProofModules?.destinationSidecarHash) &&
    Boolean(browserProofModules?.sourceModuleUrl) &&
    Boolean(browserProofModules?.sourceModuleHash) &&
    Boolean(browserProofModules?.sourceSidecarHash);
  const solana = routePreflightSolanaBinding(routePreflight);
  const ready =
    routePreflight.ready === true &&
    routeId === SCCP_SOLANA_XOR_ROUTE_ID &&
    assetKey === SCCP_XOR_ASSET_KEY &&
    routePreflight.manifestSource === "public" &&
    solana.networkReady &&
    solana.caipChainReady &&
    solana.genesisReady &&
    browserProofModulesReady &&
    failed.length === 0;
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
        : routePreflight.ready === true && !browserProofModulesReady
          ? "Public TAIRA Solana route preflight is missing browser proof module or sidecar hash evidence."
          : "Public TAIRA Solana route preflight is not ready.",
    {
      routePreflightPath,
      checkedAt: trimString(routePreflight.checkedAt) || null,
      ready: routePreflight.ready === true,
      routeId,
      assetKey,
      manifestSource: routePreflight.manifestSource ?? null,
      solana,
      browserProofModules,
      failedChecks: failed,
      publicSolanaCapability: isRecord(routePreflight.publicSolanaCapability)
        ? routePreflight.publicSolanaCapability
        : null,
      publicSolanaLane: isRecord(routePreflight.publicSolanaLane)
        ? routePreflight.publicSolanaLane
        : null,
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

export const validateSolanaSccpProverSidecar = ({
  sidecar,
  direction,
  moduleUrl,
  moduleHash,
  proveExport,
  selfTestExport,
}) => {
  if (
    typeof sidecar !== "object" ||
    sidecar === null ||
    Array.isArray(sidecar)
  ) {
    return ["Solana prover sidecar is missing or not a JSON object."];
  }
  const errors = [];
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
  return errors;
};

export const runLocalProverSelfTest = ({
  moduleUrl,
  proveExport,
  selfTestExport,
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
          : error instanceof Error
            ? error.message
            : String(error),
    };
  }
  const moduleHash = hexSha256Bytes(moduleBytes);
  const sidecarRead = readSidecar(moduleUrl);
  const direction = proveExport.includes("Destination")
    ? "destination"
    : "source";
  const sidecarErrors = [
    ...(sidecarRead.sidecarErrors ?? []),
    ...validateSolanaSccpProverSidecar({
      sidecar: sidecarRead.sidecar,
      direction,
      moduleUrl,
      moduleHash,
      proveExport,
      selfTestExport,
    }),
  ];
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
  console.log(JSON.stringify({ inspected: true, exists: true, exportsOk: false, ready: false, error: error instanceof Error ? error.message : String(error) }));
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
        error:
          error instanceof Error
            ? `Solana prover self-test returned invalid JSON: ${error.message}`
            : "Solana prover self-test returned invalid JSON.",
      };
    }
  } else {
    parsed = {
      inspected: true,
      exists: true,
      exportsOk: false,
      ready: false,
      error: "Solana prover self-test produced no output.",
    };
  }
  if (result.status !== 0 && !parsed.error) {
    parsed.error = result.stderr || "Solana prover self-test failed.";
  }
  return {
    moduleFile,
    moduleHash,
    sidecarUrl: sidecarRead.sidecarUrl,
    sidecarFile: sidecarRead.sidecarFile,
    sidecarHash: sidecarRead.sidecarHash ?? null,
    sidecarReady: sidecarErrors.length === 0,
    sidecarErrors,
    ...parsed,
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
  expectedModuleUrl = "",
  expectedModuleHash = "",
  expectedSidecarHash = "",
}) => {
  try {
    const usingDefault = value === undefined || value === null;
    const moduleUrl = normalizeSccpBrowserModuleUrl(
      usingDefault ? defaultValue : value,
      label,
    );
    const configured = Boolean(moduleUrl);
    const moduleUrlMatchesRoute =
      !expectedModuleUrl || moduleUrl === expectedModuleUrl;
    const moduleHashMatchesRoute =
      !expectedModuleHash || inspection?.moduleHash === expectedModuleHash;
    const sidecarHashMatchesRoute =
      !expectedSidecarHash || inspection?.sidecarHash === expectedSidecarHash;
    const inspectionReady =
      inspection == null ||
      (inspection.ready === true &&
        inspection.exportsOk === true &&
        inspection.sidecarReady === true &&
        inspection.proofProbe?.ready === true &&
        inspection.proofProbe?.invoked === true);
    const ok =
      configured &&
      inspectionReady &&
      moduleUrlMatchesRoute &&
      moduleHashMatchesRoute &&
      sidecarHashMatchesRoute;
    let reason = null;
    if (!moduleUrlMatchesRoute) {
      reason = "module URL does not match public route preflight";
    } else if (inspection == null && expectedModuleHash) {
      reason = "module bytes were not inspected against public route preflight";
    } else if (!moduleHashMatchesRoute) {
      reason = "module hash does not match public route preflight";
    } else if (!sidecarHashMatchesRoute) {
      reason = "sidecar hash does not match public route preflight";
    }
    const inspectionReason =
      inspection && inspectionReady !== true
        ? inspection.sidecarErrors?.[0] ||
          inspection.proofProbe?.errors?.[0] ||
          inspection.selfTest?.reason ||
          (inspection.proofProbe == null
            ? "known-answer prove export was not invoked"
            : null) ||
          inspection.error ||
          null
        : null;
    const normalizedReason =
      reason || inspectionReason
        ? trimString(reason || inspectionReason).replace(/\.+$/u, "")
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
        expectedModuleUrl: expectedModuleUrl || null,
        expectedModuleHash: expectedModuleHash || null,
        expectedSidecarHash: expectedSidecarHash || null,
        moduleUrlMatchesRoute,
        moduleHashMatchesRoute,
        sidecarHashMatchesRoute,
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
        inspection?.exportsOk === true &&
        (inspection?.selfTest?.ready === false ||
          (inspection?.sidecarErrors ?? []).some((error) =>
            SOLANA_PROVER_PACKAGE_SIDECAR_ERRORS.has(error),
          ))
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
    inspection?.exportsOk === true &&
    (inspection?.selfTest?.ready === false ||
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

const smokeRootCauseBlockerIds = (failedCheckRecords) => [
  ...new Set(
    failedCheckRecords
      .flatMap((check) => {
        if (check.id === "route-preflight") {
          return ["solana-public-route-report"];
        }
        const proverRootCause = proverCheckRootCauseBlockerId(check);
        return [proverRootCause || check.id];
      })
      .filter(Boolean),
  ),
];

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
        blockedByChecks: [
          "destination-prover-module-url",
          "source-prover-module-url",
        ],
        commands: [
          `${SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV}=<destination-solana-prover-module-url> ${SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV}=<source-solana-prover-module-url> npm run e2e:sccp:solana-smoke-readiness`,
        ],
      }),
    );
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
  const browserProofModules = routePreflightBrowserProofModules(routePreflight);
  const destinationRouteModuleUrl = routePublishedProverModuleUrl(
    browserProofModules,
    "destinationModuleUrl",
  );
  const sourceRouteModuleUrl = routePublishedProverModuleUrl(
    browserProofModules,
    "sourceModuleUrl",
  );
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
      envAliases: [SCCP_SOLANA_PROVER_MODULE_URL_ENV],
      configuredEnv: destinationProverModuleEnv,
      value: destinationProverModuleUrl,
      defaultValue:
        destinationRouteModuleUrl || DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
      defaultSource: destinationRouteModuleUrl
        ? "public-route"
        : "bundled-default",
      inspection: destinationProverInspection,
      expectedModuleUrl: browserProofModules?.destinationModuleUrl,
      expectedModuleHash: browserProofModules?.destinationModuleHash,
      expectedSidecarHash: browserProofModules?.destinationSidecarHash,
    }),
    proverModuleCheck({
      id: "source-prover-module-url",
      label: "Solana source prover module URL",
      env: SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
      configuredEnv: sourceProverModuleEnv,
      value: sourceProverModuleUrl,
      defaultValue:
        sourceRouteModuleUrl || DEFAULT_SCCP_SOLANA_SOURCE_PROVER_MODULE_URL,
      defaultSource: sourceRouteModuleUrl ? "public-route" : "bundled-default",
      inspection: sourceProverInspection,
      expectedModuleUrl: browserProofModules?.sourceModuleUrl,
      expectedModuleHash: browserProofModules?.sourceModuleHash,
      expectedSidecarHash: browserProofModules?.sourceSidecarHash,
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
  const browserProofModules = routePreflightBrowserProofModules(routePreflight);
  const destinationRouteModuleUrl = routePublishedProverModuleUrl(
    browserProofModules,
    "destinationModuleUrl",
  );
  const sourceRouteModuleUrl = routePublishedProverModuleUrl(
    browserProofModules,
    "sourceModuleUrl",
  );
  const destinationProverModuleUrlForInspection = selectSolanaProverModuleUrl({
    runtimeValue: resolvedDestinationProverModuleUrl,
    routeValue: destinationRouteModuleUrl,
    bundledDefault: DEFAULT_SCCP_SOLANA_PROVER_MODULE_URL,
  });
  const sourceProverModuleUrlForInspection = selectSolanaProverModuleUrl({
    runtimeValue: resolvedSourceProverModuleUrl,
    routeValue: sourceRouteModuleUrl,
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
    }),
    sourceProverInspection: runLocalProverSelfTest({
      moduleUrl: normalizedSourceProverModuleUrl,
      proveExport: "proveSolanaSccpSource",
      selfTestExport: "solanaSccpSourceProverSelfTest",
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
      [
        SCCP_SOLANA_DESTINATION_PROVER_MODULE_URL_ENV,
        SCCP_SOLANA_PROVER_MODULE_URL_ENV,
      ],
    ),
    sourceProverModuleUrl: optionalArgOrEnv(
      args,
      "source-prover-module-url",
      SCCP_SOLANA_SOURCE_PROVER_MODULE_URL_ENV,
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
