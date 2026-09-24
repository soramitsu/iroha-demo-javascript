import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const NATIVE_MODULE_FILENAME = "iroha_js_host.node";
const CHECKSUM_FILENAME = "iroha_js_host.checksums.json";
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/u;
const PE_DOS_HEADER_BYTES = 64;
const MAX_CHECKSUM_MANIFEST_BYTES = 1024 * 1024;
const MAX_NATIVE_MODULE_BYTES = 256 * 1024 * 1024;
const REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION = 3;
const REQUIRED_NATIVE_BUILD_EXECUTION_POLICY = "trusted-local-cargo-v1";
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
];
const REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION = 23;
const REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION = 1;
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

const defaultLoadNativeModule = (nativeModulePath) => {
  const require = createRequire(import.meta.url);
  return require(nativeModulePath);
};

const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

const hasExactFields = (value, fields) => {
  if (!isPlainObject(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  return (
    actual.length === expected.length &&
    actual.every((field, index) => field === expected[index])
  );
};

const isBoundedRegularNonSymbolicLink = (path, maximumBytes) => {
  try {
    const stat = lstatSync(path);
    return (
      stat.isFile() &&
      !stat.isSymbolicLink() &&
      Number.isSafeInteger(stat.size) &&
      stat.size > 0 &&
      stat.size <= maximumBytes
    );
  } catch {
    return false;
  }
};

export const resolveNativeProvenanceRequirement = (
  environment = process.env,
) => {
  if (environment.IROHA_JS_NATIVE_BUILD_PROFILE !== "release") {
    return null;
  }
  const sourceGitRevision = environment.IROHA_JS_NATIVE_SOURCE_GIT_REVISION;
  if (
    typeof sourceGitRevision !== "string" ||
    !GIT_REVISION_PATTERN.test(sourceGitRevision)
  ) {
    throw new Error(
      "IROHA_JS_NATIVE_SOURCE_GIT_REVISION must be an explicit 40-character lowercase Git SHA when IROHA_JS_NATIVE_BUILD_PROFILE=release",
    );
  }
  return Object.freeze({
    cargoProfile: "release",
    sourceGitRevision,
    sourceTreeClean: true,
  });
};

const describeReleaseProvenanceFailure = (
  checksumEntry,
  platformKey,
  provenanceRequirement,
) => {
  if (!isPlainObject(checksumEntry)) {
    return `checksum entry for ${platformKey} is not a plain object`;
  }

  const allowedFields = new Set([
    "build_execution_policy",
    "build_provenance_version",
    "cargo_profile",
    "sha256",
    "source_git_revision",
    "source_tree_clean",
    "source_tree_sha256",
  ]);
  if (platformKey.startsWith("darwin-")) {
    allowedFields.add("mach_o_signing_independent_sha256");
  } else if (platformKey.startsWith("win32-")) {
    allowedFields.add("pe_signing_independent_sha256");
    allowedFields.add("pe_unsigned_size");
  }
  const unknownFields = Object.keys(checksumEntry).filter(
    (field) => !allowedFields.has(field),
  );
  if (unknownFields.length > 0) {
    return `unknown checksum manifest fields for ${platformKey}: ${unknownFields.join(", ")}`;
  }

  const requiredProvenanceFields = [
    "build_execution_policy",
    "build_provenance_version",
    "cargo_profile",
    "source_git_revision",
    "source_tree_clean",
    "source_tree_sha256",
  ];
  if (platformKey.startsWith("darwin-")) {
    requiredProvenanceFields.push("mach_o_signing_independent_sha256");
  } else if (platformKey.startsWith("win32-")) {
    requiredProvenanceFields.push(
      "pe_signing_independent_sha256",
      "pe_unsigned_size",
    );
  }
  const missingProvenanceFields = requiredProvenanceFields.filter(
    (field) => !Object.hasOwn(checksumEntry, field),
  );
  if (missingProvenanceFields.length > 0) {
    return `missing native provenance fields for ${platformKey}: ${missingProvenanceFields.join(", ")}`;
  }
  if (
    checksumEntry.cargo_profile !== "debug" &&
    checksumEntry.cargo_profile !== "release" &&
    checksumEntry.cargo_profile !== "deploy"
  ) {
    return `native Cargo profile is malformed for ${platformKey}`;
  }
  if (
    checksumEntry.build_provenance_version !==
    REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION
  ) {
    return `native build provenance version mismatch for ${platformKey}: expected ${REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION}, observed ${String(
      checksumEntry.build_provenance_version,
    )}`;
  }
  if (
    checksumEntry.build_execution_policy !==
    REQUIRED_NATIVE_BUILD_EXECUTION_POLICY
  ) {
    return `native build execution policy mismatch for ${platformKey}: expected ${REQUIRED_NATIVE_BUILD_EXECUTION_POLICY}, observed ${String(
      checksumEntry.build_execution_policy,
    )}`;
  }
  if (
    typeof checksumEntry.source_git_revision !== "string" ||
    !GIT_REVISION_PATTERN.test(checksumEntry.source_git_revision)
  ) {
    return `native source Git revision is malformed for ${platformKey}`;
  }
  if (typeof checksumEntry.source_tree_clean !== "boolean") {
    return `native source tree state is malformed for ${platformKey}`;
  }
  if (
    typeof checksumEntry.source_tree_sha256 !== "string" ||
    !SHA256_PATTERN.test(checksumEntry.source_tree_sha256)
  ) {
    return `native source tree SHA-256 is malformed for ${platformKey}`;
  }
  if (
    typeof checksumEntry.sha256 !== "string" ||
    !SHA256_PATTERN.test(checksumEntry.sha256)
  ) {
    return `native SHA-256 is malformed for ${platformKey}`;
  }

  if (
    Object.hasOwn(checksumEntry, "mach_o_signing_independent_sha256") &&
    (typeof checksumEntry.mach_o_signing_independent_sha256 !== "string" ||
      !SHA256_PATTERN.test(checksumEntry.mach_o_signing_independent_sha256))
  ) {
    return `Mach-O signing-independent SHA-256 is malformed for ${platformKey}`;
  }
  const hasPeSigningHash = Object.hasOwn(
    checksumEntry,
    "pe_signing_independent_sha256",
  );
  const hasPeUnsignedSize = Object.hasOwn(checksumEntry, "pe_unsigned_size");
  if (
    hasPeSigningHash !== hasPeUnsignedSize ||
    (hasPeSigningHash &&
      (typeof checksumEntry.pe_signing_independent_sha256 !== "string" ||
        !SHA256_PATTERN.test(checksumEntry.pe_signing_independent_sha256) ||
        !Number.isSafeInteger(checksumEntry.pe_unsigned_size) ||
        checksumEntry.pe_unsigned_size < PE_DOS_HEADER_BYTES))
  ) {
    return `PE signing-independent provenance is malformed for ${platformKey}`;
  }
  if (provenanceRequirement === null) {
    return null;
  }
  if (
    !isPlainObject(provenanceRequirement) ||
    provenanceRequirement.cargoProfile !== "release" ||
    typeof provenanceRequirement.sourceGitRevision !== "string" ||
    !GIT_REVISION_PATTERN.test(provenanceRequirement.sourceGitRevision) ||
    provenanceRequirement.sourceTreeClean !== true
  ) {
    return "release native provenance requirement is malformed";
  }
  if (checksumEntry.cargo_profile !== "release") {
    return `native Cargo profile mismatch for ${platformKey}: expected release, observed ${String(
      checksumEntry.cargo_profile,
    )}`;
  }
  if (
    checksumEntry.source_git_revision !==
    provenanceRequirement.sourceGitRevision
  ) {
    return `native source Git revision mismatch for ${platformKey}: expected ${provenanceRequirement.sourceGitRevision}, observed ${checksumEntry.source_git_revision}`;
  }
  if (checksumEntry.source_tree_clean !== true) {
    return `native source tree is not clean for ${platformKey}`;
  }
  return null;
};

const listMissingNativeExports = (nativeModule) =>
  REQUIRED_NATIVE_EXPORTS.filter(
    (exportName) =>
      !nativeModule ||
      typeof nativeModule !== "object" ||
      typeof nativeModule[exportName] !== "function",
  );

const fingerprintHex = (value) =>
  Buffer.isBuffer(value) && value.length === 32 ? value.toString("hex") : null;

const describeNativeFingerprintContractFailure = (nativeModule) => {
  const policyExportName = "validationFeePolicyProposalFingerprintV1";
  let policyFirst;
  let policyRepeated;
  let policySecondOperator;
  try {
    policyFirst = nativeModule[policyExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
    policyRepeated = nativeModule[policyExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
    policySecondOperator = nativeModule[policyExportName](
      REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      null,
    );
  } catch (error) {
    return `native fingerprint contract probe failed for ${policyExportName}: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  const policyFirstHex = fingerprintHex(policyFirst);
  const policyRepeatedHex = fingerprintHex(policyRepeated);
  const policySecondOperatorHex = fingerprintHex(policySecondOperator);
  if (
    policyFirstHex !== REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX ||
    policyRepeatedHex !== REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX ||
    policySecondOperatorHex === null ||
    policyFirstHex === policySecondOperatorHex
  ) {
    return `native fingerprint contract mismatch for ${policyExportName}: expected deterministic operator-bound vector ${REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX}, observed ${String(policyFirstHex)}`;
  }

  const payoutExportName = "validationFeePayoutLifecycleProposalFingerprintV1";
  let payoutFirst;
  let payoutRepeated;
  let payoutSecondOperator;
  try {
    payoutFirst = nativeModule[payoutExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
    payoutRepeated = nativeModule[payoutExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
    payoutSecondOperator = nativeModule[payoutExportName](
      REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
    );
  } catch (error) {
    return `native fingerprint contract probe failed for ${payoutExportName}: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  const payoutFirstHex = fingerprintHex(payoutFirst);
  const payoutRepeatedHex = fingerprintHex(payoutRepeated);
  const payoutSecondOperatorHex = fingerprintHex(payoutSecondOperator);
  if (
    payoutFirstHex !== REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX ||
    payoutRepeatedHex !== REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX ||
    payoutSecondOperatorHex === null ||
    payoutFirstHex === payoutSecondOperatorHex
  ) {
    return `native fingerprint contract mismatch for ${payoutExportName}: expected deterministic operator-bound vector ${REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX}, observed ${String(payoutFirstHex)}`;
  }

  try {
    nativeModule[policyExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      "{}",
      null,
    );
    return `native fingerprint contract mismatch for ${policyExportName}: invalid policy was accepted`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!reason.includes("validation-fee policy must contain exactly")) {
      return `native fingerprint contract rejection probe failed for ${policyExportName}: ${reason}`;
    }
  }

  try {
    nativeModule[payoutExportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      "{}",
    );
    return `native fingerprint contract mismatch for ${payoutExportName}: invalid current-contract payout binding was accepted`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!reason.includes("payout binding must contain exactly")) {
      return `native fingerprint contract rejection probe failed for ${payoutExportName}: ${reason}`;
    }
  }
  return null;
};

const describeNativeCompatibilityFailure = (nativeModule) => {
  let observedBridgeAbiVersion;
  try {
    observedBridgeAbiVersion = nativeModule.connectNoritoBridgeAbiVersion();
  } catch (error) {
    return `connectNoritoBridgeAbiVersion failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  if (observedBridgeAbiVersion !== REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION) {
    return `connect Norito bridge ABI mismatch: expected ${REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION}, observed ${String(
      observedBridgeAbiVersion,
    )}`;
  }

  let observedSecurePrivateFileAbiVersion;
  try {
    observedSecurePrivateFileAbiVersion =
      nativeModule.securePrivateFileAbiVersion();
  } catch (error) {
    return `securePrivateFileAbiVersion failed: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  if (
    observedSecurePrivateFileAbiVersion !==
    REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION
  ) {
    return `secure private-file ABI mismatch: expected ${REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION}, observed ${String(
      observedSecurePrivateFileAbiVersion,
    )}`;
  }
  return describeNativeFingerprintContractFailure(nativeModule);
};

export const resolveNativeBuildRequirement = (
  irohaPackagePath,
  platformKey = `${process.platform}-${process.arch}`,
  loadNativeModule = defaultLoadNativeModule,
  provenanceRequirement = null,
) => {
  const nativeModulePath = join(
    irohaPackagePath,
    "native",
    NATIVE_MODULE_FILENAME,
  );
  const checksumManifestPath = join(
    irohaPackagePath,
    "native",
    CHECKSUM_FILENAME,
  );

  if (!existsSync(nativeModulePath)) {
    return {
      shouldBuild: true,
      reason: "missing native binary",
      nativeModulePath,
      checksumManifestPath,
    };
  }
  if (
    !isBoundedRegularNonSymbolicLink(nativeModulePath, MAX_NATIVE_MODULE_BYTES)
  ) {
    return {
      shouldBuild: true,
      reason: "native binary is not a bounded regular non-symbolic-link file",
      nativeModulePath,
      checksumManifestPath,
    };
  }

  if (!existsSync(checksumManifestPath)) {
    return {
      shouldBuild: true,
      reason: "missing checksum manifest",
      nativeModulePath,
      checksumManifestPath,
    };
  }
  if (
    !isBoundedRegularNonSymbolicLink(
      checksumManifestPath,
      MAX_CHECKSUM_MANIFEST_BYTES,
    )
  ) {
    return {
      shouldBuild: true,
      reason:
        "checksum manifest is not a bounded regular non-symbolic-link file",
      nativeModulePath,
      checksumManifestPath,
    };
  }

  let checksumManifest;
  let checksumManifestSource;
  try {
    checksumManifestSource = readFileSync(checksumManifestPath, "utf8");
    checksumManifest = JSON.parse(checksumManifestSource);
  } catch (error) {
    return {
      shouldBuild: true,
      reason: `unreadable checksum manifest: ${error instanceof Error ? error.message : String(error)}`,
      nativeModulePath,
      checksumManifestPath,
    };
  }

  if (
    !hasExactFields(checksumManifest, ["entries"]) ||
    !hasExactFields(checksumManifest.entries, [platformKey])
  ) {
    return {
      shouldBuild: true,
      reason: `checksum manifest must contain only entries.${platformKey}`,
      nativeModulePath,
      checksumManifestPath,
    };
  }
  const checksumEntries = checksumManifest.entries;
  const canonicalManifest = `${JSON.stringify(
    { entries: { [platformKey]: checksumEntries[platformKey] } },
    null,
    2,
  )}\n`;
  if (checksumManifestSource !== canonicalManifest) {
    return {
      shouldBuild: true,
      reason: "checksum manifest encoding is not canonical",
      nativeModulePath,
      checksumManifestPath,
    };
  }
  const checksumEntry = checksumEntries?.[platformKey];
  const expectedSha256 = checksumEntry?.sha256;
  if (typeof expectedSha256 !== "string" || !expectedSha256.trim()) {
    return {
      shouldBuild: true,
      reason: `missing checksum entry for ${platformKey}`,
      nativeModulePath,
      checksumManifestPath,
    };
  }

  const provenanceFailure = describeReleaseProvenanceFailure(
    checksumEntry,
    platformKey,
    provenanceRequirement,
  );
  if (provenanceFailure !== null) {
    return {
      shouldBuild: true,
      reason: provenanceFailure,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
    };
  }

  const actualSha256 = createHash("sha256")
    .update(readFileSync(nativeModulePath))
    .digest("hex");
  if (actualSha256 !== expectedSha256) {
    return {
      shouldBuild: true,
      reason: `checksum mismatch for ${platformKey}`,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
      actualSha256,
    };
  }

  let nativeModule;
  try {
    nativeModule = loadNativeModule(nativeModulePath);
  } catch (error) {
    return {
      shouldBuild: true,
      reason: `native module failed to load: ${error instanceof Error ? error.message : String(error)}`,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
      actualSha256,
    };
  }

  const missingExports = listMissingNativeExports(nativeModule);
  if (missingExports.length > 0) {
    return {
      shouldBuild: true,
      reason: `missing native exports: ${missingExports.join(", ")}`,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
      actualSha256,
      missingExports,
    };
  }

  const compatibilityFailure = describeNativeCompatibilityFailure(nativeModule);
  if (compatibilityFailure !== null) {
    return {
      shouldBuild: true,
      reason: compatibilityFailure,
      nativeModulePath,
      checksumManifestPath,
      expectedSha256,
      actualSha256,
    };
  }

  return {
    shouldBuild: false,
    reason: "native binding is current",
    nativeModulePath,
    checksumManifestPath,
    expectedSha256,
    actualSha256,
  };
};
