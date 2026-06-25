/* global globalThis */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildTairaXorBscToTairaTransferPayload,
  canonicalSccpPayloadEnvelopeBytes,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
  sccpMerkleRootFromCommitment,
  sccpPayloadHash,
  sccpTransferMessageId,
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import { AccountAddress } from "@iroha/iroha-js/address";
import {
  BSC_MAINNET_CHAIN_ID_HEX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_TESTNET_CHAIN_ID_HEX,
  BSC_TESTNET_NETWORK_ID_HEX,
  canonicalBscNativeEvmProverBundleHash,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import { validateBscSccpBrowserProverModuleBytes } from "../scripts/e2e/sccp-bsc-live-smoke-readiness.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const modulePath = path.join(
  repoRoot,
  "public/sccp-bsc/taira-bsc-xor-prover.js",
);
const originalFetch = globalThis.fetch;
const runtimeRoots = new Set();

const HASH_11 = `0x${"11".repeat(32)}`;
const HASH_22 = `0x${"22".repeat(32)}`;
const HASH_33 = `0x${"33".repeat(32)}`;
const HASH_44 = `0x${"44".repeat(32)}`;
const HASH_55 = `0x${"55".repeat(32)}`;
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const BSC_BRIDGE_ADDRESS = "0xa3cebb2c206939f7fc740ec73bbf59c87dbe21de";
const BSC_VERIFIER_ADDRESS = "0x109197a81221db7bb79e5763e4a6319af9e4e6d6";
const BSC_SOURCE_NONCE = "1";
const TAIRA_RECIPIENT = AccountAddress.fromAccount({
  publicKey: Uint8Array.from({ length: 32 }, () => 0x12),
}).toI105(BSC_TAIRA_NETWORK_PREFIX);
const PROOF_BACKEND = "evm-groth16-bn254-v1";
const PROOF_FAMILY = "stark-fri-v1";
const GROTH16_PROOF_SELF_TEST_SCHEMA =
  "iroha-sccp-bsc-groth16-proof-self-test/v1";
const BSC_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    chain: "bsc-testnet",
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    bundleId: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    legacyParitySchema:
      SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestSchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    validateBundle: validateBscTestnetNativeEvmProverBundle,
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    bundleId: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    legacyParitySchema:
      SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestSchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    validateBundle: validateBscMainnetNativeEvmProverBundle,
  }),
});
const REQUIRED_NATIVE_SDK_IMPLEMENTATIONS = {
  dotnet: "native-csharp",
  "java-android": "native-java",
  javascript: "pure-typescript",
  kotlin: "native-kotlin",
  swift: "native-swift",
};
const REQUIRED_NATIVE_PROVER_SDKS = Object.keys(
  REQUIRED_NATIVE_SDK_IMPLEMENTATIONS,
).sort();
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

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const decimalToBaseUnits = (value) => {
  const match = String(value).match(/^([0-9]+)(?:\.([0-9]+))?$/u);
  if (!match || (match[2] ?? "").length > 18) {
    throw new Error(`invalid decimal test amount: ${value}`);
  }
  return `${match[1]}${(match[2] ?? "").padEnd(18, "0")}`.replace(
    /^0+(?=\d)/u,
    "",
  );
};

const sourcePayloadForRequest = (request) =>
  buildTairaXorBscToTairaTransferPayload({
    bscSender: request.bscSender,
    tairaRecipient: request.tairaRecipient,
    amount:
      request.amountBaseUnits ??
      decimalToBaseUnits(request.amountDecimal ?? "1"),
    nonce: request.sourceNonce ?? BSC_SOURCE_NONCE,
  });

const sourcePayloadBindingForRequest = (request) => {
  const payload = sourcePayloadForRequest(request);
  const payloadHash = sccpPayloadHash(
    canonicalSccpPayloadEnvelopeBytes({
      kind: "Transfer",
      value: payload,
    }),
  );
  const messageId = sccpTransferMessageId(payload);
  const commitment = {
    version: 1,
    kind: "Transfer",
    target_domain: 0,
    message_id: messageId,
    payload_hash: payloadHash,
  };
  return {
    payload,
    payloadHash,
    messageId,
    commitmentRoot: sccpMerkleRootFromCommitment(commitment, { steps: [] }),
  };
};

const materialBytes = (seed, size = 96 * 1024) => {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (seed + index * 31 + (index >> 5)) & 0xff;
  }
  return bytes;
};

const snarkjsMaterialBytes = (seed, magic, sectionCount, size) => {
  const headerBytes = 12;
  const sectionHeaderBytes = sectionCount * 12;
  if (size <= headerBytes + sectionHeaderBytes + sectionCount) {
    throw new Error("snarkjs fixture size is too small");
  }
  const bytes = materialBytes(seed, size);
  bytes.set(Buffer.from(magic, "ascii"), 0);
  bytes.writeUInt32LE(1, 4);
  bytes.writeUInt32LE(sectionCount, 8);
  const payloadBytes = size - headerBytes - sectionHeaderBytes;
  let offset = headerBytes;
  for (let index = 0; index < sectionCount; index += 1) {
    const sectionSize =
      Math.floor(payloadBytes / sectionCount) +
      (index < payloadBytes % sectionCount ? 1 : 0);
    bytes.writeUInt32LE(index + 1, offset);
    bytes.writeUInt32LE(sectionSize, offset + 4);
    bytes.writeUInt32LE(0, offset + 8);
    offset += 12 + sectionSize;
  }
  if (offset !== size) {
    throw new Error("snarkjs fixture sections do not fill the file");
  }
  return bytes;
};

const swapSnarkjsSectionIds = (bytes, leftIndex, rightIndex) => {
  const sectionCount = bytes.readUInt32LE(8);
  const offsets = [];
  let offset = 12;
  for (let index = 0; index < sectionCount; index += 1) {
    offsets.push(offset);
    const sectionSize = Number(bytes.readBigUInt64LE(offset + 4));
    offset += 12 + sectionSize;
  }
  const leftOffset = offsets[leftIndex];
  const rightOffset = offsets[rightIndex];
  const leftSectionId = bytes.readUInt32LE(leftOffset);
  const rightSectionId = bytes.readUInt32LE(rightOffset);
  bytes.writeUInt32LE(rightSectionId, leftOffset);
  bytes.writeUInt32LE(leftSectionId, rightOffset);
};

const proofArtifactMaterialBytes = (seed, size = 96 * 1024) =>
  snarkjsMaterialBytes(seed, "r1cs", 3, size);

const provingKeyMaterialBytes = (seed, size = 96 * 1024) =>
  snarkjsMaterialBytes(seed, "zkey", 10, size);

const backendModuleBytes = ({
  destinationTinyProof = false,
  destinationResultMutation = "",
  missingSelfTest = false,
  genericSelfTestOnly = false,
  selfTestResultMutation = "",
  sourceResultMutation = "",
} = {}) =>
  Buffer.from(
    `
const calls = () => globalThis.IrohaSccpBscProverTestCalls;
const record = (context) => {
  const target = calls();
  if (Array.isArray(target)) {
    target.push(context);
  }
};
const selfTestResult = (context) => {
  const result = {
    sdk: "javascript",
    implementation: "pure-typescript",
    implementationHash: context.nativeSdkImplementationHashes.javascript,
    requestHash: context.nativeProverSelfTest.requestHash,
    witnessHash: context.nativeProverSelfTest.witnessHash,
    sourceProofHash: context.nativeProverSelfTest.sourceProofHash,
    proofHash: context.nativeProverSelfTest.proofHash,
    publicSignalWords: context.nativeProverSelfTest.publicSignalWords,
    calldataHash: context.nativeProverSelfTest.calldataHash,
    toriiSubmitPayloadHash: context.nativeProverSelfTest.toriiSubmitPayloadHash,
  };
  ${selfTestResultMutation}
  return result;
};
${
  missingSelfTest
    ? genericSelfTestOnly
      ? `export async function selfTest(context) {
  return selfTestResult(context);
}`
      : ""
    : `export async function bscSccpNativeProverSelfTest(context) {
  return selfTestResult(context);
}
export async function bscSccpSourceNativeProverSelfTest(context) {
  return selfTestResult(context);
}`
}
export async function bscSccpProve(context) {
  record(context);
  ${
    destinationTinyProof
      ? "return { proofBytes: new Uint8Array([1, 2, 3]) };"
      : `const proofBytes = new Uint8Array(384);
  let state = 0x9e3779b9;
  for (let index = 0; index < proofBytes.length; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    proofBytes[index] = state & 0xff;
  }
  const result = {
    proofBytes,
    routeId: context.routeId,
    assetKey: context.assetKey,
    requestHash: context.request.requestHash,
    destinationBindingHash: context.request.destinationBindingHash,
    destinationBinding: context.request.destinationBinding,
    proofArtifactHash: context.proofArtifactHash,
    provingKeyHash: context.provingKeyHash,
    nativeEvmProverBundleHash: context.nativeEvmProverBundleHash,
  };
  ${destinationResultMutation}
  return result;`
  }
}
export async function bscSccpSourceProve(context) {
  record(context);
  const request = context.request;
  const amountBaseUnits = request.amountBaseUnits ?? "1000000000000000000";
  const transferPayload = {
    version: 1,
    source_domain: 2,
    dest_domain: 0,
    nonce: request.sourceNonce ?? "1",
    asset_home_domain: 0,
    asset_id_codec: 1,
    asset_id: "xor",
    amount: amountBaseUnits,
    sender_codec: 2,
    sender: request.sourceCanonicalBscSender ?? request.bscSender,
    recipient_codec: 1,
    recipient: request.tairaRecipient,
    route_id_codec: 1,
    route_id: context.routeId,
  };
  const result = {
    proofArtifactHash: context.proofArtifactHash,
    provingKeyHash: context.provingKeyHash,
    nativeEvmProverBundleHash: context.nativeEvmProverBundleHash,
    messageBundle: {
      version: 1,
      commitmentRoot: request.sourceCommitmentRoot,
      commitment: {
        version: 1,
        kind: "Transfer",
        targetDomain: 0,
        messageId: request.sourceMessageId,
        payloadHash: request.sourcePayloadHash,
      },
      payload: {
        kind: "Transfer",
        value: transferPayload,
      },
      merkleProof: { steps: [] },
      finalityProof: "0x010203",
    },
    settlement: {
      entrypoint: "finalize_inbound",
      route: context.routeId,
      recipient: request.tairaRecipient,
    },
    sourceEventDigest: "${HASH_22}",
    txId: request.txId,
    messageId: request.sourceMessageId,
    payloadHash: request.sourcePayloadHash,
    publicInputs: {
      sourceDomain: 2,
      targetDomain: 0,
      messageId: request.sourceMessageId,
      payloadHash: request.sourcePayloadHash,
      commitmentRoot: request.sourceCommitmentRoot,
      txId: request.txId,
      sourceEventDigest: "${HASH_22}",
      amountBaseUnits,
      sender: request.sourceCanonicalBscSender ?? request.bscSender,
      recipient: request.tairaRecipient,
      routeId: context.routeId,
    },
    amountBaseUnits,
  };
  ${sourceResultMutation}
  return result;
}
`.padEnd(1300, "\n// backend integrity padding"),
    "utf8",
  );

const backendModuleConfig = (options) => {
  const bytes = backendModuleBytes(options);
  return {
    bytes,
    sha256: sha256Hex(bytes),
  };
};

const supportHash = (seed, label) =>
  sha256Hex(Buffer.from(`bsc-support:${label}:${seed}`, "utf8"));

const groth16ProofSelfTestMaterialManifestHash = (seed) =>
  supportHash(seed, "groth16-material-manifest");

const nativeProverReportProductionAttestationHash = (
  kind,
  materialManifestHash,
) => {
  const role =
    kind === "parity" ? "cross-sdk-parity" : "native-prover-self-test";
  return sha256Hex(
    Buffer.from(
      `iroha-sccp-bsc-native-prover-report-production-attestation/v1:${role}:${materialManifestHash}`,
      "utf8",
    ),
  );
};

const supportWords = (seed, label) =>
  Array.from({ length: 9 }, (_value, index) =>
    supportHash(seed + index, `${label}:word`),
  );

const supportSdkResults = (fields) =>
  Object.fromEntries(
    REQUIRED_NATIVE_PROVER_SDKS.map((sdk) => [sdk, { ...fields }]),
  );

const nativeSupportArtifactBytes = ({
  seed,
  kind,
  binding,
  materialManifestHash,
  profile = BSC_PROFILES.testnet,
}) => {
  const common = {
    domain: 2,
    chain: profile.chain,
    proof_backend: PROOF_BACKEND,
    proof_artifact_hash: binding.proofArtifactHash,
    proving_key_hash: binding.provingKeyHash,
    verifier_key_hash: binding.verifierKeyHash,
    destination_binding_hash: binding.destinationBindingHash,
  };
  const fields =
    kind === "parity"
      ? {
          receipt_proof_hash: supportHash(seed, "receipt-proof"),
          source_proof_hash: supportHash(seed, "source-proof"),
          public_signal_words: supportWords(seed, "parity"),
          calldata_hash: supportHash(seed, "calldata"),
          torii_submit_payload_hash: supportHash(seed, "torii-submit"),
        }
      : {
          request_hash: supportHash(seed, "request"),
          witness_hash: supportHash(seed, "witness"),
          source_proof_hash: supportHash(seed, "source-proof"),
          proof_hash: supportHash(seed, "proof"),
          public_signal_words: supportWords(seed, "self-test"),
          calldata_hash: supportHash(seed, "calldata"),
          torii_submit_payload_hash: supportHash(seed, "torii-submit"),
        };
  return Buffer.from(
    `${JSON.stringify(
      {
        schema:
          kind === "parity" ? profile.paritySchema : profile.selfTestSchema,
        ...common,
        production_attestation_hash:
          nativeProverReportProductionAttestationHash(
            kind,
            materialManifestHash,
          ),
        ...fields,
        sdk_results: supportSdkResults(fields),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

const groth16ProofSelfTestArtifactBytes = ({
  seed,
  binding,
  profile = BSC_PROFILES.testnet,
}) => {
  const publicSignals = Array.from({ length: 9 }, (_value, index) =>
    String(seed + index + 1),
  );
  return Buffer.from(
    `${JSON.stringify(
      {
        schema: GROTH16_PROOF_SELF_TEST_SCHEMA,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: profile.key,
        chain: profile.chain,
        chainIdHex: profile.chainIdHex,
        networkIdHex: profile.networkIdHex,
        circuitProfile: "sccp-bsc-full-message-v1",
        proofBackend: PROOF_BACKEND,
        proofFamily: PROOF_FAMILY,
        manifest: {
          path: "groth16-material.manifest.json",
          sha256: groth16ProofSelfTestMaterialManifestHash(seed),
          productionReady: true,
          productionBlockers: [],
        },
        artifacts: {
          circuitSource: {
            path: "full-sccp-message.circom",
            sha256: supportHash(seed, "circuit-source"),
          },
          r1cs: {
            path: "proof-artifact.r1cs",
            sha256: binding.proofArtifactHash,
          },
          provingKey: {
            path: "proving-key.zkey",
            sha256: binding.provingKeyHash,
          },
          snarkjsVerificationKey: {
            path: "verification-key.json",
            sha256: supportHash(seed, "snarkjs-verification-key"),
          },
          bscVerifierKey: {
            path: "groth16-key-material.json",
            sha256: binding.verifierKeyArtifactHash,
          },
          witnessWasm: {
            path: "sccp-bsc-full-message.wasm",
            sha256: supportHash(seed, "witness-wasm"),
          },
        },
        sample: {
          id: `groth16-proof-self-test-${seed}`,
          publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
          publicSignalWords: publicSignals,
        },
        snarkjs: {
          binary: "snarkjs",
          wtnsCalculate: true,
          groth16Prove: true,
          groth16Verify: true,
        },
        witnessHash: supportHash(seed, "witness"),
        proofHash: supportHash(seed, "proof"),
        publicSignalsHash: sha256Hex(
          Buffer.from(JSON.stringify(publicSignals), "utf8"),
        ),
        proof: {
          protocol: "groth16",
          curve: "bn128",
          pi_a: ["1", "2", "1"],
          pi_b: [
            ["3", "4"],
            ["5", "6"],
            ["1", "0"],
          ],
          pi_c: ["7", "8", "1"],
        },
        publicSignals,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
};

const implementationArtifactBytes = (seed, label) =>
  Buffer.concat([
    Buffer.from(`${label}:${seed}:`, "utf8"),
    materialBytes(seed, 2048),
  ]);

const nativeBundleBytes = ({
  proofArtifactHash,
  provingKeyHash,
  verifierKeyHash,
  verifierKeyArtifactHash = HASH_55,
  groth16ProofSelfTestHash = null,
  destinationBindingHash,
  nativeArtifacts,
  profile = BSC_PROFILES.testnet,
}) =>
  Buffer.from(
    `${JSON.stringify(
      {
        schema: "sccp-native-evm-groth16-prover-bundle-v1",
        bundle_id: profile.bundleId,
        chain: profile.chain,
        domain: 2,
        proof_backend: PROOF_BACKEND,
        proof_artifact: "proof-artifact.r1cs",
        proof_artifact_hash: proofArtifactHash,
        proving_key: "proving-key.zkey",
        proving_key_hash: provingKeyHash,
        verifier_key: "groth16-key-material.json",
        verifier_key_hash: verifierKeyHash,
        verifier_key_artifact_hash: verifierKeyArtifactHash,
        destination_binding_hash: destinationBindingHash,
        no_wasm: true,
        remote_prover_required: false,
        browser_implementation: "pure-typescript",
        cross_sdk_parity_artifact: "cross-sdk-parity.json",
        native_prover_self_test_artifact: "native-prover-self-test.json",
        groth16_proof_self_test_artifact: "groth16-proof-self-test.json",
        groth16_proof_self_test_hash:
          groth16ProofSelfTestHash ?? nativeArtifacts.groth16ProofSelfTestHash,
        native_sdk_artifacts: Object.entries(
          REQUIRED_NATIVE_SDK_IMPLEMENTATIONS,
        ).map(([sdk, implementation]) => ({
          sdk,
          implementation,
          prover_artifact_hash: proofArtifactHash,
          proving_key_hash: provingKeyHash,
          implementation_artifact: `${sdk}/implementation.native`,
          implementation_hash: nativeArtifacts.implementationHashes[sdk],
        })),
        audit_hashes: {
          circuit_security_audit: supportHash(91, "circuit-security-audit"),
          native_implementation_audit: supportHash(
            92,
            "native-implementation-audit",
          ),
          reproducible_build_attestation: supportHash(
            93,
            "reproducible-build-attestation",
          ),
          cross_sdk_parity: nativeArtifacts.parityHash,
          native_prover_self_test: nativeArtifacts.selfTestHash,
          no_wasm_no_remote_scan: supportHash(96, "no-wasm-no-remote-scan"),
        },
      },
      null,
      2,
    )}\n`,
  );

const nativeBundleDescriptorHash = (
  bundle,
  destinationBindingHash,
  profile = BSC_PROFILES.testnet,
) =>
  canonicalBscNativeEvmProverBundleHash(
    profile.validateBundle(JSON.parse(bundle.toString("utf8")), {
      expectedDestinationBindingHash: destinationBindingHash,
    }),
  );

const buildDirectionConfig = (
  seed,
  destinationBindingHash = HASH_33,
  prefix = "destination",
  profile = BSC_PROFILES.testnet,
) => {
  const proofArtifact = proofArtifactMaterialBytes(seed);
  const provingKey = provingKeyMaterialBytes(seed + 7);
  const verifierKey = materialBytes(seed + 13, 2048);
  const verifierKeyHash = supportHash(seed + 17, `${profile.key}:verifier-key`);
  const verifierKeyArtifactHash = sha256Hex(verifierKey);
  const backend = backendModuleConfig();
  const binding = {
    proofArtifactHash: sha256Hex(proofArtifact),
    provingKeyHash: sha256Hex(provingKey),
    verifierKeyHash,
    verifierKeyArtifactHash,
    destinationBindingHash,
  };
  const groth16ProofSelfTestSeed = seed + 29;
  const materialManifestHash = groth16ProofSelfTestMaterialManifestHash(
    groth16ProofSelfTestSeed,
  );
  const parity = nativeSupportArtifactBytes({
    seed: seed + 19,
    kind: "parity",
    binding,
    materialManifestHash,
    profile,
  });
  const selfTest = nativeSupportArtifactBytes({
    seed: seed + 23,
    kind: "selfTest",
    binding,
    materialManifestHash,
    profile,
  });
  const groth16ProofSelfTest = groth16ProofSelfTestArtifactBytes({
    seed: groth16ProofSelfTestSeed,
    binding,
    profile,
  });
  const implementationHashes = {};
  const implementations = {};
  for (const [index, sdk] of REQUIRED_NATIVE_PROVER_SDKS.entries()) {
    const bytes = implementationArtifactBytes(
      seed + 31 + index,
      `${sdk}-native`,
    );
    implementationHashes[sdk] = sha256Hex(bytes);
    implementations[sdk] = bytes;
  }
  const nativeArtifacts = {
    parity,
    parityHash: sha256Hex(parity),
    selfTest,
    selfTestHash: sha256Hex(selfTest),
    groth16ProofSelfTest,
    groth16ProofSelfTestHash: sha256Hex(groth16ProofSelfTest),
    implementations,
    implementationHashes,
  };
  const bundle = nativeBundleBytes({
    proofArtifactHash: sha256Hex(proofArtifact),
    provingKeyHash: sha256Hex(provingKey),
    verifierKeyHash,
    verifierKeyArtifactHash,
    destinationBindingHash,
    nativeArtifacts,
    profile,
  });
  const nativeEvmProverBundleHash = nativeBundleDescriptorHash(
    bundle,
    destinationBindingHash,
    profile,
  );
  return {
    material: {
      proofArtifact,
      provingKey,
      verifierKey,
      bundle,
      backend,
      proofArtifactHash: sha256Hex(proofArtifact),
      provingKeyHash: sha256Hex(provingKey),
      verifierKeyHash,
      verifierKeyArtifactHash,
      bundleHash: sha256Hex(bundle),
      nativeEvmProverBundleHash,
    },
    nativeArtifacts,
    config: {
      nativeProverBundleUrl: `./${prefix}/native/bundle.json`,
      nativeProverArtifactBaseUrl: `./${prefix}/native/`,
      nativeProverBundleSha256: sha256Hex(bundle),
      nativeEvmProverBundleHash,
      nativeProverVerifiedSdks: REQUIRED_NATIVE_PROVER_SDKS,
      backendModuleUrl: `./${prefix}/backend.mjs`,
      backendModuleSha256: backend.sha256,
      backendSelfContained: true,
      backendAcceptedExport:
        prefix === "source" ? "bscSccpSourceProve" : "bscSccpProve",
      backendAcceptedSelfTestExport:
        prefix === "source"
          ? "bscSccpSourceNativeProverSelfTest"
          : "bscSccpNativeProverSelfTest",
      proofArtifactUrl: `./${prefix}/proof-artifact.r1cs`,
      proofArtifactSha256: sha256Hex(proofArtifact),
      provingKeyUrl: `./${prefix}/proving-key.zkey`,
      provingKeySha256: sha256Hex(provingKey),
      verifierKeyUrl: `./${prefix}/verifier-key.json`,
      verifierKeySha256: verifierKeyArtifactHash,
    },
  };
};

const buildRuntimeConfig = (overrides = {}, profile = BSC_PROFILES.testnet) => {
  const destination = buildDirectionConfig(5, HASH_33, "destination", profile);
  const source = buildDirectionConfig(41, HASH_44, "source", profile);
  return {
    destination,
    source,
    profile,
    config: {
      schema: "iroha-demo-sccp-bsc-runtime-prover/v1",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      tairaChainId: BSC_TAIRA_CHAIN_ID,
      tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
      bscNetwork: profile.key,
      bscChainIdHex: profile.chainIdHex,
      bscNetworkIdHex: profile.networkIdHex,
      destination: destination.config,
      source: source.config,
      ...overrides,
    },
  };
};

const refreshDirectionNativeBundle = (
  direction,
  destinationBindingHash,
  profile = BSC_PROFILES.testnet,
) => {
  direction.material.bundleHash = sha256Hex(direction.material.bundle);
  direction.material.nativeEvmProverBundleHash = nativeBundleDescriptorHash(
    direction.material.bundle,
    destinationBindingHash,
    profile,
  );
  direction.config.nativeProverBundleSha256 = direction.material.bundleHash;
  direction.config.nativeEvmProverBundleHash =
    direction.material.nativeEvmProverBundleHash;
};

const mutateDirectionNativeBundle = (
  direction,
  mutator,
  {
    refreshDescriptorHash = false,
    destinationBindingHash = HASH_33,
    profile = BSC_PROFILES.testnet,
  } = {},
) => {
  const record = JSON.parse(direction.material.bundle.toString("utf8"));
  mutator(record);
  direction.material.bundle = Buffer.from(
    `${JSON.stringify(record, null, 2)}\n`,
    "utf8",
  );
  direction.material.bundleHash = sha256Hex(direction.material.bundle);
  direction.config.nativeProverBundleSha256 = direction.material.bundleHash;
  if (refreshDescriptorHash) {
    direction.material.nativeEvmProverBundleHash = nativeBundleDescriptorHash(
      direction.material.bundle,
      destinationBindingHash,
      profile,
    );
    direction.config.nativeEvmProverBundleHash =
      direction.material.nativeEvmProverBundleHash;
  }
};

const retargetDirectionProofMaterial = (
  direction,
  {
    proofArtifact = null,
    provingKey = null,
    destinationBindingHash = HASH_33,
    profile = BSC_PROFILES.testnet,
  } = {},
) => {
  if (proofArtifact) {
    direction.material.proofArtifact = proofArtifact;
    direction.material.proofArtifactHash = sha256Hex(proofArtifact);
    direction.config.proofArtifactSha256 = direction.material.proofArtifactHash;
  }
  if (provingKey) {
    direction.material.provingKey = provingKey;
    direction.material.provingKeyHash = sha256Hex(provingKey);
    direction.config.provingKeySha256 = direction.material.provingKeyHash;
  }
  const binding = {
    proofArtifactHash: direction.material.proofArtifactHash,
    provingKeyHash: direction.material.provingKeyHash,
    verifierKeyHash: direction.material.verifierKeyHash,
    verifierKeyArtifactHash: direction.material.verifierKeyArtifactHash,
    destinationBindingHash,
  };
  direction.nativeArtifacts.groth16ProofSelfTest =
    groth16ProofSelfTestArtifactBytes({
      seed: 700,
      binding,
      profile,
    });
  direction.nativeArtifacts.groth16ProofSelfTestHash = sha256Hex(
    direction.nativeArtifacts.groth16ProofSelfTest,
  );
  direction.material.bundle = nativeBundleBytes({
    proofArtifactHash: direction.material.proofArtifactHash,
    provingKeyHash: direction.material.provingKeyHash,
    verifierKeyHash: direction.material.verifierKeyHash,
    verifierKeyArtifactHash: direction.material.verifierKeyArtifactHash,
    destinationBindingHash,
    nativeArtifacts: direction.nativeArtifacts,
    profile,
  });
  refreshDirectionNativeBundle(direction, destinationBindingHash, profile);
};

const writeDirectionRuntimeFiles = async (root, prefix, direction) => {
  const base = path.join(root, prefix);
  const nativeBase = path.join(base, "native");
  await mkdir(nativeBase, { recursive: true });
  await writeFile(
    path.join(base, "proof-artifact.r1cs"),
    direction.material.proofArtifact,
  );
  await writeFile(
    path.join(base, "proving-key.zkey"),
    direction.material.provingKey,
  );
  await writeFile(
    path.join(base, "verifier-key.json"),
    direction.material.verifierKey,
  );
  await writeFile(
    path.join(base, "backend.mjs"),
    direction.material.backend.bytes,
  );
  await writeFile(
    path.join(nativeBase, "bundle.json"),
    direction.material.bundle,
  );
  await writeFile(
    path.join(nativeBase, "cross-sdk-parity.json"),
    direction.nativeArtifacts.parity,
  );
  await writeFile(
    path.join(nativeBase, "native-prover-self-test.json"),
    direction.nativeArtifacts.selfTest,
  );
  await writeFile(
    path.join(nativeBase, "groth16-proof-self-test.json"),
    direction.nativeArtifacts.groth16ProofSelfTest,
  );
  for (const [sdk, bytes] of Object.entries(
    direction.nativeArtifacts.implementations,
  )) {
    const sdkDir = path.join(nativeBase, sdk);
    await mkdir(sdkDir, { recursive: true });
    await writeFile(path.join(sdkDir, "implementation.native"), bytes);
  }
};

const writeRuntimeConfigTree = async (runtime) => {
  const outputRoot = path.join(repoRoot, "output");
  await mkdir(outputRoot, { recursive: true });
  const root = await mkdtemp(path.join(outputRoot, "sccp-bsc-runtime-"));
  runtimeRoots.add(root);
  await writeDirectionRuntimeFiles(root, "destination", runtime.destination);
  await writeDirectionRuntimeFiles(root, "source", runtime.source);
  const configPath = path.join(root, "taira-bsc-xor-prover.config.json");
  await writeFile(configPath, `${JSON.stringify(runtime.config, null, 2)}\n`);
  return {
    root,
    configUrl: pathToFileURL(configPath).href,
  };
};

const fetchInputUrl = (input) =>
  typeof input === "string"
    ? input
    : input instanceof URL
      ? input.href
      : input?.url;

const streamingResponse = (chunks, options = {}) =>
  new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk);
        }
        controller.close();
      },
    }),
    { status: 200, ...options },
  );

const jsonBytesWithDuplicateKey = (bytes, key, value) => {
  const text = Buffer.isBuffer(bytes)
    ? bytes.toString("utf8")
    : Buffer.from(bytes).toString("utf8");
  return Buffer.from(
    text.replace("{", `{"${key}":${JSON.stringify(value)},`),
    "utf8",
  );
};

const installFileFetch = () => {
  globalThis.fetch = async (input, init) => {
    const url = fetchInputUrl(input);
    if (typeof url === "string" && url.startsWith("file:")) {
      const bytes = await readFile(fileURLToPath(url));
      return new Response(bytes, {
        status: 200,
        headers: { "content-length": String(bytes.byteLength) },
      });
    }
    return originalFetch(input, init);
  };
};

const installRuntimeConfig = async (runtime) => {
  const tree = await writeRuntimeConfigTree(runtime);
  installFileFetch();
  globalThis.IrohaSccpBscProverConfigUrl = tree.configUrl;
  return tree;
};

const setDirectionBackend = (direction, options) => {
  const backend = backendModuleConfig(options);
  direction.material.backend = backend;
  direction.config.backendModuleSha256 = backend.sha256;
};

const setDirectionBackendBytes = (direction, bytes) => {
  direction.material.backend = {
    bytes,
    sha256: sha256Hex(bytes),
  };
  direction.config.backendModuleSha256 = direction.material.backend.sha256;
};

const destinationRequest = (material) => ({
  proofArtifactHash: material.proofArtifactHash,
  provingKeyHash: material.provingKeyHash,
  nativeEvmProverBundleHash: material.nativeEvmProverBundleHash,
  requestHash: HASH_11,
  destinationBindingHash: HASH_33,
  destinationBinding: {
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
  },
});

const sourceRequest = (material, overrides = {}) => {
  const request = {
    proofArtifactHash: material.proofArtifactHash,
    provingKeyHash: material.provingKeyHash,
    nativeEvmProverBundleHash: material.nativeEvmProverBundleHash,
    manifest: { routeId: SCCP_BSC_XOR_ROUTE_ID },
    txId: HASH_44,
    transaction: null,
    receipt: {},
    bscSender: BSC_BRIDGE_ADDRESS,
    tairaRecipient: TAIRA_RECIPIENT,
    amountDecimal: "1",
    sourceNonce: BSC_SOURCE_NONCE,
    sourceEventDigest: HASH_22,
    ...overrides,
  };
  const binding = sourcePayloadBindingForRequest(request);
  return {
    ...request,
    sourceCanonicalBscSender: binding.payload.sender,
    sourcePayloadHash: binding.payloadHash,
    sourceMessageId: binding.messageId,
    sourceCommitmentRoot: binding.commitmentRoot,
  };
};

const loadRuntimeModule = () =>
  import(`${pathToFileURL(modulePath).href}?v=${Date.now()}-${Math.random()}`);

afterEach(async () => {
  delete globalThis.IrohaSccpBscProverConfigUrl;
  delete globalThis.IrohaSccpBscProverTestCalls;
  globalThis.fetch = originalFetch;
  await Promise.all(
    [...runtimeRoots].map((root) => rm(root, { recursive: true, force: true })),
  );
  runtimeRoots.clear();
});

describe("BSC SCCP runtime prover module", () => {
  it("is accepted by the production browser-module shape scanner", async () => {
    const bytes = await readFile(modulePath);

    expect(
      validateBscSccpBrowserProverModuleBytes(
        bytes,
        "TAIRA -> BSC runtime prover",
      ),
    ).toMatchObject({
      ok: true,
    });
  });

  it("rejects runtime prover modules that fetch material with ambient credentials or redirects", async () => {
    const bytes = await readFile(modulePath);
    const unsafeBytes = Buffer.from(
      Buffer.from(bytes)
        .toString("utf8")
        .replaceAll(
          "fetch(resolvedUrl, RUNTIME_FETCH_OPTIONS)",
          'fetch(resolvedUrl, { method: "GET" })',
        )
        .replaceAll(
          "fetch(configUrl, RUNTIME_FETCH_OPTIONS)",
          'fetch(configUrl, { method: "GET" })',
        ),
      "utf8",
    );

    expect(
      validateBscSccpBrowserProverModuleBytes(
        unsafeBytes,
        "TAIRA -> BSC runtime prover",
      ),
    ).toMatchObject({
      ok: false,
      detail: expect.stringContaining("runtime fetch policy is unsafe"),
    });
    expect(
      validateBscSccpBrowserProverModuleBytes(
        unsafeBytes,
        "TAIRA -> BSC runtime prover",
      ).detail,
    ).toContain('credentials: "omit"');
  });

  it("rejects runtime prover modules with dynamic, duplicate, or extra fetch options", async () => {
    const bytes = await readFile(modulePath);
    const moduleText = Buffer.from(bytes).toString("utf8");
    const fetchOptionsBlock = `const RUNTIME_FETCH_OPTIONS = Object.freeze({
  method: "GET",
  credentials: "omit",
  redirect: "error",
  cache: "no-store",
});`;
    const cases = [
      {
        name: "dynamic extra option",
        text: moduleText.replace(
          fetchOptionsBlock,
          `const RUNTIME_FETCH_OPTIONS = Object.freeze({
  method: "GET",
  credentials: "omit",
  redirect: "error",
  cache: "no-store",
  signal: controller.signal,
});`,
        ),
        detail: "non-static properties",
      },
      {
        name: "duplicate credential option",
        text: moduleText.replace(
          'credentials: "omit",',
          'credentials: "include",\n  credentials: "omit",',
        ),
        detail: "must not repeat credentials",
      },
      {
        name: "unsupported static option",
        text: moduleText.replace(
          'cache: "no-store",',
          'cache: "no-store",\n  mode: "no-cors",',
        ),
        detail: "must not set unsupported field mode",
      },
    ];

    for (const { detail, name, text } of cases) {
      expect(
        validateBscSccpBrowserProverModuleBytes(
          Buffer.from(text, "utf8"),
          `TAIRA -> BSC runtime prover ${name}`,
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(detail),
      });
    }
  });

  it("rejects runtime prover modules that fetch through aliases without the locked policy", async () => {
    const bytes = await readFile(modulePath);
    const moduleText = Buffer.from(bytes).toString("utf8");
    const fetchOptionsBlock = `const RUNTIME_FETCH_OPTIONS = Object.freeze({
  method: "GET",
  credentials: "omit",
  redirect: "error",
  cache: "no-store",
});`;
    const aliasCases = [
      {
        name: "direct fetch alias",
        text: moduleText.replace(
          fetchOptionsBlock,
          `${fetchOptionsBlock}
const runtimeFetch = fetch;`,
        ),
      },
      {
        name: "destructured global fetch alias",
        text: moduleText.replace(
          fetchOptionsBlock,
          `${fetchOptionsBlock}
const { fetch: runtimeFetch } = globalThis;`,
        ),
      },
    ].map(({ name, text }) => ({
      name,
      text: text
        .replaceAll(
          "fetch(resolvedUrl, RUNTIME_FETCH_OPTIONS)",
          "runtimeFetch(resolvedUrl)",
        )
        .replaceAll(
          "fetch(configUrl, RUNTIME_FETCH_OPTIONS)",
          "runtimeFetch(configUrl)",
        ),
    }));

    for (const { name, text } of aliasCases) {
      expect(
        validateBscSccpBrowserProverModuleBytes(
          Buffer.from(text, "utf8"),
          `TAIRA -> BSC runtime prover ${name}`,
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "fetch options must be a static object literal",
        ),
      });
    }
  });

  it("loads hash-bound destination material before delegating to a backend", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();
    const result = await mod.bscSccpProve(
      destinationRequest(runtime.destination.material),
    );

    expect(result.proofBytes).toBeInstanceOf(Uint8Array);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      direction: "destination",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      nativeEvmProverBundleHash:
        runtime.destination.material.nativeEvmProverBundleHash,
    });
    expect(calls[0].proofArtifactBytes).toBeInstanceOf(Uint8Array);
    expect(calls[0].proofArtifactBytes.byteLength).toBe(
      runtime.destination.material.proofArtifact.byteLength,
    );
    expect(calls[0].nativeProverBundle.proof_artifact_hash).toBe(
      runtime.destination.material.proofArtifactHash,
    );
    expect([...calls[0].nativeProverVerifiedSdks].sort()).toEqual(
      REQUIRED_NATIVE_PROVER_SDKS,
    );
    expect(calls[0].nativeSdkImplementationBytes.dotnet).toBeInstanceOf(
      Uint8Array,
    );
    expect(calls[0].nativeSdkImplementationHashes.dotnet).toBe(
      sha256Hex(calls[0].nativeSdkImplementationBytes.dotnet),
    );
    expect(calls[0].crossSdkParity).toMatchObject({
      schema: BSC_PROFILES.testnet.paritySchema,
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
    });
    expect(calls[0].nativeProverSelfTest).toMatchObject({
      schema: BSC_PROFILES.testnet.selfTestSchema,
      provingKeyHash: runtime.destination.material.provingKeyHash,
    });
  });

  it("fetches runtime config and material without credentials, redirects, or caching", async () => {
    const runtime = buildRuntimeConfig();
    const tree = await writeRuntimeConfigTree(runtime);
    const fetches = [];
    const calls = [];
    globalThis.IrohaSccpBscProverConfigUrl = tree.configUrl;
    globalThis.IrohaSccpBscProverTestCalls = calls;
    globalThis.fetch = async (input, init) => {
      const url = fetchInputUrl(input);
      fetches.push({ url, init });
      if (typeof url === "string" && url.startsWith("file:")) {
        const bytes = await readFile(fileURLToPath(url));
        return new Response(bytes, {
          status: 200,
          headers: { "content-length": String(bytes.byteLength) },
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const mod = await loadRuntimeModule();
    await mod.bscSccpProve(destinationRequest(runtime.destination.material));

    expect(calls).toHaveLength(1);
    expect(fetches.length).toBeGreaterThan(8);
    expect(fetches.map((entry) => entry.url)).toContain(tree.configUrl);
    for (const entry of fetches) {
      expect(entry.init).toEqual({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
    }
  });

  it("rejects destination proof requests whose fields are only inherited", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();
    await expect(
      mod.bscSccpProve(
        Object.create(destinationRequest(runtime.destination.material)),
      ),
    ).rejects.toThrow(/BSC proof request must be a plain object/u);
    expect(calls).toEqual([]);
  });

  it("ignores polluted destination binding fields before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;
    const pollutedKeys = {
      verifierAddress: BSC_VERIFIER_ADDRESS,
      bridgeAddress: BSC_BRIDGE_ADDRESS,
    };

    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const request = {
        ...destinationRequest(runtime.destination.material),
        destinationBinding: {},
      };
      const mod = await loadRuntimeModule();

      await expect(mod.bscSccpProve(request)).rejects.toThrow(
        /verifierAddress/u,
      );
      expect(calls).toEqual([]);
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("imports backend code from the hash-verified bytes instead of refetching a mutable URL", async () => {
    const runtime = buildRuntimeConfig();
    const tree = await writeRuntimeConfigTree(runtime);
    const backendPath = path.join(tree.root, "destination", "backend.mjs");
    const swappedBackend = backendModuleConfig({
      destinationResultMutation: `result.routeId = "evil_route";`,
    });
    const calls = [];
    globalThis.IrohaSccpBscProverConfigUrl = tree.configUrl;
    globalThis.IrohaSccpBscProverTestCalls = calls;
    globalThis.fetch = async (input, init) => {
      const url = fetchInputUrl(input);
      if (typeof url === "string" && url.startsWith("file:")) {
        const filePath = fileURLToPath(url);
        const bytes = await readFile(filePath);
        if (filePath === backendPath) {
          await writeFile(backendPath, swappedBackend.bytes);
        }
        return new Response(bytes, {
          status: 200,
          headers: { "content-length": String(bytes.byteLength) },
        });
      }
      return originalFetch(input, init);
    };

    const mod = await loadRuntimeModule();
    const result = await mod.bscSccpProve(
      destinationRequest(runtime.destination.material),
    );

    expect(result.routeId).toBe(SCCP_BSC_XOR_ROUTE_ID);
    expect(calls).toHaveLength(1);
  });

  it("rejects destination backends without a native prover self-test before proof execution", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, { missingSelfTest: true });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/does not export configured native prover self-test/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects destination backends whose native self-test implementation hash drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      selfTestResultMutation: `result.implementationHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/implementationHash must match the audited native SDK/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects destination backends whose native self-test proof hash drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      selfTestResultMutation: `result.proofHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofHash must match audited native prover self-test/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects destination backends whose native self-test uses duplicate aliases", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      selfTestResultMutation: "result.proof_hash = result.proofHash;",
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofHash must not use multiple aliases/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects BSC destination proof packages with drifted request hashes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.requestHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/requestHash must match the destination request/u);
    expect(calls).toHaveLength(1);
  });

  it("rejects BSC destination requests with destination binding alias smuggling before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;
    const request = destinationRequest(runtime.destination.material);
    request.destination_binding = { ...request.destinationBinding };

    const mod = await loadRuntimeModule();

    await expect(mod.bscSccpProve(request)).rejects.toThrow(
      /destinationBinding must not use multiple aliases/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects BSC destination proof packages with unsafe route ids", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.routeId = "evil_route";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/route must be taira_bsc_xor/u);
  });

  it("rejects BSC destination proof packages with wrong assets", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.assetKey = "dot";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/asset must be XOR/u);
  });

  it("rejects BSC destination proof packages with proof artifact drift", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.proofArtifactHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofArtifactHash must match the destination request/u);
  });

  it("rejects BSC destination proof packages with destination binding drift", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.destinationBindingHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destinationBindingHash must match the destination request/u,
    );
  });

  it("rejects BSC destination proof packages with native bundle hash drift", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.nativeEvmProverBundleHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /nativeEvmProverBundleHash must match the destination request/u,
    );
  });

  it("rejects BSC destination proof packages whose bridge address drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: `result.destinationBinding = { ...result.destinationBinding, bridgeAddress: "${BSC_VERIFIER_ADDRESS}" };`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/bridgeAddress must match the destination request/u);
  });

  it("loads hash-bound source material before delegating to a backend", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();
    const result = await mod.bscSccpSourceProve(
      sourceRequest(runtime.source.material),
    );

    expect(result).toMatchObject({
      sourceEventDigest: HASH_22,
      txId: HASH_44,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      direction: "source",
      proofArtifactHash: runtime.source.material.proofArtifactHash,
      provingKeyHash: runtime.source.material.provingKeyHash,
      nativeEvmProverBundleHash:
        runtime.source.material.nativeEvmProverBundleHash,
    });
    expect(calls[0].nativeSdkImplementationBytes.javascript).toBeInstanceOf(
      Uint8Array,
    );
  });

  it("ignores polluted source request fields before source proof binding", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const valid = sourceRequest(runtime.source.material);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;
    const pollutedKeys = {
      amountDecimal: valid.amountDecimal,
      bscSender: valid.bscSender,
      tairaRecipient: valid.tairaRecipient,
      sourceNonce: valid.sourceNonce,
      sourceCanonicalBscSender: valid.sourceCanonicalBscSender,
      sourcePayloadHash: valid.sourcePayloadHash,
      sourceMessageId: valid.sourceMessageId,
      sourceCommitmentRoot: valid.sourceCommitmentRoot,
    };

    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const request = {
        proofArtifactHash: valid.proofArtifactHash,
        provingKeyHash: valid.provingKeyHash,
        nativeEvmProverBundleHash: valid.nativeEvmProverBundleHash,
        txId: valid.txId,
        sourceEventDigest: valid.sourceEventDigest,
      };
      const mod = await loadRuntimeModule();

      await expect(mod.bscSccpSourceProve(request)).rejects.toThrow(
        /amountDecimal/u,
      );
      expect(calls).toHaveLength(1);
      expect(calls[0].request).not.toMatchObject({
        bscSender: BSC_BRIDGE_ADDRESS,
        tairaRecipient: TAIRA_RECIPIENT,
      });
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("rejects source backends without a native prover self-test before proof execution", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, { missingSelfTest: true });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/does not export configured native prover self-test/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects source backends whose native self-test SDK binding drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      selfTestResultMutation: `result.sdk = "swift";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sdk must be javascript/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects source backends whose native self-test public signals drift", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      selfTestResultMutation: `result.publicSignalWords = [...result.publicSignalWords]; result.publicSignalWords[0] = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/publicSignalWords must match audited native prover/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects BSC source proof packages with drifted transaction ids", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.txId = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/txId must match the source request/u);
    expect(calls).toHaveLength(1);
  });

  it("rejects BSC source proof packages with drifted proof material hashes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.proofArtifactHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/proofArtifactHash must match the source request/u);
  });

  it("rejects BSC source proof packages with drifted native prover bundle hashes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.nativeEvmProverBundleHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /nativeEvmProverBundleHash must match the source request/u,
    );
  });

  it("rejects BSC source proof packages with unsafe settlement routes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.settlement.route = "evil_route";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/settlement route must be taira_bsc_xor/u);
  });

  it("rejects BSC source proof packages with wrong commitment kinds", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.commitment.kind = "Mint";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/commitment kind must be Transfer/u);
  });

  it("rejects BSC source proof packages with drifted message bundle ids", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.commitment.messageId = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/messageId must match messageBundle commitment/u);
  });

  it("rejects BSC source proof packages with drifted commitment payload hashes", async () => {
    const runtime = buildRuntimeConfig();
    const request = sourceRequest(runtime.source.material);
    const driftedCommitmentRoot = sccpMerkleRootFromCommitment(
      {
        version: 1,
        kind: "Transfer",
        target_domain: 0,
        message_id: request.sourceMessageId,
        payload_hash: HASH_55,
      },
      { steps: [] },
    );
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.commitment.payloadHash = "${HASH_55}"; result.messageBundle.commitmentRoot = "${driftedCommitmentRoot}"; result.payloadHash = "${HASH_55}"; result.publicInputs.payloadHash = "${HASH_55}"; result.publicInputs.commitmentRoot = "${driftedCommitmentRoot}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(mod.bscSccpSourceProve(request)).rejects.toThrow(
      /payloadHash must match the canonical transfer payload/u,
    );
  });

  it("rejects BSC source proof packages whose top-level payload hash drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.payloadHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /payloadHash must match messageBundle commitment payloadHash/u,
    );
  });

  it("rejects BSC source proof packages whose public-input payload hash drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.publicInputs.payloadHash = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /publicInputs payloadHash must match messageBundle commitment payloadHash/u,
    );
  });

  it("rejects BSC source proof packages that omit public inputs", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `delete result.publicInputs;`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/source proof package publicInputs is missing/u);
  });

  it("rejects BSC source proof packages with public input alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.public_inputs = { ...result.publicInputs };`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/publicInputs must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with top-level hash alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation:
        "result.proof_artifact_hash = result.proofArtifactHash;",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/proofArtifactHash must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with message bundle alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation:
        "result.message_bundle = { ...result.messageBundle };",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/messageBundle must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with nested commitment root aliases", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation:
        "result.messageBundle.commitment_root = result.messageBundle.commitmentRoot;",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/commitmentRoot must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with nested Merkle proof aliases", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation:
        "result.messageBundle.merkle_proof = { ...result.messageBundle.merkleProof };",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/merkleProof must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with Merkle step hash alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.merkleProof.steps = [{ sibling_hash: "${HASH_55}", siblingHash: "${HASH_55}", sibling_is_left: false }];`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sibling_hash must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with Merkle step side alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.merkleProof.steps = [{ sibling_hash: "${HASH_55}", sibling_is_left: false, siblingIsLeft: false }];`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sibling_is_left must not use multiple aliases/u);
  });

  it("rejects BSC source proof packages with payload Transfer alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation:
        "result.messageBundle.payload.Transfer = { ...result.messageBundle.payload.value };",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/payload must not use multiple Transfer aliases/u);
  });

  it("rejects BSC source proof packages whose public-input direction drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.publicInputs.targetDomain = 2;`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/publicInputs must bind BSC -> TAIRA/u);
  });

  it("rejects BSC source proof packages whose public-input transaction binding drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.publicInputs.txId = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/publicInputs txId must match the source transaction/u);
  });

  it("rejects BSC source proof packages whose public-input event binding drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.publicInputs.sourceEventDigest = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /publicInputs sourceEventDigest must match the source event digest/u,
    );
  });

  it("rejects BSC source proof packages whose canonical transfer nonce drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.payload.value.nonce = "2";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/payloadHash must match the canonical transfer payload/u);
  });

  it("rejects BSC source proof packages with wrong transfer codecs", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.payload.value.sender_codec = 1;`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sender codec must be 2/u);
  });

  it("rejects BSC source proof packages with malformed Merkle proof steps", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.merkleProof.steps = [{ sibling_hash: "${HASH_55}", sibling_is_left: "yes" }];`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sibling_is_left must be boolean/u);
  });

  it("rejects BSC source proof packages with zero finality proof bytes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.finalityProof = "0x0000";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/finalityProof must be non-zero/u);
  });

  it("rejects BSC source proof packages whose commitment root drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.commitmentRoot = "${HASH_55}"; result.publicInputs.commitmentRoot = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/commitmentRoot must match the commitment Merkle proof/u);
  });

  it("rejects BSC source proof packages whose top-level commitment root drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.commitmentRoot = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /commitmentRoot must match messageBundle commitmentRoot/u,
    );
  });

  it("rejects BSC source proof packages whose Merkle proof drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.merkleProof.steps = [{ sibling_hash: "${HASH_55}", sibling_is_left: false }];`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/commitmentRoot must match the commitment Merkle proof/u);
  });

  it("rejects BSC source proof packages with drifted source event digests", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.sourceEventDigest = "${HASH_55}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/sourceEventDigest must match the source request/u);
  });

  it("rejects BSC source proof packages whose transfer sender drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.payload.value.sender = "${BSC_VERIFIER_ADDRESS}";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/transfer sender must match the source request/u);
  });

  it("rejects BSC source proof packages whose transfer amount drifts", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.source, {
      sourceResultMutation: `result.messageBundle.payload.value.amount = "2";`,
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/transfer amount must match the source request/u);
  });

  it("loads BSC mainnet profile-bound material before backend execution", async () => {
    const runtime = buildRuntimeConfig({}, BSC_PROFILES.mainnet);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();
    await mod.bscSccpProve(destinationRequest(runtime.destination.material));
    await mod.bscSccpSourceProve(sourceRequest(runtime.source.material));

    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      direction: "destination",
      bscNetwork: "mainnet",
      bscChain: BSC_PROFILES.mainnet.chain,
      bscChainIdHex: BSC_PROFILES.mainnet.chainIdHex,
      bscNetworkIdHex: BSC_PROFILES.mainnet.networkIdHex,
      nativeEvmProverBundleHash:
        runtime.destination.material.nativeEvmProverBundleHash,
    });
    expect(calls[0].nativeEvmProverBundleDescriptor).toMatchObject({
      bundleId: BSC_PROFILES.mainnet.bundleId,
      chain: BSC_PROFILES.mainnet.chain,
    });
    expect(calls[0].crossSdkParity).toMatchObject({
      schema: BSC_PROFILES.mainnet.paritySchema,
    });
    expect(calls[1]).toMatchObject({
      direction: "source",
      bscNetwork: "mainnet",
      nativeEvmProverBundleHash:
        runtime.source.material.nativeEvmProverBundleHash,
    });
    expect(calls[1].nativeProverSelfTest).toMatchObject({
      schema: BSC_PROFILES.mainnet.selfTestSchema,
    });
  });

  it("rejects BSC mainnet configs carrying testnet native bundle identity", async () => {
    const runtime = buildRuntimeConfig({}, BSC_PROFILES.mainnet);
    mutateDirectionNativeBundle(runtime.destination, (record) => {
      record.bundle_id = BSC_PROFILES.testnet.bundleId;
      record.chain = BSC_PROFILES.testnet.chain;
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /native EVM prover bundle id must be sccp:bsc:native-evm-groth16-prover:bsc-mainnet:v1/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects BSC mainnet configs carrying testnet native support fixtures", async () => {
    const runtime = buildRuntimeConfig({}, BSC_PROFILES.mainnet);
    const binding = {
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      destinationBindingHash: HASH_33,
    };
    const testnetParity = nativeSupportArtifactBytes({
      seed: 901,
      kind: "parity",
      binding,
      profile: BSC_PROFILES.testnet,
    });
    runtime.destination.nativeArtifacts.parity = testnetParity;
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(testnetParity);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
      profile: BSC_PROFILES.mainnet,
    });
    refreshDirectionNativeBundle(
      runtime.destination,
      HASH_33,
      BSC_PROFILES.mainnet,
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /cross-SDK parity artifact schema must be sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects legacy fixture parity support schemas before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    const parity = JSON.parse(
      runtime.destination.nativeArtifacts.parity.toString("utf8"),
    );
    parity.schema = BSC_PROFILES.testnet.legacyParitySchema;
    runtime.destination.nativeArtifacts.parity = Buffer.from(
      `${JSON.stringify(parity, null, 2)}\n`,
      "utf8",
    );
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(
      runtime.destination.nativeArtifacts.parity,
    );
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /cross-SDK parity artifact schema must be sccp-bsc-testnet-native-evm-cross-sdk-parity-v1/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects streamed runtime configs that exceed the byte limit without content-length", async () => {
    const runtime = buildRuntimeConfig();
    const configUrl =
      "https://cdn.example.invalid/taira-bsc-xor-prover.config.json";
    const calls = [];
    globalThis.IrohaSccpBscProverConfigUrl = configUrl;
    globalThis.IrohaSccpBscProverTestCalls = calls;
    globalThis.fetch = async (input) => {
      const url = fetchInputUrl(input);
      if (url === configUrl) {
        return streamingResponse([
          new Uint8Array(512 * 1024),
          new Uint8Array([0x7b]),
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/BSC prover config is too large/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects streamed runtime material that exceeds the byte limit without content-length", async () => {
    const runtime = buildRuntimeConfig();
    const configUrl =
      "https://cdn.example.invalid/taira-bsc-xor-prover.config.json";
    const bundleUrl =
      "https://cdn.example.invalid/destination/native/bundle.json";
    const calls = [];
    runtime.config.destination.nativeProverBundleUrl = bundleUrl;
    globalThis.IrohaSccpBscProverConfigUrl = configUrl;
    globalThis.IrohaSccpBscProverTestCalls = calls;
    globalThis.fetch = async (input) => {
      const url = fetchInputUrl(input);
      if (url === configUrl) {
        return new Response(`${JSON.stringify(runtime.config)}\n`, {
          status: 200,
        });
      }
      if (url === bundleUrl) {
        return streamingResponse([
          new Uint8Array(512 * 1024),
          new Uint8Array([0x7b]),
        ]);
      }
      throw new Error(`unexpected fetch ${url}`);
    };

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/destination native prover bundle is too large/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects artifact hash drift before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.proofArtifactSha256 = `0x${"aa".repeat(32)}`;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/sha256 .* does not match/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects unsupported edited runtime config fields before backend execution", async () => {
    const cases = [
      {
        mutate(runtime) {
          runtime.config.operatorPrivateKey = "0x" + "11".repeat(32);
        },
        pattern:
          /BSC prover config contains unsupported field \[redacted unsupported field\]/u,
        forbidden: ["operatorPrivateKey"],
      },
      {
        mutate(runtime) {
          runtime.config.destination.customData = {
            relayer: BSC_BRIDGE_ADDRESS,
          };
        },
        pattern:
          /destination BSC prover config contains unsupported field customData/u,
        forbidden: [],
      },
      {
        mutate(runtime) {
          runtime.config.bscChain = "bsc-mainnet";
        },
        pattern: /bscChain must be bsc-testnet for BSC testnet/u,
        forbidden: [],
      },
    ];

    for (const { mutate, pattern, forbidden } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      let message = "";
      try {
        await mod.bscSccpProve(
          destinationRequest(runtime.destination.material),
        );
      } catch (error) {
        message = error instanceof Error ? error.message : String(error);
      }
      expect(message).toMatch(pattern);
      for (const value of forbidden) {
        expect(message).not.toContain(value);
      }
      expect(calls).toHaveLength(0);
    }
  });

  it("rejects runtime configs with duplicate top-level profile aliases", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.bsc_network = runtime.config.bscNetwork;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /BSC prover config network must not use multiple aliases/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects runtime direction configs with duplicate material aliases", async () => {
    const cases = [
      {
        name: "native bundle URL",
        mutate(runtime) {
          runtime.config.destination.native_prover_bundle_url =
            runtime.config.destination.nativeProverBundleUrl;
        },
        expected:
          /destination native prover bundle URL must not use multiple aliases/u,
      },
      {
        name: "native bundle sha256",
        mutate(runtime) {
          runtime.config.destination.native_prover_bundle_sha256 =
            runtime.config.destination.nativeProverBundleSha256;
        },
        expected:
          /destination native prover bundle sha256 must not use multiple aliases/u,
      },
      {
        name: "native EVM bundle descriptor hash",
        mutate(runtime) {
          runtime.config.destination.native_evm_prover_bundle_hash =
            runtime.config.destination.nativeEvmProverBundleHash;
        },
        expected:
          /destination native EVM prover bundle descriptor hash must not use multiple aliases/u,
      },
      {
        name: "native artifact base URL",
        mutate(runtime) {
          runtime.config.destination.native_prover_artifact_base_url =
            runtime.config.destination.nativeProverArtifactBaseUrl;
        },
        expected:
          /destination native prover artifact base URL must not use multiple aliases/u,
      },
      {
        name: "native SDK allowlist",
        mutate(runtime) {
          runtime.config.destination.native_prover_verified_sdks = [
            ...runtime.config.destination.nativeProverVerifiedSdks,
          ];
        },
        expected:
          /destination native prover verified SDK list must not use multiple aliases/u,
      },
      {
        name: "backend module URL",
        mutate(runtime) {
          runtime.config.destination.backend_module_url =
            runtime.config.destination.backendModuleUrl;
        },
        expected:
          /destination backend module URL must not use multiple aliases/u,
      },
      {
        name: "backend module sha256",
        mutate(runtime) {
          runtime.config.destination.backend_module_sha256 =
            runtime.config.destination.backendModuleSha256;
        },
        expected:
          /destination backend module sha256 must not use multiple aliases/u,
      },
      {
        name: "backend accepted export",
        mutate(runtime) {
          runtime.config.destination.backend_accepted_export =
            runtime.config.destination.backendAcceptedExport;
        },
        expected:
          /destination backend accepted export must not use multiple aliases/u,
      },
      {
        name: "backend accepted self-test export",
        mutate(runtime) {
          runtime.config.destination.backend_accepted_self_test_export =
            runtime.config.destination.backendAcceptedSelfTestExport;
        },
        expected:
          /destination backend accepted self-test export must not use multiple aliases/u,
      },
      {
        name: "backend self-contained flag",
        mutate(runtime) {
          runtime.config.destination.backend_self_contained =
            runtime.config.destination.backendSelfContained;
        },
        expected:
          /destination backendSelfContained must not use multiple aliases/u,
      },
      {
        name: "proof artifact URL",
        mutate(runtime) {
          runtime.config.destination.proof_artifact_url =
            runtime.config.destination.proofArtifactUrl;
        },
        expected:
          /destination proof artifact URL must not use multiple aliases/u,
      },
      {
        name: "proof artifact sha256",
        mutate(runtime) {
          runtime.config.destination.proof_artifact_sha256 =
            runtime.config.destination.proofArtifactSha256;
        },
        expected:
          /destination proof artifact sha256 must not use multiple aliases/u,
      },
      {
        name: "proving key URL",
        mutate(runtime) {
          runtime.config.destination.proving_key_url =
            runtime.config.destination.provingKeyUrl;
        },
        expected: /destination proving key URL must not use multiple aliases/u,
      },
      {
        name: "proving key sha256",
        mutate(runtime) {
          runtime.config.destination.proving_key_sha256 =
            runtime.config.destination.provingKeySha256;
        },
        expected:
          /destination proving key sha256 must not use multiple aliases/u,
      },
      {
        name: "verifier key URL",
        mutate(runtime) {
          runtime.config.destination.verifier_key_url =
            runtime.config.destination.verifierKeyUrl;
        },
        expected: /destination verifier key URL must not use multiple aliases/u,
      },
      {
        name: "verifier key sha256",
        mutate(runtime) {
          runtime.config.destination.verifier_key_sha256 =
            runtime.config.destination.verifierKeySha256;
        },
        expected:
          /destination verifier key sha256 must not use multiple aliases/u,
      },
    ];

    for (const { mutate, expected, name } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
        name,
      ).rejects.toThrow(expected);
      expect(calls, name).toHaveLength(0);
    }
  });

  it("rejects runtime direction configs without self-contained backend declarations", async () => {
    const cases = [
      {
        name: "missing destination flag",
        mutate(runtime) {
          delete runtime.config.destination.backendSelfContained;
        },
        expected: /destination backendSelfContained is missing/u,
      },
      {
        name: "false destination flag",
        mutate(runtime) {
          runtime.config.destination.backendSelfContained = false;
        },
        expected: /destination backendSelfContained must be true/u,
      },
      {
        name: "string source flag",
        mutate(runtime) {
          runtime.config.source.backendSelfContained = "true";
        },
        expected: /source backendSelfContained must be true/u,
      },
    ];

    for (const { name, mutate, expected } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
        name,
      ).rejects.toThrow(expected);
      expect(calls, name).toHaveLength(0);
    }
  });

  it("rejects duplicate JSON object keys in hosted runtime config before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    const tree = await writeRuntimeConfigTree(runtime);
    await writeFile(
      fileURLToPath(tree.configUrl),
      jsonBytesWithDuplicateKey(
        await readFile(fileURLToPath(tree.configUrl)),
        "schema",
        runtime.config.schema,
      ),
    );
    installFileFetch();
    const calls = [];
    globalThis.IrohaSccpBscProverConfigUrl = tree.configUrl;
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /BSC prover config contains a duplicate JSON object key/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects duplicate JSON object keys in hosted native bundles before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.destination.material.bundle = jsonBytesWithDuplicateKey(
      runtime.destination.material.bundle,
      "schema",
      BSC_PROFILES.testnet.bundleId,
    );
    runtime.destination.material.bundleHash = sha256Hex(
      runtime.destination.material.bundle,
    );
    runtime.destination.config.nativeProverBundleSha256 =
      runtime.destination.material.bundleHash;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination native prover bundle contains a duplicate JSON object key/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects runtime config fields supplied only by Object.prototype", async () => {
    const runtime = buildRuntimeConfig();
    const inheritedSchema = runtime.config.schema;
    delete runtime.config.schema;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;
    const previousSchema = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "schema",
    );

    try {
      Object.defineProperty(Object.prototype, "schema", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: inheritedSchema,
      });

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(/BSC prover config schema is missing/u);
      expect(calls).toHaveLength(0);
    } finally {
      if (previousSchema) {
        Object.defineProperty(Object.prototype, "schema", previousSchema);
      } else {
        delete Object.prototype.schema;
      }
    }
  });

  it("rejects runtime configs that smuggle route hash aliases into material sha256 fields", async () => {
    const cases = [
      {
        name: "destination proofArtifactHash",
        direction: "destination",
        field: "proofArtifactHash",
        mutate(runtime) {
          delete runtime.config.destination.proofArtifactSha256;
          runtime.config.destination.proofArtifactHash =
            runtime.destination.material.proofArtifactHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpProve(
            destinationRequest(runtime.destination.material),
          );
        },
      },
      {
        name: "destination proof_artifact_hash",
        direction: "destination",
        field: "proof_artifact_hash",
        mutate(runtime) {
          delete runtime.config.destination.proofArtifactSha256;
          runtime.config.destination.proof_artifact_hash =
            runtime.destination.material.proofArtifactHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpProve(
            destinationRequest(runtime.destination.material),
          );
        },
      },
      {
        name: "source provingKeyHash",
        direction: "source",
        field: "provingKeyHash",
        mutate(runtime) {
          delete runtime.config.source.provingKeySha256;
          runtime.config.source.provingKeyHash =
            runtime.source.material.provingKeyHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpSourceProve(sourceRequest(runtime.source.material));
        },
      },
      {
        name: "source proving_key_hash",
        direction: "source",
        field: "proving_key_hash",
        mutate(runtime) {
          delete runtime.config.source.provingKeySha256;
          runtime.config.source.proving_key_hash =
            runtime.source.material.provingKeyHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpSourceProve(sourceRequest(runtime.source.material));
        },
      },
    ];

    for (const { name, direction, field, mutate, prove } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(prove(mod, runtime), name).rejects.toThrow(
        new RegExp(
          `${direction} BSC prover config contains unsupported field ${field}`,
          "u",
        ),
      );
      expect(calls, name).toHaveLength(0);
    }
  });

  it("rejects native prover bundle descriptor URLs with generic file extensions before fetching", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.nativeProverBundleUrl =
      "./destination/native/bundle.bin";
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination native prover bundle must be loaded from a \.json artifact URL/u,
    );
    expect(calls).toHaveLength(0);
  });

  it.each([
    ["parent directory", "../proof-artifact.r1cs"],
    ["encoded parent directory", ".%2e/proof-artifact.r1cs"],
    ["double-encoded parent directory", ".%252e/proof-artifact.r1cs"],
    ["over-encoded parent directory", ".%252525252e/proof-artifact.r1cs"],
  ])(
    "rejects runtime material URLs with %s segments",
    async (_label, proofArtifactUrl) => {
      const runtime = buildRuntimeConfig();
      runtime.config.destination.proofArtifactUrl = proofArtifactUrl;
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(
        /destination proof artifact must not include parent directory segments/u,
      );
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    ["encoded parent directory", "%2e%2e/proof-artifact.r1cs"],
    ["double-encoded parent directory", "%252e%252e/proof-artifact.r1cs"],
    [
      "over-encoded parent directory",
      "%252525252e%252525252e/proof-artifact.r1cs",
    ],
  ])(
    "rejects native bundle artifact paths with %s segments",
    async (_label, artifactPath) => {
      const runtime = buildRuntimeConfig();
      mutateDirectionNativeBundle(runtime.destination, (record) => {
        record.cross_sdk_parity_artifact = artifactPath;
      });
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(
        /crossSdkParityArtifact must stay under the native prover artifact base URL/u,
      );
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    [
      "proof artifact",
      (record) => {
        record.proof_artifact = "proof-artifact.bin";
      },
      /proofArtifact must reference a \.r1cs artifact/u,
    ],
    [
      "proving key",
      (record) => {
        record.proving_key = "proving-key.bin";
      },
      /provingKey must reference a \.zkey artifact/u,
    ],
    [
      "cross-SDK parity support artifact",
      (record) => {
        record.cross_sdk_parity_artifact = "cross-sdk-parity.fixture";
      },
      /crossSdkParityArtifact must reference a \.json artifact/u,
    ],
    [
      "native self-test support artifact",
      (record) => {
        record.native_prover_self_test_artifact =
          "native-prover-self-test.fixture";
      },
      /nativeProverSelfTestArtifact must reference a \.json artifact/u,
    ],
  ])(
    "rejects native bundle %s paths with generic file extensions",
    async (_label, mutateRecord, errorPattern) => {
      const runtime = buildRuntimeConfig();
      mutateDirectionNativeBundle(runtime.destination, mutateRecord);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(errorPattern);
      expect(calls).toHaveLength(0);
    },
  );

  it.each([
    [
      "cross-SDK parity support artifact",
      (record) => {
        record.cross_sdk_parity_artifact = "cross-sdk-fixture-parity.json";
      },
      /cross-SDK parity artifact must not reference diagnostic, fixture, mock, placeholder, sample, stub, or test-only material/u,
    ],
    [
      "native self-test support artifact",
      (record) => {
        record.native_prover_self_test_artifact =
          "sample-native-prover-self-test.json";
      },
      /self-test artifact must not reference diagnostic, fixture, mock, placeholder, sample, stub, or test-only material/u,
    ],
  ])(
    "rejects native bundle %s paths with non-production markers",
    async (_label, mutateRecord, errorPattern) => {
      const runtime = buildRuntimeConfig();
      mutateDirectionNativeBundle(runtime.destination, mutateRecord);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(errorPattern);
      expect(calls).toHaveLength(0);
    },
  );

  it("rejects runtime configs that reuse proof and proving-key roles", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.source.provingKeySha256 =
      runtime.config.source.proofArtifactSha256;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /source proving key sha256 matches source proof artifact sha256/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects runtime configs that reuse raw and descriptor native bundle hashes", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.source.nativeEvmProverBundleHash =
      runtime.config.source.nativeProverBundleSha256;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /source native EVM prover bundle descriptor hash matches source native prover bundle sha256/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent repeated-byte runtime proof artifacts", async () => {
    const runtime = buildRuntimeConfig();
    retargetDirectionProofMaterial(runtime.destination, {
      proofArtifact: Buffer.alloc(96 * 1024, 0xa7),
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact looks like non-production proof material: repeated 1-byte pattern/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent repeated-pattern runtime proving keys", async () => {
    const runtime = buildRuntimeConfig();
    const provingKey = Buffer.alloc(96 * 1024);
    for (let index = 0; index < provingKey.length; index += 1) {
      provingKey[index] = index % 32;
    }
    retargetDirectionProofMaterial(runtime.source, {
      provingKey,
      destinationBindingHash: HASH_44,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /source proving key looks like non-production proof material: repeated 32-byte pattern/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proof artifacts with invalid r1cs headers", async () => {
    const runtime = buildRuntimeConfig();
    const proofArtifact = proofArtifactMaterialBytes(0x77);
    proofArtifact[0] = 0x78;
    retargetDirectionProofMaterial(runtime.destination, {
      proofArtifact,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact must start with \.r1cs magic bytes/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proof artifacts loaded from wasm URLs", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.proofArtifactUrl =
      "./destination/proof-artifact.wasm";
    const tree = await installRuntimeConfig(runtime);
    await writeFile(
      path.join(tree.root, "destination", "proof-artifact.wasm"),
      runtime.destination.material.proofArtifact,
    );
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact must be loaded from a \.r1cs artifact URL/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects proving-key material URLs with generic file extensions before fetching", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.source.provingKeyUrl = "./source/proving-key.bin";
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /source proving key must be loaded from a \.zkey artifact URL/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proving keys with invalid zkey headers", async () => {
    const runtime = buildRuntimeConfig();
    const provingKey = provingKeyMaterialBytes(0x78);
    provingKey[0] = 0x78;
    retargetDirectionProofMaterial(runtime.source, {
      provingKey,
      destinationBindingHash: HASH_44,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/source proving key must start with \.zkey magic bytes/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proof artifacts with invalid SnarkJS section tables", async () => {
    const runtime = buildRuntimeConfig();
    const proofArtifact = proofArtifactMaterialBytes(0x79);
    proofArtifact.writeUInt32LE(proofArtifact.length, 16);
    retargetDirectionProofMaterial(runtime.destination, {
      proofArtifact,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact .*section exceeds file size/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proof artifacts with unsupported r1cs section ids", async () => {
    const runtime = buildRuntimeConfig();
    const proofArtifact = proofArtifactMaterialBytes(0x7a);
    proofArtifact.writeUInt32LE(4, 12);
    retargetDirectionProofMaterial(runtime.destination, {
      proofArtifact,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact \.r1cs missing required section ids: 1/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proof artifacts with out-of-order r1cs section ids", async () => {
    const runtime = buildRuntimeConfig();
    const proofArtifact = proofArtifactMaterialBytes(0x7c);
    swapSnarkjsSectionIds(proofArtifact, 0, 2);
    retargetDirectionProofMaterial(runtime.destination, {
      proofArtifact,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact \.r1cs section ids must be in canonical order: 1, 2, 3/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proving keys with unsupported zkey section ids", async () => {
    const runtime = buildRuntimeConfig();
    const provingKey = provingKeyMaterialBytes(0x7b);
    provingKey.writeUInt32LE(11, 12);
    retargetDirectionProofMaterial(runtime.source, {
      provingKey,
      destinationBindingHash: HASH_44,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /source proving key \.zkey missing required section ids: 1/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects hash-consistent proving keys with out-of-order zkey section ids", async () => {
    const runtime = buildRuntimeConfig();
    const provingKey = provingKeyMaterialBytes(0x7d);
    swapSnarkjsSectionIds(provingKey, 0, 9);
    retargetDirectionProofMaterial(runtime.source, {
      provingKey,
      destinationBindingHash: HASH_44,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(
      /source proving key \.zkey section ids must be in canonical order: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects configs missing the native EVM prover bundle descriptor hash", async () => {
    const runtime = buildRuntimeConfig();
    delete runtime.config.destination.nativeEvmProverBundleHash;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/native EVM prover bundle descriptor hash is missing/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects semantic verifier-key hash aliases in runtime material config", async () => {
    const cases = [
      {
        direction: "destination",
        field: "verifierKeyHash",
        mutate(runtime) {
          delete runtime.config.destination.verifierKeySha256;
          runtime.config.destination.verifierKeyHash =
            runtime.destination.material.verifierKeyArtifactHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpProve(
            destinationRequest(runtime.destination.material),
          );
        },
      },
      {
        direction: "source",
        field: "verifier_key_hash",
        mutate(runtime) {
          delete runtime.config.source.verifierKeySha256;
          runtime.config.source.verifier_key_hash =
            runtime.source.material.verifierKeyArtifactHash;
        },
        prove(mod, runtime) {
          return mod.bscSccpSourceProve(sourceRequest(runtime.source.material));
        },
      },
    ];

    for (const { direction, field, mutate, prove } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(prove(mod, runtime), direction).rejects.toThrow(
        new RegExp(
          `${direction} BSC prover config contains unsupported field ${field}`,
          "u",
        ),
      );
      expect(calls, direction).toHaveLength(0);
    }
  });

  it("rejects runtime configs that declare known diagnostic BSC verifier key hashes", async () => {
    const cases = [
      {
        direction: "destination",
        mutate(runtime) {
          runtime.config.destination.verifierKeySha256 =
            DIAGNOSTIC_BSC_VERIFIER_KEY_HASH;
        },
        prove(mod, runtime) {
          return mod.bscSccpProve(
            destinationRequest(runtime.destination.material),
          );
        },
      },
      {
        direction: "source",
        mutate(runtime) {
          runtime.config.source.verifierKeySha256 =
            DIAGNOSTIC_BSC_VERIFIER_KEY_HASH;
        },
        prove(mod, runtime) {
          return mod.bscSccpSourceProve(sourceRequest(runtime.source.material));
        },
      },
    ];

    for (const { direction, mutate, prove } of cases) {
      const runtime = buildRuntimeConfig();
      mutate(runtime);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(prove(mod, runtime), direction).rejects.toThrow(
        /known diagnostic BSC verifier key hash/u,
      );
      expect(calls, direction).toHaveLength(0);
    }
  });

  it("rejects native EVM prover bundle descriptor hash drift before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.nativeEvmProverBundleHash = HASH_55;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /native EVM prover bundle descriptor hash .* does not match/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects raw native EVM prover bundle swaps when the descriptor hash is stale", async () => {
    const runtime = buildRuntimeConfig();
    mutateDirectionNativeBundle(runtime.destination, (record) => {
      record.audit_hashes.no_wasm_no_remote_scan = supportHash(
        331,
        "stale no-wasm scan hash drift",
      );
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /native EVM prover bundle descriptor hash .* does not match/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects native EVM prover bundle descriptor alias smuggling before backend execution", async () => {
    const cases = [
      {
        name: "proof artifact path",
        mutate(record) {
          record.proofArtifact = record.proof_artifact;
        },
        expected:
          /native EVM prover bundle proofArtifact must not use multiple aliases/u,
      },
      {
        name: "audit hash container",
        mutate(record) {
          record.auditHashes = { ...record.audit_hashes };
        },
        expected:
          /native EVM prover bundle auditHashes must not use multiple aliases/u,
      },
      {
        name: "SDK artifact container",
        mutate(record) {
          record.nativeSdkArtifacts = record.native_sdk_artifacts.map(
            (row) => ({
              ...row,
            }),
          );
        },
        expected:
          /native EVM prover bundle nativeSdkArtifacts must not use multiple aliases/u,
      },
      {
        name: "SDK proof hash",
        mutate(record) {
          record.native_sdk_artifacts[0].proofArtifactHash =
            record.native_sdk_artifacts[0].prover_artifact_hash;
        },
        expected:
          /native EVM prover bundle dotnet proofArtifactHash must not use multiple aliases/u,
      },
      {
        name: "SDK implementation artifact",
        mutate(record) {
          record.native_sdk_artifacts[0].implementationArtifact =
            record.native_sdk_artifacts[0].implementation_artifact;
        },
        expected:
          /native EVM prover bundle dotnet implementationArtifact must not use multiple aliases/u,
      },
    ];

    for (const { mutate, expected, name } of cases) {
      const runtime = buildRuntimeConfig();
      mutateDirectionNativeBundle(runtime.destination, mutate);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
        name,
      ).rejects.toThrow(expected);
      expect(calls, name).toHaveLength(0);
    }
  });

  it("rejects placeholder native EVM prover bundle audit hashes before backend execution", async () => {
    const cases = [
      {
        label: "repeated",
        mutate(record) {
          record.audit_hashes.native_implementation_audit = HASH_22;
        },
        pattern:
          /destination native EVM prover bundle auditHashes\.native_implementation_audit must not look like a placeholder audit hash: repeated 1-byte pattern/u,
      },
      {
        label: "arithmetic",
        mutate(record) {
          record.audit_hashes.reproducible_build_attestation = `0x${Array.from(
            { length: 32 },
            (_, index) => index.toString(16).padStart(2, "0"),
          ).join("")}`;
        },
        pattern:
          /destination native EVM prover bundle auditHashes\.reproducible_build_attestation must not look like a placeholder audit hash: arithmetic byte sequence/u,
      },
    ];

    for (const { label, mutate, pattern } of cases) {
      const runtime = buildRuntimeConfig();
      mutateDirectionNativeBundle(runtime.destination, mutate);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
        label,
      ).rejects.toThrow(pattern);
      expect(calls, label).toHaveLength(0);
    }
  });

  it("rejects native EVM prover bundles missing production no-wasm binding", async () => {
    const runtime = buildRuntimeConfig();
    mutateDirectionNativeBundle(runtime.destination, (record) => {
      delete record.no_wasm;
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/native EVM prover bundle noWasm is missing/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects native EVM prover bundles missing explicit verifier key artifact hashes", async () => {
    const runtime = buildRuntimeConfig();
    mutateDirectionNativeBundle(runtime.destination, (record) => {
      delete record.verifier_key_artifact_hash;
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /native EVM prover bundle verifierKeyArtifactHash is missing/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects native EVM prover bundles that reuse verifier artifact hash roles", async () => {
    const runtime = buildRuntimeConfig();
    mutateDirectionNativeBundle(runtime.destination, (record) => {
      record.verifier_key_artifact_hash = record.proof_artifact_hash;
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /native EVM prover bundle descriptor hashes must be role-separated: verifierKeyArtifactHash matches proofArtifactHash/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects proof requests not bound to the loaded proof material", async () => {
    const runtime = buildRuntimeConfig();
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve({
        ...destinationRequest(runtime.destination.material),
        proofArtifactHash: `0x${"bb".repeat(32)}`,
      }),
    ).rejects.toThrow(/proofArtifactHash does not match loaded material/u);
    expect(calls).toHaveLength(0);

    await expect(
      mod.bscSccpProve({
        ...destinationRequest(runtime.destination.material),
        nativeEvmProverBundleHash: `0x${"cc".repeat(32)}`,
      }),
    ).rejects.toThrow(
      /nativeEvmProverBundleHash does not match loaded material/u,
    );
    expect(calls).toHaveLength(0);

    await expect(
      mod.bscSccpSourceProve({
        ...sourceRequest(runtime.source.material),
        proofArtifactHash: `0x${"dd".repeat(32)}`,
      }),
    ).rejects.toThrow(/proofArtifactHash does not match loaded material/u);
    expect(calls).toHaveLength(0);

    await expect(
      mod.bscSccpSourceProve({
        ...sourceRequest(runtime.source.material),
        nativeEvmProverBundleHash: `0x${"ee".repeat(32)}`,
      }),
    ).rejects.toThrow(
      /nativeEvmProverBundleHash does not match loaded material/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects configs missing a verified native SDK before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.nativeProverVerifiedSdks =
      REQUIRED_NATIVE_PROVER_SDKS.filter((sdk) => sdk !== "dotnet");
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/verified SDK list is missing dotnet/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects tampered native SDK implementation artifacts before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.destination.nativeArtifacts.implementations.dotnet =
      implementationArtifactBytes(255, "tampered-dotnet");
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /dotnet implementation artifact sha256 .* does not match/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects malformed native support artifacts before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    const tampered = Buffer.from(
      `${JSON.stringify(
        {
          schema: BSC_PROFILES.testnet.paritySchema,
          domain: 2,
          chain: BSC_PROFILES.testnet.chain,
          proof_backend: PROOF_BACKEND,
          proof_artifact_hash: runtime.destination.material.proofArtifactHash,
          proving_key_hash: runtime.destination.material.provingKeyHash,
          verifier_key_hash: runtime.destination.material.verifierKeyHash,
          destination_binding_hash: HASH_33,
          receipt_proof_hash: supportHash(900, "receipt-proof"),
          source_proof_hash: supportHash(901, "source-proof"),
          public_signal_words: supportWords(902, "parity"),
          calldata_hash: supportHash(903, "calldata"),
          torii_submit_payload_hash: supportHash(904, "torii-submit"),
          production_attestation_hash: supportHash(
            905,
            "parity:production-attestation",
          ),
          sdk_results: {},
        },
        null,
        2,
      )}\n`,
      "utf8",
    );
    runtime.destination.nativeArtifacts.parity = tampered;
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(tampered);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/SDK results must cover every required native SDK/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects duplicate JSON object keys in hosted native support artifacts before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    runtime.destination.nativeArtifacts.parity = jsonBytesWithDuplicateKey(
      runtime.destination.nativeArtifacts.parity,
      "schema",
      BSC_PROFILES.testnet.paritySchema,
    );
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(
      runtime.destination.nativeArtifacts.parity,
    );
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination native bundle cross-SDK parity artifact contains a duplicate JSON object key/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects native support artifacts with proof backend alias smuggling before backend execution", async () => {
    const runtime = buildRuntimeConfig();
    const support = JSON.parse(
      runtime.destination.nativeArtifacts.parity.toString("utf8"),
    );
    support.proofBackend = support.proof_backend;
    const tampered = Buffer.from(`${JSON.stringify(support, null, 2)}\n`);
    runtime.destination.nativeArtifacts.parity = tampered;
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(tampered);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /cross-SDK parity artifact proof backend must not use multiple aliases/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects native support artifacts without production attestations", async () => {
    const cases = [
      {
        name: "missing attestation",
        mutate(support) {
          delete support.production_attestation_hash;
        },
        expected: /productionAttestationHash is missing/u,
      },
      {
        name: "placeholder attestation",
        mutate(support) {
          support.production_attestation_hash = HASH_11;
        },
        expected: /placeholder attestation hash/u,
      },
    ];

    for (const { name, mutate, expected } of cases) {
      const runtime = buildRuntimeConfig();
      const support = JSON.parse(
        runtime.destination.nativeArtifacts.parity.toString("utf8"),
      );
      mutate(support);
      const tampered = Buffer.from(`${JSON.stringify(support, null, 2)}\n`);
      runtime.destination.nativeArtifacts.parity = tampered;
      runtime.destination.nativeArtifacts.parityHash = sha256Hex(tampered);
      runtime.destination.material.bundle = nativeBundleBytes({
        proofArtifactHash: runtime.destination.material.proofArtifactHash,
        provingKeyHash: runtime.destination.material.provingKeyHash,
        verifierKeyHash: runtime.destination.material.verifierKeyHash,
        verifierKeyArtifactHash:
          runtime.destination.material.verifierKeyArtifactHash,
        destinationBindingHash: HASH_33,
        nativeArtifacts: runtime.destination.nativeArtifacts,
      });
      refreshDirectionNativeBundle(runtime.destination, HASH_33);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
        name,
      ).rejects.toThrow(expected);
      expect(calls, name).toHaveLength(0);
    }
  });

  it.each([
    [
      "cross-SDK parity",
      "parity",
      "parityHash",
      /cross-SDK parity artifact production_attestation_hash must be role-derived from the Groth16 material manifest hash/u,
    ],
    [
      "native self-test",
      "selfTest",
      "selfTestHash",
      /self-test artifact production_attestation_hash must be role-derived from the Groth16 material manifest hash/u,
    ],
  ])(
    "rejects %s artifacts whose production attestation is not bound to the Groth16 material manifest",
    async (_label, artifactKey, artifactHashKey, errorPattern) => {
      const runtime = buildRuntimeConfig();
      const support = JSON.parse(
        runtime.destination.nativeArtifacts[artifactKey].toString("utf8"),
      );
      support.production_attestation_hash = supportHash(
        990,
        `${artifactKey}:forged-production-attestation`,
      );
      const tampered = Buffer.from(`${JSON.stringify(support, null, 2)}\n`);
      runtime.destination.nativeArtifacts[artifactKey] = tampered;
      runtime.destination.nativeArtifacts[artifactHashKey] =
        sha256Hex(tampered);
      runtime.destination.material.bundle = nativeBundleBytes({
        proofArtifactHash: runtime.destination.material.proofArtifactHash,
        provingKeyHash: runtime.destination.material.provingKeyHash,
        verifierKeyHash: runtime.destination.material.verifierKeyHash,
        verifierKeyArtifactHash:
          runtime.destination.material.verifierKeyArtifactHash,
        destinationBindingHash: HASH_33,
        nativeArtifacts: runtime.destination.nativeArtifacts,
      });
      refreshDirectionNativeBundle(runtime.destination, HASH_33);
      await installRuntimeConfig(runtime);
      const calls = [];
      globalThis.IrohaSccpBscProverTestCalls = calls;

      const mod = await loadRuntimeModule();

      await expect(
        mod.bscSccpProve(destinationRequest(runtime.destination.material)),
      ).rejects.toThrow(errorPattern);
      expect(calls).toHaveLength(0);
    },
  );

  it("rejects native support artifacts with duplicate top-level aliases", async () => {
    const runtime = buildRuntimeConfig();
    const support = JSON.parse(
      runtime.destination.nativeArtifacts.parity.toString("utf8"),
    );
    support.proofArtifactHash = support.proof_artifact_hash;
    const tampered = Buffer.from(`${JSON.stringify(support, null, 2)}\n`);
    runtime.destination.nativeArtifacts.parity = tampered;
    runtime.destination.nativeArtifacts.parityHash = sha256Hex(tampered);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofArtifactHash must not use multiple aliases/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects native support artifacts with duplicate SDK result aliases", async () => {
    const runtime = buildRuntimeConfig();
    const support = JSON.parse(
      runtime.destination.nativeArtifacts.selfTest.toString("utf8"),
    );
    support.sdk_results.dotnet.proofHash =
      support.sdk_results.dotnet.proof_hash;
    const tampered = Buffer.from(`${JSON.stringify(support, null, 2)}\n`);
    runtime.destination.nativeArtifacts.selfTest = tampered;
    runtime.destination.nativeArtifacts.selfTestHash = sha256Hex(tampered);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/SDK dotnet proofHash must not use multiple aliases/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects native support artifacts whose route hashes drift", async () => {
    const runtime = buildRuntimeConfig();
    const binding = {
      proofArtifactHash: `0x${"aa".repeat(32)}`,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      destinationBindingHash: HASH_33,
    };
    const tampered = nativeSupportArtifactBytes({
      seed: 777,
      kind: "selfTest",
      binding,
    });
    runtime.destination.nativeArtifacts.selfTest = tampered;
    runtime.destination.nativeArtifacts.selfTestHash = sha256Hex(tampered);
    runtime.destination.material.bundle = nativeBundleBytes({
      proofArtifactHash: runtime.destination.material.proofArtifactHash,
      provingKeyHash: runtime.destination.material.provingKeyHash,
      verifierKeyHash: runtime.destination.material.verifierKeyHash,
      verifierKeyArtifactHash:
        runtime.destination.material.verifierKeyArtifactHash,
      destinationBindingHash: HASH_33,
      nativeArtifacts: runtime.destination.nativeArtifacts,
    });
    refreshDirectionNativeBundle(runtime.destination, HASH_33);
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofArtifactHash must match native prover bundle/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects runtime configs whose destination backend export is swapped", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination.backendAcceptedExport = "bscSccpSourceProve";
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/destination backend accepted export must be one of/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects runtime configs missing the configured backend self-test export", async () => {
    const runtime = buildRuntimeConfig();
    delete runtime.config.source.backendAcceptedSelfTestExport;
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpSourceProve(sourceRequest(runtime.source.material)),
    ).rejects.toThrow(/source backend accepted self-test export is missing/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects backends that only export an unconfigured native self-test", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      missingSelfTest: true,
      genericSelfTestOnly: true,
    });
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination BSC prover backend does not export configured native prover self-test bscSccpNativeProverSelfTest/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects backend output that does not carry proof bytes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, { destinationTinyProof: true });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/returned no proofBytes/u);
  });

  it("rejects BSC destination proof packages with proof byte alias smuggling", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation: "result.proof_bytes = result.proofBytes;",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/proofBytes must not use multiple aliases/u);
  });

  it("rejects backend output with repeated-pattern proof bytes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation:
        "result.proofBytes = Uint8Array.from({ length: 384 }, (_value, index) => index % 32);",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/returned repeated-pattern proofBytes/u);
  });

  it("rejects backend output with arithmetic-sequence proof bytes", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackend(runtime.destination, {
      destinationResultMutation:
        "result.proofBytes = Uint8Array.from({ length: 384 }, (_value, index) => (index * 17 + 23) & 0xff);",
    });
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/returned arithmetic-sequence proofBytes/u);
  });

  it("rejects unsafe backend module URLs in published config", async () => {
    const runtime = buildRuntimeConfig();
    runtime.config.destination = {
      ...runtime.config.destination,
      backendModuleUrl: "http://bsc.example.invalid/prover.js",
      backendModuleSha256: `0x${"cc".repeat(32)}`,
    };
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/must be HTTPS, loopback HTTP, or package-relative/u);
  });

  it("rejects backend modules that statically import unverified code", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        Buffer.from('import "https://cdn.example.invalid/extra.js";\n'),
        runtime.destination.material.backend.bytes,
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/must be self-contained and must not import/u);
    expect(calls).toHaveLength(0);
  });

  it("accepts backend modules with import-like text in comments and strings", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        Buffer.from(
          [
            '// import "https://cdn.example.invalid/comment.js";',
            '/* export * from "https://cdn.example.invalid/comment.js"; */',
            'const importText = "import(\\"https://cdn.example.invalid/string.js\\")";',
            'const exportText = "export { proof } from \\"https://cdn.example.invalid/string.js\\"";',
            'const templateText = `import("https://cdn.example.invalid/template.js") export * from "https://cdn.example.invalid/template.js"`;',
            "",
          ].join("\n"),
        ),
        runtime.destination.material.backend.bytes,
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();
    const result = await mod.bscSccpProve(
      destinationRequest(runtime.destination.material),
    );

    expect(result.routeId).toBe(SCCP_BSC_XOR_ROUTE_ID);
    expect(calls).toHaveLength(1);
  });

  it("rejects backend modules that re-export unverified code", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        Buffer.from(
          'export { bscSccpProve } from "https://cdn.example.invalid/extra.js";\n',
        ),
        runtime.destination.material.backend.bytes,
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/must be self-contained and must not re-export/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects backend modules that dynamically import unverified code", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        runtime.destination.material.backend.bytes,
        Buffer.from(
          '\nexport async function loadExtra() { return import("https://cdn.example.invalid/extra.js"); }\n',
        ),
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/must be self-contained and must not import/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects backend modules that dynamically import from template expressions", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        runtime.destination.material.backend.bytes,
        Buffer.from(
          '\nexport const sneakyImport = `${import("https://cdn.example.invalid/extra.js")}`;\n',
        ),
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(/must be self-contained and must not import/u);
    expect(calls).toHaveLength(0);
  });

  it("rejects backend modules that access import metadata", async () => {
    const runtime = buildRuntimeConfig();
    setDirectionBackendBytes(
      runtime.destination,
      Buffer.concat([
        runtime.destination.material.backend.bytes,
        Buffer.from("\nexport const backendModuleUrl = import.meta.url;\n"),
      ]),
    );
    await installRuntimeConfig(runtime);
    const calls = [];
    globalThis.IrohaSccpBscProverTestCalls = calls;

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /must be self-contained and must not use import metadata/u,
    );
    expect(calls).toHaveLength(0);
  });

  it("rejects file-backed runtime material URLs outside the config directory", async () => {
    const runtime = buildRuntimeConfig();
    const outputRoot = path.join(repoRoot, "output");
    await mkdir(outputRoot, { recursive: true });
    const outsideRoot = await mkdtemp(
      path.join(outputRoot, "sccp-bsc-runtime-escape-"),
    );
    runtimeRoots.add(outsideRoot);
    const outsideProofPath = path.join(outsideRoot, "proof-artifact.r1cs");
    await writeFile(
      outsideProofPath,
      runtime.destination.material.proofArtifact,
    );
    runtime.config.destination = {
      ...runtime.config.destination,
      proofArtifactUrl: pathToFileURL(outsideProofPath).href,
    };
    await installRuntimeConfig(runtime);

    const mod = await loadRuntimeModule();

    await expect(
      mod.bscSccpProve(destinationRequest(runtime.destination.material)),
    ).rejects.toThrow(
      /destination proof artifact file URL must stay under the BSC prover config directory/u,
    );
  });
});
