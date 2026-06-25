#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  bscBurnRecordProductionArtifactProblems,
  evaluateBscSccpRoutePreflight,
  resolveBscNetworkProfile,
} from "./sccp-bsc-route-preflight.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-bsc-peer-config-audit",
);
const DEFAULT_REMOTE_PEER_CONFIG_DIR =
  "/Users/administrator/dev/iroha/dist/taira-localnet";
const DEFAULT_REMOTE_PEER_COUNT = 4;
const MAX_REMOTE_PEER_COUNT = 32;
const DEFAULT_SSH_CONNECT_TIMEOUT_SECONDS = 15;
export const SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES = 2 * 1024 * 1024;
export const SCCP_BSC_SANITIZED_STANZA_MAX_BYTES = 256 * 1024;
export const SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES = 64 * 1024;
const SAFE_REMOTE_DIR_PATTERN = /^\/[A-Za-z0-9._/-]+$/u;
const SAFE_PUBLIC_EVIDENCE_NAME_PATTERN = /^[A-Za-z0-9._/-]+$/u;
const SECRET_LIKE_PATH_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token|token)\s*(?:=|%3d|:)?|0x[0-9a-f]{64}/iu;
const SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/giu;
const execFile = promisify(execFileCallback);

const trim = (value) => String(value ?? "").trim();
const bscPeerAuditRequiredInput = (id, kind, placeholder, description) =>
  Object.freeze({ id, kind, placeholder, description });
const bscPeerAuditAction = ({
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
const bscPeerAuditMissingProductionInputs = (nextActions) => {
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
const bscPeerAuditNextActions = (checks, profile) => {
  const failedCheckIds = new Set(
    checks.filter((entry) => !entry.ok).map((entry) => entry.id),
  );
  const failed = (id) => failedCheckIds.has(id);
  const actions = [];
  if (
    failed("peer-config-files") ||
    failed("peer-count") ||
    failed("peer-route-count")
  ) {
    actions.push(
      bscPeerAuditAction({
        id: "refresh-peer-config-audit-source",
        title: "Refresh peer config audit source",
        detail:
          "Audit the active TAIRA peer configs and confirm they do not carry local BSC route overrides.",
        requiredInputs: [
          bscPeerAuditRequiredInput(
            "peer-config-audit-source",
            "directory-or-remote",
            "<peer-config-audit-source>",
            "Local peer config directory/files or remote source used by the BSC peer audit.",
          ),
          bscPeerAuditRequiredInput(
            `${profile.key}-expected-peer-count`,
            "integer",
            `<${profile.key}-expected-peer-count>`,
            `Expected number of TAIRA peers to audit for stale ${profile.label} overrides.`,
          ),
        ],
        blockedByChecks: [
          "peer-config-files",
          "peer-count",
          "peer-route-count",
        ].filter((id) => failed(id)),
        commands: [
          `npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network ${profile.key} --dir <peer-config-audit-source> --expected-peers <${profile.key}-expected-peer-count>`,
        ],
      }),
    );
  }
  if (
    failed("peer-route-consistency") ||
    failed("peer-route-production-readiness") ||
    failed("peer-route-burn-record-material") ||
    failed("peer-route-hash-role-separation")
  ) {
    actions.push(
      bscPeerAuditAction({
        id: "remove-stale-peer-route-overrides",
        title: "Remove stale peer route overrides",
        detail:
          "Remove local BSC SCCP route/prover material from TAIRA peer configs; production route material is published on-chain through UpsertSccpRouteManifest.",
        requiredInputs: [
          bscPeerAuditRequiredInput(
            "taira-peer-config-targets",
            "operator-environment",
            "<taira-peer-config-targets>",
            "Operator-controlled TAIRA peer configuration targets to clean.",
          ),
          bscPeerAuditRequiredInput(
            "peer-config-audit-source",
            "directory-or-remote",
            "<peer-config-audit-source>",
            "Source used to verify the deployed peer config rollout.",
          ),
        ],
        blockedByChecks: [
          "peer-route-consistency",
          "peer-route-production-readiness",
          "peer-route-burn-record-material",
          "peer-route-hash-role-separation",
        ].filter((id) => failed(id)),
        commands: [
          `npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network ${profile.key} --dir <peer-config-audit-source>`,
        ],
      }),
    );
  }
  if (
    failed("peer-raw-toml-hashes") ||
    failed("peer-sanitized-stanza-file-evidence")
  ) {
    actions.push(
      bscPeerAuditAction({
        id: "verify-peer-audit-evidence-files",
        title: "Verify peer audit evidence files",
        detail:
          "Regenerate sanitized peer route evidence from deployed peer configs and verify the published file hashes.",
        requiredInputs: [
          bscPeerAuditRequiredInput(
            "peer-config-audit-source",
            "directory-or-remote",
            "<peer-config-audit-source>",
            "Peer configuration source used to regenerate sanitized route evidence.",
          ),
          bscPeerAuditRequiredInput(
            "sanitized-peer-stanza-output-dir",
            "directory",
            "<sanitized-peer-stanza-output-dir>",
            "Directory where sanitized peer route stanzas are written and reverified.",
          ),
        ],
        blockedByChecks: [
          "peer-raw-toml-hashes",
          "peer-sanitized-stanza-file-evidence",
        ].filter((id) => failed(id)),
        commands: [
          `npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network ${profile.key} --dir <peer-config-audit-source> --sanitized-stanzas-dir <sanitized-peer-stanza-output-dir>`,
        ],
      }),
    );
  }
  return actions;
};
export const bscSccpPeerConfigAuditOutputDir = (input = {}) => {
  const bscNetwork = ownDataValue(input, "bscNetwork") ?? "testnet";
  const outputDir = ownDataValue(input, "outputDir");
  const explicitOutputDir = trim(outputDir);
  if (explicitOutputDir) {
    return path.resolve(repoRoot, explicitOutputDir);
  }
  return path.join(
    DEFAULT_OUTPUT_DIR,
    resolveBscNetworkProfile(bscNetwork).key,
  );
};
const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const isPlainRecord = (value) => {
  if (!isRecord(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ownDataValue = (record, key) => {
  if (
    (typeof record !== "object" && typeof record !== "function") ||
    record === null
  ) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (
    !descriptor ||
    !Object.prototype.hasOwnProperty.call(descriptor, "value")
  ) {
    return undefined;
  }
  return descriptor.value;
};
const ownDataArrayIndexedValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries = [];
  for (const key of Object.keys(value)) {
    if (!JSON_ARRAY_INDEX_PATTERN.test(key)) {
      continue;
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= value.length) {
      continue;
    }
    const entry = ownDataValue(value, key);
    if (entry !== undefined) {
      entries.push([index, entry]);
    }
  }
  entries.sort(([left], [right]) => left - right);
  return entries;
};
const ownDataArrayValues = (value) =>
  ownDataArrayIndexedValues(value).map(([, entry]) => entry);
const ownDataArrayShapeProblems = (
  value,
  label,
  { requireRecord = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownDataArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (requireRecord && !isRecord(entry)) {
      problems.push(`${label} ${index} is not an object.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing or accessor-backed.`);
    }
  }
  return problems;
};
const bscPeerAuditRecordArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = ownDataArrayShapeProblems(value, label, {
    requireRecord: true,
  });
  if (required && ownDataArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};
const bscPeerAuditStringArrayProblems = (
  value,
  label,
  { required = false } = {},
) => {
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownDataArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (typeof entry !== "string" || !entry.trim()) {
      problems.push(`${label} ${index} is not a non-empty string.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing or accessor-backed.`);
    }
  }
  if (required && ownDataArrayValues(value).length === 0) {
    problems.push(`${label} is missing or empty.`);
  }
  return problems;
};
const bscPeerAuditRequiredInputContractProblems = (
  input,
  label,
  { requireBlockedByActions = false } = {},
) => {
  const problems = [];
  for (const key of ["id", "kind", "placeholder", "description"]) {
    const value = ownDataValue(input, key);
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${label} ${key} is missing or not a non-empty string.`);
    }
  }
  if (
    requireBlockedByActions ||
    ownDataValue(input, "blockedByActions") !== undefined
  ) {
    problems.push(
      ...bscPeerAuditStringArrayProblems(
        ownDataValue(input, "blockedByActions"),
        `${label} blockedByActions`,
        { required: requireBlockedByActions },
      ),
    );
  }
  return problems;
};

const rememberBscPeerAuditRunbookId = (seen, id, label, problems) => {
  if (!id) {
    return false;
  }
  if (seen.has(id)) {
    problems.push(`${label} id ${id} is duplicated.`);
    return false;
  }
  seen.add(id);
  return true;
};

export const bscSccpPeerConfigAuditRunbookProblems = (report) => {
  if (!isRecord(report)) {
    return ["BSC peer config audit runbook report is not an object."];
  }
  const problems = [];
  const nextActions = ownDataValue(report, "nextActions");
  const missingProductionInputs = ownDataValue(
    report,
    "missingProductionInputs",
  );
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  const missingInputIds = new Set();
  const missingInputsById = new Map();
  problems.push(
    ...bscPeerAuditRecordArrayProblems(
      nextActions,
      "BSC peer config audit next action",
    ),
    ...bscPeerAuditRecordArrayProblems(
      missingProductionInputs,
      "BSC peer config audit missing production input",
    ),
  );
  if (Array.isArray(nextActions)) {
    for (const [index, action] of ownDataArrayIndexedValues(nextActions)) {
      const label = `BSC peer config audit next action ${index}`;
      if (!isRecord(action)) {
        continue;
      }
      const actionId =
        typeof ownDataValue(action, "id") === "string"
          ? ownDataValue(action, "id").trim()
          : "";
      const uniqueActionId = rememberBscPeerAuditRunbookId(
        actionIds,
        actionId,
        "BSC peer config audit next action",
        problems,
      );
      for (const key of ["id", "title", "detail"]) {
        const value = ownDataValue(action, key);
        if (typeof value !== "string" || !value.trim()) {
          problems.push(
            `${label} ${key} is missing or not a non-empty string.`,
          );
        }
      }
      const requiredInputs = ownDataValue(action, "requiredInputs");
      problems.push(
        ...bscPeerAuditRecordArrayProblems(
          requiredInputs,
          `${label} required input`,
          { required: true },
        ),
        ...bscPeerAuditStringArrayProblems(
          ownDataValue(action, "blockedByChecks"),
          `${label} blockedByChecks`,
          { required: true },
        ),
        ...bscPeerAuditStringArrayProblems(
          ownDataValue(action, "commands"),
          `${label} commands`,
          { required: true },
        ),
      );
      const requiredInputIds = new Set();
      if (Array.isArray(requiredInputs)) {
        for (const [inputIndex, input] of ownDataArrayIndexedValues(
          requiredInputs,
        )) {
          if (!isRecord(input)) {
            continue;
          }
          problems.push(
            ...bscPeerAuditRequiredInputContractProblems(
              input,
              `${label} required input ${inputIndex}`,
            ),
          );
          const inputId =
            typeof ownDataValue(input, "id") === "string"
              ? ownDataValue(input, "id").trim()
              : "";
          rememberBscPeerAuditRunbookId(
            requiredInputIds,
            inputId,
            `${label} required input`,
            problems,
          );
        }
      }
      if (uniqueActionId) {
        requiredInputIdsByActionId.set(actionId, requiredInputIds);
      }
    }
  }
  if (Array.isArray(missingProductionInputs)) {
    for (const [index, input] of ownDataArrayIndexedValues(
      missingProductionInputs,
    )) {
      const label = `BSC peer config audit missing production input ${index}`;
      if (!isRecord(input)) {
        continue;
      }
      const inputId =
        typeof ownDataValue(input, "id") === "string"
          ? ownDataValue(input, "id").trim()
          : "";
      rememberBscPeerAuditRunbookId(
        missingInputIds,
        inputId,
        "BSC peer config audit missing production input",
        problems,
      );
      if (inputId && !missingInputsById.has(inputId)) {
        missingInputsById.set(inputId, input);
      }
      problems.push(
        ...bscPeerAuditRequiredInputContractProblems(input, label, {
          requireBlockedByActions: true,
        }),
      );
    }
  }
  if (Array.isArray(nextActions) && Array.isArray(missingProductionInputs)) {
    for (const [actionId, requiredInputIds] of requiredInputIdsByActionId) {
      for (const inputId of requiredInputIds) {
        const missingInput = missingInputsById.get(inputId);
        if (!missingInput) {
          problems.push(
            `BSC peer config audit next action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
          );
          continue;
        }
        const blockers = ownDataValue(missingInput, "blockedByActions");
        if (
          Array.isArray(blockers) &&
          !ownDataArrayValues(blockers).includes(actionId)
        ) {
          problems.push(
            `BSC peer config audit missing production input ${inputId} does not reference blocking action ${actionId}.`,
          );
        }
      }
    }
    for (const [inputId, input] of missingInputsById) {
      const blockers = ownDataValue(input, "blockedByActions");
      if (!Array.isArray(blockers)) {
        continue;
      }
      for (const actionId of ownDataArrayValues(blockers)) {
        if (typeof actionId !== "string" || !actionId.trim()) {
          continue;
        }
        if (!actionIds.has(actionId)) {
          problems.push(
            `BSC peer config audit missing production input ${inputId} references unknown blocking action ${actionId}.`,
          );
          continue;
        }
        if (!requiredInputIdsByActionId.get(actionId)?.has(inputId)) {
          problems.push(
            `BSC peer config audit missing production input ${inputId} references blocking action ${actionId}, but that action does not require the input.`,
          );
        }
      }
    }
  }
  return problems;
};
const cloneOwnDataRecord = (record) => {
  const clone = {};
  if (!isPlainRecord(record)) {
    return clone;
  }
  for (const key of Object.keys(record)) {
    const value = ownDataValue(record, key);
    if (value !== undefined) {
      clone[key] = value;
    }
  }
  return clone;
};
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const readString = (record, ...keys) => {
  for (const key of keys) {
    if (!hasOwn(record, key)) {
      continue;
    }
    const value = ownDataValue(record, key);
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};
const readValue = (record, ...keys) => {
  for (const key of keys) {
    if (hasOwn(record, key)) {
      const value = ownDataValue(record, key);
      if (value !== undefined) {
        return value;
      }
    }
  }
  return undefined;
};
const readNumber = (record, ...keys) => {
  const value = readValue(record, ...keys);
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const parseBoolean = (value, label = "boolean option") => {
  if (value === undefined || value === null || value === "") {
    return false;
  }
  if (value === true || value === "true") {
    return true;
  }
  if (value === false || value === "false") {
    return false;
  }
  throw new Error(`${label} must be true or false.`);
};
const parsePositiveInteger = (value, fallback, label) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return parsed;
};
const NON_ZERO_HEX32_PATTERN = /^0x(?!0{64}$)[0-9a-f]{64}$/u;
const normalizeNonZeroHex32 = (value) => {
  const normalized = trim(value).toLowerCase();
  return NON_ZERO_HEX32_PATTERN.test(normalized) ? normalized : "";
};
const sha256Hex = (value) =>
  `0x${createHash("sha256").update(value).digest("hex")}`;

const TAIRA_ASSET_DEFINITION_ID_PATTERN =
  /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{16,80}$/u;

const toPortablePath = (value) => String(value ?? "").replace(/\\/gu, "/");

const evidencePathIsSafe = (value) => {
  const portable = toPortablePath(value);
  return (
    portable &&
    SAFE_PUBLIC_EVIDENCE_NAME_PATTERN.test(portable) &&
    !portable.startsWith("/") &&
    !portable.includes("//") &&
    !portable.split("/").some((segment) => !segment || segment === "..") &&
    !SECRET_LIKE_PATH_PATTERN.test(portable)
  );
};

const publicPeerSourceLabel = (file, index) => {
  const basename = path.basename(file);
  if (evidencePathIsSafe(basename)) {
    return basename;
  }
  return `peer${index}.toml`;
};

const sanitizedPeerStanzaBaseName = (file, index) => {
  const basename = path.basename(file);
  if (/\.toml(?:\.bak.*)?$/u.test(basename) && evidencePathIsSafe(basename)) {
    return `peer${index}-${basename}`;
  }
  return `peer${index}.toml`;
};

const publicSanitizedStanzaSource = (
  sanitizedFile,
  sanitizedOutputDir,
  reportOutputDir = null,
) => {
  const resolved = path.resolve(sanitizedFile);
  const bases = [
    reportOutputDir ? path.resolve(reportOutputDir) : "",
    repoRoot,
    sanitizedOutputDir && !reportOutputDir
      ? path.dirname(path.resolve(sanitizedOutputDir))
      : "",
  ].filter(Boolean);
  for (const base of bases) {
    const relative = toPortablePath(path.relative(base, resolved));
    if (evidencePathIsSafe(relative)) {
      return relative;
    }
  }
  const basename = path.basename(resolved);
  return evidencePathIsSafe(basename) ? basename : "peer-stanza.toml";
};

const assertSanitizedOutputDir = async (outputDir) => {
  const info = await lstat(outputDir);
  if (info.isSymbolicLink()) {
    throw new Error(
      `Sanitized stanza output directory ${outputDir} must not be a symbolic link.`,
    );
  }
  if (!info.isDirectory()) {
    throw new Error(
      `Sanitized stanza output directory ${outputDir} must be a directory.`,
    );
  }
};

const assertSanitizedOutputFile = async (file) => {
  try {
    const info = await lstat(file);
    if (info.isSymbolicLink()) {
      throw new Error(
        `Sanitized stanza output file ${file} must not be a symbolic link.`,
      );
    }
    if (!info.isFile()) {
      throw new Error(
        `Sanitized stanza output file ${file} must be a regular file.`,
      );
    }
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
};

const assertSanitizedStanzaTextSize = (text, file) => {
  const size = Buffer.byteLength(text, "utf8");
  if (size > SCCP_BSC_SANITIZED_STANZA_MAX_BYTES) {
    throw new Error(
      `Sanitized stanza output file ${file} is ${size} bytes; maximum allowed is ${SCCP_BSC_SANITIZED_STANZA_MAX_BYTES} bytes.`,
    );
  }
};

const sanitizedOutputTempSuffix = () =>
  `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;

const writeSanitizedStanzaOutputFile = async (file, text) => {
  const resolvedFile = path.resolve(file);
  const outputDir = path.dirname(resolvedFile);
  await assertSanitizedOutputDir(outputDir);
  await assertSanitizedOutputFile(resolvedFile);
  const tempFile = path.join(
    outputDir,
    `.${path.basename(resolvedFile)}.${sanitizedOutputTempSuffix()}.tmp`,
  );
  let handle = null;
  try {
    handle = await open(
      tempFile,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    await handle.writeFile(text, "utf8");
    await handle.close();
    handle = null;
    await assertSanitizedOutputDir(outputDir);
    await assertSanitizedOutputFile(resolvedFile);
    await rename(tempFile, resolvedFile);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }
    await rm(tempFile, { force: true }).catch(() => {});
    throw error;
  }
};

const peerRouteHashRoleSeparationProblems = (manifest, source) => {
  if (!isRecord(manifest)) {
    return [`${source}: route manifest is missing.`];
  }
  const rollout = isRecord(manifest.destinationRollout)
    ? manifest.destinationRollout
    : {};
  const destinationBinding = isRecord(manifest.destinationBinding)
    ? manifest.destinationBinding
    : {};
  const roles = [
    ["verifierCodeHash", rollout.verifierCodeHash],
    ["verifierKeyHash", rollout.verifierKeyHash],
    [
      "destinationBindingHash",
      rollout.destinationBindingHash ?? destinationBinding.bindingHash,
    ],
    ["proofArtifactHash", rollout.proofArtifactHash],
    ["provingKeyHash", rollout.provingKeyHash],
    [
      "nativeEvmProverBundleHash",
      manifest.nativeEvmProverBundleHash ?? rollout.nativeEvmProverBundleHash,
    ],
  ]
    .map(([label, value]) => [label, normalizeNonZeroHex32(value)])
    .filter(([, value]) => value);
  const seen = new Map();
  const problems = [];
  for (const [label, value] of roles) {
    const previous = seen.get(value);
    if (previous) {
      problems.push(`${source}: ${label} must not equal ${previous}.`);
    } else {
      seen.set(value, label);
    }
  }
  return problems;
};

const strictBase64DecodedBytes = (value, label) => {
  const text = trim(value);
  if (!text || /\s/u.test(text)) {
    throw new Error(`${label} must be strict base64 without whitespace.`);
  }
  const decoded = Buffer.from(text, "base64");
  if (!decoded.length || decoded.toString("base64") !== text) {
    throw new Error(`${label} must be strict base64.`);
  }
  return decoded;
};

const peerBurnRecordMaterialProblems = (manifest, source) => {
  if (!isRecord(manifest)) {
    return [`${source}: route manifest is missing.`];
  }
  const burnRecord = isRecord(manifest.tairaXorBurnRecord)
    ? manifest.tairaXorBurnRecord
    : {};
  const problems = [];
  const settlementAssetDefinitionId = readString(
    burnRecord,
    "settlementAssetDefinitionId",
  );
  if (!TAIRA_ASSET_DEFINITION_ID_PATTERN.test(settlementAssetDefinitionId)) {
    problems.push(
      `${source}: tairaXorBurnRecord.settlementAssetDefinitionId is missing or invalid.`,
    );
  }
  let artifactBytes = null;
  const contractArtifactB64 = readString(burnRecord, "contractArtifactB64");
  if (!contractArtifactB64) {
    problems.push(
      `${source}: tairaXorBurnRecord.contractArtifactB64 is missing.`,
    );
  } else {
    try {
      artifactBytes = strictBase64DecodedBytes(
        contractArtifactB64,
        `${source}: tairaXorBurnRecord.contractArtifactB64`,
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  const artifactSha256 = normalizeNonZeroHex32(
    readString(burnRecord, "artifactSha256"),
  );
  if (!artifactSha256) {
    problems.push(`${source}: tairaXorBurnRecord.artifactSha256 is missing.`);
  } else if (artifactBytes && sha256Hex(artifactBytes) !== artifactSha256) {
    problems.push(
      `${source}: tairaXorBurnRecord.artifactSha256 does not match contractArtifactB64.`,
    );
  }
  if (artifactBytes) {
    problems.push(
      ...bscBurnRecordProductionArtifactProblems(
        artifactBytes,
        `${source}: tairaXorBurnRecord.contractArtifactB64`,
      ),
    );
  }
  if (!normalizeNonZeroHex32(readString(burnRecord, "codeHash"))) {
    problems.push(`${source}: tairaXorBurnRecord.codeHash is missing.`);
  }
  if (
    !isRecord(burnRecord.vkRef) ||
    !readString(burnRecord.vkRef, "backend") ||
    !readString(burnRecord.vkRef, "name")
  ) {
    problems.push(`${source}: tairaXorBurnRecord.vkRef is incomplete.`);
  }
  const gasLimit = readNumber(burnRecord, "gasLimit");
  if (!Number.isSafeInteger(gasLimit) || gasLimit <= 0) {
    problems.push(`${source}: tairaXorBurnRecord.gasLimit is missing.`);
  }
  return problems;
};

const stanzaHasPresentValue = (stanza, key) => {
  if (!hasOwn(stanza, key)) {
    return false;
  }
  const value = ownDataValue(stanza, key);
  if (typeof value === "string") {
    return value.trim() !== "";
  }
  return value !== undefined && value !== null;
};

const assertSinglePeerPostDeployAlias = (stanza, label, ...keys) => {
  const presentAliases = keys.filter((key) =>
    stanzaHasPresentValue(stanza, key),
  );
  if (presentAliases.length > 1) {
    const source = readString(stanza, "__source") || "peer config";
    const lineNumber = readValue(stanza, "__line");
    const line = Number.isSafeInteger(lineNumber) ? `:${lineNumber}` : "";
    throw new Error(
      `${source}${line}: BSC SCCP ${label} must not use multiple aliases in the same peer route stanza (${presentAliases.join(", ")}).`,
    );
  }
};

const sanitizedStanzaFileEvidence = (
  sanitizedFile,
  sanitizedStanzaText,
  sanitizedOutputDir = null,
  reportOutputDir = null,
) => {
  if (!sanitizedFile) {
    return {};
  }
  const sanitizedStanzaFileSha256 = sha256Hex(sanitizedStanzaText);
  return {
    sanitizedStanzaSource: publicSanitizedStanzaSource(
      sanitizedFile,
      sanitizedOutputDir,
      reportOutputDir,
    ),
    sanitizedStanzaFileChecked: true,
    sanitizedStanzaFileVerified: true,
    sanitizedStanzaFileSha256,
  };
};

export const SAFE_ROUTE_STANZA_KEYS = new Set([
  "asset_key",
  "assetKey",
  "bridgeAddress",
  "chain",
  "chain_id_hex",
  "chainIdHex",
  "codeHash",
  "contractArtifactB64",
  "counterparty_account_codec",
  "counterparty_account_codec_key",
  "counterparty_domain",
  "counterpartyAccountCodec",
  "counterpartyAccountCodecKey",
  "counterpartyDomain",
  "destination_binding_hash",
  "destination_binding_key",
  "destinationBindingHash",
  "destinationBindingKey",
  "destination_rollout_version",
  "disabled_reason",
  "disabledReason",
  "bsc_explorer_host",
  "bsc_explorer_url",
  "bscExplorerHost",
  "bscExplorerUrl",
  "explorer_host",
  "explorer_url",
  "explorerHost",
  "explorerUrl",
  "gasLimit",
  "bsc_native_evm_prover_bundle_hash",
  "bscNativeEvmProverBundleHash",
  "network_id_hex",
  "networkIdHex",
  "native_evm_prover_bundle_hash",
  "native_prover_bundle_hash",
  "nativeEvmProverBundleHash",
  "nativeProverBundleHash",
  "offlineFullTomlSha256",
  "post_deploy_full_toml_ready",
  "post_deploy_offline_full_toml_sha256",
  "post_deploy_route_canary_evidence_hash",
  "post_deploy_route_canary_explorer_url",
  "post_deploy_route_canary_transaction_id",
  "post_deploy_route_canary_transaction_url",
  "post_deploy_source_bridge_config_hash",
  "post_deploy_source_event_explorer_url",
  "post_deploy_source_event_transaction_id",
  "post_deploy_source_event_transaction_url",
  "postDeployFullTomlReady",
  "production_ready",
  "productionReady",
  "proof_artifact_hash",
  "proofArtifactHash",
  "prover_artifact_hash",
  "proving_key_hash",
  "provingKeyHash",
  "route_id",
  "routeCanaryEvidenceHash",
  "routeCanaryExplorerUrl",
  "routeCanaryTransactionId",
  "routeCanaryTransactionUrl",
  "routeId",
  "bsc_source_bridge_address",
  "bsc_verifier_address",
  "destination_bridge_address",
  "destination_verifier_address",
  "evm_source_bridge_address",
  "evm_verifier_address",
  "sccp_bsc_source_bridge_address",
  "sccp_bsc_destination_verifier_address",
  "settlementAssetDefinitionId",
  "source_bridge_config_hash",
  "source_domain",
  "sourceBridgeAddress",
  "sourceBridgeConfigHash",
  "sourceEventExplorerUrl",
  "sourceEventTransactionId",
  "sourceEventTransactionUrl",
  "sourceDomain",
  "target_domain",
  "targetDomain",
  "taira_burn_record_artifact_sha256",
  "taira_burn_record_code_hash",
  "taira_burn_record_contract_artifact_b64",
  "taira_burn_record_gas_limit",
  "taira_burn_record_settlement_asset_definition_id",
  "taira_burn_record_vk_backend",
  "taira_burn_record_vk_name",
  "taira_xor_bridge_address",
  "taira_xor_token_address",
  "tairaXorBridgeAddress",
  "tairaXorTokenAddress",
  "tokenAddress",
  "version",
  "verifier_code_hash",
  "verifier_key_hash",
  "verifier_identity",
  "verifier_target",
  "verifierAddress",
  "verifierCodeHash",
  "verifierIdentity",
  "verifierKeyHash",
  "verifierTarget",
  "vk_backend",
  "vk_name",
]);

const stripTomlComment = (line) => {
  let inString = false;
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (char === "#" && !inString) {
      return line.slice(0, index);
    }
  }
  return line;
};

const parseTomlString = (value, source, lineNumber) => {
  let result = "";
  let escaped = false;
  for (let index = 1; index < value.length - 1; index += 1) {
    const char = value[index];
    if (escaped) {
      if (char === "n") {
        result += "\n";
      } else if (char === "t") {
        result += "\t";
      } else if (char === "r") {
        result += "\r";
      } else if (char === '"' || char === "\\") {
        result += char;
      } else {
        throw new Error(
          `${source}:${lineNumber}: unsupported TOML string escape \\${char}.`,
        );
      }
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    result += char;
  }
  if (escaped) {
    throw new Error(
      `${source}:${lineNumber}: unterminated TOML string escape.`,
    );
  }
  return result;
};

const parseTomlScalar = (value, source, lineNumber) => {
  const raw = value.trim();
  if (/^".*"$/su.test(raw)) {
    return parseTomlString(raw, source, lineNumber);
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  if (/^[+-]?[0-9]+$/u.test(raw)) {
    const parsed = Number(raw);
    if (Number.isSafeInteger(parsed)) {
      return parsed;
    }
  }
  throw new Error(
    `${source}:${lineNumber}: unsupported TOML value for SCCP audit.`,
  );
};

export const parseSccpRouteManifestStanzas = (text, source = "<memory>") => {
  const stanzas = [];
  let current = null;
  const flush = () => {
    if (current) {
      stanzas.push(current);
      current = null;
    }
  };
  const lines = String(text).split(/\r?\n/u);
  for (const [index, rawLine] of lines.entries()) {
    const lineNumber = index + 1;
    const line = stripTomlComment(rawLine).trim();
    if (!line) {
      continue;
    }
    const arrayHeader = /^\[\[([A-Za-z0-9_.-]+)\]\]$/u.exec(line);
    if (arrayHeader) {
      flush();
      current =
        arrayHeader[1] === "zk.sccp_route_manifests"
          ? { __source: source, __line: lineNumber }
          : null;
      continue;
    }
    if (/^\[/u.test(line)) {
      flush();
      continue;
    }
    if (!current) {
      continue;
    }
    const assignment = /^([A-Za-z0-9_-]+)\s*=\s*(.+)$/su.exec(line);
    if (!assignment) {
      throw new Error(`${source}:${lineNumber}: malformed TOML assignment.`);
    }
    if (Object.prototype.hasOwnProperty.call(current, assignment[1])) {
      throw new Error(
        `${source}:${lineNumber}: duplicate TOML key ${assignment[1]} in SCCP route stanza.`,
      );
    }
    current[assignment[1]] = parseTomlScalar(assignment[2], source, lineNumber);
  }
  flush();
  return stanzas;
};

const formatTomlScalar = (value) => {
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Number.isSafeInteger(value)) {
    return String(value);
  }
  return `"${String(value)
    .replace(/\\/gu, "\\\\")
    .replace(/"/gu, '\\"')
    .replace(/\n/gu, "\\n")
    .replace(/\r/gu, "\\r")
    .replace(/\t/gu, "\\t")}"`;
};

export const serializeSanitizedSccpRouteManifestStanzas = (stanzas) => {
  const blocks = [];
  for (const stanza of ownDataArrayValues(stanzas)) {
    if (!isRecord(stanza)) {
      continue;
    }
    const lines = ["[[zk.sccp_route_manifests]]"];
    for (const key of Object.keys(stanza).sort()) {
      const value = ownDataValue(stanza, key);
      if (
        key.startsWith("__") ||
        !SAFE_ROUTE_STANZA_KEYS.has(key) ||
        value === undefined ||
        value === ""
      ) {
        continue;
      }
      lines.push(`${key} = ${formatTomlScalar(value)}`);
    }
    blocks.push(lines.join("\n"));
  }
  return blocks.length ? `${blocks.join("\n\n")}\n` : "";
};

const normalizePeerRouteManifest = (rawStanza) => {
  if (!isPlainRecord(rawStanza)) {
    throw new Error("BSC SCCP peer route stanza must be a plain object.");
  }
  const stanza = cloneOwnDataRecord(rawStanza);
  const manifest = { ...stanza };
  delete manifest.__source;
  delete manifest.__line;
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy full TOML readiness",
    "post_deploy_full_toml_ready",
    "postDeployFullTomlReady",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy source bridge config hash",
    "post_deploy_source_bridge_config_hash",
    "sourceBridgeConfigHash",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy source event transaction id",
    "post_deploy_source_event_transaction_id",
    "sourceEventTransactionId",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy route canary evidence hash",
    "post_deploy_route_canary_evidence_hash",
    "routeCanaryEvidenceHash",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy route canary transaction id",
    "post_deploy_route_canary_transaction_id",
    "routeCanaryTransactionId",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy source event explorer URL",
    "post_deploy_source_event_explorer_url",
    "sourceEventExplorerUrl",
    "post_deploy_source_event_transaction_url",
    "sourceEventTransactionUrl",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy route canary explorer URL",
    "post_deploy_route_canary_explorer_url",
    "routeCanaryExplorerUrl",
    "post_deploy_route_canary_transaction_url",
    "routeCanaryTransactionUrl",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "post-deploy offline full TOML SHA-256",
    "post_deploy_offline_full_toml_sha256",
    "offlineFullTomlSha256",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "route id",
    "route_id",
    "routeId",
    "route",
    "id",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "asset key",
    "asset_key",
    "assetKey",
    "asset_id",
    "assetId",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "production-ready status",
    "production_ready",
    "productionReady",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "chain id",
    "chain_id_hex",
    "chainIdHex",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC explorer URL",
    "explorer_url",
    "explorerUrl",
    "bsc_explorer_url",
    "bscExplorerUrl",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC explorer host",
    "explorer_host",
    "explorerHost",
    "bsc_explorer_host",
    "bscExplorerHost",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "counterparty domain",
    "counterparty_domain",
    "counterpartyDomain",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "counterparty account codec key",
    "counterparty_account_codec_key",
    "counterpartyAccountCodecKey",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "counterparty account codec",
    "counterparty_account_codec",
    "counterpartyAccountCodec",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "destination source domain",
    "source_domain",
    "sourceDomain",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "destination target domain",
    "target_domain",
    "targetDomain",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC token address",
    "taira_xor_token_address",
    "tairaXorTokenAddress",
    "tokenAddress",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC bridge address",
    "taira_xor_bridge_address",
    "tairaXorBridgeAddress",
    "bridgeAddress",
    "destination_bridge_address",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC source bridge address",
    "sccp_bsc_source_bridge_address",
    "bsc_source_bridge_address",
    "sccp_tron_source_bridge_address",
    "tron_source_bridge_address",
    "evm_source_bridge_address",
    "sourceBridgeAddress",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC verifier address",
    "sccp_bsc_destination_verifier_address",
    "bsc_verifier_address",
    "evm_verifier_address",
    "destination_verifier_address",
    "tron_verifier_address",
    "sccp_tron_destination_verifier_address",
    "verifierAddress",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "BSC verifier key hash",
    "verifier_key_hash",
    "verifierKeyHash",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record settlement asset",
    "taira_burn_record_settlement_asset_definition_id",
    "settlementAssetDefinitionId",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record contract artifact",
    "taira_burn_record_contract_artifact_b64",
    "contractArtifactB64",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record artifact SHA-256",
    "taira_burn_record_artifact_sha256",
    "artifactSha256",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record code hash",
    "taira_burn_record_code_hash",
    "codeHash",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record VK backend",
    "taira_burn_record_vk_backend",
    "vk_backend",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record VK name",
    "taira_burn_record_vk_name",
    "vk_name",
  );
  assertSinglePeerPostDeployAlias(
    stanza,
    "TAIRA burn-record gas limit",
    "taira_burn_record_gas_limit",
    "gasLimit",
  );
  const nativeEvmProverBundleHashAliasKeys = [
    "native_evm_prover_bundle_hash",
    "nativeEvmProverBundleHash",
    "native_prover_bundle_hash",
    "nativeProverBundleHash",
    "bsc_native_evm_prover_bundle_hash",
    "bscNativeEvmProverBundleHash",
  ];
  const rawNativeEvmProverBundleHashAliases =
    nativeEvmProverBundleHashAliasKeys.filter((key) => readString(stanza, key));
  if (rawNativeEvmProverBundleHashAliases.length <= 1) {
    for (const key of nativeEvmProverBundleHashAliasKeys) {
      delete manifest[key];
    }
  }
  const counterpartyDomain = readNumber(
    stanza,
    "counterparty_domain",
    "counterpartyDomain",
  );
  const routeId = readString(stanza, "routeId", "route_id", "route", "id");
  const assetKey = readString(
    stanza,
    "assetKey",
    "asset_key",
    "assetId",
    "asset_id",
  );
  for (const key of ["route_id", "routeId", "route", "id"]) {
    delete manifest[key];
  }
  for (const key of ["asset_key", "assetKey", "asset_id", "assetId"]) {
    delete manifest[key];
  }
  manifest.routeId = routeId;
  manifest.assetKey = assetKey;
  manifest.productionReady = readValue(
    stanza,
    "productionReady",
    "production_ready",
  );
  manifest.destinationRollout = {
    version: readNumber(stanza, "destination_rollout_version") ?? 1,
    sourceDomain: readNumber(stanza, "source_domain") ?? 0,
    targetDomain: readNumber(stanza, "target_domain") ?? counterpartyDomain,
    destinationNetworkId: readString(
      stanza,
      "destination_network_id",
      "network_id_hex",
      "networkIdHex",
    ),
    verifierIdentity: readString(
      stanza,
      "verifier_identity",
      "sccp_bsc_destination_verifier_address",
      "bsc_verifier_address",
      "evm_verifier_address",
      "destination_verifier_address",
      "tron_verifier_address",
      "sccp_tron_destination_verifier_address",
      "verifierAddress",
    ),
    verifierCodeHash: readString(stanza, "verifier_code_hash"),
    verifierKeyHash: readString(stanza, "verifier_key_hash", "verifierKeyHash"),
    destinationBridgeAddress: readString(
      stanza,
      "destination_bridge_address",
      "taira_xor_bridge_address",
      "bridgeAddress",
    ),
    destinationBindingKey: readString(stanza, "destination_binding_key"),
    destinationBindingHash: readString(stanza, "destination_binding_hash"),
    proofArtifactHash: readString(
      stanza,
      "proof_artifact_hash",
      "proofArtifactHash",
      "prover_artifact_hash",
      "circuit_artifact_hash",
    ),
    provingKeyHash: readString(stanza, "proving_key_hash", "provingKeyHash"),
    nativeEvmProverBundleHash: readString(
      stanza,
      ...nativeEvmProverBundleHashAliasKeys,
    ),
  };
  manifest.nativeEvmProverBundleHash =
    manifest.destinationRollout.nativeEvmProverBundleHash;
  manifest.destinationBinding = {
    version: 1,
    sourceDomain: 0,
    targetDomain: counterpartyDomain,
    key: readString(stanza, "destination_binding_key"),
    bindingHash: readString(stanza, "destination_binding_hash"),
    networkIdHex: readString(stanza, "network_id_hex", "networkIdHex"),
  };
  const postDeployLiveEvidence = {
    fullTomlReady: readValue(
      stanza,
      "post_deploy_full_toml_ready",
      "postDeployFullTomlReady",
    ),
    sourceBridgeConfigHash: readString(
      stanza,
      "post_deploy_source_bridge_config_hash",
      "sourceBridgeConfigHash",
    ),
    sourceEventTransactionId: readString(
      stanza,
      "post_deploy_source_event_transaction_id",
      "sourceEventTransactionId",
    ),
    routeCanaryEvidenceHash: readString(
      stanza,
      "post_deploy_route_canary_evidence_hash",
      "routeCanaryEvidenceHash",
    ),
    routeCanaryTransactionId: readString(
      stanza,
      "post_deploy_route_canary_transaction_id",
      "routeCanaryTransactionId",
    ),
  };
  for (const [key, value] of [
    [
      "sourceEventExplorerUrl",
      readString(
        stanza,
        "post_deploy_source_event_explorer_url",
        "sourceEventExplorerUrl",
        "post_deploy_source_event_transaction_url",
        "sourceEventTransactionUrl",
      ),
    ],
    [
      "routeCanaryExplorerUrl",
      readString(
        stanza,
        "post_deploy_route_canary_explorer_url",
        "routeCanaryExplorerUrl",
        "post_deploy_route_canary_transaction_url",
        "routeCanaryTransactionUrl",
      ),
    ],
    [
      "offlineFullTomlSha256",
      readString(
        stanza,
        "post_deploy_offline_full_toml_sha256",
        "offlineFullTomlSha256",
      ),
    ],
  ]) {
    if (value) {
      postDeployLiveEvidence[key] = value;
    }
  }
  manifest.postDeployLiveEvidence = postDeployLiveEvidence;
  const vkBackend = readString(
    stanza,
    "taira_burn_record_vk_backend",
    "vk_backend",
  );
  const vkName = readString(stanza, "taira_burn_record_vk_name", "vk_name");
  manifest.tairaXorBurnRecord = {
    settlementAssetDefinitionId: readString(
      stanza,
      "taira_burn_record_settlement_asset_definition_id",
      "settlementAssetDefinitionId",
    ),
    contractArtifactB64: readString(
      stanza,
      "taira_burn_record_contract_artifact_b64",
      "contractArtifactB64",
    ),
    artifactSha256: readString(
      stanza,
      "taira_burn_record_artifact_sha256",
      "artifactSha256",
    ),
    codeHash: readString(stanza, "taira_burn_record_code_hash", "codeHash"),
    vkRef:
      vkBackend || vkName
        ? {
            backend: vkBackend,
            name: vkName,
          }
        : undefined,
    gasLimit: readValue(stanza, "taira_burn_record_gas_limit", "gasLimit"),
  };
  return manifest;
};

const routeMatches = (manifest) =>
  readString(manifest, "routeId", "route_id") === SCCP_BSC_XOR_ROUTE_ID &&
  readString(manifest, "assetKey", "asset_key") === SCCP_BSC_XOR_ASSET_KEY;

const sortObject = (value) => {
  if (Array.isArray(value)) {
    return ownDataArrayValues(value).map((entry) => sortObject(entry));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.keys(value)
      .map((key) => [key, ownDataValue(value, key)])
      .filter(([, entry]) => entry !== undefined && entry !== "")
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, sortObject(entry)]),
  );
};

const canonicalPeerManifest = (manifest) => {
  const artifact = manifest.tairaXorBurnRecord?.contractArtifactB64;
  return sortObject({
    version: readValue(manifest, "version"),
    routeId: manifest.routeId,
    assetKey: manifest.assetKey,
    productionReady: manifest.productionReady,
    disabledReason: readString(manifest, "disabledReason", "disabled_reason"),
    chain: readString(manifest, "chain"),
    chainIdHex: readString(manifest, "chain_id_hex", "chainIdHex"),
    explorerUrl: readString(
      manifest,
      "explorer_url",
      "explorerUrl",
      "bsc_explorer_url",
      "bscExplorerUrl",
    ),
    explorerHost: readString(
      manifest,
      "explorer_host",
      "explorerHost",
      "bsc_explorer_host",
      "bscExplorerHost",
    ),
    verifierTarget: readString(manifest, "verifier_target", "verifierTarget"),
    counterpartyDomain: readValue(
      manifest,
      "counterpartyDomain",
      "counterparty_domain",
    ),
    counterpartyAccountCodecKey: readString(
      manifest,
      "counterparty_account_codec_key",
      "counterpartyAccountCodecKey",
    ),
    counterpartyAccountCodec: readValue(
      manifest,
      "counterparty_account_codec",
      "counterpartyAccountCodec",
    ),
    networkIdHex: readString(manifest, "network_id_hex", "networkIdHex"),
    nativeEvmProverBundleHash: manifest.nativeEvmProverBundleHash,
    tokenAddress: readString(
      manifest,
      "taira_xor_token_address",
      "tairaXorTokenAddress",
      "tokenAddress",
    ),
    bridgeAddress: readString(
      manifest,
      "taira_xor_bridge_address",
      "tairaXorBridgeAddress",
      "destination_bridge_address",
      "bridgeAddress",
    ),
    sourceBridgeAddress: readString(
      manifest,
      "sccp_bsc_source_bridge_address",
      "bsc_source_bridge_address",
      "evm_source_bridge_address",
      "sccp_tron_source_bridge_address",
      "tron_source_bridge_address",
      "sourceBridgeAddress",
    ),
    verifierAddress: readString(
      manifest,
      "sccp_bsc_destination_verifier_address",
      "bsc_verifier_address",
      "evm_verifier_address",
      "destination_verifier_address",
      "tron_verifier_address",
      "sccp_tron_destination_verifier_address",
      "verifierAddress",
    ),
    destinationRollout: manifest.destinationRollout,
    destinationBinding: manifest.destinationBinding,
    postDeployLiveEvidence: manifest.postDeployLiveEvidence,
    tairaXorBurnRecord: {
      settlementAssetDefinitionId:
        manifest.tairaXorBurnRecord?.settlementAssetDefinitionId,
      artifactSha256: manifest.tairaXorBurnRecord?.artifactSha256,
      contractArtifactB64Sha256:
        typeof artifact === "string" && artifact
          ? createHash("sha256").update(artifact).digest("hex")
          : undefined,
      codeHash: manifest.tairaXorBurnRecord?.codeHash,
      vkRef: manifest.tairaXorBurnRecord?.vkRef,
      gasLimit: manifest.tairaXorBurnRecord?.gasLimit,
    },
  });
};

const fingerprintManifest = (manifest) =>
  `sha256:${createHash("sha256")
    .update(JSON.stringify(canonicalPeerManifest(manifest)))
    .digest("hex")}`;

const check = (checks, id, ok, message, detail = "") => {
  checks.push({
    id,
    ok: Boolean(ok),
    message,
    ...(detail ? { detail } : {}),
  });
};

const staleRouteValidationFailedChecks = (manifest, bscNetwork) => {
  const report = evaluateBscSccpRoutePreflight({
    bscNetwork,
    chainMetadata: {
      chainId: BSC_TAIRA_CHAIN_ID,
      networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    },
    capabilities: {
      proofSubmitPath: "/v1/bridge/proofs/submit",
      messageSubmitPath: "/v1/bridge/messages",
    },
    manifestSet: { manifests: [manifest] },
  });
  return report.checks
    .filter((entry) => isRecord(entry) && entry.ok === false)
    .map((entry) => ({
      id: readString(entry, "id") || "bsc-route-stale-material",
      ok: false,
      status: "fail",
      message:
        readString(entry, "message") ||
        "Stale local BSC route material is invalid.",
      ...(readString(entry, "detail")
        ? { detail: readString(entry, "detail") }
        : {}),
    }));
};

export const evaluateBscSccpPeerConfigAudit = (peerConfigs, input = {}) => {
  const expectedPeers = ownDataValue(input, "expectedPeers") ?? null;
  const bscNetwork = ownDataValue(input, "bscNetwork") ?? "testnet";
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const checks = [];
  const peerConfigShapeProblems = ownDataArrayShapeProblems(
    peerConfigs,
    "peer config",
    { requireRecord: true },
  );
  const peerRows = ownDataArrayValues(peerConfigs);
  const peers = peerRows.map((peer, index) => {
    const peerRecord = isRecord(peer) ? peer : {};
    const source = readString(peerRecord, "source") || `peer${index}`;
    const stanzas = readValue(peerRecord, "stanzas");
    const stanzaShapeProblems = ownDataArrayShapeProblems(
      stanzas,
      `${source} route stanza`,
      { requireRecord: true },
    );
    const allStanzas = ownDataArrayValues(stanzas);
    const sanitizedStanzaText =
      serializeSanitizedSccpRouteManifestStanzas(allStanzas);
    const matchingRaw = allStanzas
      .map((stanza) => normalizePeerRouteManifest(stanza))
      .filter((manifest) => routeMatches(manifest, bscProfile));
    const selectedManifest = matchingRaw.length === 1 ? matchingRaw[0] : null;
    const rawTomlSha256 = readValue(peerRecord, "rawTomlSha256");
    const sanitizedStanzaSource = readValue(
      peerRecord,
      "sanitizedStanzaSource",
    );
    const sanitizedStanzaFileSha256 = readValue(
      peerRecord,
      "sanitizedStanzaFileSha256",
    );
    const staleOverrideProblems = matchingRaw.map(
      (_manifest, routeIndex) =>
        `${source}: local ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY} route stanza ${routeIndex} must be removed; on-chain /v1/sccp/manifests is authoritative.`,
    );
    const staleRouteFailedChecks = matchingRaw.flatMap((manifest) =>
      staleRouteValidationFailedChecks(manifest, bscProfile.key),
    );
    return {
      source,
      rawTomlSha256: typeof rawTomlSha256 === "string" ? rawTomlSha256 : null,
      sanitizedStanzaSha256: sha256Hex(sanitizedStanzaText),
      ...(typeof sanitizedStanzaSource === "string"
        ? { sanitizedStanzaSource }
        : {}),
      ...(readValue(peerRecord, "sanitizedStanzaFileChecked") === true
        ? { sanitizedStanzaFileChecked: true }
        : {}),
      ...(readValue(peerRecord, "sanitizedStanzaFileVerified") === true
        ? { sanitizedStanzaFileVerified: true }
        : {}),
      ...(typeof sanitizedStanzaFileSha256 === "string"
        ? { sanitizedStanzaFileSha256 }
        : {}),
      routeCount: matchingRaw.length,
      manifestFingerprint: selectedManifest
        ? fingerprintManifest(selectedManifest)
        : null,
      hashRoleProblems: selectedManifest
        ? [
            ...staleOverrideProblems,
            ...peerRouteHashRoleSeparationProblems(selectedManifest, source),
          ]
        : staleOverrideProblems,
      burnRecordMaterialProblems: selectedManifest
        ? [
            ...staleOverrideProblems,
            ...peerBurnRecordMaterialProblems(selectedManifest, source),
          ]
        : staleOverrideProblems,
      productionReady: selectedManifest?.productionReady === true,
      deployment: null,
      postDeployLiveEvidence: null,
      ready: matchingRaw.length === 0 && stanzaShapeProblems.length === 0,
      failedChecks: [
        ...staleRouteFailedChecks,
        ...stanzaShapeProblems.map((detail) => ({
          id: "peer-route-stanza-shape",
          ok: false,
          status: "fail",
          message: "Peer route stanza collection is malformed.",
          detail,
        })),
        ...staleOverrideProblems.map((detail) => ({
          id: "peer-route-stale-override",
          ok: false,
          status: "fail",
          message: "Peer config carries stale local BSC route material.",
          detail,
        })),
      ],
    };
  });

  check(
    checks,
    "peer-config-files",
    peerConfigShapeProblems.length === 0,
    peerRows.length > 0
      ? "TAIRA peer config audit input is well formed."
      : "No TAIRA peer config source was provided; route material is expected on-chain.",
    peerConfigShapeProblems.join("; "),
  );
  if (expectedPeers !== null) {
    check(
      checks,
      "peer-count",
      peerRows.length === expectedPeers,
      "The expected number of TAIRA peer configs was audited.",
      peerRows.length === expectedPeers
        ? ""
        : `expected ${expectedPeers}, found ${peerRows.length}`,
    );
  }
  const badRouteCounts = peers.filter((peer) => peer.routeCount !== 0);
  check(
    checks,
    "peer-route-count",
    badRouteCounts.length === 0,
    "TAIRA peer configs carry no local taira_bsc_xor/xor route stanzas.",
    badRouteCounts
      .map((peer) => `${peer.source}: ${peer.routeCount}`)
      .join("; "),
  );
  const fingerprints = peers
    .map((peer) => peer.manifestFingerprint)
    .filter(Boolean);
  const uniqueFingerprints = new Set(fingerprints);
  check(
    checks,
    "peer-route-consistency",
    fingerprints.length === 0 && uniqueFingerprints.size === 0,
    "TAIRA peer configs do not carry local BSC route manifest material.",
    fingerprints.length === 0
      ? ""
      : peers
          .filter((peer) => peer.manifestFingerprint)
          .map((peer) => `${peer.source}: ${peer.manifestFingerprint}`)
          .join("; "),
  );
  const unreadyPeers = peers.filter((peer) => !peer.ready);
  check(
    checks,
    "peer-route-production-readiness",
    unreadyPeers.length === 0,
    "BSC route production readiness is not sourced from peer config overrides.",
    unreadyPeers
      .map((peer) => {
        const reasons = peer.failedChecks
          .map(
            (entry) => `${entry.id}${entry.detail ? `: ${entry.detail}` : ""}`,
          )
          .join(", ");
        return `${peer.source}: ${reasons || "route not ready"}`;
      })
      .join("; "),
  );
  const burnRecordMaterialProblemDetails = peers.flatMap(
    (peer) => peer.burnRecordMaterialProblems ?? [],
  );
  check(
    checks,
    "peer-route-burn-record-material",
    burnRecordMaterialProblemDetails.length === 0,
    "TAIRA peer configs do not override BSC burn-record material.",
    burnRecordMaterialProblemDetails.join("; "),
  );
  const hashRoleProblemDetails = peers.flatMap(
    (peer) => peer.hashRoleProblems ?? [],
  );
  check(
    checks,
    "peer-route-hash-role-separation",
    hashRoleProblemDetails.length === 0,
    "TAIRA peer configs do not override BSC route cryptographic hashes.",
    hashRoleProblemDetails.join("; "),
  );
  const rawHashPeers = peers.filter((peer) => peer.rawTomlSha256);
  if (rawHashPeers.length > 0) {
    const missingRawHashes = peers.filter(
      (peer) => !normalizeNonZeroHex32(peer.rawTomlSha256),
    );
    check(
      checks,
      "peer-raw-toml-hashes",
      missingRawHashes.length === 0,
      "Audited peer configs carry non-zero raw TOML SHA-256 evidence.",
      missingRawHashes
        .map((peer) => `${peer.source}: missing or invalid rawTomlSha256`)
        .join("; "),
    );
  }
  const sanitizedFileEvidencePeers = peers.filter(
    (peer) =>
      peer.sanitizedStanzaFileChecked === true ||
      peer.sanitizedStanzaFileVerified === true ||
      typeof peer.sanitizedStanzaFileSha256 === "string",
  );
  const invalidSanitizedFileEvidencePeers = sanitizedFileEvidencePeers.filter(
    (peer) =>
      peer.sanitizedStanzaFileChecked !== true ||
      peer.sanitizedStanzaFileVerified !== true ||
      !normalizeNonZeroHex32(peer.sanitizedStanzaFileSha256) ||
      normalizeNonZeroHex32(peer.sanitizedStanzaFileSha256) !==
        normalizeNonZeroHex32(peer.sanitizedStanzaSha256),
  );
  if (sanitizedFileEvidencePeers.length > 0) {
    check(
      checks,
      "peer-sanitized-stanza-file-evidence",
      invalidSanitizedFileEvidencePeers.length === 0,
      "Sanitized route stanza files were checked and match the audited stanza hash.",
      invalidSanitizedFileEvidencePeers
        .map((peer) => `${peer.source}: missing, unverified, or mismatched`)
        .join("; "),
    );
  }
  const sanitizedStanzaFilesChecked =
    peers.length > 0 &&
    sanitizedFileEvidencePeers.length === peers.length &&
    invalidSanitizedFileEvidencePeers.length === 0;
  const initiallyReady = checks.every((entry) => entry.ok);
  const nextActions = initiallyReady
    ? []
    : bscPeerAuditNextActions(checks, bscProfile);
  const missingProductionInputs =
    bscPeerAuditMissingProductionInputs(nextActions);
  const runbookProblems = bscSccpPeerConfigAuditRunbookProblems({
    nextActions,
    missingProductionInputs,
  });
  check(
    checks,
    "peer-audit-runbook-contract",
    runbookProblems.length === 0,
    "BSC peer config audit exposes a complete operator runbook.",
    runbookProblems.join("; "),
  );
  const ready = checks.every((entry) => entry.ok);
  const generatedAtMs = Date.now();

  return {
    ready,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: bscProfile.key,
    bsc: {
      network: bscProfile.key,
      chain: bscProfile.chain,
      chainIdHex: bscProfile.chainIdHex,
      networkIdHex: bscProfile.networkIdHex,
    },
    expectedPeers,
    peerCount: peerRows.length,
    sanitizedStanzaFilesChecked,
    manifestFingerprint:
      uniqueFingerprints.size === 1 ? [...uniqueFingerprints][0] : null,
    peers,
    checks,
    nextActions,
    missingProductionInputs,
    generatedAt: new Date(generatedAtMs).toISOString(),
    generatedAtMs,
  };
};

const BSC_PEER_CONFIG_AUDIT_CLI_OPTIONS = new Set([
  "dir",
  "file",
  "include-backups",
  "expected-peers",
  "bsc-network",
  "ssh-creds-file",
  "ssh-host",
  "ssh-password-file",
  "ssh-command",
  "sshpass-command",
  "ssh-connect-timeout-seconds",
  "remote-dir",
  "remote-peer-count",
  "sanitized-stanzas-dir",
  "output-dir",
]);

const parseArgs = (argv) => {
  const args = { file: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!BSC_PEER_CONFIG_AUDIT_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC peer-config audit options.`,
      );
    }
    const next = argv[index + 1];
    const value = !next || next.startsWith("--") ? "true" : next;
    if (key === "file") {
      args.file.push(value);
    } else if (args[key] !== undefined) {
      throw new Error(
        `Duplicate option: --${key}. Repeatable options are documented in --help.`,
      );
    } else {
      args[key] = value;
    }
    if (value === next) {
      index += 1;
    }
  }
  return args;
};

const hasHelpFlag = (argv) => argv.includes("--help") || argv.includes("-h");

const assertNoConflictingPeerAuditSources = (args, env = process.env) => {
  const hasLocalSource = trim(args.dir) || (args.file ?? []).length > 0;
  const hasRemoteSource = trim(
    args["ssh-host"] ||
      args["ssh-creds-file"] ||
      env.SCCP_BSC_PEER_AUDIT_SSH_HOST ||
      env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE,
  );
  if (hasLocalSource && hasRemoteSource) {
    throw new Error(
      "Conflicting BSC peer-config audit sources: local --dir/--file cannot be combined with remote SSH source options or environment.",
    );
  }
};

const printUsage = () => {
  console.log(`Usage: node scripts/e2e/sccp-bsc-peer-config-audit.mjs [options]

Audit TAIRA peer configs for stale local BSC SCCP route/prover overrides.

Options:
  --dir DIR
  --file PATH                   May be repeated
  --include-backups
  --expected-peers N
  --bsc-network testnet|mainnet
  --ssh-creds-file PATH
  --ssh-host HOST
  --ssh-password-file PATH
  --ssh-command COMMAND
  --sshpass-command COMMAND
  --ssh-connect-timeout-seconds N
  --remote-dir PATH
  --remote-peer-count N
  --sanitized-stanzas-dir DIR
  --output-dir DIR                Defaults to output/sccp-bsc-peer-config-audit/<bsc-network>
  --help, -h                    Show this help without reading peer configs

Environment:
  SCCP_BSC_NETWORK
  SCCP_BSC_PEER_AUDIT_OUTPUT_DIR
  SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR
  SCCP_BSC_PEER_AUDIT_SSH_HOST
  SCCP_BSC_PEER_AUDIT_SSH_PASSWORD
  SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE
  SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE
  SCCP_BSC_PEER_AUDIT_REMOTE_DIR
  SCCP_BSC_PEER_AUDIT_SSH
  SCCP_BSC_PEER_AUDIT_SSHPASS`);
};

const exactPeerConfigFileName = (index) => `peer${index}.toml`;

const expectedPeerConfigFileNames = (expectedPeers) => {
  if (!Number.isSafeInteger(expectedPeers) || expectedPeers <= 0) {
    return [];
  }
  return Array.from({ length: expectedPeers }, (_, index) =>
    exactPeerConfigFileName(index),
  );
};

const listPeerTomlFiles = async (
  dir,
  includeBackups = false,
  expectedPeers = null,
) => {
  const entries = await readdir(dir);
  const files = [];
  const exactPeerFiles = new Map();
  const expectedExactNames = new Set(
    includeBackups ? [] : expectedPeerConfigFileNames(expectedPeers),
  );
  for (const entry of entries.sort()) {
    if (!/^peer[0-9].*\.toml(?:\.bak.*)?$/u.test(entry)) {
      continue;
    }
    if (!includeBackups && entry.includes(".bak")) {
      continue;
    }
    const fullPath = path.join(dir, entry);
    const info = await lstat(fullPath);
    if (info.isSymbolicLink()) {
      continue;
    }
    if (info.isFile()) {
      files.push(fullPath);
      if (expectedExactNames.has(entry)) {
        exactPeerFiles.set(entry, fullPath);
      }
    }
  }
  if (
    expectedExactNames.size > 0 &&
    expectedExactNames.size === exactPeerFiles.size
  ) {
    return [...expectedExactNames].map((entry) => exactPeerFiles.get(entry));
  }
  return files;
};

const assertRegularPeerConfigFile = async (file) => {
  const info = await lstat(file);
  if (info.isSymbolicLink()) {
    throw new Error(`BSC peer config ${file} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`BSC peer config ${file} must be a regular file.`);
  }
  if (info.size > SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES) {
    throw new Error(
      `BSC peer config ${file} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES} bytes.`,
    );
  }
};

const stripTrailingNewline = (value) =>
  String(value ?? "").replace(/\r?\n$/u, "");

const hasRuntimeSshPassword = (value) =>
  typeof value === "string" && stripTrailingNewline(value).length > 0;

export const assertRuntimeSshCredentialSources = ({
  sshHost,
  sshPassword,
  sshPasswordFile,
  sshCredsFile,
} = {}) => {
  const hostSources = [
    trim(sshHost) ? "sshHost" : null,
    trim(sshCredsFile) ? "sshCredsFile" : null,
  ].filter(Boolean);
  if (hostSources.length > 1) {
    throw new Error(
      `Conflicting BSC peer-config audit SSH host sources: ${hostSources.join(
        ", ",
      )}. Use either an explicit SSH host or an SSH credentials file.`,
    );
  }
  const passwordSources = [
    hasRuntimeSshPassword(sshPassword) ? "sshPassword" : null,
    trim(sshPasswordFile) ? "sshPasswordFile" : null,
    trim(sshCredsFile) ? "sshCredsFile" : null,
  ].filter(Boolean);
  if (passwordSources.length > 1) {
    throw new Error(
      `Conflicting BSC peer-config audit SSH credential sources: ${passwordSources.join(
        ", ",
      )}. Use exactly one runtime password source.`,
    );
  }
};

const readRegularTextFile = async (filePath, label) => {
  const resolved = path.resolve(filePath);
  const info = await lstat(resolved);
  if (info.isSymbolicLink()) {
    throw new Error(`${label} ${resolved} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} ${resolved} must be a regular file.`);
  }
  if (info.size > SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES) {
    throw new Error(
      `${label} ${resolved} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_SSH_CREDENTIALS_MAX_BYTES} bytes.`,
    );
  }
  return readFile(resolved, "utf8");
};

const readRuntimeSshCredentials = async ({
  sshHost,
  sshPassword,
  sshPasswordFile,
  sshCredsFile,
} = {}) => {
  assertRuntimeSshCredentialSources({
    sshHost,
    sshPassword,
    sshPasswordFile,
    sshCredsFile,
  });
  let host = trim(sshHost);
  let password =
    typeof sshPassword === "string" ? stripTrailingNewline(sshPassword) : "";
  if (trim(sshCredsFile)) {
    const text = await readRegularTextFile(
      sshCredsFile,
      "SSH credentials file",
    );
    const lines = text.split(/\r?\n/u);
    if (!host && lines[0]) {
      host = trim(lines[0]);
    }
    if (!password && lines.length > 1) {
      password = stripTrailingNewline(lines[1] ?? "");
    }
  }
  if (trim(sshPasswordFile) && !password) {
    password = stripTrailingNewline(
      await readRegularTextFile(sshPasswordFile, "SSH password file"),
    );
  }
  return { sshHost: host, sshPassword: password };
};

const assertSafeSshHost = (sshHost) => {
  const value = trim(sshHost);
  const hasUnsafeChar = [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 || /\s/u.test(char);
  });
  if (!value || value.startsWith("-") || hasUnsafeChar) {
    throw new Error(
      "--ssh-host must be a non-option SSH target without whitespace.",
    );
  }
  return value;
};

const assertSafeRemoteDir = (remoteDir) => {
  const value = trim(remoteDir || DEFAULT_REMOTE_PEER_CONFIG_DIR).replace(
    /\/+$/u,
    "",
  );
  if (!SAFE_REMOTE_DIR_PATTERN.test(value)) {
    throw new Error(
      "--remote-dir must be an absolute path containing only letters, numbers, slash, dot, underscore, or dash.",
    );
  }
  if (
    value
      .split("/")
      .slice(1)
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error(
      "--remote-dir must not contain empty, dot, or dot-dot path segments.",
    );
  }
  return value;
};

const safeRemotePeerPath = (remoteDir, index) =>
  `${assertSafeRemoteDir(remoteDir)}/peer${index}.toml`;

const sanitizeSshAuditErrorText = (value, secrets = []) => {
  let text = trim(value);
  const secretValues = Array.isArray(secrets)
    ? ownDataArrayValues(secrets)
    : [secrets];
  for (const secret of secretValues.filter(Boolean)) {
    text = text.split(secret).join("[redacted]");
  }
  text = text.replace(
    /((?:mnemonic|recovery[_-]?phrase|seed[_-]?phrase)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[a-z]+(?:\s+[a-z]+){11,23})/giu,
    "$1[redacted]",
  );
  return text
    .replace(
      /((?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}]+)/giu,
      "$1[redacted]",
    )
    .replace(SECRET_VALUE_PATTERN, "[redacted token]");
};

const readRemotePeerConfigToml = async ({
  sshHost,
  remotePath,
  sshPassword = "",
  sshCommand = "ssh",
  sshpassCommand = "sshpass",
  connectTimeoutSeconds = DEFAULT_SSH_CONNECT_TIMEOUT_SECONDS,
  execFileImpl = execFile,
} = {}) => {
  const host = assertSafeSshHost(sshHost);
  const timeout = parsePositiveInteger(
    connectTimeoutSeconds,
    DEFAULT_SSH_CONNECT_TIMEOUT_SECONDS,
    "SSH connect timeout",
  );
  const baseSshArgs = [
    "-o",
    "StrictHostKeyChecking=accept-new",
    "-o",
    `ConnectTimeout=${timeout}`,
  ];
  const password = typeof sshPassword === "string" ? sshPassword : "";
  const command = password ? sshpassCommand : sshCommand;
  const args = password
    ? ["-e", sshCommand, ...baseSshArgs, host, "cat", remotePath]
    : [...baseSshArgs, "-o", "BatchMode=yes", host, "cat", remotePath];
  try {
    const result = await execFileImpl(command, args, {
      encoding: "utf8",
      env: password ? { ...process.env, SSHPASS: password } : process.env,
      maxBuffer: 8 * 1024 * 1024,
    });
    const output =
      typeof result === "string" ? result : String(result?.stdout ?? "");
    const outputBytes = Buffer.byteLength(output, "utf8");
    if (outputBytes > SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES) {
      throw new Error(
        `Remote TAIRA peer config ${remotePath} is ${outputBytes} bytes; maximum allowed is ${SCCP_BSC_PEER_CONFIG_TOML_MAX_BYTES} bytes.`,
      );
    }
    return output;
  } catch (error) {
    const stderr = error?.stderr ? ` ${error.stderr}` : "";
    const message = sanitizeSshAuditErrorText(
      `${error instanceof Error ? error.message : String(error)}${stderr}`,
      [password],
    );
    throw new Error(
      `Unable to read remote TAIRA peer config over SSH: ${message}`,
    );
  }
};

export const readBscSccpPeerConfigFiles = async (
  files,
  { sanitizedStanzasDir = null, reportOutputDir = null } = {},
) => {
  const peerFiles = ownDataArrayValues(files);
  const outputDir = sanitizedStanzasDir
    ? path.resolve(sanitizedStanzasDir)
    : null;
  if (outputDir) {
    await mkdir(outputDir, { recursive: true });
    await assertSanitizedOutputDir(outputDir);
  }
  return Promise.all(
    peerFiles.map(async (file, index) => {
      await assertRegularPeerConfigFile(file);
      const source = publicPeerSourceLabel(file, index);
      const text = await readFile(file, "utf8");
      const stanzas = parseSccpRouteManifestStanzas(text, source);
      const sanitizedStanzaText =
        serializeSanitizedSccpRouteManifestStanzas(stanzas);
      let sanitizedFile = null;
      if (outputDir) {
        sanitizedFile = path.join(
          outputDir,
          sanitizedPeerStanzaBaseName(file, index),
        );
        assertSanitizedStanzaTextSize(sanitizedStanzaText, sanitizedFile);
        await writeSanitizedStanzaOutputFile(
          sanitizedFile,
          sanitizedStanzaText,
        );
      }
      return {
        source,
        rawTomlSha256: sha256Hex(text),
        sanitizedStanzaSha256: sha256Hex(sanitizedStanzaText),
        ...sanitizedStanzaFileEvidence(
          sanitizedFile,
          sanitizedStanzaText,
          outputDir,
          reportOutputDir,
        ),
        stanzas,
      };
    }),
  );
};

export const readBscSccpRemotePeerConfigFiles = async (input = {}) => {
  const sshHost = ownDataValue(input, "sshHost");
  const sshPassword = ownDataValue(input, "sshPassword") ?? "";
  const sshPasswordFile = ownDataValue(input, "sshPasswordFile") ?? "";
  const sshCredsFile = ownDataValue(input, "sshCredsFile") ?? "";
  const remoteDir =
    ownDataValue(input, "remoteDir") ?? DEFAULT_REMOTE_PEER_CONFIG_DIR;
  const remotePeerCount =
    ownDataValue(input, "remotePeerCount") ?? DEFAULT_REMOTE_PEER_COUNT;
  const sanitizedStanzasDir = ownDataValue(input, "sanitizedStanzasDir");
  const sshCommand = ownDataValue(input, "sshCommand") ?? "ssh";
  const sshpassCommand = ownDataValue(input, "sshpassCommand") ?? "sshpass";
  const connectTimeoutSeconds =
    ownDataValue(input, "connectTimeoutSeconds") ??
    DEFAULT_SSH_CONNECT_TIMEOUT_SECONDS;
  const execFileImpl = ownDataValue(input, "execFileImpl") ?? execFile;
  const reportOutputDir = ownDataValue(input, "reportOutputDir") ?? null;
  if (!trim(sanitizedStanzasDir)) {
    throw new Error(
      "Remote peer audits require --sanitized-stanzas-dir so raw peer TOML is never stored locally.",
    );
  }
  const peerCount = parsePositiveInteger(
    remotePeerCount,
    DEFAULT_REMOTE_PEER_COUNT,
    "Remote peer count",
  );
  if (peerCount > MAX_REMOTE_PEER_COUNT) {
    throw new Error(`Remote peer count must be <= ${MAX_REMOTE_PEER_COUNT}.`);
  }
  const credentials = await readRuntimeSshCredentials({
    sshHost,
    sshPassword,
    sshPasswordFile,
    sshCredsFile,
  });
  const host = assertSafeSshHost(credentials.sshHost);
  const outputDir = path.resolve(sanitizedStanzasDir);
  await mkdir(outputDir, { recursive: true });
  await assertSanitizedOutputDir(outputDir);
  const remoteBaseDir = assertSafeRemoteDir(remoteDir);
  const peerConfigs = [];
  for (let index = 0; index < peerCount; index += 1) {
    const remotePath = safeRemotePeerPath(remoteBaseDir, index);
    const text = await readRemotePeerConfigToml({
      sshHost: host,
      remotePath,
      sshPassword: credentials.sshPassword,
      sshCommand,
      sshpassCommand,
      connectTimeoutSeconds,
      execFileImpl,
    });
    const sanitizedFile = path.join(outputDir, `peer${index}.toml`);
    const stanzas = parseSccpRouteManifestStanzas(
      text,
      `remote-peer${index}.toml`,
    );
    const sanitizedStanzaText =
      serializeSanitizedSccpRouteManifestStanzas(stanzas);
    assertSanitizedStanzaTextSize(sanitizedStanzaText, sanitizedFile);
    await writeSanitizedStanzaOutputFile(sanitizedFile, sanitizedStanzaText);
    peerConfigs.push({
      source: `peer${index}.toml`,
      rawTomlSha256: sha256Hex(text),
      sanitizedStanzaSha256: sha256Hex(sanitizedStanzaText),
      ...sanitizedStanzaFileEvidence(
        sanitizedFile,
        sanitizedStanzaText,
        outputDir,
        reportOutputDir,
      ),
      stanzas,
    });
  }
  return peerConfigs;
};

export const runBscSccpPeerConfigAudit = async (options = {}) => {
  const explicitFiles = ownDataArrayValues(ownDataValue(options, "files"));
  const dir = ownDataValue(options, "dir");
  const includeBackups = ownDataValue(options, "includeBackups");
  const expectedPeers = ownDataValue(options, "expectedPeers") ?? null;
  const sanitizedStanzasDir =
    ownDataValue(options, "sanitizedStanzasDir") ?? null;
  const reportOutputDir = ownDataValue(options, "reportOutputDir") ?? null;
  const bscNetwork = ownDataValue(options, "bscNetwork") ?? "testnet";
  const files = [
    ...explicitFiles,
    ...(dir
      ? await listPeerTomlFiles(dir, includeBackups === true, expectedPeers)
      : []),
  ].map((file) => path.resolve(file));
  const uniqueFiles = [...new Set(files)].sort();
  const peerConfigs = await readBscSccpPeerConfigFiles(uniqueFiles, {
    sanitizedStanzasDir,
    reportOutputDir,
  });
  return evaluateBscSccpPeerConfigAudit(peerConfigs, {
    expectedPeers,
    bscNetwork,
  });
};

export const runBscSccpRemotePeerConfigAudit = async (options = {}) => {
  const expectedPeers = ownDataValue(options, "expectedPeers") ?? null;
  const bscNetwork = ownDataValue(options, "bscNetwork") ?? "testnet";
  const peerConfigs = await readBscSccpRemotePeerConfigFiles(options);
  return evaluateBscSccpPeerConfigAudit(peerConfigs, {
    expectedPeers,
    bscNetwork,
  });
};

const main = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertNoConflictingPeerAuditSources(args);
  const expectedPeers = trim(args["expected-peers"])
    ? Number(args["expected-peers"])
    : null;
  if (
    expectedPeers !== null &&
    (!Number.isSafeInteger(expectedPeers) || expectedPeers <= 0)
  ) {
    throw new Error("--expected-peers must be a positive integer.");
  }
  const bscNetwork = resolveBscNetworkProfile(
    args["bsc-network"] || process.env.SCCP_BSC_NETWORK || "testnet",
  ).key;
  const outputDir = bscSccpPeerConfigAuditOutputDir({
    bscNetwork,
    outputDir: args["output-dir"] || process.env.SCCP_BSC_PEER_AUDIT_OUTPUT_DIR,
  });
  const sanitizedStanzasDir =
    args["sanitized-stanzas-dir"] ||
    process.env.SCCP_BSC_PEER_AUDIT_SANITIZED_STANZAS_DIR ||
    null;
  const effectiveSanitizedStanzasDir =
    sanitizedStanzasDir || path.join(outputDir, "stanzas");
  const report = trim(
    args["ssh-host"] ||
      args["ssh-creds-file"] ||
      process.env.SCCP_BSC_PEER_AUDIT_SSH_HOST ||
      process.env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE,
  )
    ? await runBscSccpRemotePeerConfigAudit({
        sshHost: args["ssh-host"] || process.env.SCCP_BSC_PEER_AUDIT_SSH_HOST,
        sshPassword: process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD,
        sshPasswordFile:
          args["ssh-password-file"] ||
          process.env.SCCP_BSC_PEER_AUDIT_SSH_PASSWORD_FILE,
        sshCredsFile:
          args["ssh-creds-file"] ||
          process.env.SCCP_BSC_PEER_AUDIT_SSH_CREDS_FILE,
        remoteDir:
          args["remote-dir"] ||
          process.env.SCCP_BSC_PEER_AUDIT_REMOTE_DIR ||
          DEFAULT_REMOTE_PEER_CONFIG_DIR,
        remotePeerCount: parsePositiveInteger(
          args["remote-peer-count"],
          expectedPeers || DEFAULT_REMOTE_PEER_COUNT,
          "--remote-peer-count",
        ),
        expectedPeers,
        bscNetwork,
        sanitizedStanzasDir: effectiveSanitizedStanzasDir,
        reportOutputDir: outputDir,
        sshCommand:
          args["ssh-command"] || process.env.SCCP_BSC_PEER_AUDIT_SSH || "ssh",
        sshpassCommand:
          args["sshpass-command"] ||
          process.env.SCCP_BSC_PEER_AUDIT_SSHPASS ||
          "sshpass",
        connectTimeoutSeconds: parsePositiveInteger(
          args["ssh-connect-timeout-seconds"],
          DEFAULT_SSH_CONNECT_TIMEOUT_SECONDS,
          "--ssh-connect-timeout-seconds",
        ),
      })
    : await runBscSccpPeerConfigAudit({
        dir: args.dir,
        files: args.file,
        includeBackups: parseBoolean(
          args["include-backups"],
          "--include-backups",
        ),
        expectedPeers,
        bscNetwork,
        sanitizedStanzasDir: effectiveSanitizedStanzasDir,
        reportOutputDir: outputDir,
      });
  const reportPath = path.join(outputDir, "latest.json");
  await writeJsonReportFile(reportPath, report);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nBSC SCCP peer-config audit report: ${reportPath}`);
  if (!report.ready) {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
