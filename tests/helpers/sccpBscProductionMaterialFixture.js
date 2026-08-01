/* global BigInt */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { sha256 } from "@noble/hashes/sha256";
import { keccak_256 } from "@noble/hashes/sha3";
import {
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  bscGroth16VerifierKeyHash,
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
  verifyBscMainnetNativeEvmProverArtifactsFromBundle,
  verifyBscTestnetNativeEvmProverArtifactsFromBundle,
} from "../../src/legacy/sccpLegacySdk.js";
import {
  BSC_EVM_GROTH16_BACKEND,
  SCCP_BSC_ROUTE_MANIFEST_SCHEMA,
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_SORA,
  SCCP_PROOF_FAMILY_STARK_FRI,
  bscDestinationBindingHash,
  bscDestinationBindingKey,
} from "../../scripts/e2e/sccp-bsc-route-manifest.mjs";

export {
  BSC_EVM_GROTH16_BACKEND,
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_SORA,
  SCCP_PROOF_FAMILY_STARK_FRI,
  bscDestinationBindingHash,
  bscDestinationBindingKey,
  bscGroth16VerifierKeyHash,
};

export const ROUTE_MANIFEST_SCHEMA = SCCP_BSC_ROUTE_MANIFEST_SCHEMA;

const BSC_GROTH16_SELF_TEST_SAMPLE_ID =
  "sccp-bsc-groth16-full-message-self-test-v1";
const BSC_GROTH16_PUBLIC_SIGNAL_NAMES = Object.freeze([
  "message_id",
  "payload_hash",
  "target_domain",
  "commitment_root",
  "finality_height",
  "finality_block_hash",
  "source_domain",
  "statement_hash",
  "destination_binding_hash",
]);
const BSC_GROTH16_SIGNAL_INPUT_NAMES = Object.freeze([
  "messageIdBits",
  "payloadHashBits",
  "targetDomainBits",
  "commitmentRootBits",
  "finalityHeightBits",
  "finalityBlockHashBits",
  "sourceDomainBits",
  "statementHashBits",
  "destinationBindingHashBits",
]);
const BSC_GROTH16_PUBLIC_SIGNAL_LABEL_HASHES = Object.freeze([
  "0x091b1715f31adbc0239378caf77a4370e8348599048ec45efb203368dbcc5073",
  "0xd40cf4310af21ab1b3f12db20df99ab8fe63dbe55fc473e5456691c39c1859ac",
  "0x5f7c135fa34a3f53c3733c64f172ef8a639790cfe240c9b454311f8cbfe74f96",
  "0xc3aa105618977410007f32f4eefe0b3eab174af6dac0d95829b92e18912bfbe3",
  "0x0d3499b9350c0ac6add6e0076775de67baee79c5b691f3a4f9317dcb974db599",
  "0x1c5d4645e72d75c0152153a5fe8679a3c0a7ba6cfe3b91986e647c4b26c144bc",
  "0xd07ef0087259b42adc11497be275f42091c6ef51becccd113be860e1b48a5109",
  "0xa4895607d62c8e116357ba7d102e08b5636840e0816a608f3a1fc9d0a1077569",
  "0x094cf24d193ac65c8a450188d16282fba8ee8c5a7539b751857d231f4380c2dd",
]);
const BN254_SCALAR_FIELD_MODULUS = BigInt(
  "21888242871839275222246405745257275088548364400416034343698204186575808495617",
);
const CANONICAL_HEX_32 = /^0x[0-9a-f]{64}$/u;
const textEncoder = new TextEncoder();

const bytesToHex = (bytes) =>
  `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  )}`;

const hex32Bytes = (value, label) => {
  if (!CANONICAL_HEX_32.test(value)) {
    throw new TypeError(
      `${label} must be a canonical lowercase 32-byte hex value.`,
    );
  }
  return Buffer.from(value.slice(2), "hex");
};

const canonicalJson = (value) => {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  throw new TypeError("canonical JSON supports only JSON values");
};

const normalizeProfile = (value) => {
  const key =
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? value.key
      : value;
  if (key !== "testnet" && key !== "mainnet") {
    throw new TypeError("BSC fixture profile must be testnet or mainnet.");
  }
  return key;
};

const signalWord = (profile, signalName) =>
  sha256(
    textEncoder.encode(
      `${BSC_GROTH16_SELF_TEST_SAMPLE_ID}:${profile}:${signalName}`,
    ),
  );

const signalFieldElement = (labelHash, word) => {
  const input = Buffer.concat([
    hex32Bytes(labelHash, "BSC Groth16 signal label"),
    Buffer.from(word),
  ]);
  const digest = keccak_256(
    new Uint8Array(input.buffer, input.byteOffset, input.byteLength),
  );
  return (BigInt(bytesToHex(digest)) % BN254_SCALAR_FIELD_MODULUS).toString(10);
};

const wordBitsLittleEndianByByte = (bytes) =>
  Array.from(bytes).flatMap((byte) =>
    Array.from({ length: 8 }, (_, bit) => (byte >> bit) & 1),
  );

/**
 * Reproduces the protocol's deterministic full-message Groth16 self-test
 * input. Keeping this generator in the test harness makes the vectors
 * independent of an operator/deployment checkout while retaining byte-for-byte
 * compatibility with the BSC material contract.
 */
export const bscGroth16DeterministicProofSelfTestSample = (
  profileValue = "testnet",
) => {
  const profile = normalizeProfile(profileValue);
  const words = BSC_GROTH16_PUBLIC_SIGNAL_NAMES.map((signalName) =>
    signalWord(profile, signalName),
  );
  const syntheticInputWords = Object.fromEntries(
    BSC_GROTH16_PUBLIC_SIGNAL_NAMES.map((signalName, index) => [
      signalName,
      bytesToHex(words[index]),
    ]),
  );
  const publicSignalWords = words.map((word, index) =>
    signalFieldElement(BSC_GROTH16_PUBLIC_SIGNAL_LABEL_HASHES[index], word),
  );
  const input = { publicSignals: publicSignalWords };
  for (const [index, inputName] of BSC_GROTH16_SIGNAL_INPUT_NAMES.entries()) {
    input[inputName] = wordBitsLittleEndianByByte(words[index]);
  }
  return {
    sampleId: BSC_GROTH16_SELF_TEST_SAMPLE_ID,
    syntheticInputWords,
    publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
    publicSignalWords,
    input,
    inputSha256: (() => {
      const bytes = Buffer.from(canonicalJson(input), "utf8");
      return bytesToHex(
        sha256(
          new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
        ),
      );
    })(),
  };
};

export const bscNativeProverReportProductionAttestationHash = (
  kind,
  groth16MaterialManifestSha256,
) => {
  if (!CANONICAL_HEX_32.test(groth16MaterialManifestSha256)) {
    throw new TypeError(
      "Groth16 material manifest sha256 must be a canonical lowercase 32-byte hex value.",
    );
  }
  if (kind !== "cross-sdk-parity" && kind !== "native-prover-self-test") {
    throw new TypeError(
      "native prover report production attestation kind is invalid.",
    );
  }
  return `0x${createHash("sha256")
    .update(
      `iroha-sccp-bsc-native-prover-report-production-attestation/v1:${kind}:${groth16MaterialManifestSha256}`,
      "utf8",
    )
    .digest("hex")}`;
};

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const requiredString = (record, name) => {
  const value = record?.[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`BSC fixture option ${name} is required.`);
  }
  return value;
};

const readArtifact = async (root, relativePath) => {
  const bytes = await readFile(path.resolve(root, relativePath));
  return { path: relativePath, bytes, sha256: sha256Hex(bytes) };
};

const auditHash = async (root, value, label) => {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`BSC fixture ${label} is required.`);
  }
  if (CANONICAL_HEX_32.test(value)) return value;
  return sha256Hex(await readFile(path.resolve(root, value)));
};

/**
 * Builds a native-prover bundle solely for local test material. The resulting
 * object is validated and every SDK row is re-verified against the exact bytes
 * before it is returned, so the fixture cannot bypass the production bundle
 * and artifact contracts exercised by the suites.
 */
export const buildBscNativeEvmProverFixtureBundleFromArtifacts = async (
  options = {},
) => {
  const root = path.resolve(requiredString(options, "artifact-root"));
  const routeManifestPath = path.resolve(
    requiredString(options, "route-manifest"),
  );
  const routeManifest = JSON.parse(await readFile(routeManifestPath, "utf8"));
  const profile = normalizeProfile(routeManifest.bscNetwork ?? "testnet");
  const destinationRollout = routeManifest.destinationRollout;
  if (
    typeof destinationRollout !== "object" ||
    destinationRollout === null ||
    Array.isArray(destinationRollout)
  ) {
    throw new TypeError(
      "BSC fixture route manifest destinationRollout is required.",
    );
  }

  const proofArtifact = await readArtifact(
    root,
    requiredString(options, "proof-artifact"),
  );
  const provingKey = await readArtifact(
    root,
    requiredString(options, "proving-key"),
  );
  const verifierKey = await readArtifact(
    root,
    requiredString(options, "verifier-key"),
  );
  const crossSdkParity = await readArtifact(
    root,
    requiredString(options, "cross-sdk-parity"),
  );
  const nativeProverSelfTest = await readArtifact(
    root,
    requiredString(options, "native-prover-self-test"),
  );
  const groth16ProofSelfTest = await readArtifact(
    root,
    requiredString(options, "groth16-proof-self-test"),
  );
  const verifierKeyHash = bscGroth16VerifierKeyHash(
    JSON.parse(verifierKey.bytes.toString("utf8")),
  );
  const expectedHashes = {
    proofArtifactHash: destinationRollout.proofArtifactHash,
    provingKeyHash: destinationRollout.provingKeyHash,
    verifierKeyHash: destinationRollout.verifierKeyHash,
  };
  for (const [name, actual] of [
    ["proofArtifactHash", proofArtifact.sha256],
    ["provingKeyHash", provingKey.sha256],
    ["verifierKeyHash", verifierKeyHash],
  ]) {
    if (expectedHashes[name] !== actual) {
      throw new TypeError(
        `BSC fixture ${name} does not match the route manifest.`,
      );
    }
  }

  const sdkArtifacts = [];
  for (const [sdk, implementation] of Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  )) {
    const artifact = await readArtifact(
      root,
      requiredString(options, `${sdk}-implementation`),
    );
    sdkArtifacts.push({
      sdk,
      implementation,
      prover_artifact_hash: proofArtifact.sha256,
      proving_key_hash: provingKey.sha256,
      implementation_artifact: artifact.path,
      implementation_hash: artifact.sha256,
      bytes: artifact.bytes,
    });
  }

  const bundle = {
    schema: SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
    bundle_id:
      profile === "mainnet"
        ? SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1
        : SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    domain: SCCP_DOMAIN_BSC,
    chain: profile === "mainnet" ? "bsc-mainnet" : "bsc-testnet",
    proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
    proof_artifact: proofArtifact.path,
    proof_artifact_hash: proofArtifact.sha256,
    proving_key: provingKey.path,
    proving_key_hash: provingKey.sha256,
    verifier_key: verifierKey.path,
    verifier_key_hash: verifierKeyHash,
    verifier_key_artifact_hash: verifierKey.sha256,
    destination_binding_hash: destinationRollout.destinationBindingHash,
    no_wasm: true,
    remote_prover_required: false,
    browser_implementation: "pure-typescript",
    cross_sdk_parity_artifact: crossSdkParity.path,
    native_prover_self_test_artifact: nativeProverSelfTest.path,
    groth16_proof_self_test_artifact: groth16ProofSelfTest.path,
    groth16_proof_self_test_hash: groth16ProofSelfTest.sha256,
    native_sdk_artifacts: sdkArtifacts.map((artifact) => ({
      sdk: artifact.sdk,
      implementation: artifact.implementation,
      prover_artifact_hash: artifact.prover_artifact_hash,
      proving_key_hash: artifact.proving_key_hash,
      implementation_artifact: artifact.implementation_artifact,
      implementation_hash: artifact.implementation_hash,
    })),
    audit_hashes: {
      circuit_security_audit: await auditHash(
        root,
        requiredString(options, "audit-circuit-security"),
        "circuit security audit",
      ),
      native_implementation_audit: await auditHash(
        root,
        requiredString(options, "audit-native-implementation"),
        "native implementation audit",
      ),
      reproducible_build_attestation: await auditHash(
        root,
        requiredString(options, "audit-reproducible-build"),
        "reproducible build attestation",
      ),
      cross_sdk_parity: crossSdkParity.sha256,
      native_prover_self_test: nativeProverSelfTest.sha256,
      no_wasm_no_remote_scan: await auditHash(
        root,
        requiredString(options, "audit-no-wasm-no-remote-scan"),
        "no-WASM/no-remote scan",
      ),
    },
  };
  const expectedDestinationBindingHash =
    destinationRollout.destinationBindingHash;
  const validate =
    profile === "mainnet"
      ? validateBscMainnetNativeEvmProverBundle
      : validateBscTestnetNativeEvmProverBundle;
  const verify =
    profile === "mainnet"
      ? verifyBscMainnetNativeEvmProverArtifactsFromBundle
      : verifyBscTestnetNativeEvmProverArtifactsFromBundle;
  const descriptor = validate(bundle, { expectedDestinationBindingHash });
  const bytesByPath = new Map([
    [proofArtifact.path, proofArtifact.bytes],
    [provingKey.path, provingKey.bytes],
    [verifierKey.path, verifierKey.bytes],
    [crossSdkParity.path, crossSdkParity.bytes],
    [nativeProverSelfTest.path, nativeProverSelfTest.bytes],
    [groth16ProofSelfTest.path, groth16ProofSelfTest.bytes],
    ...sdkArtifacts.map((artifact) => [
      artifact.implementation_artifact,
      artifact.bytes,
    ]),
  ]);
  const verifiedSdks = [];
  for (const artifact of sdkArtifacts) {
    await verify(
      {
        nativeProverBundle: descriptor,
        sdk: artifact.sdk,
        artifactResolver: (artifactPath) => bytesByPath.get(artifactPath),
      },
      { expectedDestinationBindingHash },
    );
    verifiedSdks.push(artifact.sdk);
  }
  return {
    bundle,
    descriptor,
    verifiedSdks,
    routeSource: { kind: "route-manifest", record: routeManifest },
  };
};
