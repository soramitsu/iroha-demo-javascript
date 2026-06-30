import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
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
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import {
  BSC_MAINNET_CHAIN_ID_HEX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_TESTNET_CHAIN_ID_HEX,
  BSC_TESTNET_NETWORK_ID_HEX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import {
  BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS,
  BSC_PROVER_SIDECAR_REQUIRED_ROUTE_CHECK_IDS,
  buildBscSccpBrowserProverManifest,
  defaultBscProverManifestOutputPath,
  requiredBscProverSidecarRouteCheckIds,
  resolveBscProverManifestOutputPath,
  resolveLocalBscProverModulePath,
  writeBscSccpBrowserProverManifest,
} from "../scripts/e2e/sccp-bsc-prover-manifest.mjs";
import {
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  validateBscSccpBrowserProverManifest,
} from "../scripts/e2e/sccp-bsc-live-smoke-readiness.mjs";

const repoRoot = path.resolve(".");
const execFileAsync = promisify(execFile);
const HASH_11 = `0x${"11".repeat(32)}`;
const HASH_22 = `0x${"22".repeat(32)}`;
const HASH_33 = `0x${"33".repeat(32)}`;
const HASH_44 = `0x${"44".repeat(32)}`;
const HASH_55 = `0x${"55".repeat(32)}`;
const HASH_66 = `0x${"66".repeat(32)}`;
const HASH_77 = `0x${"77".repeat(32)}`;
const HASH_88 = `0x${"88".repeat(32)}`;
const HASH_99 = `0x${"99".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;
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
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
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
const fixtureAddress = (label) =>
  `0x${createHash("sha256")
    .update(Buffer.from(label, "utf8"))
    .digest("hex")
    .slice(0, 40)}`;
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc prover manifest bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc prover manifest token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc prover manifest source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc prover manifest verifier");
const BSC_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    chain: "bsc-testnet",
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    explorerUrl: "https://testnet.bscscan.com",
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    explorerUrl: "https://bscscan.com",
  }),
});
const sourceEventExplorerUrl = (profile) =>
  `${profile.explorerUrl}/tx/${HASH_55}`;
const routeCanaryExplorerUrl = (profile) =>
  `${profile.explorerUrl}/tx/${HASH_77}`;
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

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

const routeCheckIds = (profile = BSC_PROFILES.testnet) =>
  requiredBscProverSidecarRouteCheckIds(profile);

const readyRouteReport = (overrides = {}, profile = BSC_PROFILES.testnet) => ({
  ready: true,
  manifestSource: "torii",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  taira: {
    chainId: BSC_TAIRA_CHAIN_ID,
    networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
  },
  bsc: {
    network: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
  },
  deployment: {
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    tokenAddress: BSC_TOKEN_ADDRESS,
    sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    networkIdHex: profile.networkIdHex,
    verifierCodeHash: HASH_11,
    verifierKeyHash: HASH_22,
    proofArtifactHash: HASH_44,
    provingKeyHash: HASH_55,
    nativeEvmProverBundleHash: HASH_99,
    destinationBindingHash: HASH_33,
    settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    sourceEventExplorerUrl: sourceEventExplorerUrl(profile),
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: HASH_77,
    routeCanaryExplorerUrl: routeCanaryExplorerUrl(profile),
    offlineFullTomlSha256: HASH_88,
  },
  checks: routeCheckIds(profile).map((id) => ({
    id,
    ok: true,
    message: `${id} ready`,
  })),
  ...overrides,
});

const sidecarBootstrapRouteReport = (
  overrides = {},
  profile = BSC_PROFILES.testnet,
) => {
  const allowed = new Set(
    BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS,
  );
  return readyRouteReport(
    {
      ready: false,
      checks: routeCheckIds(profile).map((id) => ({
        id,
        ok: !allowed.has(id),
        message: allowed.has(id)
          ? `${id} waiting for browser prover sidecar`
          : `${id} ready`,
      })),
      ...overrides,
    },
    profile,
  );
};

describe("BSC SCCP browser prover sidecar generator", () => {
  it("uses profile-specific required preflight checks for sidecar generation", () => {
    expect(routeCheckIds(BSC_PROFILES.testnet)).toEqual(
      BSC_PROVER_SIDECAR_REQUIRED_ROUTE_CHECK_IDS,
    );
    expect(BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS).toEqual(
      [
        "bsc-production-ready",
        "bsc-destination-browser-prover",
        "bsc-source-browser-prover",
      ],
    );
    expect(routeCheckIds(BSC_PROFILES.mainnet)).toContain(
      "bsc-mainnet-chain-id",
    );
    expect(routeCheckIds(BSC_PROFILES.mainnet)).toContain(
      "bsc-mainnet-network-id",
    );
    expect(routeCheckIds(BSC_PROFILES.mainnet)).not.toContain(
      "bsc-testnet-chain-id",
    );
    expect(routeCheckIds(BSC_PROFILES.mainnet)).not.toContain(
      "bsc-testnet-network-id",
    );
  });

  it("does not invoke accessor-backed prover module path option fields", () => {
    const rootGetter = vi.fn(() => {
      throw new Error("root getter should not run");
    });
    const options = {};
    Object.defineProperty(options, "root", {
      configurable: true,
      enumerable: true,
      get: rootGetter,
    });

    expect(
      resolveLocalBscProverModulePath("/sccp-bsc-prover.js", options),
    ).toMatchObject({
      modulePath: path.join(repoRoot, "public", "sccp-bsc-prover.js"),
    });
    expect(
      defaultBscProverManifestOutputPath("/sccp-bsc-prover.js", options),
    ).toBe(path.join(repoRoot, "public", "sccp-bsc-prover.js.manifest.json"));
    expect(rootGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed top-level prover manifest option fields", async () => {
    const getters = new Map(
      [
        "routeReport",
        "bscNetwork",
        "moduleUrl",
        "moduleBytes",
        "direction",
        "exportNames",
        "outputPath",
        "root",
        "maxBytes",
      ].map((key) => [
        key,
        vi.fn(() => {
          throw new Error(`${key} getter should not run`);
        }),
      ]),
    );
    const input = {};
    for (const [key, getter] of getters) {
      Object.defineProperty(input, key, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    expect(() => buildBscSccpBrowserProverManifest(input)).toThrow(
      /BSC route report must be a JSON object/u,
    );
    await expect(writeBscSccpBrowserProverManifest(input)).rejects.toThrow(
      /BSC prover module URL is required/u,
    );
    for (const getter of getters.values()) {
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("writes a deterministic destination prover sidecar from local module bytes and a ready public route report", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );

      const result = await writeBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        direction: "destination",
        root: tempRoot,
      });
      const written = JSON.parse(await readFile(result.outputPath, "utf8"));

      expect(result.outputPath).toBe(
        path.join(tempRoot, "public", "sccp-bsc-prover.js.manifest.json"),
      );
      expect(written).toMatchObject({
        schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
        moduleUrl: "/sccp-bsc-prover.js",
        kind: "bsc-destination",
        direction: "taira-to-bsc",
        exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        moduleSha256: sha256Hex(PROVER_MODULE_BYTES),
        proofArtifactHash: HASH_44,
        provingKeyHash: HASH_55,
        nativeEvmProverBundleHash: HASH_99,
        boundRouteHash: HASH_33,
        boundProofHash: HASH_44,
        deployment: {
          bridgeAddress: BSC_BRIDGE_ADDRESS,
          tokenAddress: BSC_TOKEN_ADDRESS,
          sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
          verifierAddress: BSC_VERIFIER_ADDRESS,
          verifierCodeHash: HASH_11,
          verifierKeyHash: HASH_22,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_55,
          nativeEvmProverBundleHash: HASH_99,
          destinationBindingHash: HASH_33,
        },
        postDeployLiveEvidence: readyRouteReport().postDeployLiveEvidence,
      });
      expect(
        validateBscSccpBrowserProverManifest({
          manifest: written,
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          expectedDirection: "destination",
          label: "TAIRA -> BSC prover",
        }).ok,
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlinked browser prover sidecar output files before writing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-sidecar-outside-"),
    );
    try {
      const publicDir = path.join(tempRoot, "public");
      const outputPath = path.join(
        publicDir,
        "sccp-bsc-prover.js.manifest.json",
      );
      const targetPath = path.join(outside, "target.json");
      await mkdir(publicDir, { recursive: true });
      await writeFile(
        path.join(publicDir, "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );
      await writeFile(targetPath, "must-not-overwrite\n", "utf8");
      await symlink(targetPath, outputPath);

      await expect(
        writeBscSccpBrowserProverManifest({
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          direction: "destination",
          root: tempRoot,
          outputPath,
        }),
      ).rejects.toThrow(/must not be a symbolic link/u);
      await expect(readFile(targetPath, "utf8")).resolves.toBe(
        "must-not-overwrite\n",
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects browser prover sidecar output paths outside the package root", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-sidecar-outside-"),
    );
    try {
      const publicDir = path.join(tempRoot, "public");
      const escapedOutputPath = path.join(
        outside,
        "sccp-bsc-prover.js.manifest.json",
      );
      await mkdir(publicDir, { recursive: true });
      await writeFile(
        path.join(publicDir, "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );

      await expect(
        writeBscSccpBrowserProverManifest({
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          direction: "destination",
          root: tempRoot,
          outputPath: escapedOutputPath,
        }),
      ).rejects.toThrow(/must resolve inside package root/u);
      await expect(readFile(escapedOutputPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects unsafe browser prover sidecar output path syntax", () => {
    const root = "/repo";
    const cases = [
      {
        outputPath: "https://cdn.example.invalid/prover.manifest.json",
        detail: /URL or URI/u,
      },
      {
        outputPath: "public/sccp-bsc-prover.js.manifest.json?token=secret",
        detail: /query strings or fragments/u,
      },
      {
        outputPath: "public/sccp-bsc-prover.js.manifest.json#fragment",
        detail: /query strings or fragments/u,
      },
      {
        outputPath: "public/%2e%2e/prover.manifest.json",
        detail: /percent-encoded path segments/u,
      },
      {
        outputPath: "public\\prover.manifest.json",
        detail: /POSIX separators/u,
      },
      {
        outputPath: "public/./prover.manifest.json",
        detail: /current-directory/u,
      },
      {
        outputPath: "public//prover.manifest.json",
        detail: /empty/u,
      },
      {
        outputPath: "public/../prover.manifest.json",
        detail: /parent-directory/u,
      },
      {
        outputPath: "public/prover.manifest.json\u0000",
        detail: /control characters/u,
      },
    ];

    for (const { outputPath, detail } of cases) {
      expect(() =>
        resolveBscProverManifestOutputPath(outputPath, {
          root,
          moduleUrl: "/sccp-bsc-prover.js",
        }),
      ).toThrow(detail);
    }
  });

  it("rejects symlinked local prover modules before hashing sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "escaped-prover.js"),
        PROVER_MODULE_BYTES,
      );
      await symlink(
        path.join(tempRoot, "escaped-prover.js"),
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
      );

      await expect(
        writeBscSccpBrowserProverManifest({
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          direction: "destination",
          root: tempRoot,
        }),
      ).rejects.toThrow(/must not be a symbolic link/u);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects oversized local prover modules before hashing sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
        PROVER_MODULE_BYTES,
      );

      await expect(
        writeBscSccpBrowserProverManifest({
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          direction: "destination",
          root: tempRoot,
          maxBytes: PROVER_MODULE_BYTES.byteLength - 1,
        }),
      ).rejects.toThrow(/maximum allowed/u);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlinked CLI route reports before generating sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      const target = path.join(tempRoot, "route-report.target.json");
      const link = path.join(tempRoot, "route-report.json");
      await writeFile(target, JSON.stringify(readyRouteReport()), "utf8");
      await symlink(target, link);

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-prover-manifest.mjs",
            "--route-report",
            link,
            "--module-url",
            "/sccp-bsc-prover.js",
            "--direction",
            "destination",
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

  it("rejects oversized CLI route reports before generating sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
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
            "scripts/e2e/sccp-bsc-prover-manifest.mjs",
            "--route-report",
            routeReportPath,
            "--module-url",
            "/sccp-bsc-prover.js",
            "--direction",
            "destination",
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

  it("rejects non-object CLI route report JSON before generating sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      await writeFile(routeReportPath, JSON.stringify([]), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-prover-manifest.mjs",
            "--route-report",
            routeReportPath,
            "--module-url",
            "/sccp-bsc-prover.js",
            "--direction",
            "destination",
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

  it("rejects duplicate JSON object keys in CLI route reports before generating sidecars", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      await writeFile(
        routeReportPath,
        `${JSON.stringify(readyRouteReport(), null, 2).replace(
          '"ready": true,',
          '"ready": false,\n  "ready": true,',
        )}\n`,
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-prover-manifest.mjs",
            "--route-report",
            routeReportPath,
            "--module-url",
            "/sccp-bsc-prover.js",
            "--direction",
            "destination",
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

  it("rejects route reports whose valid fields are only inherited properties", () => {
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: Object.create(readyRouteReport()),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/BSC route report must be a JSON object/u);
  });

  it("ignores Object.prototype deployment evidence on route reports", () => {
    const { deployment, postDeployLiveEvidence, ...routeReport } =
      readyRouteReport();
    const pollutedEntries = [
      ["deployment", deployment],
      ["postDeployLiveEvidence", postDeployLiveEvidence],
    ];
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

      expect(() =>
        buildBscSccpBrowserProverManifest({
          routeReport,
          moduleUrl: "/sccp-bsc-prover.js",
          moduleBytes: PROVER_MODULE_BYTES,
        }),
      ).toThrow(/route deployment evidence is missing/u);
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
    }
  });

  it("rejects accessor-backed route readiness without invoking getters", () => {
    const readyGetter = vi.fn(() => {
      throw new Error("route ready getter should not run");
    });
    const routeReport = readyRouteReport();
    Object.defineProperty(routeReport, "ready", {
      configurable: true,
      enumerable: true,
      get: readyGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport,
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/route preflight report is not ready/u);
    expect(readyGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed deployment evidence without invoking getters", () => {
    const deploymentGetter = vi.fn(() => {
      throw new Error("route deployment getter should not run");
    });
    const routeReport = readyRouteReport();
    Object.defineProperty(routeReport, "deployment", {
      configurable: true,
      enumerable: true,
      get: deploymentGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport,
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/route deployment evidence is missing/u);
    expect(deploymentGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed nested deployment fields without invoking getters", () => {
    const verifierKeyHashGetter = vi.fn(() => {
      throw new Error("route verifierKeyHash getter should not run");
    });
    const routeReport = readyRouteReport();
    const deployment = { ...routeReport.deployment };
    Object.defineProperty(deployment, "verifierKeyHash", {
      configurable: true,
      enumerable: true,
      get: verifierKeyHashGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport({ deployment }),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/verifierKeyHash is missing/u);
    expect(verifierKeyHashGetter).not.toHaveBeenCalled();
  });

  it("ignores accessor-backed forbidden route aliases without invoking getters", () => {
    const tronVerifierGetter = vi.fn(() => {
      throw new Error("TRON verifier alias getter should not run");
    });
    const routeReport = readyRouteReport();
    const deployment = { ...routeReport.deployment };
    Object.defineProperty(deployment, "tronVerifierAddress", {
      configurable: true,
      enumerable: true,
      get: tronVerifierGetter,
    });

    const manifest = buildBscSccpBrowserProverManifest({
      routeReport: readyRouteReport({ deployment }),
      moduleUrl: "/sccp-bsc-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
    });

    expect(manifest.schema).toBe(SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA);
    expect(tronVerifierGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed post-deploy evidence without invoking getters", () => {
    const evidenceGetter = vi.fn(() => {
      throw new Error("post-deploy evidence getter should not run");
    });
    const routeReport = readyRouteReport();
    Object.defineProperty(routeReport, "postDeployLiveEvidence", {
      configurable: true,
      enumerable: true,
      get: evidenceGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport,
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/postDeployLiveEvidence is missing/u);
    expect(evidenceGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed nested post-deploy evidence fields without invoking getters", () => {
    const fullTomlReadyGetter = vi.fn(() => {
      throw new Error("post-deploy fullTomlReady getter should not run");
    });
    const postDeployLiveEvidence = {
      ...readyRouteReport().postDeployLiveEvidence,
    };
    Object.defineProperty(postDeployLiveEvidence, "fullTomlReady", {
      configurable: true,
      enumerable: true,
      get: fullTomlReadyGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport({ postDeployLiveEvidence }),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/postDeployLiveEvidence\.fullTomlReady must be true/u);
    expect(fullTomlReadyGetter).not.toHaveBeenCalled();
  });

  it("ignores accessor-backed duplicate post-deploy aliases without invoking getters", () => {
    const sourceEventUrlGetter = vi.fn(() => {
      throw new Error(
        "post-deploy sourceEventTransactionUrl getter should not run",
      );
    });
    const postDeployLiveEvidence = {
      ...readyRouteReport().postDeployLiveEvidence,
    };
    Object.defineProperty(postDeployLiveEvidence, "sourceEventTransactionUrl", {
      configurable: true,
      enumerable: true,
      get: sourceEventUrlGetter,
    });

    const manifest = buildBscSccpBrowserProverManifest({
      routeReport: readyRouteReport({ postDeployLiveEvidence }),
      moduleUrl: "/sccp-bsc-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
    });

    expect(manifest.schema).toBe(SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA);
    expect(sourceEventUrlGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed route checks without invoking getters", () => {
    const checkGetter = vi.fn(() => {
      throw new Error("route check getter should not run");
    });
    const checks = readyRouteReport().checks.map((entry) => ({ ...entry }));
    Object.defineProperty(checks, "0", {
      configurable: true,
      enumerable: true,
      get: checkGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport({ checks }),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
      }),
    ).toThrow(/route report check 0 is not an object/u);
    expect(checkGetter).not.toHaveBeenCalled();
  });

  it("builds a source prover sidecar with explicit source exports", () => {
    const manifest = buildBscSccpBrowserProverManifest({
      routeReport: readyRouteReport(),
      moduleUrl: "./public/sccp-bsc-source-prover.js",
      moduleBytes: SOURCE_PROVER_MODULE_BYTES,
      direction: "source",
      exportNames: ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"],
    });

    expect(manifest).toMatchObject({
      moduleUrl: "./public/sccp-bsc-source-prover.js",
      kind: "bsc-source",
      direction: "bsc-to-taira",
      exports: ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"],
      moduleSha256: sha256Hex(SOURCE_PROVER_MODULE_BYTES),
    });
    expect(
      validateBscSccpBrowserProverManifest({
        manifest,
        routeReport: readyRouteReport(),
        moduleUrl: "./public/sccp-bsc-source-prover.js",
        expectedDirection: "source",
        label: "BSC -> TAIRA source prover",
      }).ok,
    ).toBe(true);
  });

  it("rejects accessor-backed sidecar export name entries without invoking getters", () => {
    const exportNameGetter = vi.fn(() => {
      throw new Error("export name getter should not run");
    });
    const exportNames = ["bscSccpProve,bscSccpNativeProverSelfTest"];
    Object.defineProperty(exportNames, "1", {
      configurable: true,
      enumerable: true,
      get: exportNameGetter,
    });

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
        exportNames,
      }),
    ).toThrow(/exportNames 1 must be a string/u);
    expect(exportNameGetter).not.toHaveBeenCalled();
  });

  it("rejects sparse and non-string sidecar export name entries", () => {
    const sparseExportNames = ["bscSccpProve"];
    sparseExportNames.length = 3;
    sparseExportNames[2] = "bscSccpNativeProverSelfTest";
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
        exportNames: sparseExportNames,
      }),
    ).toThrow(/exportNames 1 is missing/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
        exportNames: ["bscSccpProve", 7],
      }),
    ).toThrow(/exportNames 1 must be a string/u);
  });

  it("rejects source prover sidecars without public-input bindings", () => {
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "./public/sccp-bsc-source-prover.js",
        moduleBytes: SOURCE_PROVER_MODULE_WITHOUT_PUBLIC_INPUTS_BYTES,
        direction: "source",
        exportNames: [
          "bscSccpSourceProve",
          "bscSccpSourceNativeProverSelfTest",
        ],
      }),
    ).toThrow(/public-input binding fields/u);
  });

  it("preserves repeated CLI export flags when generating sidecars", async () => {
    await mkdir(path.join(repoRoot, "output"), { recursive: true });
    const tempRoot = await mkdtemp(
      path.join(repoRoot, "output", "sccp-bsc-sidecar-cli-"),
    );
    try {
      const routeReportPath = path.join(tempRoot, "route-report.json");
      const modulePath = path.join(tempRoot, "bsc-prover.js");
      const outputPath = path.join(tempRoot, "bsc-prover.js.manifest.json");
      const moduleUrl = `./${path
        .relative(repoRoot, modulePath)
        .split(path.sep)
        .join(path.posix.sep)}`;
      await writeFile(routeReportPath, JSON.stringify(readyRouteReport()));
      await writeFile(modulePath, PROVER_MODULE_BYTES);

      await execFileAsync(
        process.execPath,
        [
          "scripts/e2e/sccp-bsc-prover-manifest.mjs",
          "--route-report",
          routeReportPath,
          "--module-url",
          moduleUrl,
          "--direction",
          "destination",
          "--export",
          "bscSccpProve",
          "--export",
          "bscSccpNativeProverSelfTest",
          "--out",
          outputPath,
        ],
        { cwd: repoRoot },
      );

      const manifest = JSON.parse(await readFile(outputPath, "utf8"));
      expect(manifest.exports).toEqual([
        "bscSccpProve",
        "bscSccpNativeProverSelfTest",
      ]);
      expect(
        validateBscSccpBrowserProverManifest({
          manifest,
          routeReport: readyRouteReport(),
          moduleUrl,
          expectedDirection: "destination",
          label: "TAIRA -> BSC CLI prover",
        }).ok,
      ).toBe(true);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("normalizes BSC-specific source bridge and verifier aliases from route reports", () => {
    const routeReport = readyRouteReport({
      deployment: {
        ...readyRouteReport().deployment,
        sourceBridgeAddress: undefined,
        verifierAddress: undefined,
        sccp_bsc_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
        sccp_bsc_destination_verifier_address: BSC_VERIFIER_ADDRESS,
      },
    });
    const manifest = buildBscSccpBrowserProverManifest({
      routeReport,
      moduleUrl: "/sccp-bsc-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
      direction: "destination",
    });

    expect(manifest.deployment).toMatchObject({
      sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      verifierAddress: BSC_VERIFIER_ADDRESS,
    });
  });

  it("builds a mainnet-bound prover sidecar only from mainnet route evidence", () => {
    const routeReport = readyRouteReport({}, BSC_PROFILES.mainnet);
    const manifest = buildBscSccpBrowserProverManifest({
      routeReport,
      bscNetwork: "mainnet",
      moduleUrl: "/sccp-bsc/mainnet-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
      direction: "destination",
    });

    expect(manifest).toMatchObject({
      moduleUrl: "/sccp-bsc/mainnet-prover.js",
      kind: "bsc-destination",
      bscNetwork: "mainnet",
      bscChain: "bsc-mainnet",
      bscChainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
      bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      deployment: {
        nativeEvmProverBundleHash: HASH_99,
      },
      postDeployLiveEvidence: {
        sourceEventExplorerUrl: `${BSC_PROFILES.mainnet.explorerUrl}/tx/${HASH_55}`,
        routeCanaryExplorerUrl: `${BSC_PROFILES.mainnet.explorerUrl}/tx/${HASH_77}`,
      },
    });
    expect(routeReport.checks.map((entry) => entry.id)).toContain(
      "bsc-mainnet-network-id",
    );
    expect(
      validateBscSccpBrowserProverManifest({
        manifest,
        routeReport,
        moduleUrl: "/sccp-bsc/mainnet-prover.js",
        expectedDirection: "destination",
        label: "TAIRA -> BSC mainnet prover",
        bscNetwork: "mainnet",
      }).ok,
    ).toBe(true);
  });

  it("rejects testnet route evidence when the operator requests a mainnet sidecar", () => {
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        bscNetwork: "mainnet",
        moduleUrl: "/sccp-bsc/mainnet-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
        direction: "destination",
      }),
    ).toThrow(
      /route report must be bound to BSC mainnet network label mainnet/u,
    );
  });

  it("builds route-bound sidecars from the checked-in BSC runtime prover adapter", async () => {
    const moduleBytes = await readFile(
      path.join(repoRoot, "public/sccp-bsc/taira-bsc-xor-prover.js"),
    );
    const moduleUrl = "/sccp-bsc/taira-bsc-xor-prover.js";

    const destinationManifest = buildBscSccpBrowserProverManifest({
      routeReport: readyRouteReport(),
      moduleUrl,
      moduleBytes,
      direction: "destination",
    });
    const sourceManifest = buildBscSccpBrowserProverManifest({
      routeReport: readyRouteReport(),
      moduleUrl,
      moduleBytes,
      direction: "source",
      exportNames: ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"],
    });

    expect(destinationManifest).toMatchObject({
      moduleUrl,
      kind: "bsc-destination",
      exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
      moduleSha256: sha256Hex(moduleBytes),
    });
    expect(sourceManifest).toMatchObject({
      moduleUrl,
      kind: "bsc-source",
      exports: ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"],
      moduleSha256: sha256Hex(moduleBytes),
    });
    expect(
      validateBscSccpBrowserProverManifest({
        manifest: destinationManifest,
        routeReport: readyRouteReport(),
        moduleUrl,
        expectedDirection: "destination",
        label: "TAIRA -> BSC runtime prover",
      }).ok,
    ).toBe(true);
    expect(
      validateBscSccpBrowserProverManifest({
        manifest: sourceManifest,
        routeReport: readyRouteReport(),
        moduleUrl,
        expectedDirection: "source",
        label: "BSC -> TAIRA runtime prover",
      }).ok,
    ).toBe(true);
  });

  it("builds route-bound sidecars from a pre-sidecar bootstrap route report", () => {
    const routeReport = sidecarBootstrapRouteReport();
    const manifest = buildBscSccpBrowserProverManifest({
      routeReport,
      moduleUrl: "/sccp-bsc-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
      direction: "destination",
    });

    expect(manifest).toMatchObject({
      schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
      kind: "bsc-destination",
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_55,
      nativeEvmProverBundleHash: HASH_99,
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    });
    expect(
      validateBscSccpBrowserProverManifest({
        manifest,
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        expectedDirection: "destination",
        label: "TAIRA -> BSC bootstrap prover",
      }).ok,
    ).toBe(true);
  });

  it("refuses non-ready, local-only, or proof-hash-incomplete route reports", () => {
    const cases = [
      readyRouteReport({ ready: false }),
      sidecarBootstrapRouteReport({
        checks: routeCheckIds().map((id) => ({
          id,
          ok:
            id === "bsc-native-evm-prover-bundle"
              ? false
              : !BSC_PROVER_SIDECAR_BOOTSTRAP_ALLOWED_FAILED_ROUTE_CHECK_IDS.includes(
                  id,
                ),
          message: `${id} status`,
        })),
      }),
      readyRouteReport({ manifestSource: "file" }),
      readyRouteReport({
        deployment: {
          ...readyRouteReport().deployment,
          proofArtifactHash: null,
        },
      }),
      readyRouteReport({
        deployment: {
          ...readyRouteReport().deployment,
          nativeEvmProverBundleHash: null,
        },
      }),
      readyRouteReport({
        routeId: "taira_bsc_usdt",
        assetKey: "usdt",
      }),
      readyRouteReport({
        postDeployLiveEvidence: undefined,
      }),
    ];

    for (const routeReport of cases) {
      expect(() =>
        buildBscSccpBrowserProverManifest({
          routeReport,
          moduleUrl: "/sccp-bsc-prover.js",
          moduleBytes: PROVER_MODULE_BYTES,
        }),
      ).toThrow(/Cannot generate BSC prover sidecar/u);
    }
  });

  it("allows local route reports for the sidecar bootstrap-only gap", () => {
    const manifest = buildBscSccpBrowserProverManifest({
      routeReport: sidecarBootstrapRouteReport({ manifestSource: "file" }),
      moduleUrl: "/sccp-bsc-prover.js",
      moduleBytes: PROVER_MODULE_BYTES,
    });

    expect(manifest).toMatchObject({
      schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
      kind: "bsc-destination",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
    });
  });

  it("rejects tiny placeholder prover modules before writing sidecars", async () => {
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PLACEHOLDER_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/not production-shaped/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: NO_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/buildGroth16ProofPackage/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: LOCAL_GROTH16_RUNTIME_CALL_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/buildGroth16ProofPackage/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/buildGroth16ProofPackage/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: DOUBLE_ESCAPED_GROTH16_RUNTIME_IMPORT_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/buildGroth16ProofPackage/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: INCOMPLETE_ADAPTER_PIPELINE_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/checked-in BSC runtime adapter pipeline/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: FLAT_ADAPTER_PIPELINE_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/checked-in BSC runtime adapter pipeline/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: DETACHED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/checked-in BSC runtime adapter pipeline/u);

    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: ALIASED_ADAPTER_ENTRYPOINT_PROVER_MODULE_BYTES,
      }),
    ).toThrow(/checked-in BSC runtime adapter pipeline/u);

    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-sidecar-"));
    try {
      await mkdir(path.join(tempRoot, "public"), { recursive: true });
      await writeFile(
        path.join(tempRoot, "public", "sccp-bsc-prover.js"),
        PLACEHOLDER_PROVER_MODULE_BYTES,
      );
      await expect(
        writeBscSccpBrowserProverManifest({
          routeReport: readyRouteReport(),
          moduleUrl: "/sccp-bsc-prover.js",
          root: tempRoot,
        }),
      ).rejects.toThrow(/not production-shaped/u);
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects forged ready route reports with malformed deployment evidence", () => {
    const cases = [
      {
        routeReport: readyRouteReport({ checks: [] }),
        detail: /taira-network preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-native-evm-prover-bundle",
          ),
        }),
        detail: /bsc-native-evm-prover-bundle preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-manifest-secret-scan",
          ),
        }),
        detail: /bsc-manifest-secret-scan preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-route-manifest-unique",
          ),
        }),
        detail: /bsc-route-manifest-unique preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-production-disabled-conflict",
          ),
        }),
        detail:
          /bsc-production-disabled-conflict preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-testnet-chain-id",
          ),
        }),
        detail: /bsc-testnet-chain-id preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-production-verifier-material",
          ),
        }),
        detail:
          /bsc-production-verifier-material preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-verifier-key-hash-readback",
          ),
        }),
        detail:
          /bsc-verifier-key-hash-readback preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.filter(
            (entry) => entry.id !== "bsc-preflight-runbook-contract",
          ),
        }),
        detail:
          /bsc-preflight-runbook-contract preflight check has not passed/u,
      },
      {
        routeReport: readyRouteReport({
          checks: [
            ...readyRouteReport().checks,
            {
              ...readyRouteReport().checks[0],
              status: "pass",
            },
          ],
        }),
        detail: /route report check id .* is duplicated/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.map((entry) =>
            entry.id === "bsc-production-ready"
              ? { ...entry, ok: false, status: "pass" }
              : entry,
          ),
        }),
        detail:
          /route report check bsc-production-ready has contradictory ok\/status/u,
      },
      {
        routeReport: readyRouteReport({
          checks: readyRouteReport().checks.map((entry) =>
            entry.id === "bsc-production-ready"
              ? { id: entry.id, message: entry.message, status: "maybe" }
              : entry,
          ),
        }),
        detail:
          /route report check bsc-production-ready has no machine-readable pass\/fail state/u,
      },
      {
        routeReport: readyRouteReport({
          checks: [null, ...readyRouteReport().checks],
        }),
        detail: /route report check 0 is not an object/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            bridgeAddress: "0x0000000000000000000000000000000000000000",
          },
        }),
        detail: /bridgeAddress must be a non-zero EVM address/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            verifier_address: BSC_VERIFIER_ADDRESS,
          },
        }),
        detail: /deployment\.verifierAddress uses multiple aliases/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proof_artifact_hash: HASH_77,
          },
        }),
        detail: /deployment\.proofArtifactHash uses multiple aliases/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            native_evm_prover_bundle_hash: HASH_88,
          },
        }),
        detail: /deployment\.nativeEvmProverBundleHash uses multiple aliases/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            tokenAddress: BSC_BRIDGE_ADDRESS,
          },
        }),
        detail: /must be distinct/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            networkIdHex:
              "0x0000000000000000000000000000000000000000000000000000000000000038",
          },
        }),
        detail: /deployment networkIdHex must be the BSC testnet network id/u,
      },
      {
        routeReport: readyRouteReport({
          bsc: {
            ...readyRouteReport().bsc,
            network: "mainnet",
          },
        }),
        detail:
          /route report must be bound to BSC testnet network label testnet/u,
      },
      {
        routeReport: readyRouteReport({
          bsc: {
            ...readyRouteReport().bsc,
            chain: "bsc-mainnet",
          },
        }),
        detail: /route report must be bound to BSC testnet chain bsc-testnet/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: HASH_22,
          },
        }),
        detail: /provingKeyHash must not equal verifierKeyHash/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: HASH_44,
          },
        }),
        detail: /provingKeyHash must not equal proofArtifactHash/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: sha256Hex(PROVER_MODULE_BYTES),
          },
        }),
        detail: /proofArtifactHash must not equal moduleSha256/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: ZERO_HASH,
          },
        }),
        detail: /proofArtifactHash must be a non-zero 32-byte hex value/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            proofArtifactHash: undefined,
          },
        }),
        detail: /proofArtifactHash is missing/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: ZERO_HASH,
          },
        }),
        detail: /provingKeyHash must be a non-zero 32-byte hex value/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            provingKeyHash: undefined,
          },
        }),
        detail: /provingKeyHash is missing/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            nativeEvmProverBundleHash: ZERO_HASH,
          },
        }),
        detail:
          /nativeEvmProverBundleHash must be a non-zero 32-byte hex value/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            nativeEvmProverBundleHash: undefined,
          },
        }),
        detail: /nativeEvmProverBundleHash is missing/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            nativeEvmProverBundleHash: HASH_55,
          },
        }),
        detail: /nativeEvmProverBundleHash must not equal provingKeyHash/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
          },
        }),
        detail:
          /sourceBridgeAddress must not use TRON aliases on BSC route reports: sccp_tron_source_bridge_address/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            tron_verifier_address: BSC_VERIFIER_ADDRESS,
          },
        }),
        detail:
          /verifierAddress must not use TRON aliases on BSC route reports: tron_verifier_address/u,
      },
      {
        routeReport: readyRouteReport({
          postDeployLiveEvidence: {
            ...readyRouteReport().postDeployLiveEvidence,
            fullTomlReady: false,
          },
        }),
        detail: /postDeployLiveEvidence.fullTomlReady must be true/u,
      },
      {
        routeReport: readyRouteReport({
          postDeployLiveEvidence: {
            ...readyRouteReport().postDeployLiveEvidence,
            offlineFullTomlSha256: undefined,
          },
        }),
        detail: /postDeployLiveEvidence.offlineFullTomlSha256 is missing/u,
      },
      {
        routeReport: readyRouteReport({
          postDeployLiveEvidence: {
            ...readyRouteReport().postDeployLiveEvidence,
            full_toml_ready: true,
          },
        }),
        detail: /postDeployLiveEvidence.fullTomlReady uses multiple aliases/u,
      },
      {
        routeReport: readyRouteReport({
          postDeployLiveEvidence: {
            ...readyRouteReport().postDeployLiveEvidence,
            route_canary_transaction_url:
              readyRouteReport().postDeployLiveEvidence.routeCanaryExplorerUrl,
          },
        }),
        detail:
          /postDeployLiveEvidence.routeCanaryExplorerUrl uses multiple aliases/u,
      },
    ];

    for (const { routeReport, detail } of cases) {
      expect(() =>
        buildBscSccpBrowserProverManifest({
          routeReport,
          moduleUrl: "/sccp-bsc-prover.js",
          moduleBytes: PROVER_MODULE_BYTES,
        }),
      ).toThrow(detail);
    }
  });

  it("rejects forged ready route reports carrying diagnostic or secret-like material", () => {
    const mnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const cases = [
      {
        routeReport: readyRouteReport({
          warnings: ["diagnostic verifier material was accepted upstream"],
        }),
        detail: /route report still carries diagnostic verifier material/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            diagnosticVerifierMaterial: true,
          },
        }),
        detail: /diagnosticVerifierMaterial=true/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
        detail: /known diagnostic BSC verifier key hash/u,
      },
      {
        routeReport: readyRouteReport({
          readback: {
            bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
        detail: /known diagnostic BSC verifier key hash/u,
        notDetail: /bridgeVerifierKeyHash/u,
      },
      {
        routeReport: readyRouteReport({
          verifierMaterial: {
            alpha1: SMOKE_FIXTURE_G1,
            beta2: SMOKE_FIXTURE_G2,
            gamma2: SMOKE_FIXTURE_G2,
            delta2: SMOKE_FIXTURE_G2,
            ic: SMOKE_FIXTURE_IC,
          },
        }),
        detail: /route report still carries smoke-test verifier material/u,
        notDetail:
          /10857046999023057135944570762232829481370756359578518086990519993285655852781/u,
      },
      {
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
        detail: /route report still carries smoke-test verifier material/u,
        notDetail:
          /11559732032986387107991004021392285783925812861821192530917403151452391805634/u,
      },
      {
        routeReport: readyRouteReport({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            alpha1: [1, 3],
          },
        }),
        detail: /invalid BN254 verifier material.*BN254 G1 curve/u,
        notDetail: /alpha1.*1,3/u,
      },
      {
        routeReport: readyRouteReport({
          route: {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              beta2: [1, 2, 3, 4],
            },
          },
        }),
        detail: /invalid BN254 verifier material.*BN254 G2 twist curve/u,
        notDetail: /beta2.*1,2,3,4/u,
      },
      {
        routeReport: readyRouteReport({
          artifacts: {
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
            },
          },
        }),
        detail: /invalid BN254 verifier material.*BN254 field element/u,
        notDetail: new RegExp(BN254_BASE_FIELD_MODULUS, "u"),
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            operatorSecret: "redacted",
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /operatorSecret|redacted/u,
      },
      {
        routeReport: readyRouteReport({
          deployment: {
            ...readyRouteReport().deployment,
            apiKey: "do-not-leak-prover-api-key",
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /apiKey|do-not-leak-prover-api-key/u,
      },
      {
        routeReport: readyRouteReport({
          audit: {
            transcript: mnemonic,
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /audit\.transcript|abandon abandon/u,
      },
      {
        routeReport: readyRouteReport({
          audit: {
            note: "operator privateKey=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /privateKey=|feedfacefeedface/u,
      },
      {
        routeReport: readyRouteReport({
          audit: {
            note: "operator bearerToken=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /bearerToken=|feedfacefeedface/u,
      },
      {
        routeReport: readyRouteReport({
          audit: {
            note: "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
          },
        }),
        detail: /route report contains secret-like material/u,
        notDetail: /Bearer|mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l/u,
      },
    ];

    for (const { routeReport, detail, notDetail } of cases) {
      expect(() =>
        buildBscSccpBrowserProverManifest({
          routeReport,
          moduleUrl: "/sccp-bsc-prover.js",
          moduleBytes: PROVER_MODULE_BYTES,
        }),
      ).toThrow(detail);
      if (notDetail) {
        try {
          buildBscSccpBrowserProverManifest({
            routeReport,
            moduleUrl: "/sccp-bsc-prover.js",
            moduleBytes: PROVER_MODULE_BYTES,
          });
        } catch (error) {
          expect(
            error instanceof Error ? error.message : String(error),
          ).not.toMatch(notDetail);
        }
      }
    }
  });

  it("requires local package-relative module URLs for deterministic sidecar generation", () => {
    expect(
      defaultBscProverManifestOutputPath("/sccp-bsc-prover.js", {
        root: "/repo",
      }),
    ).toBe(path.join("/repo", "public", "sccp-bsc-prover.js.manifest.json"));
    expect(
      resolveLocalBscProverModulePath("./public/sccp-bsc-prover.js", {
        root: "/repo",
      }).modulePath,
    ).toBe(path.join("/repo", "public", "sccp-bsc-prover.js"));
    for (const unsafeUrl of [
      "https://cdn.example.invalid/sccp-bsc-prover.js",
      "../sccp-bsc-prover.js",
      "/assets/../sccp-bsc-prover.js",
      "/sccp-bsc-prover.js?token=secret",
    ]) {
      expect(() =>
        resolveLocalBscProverModulePath(unsafeUrl, { root: "/repo" }),
      ).toThrow(/BSC prover module URL|local package-relative/u);
    }
  });

  it("rejects unsupported or secret-like export names through the production manifest validator", () => {
    expect(() =>
      buildBscSccpBrowserProverManifest({
        routeReport: readyRouteReport(),
        moduleUrl: "/sccp-bsc-prover.js",
        moduleBytes: PROVER_MODULE_BYTES,
        exportNames: ["privateKey"],
      }),
    ).toThrow(/manifest exports must include/u);
  });
});
