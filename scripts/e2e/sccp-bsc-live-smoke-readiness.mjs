#!/usr/bin/env node
/* global globalThis, BigInt */
import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import path, { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { validateMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1 } from "@iroha/iroha-js/sccp";
import { writeJsonReportFile } from "./sccp-bsc-report-output.mjs";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  DEFAULT_BSC_TAIRA_TORII_URL,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  parseJsonWithoutDuplicateKeys,
  requiredBscRouteCheckIds,
  resolveBscNetworkProfile,
  runBscSccpRoutePreflight,
} from "./sccp-bsc-route-preflight.mjs";
import {
  WALLETCONNECT_PROJECT_ID_ENV,
  normalizeSccpBrowserModuleUrl,
  normalizeWalletConnectProjectId,
} from "./sccp-live-smoke-readiness.mjs";

const repoRoot = resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-bsc-smoke-readiness",
);
const DEFAULT_PEER_AUDIT_OUTPUT_DIR = path.join(
  repoRoot,
  "output/sccp-bsc-peer-config-audit",
);
export const bscSccpSmokeReadinessOutputDir = (bscNetwork = "testnet") =>
  path.join(DEFAULT_OUTPUT_DIR, resolveBscNetworkProfile(bscNetwork).key);
export const bscSccpPeerConfigAuditReportPath = (bscNetwork = "testnet") =>
  path.join(
    DEFAULT_PEER_AUDIT_OUTPUT_DIR,
    resolveBscNetworkProfile(bscNetwork).key,
    "latest.json",
  );

export const SCCP_BSC_PROVER_MODULE_URL_ENV = "VITE_SCCP_BSC_PROVER_MODULE_URL";
export const SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL";
export const SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL";
export const SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL";
export const SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL";
export const SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV =
  "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL";
export const SCCP_BSC_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_PROVER_MANIFEST_URL";
export const SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL";
export const SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL";
export const SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL";
export const SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL";
export const SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV =
  "VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL";
export const SCCP_BSC_PROVER_CONFIG_URL_ENV = "VITE_SCCP_BSC_PROVER_CONFIG_URL";
export const SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV =
  "VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL";
export const SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV =
  "VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL";
export const SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA =
  "iroha-demo-sccp-bsc-browser-prover-manifest/v1";
export const SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA =
  "iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1";
export const SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA =
  "iroha-demo-sccp-bsc-runtime-prover/v1";
export const SCCP_BSC_RUNTIME_PROVER_MODULE_URL =
  "/sccp-bsc/taira-bsc-xor-prover.js";
export const SCCP_BSC_RUNTIME_PROVER_CONFIG_URL =
  "/sccp-bsc/taira-bsc-xor-prover.config.json";
export const SCCP_BSC_BROWSER_MODULE_MIN_BYTES = 1024;
export const SCCP_BSC_BROWSER_MODULE_MAX_BYTES = 64 * 1024 * 1024;
export const SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES = 256 * 1024;
const SCCP_BSC_PEER_AUDIT_REPORT_MAX_BYTES = 4 * 1024 * 1024;
const SMOKE_FIXTURE_G1 = Object.freeze(["1", "2"]);
const SMOKE_FIXTURE_G2 = Object.freeze([
  "10857046999023057135944570762232829481370756359578518086990519993285655852781",
  "11559732032986387107991004021392285783925812861821192530917403151452391805634",
  "8495653923123431417604973247489272438418190587263600148770280649306958101930",
  "4082367875863433681332203403145435568316851327593401208105741076214120093531",
]);
const SMOKE_FIXTURE_IC = Object.freeze(
  Array.from({ length: 10 }, () => SMOKE_FIXTURE_G1).flat(),
);
const BN254_BASE_FIELD_MODULUS = BigInt(
  "21888242871839275222246405745257275088696311157297823662689037894645226208583",
);
const BN254_TWIST_B_COEFFICIENT = Object.freeze([
  BigInt(
    "19485874751759354771024239261021720505790618469301721065564631296452457478373",
  ),
  BigInt(
    "266929791119991161246907387137283842545076965332900288569378510910307636690",
  ),
]);
const VERIFIER_VECTOR_ALIASES = Object.freeze([
  Object.freeze(["alpha1", "configuredAlpha1", "vk_alpha_1"]),
  Object.freeze(["beta2", "configuredBeta2", "vk_beta_2"]),
  Object.freeze(["gamma2", "configuredGamma2", "vk_gamma_2"]),
  Object.freeze(["delta2", "configuredDelta2", "vk_delta_2"]),
  Object.freeze(["ic", "configuredIc", "vk_ic", "IC"]),
]);
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES = new Set([
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
]);
const VERIFIER_KEY_HASH_ALIASES = new Set([
  "verifierKeyHash",
  "verifier_key_hash",
  "bridgeVerifierKeyHash",
  "bridge_verifier_key_hash",
  "configuredVerifierKeyHash",
  "configured_verifier_key_hash",
  "vkHash",
  "vk_hash",
]);

export const SCCP_BSC_LIVE_SMOKE_STEPS = Object.freeze([
  "Connect a TAIRA local wallet with testnet XOR on the TAIRA endpoint.",
  "Connect a BSC testnet wallet through WalletConnect/AppKit.",
  "Run one tiny TAIRA -> BSC transfer and verify the BSC testnet finalize transaction link.",
  "Run one tiny BSC -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
]);
const bscLiveSmokeSteps = (profile) =>
  profile.key === "testnet"
    ? SCCP_BSC_LIVE_SMOKE_STEPS
    : Object.freeze([
        "Connect a TAIRA local wallet with XOR on the TAIRA endpoint.",
        `Connect a ${profile.label} wallet through WalletConnect/AppKit.`,
        `Run one tiny TAIRA -> BSC transfer and verify the ${profile.label} finalize transaction link.`,
        "Run one tiny BSC -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
      ]);

const bscSmokeRequiredInput = (id, kind, placeholder, description) =>
  Object.freeze({ id, kind, placeholder, description });

const bscSmokeAction = ({
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

const bscSmokeMissingProductionInputs = (nextActions) => {
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

const bscSmokeReadinessNextActions = ({
  profile,
  failedCheckIds,
  destinationProverModuleEnv,
  sourceProverModuleEnv,
  destinationProverManifestEnv,
  sourceProverManifestEnv,
  runtimeProverConfigEnv,
  runtimeConfigRequired,
}) => {
  const actions = [];
  const failed = (id) => failedCheckIds.has(id);
  if (failed("route-preflight")) {
    actions.push(
      bscSmokeAction({
        id: "refresh-bsc-route-preflight",
        title: "Refresh BSC route preflight",
        detail:
          "Publish production TAIRA/BSC route evidence, then rerun the read-only route preflight for the selected BSC network.",
        requiredInputs: [
          bscSmokeRequiredInput(
            `${profile.key}-public-route-report`,
            "file",
            `<${profile.key}-route-preflight-report.json>`,
            "Fresh public route preflight report proving the TAIRA/BSC route is production-ready.",
          ),
        ],
        blockedByChecks: ["route-preflight"],
        commands: [
          `npm run e2e:sccp:bsc-preflight -- --bsc-network ${profile.key} --check-bsc-contracts true`,
        ],
      }),
    );
  }
  if (failed("peer-config-audit")) {
    actions.push(
      bscSmokeAction({
        id: "refresh-bsc-peer-config-audit",
        title: "Refresh TAIRA peer config audit",
        detail:
          "Audit the active TAIRA peer configs and remove any stale local BSC SCCP route/prover overrides.",
        requiredInputs: [
          bscSmokeRequiredInput(
            "taira-peer-config-targets",
            "operator-environment",
            "<taira-peer-config-targets>",
            "TAIRA peer configuration targets that must not carry local BSC route stanzas.",
          ),
          bscSmokeRequiredInput(
            `${profile.key}-peer-config-audit-report`,
            "file",
            `<${profile.key}-peer-config-audit-report.json>`,
            "Fresh peer audit report proving TAIRA peer configs have no stale local BSC route/prover overrides.",
          ),
        ],
        blockedByChecks: ["peer-config-audit"],
        commands: [
          `npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network ${profile.key} --expected-peers 4`,
        ],
      }),
    );
  }
  if (failed("walletconnect-project-id")) {
    actions.push(
      bscSmokeAction({
        id: "configure-bsc-walletconnect",
        title: "Configure BSC WalletConnect",
        detail:
          "Provide a WalletConnect project id so the UI can request BSC wallet approvals for live smoke transfers.",
        requiredInputs: [
          bscSmokeRequiredInput(
            "walletconnect-project-id",
            "operator-environment",
            "<walletconnect-project-id>",
            `${WALLETCONNECT_PROJECT_ID_ENV} configured outside report files for BSC wallet approval flows.`,
          ),
        ],
        blockedByChecks: ["walletconnect-project-id"],
        commands: [
          `VITE_WALLETCONNECT_PROJECT_ID=<walletconnect-project-id> npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  const proverChecks = [
    "destination-prover-module",
    "destination-prover-manifest",
    "source-prover-module",
    "source-prover-manifest",
  ];
  if (proverChecks.some((id) => failed(id))) {
    actions.push(
      bscSmokeAction({
        id: "publish-bsc-prover-modules",
        title: "Publish BSC browser prover modules",
        detail:
          "Publish browser-safe destination and source prover modules with route-bound sidecar manifests.",
        requiredInputs: [
          bscSmokeRequiredInput(
            `${profile.key}-destination-browser-prover-module`,
            "url",
            "<destination-prover-module-url>",
            `${destinationProverModuleEnv} pointing at a browser-safe TAIRA-to-BSC prover module.`,
          ),
          bscSmokeRequiredInput(
            `${profile.key}-destination-browser-prover-manifest`,
            "url",
            "<destination-prover-manifest-url>",
            `${destinationProverManifestEnv} pointing at the TAIRA-to-BSC prover sidecar manifest.`,
          ),
          bscSmokeRequiredInput(
            `${profile.key}-source-browser-prover-module`,
            "url",
            "<source-prover-module-url>",
            `${sourceProverModuleEnv} pointing at a browser-safe BSC-to-TAIRA source prover module.`,
          ),
          bscSmokeRequiredInput(
            `${profile.key}-source-browser-prover-manifest`,
            "url",
            "<source-prover-manifest-url>",
            `${sourceProverManifestEnv} pointing at the BSC-to-TAIRA source prover sidecar manifest.`,
          ),
        ],
        blockedByChecks: proverChecks.filter((id) => failed(id)),
        commands: [
          `npm run e2e:sccp:bsc-prover-manifest -- --bsc-network ${profile.key} --direction destination --module-url <destination-prover-module-url> --out <destination-prover-manifest.json>`,
          `npm run e2e:sccp:bsc-prover-manifest -- --bsc-network ${profile.key} --direction source --module-url <source-prover-module-url> --out <source-prover-manifest.json>`,
          `npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  if (failed("runtime-prover-config")) {
    actions.push(
      bscSmokeAction({
        id: "publish-bsc-runtime-prover-config",
        title: "Publish BSC runtime prover config",
        detail: runtimeConfigRequired
          ? "Publish a route-bound runtime prover config for the checked-in BSC runtime prover module."
          : "Publish a route-bound runtime prover config when selecting checked-in BSC runtime prover modules.",
        requiredInputs: [
          bscSmokeRequiredInput(
            `${profile.key}-runtime-prover-config`,
            "url",
            "<runtime-prover-config-url>",
            `${runtimeProverConfigEnv} pointing at a runtime config bound to the selected BSC route and native prover bundle.`,
          ),
        ],
        blockedByChecks: ["runtime-prover-config"],
        commands: [
          `npm run e2e:sccp:bsc-runtime-prover-config -- --bsc-network ${profile.key} --out <runtime-prover-config.json>`,
          `npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network ${profile.key}`,
        ],
      }),
    );
  }
  return actions;
};

export const SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS = Object.freeze(
  Object.keys(SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1).sort(),
);

const trimString = (value) => String(value ?? "").trim();
const BSC_WALLETCONNECT_PROJECT_ID_MIN_LENGTH = 16;
const BSC_WALLETCONNECT_PLACEHOLDER_PROJECT_ID_RE =
  /(?:^|[-_.<])(?:changeme|demo|dummy|example|fixture|mock|placeholder|replace|sample|stub|test|testing|todo|your)(?:$|[-_.>])/iu;
const BSC_WALLETCONNECT_LITERAL_PROJECT_ID_RE =
  /(?:^|[-_.<])walletconnect[-_.]?project[-_.]?id(?:$|[-_.>])/iu;

export const normalizeBscWalletConnectProjectId = (value) => {
  const projectId = normalizeWalletConnectProjectId(value);
  if (!projectId) {
    return null;
  }
  const normalized = projectId.toLowerCase();
  if (
    projectId.length < BSC_WALLETCONNECT_PROJECT_ID_MIN_LENGTH ||
    /^([a-z0-9])\1+$/iu.test(projectId) ||
    BSC_WALLETCONNECT_PLACEHOLDER_PROJECT_ID_RE.test(normalized) ||
    BSC_WALLETCONNECT_LITERAL_PROJECT_ID_RE.test(normalized)
  ) {
    throw new Error(
      "BSC WalletConnect project ID must be a production project ID, not placeholder, diagnostic, or test-only material.",
    );
  }
  return projectId;
};

const REDACTED_UNSUPPORTED_FIELD = "[redacted unsupported field]";
const UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN =
  /(?:verifier[_-]?material|verifier[_-]?key[_-]?hash|bridge[_-]?verifier[_-]?key[_-]?hash|configured[_-]?verifier[_-]?key[_-]?hash|prover[_-]?material|proof[_-]?material|groth|alpha1|beta2|gamma2|delta2|vk_|vk[_-]?hash|private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const publicUnsupportedFieldName = (key) =>
  UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN.test(key)
    ? REDACTED_UNSUPPORTED_FIELD
    : key;

const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const readOwnValue = (record, key) => {
  if (!hasOwn(record, key)) {
    return undefined;
  }
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
};
const JSON_ARRAY_INDEX_PATTERN = /^(?:0|[1-9][0-9]*)$/u;
const ownArrayValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => JSON_ARRAY_INDEX_PATTERN.test(key))
    .map((key) => [Number(key), Object.getOwnPropertyDescriptor(value, key)])
    .filter(
      ([index, descriptor]) =>
        Number.isSafeInteger(index) &&
        index >= 0 &&
        index < value.length &&
        descriptor &&
        Object.prototype.hasOwnProperty.call(descriptor, "value"),
    )
    .sort(([left], [right]) => left - right)
    .map(([, descriptor]) => descriptor.value);
};
const ownArrayIndexedValues = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Object.keys(value)
    .filter((key) => JSON_ARRAY_INDEX_PATTERN.test(key))
    .map((key) => [Number(key), Object.getOwnPropertyDescriptor(value, key)])
    .filter(
      ([index]) =>
        Number.isSafeInteger(index) && index >= 0 && index < value.length,
    )
    .sort(([left], [right]) => left - right)
    .map(([index, descriptor]) => [
      index,
      descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
        ? descriptor.value
        : undefined,
    ]);
};
const ownRecordEntries = (record) =>
  isRecord(record)
    ? Object.keys(record).map((key) => [key, readOwnValue(record, key)])
    : [];

const toSnakeCase = (value) =>
  String(value).replace(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

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

export const readBscProfileEnv = (
  profile,
  testnetKey,
  mainnetKey,
  fallbackKey,
) => {
  const activeKey = profile.key === "mainnet" ? mainnetKey : testnetKey;
  return (
    trimString(process.env[activeKey]) || trimString(process.env[fallbackKey])
  );
};

export const bscProfileEnvKey = (profile, testnetKey, mainnetKey) =>
  profile.key === "mainnet" ? mainnetKey : testnetKey;

const describeBscProfileEnv = (profile, testnetKey, mainnetKey, fallbackKey) =>
  `${bscProfileEnvKey(profile, testnetKey, mainnetKey)} (or fallback ${fallbackKey})`;

const check = (id, label, status, detail) => ({ id, label, status, detail });

const isLoopbackModuleHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

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

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const scrubAllowedBscRuntimeTermsForPlaceholderScan = (text) =>
  String(text ?? "")
    .replace(
      /\bsccp-bsc-(?:testnet|mainnet)-native-evm-cross-sdk-fixture-parity-v1\b/gu,
      "sccp-bsc-native-evm-cross-sdk-parity-v1",
    )
    .replace(
      /\bDIAGNOSTIC_BSC_VERIFIER_KEY_HASHES\b/gu,
      "BSC_VERIFIER_KEY_HASH_DENYLIST",
    )
    .replace(
      /\bERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL\b/gu,
      "ERR_SCCP_BSC_RUNTIME_DENYLISTED_MATERIAL",
    )
    .replace(
      /\bknown diagnostic BSC verifier key hash(?:es)?\b/giu,
      "denylisted BSC verifier key hash",
    )
    .replace(/\bplaceholder audit hash(?:es)?\b/giu, "denylisted audit hash")
    .replace(
      /\bplaceholder attestation hash(?:es)?\b/giu,
      "denylisted attestation hash",
    );

export const BSC_DESTINATION_PROVER_EXPORTS = Object.freeze([
  "irohaSccpBscProve",
  "bscSccpProve",
  "evmSccpProve",
  "proveBsc",
  "prove",
  "proveFn",
  "default",
]);

export const BSC_SOURCE_PROVER_EXPORTS = Object.freeze([
  "irohaSccpBscSourceProve",
  "bscSccpSourceProve",
  "proveBscSource",
]);

export const BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS = Object.freeze([
  "irohaSccpBscNativeProverSelfTest",
  "bscSccpNativeProverSelfTest",
  "evmSccpNativeProverSelfTest",
  "nativeProverDestinationSelfTest",
  "selfTestBsc",
  "selfTestDestination",
  "nativeProverSelfTest",
  "selfTestNativeProver",
  "selfTest",
]);

export const BSC_SOURCE_PROVER_SELF_TEST_EXPORTS = Object.freeze([
  "irohaSccpBscSourceNativeProverSelfTest",
  "bscSccpSourceNativeProverSelfTest",
  "nativeProverSourceSelfTest",
  "selfTestBscSource",
  "selfTestSource",
  "nativeProverSelfTest",
  "selfTestNativeProver",
  "selfTest",
]);

export const BSC_ANY_PROVER_EXPORTS = Object.freeze([
  ...new Set([...BSC_DESTINATION_PROVER_EXPORTS, ...BSC_SOURCE_PROVER_EXPORTS]),
]);

export const BSC_ANY_PROVER_SELF_TEST_EXPORTS = Object.freeze([
  ...new Set([
    ...BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS,
    ...BSC_SOURCE_PROVER_SELF_TEST_EXPORTS,
  ]),
]);

export const BSC_RUNTIME_BACKEND_EXPORTS = Object.freeze({
  destination: Object.freeze([
    "bscSccpProve",
    "irohaSccpBscProve",
    "evmSccpProve",
    "proveBsc",
  ]),
  source: Object.freeze([
    "bscSccpSourceProve",
    "irohaSccpBscSourceProve",
    "proveBscSource",
  ]),
});

export const BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS = Object.freeze({
  destination: BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS,
  source: BSC_SOURCE_PROVER_SELF_TEST_EXPORTS,
});

const BSC_SOURCE_PUBLIC_INPUT_BINDING_FIELDS = Object.freeze([
  Object.freeze(["public inputs", ["publicInputs", "public_inputs"]]),
  Object.freeze([
    "source event digest",
    ["sourceEventDigest", "source_event_digest"],
  ]),
  Object.freeze(["commitment root", ["commitmentRoot", "commitment_root"]]),
  Object.freeze(["message id", ["messageId", "message_id"]]),
  Object.freeze(["payload hash", ["payloadHash", "payload_hash"]]),
  Object.freeze(["source domain", ["sourceDomain", "source_domain"]]),
  Object.freeze(["target domain", ["targetDomain", "target_domain"]]),
  Object.freeze([
    "amount base units",
    ["amountBaseUnits", "amount_base_units", "amount"],
  ]),
  Object.freeze(["BSC sender", ["bscSender", "bsc_sender", "sender"]]),
  Object.freeze([
    "TAIRA recipient",
    ["tairaRecipient", "taira_recipient", "recipient"],
  ]),
  Object.freeze(["route id", ["routeId", "route_id", "route"]]),
]);

const hasCallableBscSccpExport = (inspection, acceptedExports) =>
  acceptedExports.some((name) => inspection.callableExports.includes(name));

const sourceProverBindingRequiredForLabel = (label) => {
  const normalized = trimString(label).toLowerCase();
  return (
    /\bsource\b/u.test(normalized) ||
    /bsc\s*(?:-|=)*>\s*taira/u.test(normalized) ||
    /bsc\s+to\s+taira/u.test(normalized)
  );
};

const missingBscSourcePublicInputBindingFields = (text) =>
  BSC_SOURCE_PUBLIC_INPUT_BINDING_FIELDS.filter(([, aliases]) =>
    aliases.every((alias) => !text.includes(alias)),
  ).map(([label]) => label);

const parseBscSccpBrowserProverModule = (
  bytes,
  label = "BSC prover module",
) => {
  const text = Buffer.from(bytes ?? []).toString("utf8");
  const sourceFile = ts.createSourceFile(
    `${label.replace(/[^A-Za-z0-9_.-]/gu, "_")}.js`,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  return sourceFile.parseDiagnostics.length === 0 ? sourceFile : null;
};

const isPackageLocalBscProofRuntimeImport = (value) =>
  (() => {
    if (
      typeof value !== "string" ||
      !/^\.[/\\]/u.test(value) ||
      /[?#]/u.test(value)
    ) {
      return false;
    }
    const normalized = value.replace(/\\/gu, "/");
    let decoded = normalized;
    for (let pass = 0; pass < 4; pass += 1) {
      if (/(?:^|\/)\.\.(?:\/|$)/u.test(decoded)) {
        return false;
      }
      let next;
      try {
        next = decodeURIComponent(decoded);
      } catch (_error) {
        return false;
      }
      if (next === decoded) {
        return true;
      }
      decoded = next;
    }
    return !/(?:^|\/)\.\.(?:\/|$)/u.test(decoded);
  })();

const importedBscGroth16ProofRuntimeBindings = (sourceFile) => {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteral(statement.moduleSpecifier) ||
      !isPackageLocalBscProofRuntimeImport(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) {
      continue;
    }
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text;
      if (importedName === "buildGroth16ProofPackage") {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
};

const callsBscGroth16ProofRuntime = (bytes) => {
  const sourceFile = parseBscSccpBrowserProverModule(bytes);
  if (!sourceFile) {
    return false;
  }
  const runtimeBindings = importedBscGroth16ProofRuntimeBindings(sourceFile);
  if (runtimeBindings.size === 0) {
    return false;
  }
  let found = false;
  const visit = (node) => {
    if (found) {
      return;
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      runtimeBindings.has(node.expression.text)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
};

const BSC_RUNTIME_ADAPTER_REQUIRED_EXPORT_CALL_GRAPH = Object.freeze([
  ["bscSccpProve", Object.freeze(["withRuntime", "verifyDestinationResult"])],
  ["bscSccpNativeProverSelfTest", Object.freeze(["withRuntimeSelfTest"])],
  ["bscSccpSourceProve", Object.freeze(["withRuntime", "verifySourceResult"])],
  ["bscSccpSourceNativeProverSelfTest", Object.freeze(["withRuntimeSelfTest"])],
]);

const BSC_RUNTIME_ADAPTER_REQUIRED_CALL_GRAPH = Object.freeze([
  [
    "withRuntime",
    Object.freeze([
      "ownJsonValue",
      "readConfig",
      "loadMaterial",
      "verifyBundleMaterial",
      "loadBackend",
      "selectBackendFn",
      "selectBackendSelfTestFn",
      "buildContext",
      "runBackendNativeProverSelfTest",
    ]),
  ],
  [
    "withRuntimeSelfTest",
    Object.freeze([
      "ownJsonValue",
      "readConfig",
      "loadMaterial",
      "verifyBundleMaterial",
      "loadBackend",
      "selectBackendSelfTestFn",
      "buildContext",
      "runBackendNativeProverSelfTest",
    ]),
  ],
  [
    "loadMaterial",
    Object.freeze([
      "readBytes",
      "parseJsonBytes",
      "nativeEvmProverBundleDescriptorHash",
      "assertProverMaterialShape",
      "loadNativeBundleArtifacts",
    ]),
  ],
  [
    "loadBackend",
    Object.freeze([
      "strictConfigStringField",
      "readBytes",
      "assertSelfContainedBackendModule",
      "verifiedJavascriptModuleDataUrl",
    ]),
  ],
  [
    "runBackendNativeProverSelfTest",
    Object.freeze(["verifyBackendNativeProverSelfTestResult"]),
  ],
  [
    "verifyBackendNativeProverSelfTestResult",
    Object.freeze([
      "backendStringField",
      "verifyBackendSelfTestHash",
      "verifyBackendSelfTestPublicSignals",
    ]),
  ],
  ["buildContext", Object.freeze(["strictConfigStringField"])],
]);

const bscTopLevelFunctionInitializer = (statement) => {
  if (ts.isFunctionDeclaration(statement) && statement.name && statement.body) {
    return { name: statement.name.text, body: statement.body };
  }
  if (!ts.isVariableStatement(statement)) {
    return null;
  }
  const bindings = [];
  for (const declaration of statement.declarationList.declarations) {
    if (
      ts.isIdentifier(declaration.name) &&
      declaration.initializer &&
      (ts.isArrowFunction(declaration.initializer) ||
        ts.isFunctionExpression(declaration.initializer)) &&
      declaration.initializer.body
    ) {
      bindings.push({
        name: declaration.name.text,
        body: declaration.initializer.body,
      });
    }
  }
  return bindings.length > 0 ? bindings : null;
};

const identifierCallsInFunctionBody = (body) => {
  const calls = new Set();
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.add(node.expression.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return calls;
};

const resolveCallableLocalBindingName = (
  name,
  localBindings,
  seen = new Set(),
) => {
  if (!name || seen.has(name)) {
    return null;
  }
  const binding = localBindings.get(name);
  if (!binding) {
    return null;
  }
  if (binding.callable === true) {
    return name;
  }
  if (binding.callable === false) {
    return null;
  }
  const initializer = binding.initializer;
  if (!initializer) {
    return null;
  }
  if (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer)) {
    return name;
  }
  seen.add(name);
  if (ts.isIdentifier(initializer)) {
    return resolveCallableLocalBindingName(
      initializer.text,
      localBindings,
      seen,
    );
  }
  if (ts.isParenthesizedExpression(initializer)) {
    return resolveCallableExpressionBindingName(
      initializer.expression,
      localBindings,
      seen,
    );
  }
  return null;
};

const resolveCallableExpressionBindingName = (
  expression,
  localBindings,
  seen = new Set(),
) => {
  if (!expression) {
    return null;
  }
  if (ts.isIdentifier(expression)) {
    return resolveCallableLocalBindingName(
      expression.text,
      localBindings,
      seen,
    );
  }
  if (ts.isParenthesizedExpression(expression)) {
    return resolveCallableExpressionBindingName(
      expression.expression,
      localBindings,
      seen,
    );
  }
  return null;
};

const callableBscExportLocalBindings = (sourceFile) => {
  const localBindings = collectLocalBindings(sourceFile);
  const exports = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (!statement.moduleSpecifier && clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const localName = element.propertyName?.text ?? element.name.text;
          const resolved = resolveCallableLocalBindingName(
            localName,
            localBindings,
          );
          if (resolved) {
            exports.set(element.name.text, resolved);
          }
        }
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }
        const resolved = resolveCallableLocalBindingName(
          declaration.name.text,
          localBindings,
        );
        if (resolved) {
          exports.set(declaration.name.text, resolved);
        }
      }
      continue;
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      exports.set(statement.name.text, statement.name.text);
    }
  }
  return exports;
};

const topLevelBscRuntimeAdapterCallGraph = (sourceFile) => {
  const graph = new Map();
  for (const statement of sourceFile.statements) {
    const initializer = bscTopLevelFunctionInitializer(statement);
    if (!initializer) {
      continue;
    }
    const bindings = Array.isArray(initializer) ? initializer : [initializer];
    for (const binding of bindings) {
      graph.set(binding.name, identifierCallsInFunctionBody(binding.body));
    }
  }
  return graph;
};

const callsBscRuntimeAdapterPipeline = (bytes) => {
  const sourceFile = parseBscSccpBrowserProverModule(bytes);
  if (!sourceFile) {
    return false;
  }
  const callGraph = topLevelBscRuntimeAdapterCallGraph(sourceFile);
  const exportedLocalBindings = callableBscExportLocalBindings(sourceFile);
  return (
    BSC_RUNTIME_ADAPTER_REQUIRED_EXPORT_CALL_GRAPH.every(
      ([exportName, requiredCalls]) => {
        const localName = exportedLocalBindings.get(exportName);
        const calls = localName ? callGraph.get(localName) : null;
        return (
          calls instanceof Set && requiredCalls.every((name) => calls.has(name))
        );
      },
    ) &&
    BSC_RUNTIME_ADAPTER_REQUIRED_CALL_GRAPH.every(
      ([functionName, requiredCalls]) => {
        const calls = callGraph.get(functionName);
        return (
          calls instanceof Set && requiredCalls.every((name) => calls.has(name))
        );
      },
    )
  );
};

const requiresBscBrowserProofRuntimeInvocation = (label) =>
  !/\bbackend\s+module\b/iu.test(trimString(label));

export const validateBscSccpBrowserProverModuleBytes = (
  bytes,
  label = "BSC prover module",
) => {
  const size = Number(bytes?.byteLength ?? 0);
  const problems = [];
  if (!Number.isSafeInteger(size) || size <= 0) {
    problems.push("is empty");
  } else if (size < SCCP_BSC_BROWSER_MODULE_MIN_BYTES) {
    problems.push(
      `is ${size} bytes; minimum allowed is ${SCCP_BSC_BROWSER_MODULE_MIN_BYTES} bytes`,
    );
  }
  const text = Buffer.from(bytes ?? []).toString("utf8");
  if (
    /\b(?:diagnostic|dummy|fixture|mock|placeholder|stub|test-only)\b/iu.test(
      scrubAllowedBscRuntimeTermsForPlaceholderScan(text),
    )
  ) {
    problems.push("contains placeholder, diagnostic, or test-only text");
  }
  if (
    /proofBytes\s*:\s*new\s+Uint8Array\s*\(\s*\[[^\]]{0,256}\]\s*\)/iu.test(
      text,
    )
  ) {
    problems.push("returns literal proofBytes instead of generated proof data");
  }
  const fetchPolicy = inspectBscSccpBrowserProverFetchPolicy(bytes, label);
  if (
    !fetchPolicy.ok &&
    !fetchPolicy.detail.includes("not a valid JavaScript module")
  ) {
    problems.push(fetchPolicy.detail);
  }
  const syntax = inspectBscSccpBrowserProverModuleExports(bytes, label);
  if (!syntax.ok) {
    problems.push(syntax.detail);
  } else {
    if (
      requiresBscBrowserProofRuntimeInvocation(label) &&
      !callsBscGroth16ProofRuntime(bytes) &&
      !callsBscRuntimeAdapterPipeline(bytes)
    ) {
      problems.push(
        "does not invoke buildGroth16ProofPackage or the checked-in BSC runtime adapter pipeline",
      );
    }
    const hasCallableSourceProver = hasCallableBscSccpExport(
      syntax,
      BSC_SOURCE_PROVER_EXPORTS,
    );
    const hasCallableDestinationProver = hasCallableBscSccpExport(
      syntax,
      BSC_DESTINATION_PROVER_EXPORTS,
    );
    if (
      hasCallableSourceProver &&
      (!hasCallableDestinationProver ||
        sourceProverBindingRequiredForLabel(label))
    ) {
      const missingSourceFields =
        missingBscSourcePublicInputBindingFields(text);
      if (missingSourceFields.length > 0) {
        problems.push(
          `source prover does not expose required public-input binding fields: ${missingSourceFields.join(", ")}`,
        );
      }
    }
    try {
      assertBscSccpBrowserProverModuleExports(
        bytes,
        BSC_ANY_PROVER_EXPORTS,
        label,
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
    try {
      assertBscSccpBrowserProverModuleExports(
        bytes,
        BSC_ANY_PROVER_SELF_TEST_EXPORTS,
        `${label} native self-test`,
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  return {
    ok: problems.length === 0,
    detail: problems.length
      ? `${label} is not production-shaped: ${problems.join("; ")}.`
      : `${label} is production-shaped.`,
  };
};

const exportModifierKinds = new Set([
  ts.SyntaxKind.ExportKeyword,
  ts.SyntaxKind.DefaultKeyword,
]);

const hasExportModifier = (node) =>
  Array.isArray(node.modifiers) &&
  node.modifiers.some((modifier) => exportModifierKinds.has(modifier.kind));

const hasDefaultModifier = (node) =>
  Array.isArray(node.modifiers) &&
  node.modifiers.some(
    (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
  );

const addBindingNames = (name, target, callable = false) => {
  if (!name) {
    return;
  }
  if (ts.isIdentifier(name)) {
    target.set(name.text, callable);
    return;
  }
  if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        addBindingNames(element.name, target, false);
      }
    }
  }
};

const bindingNameText = (name) => {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) {
    return name.text;
  }
  return "";
};

const addDestructuredBindingEntries = (name, target) => {
  if (ts.isIdentifier(name)) {
    target.set(name.text, {
      callable: false,
      kind: "destructured-variable",
      referencesFetch: false,
    });
    return;
  }
  if (ts.isObjectBindingPattern(name)) {
    for (const element of name.elements) {
      if (!ts.isBindingElement(element)) {
        continue;
      }
      if (ts.isIdentifier(element.name)) {
        const propertyName = bindingNameText(
          element.propertyName ?? element.name,
        );
        target.set(element.name.text, {
          callable: false,
          kind: "destructured-variable",
          referencesFetch: propertyName === "fetch",
        });
        continue;
      }
      addDestructuredBindingEntries(element.name, target);
    }
    return;
  }
  if (ts.isArrayBindingPattern(name)) {
    for (const element of name.elements) {
      if (ts.isBindingElement(element)) {
        addDestructuredBindingEntries(element.name, target);
      }
    }
  }
};

const diagnosticMessageText = (message) =>
  typeof message === "string"
    ? message
    : ts.flattenDiagnosticMessageText(message, " ");

const collectLocalBindings = (sourceFile) => {
  const localBindings = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      localBindings.set(statement.name.text, {
        callable: true,
        kind: "function",
      });
      continue;
    }
    if (ts.isClassDeclaration(statement) && statement.name) {
      localBindings.set(statement.name.text, {
        callable: false,
        kind: "class",
      });
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          localBindings.set(declaration.name.text, {
            initializer: declaration.initializer,
            kind: "variable",
          });
        } else {
          addDestructuredBindingEntries(declaration.name, localBindings);
        }
      }
    }
  }
  return localBindings;
};

const stringLiteralValue = (expression) => {
  if (!expression) {
    return null;
  }
  if (
    ts.isStringLiteral(expression) ||
    ts.isNoSubstitutionTemplateLiteral(expression)
  ) {
    return expression.text;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return stringLiteralValue(expression.expression);
  }
  return null;
};

const isObjectFreezeCall = (expression) =>
  ts.isCallExpression(expression) &&
  expression.arguments.length === 1 &&
  ts.isPropertyAccessExpression(expression.expression) &&
  expression.expression.name.text === "freeze" &&
  ts.isIdentifier(expression.expression.expression) &&
  expression.expression.expression.text === "Object";

const staticObjectLiteralExpression = (
  expression,
  localBindings,
  seen = new Set(),
) => {
  if (!expression) {
    return null;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return staticObjectLiteralExpression(
      expression.expression,
      localBindings,
      seen,
    );
  }
  if (isObjectFreezeCall(expression)) {
    return staticObjectLiteralExpression(
      expression.arguments[0],
      localBindings,
      seen,
    );
  }
  if (ts.isIdentifier(expression)) {
    if (seen.has(expression.text)) {
      return null;
    }
    seen.add(expression.text);
    const binding = localBindings.get(expression.text);
    return staticObjectLiteralExpression(
      binding?.initializer,
      localBindings,
      seen,
    );
  }
  return ts.isObjectLiteralExpression(expression) ? expression : null;
};

const objectLiteralStaticStringProperties = (expression) => {
  const properties = new Map();
  const duplicateNames = [];
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property)) {
      return { duplicateNames, properties, unsafe: true };
    }
    let name = "";
    if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) {
      name = property.name.text;
    } else {
      return { duplicateNames, properties, unsafe: true };
    }
    const value = stringLiteralValue(property.initializer);
    if (value === null) {
      return { duplicateNames, properties, unsafe: true };
    }
    if (properties.has(name)) {
      duplicateNames.push(name);
    }
    properties.set(name, value);
  }
  return { duplicateNames, properties, unsafe: false };
};

const requiredRuntimeFetchOptions = Object.freeze([
  Object.freeze(["method", "GET"]),
  Object.freeze(["credentials", "omit"]),
  Object.freeze(["redirect", "error"]),
  Object.freeze(["cache", "no-store"]),
]);
const requiredRuntimeFetchOptionNames = new Set(
  requiredRuntimeFetchOptions.map(([field]) => field),
);

const expressionReferencesFetch = (
  expression,
  localBindings,
  seen = new Set(),
) => {
  if (!expression) {
    return false;
  }
  if (ts.isParenthesizedExpression(expression)) {
    return expressionReferencesFetch(
      expression.expression,
      localBindings,
      seen,
    );
  }
  if (ts.isIdentifier(expression)) {
    if (expression.text === "fetch") {
      return true;
    }
    if (seen.has(expression.text)) {
      return false;
    }
    seen.add(expression.text);
    const binding = localBindings.get(expression.text);
    return (
      binding?.referencesFetch === true ||
      expressionReferencesFetch(binding?.initializer, localBindings, seen)
    );
  }
  return (
    ts.isPropertyAccessExpression(expression) &&
    expression.name.text === "fetch"
  );
};

const runtimeFetchOptionsProblem = (expression, localBindings) => {
  const options = staticObjectLiteralExpression(expression, localBindings);
  if (!options) {
    return "fetch options must be a static object literal or Object.freeze(...) binding";
  }
  const { duplicateNames, properties, unsafe } =
    objectLiteralStaticStringProperties(options);
  if (unsafe) {
    return "fetch options must not use spread, computed, shorthand, or non-static properties";
  }
  if (duplicateNames.length > 0) {
    return `fetch options must not repeat ${duplicateNames.join(", ")}`;
  }
  for (const field of properties.keys()) {
    if (!requiredRuntimeFetchOptionNames.has(field)) {
      return `fetch options must not set unsupported field ${field}`;
    }
  }
  for (const [field, expected] of requiredRuntimeFetchOptions) {
    if (properties.get(field) !== expected) {
      return `fetch options must set ${field}: ${JSON.stringify(expected)}`;
    }
  }
  return "";
};

const isFetchCallExpression = (expression, localBindings) =>
  expressionReferencesFetch(expression, localBindings);

const runtimeFetchPolicyProblems = (sourceFile, localBindings) => {
  const problems = [];
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      isFetchCallExpression(node.expression, localBindings)
    ) {
      const problem = runtimeFetchOptionsProblem(
        node.arguments[1],
        localBindings,
      );
      if (problem) {
        const { line, character } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile),
        );
        problems.push(`fetch at ${line + 1}:${character + 1} ${problem}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return problems;
};

const inspectBscSccpBrowserProverFetchPolicy = (
  bytes,
  label = "BSC prover module",
) => {
  const text = Buffer.from(bytes ?? []).toString("utf8");
  const sourceFile = ts.createSourceFile(
    `${label.replace(/[^A-Za-z0-9_.-]/gu, "_")}.js`,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const first = sourceFile.parseDiagnostics[0];
    return {
      ok: false,
      detail: `${label} is not a valid JavaScript module: ${diagnosticMessageText(first.messageText)}`,
    };
  }
  const localBindings = collectLocalBindings(sourceFile);
  const problems = runtimeFetchPolicyProblems(sourceFile, localBindings);
  return {
    ok: problems.length === 0,
    detail: problems.length
      ? `${label} runtime fetch policy is unsafe: ${problems.join("; ")}.`
      : `${label} runtime fetch policy is production-shaped.`,
  };
};

const isCallableLocalBinding = (name, localBindings, seen = new Set()) => {
  if (!name || seen.has(name)) {
    return false;
  }
  const binding = localBindings.get(name);
  if (!binding) {
    return false;
  }
  if (typeof binding.callable === "boolean") {
    return binding.callable;
  }
  seen.add(name);
  return isCallableExportExpression(binding.initializer, localBindings, seen);
};

const isCallableExportExpression = (
  expression,
  localBindings,
  seen = new Set(),
) => {
  if (!expression) {
    return false;
  }
  if (ts.isArrowFunction(expression) || ts.isFunctionExpression(expression)) {
    return true;
  }
  if (ts.isIdentifier(expression)) {
    return isCallableLocalBinding(expression.text, localBindings, seen);
  }
  if (ts.isParenthesizedExpression(expression)) {
    return isCallableExportExpression(
      expression.expression,
      localBindings,
      seen,
    );
  }
  return false;
};

const sortedExportDetails = (exports) =>
  [...exports.entries()]
    .map(([name, callable]) => ({ name, callable: callable === true }))
    .sort((left, right) => left.name.localeCompare(right.name));

const formatExportDetails = (exportDetails) =>
  exportDetails.length
    ? exportDetails
        .map(
          ({ name, callable }) =>
            `${name}${callable ? " (callable)" : " (non-callable)"}`,
        )
        .join(", ")
    : "none";

export const inspectBscSccpBrowserProverModuleExports = (
  bytes,
  label = "BSC prover module",
) => {
  const text = Buffer.from(bytes ?? []).toString("utf8");
  const sourceFile = ts.createSourceFile(
    `${label.replace(/[^A-Za-z0-9_.-]/gu, "_")}.js`,
    text,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.JS,
  );
  if (sourceFile.parseDiagnostics.length > 0) {
    const first = sourceFile.parseDiagnostics[0];
    return {
      ok: false,
      exports: [],
      detail: `${label} is not a valid JavaScript module: ${diagnosticMessageText(first.messageText)}`,
    };
  }

  const localBindings = collectLocalBindings(sourceFile);
  const exports = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isExportAssignment(statement)) {
      if (!statement.isExportEquals) {
        exports.set(
          "default",
          isCallableExportExpression(statement.expression, localBindings),
        );
      }
      continue;
    }
    if (ts.isExportDeclaration(statement)) {
      const clause = statement.exportClause;
      if (clause && ts.isNamedExports(clause)) {
        for (const element of clause.elements) {
          const localName = element.propertyName?.text ?? element.name.text;
          exports.set(
            element.name.text,
            !statement.moduleSpecifier &&
              isCallableLocalBinding(localName, localBindings),
          );
        }
      }
      if (clause && ts.isNamespaceExport(clause)) {
        exports.set(clause.name.text, false);
      }
      continue;
    }
    if (!hasExportModifier(statement)) {
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          exports.set(
            declaration.name.text,
            isCallableLocalBinding(declaration.name.text, localBindings),
          );
        } else {
          addBindingNames(declaration.name, exports, false);
        }
      }
      continue;
    }
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    ) {
      const callable = ts.isFunctionDeclaration(statement);
      if (hasDefaultModifier(statement)) {
        exports.set("default", callable);
      } else if (statement.name) {
        exports.set(statement.name.text, callable);
      }
    }
  }
  const exportDetails = sortedExportDetails(exports);
  const exportNames = exportDetails.map(({ name }) => name);
  const callableExports = exportDetails
    .filter(({ callable }) => callable)
    .map(({ name }) => name);
  return {
    ok: true,
    exports: exportNames,
    callableExports,
    exportDetails,
    detail: `${label} exports: ${formatExportDetails(exportDetails)}.`,
  };
};

export const assertBscSccpBrowserProverModuleExports = (
  bytes,
  acceptedExports,
  label = "BSC prover module",
) => {
  const inspection = inspectBscSccpBrowserProverModuleExports(bytes, label);
  if (!inspection.ok) {
    throw new Error(inspection.detail);
  }
  const accepted = [
    ...new Set(
      ownArrayValues(Array.isArray(acceptedExports) ? acceptedExports : [])
        .map((name) => (typeof name === "string" ? name.trim() : ""))
        .filter(Boolean),
    ),
  ];
  if (
    accepted.length > 0 &&
    !accepted.some((name) => inspection.exports.includes(name))
  ) {
    throw new Error(
      `${label} does not export one of ${accepted.join(", ")}; found ${inspection.exports.join(", ") || "none"}.`,
    );
  }
  if (
    accepted.length > 0 &&
    !accepted.some((name) => inspection.callableExports.includes(name))
  ) {
    const presentAccepted = accepted.filter((name) =>
      inspection.exports.includes(name),
    );
    throw new Error(
      `${label} exports ${presentAccepted.join(", ")} but no accepted prover export is callable; expected a callable function named one of ${accepted.join(", ")}; found ${formatExportDetails(inspection.exportDetails)}.`,
    );
  }
  return inspection;
};

const normalizeHex32 = (value) => {
  const normalized = trimString(value).toLowerCase();
  return /^0x[0-9a-f]{64}$/u.test(normalized) ? normalized : null;
};
const normalizeNonZeroHex32 = (value) => {
  const normalized = normalizeHex32(value);
  return normalized && !/^0x0{64}$/u.test(normalized) ? normalized : null;
};

const isPathInside = (rootPath, candidatePath) => {
  const relative = path.relative(rootPath, candidatePath);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
};

const resolveLocalBrowserUrlPath = (normalized, moduleRepoRoot = repoRoot) => {
  const root = path.resolve(moduleRepoRoot);
  if (normalized.startsWith("/")) {
    const allowedRoot = path.join(root, "public");
    return {
      allowedRoot,
      existsDetail: `${normalized} exists under public/.`,
      hashDetail: `${normalized} exists under public/ and matches moduleSha256.`,
      localPath: path.join(allowedRoot, normalized.replace(/^\/+/u, "")),
      missingDetail: `does not exist under public/.`,
      scopeLabel: "public/",
    };
  }
  if (normalized.startsWith("./")) {
    return {
      allowedRoot: root,
      existsDetail: `${normalized} exists in the package.`,
      hashDetail: `${normalized} exists in the package and matches moduleSha256.`,
      localPath: path.resolve(root, normalized),
      missingDetail: `does not exist in the package.`,
      scopeLabel: "package root",
    };
  }
  return null;
};

const resolveSafeLocalBrowserUrlPath = async (target, normalized, label) => {
  let info;
  try {
    info = await lstat(target.localPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      throw new Error(`${label} ${normalized} ${target.missingDetail}`);
    }
    throw error;
  }
  if (info.isSymbolicLink()) {
    throw new Error(`${label} ${normalized} must not be a symbolic link.`);
  }
  if (!info.isFile()) {
    throw new Error(`${label} ${normalized} must be a regular file.`);
  }
  const [allowedRoot, resolvedPath] = await Promise.all([
    realpath(target.allowedRoot),
    realpath(target.localPath),
  ]);
  if (!isPathInside(allowedRoot, resolvedPath)) {
    throw new Error(
      `${label} ${normalized} resolves outside ${target.scopeLabel}.`,
    );
  }
  return resolvedPath;
};

const responseContentLength = (response) => {
  const raw = response.headers?.get?.("content-length") ?? "";
  if (!/^\d+$/u.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const readRemoteResponseBytesBounded = async (response, label, maxBytes) => {
  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error(
      `content-length ${contentLength} exceeds maximum allowed ${maxBytes} bytes`,
    );
  }

  const body = response.body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk =
          value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new Error(
            `${label} response exceeds maximum allowed ${maxBytes} bytes`,
          );
        }
        chunks.push(Buffer.from(chunk));
      }
    } finally {
      reader.releaseLock?.();
    }
    return Buffer.concat(chunks, total);
  }

  if (typeof response.arrayBuffer === "function") {
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `${label} response exceeds maximum allowed ${maxBytes} bytes`,
      );
    }
    return bytes;
  }

  const text = await response.text();
  const bytes = Buffer.from(text, "utf8");
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `${label} response exceeds maximum allowed ${maxBytes} bytes`,
    );
  }
  return bytes;
};

export const deriveSccpBrowserProverManifestUrl = (moduleUrl, label) => {
  const normalized = normalizeSccpBrowserModuleUrl(moduleUrl, label);
  return normalized ? `${normalized}.manifest.json` : null;
};

const browserUrlPathParts = (normalizedUrl) => {
  try {
    const parsed = new URL(normalizedUrl);
    return {
      scope: `${parsed.origin}${path.posix.dirname(parsed.pathname)}/`,
      leaf: path.posix.basename(parsed.pathname),
    };
  } catch (_error) {
    return {
      scope: `${path.posix.dirname(normalizedUrl)}/`,
      leaf: path.posix.basename(normalizedUrl),
    };
  }
};

const browserManifestUrlMatchesModuleUrl = (manifestUrl, moduleUrl) => {
  if (!manifestUrl || !moduleUrl) {
    return false;
  }
  if (manifestUrl === `${moduleUrl}.manifest.json`) {
    return true;
  }
  const manifest = browserUrlPathParts(manifestUrl);
  const module = browserUrlPathParts(moduleUrl);
  const moduleStem = module.leaf.replace(/\.[^./]+$/u, "");
  return (
    manifest.scope === module.scope &&
    [`${module.leaf}.manifest.json`, `${moduleStem}.manifest.json`].includes(
      manifest.leaf,
    )
  );
};

const isBscRuntimeProverModuleUrl = (moduleUrl) => {
  const normalized = trimString(moduleUrl);
  return (
    normalized === SCCP_BSC_RUNTIME_PROVER_MODULE_URL ||
    normalized.endsWith("/sccp-bsc/taira-bsc-xor-prover.js") ||
    normalized.endsWith("./public/sccp-bsc/taira-bsc-xor-prover.js")
  );
};

export const deriveBscRuntimeProverConfigUrl = (...moduleUrls) => {
  const selected = moduleUrls
    .map((moduleUrl) => trimString(moduleUrl))
    .find(isBscRuntimeProverModuleUrl);
  if (!selected) {
    return null;
  }
  if (selected === SCCP_BSC_RUNTIME_PROVER_MODULE_URL) {
    return SCCP_BSC_RUNTIME_PROVER_CONFIG_URL;
  }
  return selected.replace(/(?:^|\/)taira-bsc-xor-prover\.js$/u, (match) =>
    match.replace(
      "taira-bsc-xor-prover.js",
      "taira-bsc-xor-prover.config.json",
    ),
  );
};

const readSccpBrowserUrlBytes = async ({
  url,
  label,
  repoRoot: moduleRepoRoot = repoRoot,
  fetchImpl = globalThis.fetch,
  timeoutMs = 5_000,
  maxBytes = SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  validateProductionModule = false,
}) => {
  const normalized = normalizeSccpBrowserModuleUrl(url, label);
  if (!normalized) {
    throw new Error(`${label} is required.`);
  }
  const localPath = resolveLocalBrowserUrlPath(normalized, moduleRepoRoot);
  if (localPath) {
    const safePath = await resolveSafeLocalBrowserUrlPath(
      localPath,
      normalized,
      label,
    );
    const info = await lstat(safePath);
    if (info.size > maxBytes) {
      throw new Error(
        `${label} ${normalized} is ${info.size} bytes; maximum allowed is ${maxBytes} bytes.`,
      );
    }
    const bytes = await readFile(safePath);
    if (bytes.byteLength > maxBytes) {
      throw new Error(
        `${label} ${normalized} is ${bytes.byteLength} bytes; maximum allowed is ${maxBytes} bytes.`,
      );
    }
    if (validateProductionModule) {
      const shape = validateBscSccpBrowserProverModuleBytes(bytes, label);
      if (!shape.ok) {
        throw new Error(shape.detail);
      }
    }
    return { normalized, bytes };
  }

  const parsed = new URL(normalized);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && isLoopbackModuleHost(parsed.hostname))
  ) {
    throw new Error(
      `${label} must be a relative path, HTTPS URL, or loopback HTTP URL.`,
    );
  }
  if (typeof fetchImpl !== "function") {
    throw new Error(`${label} ${normalized} could not be fetched.`);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(normalized, {
      method: "GET",
      signal: controller.signal,
    });
    if (!response.ok && response.status !== 304) {
      throw new Error(`HTTP ${response.status}`);
    }
    const bytes = await readRemoteResponseBytesBounded(
      response,
      `${label} ${normalized}`,
      maxBytes,
    );
    if (validateProductionModule) {
      const shape = validateBscSccpBrowserProverModuleBytes(bytes, label);
      if (!shape.ok) {
        throw new Error(shape.detail);
      }
    }
    return { normalized, bytes };
  } catch (error) {
    throw new Error(
      `${label} ${normalized} could not be fetched: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    clearTimeout(timer);
  }
};

export const inspectSccpBrowserModuleAvailability = async (input = {}) => {
  const moduleUrl = readOwnValue(input, "moduleUrl");
  const label = readOwnValue(input, "label");
  const moduleRepoRoot = readOwnValue(input, "repoRoot") ?? repoRoot;
  const fetchImpl = readOwnValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = readOwnValue(input, "timeoutMs") ?? 5_000;
  const expectedSha256 = readOwnValue(input, "expectedSha256");
  const expectedExports = readOwnValue(input, "expectedExports") ?? [];
  const expectedSelfTestExports =
    readOwnValue(input, "expectedSelfTestExports") ?? [];
  const maxBytes =
    readOwnValue(input, "maxBytes") ?? SCCP_BSC_BROWSER_MODULE_MAX_BYTES;
  const normalized = normalizeSccpBrowserModuleUrl(moduleUrl, label);
  if (!normalized) {
    return null;
  }
  const expectedHash = expectedSha256 ? normalizeHex32(expectedSha256) : null;
  if (expectedSha256 && !expectedHash) {
    return {
      ok: false,
      detail: `${label} expected SHA-256 must be a 32-byte hex value.`,
    };
  }
  const inspectLocalModuleBytes = async (localPath, safePath) => {
    const info = await lstat(safePath);
    if (info.size > maxBytes) {
      return {
        ok: false,
        detail: `${label} ${normalized} is ${info.size} bytes; maximum allowed is ${maxBytes} bytes.`,
      };
    }
    const bytes = await readFile(safePath);
    if (bytes.byteLength > maxBytes) {
      return {
        ok: false,
        detail: `${label} ${normalized} is ${bytes.byteLength} bytes; maximum allowed is ${maxBytes} bytes.`,
      };
    }
    const shape = validateBscSccpBrowserProverModuleBytes(bytes, label);
    if (!shape.ok) {
      return {
        ok: false,
        detail: shape.detail,
      };
    }
    try {
      assertBscSccpBrowserProverModuleExports(bytes, expectedExports, label);
      assertBscSccpBrowserProverModuleExports(
        bytes,
        expectedSelfTestExports,
        `${label} native self-test`,
      );
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    const actualHash = sha256Hex(bytes);
    if (!expectedHash) {
      return {
        ok: true,
        moduleUrl: normalized,
        moduleSha256: actualHash,
        expectedSha256: null,
        detail: `${localPath.existsDetail} Module bytes are production-shaped.`,
      };
    }
    return actualHash === expectedHash
      ? {
          ok: true,
          moduleUrl: normalized,
          moduleSha256: actualHash,
          expectedSha256: expectedHash,
          detail: localPath.hashDetail,
        }
      : {
          ok: false,
          detail: `${label} ${normalized} SHA-256 ${actualHash} does not match manifest moduleSha256 ${expectedHash}.`,
        };
  };
  if (normalized.startsWith("/")) {
    const localPath = resolveLocalBrowserUrlPath(normalized, moduleRepoRoot);
    let safePath;
    try {
      safePath = await resolveSafeLocalBrowserUrlPath(
        localPath,
        normalized,
        label,
      );
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    return inspectLocalModuleBytes(localPath, safePath);
  }
  if (normalized.startsWith("./")) {
    const localPath = resolveLocalBrowserUrlPath(normalized, moduleRepoRoot);
    let safePath;
    try {
      safePath = await resolveSafeLocalBrowserUrlPath(
        localPath,
        normalized,
        label,
      );
    } catch (error) {
      return {
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      };
    }
    return inspectLocalModuleBytes(localPath, safePath);
  }

  const parsed = new URL(normalized);
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && isLoopbackModuleHost(parsed.hostname))
  ) {
    return null;
  }
  if (typeof fetchImpl !== "function") {
    return {
      ok: false,
      detail: `${label} ${normalized} could not be checked because fetch is unavailable.`,
    };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(normalized, {
      method: "GET",
      signal: controller.signal,
    });
    if (response.ok || response.status === 304) {
      const bytes = await readRemoteResponseBytesBounded(
        response,
        `${label} ${normalized}`,
        maxBytes,
      );
      const shape = validateBscSccpBrowserProverModuleBytes(bytes, label);
      if (!shape.ok) {
        return {
          ok: false,
          detail: shape.detail,
        };
      }
      try {
        assertBscSccpBrowserProverModuleExports(bytes, expectedExports, label);
        assertBscSccpBrowserProverModuleExports(
          bytes,
          expectedSelfTestExports,
          `${label} native self-test`,
        );
      } catch (error) {
        return {
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
        };
      }
      const actualHash = sha256Hex(bytes);
      if (expectedHash) {
        if (actualHash !== expectedHash) {
          return {
            ok: false,
            detail: `${label} ${normalized} SHA-256 ${actualHash} does not match manifest moduleSha256 ${expectedHash}.`,
          };
        }
      }
      return {
        ok: true,
        moduleUrl: normalized,
        moduleSha256: actualHash,
        expectedSha256: expectedHash ?? null,
        detail: expectedHash
          ? `${normalized} responded to GET with HTTP ${response.status} and matches moduleSha256.`
          : `${normalized} responded to GET with HTTP ${response.status} and module bytes are production-shaped.`,
      };
    }
    return {
      ok: false,
      detail: `${label} ${normalized} responded to GET with HTTP ${response.status}.`,
    };
  } catch (error) {
    return {
      ok: false,
      detail: `${label} ${normalized} could not be reached: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  } finally {
    clearTimeout(timer);
  }
};

const PUBLIC_ROUTE_DEPLOYMENT_FIELDS = Object.freeze([
  "bridgeAddress",
  "tokenAddress",
  "sourceBridgeAddress",
  "verifierAddress",
  "networkIdHex",
  "verifierCodeHash",
  "verifierKeyHash",
  "proofArtifactHash",
  "provingKeyHash",
  "nativeEvmProverBundleHash",
  "destinationBindingHash",
  "settlementAssetDefinitionId",
]);

export const requiredBscSmokeRouteCheckIds = requiredBscRouteCheckIds;

const readPublicString = (record, key) => {
  const value = readOwnValue(record, key);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || null;
};
const readSinglePublicStringAlias = (record, label, ...keys) => {
  const present = keys
    .map((key) => ({ key, value: readPublicString(record, key) }))
    .filter(({ value }) => Boolean(value));
  return {
    value: present[0]?.value ?? null,
    problems:
      present.length > 1
        ? [
            `${label} must not use multiple aliases: ${present.map(({ key }) => key).join(", ")}.`,
          ]
        : [],
  };
};
const readPublicBoolean = (record, key) => readOwnValue(record, key) === true;
const readPublicNumber = (record, key) => {
  const value = readOwnValue(record, key);
  return typeof value === "number" ? value : null;
};
const readPublicRecord = (record, key) => {
  const value = readOwnValue(record, key);
  return isRecord(value) ? value : null;
};
const readPublicArray = (record, key) => {
  const value = readOwnValue(record, key);
  return Array.isArray(value) ? ownArrayValues(value) : null;
};
const readPublicArrayEntries = (record, key) => {
  const value = readOwnValue(record, key);
  return Array.isArray(value) ? ownArrayIndexedValues(value) : null;
};

const parseReportTimestampMs = (value) => {
  if (Number.isSafeInteger(value)) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const normalized = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u.test(normalized)) {
    return null;
  }
  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const canonical = new Date(parsed).toISOString();
  return normalized === canonical ||
    normalized === canonical.replace(".000Z", "Z")
    ? parsed
    : null;
};

const POINT_REPORT_TIMESTAMP_KEYS = Object.freeze([
  "checkedAt",
  "generatedAt",
  "generatedAtMs",
  "recordedAt",
  "capturedAt",
]);

const presentReportTimestampFields = (report) =>
  POINT_REPORT_TIMESTAMP_KEYS.filter((key) => hasOwn(report, key))
    .map((key) => ({
      key,
      value: readOwnValue(report, key),
      parsed: parseReportTimestampMs(readOwnValue(report, key)),
    }))
    .filter(({ value }) => value !== null && value !== undefined);

const reportTimestampAliasProblems = (report, label) => {
  if (!isRecord(report)) {
    return [];
  }
  const pointFields = presentReportTimestampFields(report);
  if (pointFields.length < 2 || pointFields[0]?.parsed === null) {
    return [];
  }
  const invalid = pointFields.slice(1).filter(({ parsed }) => parsed === null);
  const problems = invalid.map(({ key }) => `${label} ${key} is invalid`);
  const parsedPointFields = pointFields.filter(({ parsed }) => parsed !== null);
  const uniqueTimestamps = new Set(
    parsedPointFields.map(({ parsed }) => parsed),
  );
  if (uniqueTimestamps.size > 1) {
    problems.push(
      `${label} point timestamp fields disagree: ${parsedPointFields
        .map(({ key }) => key)
        .join(", ")}`,
    );
  }
  return problems;
};

const ownJsonValue = (value, seen = new WeakMap()) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }
    const out = new Array(value.length);
    seen.set(value, out);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      out[index] =
        descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
          ? ownJsonValue(descriptor.value, seen)
          : undefined;
    }
    return out;
  }
  if (!isRecord(value)) {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  const out = Object.create(null);
  seen.set(value, out);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      descriptor.enumerable &&
      Object.prototype.hasOwnProperty.call(descriptor, "value")
    ) {
      out[key] = ownJsonValue(descriptor.value, seen);
    }
  }
  return out;
};
const ownJsonRecord = (value) => (isRecord(value) ? ownJsonValue(value) : null);

const PUBLIC_ROUTE_DEPLOYMENT_ALIASES = Object.freeze({
  bridgeAddress: Object.freeze([
    "bridgeAddress",
    "bridge_address",
    "bscBridgeAddress",
    "bsc_bridge_address",
    "evmBridgeAddress",
    "evm_bridge_address",
  ]),
  tokenAddress: Object.freeze([
    "tokenAddress",
    "token_address",
    "bscTokenAddress",
    "bsc_token_address",
    "evmTokenAddress",
    "evm_token_address",
  ]),
  sourceBridgeAddress: Object.freeze([
    "sourceBridgeAddress",
    "source_bridge_address",
    "sccpBscSourceBridgeAddress",
    "sccp_bsc_source_bridge_address",
    "bscSourceBridgeAddress",
    "bsc_source_bridge_address",
    "evmSourceBridgeAddress",
    "evm_source_bridge_address",
  ]),
  verifierAddress: Object.freeze([
    "verifierAddress",
    "verifier_address",
    "sccpBscDestinationVerifierAddress",
    "sccp_bsc_destination_verifier_address",
    "bscVerifierAddress",
    "bsc_verifier_address",
    "destinationVerifierAddress",
    "destination_verifier_address",
    "evmVerifierAddress",
    "evm_verifier_address",
  ]),
  networkIdHex: Object.freeze(["networkIdHex", "network_id_hex"]),
  verifierCodeHash: Object.freeze([
    "verifierCodeHash",
    "verifier_code_hash",
    "verifierCodeHashHex",
    "verifier_code_hash_hex",
  ]),
  verifierKeyHash: Object.freeze([
    "verifierKeyHash",
    "verifier_key_hash",
    "verifierKeyHashHex",
    "verifier_key_hash_hex",
  ]),
  proofArtifactHash: Object.freeze([
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
  ]),
  provingKeyHash: Object.freeze(["provingKeyHash", "proving_key_hash"]),
  nativeEvmProverBundleHash: Object.freeze([
    "nativeEvmProverBundleHash",
    "native_evm_prover_bundle_hash",
    "nativeProverBundleHash",
    "native_prover_bundle_hash",
  ]),
  destinationBindingHash: Object.freeze([
    "destinationBindingHash",
    "destination_binding_hash",
    "bindingHash",
    "binding_hash",
  ]),
  settlementAssetDefinitionId: Object.freeze([
    "settlementAssetDefinitionId",
    "settlement_asset_definition_id",
  ]),
});

const readPublicDeploymentString = (deployment, key) => {
  for (const alias of PUBLIC_ROUTE_DEPLOYMENT_ALIASES[key] ?? [key]) {
    const value = readPublicString(deployment, alias);
    if (value) {
      return value;
    }
  }
  return null;
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

const PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS = Object.freeze([
  "sourceBridgeConfigHash",
  "sourceEventTransactionId",
  "sourceEventExplorerUrl",
  "routeCanaryEvidenceHash",
  "routeCanaryTransactionId",
  "routeCanaryExplorerUrl",
  "offlineFullTomlSha256",
]);

const publicPostDeployLiveEvidence = (evidence) => {
  if (!isRecord(evidence)) {
    return null;
  }
  return {
    fullTomlReady: readPublicBoolean(evidence, "fullTomlReady"),
    ...Object.fromEntries(
      PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS.map((key) => [
        key,
        readPublicString(evidence, key),
      ]),
    ),
  };
};

const publicStringArray = (value) =>
  Array.isArray(value)
    ? value.map((entry) => trimString(entry)).filter(Boolean)
    : [];

const publicRequiredInputs = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: readPublicString(entry, "id"),
        kind: readPublicString(entry, "kind"),
        placeholder: readPublicString(entry, "placeholder"),
        description: readPublicString(entry, "description"),
      }))
    : [];

const publicMissingInputs = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: readPublicString(entry, "id"),
        kind: readPublicString(entry, "kind"),
        placeholder: readPublicString(entry, "placeholder"),
        description: readPublicString(entry, "description"),
        blockedByActions: publicStringArray(
          readPublicArray(entry, "blockedByActions"),
        ),
      }))
    : [];

const publicNextActions = (entries) =>
  Array.isArray(entries)
    ? entries.filter(isRecord).map((entry) => ({
        id: readPublicString(entry, "id"),
        title: readPublicString(entry, "title"),
        detail: readPublicString(entry, "detail"),
        requiredInputs: publicRequiredInputs(
          readPublicArray(entry, "requiredInputs"),
        ),
        blockedByChecks: publicStringArray(
          readPublicArray(entry, "blockedByChecks"),
        ),
        commands: publicStringArray(readPublicArray(entry, "commands")),
      }))
    : [];

const publicPeerAuditReport = (peerAuditReport) => {
  if (!isRecord(peerAuditReport)) {
    return null;
  }
  return {
    ready: readPublicBoolean(peerAuditReport, "ready"),
    routeId: readPublicString(peerAuditReport, "routeId"),
    assetKey: readPublicString(peerAuditReport, "assetKey"),
    expectedPeers: readPublicNumber(peerAuditReport, "expectedPeers"),
    peerCount: readPublicNumber(peerAuditReport, "peerCount"),
    manifestFingerprint: readPublicString(
      peerAuditReport,
      "manifestFingerprint",
    ),
    sanitizedStanzaFilesChecked: readPublicBoolean(
      peerAuditReport,
      "sanitizedStanzaFilesChecked",
    ),
    checks: readPublicArray(peerAuditReport, "checks")
      ? readPublicArray(peerAuditReport, "checks")
          .filter(isRecord)
          .map((entry) => ({
            id: readPublicString(entry, "id"),
            ok: readPublicBoolean(entry, "ok"),
            message: readPublicString(entry, "message"),
          }))
      : [],
    nextActions: publicNextActions(
      readPublicArray(peerAuditReport, "nextActions"),
    ),
    missingProductionInputs: publicMissingInputs(
      readPublicArray(peerAuditReport, "missingProductionInputs"),
    ),
    peers: readPublicArray(peerAuditReport, "peers")
      ? readPublicArray(peerAuditReport, "peers")
          .filter(isRecord)
          .map((peer) => ({
            source: readPublicString(peer, "source"),
            routeCount: readPublicNumber(peer, "routeCount"),
            rawTomlSha256: readPublicString(peer, "rawTomlSha256"),
            sanitizedStanzaSha256: readPublicString(
              peer,
              "sanitizedStanzaSha256",
            ),
            sanitizedStanzaFileChecked: readPublicBoolean(
              peer,
              "sanitizedStanzaFileChecked",
            ),
            sanitizedStanzaFileVerified: readPublicBoolean(
              peer,
              "sanitizedStanzaFileVerified",
            ),
            sanitizedStanzaFileSha256: readPublicString(
              peer,
              "sanitizedStanzaFileSha256",
            ),
            manifestFingerprint: readPublicString(peer, "manifestFingerprint"),
            productionReady: readPublicBoolean(peer, "productionReady"),
            ready: readPublicBoolean(peer, "ready"),
            deployment: publicRouteDeployment(
              readPublicRecord(peer, "deployment"),
            ),
            postDeployLiveEvidence: publicPostDeployLiveEvidence(
              readPublicRecord(peer, "postDeployLiveEvidence"),
            ),
            hashRoleProblems: publicStringArray(
              readPublicArray(peer, "hashRoleProblems"),
            ),
            burnRecordMaterialProblems: publicStringArray(
              readPublicArray(peer, "burnRecordMaterialProblems"),
            ),
            failedChecks: readPublicArray(peer, "failedChecks")
              ? readPublicArray(peer, "failedChecks")
                  .filter(isRecord)
                  .map((entry) => ({
                    id: readPublicString(entry, "id"),
                    ok: readPublicBoolean(entry, "ok"),
                    status: readPublicString(entry, "status"),
                    message: readPublicString(entry, "message"),
                  }))
              : [],
          }))
      : [],
  };
};

const routeReportHasPassedCheck = (routeReport, id) =>
  Array.isArray(readPublicArray(routeReport, "checks")) &&
  readPublicArray(routeReport, "checks").some(
    (entry) =>
      isRecord(entry) &&
      readPublicString(entry, "id") === id &&
      (readPublicBoolean(entry, "ok") ||
        trimString(readPublicString(entry, "status")) === "pass"),
  );

const reportCheckIntegrityProblems = (report, label) => {
  if (!isRecord(report)) {
    return [`${label} report is missing.`];
  }
  const checks = readPublicArrayEntries(report, "checks");
  if (!checks) {
    return [`${label} report checks are missing or invalid.`];
  }
  const problems = [];
  const seen = new Set();
  for (const [index, entry] of checks) {
    if (!isRecord(entry)) {
      problems.push(`${label} check ${index} is not an object.`);
      continue;
    }
    const id = readPublicString(entry, "id");
    const checkLabel = id || `index ${index}`;
    if (!id) {
      problems.push(`${label} check ${index} id is missing.`);
    } else if (seen.has(id)) {
      problems.push(`${label} check id ${id} is duplicated.`);
    } else {
      seen.add(id);
    }
    const hasOk = hasOwn(entry, "ok") && typeof entry.ok === "boolean";
    const status = trimString(readPublicString(entry, "status")).toLowerCase();
    const hasStatus = status === "pass" || status === "fail";
    if (!hasOk && !hasStatus) {
      problems.push(
        `${label} check ${checkLabel} has no machine-readable pass/fail state.`,
      );
    }
    if (
      hasOk &&
      hasStatus &&
      readPublicBoolean(entry, "ok") !== (status === "pass")
    ) {
      problems.push(
        `${label} check ${checkLabel} has contradictory ok/status.`,
      );
    }
  }
  return problems;
};

const unsupportedPublicReportFields = (record, allowedFields, label) => {
  if (!isRecord(record)) {
    return [];
  }
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .sort()
    .map(
      (key) =>
        `${label} contains unsupported field ${publicUnsupportedFieldName(
          key,
        )}.`,
    );
};
const publicRecordArrayShapeProblems = (record, key, label) => {
  const value = readOwnValue(record, key);
  if (!hasOwn(record, key)) {
    return [];
  }
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (!isRecord(entry)) {
      problems.push(`${label} ${index} is not an object.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing.`);
    }
  }
  return problems;
};
const validatedPublicRecordArray = (problems, record, key, label) => {
  if (!hasOwn(record, key)) {
    return null;
  }
  problems.push(...publicRecordArrayShapeProblems(record, key, label));
  const value = readPublicArray(record, key);
  return Array.isArray(value) ? value : null;
};
const validatedRequiredPublicRecordArray = (problems, record, key, label) => {
  if (!hasOwn(record, key)) {
    problems.push(`${label} is not an array.`);
    return null;
  }
  return validatedPublicRecordArray(problems, record, key, label);
};

const PEER_AUDIT_REPORT_FIELDS = Object.freeze(
  new Set([
    "ready",
    "routeId",
    "assetKey",
    "bscNetwork",
    "bsc",
    "expectedPeers",
    "peerCount",
    "sanitizedStanzaFilesChecked",
    "manifestFingerprint",
    "peers",
    "checks",
    "nextActions",
    "missingProductionInputs",
    "generatedAt",
    "generatedAtMs",
  ]),
);
const PEER_AUDIT_BSC_FIELDS = Object.freeze(
  new Set([
    "network",
    "chain",
    "chainIdHex",
    "networkIdHex",
    "explorerUrl",
    "explorerHost",
  ]),
);
const PEER_AUDIT_CHECK_FIELDS = Object.freeze(
  new Set(["id", "ok", "status", "message", "detail"]),
);
const PUBLIC_NEXT_ACTION_FIELDS = Object.freeze(
  new Set([
    "id",
    "title",
    "detail",
    "requiredInputs",
    "blockedByChecks",
    "commands",
  ]),
);
const PUBLIC_REQUIRED_INPUT_FIELDS = Object.freeze(
  new Set(["id", "kind", "placeholder", "description", "blockedByActions"]),
);
const stringArrayShapeProblems = (record, key, label) => {
  if (!hasOwn(record, key)) {
    return [];
  }
  const value = readOwnValue(record, key);
  if (!Array.isArray(value)) {
    return [`${label} is not an array.`];
  }
  const problems = [];
  const presentIndexes = new Set();
  for (const [index, entry] of ownArrayIndexedValues(value)) {
    presentIndexes.add(index);
    if (typeof entry !== "string" || !entry.trim()) {
      problems.push(`${label} ${index} is not a non-empty string.`);
    }
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!presentIndexes.has(index)) {
      problems.push(`${label} ${index} is missing.`);
    }
  }
  return problems;
};
const publicRequiredInputContractProblems = (input, label) => {
  if (!isRecord(input)) {
    return [];
  }
  const problems = [];
  for (const field of ["id", "kind", "placeholder", "description"]) {
    if (!readPublicString(input, field)) {
      problems.push(`${label} ${field} is missing or not a non-empty string.`);
    }
  }
  problems.push(
    ...stringArrayShapeProblems(
      input,
      "blockedByActions",
      `${label} blockedByActions`,
    ),
  );
  return problems;
};
const publicNextActionContractProblems = (action, label) => {
  if (!isRecord(action)) {
    return [];
  }
  const problems = [];
  for (const field of ["id", "title", "detail"]) {
    if (!readPublicString(action, field)) {
      problems.push(`${label} ${field} is missing or not a non-empty string.`);
    }
  }
  const requiredInputs = readPublicArray(action, "requiredInputs");
  if (!Array.isArray(requiredInputs) || requiredInputs.length === 0) {
    problems.push(`${label} requiredInputs is missing or empty.`);
  }
  const blockedByChecks = readPublicArray(action, "blockedByChecks");
  if (!Array.isArray(blockedByChecks) || blockedByChecks.length === 0) {
    problems.push(`${label} blockedByChecks is missing or empty.`);
  }
  const commands = readPublicArray(action, "commands");
  if (!Array.isArray(commands) || commands.length === 0) {
    problems.push(`${label} commands is missing or empty.`);
  }
  problems.push(
    ...stringArrayShapeProblems(
      action,
      "blockedByChecks",
      `${label} blockedByChecks`,
    ),
    ...stringArrayShapeProblems(action, "commands", `${label} command`),
  );
  return problems;
};

const rememberUniquePublicId = (seen, id, label, problems) => {
  if (!id) {
    return;
  }
  if (seen.has(id)) {
    problems.push(`${label} id ${id} is duplicated.`);
    return;
  }
  seen.add(id);
};

export const bscSccpLiveSmokeReadinessRunbookProblems = (report) => {
  if (!isRecord(report)) {
    return ["BSC live smoke-readiness runbook report is not an object."];
  }
  const problems = [];
  const nextActions = validatedRequiredPublicRecordArray(
    problems,
    report,
    "nextActions",
    "BSC live smoke-readiness next action",
  );
  const missingProductionInputs = validatedRequiredPublicRecordArray(
    problems,
    report,
    "missingProductionInputs",
    "BSC live smoke-readiness missing production input",
  );
  const actionIds = new Set();
  const requiredInputIdsByActionId = new Map();
  const missingInputIds = new Set();
  const missingInputsById = new Map();
  if (nextActions) {
    for (const [index, action] of nextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      const actionId = readPublicString(action, "id");
      rememberUniquePublicId(
        actionIds,
        actionId,
        "BSC live smoke-readiness next action",
        problems,
      );
      problems.push(
        ...unsupportedPublicReportFields(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `BSC live smoke-readiness next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `BSC live smoke-readiness next action ${index}`,
        ),
      );
      const requiredInputs = validatedPublicRecordArray(
        problems,
        action,
        "requiredInputs",
        `BSC live smoke-readiness next action ${index} required input`,
      );
      const requiredInputIds = new Set();
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          if (!isRecord(input)) {
            continue;
          }
          problems.push(
            ...unsupportedPublicReportFields(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `BSC live smoke-readiness next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `BSC live smoke-readiness next action ${index} required input ${inputIndex}`,
            ),
          );
          rememberUniquePublicId(
            requiredInputIds,
            readPublicString(input, "id"),
            `BSC live smoke-readiness next action ${index} required input`,
            problems,
          );
        }
      }
      if (actionId) {
        requiredInputIdsByActionId.set(actionId, requiredInputIds);
      }
    }
  }
  if (missingProductionInputs) {
    for (const [index, input] of missingProductionInputs.entries()) {
      if (!isRecord(input)) {
        continue;
      }
      const label = `BSC live smoke-readiness missing production input ${index}`;
      const inputId = readPublicString(input, "id");
      rememberUniquePublicId(
        missingInputIds,
        inputId,
        "BSC live smoke-readiness missing production input",
        problems,
      );
      if (inputId && !missingInputsById.has(inputId)) {
        missingInputsById.set(inputId, input);
      }
      problems.push(
        ...unsupportedPublicReportFields(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          label,
        ),
        ...publicRequiredInputContractProblems(input, label),
      );
      if (!hasOwn(input, "blockedByActions")) {
        problems.push(`${label} blockedByActions is missing.`);
      }
    }
  }
  if (nextActions && missingProductionInputs) {
    for (const [actionId, requiredInputIds] of requiredInputIdsByActionId) {
      for (const inputId of requiredInputIds) {
        const missingInput = missingInputsById.get(inputId);
        if (!missingInput) {
          problems.push(
            `BSC live smoke-readiness next action ${actionId} requires input ${inputId}, but missingProductionInputs does not include it.`,
          );
          continue;
        }
        const blockers = readPublicArray(missingInput, "blockedByActions");
        if (Array.isArray(blockers) && !blockers.includes(actionId)) {
          problems.push(
            `BSC live smoke-readiness missing production input ${inputId} does not reference blocking action ${actionId}.`,
          );
        }
      }
    }
    for (const [inputId, input] of missingInputsById) {
      const blockers = readPublicArray(input, "blockedByActions");
      if (!Array.isArray(blockers)) {
        continue;
      }
      for (const actionId of blockers) {
        if (typeof actionId !== "string" || !actionId.trim()) {
          continue;
        }
        if (!actionIds.has(actionId)) {
          problems.push(
            `BSC live smoke-readiness missing production input ${inputId} references unknown blocking action ${actionId}.`,
          );
          continue;
        }
        if (!requiredInputIdsByActionId.get(actionId)?.has(inputId)) {
          problems.push(
            `BSC live smoke-readiness missing production input ${inputId} references blocking action ${actionId}, but that action does not require the input.`,
          );
        }
      }
    }
  }
  return problems;
};
const REQUIRED_PEER_AUDIT_CHECK_IDS = Object.freeze([
  "peer-config-files",
  "peer-route-count",
  "peer-route-consistency",
  "peer-route-production-readiness",
  "peer-route-burn-record-material",
  "peer-route-hash-role-separation",
  "peer-audit-runbook-contract",
]);
const PEER_AUDIT_PEER_FIELDS = Object.freeze(
  new Set([
    "source",
    "rawTomlSha256",
    "sanitizedStanzaSha256",
    "sanitizedStanzaSource",
    "sanitizedStanzaFileChecked",
    "sanitizedStanzaFileVerified",
    "sanitizedStanzaFileSha256",
    "routeCount",
    "manifestFingerprint",
    "hashRoleProblems",
    "productionReady",
    "deployment",
    "postDeployLiveEvidence",
    "ready",
    "failedChecks",
    "burnRecordMaterialProblems",
  ]),
);

const requiredPeerAuditCheckProblems = (peerAuditReport) => {
  if (!isRecord(peerAuditReport)) {
    return [];
  }
  const problems = [];
  for (const id of REQUIRED_PEER_AUDIT_CHECK_IDS) {
    if (!routeReportHasPassedCheck(peerAuditReport, id)) {
      problems.push(`peer audit report is missing passing ${id} check.`);
    }
  }
  return problems;
};

const failedRouteCheckProblems = (routeReport) =>
  readPublicArray(routeReport, "checks")
    ? readPublicArray(routeReport, "checks").flatMap((entry) => {
        if (!isRecord(entry)) {
          return [];
        }
        const failed =
          (hasOwn(entry, "ok") && entry.ok === false) ||
          trimString(readPublicString(entry, "status")) === "fail";
        if (!failed) {
          return [];
        }
        return [
          `${readPublicString(entry, "id") || "route-check"}: ${
            readPublicString(entry, "detail") ||
            readPublicString(entry, "message") ||
            readPublicString(entry, "label") ||
            "failed"
          }`,
        ];
      })
    : [];

const normalizeHexString = (value) => trimString(value).toLowerCase();

const isNonZeroEvmAddress = (value) =>
  /^0x[0-9a-f]{40}$/u.test(value) && !/^0x0{40}$/u.test(value);

const isNonZeroHex32 = (value) =>
  /^0x[0-9a-f]{64}$/u.test(value) && !/^0x0{64}$/u.test(value);

const routeReportBindingProblems = (
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  const problems = [];
  if (!isRecord(routeReport)) {
    return ["route report is missing."];
  }
  const routeTaira = readPublicRecord(routeReport, "taira");
  const routeBsc = readPublicRecord(routeReport, "bsc");
  const routeId = readPublicString(routeReport, "routeId");
  const assetKey = readPublicString(routeReport, "assetKey");
  if (readPublicString(routeReport, "manifestSource") === "file") {
    problems.push(
      "route preflight used a local manifest file; public TAIRA route publication is not proven.",
    );
  }

  if (
    routeId !== SCCP_BSC_XOR_ROUTE_ID ||
    assetKey !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `expected route ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}, received ${routeId || "<missing>"}/${assetKey || "<missing>"}.`,
    );
  }

  if (
    readPublicString(routeTaira, "chainId") !== BSC_TAIRA_CHAIN_ID ||
    readPublicNumber(routeTaira, "networkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
  ) {
    problems.push("route report is not bound to the TAIRA testnet chain.");
  }

  if (readPublicString(routeBsc, "network") !== profile.key) {
    problems.push(
      `route report is not bound to ${profile.label} network label ${profile.key}.`,
    );
  }

  if (readPublicString(routeBsc, "chain") !== profile.chain) {
    problems.push(
      `route report is not bound to ${profile.label} chain ${profile.chain}.`,
    );
  }

  if (readPublicString(routeBsc, "chainIdHex") !== profile.chainIdHex) {
    problems.push(
      `route report is not bound to ${profile.label} chain id ${profile.chainIdHex}.`,
    );
  }

  if (readPublicString(routeBsc, "networkIdHex") !== profile.networkIdHex) {
    problems.push(
      `route report is not bound to ${profile.label} network id ${Number.parseInt(profile.chainIdHex.slice(2), 16)}.`,
    );
  }

  const deployment = publicRouteDeployment(
    readPublicRecord(routeReport, "deployment"),
  );
  if (!deployment) {
    problems.push("deployment evidence is missing.");
    return problems;
  }
  const deploymentValue = (key) => readOwnValue(deployment, key);

  for (const key of [
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
  ]) {
    const rawValue = deploymentValue(key);
    const value = normalizeHexString(rawValue);
    if (rawValue && !isNonZeroEvmAddress(value)) {
      problems.push(`${key} must be a non-zero EVM address.`);
    }
  }
  const contractAddresses = [
    deploymentValue("bridgeAddress"),
    deploymentValue("tokenAddress"),
    deploymentValue("sourceBridgeAddress"),
    deploymentValue("verifierAddress"),
  ]
    .map((value) => normalizeHexString(value))
    .filter((value) => isNonZeroEvmAddress(value));
  if (new Set(contractAddresses).size !== contractAddresses.length) {
    problems.push(
      "bridgeAddress, tokenAddress, sourceBridgeAddress, and verifierAddress must be distinct.",
    );
  }

  if (
    deploymentValue("networkIdHex") &&
    normalizeHexString(deploymentValue("networkIdHex")) !== profile.networkIdHex
  ) {
    problems.push(`networkIdHex must be the ${profile.label} network id.`);
  }

  return problems;
};

const bscExplorerTransactionHash = (
  href,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  try {
    const url = new URL(trimString(href));
    const match = url.pathname
      .replace(/\/+$/u, "")
      .match(/^\/tx\/0x([0-9a-f]{64})$/iu);
    if (
      url.protocol === "https:" &&
      url.hostname === profile.explorerHost &&
      match
    ) {
      return `0x${match[1].toLowerCase()}`;
    }
  } catch (_error) {
    // Invalid or non-URL evidence fails through the empty hash below.
  }
  return "";
};

const postDeployEvidenceProblems = (
  evidence,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  if (!evidence) {
    return ["route postDeployLiveEvidence is missing."];
  }
  const evidenceValue = (key) => readOwnValue(evidence, key);
  const problems = [];
  if (evidenceValue("fullTomlReady") !== true) {
    problems.push("route postDeployLiveEvidence.fullTomlReady is not true.");
  }
  for (const key of [
    "sourceBridgeConfigHash",
    "sourceEventTransactionId",
    "routeCanaryEvidenceHash",
    "routeCanaryTransactionId",
    "offlineFullTomlSha256",
  ]) {
    if (!isNonZeroHex32(normalizeHexString(evidenceValue(key)))) {
      problems.push(
        `route postDeployLiveEvidence.${key} is missing or invalid.`,
      );
    }
  }
  if (
    isNonZeroHex32(
      normalizeHexString(evidenceValue("sourceBridgeConfigHash")),
    ) &&
    isNonZeroHex32(
      normalizeHexString(evidenceValue("routeCanaryEvidenceHash")),
    ) &&
    normalizeHexString(evidenceValue("sourceBridgeConfigHash")) ===
      normalizeHexString(evidenceValue("routeCanaryEvidenceHash"))
  ) {
    problems.push(
      "route postDeployLiveEvidence.sourceBridgeConfigHash and routeCanaryEvidenceHash must be distinct.",
    );
  }
  if (
    isNonZeroHex32(
      normalizeHexString(evidenceValue("sourceEventTransactionId")),
    ) &&
    isNonZeroHex32(
      normalizeHexString(evidenceValue("routeCanaryTransactionId")),
    ) &&
    normalizeHexString(evidenceValue("sourceEventTransactionId")) ===
      normalizeHexString(evidenceValue("routeCanaryTransactionId"))
  ) {
    problems.push(
      "route postDeployLiveEvidence.sourceEventTransactionId and routeCanaryTransactionId must be distinct.",
    );
  }
  for (const [urlKey, txKey] of [
    ["sourceEventExplorerUrl", "sourceEventTransactionId"],
    ["routeCanaryExplorerUrl", "routeCanaryTransactionId"],
  ]) {
    const urlHash = bscExplorerTransactionHash(evidenceValue(urlKey), profile);
    const expectedHash = normalizeHexString(evidenceValue(txKey));
    if (!urlHash) {
      problems.push(
        `route postDeployLiveEvidence.${urlKey} is missing or invalid.`,
      );
    } else if (isNonZeroHex32(expectedHash) && urlHash !== expectedHash) {
      problems.push(
        `route postDeployLiveEvidence.${urlKey} does not match ${txKey}.`,
      );
    }
  }
  return problems;
};

const routeReportProblems = (
  routeReport,
  profile = resolveBscNetworkProfile("testnet"),
) => {
  const problems = [];
  if (!isRecord(routeReport)) {
    return ["route report is missing."];
  }
  const routeTaira = readPublicRecord(routeReport, "taira");
  const routeBsc = readPublicRecord(routeReport, "bsc");
  const routeId = readPublicString(routeReport, "routeId");
  const assetKey = readPublicString(routeReport, "assetKey");
  problems.push(...reportTimestampAliasProblems(routeReport, "route report"));
  problems.push(...reportCheckIntegrityProblems(routeReport, "route report"));
  problems.push(...routeReportSecurityProblems(routeReport));
  problems.push(...failedRouteCheckProblems(routeReport));
  if (readPublicString(routeReport, "manifestSource") === "file") {
    problems.push(
      "route preflight used a local manifest file; public TAIRA route publication is not proven.",
    );
  }

  if (
    routeId !== SCCP_BSC_XOR_ROUTE_ID ||
    assetKey !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `expected route ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}, received ${routeId || "<missing>"}/${assetKey || "<missing>"}.`,
    );
  }

  if (
    readPublicString(routeTaira, "chainId") !== BSC_TAIRA_CHAIN_ID ||
    readPublicNumber(routeTaira, "networkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
  ) {
    problems.push("route report is not bound to the TAIRA testnet chain.");
  }

  if (readPublicString(routeBsc, "network") !== profile.key) {
    problems.push(
      `route report is not bound to ${profile.label} network label ${profile.key}.`,
    );
  }

  if (readPublicString(routeBsc, "chain") !== profile.chain) {
    problems.push(
      `route report is not bound to ${profile.label} chain ${profile.chain}.`,
    );
  }

  if (readPublicString(routeBsc, "chainIdHex") !== profile.chainIdHex) {
    problems.push(
      `route report is not bound to ${profile.label} chain id ${profile.chainIdHex}.`,
    );
  }

  if (readPublicString(routeBsc, "networkIdHex") !== profile.networkIdHex) {
    problems.push(
      `route report is not bound to ${profile.label} network id ${Number.parseInt(profile.chainIdHex.slice(2), 16)}.`,
    );
  }

  const deployment = publicRouteDeployment(
    readPublicRecord(routeReport, "deployment"),
  );
  problems.push(
    ...postDeployEvidenceProblems(
      publicPostDeployLiveEvidence(
        readPublicRecord(routeReport, "postDeployLiveEvidence"),
      ),
      profile,
    ),
  );
  if (!deployment) {
    problems.push("deployment evidence is missing.");
    return problems;
  }
  const deploymentValue = (key) => readOwnValue(deployment, key);

  for (const key of PUBLIC_ROUTE_DEPLOYMENT_FIELDS) {
    if (!deploymentValue(key)) {
      problems.push(`${key} is missing.`);
    }
  }

  for (const key of [
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
  ]) {
    const rawValue = deploymentValue(key);
    const value = normalizeHexString(rawValue);
    if (rawValue && !isNonZeroEvmAddress(value)) {
      problems.push(`${key} must be a non-zero EVM address.`);
    }
  }
  const contractAddresses = [
    deploymentValue("bridgeAddress"),
    deploymentValue("tokenAddress"),
    deploymentValue("sourceBridgeAddress"),
    deploymentValue("verifierAddress"),
  ]
    .map((value) => normalizeHexString(value))
    .filter((value) => isNonZeroEvmAddress(value));
  if (new Set(contractAddresses).size !== contractAddresses.length) {
    problems.push(
      "bridgeAddress, tokenAddress, sourceBridgeAddress, and verifierAddress must be distinct.",
    );
  }

  if (
    deploymentValue("networkIdHex") &&
    normalizeHexString(deploymentValue("networkIdHex")) !== profile.networkIdHex
  ) {
    problems.push(`networkIdHex must be the ${profile.label} network id.`);
  }

  for (const key of [
    "verifierCodeHash",
    "verifierKeyHash",
    "destinationBindingHash",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
  ]) {
    const rawValue = deploymentValue(key);
    if (rawValue && !isNonZeroHex32(normalizeHexString(rawValue))) {
      problems.push(`${key} must be a non-zero 32-byte hex value.`);
    }
  }
  const hashRoles = [
    ["verifierCodeHash", deploymentValue("verifierCodeHash")],
    ["verifierKeyHash", deploymentValue("verifierKeyHash")],
    ["destinationBindingHash", deploymentValue("destinationBindingHash")],
    ["proofArtifactHash", deploymentValue("proofArtifactHash")],
    ["provingKeyHash", deploymentValue("provingKeyHash")],
    ["nativeEvmProverBundleHash", deploymentValue("nativeEvmProverBundleHash")],
  ]
    .map(([key, value]) => [key, normalizeHexString(value)])
    .filter(([, value]) => isNonZeroHex32(value));
  const seenRouteHashes = new Map();
  for (const [key, value] of hashRoles) {
    const previous = seenRouteHashes.get(value);
    if (previous) {
      problems.push(`${key} must not equal ${previous}.`);
    } else {
      seenRouteHashes.set(value, key);
    }
  }

  for (const id of requiredBscSmokeRouteCheckIds(profile)) {
    if (!routeReportHasPassedCheck(routeReport, id)) {
      problems.push(`${id} preflight check has not passed.`);
    }
  }

  return problems;
};

const PROVER_SECRET_KEY_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)/iu;
const PROVER_SECRET_ASSIGNMENT_PATTERN =
  /(?:private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password|api[_-]?(?:key|token)|access[_-]?token|auth[_-]?token|bearer(?:[_-]?token)?|session[_-]?token|refresh[_-]?token)\s*[:=]/iu;
const PROVER_SECRET_VALUE_PATTERN =
  /\b(?:bearer\s+[a-z0-9._~+/=-]{16,}|sk_(?:live|test|proj)_[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_]{20,}|glpat-[a-z0-9_-]{20,}|xox[baprs]-[a-z0-9-]{20,}|akia[0-9a-z]{16})\b/iu;
const PRIVATE_KEY_PEM_PATTERN =
  /-----BEGIN(?: [A-Z0-9]+)* PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)* PRIVATE KEY-----/iu;
const BIP39_WORD_COUNTS = new Set([12, 15, 18, 21, 24]);
const BSC_PROVER_SECRET_MATERIAL_ERROR =
  "manifest contains secret-like material.";
const DIAGNOSTIC_TEXT_KEYS = new Set([
  "detail",
  "details",
  "disabledReason",
  "disabled_reason",
  "error",
  "errors",
  "message",
  "messages",
  "note",
  "notes",
  "operatorWarning",
  "operator_warning",
  "schema",
  "verifierMaterialWarning",
  "verifier_material_warning",
  "verifierMaterialWarnings",
  "verifier_material_warnings",
  "verifierWarning",
  "verifier_warning",
  "warning",
  "warnings",
]);
const DIAGNOSTIC_FLAG_KEYS = new Set([
  "diagnostic",
  "diagnosticVerifier",
  "diagnostic_verifier",
  "diagnosticVerifierMaterial",
  "diagnostic_verifier_material",
]);

const BSC_DESTINATION_DIRECTIONS = Object.freeze([
  "destination",
  "bsc-destination",
  "taira-to-bsc",
  "sora-to-bsc",
  "taira_bsc_destination",
]);

const BSC_SOURCE_DIRECTIONS = Object.freeze([
  "source",
  "bsc-source",
  "bsc-to-taira",
  "bsc_source",
]);

const BSC_BROWSER_PROVER_MANIFEST_FIELDS = Object.freeze(
  new Set([
    "schema",
    "moduleUrl",
    "kind",
    "direction",
    "exports",
    "routeId",
    "assetKey",
    "tairaChainId",
    "tairaNetworkPrefix",
    "bscNetwork",
    "bscChain",
    "bscChainIdHex",
    "bscNetworkIdHex",
    "moduleSha256",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
    "boundRouteHash",
    "boundProofHash",
    "deployment",
    "postDeployLiveEvidence",
  ]),
);

const BSC_BROWSER_PROVER_DEPLOYMENT_FIELDS = Object.freeze(
  new Set([
    "bridgeAddress",
    "tokenAddress",
    "sourceBridgeAddress",
    "verifierAddress",
    "verifierCodeHash",
    "verifierKeyHash",
    "proofArtifactHash",
    "provingKeyHash",
    "nativeEvmProverBundleHash",
    "destinationBindingHash",
  ]),
);

const BSC_BROWSER_PROVER_POST_DEPLOY_FIELDS = Object.freeze(
  new Set([
    "fullTomlReady",
    "sourceBridgeConfigHash",
    "sourceEventTransactionId",
    "sourceEventExplorerUrl",
    "routeCanaryEvidenceHash",
    "routeCanaryTransactionId",
    "routeCanaryExplorerUrl",
    "offlineFullTomlSha256",
  ]),
);

const unsupportedBscBrowserProverManifestFields = (
  record,
  allowedFields,
  label,
) =>
  Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .sort()
    .map(
      (key) =>
        `${label} contains unsupported field ${publicUnsupportedFieldName(
          key,
        )}.`,
    );

const proverManifestRecordEntries = (manifest) =>
  [
    ["manifest", manifest],
    ["manifest.route", readOwnValue(manifest, "route")],
    ["manifest.deployment", readOwnValue(manifest, "deployment")],
    ["manifest.bsc", readOwnValue(manifest, "bsc")],
    [
      "manifest.destinationBinding",
      readOwnValue(manifest, "destinationBinding"),
    ],
    [
      "manifest.destinationRollout",
      readOwnValue(manifest, "destinationRollout"),
    ],
    ["manifest.integrity", readOwnValue(manifest, "integrity")],
    ["manifest.artifacts", readOwnValue(manifest, "artifacts")],
    [
      "manifest.postDeployLiveEvidence",
      readOwnValue(manifest, "postDeployLiveEvidence"),
    ],
    [
      "manifest.post_deploy_live_evidence",
      readOwnValue(manifest, "post_deploy_live_evidence"),
    ],
    ["manifest.postDeploy", readOwnValue(manifest, "postDeploy")],
    ["manifest.post_deploy", readOwnValue(manifest, "post_deploy")],
  ]
    .filter(([, record]) => isRecord(record))
    .map(([pathName, record]) => ({ pathName, record }));

const proverManifestRecords = (manifest) =>
  proverManifestRecordEntries(manifest).map((entry) => entry.record);

const readManifestString = (manifest, ...keys) => {
  for (const record of proverManifestRecords(manifest)) {
    for (const key of keys) {
      const value = readOwnValue(record, key);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          return trimmed;
        }
      }
    }
  }
  return null;
};

const readManifestStringValues = (manifest, ...keys) => {
  const values = [];
  for (const { pathName, record } of proverManifestRecordEntries(manifest)) {
    for (const key of keys) {
      const value = readOwnValue(record, key);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) {
          values.push({ key, path: `${pathName}.${key}`, value: trimmed });
        }
      }
    }
  }
  return values;
};

const duplicateManifestAliasProblems = (manifest, label, keys) => {
  const problems = [];
  for (const { pathName, record } of proverManifestRecordEntries(manifest)) {
    const presentKeys = keys.filter((key) => {
      const value = readOwnValue(record, key);
      return (
        (typeof value === "string" && value.trim()) ||
        typeof value === "boolean"
      );
    });
    if (presentKeys.length > 1) {
      problems.push(
        `${label} must not use multiple aliases in ${pathName}: ${presentKeys.join(", ")}.`,
      );
    }
  }
  return problems;
};

const readRootManifestString = (manifest, ...keys) => {
  if (!isRecord(manifest)) {
    return null;
  }
  for (const key of keys) {
    const value = readOwnValue(manifest, key);
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return null;
};

const duplicateRootManifestAliasProblems = (manifest, label, keys) => {
  if (!isRecord(manifest)) {
    return [];
  }
  const presentKeys = keys.filter((key) => {
    const value = readOwnValue(manifest, key);
    return (
      (typeof value === "string" && value.trim()) || typeof value === "boolean"
    );
  });
  if (presentKeys.length <= 1) {
    return [];
  }
  return [
    `${label} must not use multiple aliases in manifest: ${presentKeys.join(", ")}.`,
  ];
};

const readManifestNumber = (manifest, ...keys) => {
  for (const record of proverManifestRecords(manifest)) {
    for (const key of keys) {
      const value = readOwnValue(record, key);
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && /^(?:0|[1-9][0-9]*)$/u.test(value)) {
        return Number(value);
      }
    }
  }
  return null;
};

const readManifestStringList = (manifest, ...keys) => {
  const values = [];
  for (const record of proverManifestRecords(manifest)) {
    for (const key of keys) {
      const value = readOwnValue(record, key);
      if (typeof value === "string" && value.trim()) {
        values.push(value.trim());
      } else if (Array.isArray(value)) {
        values.push(
          ...ownArrayValues(value)
            .filter((entry) => typeof entry === "string")
            .map((entry) => entry.trim())
            .filter(Boolean),
        );
      } else if (isRecord(value)) {
        values.push(...Object.keys(value));
      }
    }
  }
  return [...new Set(values)];
};

const manifestStringListShapeProblems = (manifest, label, ...keys) => {
  const problems = [];
  for (const { pathName, record } of proverManifestRecordEntries(manifest)) {
    for (const key of keys) {
      if (!hasOwn(record, key)) {
        continue;
      }
      const field = `${pathName}.${key}`;
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (
        !descriptor ||
        !Object.prototype.hasOwnProperty.call(descriptor, "value")
      ) {
        problems.push(`${label} ${field} must be a data property.`);
        continue;
      }
      const value = descriptor.value;
      if (typeof value === "string" || isRecord(value)) {
        continue;
      }
      if (!Array.isArray(value)) {
        if (value !== undefined && value !== null) {
          problems.push(
            `${label} ${field} must be a string, string array, or object map.`,
          );
        }
        continue;
      }
      const presentIndexes = new Set();
      for (const [index, entry] of ownArrayIndexedValues(value)) {
        presentIndexes.add(index);
        if (typeof entry !== "string") {
          problems.push(`${label} ${field} ${index} must be a string.`);
        }
      }
      for (let index = 0; index < value.length; index += 1) {
        if (!presentIndexes.has(index)) {
          problems.push(`${label} ${field} ${index} is missing.`);
        }
      }
    }
  }
  return problems;
};

const readManifestBoolean = (manifest, ...keys) => {
  for (const record of proverManifestRecords(manifest)) {
    for (const key of keys) {
      const value = readOwnValue(record, key);
      if (typeof value === "boolean") {
        return value;
      }
      if (typeof value === "string") {
        const normalized = value.trim().toLowerCase();
        if (normalized === "true") {
          return true;
        }
        if (normalized === "false") {
          return false;
        }
      }
    }
  }
  return null;
};

const normalizeDirectionValues = (manifest) =>
  readManifestStringList(
    manifest,
    "kind",
    "kinds",
    "direction",
    "directions",
    "proofDirection",
    "proofDirections",
    "capability",
    "capabilities",
  ).map((value) => value.toLowerCase());

const secretLikeTextReason = (value) => {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (
    PRIVATE_KEY_PEM_PATTERN.test(normalized) ||
    PROVER_SECRET_ASSIGNMENT_PATTERN.test(normalized) ||
    PROVER_SECRET_VALUE_PATTERN.test(normalized)
  ) {
    return BSC_PROVER_SECRET_MATERIAL_ERROR;
  }
  const words = normalized.toLowerCase().split(" ");
  if (
    BIP39_WORD_COUNTS.has(words.length) &&
    validateMnemonic(words.join(" "), wordlist)
  ) {
    return BSC_PROVER_SECRET_MATERIAL_ERROR;
  }
  return "";
};

const scanSecretLikeMaterial = (value, prefix = "value") => {
  if (typeof value === "string") {
    const reason = secretLikeTextReason(value);
    return reason ? [reason] : [];
  }
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return ownArrayValues(value).flatMap((entry, index) =>
      scanSecretLikeMaterial(entry, `${prefix}[${index}]`),
    );
  }
  return ownRecordEntries(value).flatMap(([key, entry]) => {
    const pathName = `${prefix}.${key}`;
    const self = PROVER_SECRET_KEY_PATTERN.test(key)
      ? [BSC_PROVER_SECRET_MATERIAL_ERROR]
      : [];
    return [...self, ...scanSecretLikeMaterial(entry, pathName)];
  });
};

const diagnosticTextValue = (value) => {
  if (typeof value === "string") {
    return /\bdiagnostic\b/iu.test(value);
  }
  if (Array.isArray(value)) {
    return ownArrayValues(value).some((entry) => diagnosticTextValue(entry));
  }
  if (isRecord(value)) {
    return ownRecordEntries(value).some(([, entry]) =>
      diagnosticTextValue(entry),
    );
  }
  return false;
};

const scanDiagnosticMaterial = (value, prefix = "value") => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (Array.isArray(value)) {
    return ownArrayValues(value).flatMap((entry, index) =>
      scanDiagnosticMaterial(entry, `${prefix}[${index}]`),
    );
  }
  return ownRecordEntries(value).flatMap(([key, entry]) => {
    const pathName = `${prefix}.${key}`;
    const self = [];
    if (DIAGNOSTIC_FLAG_KEYS.has(key) && entry === true) {
      self.push(`${pathName}=true.`);
    }
    if (DIAGNOSTIC_TEXT_KEYS.has(key) && diagnosticTextValue(entry)) {
      self.push(`${pathName} mentions diagnostic verifier material.`);
    }
    return [...self, ...scanDiagnosticMaterial(entry, pathName)];
  });
};

const pickVerifierField = (record, names) => {
  for (const name of names) {
    if (hasOwn(record, name)) {
      return readOwnValue(record, name);
    }
  }
  return undefined;
};
const flattenOwnArrayValues = (value, output = [], seen = new WeakSet()) => {
  if (!Array.isArray(value)) {
    output.push(value);
    return output;
  }
  if (seen.has(value)) {
    return output;
  }
  seen.add(value);
  try {
    for (const entry of ownArrayValues(value)) {
      flattenOwnArrayValues(entry, output, seen);
    }
  } finally {
    seen.delete(value);
  }
  return output;
};

const normalizeUint256 = (value) => {
  const text = trimString(value);
  if (!/^(?:0x[0-9a-f]+|[0-9]+)$/iu.test(text)) {
    throw new Error("not uint256");
  }
  const parsed = BigInt(text);
  if (parsed < 0n || parsed >= 2n ** 256n) {
    throw new Error("out of range");
  }
  return parsed.toString();
};

const normalizeBn254FieldElement = (value, label) => {
  const parsed = BigInt(value);
  if (parsed < 0n || parsed >= BN254_BASE_FIELD_MODULUS) {
    throw new Error(`${label} must be a BN254 field element`);
  }
  return parsed;
};

const bn254Mod = (value) => {
  const remainder = value % BN254_BASE_FIELD_MODULUS;
  return remainder >= 0n ? remainder : remainder + BN254_BASE_FIELD_MODULUS;
};

const bn254Fp2Add = (left, right) => [
  bn254Mod(left[0] + right[0]),
  bn254Mod(left[1] + right[1]),
];

const bn254Fp2Mul = (left, right) => [
  bn254Mod(left[0] * right[0] - left[1] * right[1]),
  bn254Mod(left[0] * right[1] + left[1] * right[0]),
];

const bn254Fp2Square = (value) => bn254Fp2Mul(value, value);

const bn254Fp2Cube = (value) => bn254Fp2Mul(bn254Fp2Square(value), value);

const sameBn254Fp2 = (left, right) =>
  left[0] === right[0] && left[1] === right[1];

const normalizeVerifierVector = (record, names, expectedLength) => {
  const value = pickVerifierField(record, names);
  if (!Array.isArray(value)) {
    throw new Error("missing vector");
  }
  const flattened = flattenOwnArrayValues(value).map((entry) =>
    normalizeUint256(entry),
  );
  if (flattened.length !== expectedLength) {
    throw new Error("wrong vector length");
  }
  return flattened;
};

const assertBn254G1Point = (point, label) => {
  if (point.length !== 2) {
    throw new Error(`${label} must contain two BN254 G1 coordinates`);
  }
  const x = normalizeBn254FieldElement(point[0], `${label}.x`);
  const y = normalizeBn254FieldElement(point[1], `${label}.y`);
  if (x === 0n && y === 0n) {
    throw new Error(`${label} must not be the BN254 point at infinity`);
  }
  if (bn254Mod(y * y) !== bn254Mod(x * x * x + 3n)) {
    throw new Error(`${label} must be on the BN254 G1 curve`);
  }
};

const assertBn254G1VectorPairs = (values, label) => {
  if (values.length % 2 !== 0) {
    throw new Error(`${label} must contain complete BN254 G1 coordinate pairs`);
  }
  for (let offset = 0; offset < values.length; offset += 2) {
    assertBn254G1Point(
      values.slice(offset, offset + 2),
      `${label}[${offset / 2}]`,
    );
  }
};

const assertBn254G2Point = (point, label) => {
  if (point.length !== 4) {
    throw new Error(`${label} must contain four BN254 G2 coordinates`);
  }
  const x = [
    normalizeBn254FieldElement(point[0], `${label}.x.c0`),
    normalizeBn254FieldElement(point[1], `${label}.x.c1`),
  ];
  const y = [
    normalizeBn254FieldElement(point[2], `${label}.y.c0`),
    normalizeBn254FieldElement(point[3], `${label}.y.c1`),
  ];
  if (x[0] === 0n && x[1] === 0n && y[0] === 0n && y[1] === 0n) {
    throw new Error(`${label} must not be the BN254 G2 point at infinity`);
  }
  const expected = bn254Fp2Add(bn254Fp2Cube(x), BN254_TWIST_B_COEFFICIENT);
  if (!sameBn254Fp2(bn254Fp2Square(y), expected)) {
    throw new Error(`${label} must be on the BN254 G2 twist curve`);
  }
};

const recordCarriesVerifierMaterial = (record) =>
  VERIFIER_VECTOR_ALIASES.some((aliases) =>
    aliases.some((alias) => hasOwn(record, alias)),
  );

const assertBn254VerifierMaterial = (record, pathName) => {
  assertBn254G1Point(
    normalizeVerifierVector(
      record,
      ["alpha1", "configuredAlpha1", "vk_alpha_1"],
      2,
    ),
    `${pathName}.alpha1`,
  );
  assertBn254G1VectorPairs(
    normalizeVerifierVector(record, ["ic", "configuredIc", "vk_ic", "IC"], 20),
    `${pathName}.ic`,
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["beta2", "configuredBeta2", "vk_beta_2"],
      4,
    ),
    `${pathName}.beta2`,
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["gamma2", "configuredGamma2", "vk_gamma_2"],
      4,
    ),
    `${pathName}.gamma2`,
  );
  assertBn254G2Point(
    normalizeVerifierVector(
      record,
      ["delta2", "configuredDelta2", "vk_delta_2"],
      4,
    ),
    `${pathName}.delta2`,
  );
};

const sameVerifierVector = (actual, expected) =>
  actual.length === expected.length &&
  actual.every((entry, index) => entry === expected[index]);

const isSmokeFixtureGroth16VerifierMaterial = (record) => {
  try {
    return (
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["alpha1", "configuredAlpha1", "vk_alpha_1"],
          2,
        ),
        SMOKE_FIXTURE_G1,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["beta2", "configuredBeta2", "vk_beta_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["gamma2", "configuredGamma2", "vk_gamma_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["delta2", "configuredDelta2", "vk_delta_2"],
          4,
        ),
        SMOKE_FIXTURE_G2,
      ) &&
      sameVerifierVector(
        normalizeVerifierVector(
          record,
          ["ic", "configuredIc", "vk_ic", "IC"],
          20,
        ),
        SMOKE_FIXTURE_IC,
      )
    );
  } catch (_error) {
    return false;
  }
};

const scanSmokeFixtureVerifierMaterial = (
  value,
  prefix = "value",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).flatMap((entry, index) =>
      scanSmokeFixtureVerifierMaterial(entry, `${prefix}[${index}]`, seen),
    );
  }
  const self = isSmokeFixtureGroth16VerifierMaterial(value)
    ? [`${prefix} matches the deterministic smoke-test Groth16 fixture key.`]
    : [];
  return [
    ...self,
    ...ownRecordEntries(value).flatMap(([key, entry]) =>
      scanSmokeFixtureVerifierMaterial(entry, `${prefix}.${key}`, seen),
    ),
  ];
};

const scanInvalidBn254VerifierMaterial = (
  value,
  prefix = "value",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).flatMap((entry, index) =>
      scanInvalidBn254VerifierMaterial(entry, `${prefix}[${index}]`, seen),
    );
  }
  const self = [];
  if (recordCarriesVerifierMaterial(value)) {
    try {
      assertBn254VerifierMaterial(value, prefix);
    } catch (error) {
      self.push(
        `${prefix} has invalid BN254 verifier material: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return [
    ...self,
    ...ownRecordEntries(value).flatMap(([key, entry]) =>
      scanInvalidBn254VerifierMaterial(entry, `${prefix}.${key}`, seen),
    ),
  ];
};

const scanDiagnosticVerifierKeyHashes = (
  value,
  prefix = "value",
  seen = new WeakSet(),
) => {
  if (!isRecord(value) && !Array.isArray(value)) {
    return [];
  }
  if (seen.has(value)) {
    return [];
  }
  seen.add(value);
  if (Array.isArray(value)) {
    return ownArrayValues(value).flatMap((entry, index) =>
      scanDiagnosticVerifierKeyHashes(entry, `${prefix}[${index}]`, seen),
    );
  }
  const self = ownRecordEntries(value).some(
    ([key, entry]) =>
      VERIFIER_KEY_HASH_ALIASES.has(key) &&
      DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(trimString(entry).toLowerCase()),
  )
    ? [`${prefix} carries a known diagnostic BSC verifier key hash.`]
    : [];
  return [
    ...self,
    ...ownRecordEntries(value).flatMap(([key, entry]) =>
      scanDiagnosticVerifierKeyHashes(entry, `${prefix}.${key}`, seen),
    ),
  ];
};

const routeReportSecurityProblems = (routeReport) => [
  ...scanSecretLikeMaterial(routeReport, "route report").map(
    () => "route report contains secret-like material.",
  ),
  ...scanDiagnosticMaterial(routeReport, "route report").map(
    (reason) =>
      `route report still carries diagnostic verifier material: ${reason}`,
  ),
  ...scanSmokeFixtureVerifierMaterial(routeReport, "route report").map(
    (reason) =>
      `route report still carries smoke-test verifier material: ${reason}`,
  ),
  ...scanInvalidBn254VerifierMaterial(routeReport, "route report").map(
    (reason) =>
      `route report carries invalid BN254 verifier material: ${reason}`,
  ),
  ...scanDiagnosticVerifierKeyHashes(routeReport, "route report").map(
    (reason) => `route report carries diagnostic verifier key hash: ${reason}`,
  ),
];

const peerAuditReportProblems = (peerAuditReport, routeReport) => {
  const problems = [];
  if (!isRecord(peerAuditReport)) {
    return ["peer audit report is missing."];
  }
  problems.push(
    ...reportTimestampAliasProblems(peerAuditReport, "peer audit report"),
  );
  problems.push(
    ...unsupportedPublicReportFields(
      peerAuditReport,
      PEER_AUDIT_REPORT_FIELDS,
      "peer audit report",
    ),
  );
  const peerAuditBsc = readPublicRecord(peerAuditReport, "bsc");
  if (peerAuditBsc) {
    problems.push(
      ...unsupportedPublicReportFields(
        peerAuditBsc,
        PEER_AUDIT_BSC_FIELDS,
        "peer audit BSC profile",
      ),
    );
  }
  const peerChecks = validatedPublicRecordArray(
    problems,
    peerAuditReport,
    "checks",
    "peer audit check",
  );
  if (peerChecks) {
    for (const [index, entry] of peerChecks.entries()) {
      problems.push(
        ...unsupportedPublicReportFields(
          entry,
          PEER_AUDIT_CHECK_FIELDS,
          `peer audit check ${index}`,
        ),
      );
    }
  }
  const peerNextActions = validatedPublicRecordArray(
    problems,
    peerAuditReport,
    "nextActions",
    "peer audit next action",
  );
  if (peerNextActions) {
    for (const [index, action] of peerNextActions.entries()) {
      if (!isRecord(action)) {
        continue;
      }
      problems.push(
        ...unsupportedPublicReportFields(
          action,
          PUBLIC_NEXT_ACTION_FIELDS,
          `peer audit next action ${index}`,
        ),
        ...publicNextActionContractProblems(
          action,
          `peer audit next action ${index}`,
        ),
      );
      const requiredInputs = validatedPublicRecordArray(
        problems,
        action,
        "requiredInputs",
        `peer audit next action ${index} required input`,
      );
      if (requiredInputs) {
        for (const [inputIndex, input] of requiredInputs.entries()) {
          problems.push(
            ...unsupportedPublicReportFields(
              input,
              PUBLIC_REQUIRED_INPUT_FIELDS,
              `peer audit next action ${index} required input ${inputIndex}`,
            ),
            ...publicRequiredInputContractProblems(
              input,
              `peer audit next action ${index} required input ${inputIndex}`,
            ),
          );
        }
      }
    }
  }
  const peerMissingInputs = validatedPublicRecordArray(
    problems,
    peerAuditReport,
    "missingProductionInputs",
    "peer audit missing production input",
  );
  if (peerMissingInputs) {
    for (const [index, input] of peerMissingInputs.entries()) {
      problems.push(
        ...unsupportedPublicReportFields(
          input,
          PUBLIC_REQUIRED_INPUT_FIELDS,
          `peer audit missing production input ${index}`,
        ),
        ...publicRequiredInputContractProblems(
          input,
          `peer audit missing production input ${index}`,
        ),
      );
    }
  }
  const peerEntries = validatedPublicRecordArray(
    problems,
    peerAuditReport,
    "peers",
    "peer audit peer",
  );
  if (peerEntries) {
    for (const [index, peer] of peerEntries.entries()) {
      if (!isRecord(peer)) {
        continue;
      }
      problems.push(
        ...unsupportedPublicReportFields(
          peer,
          PEER_AUDIT_PEER_FIELDS,
          `peer audit peer ${index}`,
        ),
      );
      const peerDeployment = readPublicRecord(peer, "deployment");
      const peerPostDeployEvidence = readPublicRecord(
        peer,
        "postDeployLiveEvidence",
      );
      const peerFailedChecks = validatedPublicRecordArray(
        problems,
        peer,
        "failedChecks",
        `peer audit peer ${index} failed check`,
      );
      if (peerDeployment) {
        problems.push(
          ...unsupportedPublicReportFields(
            peerDeployment,
            new Set([
              ...PUBLIC_ROUTE_DEPLOYMENT_FIELDS,
              "destinationBrowserProver",
              "sourceBrowserProver",
            ]),
            `peer audit peer ${index} deployment`,
          ),
        );
      }
      if (peerPostDeployEvidence) {
        problems.push(
          ...unsupportedPublicReportFields(
            peerPostDeployEvidence,
            new Set(["fullTomlReady", ...PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS]),
            `peer audit peer ${index} postDeployLiveEvidence`,
          ),
        );
      }
      if (peerFailedChecks) {
        for (const [checkIndex, entry] of peerFailedChecks.entries()) {
          problems.push(
            ...unsupportedPublicReportFields(
              entry,
              PEER_AUDIT_CHECK_FIELDS,
              `peer audit peer ${index} failed check ${checkIndex}`,
            ),
          );
        }
      }
    }
  }
  if (scanSecretLikeMaterial(peerAuditReport, "peer audit report").length) {
    problems.push("peer audit report contains secret-like material.");
  }
  problems.push(
    ...reportCheckIntegrityProblems(peerAuditReport, "peer audit report"),
  );
  problems.push(...requiredPeerAuditCheckProblems(peerAuditReport));
  if (
    readPublicString(peerAuditReport, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    readPublicString(peerAuditReport, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `expected peer audit route ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}.`,
    );
  }
  const routeBsc = readPublicRecord(routeReport, "bsc");
  const routeBscNetwork = readPublicString(routeBsc, "network");
  if (readPublicString(peerAuditReport, "bscNetwork") && routeBscNetwork) {
    if (readPublicString(peerAuditReport, "bscNetwork") !== routeBscNetwork) {
      problems.push("peer audit bscNetwork does not match route preflight.");
    }
  }
  if (peerAuditBsc && routeBsc) {
    for (const key of ["network", "chain", "chainIdHex", "networkIdHex"]) {
      const actual = readPublicString(peerAuditBsc, key);
      const expected = readPublicString(routeBsc, key);
      if (actual && expected && actual !== expected) {
        problems.push(`peer audit BSC profile ${key} does not match route.`);
      }
    }
  }
  if (!readPublicBoolean(peerAuditReport, "ready")) {
    const failedIds = peerChecks
      ? peerChecks
          .filter(
            (entry) =>
              isRecord(entry) && hasOwn(entry, "ok") && entry.ok === false,
          )
          .map((entry) => {
            const id = readPublicString(entry, "id") || "peer-audit-check";
            const detail =
              id === "peer-audit-report-load"
                ? readPublicString(entry, "detail") ||
                  readPublicString(entry, "message")
                : "";
            return detail ? `${id}: ${detail}` : id;
          })
      : [];
    problems.push(
      failedIds.length
        ? `peer audit report is not ready: ${failedIds.join(", ")}.`
        : "peer audit report is not ready.",
    );
  }
  if (!peerEntries) {
    problems.push("peer audit report does not include peer summaries.");
  } else {
    for (const [index, peer] of peerEntries.entries()) {
      if (!isRecord(peer)) {
        problems.push(`peer audit peer ${index} is not an object.`);
      }
    }
  }
  const peerSummaries = peerEntries
    ? peerEntries
        .map((peer, index) => ({ peer, index }))
        .filter(({ peer }) => isRecord(peer))
    : [];
  const peerCount = readPublicNumber(peerAuditReport, "peerCount");
  if (!Number.isSafeInteger(peerCount) || peerCount < 0) {
    problems.push("peer audit peerCount is missing or invalid.");
  } else if (peerCount !== peerSummaries.length) {
    problems.push("peer audit peerCount does not match peer summaries.");
  }
  for (const { peer, index } of peerSummaries) {
    if (!readPublicBoolean(peer, "ready")) {
      problems.push(`peer audit peer ${index} is not ready.`);
    }
    const routeCount = readPublicNumber(peer, "routeCount");
    if (routeCount !== 0) {
      problems.push(
        `peer audit peer ${index} carries ${routeCount ?? "unknown"} stale BSC route stanza(s).`,
      );
    }
    const failedChecks = readPublicArray(peer, "failedChecks");
    if (failedChecks && failedChecks.length > 0) {
      problems.push(`peer audit peer ${index} carries failed peer checks.`);
    }
    const hashRoleProblems = readPublicArray(peer, "hashRoleProblems");
    if (!Array.isArray(hashRoleProblems)) {
      problems.push(
        `peer audit peer ${index} hashRoleProblems summary is missing.`,
      );
    } else if (hashRoleProblems.length > 0) {
      problems.push(
        `peer audit peer ${index} carries invalid BSC route hash role separation.`,
      );
    }
    const burnRecordMaterialProblems = readPublicArray(
      peer,
      "burnRecordMaterialProblems",
    );
    if (!Array.isArray(burnRecordMaterialProblems)) {
      problems.push(
        `peer audit peer ${index} burnRecordMaterialProblems summary is missing.`,
      );
    } else if (burnRecordMaterialProblems.length > 0) {
      problems.push(
        `peer audit peer ${index} carries invalid TAIRA burn-record material.`,
      );
    }
    const rawTomlSha256 = readPublicString(peer, "rawTomlSha256");
    if (rawTomlSha256 && !normalizeNonZeroHex32(rawTomlSha256)) {
      problems.push(`peer audit rawTomlSha256 is invalid for peer ${index}.`);
    }
    const sanitizedStanzaSha256 = normalizeNonZeroHex32(
      readPublicString(peer, "sanitizedStanzaSha256"),
    );
    if (
      readPublicString(peer, "sanitizedStanzaSha256") &&
      !sanitizedStanzaSha256
    ) {
      problems.push(
        `peer audit sanitizedStanzaSha256 is invalid for peer ${index}.`,
      );
    }
    const sanitizedStanzaFileSha256 = normalizeNonZeroHex32(
      readPublicString(peer, "sanitizedStanzaFileSha256"),
    );
    if (
      readPublicString(peer, "sanitizedStanzaFileSha256") &&
      !sanitizedStanzaFileSha256
    ) {
      problems.push(
        `peer audit sanitized stanza file hash is invalid for peer ${index}.`,
      );
    } else if (
      readPublicBoolean(peer, "sanitizedStanzaFileChecked") &&
      !sanitizedStanzaFileSha256
    ) {
      problems.push(
        `peer audit sanitized stanza file was marked checked without a hash for peer ${index}.`,
      );
    } else if (
      sanitizedStanzaSha256 &&
      sanitizedStanzaFileSha256 &&
      sanitizedStanzaFileSha256 !== sanitizedStanzaSha256
    ) {
      problems.push(
        `peer audit sanitized stanza file hash mismatched for peer ${index}.`,
      );
    }
  }
  return problems;
};

const normalizeManifestUrlForComparison = (value, label) => {
  const normalized = normalizeSccpBrowserModuleUrl(value, label);
  return normalized || null;
};

const requireManifestHex32 = (manifest, problems, field, ...keys) => {
  problems.push(
    ...duplicateRootManifestAliasProblems(manifest, field, [...keys, field]),
  );
  const rawValue = readRootManifestString(manifest, ...keys, field);
  if (!rawValue) {
    problems.push(`${field} is missing.`);
    return "";
  }
  const value = normalizeNonZeroHex32(rawValue);
  if (!value) {
    problems.push(`${field} must be a non-zero 32-byte hex value.`);
  }
  return value;
};

export const validateBscSccpBrowserProverManifest = (input = {}) => {
  const manifest = readOwnValue(input, "manifest");
  const routeReport = readOwnValue(input, "routeReport");
  const moduleUrl = readOwnValue(input, "moduleUrl");
  const expectedDirection = readOwnValue(input, "expectedDirection");
  const label = readOwnValue(input, "label");
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const profile = resolveBscNetworkProfile(bscNetwork);
  const problems = [];
  if (!isRecord(manifest)) {
    return {
      ok: false,
      detail: `${label} manifest must be a JSON object.`,
      manifest: null,
    };
  }

  const schema = readManifestString(manifest, "schema");
  if (schema === SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA) {
    return {
      ok: false,
      detail: `${label} manifest uses retired local-only sidecar schema ${SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA}; publish a route-bound ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA} sidecar generated by npm run e2e:sccp:bsc-prover-manifest before live smoke.`,
      manifest: null,
    };
  }

  problems.push(
    ...unsupportedBscBrowserProverManifestFields(
      manifest,
      BSC_BROWSER_PROVER_MANIFEST_FIELDS,
      "manifest",
    ),
  );
  const manifestDeploymentRecord = readOwnValue(manifest, "deployment");
  if (isRecord(manifestDeploymentRecord)) {
    problems.push(
      ...unsupportedBscBrowserProverManifestFields(
        manifestDeploymentRecord,
        BSC_BROWSER_PROVER_DEPLOYMENT_FIELDS,
        "manifest.deployment",
      ),
    );
  }
  const manifestPostDeployRecord = readOwnValue(
    manifest,
    "postDeployLiveEvidence",
  );
  if (isRecord(manifestPostDeployRecord)) {
    problems.push(
      ...unsupportedBscBrowserProverManifestFields(
        manifestPostDeployRecord,
        BSC_BROWSER_PROVER_POST_DEPLOY_FIELDS,
        "manifest.postDeployLiveEvidence",
      ),
    );
  }

  problems.push(...scanSecretLikeMaterial(manifest, "manifest"));
  problems.push(
    ...scanDiagnosticMaterial(manifest, "manifest").map(
      (reason) =>
        `manifest still carries diagnostic verifier material: ${reason}`,
    ),
  );
  problems.push(
    ...scanSmokeFixtureVerifierMaterial(manifest, "manifest").map(
      (reason) =>
        `manifest still carries smoke-test verifier material: ${reason}`,
    ),
  );
  problems.push(
    ...scanInvalidBn254VerifierMaterial(manifest, "manifest").map(
      (reason) => `manifest carries invalid BN254 verifier material: ${reason}`,
    ),
  );
  problems.push(
    ...scanDiagnosticVerifierKeyHashes(manifest, "manifest").map(
      (reason) => `manifest carries diagnostic verifier key hash: ${reason}`,
    ),
  );

  if (schema !== SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA) {
    problems.push(`schema must be ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA}.`);
  }

  const normalizedModuleUrl = normalizeManifestUrlForComparison(
    moduleUrl,
    `${label} module URL`,
  );
  const manifestModuleUrl = (() => {
    const value = readManifestString(
      manifest,
      "moduleUrl",
      "module_url",
      "browserModuleUrl",
      "browser_module_url",
    );
    if (!value) {
      problems.push("moduleUrl is missing.");
      return null;
    }
    try {
      return normalizeManifestUrlForComparison(
        value,
        `${label} manifest moduleUrl`,
      );
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
      return null;
    }
  })();
  if (
    normalizedModuleUrl &&
    manifestModuleUrl &&
    manifestModuleUrl !== normalizedModuleUrl
  ) {
    problems.push(
      `moduleUrl ${manifestModuleUrl} does not match configured ${normalizedModuleUrl}.`,
    );
  }

  const directionValues = normalizeDirectionValues(manifest);
  const acceptedDirections =
    expectedDirection === "source"
      ? BSC_SOURCE_DIRECTIONS
      : BSC_DESTINATION_DIRECTIONS;
  if (!directionValues.some((value) => acceptedDirections.includes(value))) {
    problems.push(
      `manifest must declare ${expectedDirection === "source" ? "BSC -> TAIRA source" : "TAIRA -> BSC destination"} proof capability.`,
    );
  }

  const exportNames = readManifestStringList(
    manifest,
    "exports",
    "exportNames",
    "export_names",
    "namedExports",
    "named_exports",
  );
  problems.push(
    ...manifestStringListShapeProblems(
      manifest,
      "manifest exports",
      "exports",
      "exportNames",
      "export_names",
      "namedExports",
      "named_exports",
    ),
  );
  const acceptedExports =
    expectedDirection === "source"
      ? BSC_SOURCE_PROVER_EXPORTS
      : BSC_DESTINATION_PROVER_EXPORTS;
  const acceptedExport = exportNames.find((name) =>
    acceptedExports.includes(name),
  );
  if (!acceptedExport) {
    problems.push(
      `manifest exports must include one of ${acceptedExports.join(", ")}.`,
    );
  }
  const acceptedSelfTestExports =
    expectedDirection === "source"
      ? BSC_SOURCE_PROVER_SELF_TEST_EXPORTS
      : BSC_DESTINATION_PROVER_SELF_TEST_EXPORTS;
  const acceptedSelfTestExport = exportNames.find((name) =>
    acceptedSelfTestExports.includes(name),
  );
  if (!acceptedSelfTestExport) {
    problems.push(
      `manifest exports must include one native prover self-test export from ${acceptedSelfTestExports.join(", ")}.`,
    );
  }

  const routeId = readManifestString(manifest, "routeId", "route_id");
  const assetKey = readManifestString(manifest, "assetKey", "asset_key");
  if (routeId !== SCCP_BSC_XOR_ROUTE_ID) {
    problems.push(`routeId must be ${SCCP_BSC_XOR_ROUTE_ID}.`);
  }
  if (assetKey !== SCCP_BSC_XOR_ASSET_KEY) {
    problems.push(`assetKey must be ${SCCP_BSC_XOR_ASSET_KEY}.`);
  }

  const tairaChainId = readManifestString(
    manifest,
    "tairaChainId",
    "taira_chain_id",
    "chainId",
    "chain_id",
  );
  if (tairaChainId !== BSC_TAIRA_CHAIN_ID) {
    problems.push("tairaChainId must be the TAIRA testnet chain id.");
  }
  const tairaNetworkPrefix = readManifestNumber(
    manifest,
    "tairaNetworkPrefix",
    "taira_network_prefix",
    "networkPrefix",
    "network_prefix",
  );
  if (tairaNetworkPrefix !== BSC_TAIRA_NETWORK_PREFIX) {
    problems.push("tairaNetworkPrefix must be 369.");
  }

  const bscChainIdHex = readManifestString(
    manifest,
    "bscChainIdHex",
    "bsc_chain_id_hex",
    "chainIdHex",
    "chain_id_hex",
  )?.toLowerCase();
  if (bscChainIdHex !== profile.chainIdHex) {
    problems.push(`bscChainIdHex must be ${profile.chainIdHex}.`);
  }
  const bscNetworkIdHex = readManifestString(
    manifest,
    "bscNetworkIdHex",
    "bsc_network_id_hex",
    "networkIdHex",
    "network_id_hex",
    "destinationNetworkId",
    "destination_network_id",
  )?.toLowerCase();
  if (bscNetworkIdHex !== profile.networkIdHex) {
    problems.push(`bscNetworkIdHex must be the ${profile.label} network id.`);
  }
  const manifestBscNetwork = readManifestString(
    manifest,
    "bscNetwork",
    "bsc_network",
    "network",
  );
  if (manifestBscNetwork !== profile.key) {
    problems.push(`bscNetwork must be ${profile.key}.`);
  }
  const manifestBscChain = readManifestString(
    manifest,
    "bscChain",
    "bsc_chain",
    "chain",
  );
  if (manifestBscChain !== profile.chain) {
    problems.push(`bscChain must be ${profile.chain}.`);
  }

  const moduleSha256 = requireManifestHex32(
    manifest,
    problems,
    "moduleSha256",
    "module_sha256",
    "sha256",
  );
  const proofArtifactHash = requireManifestHex32(
    manifest,
    problems,
    "proofArtifactHash",
    "proof_artifact_hash",
  );
  const provingKeyHash = requireManifestHex32(
    manifest,
    problems,
    "provingKeyHash",
    "proving_key_hash",
  );
  const nativeEvmProverBundleHash = requireManifestHex32(
    manifest,
    problems,
    "nativeEvmProverBundleHash",
    "native_evm_prover_bundle_hash",
    "nativeProverBundleHash",
    "native_prover_bundle_hash",
  );
  const boundRouteHash = requireManifestHex32(
    manifest,
    problems,
    "boundRouteHash",
    "bound_route_hash",
  );
  const boundProofHash = requireManifestHex32(
    manifest,
    problems,
    "boundProofHash",
    "bound_proof_hash",
  );

  const deployment = publicRouteDeployment(
    readPublicRecord(routeReport, "deployment"),
  );
  const expectedFields = [
    ["bridgeAddress", "bridgeAddress", "bridge_address"],
    ["tokenAddress", "tokenAddress", "token_address"],
    ["sourceBridgeAddress", "sourceBridgeAddress", "source_bridge_address"],
    ["verifierAddress", "verifierAddress", "verifier_address"],
    ["verifierCodeHash", "verifierCodeHash", "verifier_code_hash"],
    ["verifierKeyHash", "verifierKeyHash", "verifier_key_hash"],
    [
      "destinationBindingHash",
      "destinationBindingHash",
      "destination_binding_hash",
      "bindingHash",
      "binding_hash",
    ],
    [
      "proofArtifactHash",
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "circuitArtifactHash",
      "circuit_artifact_hash",
    ],
    ["provingKeyHash", "provingKeyHash", "proving_key_hash"],
    [
      "nativeEvmProverBundleHash",
      "nativeEvmProverBundleHash",
      "native_evm_prover_bundle_hash",
      "nativeProverBundleHash",
      "native_prover_bundle_hash",
    ],
  ];
  let manifestDeployment = null;
  if (!deployment) {
    problems.push("route deployment evidence is missing.");
  } else {
    manifestDeployment = Object.fromEntries(
      expectedFields.map(([deploymentKey, ...manifestKeys]) => [
        deploymentKey,
        normalizeHexString(readManifestString(manifest, ...manifestKeys)) ||
          null,
      ]),
    );
    for (const [deploymentKey, ...manifestKeys] of expectedFields) {
      problems.push(
        ...duplicateManifestAliasProblems(
          manifest,
          manifestKeys[0],
          manifestKeys,
        ),
      );
      const expected = normalizeHexString(
        readOwnValue(deployment, deploymentKey),
      );
      const actualValues = readManifestStringValues(manifest, ...manifestKeys);
      if (actualValues.length === 0) {
        problems.push(`${manifestKeys[0]} is missing.`);
      }
      for (const { value } of actualValues) {
        const actual = normalizeHexString(value);
        if (actual === expected) {
          continue;
        }
        problems.push(
          `${manifestKeys[0]} ${actual} does not match route deployment ${expected}.`,
        );
      }
    }
    if (
      boundRouteHash &&
      manifestDeployment.destinationBindingHash &&
      boundRouteHash !== manifestDeployment.destinationBindingHash
    ) {
      problems.push(
        `boundRouteHash ${boundRouteHash} does not match deployment.destinationBindingHash ${manifestDeployment.destinationBindingHash}.`,
      );
    }
    if (
      boundProofHash &&
      proofArtifactHash &&
      boundProofHash !== proofArtifactHash
    ) {
      problems.push(
        `boundProofHash ${boundProofHash} does not match proofArtifactHash ${proofArtifactHash}.`,
      );
    }
  }
  const manifestHashRoles = [
    ["moduleSha256", moduleSha256],
    ["verifierCodeHash", manifestDeployment?.verifierCodeHash],
    ["verifierKeyHash", manifestDeployment?.verifierKeyHash],
    ["destinationBindingHash", manifestDeployment?.destinationBindingHash],
    ["proofArtifactHash", proofArtifactHash],
    ["provingKeyHash", provingKeyHash],
    ["nativeEvmProverBundleHash", nativeEvmProverBundleHash],
  ]
    .map(([key, value]) => [key, normalizeHexString(value)])
    .filter(([, value]) => isNonZeroHex32(value));
  const seenManifestHashes = new Map();
  for (const [key, value] of manifestHashRoles) {
    const previous = seenManifestHashes.get(value);
    if (previous) {
      problems.push(`${key} must not equal ${previous}.`);
    } else {
      seenManifestHashes.set(value, key);
    }
  }
  const postDeployLiveEvidence = publicPostDeployLiveEvidence(
    readPublicRecord(routeReport, "postDeployLiveEvidence"),
  );
  if (!postDeployLiveEvidence) {
    problems.push("route postDeployLiveEvidence is missing.");
  } else {
    problems.push(
      ...duplicateManifestAliasProblems(
        manifest,
        "postDeployLiveEvidence.fullTomlReady",
        [
          "fullTomlReady",
          "full_toml_ready",
          "postDeployFullTomlReady",
          "post_deploy_full_toml_ready",
        ],
      ),
    );
    const manifestFullTomlReady = readManifestBoolean(
      manifest,
      "fullTomlReady",
      "full_toml_ready",
      "postDeployFullTomlReady",
      "post_deploy_full_toml_ready",
    );
    if (manifestFullTomlReady !== true) {
      problems.push("postDeployLiveEvidence.fullTomlReady must be true.");
    }
    if (readOwnValue(postDeployLiveEvidence, "fullTomlReady") !== true) {
      problems.push("route postDeployLiveEvidence.fullTomlReady is not true.");
    }
    for (const key of PUBLIC_POST_DEPLOY_EVIDENCE_FIELDS) {
      problems.push(
        ...duplicateManifestAliasProblems(
          manifest,
          `postDeployLiveEvidence.${key}`,
          [key, toSnakeCase(key)],
        ),
      );
      const expected = readOwnValue(postDeployLiveEvidence, key);
      const actualValues = readManifestStringValues(
        manifest,
        key,
        toSnakeCase(key),
      );
      if (actualValues.length === 0) {
        problems.push(`postDeployLiveEvidence.${key} is missing.`);
      }
      for (const { value: actual } of actualValues) {
        if (actual === expected) {
          continue;
        }
        problems.push(
          `postDeployLiveEvidence.${key} ${actual} does not match route evidence ${expected}.`,
        );
      }
    }
  }

  const publicManifest = {
    schema,
    moduleUrl: manifestModuleUrl,
    direction: expectedDirection,
    routeId,
    assetKey,
    tairaChainId,
    tairaNetworkPrefix,
    bscNetwork: manifestBscNetwork,
    bscChain: manifestBscChain,
    bscChainIdHex,
    bscNetworkIdHex,
    moduleSha256,
    proofArtifactHash,
    provingKeyHash,
    nativeEvmProverBundleHash,
    acceptedExport: acceptedExport ?? null,
    acceptedSelfTestExport: acceptedSelfTestExport ?? null,
    deployment: manifestDeployment,
    postDeployLiveEvidence: postDeployLiveEvidence
      ? {
          fullTomlReady: postDeployLiveEvidence.fullTomlReady,
          sourceBridgeConfigHash: postDeployLiveEvidence.sourceBridgeConfigHash,
          sourceEventTransactionId:
            postDeployLiveEvidence.sourceEventTransactionId,
          sourceEventExplorerUrl: postDeployLiveEvidence.sourceEventExplorerUrl,
          routeCanaryEvidenceHash:
            postDeployLiveEvidence.routeCanaryEvidenceHash,
          routeCanaryTransactionId:
            postDeployLiveEvidence.routeCanaryTransactionId,
          routeCanaryExplorerUrl: postDeployLiveEvidence.routeCanaryExplorerUrl,
          offlineFullTomlSha256: postDeployLiveEvidence.offlineFullTomlSha256,
        }
      : null,
  };

  return {
    ok: problems.length === 0,
    detail: problems.length
      ? `${label} manifest is not production-ready: ${problems.join(" ")}`
      : `${label} manifest is route-bound and production-shaped.`,
    manifest: publicManifest,
  };
};

export const inspectBscSccpBrowserProverManifest = async (input = {}) => {
  const manifestUrl = readOwnValue(input, "manifestUrl");
  const moduleUrl = readOwnValue(input, "moduleUrl");
  const label = readOwnValue(input, "label");
  const expectedDirection = readOwnValue(input, "expectedDirection");
  const routeReport = readOwnValue(input, "routeReport");
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const moduleRepoRoot = readOwnValue(input, "repoRoot") ?? repoRoot;
  const fetchImpl = readOwnValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = readOwnValue(input, "timeoutMs") ?? 5_000;
  const normalizedManifestUrl = normalizeSccpBrowserModuleUrl(
    manifestUrl,
    `${label} manifest URL`,
  );
  if (!normalizedManifestUrl) {
    return {
      ok: false,
      detail: `${label} manifest URL is required.`,
      manifest: null,
      moduleSha256: null,
    };
  }
  let expectedManifestUrl;
  try {
    expectedManifestUrl = deriveSccpBrowserProverManifestUrl(
      moduleUrl,
      `${label} module URL`,
    );
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      manifest: null,
      manifestUrl: normalizedManifestUrl,
      moduleSha256: null,
    };
  }
  if (
    expectedManifestUrl &&
    !browserManifestUrlMatchesModuleUrl(
      normalizedManifestUrl,
      normalizeSccpBrowserModuleUrl(moduleUrl, `${label} module URL`),
    )
  ) {
    return {
      ok: false,
      detail: `${label} manifest URL ${normalizedManifestUrl} does not match module URL.`,
      manifest: null,
      manifestUrl: normalizedManifestUrl,
      moduleSha256: null,
    };
  }
  try {
    const { bytes } = await readSccpBrowserUrlBytes({
      url: normalizedManifestUrl,
      label: `${label} manifest URL`,
      repoRoot: moduleRepoRoot,
      fetchImpl,
      timeoutMs,
      maxBytes: SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES,
    });
    let manifest;
    try {
      manifest = parseJsonWithoutDuplicateKeys(
        Buffer.from(bytes).toString("utf8"),
        `${label} manifest`,
      );
    } catch (error) {
      return {
        ok: false,
        detail: `${label} manifest is not valid JSON: ${
          error instanceof Error ? error.message : String(error)
        }`,
        manifest: null,
        moduleSha256: null,
      };
    }
    const inspection = validateBscSccpBrowserProverManifest({
      manifest,
      routeReport,
      moduleUrl,
      expectedDirection,
      label,
      bscNetwork,
    });
    return {
      ...inspection,
      manifestUrl: normalizedManifestUrl,
      moduleSha256: inspection.manifest?.moduleSha256 ?? null,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      manifest: null,
      manifestUrl: normalizedManifestUrl,
      moduleSha256: null,
    };
  }
};

const validateBscRuntimeProverConfigSection = ({
  section,
  routeDeployment,
  label,
  direction = label,
}) => {
  const problems = [];
  if (!isRecord(section)) {
    return [`${label} section is missing`];
  }
  const materialHashes = new Map();
  const addMaterialHash = (key, normalized) => {
    const previous = materialHashes.get(normalized);
    const role = `${label}.${key}`;
    if (previous) {
      problems.push(
        `BSC runtime prover material hashes must be role-separated: ${role} matches ${previous}`,
      );
    } else {
      materialHashes.set(normalized, role);
    }
  };
  for (const [key, requiredHash] of [
    ["nativeProverBundleSha256", null],
    ["nativeEvmProverBundleHash", routeDeployment?.nativeEvmProverBundleHash],
    ["proofArtifactSha256", routeDeployment?.proofArtifactHash],
    ["provingKeySha256", routeDeployment?.provingKeyHash],
    ["verifierKeySha256", routeDeployment?.verifierKeyArtifactHash],
    ["backendModuleSha256", null],
  ]) {
    const normalized = normalizeNonZeroHex32(readOwnValue(section, key));
    if (!normalized) {
      problems.push(`${label}.${key} must be a non-zero 32-byte hex value`);
    } else if (
      requiredHash &&
      normalized !== normalizeNonZeroHex32(requiredHash)
    ) {
      problems.push(`${label}.${key} must match public route deployment`);
    }
    if (normalized && key !== "backendModuleSha256") {
      addMaterialHash(key, normalized);
    }
  }
  for (const key of [
    "nativeProverBundleUrl",
    "nativeProverArtifactBaseUrl",
    "proofArtifactUrl",
    "provingKeyUrl",
    "verifierKeyUrl",
    "backendModuleUrl",
  ]) {
    try {
      const normalized = normalizeSccpBrowserModuleUrl(
        readOwnValue(section, key),
        `${label}.${key}`,
      );
      if (!normalized) {
        problems.push(`${label}.${key} is required`);
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }
  const acceptedBackendExports = BSC_RUNTIME_BACKEND_EXPORTS[direction] ?? [];
  if (
    !acceptedBackendExports.includes(
      trimString(readOwnValue(section, "backendAcceptedExport")),
    )
  ) {
    problems.push(`${label}.backendAcceptedExport is invalid`);
  }
  const acceptedBackendSelfTestExports =
    BSC_RUNTIME_BACKEND_SELF_TEST_EXPORTS[direction] ?? [];
  if (
    !acceptedBackendSelfTestExports.includes(
      trimString(readOwnValue(section, "backendAcceptedSelfTestExport")),
    )
  ) {
    problems.push(`${label}.backendAcceptedSelfTestExport is invalid`);
  }
  if (readOwnValue(section, "backendSelfContained") !== true) {
    problems.push(`${label}.backendSelfContained must be true`);
  }
  const nativeProverVerifiedSdks = readOwnValue(
    section,
    "nativeProverVerifiedSdks",
  );
  if (!Array.isArray(nativeProverVerifiedSdks)) {
    problems.push(`${label}.nativeProverVerifiedSdks must be an array`);
  } else {
    const normalizedSdks = ownArrayValues(nativeProverVerifiedSdks)
      .map((sdk) => (typeof sdk === "string" ? sdk.trim() : ""))
      .filter(Boolean)
      .sort();
    const seen = new Set(normalizedSdks);
    if (seen.size !== normalizedSdks.length) {
      problems.push(
        `${label}.nativeProverVerifiedSdks must not contain duplicates`,
      );
    }
    for (const sdk of normalizedSdks) {
      if (!SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS.includes(sdk)) {
        problems.push(
          `${label}.nativeProverVerifiedSdks contains unknown sdk ${sdk}`,
        );
      }
    }
    for (const sdk of SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS) {
      if (!seen.has(sdk)) {
        problems.push(`${label}.nativeProverVerifiedSdks is missing ${sdk}`);
      }
    }
  }
  return problems;
};

const BSC_RUNTIME_CONFIG_KNOWN_FIELDS = Object.freeze(
  new Set([
    "schema",
    "routeId",
    "assetKey",
    "tairaChainId",
    "tairaNetworkPrefix",
    "bscNetwork",
    "bscChain",
    "bscChainIdHex",
    "bscNetworkIdHex",
    "destination",
    "source",
  ]),
);
const BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS = Object.freeze(
  new Set([
    "nativeProverBundleUrl",
    "nativeProverArtifactBaseUrl",
    "nativeProverBundleSha256",
    "nativeEvmProverBundleHash",
    "nativeProverVerifiedSdks",
    "proofArtifactUrl",
    "proofArtifactSha256",
    "provingKeyUrl",
    "provingKeySha256",
    "verifierKeyUrl",
    "verifierKeySha256",
    "backendModuleUrl",
    "backendModuleSha256",
    "backendSelfContained",
    "backendAcceptedExport",
    "backendAcceptedSelfTestExport",
  ]),
);

const unsupportedRuntimeConfigFields = (record, knownFields, label) => {
  if (!isRecord(record)) {
    return [];
  }
  return Object.keys(record)
    .filter((key) => !knownFields.has(key))
    .map(
      (key) =>
        `${label} contains unsupported field ${publicUnsupportedFieldName(
          key,
        )}`,
    );
};

const publicRuntimeConfigSection = (section) => ({
  nativeProverBundleUrl: readOwnValue(section, "nativeProverBundleUrl"),
  nativeProverArtifactBaseUrl: readOwnValue(
    section,
    "nativeProverArtifactBaseUrl",
  ),
  nativeProverBundleSha256: readOwnValue(section, "nativeProverBundleSha256"),
  nativeEvmProverBundleHash: readOwnValue(section, "nativeEvmProverBundleHash"),
  nativeProverVerifiedSdks: ownArrayValues(
    readOwnValue(section, "nativeProverVerifiedSdks"),
  ),
  proofArtifactUrl: readOwnValue(section, "proofArtifactUrl"),
  proofArtifactSha256: readOwnValue(section, "proofArtifactSha256"),
  provingKeyUrl: readOwnValue(section, "provingKeyUrl"),
  provingKeySha256: readOwnValue(section, "provingKeySha256"),
  verifierKeyUrl: readOwnValue(section, "verifierKeyUrl"),
  verifierKeySha256: readOwnValue(section, "verifierKeySha256"),
  backendModuleUrl: readOwnValue(section, "backendModuleUrl"),
  backendModuleSha256: readOwnValue(section, "backendModuleSha256"),
  backendSelfContained: readOwnValue(section, "backendSelfContained"),
  backendAcceptedExport: readOwnValue(section, "backendAcceptedExport"),
  backendAcceptedSelfTestExport: readOwnValue(
    section,
    "backendAcceptedSelfTestExport",
  ),
});

export const validateBscSccpRuntimeProverConfigManifest = (input = {}) => {
  const manifest = readOwnValue(input, "manifest");
  const routeReport = readOwnValue(input, "routeReport");
  const label = readOwnValue(input, "label") ?? "BSC runtime prover config";
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const profile = resolveBscNetworkProfile(bscNetwork);
  const problems = [];
  if (!isRecord(manifest)) {
    return { ok: false, detail: `${label} must be a JSON object.` };
  }
  problems.push(
    ...unsupportedRuntimeConfigFields(
      manifest,
      BSC_RUNTIME_CONFIG_KNOWN_FIELDS,
      label,
    ),
  );
  if (
    readOwnValue(manifest, "schema") !== SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA
  ) {
    problems.push(`schema must be ${SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA}`);
  }
  if (
    readOwnValue(manifest, "routeId") !== SCCP_BSC_XOR_ROUTE_ID ||
    readOwnValue(manifest, "assetKey") !== SCCP_BSC_XOR_ASSET_KEY
  ) {
    problems.push(
      `routeId/assetKey must be ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}`,
    );
  }
  if (
    readOwnValue(manifest, "tairaChainId") !== BSC_TAIRA_CHAIN_ID ||
    readOwnValue(manifest, "tairaNetworkPrefix") !== BSC_TAIRA_NETWORK_PREFIX
  ) {
    problems.push("TAIRA chain id and network prefix must match TAIRA testnet");
  }
  if (
    readOwnValue(manifest, "bscChainIdHex") !== profile.chainIdHex ||
    readOwnValue(manifest, "bscNetworkIdHex") !== profile.networkIdHex
  ) {
    problems.push(`BSC chain id and network id must match ${profile.label}`);
  }
  if (readOwnValue(manifest, "bscNetwork") !== profile.key) {
    problems.push(`bscNetwork must be ${profile.key}`);
  }
  if (readOwnValue(manifest, "bscChain") !== profile.chain) {
    problems.push(`bscChain must be ${profile.chain}`);
  }
  const routeDeployment = publicRouteDeployment(
    readPublicRecord(routeReport, "deployment"),
  );
  if (!routeDeployment) {
    problems.push("route deployment summary is missing");
  }
  problems.push(
    ...unsupportedRuntimeConfigFields(
      readOwnValue(manifest, "destination"),
      BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS,
      "destination",
    ),
    ...unsupportedRuntimeConfigFields(
      readOwnValue(manifest, "source"),
      BSC_RUNTIME_CONFIG_SECTION_KNOWN_FIELDS,
      "source",
    ),
  );
  problems.push(
    ...validateBscRuntimeProverConfigSection({
      section: readOwnValue(manifest, "destination"),
      routeDeployment,
      label: "destination",
      direction: "destination",
    }),
    ...validateBscRuntimeProverConfigSection({
      section: readOwnValue(manifest, "source"),
      routeDeployment,
      label: "source",
      direction: "source",
    }),
  );
  return {
    ok: problems.length === 0,
    detail: problems.length
      ? `${label} is not route-bound: ${problems.join("; ")}.`
      : `${label} is route-bound.`,
    manifest: problems.length
      ? null
      : {
          schema: readOwnValue(manifest, "schema"),
          routeId: readOwnValue(manifest, "routeId"),
          assetKey: readOwnValue(manifest, "assetKey"),
          tairaChainId: readOwnValue(manifest, "tairaChainId"),
          tairaNetworkPrefix: readOwnValue(manifest, "tairaNetworkPrefix"),
          bscNetwork: readOwnValue(manifest, "bscNetwork"),
          bscChain: readOwnValue(manifest, "bscChain"),
          bscChainIdHex: readOwnValue(manifest, "bscChainIdHex"),
          bscNetworkIdHex: readOwnValue(manifest, "bscNetworkIdHex"),
          destination: publicRuntimeConfigSection(
            readOwnValue(manifest, "destination"),
          ),
          source: publicRuntimeConfigSection(readOwnValue(manifest, "source")),
        },
  };
};

export const inspectBscSccpRuntimeProverConfig = async (input = {}) => {
  const configUrl = readOwnValue(input, "configUrl");
  const routeReport = readOwnValue(input, "routeReport");
  const label = readOwnValue(input, "label") ?? "BSC runtime prover config";
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const moduleRepoRoot = readOwnValue(input, "repoRoot") ?? repoRoot;
  const fetchImpl = readOwnValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = readOwnValue(input, "timeoutMs") ?? 5_000;
  const normalizedConfigUrl = normalizeSccpBrowserModuleUrl(configUrl, label);
  if (!normalizedConfigUrl) {
    return null;
  }
  try {
    const { bytes } = await readSccpBrowserUrlBytes({
      url: normalizedConfigUrl,
      label,
      repoRoot: moduleRepoRoot,
      fetchImpl,
      timeoutMs,
      maxBytes: SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES,
    });
    const payload = parseJsonWithoutDuplicateKeys(
      Buffer.from(bytes).toString("utf8"),
      label,
    );
    const validation = validateBscSccpRuntimeProverConfigManifest({
      manifest: payload,
      routeReport,
      label,
      bscNetwork,
    });
    return {
      ...validation,
      configUrl: normalizedConfigUrl,
      configSha256: sha256Hex(bytes),
      manifest: validation.manifest,
    };
  } catch (error) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : String(error),
      configUrl: normalizedConfigUrl,
      configSha256: null,
      manifest: null,
    };
  }
};

const moduleAvailabilityBindingProblems = ({
  availability,
  configuredModuleUrl,
  expectedModuleSha256,
  label,
}) => {
  const problems = [];
  if (!isRecord(availability)) {
    return [`${label} availability proof is missing.`];
  }
  const configuredUrl = trimString(configuredModuleUrl);
  const inspectedUrlResult = readSinglePublicStringAlias(
    availability,
    `${label} inspected moduleUrl`,
    "moduleUrl",
    "url",
  );
  problems.push(...inspectedUrlResult.problems);
  const inspectedUrl = inspectedUrlResult.value;
  if (!inspectedUrl) {
    problems.push(`${label} inspected moduleUrl is missing.`);
  } else {
    try {
      const normalizedInspectedUrl = normalizeSccpBrowserModuleUrl(
        inspectedUrl,
        `${label} inspected moduleUrl`,
      );
      if (configuredUrl && normalizedInspectedUrl !== configuredUrl) {
        problems.push(
          `${label} inspected moduleUrl ${normalizedInspectedUrl} does not match configured ${configuredUrl}.`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const expectedHash = normalizeHex32(expectedModuleSha256);
  if (expectedHash) {
    const inspectedHashResult = readSinglePublicStringAlias(
      availability,
      `${label} inspected moduleSha256`,
      "moduleSha256",
      "sha256",
    );
    problems.push(...inspectedHashResult.problems);
    const inspectedHash = normalizeHex32(inspectedHashResult.value);
    if (!inspectedHash) {
      problems.push(`${label} inspected moduleSha256 is missing.`);
    } else if (inspectedHash !== expectedHash) {
      problems.push(
        `${label} inspected moduleSha256 ${inspectedHash} does not match manifest moduleSha256 ${expectedHash}.`,
      );
    }

    const expectedHashResult = readSinglePublicStringAlias(
      availability,
      `${label} expectedSha256`,
      "expectedSha256",
      "expectedModuleSha256",
    );
    problems.push(...expectedHashResult.problems);
    const declaredExpectedHash = normalizeHex32(expectedHashResult.value);
    if (declaredExpectedHash && declaredExpectedHash !== expectedHash) {
      problems.push(
        `${label} expectedSha256 ${declaredExpectedHash} does not match manifest moduleSha256 ${expectedHash}.`,
      );
    }
  }
  return problems;
};

const proverManifestInspectionBindingProblems = ({
  inspection,
  configuredManifestUrl,
  configuredModuleUrl,
  label,
}) => {
  const problems = [];
  if (!isRecord(inspection)) {
    return [`${label} inspection proof is missing.`];
  }

  const configuredUrl = trimString(configuredManifestUrl);
  const inspectedUrlResult = readSinglePublicStringAlias(
    inspection,
    `${label} inspected manifestUrl`,
    "manifestUrl",
    "url",
  );
  problems.push(...inspectedUrlResult.problems);
  const inspectedUrl = inspectedUrlResult.value;
  if (!inspectedUrl) {
    problems.push(`${label} inspected manifestUrl is missing.`);
  } else {
    try {
      const normalizedInspectedUrl = normalizeSccpBrowserModuleUrl(
        inspectedUrl,
        `${label} inspected manifestUrl`,
      );
      if (configuredUrl && normalizedInspectedUrl !== configuredUrl) {
        problems.push(
          `${label} inspected manifestUrl ${normalizedInspectedUrl} does not match configured ${configuredUrl}.`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const manifestModuleUrlResult = readSinglePublicStringAlias(
    inspection.manifest,
    `${label} inspected manifest moduleUrl`,
    "moduleUrl",
    "module_url",
  );
  problems.push(...manifestModuleUrlResult.problems);
  const manifestModuleUrl = manifestModuleUrlResult.value;
  if (!manifestModuleUrl) {
    problems.push(`${label} inspected manifest moduleUrl is missing.`);
  } else {
    try {
      const normalizedManifestModuleUrl = normalizeSccpBrowserModuleUrl(
        manifestModuleUrl,
        `${label} inspected manifest moduleUrl`,
      );
      if (
        configuredModuleUrl &&
        normalizedManifestModuleUrl !== configuredModuleUrl
      ) {
        problems.push(
          `${label} inspected manifest moduleUrl ${normalizedManifestModuleUrl} does not match configured ${configuredModuleUrl}.`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const manifestModuleHashResult = readSinglePublicStringAlias(
    inspection.manifest,
    `${label} manifest moduleSha256`,
    "moduleSha256",
    "module_sha256",
  );
  problems.push(...manifestModuleHashResult.problems);
  const manifestModuleHash = normalizeHex32(manifestModuleHashResult.value);
  const inspectionModuleHashResult = readSinglePublicStringAlias(
    inspection,
    `${label} inspected moduleSha256`,
    "moduleSha256",
    "sha256",
  );
  problems.push(...inspectionModuleHashResult.problems);
  const inspectionModuleHash = normalizeHex32(inspectionModuleHashResult.value);
  if (manifestModuleHash) {
    if (!inspectionModuleHash) {
      problems.push(`${label} inspected moduleSha256 is missing.`);
    } else if (inspectionModuleHash !== manifestModuleHash) {
      problems.push(
        `${label} inspected moduleSha256 ${inspectionModuleHash} does not match manifest moduleSha256 ${manifestModuleHash}.`,
      );
    }
  }

  return problems;
};

const readPublicStringArrayAlias = (record, ...keys) => {
  for (const key of keys) {
    const value = readPublicArray(record, key);
    if (Array.isArray(value)) {
      return publicStringArray(value);
    }
  }
  return [];
};

const readRouteBrowserProverRef = (routeReport, key) => {
  const deployment = readPublicRecord(routeReport, "deployment");
  const keys =
    key === "destinationBrowserProver"
      ? ["destinationBrowserProver", "destination_browser_prover"]
      : key === "sourceBrowserProver"
        ? ["sourceBrowserProver", "source_browser_prover"]
        : [key];
  const record = keys.reduce(
    (selected, candidate) =>
      selected ??
      readPublicRecord(deployment, candidate) ??
      readPublicRecord(routeReport, candidate),
    null,
  );
  if (!record) {
    return null;
  }
  return {
    moduleUrl: readSinglePublicStringAlias(
      record,
      `${key}.moduleUrl`,
      "moduleUrl",
      "module_url",
      "browserModuleUrl",
      "browser_module_url",
    ).value,
    moduleSpecifier: readSinglePublicStringAlias(
      record,
      `${key}.moduleSpecifier`,
      "moduleSpecifier",
      "module_specifier",
      "specifier",
    ).value,
    moduleHash: readSinglePublicStringAlias(
      record,
      `${key}.moduleHash`,
      "moduleHash",
      "module_hash",
      "moduleSha256",
      "module_sha256",
      "sha256",
    ).value,
    manifestHash: readSinglePublicStringAlias(
      record,
      `${key}.manifestHash`,
      "manifestHash",
      "manifest_hash",
      "manifestSha256",
      "manifest_sha256",
    ).value,
    expectedExports: readPublicStringArrayAlias(
      record,
      "expectedExports",
      "expected_exports",
      "exports",
      "exportNames",
      "export_names",
    ),
    boundRouteHash: readSinglePublicStringAlias(
      record,
      `${key}.boundRouteHash`,
      "boundRouteHash",
      "bound_route_hash",
      "routeHash",
      "route_hash",
      "destinationBindingHash",
      "destination_binding_hash",
    ).value,
    boundProofHash: readSinglePublicStringAlias(
      record,
      `${key}.boundProofHash`,
      "boundProofHash",
      "bound_proof_hash",
      "proofHash",
      "proof_hash",
      "proofArtifactHash",
      "proof_artifact_hash",
    ).value,
  };
};

const sortedStringSet = (values) =>
  [...new Set((values ?? []).map((value) => trimString(value)).filter(Boolean))]
    .sort()
    .join(",");

const routeBrowserProverModuleBindingProblems = ({
  routeRef,
  configuredModuleUrl,
  availability,
  label,
}) => {
  const problems = [];
  if (!routeRef) {
    return [`${label} on-chain route browser prover reference is missing.`];
  }
  const routeModuleUrl = normalizeManifestUrlForComparison(
    routeRef.moduleUrl,
    `${label} on-chain moduleUrl`,
  );
  if (!routeModuleUrl) {
    problems.push(`${label} on-chain moduleUrl is missing or invalid.`);
  } else if (configuredModuleUrl && routeModuleUrl !== configuredModuleUrl) {
    problems.push(
      `${label} configured module URL ${configuredModuleUrl} does not match on-chain route moduleUrl ${routeModuleUrl}.`,
    );
  }
  const routeModuleHash = normalizeNonZeroHex32(routeRef.moduleHash);
  if (!routeModuleHash) {
    problems.push(`${label} on-chain moduleHash is missing or invalid.`);
  }
  const fetchedModuleHash = normalizeHexString(
    readPublicString(availability, "moduleSha256"),
  );
  if (
    routeModuleHash &&
    isNonZeroHex32(fetchedModuleHash) &&
    fetchedModuleHash !== routeModuleHash
  ) {
    problems.push(
      `${label} fetched moduleSha256 ${fetchedModuleHash} does not match on-chain moduleHash ${routeModuleHash}.`,
    );
  }
  return problems;
};

const routeBrowserProverManifestBindingProblems = ({
  routeRef,
  inspection,
  label,
}) => {
  const problems = [];
  if (!routeRef) {
    return [`${label} on-chain route browser prover reference is missing.`];
  }
  const inspectedManifest = readPublicRecord(inspection, "manifest");
  const routeModuleHash = normalizeNonZeroHex32(routeRef.moduleHash);
  const inspectedModuleHash = normalizeHexString(
    readPublicString(inspectedManifest, "moduleSha256"),
  );
  if (
    routeModuleHash &&
    isNonZeroHex32(inspectedModuleHash) &&
    inspectedModuleHash !== routeModuleHash
  ) {
    problems.push(
      `${label} manifest moduleSha256 ${inspectedModuleHash} does not match on-chain moduleHash ${routeModuleHash}.`,
    );
  }
  const routeManifestHash = normalizeNonZeroHex32(routeRef.manifestHash);
  if (!routeManifestHash) {
    problems.push(`${label} on-chain manifestHash is missing or invalid.`);
  }
  if (routeRef.expectedExports.length === 0) {
    problems.push(`${label} on-chain expectedExports is missing or empty.`);
  } else {
    const manifestExports = readPublicArray(inspectedManifest, "exports");
    const actualExports = Array.isArray(manifestExports)
      ? publicStringArray(manifestExports)
      : [
          readPublicString(inspectedManifest, "acceptedExport"),
          readPublicString(inspectedManifest, "acceptedSelfTestExport"),
        ].filter(Boolean);
    if (
      sortedStringSet(actualExports) !==
      sortedStringSet(routeRef.expectedExports)
    ) {
      problems.push(
        `${label} manifest exports ${actualExports.join(",") || "<missing>"} do not match on-chain expectedExports ${routeRef.expectedExports.join(",")}.`,
      );
    }
  }
  const routeBoundHash = normalizeNonZeroHex32(routeRef.boundRouteHash);
  const inspectedBoundHash = normalizeHexString(
    readManifestString(
      inspectedManifest,
      "destinationBindingHash",
      "destination_binding_hash",
      "bindingHash",
      "binding_hash",
    ),
  );
  if (
    routeBoundHash &&
    isNonZeroHex32(inspectedBoundHash) &&
    inspectedBoundHash !== routeBoundHash
  ) {
    problems.push(
      `${label} manifest destinationBindingHash ${inspectedBoundHash} does not match on-chain boundRouteHash ${routeBoundHash}.`,
    );
  }
  const routeProofHash = normalizeNonZeroHex32(routeRef.boundProofHash);
  const inspectedProofHash = normalizeHexString(
    readManifestString(
      inspectedManifest,
      "proofArtifactHash",
      "proof_artifact_hash",
    ),
  );
  if (
    routeProofHash &&
    isNonZeroHex32(inspectedProofHash) &&
    inspectedProofHash !== routeProofHash
  ) {
    problems.push(
      `${label} manifest proofArtifactHash ${inspectedProofHash} does not match on-chain boundProofHash ${routeProofHash}.`,
    );
  }
  return problems;
};

const runtimeConfigInspectionBindingProblems = ({
  inspection,
  configuredConfigUrl,
}) => {
  const problems = [];
  if (!isRecord(inspection)) {
    return ["BSC runtime prover config inspection proof is missing."];
  }

  const configuredUrl = trimString(configuredConfigUrl);
  const inspectedUrl = readPublicString(inspection, "configUrl");
  if (!inspectedUrl) {
    problems.push("BSC runtime prover config inspected configUrl is missing.");
  } else {
    try {
      const normalizedInspectedUrl = normalizeSccpBrowserModuleUrl(
        inspectedUrl,
        "BSC runtime prover config inspected configUrl",
      );
      if (configuredUrl && normalizedInspectedUrl !== configuredUrl) {
        problems.push(
          `BSC runtime prover config inspected configUrl ${normalizedInspectedUrl} does not match configured ${configuredUrl}.`,
        );
      }
    } catch (error) {
      problems.push(error instanceof Error ? error.message : String(error));
    }
  }

  const configSha256 = normalizeNonZeroHex32(
    readPublicString(inspection, "configSha256"),
  );
  if (!configSha256) {
    problems.push(
      "BSC runtime prover config inspected configSha256 is missing or invalid.",
    );
  }
  if (!isRecord(inspection.manifest)) {
    problems.push("BSC runtime prover config inspected manifest is missing.");
  }
  return problems;
};

export const evaluateBscSccpLiveSmokeReadiness = (input = {}) => {
  const routeReport = readOwnValue(input, "routeReport");
  const bscNetwork = readOwnValue(input, "bscNetwork") ?? "testnet";
  const walletConnectProjectId = readOwnValue(input, "walletConnectProjectId");
  const destinationProverModuleUrl = readOwnValue(
    input,
    "destinationProverModuleUrl",
  );
  const sourceProverModuleUrl = readOwnValue(input, "sourceProverModuleUrl");
  const destinationProverManifestUrl = readOwnValue(
    input,
    "destinationProverManifestUrl",
  );
  const sourceProverManifestUrl = readOwnValue(
    input,
    "sourceProverManifestUrl",
  );
  const runtimeProverConfigUrl = readOwnValue(input, "runtimeProverConfigUrl");
  const destinationProverModuleAvailability = readOwnValue(
    input,
    "destinationProverModuleAvailability",
  );
  const sourceProverModuleAvailability = readOwnValue(
    input,
    "sourceProverModuleAvailability",
  );
  const destinationProverManifestInspection = readOwnValue(
    input,
    "destinationProverManifestInspection",
  );
  const sourceProverManifestInspection = readOwnValue(
    input,
    "sourceProverManifestInspection",
  );
  const runtimeProverConfigInspection = readOwnValue(
    input,
    "runtimeProverConfigInspection",
  );
  const peerAuditReport = readOwnValue(input, "peerAuditReport");
  const checkedAt =
    readOwnValue(input, "checkedAt") ?? new Date().toISOString();
  const profile = resolveBscNetworkProfile(bscNetwork);
  const routeRecord = ownJsonRecord(routeReport);
  const peerAuditRecord = ownJsonRecord(peerAuditReport);
  const destinationProverModuleAvailabilityRecord = ownJsonRecord(
    destinationProverModuleAvailability,
  );
  const sourceProverModuleAvailabilityRecord = ownJsonRecord(
    sourceProverModuleAvailability,
  );
  const destinationProverManifestInspectionRecord = ownJsonRecord(
    destinationProverManifestInspection,
  );
  const sourceProverManifestInspectionRecord = ownJsonRecord(
    sourceProverManifestInspection,
  );
  const runtimeProverConfigInspectionRecord = ownJsonRecord(
    runtimeProverConfigInspection,
  );
  const destinationProverModulePrimaryEnv = bscProfileEnvKey(
    profile,
    SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
    SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  );
  const destinationProverModuleEnv = describeBscProfileEnv(
    profile,
    SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
    SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
    SCCP_BSC_PROVER_MODULE_URL_ENV,
  );
  const sourceProverModulePrimaryEnv = bscProfileEnvKey(
    profile,
    SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
    SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  );
  const sourceProverModuleEnv = describeBscProfileEnv(
    profile,
    SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
    SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
    SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
  );
  const destinationProverManifestEnv = describeBscProfileEnv(
    profile,
    SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV,
    SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV,
    SCCP_BSC_PROVER_MANIFEST_URL_ENV,
  );
  const sourceProverManifestEnv = describeBscProfileEnv(
    profile,
    SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV,
    SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV,
    SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
  );
  const runtimeProverConfigEnv = describeBscProfileEnv(
    profile,
    SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
    SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
    SCCP_BSC_PROVER_CONFIG_URL_ENV,
  );
  const checks = [];
  const reasons = [];
  const nextSteps = [];
  const rawRouteReady = readPublicBoolean(routeRecord, "ready");
  const routeProblems = routeReportProblems(routeRecord, profile);
  const routeBindingProblems = routeReportBindingProblems(routeRecord, profile);
  const routeReady = rawRouteReady && routeProblems.length === 0;
  const destinationRouteBrowserProverRef = readRouteBrowserProverRef(
    routeRecord,
    "destinationBrowserProver",
  );
  const sourceRouteBrowserProverRef = readRouteBrowserProverRef(
    routeRecord,
    "sourceBrowserProver",
  );

  checks.push(
    check(
      "route-preflight",
      "TAIRA/BSC SCCP route preflight is ready.",
      routeReady ? "pass" : "fail",
      routeReady
        ? `Route manifest, capabilities, ${profile.label} deployment evidence, and TAIRA burn-record material are ready.`
        : routeBindingProblems.length
          ? `Route preflight report is not bound to ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}: ${[
              ...routeBindingProblems,
              ...routeProblems.filter(
                (problem) => !routeBindingProblems.includes(problem),
              ),
            ].join(" ")}`
          : routeProblems.length
            ? `Route preflight is not ready: ${routeProblems.join(" ")}`
            : `Run npm run e2e:sccp:bsc-preflight and activate the public ${profile.label} route manifest before live transfer smoke.`,
    ),
  );
  if (!routeReady) {
    reasons.push(
      routeBindingProblems.length
        ? "SCCP route preflight report is not bound to TAIRA/BSC XOR."
        : "SCCP BSC route preflight is not ready.",
    );
    nextSteps.push(
      ...(readPublicArray(routeRecord, "nextSteps")?.length
        ? readPublicArray(routeRecord, "nextSteps")
        : [
            `Deploy or activate the ${profile.label} token, route bridge, source bridge, verifier material, TAIRA burn-record contract material, and public route manifest evidence.`,
          ]),
    );
  }

  const peerAuditProblems = peerAuditReportProblems(
    peerAuditRecord,
    routeRecord,
  );
  const peerAuditReady = peerAuditProblems.length === 0;
  checks.push(
    check(
      "peer-config-audit",
      "TAIRA peer configs do not carry stale local BSC SCCP route/prover overrides.",
      peerAuditReady ? "pass" : "fail",
      peerAuditReady
        ? "Peer config audit found no stale local BSC route overrides."
        : peerAuditProblems.join(" "),
    ),
  );
  if (!peerAuditReady) {
    reasons.push("TAIRA peer config audit is not ready.");
    nextSteps.push(
      "Run npm run e2e:sccp:bsc-peer-config-audit against the active TAIRA peer configs and remove any local taira_bsc_xor/xor route stanza or native prover override.",
    );
  }

  const project = safeNormalize(
    () => normalizeBscWalletConnectProjectId(walletConnectProjectId),
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
        `${WALLETCONNECT_PROJECT_ID_ENV} is required for BSC WalletConnect signing.`,
      ),
    );
    reasons.push("WalletConnect project ID is missing.");
    nextSteps.push(
      `Set ${WALLETCONNECT_PROJECT_ID_ENV} before launching the Electron renderer for BSC WalletConnect approvals.`,
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

  const runtimeProverModuleUrls = [
    destinationProverModuleUrl,
    sourceProverModuleUrl,
    readPublicString(
      readPublicRecord(destinationProverManifestInspectionRecord, "manifest"),
      "moduleUrl",
    ),
    readPublicString(
      readPublicRecord(sourceProverManifestInspectionRecord, "manifest"),
      "moduleUrl",
    ),
  ];
  const runtimeConfigRequired =
    Boolean(trimString(runtimeProverConfigUrl)) ||
    runtimeProverModuleUrls.some(isBscRuntimeProverModuleUrl);
  const runtimeConfigUrl = safeNormalize(
    () =>
      runtimeProverConfigUrl
        ? normalizeSccpBrowserModuleUrl(
            runtimeProverConfigUrl,
            "BSC runtime prover config URL",
          )
        : deriveBscRuntimeProverConfigUrl(...runtimeProverModuleUrls),
    "Unable to validate BSC runtime prover config URL.",
  );
  if (runtimeConfigRequired) {
    if (runtimeConfigUrl.error) {
      checks.push(
        check(
          "runtime-prover-config",
          "BSC runtime prover config is route-bound.",
          "fail",
          runtimeConfigUrl.error,
        ),
      );
      reasons.push(runtimeConfigUrl.error);
    } else if (!runtimeConfigUrl.value) {
      const detail = `${runtimeProverConfigEnv} is required for the checked-in BSC runtime prover module.`;
      checks.push(
        check(
          "runtime-prover-config",
          "BSC runtime prover config is route-bound.",
          "fail",
          detail,
        ),
      );
      reasons.push("BSC runtime prover config URL is missing.");
      nextSteps.push(
        `Set ${runtimeProverConfigEnv} or publish ${SCCP_BSC_RUNTIME_PROVER_CONFIG_URL} beside the checked-in BSC runtime prover module.`,
      );
    } else if (runtimeProverConfigInspectionRecord?.ok !== true) {
      const detail =
        readPublicString(runtimeProverConfigInspectionRecord, "detail") ||
        "BSC runtime prover config was not checked.";
      checks.push(
        check(
          "runtime-prover-config",
          "BSC runtime prover config is route-bound.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else {
      const bindingProblems = runtimeConfigInspectionBindingProblems({
        inspection: runtimeProverConfigInspectionRecord,
        configuredConfigUrl: runtimeConfigUrl.value,
      });
      if (bindingProblems.length > 0) {
        const detail = bindingProblems.join(" ");
        checks.push(
          check(
            "runtime-prover-config",
            "BSC runtime prover config is route-bound.",
            "fail",
            detail,
          ),
        );
        reasons.push(detail);
      } else {
        checks.push(
          check(
            "runtime-prover-config",
            "BSC runtime prover config is route-bound.",
            "pass",
            readPublicString(runtimeProverConfigInspectionRecord, "detail") ||
              runtimeConfigUrl.value,
          ),
        );
      }
    }
  } else {
    checks.push(
      check(
        "runtime-prover-config",
        "BSC runtime prover config is route-bound.",
        "pass",
        "No checked-in BSC runtime prover config is required for the configured prover modules.",
      ),
    );
  }

  const destinationProver = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        destinationProverModuleUrl,
        "TAIRA -> BSC prover module URL",
      ),
    "Unable to validate TAIRA -> BSC prover module URL.",
  );
  if (destinationProver.error) {
    checks.push(
      check(
        "destination-prover-module",
        "TAIRA -> BSC browser prover module is configured.",
        "fail",
        destinationProver.error,
      ),
    );
    reasons.push(destinationProver.error);
  } else if (!destinationProver.value) {
    checks.push(
      check(
        "destination-prover-module",
        "TAIRA -> BSC browser prover module is configured.",
        "fail",
        `${destinationProverModuleEnv} is required for destination proof generation.`,
      ),
    );
    reasons.push("TAIRA -> BSC browser prover module URL is missing.");
    nextSteps.push(
      `Set ${destinationProverModuleEnv} to a browser-safe BSC Groth16 prover module.`,
    );
  } else {
    const availability = destinationProverModuleAvailabilityRecord;
    if (availability?.ok === false) {
      const detail =
        readPublicString(availability, "detail") ||
        "TAIRA -> BSC browser prover module is not reachable.";
      checks.push(
        check(
          "destination-prover-module",
          "TAIRA -> BSC browser prover module is configured.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else if (availability?.ok !== true) {
      const detail =
        "TAIRA -> BSC browser prover module availability was not checked.";
      checks.push(
        check(
          "destination-prover-module",
          "TAIRA -> BSC browser prover module is configured.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else {
      const bindingProblems = moduleAvailabilityBindingProblems({
        availability,
        configuredModuleUrl: destinationProver.value,
        expectedModuleSha256: readPublicString(
          readPublicRecord(
            destinationProverManifestInspectionRecord,
            "manifest",
          ),
          "moduleSha256",
        ),
        label: "TAIRA -> BSC browser prover module",
      });
      bindingProblems.push(
        ...routeBrowserProverModuleBindingProblems({
          routeRef: destinationRouteBrowserProverRef,
          configuredModuleUrl: destinationProver.value,
          availability,
          label: "TAIRA -> BSC browser prover module",
        }),
      );
      if (bindingProblems.length > 0) {
        const detail = bindingProblems.join(" ");
        checks.push(
          check(
            "destination-prover-module",
            "TAIRA -> BSC browser prover module is configured.",
            "fail",
            detail,
          ),
        );
        reasons.push(detail);
      } else {
        checks.push(
          check(
            "destination-prover-module",
            "TAIRA -> BSC browser prover module is configured.",
            "pass",
            readPublicString(availability, "detail") || destinationProver.value,
          ),
        );
      }
    }
  }

  const destinationManifestUrl = safeNormalize(
    () =>
      destinationProverManifestUrl
        ? normalizeSccpBrowserModuleUrl(
            destinationProverManifestUrl,
            "TAIRA -> BSC prover manifest URL",
          )
        : deriveSccpBrowserProverManifestUrl(
            destinationProver.value,
            "TAIRA -> BSC prover module URL",
          ),
    "Unable to validate TAIRA -> BSC prover manifest URL.",
  );
  if (destinationManifestUrl.error) {
    checks.push(
      check(
        "destination-prover-manifest",
        "TAIRA -> BSC browser prover manifest is route-bound.",
        "fail",
        destinationManifestUrl.error,
      ),
    );
    reasons.push(destinationManifestUrl.error);
  } else if (!destinationManifestUrl.value) {
    checks.push(
      check(
        "destination-prover-manifest",
        "TAIRA -> BSC browser prover manifest is route-bound.",
        "fail",
        `${destinationProverManifestEnv} is required, or ${destinationProverModulePrimaryEnv}.manifest.json must exist beside the module.`,
      ),
    );
    reasons.push("TAIRA -> BSC browser prover manifest URL is missing.");
    nextSteps.push(
      `Publish a ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA} sidecar and set ${destinationProverManifestEnv}, or place it at ${destinationProverModulePrimaryEnv}.manifest.json.`,
    );
  } else if (destinationProverManifestInspectionRecord?.ok !== true) {
    const detail =
      readPublicString(destinationProverManifestInspectionRecord, "detail") ||
      "TAIRA -> BSC browser prover manifest was not checked.";
    checks.push(
      check(
        "destination-prover-manifest",
        "TAIRA -> BSC browser prover manifest is route-bound.",
        "fail",
        detail,
      ),
    );
    reasons.push(detail);
  } else {
    const bindingProblems = proverManifestInspectionBindingProblems({
      inspection: destinationProverManifestInspectionRecord,
      configuredManifestUrl: destinationManifestUrl.value,
      configuredModuleUrl: destinationProver.value,
      label: "TAIRA -> BSC browser prover manifest",
    });
    bindingProblems.push(
      ...routeBrowserProverManifestBindingProblems({
        routeRef: destinationRouteBrowserProverRef,
        inspection: destinationProverManifestInspectionRecord,
        label: "TAIRA -> BSC browser prover manifest",
      }),
    );
    if (bindingProblems.length > 0) {
      const detail = bindingProblems.join(" ");
      checks.push(
        check(
          "destination-prover-manifest",
          "TAIRA -> BSC browser prover manifest is route-bound.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else {
      checks.push(
        check(
          "destination-prover-manifest",
          "TAIRA -> BSC browser prover manifest is route-bound.",
          "pass",
          readPublicString(
            destinationProverManifestInspectionRecord,
            "detail",
          ) || destinationManifestUrl.value,
        ),
      );
    }
  }

  const sourceProver = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        sourceProverModuleUrl,
        "BSC -> TAIRA source prover module URL",
      ),
    "Unable to validate BSC -> TAIRA source prover module URL.",
  );
  if (sourceProver.error) {
    checks.push(
      check(
        "source-prover-module",
        "BSC -> TAIRA browser source prover module is configured.",
        "fail",
        sourceProver.error,
      ),
    );
    reasons.push(sourceProver.error);
  } else if (!sourceProver.value) {
    checks.push(
      check(
        "source-prover-module",
        "BSC -> TAIRA browser source prover module is configured.",
        "fail",
        `${sourceProverModuleEnv} is required for source proof generation.`,
      ),
    );
    reasons.push("BSC -> TAIRA browser source prover module URL is missing.");
    nextSteps.push(
      `Set ${sourceProverModuleEnv} to a browser-safe BSC source proof module. If one module exports both prover functions, set ${destinationProverModuleEnv} and ${sourceProverModuleEnv} to that same URL.`,
    );
  } else {
    const availability = sourceProverModuleAvailabilityRecord;
    if (availability?.ok === false) {
      const detail =
        readPublicString(availability, "detail") ||
        "BSC -> TAIRA browser source prover module is not reachable.";
      checks.push(
        check(
          "source-prover-module",
          "BSC -> TAIRA browser source prover module is configured.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else if (availability?.ok !== true) {
      const detail =
        "BSC -> TAIRA browser source prover module availability was not checked.";
      checks.push(
        check(
          "source-prover-module",
          "BSC -> TAIRA browser source prover module is configured.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else {
      const bindingProblems = moduleAvailabilityBindingProblems({
        availability,
        configuredModuleUrl: sourceProver.value,
        expectedModuleSha256: readPublicString(
          readPublicRecord(sourceProverManifestInspectionRecord, "manifest"),
          "moduleSha256",
        ),
        label: "BSC -> TAIRA browser source prover module",
      });
      bindingProblems.push(
        ...routeBrowserProverModuleBindingProblems({
          routeRef: sourceRouteBrowserProverRef,
          configuredModuleUrl: sourceProver.value,
          availability,
          label: "BSC -> TAIRA browser source prover module",
        }),
      );
      if (bindingProblems.length > 0) {
        const detail = bindingProblems.join(" ");
        checks.push(
          check(
            "source-prover-module",
            "BSC -> TAIRA browser source prover module is configured.",
            "fail",
            detail,
          ),
        );
        reasons.push(detail);
      } else {
        checks.push(
          check(
            "source-prover-module",
            "BSC -> TAIRA browser source prover module is configured.",
            "pass",
            readPublicString(availability, "detail") || sourceProver.value,
          ),
        );
      }
    }
  }

  const sourceManifestUrl = safeNormalize(
    () =>
      sourceProverManifestUrl
        ? normalizeSccpBrowserModuleUrl(
            sourceProverManifestUrl,
            "BSC -> TAIRA source prover manifest URL",
          )
        : deriveSccpBrowserProverManifestUrl(
            sourceProver.value,
            "BSC -> TAIRA source prover module URL",
          ),
    "Unable to validate BSC -> TAIRA source prover manifest URL.",
  );
  if (sourceManifestUrl.error) {
    checks.push(
      check(
        "source-prover-manifest",
        "BSC -> TAIRA browser source prover manifest is route-bound.",
        "fail",
        sourceManifestUrl.error,
      ),
    );
    reasons.push(sourceManifestUrl.error);
  } else if (!sourceManifestUrl.value) {
    checks.push(
      check(
        "source-prover-manifest",
        "BSC -> TAIRA browser source prover manifest is route-bound.",
        "fail",
        `${sourceProverManifestEnv} is required, or ${sourceProverModulePrimaryEnv}.manifest.json must exist beside the module.`,
      ),
    );
    reasons.push("BSC -> TAIRA browser source prover manifest URL is missing.");
    nextSteps.push(
      `Publish a ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA} sidecar and set ${sourceProverManifestEnv}, or place it at ${sourceProverModulePrimaryEnv}.manifest.json.`,
    );
  } else if (sourceProverManifestInspectionRecord?.ok !== true) {
    const detail =
      readPublicString(sourceProverManifestInspectionRecord, "detail") ||
      "BSC -> TAIRA browser source prover manifest was not checked.";
    checks.push(
      check(
        "source-prover-manifest",
        "BSC -> TAIRA browser source prover manifest is route-bound.",
        "fail",
        detail,
      ),
    );
    reasons.push(detail);
  } else {
    const bindingProblems = proverManifestInspectionBindingProblems({
      inspection: sourceProverManifestInspectionRecord,
      configuredManifestUrl: sourceManifestUrl.value,
      configuredModuleUrl: sourceProver.value,
      label: "BSC -> TAIRA browser source prover manifest",
    });
    bindingProblems.push(
      ...routeBrowserProverManifestBindingProblems({
        routeRef: sourceRouteBrowserProverRef,
        inspection: sourceProverManifestInspectionRecord,
        label: "BSC -> TAIRA browser source prover manifest",
      }),
    );
    if (bindingProblems.length > 0) {
      const detail = bindingProblems.join(" ");
      checks.push(
        check(
          "source-prover-manifest",
          "BSC -> TAIRA browser source prover manifest is route-bound.",
          "fail",
          detail,
        ),
      );
      reasons.push(detail);
    } else {
      checks.push(
        check(
          "source-prover-manifest",
          "BSC -> TAIRA browser source prover manifest is route-bound.",
          "pass",
          readPublicString(sourceProverManifestInspectionRecord, "detail") ||
            sourceManifestUrl.value,
        ),
      );
    }
  }

  if (
    routeReady &&
    project.value &&
    destinationProver.value &&
    sourceProver.value &&
    peerAuditReady &&
    (!runtimeConfigRequired ||
      runtimeProverConfigInspectionRecord?.ok === true) &&
    destinationProverModuleAvailabilityRecord?.ok === true &&
    sourceProverModuleAvailabilityRecord?.ok === true &&
    destinationProverManifestInspectionRecord?.ok === true &&
    sourceProverManifestInspectionRecord?.ok === true
  ) {
    nextSteps.push(...bscLiveSmokeSteps(profile));
  }

  const failedCheckIds = new Set(
    checks
      .filter((entry) => entry.status !== "pass")
      .map((entry) => entry.id)
      .filter(Boolean),
  );
  const nextActions = bscSmokeReadinessNextActions({
    profile,
    failedCheckIds,
    destinationProverModuleEnv,
    sourceProverModuleEnv,
    destinationProverManifestEnv,
    sourceProverManifestEnv,
    runtimeProverConfigEnv,
    runtimeConfigRequired,
  });
  const missingProductionInputs = bscSmokeMissingProductionInputs(nextActions);
  const runbookProblems = bscSccpLiveSmokeReadinessRunbookProblems({
    nextActions,
    missingProductionInputs,
  });
  checks.push(
    check(
      "smoke-readiness-runbook-contract",
      "BSC live smoke-readiness exposes a complete operator runbook.",
      runbookProblems.length === 0 ? "pass" : "fail",
      runbookProblems.join("; "),
    ),
  );

  return {
    ready: checks.every((entry) => entry.status === "pass"),
    checkedAt,
    routeReady,
    checks,
    reasons: [...new Set(reasons)],
    nextSteps: [...new Set(nextSteps)],
    nextActions,
    missingProductionInputs,
    route: isRecord(routeRecord)
      ? {
          endpoint:
            readPublicString(routeRecord, "toriiUrl") ??
            readPublicString(routeRecord, "endpoint"),
          manifestSource: readPublicString(routeRecord, "manifestSource"),
          routeId: readPublicString(routeRecord, "routeId"),
          assetKey: readPublicString(routeRecord, "assetKey"),
          taira: readPublicRecord(routeRecord, "taira"),
          bsc: readPublicRecord(routeRecord, "bsc"),
          deployment: publicRouteDeployment(
            readPublicRecord(routeRecord, "deployment"),
          ),
          postDeployLiveEvidence: publicPostDeployLiveEvidence(
            readPublicRecord(routeRecord, "postDeployLiveEvidence"),
          ),
          nextActions: publicNextActions(
            readPublicArray(routeRecord, "nextActions"),
          ),
          missingProductionInputs: publicMissingInputs(
            readPublicArray(routeRecord, "missingProductionInputs"),
          ),
        }
      : null,
    peerAudit: publicPeerAuditReport(peerAuditRecord),
    provers: {
      destination: {
        moduleUrl: destinationProver.value,
        manifestUrl: destinationManifestUrl.value,
        manifest:
          readPublicRecord(
            destinationProverManifestInspectionRecord,
            "manifest",
          ) ?? null,
      },
      source: {
        moduleUrl: sourceProver.value,
        manifestUrl: sourceManifestUrl.value,
        manifest:
          readPublicRecord(sourceProverManifestInspectionRecord, "manifest") ??
          null,
      },
      runtimeConfig: {
        required: runtimeConfigRequired,
        configUrl: runtimeConfigUrl.value ?? null,
        configSha256: runtimeConfigRequired
          ? (readPublicString(
              runtimeProverConfigInspectionRecord,
              "configSha256",
            ) ?? null)
          : null,
        manifest: runtimeConfigRequired
          ? (readPublicRecord(
              runtimeProverConfigInspectionRecord,
              "manifest",
            ) ?? null)
          : null,
      },
    },
  };
};

export const writeBscSccpLiveSmokeReadinessReport = async (
  report,
  { outputDir, bscNetwork } = {},
) => {
  const selectedBscNetwork = bscNetwork || report?.bsc?.network || "testnet";
  const reportDir = path.resolve(
    repoRoot,
    trimString(outputDir) || bscSccpSmokeReadinessOutputDir(selectedBscNetwork),
  );
  const reportPath = path.join(reportDir, "latest.json");
  await writeJsonReportFile(reportPath, report);
  return reportPath;
};

const peerAuditReportLoadFailure = (error) => ({
  ready: false,
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  checks: [
    {
      id: "peer-audit-report-load",
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to load peer audit report.",
    },
  ],
});

const loadBscPeerAuditReport = async (
  peerAuditReportPath,
  { required = false } = {},
) => {
  const selectedPath = trimString(peerAuditReportPath);
  if (!selectedPath) {
    return null;
  }
  const resolvedPeerAuditReportPath = path.resolve(selectedPath);
  try {
    const info = await lstat(resolvedPeerAuditReportPath);
    if (info.isSymbolicLink()) {
      throw new Error(
        `${resolvedPeerAuditReportPath} must not be a symbolic link`,
      );
    }
    if (!info.isFile()) {
      throw new Error(`${resolvedPeerAuditReportPath} must be a regular file`);
    }
    if (info.size > SCCP_BSC_PEER_AUDIT_REPORT_MAX_BYTES) {
      throw new Error(
        `${resolvedPeerAuditReportPath} is ${info.size} bytes; maximum allowed is ${SCCP_BSC_PEER_AUDIT_REPORT_MAX_BYTES} bytes`,
      );
    }
    const parsedPeerAuditReport = parseJsonWithoutDuplicateKeys(
      await readFile(resolvedPeerAuditReportPath, "utf8"),
      `peer audit report ${resolvedPeerAuditReportPath}`,
    );
    if (!isRecord(parsedPeerAuditReport)) {
      throw new Error(`${resolvedPeerAuditReportPath} must be a JSON object`);
    }
    return parsedPeerAuditReport;
  } catch (error) {
    if (
      !required &&
      typeof error === "object" &&
      error !== null &&
      Object.prototype.hasOwnProperty.call(error, "code") &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    return peerAuditReportLoadFailure(error);
  }
};

export const runBscSccpLiveSmokeReadiness = async (input = {}) => {
  const toriiUrl =
    readOwnValue(input, "toriiUrl") ?? DEFAULT_BSC_TAIRA_TORII_URL;
  const manifestFile = readOwnValue(input, "manifestFile");
  const bscNetwork =
    readOwnValue(input, "bscNetwork") ??
    process.env.SCCP_BSC_NETWORK ??
    process.env.VITE_SCCP_BSC_NETWORK ??
    "testnet";
  const peerAuditReportPath =
    readOwnValue(input, "peerAuditReportPath") ??
    process.env.SCCP_BSC_PEER_AUDIT_REPORT;
  const walletConnectProjectId =
    readOwnValue(input, "walletConnectProjectId") ??
    process.env[WALLETCONNECT_PROJECT_ID_ENV];
  const destinationProverModuleUrl =
    readOwnValue(input, "destinationProverModuleUrl") ?? "";
  const sourceProverModuleUrl =
    readOwnValue(input, "sourceProverModuleUrl") ?? "";
  const destinationProverManifestUrl =
    readOwnValue(input, "destinationProverManifestUrl") ?? "";
  const sourceProverManifestUrl =
    readOwnValue(input, "sourceProverManifestUrl") ?? "";
  const runtimeProverConfigUrl =
    readOwnValue(input, "runtimeProverConfigUrl") ?? "";
  const checkBscContracts = readOwnValue(input, "checkBscContracts") ?? true;
  const bscRpcUrl =
    readOwnValue(input, "bscRpcUrl") ??
    process.env.SCCP_BSC_RPC_URL ??
    process.env.BSC_RPC_URL ??
    "";
  const allowLocalRpc = readOwnValue(input, "allowLocalRpc") ?? false;
  const checkModuleAvailability =
    readOwnValue(input, "checkModuleAvailability") ?? true;
  const checkProverManifests =
    readOwnValue(input, "checkProverManifests") ?? true;
  const checkRuntimeProverConfig =
    readOwnValue(input, "checkRuntimeProverConfig") ?? true;
  const peerAuditDefaultReportPath = readOwnValue(
    input,
    "peerAuditDefaultReportPath",
  );
  const fetchImpl = readOwnValue(input, "fetchImpl") ?? globalThis.fetch;
  const timeoutMs = readOwnValue(input, "timeoutMs") ?? 10_000;
  const checkedAt = readOwnValue(input, "checkedAt");
  const bscProfile = resolveBscNetworkProfile(bscNetwork);
  const activeDestinationProverModuleUrl =
    trimString(destinationProverModuleUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
      SCCP_BSC_PROVER_MODULE_URL_ENV,
    );
  const activeSourceProverModuleUrl =
    trimString(sourceProverModuleUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
      SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
      SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
    );
  const activeDestinationProverManifestUrl =
    trimString(destinationProverManifestUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_PROVER_MANIFEST_URL_ENV,
    );
  const activeSourceProverManifestUrl =
    trimString(sourceProverManifestUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV,
      SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
    );
  const activeRuntimeProverConfigUrl =
    trimString(runtimeProverConfigUrl) ||
    readBscProfileEnv(
      bscProfile,
      SCCP_BSC_TESTNET_PROVER_CONFIG_URL_ENV,
      SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
      SCCP_BSC_PROVER_CONFIG_URL_ENV,
    );
  const routeReport = await runBscSccpRoutePreflight({
    toriiUrl,
    manifestFile,
    bscNetwork: bscProfile.key,
    fetchImpl,
    timeoutMs,
    checkBscContracts,
    bscRpcUrl: bscRpcUrl || bscProfile.rpcUrl,
    allowLocalRpc,
  });
  const normalizedDestinationProverModuleUrl = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        activeDestinationProverModuleUrl,
        "TAIRA -> BSC prover module URL",
      ),
    "Unable to validate TAIRA -> BSC prover module URL.",
  ).value;
  const normalizedSourceProverModuleUrl = safeNormalize(
    () =>
      normalizeSccpBrowserModuleUrl(
        activeSourceProverModuleUrl,
        "BSC -> TAIRA source prover module URL",
      ),
    "Unable to validate BSC -> TAIRA source prover module URL.",
  ).value;
  const resolvedDestinationProverManifestUrl =
    activeDestinationProverManifestUrl ||
    (normalizedDestinationProverModuleUrl
      ? `${normalizedDestinationProverModuleUrl}.manifest.json`
      : undefined);
  const resolvedSourceProverManifestUrl =
    activeSourceProverManifestUrl ||
    (normalizedSourceProverModuleUrl
      ? `${normalizedSourceProverModuleUrl}.manifest.json`
      : undefined);
  const resolvedRuntimeProverConfigUrl =
    activeRuntimeProverConfigUrl ||
    deriveBscRuntimeProverConfigUrl(
      normalizedDestinationProverModuleUrl,
      normalizedSourceProverModuleUrl,
    ) ||
    undefined;
  const [destinationProverManifestInspection, sourceProverManifestInspection] =
    checkProverManifests
      ? await Promise.all([
          inspectBscSccpBrowserProverManifest({
            manifestUrl: resolvedDestinationProverManifestUrl,
            moduleUrl: activeDestinationProverModuleUrl,
            label: "TAIRA -> BSC prover",
            expectedDirection: "destination",
            routeReport,
            bscNetwork: bscProfile.key,
            repoRoot,
            fetchImpl,
            timeoutMs,
          }),
          inspectBscSccpBrowserProverManifest({
            manifestUrl: resolvedSourceProverManifestUrl,
            moduleUrl: activeSourceProverModuleUrl,
            label: "BSC -> TAIRA source prover",
            expectedDirection: "source",
            routeReport,
            bscNetwork: bscProfile.key,
            repoRoot,
            fetchImpl,
            timeoutMs,
          }),
        ])
      : [null, null];
  const runtimeProverConfigInspection =
    checkRuntimeProverConfig && resolvedRuntimeProverConfigUrl
      ? await inspectBscSccpRuntimeProverConfig({
          configUrl: resolvedRuntimeProverConfigUrl,
          routeReport,
          bscNetwork: bscProfile.key,
          repoRoot,
          fetchImpl,
          timeoutMs,
        })
      : null;
  const [destinationProverModuleAvailability, sourceProverModuleAvailability] =
    checkModuleAvailability
      ? await Promise.all([
          inspectSccpBrowserModuleAvailability({
            moduleUrl: activeDestinationProverModuleUrl,
            label: "TAIRA -> BSC prover module URL",
            repoRoot,
            fetchImpl,
            timeoutMs,
            expectedSha256: destinationProverManifestInspection?.moduleSha256,
            expectedExports: [
              destinationProverManifestInspection?.manifest?.acceptedExport,
            ].filter(Boolean),
            expectedSelfTestExports: [
              destinationProverManifestInspection?.manifest
                ?.acceptedSelfTestExport,
            ].filter(Boolean),
          }),
          inspectSccpBrowserModuleAvailability({
            moduleUrl: activeSourceProverModuleUrl,
            label: "BSC -> TAIRA source prover module URL",
            repoRoot,
            fetchImpl,
            timeoutMs,
            expectedSha256: sourceProverManifestInspection?.moduleSha256,
            expectedExports: [
              sourceProverManifestInspection?.manifest?.acceptedExport,
            ].filter(Boolean),
            expectedSelfTestExports: [
              sourceProverManifestInspection?.manifest?.acceptedSelfTestExport,
            ].filter(Boolean),
          }),
        ])
      : [null, null];
  const explicitPeerAuditReportPath = trimString(peerAuditReportPath);
  const peerAuditReport =
    (await loadBscPeerAuditReport(explicitPeerAuditReportPath, {
      required: Boolean(explicitPeerAuditReportPath),
    })) ??
    (await loadBscPeerAuditReport(
      trimString(peerAuditDefaultReportPath) ||
        bscSccpPeerConfigAuditReportPath(bscProfile.key),
      { required: false },
    ));
  return evaluateBscSccpLiveSmokeReadiness({
    routeReport,
    bscNetwork: bscProfile.key,
    peerAuditReport,
    walletConnectProjectId,
    destinationProverModuleUrl: activeDestinationProverModuleUrl,
    sourceProverModuleUrl: activeSourceProverModuleUrl,
    destinationProverManifestUrl: resolvedDestinationProverManifestUrl,
    sourceProverManifestUrl: resolvedSourceProverManifestUrl,
    runtimeProverConfigUrl: resolvedRuntimeProverConfigUrl,
    destinationProverModuleAvailability,
    sourceProverModuleAvailability,
    destinationProverManifestInspection,
    sourceProverManifestInspection,
    runtimeProverConfigInspection,
    checkedAt,
  });
};

const BSC_LIVE_SMOKE_READINESS_CLI_OPTIONS = new Set([
  "torii-url",
  "manifest-file",
  "bsc-network",
  "peer-audit-report",
  "walletconnect-project-id",
  "destination-prover-module-url",
  "destination-prover-manifest-url",
  "source-prover-module-url",
  "source-prover-manifest-url",
  "runtime-prover-config-url",
  "prover-config-url",
  "check-bsc-contracts",
  "bsc-rpc-url",
  "allow-local-rpc",
  "check-module-availability",
  "check-prover-manifests",
  "check-runtime-prover-config",
  "timeout-ms",
  "allow-not-ready",
  "output-dir",
]);

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    if (!BSC_LIVE_SMOKE_READINESS_CLI_OPTIONS.has(key)) {
      throw new Error(
        `Unknown option: --${key}. Use --help to list supported BSC live smoke-readiness options.`,
      );
    }
    if (args[key] !== undefined) {
      throw new Error(
        `Duplicate option: --${key}. Repeatable options are documented in --help.`,
      );
    }
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

const hasHelpFlag = (argv) => argv.includes("--help") || argv.includes("-h");

const assertNoCliAliasConflicts = (args, label, keys) => {
  const present = keys.filter((key) => args[key] !== undefined);
  if (present.length > 1) {
    throw new Error(
      `Conflicting option aliases for ${label}: ${present
        .map((key) => `--${key}`)
        .join(", ")}.`,
    );
  }
};

const printUsage = () => {
  process.stdout.write(
    `Usage: node scripts/e2e/sccp-bsc-live-smoke-readiness.mjs [options]

Read-only app-side readiness gate for BSC SCCP live smoke.

Options:
  --torii-url URL
  --manifest-file PATH
  --bsc-network testnet|mainnet
  --peer-audit-report PATH
  --walletconnect-project-id ID
  --destination-prover-module-url URL
  --destination-prover-manifest-url URL
  --source-prover-module-url URL
  --source-prover-manifest-url URL
  --runtime-prover-config-url URL
  --prover-config-url URL
  --check-bsc-contracts true|false
  --bsc-rpc-url URL
  --allow-local-rpc
  --check-module-availability true|false
  --check-prover-manifests true|false
  --check-runtime-prover-config true|false
  --timeout-ms MS
  --allow-not-ready
  --output-dir DIR
  --help, -h

Environment:
  SCCP_BSC_NETWORK
  VITE_SCCP_BSC_NETWORK
  SCCP_TAIRA_TORII_URL
  TAIRA_TORII_URL
  E2E_TORII_URL
  SCCP_BSC_ROUTE_MANIFEST_FILE
  SCCP_ROUTE_MANIFEST_FILE
  SCCP_BSC_PEER_AUDIT_REPORT
  SCCP_BSC_RPC_URL
  BSC_RPC_URL
  SCCP_BSC_SMOKE_READINESS_OUTPUT_DIR
  VITE_WALLETCONNECT_PROJECT_ID
  VITE_SCCP_BSC_PROVER_MODULE_URL
  VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_PROVER_CONFIG_URL
  VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL
  VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_TESTNET_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_TESTNET_PROVER_CONFIG_URL
  VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL
  VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL
  VITE_SCCP_BSC_MAINNET_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL
  VITE_SCCP_BSC_MAINNET_PROVER_CONFIG_URL
`,
  );
};

const cli = async () => {
  if (hasHelpFlag(process.argv.slice(2))) {
    printUsage();
    return;
  }
  const args = parseArgs(process.argv.slice(2));
  assertNoCliAliasConflicts(args, "BSC runtime prover config URL", [
    "runtime-prover-config-url",
    "prover-config-url",
  ]);
  const timeoutMs = Number(args["timeout-ms"] ?? 10_000);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms must be a positive integer.");
  }
  const allowNotReady = parseBoolean(
    args["allow-not-ready"],
    "--allow-not-ready",
  );
  const bscNetwork =
    args["bsc-network"] ||
    process.env.SCCP_BSC_NETWORK ||
    process.env.VITE_SCCP_BSC_NETWORK ||
    "testnet";
  const report = await runBscSccpLiveSmokeReadiness({
    toriiUrl:
      args["torii-url"] ||
      process.env.SCCP_TAIRA_TORII_URL ||
      process.env.TAIRA_TORII_URL ||
      process.env.E2E_TORII_URL ||
      DEFAULT_BSC_TAIRA_TORII_URL,
    manifestFile:
      args["manifest-file"] ||
      process.env.SCCP_BSC_ROUTE_MANIFEST_FILE ||
      process.env.SCCP_ROUTE_MANIFEST_FILE ||
      undefined,
    bscNetwork,
    peerAuditReportPath:
      args["peer-audit-report"] ||
      process.env.SCCP_BSC_PEER_AUDIT_REPORT ||
      undefined,
    walletConnectProjectId:
      args["walletconnect-project-id"] ||
      process.env[WALLETCONNECT_PROJECT_ID_ENV],
    destinationProverModuleUrl: args["destination-prover-module-url"] || "",
    sourceProverModuleUrl: args["source-prover-module-url"] || "",
    destinationProverManifestUrl: args["destination-prover-manifest-url"] || "",
    sourceProverManifestUrl: args["source-prover-manifest-url"] || "",
    runtimeProverConfigUrl:
      args["runtime-prover-config-url"] || args["prover-config-url"] || "",
    checkBscContracts:
      args["check-bsc-contracts"] === undefined
        ? true
        : parseBoolean(args["check-bsc-contracts"], "--check-bsc-contracts"),
    bscRpcUrl:
      args["bsc-rpc-url"] ||
      process.env.SCCP_BSC_RPC_URL ||
      process.env.BSC_RPC_URL ||
      "",
    allowLocalRpc: parseBoolean(args["allow-local-rpc"], "--allow-local-rpc"),
    checkModuleAvailability:
      args["check-module-availability"] === undefined
        ? true
        : parseBoolean(
            args["check-module-availability"],
            "--check-module-availability",
          ),
    checkProverManifests:
      args["check-prover-manifests"] === undefined
        ? true
        : parseBoolean(
            args["check-prover-manifests"],
            "--check-prover-manifests",
          ),
    checkRuntimeProverConfig:
      args["check-runtime-prover-config"] === undefined
        ? true
        : parseBoolean(
            args["check-runtime-prover-config"],
            "--check-runtime-prover-config",
          ),
    timeoutMs,
  });
  const reportPath = await writeBscSccpLiveSmokeReadinessReport(report, {
    outputDir:
      args["output-dir"] || process.env.SCCP_BSC_SMOKE_READINESS_OUTPUT_DIR,
    bscNetwork,
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`\nBSC SCCP smoke-readiness report: ${reportPath}\n`);
  if (!report.ready && !allowNotReady) {
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
