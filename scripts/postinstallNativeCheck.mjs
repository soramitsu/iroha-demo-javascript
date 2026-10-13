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
const REQUIRED_NATIVE_BUILD_PROVENANCE_VERSION = 4;
const REQUIRED_NATIVE_BUILD_EXECUTION_POLICY = "trusted-local-cargo-v1";
const MACOS_VERSION_PATTERN = /^\d+(?:\.\d+){1,2}$/u;
const MACOS_BUILD_FIELDS = [
  "sdk_root",
  "sdk_version",
  "sdk_settings_sha256",
  "deployment_target",
  "clang_path",
  "clang_version",
  "linker_path",
  "linker_version",
];
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
];
const REQUIRED_CONNECT_NORITO_BRIDGE_ABI_VERSION = 29;
const REQUIRED_SECURE_PRIVATE_FILE_ABI_VERSION = 1;
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

const hasControlCharacter = (value) =>
  Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });

const isCanonicalMacosPath = (value) =>
  typeof value === "string" &&
  value.startsWith("/") &&
  Buffer.byteLength(value, "utf8") <= 4096 &&
  value
    .slice(1)
    .split("/")
    .every(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".." &&
        !hasControlCharacter(segment),
    );

const isBoundedVersionLine = (value, prefix) =>
  typeof value === "string" &&
  value.startsWith(prefix) &&
  value.length > prefix.length &&
  Buffer.byteLength(value, "utf8") <= 512 &&
  !hasControlCharacter(value);

const hasExactMacosBuildIdentity = (value) =>
  hasExactFields(value, MACOS_BUILD_FIELDS) &&
  isCanonicalMacosPath(value.sdk_root) &&
  MACOS_VERSION_PATTERN.test(value.sdk_version) &&
  typeof value.sdk_settings_sha256 === "string" &&
  SHA256_PATTERN.test(value.sdk_settings_sha256) &&
  MACOS_VERSION_PATTERN.test(value.deployment_target) &&
  isCanonicalMacosPath(value.clang_path) &&
  isBoundedVersionLine(value.clang_version, "Apple clang version ") &&
  isCanonicalMacosPath(value.linker_path) &&
  isBoundedVersionLine(value.linker_version, "@(#)PROGRAM:ld PROJECT:ld-");

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
    allowedFields.add("macos_build");
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
    requiredProvenanceFields.push(
      "macos_build",
      "mach_o_signing_independent_sha256",
    );
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
    platformKey.startsWith("darwin-") &&
    !hasExactMacosBuildIdentity(checksumEntry.macos_build)
  ) {
    return `macOS build identity is malformed for ${platformKey}`;
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

const describeOperatorBoundKnownAnswerFailure = (
  nativeModule,
  exportName,
  json,
  expectedHex,
  expectedSecondOperatorHex,
) => {
  let first;
  let repeated;
  let secondOperator;
  try {
    first = nativeModule[exportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      json,
    );
    repeated = nativeModule[exportName](
      REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR,
      json,
    );
    secondOperator = nativeModule[exportName](
      REQUIRED_VALIDATION_FEE_SECOND_PROPOSAL_OPERATOR,
      json,
    );
  } catch (error) {
    return `native fingerprint contract probe failed for ${exportName}: ${
      error instanceof Error ? error.message : String(error)
    }`;
  }
  const firstHex = fingerprintHex(first);
  const repeatedHex = fingerprintHex(repeated);
  const secondOperatorHex = fingerprintHex(secondOperator);
  if (
    expectedHex === expectedSecondOperatorHex ||
    firstHex !== expectedHex ||
    repeatedHex !== expectedHex ||
    secondOperatorHex !== expectedSecondOperatorHex
  ) {
    return `native fingerprint contract mismatch for ${exportName}: expected deterministic operator-bound vectors ${expectedHex} and ${expectedSecondOperatorHex}, observed ${String(firstHex)} and ${String(secondOperatorHex)}`;
  }
  return null;
};

const describeEmptyProposalRejectionFailure = (
  nativeModule,
  exportName,
  expectedMessage,
  acceptedDescription,
) => {
  try {
    nativeModule[exportName](REQUIRED_VALIDATION_FEE_PROPOSAL_OPERATOR, "{}");
    return `native fingerprint contract mismatch for ${exportName}: ${acceptedDescription}`;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (!reason.includes(expectedMessage)) {
      return `native fingerprint contract rejection probe failed for ${exportName}: ${reason}`;
    }
  }
  return null;
};

const describeNativeFingerprintContractFailure = (nativeModule) => {
  const policyExportName = "validationFeePolicyProposalFingerprintV1";
  const payoutExportName = "validationFeePayoutLifecycleProposalFingerprintV1";
  return (
    describeOperatorBoundKnownAnswerFailure(
      nativeModule,
      policyExportName,
      REQUIRED_VALIDATION_FEE_POLICY_JSON,
      REQUIRED_VALIDATION_FEE_POLICY_FINGERPRINT_HEX,
      REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_POLICY_FINGERPRINT_HEX,
    ) ??
    describeOperatorBoundKnownAnswerFailure(
      nativeModule,
      payoutExportName,
      REQUIRED_VALIDATION_FEE_PAYOUT_BINDING_JSON,
      REQUIRED_VALIDATION_FEE_PAYOUT_FINGERPRINT_HEX,
      REQUIRED_VALIDATION_FEE_SECOND_OPERATOR_PAYOUT_FINGERPRINT_HEX,
    ) ??
    describeEmptyProposalRejectionFailure(
      nativeModule,
      policyExportName,
      "validation-fee policy must contain exactly",
      "invalid policy was accepted",
    ) ??
    describeEmptyProposalRejectionFailure(
      nativeModule,
      payoutExportName,
      "payout binding must contain exactly",
      "invalid current-contract payout binding was accepted",
    )
  );
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
