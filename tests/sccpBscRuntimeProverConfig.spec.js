import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import {
  BSC_MAINNET_CHAIN_ID_HEX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_TESTNET_NETWORK_ID_HEX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  canonicalBscNativeEvmProverBundleHash,
  requiredBscRouteCheckIds,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import {
  SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
  assertBscSccpRuntimeProverConfigMaterialRoleSeparation,
  buildBscSccpRuntimeProverConfig,
  normalizeBscRuntimeProverMaterialUrl,
  resolveBscRuntimeProverConfigOutputPath,
  validateBscSccpRuntimeProverConfig,
  writeBscSccpRuntimeProverConfig,
} from "../scripts/e2e/sccp-bsc-runtime-prover-config.mjs";
import {
  BSC_EVM_GROTH16_BACKEND,
  ROUTE_MANIFEST_SCHEMA,
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_SORA,
  bscGroth16VerifierKeyHash,
  bscGroth16DeterministicProofSelfTestSample,
  bscDestinationBindingHash,
  bscDestinationBindingKey,
  bscNativeProverReportProductionAttestationHash,
  buildBscNativeEvmProverBundleFromArtifacts,
} from "../../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs";

const fixtureAddress = (label) =>
  `0x${createHash("sha256")
    .update(Buffer.from(label, "utf8"))
    .digest("hex")
    .slice(0, 40)}`;
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc runtime prover config bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc runtime prover config token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc runtime prover config source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress(
  "bsc runtime prover config verifier",
);
const repoRoot = path.resolve(".");
const execFileAsync = promisify(execFile);
const HASH_11 = `0x${"11".repeat(32)}`;
const HASH_44 = `0x${"44".repeat(32)}`;
const HASH_55 = `0x${"55".repeat(32)}`;
const HASH_66 = `0x${"66".repeat(32)}`;
const HASH_77 = `0x${"77".repeat(32)}`;
const HASH_88 = `0x${"88".repeat(32)}`;
const BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA =
  "iroha-sccp-bsc-groth16-material-manifest/v1";
const BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-semantic-circuit-attestation/v1";
const BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-circuit-security-attestation/v1";
const BSC_GROTH16_SEMANTIC_REVIEW_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-groth16-semantic-review-evidence/v1";
const BSC_GROTH16_CIRCUIT_SECURITY_AUDIT_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-groth16-circuit-security-audit-evidence/v1";
const BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-trusted-setup-attestation/v1";
const BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA =
  "iroha-sccp-bsc-groth16-reproducible-build-attestation/v1";
const BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-signature/v1";
const BSC_GROTH16_PROOF_SELF_TEST_SCHEMA =
  "iroha-sccp-bsc-groth16-proof-self-test/v1";
const BSC_FULL_SCCP_CIRCUIT_PROFILE = "sccp-bsc-full-message-v1";
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
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const REQUIRED_NATIVE_PROVER_SDKS = Object.keys(
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
).sort();
const BN254_BASE_FIELD_MODULUS =
  "21888242871839275222246405745257275088696311157297823662689037894645226208583";
const BN254_G2_GENERATOR = Object.freeze([
  "10857046999023057135944570762232829481370756359578518086990519993285655852781",
  "11559732032986387107991004021392285783925812861821192530917403151452391805634",
  "8495653923123431417604973247489272438418190587263600148770280649306958101930",
  "4082367875863433681332203403145435568316851327593401208105741076214120093531",
]);
const VALID_G1_POINTS = Object.freeze([
  ["1", "2"],
  [
    "1368015179489954701390400359078579693043519447331113978918064868415326638035",
    "9918110051302171585080402603319702774565515993150576347155970296011118125764",
  ],
  [
    "3353031288059533942658390886683067124040920775575537747144343083137631628272",
    "19321533766552368860946552437480515441416830039777911637913418824951667761761",
  ],
  [
    "3010198690406615200373504922352659861758983907867017329644089018310584441462",
    "4027184618003122424972590350825261965929648733675738730716654005365300998076",
  ],
  [
    "10744596414106452074759370245733544594153395043370666422502510773307029471145",
    "848677436511517736191562425154572367705380862894644942948681172815252343932",
  ],
  [
    "4503322228978077916651710446042370109107355802721800704639343137502100212473",
    "6132642251294427119375180147349983541569387941788025780665104001559216576968",
  ],
  [
    "10415861484417082502655338383609494480414113902179649885744799961447382638712",
    "10196215078179488638353184030336251401353352596818396260819493263908881608606",
  ],
  [
    "3932705576657793550893430333273221375907985235130430286685735064194643946083",
    "18813763293032256545937756946359266117037834559191913266454084342712532869153",
  ],
  [
    "1624070059937464756887933993293429854168590106605707304006200119738501412969",
    "3269329550605213075043232856820720631601935657990457502777101397807070461336",
  ],
  [
    "4444740815889402603535294170722302758225367627362056425101568584910268024244",
    "10537263096529483164618820017164668921386457028564663708352735080900270541420",
  ],
  [
    "19033251874843656108471242320417533909414939332036131356573128480367742634479",
    "20792135454608030201903199625673964159744755218442260092768620403349374102584",
  ],
]);
const VALID_VERIFIER_MATERIAL = Object.freeze({
  alpha1: VALID_G1_POINTS[0],
  beta2: BN254_G2_GENERATOR,
  gamma2: BN254_G2_GENERATOR,
  delta2: BN254_G2_GENERATOR,
  ic: VALID_G1_POINTS.slice(1, 11).flat(),
});
const verifierKeyHashForMaterial = (material = VALID_VERIFIER_MATERIAL) =>
  bscGroth16VerifierKeyHash(material);
const verifierMaterial = (material = VALID_VERIFIER_MATERIAL) => {
  const verifierKeyHash = verifierKeyHashForMaterial(material);
  return {
    schema: "iroha-sccp-bsc-verifier-key/v1",
    network: "bsc-testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkId: BSC_TESTNET_NETWORK_ID_HEX,
    proofBackend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
    proofFamily: "stark-fri-v1",
    protocol: "groth16",
    curve: "bn254",
    publicInputCount: 9,
    sourceDomain: SCCP_DOMAIN_SORA,
    targetDomain: SCCP_DOMAIN_BSC,
    verifierKeyHash,
    expectedVerifierKeyHash: verifierKeyHash,
    ...material,
  };
};
const verifierKeyMaterialBytes = (material = VALID_VERIFIER_MATERIAL) =>
  Buffer.from(
    `${JSON.stringify(verifierMaterial(material), null, 2)}\n`,
    "utf8",
  );

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;
const repeatedHash = (byte) =>
  `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const attestationHash = (label) => sha256Hex(Buffer.from(label, "utf8"));
const stableJsonValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
};
const stableJsonString = (value) => JSON.stringify(stableJsonValue(value));
const attestationSigner = () => {
  const pair = generateKeyPairSync("ed25519");
  const publicKeyPem = pair.publicKey.export({ type: "spki", format: "pem" });
  const signerFingerprint = sha256Hex(
    pair.publicKey.export({ type: "spki", format: "der" }),
  );
  return { ...pair, publicKeyPem, signerFingerprint };
};
const GROTH16_ATTESTATION_SIGNERS = Object.freeze({
  semanticSccpCircuit: attestationSigner(),
  circuitSecurity: attestationSigner(),
  trustedSetup: attestationSigner(),
  reproducibleBuild: attestationSigner(),
});
const signGroth16Attestation = (record, signerRecord) => {
  const payload = Buffer.from(stableJsonString(record), "utf8");
  return {
    ...record,
    signature: {
      schema: BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA,
      algorithm: "ed25519",
      signerFingerprint: signerRecord.signerFingerprint,
      publicKeyPem: signerRecord.publicKeyPem,
      signedPayloadSha256: sha256Hex(payload),
      signature: sign(null, payload, signerRecord.privateKey).toString(
        "base64",
      ),
    },
  };
};
const groth16AttestationSignatureSummary = (record) => {
  const signatureBlock = record.signature;
  const body = { ...record };
  delete body.signature;
  delete body.signatures;
  return {
    verified: true,
    algorithm: signatureBlock.algorithm,
    signerFingerprint: signatureBlock.signerFingerprint,
    signedPayloadSha256: sha256Hex(Buffer.from(stableJsonString(body))),
  };
};

const materialBytes = (seed, size = 96 * 1024) => {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (seed + index * 41 + (index >> 4)) & 0xff;
  }
  return bytes;
};

const streamingBytesResponse = (byteLength, { chunkSize = 8192 } = {}) => {
  let remaining = byteLength;
  return new Response(
    new ReadableStream({
      pull(controller) {
        if (remaining <= 0) {
          controller.close();
          return;
        }
        const size = Math.min(chunkSize, remaining);
        remaining -= size;
        controller.enqueue(new Uint8Array(size).fill(0x61));
      },
    }),
    {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    },
  );
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

const backendModuleBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpNativeProverSelfTest(context) {",
      "  return context.nativeProverSelfTest;",
      "}",
      "export async function bscSccpSourceNativeProverSelfTest(context) {",
      "  return context.nativeProverSelfTest;",
      "}",
      'const requiredSourcePublicInputFields = Object.freeze(["publicInputs", "sourceEventDigest", "commitmentRoot", "messageId", "payloadHash", "sourceDomain", "targetDomain", "amountBaseUnits", "bscSender", "tairaRecipient", "routeId"]);',
      "const bindSourcePublicInputs = (context) => ({",
      "  publicInputs: context?.publicInputs ?? context?.public_inputs,",
      "  sourceEventDigest: context?.sourceEventDigest ?? context?.source_event_digest,",
      "  commitmentRoot: context?.commitmentRoot ?? context?.commitment_root,",
      "  messageId: context?.messageId ?? context?.message_id,",
      "  payloadHash: context?.payloadHash ?? context?.payload_hash,",
      "  sourceDomain: context?.sourceDomain ?? context?.source_domain,",
      "  targetDomain: context?.targetDomain ?? context?.target_domain,",
      "  amountBaseUnits: context?.amountBaseUnits ?? context?.amount_base_units ?? context?.amount,",
      "  bscSender: context?.bscSender ?? context?.bsc_sender ?? context?.sender,",
      "  tairaRecipient: context?.tairaRecipient ?? context?.taira_recipient ?? context?.recipient,",
      "  routeId: context?.routeId ?? context?.route_id ?? context?.route,",
      "});",
      "export async function bscSccpProve(context) {",
      "  return context.destinationBackend(context);",
      "}",
      "export async function bscSccpSourceProve(context) {",
      "  bindSourcePublicInputs(context);",
      "  return context.sourceBackend(context);",
      "}",
      `export const runtimeIntegrity = ${JSON.stringify(
        "bsc-runtime-integrity-binding-".repeat(80),
      )};`,
      "",
    ].join("\n"),
  );

const staticImportBackendModuleBytes = () =>
  Buffer.concat([
    Buffer.from('import "https://cdn.example.invalid/extra.js";\n'),
    backendModuleBytes(),
  ]);

const sourceBackendWithoutPublicInputsBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpNativeProverSelfTest(context) {",
      "  return context.nativeProverSelfTest;",
      "}",
      "export async function bscSccpSourceNativeProverSelfTest(context) {",
      "  return context.nativeProverSelfTest;",
      "}",
      "export async function bscSccpProve(context) {",
      "  return context.destinationBackend(context);",
      "}",
      "export async function bscSccpSourceProve(context) {",
      "  return context.sourceBackend(context);",
      "}",
      `export const runtimeIntegrity = ${JSON.stringify(
        "source-backend-without-public-inputs-".repeat(80),
      )};`,
      "",
    ].join("\n"),
  );

const dynamicImportBackendModuleBytes = () =>
  Buffer.concat([
    backendModuleBytes(),
    Buffer.from(
      '\nexport async function loadExtra() { return import("https://cdn.example.invalid/extra.js"); }\n',
    ),
  ]);

const importMetaBackendModuleBytes = () =>
  Buffer.concat([
    backendModuleBytes(),
    Buffer.from("\nexport const backendModuleUrl = import.meta.url;\n"),
  ]);

const importLikeTextBackendModuleBytes = () =>
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
    backendModuleBytes(),
  ]);

const badBackendModuleBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpProve() {",
      "  return { proofBytes: new Uint8Array([1]) };",
      "}",
      `export const runtimeIntegrity = ${JSON.stringify("bad-runtime-".repeat(120))};`,
      "",
    ].join("\n"),
  );

const destinationOnlyBackendModuleBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpNativeProverSelfTest(context) {",
      "  return context.nativeProverSelfTest;",
      "}",
      "export async function bscSccpProve(context) {",
      "  return context.destinationBackend(context);",
      "}",
      `export const runtimeIntegrity = ${JSON.stringify(
        "destination-only-runtime-integrity-".repeat(90),
      )};`,
      "",
    ].join("\n"),
  );

const missingSelfTestBackendModuleBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpProve(context) {",
      "  return context.destinationBackend(context);",
      "}",
      'const requiredSourcePublicInputFields = Object.freeze(["publicInputs", "sourceEventDigest", "commitmentRoot", "messageId", "payloadHash", "sourceDomain", "targetDomain", "amountBaseUnits", "bscSender", "tairaRecipient", "routeId"]);',
      "const bindSourcePublicInputs = (context) => ({",
      "  publicInputs: context?.publicInputs ?? context?.public_inputs,",
      "  sourceEventDigest: context?.sourceEventDigest ?? context?.source_event_digest,",
      "  commitmentRoot: context?.commitmentRoot ?? context?.commitment_root,",
      "  messageId: context?.messageId ?? context?.message_id,",
      "  payloadHash: context?.payloadHash ?? context?.payload_hash,",
      "  sourceDomain: context?.sourceDomain ?? context?.source_domain,",
      "  targetDomain: context?.targetDomain ?? context?.target_domain,",
      "  amountBaseUnits: context?.amountBaseUnits ?? context?.amount_base_units ?? context?.amount,",
      "  bscSender: context?.bscSender ?? context?.bsc_sender ?? context?.sender,",
      "  tairaRecipient: context?.tairaRecipient ?? context?.taira_recipient ?? context?.recipient,",
      "  routeId: context?.routeId ?? context?.route_id ?? context?.route,",
      "});",
      "export async function bscSccpSourceProve(context) {",
      "  bindSourcePublicInputs(context);",
      "  return context.sourceBackend(context);",
      "}",
      `export const runtimeIntegrity = ${JSON.stringify(
        "missing-self-test-runtime-integrity-".repeat(90),
      )};`,
      "",
    ].join("\n"),
  );

const commentOnlyBackendModuleBytes = () =>
  Buffer.from(
    [
      "// export async function bscSccpProve(context) { return context.destinationBackend(context); }",
      "// export async function bscSccpSourceProve(context) { return context.sourceBackend(context); }",
      `export const runtimeIntegrity = ${JSON.stringify(
        "comment-only-runtime-integrity-".repeat(90),
      )};`,
      "",
    ].join("\n"),
  );

const nonCallableBackendModuleBytes = () =>
  Buffer.from(
    [
      `export const bscSccpProve = ${JSON.stringify("not a destination prover function")};`,
      `export const bscSccpSourceProve = ${JSON.stringify("not a source prover function")};`,
      `export const runtimeIntegrity = ${JSON.stringify(
        "non-callable-runtime-integrity-".repeat(90),
      )};`,
      "",
    ].join("\n"),
  );

const syntaxBrokenBackendModuleBytes = () =>
  Buffer.from(
    [
      "export async function bscSccpProve(context) {",
      "  return context.destinationBackend(context);",
      `export const runtimeIntegrity = ${JSON.stringify(
        "syntax-broken-runtime-integrity-".repeat(90),
      )};`,
      "",
    ].join("\n"),
  );

const fixtureWords = (byte) =>
  Array.from({ length: 9 }, () => repeatedHash(byte));

const nativeProverSdkResults = (fields) =>
  Object.fromEntries(
    Object.keys(SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1).map(
      (sdk) => [sdk, { ...fields }],
    ),
  );

const nativeProverParityFixture = ({
  proofArtifactHash,
  provingKeyHash,
  verifierKeyHash,
  destinationBindingHash,
  productionAttestationHash = attestationHash(
    "bsc-runtime-config parity production attestation",
  ),
}) => {
  const fields = {
    receipt_proof_hash: repeatedHash(0xa1),
    source_proof_hash: repeatedHash(0xa2),
    destination_binding_hash: destinationBindingHash,
    public_signal_words: fixtureWords(0xa3),
    calldata_hash: repeatedHash(0xa4),
    torii_submit_payload_hash: repeatedHash(0xa5),
  };
  return {
    schema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    domain: SCCP_DOMAIN_BSC,
    chain: "bsc-testnet",
    proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
    proof_artifact_hash: proofArtifactHash,
    proving_key_hash: provingKeyHash,
    verifier_key_hash: verifierKeyHash,
    destination_binding_hash: destinationBindingHash,
    production_attestation_hash: productionAttestationHash,
    ...fields,
    sdk_results: nativeProverSdkResults(fields),
  };
};

const nativeProverSelfTestFixture = ({
  proofArtifactHash,
  provingKeyHash,
  verifierKeyHash,
  destinationBindingHash,
  productionAttestationHash = attestationHash(
    "bsc-runtime-config self-test production attestation",
  ),
}) => {
  const fields = {
    request_hash: repeatedHash(0xb1),
    witness_hash: repeatedHash(0xb2),
    source_proof_hash: repeatedHash(0xb3),
    proof_hash: repeatedHash(0xb4),
    public_signal_words: fixtureWords(0xb5),
    calldata_hash: repeatedHash(0xb6),
    torii_submit_payload_hash: repeatedHash(0xb7),
  };
  return {
    schema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    domain: SCCP_DOMAIN_BSC,
    chain: "bsc-testnet",
    proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
    proof_artifact_hash: proofArtifactHash,
    proving_key_hash: provingKeyHash,
    verifier_key_hash: verifierKeyHash,
    destination_binding_hash: destinationBindingHash,
    production_attestation_hash: productionAttestationHash,
    ...fields,
    sdk_results: nativeProverSdkResults(fields),
  };
};

const nativeBundleRouteManifest = (routeDeployment) => {
  const destinationBindingKey = bscDestinationBindingKey({
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: routeDeployment.verifierCodeHash,
    verifierKeyHash: routeDeployment.verifierKeyHash,
  });
  return {
    schema: ROUTE_MANIFEST_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    counterpartyDomain: SCCP_DOMAIN_BSC,
    verifierTarget: "EvmContract",
    productionReady: true,
    bscBridgeAddress: BSC_BRIDGE_ADDRESS,
    bscTokenAddress: BSC_TOKEN_ADDRESS,
    sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    bscVerifierAddress: BSC_VERIFIER_ADDRESS,
    destinationRollout: {
      version: 1,
      destinationNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      verifierIdentity: BSC_VERIFIER_ADDRESS,
      verifierBackend: BSC_EVM_GROTH16_BACKEND,
      proofFamily: "stark-fri-v1",
      verifierCodeHash: routeDeployment.verifierCodeHash,
      verifierKeyHash: routeDeployment.verifierKeyHash,
      proofArtifactHash: routeDeployment.proofArtifactHash,
      provingKeyHash: routeDeployment.provingKeyHash,
      destinationBridgeAddress: BSC_BRIDGE_ADDRESS,
      destinationBindingHash: routeDeployment.destinationBindingHash,
      destinationBindingKey,
    },
    destinationBinding: {
      version: 1,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      key: destinationBindingKey,
      bindingHash: routeDeployment.destinationBindingHash,
    },
  };
};

const groth16MaterialAttestationRows = () => [
  [
    "semanticSccpCircuit",
    "semantic-sccp-circuit-attestation",
    BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA,
    {
      fullSccpMessageSemantics: true,
      sourceFinalitySemantics: true,
      destinationBindingSemantics: true,
      publicSignalDerivationSemantics: true,
      negativeCaseCoverage: true,
    },
  ],
  [
    "circuitSecurity",
    "circuit-security-audit",
    BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA,
    {
      auditResult: "pass",
      approved: true,
      criticalFindings: 0,
      highFindings: 0,
      unresolvedFindings: 0,
    },
  ],
  [
    "trustedSetup",
    "trusted-setup-ceremony",
    BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA,
    {
      ceremonyResult: "pass",
      localSingleContributor: false,
      minimumContributors: 3,
      toxicWasteDestroyed: true,
    },
  ],
  [
    "reproducibleBuild",
    "reproducible-build-attestation",
    BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA,
    {
      reproducible: true,
      independentRebuilders: 2,
    },
  ],
];

const jsonFixtureBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const runtimeTrustedSetupTranscript = () => ({
  schema: "iroha-sccp-bsc-trusted-setup-transcript/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bscNetwork: "testnet",
  chain: "bsc-testnet",
  chainIdHex: "0x61",
  networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
  contributors: ["ceremony-contributor-alpha", "ceremony-contributor-beta"],
  localSingleContributor: false,
  toxicWasteDestroyed: true,
  ceremonyResult: "pass",
  phase1: {
    snarkjsPowersOfTauVerify: {
      completed: true,
    },
  },
  phase2: {
    snarkjsZkeyVerify: "ZKey Ok!",
  },
});

const runtimeReproducibleBuildTranscript = ({
  snarkjsBin,
  snarkjsBinarySha256,
}) => ({
  schema: "iroha-sccp-bsc-reproducible-build-transcript/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bscNetwork: "testnet",
  chain: "bsc-testnet",
  chainIdHex: "0x61",
  networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
  independentRebuilders: [
    "independent-rebuilder-alpha",
    "independent-rebuilder-beta",
  ],
  reproducible: true,
  toolchain: {
    circom: {
      source: "https://github.com/iden3/circom.git",
      tag: "v2.2.2",
      revision: "e410b0d5",
      binary: path.join(path.dirname(snarkjsBin), "circom"),
      binarySha256: attestationHash("bsc runtime config circom binary"),
    },
    snarkjs: {
      package: "snarkjs",
      version: "0.7.6",
      binary: snarkjsBin,
      binarySha256: snarkjsBinarySha256,
    },
    circomDependencies: {
      circomlib: "2.0.5",
      "@electron-labs/keccak-circom": "0.0.3",
    },
  },
  r1csInfoSource: "snarkjs-cli",
  r1csPublicInputCount: 9,
  r1csConstraintCount: 8192,
  zkeyVerify: true,
  zkeyVerifyResult: "ZKey Ok!",
});

const runtimeGroth16ProofSelfTestAdversarialChecks = () => ({
  publicSignalMismatch: {
    attempted: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length,
    rejected: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length,
    cases: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.map((name, index) => ({
      index,
      name,
      rejected: true,
      phase: "wtnsCalculate",
    })),
  },
  nonBooleanValueBit: {
    attempted: 1,
    rejected: 1,
    case: {
      signalName: BSC_GROTH16_PUBLIC_SIGNAL_NAMES[0],
      inputName: "messageIdBits",
      bitIndex: 0,
      rejected: true,
      phase: "wtnsCalculate",
    },
  },
});

const writeGroth16MaterialManifest = async ({
  artifactRoot,
  routeDeployment,
  proofArtifactBytes,
  provingKeyBytes,
  verifierKeyBytes,
}) => {
  const circuitSourceBytes = Buffer.from(
    "template FullSccpMessage() { signal input message_id; signal output out; out <== message_id; }\ncomponent main { public [message_id] } = FullSccpMessage();\n",
    "utf8",
  );
  const powersOfTauBytes = materialBytes(0x91, 4096);
  const snarkjsVerificationKeyBytes = jsonFixtureBytes({
    schema: "snarkjs-groth16-verification-key/v1",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    chain: "bsc-testnet",
    verifierKeyHash: routeDeployment.verifierKeyHash,
    publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
  });
  const snarkjsBin = path.join(artifactRoot, "snarkjs");
  const snarkjsVerifierStubSource = `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] !== "groth16" || args[1] !== "verify" || args.length !== 5) {
  process.stderr.write("expected snarkjs groth16 verify <verification-key> <public> <proof>\\n");
  process.exit(1);
}
process.exit(0);
`;
  const snarkjsVerifierStubBytes = Buffer.from(
    snarkjsVerifierStubSource,
    "utf8",
  );
  const snarkjsBinarySha256 = sha256Hex(snarkjsVerifierStubBytes);
  await writeFile(
    path.join(artifactRoot, "full-sccp-message.circom"),
    circuitSourceBytes,
  );
  await writeFile(
    path.join(artifactRoot, "powersOfTau.ptau"),
    powersOfTauBytes,
  );
  await writeFile(
    path.join(artifactRoot, "verification_key.json"),
    snarkjsVerificationKeyBytes,
  );
  await writeFile(snarkjsBin, snarkjsVerifierStubBytes, { mode: 0o755 });
  const trustedSetupTranscript = runtimeTrustedSetupTranscript();
  const reproducibleBuildTranscript = runtimeReproducibleBuildTranscript({
    snarkjsBin,
    snarkjsBinarySha256,
  });
  const reproducibleBuildToolchainSha256 = sha256Hex(
    Buffer.from(
      stableJsonString(reproducibleBuildTranscript.toolchain),
      "utf8",
    ),
  );
  const trustedSetupTranscriptBytes = jsonFixtureBytes(trustedSetupTranscript);
  const reproducibleBuildTranscriptBytes = jsonFixtureBytes(
    reproducibleBuildTranscript,
  );
  await writeFile(
    path.join(artifactRoot, "trusted-setup-transcript.json"),
    trustedSetupTranscriptBytes,
  );
  await writeFile(
    path.join(artifactRoot, "reproducible-build-transcript.json"),
    reproducibleBuildTranscriptBytes,
  );
  const manifest = {
    schema: BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA,
    generatedAt: "2026-06-22T00:00:00.000Z",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: "stark-fri-v1",
    sourceDomain: SCCP_DOMAIN_SORA,
    targetDomain: SCCP_DOMAIN_BSC,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    publicInputCount: 9,
    publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
    verifierKeyHash: routeDeployment.verifierKeyHash,
    productionReady: true,
    productionBlockers: [],
    artifacts: {
      circuitSource: {
        path: "full-sccp-message.circom",
        sha256: sha256Hex(circuitSourceBytes),
      },
      r1cs: {
        path: "proof-artifact.r1cs",
        sha256: sha256Hex(proofArtifactBytes),
      },
      powersOfTau: {
        path: "powersOfTau.ptau",
        sha256: sha256Hex(powersOfTauBytes),
      },
      provingKey: {
        path: "proving-key.zkey",
        sha256: sha256Hex(provingKeyBytes),
      },
      snarkjsVerificationKey: {
        path: "verification_key.json",
        sha256: sha256Hex(snarkjsVerificationKeyBytes),
      },
      bscVerifierKey: {
        path: "groth16-key-material.json",
        sha256: sha256Hex(verifierKeyBytes),
      },
      trustedSetupTranscript: {
        path: "trusted-setup-transcript.json",
        sha256: sha256Hex(trustedSetupTranscriptBytes),
      },
      reproducibleBuildTranscript: {
        path: "reproducible-build-transcript.json",
        sha256: sha256Hex(reproducibleBuildTranscriptBytes),
      },
    },
    trustedSetup: {
      localPowersOfTau: false,
      localPhase2Contribution: false,
      contributionMaterialPersisted: false,
    },
    selfChecks: {
      snarkjs: {
        snarkjsBinary: snarkjsBin,
        r1csInfo: true,
        r1csInfoSource: "snarkjs-cli",
        r1csPublicInputCount: 9,
        r1csConstraintCount: 8192,
        zkeyVerify: true,
        zkeyVerifyResult: "ZKey Ok!",
        zkeyVerificationKeyExport: true,
        verifierKeyHashMatches: true,
        exportedVerifierKeyHash: routeDeployment.verifierKeyHash,
      },
      circuitSource: {
        fullMessageCircuit: true,
        signalBindingFixture: false,
        unresolvedPlaceholders: false,
        keccakPublicSignalDerivation: true,
        digestReductionModuloScalarField: true,
        valueBitBooleanConstraints: true,
        publicSignalConstraintCount: 9,
        labelBindingCount: 9,
      },
    },
    attestationTrustPolicy: {
      signatureSchema: BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA,
      requiredAlgorithm: "ed25519",
      trustedSignerFingerprints: Object.values(GROTH16_ATTESTATION_SIGNERS).map(
        (entry) => entry.signerFingerprint,
      ),
    },
    attestations: {},
  };
  for (const [
    key,
    fileStem,
    schema,
    extra,
  ] of groth16MaterialAttestationRows()) {
    const snarkjs = manifest.selfChecks.snarkjs;
    const trustedSetupFields =
      schema === BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA
        ? {
            contributionTranscriptSha256:
              manifest.artifacts.trustedSetupTranscript.sha256,
          }
        : {};
    const reproducibleFields =
      schema === BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA
        ? {
            buildTranscriptSha256:
              manifest.artifacts.reproducibleBuildTranscript.sha256,
            toolchainSha256: reproducibleBuildToolchainSha256,
            zkeyVerify: true,
            zkeyVerifyResult: "ZKey Ok!",
            zkeyVerificationKeyExport: snarkjs.zkeyVerificationKeyExport,
            verifierKeyHashMatches: snarkjs.verifierKeyHashMatches,
            exportedVerifierKeyHash: snarkjs.exportedVerifierKeyHash,
            r1csInfoSource: snarkjs.r1csInfoSource,
            r1csPublicInputCount: snarkjs.r1csPublicInputCount,
            r1csConstraintCount: snarkjs.r1csConstraintCount,
          }
        : {};
    const record = {
      schema,
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      bscNetwork: "testnet",
      chain: "bsc-testnet",
      chainIdHex: "0x61",
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      proofBackend: BSC_EVM_GROTH16_BACKEND,
      proofFamily: "stark-fri-v1",
      circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
      publicInputCount: 9,
      publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
      verifierKeyHash: routeDeployment.verifierKeyHash,
      circuitSourceSha256: manifest.artifacts.circuitSource.sha256,
      r1csSha256: manifest.artifacts.r1cs.sha256,
      powersOfTauSha256: manifest.artifacts.powersOfTau.sha256,
      provingKeySha256: manifest.artifacts.provingKey.sha256,
      snarkjsVerificationKeySha256:
        manifest.artifacts.snarkjsVerificationKey.sha256,
      bscVerifierKeySha256: manifest.artifacts.bscVerifierKey.sha256,
      ...trustedSetupFields,
      ...reproducibleFields,
      ...extra,
    };
    if (schema === BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA) {
      record.semanticReviewEvidenceSchema =
        BSC_GROTH16_SEMANTIC_REVIEW_EVIDENCE_SCHEMA;
      record.semanticReviewEvidenceSha256 = attestationHash(
        "bsc semantic review evidence",
      );
      record.semanticReviewReportSha256 = attestationHash(
        "bsc semantic review report",
      );
    }
    if (schema === BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA) {
      record.circuitSecurityAuditEvidenceSchema =
        BSC_GROTH16_CIRCUIT_SECURITY_AUDIT_EVIDENCE_SCHEMA;
      record.circuitSecurityAuditEvidenceSha256 = attestationHash(
        "bsc circuit security audit evidence",
      );
      record.circuitSecurityAuditReportSha256 = attestationHash(
        "bsc circuit security audit report",
      );
    }
    const signed = signGroth16Attestation(
      record,
      GROTH16_ATTESTATION_SIGNERS[key],
    );
    const bytes = Buffer.from(`${JSON.stringify(signed, null, 2)}\n`, "utf8");
    const relativePath = `attestations/${fileStem}.json`;
    const filePath = path.join(artifactRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    manifest.attestations[key] = {
      path: relativePath,
      schema,
      sha256: sha256Hex(bytes),
      signature: groth16AttestationSignatureSummary(signed),
    };
  }
  const manifestPath = path.join(
    artifactRoot,
    "groth16-material.manifest.json",
  );
  await writeJson(manifestPath, manifest);
  return {
    manifestPath,
    relativePath: "groth16-material.manifest.json",
    manifest,
    sha256: sha256Hex(await readFile(manifestPath)),
    snarkjsBin,
    trustedSignerFingerprints:
      manifest.attestationTrustPolicy.trustedSignerFingerprints,
  };
};

const writeGroth16ProofSelfTestReport = async ({
  artifactRoot,
  routeDeployment,
  groth16MaterialManifest,
}) => {
  const sample = bscGroth16DeterministicProofSelfTestSample("testnet");
  const publicSignals = sample.publicSignalWords;
  const proof = {
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["1", "2"],
      ["3", "4"],
      ["1", "0"],
    ],
    pi_c: ["1", "2", "1"],
    protocol: "groth16",
    curve: "bn128",
  };
  const proofSelfTest = {
    schema: BSC_GROTH16_PROOF_SELF_TEST_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: "stark-fri-v1",
    manifest: {
      path: groth16MaterialManifest.relativePath,
      sha256: groth16MaterialManifest.sha256,
      productionReady: true,
      productionBlockers: [],
    },
    artifacts: {
      circuitSource: groth16MaterialManifest.manifest.artifacts.circuitSource,
      r1cs: groth16MaterialManifest.manifest.artifacts.r1cs,
      provingKey: groth16MaterialManifest.manifest.artifacts.provingKey,
      snarkjsVerificationKey:
        groth16MaterialManifest.manifest.artifacts.snarkjsVerificationKey,
      bscVerifierKey: groth16MaterialManifest.manifest.artifacts.bscVerifierKey,
      witnessWasm: {
        path: "witness/sccp-bsc-full-message-v1.wasm",
        sha256: attestationHash("bsc runtime config witness wasm"),
      },
    },
    sample: {
      id: sample.sampleId,
      syntheticInputWords: sample.syntheticInputWords,
      publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
      inputSha256: sample.inputSha256,
      publicSignalWords: publicSignals,
    },
    snarkjs: {
      binary: "snarkjs",
      wtnsCalculate: true,
      groth16Prove: true,
      groth16Verify: true,
    },
    adversarialChecks: runtimeGroth16ProofSelfTestAdversarialChecks(),
    witnessHash: attestationHash("bsc runtime config proof self-test witness"),
    proofHash: sha256Hex(Buffer.from(stableJsonString(proof), "utf8")),
    publicSignalsHash: sha256Hex(
      Buffer.from(stableJsonString(publicSignals), "utf8"),
    ),
    proof,
    publicSignals,
  };
  void routeDeployment;
  await writeJson(
    path.join(artifactRoot, "groth16-proof-self-test.json"),
    proofSelfTest,
  );
  return "groth16-proof-self-test.json";
};

const writeGeneratedNativeProverBundle = async ({
  artifactRoot,
  routeDeployment,
  proofArtifactBytes,
  provingKeyBytes,
  verifierKeyBytes,
} = {}) => {
  await mkdir(artifactRoot, { recursive: true });
  const writeArtifact = async (relativePath, bytes) => {
    const filePath = path.join(artifactRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    return filePath;
  };
  await writeArtifact("proof-artifact.r1cs", proofArtifactBytes);
  await writeArtifact("proving-key.zkey", provingKeyBytes);
  await writeArtifact("groth16-key-material.json", verifierKeyBytes);
  const binding = {
    proofArtifactHash: routeDeployment.proofArtifactHash,
    provingKeyHash: routeDeployment.provingKeyHash,
    verifierKeyHash: routeDeployment.verifierKeyHash,
    verifierKeyArtifactHash: sha256Hex(verifierKeyBytes),
    destinationBindingHash: routeDeployment.destinationBindingHash,
  };
  const groth16MaterialManifest = await writeGroth16MaterialManifest({
    artifactRoot,
    routeDeployment,
    proofArtifactBytes,
    provingKeyBytes,
    verifierKeyBytes,
  });
  const groth16ProofSelfTestPath = await writeGroth16ProofSelfTestReport({
    artifactRoot,
    routeDeployment,
    groth16MaterialManifest,
  });
  await writeArtifact(
    "cross-sdk-parity.json",
    Buffer.from(
      `${JSON.stringify(
        nativeProverParityFixture({
          ...binding,
          productionAttestationHash:
            bscNativeProverReportProductionAttestationHash(
              "cross-sdk-parity",
              groth16MaterialManifest.sha256,
            ),
        }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  await writeArtifact(
    "native-prover-self-test.json",
    Buffer.from(
      `${JSON.stringify(
        nativeProverSelfTestFixture({
          ...binding,
          productionAttestationHash:
            bscNativeProverReportProductionAttestationHash(
              "native-prover-self-test",
              groth16MaterialManifest.sha256,
            ),
        }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  const sdkImplementationPaths = {};
  for (const [index, sdk] of REQUIRED_NATIVE_PROVER_SDKS.entries()) {
    sdkImplementationPaths[sdk] = await writeArtifact(
      `${sdk}/implementation.native`,
      materialBytes(0xc0 + index, 2048),
    );
  }
  for (const [index, name] of [
    "circuit-security.audit",
    "native-implementation.audit",
    "reproducible-build.attestation",
    "no-wasm-no-remote.scan",
  ].entries()) {
    await writeArtifact(name, materialBytes(0xd0 + index, 1024));
  }
  const routeManifestPath = path.join(
    path.dirname(artifactRoot),
    "native-prover-route.input",
  );
  await writeJson(
    routeManifestPath,
    nativeBundleRouteManifest(routeDeployment),
  );
  const result = await buildBscNativeEvmProverBundleFromArtifacts({
    "route-manifest": routeManifestPath,
    "artifact-root": artifactRoot,
    "proof-artifact": "proof-artifact.r1cs",
    "proving-key": "proving-key.zkey",
    "verifier-key": "groth16-key-material.json",
    "groth16-material-manifest": groth16MaterialManifest.relativePath,
    "groth16-proof-self-test": groth16ProofSelfTestPath,
    "snarkjs-bin": groth16MaterialManifest.snarkjsBin,
    "trusted-attestation-signer":
      groth16MaterialManifest.trustedSignerFingerprints.join(","),
    "cross-sdk-parity": "cross-sdk-parity.json",
    "native-prover-self-test": "native-prover-self-test.json",
    "javascript-implementation": "javascript/implementation.native",
    "swift-implementation": "swift/implementation.native",
    "kotlin-implementation": "kotlin/implementation.native",
    "java-android-implementation": "java-android/implementation.native",
    "dotnet-implementation": "dotnet/implementation.native",
    "audit-circuit-security":
      groth16MaterialManifest.manifest.attestations.circuitSecurity.sha256,
    "audit-native-implementation": attestationHash(
      "bsc runtime config native implementation audit",
    ),
    "audit-reproducible-build":
      groth16MaterialManifest.manifest.attestations.reproducibleBuild.sha256,
    "audit-no-wasm-no-remote-scan": attestationHash(
      "bsc runtime config no wasm no remote scan",
    ),
  });
  const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
    validateBscTestnetNativeEvmProverBundle(result.bundle, {
      expectedDestinationBindingHash: routeDeployment.destinationBindingHash,
    }),
  );
  const nativeBundlePath = path.join(
    artifactRoot,
    "bsc-testnet-native-evm-prover-bundle.json",
  );
  await writeJson(nativeBundlePath, result.bundle);
  return {
    artifactRoot,
    nativeBundlePath,
    nativeEvmProverBundleHash,
    proofArtifact: path.join(artifactRoot, "proof-artifact.r1cs"),
    provingKey: path.join(artifactRoot, "proving-key.zkey"),
    verifierKey: path.join(artifactRoot, "groth16-key-material.json"),
    sdkImplementationPaths,
  };
};

const routeReport = (deployment, overrides = {}) => ({
  ready: true,
  manifestSource: "torii",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  taira: {
    chainId: BSC_TAIRA_CHAIN_ID,
    networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
  },
  bsc: {
    network: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
  },
  deployment: {
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    tokenAddress: BSC_TOKEN_ADDRESS,
    sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    verifierCodeHash: HASH_11,
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    ...deployment,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_55}`,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: HASH_77,
    routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_77}`,
    offlineFullTomlSha256: HASH_88,
  },
  checks: requiredBscRouteCheckIds("testnet").map((id) => ({
    id,
    ok: true,
    message: `${id} ready`,
  })),
  ...overrides,
});

const writeJson = (filePath, payload) =>
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const createRuntimeMaterial = async ({
  backendBytes = backendModuleBytes(),
  proofBytes = proofArtifactMaterialBytes(7),
  provingBytes = provingKeyMaterialBytes(11),
  verifierBytes = verifierKeyMaterialBytes(),
  bundleOverrides = {},
} = {}) => {
  const root = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-config-"));
  const publicDir = path.join(root, "public/sccp-bsc");
  await mkdir(publicDir, { recursive: true });
  const verifierKeyHash = verifierKeyHashForMaterial();
  const deployment = {
    verifierKeyHash,
    verifierKeyArtifactHash: sha256Hex(verifierBytes),
    proofArtifactHash: sha256Hex(proofBytes),
    provingKeyHash: sha256Hex(provingBytes),
    destinationBindingHash: bscDestinationBindingHash({
      verifierAddress: BSC_VERIFIER_ADDRESS,
      bridgeAddress: BSC_BRIDGE_ADDRESS,
      verifierCodeHash: HASH_11,
      verifierKeyHash,
    }),
  };
  const generatedBundle = await writeGeneratedNativeProverBundle({
    artifactRoot: path.join(publicDir, "native-prover"),
    routeDeployment: { ...deployment, verifierCodeHash: HASH_11 },
    proofArtifactBytes: proofBytes,
    provingKeyBytes: provingBytes,
    verifierKeyBytes: verifierBytes,
  });
  deployment.nativeEvmProverBundleHash =
    generatedBundle.nativeEvmProverBundleHash;
  if (Object.keys(bundleOverrides).length) {
    const bundle = JSON.parse(
      await readFile(generatedBundle.nativeBundlePath, "utf8"),
    );
    await writeJson(generatedBundle.nativeBundlePath, {
      ...bundle,
      ...bundleOverrides,
    });
  }
  const paths = {
    outputPath: path.join(publicDir, "taira-bsc-xor-prover.config.json"),
    proofArtifact: generatedBundle.proofArtifact,
    provingKey: generatedBundle.provingKey,
    verifierKey: generatedBundle.verifierKey,
    nativeBundle: generatedBundle.nativeBundlePath,
    backendModule: path.join(publicDir, "backend.js"),
    sdkImplementationPaths: generatedBundle.sdkImplementationPaths,
  };
  await writeFile(paths.backendModule, backendBytes);
  const urls = {
    nativeProverBundleUrl:
      "/sccp-bsc/native-prover/bsc-testnet-native-evm-prover-bundle.json",
    nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
    proofArtifactUrl: "/sccp-bsc/native-prover/proof-artifact.r1cs",
    provingKeyUrl: "/sccp-bsc/native-prover/proving-key.zkey",
    verifierKeyUrl: "/sccp-bsc/native-prover/groth16-key-material.json",
    backendModuleUrl: "/sccp-bsc/backend.js",
  };
  return {
    root,
    publicDir,
    paths,
    urls,
    deployment,
    routeReport: routeReport(deployment),
  };
};

const retargetRuntimeNativeBundleHashes = async (
  material,
  { proofBytes = null, provingBytes = null } = {},
) => {
  const proofArtifactHash = proofBytes
    ? sha256Hex(proofBytes)
    : material.deployment.proofArtifactHash;
  const provingKeyHash = provingBytes
    ? sha256Hex(provingBytes)
    : material.deployment.provingKeyHash;
  const bundle = JSON.parse(
    await readFile(material.paths.nativeBundle, "utf8"),
  );
  const sdkArtifactsKey = Array.isArray(bundle.native_sdk_artifacts)
    ? "native_sdk_artifacts"
    : "nativeSdkArtifacts";
  const retargetSdkArtifact = (artifact) => {
    const updated = { ...artifact };
    if ("prover_artifact_hash" in updated) {
      updated.prover_artifact_hash = proofArtifactHash;
    }
    if ("proverArtifactHash" in updated) {
      updated.proverArtifactHash = proofArtifactHash;
    }
    if (
      !("prover_artifact_hash" in updated) &&
      !("proverArtifactHash" in updated)
    ) {
      updated.prover_artifact_hash = proofArtifactHash;
    }
    if ("proving_key_hash" in updated) {
      updated.proving_key_hash = provingKeyHash;
    }
    if ("provingKeyHash" in updated) {
      updated.provingKeyHash = provingKeyHash;
    }
    if (!("proving_key_hash" in updated) && !("provingKeyHash" in updated)) {
      updated.proving_key_hash = provingKeyHash;
    }
    return updated;
  };
  const updatedBundle = {
    ...bundle,
    proof_artifact_hash: proofArtifactHash,
    proving_key_hash: provingKeyHash,
    [sdkArtifactsKey]: (bundle[sdkArtifactsKey] ?? []).map(retargetSdkArtifact),
  };
  if ("proofArtifactHash" in bundle) {
    updatedBundle.proofArtifactHash = proofArtifactHash;
  }
  if ("provingKeyHash" in bundle) {
    updatedBundle.provingKeyHash = provingKeyHash;
  }
  const descriptor = validateBscTestnetNativeEvmProverBundle(updatedBundle, {
    expectedDestinationBindingHash: material.deployment.destinationBindingHash,
  });
  await writeJson(material.paths.nativeBundle, updatedBundle);
  return {
    ...material.deployment,
    proofArtifactHash,
    provingKeyHash,
    nativeEvmProverBundleHash:
      canonicalBscNativeEvmProverBundleHash(descriptor),
  };
};

const injectRuntimeNativeSelfTestSourceProofCollision = async (material) => {
  const nativeProverRoot = path.dirname(material.paths.nativeBundle);
  const parityPath = path.join(nativeProverRoot, "cross-sdk-parity.json");
  const selfTestPath = path.join(
    nativeProverRoot,
    "native-prover-self-test.json",
  );
  const parityFixture = JSON.parse(await readFile(parityPath, "utf8"));
  const selfTestFixture = JSON.parse(await readFile(selfTestPath, "utf8"));
  selfTestFixture.source_proof_hash = parityFixture.source_proof_hash;
  for (const sdkResult of Object.values(selfTestFixture.sdk_results)) {
    sdkResult.source_proof_hash = parityFixture.source_proof_hash;
  }
  await writeJson(selfTestPath, selfTestFixture);

  const bundle = JSON.parse(
    await readFile(material.paths.nativeBundle, "utf8"),
  );
  const updatedBundle = {
    ...bundle,
    audit_hashes: {
      ...bundle.audit_hashes,
      native_prover_self_test: sha256Hex(await readFile(selfTestPath)),
    },
  };
  const descriptor = validateBscTestnetNativeEvmProverBundle(updatedBundle, {
    expectedDestinationBindingHash: material.deployment.destinationBindingHash,
  });
  await writeJson(material.paths.nativeBundle, updatedBundle);
  const nativeEvmProverBundleHash =
    canonicalBscNativeEvmProverBundleHash(descriptor);
  material.deployment.nativeEvmProverBundleHash = nativeEvmProverBundleHash;
  material.routeReport.deployment.nativeEvmProverBundleHash =
    nativeEvmProverBundleHash;
};

describe("BSC SCCP runtime prover config generator", () => {
  it("writes and validates a canonical runtime config from route-bound material", async () => {
    const material = await createRuntimeMaterial();
    try {
      const result = await writeBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      const written = JSON.parse(await readFile(result.outputPath, "utf8"));

      expect(result.publicUrl).toBe(
        "/sccp-bsc/taira-bsc-xor-prover.config.json",
      );
      expect(written).toMatchObject({
        schema: SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        destination: {
          nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
          nativeProverBundleSha256: sha256Hex(
            await readFile(material.paths.nativeBundle),
          ),
          nativeEvmProverBundleHash:
            material.deployment.nativeEvmProverBundleHash,
          proofArtifactSha256: material.deployment.proofArtifactHash,
          provingKeySha256: material.deployment.provingKeyHash,
          verifierKeySha256: material.deployment.verifierKeyArtifactHash,
          backendModuleSha256: sha256Hex(
            await readFile(material.paths.backendModule),
          ),
          backendSelfContained: true,
          backendAcceptedExport: "bscSccpProve",
          backendAcceptedSelfTestExport: "bscSccpNativeProverSelfTest",
        },
        source: {
          proofArtifactSha256: material.deployment.proofArtifactHash,
          provingKeySha256: material.deployment.provingKeyHash,
          verifierKeySha256: material.deployment.verifierKeyArtifactHash,
          nativeEvmProverBundleHash:
            material.deployment.nativeEvmProverBundleHash,
          backendSelfContained: true,
          backendAcceptedExport: "bscSccpSourceProve",
          backendAcceptedSelfTestExport: "bscSccpSourceNativeProverSelfTest",
        },
      });
      expect([...written.destination.nativeProverVerifiedSdks].sort()).toEqual(
        REQUIRED_NATIVE_PROVER_SDKS,
      );
      expect([...written.source.nativeProverVerifiedSdks].sort()).toEqual(
        REQUIRED_NATIVE_PROVER_SDKS,
      );
      await expect(
        validateBscSccpRuntimeProverConfig({
          config: written,
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).resolves.toEqual(written);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("does not infer source prover material from destination inputs", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/source\.nativeProverBundleUrl is required/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("builds the same canonical config without writing it", async () => {
    const material = await createRuntimeMaterial();
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });

      expect(config).toMatchObject({
        schema: SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
        bscChainIdHex: "0x61",
        bscNetworkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
        destination: {
          nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
        },
      });
      expect([...config.destination.nativeProverVerifiedSdks].sort()).toEqual(
        REQUIRED_NATIVE_PROVER_SDKS,
      );
      expect(
        assertBscSccpRuntimeProverConfigMaterialRoleSeparation(config),
      ).toBe(true);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime config fields supplied only by Object.prototype", async () => {
    const material = await createRuntimeMaterial();
    const previousSchema = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "schema",
    );

    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      const inheritedSchema = config.schema;
      delete config.schema;

      Object.defineProperty(Object.prototype, "schema", {
        configurable: true,
        enumerable: false,
        writable: true,
        value: inheritedSchema,
      });

      await expect(
        validateBscSccpRuntimeProverConfig({
          config,
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        `BSC runtime prover config schema must be ${SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA}.`,
      );
    } finally {
      if (previousSchema) {
        Object.defineProperty(Object.prototype, "schema", previousSchema);
      } else {
        delete Object.prototype.schema;
      }
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime config material hash role reuse", async () => {
    const material = await createRuntimeMaterial();
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      const proofKeyReuse = {
        ...config,
        destination: {
          ...config.destination,
          provingKeySha256: config.destination.proofArtifactSha256,
        },
      };
      const nativeDescriptorReuse = {
        ...config,
        source: {
          ...config.source,
          nativeEvmProverBundleHash: config.source.nativeProverBundleSha256,
        },
      };

      expect(() =>
        assertBscSccpRuntimeProverConfigMaterialRoleSeparation(proofKeyReuse),
      ).toThrow(
        /destination proving key sha256 matches destination proof artifact sha256/u,
      );
      expect(() =>
        assertBscSccpRuntimeProverConfigMaterialRoleSeparation(
          nativeDescriptorReuse,
        ),
      ).toThrow(
        /source native EVM prover bundle descriptor hash matches source native prover bundle sha256/u,
      );
      await expect(
        validateBscSccpRuntimeProverConfig({
          config: proofKeyReuse,
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proving key sha256 matches destination proof artifact sha256/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects non-ready route reports before reading prover material", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, { ready: false }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report is not ready/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("reports all missing public route production hashes before runtime material reads", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-config-"));
    try {
      const badRouteReport = routeReport(
        {
          verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          proofArtifactHash: null,
          provingKeyHash: undefined,
          nativeEvmProverBundleHash: "",
          destinationBindingHash: HASH_55,
        },
        {
          ready: false,
        },
      );

      let caught = null;
      try {
        await buildBscSccpRuntimeProverConfig({
          routeReport: badRouteReport,
          destination: {
            nativeProverBundleUrl: "/missing/native-bundle.json",
            nativeProverArtifactBaseUrl: "/missing/",
            proofArtifactUrl: "/missing/proof.r1cs",
            provingKeyUrl: "/missing/proving.zkey",
            verifierKeyUrl: "/missing/verifier.json",
            backendModuleUrl: "/missing/backend.js",
          },
          source: {
            nativeProverBundleUrl: "/missing/native-bundle.json",
            nativeProverArtifactBaseUrl: "/missing/",
            proofArtifactUrl: "/missing/proof.r1cs",
            provingKeyUrl: "/missing/proving.zkey",
            verifierKeyUrl: "/missing/verifier.json",
            backendModuleUrl: "/missing/backend.js",
          },
          outputPath: path.join(root, "config.json"),
          root,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      const message = caught instanceof Error ? caught.message : "";
      expect(message).toMatch(/known diagnostic BSC verifier key hash/u);
      expect(message).toMatch(/route report is not ready/u);
      expect(message).toMatch(
        /proofArtifactHash must be a non-zero 32-byte hex value/u,
      );
      expect(message).toMatch(
        /provingKeyHash must be a non-zero 32-byte hex value/u,
      );
      expect(message).toMatch(
        /nativeEvmProverBundleHash must be a non-zero 32-byte hex value/u,
      );
      expect(message).not.toMatch(/ENOENT|no such file|missing\/backend/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked runtime prover config output files before writing", async () => {
    const material = await createRuntimeMaterial();
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-runtime-config-outside-"),
    );
    try {
      const targetPath = path.join(outside, "target.json");
      await writeFile(targetPath, "must-not-overwrite\n", "utf8");
      await symlink(targetPath, material.paths.outputPath);

      await expect(
        writeBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/must not be a symbolic link/u);
      await expect(readFile(targetPath, "utf8")).resolves.toBe(
        "must-not-overwrite\n",
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects runtime prover config output paths outside the package root", async () => {
    const material = await createRuntimeMaterial();
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-runtime-config-outside-"),
    );
    try {
      const escapedOutputPath = path.join(
        outside,
        "taira-bsc-xor-prover.config.json",
      );

      await expect(
        writeBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: escapedOutputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/must resolve inside package root/u);
      await expect(readFile(escapedOutputPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(material.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects unsafe runtime prover config output path syntax", () => {
    const root = "/repo";
    const cases = [
      {
        outputPath: "https://cdn.example.invalid/prover.config.json",
        detail: /URL or URI/u,
      },
      {
        outputPath: "public/sccp-bsc/taira-bsc-xor-prover.config.json?x=1",
        detail: /query strings or fragments/u,
      },
      {
        outputPath: "public/sccp-bsc/taira-bsc-xor-prover.config.json#frag",
        detail: /query strings or fragments/u,
      },
      {
        outputPath: "public/sccp-bsc/%2e%2e/config.json",
        detail: /percent-encoded path segments/u,
      },
      {
        outputPath: "public\\sccp-bsc\\config.json",
        detail: /POSIX separators/u,
      },
      {
        outputPath: "public/sccp-bsc/./config.json",
        detail: /current-directory/u,
      },
      {
        outputPath: "public/sccp-bsc//config.json",
        detail: /empty/u,
      },
      {
        outputPath: "public/sccp-bsc/../config.json",
        detail: /parent-directory/u,
      },
      {
        outputPath: "public/sccp-bsc/config.json\u0000",
        detail: /control characters/u,
      },
    ];

    for (const { outputPath, detail } of cases) {
      expect(() =>
        resolveBscRuntimeProverConfigOutputPath(outputPath, { root }),
      ).toThrow(detail);
    }
  });

  it("rejects route reports whose valid fields are only inherited properties", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: Object.create(routeReport(material.deployment)),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report must be a JSON object/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("ignores Object.prototype route report and deployment fields", async () => {
    const material = await createRuntimeMaterial();
    const fullReport = routeReport(material.deployment);
    const inherited = {
      ready: fullReport.ready,
      manifestSource: fullReport.manifestSource,
      routeId: fullReport.routeId,
      assetKey: fullReport.assetKey,
      taira: fullReport.taira,
      bsc: fullReport.bsc,
      deployment: fullReport.deployment,
      checks: fullReport.checks,
    };
    const pollutedEntries = Object.entries(inherited);
    const previousDescriptors = new Map(
      pollutedEntries.map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );

    try {
      for (const [key, value] of pollutedEntries) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: {
            postDeployLiveEvidence: fullReport.postDeployLiveEvidence,
          },
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report deployment is missing/u);
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed route report fields without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const readyGetter = vi.fn(() => {
        throw new Error("route ready getter should not run");
      });
      const report = { ...material.routeReport };
      Object.defineProperty(report, "ready", {
        configurable: true,
        enumerable: true,
        get: readyGetter,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: report,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report is not ready/u);
      expect(readyGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed route checks without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const checkGetter = vi.fn(() => {
        throw new Error("route check getter should not run");
      });
      const checks = material.routeReport.checks.map((entry) => ({ ...entry }));
      Object.defineProperty(checks, "0", {
        configurable: true,
        enumerable: true,
        get: checkGetter,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: { ...material.routeReport, checks },
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report check 0 is not an object/u);
      expect(checkGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed verifier vector entries without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const alphaGetter = vi.fn(() => {
        throw new Error("verifier vector getter should not run");
      });
      const alpha1 = [VALID_VERIFIER_MATERIAL.alpha1[0]];
      Object.defineProperty(alpha1, "1", {
        configurable: true,
        enumerable: true,
        get: alphaGetter,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1,
            },
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/alpha1\[1\] must be a data property/u);
      expect(alphaGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects sparse verifier vector entries in route reports", async () => {
    const material = await createRuntimeMaterial();
    try {
      const alpha1 = [VALID_VERIFIER_MATERIAL.alpha1[0]];
      alpha1.length = 2;

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1,
            },
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/alpha1\[1\] is missing/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects cyclic verifier vector entries in route reports", async () => {
    const material = await createRuntimeMaterial();
    try {
      const alpha1 = [VALID_VERIFIER_MATERIAL.alpha1[0]];
      alpha1[1] = alpha1;

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1,
            },
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/alpha1\[1\] must not be cyclic/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("does not invoke accessor-backed top-level runtime config option fields", async () => {
    const getters = new Map(
      [
        "config",
        "routeReport",
        "bscNetwork",
        "destination",
        "source",
        "outputPath",
        "root",
        "fetchImpl",
        "timeoutMs",
      ].map((key) => [
        key,
        vi.fn(() => {
          throw new Error(`${key} getter should not run`);
        }),
      ]),
    );
    const options = {};
    for (const [key, getter] of getters) {
      Object.defineProperty(options, key, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    await expect(buildBscSccpRuntimeProverConfig(options)).rejects.toThrow(
      /route report must be a JSON object/u,
    );
    await expect(validateBscSccpRuntimeProverConfig(options)).rejects.toThrow(
      /BSC runtime prover config must be a JSON object/u,
    );
    await expect(writeBscSccpRuntimeProverConfig(options)).rejects.toThrow(
      /route report must be a JSON object/u,
    );
    for (const getter of getters.values()) {
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("rejects accessor-backed route deployments without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const deploymentGetter = vi.fn(() => {
        throw new Error("route deployment getter should not run");
      });
      const report = { ...material.routeReport };
      Object.defineProperty(report, "deployment", {
        configurable: true,
        enumerable: true,
        get: deploymentGetter,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: report,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report deployment is missing/u);
      expect(deploymentGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed nested route deployment fields without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const verifierKeyHashGetter = vi.fn(() => {
        throw new Error(
          "route deployment verifierKeyHash getter should not run",
        );
      });
      const deployment = { ...material.routeReport.deployment };
      Object.defineProperty(deployment, "verifierKeyHash", {
        configurable: true,
        enumerable: true,
        get: verifierKeyHashGetter,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: {
            ...material.routeReport,
            deployment,
          },
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/verifierKeyHash/u);
      expect(verifierKeyHashGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("ignores accessor-backed forbidden route aliases without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const tronVerifierGetter = vi.fn(() => {
        throw new Error("TRON verifier alias getter should not run");
      });
      const deployment = { ...material.routeReport.deployment };
      Object.defineProperty(deployment, "tronVerifierAddress", {
        configurable: true,
        enumerable: true,
        get: tronVerifierGetter,
      });

      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: {
          ...material.routeReport,
          deployment,
        },
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });

      expect(config.schema).toBe(SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA);
      expect(tronVerifierGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects accessor-backed runtime config URLs without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      const bundleUrlGetter = vi.fn(() => {
        throw new Error("destination bundle URL getter should not run");
      });
      const destination = { ...config.destination };
      Object.defineProperty(destination, "nativeProverBundleUrl", {
        configurable: true,
        enumerable: true,
        get: bundleUrlGetter,
      });

      await expect(
        validateBscSccpRuntimeProverConfig({
          config: { ...config, destination },
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/destination\.nativeProverBundleUrl is required/u);
      expect(bundleUrlGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects accessor-backed runtime SDK arrays without invoking them", async () => {
    const material = await createRuntimeMaterial();
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      const sdkGetter = vi.fn(() => {
        throw new Error("native SDK getter should not run");
      });
      const nativeProverVerifiedSdks = [
        ...config.destination.nativeProverVerifiedSdks,
      ];
      Object.defineProperty(nativeProverVerifiedSdks, "0", {
        configurable: true,
        enumerable: true,
        get: sdkGetter,
      });

      await expect(
        validateBscSccpRuntimeProverConfig({
          config: {
            ...config,
            destination: {
              ...config.destination,
              nativeProverVerifiedSdks,
            },
          },
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/not canonical for the supplied route and artifacts/u);
      expect(sdkGetter).not.toHaveBeenCalled();
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects forged ready route reports carrying diagnostic or secret-like material before reading prover material", async () => {
    const material = await createRuntimeMaterial();
    try {
      const cases = [
        {
          report: routeReport(material.deployment, {
            warnings: ["diagnostic verifier material accepted upstream"],
          }),
          pattern: /diagnostic verifier material/u,
        },
        {
          report: routeReport(material.deployment, {
            diagnosticVerifierMaterial: true,
          }),
          pattern: /diagnosticVerifierMaterial=true/u,
        },
        {
          report: routeReport({
            ...material.deployment,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          }),
          pattern: /known diagnostic BSC verifier key hash/u,
        },
        {
          report: routeReport(material.deployment, {
            readback: {
              bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            },
          }),
          pattern: /known diagnostic BSC verifier key hash/u,
          forbidden: ["bridgeVerifierKeyHash"],
        },
        {
          report: routeReport(material.deployment, {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1: ["1", "3"],
            },
          }),
          pattern: /invalid BN254 verifier material/u,
          forbidden: ["verifierMaterial", "alpha1"],
        },
        {
          report: routeReport(material.deployment, {
            nested: {
              material: {
                ...VALID_VERIFIER_MATERIAL,
                beta2: [1, 2, 3, 4],
              },
            },
          }),
          pattern: /invalid BN254 verifier material/u,
          forbidden: ["beta2"],
        },
        {
          report: routeReport(material.deployment, {
            artifacts: {
              verifier: {
                ...VALID_VERIFIER_MATERIAL,
                gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
              },
            },
          }),
          pattern: /invalid BN254 verifier material/u,
          forbidden: [BN254_BASE_FIELD_MODULUS, "gamma2"],
        },
        {
          report: routeReport(material.deployment, {
            readinessBinding: {
              ...VALID_VERIFIER_MATERIAL,
              ic: VALID_G1_POINTS.slice(1, 10).flat(),
            },
          }),
          pattern: /invalid BN254 verifier material/u,
          forbidden: ["readinessBinding", "ic"],
        },
        {
          report: routeReport(material.deployment, {
            operator: {
              mnemonic: VALID_MNEMONIC,
            },
          }),
          pattern: /secret-like material/u,
          forbidden: ["operator.mnemonic", "mnemonic"],
        },
        {
          report: routeReport(material.deployment, {
            operator: {
              apiKey: "do-not-leak-runtime-api-key",
            },
          }),
          pattern: /secret-like material/u,
          forbidden: ["apiKey", "do-not-leak-runtime-api-key"],
        },
        {
          report: routeReport(material.deployment, {
            detail: `private_key=${"11".repeat(32)}`,
          }),
          pattern: /secret-like material/u,
          forbidden: ["route report.detail", "private_key"],
        },
        {
          report: routeReport(material.deployment, {
            detail: `authToken=${"22".repeat(32)}`,
          }),
          pattern: /secret-like material/u,
          forbidden: ["route report.detail", "authToken"],
        },
        {
          report: routeReport(material.deployment, {
            audit: {
              note: "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
            },
          }),
          pattern: /secret-like material/u,
          forbidden: ["Bearer", "mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l"],
        },
        {
          report: routeReport(material.deployment, {
            checks: routeReport(material.deployment).checks.map((entry) =>
              entry.id === "bsc-production-ready"
                ? { ...entry, ok: false, status: "pass" }
                : entry,
            ),
          }),
          pattern:
            /route report check bsc-production-ready has contradictory ok\/status/u,
        },
        {
          report: routeReport(material.deployment, {
            checks: [
              ...routeReport(material.deployment).checks,
              {
                ...routeReport(material.deployment).checks[0],
                status: "pass",
              },
            ],
          }),
          pattern: /route report check id .* is duplicated/u,
        },
        {
          report: routeReport(material.deployment, {
            checks: routeReport(material.deployment).checks.map((entry) =>
              entry.id === "bsc-production-ready"
                ? { id: entry.id, message: entry.message, status: "maybe" }
                : entry,
            ),
          }),
          pattern:
            /route report check bsc-production-ready has no machine-readable pass\/fail state/u,
        },
        {
          report: routeReport({
            ...material.deployment,
            sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
          }),
          pattern:
            /sourceBridgeAddress must not use TRON aliases on BSC route reports: sccp_tron_source_bridge_address/u,
        },
        {
          report: routeReport({
            ...material.deployment,
            tron_verifier_address: BSC_VERIFIER_ADDRESS,
          }),
          pattern:
            /verifierAddress must not use TRON aliases on BSC route reports: tron_verifier_address/u,
        },
      ];

      for (const { report, pattern, forbidden = [] } of cases) {
        let caught = null;
        try {
          await buildBscSccpRuntimeProverConfig({
            routeReport: report,
            destination: {},
            source: {},
            outputPath: material.paths.outputPath,
            root: material.root,
          });
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(Error);
        const message = caught instanceof Error ? caught.message : "";
        expect(message).toMatch(pattern);
        expect(message).not.toContain("private_key=");
        expect(message).not.toContain("abandon abandon");
        expect(message).not.toMatch(/destination\\.nativeProverBundleUrl/u);
        for (const value of forbidden) {
          expect(message).not.toContain(value);
        }
      }
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects testnet route reports when the caller asks for a BSC mainnet runtime config", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          bscNetwork: "mainnet",
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/route report is not bound to BSC mainnet network/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects forged mainnet route reports that only carry the stale testnet chain-id check", async () => {
    const material = await createRuntimeMaterial();
    try {
      const forgedChecks = routeReport(material.deployment).checks.map(
        (entry) =>
          entry.id === "bsc-testnet-network-id"
            ? { ...entry, id: "bsc-mainnet-network-id" }
            : entry,
      );
      const report = routeReport(
        {
          ...material.deployment,
          networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        },
        {
          bsc: {
            network: "mainnet",
            chain: "bsc-mainnet",
            chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
            networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
          },
          checks: forgedChecks,
        },
      );

      let caught = null;
      try {
        await buildBscSccpRuntimeProverConfig({
          routeReport: report,
          bscNetwork: "mainnet",
          destination: {},
          source: {},
          outputPath: material.paths.outputPath,
          root: material.root,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(Error);
      const message = caught instanceof Error ? caught.message : "";
      expect(message).toMatch(
        /bsc-mainnet-chain-id preflight check has not passed/u,
      );
      expect(message).not.toMatch(/nativeProverBundleUrl/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports without a passing native EVM prover bundle preflight check", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            checks: routeReport(material.deployment).checks.filter(
              (entry) => entry.id !== "bsc-native-evm-prover-bundle",
            ),
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /bsc-native-evm-prover-bundle preflight check has not passed/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports without a passing production verifier-material preflight check", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            checks: routeReport(material.deployment).checks.filter(
              (entry) => entry.id !== "bsc-production-verifier-material",
            ),
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /bsc-production-verifier-material preflight check has not passed/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports without a passing route-preflight runbook contract", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(material.deployment, {
            checks: routeReport(material.deployment).checks.filter(
              (entry) => entry.id !== "bsc-preflight-runbook-contract",
            ),
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /bsc-preflight-runbook-contract preflight check has not passed/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundle hash drift from the public route", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport({
            ...material.deployment,
            proofArtifactHash: repeatedHash(0xee),
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/proofArtifactHash does not match public route/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundle descriptor hash drift from the public route", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport({
            ...material.deployment,
            nativeEvmProverBundleHash: repeatedHash(0xee),
          }),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/descriptor hash does not match public route/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundles with duplicate JSON object keys", async () => {
    const material = await createRuntimeMaterial();
    try {
      const bundleText = await readFile(material.paths.nativeBundle, "utf8");
      expect(bundleText).toContain('"chain": "bsc-testnet"');
      await writeFile(
        material.paths.nativeBundle,
        bundleText.replace(
          '"chain": "bsc-testnet"',
          '"chain": "bsc-mainnet",\n  "chain": "bsc-testnet"',
        ),
        "utf8",
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/duplicate JSON object key/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundles without explicit verifier key artifact hashes", async () => {
    const material = await createRuntimeMaterial();
    try {
      const bundle = JSON.parse(
        await readFile(material.paths.nativeBundle, "utf8"),
      );
      delete bundle.verifier_key_artifact_hash;
      delete bundle.verifierKeyArtifactHash;
      await writeJson(material.paths.nativeBundle, bundle);

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination native prover bundle verifierKeyArtifactHash is required/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundles with duplicate verifier key artifact hash aliases", async () => {
    const material = await createRuntimeMaterial();
    try {
      const bundle = JSON.parse(
        await readFile(material.paths.nativeBundle, "utf8"),
      );
      bundle.verifierKeyArtifactHash = bundle.verifier_key_artifact_hash;
      await writeJson(material.paths.nativeBundle, bundle);

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination native prover bundle verifierKeyArtifactHash must not use multiple aliases/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundles that reuse verifier route and artifact hashes", async () => {
    const material = await createRuntimeMaterial();
    try {
      const bundle = JSON.parse(
        await readFile(material.paths.nativeBundle, "utf8"),
      );
      bundle.verifier_key_artifact_hash = bundle.verifier_key_hash;
      await writeJson(material.paths.nativeBundle, bundle);

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /nativeProverBundle hashes must be role-separated|destination native prover bundle verifierKeyArtifactHash must be role-separated from verifierKeyHash/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundles whose parity and self-test reports reuse proof hashes", async () => {
    const material = await createRuntimeMaterial();
    try {
      await injectRuntimeNativeSelfTestSourceProofCollision(material);

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /nativeProverReports hashes must be role-separated: nativeProverSelfTest\.sourceProofHash matches crossSdkParity\.sourceProofHash/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native prover bundle descriptor URLs with generic file extensions", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: {
            ...material.urls,
            nativeProverBundleUrl:
              "/sccp-bsc/native-prover/bsc-testnet-native-evm-prover-bundle.bin",
          },
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination native prover bundle must be loaded from a \.json artifact URL/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects proof artifact bytes that do not match the native bundle", async () => {
    const material = await createRuntimeMaterial();
    try {
      await writeFile(
        material.paths.proofArtifact,
        proofArtifactMaterialBytes(99),
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/proof artifact sha256 .* does not match/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proof artifacts with invalid r1cs headers", async () => {
    const material = await createRuntimeMaterial();
    try {
      const proofBytes = proofArtifactMaterialBytes(0x77);
      proofBytes[0] = 0x78;
      await writeFile(material.paths.proofArtifact, proofBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        proofBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact must start with \.r1cs magic bytes/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proof artifacts loaded from wasm URLs", async () => {
    const material = await createRuntimeMaterial();
    try {
      const wasmProofPath = path.join(
        path.dirname(material.paths.proofArtifact),
        "proof-artifact.wasm",
      );
      await writeFile(
        wasmProofPath,
        await readFile(material.paths.proofArtifact),
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: {
            ...material.urls,
            proofArtifactUrl: "/sccp-bsc/native-prover/proof-artifact.wasm",
          },
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact must be loaded from a \.r1cs artifact URL/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proving keys with invalid zkey headers", async () => {
    const material = await createRuntimeMaterial();
    try {
      const provingBytes = provingKeyMaterialBytes(0x78);
      provingBytes[0] = 0x78;
      await writeFile(material.paths.provingKey, provingBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        provingBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proving key must start with \.zkey magic bytes/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proof artifacts with invalid SnarkJS section tables", async () => {
    const material = await createRuntimeMaterial();
    try {
      const proofBytes = proofArtifactMaterialBytes(0x79);
      proofBytes.writeUInt32LE(proofBytes.length, 16);
      await writeFile(material.paths.proofArtifact, proofBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        proofBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact .*section exceeds file size/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proof artifacts with unsupported r1cs section ids", async () => {
    const material = await createRuntimeMaterial();
    try {
      const proofBytes = proofArtifactMaterialBytes(0x7a);
      proofBytes.writeUInt32LE(4, 12);
      await writeFile(material.paths.proofArtifact, proofBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        proofBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact \.r1cs missing required section ids: 1/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proving keys with unsupported zkey section ids", async () => {
    const material = await createRuntimeMaterial();
    try {
      const provingBytes = provingKeyMaterialBytes(0x7b);
      provingBytes.writeUInt32LE(11, 12);
      await writeFile(material.paths.provingKey, provingBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        provingBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proving key \.zkey missing required section ids: 1/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("accepts route-bound proof artifacts with valid out-of-order r1cs section ids", async () => {
    const proofBytes = proofArtifactMaterialBytes(0x7c);
    swapSnarkjsSectionIds(proofBytes, 0, 2);
    const material = await createRuntimeMaterial({ proofBytes });
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });

      expect(config.destination.proofArtifactSha256).toBe(
        sha256Hex(proofBytes),
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("accepts route-bound proving keys with valid out-of-order zkey section ids", async () => {
    const provingBytes = provingKeyMaterialBytes(0x7d);
    swapSnarkjsSectionIds(provingBytes, 0, 9);
    const material = await createRuntimeMaterial({ provingBytes });
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });

      expect(config.destination.provingKeySha256).toBe(
        sha256Hex(provingBytes),
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound repeated-byte runtime proof artifacts", async () => {
    const material = await createRuntimeMaterial();
    try {
      const proofBytes = Buffer.alloc(96 * 1024, 0xa7);
      await writeFile(material.paths.proofArtifact, proofBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        proofBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact looks like placeholder proof material: repeated 1-byte pattern/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound repeated-pattern runtime proving keys", async () => {
    const material = await createRuntimeMaterial();
    try {
      const provingBytes = Buffer.alloc(96 * 1024);
      for (let index = 0; index < provingBytes.length; index += 1) {
        provingBytes[index] = index % 32;
      }
      await writeFile(material.paths.provingKey, provingBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        provingBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proving key looks like placeholder proof material: repeated 32-byte pattern/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound arithmetic-sequence runtime proof artifacts", async () => {
    const material = await createRuntimeMaterial();
    try {
      const proofBytes = Buffer.alloc(96 * 1024);
      for (let index = 0; index < proofBytes.length; index += 1) {
        proofBytes[index] = (index * 17 + 23) & 0xff;
      }
      await writeFile(material.paths.proofArtifact, proofBytes);
      const deployment = await retargetRuntimeNativeBundleHashes(material, {
        proofBytes,
      });

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: routeReport(deployment),
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination proof artifact looks like placeholder proof material: arithmetic byte sequence with step 17/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects native SDK implementation bytes that do not match the native bundle", async () => {
    const material = await createRuntimeMaterial();
    try {
      await writeFile(
        material.paths.sdkImplementationPaths.dotnet,
        materialBytes(0xfe, 2048),
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/implementationBytes sha256 must match/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects unsafe material URLs", () => {
    expect(() =>
      normalizeBscRuntimeProverMaterialUrl(
        "../operator/proving-key.zkey",
        "proving key URL",
      ),
    ).toThrow(/parent directory/u);
    expect(() =>
      normalizeBscRuntimeProverMaterialUrl(
        "/sccp-bsc/%252525252e%252525252e/proving-key.zkey",
        "proving key URL",
      ),
    ).toThrow(/parent directory/u);
    expect(() =>
      normalizeBscRuntimeProverMaterialUrl(
        "https://user:pass@example.com/key.zkey",
        "proving key URL",
      ),
    ).toThrow(/credentials/u);
  });

  it("rejects local material URLs that resolve through symlinks", async () => {
    const material = await createRuntimeMaterial();
    try {
      const outsideProofArtifact = path.join(
        material.root,
        "outside-proof-artifact.r1cs",
      );
      await writeFile(
        outsideProofArtifact,
        await readFile(material.paths.proofArtifact),
      );
      await rm(material.paths.proofArtifact);
      await symlink(outsideProofArtifact, material.paths.proofArtifact);

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/destination proof artifact .*symbolic link/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized streamed remote runtime material before parsing it", async () => {
    const material = await createRuntimeMaterial();
    try {
      const destination = {
        ...material.urls,
        nativeProverBundleUrl:
          "https://cdn.example.invalid/bsc-testnet-native-evm-prover-bundle.json",
      };
      const fetchCalls = [];
      const fetchImpl = async (url) => {
        fetchCalls.push(String(url));
        return streamingBytesResponse(512 * 1024 + 1);
      };

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
          fetchImpl,
        }),
      ).rejects.toThrow(/destination native prover bundle .*exceeds/u);
      expect(fetchCalls).toEqual([
        "https://cdn.example.invalid/bsc-testnet-native-evm-prover-bundle.json",
      ]);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized local runtime material before parsing it", async () => {
    const material = await createRuntimeMaterial();
    try {
      await writeFile(
        material.paths.nativeBundle,
        Buffer.alloc(512 * 1024 + 1, 0x61),
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/destination native prover bundle .*too large/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it.each([
    ["encoded parent directory", "%2e%2e/cross-sdk-parity.json"],
    ["double-encoded parent directory", "%252e%252e/cross-sdk-parity.json"],
  ])(
    "rejects native bundle artifact paths with %s segments",
    async (_label, artifactPath) => {
      const material = await createRuntimeMaterial();
      try {
        const bundle = JSON.parse(
          await readFile(material.paths.nativeBundle, "utf8"),
        );
        bundle.cross_sdk_parity_artifact = artifactPath;
        await writeJson(material.paths.nativeBundle, bundle);
        expect(() =>
          validateBscTestnetNativeEvmProverBundle(bundle, {
            expectedDestinationBindingHash:
              material.deployment.destinationBindingHash,
          }),
        ).toThrow(
          /crossSdkParityArtifact must not contain percent-encoded path segments/u,
        );

        await expect(
          buildBscSccpRuntimeProverConfig({
            routeReport: material.routeReport,
            destination: material.urls,
            source: material.urls,
            outputPath: material.paths.outputPath,
            root: material.root,
          }),
        ).rejects.toThrow(
          /crossSdkParityArtifact must not contain percent-encoded path segments/u,
        );
      } finally {
        await rm(material.root, { recursive: true, force: true });
      }
    },
  );

  it("rejects symlinked CLI route reports before reading runtime material", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-"));
    try {
      const target = path.join(tempRoot, "route-report.target.json");
      const link = path.join(tempRoot, "route-report.json");
      await writeFile(target, JSON.stringify({ ready: true }), "utf8");
      await symlink(target, link);

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
            "--route-report",
            link,
            "--out",
            path.join(tempRoot, "config.json"),
          ],
          { cwd: repoRoot },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/symbolic link/u),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects oversized CLI route reports before reading runtime material", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-"));
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      await writeFile(
        routeReportPath,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
            "--route-report",
            routeReportPath,
            "--out",
            path.join(tempRoot, "config.json"),
          ],
          { cwd: repoRoot },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/maximum allowed/u),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects non-object CLI route report JSON before reading runtime material", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-"));
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      await writeFile(routeReportPath, JSON.stringify([]), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
            "--route-report",
            routeReportPath,
            "--out",
            path.join(tempRoot, "config.json"),
          ],
          { cwd: repoRoot },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/JSON object/u),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects duplicate JSON object keys in CLI route reports before reading runtime material", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-runtime-"));
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      await writeFile(
        routeReportPath,
        `${JSON.stringify(
          { ready: false, readyShadow: false },
          null,
          2,
        ).replace('"ready": false,', '"ready": false,\n  "ready": true,')}\n`,
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-runtime-prover-config.mjs",
            "--route-report",
            routeReportPath,
            "--out",
            path.join(tempRoot, "config.json"),
          ],
          { cwd: repoRoot },
        ),
      ).rejects.toMatchObject({
        stderr: expect.stringMatching(/duplicate JSON object key/u),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects duplicate runtime material URL aliases", async () => {
    const material = await createRuntimeMaterial();
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: {
            ...material.urls,
            destinationProofArtifactUrl: material.urls.proofArtifactUrl,
          },
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination\.proofArtifactUrl must not use multiple aliases/u,
      );

      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: {
            ...material.urls,
            destinationNativeProverArtifactBaseUrl:
              material.urls.nativeProverArtifactBaseUrl,
          },
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /destination\.nativeProverArtifactBaseUrl must not use multiple aliases/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that are not production-shaped", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: badBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/not production-shaped/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that do not export the required direction prover", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: destinationOnlyBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/source backend module does not export/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects source backend modules without public-input bindings", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: sourceBackendWithoutPublicInputsBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/public-input binding fields/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that do not export required native self-tests", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: missingSelfTestBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/native self-test/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("accepts backend modules with import-like text in comments and strings", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: importLikeTextBackendModuleBytes(),
    });
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });
      expect(config.destination.backendModuleSha256).toBe(
        sha256Hex(importLikeTextBackendModuleBytes()),
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that statically import unverified dependencies", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: staticImportBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/must be self-contained and must not import/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that dynamically import unverified dependencies", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: dynamicImportBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /must be self-contained and must not dynamically import/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that access import metadata", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: importMetaBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(
        /must be self-contained and must not use import metadata/u,
      );
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules whose prover exports only appear in comments", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: commentOnlyBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/does not export one of/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules whose required prover exports are not callable", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: nonCallableBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/callable function/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects backend modules that are not parseable JavaScript modules", async () => {
    const material = await createRuntimeMaterial({
      backendBytes: syntaxBrokenBackendModuleBytes(),
    });
    try {
      await expect(
        buildBscSccpRuntimeProverConfig({
          routeReport: material.routeReport,
          destination: material.urls,
          source: material.urls,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/valid JavaScript module/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  });

  it("rejects non-canonical edited configs", async () => {
    const material = await createRuntimeMaterial();
    try {
      const config = await buildBscSccpRuntimeProverConfig({
        routeReport: material.routeReport,
        destination: material.urls,
        source: material.urls,
        outputPath: material.paths.outputPath,
        root: material.root,
      });

      await expect(
        validateBscSccpRuntimeProverConfig({
          config: {
            ...config,
            destination: {
              ...config.destination,
              backendModuleSha256: repeatedHash(0xcd),
            },
          },
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/not canonical/u);

      await expect(
        validateBscSccpRuntimeProverConfig({
          config: {
            ...config,
            source: {
              ...config.source,
              backendAcceptedSelfTestExport: "bscSccpNativeProverSelfTest",
            },
          },
          routeReport: material.routeReport,
          outputPath: material.paths.outputPath,
          root: material.root,
        }),
      ).rejects.toThrow(/not canonical/u);
    } finally {
      await rm(material.root, { recursive: true, force: true });
    }
  }, 15_000);
});
