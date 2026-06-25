/* global BigInt */
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_TESTNET_NETWORK_ID_HEX,
  DEFAULT_BSC_TAIRA_TORII_URL,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  canonicalBscNativeEvmProverBundleHash,
  resolveBscNetworkProfile,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import {
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  SCCP_BSC_LIVE_SMOKE_STEPS,
  SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
  SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_PROVER_MODULE_URL_ENV,
  SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
  SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
  SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
  SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
  bscSccpPeerConfigAuditReportPath,
  bscSccpSmokeReadinessOutputDir,
  bscSccpLiveSmokeReadinessRunbookProblems,
  assertBscSccpBrowserProverModuleExports,
  deriveBscRuntimeProverConfigUrl,
  deriveSccpBrowserProverManifestUrl,
  evaluateBscSccpLiveSmokeReadiness,
  normalizeBscWalletConnectProjectId,
  requiredBscSmokeRouteCheckIds,
  validateBscSccpRuntimeProverConfigManifest,
  validateBscSccpBrowserProverModuleBytes,
  inspectBscSccpBrowserProverManifest,
  inspectBscSccpRuntimeProverConfig,
  inspectSccpBrowserModuleAvailability,
  runBscSccpLiveSmokeReadiness,
  validateBscSccpBrowserProverManifest,
  writeBscSccpLiveSmokeReadinessReport,
} from "../scripts/e2e/sccp-bsc-live-smoke-readiness.mjs";
import {
  BSC_PROVER_SIDECAR_REQUIRED_ROUTE_CHECK_IDS,
  requiredBscProverSidecarRouteCheckIds,
} from "../scripts/e2e/sccp-bsc-prover-manifest.mjs";

const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const hex32 = (byte) => `0x${byte.repeat(32)}`;
const fixtureHash = (label) =>
  `0x${createHash("sha256").update(Buffer.from(label, "utf8")).digest("hex")}`;
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc smoke readiness bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc smoke readiness token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc smoke readiness source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc smoke readiness verifier");
const HASH_11 = fixtureHash("bsc smoke readiness fixture hash 11");
const HASH_22 = fixtureHash("bsc smoke readiness fixture hash 22");
const HASH_33 = fixtureHash("bsc smoke readiness fixture hash 33");
const HASH_44 = fixtureHash("bsc smoke readiness fixture hash 44");
const HASH_55 = fixtureHash("bsc smoke readiness fixture hash 55");
const HASH_66 = fixtureHash("bsc smoke readiness fixture hash 66");
const HASH_77 = fixtureHash("bsc smoke readiness fixture hash 77");
const HASH_88 = fixtureHash("bsc smoke readiness fixture hash 88");
const HASH_99 = fixtureHash("bsc smoke readiness fixture hash 99");
const DESTINATION_PROVER_MODULE_URL =
  "https://provers.sora.org/sccp-bsc-prover.js";
const SOURCE_PROVER_MODULE_URL =
  "https://provers.sora.org/sccp-bsc-source-prover.js";
const PROFILE_DESTINATION_PROVER_MODULE_URL =
  "https://provers.sora.org/bsc-destination.js";
const PROFILE_SOURCE_PROVER_MODULE_URL =
  "https://provers.sora.org/bsc-source.js";
const PROFILE_DESTINATION_PROVER_MANIFEST_URL =
  "https://provers.sora.org/bsc-destination.manifest.json";
const PROFILE_SOURCE_PROVER_MANIFEST_URL =
  "https://provers.sora.org/bsc-source.manifest.json";
const VALID_WALLETCONNECT_PROJECT_ID = fixtureHash(
  "bsc smoke readiness walletconnect project id",
).slice(2, 34);
const ZERO_HASH = `0x${"00".repeat(32)}`;
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const REQUIRED_NATIVE_PROVER_SDKS = Object.keys(
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
).sort();
const SMOKE_FIXTURE_G1 = ["1", "2"];
const SMOKE_FIXTURE_G2 = [
  "10857046999023057135944570762232829481370756359578518086990519993285655852781",
  "11559732032986387107991004021392285783925812861821192530917403151452391805634",
  "8495653923123431417604973247489272438418190587263600148770280649306958101930",
  "4082367875863433681332203403145435568316851327593401208105741076214120093531",
];
const SMOKE_FIXTURE_IC = Array.from(
  { length: 10 },
  () => SMOKE_FIXTURE_G1,
).flat();
const BN254_BASE_FIELD_MODULUS =
  "21888242871839275222246405745257275088696311157297823662689037894645226208583";
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
  beta2: SMOKE_FIXTURE_G2,
  gamma2: SMOKE_FIXTURE_G2,
  delta2: SMOKE_FIXTURE_G2,
  ic: VALID_G1_POINTS.slice(1, 11).flat(),
});
const SOURCE_EVENT_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_55}`;
const ROUTE_CANARY_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_77}`;
const MAINNET_SOURCE_EVENT_EXPLORER_URL = `https://bscscan.com/tx/${HASH_55}`;
const MAINNET_ROUTE_CANARY_EXPLORER_URL = `https://bscscan.com/tx/${HASH_77}`;
const productionBurnRecordBytes = (seed, sizeBytes = 768) => {
  const chunks = [];
  let counter = 0;
  while (Buffer.concat(chunks).length < sizeBytes) {
    chunks.push(
      createHash("sha256")
        .update(`sccp-bsc-live-smoke-burn-record:${seed}:${counter}`)
        .digest(),
    );
    counter += 1;
  }
  return Buffer.concat(chunks).subarray(0, sizeBytes);
};
const ARTIFACT_BYTES = productionBurnRecordBytes(0x5c);
const ARTIFACT_B64 = ARTIFACT_BYTES.toString("base64");
const ARTIFACT_SHA256 = `0x${createHash("sha256")
  .update(ARTIFACT_BYTES)
  .digest("hex")}`;
const productionModuleBytes = (
  exportName,
  wasmFile,
  keyFile,
  { includeSourcePublicInputs = true } = {},
) => {
  const selfTestExportName =
    exportName === "bscSccpSourceProve"
      ? "bscSccpSourceNativeProverSelfTest"
      : "bscSccpNativeProverSelfTest";
  const sourcePublicInputBinding =
    exportName === "bscSccpSourceProve" && includeSourcePublicInputs
      ? [
          `const requiredSourcePublicInputFields = Object.freeze(["publicInputs", "sourceEventDigest", "commitmentRoot", "messageId", "payloadHash", "sourceDomain", "targetDomain", "amountBaseUnits", "bscSender", "tairaRecipient", "routeId"]);`,
          `const bindSourcePublicInputs = (request) => ({ publicInputs: request?.publicInputs ?? request?.public_inputs, sourceEventDigest: request?.sourceEventDigest ?? request?.source_event_digest, commitmentRoot: request?.commitmentRoot ?? request?.commitment_root, messageId: request?.messageId ?? request?.message_id, payloadHash: request?.payloadHash ?? request?.payload_hash, sourceDomain: request?.sourceDomain ?? request?.source_domain, targetDomain: request?.targetDomain ?? request?.target_domain, amountBaseUnits: request?.amountBaseUnits ?? request?.amount_base_units ?? request?.amount, bscSender: request?.bscSender ?? request?.bsc_sender ?? request?.sender, tairaRecipient: request?.tairaRecipient ?? request?.taira_recipient ?? request?.recipient, routeId: request?.routeId ?? request?.route_id ?? request?.route });`,
        ]
      : [];
  const proveBody =
    exportName === "bscSccpSourceProve" && includeSourcePublicInputs
      ? `buildGroth16ProofPackage({ request, wasmUrl, provingKeyUrl, runtimeIntegrity, requiredSourcePublicInputFields, sourcePublicInputs: bindSourcePublicInputs(request) })`
      : `buildGroth16ProofPackage({ request, wasmUrl, provingKeyUrl, runtimeIntegrity })`;
  return Buffer.from(
    [
      `import { buildGroth16ProofPackage } from "./bsc-proof-runtime.js";`,
      `const wasmUrl = new URL("./${wasmFile}", import.meta.url);`,
      `const provingKeyUrl = new URL("./${keyFile}", import.meta.url);`,
      `const runtimeIntegrity = ${JSON.stringify("bsc-integrity-binding-".repeat(80))};`,
      ...sourcePublicInputBinding,
      `export const ${selfTestExportName} = async (context) => context.nativeProverSelfTest;`,
      `export const ${exportName} = async (request) => ${proveBody};`,
      "",
    ].join("\n"),
  );
};
const PROVER_MODULE_BYTES = productionModuleBytes(
  "bscSccpProve",
  "bsc-destination-prover.wasm",
  "bsc-destination-proving-key.zkey",
);
const SOURCE_PROVER_MODULE_BYTES = productionModuleBytes(
  "bscSccpSourceProve",
  "bsc-source-prover.wasm",
  "bsc-source-proving-key.zkey",
);
const SOURCE_PROVER_MODULE_WITHOUT_PUBLIC_INPUTS_BYTES = productionModuleBytes(
  "bscSccpSourceProve",
  "bsc-source-prover.wasm",
  "bsc-source-proving-key.zkey",
  { includeSourcePublicInputs: false },
);
const PLACEHOLDER_PROVER_MODULE_BYTES = Buffer.from(
  "export const bscSccpProve = async () => ({ proofBytes: new Uint8Array([1]) });\n",
);
const COMMENT_ONLY_PROVER_MODULE_BYTES = Buffer.from(
  [
    "// export const bscSccpProve = async (request) => request;",
    `export const runtimeIntegrity = ${JSON.stringify(
      "comment-only-bsc-integrity-binding-".repeat(80),
    )};`,
    "",
  ].join("\n"),
);
const NON_CALLABLE_PROVER_MODULE_BYTES = Buffer.from(
  [
    `export const bscSccpProve = ${JSON.stringify("not a prover function")};`,
    `export const runtimeIntegrity = ${JSON.stringify(
      "non-callable-bsc-integrity-binding-".repeat(80),
    )};`,
    "",
  ].join("\n"),
);
const MISSING_SELF_TEST_PROVER_MODULE_BYTES = Buffer.from(
  [
    `import { buildGroth16ProofPackage } from "./bsc-proof-runtime.js";`,
    `const runtimeIntegrity = ${JSON.stringify(
      "missing-self-test-bsc-integrity-binding-".repeat(80),
    )};`,
    `export const bscSccpProve = async (request) => buildGroth16ProofPackage({ request, runtimeIntegrity });`,
    "",
  ].join("\n"),
);
const NO_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES = Buffer.from(
  [
    `import { buildGroth16ProofPackage } from "./bsc-proof-runtime.js";`,
    `const runtimeIntegrity = ${JSON.stringify(
      "detached-runtime-bsc-integrity-binding-".repeat(80),
    )};`,
    `const detachedRuntime = buildGroth16ProofPackage;`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => ({ request, detachedRuntime, runtimeIntegrity });`,
    "",
  ].join("\n"),
);
const LOCAL_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES = Buffer.from(
  [
    `const runtimeIntegrity = ${JSON.stringify(
      "local-runtime-name-bsc-integrity-binding-".repeat(80),
    )};`,
    `const buildGroth16ProofPackage = (request) => ({ request, runtimeIntegrity });`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => buildGroth16ProofPackage({ request, runtimeIntegrity });`,
    "",
  ].join("\n"),
);
const ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES = Buffer.from(
  [
    `import { buildGroth16ProofPackage } from "./%2e%2e/bsc-proof-runtime.js";`,
    `const runtimeIntegrity = ${JSON.stringify(
      "escaped-runtime-import-bsc-integrity-binding-".repeat(80),
    )};`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => buildGroth16ProofPackage({ request, runtimeIntegrity });`,
    "",
  ].join("\n"),
);
const DOUBLE_ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES = Buffer.from(
  [
    `import { buildGroth16ProofPackage } from "./%252e%252e/bsc-proof-runtime.js";`,
    `const runtimeIntegrity = ${JSON.stringify(
      "double-escaped-runtime-import-bsc-integrity-binding-".repeat(80),
    )};`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => buildGroth16ProofPackage({ request, runtimeIntegrity });`,
    "",
  ].join("\n"),
);
const INCOMPLETE_ADAPTER_PIPELINE_PROVER_MODULE_BYTES = Buffer.from(
  [
    `const runtimeIntegrity = ${JSON.stringify(
      "incomplete-adapter-pipeline-bsc-integrity-binding-".repeat(80),
    )};`,
    `const loadBackend = async (row) => row;`,
    `const selectBackendFn = (backend) => backend.prove;`,
    `const selectBackendSelfTestFn = (backend) => backend.selfTest;`,
    `const runBackendNativeProverSelfTest = async (selfTest, context) => selfTest(context);`,
    `const verifyBundleMaterial = (material) => material;`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => {`,
    `  const backend = await loadBackend({`,
    `    prove: async (value) => value,`,
    `    selfTest: async (value) => value,`,
    `  });`,
    `  const prove = selectBackendFn(backend);`,
    `  const selfTest = selectBackendSelfTestFn(backend);`,
    `  verifyBundleMaterial({ request }, request, "destination");`,
    `  await runBackendNativeProverSelfTest(selfTest, request);`,
    `  return prove({ request, runtimeIntegrity });`,
    `};`,
    "",
  ].join("\n"),
);
const FLAT_ADAPTER_PIPELINE_PROVER_MODULE_BYTES = Buffer.from(
  [
    `const runtimeIntegrity = ${JSON.stringify(
      "flat-adapter-pipeline-bsc-integrity-binding-".repeat(80),
    )};`,
    `const ownJsonValue = (value) => value;`,
    `const readConfig = async () => ({ directionRows: { destination: {} } });`,
    `const loadMaterial = async () => ({});`,
    `const loadNativeBundleArtifacts = async () => ({});`,
    `const assertProverMaterialShape = () => true;`,
    `const verifyBundleMaterial = (material) => material;`,
    `const loadBackend = async () => ({ prove: async (value) => value, selfTest: async (value) => value });`,
    `const selectBackendFn = (backend) => backend.prove;`,
    `const selectBackendSelfTestFn = (backend) => backend.selfTest;`,
    `const buildContext = (context) => context;`,
    `const runBackendNativeProverSelfTest = async (selfTest, context) => selfTest(context);`,
    `const verifyBackendNativeProverSelfTestResult = (result) => result;`,
    `export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;`,
    `export const bscSccpProve = async (request) => {`,
    `  const proofRequest = ownJsonValue(request);`,
    `  const state = await readConfig();`,
    `  const material = await loadMaterial({}, state, "destination");`,
    `  await loadNativeBundleArtifacts({ material, state });`,
    `  assertProverMaterialShape(new Uint8Array([1, 2, 3, 4]), "destination proof artifact", "artifact.r1cs", "proof-artifact");`,
    `  verifyBundleMaterial(material, proofRequest, "destination");`,
    `  const backend = await loadBackend({}, state, "destination");`,
    `  const prove = selectBackendFn(backend, "destination", {});`,
    `  const selfTest = selectBackendSelfTestFn(backend, "destination", {});`,
    `  const context = buildContext({ direction: "destination", request: proofRequest, material, state });`,
    `  verifyBackendNativeProverSelfTestResult(await runBackendNativeProverSelfTest(selfTest, context), context);`,
    `  return prove({ request: proofRequest, runtimeIntegrity });`,
    `};`,
    "",
  ].join("\n"),
);
const DETACHED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES = Buffer.from(
  [
    `const runtimeIntegrity = ${JSON.stringify(
      "detached-adapter-entrypoint-bsc-integrity-binding-".repeat(80),
    )};`,
    `const ownJsonValue = (value) => value;`,
    `const readConfig = async () => ({ directionRows: { destination: {}, source: {} } });`,
    `const readBytes = async () => ({ bytes: new Uint8Array([1, 2, 3, 4]), url: "artifact.bin", sha256: "0x${"11".repeat(32)}" });`,
    `const parseJsonBytes = () => ({});`,
    `const nativeEvmProverBundleDescriptorHash = async () => ({ descriptor: {}, descriptorHash: "0x${"22".repeat(32)}" });`,
    `const assertProverMaterialShape = () => true;`,
    `const loadNativeBundleArtifacts = async () => ({});`,
    `const verifyBundleMaterial = (material) => material;`,
    `const strictConfigStringField = () => "bscSccpProve";`,
    `const assertSelfContainedBackendModule = () => true;`,
    `const verifiedJavascriptModuleDataUrl = () => "data:text/javascript,export%20default%20{}";`,
    `const backendStringField = () => "javascript";`,
    `const verifyBackendSelfTestHash = () => "0x${"33".repeat(32)}";`,
    `const verifyBackendSelfTestPublicSignals = () => [];`,
    `const verifyBackendNativeProverSelfTestResult = (result, context) => ({ result, context, sdk: backendStringField(result, ["sdk"], "sdk"), requestHash: verifyBackendSelfTestHash({ result, expected: {}, key: "requestHash", aliases: ["requestHash"], label: "self-test" }), publicSignalWords: verifyBackendSelfTestPublicSignals({ result, expected: [], label: "self-test" }) });`,
    `const runBackendNativeProverSelfTest = async (selfTest, context) => verifyBackendNativeProverSelfTestResult(await selfTest(context), context);`,
    `const loadMaterial = async (row, state, direction) => {`,
    `  const nativeBundle = await readBytes({ row, state, direction });`,
    `  const bundle = parseJsonBytes(nativeBundle.bytes, "native bundle");`,
    `  await nativeEvmProverBundleDescriptorHash({ bundle, direction });`,
    `  assertProverMaterialShape(nativeBundle.bytes, "proof artifact", "artifact.r1cs", "proof-artifact");`,
    `  return { nativeBundle: bundle, nativeArtifacts: await loadNativeBundleArtifacts({ row, state, direction }) };`,
    `};`,
    `const loadBackend = async (row, state, direction) => {`,
    `  strictConfigStringField(row, ["backendModuleUrl"], "backend module URL");`,
    `  const backendBytes = await readBytes({ row, state, direction });`,
    `  assertSelfContainedBackendModule(backendBytes.bytes, "backend module");`,
    `  verifiedJavascriptModuleDataUrl(backendBytes.bytes);`,
    `  return { prove: async (value) => value, selfTest: async (value) => value };`,
    `};`,
    `const selectBackendFn = (backend) => backend.prove;`,
    `const selectBackendSelfTestFn = (backend) => backend.selfTest;`,
    `const buildContext = (context) => ({ ...context, backendAcceptedExport: strictConfigStringField(context.config || {}, ["backendAcceptedExport"], "backend export") });`,
    `const withRuntime = async (direction, request, options = {}) => {`,
    `  const proofRequest = ownJsonValue(request);`,
    `  const state = await readConfig();`,
    `  const row = state.directionRows[direction];`,
    `  const material = await loadMaterial(row, state, direction);`,
    `  verifyBundleMaterial(material, proofRequest, direction);`,
    `  const backend = await loadBackend(row, state, direction);`,
    `  const prove = selectBackendFn(backend, direction, row);`,
    `  const selfTest = selectBackendSelfTestFn(backend, direction, row);`,
    `  const context = buildContext({ direction, request: proofRequest, material, config: row, state });`,
    `  await runBackendNativeProverSelfTest(selfTest, context, options);`,
    `  return prove(context, options);`,
    `};`,
    `const withRuntimeSelfTest = async (direction, request, options = {}) => {`,
    `  const proofRequest = ownJsonValue(request);`,
    `  const state = await readConfig();`,
    `  const row = state.directionRows[direction];`,
    `  const material = await loadMaterial(row, state, direction);`,
    `  verifyBundleMaterial(material, proofRequest, direction);`,
    `  const backend = await loadBackend(row, state, direction);`,
    `  const selfTest = selectBackendSelfTestFn(backend, direction, row);`,
    `  return runBackendNativeProverSelfTest(selfTest, buildContext({ direction, request: proofRequest, material, config: row, state }), options);`,
    `};`,
    `const verifyDestinationResult = (result) => result;`,
    `const verifySourceResult = (result) => result;`,
    `export async function bscSccpProve(request) { return { request, runtimeIntegrity }; }`,
    `export async function bscSccpNativeProverSelfTest(context) { return { context, runtimeIntegrity }; }`,
    `export async function bscSccpSourceProve(input) { return { input, runtimeIntegrity }; }`,
    `export async function bscSccpSourceNativeProverSelfTest(context) { return { context, runtimeIntegrity }; }`,
    "",
  ].join("\n"),
);
const aliasedAdapterEntrypointProverModuleSource = () => {
  const source =
    DETACHED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES.toString("utf8");
  const detachedExports = [
    `export async function bscSccpProve(request) { return { request, runtimeIntegrity }; }`,
    `export async function bscSccpNativeProverSelfTest(context) { return { context, runtimeIntegrity }; }`,
    `export async function bscSccpSourceProve(input) { return { input, runtimeIntegrity }; }`,
    `export async function bscSccpSourceNativeProverSelfTest(context) { return { context, runtimeIntegrity }; }`,
  ].join("\n");
  const aliasedExports = [
    `async function bscSccpProve(request) { return verifyDestinationResult(await withRuntime("destination", request)); }`,
    `async function bscSccpNativeProverSelfTest(context) { return withRuntimeSelfTest("destination", context); }`,
    `async function bscSccpSourceProve(input) { return verifySourceResult(await withRuntime("source", input)); }`,
    `async function bscSccpSourceNativeProverSelfTest(context) { return withRuntimeSelfTest("source", context); }`,
    `const bypassDestinationProve = async (request) => ({ request, runtimeIntegrity });`,
    `const bypassDestinationSelfTest = async (context) => ({ context, runtimeIntegrity });`,
    `const bypassSourceProve = async (input) => ({ input, runtimeIntegrity });`,
    `const bypassSourceSelfTest = async (context) => ({ context, runtimeIntegrity });`,
    `export { bypassDestinationProve as bscSccpProve, bypassDestinationSelfTest as bscSccpNativeProverSelfTest, bypassSourceProve as bscSccpSourceProve, bypassSourceSelfTest as bscSccpSourceNativeProverSelfTest };`,
  ].join("\n");
  if (!source.includes(detachedExports)) {
    throw new Error("detached BSC adapter export fixture marker is missing");
  }
  return source.replace(detachedExports, aliasedExports);
};
const ALIASED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES = Buffer.from(
  aliasedAdapterEntrypointProverModuleSource(),
);
const PROVER_MODULE_SHA256 = `0x${createHash("sha256")
  .update(PROVER_MODULE_BYTES)
  .digest("hex")}`;
const SOURCE_PROVER_MODULE_SHA256 = `0x${createHash("sha256")
  .update(SOURCE_PROVER_MODULE_BYTES)
  .digest("hex")}`;
const streamingBytesResponse = (byteLength, { chunkSize = 16 } = {}) => {
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
const withEnv = async (values, fn) => {
  const previous = {};
  for (const key of Object.keys(values)) {
    previous[key] = process.env[key];
    if (values[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = values[key];
    }
  }
  try {
    return await fn();
  } finally {
    for (const key of Object.keys(values)) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
};
const BSC_BINDING_KEY = `evm:0:2:${BSC_TESTNET_NETWORK_ID_HEX.slice(
  2,
)}:${BSC_VERIFIER_ADDRESS}:${BSC_BRIDGE_ADDRESS}:${HASH_11}:${HASH_22}`;
const EVM_SELECTORS = {
  bridge: "0xe78cea92",
  bridgeLocked: "0x91a234e4",
  destinationBindingHash: "0xf491d991",
  verifier: "0x2b7ac3f3",
  verifierCodeHash: "0xf7178ac6",
  verifierKeyHash: "0x540d1398",
  verifyingKeyHash: "0x69b5d6d1",
  networkId: "0x9025e64c",
  expectedSourceDomain: "0xbbc0a1a4",
  expectedTargetDomain: "0xc73087ee",
};
const abiAddress = (address) => `0x${"0".repeat(24)}${address.slice(2)}`;
const abiBool = (value) => `0x${"0".repeat(63)}${value ? "1" : "0"}`;
const abiUint = (value) => `0x${BigInt(value).toString(16).padStart(64, "0")}`;

const REQUIRED_ROUTE_CHECK_IDS = [
  "taira-network",
  "sccp-submit-paths",
  "bsc-route-manifest",
  "bsc-route-manifest-unique",
  "bsc-manifest-secret-scan",
  "bsc-record-aliases",
  "bsc-route-identity",
  "bsc-production-ready",
  "bsc-production-disabled-conflict",
  "bsc-production-placeholder-scan",
  "bsc-domain",
  "bsc-codec",
  "bsc-testnet-chain-id",
  "bsc-testnet-network-id",
  "bsc-explorer-binding",
  "bsc-bridge-address",
  "bsc-token-address",
  "bsc-sourceBridge-address",
  "bsc-verifier-address",
  "bsc-contract-addresses-distinct",
  "bsc-verifierCodeHash",
  "bsc-verifierKeyHash",
  "bsc-production-verifier-material",
  "bsc-production-prover-material",
  "bsc-native-evm-prover-bundle-hash",
  "bsc-native-evm-prover-bundle",
  "bsc-destination-browser-prover",
  "bsc-source-browser-prover",
  "bsc-destinationBindingHash",
  "bsc-destination-binding",
  "bsc-post-deploy-live-evidence",
  "taira-burn-record-material",
  "bsc-rpc-chain-id-readback",
  "bsc-token-code-readback",
  "bsc-bridge-code-readback",
  "bsc-sourceBridge-code-readback",
  "bsc-verifier-code-readback",
  "bsc-token-target-readback",
  "bsc-bridge-target-readback",
  "bsc-sourceBridge-target-readback",
  "bsc-verifier-target-readback",
  "bsc-token-bridge-readback",
  "bsc-token-lock-readback",
  "bsc-source-owner-readback",
  "bsc-bridge-binding-readback",
  "bsc-bridge-verifier-address-readback",
  "bsc-bridge-verifier-code-hash-readback",
  "bsc-bridge-verifier-key-hash-readback",
  "bsc-verifier-key-hash-readback",
  "bsc-bridge-network-readback",
  "bsc-bridge-domain-readback",
  "bsc-contract-readback",
  "bsc-preflight-runbook-contract",
];

const readyRouteReport = (overrides = {}) => ({
  ready: true,
  toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
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
    verifierKeyHash: HASH_22,
    proofArtifactHash: HASH_44,
    provingKeyHash: HASH_66,
    nativeEvmProverBundleHash: HASH_99,
    destinationBindingHash: HASH_33,
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    destinationBrowserProver: {
      moduleUrl: "/sccp-bsc-prover.js",
      moduleHash: PROVER_MODULE_SHA256,
      manifestHash: HASH_11,
      expectedExports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    },
    sourceBrowserProver: {
      moduleUrl: "/sccp-bsc-source-prover.js",
      moduleHash: SOURCE_PROVER_MODULE_SHA256,
      manifestHash: HASH_22,
      expectedExports: [
        "bscSccpSourceProve",
        "bscSccpSourceNativeProverSelfTest",
      ],
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    },
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: HASH_77,
    routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    offlineFullTomlSha256: HASH_88,
  },
  checks: REQUIRED_ROUTE_CHECK_IDS.map((id) => ({
    id,
    ok: true,
    message: `${id} ready`,
  })),
  reasons: [],
  nextSteps: [],
  ...overrides,
});

const readyMainnetRouteReport = (overrides = {}) => ({
  ...readyRouteReport(),
  bsc: {
    network: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: "0x38",
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
  },
  deployment: {
    ...readyRouteReport().deployment,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
  },
  postDeployLiveEvidence: {
    ...readyRouteReport().postDeployLiveEvidence,
    sourceEventExplorerUrl: MAINNET_SOURCE_EVENT_EXPLORER_URL,
    routeCanaryExplorerUrl: MAINNET_ROUTE_CANARY_EXPLORER_URL,
  },
  checks: REQUIRED_ROUTE_CHECK_IDS.map((id) => ({
    id:
      id === "bsc-testnet-chain-id"
        ? "bsc-mainnet-chain-id"
        : id === "bsc-testnet-network-id"
          ? "bsc-mainnet-network-id"
          : id,
    ok: true,
    message: `${id} ready`,
  })),
  ...overrides,
});

const readyPeerAuditReport = (overrides = {}) => ({
  ready: true,
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  expectedPeers: 4,
  peerCount: 4,
  manifestFingerprint: null,
  sanitizedStanzaFilesChecked: false,
  checks: [
    {
      id: "peer-config-files",
      ok: true,
      message: "At least one TAIRA peer config was audited.",
    },
    {
      id: "peer-count",
      ok: true,
      message: "The expected number of TAIRA peer configs was audited.",
    },
    {
      id: "peer-route-count",
      ok: true,
      message:
        "TAIRA peer configs carry no local taira_bsc_xor/xor route stanzas.",
    },
    {
      id: "peer-route-consistency",
      ok: true,
      message:
        "TAIRA peer configs do not carry local BSC route manifest material.",
    },
    {
      id: "peer-route-production-readiness",
      ok: true,
      message:
        "BSC route production readiness is not sourced from peer config overrides.",
    },
    {
      id: "peer-route-burn-record-material",
      ok: true,
      message: "TAIRA peer configs do not override BSC burn-record material.",
    },
    {
      id: "peer-route-hash-role-separation",
      ok: true,
      message:
        "TAIRA peer configs do not override BSC route cryptographic hashes.",
    },
    {
      id: "peer-audit-runbook-contract",
      ok: true,
      message: "BSC peer config audit exposes a complete operator runbook.",
    },
  ],
  peers: Array.from({ length: 4 }, (_, index) => ({
    source: `peer${index}.toml`,
    routeCount: 0,
    rawTomlSha256: HASH_11,
    sanitizedStanzaSha256: HASH_22,
    manifestFingerprint: null,
    productionReady: false,
    ready: true,
    deployment: null,
    postDeployLiveEvidence: null,
    hashRoleProblems: [],
    burnRecordMaterialProblems: [],
    failedChecks: [],
  })),
  ...overrides,
});

const readyMainnetPeerAuditReport = (routeReport = readyMainnetRouteReport()) =>
  readyPeerAuditReport({
    bscNetwork: "mainnet",
    bsc: routeReport.bsc,
  });

const readyProverManifest = ({
  schema = SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  moduleUrl = "/sccp-bsc-prover.js",
  direction = "destination",
  moduleSha256 = PROVER_MODULE_SHA256,
  exports,
  proofArtifactHash = HASH_44,
  provingKeyHash = HASH_66,
  nativeEvmProverBundleHash = HASH_99,
  bscNetwork = "testnet",
  bscChain = "bsc-testnet",
  bscChainIdHex = "0x61",
  bscNetworkIdHex = BSC_TESTNET_NETWORK_ID_HEX,
  sourceEventExplorerUrl = SOURCE_EVENT_EXPLORER_URL,
  routeCanaryExplorerUrl = ROUTE_CANARY_EXPLORER_URL,
} = {}) => {
  const resolvedExports =
    exports ??
    (direction === "source"
      ? ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"]
      : ["bscSccpProve", "bscSccpNativeProverSelfTest"]);
  return {
    schema,
    moduleUrl,
    kind: direction === "source" ? "bsc-source" : "bsc-destination",
    exports: resolvedExports,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    tairaChainId: BSC_TAIRA_CHAIN_ID,
    tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    bscNetwork,
    bscChain,
    bscChainIdHex,
    bscNetworkIdHex,
    moduleSha256,
    proofArtifactHash,
    provingKeyHash,
    nativeEvmProverBundleHash,
    boundRouteHash: HASH_33,
    boundProofHash: proofArtifactHash,
    deployment: {
      bridgeAddress: BSC_BRIDGE_ADDRESS,
      tokenAddress: BSC_TOKEN_ADDRESS,
      sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      verifierAddress: BSC_VERIFIER_ADDRESS,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_66,
      nativeEvmProverBundleHash,
      destinationBindingHash: HASH_33,
    },
    postDeployLiveEvidence: {
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_44,
      sourceEventTransactionId: HASH_55,
      sourceEventExplorerUrl,
      routeCanaryEvidenceHash: HASH_66,
      routeCanaryTransactionId: HASH_77,
      routeCanaryExplorerUrl,
      offlineFullTomlSha256: HASH_88,
    },
  };
};

const withoutTopLevelManifestFields = (manifest, ...fields) => {
  const copy = { ...manifest };
  for (const field of fields) {
    delete copy[field];
  }
  return copy;
};

const readyProverInspection = (overrides = {}) => {
  const {
    routeReport = readyRouteReport(),
    bscNetwork = "testnet",
    manifestUrl,
    ...manifestOverrides
  } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const manifest = readyProverManifest({
    bscNetwork: profile.key,
    bscChain: profile.chain,
    bscChainIdHex: profile.chainIdHex,
    bscNetworkIdHex: profile.networkIdHex,
    ...manifestOverrides,
  });
  const inspection = validateBscSccpBrowserProverManifest({
    manifest,
    routeReport,
    moduleUrl: manifest.moduleUrl,
    expectedDirection: manifestOverrides.direction ?? "destination",
    bscNetwork,
    label:
      (manifestOverrides.direction ?? "destination") === "source"
        ? "BSC -> TAIRA source prover"
        : "TAIRA -> BSC prover",
  });
  return {
    ...inspection,
    manifestUrl: manifestUrl ?? `${manifest.moduleUrl}.manifest.json`,
    moduleSha256: inspection.manifest?.moduleSha256 ?? null,
  };
};

const readySourceProverInspection = (overrides = {}) =>
  readyProverInspection({
    moduleUrl: "/sccp-bsc-source-prover.js",
    direction: "source",
    moduleSha256: SOURCE_PROVER_MODULE_SHA256,
    ...overrides,
  });

const readyDestinationProverModuleAvailability = ({
  moduleUrl = "/sccp-bsc-prover.js",
  moduleSha256 = PROVER_MODULE_SHA256,
  detail = `${moduleUrl} exists under public/ and matches moduleSha256.`,
} = {}) => ({
  ok: true,
  moduleUrl,
  moduleSha256,
  expectedSha256: moduleSha256,
  detail,
});

const readySourceProverModuleAvailability = ({
  moduleUrl = "/sccp-bsc-source-prover.js",
  moduleSha256 = SOURCE_PROVER_MODULE_SHA256,
  detail = `${moduleUrl} exists under public/ and matches moduleSha256.`,
} = {}) => ({
  ok: true,
  moduleUrl,
  moduleSha256,
  expectedSha256: moduleSha256,
  detail,
});

const readyRuntimeProverModuleAvailability = ({
  detail = "runtime module is available",
} = {}) =>
  readyDestinationProverModuleAvailability({
    moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
    moduleSha256: PROVER_MODULE_SHA256,
    detail,
  });

const readyRuntimeSourceProverInspection = (overrides = {}) =>
  readySourceProverInspection({
    moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
    moduleSha256: PROVER_MODULE_SHA256,
    ...overrides,
  });

const readySmokeReadinessInput = (overrides = {}) => ({
  routeReport: readyRouteReport(),
  peerAuditReport: readyPeerAuditReport(),
  walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
  destinationProverModuleUrl: "/sccp-bsc-prover.js",
  sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
  destinationProverModuleAvailability:
    readyDestinationProverModuleAvailability(),
  sourceProverModuleAvailability: readySourceProverModuleAvailability(),
  destinationProverManifestInspection: readyProverInspection(),
  sourceProverManifestInspection: readySourceProverInspection(),
  checkedAt: "2026-06-05T00:00:00.000Z",
  ...overrides,
});

const readyRuntimeProverConfig = (overrides = {}) => ({
  schema: SCCP_BSC_RUNTIME_PROVER_CONFIG_SCHEMA,
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  tairaChainId: BSC_TAIRA_CHAIN_ID,
  tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
  bscNetwork: "testnet",
  bscChain: "bsc-testnet",
  bscChainIdHex: "0x61",
  bscNetworkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
  destination: {
    nativeProverBundleUrl: "/sccp-bsc/native-prover-bundle.json",
    nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
    nativeProverBundleSha256: HASH_55,
    nativeEvmProverBundleHash: HASH_99,
    nativeProverVerifiedSdks: REQUIRED_NATIVE_PROVER_SDKS,
    proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
    proofArtifactSha256: HASH_44,
    provingKeyUrl: "/sccp-bsc/proving-key.zkey",
    provingKeySha256: HASH_66,
    verifierKeyUrl: "/sccp-bsc/verifier-key.json",
    verifierKeySha256: HASH_22,
    backendModuleUrl: "/sccp-bsc/backend.js",
    backendModuleSha256: HASH_77,
    backendSelfContained: true,
    backendAcceptedExport: "bscSccpProve",
    backendAcceptedSelfTestExport: "bscSccpNativeProverSelfTest",
  },
  source: {
    nativeProverBundleUrl: "/sccp-bsc/native-prover-bundle.json",
    nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
    nativeProverBundleSha256: HASH_55,
    nativeEvmProverBundleHash: HASH_99,
    nativeProverVerifiedSdks: REQUIRED_NATIVE_PROVER_SDKS,
    proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
    proofArtifactSha256: HASH_44,
    provingKeyUrl: "/sccp-bsc/proving-key.zkey",
    provingKeySha256: HASH_66,
    verifierKeyUrl: "/sccp-bsc/verifier-key.json",
    verifierKeySha256: HASH_22,
    backendModuleUrl: "/sccp-bsc/backend.js",
    backendModuleSha256: HASH_77,
    backendSelfContained: true,
    backendAcceptedExport: "bscSccpSourceProve",
    backendAcceptedSelfTestExport: "bscSccpSourceNativeProverSelfTest",
  },
  ...overrides,
});

const readyRuntimeProverConfigInspection = (overrides = {}) => {
  const {
    routeReport = readyRouteReport(),
    bscNetwork = "testnet",
    configUrl = SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
    configSha256 = hex32("aa"),
    ...manifestOverrides
  } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const inspection = validateBscSccpRuntimeProverConfigManifest({
    manifest: readyRuntimeProverConfig({
      bscNetwork: profile.key,
      bscChain: profile.chain,
      bscChainIdHex: profile.chainIdHex,
      bscNetworkIdHex: profile.networkIdHex,
      ...manifestOverrides,
    }),
    routeReport,
    bscNetwork,
    label: "BSC runtime prover config",
  });
  return {
    ...inspection,
    configUrl,
    configSha256,
  };
};

const readyCapabilities = {
  proofSubmitPath: "/v1/bridge/proofs/submit",
  messageSubmitPath: "/v1/bridge/messages",
};

const nativeProverBundle = () => ({
  schema: SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  bundle_id: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  domain: 2,
  chain: "bsc-testnet",
  proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  proof_artifact: "artifacts/bsc-testnet/proof-artifact.r1cs",
  proof_artifact_hash: HASH_44,
  proving_key: "artifacts/bsc-testnet/proving-key.zkey",
  proving_key_hash: HASH_66,
  verifier_key: "artifacts/bsc-testnet/verifier-key.json",
  verifier_key_hash: HASH_22,
  verifier_key_artifact_hash: HASH_88,
  destination_binding_hash: HASH_33,
  no_wasm: true,
  remote_prover_required: false,
  browser_implementation: "pure-typescript",
  cross_sdk_parity_artifact: "artifacts/bsc-testnet/cross-sdk-parity.json",
  native_prover_self_test_artifact:
    "artifacts/bsc-testnet/native-prover-self-test.json",
  groth16_proof_self_test_artifact:
    "artifacts/bsc-testnet/groth16-proof-self-test.json",
  groth16_proof_self_test_hash: HASH_99,
  native_sdk_artifacts: Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  ).map(([sdk, implementation], index) => ({
    sdk,
    implementation,
    prover_artifact_hash: HASH_44,
    proving_key_hash: HASH_66,
    implementation_artifact: `artifacts/bsc-testnet/${sdk}-implementation.bin`,
    implementation_hash: hex32((0x81 + index).toString(16)),
  })),
  audit_hashes: {
    circuit_security_audit: fixtureHash("smoke circuit security audit"),
    native_implementation_audit: fixtureHash(
      "smoke native implementation audit",
    ),
    reproducible_build_attestation: fixtureHash(
      "smoke reproducible build attestation",
    ),
    cross_sdk_parity: fixtureHash("smoke cross-SDK parity"),
    native_prover_self_test: fixtureHash("smoke native self-test"),
    no_wasm_no_remote_scan: fixtureHash("smoke no-wasm no-remote scan"),
  },
});

const readyManifest = (overrides = {}) => {
  const bundle = nativeProverBundle();
  const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
    validateBscTestnetNativeEvmProverBundle(bundle, {
      expectedDestinationBindingHash: HASH_33,
    }),
  );
  const manifest = {
    bscNetwork: "testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    explorerUrl: "https://testnet.bscscan.com",
    explorerHost: "testnet.bscscan.com",
    counterpartyDomain: 2,
    counterpartyAccountCodecKey: "evm_hex",
    counterpartyAccountCodec: 2,
    verifierTarget: "EvmContract",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    productionReady: true,
    bscBridgeAddress: BSC_BRIDGE_ADDRESS,
    bscTokenAddress: BSC_TOKEN_ADDRESS,
    sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    bscVerifierAddress: BSC_VERIFIER_ADDRESS,
    nativeEvmProverBundleHash,
    nativeEvmProverBundle: bundle,
    destinationBrowserProver: {
      moduleUrl: DESTINATION_PROVER_MODULE_URL,
      moduleHash: PROVER_MODULE_SHA256,
      manifestHash: HASH_11,
      expectedExports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    },
    sourceBrowserProver: {
      moduleUrl: SOURCE_PROVER_MODULE_URL,
      moduleHash: SOURCE_PROVER_MODULE_SHA256,
      manifestHash: HASH_22,
      expectedExports: [
        "bscSccpSourceProve",
        "bscSccpSourceNativeProverSelfTest",
      ],
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    },
    destinationBinding: {
      version: 1,
      sourceDomain: 0,
      targetDomain: 2,
      key: BSC_BINDING_KEY,
      bindingHash: HASH_33,
    },
    destinationRollout: {
      verifierIdentity: BSC_VERIFIER_ADDRESS,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_66,
      destinationNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
      destinationBridgeAddress: BSC_BRIDGE_ADDRESS,
      destinationBindingKey: BSC_BINDING_KEY,
      destinationBindingHash: HASH_33,
      nativeEvmProverBundle: bundle,
    },
    postDeployLiveEvidence: {
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_44,
      sourceEventTransactionId: HASH_55,
      sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
      routeCanaryEvidenceHash: HASH_66,
      routeCanaryTransactionId: HASH_77,
      routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
      offlineFullTomlSha256: HASH_88,
    },
    tairaXorBurnRecord: {
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      contractArtifactB64: ARTIFACT_B64,
      artifactSha256: ARTIFACT_SHA256,
      vkRef: {
        backend: "groth16-bn254",
        name: "taira-bsc-xor-burn-record-v1",
      },
    },
  };
  return { ...manifest, ...overrides };
};

describe("BSC SCCP live smoke readiness", () => {
  it("requires the same route preflight checks as BSC prover sidecar generation", () => {
    expect(
      requiredBscSmokeRouteCheckIds(resolveBscNetworkProfile("testnet")),
    ).toEqual(BSC_PROVER_SIDECAR_REQUIRED_ROUTE_CHECK_IDS);
    expect(
      requiredBscSmokeRouteCheckIds(resolveBscNetworkProfile("mainnet")),
    ).toEqual(
      requiredBscProverSidecarRouteCheckIds(
        resolveBscNetworkProfile("mainnet"),
      ),
    );
    expect(
      requiredBscSmokeRouteCheckIds(resolveBscNetworkProfile("mainnet")),
    ).not.toContain("bsc-testnet-chain-id");
  });

  it("uses profile-specific default smoke-readiness output directories", () => {
    const testnet = bscSccpSmokeReadinessOutputDir("testnet");
    const mainnet = bscSccpSmokeReadinessOutputDir("mainnet");
    const testnetPeerAudit = bscSccpPeerConfigAuditReportPath("testnet");
    const mainnetPeerAudit = bscSccpPeerConfigAuditReportPath("mainnet");

    expect(testnet).toContain("output/sccp-bsc-smoke-readiness/testnet");
    expect(mainnet).toContain("output/sccp-bsc-smoke-readiness/mainnet");
    expect(mainnet).not.toBe(testnet);
    expect(testnetPeerAudit).toContain(
      "output/sccp-bsc-peer-config-audit/testnet/latest.json",
    );
    expect(mainnetPeerAudit).toContain(
      "output/sccp-bsc-peer-config-audit/mainnet/latest.json",
    );
    expect(mainnetPeerAudit).not.toBe(testnetPeerAudit);
  });

  it("accepts complete BSC live smoke-readiness runbook contracts", () => {
    expect(
      bscSccpLiveSmokeReadinessRunbookProblems({
        nextActions: [
          {
            id: "configure-bsc-walletconnect",
            title: "Configure BSC WalletConnect",
            detail: "Provide a WalletConnect project id.",
            requiredInputs: [
              {
                id: "walletconnect-project-id",
                kind: "operator-environment",
                placeholder: "<walletconnect-project-id>",
                description: "WalletConnect project id.",
              },
            ],
            blockedByChecks: ["walletconnect-project-id"],
            commands: [
              "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "walletconnect-project-id",
            kind: "operator-environment",
            placeholder: "<walletconnect-project-id>",
            description: "WalletConnect project id.",
            blockedByActions: ["configure-bsc-walletconnect"],
          },
        ],
      }),
    ).toEqual([]);
    expect(
      bscSccpLiveSmokeReadinessRunbookProblems({
        nextActions: [],
        missingProductionInputs: [],
      }),
    ).toEqual([]);
  });

  it("rejects malformed BSC live smoke-readiness runbook contracts", () => {
    const problems = bscSccpLiveSmokeReadinessRunbookProblems({
      nextActions: [
        {
          id: "configure-bsc-walletconnect",
          title: "",
          detail: "Provide a WalletConnect project id.",
          requiredInputs: [
            {
              id: "walletconnect-project-id",
              kind: "operator-environment",
              placeholder: "",
            },
          ],
          blockedByChecks: [],
          commands:
            "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
        },
      ],
      missingProductionInputs: [
        {
          id: "walletconnect-project-id",
          kind: "",
          placeholder: "<walletconnect-project-id>",
          description: "WalletConnect project id.",
          blockedByActions: "configure-bsc-walletconnect",
        },
        "not-a-missing-input",
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC live smoke-readiness next action 0 title is missing or not a non-empty string.",
        "BSC live smoke-readiness next action 0 required input 0 placeholder is missing or not a non-empty string.",
        "BSC live smoke-readiness next action 0 required input 0 description is missing or not a non-empty string.",
        "BSC live smoke-readiness next action 0 blockedByChecks is missing or empty.",
        "BSC live smoke-readiness next action 0 commands is missing or empty.",
        "BSC live smoke-readiness next action 0 command is not an array.",
        "BSC live smoke-readiness missing production input 0 kind is missing or not a non-empty string.",
        "BSC live smoke-readiness missing production input 0 blockedByActions is not an array.",
        "BSC live smoke-readiness missing production input 1 is not an object.",
      ]),
    );
    expect(bscSccpLiveSmokeReadinessRunbookProblems({})).toEqual(
      expect.arrayContaining([
        "BSC live smoke-readiness next action is not an array.",
        "BSC live smoke-readiness missing production input is not an array.",
      ]),
    );
  });

  it("rejects unlinked BSC live smoke-readiness runbook contracts", () => {
    const problems = bscSccpLiveSmokeReadinessRunbookProblems({
      nextActions: [
        {
          id: "configure-bsc-walletconnect",
          title: "Configure BSC WalletConnect",
          detail: "Provide a WalletConnect project id.",
          requiredInputs: [
            {
              id: "walletconnect-project-id",
              kind: "operator-environment",
              placeholder: "<walletconnect-project-id>",
              description: "WalletConnect project id.",
            },
            {
              id: "testnet-destination-browser-prover-module",
              kind: "url",
              placeholder: "<destination-prover-module-url>",
              description: "Destination prover module URL.",
            },
          ],
          blockedByChecks: ["walletconnect-project-id"],
          commands: [
            "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
          ],
        },
        {
          id: "publish-bsc-prover-modules",
          title: "Publish BSC browser prover modules",
          detail: "Publish route-bound browser prover modules.",
          requiredInputs: [
            {
              id: "testnet-source-browser-prover-module",
              kind: "url",
              placeholder: "<source-prover-module-url>",
              description: "Source prover module URL.",
            },
          ],
          blockedByChecks: ["source-prover-module"],
          commands: [
            "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
          ],
        },
        {
          id: "publish-bsc-prover-modules",
          title: "Duplicate prover action",
          detail: "Duplicate action id must fail.",
          requiredInputs: [
            {
              id: "testnet-source-browser-prover-module",
              kind: "url",
              placeholder: "<source-prover-module-url>",
              description: "Source prover module URL.",
            },
          ],
          blockedByChecks: ["source-prover-module"],
          commands: [
            "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "walletconnect-project-id",
          kind: "operator-environment",
          placeholder: "<walletconnect-project-id>",
          description: "WalletConnect project id.",
          blockedByActions: ["unknown-action"],
        },
        {
          id: "testnet-source-browser-prover-module",
          kind: "url",
          placeholder: "<source-prover-module-url>",
          description: "Source prover module URL.",
          blockedByActions: ["configure-bsc-walletconnect"],
        },
        {
          id: "testnet-source-browser-prover-module",
          kind: "url",
          placeholder: "<source-prover-module-url>",
          description: "Duplicate input id must fail.",
          blockedByActions: ["publish-bsc-prover-modules"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC live smoke-readiness next action id publish-bsc-prover-modules is duplicated.",
        "BSC live smoke-readiness missing production input id testnet-source-browser-prover-module is duplicated.",
        "BSC live smoke-readiness missing production input walletconnect-project-id does not reference blocking action configure-bsc-walletconnect.",
        "BSC live smoke-readiness next action configure-bsc-walletconnect requires input testnet-destination-browser-prover-module, but missingProductionInputs does not include it.",
        "BSC live smoke-readiness missing production input testnet-source-browser-prover-module does not reference blocking action publish-bsc-prover-modules.",
        "BSC live smoke-readiness missing production input walletconnect-project-id references unknown blocking action unknown-action.",
        "BSC live smoke-readiness missing production input testnet-source-browser-prover-module references blocking action configure-bsc-walletconnect, but that action does not require the input.",
      ]),
    );
  });

  it("does not invoke accessor-backed BSC live smoke-readiness runbook entries", () => {
    let reads = 0;
    const requiredInputs = [];
    requiredInputs.length = 1;
    Object.defineProperty(requiredInputs, "0", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("required input getter must not be invoked");
      },
    });
    const commands = [
      "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
    ];
    Object.defineProperty(commands, "1", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("command getter must not be invoked");
      },
    });
    const blockedByActions = ["configure-bsc-walletconnect"];
    Object.defineProperty(blockedByActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("blocked action getter must not be invoked");
      },
    });

    const problems = bscSccpLiveSmokeReadinessRunbookProblems({
      nextActions: [
        {
          id: "configure-bsc-walletconnect",
          title: "Configure BSC WalletConnect",
          detail: "Provide a WalletConnect project id.",
          requiredInputs,
          blockedByChecks: ["walletconnect-project-id"],
          commands,
        },
      ],
      missingProductionInputs: [
        {
          id: "walletconnect-project-id",
          kind: "operator-environment",
          placeholder: "<walletconnect-project-id>",
          description: "WalletConnect project id.",
          blockedByActions,
        },
      ],
    });

    expect(reads).toBe(0);
    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC live smoke-readiness next action 0 requiredInputs is missing or empty.",
        "BSC live smoke-readiness next action 0 command 1 is not a non-empty string.",
        "BSC live smoke-readiness next action 0 required input 0 is not an object.",
        "BSC live smoke-readiness missing production input 0 blockedByActions 1 is not a non-empty string.",
      ]),
    );
  });

  it("rejects unsupported BSC live smoke-readiness runbook fields with redaction", () => {
    const problems = bscSccpLiveSmokeReadinessRunbookProblems({
      nextActions: [
        {
          id: "configure-bsc-walletconnect",
          title: "Configure BSC WalletConnect",
          detail: "Provide a WalletConnect project id.",
          verifierMaterial: "do-not-serialize-verifier-material",
          requiredInputs: [
            {
              id: "walletconnect-project-id",
              kind: "operator-environment",
              placeholder: "<walletconnect-project-id>",
              description: "WalletConnect project id.",
              secretPath: "do-not-serialize-secret-path",
            },
          ],
          blockedByChecks: ["walletconnect-project-id"],
          commands: [
            "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "walletconnect-project-id",
          kind: "operator-environment",
          placeholder: "<walletconnect-project-id>",
          description: "WalletConnect project id.",
          blockedByActions: ["configure-bsc-walletconnect"],
          operatorNote: "configure the smoke signer",
          apiTokenPath: "do-not-serialize-token-path",
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC live smoke-readiness next action 0 contains unsupported field [redacted unsupported field].",
        "BSC live smoke-readiness next action 0 required input 0 contains unsupported field [redacted unsupported field].",
        "BSC live smoke-readiness missing production input 0 contains unsupported field operatorNote.",
        "BSC live smoke-readiness missing production input 0 contains unsupported field [redacted unsupported field].",
      ]),
    );
    const serializedProblems = JSON.stringify(problems);
    expect(serializedProblems).not.toContain("verifierMaterial");
    expect(serializedProblems).not.toContain("secretPath");
    expect(serializedProblems).not.toContain("apiTokenPath");
    expect(serializedProblems).not.toContain("do-not-serialize");
  });

  it("does not invoke accessor-backed top-level smoke-readiness option fields", () => {
    let reads = 0;
    const validInput = readySmokeReadinessInput({
      checkedAt: "2026-06-05T00:00:00.000Z",
    });
    const options = {};
    for (const field of Object.keys(validInput)) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter must not be invoked`);
        },
      });
    }

    const report = evaluateBscSccpLiveSmokeReadiness(options);

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.route).toBeNull();
    expect(report.peerAudit).toBeNull();
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "route-preflight", status: "fail" }),
        expect.objectContaining({ id: "peer-config-audit", status: "fail" }),
        expect.objectContaining({
          id: "walletconnect-project-id",
          status: "fail",
        }),
        expect.objectContaining({
          id: "destination-prover-module",
          status: "fail",
        }),
        expect.objectContaining({
          id: "source-prover-module",
          status: "fail",
        }),
      ]),
    );
  });

  it("does not invoke accessor-backed top-level smoke inspector option fields", async () => {
    let reads = 0;
    const options = {};
    for (const field of [
      "moduleUrl",
      "label",
      "repoRoot",
      "fetchImpl",
      "timeoutMs",
      "expectedSha256",
      "expectedExports",
      "expectedSelfTestExports",
      "maxBytes",
      "manifest",
      "routeReport",
      "expectedDirection",
      "bscNetwork",
      "manifestUrl",
      "configUrl",
    ]) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter must not be invoked`);
        },
      });
    }

    await expect(inspectSccpBrowserModuleAvailability(options)).resolves.toBe(
      null,
    );
    expect(validateBscSccpBrowserProverManifest(options)).toMatchObject({
      ok: false,
      manifest: null,
    });
    await expect(
      inspectBscSccpBrowserProverManifest(options),
    ).resolves.toMatchObject({
      ok: false,
      manifest: null,
    });
    expect(validateBscSccpRuntimeProverConfigManifest(options)).toMatchObject({
      ok: false,
    });
    await expect(inspectBscSccpRuntimeProverConfig(options)).resolves.toBe(
      null,
    );
    expect(reads).toBe(0);
  });

  it("passes when route, WalletConnect, and browser prover prerequisites are configured", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverModuleAvailability:
        readyDestinationProverModuleAvailability(),
      sourceProverModuleAvailability: readySourceProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection(),
      sourceProverManifestInspection: readySourceProverInspection(),
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(
      report.ready,
      JSON.stringify(
        { reasons: report.reasons, checks: report.checks },
        null,
        2,
      ),
    ).toBe(true);
    expect(report.routeReady).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.nextSteps).toEqual(SCCP_BSC_LIVE_SMOKE_STEPS);
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
    expect(report.route?.nextActions).toEqual([]);
    expect(report.route?.missingProductionInputs).toEqual([]);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "source-prover-module",
        status: "pass",
        detail: expect.stringContaining("matches moduleSha256"),
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "destination-prover-manifest",
        status: "pass",
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "runtime-prover-config",
        status: "pass",
        detail: expect.stringContaining("No checked-in BSC runtime prover"),
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "smoke-readiness-runbook-contract",
        status: "pass",
      }),
    );
    expect(report.provers.runtimeConfig).toEqual({
      required: false,
      configUrl: null,
      configSha256: null,
      manifest: null,
    });
    expect(report.provers.destination.manifest).toMatchObject({
      schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
      moduleSha256: PROVER_MODULE_SHA256,
      acceptedExport: "bscSccpProve",
    });
    expect(report.peerAudit?.peers[0]).toMatchObject({
      hashRoleProblems: [],
      burnRecordMaterialProblems: [],
      failedChecks: [],
    });
    expect(JSON.stringify(report)).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("preserves public route preflight runbook fields in the embedded route summary", () => {
    const routeNextActions = [
      {
        id: "publish-production-proof-material",
        title: "Publish production proof material",
        detail:
          "Replace diagnostic BSC verifier material with production hashes.",
        requiredInputs: [
          {
            id: "testnet-production-verifier-key-json",
            kind: "path",
            placeholder: "<verifier-key.json>",
            description:
              "Production verifier key JSON for the BSC testnet route.",
            privateKey: "must-not-leak",
          },
        ],
        blockedByChecks: ["bsc-production-proof-material"],
        commands: [
          "npm run e2e:sccp:bsc-route-preflight -- --bsc-network testnet",
        ],
        mnemonic: "must-not-leak",
      },
    ];
    const routeMissingProductionInputs = [
      {
        id: "testnet-production-verifier-key-json",
        kind: "path",
        placeholder: "<verifier-key.json>",
        description: "Production verifier key JSON for the BSC testnet route.",
        blockedByActions: ["publish-production-proof-material"],
        seedPhrase: "must-not-leak",
      },
    ];

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: readyRouteReport({
          ready: false,
          nextActions: routeNextActions,
          missingProductionInputs: routeMissingProductionInputs,
        }),
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.route?.nextActions).toEqual([
      {
        id: "publish-production-proof-material",
        title: "Publish production proof material",
        detail:
          "Replace diagnostic BSC verifier material with production hashes.",
        requiredInputs: [
          {
            id: "testnet-production-verifier-key-json",
            kind: "path",
            placeholder: "<verifier-key.json>",
            description:
              "Production verifier key JSON for the BSC testnet route.",
          },
        ],
        blockedByChecks: ["bsc-production-proof-material"],
        commands: [
          "npm run e2e:sccp:bsc-route-preflight -- --bsc-network testnet",
        ],
      },
    ]);
    expect(report.route?.missingProductionInputs).toEqual([
      {
        id: "testnet-production-verifier-key-json",
        kind: "path",
        placeholder: "<verifier-key.json>",
        description: "Production verifier key JSON for the BSC testnet route.",
        blockedByActions: ["publish-production-proof-material"],
      },
    ]);
    expect(JSON.stringify(report)).not.toContain("must-not-leak");
  });

  it("rejects route reports whose valid fields are only inherited properties", () => {
    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: Object.create(readyRouteReport()),
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.route).toBeNull();
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("route report is missing");
  });

  it("rejects route reports with incomplete or inconsistent post-deploy evidence", () => {
    for (const [name, postDeployLiveEvidence, expected] of [
      [
        "missing offline full TOML hash",
        {
          ...readyRouteReport().postDeployLiveEvidence,
          offlineFullTomlSha256: null,
        },
        "route postDeployLiveEvidence.offlineFullTomlSha256 is missing or invalid",
      ],
      [
        "reused source and canary transaction ids",
        {
          ...readyRouteReport().postDeployLiveEvidence,
          routeCanaryTransactionId: HASH_55,
          routeCanaryExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
        },
        "route postDeployLiveEvidence.sourceEventTransactionId and routeCanaryTransactionId must be distinct",
      ],
      [
        "source event explorer URL drifts from transaction id",
        {
          ...readyRouteReport().postDeployLiveEvidence,
          sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_77}`,
        },
        "route postDeployLiveEvidence.sourceEventExplorerUrl does not match sourceEventTransactionId",
      ],
      [
        "wrong explorer network",
        {
          ...readyRouteReport().postDeployLiveEvidence,
          routeCanaryExplorerUrl: `https://bscscan.com/tx/${HASH_77}`,
        },
        "route postDeployLiveEvidence.routeCanaryExplorerUrl is missing or invalid",
      ],
    ]) {
      const report = evaluateBscSccpLiveSmokeReadiness(
        readySmokeReadinessInput({
          routeReport: readyRouteReport({ postDeployLiveEvidence }),
        }),
      );

      expect(report.ready, name).toBe(false);
      expect(report.routeReady, name).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-preflight")?.detail,
        name,
      ).toContain(expected);
    }
  });

  it("rejects peer audit reports whose valid fields are only inherited properties", () => {
    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        peerAuditReport: Object.create(readyPeerAuditReport()),
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.peerAudit).toBeNull();
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
    ).toContain("peer audit report is missing");
  });

  it("does not invoke accessor-backed route or peer audit report fields", () => {
    const getterBacked = (source, label) => {
      let reads = 0;
      const target = {};
      for (const key of Object.keys(source)) {
        Object.defineProperty(target, key, {
          configurable: true,
          enumerable: true,
          get() {
            reads += 1;
            throw new Error(`${label}.${key} getter must not be invoked`);
          },
        });
      }
      return {
        target,
        get reads() {
          return reads;
        },
      };
    };
    const route = getterBacked(readyRouteReport(), "route");
    const peerAudit = getterBacked(readyPeerAuditReport(), "peerAudit");

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: route.target,
        peerAuditReport: peerAudit.target,
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(route.reads).toBe(0);
    expect(peerAudit.reads).toBe(0);
    expect(report.route).toMatchObject({
      routeId: null,
      assetKey: null,
      deployment: null,
      postDeployLiveEvidence: null,
    });
    expect(report.peerAudit).toMatchObject({
      ready: false,
      routeId: null,
      assetKey: null,
      peerCount: null,
      peers: [],
    });
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("route report report checks are missing or invalid");
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
    ).toContain(
      `expected peer audit route ${SCCP_BSC_XOR_ROUTE_ID}/${SCCP_BSC_XOR_ASSET_KEY}`,
    );
  });

  it("does not invoke accessor-backed nested route deployment fields", () => {
    let reads = 0;
    const deployment = { ...readyRouteReport().deployment };
    Object.defineProperty(deployment, "verifierKeyHash", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("route deployment verifierKeyHash getter was invoked");
      },
    });

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: readyRouteReport({ deployment }),
      }),
    );

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("verifierKeyHash is missing");
  });

  it("does not invoke accessor-backed nested route post-deploy evidence fields", () => {
    let reads = 0;
    const postDeployLiveEvidence = {
      ...readyRouteReport().postDeployLiveEvidence,
    };
    Object.defineProperty(postDeployLiveEvidence, "fullTomlReady", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("route post-deploy fullTomlReady getter was invoked");
      },
    });

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: readyRouteReport({ postDeployLiveEvidence }),
      }),
    );

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("fullTomlReady");
  });

  it("does not invoke accessor-backed route runbook entries", () => {
    let nextActionReads = 0;
    let missingInputReads = 0;
    const nextActions = [
      {
        id: "publish-production-proof-material",
        title: "Publish production proof material",
        detail: "Publish production BSC proof material.",
        requiredInputs: [
          {
            id: "testnet-production-verifier-key-json",
            kind: "path",
            placeholder: "<verifier-key.json>",
            description: "Production verifier key JSON.",
          },
        ],
        blockedByChecks: ["bsc-production-proof-material"],
        commands: [
          "npm run e2e:sccp:bsc-route-preflight -- --bsc-network testnet",
        ],
      },
    ];
    const missingProductionInputs = [
      {
        id: "testnet-production-verifier-key-json",
        kind: "path",
        placeholder: "<verifier-key.json>",
        description: "Production verifier key JSON.",
        blockedByActions: ["publish-production-proof-material"],
      },
    ];
    Object.defineProperty(nextActions, "0", {
      configurable: true,
      enumerable: true,
      get() {
        nextActionReads += 1;
        throw new Error("route next action getter must not be invoked");
      },
    });
    Object.defineProperty(missingProductionInputs, "0", {
      configurable: true,
      enumerable: true,
      get() {
        missingInputReads += 1;
        throw new Error("route missing input getter must not be invoked");
      },
    });

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: readyRouteReport({
          nextActions,
          missingProductionInputs,
        }),
      }),
    );

    expect(nextActionReads).toBe(0);
    expect(missingInputReads).toBe(0);
    expect(
      report.ready,
      JSON.stringify(
        { reasons: report.reasons, checks: report.checks },
        null,
        2,
      ),
    ).toBe(true);
    expect(report.route?.nextActions).toEqual([]);
    expect(report.route?.missingProductionInputs).toEqual([]);
  });

  it("does not invoke accessor-backed peer audit peer entries", () => {
    let reads = 0;
    const peers = [...readyPeerAuditReport().peers];
    Object.defineProperty(peers, "0", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("peer audit peer getter must not be invoked");
      },
    });

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        peerAuditReport: readyPeerAuditReport({ peers }),
      }),
    );

    expect(report.ready).toBe(false);
    expect(reads).toBe(0);
    expect(report.peerAudit?.peers).toHaveLength(3);
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
    ).toContain("peer audit peer 0 is not an object");
  });

  it("does not invoke accessor-backed peer audit next-action entries", () => {
    let reads = 0;
    const nextActions = [
      {
        id: "refresh-bsc-peer-config-audit",
        title: "Refresh BSC peer config audit",
        detail: "Refresh peer route publication evidence.",
        requiredInputs: [
          {
            id: "testnet-peer-config-audit-report",
            kind: "path",
            placeholder:
              "output/sccp-bsc-peer-config-audit/testnet/latest.json",
            description: "BSC peer audit report.",
          },
        ],
        blockedByChecks: ["peer-config-audit"],
        commands: [
          "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
        ],
      },
    ];
    Object.defineProperty(nextActions, "0", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("peer audit next action getter must not be invoked");
      },
    });

    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        peerAuditReport: readyPeerAuditReport({ nextActions }),
      }),
    );

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
    ).toContain("peer audit next action 0 is not an object");
  });

  it("ignores polluted Object.prototype fields in route and peer readiness inputs", () => {
    const pollutedKeys = {
      ready: true,
      manifestSource: "torii",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      taira: readyRouteReport().taira,
      bsc: readyRouteReport().bsc,
      deployment: readyRouteReport().deployment,
      postDeployLiveEvidence: readyRouteReport().postDeployLiveEvidence,
      checks: readyRouteReport().checks,
      nextSteps: ["polluted inherited operator step"],
      peerCount: 4,
      sanitizedStanzaFilesChecked: true,
      peers: readyPeerAuditReport().peers,
      manifestFingerprint: readyPeerAuditReport().manifestFingerprint,
    };
    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const report = evaluateBscSccpLiveSmokeReadiness(
        readySmokeReadinessInput({
          routeReport: {},
          peerAuditReport: {},
        }),
      );

      expect(report.ready).toBe(false);
      expect(report.routeReady).toBe(false);
      expect(report.route?.routeId).toBeNull();
      expect(report.route?.assetKey).toBeNull();
      expect(report.route?.deployment).toBeNull();
      expect(report.peerAudit?.routeId).toBeNull();
      expect(report.peerAudit?.peerCount).toBeNull();
      expect(report.peerAudit?.peers).toEqual([]);
      expect(report.nextSteps).not.toContain(
        "polluted inherited operator step",
      );
      expect(
        report.checks.find((entry) => entry.id === "route-preflight")?.detail,
      ).toContain("route report report checks are missing or invalid");
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("rejects route reports with conflicting timestamp aliases", () => {
    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        routeReport: readyRouteReport({
          generatedAt: "2026-06-05T00:00:00.000Z",
          generatedAtMs: Date.parse("2026-06-04T00:00:00.000Z"),
        }),
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.reasons).toContain("SCCP BSC route preflight is not ready.");
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain(
      "route report point timestamp fields disagree: generatedAt, generatedAtMs",
    );
  });

  it("rejects peer audit reports with invalid secondary timestamp aliases", () => {
    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        peerAuditReport: readyPeerAuditReport({
          generatedAt: "2026-06-05T00:00:00.000Z",
          generatedAtMs: "not-a-safe-integer",
        }),
      }),
    );

    expect(report.ready).toBe(false);
    expect(report.peerAudit?.ready).toBe(true);
    expect(report.reasons).toContain("TAIRA peer config audit is not ready.");
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
    ).toContain("peer audit report generatedAtMs is invalid");
  });

  it("does not bind prover manifests to inherited route deployment evidence", () => {
    const baseRouteReport = readyRouteReport();
    const routeReport = { ...baseRouteReport };
    delete routeReport.deployment;
    delete routeReport.postDeployLiveEvidence;
    const pollutedKeys = {
      deployment: baseRouteReport.deployment,
      postDeployLiveEvidence: baseRouteReport.postDeployLiveEvidence,
    };
    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const inspection = validateBscSccpBrowserProverManifest({
        manifest: readyProverManifest(),
        routeReport,
        moduleUrl: "/sccp-bsc-prover.js",
        expectedDirection: "destination",
        label: "TAIRA -> BSC prover",
      });

      expect(inspection.ok).toBe(false);
      expect(inspection.detail).toContain(
        "route deployment evidence is missing",
      );
      expect(inspection.detail).toContain(
        "route postDeployLiveEvidence is missing",
      );
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("rejects prover manifest deployment fields that are only inherited", () => {
    const baseManifest = readyProverManifest();
    const manifest = {
      ...baseManifest,
      deployment: {},
      postDeployLiveEvidence: {},
    };
    const pollutedKeys = {
      ...baseManifest.deployment,
      ...baseManifest.postDeployLiveEvidence,
    };
    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const inspection = validateBscSccpBrowserProverManifest({
        manifest,
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        expectedDirection: "destination",
        label: "TAIRA -> BSC prover",
      });

      expect(inspection.ok).toBe(false);
      expect(inspection.detail).toContain("bridgeAddress is missing");
      expect(inspection.detail).toContain(
        "postDeployLiveEvidence.fullTomlReady must be true",
      );
      expect(inspection.detail).toContain(
        "postDeployLiveEvidence.sourceBridgeConfigHash is missing",
      );
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("does not invoke accessor-backed nested prover manifest post-deploy evidence fields", () => {
    let reads = 0;
    const postDeployLiveEvidence = {
      ...readyProverManifest().postDeployLiveEvidence,
    };
    Object.defineProperty(postDeployLiveEvidence, "fullTomlReady", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error(
          "prover manifest post-deploy fullTomlReady getter was invoked",
        );
      },
    });

    const inspection = validateBscSccpBrowserProverManifest({
      manifest: {
        ...readyProverManifest(),
        postDeployLiveEvidence,
      },
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });

    expect(reads).toBe(0);
    expect(inspection.ok).toBe(false);
    expect(inspection.detail).toContain(
      "postDeployLiveEvidence.fullTomlReady must be true",
    );
  });

  it("rejects malformed prover manifest export arrays without invoking getters", () => {
    let reads = 0;
    const accessorFieldManifest = readyProverManifest();
    Object.defineProperty(accessorFieldManifest, "exports", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("prover manifest exports getter was invoked");
      },
    });

    const accessorFieldInspection = validateBscSccpBrowserProverManifest({
      manifest: accessorFieldManifest,
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });

    expect(reads).toBe(0);
    expect(accessorFieldInspection.ok).toBe(false);
    expect(accessorFieldInspection.detail).toContain(
      "manifest exports manifest.exports must be a data property",
    );

    const accessorExports = ["bscSccpProve"];
    Object.defineProperty(accessorExports, "1", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("prover manifest export getter was invoked");
      },
    });

    const accessorInspection = validateBscSccpBrowserProverManifest({
      manifest: readyProverManifest({ exports: accessorExports }),
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });

    expect(reads).toBe(0);
    expect(accessorInspection.ok).toBe(false);
    expect(accessorInspection.detail).toContain(
      "manifest exports manifest.exports 1 must be a string",
    );

    const sparseExports = ["bscSccpProve"];
    sparseExports.length = 3;
    sparseExports[2] = "bscSccpNativeProverSelfTest";
    const sparseInspection = validateBscSccpBrowserProverManifest({
      manifest: readyProverManifest({ exports: sparseExports }),
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });

    expect(sparseInspection.ok).toBe(false);
    expect(sparseInspection.detail).toContain(
      "manifest exports manifest.exports 1 is missing",
    );

    const nonStringInspection = validateBscSccpBrowserProverManifest({
      manifest: readyProverManifest({
        exports: ["bscSccpProve", 7, "bscSccpNativeProverSelfTest"],
      }),
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });

    expect(nonStringInspection.ok).toBe(false);
    expect(nonStringInspection.detail).toContain(
      "manifest exports manifest.exports 1 must be a string",
    );
  });

  it("preserves machine-readable peer failed-check state in public smoke reports", () => {
    const basePeerAudit = readyPeerAuditReport();
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport({
        ready: false,
        checks: basePeerAudit.checks.map((entry) =>
          entry.id === "peer-route-production-readiness"
            ? { ...entry, ok: false, status: "fail" }
            : entry,
        ),
        peers: basePeerAudit.peers.map((peer, index) =>
          index === 0
            ? {
                ...peer,
                ready: false,
                productionReady: false,
                failedChecks: [
                  {
                    id: "bsc-production-ready",
                    ok: false,
                    status: "fail",
                    message: "BSC route is production-ready.",
                    detail: "operator-only diagnostic detail",
                  },
                ],
              }
            : peer,
        ),
      }),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverModuleAvailability:
        readyDestinationProverModuleAvailability(),
      sourceProverModuleAvailability: readySourceProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection(),
      sourceProverManifestInspection: readySourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.peerAudit?.peers[0].failedChecks).toEqual([
      {
        id: "bsc-production-ready",
        ok: false,
        status: "fail",
        message: "BSC route is production-ready.",
      },
    ]);
    expect(JSON.stringify(report.peerAudit)).not.toContain(
      "operator-only diagnostic detail",
    );
  });

  it("passes with BSC mainnet evidence and emits mainnet operator steps", () => {
    const routeReport = readyMainnetRouteReport();
    const proverBinding = {
      routeReport,
      bscNetwork: "mainnet",
      bscChainIdHex: "0x38",
      bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      sourceEventExplorerUrl: MAINNET_SOURCE_EVENT_EXPLORER_URL,
      routeCanaryExplorerUrl: MAINNET_ROUTE_CANARY_EXPLORER_URL,
    };

    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport,
      bscNetwork: "mainnet",
      peerAuditReport: readyMainnetPeerAuditReport(routeReport),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverModuleAvailability:
        readyDestinationProverModuleAvailability(),
      sourceProverModuleAvailability: readySourceProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection(proverBinding),
      sourceProverManifestInspection: readySourceProverInspection({
        ...proverBinding,
        moduleSha256: SOURCE_PROVER_MODULE_SHA256,
      }),
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.routeReady).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.nextSteps).toEqual([
      "Connect a TAIRA local wallet with XOR on the TAIRA endpoint.",
      "Connect a BSC mainnet wallet through WalletConnect/AppKit.",
      "Run one tiny TAIRA -> BSC transfer and verify the BSC mainnet finalize transaction link.",
      "Run one tiny BSC -> TAIRA transfer and verify the TAIRA finalize_inbound transaction link.",
    ]);
    expect(report.nextSteps.join("\n")).not.toContain("BSC testnet");
    expect(report.provers.destination.manifest).toMatchObject({
      bscChainIdHex: "0x38",
      bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      postDeployLiveEvidence: {
        sourceEventExplorerUrl: MAINNET_SOURCE_EVENT_EXPLORER_URL,
        routeCanaryExplorerUrl: MAINNET_ROUTE_CANARY_EXPLORER_URL,
      },
    });
  });

  it("rejects forged BSC mainnet smoke reports missing the mainnet chain-id preflight check", () => {
    const routeReport = readyMainnetRouteReport({
      checks: readyMainnetRouteReport().checks.filter(
        (entry) => entry.id !== "bsc-mainnet-chain-id",
      ),
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport,
      bscNetwork: "mainnet",
      peerAuditReport: readyMainnetPeerAuditReport(routeReport),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.reasons).toContain("SCCP BSC route preflight is not ready.");
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("bsc-mainnet-chain-id preflight check has not passed");
  });

  it("requires a route-bound runtime config when the checked-in BSC prover adapter is selected", () => {
    expect(
      deriveBscRuntimeProverConfigUrl(
        SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
        SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      ),
    ).toBe(SCCP_BSC_RUNTIME_PROVER_CONFIG_URL);
    const baseRouteReport = readyRouteReport();
    const runtimeRouteReport = readyRouteReport({
      deployment: {
        ...baseRouteReport.deployment,
        destinationBrowserProver: {
          ...baseRouteReport.deployment.destinationBrowserProver,
          moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
          moduleHash: PROVER_MODULE_SHA256,
        },
        sourceBrowserProver: {
          ...baseRouteReport.deployment.sourceBrowserProver,
          moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
          moduleHash: PROVER_MODULE_SHA256,
        },
      },
    });

    const missingConfig = evaluateBscSccpLiveSmokeReadiness({
      routeReport: runtimeRouteReport,
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      destinationProverModuleAvailability:
        readyRuntimeProverModuleAvailability(),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(missingConfig.ready).toBe(false);
    expect(missingConfig.reasons).toContain(
      "BSC runtime prover config was not checked.",
    );
    expect(missingConfig.provers.runtimeConfig).toMatchObject({
      configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      manifest: null,
    });

    const forgedManifestRuntimeModule = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverModuleAvailability:
        readyDestinationProverModuleAvailability({
          detail: "destination module is available",
        }),
      sourceProverModuleAvailability: readySourceProverModuleAvailability({
        detail: "source module is available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readySourceProverInspection(),
    });

    expect(forgedManifestRuntimeModule.ready).toBe(false);
    expect(forgedManifestRuntimeModule.reasons).toContain(
      "BSC runtime prover config was not checked.",
    );
    expect(forgedManifestRuntimeModule.provers.runtimeConfig).toMatchObject({
      required: true,
      configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      manifest: null,
    });

    const ready = evaluateBscSccpLiveSmokeReadiness({
      routeReport: runtimeRouteReport,
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: readyRuntimeProverConfigInspection(),
      destinationProverModuleAvailability:
        readyRuntimeProverModuleAvailability(),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(
      ready.ready,
      JSON.stringify({ reasons: ready.reasons, checks: ready.checks }, null, 2),
    ).toBe(true);
    expect(ready.provers.runtimeConfig).toMatchObject({
      configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      configSha256: hex32("aa"),
      manifest: {
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        tairaChainId: BSC_TAIRA_CHAIN_ID,
        tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
        destination: {
          proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
          provingKeyUrl: "/sccp-bsc/proving-key.zkey",
          verifierKeyUrl: "/sccp-bsc/verifier-key.json",
          backendModuleUrl: "/sccp-bsc/backend.js",
        },
        source: {
          proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
          provingKeyUrl: "/sccp-bsc/proving-key.zkey",
          verifierKeyUrl: "/sccp-bsc/verifier-key.json",
          backendModuleUrl: "/sccp-bsc/backend.js",
        },
      },
    });
  });

  it("rejects forged BSC runtime config inspections that are not bound to the configured config URL", () => {
    const runtimeInput = {
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      destinationProverModuleAvailability:
        readyRuntimeProverModuleAvailability(),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability(),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    };

    let runtimeManifestReads = 0;
    const accessorRuntimeInspection = {
      ...readyRuntimeProverConfigInspection(),
      ok: true,
      detail: "accessor-backed runtime inspection must not pass",
    };
    Object.defineProperty(accessorRuntimeInspection, "manifest", {
      configurable: true,
      enumerable: true,
      get() {
        runtimeManifestReads += 1;
        throw new Error("runtime manifest getter must not be invoked");
      },
    });
    const accessorRuntimeReport = evaluateBscSccpLiveSmokeReadiness({
      ...runtimeInput,
      runtimeProverConfigInspection: accessorRuntimeInspection,
    });

    expect(accessorRuntimeReport.ready).toBe(false);
    expect(runtimeManifestReads).toBe(0);
    expect(accessorRuntimeReport.provers.runtimeConfig.manifest).toBeNull();
    expect(accessorRuntimeReport.reasons.join("\n")).toMatch(
      /BSC runtime prover config inspected manifest is missing/u,
    );

    const missingMachineFields = evaluateBscSccpLiveSmokeReadiness({
      ...runtimeInput,
      runtimeProverConfigInspection: {
        ok: true,
        detail: "copied runtime config success text",
        manifest: readyRuntimeProverConfigInspection().manifest,
      },
    });

    expect(missingMachineFields.ready).toBe(false);
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /BSC runtime prover config inspected configUrl is missing/u,
    );
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /BSC runtime prover config inspected configSha256 is missing or invalid/u,
    );

    const wrongUrl = evaluateBscSccpLiveSmokeReadiness({
      ...runtimeInput,
      runtimeProverConfigInspection: readyRuntimeProverConfigInspection({
        configUrl: "/sccp-bsc/stale-runtime-config.json",
      }),
    });

    expect(wrongUrl.ready).toBe(false);
    expect(wrongUrl.reasons.join("\n")).toContain(
      `inspected configUrl /sccp-bsc/stale-runtime-config.json does not match configured ${SCCP_BSC_RUNTIME_PROVER_CONFIG_URL}.`,
    );

    const zeroHash = evaluateBscSccpLiveSmokeReadiness({
      ...runtimeInput,
      runtimeProverConfigInspection: readyRuntimeProverConfigInspection({
        configSha256: ZERO_HASH,
      }),
    });

    expect(zeroHash.ready).toBe(false);
    expect(zeroHash.reasons.join("\n")).toMatch(
      /BSC runtime prover config inspected configSha256 is missing or invalid/u,
    );

    const missingManifest = evaluateBscSccpLiveSmokeReadiness({
      ...runtimeInput,
      runtimeProverConfigInspection: {
        ...readyRuntimeProverConfigInspection(),
        manifest: null,
      },
    });

    expect(missingManifest.ready).toBe(false);
    expect(missingManifest.reasons.join("\n")).toMatch(
      /BSC runtime prover config inspected manifest is missing/u,
    );
  });

  it("hashes local BSC runtime config inspections before live smoke accepts them", async () => {
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-runtime-config-"),
    );
    try {
      await mkdir(path.join(tempRoot, "public", "sccp-bsc"), {
        recursive: true,
      });
      const configBytes = Buffer.from(
        `${JSON.stringify(readyRuntimeProverConfig(), null, 2)}\n`,
      );
      await writeFile(
        path.join(
          tempRoot,
          "public",
          SCCP_BSC_RUNTIME_PROVER_CONFIG_URL.replace(/^\/+/u, ""),
        ),
        configBytes,
      );

      await expect(
        inspectBscSccpRuntimeProverConfig({
          configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
          routeReport: readyRouteReport(),
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: true,
        configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
        configSha256: `0x${createHash("sha256")
          .update(configBytes)
          .digest("hex")}`,
        manifest: {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
        },
      });

      await writeFile(
        path.join(
          tempRoot,
          "public",
          SCCP_BSC_RUNTIME_PROVER_CONFIG_URL.replace(/^\/+/u, ""),
        ),
        `${JSON.stringify(readyRuntimeProverConfig(), null, 2).replace(
          '"routeId": "taira_bsc_xor",',
          '"routeId": "taira_bsc_shadow",\n  "routeId": "taira_bsc_xor",',
        )}\n`,
      );
      const duplicateKeyInspection = await inspectBscSccpRuntimeProverConfig({
        configUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
        routeReport: readyRouteReport(),
        repoRoot: tempRoot,
      });
      expect(duplicateKeyInspection).toMatchObject({
        ok: false,
        detail: expect.stringContaining("duplicate JSON object key"),
        manifest: null,
      });
      expect(JSON.stringify(duplicateKeyInspection)).not.toContain(
        "taira_bsc_shadow",
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects BSC runtime config manifests that drift from the route deployment", () => {
    const inspection = readyRuntimeProverConfigInspection({
      destination: {
        ...readyRuntimeProverConfig().destination,
        proofArtifactSha256: HASH_77,
      },
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: inspection,
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toMatch(/runtime prover config/u);
    expect(report.reasons.join("\n")).toMatch(/must match public route/u);

    const descriptorDrift = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: readyRuntimeProverConfigInspection({
        source: {
          ...readyRuntimeProverConfig().source,
          nativeEvmProverBundleHash: HASH_77,
        },
      }),
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(descriptorDrift.ready).toBe(false);
    expect(descriptorDrift.reasons.join("\n")).toMatch(
      /source\.nativeEvmProverBundleHash must match public route/u,
    );
  });

  it("rejects BSC runtime config manifests that reuse material hash roles", () => {
    const cases = [
      {
        inspection: readyRuntimeProverConfigInspection({
          destination: {
            ...readyRuntimeProverConfig().destination,
            provingKeySha256:
              readyRuntimeProverConfig().destination.proofArtifactSha256,
          },
        }),
        detail:
          /destination\.provingKeySha256 matches destination\.proofArtifactSha256/u,
      },
      {
        inspection: readyRuntimeProverConfigInspection({
          source: {
            ...readyRuntimeProverConfig().source,
            nativeEvmProverBundleHash:
              readyRuntimeProverConfig().source.nativeProverBundleSha256,
          },
        }),
        detail:
          /source\.nativeEvmProverBundleHash matches source\.nativeProverBundleSha256/u,
      },
    ];

    for (const { inspection, detail } of cases) {
      expect(inspection.ok).toBe(false);
      expect(inspection.detail).toMatch(detail);
      expect(inspection.manifest).toBeNull();
    }
  });

  it("rejects BSC runtime config manifests missing a verified native SDK", () => {
    const inspection = readyRuntimeProverConfigInspection({
      destination: {
        ...readyRuntimeProverConfig().destination,
        nativeProverVerifiedSdks: REQUIRED_NATIVE_PROVER_SDKS.filter(
          (sdk) => sdk !== "dotnet",
        ),
      },
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: inspection,
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toMatch(/nativeProverVerifiedSdks/u);
    expect(report.reasons.join("\n")).toMatch(/missing dotnet/u);
  });

  it("rejects BSC runtime config manifests with swapped backend exports", () => {
    const inspection = readyRuntimeProverConfigInspection({
      source: {
        ...readyRuntimeProverConfig().source,
        backendAcceptedExport: "bscSccpProve",
      },
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: inspection,
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toMatch(
      /source\.backendAcceptedExport is invalid/u,
    );
  });

  it("rejects BSC runtime config manifests missing backend self-test exports", () => {
    const inspection = readyRuntimeProverConfigInspection({
      destination: {
        ...readyRuntimeProverConfig().destination,
        backendAcceptedSelfTestExport: "",
      },
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: inspection,
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toMatch(
      /destination\.backendAcceptedSelfTestExport is invalid/u,
    );
  });

  it("rejects BSC runtime config manifests without backend self-contained evidence", () => {
    const inspection = readyRuntimeProverConfigInspection({
      source: {
        ...readyRuntimeProverConfig().source,
        backendSelfContained: false,
      },
    });
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      runtimeProverConfigUrl: SCCP_BSC_RUNTIME_PROVER_CONFIG_URL,
      runtimeProverConfigInspection: inspection,
      destinationProverModuleAvailability: readyRuntimeProverModuleAvailability(
        { detail: "available" },
      ),
      sourceProverModuleAvailability: readyRuntimeProverModuleAvailability({
        detail: "available",
      }),
      destinationProverManifestInspection: readyProverInspection({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      }),
      sourceProverManifestInspection: readyRuntimeSourceProverInspection(),
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toMatch(
      /source\.backendSelfContained must be true/u,
    );
  });

  it("does not invoke accessor-backed BSC runtime config manifest fields", () => {
    let reads = 0;
    const rootManifest = readyRuntimeProverConfig();
    Object.defineProperty(rootManifest, "schema", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("schema getter must not be invoked");
      },
    });
    const rootInspection = validateBscSccpRuntimeProverConfigManifest({
      manifest: rootManifest,
      routeReport: readyRouteReport(),
      label: "BSC runtime prover config",
    });
    expect(rootInspection.ok).toBe(false);
    expect(rootInspection.detail).toMatch(/schema must be/u);

    const sectionManifest = readyRuntimeProverConfig({
      source: { ...readyRuntimeProverConfig().source },
    });
    Object.defineProperty(sectionManifest.source, "backendSelfContained", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("backendSelfContained getter must not be invoked");
      },
    });
    const sectionInspection = validateBscSccpRuntimeProverConfigManifest({
      manifest: sectionManifest,
      routeReport: readyRouteReport(),
      label: "BSC runtime prover config",
    });
    expect(sectionInspection.ok).toBe(false);
    expect(sectionInspection.detail).toMatch(
      /source\.backendSelfContained must be true/u,
    );

    const sdkManifest = readyRuntimeProverConfig({
      destination: { ...readyRuntimeProverConfig().destination },
    });
    sdkManifest.destination.nativeProverVerifiedSdks = [
      ...REQUIRED_NATIVE_PROVER_SDKS,
    ];
    Object.defineProperty(
      sdkManifest.destination.nativeProverVerifiedSdks,
      "0",
      {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          throw new Error("nativeProverVerifiedSdks getter must not run");
        },
      },
    );
    const sdkInspection = validateBscSccpRuntimeProverConfigManifest({
      manifest: sdkManifest,
      routeReport: readyRouteReport(),
      label: "BSC runtime prover config",
    });
    expect(sdkInspection.ok).toBe(false);
    expect(sdkInspection.detail).toMatch(/nativeProverVerifiedSdks/u);
    expect(reads).toBe(0);
  });

  it("rejects BSC runtime config manifests with profile label drift", () => {
    const cases = [
      {
        manifest: readyRuntimeProverConfig({ bscNetwork: "mainnet" }),
        detail: /bscNetwork must be testnet/u,
      },
      {
        manifest: readyRuntimeProverConfig({ bscChain: "bsc-mainnet" }),
        detail: /bscChain must be bsc-testnet/u,
      },
    ];

    for (const { manifest, detail } of cases) {
      const inspection = validateBscSccpRuntimeProverConfigManifest({
        manifest,
        routeReport: readyRouteReport(),
        bscNetwork: "testnet",
        label: "BSC runtime prover config",
      });

      expect(inspection.ok).toBe(false);
      expect(inspection.detail).toMatch(detail);
      expect(inspection.manifest).toBeNull();
    }
  });

  it("rejects edited BSC runtime config manifests with unsupported fields", () => {
    const cases = [
      {
        manifest: readyRuntimeProverConfig({
          operatorPrivateKey: "0x" + "11".repeat(32),
        }),
        detail:
          /BSC runtime prover config contains unsupported field \[redacted unsupported field\]/u,
        forbidden: ["operatorPrivateKey"],
      },
      {
        manifest: readyRuntimeProverConfig({
          source: {
            ...readyRuntimeProverConfig().source,
            customData: {
              privateKey: "0x" + "22".repeat(32),
            },
          },
        }),
        detail: /source contains unsupported field customData/u,
        forbidden: [],
      },
      {
        manifest: readyRuntimeProverConfig({
          destination: {
            ...readyRuntimeProverConfig().destination,
            proofArtifactHash:
              readyRuntimeProverConfig().destination.proofArtifactSha256,
          },
        }),
        detail: /destination contains unsupported field proofArtifactHash/u,
        forbidden: [],
      },
      {
        manifest: readyRuntimeProverConfig({
          source: {
            ...readyRuntimeProverConfig().source,
            proving_key_hash:
              readyRuntimeProverConfig().source.provingKeySha256,
          },
        }),
        detail: /source contains unsupported field proving_key_hash/u,
        forbidden: [],
      },
    ];

    for (const { manifest, detail, forbidden } of cases) {
      const inspection = validateBscSccpRuntimeProverConfigManifest({
        manifest,
        routeReport: readyRouteReport(),
        bscNetwork: "testnet",
        label: "BSC runtime prover config",
      });

      expect(inspection.ok).toBe(false);
      expect(inspection.detail).toMatch(detail);
      expect(inspection.detail).not.toContain("11".repeat(32));
      expect(inspection.detail).not.toContain("22".repeat(32));
      for (const value of forbidden) {
        expect(inspection.detail).not.toContain(value);
      }
      expect(inspection.manifest).toBeNull();
    }
  });

  it("fails closed when sidecars are valid but browser prover module availability was not checked", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverManifestInspection: readyProverInspection(),
      sourceProverManifestInspection: readySourceProverInspection(),
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(true);
    expect(report.reasons).toContain(
      "TAIRA -> BSC browser prover module availability was not checked.",
    );
    expect(report.reasons).toContain(
      "BSC -> TAIRA browser source prover module availability was not checked.",
    );
    expect(report.nextSteps).not.toEqual(SCCP_BSC_LIVE_SMOKE_STEPS);
  });

  it("fails closed when configured BSC prover module URLs are not actually available", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      destinationProverModuleAvailability: {
        ok: false,
        detail:
          "TAIRA -> BSC prover module URL /sccp-bsc-prover.js does not exist under public/.",
      },
      sourceProverModuleAvailability: {
        ok: false,
        detail:
          "BSC -> TAIRA source prover module URL /sccp-bsc-source-prover.js does not exist under public/.",
      },
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toContain("does not exist under public/");
    expect(report.nextSteps).not.toEqual(SCCP_BSC_LIVE_SMOKE_STEPS);
  });

  it("rejects forged BSC prover module availability proofs that are not bound to the configured module", () => {
    let accessorReads = 0;
    const accessorAvailability = {
      moduleUrl: "/sccp-bsc-prover.js",
      moduleSha256: PROVER_MODULE_SHA256,
      expectedSha256: PROVER_MODULE_SHA256,
      detail: "accessor-backed availability must not pass",
    };
    Object.defineProperty(accessorAvailability, "ok", {
      configurable: true,
      enumerable: true,
      get() {
        accessorReads += 1;
        throw new Error("availability ok getter must not be invoked");
      },
    });
    const accessorReport = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverModuleAvailability: accessorAvailability,
      }),
    );

    expect(accessorReport.ready).toBe(false);
    expect(accessorReads).toBe(0);
    expect(accessorReport.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover module availability was not checked/u,
    );

    const missingMachineFields = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverModuleAvailability: {
          ok: true,
          detail: "copied success text",
        },
      }),
    );

    expect(missingMachineFields.ready).toBe(false);
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover module inspected moduleUrl is missing/u,
    );
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover module inspected moduleSha256 is missing/u,
    );

    const wrongUrl = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverModuleAvailability:
          readyDestinationProverModuleAvailability({
            moduleUrl: "/other-bsc-prover.js",
          }),
      }),
    );

    expect(wrongUrl.ready).toBe(false);
    expect(wrongUrl.reasons.join("\n")).toMatch(
      /inspected moduleUrl \/other-bsc-prover\.js does not match configured \/sccp-bsc-prover\.js/u,
    );

    const duplicateUrlAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverModuleAvailability: {
          ...readyDestinationProverModuleAvailability(),
          url: "/other-bsc-prover.js",
        },
      }),
    );

    expect(duplicateUrlAlias.ready).toBe(false);
    expect(duplicateUrlAlias.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover module inspected moduleUrl must not use multiple aliases: moduleUrl, url/u,
    );

    const wrongHash = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        sourceProverModuleAvailability: readySourceProverModuleAvailability({
          moduleSha256: HASH_77,
        }),
      }),
    );

    expect(wrongHash.ready).toBe(false);
    expect(wrongHash.reasons.join("\n")).toMatch(
      /BSC -> TAIRA browser source prover module inspected moduleSha256 .* does not match manifest moduleSha256/u,
    );

    const duplicateHashAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverModuleAvailability: {
          ...readyDestinationProverModuleAvailability(),
          sha256: PROVER_MODULE_SHA256,
        },
      }),
    );

    expect(duplicateHashAlias.ready).toBe(false);
    expect(duplicateHashAlias.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover module inspected moduleSha256 must not use multiple aliases: moduleSha256, sha256/u,
    );

    const duplicateExpectedHashAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        sourceProverModuleAvailability: {
          ...readySourceProverModuleAvailability(),
          expectedModuleSha256: SOURCE_PROVER_MODULE_SHA256,
        },
      }),
    );

    expect(duplicateExpectedHashAlias.ready).toBe(false);
    expect(duplicateExpectedHashAlias.reasons.join("\n")).toMatch(
      /BSC -> TAIRA browser source prover module expectedSha256 must not use multiple aliases: expectedSha256, expectedModuleSha256/u,
    );
  });

  it("rejects forged BSC prover manifest inspections that are not bound to the configured sidecar", () => {
    const readyInspection = readyProverInspection();
    let manifestReads = 0;
    const accessorInspection = {
      ...readyInspection,
      ok: true,
      detail: "accessor-backed manifest inspection must not pass",
    };
    Object.defineProperty(accessorInspection, "manifest", {
      configurable: true,
      enumerable: true,
      get() {
        manifestReads += 1;
        throw new Error("manifest getter must not be invoked");
      },
    });
    const accessorReport = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: accessorInspection,
      }),
    );

    expect(accessorReport.ready).toBe(false);
    expect(manifestReads).toBe(0);
    expect(accessorReport.provers.destination.manifest).toBeNull();
    expect(accessorReport.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected manifest moduleUrl is missing/u,
    );

    const missingMachineFields = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ok: true,
          detail: "copied sidecar success text",
          manifest: readyInspection.manifest,
        },
      }),
    );

    expect(missingMachineFields.ready).toBe(false);
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected manifestUrl is missing/u,
    );
    expect(missingMachineFields.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected moduleSha256 is missing/u,
    );

    const wrongManifestUrl = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ...readyInspection,
          manifestUrl: "/stale-bsc-prover.js.manifest.json",
        },
      }),
    );

    expect(wrongManifestUrl.ready).toBe(false);
    expect(wrongManifestUrl.reasons.join("\n")).toMatch(
      /inspected manifestUrl \/stale-bsc-prover\.js\.manifest\.json does not match configured \/sccp-bsc-prover\.js\.manifest\.json/u,
    );

    const duplicateManifestUrlAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ...readyInspection,
          url: "/stale-bsc-prover.js.manifest.json",
        },
      }),
    );

    expect(duplicateManifestUrlAlias.ready).toBe(false);
    expect(duplicateManifestUrlAlias.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected manifestUrl must not use multiple aliases: manifestUrl, url/u,
    );

    const wrongManifestModule = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: readyProverInspection({
          moduleUrl: "/other-bsc-prover.js",
          manifestUrl: "/sccp-bsc-prover.js.manifest.json",
        }),
      }),
    );

    expect(wrongManifestModule.ready).toBe(false);
    expect(wrongManifestModule.reasons.join("\n")).toMatch(
      /inspected manifest moduleUrl \/other-bsc-prover\.js does not match configured \/sccp-bsc-prover\.js/u,
    );

    const duplicateManifestModuleUrlAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ...readyInspection,
          manifest: {
            ...readyInspection.manifest,
            module_url: "/other-bsc-prover.js",
          },
        },
      }),
    );

    expect(duplicateManifestModuleUrlAlias.ready).toBe(false);
    expect(duplicateManifestModuleUrlAlias.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected manifest moduleUrl must not use multiple aliases: moduleUrl, module_url/u,
    );

    const wrongInspectionHash = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ...readyInspection,
          moduleSha256: HASH_77,
        },
      }),
    );

    expect(wrongInspectionHash.ready).toBe(false);
    expect(wrongInspectionHash.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest inspected moduleSha256 .* does not match manifest moduleSha256/u,
    );

    const duplicateManifestHashAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        destinationProverManifestInspection: {
          ...readyInspection,
          manifest: {
            ...readyInspection.manifest,
            module_sha256: readyInspection.manifest.moduleSha256,
          },
        },
      }),
    );

    expect(duplicateManifestHashAlias.ready).toBe(false);
    expect(duplicateManifestHashAlias.reasons.join("\n")).toMatch(
      /TAIRA -> BSC browser prover manifest manifest moduleSha256 must not use multiple aliases: moduleSha256, module_sha256/u,
    );

    const duplicateInspectionHashAlias = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        sourceProverManifestInspection: {
          ...readySourceProverInspection(),
          sha256: SOURCE_PROVER_MODULE_SHA256,
        },
      }),
    );

    expect(duplicateInspectionHashAlias.ready).toBe(false);
    expect(duplicateInspectionHashAlias.reasons.join("\n")).toMatch(
      /BSC -> TAIRA browser source prover manifest inspected moduleSha256 must not use multiple aliases: moduleSha256, sha256/u,
    );
  });

  it("requires a ready TAIRA peer-config audit before live smoke can pass", () => {
    const withFirstPeerOverride = (peerOverrides) =>
      readyPeerAuditReport({
        peers: readyPeerAuditReport().peers.map((peer, index) =>
          index === 0 ? { ...peer, ...peerOverrides } : peer,
        ),
      });
    const cases = [
      {
        name: "missing",
        peerAuditReport: null,
        detail: "peer audit report is missing",
      },
      {
        name: "wrong route",
        peerAuditReport: readyPeerAuditReport({ routeId: "taira_bsc_usdt" }),
        detail: "expected peer audit route",
      },
      {
        name: "not ready",
        peerAuditReport: readyPeerAuditReport({
          ready: false,
          checks: [
            {
              id: "peer-route-production-readiness",
              ok: false,
              message: "not ready",
              detail: "diagnostic verifier detail must not be echoed",
            },
          ],
        }),
        detail: "peer-route-production-readiness",
      },
      {
        name: "stale local route stanza",
        peerAuditReport: withFirstPeerOverride({ routeCount: 1 }),
        detail: "stale BSC route stanza",
      },
      {
        name: "zero raw TOML hash",
        peerAuditReport: withFirstPeerOverride({
          rawTomlSha256: `0x${"00".repeat(32)}`,
        }),
        detail: "rawTomlSha256 is invalid",
      },
      {
        name: "zero sanitized stanza hash",
        peerAuditReport: withFirstPeerOverride({
          sanitizedStanzaSha256: `0x${"00".repeat(32)}`,
        }),
        detail: "sanitizedStanzaSha256 is invalid",
      },
      {
        name: "missing peer sanitized stanza file hash",
        peerAuditReport: withFirstPeerOverride({
          sanitizedStanzaFileChecked: true,
          sanitizedStanzaFileSha256: undefined,
        }),
        detail: "marked checked without a hash",
      },
      {
        name: "drifting peer sanitized stanza file hash",
        peerAuditReport: withFirstPeerOverride({
          sanitizedStanzaFileSha256: HASH_33,
        }),
        detail: "sanitized stanza file hash mismatched",
      },
      {
        name: "secret-bearing report",
        peerAuditReport: readyPeerAuditReport({
          privateKey: "do-not-serialize",
          apiKey: "do-not-serialize-api-key",
        }),
        detail: "secret-like material",
      },
      {
        name: "assignment-shaped secret-bearing report",
        peerAuditReport: readyPeerAuditReport({
          auditNotes:
            "operator privateKey=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface accessToken=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
        }),
        detail: "secret-like material",
      },
    ];

    for (const { name, peerAuditReport, detail } of cases) {
      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport: readyRouteReport(),
        peerAuditReport,
        walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
        destinationProverModuleUrl: "/sccp-bsc-prover.js",
        sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
        destinationProverModuleAvailability:
          readyDestinationProverModuleAvailability({ detail: "ok" }),
        sourceProverModuleAvailability: readySourceProverModuleAvailability({
          detail: "ok",
        }),
        destinationProverManifestInspection: readyProverInspection(),
        sourceProverManifestInspection: readySourceProverInspection(),
      });

      expect(report.ready, name).toBe(false);
      expect(report.reasons, name).toContain(
        "TAIRA peer config audit is not ready.",
      );
      expect(
        report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
        name,
      ).toContain(detail);
      expect(JSON.stringify(report), name).not.toContain("do-not-serialize");
      expect(JSON.stringify(report), name).not.toContain(
        "do-not-serialize-api-key",
      );
      expect(JSON.stringify(report), name).not.toContain("privateKey=");
      expect(JSON.stringify(report), name).not.toContain("accessToken=");
      expect(JSON.stringify(report), name).not.toContain("feedfacefeedface");
      expect(JSON.stringify(report), name).not.toContain(
        "diagnostic verifier detail must not be echoed",
      );
    }
  });

  it("accepts a ready on-chain-only TAIRA peer-config audit", () => {
    const report = evaluateBscSccpLiveSmokeReadiness(
      readySmokeReadinessInput({
        peerAuditReport: readyPeerAuditReport({
          expectedPeers: null,
          peerCount: 0,
          peers: [],
          checks: readyPeerAuditReport().checks.filter(
            (entry) => entry.id !== "peer-count",
          ),
        }),
      }),
    );

    expect(report.ready).toBe(true);
    expect(report.peerAudit).toMatchObject({
      ready: true,
      peerCount: 0,
      peers: [],
    });
    expect(
      report.checks.find((entry) => entry.id === "peer-config-audit"),
    ).toMatchObject({ status: "pass" });
  });

  it("checks local and remote browser prover module availability without executing modules", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-modules-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "public", "placeholder-prover.js"),
        PLACEHOLDER_PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "public", "comment-only-prover.js"),
        COMMENT_ONLY_PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "public", "non-callable-prover.js"),
        NON_CALLABLE_PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "public", "missing-self-test-prover.js"),
        MISSING_SELF_TEST_PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "escaped-prover.js"),
        PROVER_MODULE_BYTES,
      );
      await symlink(
        path.join(tempRoot, "escaped-prover.js"),
        path.join(tempRoot, "public", "escaped-prover.js"),
      );

      expect(
        validateBscSccpBrowserProverModuleBytes(
          PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({ ok: true });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          SOURCE_PROVER_MODULE_BYTES,
          "BSC -> TAIRA source prover module URL",
        ),
      ).toMatchObject({ ok: true });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          Buffer.concat([
            PROVER_MODULE_BYTES,
            Buffer.from(
              [
                `const DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES = new Set(["0x${"99".repeat(32)}"]);`,
                `throw new Error("known diagnostic BSC verifier key hash");`,
                "",
              ].join("\n"),
            ),
          ]),
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({ ok: true });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          PLACEHOLDER_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("not production-shaped"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          SOURCE_PROVER_MODULE_WITHOUT_PUBLIC_INPUTS_BYTES,
          "BSC -> TAIRA source prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("public-input binding fields"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          MISSING_SELF_TEST_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("native self-test"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          NO_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("buildGroth16ProofPackage"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          LOCAL_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("buildGroth16ProofPackage"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("buildGroth16ProofPackage"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          DOUBLE_ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("buildGroth16ProofPackage"),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          INCOMPLETE_ADAPTER_PIPELINE_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "checked-in BSC runtime adapter pipeline",
        ),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          FLAT_ADAPTER_PIPELINE_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "checked-in BSC runtime adapter pipeline",
        ),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          DETACHED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "checked-in BSC runtime adapter pipeline",
        ),
      });
      expect(
        validateBscSccpBrowserProverModuleBytes(
          ALIASED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "checked-in BSC runtime adapter pipeline",
        ),
      });
      let acceptedExportReads = 0;
      const acceptedExports = ["bscSccpProve"];
      Object.defineProperty(acceptedExports, "1", {
        configurable: true,
        enumerable: true,
        get() {
          acceptedExportReads += 1;
          throw new Error("accepted export getter should not run");
        },
      });
      expect(
        assertBscSccpBrowserProverModuleExports(
          PROVER_MODULE_BYTES,
          acceptedExports,
          "TAIRA -> BSC prover module URL",
        ),
      ).toMatchObject({
        ok: true,
        callableExports: expect.arrayContaining(["bscSccpProve"]),
      });
      expect(acceptedExportReads).toBe(0);

      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: true,
        moduleUrl: "/sccp-bsc-prover.js",
        moduleSha256: PROVER_MODULE_SHA256,
        expectedSha256: null,
        detail: expect.stringContaining("production-shaped"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          maxBytes: PROVER_MODULE_BYTES.byteLength - 1,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("maximum allowed"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/placeholder-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("not production-shaped"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: PROVER_MODULE_SHA256,
        }),
      ).resolves.toMatchObject({
        ok: true,
        moduleUrl: "/sccp-bsc-prover.js",
        moduleSha256: PROVER_MODULE_SHA256,
        expectedSha256: PROVER_MODULE_SHA256,
        detail: expect.stringContaining("matches moduleSha256"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/missing-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("does not exist under public/"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/escaped-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: PROVER_MODULE_SHA256,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("must not be a symbolic link"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: HASH_11,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("does not match manifest moduleSha256"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/placeholder-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: `0x${createHash("sha256")
            .update(PLACEHOLDER_PROVER_MODULE_BYTES)
            .digest("hex")}`,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("not production-shaped"),
      });

      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/comment-only-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: `0x${createHash("sha256")
            .update(COMMENT_ONLY_PROVER_MODULE_BYTES)
            .digest("hex")}`,
          expectedExports: ["bscSccpProve"],
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("does not export one of"),
      });

      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/non-callable-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: `0x${createHash("sha256")
            .update(NON_CALLABLE_PROVER_MODULE_BYTES)
            .digest("hex")}`,
          expectedExports: ["bscSccpProve"],
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("callable function"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "/missing-self-test-prover.js",
          label: "TAIRA -> BSC prover module URL",
          repoRoot: tempRoot,
          expectedSha256: `0x${createHash("sha256")
            .update(MISSING_SELF_TEST_PROVER_MODULE_BYTES)
            .digest("hex")}`,
          expectedExports: ["bscSccpProve"],
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("native self-test"),
      });

      const fetchCalls = [];
      const fetchImpl = async (url, init) => {
        fetchCalls.push({ url: String(url), method: init?.method });
        return new Response(
          String(url).includes("placeholder")
            ? PLACEHOLDER_PROVER_MODULE_BYTES
            : SOURCE_PROVER_MODULE_BYTES,
          { status: 200 },
        );
      };
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
          label: "BSC -> TAIRA source prover module URL",
          fetchImpl,
        }),
      ).resolves.toMatchObject({
        ok: true,
        moduleUrl: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
        moduleSha256: SOURCE_PROVER_MODULE_SHA256,
        expectedSha256: null,
        detail: expect.stringContaining("production-shaped"),
      });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "https://cdn.example.invalid/placeholder-prover.js",
          label: "BSC -> TAIRA source prover module URL",
          fetchImpl,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("not production-shaped"),
      });
      expect(fetchCalls).toEqual([
        {
          url: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
          method: "GET",
        },
        {
          url: "https://cdn.example.invalid/placeholder-prover.js",
          method: "GET",
        },
      ]);
      fetchCalls.length = 0;
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
          label: "BSC -> TAIRA source prover module URL",
          fetchImpl,
          expectedSha256: SOURCE_PROVER_MODULE_SHA256,
        }),
      ).resolves.toMatchObject({
        ok: true,
        moduleUrl: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
        moduleSha256: SOURCE_PROVER_MODULE_SHA256,
        expectedSha256: SOURCE_PROVER_MODULE_SHA256,
      });
      expect(fetchCalls).toEqual([
        {
          url: "https://cdn.example.invalid/sccp-bsc-source-prover.js",
          method: "GET",
        },
      ]);
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "https://cdn.example.invalid/placeholder-prover.js",
          label: "BSC -> TAIRA source prover module URL",
          fetchImpl,
          expectedSha256: `0x${createHash("sha256")
            .update(PLACEHOLDER_PROVER_MODULE_BYTES)
            .digest("hex")}`,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("not production-shaped"),
      });

      const oversizedStreamingFetch = async () =>
        streamingBytesResponse(49, { chunkSize: 7 });
      await expect(
        inspectSccpBrowserModuleAvailability({
          moduleUrl: "https://cdn.example.invalid/oversized-prover.js",
          label: "BSC -> TAIRA source prover module URL",
          fetchImpl: oversizedStreamingFetch,
          maxBytes: 48,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("exceeds maximum allowed 48 bytes"),
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("loads and validates BSC prover sidecar manifests without executing modules", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-manifest-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js.manifest.json"),
        JSON.stringify(readyProverManifest(), null, 2),
      );

      const inspection = await inspectBscSccpBrowserProverManifest({
        manifestUrl: "/sccp-bsc-prover.js.manifest.json",
        moduleUrl: "/sccp-bsc-prover.js",
        label: "TAIRA -> BSC prover",
        expectedDirection: "destination",
        routeReport: readyRouteReport(),
        repoRoot: tempRoot,
      });
      expect(inspection).toMatchObject({
        ok: true,
        manifestUrl: "/sccp-bsc-prover.js.manifest.json",
        moduleSha256: PROVER_MODULE_SHA256,
        manifest: {
          moduleUrl: "/sccp-bsc-prover.js",
          acceptedExport: "bscSccpProve",
        },
      });
      expect(
        deriveSccpBrowserProverManifestUrl(
          "/sccp-bsc-prover.js",
          "TAIRA -> BSC prover module URL",
        ),
      ).toBe("/sccp-bsc-prover.js.manifest.json");
      await expect(
        inspectBscSccpBrowserProverManifest({
          manifestUrl: "/stale-bsc-prover.js.manifest.json",
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover",
          expectedDirection: "destination",
          routeReport: readyRouteReport(),
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining(
          "manifest URL /stale-bsc-prover.js.manifest.json does not match module URL",
        ),
        manifest: null,
      });

      const localOnlySidecar = {
        schema: SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
        moduleUrl: "./sccp-bsc-prover.js",
        moduleSha256: PROVER_MODULE_SHA256,
        exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
        mnemonic:
          "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      };
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js.manifest.json"),
        JSON.stringify(localOnlySidecar, null, 2),
        "utf8",
      );
      const localOnlyInspection = await inspectBscSccpBrowserProverManifest({
        manifestUrl: "/sccp-bsc-prover.js.manifest.json",
        moduleUrl: "/sccp-bsc-prover.js",
        label: "TAIRA -> BSC prover",
        expectedDirection: "destination",
        routeReport: readyRouteReport(),
        repoRoot: tempRoot,
      });
      expect(localOnlyInspection).toMatchObject({
        ok: false,
        detail: expect.stringContaining("retired local-only sidecar schema"),
        manifest: null,
        moduleSha256: null,
      });
      expect(JSON.stringify(localOnlyInspection)).not.toContain(
        "abandon abandon",
      );
      expect(JSON.stringify(localOnlyInspection)).not.toContain(
        "routeId must be",
      );

      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js.manifest.json"),
        JSON.stringify({ padding: "x".repeat(256 * 1024) }),
        "utf8",
      );
      await expect(
        inspectBscSccpBrowserProverManifest({
          manifestUrl: "/sccp-bsc-prover.js.manifest.json",
          moduleUrl: "/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover",
          expectedDirection: "destination",
          routeReport: readyRouteReport(),
          repoRoot: tempRoot,
        }),
      ).resolves.toMatchObject({
        ok: false,
        detail: expect.stringContaining("maximum allowed is 262144 bytes"),
        manifest: null,
      });

      const oversizedManifestInspection =
        await inspectBscSccpBrowserProverManifest({
          manifestUrl:
            "https://cdn.example.invalid/sccp-bsc-prover.js.manifest.json",
          moduleUrl: "https://cdn.example.invalid/sccp-bsc-prover.js",
          label: "TAIRA -> BSC prover",
          expectedDirection: "destination",
          routeReport: readyRouteReport(),
          repoRoot: tempRoot,
          fetchImpl: async () =>
            streamingBytesResponse(256 * 1024 + 1, { chunkSize: 8192 }),
        });
      expect(oversizedManifestInspection).toMatchObject({
        ok: false,
        detail: expect.stringContaining("exceeds maximum allowed 262144 bytes"),
        manifest: null,
      });

      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js.manifest.json"),
        `${JSON.stringify(readyProverManifest(), null, 2).replace(
          '"bscNetwork": "testnet",',
          '"bscNetwork": "mainnet",\n  "bscNetwork": "testnet",',
        )}\n`,
      );
      const duplicateKeyInspection = await inspectBscSccpBrowserProverManifest({
        manifestUrl: "/sccp-bsc-prover.js.manifest.json",
        moduleUrl: "/sccp-bsc-prover.js",
        label: "TAIRA -> BSC prover",
        expectedDirection: "destination",
        routeReport: readyRouteReport(),
        repoRoot: tempRoot,
      });
      expect(duplicateKeyInspection).toMatchObject({
        ok: false,
        detail: expect.stringContaining("duplicate JSON object key"),
        manifest: null,
      });
      expect(JSON.stringify(duplicateKeyInspection)).not.toContain("mainnet");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects adversarial BSC prover manifests before live smoke", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const localOnlySidecarReport = validateBscSccpBrowserProverManifest({
      manifest: {
        schema: SCCP_BSC_LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
        moduleUrl: "./sccp-bsc-prover.js",
        moduleSha256: PROVER_MODULE_SHA256,
        exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
        mnemonic,
        routeId: "taira_bsc_usdt",
      },
      routeReport: readyRouteReport(),
      moduleUrl: "/sccp-bsc-prover.js",
      expectedDirection: "destination",
      label: "TAIRA -> BSC prover",
    });
    expect(localOnlySidecarReport).toMatchObject({
      ok: false,
      detail: expect.stringContaining("retired local-only sidecar schema"),
      manifest: null,
    });
    expect(JSON.stringify(localOnlySidecarReport)).not.toContain(
      "abandon abandon",
    );
    expect(JSON.stringify(localOnlySidecarReport)).not.toContain(
      "taira_bsc_usdt",
    );
    expect(JSON.stringify(localOnlySidecarReport)).not.toContain(
      "routeId must be",
    );

    const cases = [
      {
        name: "wrong schema",
        manifest: readyProverManifest({ schema: "old-schema" }),
        detail: /schema must be/u,
      },
      {
        name: "wrong module URL",
        manifest: readyProverManifest({ moduleUrl: "/other.js" }),
        detail: /does not match configured/u,
      },
      {
        name: "destination export missing",
        manifest: readyProverManifest({ exports: ["bscSccpSourceProve"] }),
        detail: /exports must include/u,
      },
      {
        name: "destination self-test export missing",
        manifest: readyProverManifest({ exports: ["bscSccpProve"] }),
        detail: /native prover self-test/u,
      },
      {
        name: "source direction for destination prover",
        manifest: readyProverManifest({ direction: "source" }),
        detail: /destination proof capability/u,
      },
      {
        name: "wrong route",
        manifest: {
          ...readyProverManifest(),
          routeId: "taira_bsc_usdt",
        },
        detail: /routeId must be taira_bsc_xor/u,
      },
      {
        name: "BSC mainnet binding",
        manifest: {
          ...readyProverManifest(),
          bscChainIdHex: "0x38",
          bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        },
        detail: /BSC testnet/u,
      },
      {
        name: "BSC network label drift",
        manifest: readyProverManifest({ bscNetwork: "mainnet" }),
        detail: /bscNetwork must be testnet/u,
      },
      {
        name: "BSC chain label drift",
        manifest: readyProverManifest({ bscChain: "bsc-mainnet" }),
        detail: /bscChain must be bsc-testnet/u,
      },
      {
        name: "zero module hash",
        manifest: readyProverManifest({ moduleSha256: ZERO_HASH }),
        detail: /moduleSha256 must be a non-zero 32-byte hex value/u,
      },
      {
        name: "missing module hash",
        manifest: withoutTopLevelManifestFields(
          readyProverManifest(),
          "moduleSha256",
        ),
        detail: /moduleSha256 is missing/u,
      },
      {
        name: "zero proof artifact hash",
        manifest: readyProverManifest({ proofArtifactHash: ZERO_HASH }),
        detail: /proofArtifactHash must be a non-zero 32-byte hex value/u,
      },
      {
        name: "missing proof artifact hash",
        manifest: withoutTopLevelManifestFields(
          readyProverManifest(),
          "proofArtifactHash",
        ),
        detail: /proofArtifactHash is missing/u,
      },
      {
        name: "zero proving key hash",
        manifest: readyProverManifest({ provingKeyHash: ZERO_HASH }),
        detail: /provingKeyHash must be a non-zero 32-byte hex value/u,
      },
      {
        name: "missing proving key hash",
        manifest: withoutTopLevelManifestFields(
          readyProverManifest(),
          "provingKeyHash",
        ),
        detail: /provingKeyHash is missing/u,
      },
      {
        name: "zero native EVM prover bundle hash",
        manifest: readyProverManifest({
          nativeEvmProverBundleHash: ZERO_HASH,
        }),
        detail:
          /nativeEvmProverBundleHash must be a non-zero 32-byte hex value/u,
      },
      {
        name: "missing native EVM prover bundle hash",
        manifest: withoutTopLevelManifestFields(
          readyProverManifest(),
          "nativeEvmProverBundleHash",
        ),
        detail: /nativeEvmProverBundleHash is missing/u,
      },
      {
        name: "browser module hash reused as proof artifact hash",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: PROVER_MODULE_SHA256,
          },
        }),
        manifest: {
          ...readyProverManifest({ proofArtifactHash: PROVER_MODULE_SHA256 }),
          deployment: {
            ...readyProverManifest().deployment,
            proofArtifactHash: PROVER_MODULE_SHA256,
          },
        },
        detail: /proofArtifactHash must not equal moduleSha256/u,
      },
      {
        name: "proof artifact hash reused as proving key hash",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: HASH_88,
            provingKeyHash: HASH_88,
          },
        }),
        manifest: {
          ...readyProverManifest({
            proofArtifactHash: HASH_88,
            provingKeyHash: HASH_88,
          }),
          deployment: {
            ...readyProverManifest().deployment,
            proofArtifactHash: HASH_88,
            provingKeyHash: HASH_88,
          },
        },
        detail: /provingKeyHash must not equal proofArtifactHash/u,
      },
      {
        name: "proof artifact hash reused as native bundle hash",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          },
        }),
        manifest: {
          ...readyProverManifest({
            proofArtifactHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          }),
          deployment: {
            ...readyProverManifest().deployment,
            proofArtifactHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          },
        },
        detail: /nativeEvmProverBundleHash must not equal proofArtifactHash/u,
      },
      {
        name: "proving key hash reused as native bundle hash",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          },
        }),
        manifest: {
          ...readyProverManifest({
            provingKeyHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          }),
          deployment: {
            ...readyProverManifest().deployment,
            provingKeyHash: HASH_99,
            nativeEvmProverBundleHash: HASH_99,
          },
        },
        detail: /nativeEvmProverBundleHash must not equal provingKeyHash/u,
      },
      {
        name: "route deployment mismatch",
        manifest: {
          ...readyProverManifest(),
          deployment: {
            ...readyProverManifest().deployment,
            verifierKeyHash: HASH_77,
          },
        },
        detail: /does not match route deployment/u,
      },
      {
        name: "native EVM prover bundle sidecar drift",
        manifest: {
          ...readyProverManifest(),
          nativeEvmProverBundleHash: HASH_77,
          deployment: {
            ...readyProverManifest().deployment,
            nativeEvmProverBundleHash: HASH_77,
          },
        },
        detail: /nativeEvmProverBundleHash.*does not match route deployment/u,
      },
      {
        name: "conflicting nested proof artifact hash",
        manifest: {
          ...readyProverManifest(),
          proofArtifactHash: HASH_44,
          deployment: {
            ...readyProverManifest().deployment,
            proofArtifactHash: HASH_77,
          },
        },
        detail: /proofArtifactHash.*does not match route deployment/u,
      },
      {
        name: "same-valued proof artifact hash aliases",
        manifest: {
          ...readyProverManifest(),
          proof_artifact_hash: HASH_44,
        },
        detail:
          /proofArtifactHash must not use multiple aliases in manifest: proof_artifact_hash, proofArtifactHash/u,
      },
      {
        name: "same-valued native prover bundle hash aliases",
        manifest: {
          ...readyProverManifest(),
          native_evm_prover_bundle_hash: HASH_99,
        },
        detail:
          /nativeEvmProverBundleHash must not use multiple aliases in manifest/u,
      },
      {
        name: "same-valued deployment address aliases",
        manifest: {
          ...readyProverManifest(),
          deployment: {
            ...readyProverManifest().deployment,
            bridge_address: BSC_BRIDGE_ADDRESS,
          },
        },
        detail:
          /bridgeAddress must not use multiple aliases in manifest\.deployment: bridgeAddress, bridge_address/u,
      },
      {
        name: "same-valued deployment destination binding aliases",
        manifest: {
          ...readyProverManifest(),
          deployment: {
            ...readyProverManifest().deployment,
            destination_binding_hash: HASH_33,
          },
        },
        detail:
          /destinationBindingHash must not use multiple aliases in manifest\.deployment/u,
      },
      {
        name: "stale post-deploy canary evidence",
        manifest: {
          ...readyProverManifest(),
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_55}`,
          },
        },
        detail:
          /postDeployLiveEvidence\.routeCanaryExplorerUrl.*does not match route evidence/u,
      },
      {
        name: "conflicting nested post-deploy canary evidence",
        manifest: {
          ...readyProverManifest(),
          routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_55}`,
          },
        },
        detail:
          /postDeployLiveEvidence\.routeCanaryExplorerUrl.*does not match route evidence/u,
      },
      {
        name: "same-valued post-deploy full TOML readiness aliases",
        manifest: {
          ...readyProverManifest(),
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            full_toml_ready: true,
          },
        },
        detail:
          /postDeployLiveEvidence\.fullTomlReady must not use multiple aliases in manifest\.postDeployLiveEvidence/u,
      },
      {
        name: "missing post-deploy offline full TOML hash",
        manifest: {
          ...readyProverManifest(),
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            offlineFullTomlSha256: undefined,
          },
        },
        detail: /postDeployLiveEvidence\.offlineFullTomlSha256 is missing/u,
      },
      {
        name: "same-valued post-deploy canary URL aliases",
        manifest: {
          ...readyProverManifest(),
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            route_canary_explorer_url: ROUTE_CANARY_EXPLORER_URL,
          },
        },
        detail:
          /postDeployLiveEvidence\.routeCanaryExplorerUrl must not use multiple aliases in manifest\.postDeployLiveEvidence/u,
      },
      {
        name: "unsupported top-level sidecar field",
        manifest: {
          ...readyProverManifest(),
          customData: {
            operator: "do-not-leak-top-level-sidecar-value",
          },
        },
        detail: /manifest contains unsupported field customData/u,
        forbidden: ["do-not-leak-top-level-sidecar-value"],
      },
      {
        name: "unsupported legacy alias sidecar container",
        manifest: {
          ...readyProverManifest(),
          artifacts: {
            proofArtifactHash: HASH_44,
          },
        },
        detail: /manifest contains unsupported field artifacts/u,
      },
      {
        name: "unsupported deployment sidecar field",
        manifest: {
          ...readyProverManifest(),
          deployment: {
            ...readyProverManifest().deployment,
            customData: {
              operator: "do-not-leak-deployment-sidecar-value",
            },
          },
        },
        detail: /manifest\.deployment contains unsupported field customData/u,
        forbidden: ["do-not-leak-deployment-sidecar-value"],
      },
      {
        name: "unsupported post-deploy sidecar field",
        manifest: {
          ...readyProverManifest(),
          postDeployLiveEvidence: {
            ...readyProverManifest().postDeployLiveEvidence,
            customData: {
              operator: "do-not-leak-post-deploy-sidecar-value",
            },
          },
        },
        detail:
          /manifest\.postDeployLiveEvidence contains unsupported field customData/u,
        forbidden: ["do-not-leak-post-deploy-sidecar-value"],
      },
      {
        name: "secret-looking field",
        manifest: {
          ...readyProverManifest(),
          privateKey: "do-not-serialize",
          apiKey: "do-not-serialize-api-key",
        },
        detail: /manifest contains secret-like material/u,
        forbidden: ["privateKey", "apiKey", "do-not-serialize-api-key"],
      },
      {
        name: "assignment-shaped secret string",
        manifest: {
          ...readyProverManifest(),
          auditNotes:
            "operator privateKey=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface bearerToken=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
        },
        detail: /manifest contains secret-like material/u,
        forbidden: ["privateKey=", "bearerToken=", "feedfacefeedface"],
      },
      {
        name: "bearer-token-shaped secret string",
        manifest: {
          ...readyProverManifest(),
          auditNotes: "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
        },
        detail: /manifest contains secret-like material/u,
        forbidden: ["Bearer", "mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l"],
      },
      {
        name: "diagnostic verifier warning",
        manifest: {
          ...readyProverManifest(),
          warnings: ["diagnostic verifier material is not production-ready"],
        },
        detail: /manifest still carries diagnostic verifier material/u,
      },
      {
        name: "top-level diagnostic verifier key hash",
        manifest: {
          ...readyProverManifest(),
          verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
        },
        detail: /manifest carries diagnostic verifier key hash/u,
      },
      {
        name: "nested diagnostic verifier key hash alias",
        manifest: {
          ...readyProverManifest(),
          readback: {
            bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        },
        detail: /manifest carries diagnostic verifier key hash/u,
        forbidden: ["bridgeVerifierKeyHash"],
      },
      {
        name: "top-level smoke-test verifier material",
        manifest: {
          ...readyProverManifest(),
          verifierMaterial: {
            alpha1: SMOKE_FIXTURE_G1,
            beta2: SMOKE_FIXTURE_G2,
            gamma2: SMOKE_FIXTURE_G2,
            delta2: SMOKE_FIXTURE_G2,
            ic: SMOKE_FIXTURE_IC,
          },
        },
        detail: /manifest still carries smoke-test verifier material/u,
      },
      {
        name: "nested smoke-test verifier material",
        manifest: {
          ...readyProverManifest(),
          artifacts: {
            ...readyProverManifest().artifacts,
            verifierMaterial: {
              alpha1: SMOKE_FIXTURE_G1,
              beta2: SMOKE_FIXTURE_G2,
              gamma2: SMOKE_FIXTURE_G2,
              delta2: SMOKE_FIXTURE_G2,
              ic: SMOKE_FIXTURE_IC,
            },
          },
        },
        detail: /manifest still carries smoke-test verifier material/u,
      },
      {
        name: "top-level invalid G1 verifier material",
        manifest: {
          ...readyProverManifest(),
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            alpha1: [1, 3],
          },
        },
        detail:
          /manifest carries invalid BN254 verifier material.*BN254 G1 curve/u,
        forbidden: ["1,3"],
      },
      {
        name: "nested off-twist G2 verifier material",
        manifest: {
          ...readyProverManifest(),
          artifacts: {
            ...readyProverManifest().artifacts,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              beta2: [1, 2, 3, 4],
            },
          },
        },
        detail:
          /manifest carries invalid BN254 verifier material.*BN254 G2 twist curve/u,
        forbidden: ["1,2,3,4"],
      },
      {
        name: "nested out-of-field G2 verifier material",
        manifest: {
          ...readyProverManifest(),
          artifacts: {
            ...readyProverManifest().artifacts,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
            },
          },
        },
        detail:
          /manifest carries invalid BN254 verifier material.*BN254 field element/u,
        forbidden: [BN254_BASE_FIELD_MODULUS],
      },
      {
        name: "embedded recovery phrase",
        manifest: {
          ...readyProverManifest(),
          audit: {
            transcript: mnemonic,
          },
        },
        detail: /manifest contains secret-like material/u,
        forbidden: ["audit.transcript", "transcript"],
      },
    ];

    for (const {
      name,
      manifest,
      routeReport = readyRouteReport(),
      detail,
      forbidden = [],
    } of cases) {
      const report = validateBscSccpBrowserProverManifest({
        manifest,
        routeReport,
        moduleUrl: "/sccp-bsc-prover.js",
        expectedDirection: "destination",
        label: "TAIRA -> BSC prover",
      });
      expect(report.ok, name).toBe(false);
      expect(report.detail, name).toMatch(detail);
      expect(JSON.stringify(report), name).not.toContain("do-not-serialize");
      expect(JSON.stringify(report), name).not.toContain("abandon abandon");
      for (const value of forbidden) {
        expect(JSON.stringify(report), name).not.toContain(value);
      }
    }
  });

  it("keeps retired local browser sidecars out of readiness prover summaries", () => {
    const localOnlyManifestInspection = {
      ok: false,
      detail:
        "TAIRA -> BSC prover manifest uses retired local-only sidecar schema iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1; publish a route-bound sidecar.",
      manifestUrl: "/sccp-bsc/taira-bsc-xor-prover.js.manifest.json",
      moduleSha256: null,
      manifest: null,
    };
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      peerAuditReport: readyPeerAuditReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      sourceProverModuleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
      destinationProverModuleAvailability:
        readyDestinationProverModuleAvailability({
          moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
          moduleSha256: PROVER_MODULE_SHA256,
        }),
      sourceProverModuleAvailability: readySourceProverModuleAvailability({
        moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
        moduleSha256: PROVER_MODULE_SHA256,
      }),
      destinationProverManifestInspection: localOnlyManifestInspection,
      sourceProverManifestInspection: {
        ...localOnlyManifestInspection,
        detail:
          "BSC -> TAIRA source prover manifest uses retired local-only sidecar schema iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1; publish a route-bound sidecar.",
      },
      runtimeProverConfigInspection: {
        ...readyRuntimeProverConfigInspection(),
        detail: "Runtime config is route-bound.",
      },
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.provers.destination.manifest).toBeNull();
    expect(report.provers.source.manifest).toBeNull();
    expect(report.reasons.join("\n")).toContain(
      "retired local-only sidecar schema",
    );
    expect(report.reasons.join("\n")).not.toContain("routeId must be");
  });

  it("writes a reproducible BSC smoke-readiness latest.json report", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-report-"));
    try {
      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport: readyRouteReport(),
        walletConnectProjectId: "",
        destinationProverModuleUrl: "",
        sourceProverModuleUrl: "",
        checkedAt: "2026-06-05T00:00:00.000Z",
      });

      const reportPath = await writeBscSccpLiveSmokeReadinessReport(report, {
        outputDir: tempRoot,
      });
      expect(reportPath).toBe(path.join(tempRoot, "latest.json"));
      const written = JSON.parse(await readFile(reportPath, "utf8"));
      expect(written).toMatchObject({
        ready: false,
        routeReady: true,
        checkedAt: "2026-06-05T00:00:00.000Z",
      });
      expect(JSON.stringify(written)).not.toMatch(/private|seed|mnemonic/iu);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("fails closed when route preflight or live-smoke app configuration is missing", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({
        ready: false,
        nextSteps: ["Activate BSC route manifest evidence."],
      }),
      walletConnectProjectId: "",
      destinationProverModuleUrl: "",
      sourceProverModuleUrl: "",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons).toEqual([
      "SCCP BSC route preflight is not ready.",
      "TAIRA peer config audit is not ready.",
      "WalletConnect project ID is missing.",
      "TAIRA -> BSC browser prover module URL is missing.",
      "TAIRA -> BSC browser prover manifest URL is missing.",
      "BSC -> TAIRA browser source prover module URL is missing.",
      "BSC -> TAIRA browser source prover manifest URL is missing.",
    ]);
    expect(report.nextSteps).toContain("Activate BSC route manifest evidence.");
    expect(report.nextSteps.join("\n")).toContain(
      "Set VITE_WALLETCONNECT_PROJECT_ID",
    );
    expect(report.nextSteps.join("\n")).toContain(
      "VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL",
    );
    expect(report.nextSteps.join("\n")).toContain(
      SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
    );
    expect(report.nextSteps.join("\n")).toContain(
      SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
    );
    expect(report.nextActions.map((entry) => entry.id)).toEqual([
      "refresh-bsc-route-preflight",
      "refresh-bsc-peer-config-audit",
      "configure-bsc-walletconnect",
      "publish-bsc-prover-modules",
    ]);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "configure-bsc-walletconnect",
          requiredInputs: [
            expect.objectContaining({ id: "walletconnect-project-id" }),
          ],
          blockedByChecks: ["walletconnect-project-id"],
        }),
        expect.objectContaining({
          id: "publish-bsc-prover-modules",
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({
              id: "testnet-destination-browser-prover-module",
              description: expect.stringContaining(
                SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV,
              ),
            }),
            expect.objectContaining({
              id: "testnet-source-browser-prover-module",
              description: expect.stringContaining(
                SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV,
              ),
            }),
          ]),
          blockedByChecks: [
            "destination-prover-module",
            "destination-prover-manifest",
            "source-prover-module",
            "source-prover-manifest",
          ],
        }),
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "walletconnect-project-id",
          blockedByActions: ["configure-bsc-walletconnect"],
        }),
        expect.objectContaining({
          id: "testnet-public-route-report",
          blockedByActions: ["refresh-bsc-route-preflight"],
        }),
        expect.objectContaining({
          id: "testnet-destination-browser-prover-manifest",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
        expect.objectContaining({
          id: "testnet-source-browser-prover-manifest",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
      ]),
    );
    expect(
      report.checks.find((entry) => entry.id === "destination-prover-module")
        ?.detail,
    ).toContain(
      `${SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV} (or fallback ${SCCP_BSC_PROVER_MODULE_URL_ENV})`,
    );
    expect(
      report.checks.find((entry) => entry.id === "source-prover-module")
        ?.detail,
    ).toContain(
      `${SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV} (or fallback ${SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV})`,
    );
  });

  it("uses mainnet-specific BSC prover env names in missing-input guidance", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      bscNetwork: "mainnet",
      routeReport: readyRouteReport({
        bsc: {
          network: "mainnet",
          chain: "bsc-mainnet",
          chainIdHex: "0x38",
          networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
          explorerUrl: "https://bscscan.com",
          explorerHost: "bscscan.com",
        },
        deployment: {
          ...readyRouteReport().deployment,
          networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        },
      }),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "",
      sourceProverModuleUrl: "",
    });

    const text = report.nextSteps.join("\n");
    expect(report.ready).toBe(false);
    expect(text).toContain(SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV);
    expect(text).toContain(SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV);
    expect(text).not.toContain(SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV);
    expect(text).not.toContain(SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV);
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "mainnet-destination-browser-prover-module",
          description: expect.stringContaining(
            SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
          ),
        }),
        expect.objectContaining({
          id: "mainnet-source-browser-prover-module",
          description: expect.stringContaining(
            SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
          ),
        }),
      ]),
    );
  });

  it("reports a correctly bound disabled BSC route as not ready, not as the wrong route", () => {
    const checks = REQUIRED_ROUTE_CHECK_IDS.map((id) => ({
      id,
      ok: id !== "bsc-production-ready",
      message: `${id} ready`,
      detail:
        id === "bsc-production-ready"
          ? "BSC verifier material is diagnostic and must be replaced before production readiness."
          : undefined,
    }));
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({
        ready: false,
        deployment: {
          ...readyRouteReport().deployment,
          proofArtifactHash: null,
          provingKeyHash: null,
        },
        checks,
      }),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
    });

    const detail = report.checks.find(
      (entry) => entry.id === "route-preflight",
    )?.detail;
    expect(report.routeReady).toBe(false);
    expect(report.reasons).toContain("SCCP BSC route preflight is not ready.");
    expect(report.reasons).not.toContain(
      "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
    );
    expect(detail).toContain("Route preflight is not ready:");
    expect(detail).toContain("bsc-production-ready");
    expect(detail).toContain("proofArtifactHash is missing");
    expect(detail).not.toContain("not bound to taira_bsc_xor/xor");
  });

  it("does not treat a local manifest-file route preflight as public live-smoke readiness", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({ manifestSource: "file" }),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.routeReady).toBe(false);
    expect(report.route?.manifestSource).toBe("file");
    expect(
      report.checks.find((entry) => entry.id === "route-preflight")?.detail,
    ).toContain("public TAIRA route publication is not proven");
  });

  it("rejects unsafe WalletConnect identifiers and browser prover module URLs", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: "https://walletconnect.example",
      destinationProverModuleUrl: "https://user:pass@cdn.example.invalid/p.js",
      sourceProverModuleUrl:
        "http://cdn.example.invalid/source.js?token=secret",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toContain("opaque identifier");
    expect(report.reasons.join("\n")).toContain("credentials");
    expect(report.reasons.join("\n")).toContain("query strings or fragments");
  });

  it("rejects placeholder BSC WalletConnect project IDs before live smoke", () => {
    expect(
      normalizeBscWalletConnectProjectId(` ${VALID_WALLETCONNECT_PROJECT_ID} `),
    ).toBe(VALID_WALLETCONNECT_PROJECT_ID);

    for (const projectId of [
      "project_123",
      "test-project",
      "demo.walletconnect",
      "placeholder-walletconnect-project-id",
      "walletconnect-project-id",
      "<walletconnect-project-id>",
      "replace-me-walletconnect-id",
      "todo-walletconnect-project-id",
      "00000000000000000000000000000000",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ]) {
      expect(() => normalizeBscWalletConnectProjectId(projectId)).toThrow(
        /production project ID/u,
      );

      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport: readyRouteReport(),
        walletConnectProjectId: projectId,
        destinationProverModuleUrl: "/sccp-bsc-prover.js",
        sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "walletconnect-project-id"),
      ).toMatchObject({
        status: "fail",
        detail:
          "BSC WalletConnect project ID must be a production project ID, not placeholder, diagnostic, or test-only material.",
      });
      expect(report.reasons).toContain(
        "BSC WalletConnect project ID must be a production project ID, not placeholder, diagnostic, or test-only material.",
      );
    }
  });

  it("rejects parent-directory BSC prover module paths before live smoke", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "../sccp-bsc-prover.js",
      sourceProverModuleUrl:
        "https://cdn.example.invalid/provers/%2e%2e/source.js",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toContain(
      "TAIRA -> BSC prover module URL must not include parent directory segments.",
    );
    expect(report.reasons.join("\n")).toContain(
      "BSC -> TAIRA source prover module URL must not include parent directory segments.",
    );
  });

  it("rejects over-encoded parent-directory BSC prover module paths before live smoke", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc/%252525252e%252525252e/prover.js",
      sourceProverModuleUrl:
        "https://cdn.example.invalid/provers/%252525252e%252525252e/source.js",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons.join("\n")).toContain(
      "TAIRA -> BSC prover module URL must not include parent directory segments.",
    );
    expect(report.reasons.join("\n")).toContain(
      "BSC -> TAIRA source prover module URL must not include parent directory segments.",
    );
  });

  it("does not treat the destination prover URL as an implicit source prover", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport(),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "",
    });

    expect(report.ready).toBe(false);
    expect(report.reasons).toContain(
      "BSC -> TAIRA browser source prover module URL is missing.",
    );
  });

  it("rejects route reports that are not bound to TAIRA/BSC XOR or are missing required live checks", () => {
    const cases = [
      {
        name: "wrong route and asset",
        routeReport: readyRouteReport({
          routeId: "taira_bsc_usdt",
          assetKey: "usdt",
        }),
        detail: "expected route taira_bsc_xor/xor",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "wrong TAIRA chain",
        routeReport: readyRouteReport({
          taira: {
            chainId: "00000000-0000-0000-0000-000000000000",
            networkPrefix: 753,
          },
        }),
        detail: "not bound to the TAIRA testnet chain",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "BSC mainnet route binding",
        routeReport: readyRouteReport({
          bsc: {
            chainIdHex: "0x38",
            networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
          },
        }),
        detail: "not bound to BSC testnet network id 97",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "BSC network label drift",
        routeReport: readyRouteReport({
          bsc: {
            ...readyRouteReport().bsc,
            network: "mainnet",
          },
        }),
        detail: "not bound to BSC testnet network label testnet",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "BSC chain label drift",
        routeReport: readyRouteReport({
          bsc: {
            ...readyRouteReport().bsc,
            chain: "bsc-mainnet",
          },
        }),
        detail: "not bound to BSC testnet chain bsc-testnet",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "BSC mainnet deployment binding",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
          },
        }),
        detail: "networkIdHex must be the BSC testnet network id",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "missing live evidence check",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-post-deploy-live-evidence",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-post-deploy-live-evidence preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC manifest secret scan",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-manifest-secret-scan",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-manifest-secret-scan preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC production disabled conflict check",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-production-disabled-conflict",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail:
          "bsc-production-disabled-conflict preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC chain-id check",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-testnet-chain-id",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-testnet-chain-id preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC production verifier material check",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-production-verifier-material",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail:
          "bsc-production-verifier-material preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC contract readback",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-contract-readback",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-contract-readback preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing raw verifier key hash readback",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-verifier-key-hash-readback",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-verifier-key-hash-readback preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "missing BSC preflight runbook contract",
        routeReport: readyRouteReport({
          checks: REQUIRED_ROUTE_CHECK_IDS.filter(
            (id) => id !== "bsc-preflight-runbook-contract",
          ).map((id) => ({ id, ok: true, message: `${id} ready` })),
        }),
        detail: "bsc-preflight-runbook-contract preflight check has not passed",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "zero verifier",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            verifierAddress: "0x0000000000000000000000000000000000000000",
          },
        }),
        detail: "verifierAddress must be a non-zero EVM address",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "duplicate BSC contract addresses",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            tokenAddress: BSC_BRIDGE_ADDRESS,
          },
        }),
        detail:
          "bridgeAddress, tokenAddress, sourceBridgeAddress, and verifierAddress must be distinct",
        reason: "SCCP route preflight report is not bound to TAIRA/BSC XOR.",
      },
      {
        name: "proof and proving key hash reuse",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: HASH_44,
          },
        }),
        detail: "provingKeyHash must not equal proofArtifactHash",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "secret route report extension",
        routeReport: readyRouteReport({
          privateKey: "do-not-serialize",
          apiKey: "do-not-serialize-api-key",
        }),
        detail: "route report contains secret-like material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "assignment-shaped secret route report extension",
        routeReport: readyRouteReport({
          auditNotes:
            "operator privateKey=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface authToken=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
        }),
        detail: "route report contains secret-like material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "bearer-token-shaped secret route report extension",
        routeReport: readyRouteReport({
          auditNotes: "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
        }),
        detail: "route report contains secret-like material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "diagnostic route report extension",
        routeReport: readyRouteReport({
          warnings: ["diagnostic verifier material was accepted upstream"],
        }),
        detail: "route report still carries diagnostic verifier material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "diagnostic verifier key hash route report extension",
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
        detail: "route report carries diagnostic verifier key hash",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "nested diagnostic verifier key hash route report alias",
        routeReport: readyRouteReport({
          readback: {
            bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
        detail: "route report carries diagnostic verifier key hash",
        reason: "SCCP BSC route preflight is not ready.",
        forbidden: ["bridgeVerifierKeyHash"],
      },
      {
        name: "top-level smoke-test verifier route report extension",
        routeReport: readyRouteReport({
          verifierMaterial: {
            alpha1: SMOKE_FIXTURE_G1,
            beta2: SMOKE_FIXTURE_G2,
            gamma2: SMOKE_FIXTURE_G2,
            delta2: SMOKE_FIXTURE_G2,
            ic: SMOKE_FIXTURE_IC,
          },
        }),
        detail: "route report still carries smoke-test verifier material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "nested smoke-test verifier route report extension",
        routeReport: readyRouteReport({
          route: {
            verifierMaterial: {
              alpha1: SMOKE_FIXTURE_G1,
              beta2: SMOKE_FIXTURE_G2,
              gamma2: SMOKE_FIXTURE_G2,
              delta2: SMOKE_FIXTURE_G2,
              ic: SMOKE_FIXTURE_IC,
            },
          },
        }),
        detail: "route report still carries smoke-test verifier material",
        reason: "SCCP BSC route preflight is not ready.",
      },
      {
        name: "top-level invalid G1 verifier route report extension",
        routeReport: readyRouteReport({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            alpha1: [1, 3],
          },
        }),
        detail: "route report carries invalid BN254 verifier material",
        reason: "SCCP BSC route preflight is not ready.",
        forbidden: ["1,3"],
      },
      {
        name: "nested off-twist G2 verifier route report extension",
        routeReport: readyRouteReport({
          route: {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              beta2: [1, 2, 3, 4],
            },
          },
        }),
        detail: "route report carries invalid BN254 verifier material",
        reason: "SCCP BSC route preflight is not ready.",
        forbidden: ["1,2,3,4"],
      },
      {
        name: "nested out-of-field G2 verifier route report extension",
        routeReport: readyRouteReport({
          artifacts: {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
            },
          },
        }),
        detail: "route report carries invalid BN254 verifier material",
        reason: "SCCP BSC route preflight is not ready.",
        forbidden: [BN254_BASE_FIELD_MODULUS],
      },
    ];

    for (const { name, routeReport, detail, reason, forbidden = [] } of cases) {
      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport,
        peerAuditReport: readyPeerAuditReport(),
        walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
        destinationProverModuleUrl: "/sccp-bsc-prover.js",
        sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
        checkedAt: "2026-06-05T00:00:00.000Z",
      });

      expect(report.ready, name).toBe(false);
      expect(report.routeReady, name).toBe(false);
      expect(report.reasons, name).toContain(reason);
      expect(
        report.checks.find((entry) => entry.id === "route-preflight")?.detail,
        name,
      ).toContain(detail);
      expect(JSON.stringify(report), name).not.toContain("do-not-serialize");
      expect(JSON.stringify(report), name).not.toContain(
        "do-not-serialize-api-key",
      );
      expect(JSON.stringify(report), name).not.toContain("privateKey=");
      expect(JSON.stringify(report), name).not.toContain("authToken=");
      expect(JSON.stringify(report), name).not.toContain("feedfacefeedface");
      expect(JSON.stringify(report), name).not.toContain(
        "10857046999023057135944570762232829481370756359578518086990519993285655852781",
      );
      expect(JSON.stringify(report), name).not.toContain(
        "11559732032986387107991004021392285783925812861821192530917403151452391805634",
      );
      for (const value of forbidden) {
        expect(JSON.stringify(report), name).not.toContain(value);
      }
      expect(report.nextSteps, name).not.toEqual(SCCP_BSC_LIVE_SMOKE_STEPS);
    }
  });

  it("rejects route preflight reports with duplicate or contradictory check states", () => {
    const cases = [
      {
        name: "duplicate route check id",
        routeReport: readyRouteReport({
          checks: [
            ...readyRouteReport().checks,
            {
              id: "bsc-production-ready",
              ok: false,
              message: "forged duplicate failure",
            },
          ],
        }),
        detail: "route report check id bsc-production-ready is duplicated",
      },
      {
        name: "contradictory route check state",
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.map((entry) =>
            entry.id === "bsc-contract-readback"
              ? { ...entry, ok: false, status: "pass" }
              : entry,
          ),
        }),
        detail:
          "route report check bsc-contract-readback has contradictory ok/status",
      },
      {
        name: "route check without machine state",
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.map((entry) =>
            entry.id === "bsc-contract-readback"
              ? { id: entry.id, message: "missing machine state" }
              : entry,
          ),
        }),
        detail:
          "route report check bsc-contract-readback has no machine-readable pass/fail state",
      },
    ];

    for (const { name, routeReport, detail } of cases) {
      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport,
        peerAuditReport: readyPeerAuditReport(),
        walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
        destinationProverModuleUrl: "/sccp-bsc-prover.js",
        sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
        checkedAt: "2026-06-05T00:00:00.000Z",
      });

      expect(report.ready, name).toBe(false);
      expect(report.routeReady, name).toBe(false);
      expect(report.reasons, name).toContain(
        "SCCP BSC route preflight is not ready.",
      );
      expect(
        report.checks.find((entry) => entry.id === "route-preflight")?.detail,
        name,
      ).toContain(detail);
    }
  });

  it("rejects peer audit reports with duplicate checks or forged peer summaries", () => {
    const basePeerAudit = readyPeerAuditReport();
    const requiredInput = {
      id: "testnet-peer-config-audit-report",
      kind: "path",
      placeholder: "output/sccp-bsc-peer-config-audit/testnet/latest.json",
      description: "BSC peer audit report.",
    };
    const cases = [
      {
        name: "duplicate peer audit check id",
        peerAuditReport: readyPeerAuditReport({
          checks: [
            ...basePeerAudit.checks,
            {
              id: "peer-route-production-readiness",
              ok: false,
              message: "forged duplicate failure",
            },
          ],
        }),
        detail:
          "peer audit report check id peer-route-production-readiness is duplicated",
      },
      {
        name: "contradictory peer audit check state",
        peerAuditReport: readyPeerAuditReport({
          checks: basePeerAudit.checks.map((entry) =>
            entry.id === "peer-route-consistency"
              ? { ...entry, ok: false, status: "pass" }
              : entry,
          ),
        }),
        detail:
          "peer audit report check peer-route-consistency has contradictory ok/status",
      },
      {
        name: "missing required peer audit check",
        peerAuditReport: readyPeerAuditReport({
          checks: basePeerAudit.checks.filter(
            (entry) => entry.id !== "peer-route-burn-record-material",
          ),
        }),
        detail:
          "peer audit report is missing passing peer-route-burn-record-material check",
      },
      {
        name: "missing peer audit runbook contract",
        peerAuditReport: readyPeerAuditReport({
          checks: basePeerAudit.checks.filter(
            (entry) => entry.id !== "peer-audit-runbook-contract",
          ),
        }),
        detail:
          "peer audit report is missing passing peer-audit-runbook-contract check",
      },
      {
        name: "peer count drift",
        peerAuditReport: readyPeerAuditReport({
          peerCount: basePeerAudit.peers.length + 1,
        }),
        detail: "peer audit peerCount does not match peer summaries",
      },
      {
        name: "unready peer summary",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0 ? { ...peer, ready: false } : peer,
          ),
        }),
        detail: "peer audit peer 0 is not ready",
      },
      {
        name: "peer summary failed checks",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  failedChecks: [
                    {
                      id: "peer-route-production-readiness",
                      message: "failed",
                    },
                  ],
                }
              : peer,
          ),
        }),
        detail: "peer audit peer 0 carries failed peer checks",
      },
      {
        name: "peer burn-record material problems",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  burnRecordMaterialProblems: [
                    "peer0.toml: tairaXorBurnRecord.contractArtifactB64 is missing.",
                  ],
                }
              : peer,
          ),
        }),
        detail: "peer audit peer 0 carries invalid TAIRA burn-record material",
      },
      {
        name: "peer hash-role problems",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  hashRoleProblems: [
                    "peer0.toml: proofArtifactHash must be distinct from provingKeyHash.",
                  ],
                }
              : peer,
          ),
        }),
        detail:
          "peer audit peer 0 carries invalid BSC route hash role separation",
      },
      {
        name: "unsupported top-level peer audit field",
        peerAuditReport: readyPeerAuditReport({
          operatorOverride: true,
        }),
        detail: "peer audit report contains unsupported field operatorOverride",
      },
      {
        name: "unsupported peer audit check field",
        peerAuditReport: readyPeerAuditReport({
          checks: basePeerAudit.checks.map((entry, index) =>
            index === 0
              ? { ...entry, hiddenCheckOverride: "unreviewed" }
              : entry,
          ),
        }),
        detail:
          "peer audit check 0 contains unsupported field hiddenCheckOverride",
      },
      {
        name: "peer audit BSC network drift",
        peerAuditReport: readyPeerAuditReport({
          bscNetwork: "mainnet",
        }),
        detail: "peer audit bscNetwork does not match route preflight",
      },
      {
        name: "peer audit BSC profile drift",
        peerAuditReport: readyPeerAuditReport({
          bsc: {
            network: "testnet",
            chain: "bsc-mainnet",
            chainIdHex: "0x61",
            networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
          },
        }),
        detail: "peer audit BSC profile chain does not match route",
      },
      {
        name: "unsupported peer audit BSC profile field",
        peerAuditReport: readyPeerAuditReport({
          bsc: {
            network: "testnet",
            chain: "bsc-testnet",
            chainIdHex: "0x61",
            networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
            rpcUrl: "https://example.invalid",
          },
        }),
        detail: "peer audit BSC profile contains unsupported field rpcUrl",
      },
      {
        name: "unsupported peer summary field",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0 ? { ...peer, hiddenPeerOverride: HASH_77 } : peer,
          ),
        }),
        detail:
          "peer audit peer 0 contains unsupported field hiddenPeerOverride",
      },
      {
        name: "unsupported peer deployment field",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  deployment: {
                    ...peer.deployment,
                    hiddenDeploymentOverride: HASH_77,
                  },
                }
              : peer,
          ),
        }),
        detail:
          "peer audit peer 0 deployment contains unsupported field hiddenDeploymentOverride",
      },
      {
        name: "unsupported peer post-deploy evidence field",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  postDeployLiveEvidence: {
                    ...readyRouteReport().postDeployLiveEvidence,
                    hiddenPostDeployOverride: HASH_77,
                  },
                }
              : peer,
          ),
        }),
        detail:
          "peer audit peer 0 postDeployLiveEvidence contains unsupported field hiddenPostDeployOverride",
      },
      {
        name: "unsupported peer failed check field",
        peerAuditReport: readyPeerAuditReport({
          ready: false,
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  failedChecks: [
                    {
                      id: "peer-route-production-readiness",
                      ok: false,
                      status: "fail",
                      message: "failed",
                      hiddenFailureOverride: HASH_77,
                    },
                  ],
                }
              : peer,
          ),
        }),
        detail:
          "peer audit peer 0 failed check 0 contains unsupported field hiddenFailureOverride",
      },
      {
        name: "non-object peer audit next action",
        peerAuditReport: readyPeerAuditReport({
          nextActions: ["not-a-peer-action"],
        }),
        detail: "peer audit next action 0 is not an object",
      },
      {
        name: "non-array peer audit next actions",
        peerAuditReport: readyPeerAuditReport({
          nextActions: { 0: "not-an-array" },
        }),
        detail: "peer audit next action is not an array",
      },
      {
        name: "non-object peer audit next-action required input",
        peerAuditReport: readyPeerAuditReport({
          nextActions: [
            {
              id: "refresh-bsc-peer-config-audit",
              title: "Refresh BSC peer config audit",
              detail: "Refresh peer route publication evidence.",
              requiredInputs: [requiredInput, "not-a-required-input"],
              blockedByChecks: ["peer-config-audit"],
              commands: [
                "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
              ],
            },
          ],
        }),
        detail: "peer audit next action 0 required input 1 is not an object",
      },
      {
        name: "non-array peer audit next-action required inputs",
        peerAuditReport: readyPeerAuditReport({
          nextActions: [
            {
              id: "refresh-bsc-peer-config-audit",
              title: "Refresh BSC peer config audit",
              detail: "Refresh peer route publication evidence.",
              requiredInputs: "not-an-array",
              blockedByChecks: ["peer-config-audit"],
              commands: [
                "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
              ],
            },
          ],
        }),
        detail: "peer audit next action 0 required input is not an array",
      },
      {
        name: "incomplete peer audit next-action runbook",
        peerAuditReport: readyPeerAuditReport({
          nextActions: [
            {
              id: "refresh-bsc-peer-config-audit",
              title: "Refresh BSC peer config audit",
              detail: "Refresh peer route publication evidence.",
              requiredInputs: [],
              blockedByChecks: [],
              commands: [],
            },
          ],
        }),
        detail: "peer audit next action 0 requiredInputs is missing or empty",
      },
      {
        name: "incomplete peer audit next-action required input",
        peerAuditReport: readyPeerAuditReport({
          nextActions: [
            {
              id: "refresh-bsc-peer-config-audit",
              title: "Refresh BSC peer config audit",
              detail: "Refresh peer route publication evidence.",
              requiredInputs: [
                {
                  id: "peer-config-audit-source",
                  kind: "directory-or-remote",
                },
              ],
              blockedByChecks: ["peer-config-audit"],
              commands: [
                "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
              ],
            },
          ],
        }),
        detail:
          "peer audit next action 0 required input 0 placeholder is missing or not a non-empty string",
      },
      {
        name: "non-object peer audit missing production input",
        peerAuditReport: readyPeerAuditReport({
          missingProductionInputs: ["not-a-missing-input"],
        }),
        detail: "peer audit missing production input 0 is not an object",
      },
      {
        name: "non-array peer audit missing production inputs",
        peerAuditReport: readyPeerAuditReport({
          missingProductionInputs: "not-an-array",
        }),
        detail: "peer audit missing production input is not an array",
      },
      {
        name: "incomplete peer audit missing production input",
        peerAuditReport: readyPeerAuditReport({
          missingProductionInputs: [
            {
              id: "peer-config-audit-source",
              kind: "directory-or-remote",
            },
          ],
        }),
        detail:
          "peer audit missing production input 0 placeholder is missing or not a non-empty string",
      },
      {
        name: "non-array peer summaries",
        peerAuditReport: readyPeerAuditReport({
          peers: "not-an-array",
        }),
        detail: "peer audit peer is not an array",
      },
      {
        name: "non-object peer failed check",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  failedChecks: ["not-a-failed-check"],
                }
              : peer,
          ),
        }),
        detail: "peer audit peer 0 failed check 0 is not an object",
      },
      {
        name: "non-array peer failed checks",
        peerAuditReport: readyPeerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  failedChecks: "not-an-array",
                }
              : peer,
          ),
        }),
        detail: "peer audit peer 0 failed check is not an array",
      },
    ];

    for (const { name, peerAuditReport, detail } of cases) {
      const report = evaluateBscSccpLiveSmokeReadiness({
        routeReport: readyRouteReport(),
        peerAuditReport,
        walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
        destinationProverModuleUrl: "/sccp-bsc-prover.js",
        sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
        checkedAt: "2026-06-05T00:00:00.000Z",
      });

      expect(report.ready, name).toBe(false);
      expect(report.reasons, name).toContain(
        "TAIRA peer config audit is not ready.",
      );
      expect(
        report.checks.find((entry) => entry.id === "peer-config-audit")?.detail,
        name,
      ).toContain(detail);
    }
  });

  it("echoes only public route deployment fields in readiness reports", () => {
    const report = evaluateBscSccpLiveSmokeReadiness({
      routeReport: readyRouteReport({
        deployment: {
          bridgeAddress: { private_key: "nested-secret" },
          tokenAddress: BSC_TOKEN_ADDRESS,
          sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
          verifierAddress: BSC_VERIFIER_ADDRESS,
          networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
          verifierCodeHash: HASH_11,
          verifierKeyHash: HASH_22,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          nativeEvmProverBundleHash: HASH_99,
          destinationBindingHash: HASH_33,
          settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
          private_key: "top-level-secret",
          seedPhrase: "seed words must not leak",
        },
      }),
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: "/sccp-bsc-prover.js",
      sourceProverModuleUrl: "/sccp-bsc-source-prover.js",
    });

    expect(report.ready).toBe(false);
    expect(report.route?.deployment).toEqual({
      bridgeAddress: null,
      tokenAddress: BSC_TOKEN_ADDRESS,
      sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      verifierAddress: BSC_VERIFIER_ADDRESS,
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_66,
      nativeEvmProverBundleHash: HASH_99,
      destinationBindingHash: HASH_33,
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
    expect(JSON.stringify(report)).not.toContain("private_key");
    expect(JSON.stringify(report)).not.toContain("seedPhrase");
    expect(JSON.stringify(report)).not.toContain("nested-secret");
    expect(JSON.stringify(report)).not.toContain("top-level-secret");
    expect(JSON.stringify(report)).not.toContain("seed words must not leak");
  });

  it("runs the read-only BSC route preflight before evaluating live-smoke prerequisites", async () => {
    const calls = [];
    const routeManifest = readyManifest();
    const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
      validateBscTestnetNativeEvmProverBundle(
        routeManifest.nativeEvmProverBundle,
        {
          expectedDestinationBindingHash:
            routeManifest.destinationRollout.destinationBindingHash,
        },
      ),
    );
    const fetchImpl = async (url, init) => {
      const href = String(url);
      calls.push({
        href,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json({
          chainId: BSC_TAIRA_CHAIN_ID,
          networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
        });
      }
      if (href.endsWith("/sccp-bsc-prover.js.manifest.json")) {
        return Response.json(
          readyProverManifest({
            moduleUrl: DESTINATION_PROVER_MODULE_URL,
            nativeEvmProverBundleHash,
          }),
        );
      }
      if (href.endsWith("/sccp-bsc-source-prover.js.manifest.json")) {
        return Response.json(
          readyProverManifest({
            moduleUrl: SOURCE_PROVER_MODULE_URL,
            direction: "source",
            moduleSha256: SOURCE_PROVER_MODULE_SHA256,
            nativeEvmProverBundleHash,
          }),
        );
      }
      if (href.endsWith("/sccp-bsc-prover.js")) {
        return new Response(PROVER_MODULE_BYTES, { status: 200 });
      }
      if (href.endsWith("/sccp-bsc-source-prover.js")) {
        return new Response(SOURCE_PROVER_MODULE_BYTES, { status: 200 });
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [routeManifest] });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      const [firstParam] = body.params ?? [];
      const to = String(firstParam?.to ?? "").toLowerCase();
      const data = String(firstParam?.data ?? "").toLowerCase();
      let result = "0x60016000";
      if (body.method === "eth_chainId") {
        result = "0x61";
      } else if (body.method === "eth_call" && to === BSC_TOKEN_ADDRESS) {
        result =
          data === EVM_SELECTORS.bridge
            ? abiAddress(BSC_BRIDGE_ADDRESS)
            : abiBool(true);
      } else if (
        body.method === "eth_call" &&
        to === BSC_SOURCE_BRIDGE_ADDRESS
      ) {
        result = abiAddress(BSC_BRIDGE_ADDRESS);
      } else if (body.method === "eth_call" && to === BSC_BRIDGE_ADDRESS) {
        if (data === EVM_SELECTORS.destinationBindingHash) {
          result = HASH_33;
        } else if (data === EVM_SELECTORS.verifier) {
          result = abiAddress(BSC_VERIFIER_ADDRESS);
        } else if (data === EVM_SELECTORS.verifierCodeHash) {
          result = HASH_11;
        } else if (data === EVM_SELECTORS.verifierKeyHash) {
          result = HASH_22;
        } else if (data === EVM_SELECTORS.networkId) {
          result = BSC_TESTNET_NETWORK_ID_HEX;
        } else if (data === EVM_SELECTORS.expectedSourceDomain) {
          result = abiUint(0);
        } else if (data === EVM_SELECTORS.expectedTargetDomain) {
          result = abiUint(2);
        }
      } else if (body.method === "eth_call" && to === BSC_VERIFIER_ADDRESS) {
        if (data === EVM_SELECTORS.verifyingKeyHash) {
          result = HASH_22;
        }
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    };
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-peer-report-"),
    );
    const peerAuditReportPath = path.join(
      tempRoot,
      "peer-audit-default",
      "latest.json",
    );
    await mkdir(path.dirname(peerAuditReportPath), { recursive: true });
    await writeFile(
      peerAuditReportPath,
      JSON.stringify(
        readyPeerAuditReport({
          peers: readyPeerAuditReport().peers.map((peer) => ({
            ...peer,
            deployment: {
              ...peer.deployment,
              nativeEvmProverBundleHash,
            },
          })),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditDefaultReportPath: peerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(
      report.ready,
      JSON.stringify(
        { reasons: report.reasons, checks: report.checks },
        null,
        2,
      ),
    ).toBe(true);
    expect(report.peerAudit?.ready).toBe(true);
    expect(report.peerAudit?.peerCount).toBe(4);
    expect(calls.map((call) => call.method)).toEqual([
      "GET",
      "GET",
      "GET",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "POST",
      "GET",
      "GET",
      "GET",
      "GET",
    ]);
    expect(
      calls
        .filter((call) => call.method === "GET")
        .map((call) => new URL(call.href).pathname),
    ).toEqual([
      "/v1/chain/metadata",
      "/v1/sccp/capabilities",
      "/v1/sccp/manifests",
      "/sccp-bsc-prover.js.manifest.json",
      "/sccp-bsc-source-prover.js.manifest.json",
      "/sccp-bsc-prover.js",
      "/sccp-bsc-source-prover.js",
    ]);
    expect(calls.some((call) => call.href.includes("/wallet/broadcast"))).toBe(
      false,
    );

    const symlinkedPeerAuditReportPath = path.join(
      tempRoot,
      "peer-audit-link.json",
    );
    await symlink(peerAuditReportPath, symlinkedPeerAuditReportPath);
    const symlinkedReport = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditReportPath: symlinkedPeerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(symlinkedReport.ready).toBe(false);
    expect(
      symlinkedReport.checks.find((entry) => entry.id === "peer-config-audit")
        ?.detail,
    ).toMatch(/symbolic link/u);

    const defaultSymlinkedReport = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditDefaultReportPath: symlinkedPeerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(defaultSymlinkedReport.ready).toBe(false);
    expect(
      defaultSymlinkedReport.checks.find(
        (entry) => entry.id === "peer-config-audit",
      )?.detail,
    ).toMatch(/symbolic link/u);

    const oversizedPeerAuditReportPath = path.join(
      tempRoot,
      "peer-audit-oversized.json",
    );
    await writeFile(
      oversizedPeerAuditReportPath,
      JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
      "utf8",
    );
    const oversizedReport = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditReportPath: oversizedPeerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(oversizedReport.ready).toBe(false);
    expect(
      oversizedReport.checks.find((entry) => entry.id === "peer-config-audit")
        ?.detail,
    ).toMatch(/maximum allowed/u);

    const nonObjectPeerAuditReportPath = path.join(
      tempRoot,
      "peer-audit-array.json",
    );
    await writeFile(nonObjectPeerAuditReportPath, JSON.stringify([]), "utf8");
    const nonObjectReport = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditReportPath: nonObjectPeerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(nonObjectReport.ready).toBe(false);
    expect(
      nonObjectReport.checks.find((entry) => entry.id === "peer-config-audit")
        ?.detail,
    ).toMatch(/JSON object/u);

    const duplicatePeerAuditReportPath = path.join(
      tempRoot,
      "peer-audit-duplicate-ready.json",
    );
    await writeFile(
      duplicatePeerAuditReportPath,
      `${JSON.stringify(readyPeerAuditReport(), null, 2).replace(
        '"ready": true,',
        '"ready": false,\n  "ready": true,',
      )}\n`,
      "utf8",
    );
    const duplicateKeyReport = await runBscSccpLiveSmokeReadiness({
      toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
      peerAuditReportPath: duplicatePeerAuditReportPath,
      fetchImpl,
      timeoutMs: 1000,
      walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
      destinationProverModuleUrl: DESTINATION_PROVER_MODULE_URL,
      sourceProverModuleUrl: SOURCE_PROVER_MODULE_URL,
      checkedAt: "2026-06-05T00:00:00.000Z",
    });

    expect(duplicateKeyReport.ready).toBe(false);
    expect(
      duplicateKeyReport.checks.find(
        (entry) => entry.id === "peer-config-audit",
      )?.detail,
    ).toMatch(/duplicate JSON object key/u);
    expect(JSON.stringify(duplicateKeyReport)).not.toContain('"ready":true');
  });

  it("prefers profile-specific BSC smoke env over hostile generic prover env", async () => {
    const calls = [];
    const destinationModuleUrl = PROFILE_DESTINATION_PROVER_MODULE_URL;
    const sourceModuleUrl = PROFILE_SOURCE_PROVER_MODULE_URL;
    const destinationManifestUrl = PROFILE_DESTINATION_PROVER_MANIFEST_URL;
    const sourceManifestUrl = PROFILE_SOURCE_PROVER_MANIFEST_URL;
    const routeManifest = readyManifest({
      destinationBrowserProver: {
        moduleUrl: destinationModuleUrl,
        moduleHash: PROVER_MODULE_SHA256,
        manifestHash: HASH_11,
        expectedExports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
        boundRouteHash: HASH_33,
        boundProofHash: HASH_44,
      },
      sourceBrowserProver: {
        moduleUrl: sourceModuleUrl,
        moduleHash: SOURCE_PROVER_MODULE_SHA256,
        manifestHash: HASH_22,
        expectedExports: [
          "bscSccpSourceProve",
          "bscSccpSourceNativeProverSelfTest",
        ],
        boundRouteHash: HASH_33,
        boundProofHash: HASH_44,
      },
    });
    const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
      validateBscTestnetNativeEvmProverBundle(
        routeManifest.nativeEvmProverBundle,
        {
          expectedDestinationBindingHash:
            routeManifest.destinationRollout.destinationBindingHash,
        },
      ),
    );
    const fetchImpl = async (url, init) => {
      const href = String(url);
      if (href.includes("generic-")) {
        throw new Error(`generic BSC prover URL must not be fetched: ${href}`);
      }
      calls.push({
        href,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json({
          chainId: BSC_TAIRA_CHAIN_ID,
          networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
        });
      }
      if (href === destinationManifestUrl) {
        return Response.json(
          readyProverManifest({
            moduleUrl: destinationModuleUrl,
            nativeEvmProverBundleHash,
          }),
        );
      }
      if (href === sourceManifestUrl) {
        return Response.json(
          readyProverManifest({
            moduleUrl: sourceModuleUrl,
            direction: "source",
            moduleSha256: SOURCE_PROVER_MODULE_SHA256,
            nativeEvmProverBundleHash,
          }),
        );
      }
      if (href === destinationModuleUrl) {
        return new Response(PROVER_MODULE_BYTES, { status: 200 });
      }
      if (href === sourceModuleUrl) {
        return new Response(SOURCE_PROVER_MODULE_BYTES, { status: 200 });
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [routeManifest] });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      const [firstParam] = body.params ?? [];
      const to = String(firstParam?.to ?? "").toLowerCase();
      const data = String(firstParam?.data ?? "").toLowerCase();
      let result = "0x60016000";
      if (body.method === "eth_chainId") {
        result = "0x61";
      } else if (body.method === "eth_call" && to === BSC_TOKEN_ADDRESS) {
        result =
          data === EVM_SELECTORS.bridge
            ? abiAddress(BSC_BRIDGE_ADDRESS)
            : abiBool(true);
      } else if (
        body.method === "eth_call" &&
        to === BSC_SOURCE_BRIDGE_ADDRESS
      ) {
        result = abiAddress(BSC_BRIDGE_ADDRESS);
      } else if (body.method === "eth_call" && to === BSC_BRIDGE_ADDRESS) {
        if (data === EVM_SELECTORS.destinationBindingHash) {
          result = HASH_33;
        } else if (data === EVM_SELECTORS.verifier) {
          result = abiAddress(BSC_VERIFIER_ADDRESS);
        } else if (data === EVM_SELECTORS.verifierCodeHash) {
          result = HASH_11;
        } else if (data === EVM_SELECTORS.verifierKeyHash) {
          result = HASH_22;
        } else if (data === EVM_SELECTORS.networkId) {
          result = BSC_TESTNET_NETWORK_ID_HEX;
        } else if (data === EVM_SELECTORS.expectedSourceDomain) {
          result = abiUint(0);
        } else if (data === EVM_SELECTORS.expectedTargetDomain) {
          result = abiUint(2);
        }
      } else if (body.method === "eth_call" && to === BSC_VERIFIER_ADDRESS) {
        if (data === EVM_SELECTORS.verifyingKeyHash) {
          result = HASH_22;
        }
      }
      return Response.json({ jsonrpc: "2.0", id: body.id, result });
    };
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-profile-env-"),
    );
    const peerAuditReportPath = path.join(tempRoot, "peer-audit.json");
    await writeFile(
      peerAuditReportPath,
      JSON.stringify(
        readyPeerAuditReport({
          peers: readyPeerAuditReport().peers.map((peer) => ({
            ...peer,
            deployment: {
              ...peer.deployment,
              nativeEvmProverBundleHash,
            },
          })),
        }),
      ),
      "utf8",
    );

    try {
      const report = await withEnv(
        {
          [SCCP_BSC_PROVER_MODULE_URL_ENV]:
            "https://user:pass@cdn.example.invalid/generic-destination.js?token=secret",
          [SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV]:
            "http://cdn.example.invalid/generic-source.js?token=secret",
          [SCCP_BSC_PROVER_MANIFEST_URL_ENV]:
            "https://user:pass@cdn.example.invalid/generic-destination.manifest.json",
          [SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV]:
            "https://cdn.example.invalid/generic-source.manifest.json?token=secret",
          [SCCP_BSC_TESTNET_PROVER_MODULE_URL_ENV]: destinationModuleUrl,
          [SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL_ENV]: sourceModuleUrl,
          [SCCP_BSC_TESTNET_PROVER_MANIFEST_URL_ENV]: destinationManifestUrl,
          [SCCP_BSC_TESTNET_SOURCE_PROVER_MANIFEST_URL_ENV]: sourceManifestUrl,
        },
        () =>
          runBscSccpLiveSmokeReadiness({
            toriiUrl: DEFAULT_BSC_TAIRA_TORII_URL,
            peerAuditReportPath,
            fetchImpl,
            timeoutMs: 1000,
            walletConnectProjectId: VALID_WALLETCONNECT_PROJECT_ID,
            checkedAt: "2026-06-05T00:00:00.000Z",
          }),
      );

      expect(
        report.ready,
        JSON.stringify(
          { reasons: report.reasons, checks: report.checks },
          null,
          2,
        ),
      ).toBe(true);
      expect(report.provers.destination.moduleUrl).toBe(destinationModuleUrl);
      expect(report.provers.destination.manifestUrl).toBe(
        destinationManifestUrl,
      );
      expect(report.provers.source.moduleUrl).toBe(sourceModuleUrl);
      expect(report.provers.source.manifestUrl).toBe(sourceManifestUrl);
      const fetched = calls.map((call) => call.href);
      expect(fetched).toContain(destinationManifestUrl);
      expect(fetched).toContain(sourceManifestUrl);
      expect(fetched).toContain(destinationModuleUrl);
      expect(fetched).toContain(sourceModuleUrl);
      expect(fetched.join("\n")).not.toContain("generic-");
      expect(fetched.join("\n")).not.toContain("token=secret");
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });
});
