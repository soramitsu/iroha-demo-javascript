import { existsSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  materializeRequiredPackagedIrohaJsNativeSnapshot,
  releaseMaterializedPackagedIrohaJsNativeSnapshot,
} from "./irohaJsNativeProvenance";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const ACTIVE_SDK_NATIVE_PATH_SEGMENTS = [
  "node_modules",
  ".cache",
  "iroha-sdk-compat",
  "active",
  "native",
] as const;
const REQUIRED_NATIVE_EXPORTS = [
  "accountAddressParseEncoded",
  "accountAddressRender",
  "deriveConfidentialReceiveAddressV2",
  "buildIvmProvedTransactionPayload",
  "signQuotedIvmProvedTransactionPayload",
  "buildTransactionPayload",
  "signQuotedTransactionPayload",
  "encodeSignedTransactionVersioned",
  "hashSignedTransaction",
  "decodeTransactionReceiptJson",
  "noritoDecodeInstruction",
  "noritoDecodeInstructionBoxArchive",
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
  "validationFeePolicyProposalFingerprintV1",
  "validationFeePayoutLifecycleProposalFingerprintV1",
  "connectNoritoBridgeAbiVersion",
  "securePrivateFileAbiVersion",
  "securePrivateDirectoryEnsure",
  "securePrivateFileRead",
  "securePrivateFileWriteAtomic",
] as const;
const REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION = 29;
export const REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION = 1;
const REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR =
  "sorauﾛ1Pｽp8zXFQﾗｷPsFﾒｶﾑ3ｵmﾉbｼｽUｱｶヱﾚBXヱﾊCﾋﾘﾈvuKFKM346";
const REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR =
  "sorauﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";
// Exact native structural fixtures from the reviewed SDK
// (`javascript/iroha_js/test/fixtures/retail_fee_native_policy_v1.json` and
// `retail_fee_native_conversion_v1.json`), which are the Rust
// `crates/iroha_js_host/src/validation_fee_tests.rs` fixtures.
const REQUIRED_VALIDATION_FEE_POLICY_JSON = JSON.stringify({
  schema_version: 1,
  network_id:
    "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1",
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: "7FF2EKZbaWzi5QTD6hewE2voveah",
  ds_scale: 2,
  retail_schedule: {
    included_payments: 50,
    overage_minor: 10,
    maintenance_tiers: [
      { minimum_average_balance_minor: 0, monthly_fee_minor: 100 },
      { minimum_average_balance_minor: 50000, monthly_fee_minor: 200 },
      { minimum_average_balance_minor: 250000, monthly_fee_minor: 300 },
      { minimum_average_balance_minor: 1000000, monthly_fee_minor: 500 },
      { minimum_average_balance_minor: 5000000, monthly_fee_minor: 1000 },
    ],
  },
  effective_from_ms: 1793451600000,
  notice_published_at_ms: 1790859600000,
  fee: "0.1",
  treasury_account_id: "sorauﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK",
  charging_mode: {
    charging_mode: "RETAIL_MONTHLY_ALLOWANCE",
    value: null,
  },
  exemption_classes: ["TREASURY_PAYOUT"],
  reward_custody: {
    contract_address:
      "irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw",
    treasury_account_id: "sorauﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK",
    ds_asset_id: "7FF2EKZbaWzi5QTD6hewE2voveah",
    xor_asset_id: "5dHF5UNffENuEg9mhjYwY1jcZ1K5",
    reward_pool_account_id:
      "sorauﾛ1Q2ﾜﾓ4bｳEDHﾏﾇｿSyFﾘk6bX74ﾙｦRﾙﾄM2GｻSｳｴpPヰｱ6HEY4T",
    validator_lane_id: 0,
  },
});
const REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON = JSON.stringify({
  contract_address:
    "irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw",
  code_hash: "34".repeat(32),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "sorauﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK",
  ds_asset_id: "7FF2EKZbaWzi5QTD6hewE2voveah",
  xor_asset_id: "5dHF5UNffENuEg9mhjYwY1jcZ1K5",
  pool_contract_address:
    "irohac1qyqqqqqqqqqqqqqlzk3skqs8v0haerev9p09yp3ml26zrnctdwz5u",
  pool_code_hash: "36".repeat(32),
  pool_vault_account_id:
    "sorauﾛ1NﾔBnヱ5ﾈﾘｦﾇｦTｻﾂVUﾓヱｺYﾏ3bｲ1ｻaﾌTtﾎﾉtｹZｱﾜo4VHCA4Q",
  reward_pool_account_id:
    "sorauﾛ1Q2ﾜﾓ4bｳEDHﾏﾇｿSyFﾘk6bX74ﾙｦRﾙﾄM2GｻSｳｴpPヰｱ6HEY4T",
  reference_feed_id: ["xor_per_sbd"],
  reference_feed_config_version: 1,
  reference_provider_accounts: [
    "sorauﾛ1NﾛfﾋﾅｴﾋｦpF6ﾃnｹ12YﾎﾓhEnﾉﾊzﾇDna3ﾘﾌﾓvyyfzﾈJNNQCB",
    "sorauﾛ1PｹｵvｴｦsBBSi4ｴV8hKﾂﾐssqｦｸ5HsﾈetyﾑGｻﾐ894zJG3P54",
    "sorauﾛ1NｷwkVｵﾄｼｻAm42LAﾎ6ﾘGpﾋヱ5ﾏｵﾁﾘﾓmKTヰﾃヰcｽFZcB7JLP1",
    "sorauﾛ1NﾖWﾚﾉﾋﾐﾂﾉﾉoPMRgｷ5s1ﾀfｲs8ﾀPrｽDｱ7nﾑJヱﾌﾍCLK95DJD",
    "sorauﾛ1NﾒEﾜM3ﾏHkhDﾎヰﾀsY4sｼCｹﾌ6ｼvNSﾖｽﾁｼ22ｦSヰyﾐﾜPQR463",
  ],
  max_sbd_per_attempt_minor: 1000,
  max_sbd_per_day_minor: 100000,
  min_interval_ms: 60000,
  max_source_age_ms: 300000,
  max_slippage_bps: 100,
  validator_lane_id: 0,
  min_reward_claim_xor_minor: 1,
});
// Expected native outputs for the fixtures above at the reviewed SDK commit.
// The Rust tests (`crates/iroha_js_host/src/validation_fee_tests.rs`) pin no
// hex literals: they assert that the first-operator policy and payout outputs
// equal `ProposalKind::fingerprint()` and that the second-operator policy
// output differs; no Rust test covers the second-operator payout value. All
// four values were cross-checked during review by recomputing Blake2b-256 over
// the governance-fingerprint domain and Norito proposal bytes assembled in
// JavaScript from the Rust layouts, without the native encoder.
const REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX =
  "7ea3f657b77099f869d1aae9a47845d66094154e26e664c971434722cb0b31c4";
const REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_POLICY_FINGERPRINT_HEX =
  "e6fae2d16761eb221142b5e236ad09d31e1bdd1c4245538f08a932fb8136f7f1";
const REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX =
  "8e28c5de8ce8928696065b15e09073b9bbebbaa30e690d4c6bd2ca75b9a3c1b4";
const REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_PAYOUT_FINGERPRINT_HEX =
  "8ff01a1ac68e79c64901830452ba2ff4185cf4a41b140704b8101e1b747d2bcd";

const trimString = (value: unknown): string => String(value ?? "").trim();
const hasOwn = (value: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

type NativeModuleLike = Record<string, unknown>;
type FileExists = (path: string) => boolean;
type LoadNativeModule = (
  moduleUrl: string,
  nativeModulePath: string,
) => unknown;
type MaterializePackagedNativeSnapshot = (nativeDir: string) => string | null;
type NativeGlobalTarget = object;

interface NativeCandidate {
  nativeDir: string;
  packaged: boolean;
}

const provenanceVerifiedPackagedNativeBindings = new WeakSet<object>();
const installedIrohaJsNativeBindings = new WeakSet<object>();
const IROHA_NATIVE_GLOBAL_SLOTS = [
  "__IROHA_NATIVE_BINDING__",
  "__IROHA_NORITO_BINDING__",
] as const;

type IrohaNativeGlobalSlot = (typeof IROHA_NATIVE_GLOBAL_SLOTS)[number];

const ownDataDescriptor = (
  target: NativeGlobalTarget,
  slot: IrohaNativeGlobalSlot,
): PropertyDescriptor | undefined => {
  const descriptor = Object.getOwnPropertyDescriptor(target, slot);
  if (descriptor !== undefined && !("value" in descriptor)) {
    throw new Error(
      "A native binding global slot must be an own data property without accessors.",
    );
  }
  return descriptor;
};

const readConsistentInstalledBinding = (
  target: NativeGlobalTarget,
): NativeModuleLike | null => {
  const values = IROHA_NATIVE_GLOBAL_SLOTS.map((slot) => {
    const descriptor = ownDataDescriptor(target, slot);
    return descriptor !== undefined && "value" in descriptor
      ? descriptor.value
      : undefined;
  }).filter((value) => value !== undefined);
  if (
    values.length === 0 ||
    values.some((value) => value !== values[0]) ||
    typeof values[0] !== "object" ||
    values[0] === null ||
    !installedIrohaJsNativeBindings.has(values[0])
  ) {
    return null;
  }
  return values[0] as NativeModuleLike;
};

export const getInstalledIrohaJsNativeBinding = (
  globalTarget: NativeGlobalTarget = globalThis,
): NativeModuleLike | null => readConsistentInstalledBinding(globalTarget);

const isPackagedElectronModuleUrl = (moduleUrl: string): boolean =>
  /(?:^|[\\/])[^\\/]+\.asar(?:[\\/]|$)/u.test(fileURLToPath(moduleUrl));

const defaultLoadNativeModule: LoadNativeModule = (
  moduleUrl,
  nativeModulePath,
) => {
  const require = createRequire(moduleUrl);
  return require(nativeModulePath);
};

const isExactFingerprint = (value: unknown, expectedHex: string): boolean =>
  Buffer.isBuffer(value) &&
  value.length === 32 &&
  value.equals(Buffer.from(expectedHex, "hex"));

/**
 * Require the exact first-operator vector twice (determinism) and the exact,
 * different second-operator vector (operator binding). The native helpers
 * take exactly `(proposalOperator, json)`.
 */
const matchesOperatorBoundKnownAnswers = (
  computeFingerprint: (proposalOperator: string, json: string) => unknown,
  json: string,
  expectedHex: string,
  expectedSecondOperatorHex: string,
): boolean => {
  const first = computeFingerprint(
    REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
    json,
  );
  const repeated = computeFingerprint(
    REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
    json,
  );
  const secondOperator = computeFingerprint(
    REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
    json,
  );
  return (
    expectedHex !== expectedSecondOperatorHex &&
    isExactFingerprint(first, expectedHex) &&
    isExactFingerprint(repeated, expectedHex) &&
    isExactFingerprint(secondOperator, expectedSecondOperatorHex)
  );
};

const rejectsEmptyProposal = (
  computeFingerprint: (proposalOperator: string, json: string) => unknown,
  expectedMessage: string,
): boolean => {
  try {
    computeFingerprint(REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR, "{}");
    return false;
  } catch (error) {
    return String(error).includes(expectedMessage);
  }
};

export const hasRequiredIrohaJsNativeExports = (
  nativeModule: unknown,
): nativeModule is NativeModuleLike => {
  if (typeof nativeModule !== "object" || nativeModule === null) {
    return false;
  }
  const typedNativeModule = nativeModule as NativeModuleLike;
  if (
    !REQUIRED_NATIVE_EXPORTS.every(
      (exportName) =>
        hasOwn(typedNativeModule, exportName) &&
        typeof typedNativeModule[exportName] === "function",
    )
  ) {
    return false;
  }
  try {
    const bridgeAbiVersion = (
      typedNativeModule.connectNoritoBridgeAbiVersion as () => unknown
    )();
    if (bridgeAbiVersion !== REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION) {
      return false;
    }
    const securePrivateFileAbiVersion = (
      typedNativeModule.securePrivateFileAbiVersion as () => unknown
    )();
    if (
      securePrivateFileAbiVersion !== REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION
    ) {
      return false;
    }
    const computePolicyFingerprint =
      typedNativeModule.validationFeePolicyProposalFingerprintV1 as (
        proposalOperator: string,
        policyJson: string,
      ) => unknown;
    const computePayoutFingerprint =
      typedNativeModule.validationFeePayoutLifecycleProposalFingerprintV1 as (
        proposalOperator: string,
        payoutBindingJson: string,
      ) => unknown;
    if (
      !matchesOperatorBoundKnownAnswers(
        computePolicyFingerprint,
        REQUIRED_VALIDATION_FEE_POLICY_JSON,
        REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX,
        REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_POLICY_FINGERPRINT_HEX,
      ) ||
      !matchesOperatorBoundKnownAnswers(
        computePayoutFingerprint,
        REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
        REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX,
        REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_PAYOUT_FINGERPRINT_HEX,
      )
    ) {
      return false;
    }
    return (
      rejectsEmptyProposal(
        computePolicyFingerprint,
        "validation-fee policy must contain exactly",
      ) &&
      rejectsEmptyProposal(
        computePayoutFingerprint,
        "payout binding must contain exactly",
      )
    );
  } catch {
    return false;
  }
};

const resolveNativeCandidates = (moduleUrl: string): NativeCandidate[] => {
  const baseDir = dirname(fileURLToPath(moduleUrl));
  const packagedRuntime = isPackagedElectronModuleUrl(moduleUrl);
  if (packagedRuntime) {
    return [
      {
        nativeDir: resolve(baseDir, "..", "native"),
        packaged: true,
      },
    ];
  }
  const projectRootCandidates = [
    resolve(baseDir, ".."),
    resolve(baseDir, "..", ".."),
  ];
  return [...new Set(projectRootCandidates)].map((projectRoot) => ({
    nativeDir: resolve(projectRoot, ...ACTIVE_SDK_NATIVE_PATH_SEGMENTS),
    packaged: false,
  }));
};

const samePhysicalNativeDirectory = (
  configured: string,
  selected: string,
): boolean => {
  if (!isAbsolute(configured) || resolve(configured) !== configured) {
    return false;
  }
  if (configured === selected) return true;
  try {
    return realpathSync.native(configured) === realpathSync.native(selected);
  } catch {
    return false;
  }
};

const isCompatibleNativeDir = (
  moduleUrl: string,
  nativeDir: string,
  fileExists: FileExists,
  loadNativeModule: LoadNativeModule,
): boolean => {
  const nativeModulePath = join(nativeDir, NATIVE_MODULE_FILENAME);
  if (!fileExists(nativeModulePath)) {
    return false;
  }
  try {
    return hasRequiredIrohaJsNativeExports(
      loadNativeModule(moduleUrl, nativeModulePath),
    );
  } catch {
    return false;
  }
};

export const resolveIrohaJsNativeDir = (
  moduleUrl: string,
  fileExists: FileExists = existsSync,
  loadNativeModule: LoadNativeModule = defaultLoadNativeModule,
  materializePackagedNativeSnapshot: MaterializePackagedNativeSnapshot = materializeRequiredPackagedIrohaJsNativeSnapshot,
): string | null => {
  const candidates = resolveNativeCandidates(moduleUrl);

  for (const candidate of candidates) {
    const nativeModulePath = join(candidate.nativeDir, NATIVE_MODULE_FILENAME);
    if (!fileExists(nativeModulePath)) {
      continue;
    }
    let loadNativeDir = candidate.nativeDir;
    if (candidate.packaged) {
      const snapshotDir = materializePackagedNativeSnapshot(
        candidate.nativeDir,
      );
      if (snapshotDir === null) continue;
      loadNativeDir = snapshotDir;
    }
    const compatible = isCompatibleNativeDir(
      moduleUrl,
      loadNativeDir,
      fileExists,
      loadNativeModule,
    );
    if (compatible) {
      return loadNativeDir;
    }
    releaseMaterializedPackagedIrohaJsNativeSnapshot(loadNativeDir);
  }

  return null;
};

export const configureIrohaJsNativeDir = (
  moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  fileExists: (path: string) => boolean = existsSync,
  loadNativeModule: LoadNativeModule = defaultLoadNativeModule,
  materializePackagedNativeSnapshot: MaterializePackagedNativeSnapshot = materializeRequiredPackagedIrohaJsNativeSnapshot,
): string | null => {
  const packagedRuntime = isPackagedElectronModuleUrl(moduleUrl);
  const existing = trimString(env.IROHA_JS_NATIVE_DIR);
  if (existing) {
    if (packagedRuntime) {
      throw new Error(
        "IROHA_JS_NATIVE_DIR cannot override the provenance-bound native binding in a packaged Electron application.",
      );
    }
    const selected = resolveIrohaJsNativeDir(
      moduleUrl,
      fileExists,
      loadNativeModule,
      materializePackagedNativeSnapshot,
    );
    if (selected === null || !samePhysicalNativeDirectory(existing, selected)) {
      throw new Error(
        "IROHA_JS_NATIVE_DIR must identify the native directory from the active SDK selected by iroha-sdk-compat.",
      );
    }
    return selected;
  }
  const resolved = resolveIrohaJsNativeDir(
    moduleUrl,
    fileExists,
    loadNativeModule,
    materializePackagedNativeSnapshot,
  );
  if (resolved && !packagedRuntime) {
    env.IROHA_JS_NATIVE_DIR = resolved;
  }
  return resolved;
};

export const loadIrohaJsNativeBinding = (
  moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  loadNativeModule: LoadNativeModule = defaultLoadNativeModule,
  fileExists: FileExists = existsSync,
  materializePackagedNativeSnapshot: MaterializePackagedNativeSnapshot = materializeRequiredPackagedIrohaJsNativeSnapshot,
): NativeModuleLike => {
  const nativeDir =
    configureIrohaJsNativeDir(
      moduleUrl,
      env,
      fileExists,
      loadNativeModule,
      materializePackagedNativeSnapshot,
    ) ??
    resolveIrohaJsNativeDir(
      moduleUrl,
      fileExists,
      loadNativeModule,
      materializePackagedNativeSnapshot,
    );
  if (!nativeDir) {
    throw new Error(
      "The @iroha/iroha-js native binding is required. Run node scripts/build-iroha-native.mjs --sdk-root <selected SDK root> from the wallet checkout (the SDK root is $IROHA_JS_SDK_ROOT, or ../iroha/javascript/iroha_js when unset).",
    );
  }

  try {
    const nativeModule = loadNativeModule(
      moduleUrl,
      join(nativeDir, NATIVE_MODULE_FILENAME),
    );
    if (!hasRequiredIrohaJsNativeExports(nativeModule)) {
      throw new Error(
        "The @iroha/iroha-js native binding is stale or incomplete; rebuild it with node scripts/build-iroha-native.mjs --sdk-root <selected SDK root> (the SDK root is $IROHA_JS_SDK_ROOT, or ../iroha/javascript/iroha_js when unset) before signing transactions.",
      );
    }
    return nativeModule;
  } finally {
    releaseMaterializedPackagedIrohaJsNativeSnapshot(nativeDir);
  }
};

export const installGlobalIrohaJsNativeBinding = (
  moduleUrl: string,
  env: NodeJS.ProcessEnv = process.env,
  loadNativeModule: LoadNativeModule = defaultLoadNativeModule,
  fileExists: FileExists = existsSync,
  materializePackagedNativeSnapshot: MaterializePackagedNativeSnapshot = materializeRequiredPackagedIrohaJsNativeSnapshot,
  globalTarget: NativeGlobalTarget = globalThis,
): NativeModuleLike => {
  const packagedRuntime = isPackagedElectronModuleUrl(moduleUrl);
  const descriptors = IROHA_NATIVE_GLOBAL_SLOTS.map((slot) => ({
    slot,
    descriptor: ownDataDescriptor(globalTarget, slot),
  }));
  const prePopulatedBindings = descriptors
    .map(({ descriptor }) =>
      descriptor !== undefined && "value" in descriptor
        ? descriptor.value
        : undefined,
    )
    .filter((value) => value !== undefined);

  if (
    prePopulatedBindings.length > 1 &&
    prePopulatedBindings.some((value) => value !== prePopulatedBindings[0])
  ) {
    throw new Error(
      "The Iroha native and Norito global binding slots must reference the same module.",
    );
  }
  if (packagedRuntime) {
    for (const { descriptor } of descriptors) {
      if (
        descriptor !== undefined &&
        descriptor.value === undefined &&
        descriptor.configurable === false
      ) {
        throw new Error(
          "A packaged Electron application cannot seal a pre-populated native binding slot.",
        );
      }
    }
    for (const prePopulatedBinding of prePopulatedBindings) {
      if (
        typeof prePopulatedBinding !== "object" ||
        prePopulatedBinding === null ||
        !provenanceVerifiedPackagedNativeBindings.has(prePopulatedBinding)
      ) {
        throw new Error(
          "A packaged Electron application cannot trust a pre-populated native binding without provenance verification.",
        );
      }
    }
  }

  const defineNativeBindingSlots = (nativeModule: NativeModuleLike): void => {
    for (const slot of IROHA_NATIVE_GLOBAL_SLOTS) {
      const current = Object.getOwnPropertyDescriptor(globalTarget, slot);
      if (
        current !== undefined &&
        "value" in current &&
        current.value === nativeModule &&
        current.configurable === !packagedRuntime &&
        current.writable === !packagedRuntime &&
        current.enumerable === false
      ) {
        continue;
      }
      Object.defineProperty(globalTarget, slot, {
        configurable: !packagedRuntime,
        enumerable: false,
        value: nativeModule,
        writable: !packagedRuntime,
      });
    }
  };

  const existingBinding = readConsistentInstalledBinding(globalTarget);
  if (
    existingBinding !== null &&
    hasRequiredIrohaJsNativeExports(existingBinding)
  ) {
    if (packagedRuntime) Object.freeze(existingBinding);
    defineNativeBindingSlots(existingBinding);
    return existingBinding;
  }
  const nativeModule = loadIrohaJsNativeBinding(
    moduleUrl,
    env,
    loadNativeModule,
    fileExists,
    materializePackagedNativeSnapshot,
  );
  if (packagedRuntime) {
    Object.freeze(nativeModule);
    provenanceVerifiedPackagedNativeBindings.add(nativeModule);
  }
  installedIrohaJsNativeBindings.add(nativeModule);
  defineNativeBindingSlots(nativeModule);
  return nativeModule;
};
