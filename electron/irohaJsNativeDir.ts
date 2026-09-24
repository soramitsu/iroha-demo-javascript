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
  "noritoEncodeInstruction",
  "inspectSubscriptionTriggerAction",
  "validationFeeHijiriQuoteRequestV1",
  "validationFeeVerifyHijiriQuoteResponseV1",
  "validationFeePolicyProposalFingerprintV1",
  "validationFeePayoutLifecycleProposalFingerprintV1",
  "connectNoritoBridgeAbiVersion",
  "securePrivateFileAbiVersion",
  "securePrivateDirectoryEnsure",
  "securePrivateFileRead",
  "securePrivateFileWriteAtomic",
] as const;
const REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION = 23;
export const REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION = 1;
const REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR =
  "sorauﾛ1Pｽp8zXFQﾗｷPsFﾒｶﾑ3ｵmﾉbｼｽUｱｶヱﾚBXヱﾊCﾋﾘﾈvuKFKM346";
const REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR =
  "sorauﾛ1NrﾑﾛﾔﾎRﾓMNｹEﾔﾙﾗdｶrﾎuﾑﾚcﾔKfﾆyﾓｸjVﾌTﾙﾖｾﾋｷGK5P4K";
const REQUIRED_VALIDATION_FEE_POLICY_JSON = JSON.stringify({
  schema_version: 1,
  network_id:
    "hash:1313131313131313131313131313131313131313131313131313131313131313#9CE1",
  policy_version: "1",
  previous_policy_hash: null,
  ds_asset_id: "7FF2EKZbaWzi5QTD6hewE2voveah",
  ds_scale: 2,
  fee: "0.1",
  treasury_account_id: "sorauﾛ1PaQｽGh1ｴ6pAﾜnqｸfJuｿMﾑVqﾏvQﾐﾚｼｾﾋaﾈｳﾊc1ｺﾊ1GGM2D",
  charging_mode: {
    charging_mode: "PER_QUALIFYING_TRANSFER_INSTRUCTION",
    value: null,
  },
  effective_from_height: "121100",
  expires_after_height: null,
  exemption_classes: [],
  treasury_payout_binding: null,
});
const REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON = JSON.stringify({
  contract_address:
    "irohac1qyqqqqqqqqqqqq95fes93ygegsv5enq9mqsz6x4lv4vp9gg4yxgjw",
  code_hash: "34".repeat(32),
  entrypoint: "autonomous_validation_fee_tick",
  treasury_account_id: "sorauﾛ1PZﾗidｱJJHofｸXNｵｿcﾐﾃgﾀﾔzBYﾜcﾈｦfｶxKfﾁｼ1pG871VMK",
  ds_asset_id: "7FF2EKZbaWzi5QTD6hewE2voveah",
  xor_asset_id: "5dHF5UNffENuEg9mhjYwY1jcZ1K5",
  pool_vault_account_id:
    "sorauﾛ1PTYｷEヱｿsYbe7ｾｵﾆﾐﾓﾕiﾋｵYヱfﾍuGFTmｺiSaHxgﾅｼ3BYUD1",
  batch_ds: "10",
  min_xor_out: "4",
  max_xor_out: "100",
  recipients: [
    {
      account_id: "sorauﾛ1Q2ﾜﾓ4bｳEDHﾏﾇｿSyFﾘk6bX74ﾙｦRﾙﾄM2GｻSｳｴpPヰｱ6HEY4T",
      share: "0.25",
    },
    {
      account_id: "sorauﾛ1Pﾑｺg4yﾁJ6ﾙﾀXZﾉSj3iｦﾚSﾖqFﾕdndｴ5ﾈﾓaｾSfﾋ9ｶ1TN5EN",
      share: "0.25",
    },
    {
      account_id: "sorauﾛ1PDeﾔ2ｾaﾐ6ﾑﾘjﾀgﾚﾄﾌ6ｾyｸC7ﾛppｸJﾐJヱLｺoｳﾚi7SR26GU2",
      share: "0.25",
    },
    {
      account_id: "sorauﾛ1PaQxﾄﾇRCﾛPﾑﾅLfｹiﾒｶHMﾖ9iPLw4ﾖPｦXKﾚﾁｦヰCv13TKYJL",
      share: "0.25",
    },
  ],
});
const REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX =
  "4742b1f274928767564c6effa414e640e6f635874d74684b06b95414c5afa16e";
const REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX =
  "8fd84f6599e22db4da15f7152a914dc0091dd73a7906d5981cce37d485191c25";

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
        payoutLifecycleProposalId: null,
      ) => unknown;
    const policyFingerprint = computePolicyFingerprint(
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
    const repeatedPolicyFingerprint = computePolicyFingerprint(
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
    const secondOperatorFingerprint = computePolicyFingerprint(
      REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
    const requiredPolicyFingerprint = Buffer.from(
      REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX,
      "hex",
    );
    if (
      !Buffer.isBuffer(policyFingerprint) ||
      policyFingerprint.length !== 32 ||
      !Buffer.isBuffer(repeatedPolicyFingerprint) ||
      repeatedPolicyFingerprint.length !== 32 ||
      !policyFingerprint.equals(requiredPolicyFingerprint) ||
      !policyFingerprint.equals(repeatedPolicyFingerprint) ||
      !Buffer.isBuffer(secondOperatorFingerprint) ||
      secondOperatorFingerprint.length !== 32 ||
      policyFingerprint.equals(secondOperatorFingerprint)
    ) {
      return false;
    }

    const computePayoutFingerprint =
      typedNativeModule.validationFeePayoutLifecycleProposalFingerprintV1 as (
        proposalOperator: string,
        payoutBindingJson: string,
      ) => unknown;
    const payoutFingerprint = computePayoutFingerprint(
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
    const repeatedPayoutFingerprint = computePayoutFingerprint(
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
    const secondOperatorPayoutFingerprint = computePayoutFingerprint(
      REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
    const requiredPayoutFingerprint = Buffer.from(
      REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX,
      "hex",
    );
    if (
      !Buffer.isBuffer(payoutFingerprint) ||
      payoutFingerprint.length !== 32 ||
      !Buffer.isBuffer(repeatedPayoutFingerprint) ||
      repeatedPayoutFingerprint.length !== 32 ||
      !payoutFingerprint.equals(requiredPayoutFingerprint) ||
      !payoutFingerprint.equals(repeatedPayoutFingerprint) ||
      !Buffer.isBuffer(secondOperatorPayoutFingerprint) ||
      secondOperatorPayoutFingerprint.length !== 32 ||
      payoutFingerprint.equals(secondOperatorPayoutFingerprint)
    ) {
      return false;
    }

    let rejectedInvalidPolicy = false;
    try {
      computePolicyFingerprint(
        REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
        "{}",
        null,
      );
    } catch (error) {
      rejectedInvalidPolicy = String(error).includes(
        "validation-fee policy must contain exactly",
      );
    }
    if (!rejectedInvalidPolicy) return false;

    try {
      computePayoutFingerprint(REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR, "{}");
      return false;
    } catch (error) {
      return String(error).includes("payout binding must contain exactly");
    }
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
      "The @iroha/iroha-js native binding is required. Run node scripts/build-iroha-native.mjs --sdk-root ../iroha/javascript/iroha_js from the wallet checkout.",
    );
  }

  try {
    const nativeModule = loadNativeModule(
      moduleUrl,
      join(nativeDir, NATIVE_MODULE_FILENAME),
    );
    if (!hasRequiredIrohaJsNativeExports(nativeModule)) {
      throw new Error(
        "The @iroha/iroha-js native binding is stale or incomplete; rebuild it with node scripts/build-iroha-native.mjs --sdk-root ../iroha/javascript/iroha_js before signing transactions.",
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
