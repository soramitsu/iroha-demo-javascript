import { createHash, generateKeyPairSync, sign } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { keccak_256 } from "@noble/hashes/sha3";
import { describe, expect, it, vi } from "vitest";
import {
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
  SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  validateBscMainnetNativeEvmProverBundle,
  validateBscTestnetNativeEvmProverBundle,
} from "@iroha/iroha-js/sccp";
import {
  BSC_MAINNET_CHAIN_ID_HEX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_TESTNET_CHAIN_ID_HEX,
  BSC_TESTNET_NETWORK_ID_HEX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  canonicalBscNativeEvmProverBundleHash,
  requiredBscRouteCheckIds,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import {
  DEFAULT_BSC_PRODUCTION_MATERIAL_SCAN_PATHS,
  SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES,
  SCCP_BSC_NATIVE_PROVER_ARTIFACT_MAX_BYTES,
  SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
  bscProductionRequirementsContractHash,
  bscSccpProductionMaterialInventoryRunbookProblems,
  bscSccpProductionMaterialInventoryOutputDir,
  bscSccpProductionMaterialInventoryRouteReportPath,
  bscSccpProductionMaterialScanPaths,
  evaluateBscSccpProductionMaterialInventory,
  runBscSccpProductionMaterialInventory,
  shouldFailBscSccpProductionMaterialInventoryCli,
} from "../scripts/e2e/sccp-bsc-production-material-inventory.mjs";
import {
  SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_PROVER_MODULE_URL_ENV,
  SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
} from "../scripts/e2e/sccp-bsc-live-smoke-readiness.mjs";
import { writeBscSccpRuntimeProverConfig } from "../scripts/e2e/sccp-bsc-runtime-prover-config.mjs";
import {
  BSC_EVM_GROTH16_BACKEND,
  ROUTE_MANIFEST_SCHEMA,
  SCCP_PROOF_FAMILY_STARK_FRI,
  SCCP_DOMAIN_BSC,
  SCCP_DOMAIN_SORA,
  bscGroth16VerifierKeyHash,
  bscGroth16DeterministicProofSelfTestSample,
  bscDestinationBindingHash,
  bscDestinationBindingKey,
  bscNativeProverReportProductionAttestationHash,
  buildBscNativeEvmProverBundleFromArtifacts,
} from "../../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const fixtureHash = (label) =>
  `0x${createHash("sha256").update(Buffer.from(label, "utf8")).digest("hex")}`;
const TEST_ATTESTATION_SIGNER = generateKeyPairSync("ed25519");
const TEST_ATTESTATION_PUBLIC_KEY_PEM =
  TEST_ATTESTATION_SIGNER.publicKey.export({
    type: "spki",
    format: "pem",
  });
const TRUSTED_ATTESTATION_SIGNER_FINGERPRINT = `0x${createHash("sha256")
  .update(
    TEST_ATTESTATION_SIGNER.publicKey.export({
      type: "spki",
      format: "der",
    }),
  )
  .digest("hex")}`;
const SECURITY_ATTESTATION_SIGNER = generateKeyPairSync("ed25519");
const SECURITY_ATTESTATION_PUBLIC_KEY_PEM =
  SECURITY_ATTESTATION_SIGNER.publicKey.export({
    type: "spki",
    format: "pem",
  });
const SECURITY_ATTESTATION_SIGNER_FINGERPRINT = `0x${createHash("sha256")
  .update(
    SECURITY_ATTESTATION_SIGNER.publicKey.export({
      type: "spki",
      format: "der",
    }),
  )
  .digest("hex")}`;
const SETUP_ATTESTATION_SIGNER = generateKeyPairSync("ed25519");
const SETUP_ATTESTATION_PUBLIC_KEY_PEM =
  SETUP_ATTESTATION_SIGNER.publicKey.export({
    type: "spki",
    format: "pem",
  });
const SETUP_ATTESTATION_SIGNER_FINGERPRINT = `0x${createHash("sha256")
  .update(
    SETUP_ATTESTATION_SIGNER.publicKey.export({
      type: "spki",
      format: "der",
    }),
  )
  .digest("hex")}`;
const REPRODUCIBLE_ATTESTATION_SIGNER = generateKeyPairSync("ed25519");
const REPRODUCIBLE_ATTESTATION_PUBLIC_KEY_PEM =
  REPRODUCIBLE_ATTESTATION_SIGNER.publicKey.export({
    type: "spki",
    format: "pem",
  });
const REPRODUCIBLE_ATTESTATION_SIGNER_FINGERPRINT = `0x${createHash("sha256")
  .update(
    REPRODUCIBLE_ATTESTATION_SIGNER.publicKey.export({
      type: "spki",
      format: "der",
    }),
  )
  .digest("hex")}`;
const TRUSTED_ATTESTATION_SIGNER_FINGERPRINTS = Object.freeze([
  TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
  SECURITY_ATTESTATION_SIGNER_FINGERPRINT,
  SETUP_ATTESTATION_SIGNER_FINGERPRINT,
  REPRODUCIBLE_ATTESTATION_SIGNER_FINGERPRINT,
]);
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc material inventory bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc material inventory token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc material inventory source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc material inventory verifier");
const HASH_11 = fixtureHash("bsc material inventory fixture hash 11");
const HASH_22 = fixtureHash("bsc material inventory fixture hash 22");
const HASH_33 = fixtureHash("bsc material inventory fixture hash 33");
const HASH_44 = fixtureHash("bsc material inventory fixture hash 44");
const HASH_55 = fixtureHash("bsc material inventory fixture hash 55");
const HASH_66 = fixtureHash("bsc material inventory fixture hash 66");
const HASH_77 = fixtureHash("bsc material inventory fixture hash 77");
const HASH_88 = fixtureHash("bsc material inventory fixture hash 88");
const HASH_99 = fixtureHash("bsc material inventory fixture hash 99");
const BSC_DEPLOYMENT_EVIDENCE_SCHEMA =
  "iroha-sccp-bsc-taira-xor-deployment-evidence/v1";
const TAIRA_BURN_RECORD_CONTRACT_SCHEMA =
  "iroha-sccp-taira-xor-burn-record-contract/v1";
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
const BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-request-package/v1";
const BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-handoff/v1";
const BSC_GROTH16_PROOF_SELF_TEST_SCHEMA =
  "iroha-sccp-bsc-groth16-proof-self-test/v1";
const BSC_NATIVE_EVM_NO_WASM_NO_REMOTE_SCAN_SCHEMA =
  "iroha-sccp-bsc-native-evm-no-wasm-no-remote-scan/v1";
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
const BSC_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    chain: "bsc-testnet",
    chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
    networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    explorerUrl: "https://testnet.bscscan.com",
    explorerHost: "testnet.bscscan.com",
    bundleId: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    legacyParityFixtureSchema:
      SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestSchema: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    validateBundle: validateBscTestnetNativeEvmProverBundle,
    nativeBundleFile: "bsc-testnet-native-evm-prover-bundle.json",
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    explorerUrl: "https://bscscan.com",
    explorerHost: "bscscan.com",
    bundleId: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
    paritySchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_SCHEMA_V1,
    legacyParityFixtureSchema:
      SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_PARITY_FIXTURE_SCHEMA_V1,
    selfTestSchema: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_SELF_TEST_SCHEMA_V1,
    validateBundle: validateBscMainnetNativeEvmProverBundle,
    nativeBundleFile: "bsc-mainnet-native-evm-prover-bundle.json",
  }),
});
const BSC_COMPILED_CONTRACTS = Object.freeze({
  verifier: "SccpGroth16Bn254MessageVerifier",
  sourceBridge: "SccpBscSourceBridge",
  token: "TairaXOR",
  bridge: "TairaXorBscSccpBridge",
});
const routeManifestPathForProfile = (profile) =>
  `artifacts/sccp-bsc/${
    profile.key === "mainnet"
      ? "taira-bsc-mainnet-xor-route.manifest.json"
      : "taira-bsc-xor-route.manifest.json"
  }`;
const fullConfigEvidencePathForProfile = (profile) =>
  `artifacts/sccp-bsc/${
    profile.key === "mainnet"
      ? "taira-bsc-mainnet-xor-route.full-taira-config.evidence.json"
      : "taira-bsc-xor-route.full-taira-config.evidence.json"
  }`;
const sourceParityAttestationPathForProfile = (profile) =>
  `artifacts/sccp-bsc/native-prover/${
    profile.key === "mainnet"
      ? "mainnet-source-parity-attestation.json"
      : "source-parity-attestation.json"
  }`;
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
const DIAGNOSTIC_VERIFIER_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
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
const VALID_IC = VALID_G1_POINTS.slice(1, 11).flat();
const VALID_VERIFIER_MATERIAL = Object.freeze({
  alpha1: VALID_G1_POINTS[1],
  beta2: SMOKE_FIXTURE_G2,
  gamma2: SMOKE_FIXTURE_G2,
  delta2: SMOKE_FIXTURE_G2,
  ic: VALID_IC,
});
const verifierKeyHashForMaterial = (material = VALID_VERIFIER_MATERIAL) =>
  bscGroth16VerifierKeyHash(material);
const verifierMaterialForProfile = (
  profile = BSC_PROFILES.testnet,
  material = VALID_VERIFIER_MATERIAL,
) => {
  const verifierKeyHash = verifierKeyHashForMaterial(material);
  return {
    schema: "iroha-sccp-bsc-verifier-key/v1",
    network: profile.chain,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkId: profile.networkIdHex,
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
const verifierKeyMaterialBytes = (
  profile = BSC_PROFILES.testnet,
  material = VALID_VERIFIER_MATERIAL,
) =>
  Buffer.from(
    `${JSON.stringify(verifierMaterialForProfile(profile, material), null, 2)}\n`,
    "utf8",
  );

const deployment = (overrides = {}, profile = BSC_PROFILES.testnet) => ({
  bridgeAddress: BSC_BRIDGE_ADDRESS,
  tokenAddress: BSC_TOKEN_ADDRESS,
  sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  verifierAddress: BSC_VERIFIER_ADDRESS,
  networkIdHex: profile.networkIdHex,
  verifierCodeHash: HASH_11,
  verifierKeyHash: HASH_22,
  proofArtifactHash: HASH_44,
  provingKeyHash: HASH_66,
  nativeEvmProverBundleHash: HASH_99,
  destinationBindingHash: HASH_33,
  settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
  ...overrides,
});

const postDeployLiveEvidence = (
  overrides = {},
  profile = BSC_PROFILES.testnet,
) => ({
  fullTomlReady: true,
  sourceBridgeConfigHash: HASH_44,
  sourceEventTransactionId: HASH_55,
  sourceEventExplorerUrl: `${profile.explorerUrl}/tx/${HASH_55}`,
  routeCanaryEvidenceHash: HASH_66,
  routeCanaryTransactionId: HASH_77,
  routeCanaryExplorerUrl: `${profile.explorerUrl}/tx/${HASH_77}`,
  offlineFullTomlSha256: HASH_88,
  ...overrides,
});

const offlineFullTomlEvidenceArtifact = (
  overrides = {},
  profile = BSC_PROFILES.testnet,
) => ({
  schema: "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bscNetwork: profile.key,
  chain: profile.chain,
  chainIdHex: profile.chainIdHex,
  networkIdHex: profile.networkIdHex,
  fullTomlReady: true,
  offlineFullTomlSha256: HASH_88,
  hashMode:
    "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256",
  hashInputSha256: HASH_88,
  renderedTomlSha256: attestationHash(
    `${profile.key}:rendered-full-taira-config`,
  ),
  routeManifestPath: `artifacts/sccp-bsc/${profile.key}-route.manifest.json`,
  fullConfigPath: `artifacts/sccp-bsc/${profile.key}-full-config.toml`,
  baseConfigProvided: true,
  postDeployLiveEvidence: {
    fullTomlReady: true,
    offlineFullTomlSha256: HASH_88,
  },
  ...overrides,
});

const deploymentEvidenceArtifact = (
  deploymentInfo = deployment(),
  profile = BSC_PROFILES.testnet,
  overrides = {},
) => {
  const destinationBindingKey = bscDestinationBindingKey({
    networkId: profile.networkIdHex,
    verifierAddress: deploymentInfo.verifierAddress,
    bridgeAddress: deploymentInfo.bridgeAddress,
    verifierCodeHash: deploymentInfo.verifierCodeHash,
    verifierKeyHash: deploymentInfo.verifierKeyHash,
  });
  const destinationBindingHash = bscDestinationBindingHash({
    networkId: profile.networkIdHex,
    verifierAddress: deploymentInfo.verifierAddress,
    bridgeAddress: deploymentInfo.bridgeAddress,
    verifierCodeHash: deploymentInfo.verifierCodeHash,
    verifierKeyHash: deploymentInfo.verifierKeyHash,
  });
  return {
    schema: BSC_DEPLOYMENT_EVIDENCE_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    bscBridgeAddress: deploymentInfo.bridgeAddress,
    bscTokenAddress: deploymentInfo.tokenAddress,
    sccpBscSourceBridgeAddress: deploymentInfo.sourceBridgeAddress,
    bscVerifierAddress: deploymentInfo.verifierAddress,
    verifierCodeHash: deploymentInfo.verifierCodeHash,
    verifierKeyHash: deploymentInfo.verifierKeyHash,
    destinationRollout: {
      version: 1,
      destinationNetworkId: profile.networkIdHex,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      verifierIdentity: deploymentInfo.verifierAddress,
      verifierBackend: BSC_EVM_GROTH16_BACKEND,
      proofFamily: "stark-fri-v1",
      verifierCodeHash: deploymentInfo.verifierCodeHash,
      verifierKeyHash: deploymentInfo.verifierKeyHash,
      destinationBridgeAddress: deploymentInfo.bridgeAddress,
      destinationBindingHash,
      destinationBindingKey,
    },
    destinationBinding: {
      version: 1,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
      networkIdHex: profile.networkIdHex,
      key: destinationBindingKey,
      bindingHash: destinationBindingHash,
    },
    compiledContractCodeHashes: {
      token: HASH_33,
      bridge: HASH_44,
      sourceBridge: HASH_55,
      verifier: deploymentInfo.verifierCodeHash,
    },
    bscContractReadback: {
      chainIdHex: profile.chainIdHex,
      codePresent: {
        token: true,
        bridge: true,
        sourceBridge: true,
        verifier: true,
      },
      codeHashes: {
        token: HASH_33,
        bridge: HASH_44,
        sourceBridge: HASH_55,
        verifier: deploymentInfo.verifierCodeHash,
      },
      tokenAddress: deploymentInfo.tokenAddress,
      bridgeAddress: deploymentInfo.bridgeAddress,
      sourceBridgeAddress: deploymentInfo.sourceBridgeAddress,
      verifierAddress: deploymentInfo.verifierAddress,
      tokenBridgeAddress: deploymentInfo.bridgeAddress,
      tokenBridgeLocked: true,
      sourceBridgeOwner: deploymentInfo.bridgeAddress,
      bridgeDestinationBindingHash: destinationBindingHash,
      bridgeVerifierAddress: deploymentInfo.verifierAddress,
      bridgeVerifierCodeHash: deploymentInfo.verifierCodeHash,
      bridgeVerifierKeyHash: deploymentInfo.verifierKeyHash,
      verifierKeyHash: deploymentInfo.verifierKeyHash,
      bridgeNetworkId: profile.networkIdHex,
      bridgeSourceDomain: SCCP_DOMAIN_SORA,
      bridgeTargetDomain: SCCP_DOMAIN_BSC,
    },
    postDeployChecklist: [
      "TairaXOR.bridge() equals bscBridgeAddress",
      "TairaXOR.bridgeLocked() is true",
      "SccpBscSourceBridge.owner() equals bscBridgeAddress",
      "TairaXorBscSccpBridge.destinationBindingHash() equals destinationRollout.destinationBindingHash",
      "TairaXorBscSccpBridge.verifier() equals bscVerifierAddress",
      "TairaXorBscSccpBridge verifier code/key hashes and domains match destinationRollout",
      "compiledContractCodeHashes match live bscContractReadback.codeHashes",
    ],
    ...overrides,
  };
};

const routeCheckIds = (profile = BSC_PROFILES.testnet) =>
  requiredBscRouteCheckIds(profile);

const routeReport = (overrides = {}, profile = BSC_PROFILES.testnet) => ({
  ready: true,
  generatedAtMs: Date.parse("2026-06-06T00:00:00.000Z"),
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
    explorerUrl: profile.explorerUrl,
    explorerHost: profile.explorerHost,
  },
  deployment: deployment({}, profile),
  postDeployLiveEvidence: postDeployLiveEvidence({}, profile),
  checks: routeCheckIds(profile).map((id) => ({
    id,
    ok: true,
    message: `${id} ready`,
  })),
  ...overrides,
});

const moduleSource = (
  exportName,
  { includeSourcePublicInputs = true } = {},
) => {
  const selfTestExportName =
    exportName === "bscSccpSourceProve"
      ? "bscSccpSourceNativeProverSelfTest"
      : "bscSccpNativeProverSelfTest";
  const wasmFile =
    exportName === "bscSccpSourceProve"
      ? "bsc-source-prover.wasm"
      : "bsc-destination-prover.wasm";
  const provingKeyFile =
    exportName === "bscSccpSourceProve"
      ? "bsc-source-proving-key.zkey"
      : "bsc-destination-proving-key.zkey";
  const sourcePublicInputBinding =
    exportName === "bscSccpSourceProve" && includeSourcePublicInputs
      ? `
const requiredSourcePublicInputFields = Object.freeze(["publicInputs", "sourceEventDigest", "commitmentRoot", "messageId", "payloadHash", "sourceDomain", "targetDomain", "amountBaseUnits", "bscSender", "tairaRecipient", "routeId"]);
const bindSourcePublicInputs = (request) => ({
  publicInputs: request?.publicInputs ?? request?.public_inputs,
  sourceEventDigest: request?.sourceEventDigest ?? request?.source_event_digest,
  commitmentRoot: request?.commitmentRoot ?? request?.commitment_root,
  messageId: request?.messageId ?? request?.message_id,
  payloadHash: request?.payloadHash ?? request?.payload_hash,
  sourceDomain: request?.sourceDomain ?? request?.source_domain,
  targetDomain: request?.targetDomain ?? request?.target_domain,
  amountBaseUnits: request?.amountBaseUnits ?? request?.amount_base_units ?? request?.amount,
  bscSender: request?.bscSender ?? request?.bsc_sender ?? request?.sender,
  tairaRecipient: request?.tairaRecipient ?? request?.taira_recipient ?? request?.recipient,
  routeId: request?.routeId ?? request?.route_id ?? request?.route,
});
`
      : "";
  const proveBody =
    exportName === "bscSccpSourceProve" && includeSourcePublicInputs
      ? "buildGroth16ProofPackage({ request, wasmUrl, provingKeyUrl, runtimeIntegrity, requiredSourcePublicInputFields, sourcePublicInputs: bindSourcePublicInputs(request) })"
      : "buildGroth16ProofPackage({ request, wasmUrl, provingKeyUrl, runtimeIntegrity })";
  return `
import { buildGroth16ProofPackage } from "./bsc-proof-runtime.js";
const wasmUrl = new URL("./${wasmFile}", import.meta.url);
const provingKeyUrl = new URL("./${provingKeyFile}", import.meta.url);
const runtimeIntegrity = "${"bsc-inventory-integrity-binding-".repeat(80)}";
${sourcePublicInputBinding}
export const ${selfTestExportName} = async (context) => context.nativeProverSelfTest;
export const ${exportName} = async (request) => ${proveBody};
`;
};

const incompleteAdapterPipelineModuleSource = () => `
const runtimeIntegrity = "${"incomplete-adapter-pipeline-bsc-integrity-binding-".repeat(80)}";
const loadBackend = async (row) => row;
const selectBackendFn = (backend) => backend.prove;
const selectBackendSelfTestFn = (backend) => backend.selfTest;
const runBackendNativeProverSelfTest = async (selfTest, context) => selfTest(context);
const verifyBundleMaterial = (material) => material;
export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;
export const bscSccpProve = async (request) => {
  const backend = await loadBackend({
    prove: async (value) => value,
    selfTest: async (value) => value,
  });
  const prove = selectBackendFn(backend);
  const selfTest = selectBackendSelfTestFn(backend);
  verifyBundleMaterial({ request }, request, "destination");
  await runBackendNativeProverSelfTest(selfTest, request);
  return prove({ request, runtimeIntegrity });
};
`;

const flatAdapterPipelineModuleSource = () => `
const runtimeIntegrity = "${"flat-adapter-pipeline-bsc-integrity-binding-".repeat(80)}";
const ownJsonValue = (value) => value;
const readConfig = async () => ({ directionRows: { destination: {} } });
const loadMaterial = async () => ({});
const loadNativeBundleArtifacts = async () => ({});
const assertProverMaterialShape = () => true;
const verifyBundleMaterial = (material) => material;
const loadBackend = async () => ({
  prove: async (value) => value,
  selfTest: async (value) => value,
});
const selectBackendFn = (backend) => backend.prove;
const selectBackendSelfTestFn = (backend) => backend.selfTest;
const buildContext = (context) => context;
const runBackendNativeProverSelfTest = async (selfTest, context) => selfTest(context);
const verifyBackendNativeProverSelfTestResult = (result) => result;
export const bscSccpNativeProverSelfTest = async (context) => context.nativeProverSelfTest;
export const bscSccpProve = async (request) => {
  const proofRequest = ownJsonValue(request);
  const state = await readConfig();
  const material = await loadMaterial({}, state, "destination");
  await loadNativeBundleArtifacts({ material, state });
  assertProverMaterialShape(new Uint8Array([1, 2, 3, 4]), "destination proof artifact", "artifact.r1cs", "proof-artifact");
  verifyBundleMaterial(material, proofRequest, "destination");
  const backend = await loadBackend({}, state, "destination");
  const prove = selectBackendFn(backend, "destination", {});
  const selfTest = selectBackendSelfTestFn(backend, "destination", {});
  const context = buildContext({ direction: "destination", request: proofRequest, material, state });
  verifyBackendNativeProverSelfTestResult(await runBackendNativeProverSelfTest(selfTest, context), context);
  return prove({ request: proofRequest, runtimeIntegrity });
};
`;

const detachedAdapterEntrypointModuleSource = () => `
const runtimeIntegrity = "${"detached-adapter-entrypoint-bsc-integrity-binding-".repeat(80)}";
const ownJsonValue = (value) => value;
const readConfig = async () => ({ directionRows: { destination: {}, source: {} } });
const readBytes = async () => ({
  bytes: new Uint8Array([1, 2, 3, 4]),
  url: "artifact.bin",
  sha256: "0x${"11".repeat(32)}",
});
const parseJsonBytes = () => ({});
const nativeEvmProverBundleDescriptorHash = async () => ({
  descriptor: {},
  descriptorHash: "0x${"22".repeat(32)}",
});
const assertProverMaterialShape = () => true;
const loadNativeBundleArtifacts = async () => ({});
const verifyBundleMaterial = (material) => material;
const strictConfigStringField = () => "bscSccpProve";
const assertSelfContainedBackendModule = () => true;
const verifiedJavascriptModuleDataUrl = () => "data:text/javascript,export%20default%20{}";
const backendStringField = () => "javascript";
const verifyBackendSelfTestHash = () => "0x${"33".repeat(32)}";
const verifyBackendSelfTestPublicSignals = () => [];
const verifyBackendNativeProverSelfTestResult = (result, context) => ({
  result,
  context,
  sdk: backendStringField(result, ["sdk"], "sdk"),
  requestHash: verifyBackendSelfTestHash({
    result,
    expected: {},
    key: "requestHash",
    aliases: ["requestHash"],
    label: "self-test",
  }),
  publicSignalWords: verifyBackendSelfTestPublicSignals({
    result,
    expected: [],
    label: "self-test",
  }),
});
const runBackendNativeProverSelfTest = async (selfTest, context) =>
  verifyBackendNativeProverSelfTestResult(await selfTest(context), context);
const loadMaterial = async (row, state, direction) => {
  const nativeBundle = await readBytes({ row, state, direction });
  const bundle = parseJsonBytes(nativeBundle.bytes, "native bundle");
  await nativeEvmProverBundleDescriptorHash({ bundle, direction });
  assertProverMaterialShape(
    nativeBundle.bytes,
    "proof artifact",
    "artifact.r1cs",
    "proof-artifact",
  );
  return {
    nativeBundle: bundle,
    nativeArtifacts: await loadNativeBundleArtifacts({ row, state, direction }),
  };
};
const loadBackend = async (row, state, direction) => {
  strictConfigStringField(row, ["backendModuleUrl"], "backend module URL");
  const backendBytes = await readBytes({ row, state, direction });
  assertSelfContainedBackendModule(backendBytes.bytes, "backend module");
  verifiedJavascriptModuleDataUrl(backendBytes.bytes);
  return { prove: async (value) => value, selfTest: async (value) => value };
};
const selectBackendFn = (backend) => backend.prove;
const selectBackendSelfTestFn = (backend) => backend.selfTest;
const buildContext = (context) => ({
  ...context,
  backendAcceptedExport: strictConfigStringField(
    context.config || {},
    ["backendAcceptedExport"],
    "backend export",
  ),
});
const withRuntime = async (direction, request, options = {}) => {
  const proofRequest = ownJsonValue(request);
  const state = await readConfig();
  const row = state.directionRows[direction];
  const material = await loadMaterial(row, state, direction);
  verifyBundleMaterial(material, proofRequest, direction);
  const backend = await loadBackend(row, state, direction);
  const prove = selectBackendFn(backend, direction, row);
  const selfTest = selectBackendSelfTestFn(backend, direction, row);
  const context = buildContext({
    direction,
    request: proofRequest,
    material,
    config: row,
    state,
  });
  await runBackendNativeProverSelfTest(selfTest, context, options);
  return prove(context, options);
};
const withRuntimeSelfTest = async (direction, request, options = {}) => {
  const proofRequest = ownJsonValue(request);
  const state = await readConfig();
  const row = state.directionRows[direction];
  const material = await loadMaterial(row, state, direction);
  verifyBundleMaterial(material, proofRequest, direction);
  const backend = await loadBackend(row, state, direction);
  const selfTest = selectBackendSelfTestFn(backend, direction, row);
  return runBackendNativeProverSelfTest(
    selfTest,
    buildContext({
      direction,
      request: proofRequest,
      material,
      config: row,
      state,
    }),
    options,
  );
};
const verifyDestinationResult = (result) => result;
const verifySourceResult = (result) => result;
export async function bscSccpProve(request) {
  return { request, runtimeIntegrity };
}
export async function bscSccpNativeProverSelfTest(context) {
  return { context, runtimeIntegrity };
}
export async function bscSccpSourceProve(input) {
  return { input, runtimeIntegrity };
}
export async function bscSccpSourceNativeProverSelfTest(context) {
  return { context, runtimeIntegrity };
}
`;

const aliasedAdapterEntrypointModuleSource = () => {
  const source = detachedAdapterEntrypointModuleSource();
  const detachedExports = `
export async function bscSccpProve(request) {
  return { request, runtimeIntegrity };
}
export async function bscSccpNativeProverSelfTest(context) {
  return { context, runtimeIntegrity };
}
export async function bscSccpSourceProve(input) {
  return { input, runtimeIntegrity };
}
export async function bscSccpSourceNativeProverSelfTest(context) {
  return { context, runtimeIntegrity };
}
`;
  const aliasedExports = `
async function bscSccpProve(request) {
  return verifyDestinationResult(await withRuntime("destination", request));
}
async function bscSccpNativeProverSelfTest(context) {
  return withRuntimeSelfTest("destination", context);
}
async function bscSccpSourceProve(input) {
  return verifySourceResult(await withRuntime("source", input));
}
async function bscSccpSourceNativeProverSelfTest(context) {
  return withRuntimeSelfTest("source", context);
}
const bypassDestinationProve = async (request) => ({
  request,
  runtimeIntegrity,
});
const bypassDestinationSelfTest = async (context) => ({
  context,
  runtimeIntegrity,
});
const bypassSourceProve = async (input) => ({ input, runtimeIntegrity });
const bypassSourceSelfTest = async (context) => ({
  context,
  runtimeIntegrity,
});
export {
  bypassDestinationProve as bscSccpProve,
  bypassDestinationSelfTest as bscSccpNativeProverSelfTest,
  bypassSourceProve as bscSccpSourceProve,
  bypassSourceSelfTest as bscSccpSourceNativeProverSelfTest,
};
`;
  if (!source.includes(detachedExports)) {
    throw new Error("detached BSC adapter export fixture marker is missing");
  }
  return source.replace(detachedExports, aliasedExports);
};

const commentOnlyModuleSource = (exportName) => `
// export async function ${exportName}(request) { return request; }
export const material = "${"b".repeat(1300)}";
`;

const nonCallableModuleSource = (exportName) => `
export const ${exportName} = "not a prover function";
export const material = "${"c".repeat(1300)}";
`;

const missingSelfTestModuleSource = (exportName) => `
export async function ${exportName}(request) {
  return { proofBytes: new Uint8Array(384), metadata: request };
}
export const material = "${"d".repeat(1300)}";
`;

const wrongSelfTestModuleSource = (exportName) => `
import { buildGroth16ProofPackage } from "./bsc-proof-runtime.js";
const wasmUrl = new URL("./bsc-destination-prover.wasm", import.meta.url);
const provingKeyUrl = new URL("./bsc-destination-proving-key.zkey", import.meta.url);
const runtimeIntegrity = "${"wrong-self-test-integrity-binding-".repeat(80)}";
export async function bscSccpSourceNativeProverSelfTest(context) {
  return context.nativeProverSelfTest;
}
export async function ${exportName}(request) {
  return buildGroth16ProofPackage({ request, wasmUrl, provingKeyUrl, runtimeIntegrity });
}
`;

const runtimeBackendSource = () => `
export async function bscSccpNativeProverSelfTest(context) {
  return context.nativeProverSelfTest;
}
export async function bscSccpSourceNativeProverSelfTest(context) {
  return context.nativeProverSelfTest;
}
const requiredSourcePublicInputFields = Object.freeze(["publicInputs", "sourceEventDigest", "commitmentRoot", "messageId", "payloadHash", "sourceDomain", "targetDomain", "amountBaseUnits", "bscSender", "tairaRecipient", "routeId"]);
const bindSourcePublicInputs = (context) => ({
  publicInputs: context?.publicInputs ?? context?.public_inputs,
  sourceEventDigest: context?.sourceEventDigest ?? context?.source_event_digest,
  commitmentRoot: context?.commitmentRoot ?? context?.commitment_root,
  messageId: context?.messageId ?? context?.message_id,
  payloadHash: context?.payloadHash ?? context?.payload_hash,
  sourceDomain: context?.sourceDomain ?? context?.source_domain,
  targetDomain: context?.targetDomain ?? context?.target_domain,
  amountBaseUnits: context?.amountBaseUnits ?? context?.amount_base_units ?? context?.amount,
  bscSender: context?.bscSender ?? context?.bsc_sender ?? context?.sender,
  tairaRecipient: context?.tairaRecipient ?? context?.taira_recipient ?? context?.recipient,
  routeId: context?.routeId ?? context?.route_id ?? context?.route,
});
export async function bscSccpProve(context) {
  return context.destinationBackend(context);
}
export async function bscSccpSourceProve(context) {
  bindSourcePublicInputs(context);
  return context.sourceBackend(context);
}
export const runtimeIntegrity = ${JSON.stringify(
  "bsc-runtime-config-inventory-binding-".repeat(80),
)};
`;

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;
const stableJsonValue = (value) => {
  if (Array.isArray(value)) {
    return value.map((entry) => stableJsonValue(entry));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableJsonValue(entry)]),
    );
  }
  return value;
};
const stableJsonString = (value) => JSON.stringify(stableJsonValue(value));
const signGroth16MaterialAttestationRecord = (
  record,
  {
    privateKey = TEST_ATTESTATION_SIGNER.privateKey,
    publicKeyPem = TEST_ATTESTATION_PUBLIC_KEY_PEM,
    signerFingerprint = TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
  } = {},
) => {
  const payload = Buffer.from(stableJsonString(record), "utf8");
  return {
    ...record,
    signature: {
      schema: BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA,
      algorithm: "ed25519",
      signerFingerprint,
      publicKeyPem,
      signedPayloadSha256: sha256Hex(payload),
      signature: sign(null, payload, privateKey).toString("base64"),
    },
  };
};
const groth16MaterialAttestationSignatureSummary = (record) => {
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
const defaultGroth16MaterialAttestationSigning = () => ({
  semanticSccpCircuit: {
    privateKey: TEST_ATTESTATION_SIGNER.privateKey,
    publicKeyPem: TEST_ATTESTATION_PUBLIC_KEY_PEM,
    signerFingerprint: TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
  },
  circuitSecurity: {
    privateKey: SECURITY_ATTESTATION_SIGNER.privateKey,
    publicKeyPem: SECURITY_ATTESTATION_PUBLIC_KEY_PEM,
    signerFingerprint: SECURITY_ATTESTATION_SIGNER_FINGERPRINT,
  },
  trustedSetup: {
    privateKey: SETUP_ATTESTATION_SIGNER.privateKey,
    publicKeyPem: SETUP_ATTESTATION_PUBLIC_KEY_PEM,
    signerFingerprint: SETUP_ATTESTATION_SIGNER_FINGERPRINT,
  },
  reproducibleBuild: {
    privateKey: REPRODUCIBLE_ATTESTATION_SIGNER.privateKey,
    publicKeyPem: REPRODUCIBLE_ATTESTATION_PUBLIC_KEY_PEM,
    signerFingerprint: REPRODUCIBLE_ATTESTATION_SIGNER_FINGERPRINT,
  },
});
const GROTH16_ATTESTATION_REFERENCE_SIGNERS = Object.freeze({
  "semantic-sccp-circuit-attestation": TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
  "circuit-security-audit": SECURITY_ATTESTATION_SIGNER_FINGERPRINT,
  "trusted-setup-ceremony": SETUP_ATTESTATION_SIGNER_FINGERPRINT,
  "reproducible-build-attestation": REPRODUCIBLE_ATTESTATION_SIGNER_FINGERPRINT,
});
const bytecodeSha256Hex = (bytecode) =>
  sha256Hex(Buffer.from(bytecode.slice(2), "hex"));
const bytecodeKeccak256Hex = (bytecode) =>
  `0x${Buffer.from(
    keccak_256(new Uint8Array(Buffer.from(bytecode.slice(2), "hex"))),
  ).toString("hex")}`;
const canonicalizeBscOfflineFullConfigTomlForHash = (toml) => {
  const normalized = String(toml ?? "").replace(/\r\n?/gu, "\n");
  const filtered = normalized
    .split("\n")
    .filter(
      (line) => !/^\s*post_deploy_offline_full_toml_sha256\s*=/u.test(line),
    )
    .join("\n");
  return filtered.endsWith("\n") ? filtered : `${filtered}\n`;
};
const repeatedHash = (byte) =>
  `0x${byte.toString(16).padStart(2, "0").repeat(32)}`;
const attestationHash = (label) => sha256Hex(Buffer.from(label, "utf8"));
const compiledContractArtifact = (key) => {
  const contractName = BSC_COMPILED_CONTRACTS[key];
  const bytecode = `0x${Buffer.from(
    `bsc compiled ${key} deployment bytecode `.repeat(80),
    "utf8",
  ).toString("hex")}`;
  const deployedBytecode = `0x${Buffer.from(
    `bsc compiled ${key} runtime bytecode `.repeat(60),
    "utf8",
  ).toString("hex")}`;
  return {
    file: `contracts/bsc/sccp/${contractName}.sol`,
    contractName,
    abi: [{ type: "function", name: `${key}Ready`, inputs: [] }],
    bytecode,
    deployedBytecode,
    bytecodeKeccak256: bytecodeKeccak256Hex(bytecode),
    deployedBytecodeKeccak256: bytecodeKeccak256Hex(deployedBytecode),
    bytecodeSha256: bytecodeSha256Hex(bytecode),
    deployedBytecodeSha256: bytecodeSha256Hex(deployedBytecode),
  };
};

const writeJson = (filePath, payload) =>
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

const withEnv = async (patch, fn) => {
  const original = new Map();
  for (const [key, value] of Object.entries(patch)) {
    original.set(key, {
      existed: Object.prototype.hasOwnProperty.call(process.env, key),
      value: process.env[key],
    });
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, saved] of original.entries()) {
      if (saved.existed) {
        process.env[key] = saved.value;
      } else {
        delete process.env[key];
      }
    }
  }
};

const proofMaterialBytes = (seed, sizeBytes = 96 * 1024) => {
  const bytes = Buffer.alloc(sizeBytes);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (seed + index * 37 + (index >> 3)) & 0xff;
  }
  return bytes;
};

const productionBurnRecordBytes = (seed, sizeBytes = 768) => {
  const chunks = [];
  let produced = 0;
  let counter = 0;
  while (produced < sizeBytes) {
    const chunk = createHash("sha256")
      .update(`sccp-bsc-burn-record:${seed}:${counter}`)
      .digest();
    chunks.push(chunk);
    produced += chunk.length;
    counter += 1;
  }
  return Buffer.concat(chunks).subarray(0, sizeBytes);
};

const productionBurnRecordMaterial = (seed = 0xe1) => {
  const bytes = productionBurnRecordBytes(seed);
  return {
    contractArtifactB64: bytes.toString("base64"),
    artifactSha256: sha256Hex(bytes),
  };
};

const tairaBurnRecordContractMaterial = ({
  burnRecord = productionBurnRecordMaterial(),
  routeId = SCCP_BSC_XOR_ROUTE_ID,
  assetKey = SCCP_BSC_XOR_ASSET_KEY,
  codeHash = HASH_11,
  abiHash = HASH_22,
  execution = {},
  manifest = {},
  rest = {},
} = {}) => ({
  schema: TAIRA_BURN_RECORD_CONTRACT_SCHEMA,
  route_id: routeId,
  asset_key: assetKey,
  source_name: "contracts/taira/sccp/TairaXorBscSccpBurnRecord.ko",
  compiler_fingerprint: "kotodama_lang/2.0.0-rc.2.0",
  code_hash: codeHash,
  abi_hash: abiHash,
  artifact_b64: burnRecord.contractArtifactB64,
  artifact_sha256: burnRecord.artifactSha256,
  vkRef: {
    backend: "halo2_ipa",
    name: "taira_bsc_xor_burn_record_v1",
  },
  manifest: {
    code_hash: `hash:${codeHash.slice(2).toUpperCase()}#D0E7`,
    abi_hash: `hash:${abiHash.slice(2).toUpperCase()}#4D00`,
    compiler_fingerprint: "kotodama_lang/2.0.0-rc.2.0",
    features_bitmap: 1,
    entrypoints: [
      {
        name: "burn_and_record",
        kind: { kind: "Public", value: null },
        params: [
          { name: "sender", type_name: "AccountId" },
          { name: "settlement_asset", type_name: "AssetDefinitionId" },
          { name: "amount", type_name: "int" },
          { name: "record_instruction", type_name: "Blob" },
        ],
        return_type: null,
        permission: "AssetTransferRole",
        read_keys: [],
        write_keys: [],
        access_hints_complete: true,
        access_hints_skipped: [],
        triggers: [],
      },
    ],
    access_set_hints: null,
    states: [],
    kotoba: null,
    provenance: null,
    ...manifest,
  },
  execution: {
    executable: "IvmProved",
    force_zk_mode: true,
    entrypoint: "burn_and_record",
    settlement_instruction: "Burn<Numeric, Asset>",
    record_instruction: "RecordSccpMessage",
    ...execution,
  },
  ...rest,
});

const snarkjsMaterialBytes = (seed, magic, sectionCount, sizeBytes) => {
  const headerBytes = 12;
  const sectionHeaderBytes = sectionCount * 12;
  if (sizeBytes <= headerBytes + sectionHeaderBytes + sectionCount) {
    throw new Error("snarkjs fixture size is too small");
  }
  const bytes = proofMaterialBytes(seed, sizeBytes);
  bytes.set(Buffer.from(magic, "ascii"), 0);
  bytes.writeUInt32LE(1, 4);
  bytes.writeUInt32LE(sectionCount, 8);
  const payloadBytes = sizeBytes - headerBytes - sectionHeaderBytes;
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
  if (offset !== sizeBytes) {
    throw new Error("snarkjs fixture sections do not fill the file");
  }
  return bytes;
};

const setSnarkjsSectionId = (bytes, sectionIndex, sectionId) => {
  const sectionCount = bytes.readUInt32LE(8);
  let offset = 12;
  for (let index = 0; index < sectionCount; index += 1) {
    if (index === sectionIndex) {
      bytes.writeUInt32LE(sectionId, offset);
      return;
    }
    const sectionSize = Number(bytes.readBigUInt64LE(offset + 4));
    offset += 12 + sectionSize;
  }
  throw new Error(`section index ${sectionIndex} is out of range`);
};

const proofArtifactMaterialBytes = (seed, sizeBytes = 96 * 1024) =>
  snarkjsMaterialBytes(seed, "r1cs", 3, sizeBytes);

const provingKeyMaterialBytes = (seed, sizeBytes = 96 * 1024) =>
  snarkjsMaterialBytes(seed, "zkey", 10, sizeBytes);

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
  profile = BSC_PROFILES.testnet,
  productionAttestationHash = attestationHash(
    `${profile.chain} material parity production attestation`,
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
    schema: profile.paritySchema,
    domain: SCCP_DOMAIN_BSC,
    chain: profile.chain,
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
  profile = BSC_PROFILES.testnet,
  productionAttestationHash = attestationHash(
    `${profile.chain} material self-test production attestation`,
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
    schema: profile.selfTestSchema,
    domain: SCCP_DOMAIN_BSC,
    chain: profile.chain,
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

const nativeBundleRouteManifest = (
  routeDeployment,
  profile = BSC_PROFILES.testnet,
) => {
  const destinationBindingKey = bscDestinationBindingKey({
    networkId: profile.networkIdHex,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: routeDeployment.verifierCodeHash,
    verifierKeyHash: routeDeployment.verifierKeyHash,
  });
  return {
    schema: ROUTE_MANIFEST_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    counterpartyDomain: SCCP_DOMAIN_BSC,
    verifierTarget: "EvmContract",
    productionReady: true,
    bscBridgeAddress: BSC_BRIDGE_ADDRESS,
    bscTokenAddress: BSC_TOKEN_ADDRESS,
    sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    bscVerifierAddress: BSC_VERIFIER_ADDRESS,
    destinationRollout: {
      version: 1,
      destinationNetworkId: profile.networkIdHex,
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
      networkIdHex: profile.networkIdHex,
      key: destinationBindingKey,
      bindingHash: routeDeployment.destinationBindingHash,
    },
  };
};

const writeGeneratedNativeProverBundle = async ({
  root,
  routeDeployment,
  proofArtifactBytes,
  provingKeyBytes,
  verifierKeyBytes,
  profile = BSC_PROFILES.testnet,
} = {}) => {
  const artifactRoot = path.join(root, "native-prover");
  await mkdir(artifactRoot, { recursive: true });
  const writeArtifact = async (relativePath, bytes) => {
    const filePath = path.join(artifactRoot, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    return filePath;
  };
  const snarkjsStubPath = path.join(root, "bsc-snarkjs-runner.sh");
  const snarkjsStubBytes = Buffer.from(
    [
      "#!/bin/sh",
      'if [ "$1" = "groth16" ] && [ "$2" = "verify" ]; then',
      "  exit 0",
      "fi",
      "exit 1",
      "",
    ].join("\n"),
    "utf8",
  );
  await writeFile(snarkjsStubPath, snarkjsStubBytes, { mode: 0o755 });
  const reproducibleBuildOptions = {
    snarkjsBinary: snarkjsStubPath,
    snarkjsBinarySha256: sha256Hex(snarkjsStubBytes),
  };
  await writeArtifact("proof-artifact.r1cs", proofArtifactBytes);
  await writeArtifact("proving-key.zkey", provingKeyBytes);
  await writeArtifact("groth16-key-material.json", verifierKeyBytes);
  const snarkjsVerificationKeyBytes = jsonFixtureBytes({
    protocol: "groth16",
    curve: "bn128",
    source: `${profile.chain}-full-message-snarkjs-verification-key`,
    publicSignals: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
    checksum: attestationHash(`${profile.key}:snarkjs-verification-key`),
  });
  await writeArtifact(
    "native-prover/verification_key.json",
    snarkjsVerificationKeyBytes,
  );
  const nativeBundleMaterial = {
    proofArtifactUrl: "proof-artifact.r1cs",
    provingKeyUrl: "proving-key.zkey",
    verifierKeyUrl: "groth16-key-material.json",
    verifierKeyArtifactHash: sha256Hex(verifierKeyBytes),
    snarkjsVerificationKeyArtifactHash: sha256Hex(snarkjsVerificationKeyBytes),
  };

  const binding = {
    proofArtifactHash: routeDeployment.proofArtifactHash,
    provingKeyHash: routeDeployment.provingKeyHash,
    verifierKeyHash: routeDeployment.verifierKeyHash,
    destinationBindingHash: routeDeployment.destinationBindingHash,
  };
  await writeArtifact(
    "cross-sdk-parity.json",
    Buffer.from(
      `${JSON.stringify(
        nativeProverParityFixture({ ...binding, profile }),
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
        nativeProverSelfTestFixture({ ...binding, profile }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  const sdkImplementationArtifacts = [];
  for (const [index, [sdk, implementation]] of Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  ).entries()) {
    const relativePath = `${sdk}/implementation.native`;
    const bytes = proofMaterialBytes(0xc0 + index, 2048);
    await writeArtifact(relativePath, bytes);
    sdkImplementationArtifacts.push({
      sdk,
      implementation,
      path: relativePath,
      sha256: sha256Hex(bytes),
      sizeBytes: bytes.length,
    });
  }
  await writeArtifact(
    "source-parity-attestation.json",
    jsonFixtureBytes(sourceParityAttestationArtifact(profile)),
  );
  await writeArtifact(
    "no-wasm-no-remote.scan",
    jsonFixtureBytes(
      noWasmNoRemoteScanArtifact(profile, sdkImplementationArtifacts),
    ),
  );

  const routeManifestPath = path.join(root, "native-prover-route.input");
  await writeJson(
    routeManifestPath,
    nativeBundleRouteManifest(routeDeployment, profile),
  );
  const groth16MaterialManifestPath = await writeGroth16MaterialManifest({
    root: artifactRoot,
    routeDeployment,
    nativeBundle: nativeBundleMaterial,
    profile,
    writeAttestationFiles: true,
    reproducibleBuildOptions,
  });
  const groth16MaterialManifest = path
    .relative(artifactRoot, groth16MaterialManifestPath)
    .replace(/\\/gu, "/");
  const groth16MaterialManifestBytes = await readFile(
    groth16MaterialManifestPath,
  );
  const groth16MaterialManifestRecord = JSON.parse(
    groth16MaterialManifestBytes.toString("utf8"),
  );
  const circuitSecurityAttestationPath =
    groth16MaterialManifestRecord.attestations.circuitSecurity.path;
  const reproducibleBuildAttestationPath =
    groth16MaterialManifestRecord.attestations.reproducibleBuild.path;
  const materialManifestHash = sha256Hex(groth16MaterialManifestBytes);
  await writeArtifact(
    "cross-sdk-parity.json",
    Buffer.from(
      `${JSON.stringify(
        nativeProverParityFixture({
          ...binding,
          profile,
          productionAttestationHash:
            bscNativeProverReportProductionAttestationHash(
              "cross-sdk-parity",
              materialManifestHash,
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
          profile,
          productionAttestationHash:
            bscNativeProverReportProductionAttestationHash(
              "native-prover-self-test",
              materialManifestHash,
            ),
        }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  await writeArtifact(
    "groth16-proof-self-test.json",
    Buffer.from(
      `${JSON.stringify(
        groth16ProofSelfTestReportFixture({
          manifest: groth16MaterialManifestRecord,
          manifestPath: groth16MaterialManifestPath,
          manifestSha256: materialManifestHash,
          nativeBundle: nativeBundleMaterial,
          profile,
          root: artifactRoot,
        }),
        null,
        2,
      )}\n`,
      "utf8",
    ),
  );
  const result = await buildBscNativeEvmProverBundleFromArtifacts({
    "route-manifest": routeManifestPath,
    "artifact-root": artifactRoot,
    "proof-artifact": "proof-artifact.r1cs",
    "proving-key": "proving-key.zkey",
    "verifier-key": "groth16-key-material.json",
    "groth16-material-manifest": groth16MaterialManifest,
    "groth16-proof-self-test": "groth16-proof-self-test.json",
    "snarkjs-bin": snarkjsStubPath,
    "trusted-attestation-signer":
      TRUSTED_ATTESTATION_SIGNER_FINGERPRINTS.join(","),
    "cross-sdk-parity": "cross-sdk-parity.json",
    "native-prover-self-test": "native-prover-self-test.json",
    "javascript-implementation": "javascript/implementation.native",
    "swift-implementation": "swift/implementation.native",
    "kotlin-implementation": "kotlin/implementation.native",
    "java-android-implementation": "java-android/implementation.native",
    "dotnet-implementation": "dotnet/implementation.native",
    "audit-circuit-security": circuitSecurityAttestationPath,
    "audit-native-implementation": "source-parity-attestation.json",
    "audit-reproducible-build": reproducibleBuildAttestationPath,
    "audit-no-wasm-no-remote-scan": "no-wasm-no-remote.scan",
  });
  await rm(path.join(artifactRoot, "native-prover"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(artifactRoot, "artifacts"), {
    recursive: true,
    force: true,
  });
  await rm(path.join(artifactRoot, "source-parity-attestation.json"), {
    force: true,
  });
  const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
    profile.validateBundle(result.bundle, {
      expectedDestinationBindingHash: routeDeployment.destinationBindingHash,
    }),
  );
  const nativeBundlePath = path.join(artifactRoot, profile.nativeBundleFile);
  await writeJson(nativeBundlePath, result.bundle);
  return {
    artifactRoot,
    nativeBundlePath,
    nativeBundleUrl: `native-prover/${profile.nativeBundleFile}`,
    nativeEvmProverBundleHash,
    proofArtifactPath: path.join(artifactRoot, "proof-artifact.r1cs"),
    proofArtifactUrl: "native-prover/proof-artifact.r1cs",
    provingKeyPath: path.join(artifactRoot, "proving-key.zkey"),
    provingKeyUrl: "native-prover/proving-key.zkey",
    verifierKeyPath: path.join(artifactRoot, "groth16-key-material.json"),
    verifierKeyUrl: "native-prover/groth16-key-material.json",
    verifierKeyArtifactHash: sha256Hex(verifierKeyBytes),
  };
};

const bindNativeProverReportsToManifest = async ({
  nativeBundle,
  routeDeployment,
  groth16MaterialManifestPath,
  profile = BSC_PROFILES.testnet,
}) => {
  const materialManifestHash = sha256Hex(
    await readFile(groth16MaterialManifestPath),
  );
  const materialManifest = JSON.parse(
    await readFile(groth16MaterialManifestPath, "utf8"),
  );
  const updates = [
    {
      fileName: "cross-sdk-parity.json",
      auditHashKey: "cross_sdk_parity",
      kind: "cross-sdk-parity",
    },
    {
      fileName: "native-prover-self-test.json",
      auditHashKey: "native_prover_self_test",
      kind: "native-prover-self-test",
    },
  ];
  const updatedAuditHashes = {};
  for (const { fileName, auditHashKey, kind } of updates) {
    const artifactPath = path.join(nativeBundle.artifactRoot, fileName);
    const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
    artifact.production_attestation_hash =
      bscNativeProverReportProductionAttestationHash(
        kind,
        materialManifestHash,
      );
    await writeJson(artifactPath, artifact);
    updatedAuditHashes[auditHashKey] = sha256Hex(await readFile(artifactPath));
  }
  const proofSelfTestPath = path.join(
    nativeBundle.artifactRoot,
    "groth16-proof-self-test.json",
  );
  await writeJson(
    proofSelfTestPath,
    groth16ProofSelfTestReportFixture({
      manifest: materialManifest,
      manifestPath: groth16MaterialManifestPath,
      manifestSha256: materialManifestHash,
      nativeBundle,
      profile,
      root: nativeBundle.artifactRoot,
    }),
  );

  const bundle = JSON.parse(
    await readFile(nativeBundle.nativeBundlePath, "utf8"),
  );
  bundle.groth16_proof_self_test_hash = sha256Hex(
    await readFile(proofSelfTestPath),
  );
  bundle.audit_hashes = {
    ...bundle.audit_hashes,
    ...updatedAuditHashes,
  };
  await writeJson(nativeBundle.nativeBundlePath, bundle);

  const nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
    profile.validateBundle(bundle, {
      expectedDestinationBindingHash: routeDeployment.destinationBindingHash,
    }),
  );
  nativeBundle.nativeEvmProverBundleHash = nativeEvmProverBundleHash;
  routeDeployment.nativeEvmProverBundleHash = nativeEvmProverBundleHash;
  return nativeEvmProverBundleHash;
};

const groth16AttestationRef = (profile, key, schema) => ({
  path: `artifacts/sccp-bsc/native-prover/${profile.key}/${key}.json`,
  sha256: attestationHash(`${profile.key}:${key}:attestation`),
  schema,
  signature: {
    verified: true,
    algorithm: "ed25519",
    signerFingerprint:
      GROTH16_ATTESTATION_REFERENCE_SIGNERS[key] ??
      TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
    signedPayloadSha256: attestationHash(
      `${profile.key}:${key}:attestation-payload`,
    ),
  },
});

const groth16TranscriptPath = (profile, fileName) =>
  `artifacts/sccp-bsc/native-prover/${profile.key}/${fileName}`;

const jsonFixtureBytes = (value) =>
  Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");

const groth16TrustedSetupTranscript = (profile) => ({
  schema: "iroha-sccp-bsc-trusted-setup-transcript/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bscNetwork: profile.key,
  chain: profile.chain,
  chainIdHex: profile.chainIdHex,
  networkIdHex: profile.networkIdHex,
  contributors: [
    `${profile.key}-ceremony-contributor-alpha`,
    `${profile.key}-ceremony-contributor-beta`,
  ],
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

const groth16ReproducibleBuildTranscript = (
  profile,
  {
    snarkjsBinary = "snarkjs",
    snarkjsBinarySha256 = attestationHash(`${profile.key}:snarkjs-binary`),
  } = {},
) => ({
  schema: "iroha-sccp-bsc-reproducible-build-transcript/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bscNetwork: profile.key,
  chain: profile.chain,
  chainIdHex: profile.chainIdHex,
  networkIdHex: profile.networkIdHex,
  independentRebuilders: [
    `${profile.key}-independent-rebuilder-alpha`,
    `${profile.key}-independent-rebuilder-beta`,
  ],
  reproducible: true,
  toolchain: {
    snarkjs: {
      binary: snarkjsBinary,
      binarySha256: snarkjsBinarySha256,
    },
    circom: {
      binary: "circom2",
      binarySha256: attestationHash(`${profile.key}:circom-binary`),
    },
  },
  zkeyVerify: true,
  zkeyVerifyResult: "ZKey Ok!",
  r1csInfoSource: "snarkjs-cli",
  r1csPublicInputCount: 9,
  r1csConstraintCount: 8192,
});

const groth16TranscriptHash = (record) => sha256Hex(jsonFixtureBytes(record));
const groth16ReproducibleBuildToolchainSha256 = (profile, options = {}) =>
  sha256Hex(
    Buffer.from(
      stableJsonString(
        groth16ReproducibleBuildTranscript(profile, options).toolchain,
      ),
      "utf8",
    ),
  );

const groth16MaterialManifestFixture = ({
  routeDeployment,
  nativeBundle,
  profile = BSC_PROFILES.testnet,
  overrides = {},
  reproducibleBuildOptions = {},
} = {}) => {
  const trustedSetupTranscript = groth16TrustedSetupTranscript(profile);
  const reproducibleBuildTranscript = groth16ReproducibleBuildTranscript(
    profile,
    reproducibleBuildOptions,
  );
  return {
    schema: BSC_GROTH16_MATERIAL_MANIFEST_SCHEMA,
    generatedAt: "2026-06-22T00:00:00.000Z",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
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
        path: "native-prover/full-sccp-message.circom",
        sha256: attestationHash(
          `${profile.key}:full-sccp-message-circuit-source`,
        ),
      },
      r1cs: {
        path: nativeBundle.proofArtifactUrl,
        sha256: routeDeployment.proofArtifactHash,
      },
      provingKey: {
        path: nativeBundle.provingKeyUrl,
        sha256: routeDeployment.provingKeyHash,
      },
      powersOfTau: {
        path: "native-prover/powersOfTau28_hez_final_22.ptau",
        sha256: attestationHash(`${profile.key}:powers-of-tau`),
      },
      snarkjsVerificationKey: {
        path: "native-prover/verification_key.json",
        sha256:
          nativeBundle.snarkjsVerificationKeyArtifactHash ??
          attestationHash(`${profile.key}:snarkjs-verification-key`),
      },
      bscVerifierKey: {
        path: nativeBundle.verifierKeyUrl,
        sha256: nativeBundle.verifierKeyArtifactHash,
      },
      trustedSetupTranscript: {
        path: groth16TranscriptPath(profile, "trusted-setup-transcript.json"),
        sha256: groth16TranscriptHash(trustedSetupTranscript),
      },
      reproducibleBuildTranscript: {
        path: groth16TranscriptPath(
          profile,
          "reproducible-build-transcript.json",
        ),
        sha256: groth16TranscriptHash(reproducibleBuildTranscript),
      },
    },
    trustedSetup: {
      localPowersOfTau: false,
      localPhase2Contribution: false,
      contributionMaterialPersisted: false,
    },
    selfChecks: {
      snarkjs: {
        snarkjsBinary: reproducibleBuildTranscript.toolchain.snarkjs.binary,
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
      trustedSignerFingerprints: TRUSTED_ATTESTATION_SIGNER_FINGERPRINTS,
    },
    attestations: {
      semanticSccpCircuit: groth16AttestationRef(
        profile,
        "semantic-sccp-circuit-attestation",
        BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA,
      ),
      circuitSecurity: groth16AttestationRef(
        profile,
        "circuit-security-audit",
        BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA,
      ),
      trustedSetup: groth16AttestationRef(
        profile,
        "trusted-setup-ceremony",
        BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA,
      ),
      reproducibleBuild: groth16AttestationRef(
        profile,
        "reproducible-build-attestation",
        BSC_GROTH16_REPRODUCIBLE_BUILD_ATTESTATION_SCHEMA,
      ),
    },
    ...overrides,
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

const groth16MaterialAttestationRecord = ({
  manifest,
  nativeBundle,
  profile,
  schema,
  extra,
  reproducibleBuildToolchainSha256 = groth16ReproducibleBuildToolchainSha256(
    profile,
  ),
}) => {
  const snarkjs = manifest.selfChecks.snarkjs;
  const semanticFields =
    schema === BSC_GROTH16_SEMANTIC_ATTESTATION_SCHEMA
      ? {
          semanticReviewEvidenceSchema:
            BSC_GROTH16_SEMANTIC_REVIEW_EVIDENCE_SCHEMA,
          semanticReviewEvidenceSha256: attestationHash(
            `${profile.key}:semantic-review-evidence`,
          ),
          semanticReviewReportSha256: attestationHash(
            `${profile.key}:semantic-review-report`,
          ),
        }
      : {};
  const securityFields =
    schema === BSC_GROTH16_CIRCUIT_SECURITY_ATTESTATION_SCHEMA
      ? {
          circuitSecurityAuditEvidenceSchema:
            BSC_GROTH16_CIRCUIT_SECURITY_AUDIT_EVIDENCE_SCHEMA,
          circuitSecurityAuditEvidenceSha256: attestationHash(
            `${profile.key}:circuit-security-audit-evidence`,
          ),
          circuitSecurityAuditReportSha256: attestationHash(
            `${profile.key}:circuit-security-audit-report`,
          ),
        }
      : {};
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
          zkeyVerify: snarkjs.zkeyVerify,
          zkeyVerifyResult: snarkjs.zkeyVerifyResult,
          zkeyVerificationKeyExport: snarkjs.zkeyVerificationKeyExport,
          verifierKeyHashMatches: snarkjs.verifierKeyHashMatches,
          exportedVerifierKeyHash: snarkjs.exportedVerifierKeyHash,
          r1csInfoSource: snarkjs.r1csInfoSource,
          r1csPublicInputCount: snarkjs.r1csPublicInputCount,
          r1csConstraintCount: snarkjs.r1csConstraintCount,
        }
      : {};
  return {
    schema,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: SCCP_PROOF_FAMILY_STARK_FRI,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    publicInputCount: 9,
    publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
    verifierKeyHash: manifest.verifierKeyHash,
    circuitSourceSha256: manifest.artifacts.circuitSource.sha256,
    r1csSha256: manifest.artifacts.r1cs.sha256,
    powersOfTauSha256: manifest.artifacts.powersOfTau.sha256,
    provingKeySha256: manifest.artifacts.provingKey.sha256,
    snarkjsVerificationKeySha256:
      manifest.artifacts.snarkjsVerificationKey.sha256,
    bscVerifierKeySha256: nativeBundle.verifierKeyArtifactHash,
    ...semanticFields,
    ...securityFields,
    ...trustedSetupFields,
    ...reproducibleFields,
    ...extra,
  };
};

const groth16AttestationRequestRole = ({
  body,
  signerRole,
  readyForSignature = true,
  blockers = [],
}) => {
  const signedPayloadSha256 = sha256Hex(
    Buffer.from(stableJsonString(body), "utf8"),
  );
  return {
    signerRole,
    attestationSchema: body.schema,
    readyForSignature,
    blockers,
    signedPayloadSha256,
    body,
    signatureTemplate: {
      schema: BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA,
      algorithm: "ed25519",
      signerFingerprint: "<sha256-of-ed25519-spki-public-key>",
      publicKeyPem: "<ed25519-spki-public-key-pem>",
      signedPayloadSha256,
      signature: "<base64-ed25519-signature-over-canonical-body-json>",
    },
  };
};

const groth16AttestationRequestPackageFixture = ({
  manifest,
  manifestPath,
  manifestSha256,
  nativeBundle,
  profile,
  root,
  reproducibleBuildToolchainSha256 = groth16ReproducibleBuildToolchainSha256(
    profile,
  ),
}) => {
  const roleBodies = Object.fromEntries(
    groth16MaterialAttestationRows().map(([key, , schema, extra]) => [
      key,
      groth16MaterialAttestationRecord({
        manifest,
        nativeBundle,
        profile,
        schema,
        extra,
        reproducibleBuildToolchainSha256,
      }),
    ]),
  );
  const requestPath = path.relative(root, manifestPath).replace(/\\/gu, "/");
  return {
    schema: BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA,
    manifest: {
      path: requestPath,
      sha256: manifestSha256,
      generatedAt: manifest.generatedAt,
      productionReady: manifest.productionReady === true,
      productionBlockers: [...manifest.productionBlockers],
    },
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: "stark-fri-v1",
    publicInputCount: 9,
    publicSignalNames: [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES],
    verifierKeyHash: manifest.verifierKeyHash,
    artifacts: manifest.artifacts,
    roles: {
      semanticSccpCircuit: groth16AttestationRequestRole({
        signerRole: "semantic-sccp-circuit-reviewer",
        body: roleBodies.semanticSccpCircuit,
      }),
      circuitSecurity: groth16AttestationRequestRole({
        signerRole: "circuit-security-auditor",
        body: roleBodies.circuitSecurity,
      }),
      trustedSetup: groth16AttestationRequestRole({
        signerRole: "trusted-setup-ceremony-attester",
        body: roleBodies.trustedSetup,
      }),
      reproducibleBuild: groth16AttestationRequestRole({
        signerRole: "independent-reproducible-build-attester",
        body: roleBodies.reproducibleBuild,
      }),
    },
    signingInstructions: {
      signatureSchema: BSC_GROTH16_ATTESTATION_SIGNATURE_SCHEMA,
      algorithm: "ed25519",
      payloadEncoding: "canonical JSON of role.body",
      signedPayloadSha256:
        "sha256(canonical-json(role.body)) must equal role.signedPayloadSha256",
      finalAttestationShape:
        "copy role.body and add a signature object matching role.signatureTemplate",
      mustNotSignWhenReadyForSignatureIsFalse: true,
    },
  };
};

const groth16AttestationHandoffFixture = ({
  manifest,
  manifestPath,
  manifestSha256,
  requestPath,
  requestSha256,
  profile,
  root,
}) => {
  const manifestProductionBlockers = Array.isArray(manifest.productionBlockers)
    ? [...manifest.productionBlockers]
    : [];
  const manifestProductionReady =
    manifest.productionReady === true &&
    manifestProductionBlockers.length === 0;
  const requestRelativePath = path
    .relative(root, requestPath)
    .replace(/\\/gu, "/");
  const manifestRelativePath = path
    .relative(root, manifestPath)
    .replace(/\\/gu, "/");
  const requestReadyForSignature = Object.fromEntries(
    groth16MaterialAttestationRows().map(([key]) => [key, true]),
  );
  return {
    schema: BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA,
    generatedAt: "2026-06-25T00:00:00.000Z",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    verifierKeyHash: manifest.verifierKeyHash,
    manifest: {
      path: manifestRelativePath,
      sha256: manifestSha256,
      productionReady: manifestProductionReady,
      productionBlockers: manifestProductionBlockers,
    },
    packages: {
      transcriptTemplates: {
        path: `${profile.key}-bsc-groth16-transcript-templates.json`,
        sha256: attestationHash(
          `${profile.key}:groth16-transcript-template-package`,
        ),
        schema: "iroha-sccp-bsc-groth16-transcript-template-package/v1",
        draftsAreNotProductionReady: true,
      },
      evidenceTemplates: {
        path: `${profile.key}-bsc-groth16-evidence-templates.json`,
        sha256: attestationHash(
          `${profile.key}:groth16-evidence-template-package`,
        ),
        schema: "iroha-sccp-bsc-groth16-evidence-template-package/v1",
        draftsAreNotSignable: true,
      },
      attestationRequest: {
        path: requestRelativePath,
        sha256: requestSha256,
        schema: BSC_GROTH16_ATTESTATION_REQUEST_PACKAGE_SCHEMA,
      },
    },
    readiness: {
      handoffComplete: true,
      productionReady: manifestProductionReady,
      signingReady: true,
      readyToFinalize: false,
      requestValid: true,
      requestReadyForSignature,
      missingSignedRoles: Object.keys(requestReadyForSignature),
      problemCount: Object.keys(requestReadyForSignature).length,
      handoffBlockers: [],
      attestationStatusProblems: Object.keys(requestReadyForSignature).map(
        (role) => `${role} signed attestation file is missing`,
      ),
      productionBlockers: manifestProductionBlockers,
      nextActions: [
        "Sign the missing ready role payloads: semanticSccpCircuit, circuitSecurity, trustedSetup, reproducibleBuild.",
        "Run finalize-attestations with the same request, signed role files, and trusted signer fingerprints.",
      ],
    },
    commands: {
      verifyHandoff:
        "node scripts/sccp_bsc_groth16_material.mjs verify-handoff --handoff <attestation-handoff.json> --trusted-attestation-signer <0x...>",
      attestationStatus:
        "node scripts/sccp_bsc_groth16_material.mjs attestation-status --request <attestation-request.json> --trusted-attestation-signer <0x...>",
      signAttestation:
        "node scripts/sccp_bsc_groth16_material.mjs sign-attestation --request <attestation-request.json> --role semanticSccpCircuit|circuitSecurity|trustedSetup|reproducibleBuild --private-key-pem <ed25519-private-key.pem> --out <signed-role-attestation.json>",
      finalizeAttestations:
        "node scripts/sccp_bsc_groth16_material.mjs finalize-attestations --request <attestation-request.json> --semantic-attestation <semantic-sccp-circuit-attestation.json> --circuit-security-attestation <circuit-security-audit.json> --trusted-setup-attestation <trusted-setup-ceremony.json> --reproducible-build-attestation <reproducible-build-attestation.json> --trusted-attestation-signer <0x...> --out-dir <native-prover-artifact-root>",
    },
  };
};

const groth16ProofSelfTestReportFixture = ({
  manifest,
  manifestPath,
  manifestSha256,
  nativeBundle,
  profile,
  root,
}) => {
  const sample = bscGroth16DeterministicProofSelfTestSample(profile);
  const proof = {
    pi_a: ["1", "2", "1"],
    pi_b: [
      ["1", "2"],
      ["3", "4"],
      ["1", "0"],
    ],
    pi_c: ["5", "6", "1"],
    protocol: "groth16",
    curve: "bn128",
  };
  return {
    schema: BSC_GROTH16_PROOF_SELF_TEST_SCHEMA,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    circuitProfile: BSC_FULL_SCCP_CIRCUIT_PROFILE,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: SCCP_PROOF_FAMILY_STARK_FRI,
    manifest: {
      path: path.relative(root, manifestPath).replace(/\\/gu, "/"),
      sha256: manifestSha256,
      productionReady: manifest.productionReady === true,
      productionBlockers: [...manifest.productionBlockers],
    },
    artifacts: {
      circuitSource: {
        path: manifest.artifacts.circuitSource.path,
        sha256: manifest.artifacts.circuitSource.sha256,
      },
      r1cs: {
        path: manifest.artifacts.r1cs.path,
        sha256: manifest.artifacts.r1cs.sha256,
      },
      provingKey: {
        path: manifest.artifacts.provingKey.path,
        sha256: manifest.artifacts.provingKey.sha256,
      },
      snarkjsVerificationKey: {
        path: manifest.artifacts.snarkjsVerificationKey.path,
        sha256: manifest.artifacts.snarkjsVerificationKey.sha256,
      },
      bscVerifierKey: {
        path: nativeBundle.verifierKeyUrl,
        sha256: nativeBundle.verifierKeyArtifactHash,
      },
      witnessWasm: {
        path: "native-prover/sccp-bsc-full-message-v1.wasm",
        sha256: attestationHash(`${profile.key}:proof-self-test-witness-wasm`),
      },
    },
    sample: {
      id: sample.sampleId,
      syntheticInputWords: sample.syntheticInputWords,
      publicSignalNames: sample.publicSignalNames,
      publicSignalWords: sample.publicSignalWords,
      inputSha256: sample.inputSha256,
    },
    publicSignals: sample.publicSignalWords,
    snarkjs: {
      wtnsCalculate: true,
      groth16Prove: true,
      groth16Verify: true,
    },
    adversarialChecks: {
      publicSignalMismatch: {
        attempted: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length,
        rejected: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length,
        cases: BSC_GROTH16_PUBLIC_SIGNAL_NAMES.map((name, index) => ({
          index,
          name,
          phase: "wtnsCalculate",
          rejected: true,
        })),
      },
      nonBooleanValueBit: {
        attempted: 1,
        rejected: 1,
        case: {
          signalName: BSC_GROTH16_PUBLIC_SIGNAL_NAMES[0],
          inputName: "messageIdBits",
          bitIndex: 0,
          phase: "wtnsCalculate",
          rejected: true,
        },
      },
    },
    witnessHash: attestationHash(`${profile.key}:proof-self-test-witness`),
    proofHash: sha256Hex(Buffer.from(stableJsonString(proof), "utf8")),
    publicSignalsHash: sha256Hex(
      Buffer.from(stableJsonString(sample.publicSignalWords), "utf8"),
    ),
    proof,
  };
};

const writeGroth16MaterialAttestationFiles = async ({
  root,
  manifest,
  nativeBundle,
  profile,
  basePath = `artifacts/sccp-bsc/native-prover/${profile.key}`,
  signingByRole = {},
  reproducibleBuildToolchainSha256 = groth16ReproducibleBuildToolchainSha256(
    profile,
  ),
}) => {
  const references = {};
  const signing = {
    ...defaultGroth16MaterialAttestationSigning(),
    ...signingByRole,
  };
  for (const [
    key,
    fileStem,
    schema,
    extra,
  ] of groth16MaterialAttestationRows()) {
    const record = groth16MaterialAttestationRecord({
      manifest,
      nativeBundle,
      profile,
      schema,
      extra,
      reproducibleBuildToolchainSha256,
    });
    const signedRecord = signGroth16MaterialAttestationRecord(
      record,
      signing[key],
    );
    const bytes = Buffer.from(
      `${JSON.stringify(signedRecord, null, 2)}\n`,
      "utf8",
    );
    const relativePath = `${basePath}/${fileStem}.json`;
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, bytes);
    references[key] = {
      path: relativePath,
      schema,
      sha256: sha256Hex(bytes),
      signature: groth16MaterialAttestationSignatureSummary(signedRecord),
    };
  }
  return references;
};

const writeGroth16MaterialManifest = async ({
  root,
  routeDeployment,
  nativeBundle,
  profile = BSC_PROFILES.testnet,
  overrides = {},
  writeAttestationFiles = true,
  writeAttestationRequestPackage = true,
  reproducibleBuildOptions = {},
}) => {
  const manifestPath = path.join(
    root,
    "native-prover",
    profile.key,
    `${profile.key}-bsc-groth16-material.manifest.json`,
  );
  await mkdir(path.dirname(manifestPath), { recursive: true });
  const manifest = groth16MaterialManifestFixture({
    routeDeployment,
    nativeBundle,
    profile,
    overrides,
    reproducibleBuildOptions,
  });
  const reproducibleBuildToolchainSha256 =
    groth16ReproducibleBuildToolchainSha256(profile, reproducibleBuildOptions);
  for (const [artifactKey, record] of [
    ["trustedSetupTranscript", groth16TrustedSetupTranscript(profile)],
    [
      "reproducibleBuildTranscript",
      groth16ReproducibleBuildTranscript(profile, reproducibleBuildOptions),
    ],
  ]) {
    const relativePath = manifest.artifacts?.[artifactKey]?.path;
    if (!relativePath) {
      continue;
    }
    const filePath = path.join(root, relativePath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, jsonFixtureBytes(record));
  }
  if (writeAttestationFiles) {
    manifest.attestations = await writeGroth16MaterialAttestationFiles({
      root,
      manifest,
      nativeBundle,
      profile,
      reproducibleBuildToolchainSha256,
    });
  }
  await writeJson(manifestPath, manifest);
  if (writeAttestationRequestPackage) {
    const manifestSha256 = sha256Hex(await readFile(manifestPath));
    const requestPath = groth16AttestationRequestPackagePath(
      manifestPath,
      profile,
    );
    await writeJson(
      requestPath,
      groth16AttestationRequestPackageFixture({
        manifest,
        manifestPath,
        manifestSha256,
        nativeBundle,
        profile,
        root,
        reproducibleBuildToolchainSha256,
      }),
    );
    const requestSha256 = sha256Hex(await readFile(requestPath));
    await writeJson(
      groth16AttestationHandoffPath(manifestPath, profile),
      groth16AttestationHandoffFixture({
        manifest,
        manifestPath,
        manifestSha256,
        requestPath,
        requestSha256,
        profile,
        root,
      }),
    );
  }
  return manifestPath;
};

const groth16AttestationRequestPackagePath = (manifestPath, profile) =>
  path.join(
    path.dirname(manifestPath),
    `${profile.key}-bsc-groth16-attestation-request.json`,
  );

const groth16AttestationHandoffPath = (manifestPath, profile) =>
  path.join(
    path.dirname(manifestPath),
    `${profile.key}-bsc-groth16-attestation-handoff.json`,
  );

const sidecarManifest = ({
  moduleUrl,
  moduleSha256,
  direction,
  deploymentInfo = deployment(),
  profile = BSC_PROFILES.testnet,
}) => ({
  schema: "iroha-demo-sccp-bsc-browser-prover-manifest/v1",
  moduleUrl,
  kind: direction === "source" ? "bsc-source" : "bsc-destination",
  direction: direction === "source" ? "bsc-to-taira" : "taira-to-bsc",
  exports:
    direction === "source"
      ? ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"]
      : ["bscSccpProve", "bscSccpNativeProverSelfTest"],
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  tairaChainId: BSC_TAIRA_CHAIN_ID,
  tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
  bscNetwork: profile.key,
  bscChain: profile.chain,
  bscChainIdHex: profile.chainIdHex,
  bscNetworkIdHex: profile.networkIdHex,
  moduleSha256,
  proofArtifactHash: deploymentInfo.proofArtifactHash,
  provingKeyHash: deploymentInfo.provingKeyHash,
  nativeEvmProverBundleHash: deploymentInfo.nativeEvmProverBundleHash,
  deployment: {
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    tokenAddress: BSC_TOKEN_ADDRESS,
    sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    verifierCodeHash: deploymentInfo.verifierCodeHash,
    verifierKeyHash: deploymentInfo.verifierKeyHash,
    proofArtifactHash: deploymentInfo.proofArtifactHash,
    provingKeyHash: deploymentInfo.provingKeyHash,
    nativeEvmProverBundleHash: deploymentInfo.nativeEvmProverBundleHash,
    destinationBindingHash: deploymentInfo.destinationBindingHash,
  },
  postDeployLiveEvidence: postDeployLiveEvidence({}, profile),
});

const productionRequirementsArtifact = (profile = BSC_PROFILES.testnet) => ({
  schema: "iroha-sccp-bsc-taira-xor-production-requirements/v1",
  routeId: SCCP_BSC_XOR_ROUTE_ID,
  assetKey: SCCP_BSC_XOR_ASSET_KEY,
  bsc: {
    network: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    explorerUrl: profile.explorerUrl,
    explorerHost: profile.explorerHost,
  },
  commands: {
    requirements: `node scripts/sccp_bsc_taira_xor_deploy.mjs requirements --bsc-network ${profile.key} --out artifacts/sccp-bsc/${profile.key === "mainnet" ? "taira-bsc-mainnet-xor-production-requirements.json" : "taira-bsc-xor-production-requirements.json"}`,
    deploy: `node scripts/sccp_bsc_taira_xor_deploy.mjs deploy --bsc-network ${profile.key} --verifier <production-verifier-key.json> --broadcast true --confirm-network taira_bsc_xor:${profile.key}${profile.key === "mainnet" ? " --confirm-mainnet true" : ""}`,
    evidence: `node scripts/sccp_bsc_taira_xor_deploy.mjs evidence --bsc-network ${profile.key} --token <addr> --bridge <addr> --source-bridge <addr> --verifier <addr>`,
    routeManifest:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest " +
      `--evidence artifacts/sccp-bsc/${
        profile.key === "mainnet"
          ? "taira-bsc-mainnet-xor-deployment.evidence.json"
          : "taira-bsc-xor-deployment.evidence.json"
      } ` +
      "--taira-contract artifacts/sccp-bsc/taira-bsc-xor-burn-record.contract.json " +
      "--settlement-asset-definition-id <canonical-asset-definition-id> " +
      "--proof-artifact-hash <0x...> --proving-key-hash <0x...> " +
      `--native-prover-bundle artifacts/sccp-bsc/${profile.nativeBundleFile} ` +
      "--source-bridge-config-hash <0x...> " +
      "--source-event-transaction-id <0x...> " +
      "--source-event-explorer-url <url> " +
      "--route-canary-evidence-hash <0x...> " +
      "--route-canary-transaction-id <0x...> " +
      "--route-canary-explorer-url <url> " +
      `--full-toml-ready true --offline-full-toml-evidence ${fullConfigEvidencePathForProfile(profile)} ` +
      "--production-ready true --live-readback-checked true " +
      `${
        profile.key === "mainnet"
          ? "--confirm-mainnet true --confirm-network taira_bsc_xor"
          : "--confirm-testnet taira_bsc_xor"
      } --out artifacts/sccp-bsc/${
        profile.key === "mainnet"
          ? "taira-bsc-mainnet-xor-route.manifest.json"
          : "taira-bsc-xor-route.manifest.json"
      }`,
    sourceParityAttestation: `node scripts/sccp_bsc_taira_xor_deploy.mjs source-parity-attestation --bsc-network ${profile.key} --out ${sourceParityAttestationPathForProfile(profile)}`,
    groth16ToolchainFingerprint:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material toolchain-fingerprint " +
      "--transcript <reproducible-build-transcript.json> " +
      "--circom-bin <circom> " +
      "--snarkjs-bin <snarkjs> " +
      "--out <reproducible-build-transcript.with-toolchain-hashes.json>",
    groth16TranscriptTemplate:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material transcript-template " +
      `--bsc-network ${profile.key} ` +
      "--r1cs <production-circuit.r1cs> " +
      "--zkey <production-proving-key.zkey> " +
      "--ptau <powersOfTau28_hez_final_22.ptau> " +
      "--snarkjs-verifier-key <production-verification_key.json> " +
      "[--circuit-source <production-full-message.circom>] " +
      "--witness-wasm <production-circuit.wasm> " +
      "--circom-bin <circom> " +
      "--snarkjs-bin <snarkjs> " +
      "--out-dir <transcript-dir>",
    groth16Material:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material materialize " +
      `--bsc-network ${profile.key} ` +
      "--r1cs <production-circuit.r1cs> " +
      "--zkey <production-proving-key.zkey> " +
      "--ptau <powersOfTau28_hez_final_22.ptau> " +
      "--snarkjs-verifier-key <production-verification_key.json> " +
      "[--circuit-source <production-full-message.circom>] " +
      "--witness-wasm <production-circuit.wasm> " +
      "--trusted-setup-transcript <trusted-setup-transcript.json> " +
      "--reproducible-build-transcript <reproducible-build-transcript.json> " +
      "--snarkjs-bin <snarkjs> " +
      `--out-dir artifacts/sccp-bsc/native-prover/${profile.key}`,
    groth16AttestationRequest:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-request " +
      "--manifest <candidate-groth16-material.manifest.json> " +
      "--semantic-review-evidence <semantic-review-evidence.json> " +
      "--circuit-security-audit-evidence <circuit-security-audit-evidence.json> " +
      "--out <attestation-request.json>",
    groth16AttestationHandoff:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material handoff-bundle " +
      "--manifest <candidate-groth16-material.manifest.json> " +
      "--transcript-template-package <transcript-template-package.json> " +
      "--evidence-template-package <evidence-template-package.json> " +
      "--request <attestation-request.json> " +
      "--out <handoff.json>",
    groth16VerifyHandoff:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material verify-handoff " +
      "--handoff <handoff.json> " +
      "--trusted-attestation-signer <0x...>",
    groth16EvidenceTemplate:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material evidence-template " +
      "--manifest <candidate-groth16-material.manifest.json> " +
      "--out-dir <review-evidence-dir>",
    groth16SignAttestation:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material sign-attestation " +
      "--request <attestation-request.json> " +
      "--role semanticSccpCircuit|circuitSecurity|trustedSetup|reproducibleBuild " +
      "--private-key-pem <ed25519-private-key.pem> " +
      "--out <signed-role-attestation.json>",
    groth16AttestationStatus:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-status " +
      "--request <attestation-request.json> " +
      "--semantic-attestation <semantic-sccp-circuit-attestation.json> " +
      "--circuit-security-attestation <circuit-security-audit.json> " +
      "--trusted-setup-attestation <trusted-setup-ceremony.json> " +
      "--reproducible-build-attestation <reproducible-build-attestation.json> " +
      "--trusted-attestation-signer <0x...>",
    groth16AttestationInventory:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material attestation-inventory " +
      "--request <attestation-request.json> " +
      "--scan-dir <native-prover-artifact-root> " +
      "--trusted-attestation-signer <0x...>",
    groth16ProofSelfTest:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material proof-self-test " +
      "--manifest <production-ready-groth16-material.manifest.json> " +
      "--witness-wasm <production-circuit.wasm> " +
      "--snarkjs-bin <snarkjs> " +
      "--out <proof-self-test.json>",
    groth16FinalizeAttestations:
      "node scripts/sccp_bsc_taira_xor_deploy.mjs groth16-material finalize-attestations " +
      "--request <attestation-request.json> " +
      "--semantic-attestation <semantic-sccp-circuit-attestation.json> " +
      "--circuit-security-attestation <circuit-security-audit.json> " +
      "--trusted-setup-attestation <trusted-setup-ceremony.json> " +
      "--reproducible-build-attestation <reproducible-build-attestation.json> " +
      "--trusted-attestation-signer <0x...> " +
      `--out-dir artifacts/sccp-bsc/native-prover/${profile.key}`,
    nativeProverBundle: `node scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --route-manifest ${routeManifestPathForProfile(profile)} --artifact-root artifacts/sccp-bsc/native-prover --proof-artifact <relative-circuit.r1cs> --proving-key <relative-circuit.zkey> --verifier-key <relative-verifier-key.json> --groth16-material-manifest <relative-groth16-material-manifest.json> --groth16-proof-self-test <relative-groth16-proof-self-test.json> --snarkjs-bin <snarkjs> --trusted-attestation-signer <0x...> --cross-sdk-parity <relative-cross-sdk-parity.json> --native-prover-self-test <relative-native-self-test.json> --javascript-implementation <relative-js-implementation> --swift-implementation <relative-swift-implementation> --kotlin-implementation <relative-kotlin-implementation> --java-android-implementation <relative-java-android-implementation> --dotnet-implementation <relative-dotnet-implementation> --audit-circuit-security <hex-or-relative-file> --audit-native-implementation source-parity-attestation.json --audit-reproducible-build <hex-or-relative-file> --audit-no-wasm-no-remote-scan <hex-or-relative-file> --out artifacts/sccp-bsc/${profile.nativeBundleFile} --attach-route-manifest-out ${routeManifestPathForProfile(profile)}`,
    routeConfig: `node scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest ${routeManifestPathForProfile(profile)} --base-config <deployed-taira-config.toml> --write-offline-full-toml-evidence ${fullConfigEvidencePathForProfile(profile)}`,
  },
  inputs: productionRequirementInputs(profile),
  requiredReports: [
    "route-preflight",
    "peer-config-audit",
    "smoke-readiness",
    "production-material-inventory",
    "live-ui-video-proof",
  ],
  deniedVerifierKeyHashes: [DIAGNOSTIC_VERIFIER_HASH],
});

const nativeSdkImplementations = {
  javascript: "pure-typescript",
  swift: "native-swift",
  kotlin: "native-kotlin",
  "java-android": "native-java",
  dotnet: "native-csharp",
};

const sourceParityRequiredMarkersByProfile = {
  testnet: [
    "BSC_TESTNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
    "BSC_TESTNET_LOCAL_ADMISSION_METADATA",
    "BSC_TESTNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
  ],
  mainnet: [
    "BSC_MAINNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
    "BSC_MAINNET_LOCAL_ADMISSION_METADATA",
    "BSC_MAINNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
  ],
};

const sourceParitySdkFileMarkersByProfile = {
  testnet: {
    javascript: {
      "javascript/iroha_js/src/sccp.js": [
        "export function buildBscTestnetSccpLocalAdmissionSubmission",
        "SCCP_LOCAL_ADMISSION_ENVELOPE_ENCODING_V1",
        "SCCP_LOCAL_ADMISSION_SUBMISSION_KIND_V1",
        "SCCP_LOCAL_ADMISSION_ENTRYPOINT_V1",
      ],
      "javascript/iroha_js/test/sccpBscMainnet.test.js": [
        "buildBscTestnetSccpLocalAdmissionSubmission(input)",
        "new BscTestnetSccp().buildLocalAdmissionSubmission(input)",
        "localAdmission.proofBytes",
      ],
    },
    swift: {
      "IrohaSwift/Sources/IrohaSwift/SccpEvmProver.swift": [
        "BscTestnetLocalAdmissionSubmissionInput",
        "buildBscTestnetSccpLocalAdmissionSubmission",
        "public final class BscTestnetSccp",
        "public func buildLocalAdmissionSubmission",
      ],
      "IrohaSwift/Tests/IrohaSwiftTests/SccpSolanaProverTests.swift": [
        "testBscTestnetSccpBuildsLocalAdmissionSubmission",
        "XCTAssertThrowsError",
        "stark-fri-v1",
      ],
    },
    kotlin: {
      "kotlin/core-jvm/src/main/java/org/hyperledger/iroha/sdk/sccp/EvmSccpProver.kt":
        [
          "BscTestnetLocalAdmissionSubmissionInput",
          "fun buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ],
      "kotlin/core-jvm/src/test/kotlin/org/hyperledger/iroha/sdk/sccp/EvmSccpProverTest.kt":
        [
          "bscTestnetFacadeBuildsLocalAdmissionSubmission",
          "assertFailsWith<IllegalArgumentException>",
          "evm-groth16-bn254-v1",
        ],
    },
    "java-android": {
      "java/iroha_android/src/main/java/org/hyperledger/iroha/android/sccp/BscTestnetSccpProver.java":
        [
          "LocalAdmissionSubmissionInput",
          "buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ],
      "java/iroha_android/src/test/java/org/hyperledger/iroha/android/sccp/EvmSccpProverTests.java":
        [
          "bscTestnetFacadeBuildsLocalAdmissionSubmission",
          "catch (final IllegalArgumentException ex)",
          "evm-groth16-bn254-v1",
        ],
    },
    dotnet: {
      "csharp/src/Hyperledger.Iroha.Sdk/Sccp/BscTestnetSccp.cs": [
        "BscTestnetLocalAdmissionSubmissionInput",
        "BuildLocalAdmissionSubmission",
        "LocalAdmissionEnvelopeEncoding",
      ],
      "csharp/tests/Hyperledger.Iroha.Sdk.Tests/SccpBscTestnetTests.cs": [
        "LocalAdmissionSubmissionWrapsNativeBscTestnetOutput",
        "Assert.Throws<ArgumentException>",
        "EvmGroth16Bn254ProofBackend",
      ],
    },
  },
  mainnet: {
    javascript: {
      "javascript/iroha_js/src/sccp.js": [
        "export function buildBscMainnetSccpLocalAdmissionSubmission",
        "SCCP_LOCAL_ADMISSION_ENVELOPE_ENCODING_V1",
        "SCCP_LOCAL_ADMISSION_SUBMISSION_KIND_V1",
        "SCCP_LOCAL_ADMISSION_ENTRYPOINT_V1",
      ],
      "javascript/iroha_js/test/sccpBscMainnet.test.js": [
        "buildBscMainnetSccpLocalAdmissionSubmission(input)",
        "const facadeSubmission = new BscMainnetSccp().buildLocalAdmissionSubmission(",
        "localAdmission.proofBytes",
      ],
    },
    swift: {
      "IrohaSwift/Sources/IrohaSwift/SccpEvmProver.swift": [
        "BscMainnetLocalAdmissionSubmissionInput",
        "buildBscMainnetSccpLocalAdmissionSubmission",
        "public final class BscMainnetSccp",
        "public func buildLocalAdmissionSubmission",
      ],
      "IrohaSwift/Tests/IrohaSwiftTests/SccpSolanaProverTests.swift": [
        "testBscMainnetSccpBuildsLocalAdmissionSubmission",
        "XCTAssertThrowsError",
        "stark-fri-v1",
      ],
    },
    kotlin: {
      "kotlin/core-jvm/src/main/java/org/hyperledger/iroha/sdk/sccp/EvmSccpProver.kt":
        [
          "BscMainnetLocalAdmissionSubmissionInput",
          "fun buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ],
      "kotlin/core-jvm/src/test/kotlin/org/hyperledger/iroha/sdk/sccp/EvmSccpProverTest.kt":
        [
          "bscMainnetFacadeBuildsLocalAdmissionSubmission",
          "assertFailsWith<IllegalArgumentException>",
          "evm-groth16-bn254-v1",
        ],
    },
    "java-android": {
      "java/iroha_android/src/main/java/org/hyperledger/iroha/android/sccp/BscMainnetSccp.java":
        [
          "LocalAdmissionSubmissionInput",
          "buildLocalAdmissionSubmission",
          "LOCAL_ADMISSION_ENVELOPE_ENCODING",
        ],
      "java/iroha_android/src/test/java/org/hyperledger/iroha/android/sccp/EvmSccpProverTests.java":
        [
          "bscMainnetFacadeBuildsLocalAdmissionSubmission",
          "catch (final IllegalArgumentException ex)",
          "evm-groth16-bn254-v1",
        ],
    },
    dotnet: {
      "csharp/src/Hyperledger.Iroha.Sdk/Sccp/BscMainnetSccp.cs": [
        "BscMainnetLocalAdmissionSubmissionInput",
        "BuildLocalAdmissionSubmission",
        "LocalAdmissionEnvelopeEncoding",
      ],
      "csharp/tests/Hyperledger.Iroha.Sdk.Tests/SccpBscMainnetTests.cs": [
        "LocalAdmissionSubmissionWrapsNativeBscOutput",
        "Assert.Throws<ArgumentException>",
        "EvmGroth16Bn254ProofBackend",
      ],
    },
  },
};

const sourceParityRequiredMarkers = (profile = BSC_PROFILES.testnet) =>
  sourceParityRequiredMarkersByProfile[profile.key];

const sourceParitySdkFileMarkers = (profile = BSC_PROFILES.testnet) =>
  sourceParitySdkFileMarkersByProfile[profile.key];

const sourceParitySdkImplementationHash = (sdk, sdkRecord) =>
  sha256Hex(
    Buffer.from(
      stableJsonString({
        sdk,
        implementation: sdkRecord.implementation,
        files: sdkRecord.files.map(({ path: filePath, sha256, markers }) => ({
          path: filePath,
          sha256,
          markers,
        })),
      }),
      "utf8",
    ),
  );

const recomputeSourceParityHashes = (attestation) => {
  for (const [sdk, sdkRecord] of Object.entries(attestation.sdks ?? {})) {
    sdkRecord.implementationHash = sourceParitySdkImplementationHash(
      sdk,
      sdkRecord,
    );
  }
  attestation.sourceTreeHash = sha256Hex(
    Buffer.from(
      stableJsonString({
        schema: attestation.schema,
        routeId: attestation.routeId,
        assetKey: attestation.assetKey,
        bscNetwork: attestation.bscNetwork,
        chain: attestation.chain,
        chainIdHex: attestation.chainIdHex,
        networkIdHex: attestation.networkIdHex,
        domain: attestation.domain,
        proofBackend: attestation.proofBackend,
        proofFamily: attestation.proofFamily,
        requiredMarkers: attestation.requiredMarkers,
        sdks: attestation.sdks,
      }),
      "utf8",
    ),
  );
  return attestation;
};

const noWasmNoRemoteScanHash = (record) =>
  sha256Hex(
    Buffer.from(
      stableJsonString({
        schema: record.schema,
        routeId: record.routeId,
        assetKey: record.assetKey,
        bscNetwork: record.bscNetwork,
        chain: record.chain,
        chainIdHex: record.chainIdHex,
        networkIdHex: record.networkIdHex,
        domain: record.domain,
        proofBackend: record.proofBackend,
        proofFamily: record.proofFamily,
        noWasm: record.noWasm,
        remoteProverRequired: record.remoteProverRequired,
        browserImplementation: record.browserImplementation,
        scanResult: record.scanResult,
        forbiddenWasmReferences: record.forbiddenWasmReferences,
        forbiddenRemoteReferences: record.forbiddenRemoteReferences,
        inspectedSdkArtifacts: record.inspectedSdkArtifacts,
      }),
      "utf8",
    ),
  );

const noWasmNoRemoteScanArtifact = (
  profile = BSC_PROFILES.testnet,
  sdkArtifacts = [],
  overrides = {},
) => {
  const inspectedSdkArtifacts = [...sdkArtifacts]
    .sort((left, right) => left.sdk.localeCompare(right.sdk))
    .map((artifact) => ({
      sdk: artifact.sdk,
      implementation: artifact.implementation,
      path: artifact.path,
      sha256: artifact.sha256,
      sizeBytes: artifact.sizeBytes,
      forbiddenWasmReferences: 0,
      forbiddenRemoteReferences: 0,
    }));
  const record = {
    schema: BSC_NATIVE_EVM_NO_WASM_NO_REMOTE_SCAN_SCHEMA,
    generatedAt: "2026-06-22T00:00:00.000Z",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    domain: SCCP_DOMAIN_BSC,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: SCCP_PROOF_FAMILY_STARK_FRI,
    noWasm: true,
    remoteProverRequired: false,
    browserImplementation: "pure-typescript",
    scanResult: "pass",
    forbiddenWasmReferences: 0,
    forbiddenRemoteReferences: 0,
    inspectedSdkArtifacts,
    ...overrides,
  };
  record.scanHash = noWasmNoRemoteScanHash(record);
  return record;
};

const sourceParityAttestationArtifact = (
  profile = BSC_PROFILES.testnet,
  overrides = {},
) => {
  const requiredMarkers = [...sourceParityRequiredMarkers(profile)];
  const sdks = Object.fromEntries(
    Object.entries(SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([sdk, implementation], index) => {
        const files = Object.entries(
          sourceParitySdkFileMarkers(profile)[sdk],
        ).map(([filePath, markers], fileIndex) => ({
          path: filePath,
          sha256: attestationHash(
            `${profile.key}:${sdk}:source:${fileIndex}:${filePath}`,
          ),
          sizeBytes: 1024 + index + fileIndex,
          markers: [...markers],
        }));
        const sdkRecord = {
          implementation,
          files,
        };
        sdkRecord.implementationHash = sourceParitySdkImplementationHash(
          sdk,
          sdkRecord,
        );
        return [sdk, sdkRecord];
      }),
  );
  const attestation = {
    schema: "iroha-sccp-bsc-native-evm-source-parity-attestation/v1",
    generatedAt: "2026-06-22T00:00:00.000Z",
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    domain: SCCP_DOMAIN_BSC,
    proofBackend: BSC_EVM_GROTH16_BACKEND,
    proofFamily: SCCP_PROOF_FAMILY_STARK_FRI,
    requiredMarkers,
    sdks,
    ...overrides,
  };
  return recomputeSourceParityHashes(attestation);
};

const productionRequirementInput = ({
  id,
  kind,
  placeholder,
  requiredBy,
  description,
}) => ({
  id,
  kind,
  placeholder,
  requiredBy,
  description,
});

const productionRequirementInputs = (profile = BSC_PROFILES.testnet) => [
  productionRequirementInput({
    id: "production-groth16-verifier-key-json",
    kind: "file",
    placeholder: "<production-verifier-key.json>",
    requiredBy: ["deploy", "native-prover-bundle"],
    description:
      "BN254 Groth16 verifier key JSON whose hash is not in the diagnostic denylist.",
  }),
  productionRequirementInput({
    id: `${profile.key}-funded-bsc-deployer`,
    kind: "operator-environment",
    placeholder: `<${profile.key}-deployer-signing-env>`,
    requiredBy: ["deploy"],
    description:
      "Funded BSC deployer configured outside generated reports for the selected network.",
  }),
  productionRequirementInput({
    id: `${profile.key}-bsc-rpc-endpoint`,
    kind: "url",
    placeholder: `<${profile.key}-bsc-rpc-url>`,
    requiredBy: ["deploy", "evidence"],
    description:
      "Selected BSC RPC endpoint used for deployment and contract readback.",
  }),
  productionRequirementInput({
    id: `${profile.key}-bsc-deployment-evidence`,
    kind: "file",
    placeholder:
      profile.key === "mainnet"
        ? "artifacts/sccp-bsc/taira-bsc-mainnet-xor-deployment.evidence.json"
        : "artifacts/sccp-bsc/taira-bsc-xor-deployment.evidence.json",
    requiredBy: ["route-manifest"],
    description:
      "BSC deployment evidence generated from live contract deployment and readback for the selected network.",
  }),
  productionRequirementInput({
    id: "production-route-manifest",
    kind: "file",
    placeholder:
      profile.key === "mainnet"
        ? "artifacts/sccp-bsc/taira-bsc-mainnet-xor-route.manifest.json"
        : "artifacts/sccp-bsc/taira-bsc-xor-route.manifest.json",
    requiredBy: ["native-prover-bundle", "route-config"],
    description:
      "Production route manifest bound to BSC deployment evidence, TAIRA route publication, and live canary evidence.",
  }),
  productionRequirementInput({
    id: "taira-burn-record-contract",
    kind: "file",
    placeholder: "artifacts/sccp-bsc/taira-bsc-xor-burn-record.contract.json",
    requiredBy: ["route-manifest"],
    description:
      "Compiled TAIRA burn-record IVM contract artifact used by the BSC route manifest.",
  }),
  productionRequirementInput({
    id: "canonical-settlement-asset-definition-id",
    kind: "asset-definition-id",
    placeholder: "<canonical-asset-definition-id>",
    requiredBy: ["route-manifest"],
    description:
      "Canonical Base58 XOR settlement asset definition id used by the BSC route manifest.",
  }),
  productionRequirementInput({
    id: "post-deploy-live-evidence",
    kind: "hashes-and-urls",
    placeholder:
      "--source-bridge-config-hash/--source-event-transaction-id/--route-canary-evidence-hash/--route-canary-transaction-id",
    requiredBy: ["route-manifest"],
    description:
      "Live post-deploy source-event and route-canary evidence for production-ready route manifests.",
  }),
  productionRequirementInput({
    id: "deployed-taira-base-config",
    kind: "file",
    placeholder: "<deployed-taira-config.toml>",
    requiredBy: ["route-config"],
    description:
      "Deployed TAIRA peer config used to render the merged route config and generated offline full-TOML evidence.",
  }),
  productionRequirementInput({
    id: "offline-full-toml-evidence",
    kind: "file",
    placeholder: fullConfigEvidencePathForProfile(profile),
    requiredBy: ["route-manifest"],
    description:
      "Generated offline full-TOML evidence artifact consumed by the final production route manifest.",
  }),
  productionRequirementInput({
    id: "native-prover-snarkjs-verifier",
    kind: "tool",
    placeholder: "<snarkjs>",
    requiredBy: [
      "groth16-toolchain-fingerprint",
      "groth16-material",
      "groth16-proof-self-test",
      "native-prover-bundle",
    ],
    description:
      "SnarkJS executable whose bytes are fingerprinted and used for Groth16 material verification.",
  }),
  productionRequirementInput({
    id: "groth16-circom-compiler",
    kind: "tool",
    placeholder: "<circom>",
    requiredBy: ["groth16-toolchain-fingerprint"],
    description:
      "Circom executable whose bytes are fingerprinted into reproducible build evidence.",
  }),
  productionRequirementInput({
    id: "native-prover-artifact-root",
    kind: "directory",
    placeholder: "artifacts/sccp-bsc/native-prover",
    requiredBy: ["native-prover-bundle"],
    description:
      "Canonical artifact root containing native EVM prover inputs and implementation evidence.",
  }),
  productionRequirementInput({
    id: "burn-record-proof-artifact",
    kind: "file",
    placeholder: "<relative-circuit.r1cs>",
    requiredBy: ["native-prover-bundle"],
    description:
      "Production burn-record proof artifact referenced relative to the artifact root.",
  }),
  productionRequirementInput({
    id: "burn-record-proving-key",
    kind: "file",
    placeholder: "<relative-circuit.zkey>",
    requiredBy: ["native-prover-bundle"],
    description:
      "Production burn-record proving key referenced relative to the artifact root.",
  }),
  productionRequirementInput({
    id: "groth16-powers-of-tau",
    kind: "file",
    placeholder: "<powersOfTau28_hez_final_22.ptau>",
    requiredBy: ["groth16-material"],
    description:
      "Powers-of-Tau transcript passed to SnarkJS zkey verification.",
  }),
  productionRequirementInput({
    id: "groth16-witness-wasm",
    kind: "file",
    placeholder: "<production-circuit.wasm>",
    requiredBy: ["groth16-material", "groth16-proof-self-test"],
    description:
      "Witness WASM artifact bound into Groth16 material and proof self-test reports.",
  }),
  productionRequirementInput({
    id: "groth16-material-manifest",
    kind: "file",
    placeholder: "<relative-groth16-material-manifest.json>",
    requiredBy: ["native-prover-bundle"],
    description:
      "ProductionReady Groth16 material manifest generated by groth16-material finalize-attestations and bound to the proof artifact, proving key, verifier key, semantic attestation, trusted setup, and reproducible build evidence.",
  }),
  productionRequirementInput({
    id: "candidate-groth16-material-manifest",
    kind: "file",
    placeholder: "<candidate-groth16-material.manifest.json>",
    requiredBy: ["groth16-attestation-request"],
    description:
      "Unsigned candidate Groth16 material manifest emitted by materialize and hashed into the attestation request package.",
  }),
  productionRequirementInput({
    id: "groth16-attestation-request-package",
    kind: "file",
    placeholder: "<attestation-request.json>",
    requiredBy: [
      "groth16-sign-attestation",
      "groth16-attestation-status",
      "groth16-finalize-attestations",
    ],
    description:
      "Role-separated Groth16 attestation request package consumed by finalization.",
  }),
  productionRequirementInput({
    id: "signed-groth16-role-attestations",
    kind: "file-set",
    placeholder:
      "<semantic-sccp-circuit-attestation.json>,<circuit-security-audit.json>,<trusted-setup-ceremony.json>,<reproducible-build-attestation.json>",
    requiredBy: [
      "groth16-attestation-status",
      "groth16-finalize-attestations",
      "native-prover-bundle",
    ],
    description:
      "Four public Ed25519-signed role attestation files produced from the request package.",
  }),
  productionRequirementInput({
    id: "groth16-proof-self-test-report",
    kind: "file",
    placeholder: "<proof-self-test.json>",
    requiredBy: [
      "groth16-proof-self-test",
      "native-prover-bundle",
      "production-material-preflight",
    ],
    description:
      "Public SnarkJS wtns/prove/verify report generated from the manifest-bound full-message circuit, proving key, verifier key, and deterministic synthetic SCCP witness.",
  }),
  productionRequirementInput({
    id: "trusted-groth16-attestation-signer",
    kind: "hex-fingerprint",
    placeholder: "<0x...>",
    requiredBy: [
      "groth16-attestation-status",
      "groth16-finalize-attestations",
      "native-prover-bundle",
    ],
    description:
      "Trusted Ed25519 public-key fingerprint used to verify Groth16 material attestation signatures.",
  }),
  productionRequirementInput({
    id: "trusted-setup-transcript",
    kind: "file",
    placeholder: "<trusted-setup-transcript.json>",
    requiredBy: ["groth16-material"],
    description:
      "Concrete trusted-setup ceremony transcript whose sha256 is bound into the candidate Groth16 material.",
  }),
  productionRequirementInput({
    id: "reproducible-build-transcript",
    kind: "file",
    placeholder: "<reproducible-build-transcript.json>",
    requiredBy: ["groth16-material"],
    description:
      "Concrete reproducible-build transcript whose sha256 is bound into the candidate Groth16 material.",
  }),
  productionRequirementInput({
    id: "semantic-sccp-circuit-attestation",
    kind: "file",
    placeholder: "<semantic-sccp-circuit-attestation.json>",
    requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
    description:
      "Public attestation that the Groth16 circuit enforces the full SCCP message, finality, route, and destination-binding semantics, not only the 9 public signal shape.",
  }),
  productionRequirementInput({
    id: "trusted-setup-ceremony-attestation",
    kind: "file",
    placeholder: "<trusted-setup-ceremony.json>",
    requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
    description:
      "Public ceremony evidence binding the ptau, phase2 zkey, circuit hash, contribution transcript, and verifier key hash.",
  }),
  productionRequirementInput({
    id: "reproducible-groth16-build-attestation",
    kind: "file",
    placeholder: "<reproducible-build-attestation.json>",
    requiredBy: ["groth16-finalize-attestations", "native-prover-bundle"],
    description:
      "Independent reproducible build evidence for the circuit source, R1CS, proving key, SnarkJS verification key, and BSC verifier-key JSON.",
  }),
  productionRequirementInput({
    id: "cross-sdk-parity-report",
    kind: "file",
    placeholder: "<relative-cross-sdk-parity.json>",
    requiredBy: ["native-prover-bundle"],
    description:
      "Cross-SDK production parity report covering JavaScript, Swift, Kotlin, Java Android, and .NET bindings.",
  }),
  productionRequirementInput({
    id: "native-prover-self-test-report",
    kind: "file",
    placeholder: "<relative-native-self-test.json>",
    requiredBy: ["native-prover-bundle"],
    description:
      "Native EVM prover self-test report bound to the selected BSC network.",
  }),
  productionRequirementInput({
    id: "source-parity-attestation",
    kind: "file",
    placeholder: sourceParityAttestationPathForProfile(profile),
    requiredBy: ["native-prover-bundle"],
    description:
      "Deterministic source-parity attestation for JavaScript, Swift, Kotlin, Java Android, and .NET BSC local-admission implementations.",
  }),
  ...[
    ["javascript-sdk-implementation", "javascript"],
    ["swift-sdk-implementation", "swift"],
    ["kotlin-sdk-implementation", "kotlin"],
    ["java-android-sdk-implementation", "java android"],
    ["dotnet-sdk-implementation", "dotnet"],
  ].map(([id, label]) =>
    productionRequirementInput({
      id,
      kind: "file-or-directory",
      placeholder: `<relative-${id.replace("-sdk-implementation", "")}-implementation>`,
      requiredBy: ["native-prover-bundle"],
      description: `${label} sdk implementation evidence.`,
    }),
  ),
  ...[
    ["audit-circuit-security", "audit circuit security"],
    ["audit-native-implementation", "audit native implementation"],
    ["audit-reproducible-build", "audit reproducible build"],
    ["audit-no-wasm-no-remote-scan", "audit no wasm no remote scan"],
  ].map(([id, label]) =>
    productionRequirementInput({
      id,
      kind: "hash-or-file",
      placeholder: "<hex-or-relative-file>",
      requiredBy: ["native-prover-bundle"],
      description: `${label} evidence.`,
    }),
  ),
  productionRequirementInput({
    id: "taira-peer-config-targets",
    kind: "operator-environment",
    placeholder: "<taira-peer-config-targets>",
    requiredBy: ["route-config"],
    description:
      "TAIRA peer configuration targets that will receive the generated route stanza.",
  }),
];

const nativeEvmProverBundle = (
  deploymentInfo = deployment(),
  profile = BSC_PROFILES.testnet,
) => ({
  schema: "sccp-native-evm-groth16-prover-bundle-v1",
  bundle_id: profile.bundleId,
  domain: 2,
  chain: profile.chain,
  proof_backend: "evm-groth16-bn254-v1",
  proof_artifact: `artifacts/${profile.chain}/proof-artifact.r1cs`,
  proof_artifact_hash: deploymentInfo.proofArtifactHash,
  proving_key: `artifacts/${profile.chain}/proving-key.zkey`,
  proving_key_hash: deploymentInfo.provingKeyHash,
  verifier_key: `artifacts/${profile.chain}/verifier-key.json`,
  verifier_key_hash: deploymentInfo.verifierKeyHash,
  destination_binding_hash: deploymentInfo.destinationBindingHash,
  no_wasm: true,
  remote_prover_required: false,
  browser_implementation: "pure-typescript",
  cross_sdk_parity_artifact: `artifacts/${profile.chain}/cross-sdk-parity.json`,
  native_prover_self_test_artifact: `artifacts/${profile.chain}/native-prover-self-test.json`,
  groth16_proof_self_test_artifact: `artifacts/${profile.chain}/groth16-proof-self-test.json`,
  groth16_proof_self_test_hash: repeatedHash(0xa7),
  native_sdk_artifacts: Object.entries(nativeSdkImplementations).map(
    ([sdk, implementation], index) => ({
      sdk,
      implementation,
      prover_artifact_hash: deploymentInfo.proofArtifactHash,
      proving_key_hash: deploymentInfo.provingKeyHash,
      implementation_artifact: `artifacts/${profile.chain}/${sdk}-implementation.bin`,
      implementation_hash: repeatedHash(0xb1 + index),
    }),
  ),
  audit_hashes: {
    circuit_security_audit: repeatedHash(0xa1),
    native_implementation_audit: repeatedHash(0xa2),
    reproducible_build_attestation: repeatedHash(0xa3),
    cross_sdk_parity: repeatedHash(0xa4),
    native_prover_self_test: repeatedHash(0xa5),
    no_wasm_no_remote_scan: repeatedHash(0xa6),
  },
});

const relativeModuleUrl = (filePath) =>
  `./${path.relative(repoRoot, filePath).replace(/\\/gu, "/")}`;

const createReadyFixture = async ({
  profile = BSC_PROFILES.testnet,
  rootDir = path.join(repoRoot, "output"),
  rootPrefix = "sccp-bsc-material-inventory-test-",
  writeProofArtifact = true,
  writeProvingKey = true,
  proofArtifactBytes = proofArtifactMaterialBytes(5),
  provingKeyBytes = provingKeyMaterialBytes(7),
  verifierKeyBytes = verifierKeyMaterialBytes(profile),
} = {}) => {
  const root = await mkdtemp(path.join(rootDir, rootPrefix));
  await mkdir(root, { recursive: true });
  const verifierKeyHash = verifierKeyHashForMaterial();
  const routeDeployment = deployment(
    {
      proofArtifactHash: sha256Hex(proofArtifactBytes),
      provingKeyHash: sha256Hex(provingKeyBytes),
      verifierKeyHash,
      destinationBindingHash: bscDestinationBindingHash({
        networkId: profile.networkIdHex,
        verifierAddress: BSC_VERIFIER_ADDRESS,
        bridgeAddress: BSC_BRIDGE_ADDRESS,
        verifierCodeHash: HASH_11,
        verifierKeyHash,
      }),
    },
    profile,
  );
  const nativeBundle = await writeGeneratedNativeProverBundle({
    root,
    routeDeployment,
    proofArtifactBytes,
    provingKeyBytes,
    verifierKeyBytes,
    profile,
  });
  routeDeployment.nativeEvmProverBundleHash =
    nativeBundle.nativeEvmProverBundleHash;
  const groth16MaterialManifestPath = await writeGroth16MaterialManifest({
    root,
    routeDeployment,
    nativeBundle,
    profile,
  });
  await bindNativeProverReportsToManifest({
    nativeBundle,
    routeDeployment,
    groth16MaterialManifestPath,
    profile,
  });

  const destinationModulePath = path.join(root, "destination-sccp-bsc.js");
  const sourceModulePath = path.join(root, "source-sccp-bsc.js");
  await writeFile(destinationModulePath, moduleSource("bscSccpProve"), "utf8");
  await writeFile(sourceModulePath, moduleSource("bscSccpSourceProve"), "utf8");
  const destinationModuleUrl = relativeModuleUrl(destinationModulePath);
  const sourceModuleUrl = relativeModuleUrl(sourceModulePath);
  const destinationModuleBytes = await readFile(destinationModulePath);
  const sourceModuleBytes = await readFile(sourceModulePath);

  await writeJson(
    `${destinationModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: destinationModuleUrl,
      moduleSha256: sha256Hex(destinationModuleBytes),
      direction: "destination",
      deploymentInfo: routeDeployment,
      profile,
    }),
  );
  await writeJson(
    `${sourceModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: sourceModuleUrl,
      moduleSha256: sha256Hex(sourceModuleBytes),
      direction: "source",
      deploymentInfo: routeDeployment,
      profile,
    }),
  );
  await writeJson(path.join(root, "taira-bsc-xor-route.production.json"), {
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    productionReady: true,
    explorerUrl: profile.explorerUrl,
    explorerHost: profile.explorerHost,
    deployment: routeDeployment,
    postDeployLiveEvidence: postDeployLiveEvidence({}, profile),
    tairaXorBurnRecord: productionBurnRecordMaterial(),
  });
  const deploymentEvidencePath = path.join(
    root,
    profile.key === "mainnet"
      ? "taira-bsc-mainnet-xor-deployment.evidence.json"
      : "taira-bsc-xor-deployment.evidence.json",
  );
  await writeJson(
    deploymentEvidencePath,
    deploymentEvidenceArtifact(routeDeployment, profile),
  );
  const offlineFullTomlEvidencePath = path.join(
    root,
    "taira-bsc-xor-route.full-taira-config.evidence.json",
  );
  await writeJson(
    offlineFullTomlEvidencePath,
    offlineFullTomlEvidenceArtifact({}, profile),
  );
  await writeJson(
    path.join(root, "taira-bsc-xor-production-requirements.json"),
    productionRequirementsArtifact(profile),
  );
  await writeJson(
    path.join(root, "source-parity-attestation.json"),
    sourceParityAttestationArtifact(profile),
  );
  const contractArtifactDir = path.join(root, "contracts");
  await mkdir(contractArtifactDir, { recursive: true });
  for (const key of Object.keys(BSC_COMPILED_CONTRACTS)) {
    await writeJson(
      path.join(contractArtifactDir, `${key}.json`),
      compiledContractArtifact(key),
    );
  }
  const verifierPath = path.join(root, "bsc-verifier-key.json");
  await writeJson(verifierPath, verifierMaterialForProfile(profile));
  if (!writeProofArtifact) {
    await rm(nativeBundle.proofArtifactPath, { force: true });
  }
  if (!writeProvingKey) {
    await rm(nativeBundle.provingKeyPath, { force: true });
  }

  return {
    root,
    destinationModulePath,
    sourceModulePath,
    verifierPath,
    destinationModuleUrl,
    sourceModuleUrl,
    profile,
    routeDeployment,
    routeReport: routeReport({ deployment: routeDeployment }, profile),
    deploymentEvidencePath,
    offlineFullTomlEvidencePath,
    groth16MaterialManifestPath,
    groth16AttestationRequestPackagePath: groth16AttestationRequestPackagePath(
      groth16MaterialManifestPath,
      profile,
    ),
    groth16AttestationHandoffPath: groth16AttestationHandoffPath(
      groth16MaterialManifestPath,
      profile,
    ),
    ...nativeBundle,
  };
};

const rewriteFixtureRouteEvidence = async (fixture) => {
  const profile = fixture.profile ?? BSC_PROFILES.testnet;
  const destinationModuleBytes = await readFile(fixture.destinationModulePath);
  const sourceModuleBytes = await readFile(fixture.sourceModulePath);
  await writeJson(
    path.join(fixture.root, "taira-bsc-xor-route.production.json"),
    {
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      productionReady: true,
      explorerUrl: profile.explorerUrl,
      explorerHost: profile.explorerHost,
      deployment: fixture.routeDeployment,
      postDeployLiveEvidence: postDeployLiveEvidence({}, profile),
      tairaXorBurnRecord: productionBurnRecordMaterial(),
    },
  );
  await writeJson(
    `${fixture.destinationModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: fixture.destinationModuleUrl,
      moduleSha256: sha256Hex(destinationModuleBytes),
      direction: "destination",
      deploymentInfo: fixture.routeDeployment,
      profile,
    }),
  );
  await writeJson(
    `${fixture.sourceModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: fixture.sourceModuleUrl,
      moduleSha256: sha256Hex(sourceModuleBytes),
      direction: "source",
      deploymentInfo: fixture.routeDeployment,
      profile,
    }),
  );
  await writeJson(
    fixture.deploymentEvidencePath,
    deploymentEvidenceArtifact(fixture.routeDeployment, profile),
  );
  fixture.groth16MaterialManifestPath = await writeGroth16MaterialManifest({
    root: fixture.root,
    routeDeployment: fixture.routeDeployment,
    nativeBundle: fixture,
    profile,
  });
  fixture.groth16AttestationRequestPackagePath =
    groth16AttestationRequestPackagePath(
      fixture.groth16MaterialManifestPath,
      profile,
    );
  fixture.groth16AttestationHandoffPath = groth16AttestationHandoffPath(
    fixture.groth16MaterialManifestPath,
    profile,
  );
  fixture.routeReport = routeReport(
    { deployment: fixture.routeDeployment },
    profile,
  );
};

const injectNativeSelfTestSourceProofCollision = async (fixture) => {
  const profile = fixture.profile ?? BSC_PROFILES.testnet;
  const parityPath = path.join(fixture.artifactRoot, "cross-sdk-parity.json");
  const selfTestPath = path.join(
    fixture.artifactRoot,
    "native-prover-self-test.json",
  );
  const parityFixture = JSON.parse(await readFile(parityPath, "utf8"));
  const selfTestFixture = JSON.parse(await readFile(selfTestPath, "utf8"));
  selfTestFixture.source_proof_hash = parityFixture.source_proof_hash;
  for (const sdkResult of Object.values(selfTestFixture.sdk_results)) {
    sdkResult.source_proof_hash = parityFixture.source_proof_hash;
  }
  await writeJson(selfTestPath, selfTestFixture);

  const bundle = JSON.parse(await readFile(fixture.nativeBundlePath, "utf8"));
  const updatedBundle = {
    ...bundle,
    audit_hashes: {
      ...bundle.audit_hashes,
      native_prover_self_test: sha256Hex(await readFile(selfTestPath)),
    },
  };
  await writeJson(fixture.nativeBundlePath, updatedBundle);
  const descriptor = profile.validateBundle(updatedBundle, {
    expectedDestinationBindingHash:
      fixture.routeDeployment.destinationBindingHash,
  });
  fixture.routeDeployment.nativeEvmProverBundleHash =
    canonicalBscNativeEvmProverBundleHash(descriptor);
  await rewriteFixtureRouteEvidence(fixture);
};

const addRuntimeProverConfigToFixture = async (fixture) => {
  const profile = fixture.profile ?? BSC_PROFILES.testnet;
  const verifierBytes = verifierKeyMaterialBytes(profile);
  const verifierKeyHash = verifierKeyHashForMaterial();
  const routeDeployment = deployment(
    {
      ...fixture.routeDeployment,
      verifierKeyHash,
      destinationBindingHash: bscDestinationBindingHash({
        networkId: profile.networkIdHex,
        verifierAddress: BSC_VERIFIER_ADDRESS,
        bridgeAddress: BSC_BRIDGE_ADDRESS,
        verifierCodeHash: HASH_11,
        verifierKeyHash,
      }),
    },
    profile,
  );
  const backendPath = path.join(fixture.root, "runtime-backend.js");
  const runtimeConfigPath = path.join(
    fixture.root,
    "taira-bsc-xor-prover.config.json",
  );
  const nativeBundle = await writeGeneratedNativeProverBundle({
    root: fixture.root,
    routeDeployment,
    proofArtifactBytes: await readFile(fixture.proofArtifactPath),
    provingKeyBytes: await readFile(fixture.provingKeyPath),
    verifierKeyBytes: verifierBytes,
    profile,
  });
  routeDeployment.nativeEvmProverBundleHash =
    nativeBundle.nativeEvmProverBundleHash;
  const groth16MaterialManifestPath = await writeGroth16MaterialManifest({
    root: fixture.root,
    routeDeployment,
    nativeBundle,
    profile,
  });
  await bindNativeProverReportsToManifest({
    nativeBundle,
    routeDeployment,
    groth16MaterialManifestPath,
    profile,
  });

  await writeJson(
    path.join(fixture.root, "taira-bsc-xor-route.production.json"),
    {
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      productionReady: true,
      explorerUrl: profile.explorerUrl,
      explorerHost: profile.explorerHost,
      deployment: routeDeployment,
      postDeployLiveEvidence: postDeployLiveEvidence({}, profile),
      tairaXorBurnRecord: productionBurnRecordMaterial(),
    },
  );
  await writeJson(fixture.verifierPath, verifierMaterialForProfile(profile));
  const destinationModuleBytes = await readFile(fixture.destinationModulePath);
  const sourceModuleBytes = await readFile(fixture.sourceModulePath);
  await writeJson(
    `${fixture.destinationModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: fixture.destinationModuleUrl,
      moduleSha256: sha256Hex(destinationModuleBytes),
      direction: "destination",
      deploymentInfo: routeDeployment,
      profile,
    }),
  );
  await writeJson(
    `${fixture.sourceModulePath}.manifest.json`,
    sidecarManifest({
      moduleUrl: fixture.sourceModuleUrl,
      moduleSha256: sha256Hex(sourceModuleBytes),
      direction: "source",
      deploymentInfo: routeDeployment,
      profile,
    }),
  );
  await writeFile(backendPath, runtimeBackendSource(), "utf8");
  const runtimeMaterialUrl = (value) =>
    /^(?:\.\/|\/|https:\/\/|http:\/\/(?:127\.0\.0\.1|localhost)(?::|\/))/iu.test(
      value,
    )
      ? value
      : `./${value}`;
  await writeBscSccpRuntimeProverConfig({
    routeReport: routeReport({ deployment: routeDeployment }, profile),
    bscNetwork: profile.key,
    destination: {
      nativeProverBundleUrl: runtimeMaterialUrl(nativeBundle.nativeBundleUrl),
      proofArtifactUrl: runtimeMaterialUrl(nativeBundle.proofArtifactUrl),
      provingKeyUrl: runtimeMaterialUrl(nativeBundle.provingKeyUrl),
      verifierKeyUrl: runtimeMaterialUrl(nativeBundle.verifierKeyUrl),
      backendModuleUrl: "./runtime-backend.js",
    },
    source: {
      nativeProverBundleUrl: runtimeMaterialUrl(nativeBundle.nativeBundleUrl),
      proofArtifactUrl: runtimeMaterialUrl(nativeBundle.proofArtifactUrl),
      provingKeyUrl: runtimeMaterialUrl(nativeBundle.provingKeyUrl),
      verifierKeyUrl: runtimeMaterialUrl(nativeBundle.verifierKeyUrl),
      backendModuleUrl: "./runtime-backend.js",
    },
    outputPath: runtimeConfigPath,
  });

  return {
    ...fixture,
    routeDeployment,
    routeReport: routeReport({ deployment: routeDeployment }, profile),
    runtimeConfigPath,
    runtimeConfigUrl: relativeModuleUrl(runtimeConfigPath),
    backendPath,
    groth16MaterialManifestPath,
    groth16AttestationRequestPackagePath: groth16AttestationRequestPackagePath(
      groth16MaterialManifestPath,
      profile,
    ),
    ...nativeBundle,
  };
};

const evaluateFixture = async (fixture, overrides = {}) =>
  evaluateBscSccpProductionMaterialInventory({
    scanPaths: [fixture.root],
    routeReport: fixture.routeReport,
    bscNetwork: fixture.profile?.key ?? "testnet",
    destinationModuleUrl: fixture.destinationModuleUrl,
    sourceModuleUrl: fixture.sourceModuleUrl,
    generatedAt: "2026-06-06T00:00:00.000Z",
    ...overrides,
  });

describe("BSC SCCP production material inventory", () => {
  it("uses profile-specific default material inventory output directories", () => {
    const testnet = bscSccpProductionMaterialInventoryOutputDir("testnet");
    const mainnet = bscSccpProductionMaterialInventoryOutputDir("mainnet");

    expect(testnet).toContain(
      "output/sccp-bsc-production-material-inventory/testnet",
    );
    expect(mainnet).toContain(
      "output/sccp-bsc-production-material-inventory/mainnet",
    );
    expect(mainnet).not.toBe(testnet);
  });

  it("accepts complete production material inventory runbook contracts", () => {
    expect(
      bscSccpProductionMaterialInventoryRunbookProblems({
        nextActions: [
          {
            id: "publish-browser-prover-modules",
            title: "Publish browser prover modules",
            detail: "Publish route-bound browser prover modules.",
            requiredInputs: [
              {
                id: "testnet-destination-browser-prover-module",
                kind: "url",
                placeholder: "<destination-prover-module-url>",
                description: "Browser-safe destination prover module URL.",
              },
            ],
            blockedByChecks: ["destination-browser-prover"],
            commands: [
              "npm run e2e:sccp:bsc-material-inventory -- --bsc-network testnet",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "testnet-destination-browser-prover-module",
            kind: "url",
            placeholder: "<destination-prover-module-url>",
            description: "Browser-safe destination prover module URL.",
            blockedByActions: ["publish-browser-prover-modules"],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects production proof-material runbooks that omit native bundle inputs", () => {
    const problems = bscSccpProductionMaterialInventoryRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "Publish production proof material",
          detail: "Publish route-bound production proof material.",
          requiredInputs: [
            {
              id: "native-evm-prover-bundle",
              kind: "file",
              placeholder: "<native-evm-prover-bundle.json>",
              description: "SDK-validated native EVM prover bundle.",
            },
          ],
          blockedByChecks: ["native-evm-prover-bundle"],
          commands: [
            "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --bsc-network testnet --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --out <native-evm-prover-bundle.json>",
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "native-evm-prover-bundle",
          kind: "file",
          placeholder: "<native-evm-prover-bundle.json>",
          description: "SDK-validated native EVM prover bundle.",
          blockedByActions: ["publish-production-proof-material"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "production material inventory next action 0 must include exactly one unsigned groth16-material materialize command.",
        "production material inventory next action 0 must include exactly one groth16-material attestation-request command.",
        "production material inventory next action 0 must include exactly one groth16-material attestation-inventory command.",
        "production material inventory next action 0 must include exactly one groth16-material finalize-attestations command.",
        "production material inventory next action 0 native-prover-bundle command lacks --proof-artifact.",
        "production material inventory next action 0 native-prover-bundle command lacks --proving-key.",
        "production material inventory next action 0 native-prover-bundle command lacks --verifier-key.",
        "production material inventory next action 0 native-prover-bundle command lacks --groth16-material-manifest.",
        "production material inventory next action 0 native-prover-bundle command lacks --trusted-attestation-signer.",
        "production material inventory next action 0 native-prover-bundle command lacks --cross-sdk-parity.",
        "production material inventory next action 0 native-prover-bundle command lacks --native-prover-self-test.",
        "production material inventory next action 0 native-prover-bundle command lacks --audit-no-wasm-no-remote-scan.",
      ]),
    );
  });

  it("rejects malformed production material inventory runbook contracts", () => {
    const problems = bscSccpProductionMaterialInventoryRunbookProblems({
      nextActions: [
        {
          id: "publish-browser-prover-modules",
          title: "",
          detail: "Publish route-bound browser prover modules.",
          requiredInputs: [
            {
              id: "testnet-destination-browser-prover-module",
              kind: "url",
              placeholder: "",
            },
          ],
          blockedByChecks: [],
          commands: "npm run e2e:sccp:bsc-material-inventory",
        },
      ],
      missingProductionInputs: [
        {
          id: "testnet-destination-browser-prover-module",
          kind: "",
          placeholder: "<destination-prover-module-url>",
          description: "Browser-safe destination prover module URL.",
          blockedByActions: "publish-browser-prover-modules",
        },
        "not-an-input-contract",
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "production material inventory next action 0 title is missing or not a non-empty string.",
        "production material inventory next action 0 required input 0 placeholder is missing or not a non-empty string.",
        "production material inventory next action 0 required input 0 description is missing or not a non-empty string.",
        "production material inventory next action 0 blockedByChecks is missing or empty.",
        "production material inventory next action 0 commands is not an array.",
        "production material inventory missing production input 0 kind is missing or not a non-empty string.",
        "production material inventory missing production input 0 blockedByActions is not an array.",
        "production material inventory missing production input 1 is not an object.",
      ]),
    );
  });

  it("rejects unlinked production material inventory runbook contracts", () => {
    const problems = bscSccpProductionMaterialInventoryRunbookProblems({
      nextActions: [
        {
          id: "publish-browser-prover-modules",
          title: "Publish browser prover modules",
          detail: "Publish route-bound browser prover modules.",
          requiredInputs: [
            {
              id: "testnet-destination-browser-prover-module",
              kind: "url",
              placeholder: "<destination-prover-module-url>",
              description: "Browser-safe destination prover module URL.",
            },
            {
              id: "testnet-source-browser-prover-module",
              kind: "url",
              placeholder: "<source-prover-module-url>",
              description: "Browser-safe source prover module URL.",
            },
          ],
          blockedByChecks: ["destination-browser-prover"],
          commands: [
            "npm run e2e:sccp:bsc-material-inventory -- --bsc-network testnet",
          ],
        },
        {
          id: "refresh-public-route-evidence",
          title: "Refresh public route evidence",
          detail: "Refresh the public route preflight report.",
          requiredInputs: [
            {
              id: "public-route-report",
              kind: "file",
              placeholder: "<route-preflight-report.json>",
              description: "Fresh public route preflight report.",
            },
          ],
          blockedByChecks: ["route-report-binding"],
          commands: ["npm run e2e:sccp:bsc-preflight -- --bsc-network testnet"],
        },
        {
          id: "refresh-public-route-evidence",
          title: "Duplicate route refresh",
          detail: "Duplicate action id must fail.",
          requiredInputs: [
            {
              id: "public-route-report",
              kind: "file",
              placeholder: "<route-preflight-report.json>",
              description: "Fresh public route preflight report.",
            },
          ],
          blockedByChecks: ["route-report-binding"],
          commands: ["npm run e2e:sccp:bsc-preflight -- --bsc-network testnet"],
        },
      ],
      missingProductionInputs: [
        {
          id: "testnet-destination-browser-prover-module",
          kind: "url",
          placeholder: "<destination-prover-module-url>",
          description: "Browser-safe destination prover module URL.",
          blockedByActions: ["unknown-action"],
        },
        {
          id: "public-route-report",
          kind: "file",
          placeholder: "<route-preflight-report.json>",
          description: "Fresh public route preflight report.",
          blockedByActions: ["publish-browser-prover-modules"],
        },
        {
          id: "public-route-report",
          kind: "file",
          placeholder: "<route-preflight-report.json>",
          description: "Duplicate input id must fail.",
          blockedByActions: ["refresh-public-route-evidence"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "production material inventory next action id refresh-public-route-evidence is duplicated.",
        "production material inventory missing production input id public-route-report is duplicated.",
        "production material inventory missing production input testnet-destination-browser-prover-module does not reference blocking action publish-browser-prover-modules.",
        "production material inventory next action publish-browser-prover-modules requires input testnet-source-browser-prover-module, but missingProductionInputs does not include it.",
        "production material inventory missing production input public-route-report does not reference blocking action refresh-public-route-evidence.",
        "production material inventory missing production input testnet-destination-browser-prover-module references unknown blocking action unknown-action.",
        "production material inventory missing production input public-route-report references blocking action publish-browser-prover-modules, but that action does not require the input.",
      ]),
    );
  });

  it("does not invoke accessor-backed production material inventory runbook entries", () => {
    let requiredInputReads = 0;
    let commandReads = 0;
    let blockedActionReads = 0;
    const requiredInputs = [];
    requiredInputs.length = 1;
    Object.defineProperty(requiredInputs, "0", {
      configurable: true,
      enumerable: true,
      get() {
        requiredInputReads += 1;
        return {
          id: "hidden-input",
          kind: "file",
          placeholder: "<hidden>",
          description: "hidden",
        };
      },
    });
    const commands = ["npm run e2e:sccp:bsc-material-inventory"];
    Object.defineProperty(commands, "1", {
      configurable: true,
      enumerable: true,
      get() {
        commandReads += 1;
        return "hidden command";
      },
    });
    const blockedByActions = ["publish-browser-prover-modules"];
    Object.defineProperty(blockedByActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        blockedActionReads += 1;
        return "hidden-action";
      },
    });

    const problems = bscSccpProductionMaterialInventoryRunbookProblems({
      nextActions: [
        {
          id: "publish-browser-prover-modules",
          title: "Publish browser prover modules",
          detail: "Publish route-bound browser prover modules.",
          requiredInputs,
          blockedByChecks: ["destination-browser-prover"],
          commands,
        },
      ],
      missingProductionInputs: [
        {
          id: "testnet-destination-browser-prover-module",
          kind: "url",
          placeholder: "<destination-prover-module-url>",
          description: "Browser-safe destination prover module URL.",
          blockedByActions,
        },
      ],
    });

    expect(requiredInputReads).toBe(0);
    expect(commandReads).toBe(0);
    expect(blockedActionReads).toBe(0);
    expect(problems).toEqual(
      expect.arrayContaining([
        "production material inventory next action 0 required input 0 is not an object.",
        "production material inventory next action 0 commands 1 is not a non-empty string.",
        "production material inventory missing production input 0 blockedByActions 1 is not a non-empty string.",
      ]),
    );
  });

  it("does not invoke accessor-backed top-level inventory option fields", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    const getters = {
      routeReport: vi.fn(() => routeReport()),
      bscNetwork: vi.fn(() => "mainnet"),
      destinationModuleUrl: vi.fn(() => "/sccp-bsc-prover.js"),
      sourceModuleUrl: vi.fn(() => "/sccp-bsc-source-prover.js"),
      runtimeProverConfigUrl: vi.fn(() => "/sccp-bsc/runtime-config.json"),
      destinationSidecarPath: vi.fn(() => "/tmp/destination-sidecar.json"),
      sourceSidecarPath: vi.fn(() => "/tmp/source-sidecar.json"),
      fetchImpl: vi.fn(() => vi.fn()),
      timeoutMs: vi.fn(() => 1000),
      generatedAt: vi.fn(() => "2026-06-06T00:00:00.000Z"),
      maxFiles: vi.fn(() => 1),
    };
    const options = {
      scanPaths: [root],
    };
    for (const [field, getter] of Object.entries(getters)) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    try {
      const report = await evaluateBscSccpProductionMaterialInventory(options);

      for (const getter of Object.values(getters)) {
        expect(getter).not.toHaveBeenCalled();
      }
      expect(report.ready).toBe(false);
      expect(report.route).toMatchObject({
        ready: false,
        manifestSource: null,
        bsc: null,
        deployment: null,
        postDeployLiveEvidence: null,
      });
      expect(report.counts).toMatchObject({
        files: 0,
        relevantFilesSeen: 0,
        truncated: false,
      });
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("route report is missing");
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toContain("is not configured");
      expect(
        report.checks.find((entry) => entry.id === "source-browser-prover")
          ?.detail,
      ).toContain("is not configured");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not invoke accessor-backed inventory scan path entries", async () => {
    const fixture = await createReadyFixture();
    try {
      const scanPathGetter = vi.fn(() => {
        throw new Error("scan path getter should not run");
      });
      const scanPaths = [fixture.root];
      Object.defineProperty(scanPaths, "1", {
        configurable: true,
        enumerable: true,
        get: scanPathGetter,
      });

      const report = await evaluateFixture(fixture, { scanPaths });

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(scanPathGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not follow symlink scan paths when collecting production artifacts", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-root-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-inventory-outside-"),
    );
    try {
      const externalRoutePath = path.join(
        outside,
        "taira-bsc-xor-route.production.json",
      );
      const linkPath = path.join(root, "linked-route.production.json");
      await writeJson(externalRoutePath, {
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        productionReady: true,
        deployment: deployment(),
        postDeployLiveEvidence: postDeployLiveEvidence(),
      });
      await symlink(externalRoutePath, linkPath);

      const report = await evaluateBscSccpProductionMaterialInventory({
        scanPaths: [linkPath],
        routeReport: routeReport(),
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.scanRootStatuses).toEqual([
        {
          path: path.basename(linkPath),
          ok: false,
          kind: "symlink",
          detail: "scan root must not be a symbolic link",
        },
      ]);
      expect(
        report.checks.find((entry) => entry.id === "scan-root-availability"),
      ).toMatchObject({ ok: false });
      expect(report.files).toEqual([]);
      expect(report.counts.files).toBe(0);
      expect(report.counts.productionRouteArtifacts).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("fails closed and reports missing scan roots explicitly", async () => {
    const missingRoot = path.join(
      tmpdir(),
      `sccp-bsc-missing-production-root-${Date.now()}`,
    );

    const report = await evaluateBscSccpProductionMaterialInventory({
      scanPaths: [missingRoot],
      routeReport: routeReport(),
      generatedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.scanRootStatuses).toHaveLength(1);
    expect(report.scanRootStatuses[0]).toMatchObject({
      path: path.basename(missingRoot),
      ok: false,
      kind: "missing",
    });
    expect(
      report.checks.find((entry) => entry.id === "scan-root-availability"),
    ).toMatchObject({
      ok: false,
      detail: expect.stringContaining("missing"),
    });
    expect(report.reasons.join("\n")).toMatch(/scan-root-availability/u);
  });

  it("prefers profile-specific prover env over generic env while preserving explicit overrides", async () => {
    await withEnv(
      {
        [SCCP_BSC_PROVER_MODULE_URL_ENV]: "/sccp-bsc/generic-destination.js",
        [SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV]:
          "/sccp-bsc/mainnet-destination.js",
        [SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV]: "/sccp-bsc/generic-source.js",
        [SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV]:
          "/sccp-bsc/mainnet-source.js",
        [SCCP_BSC_PROVER_CONFIG_URL_ENV]: "/sccp-bsc/generic-config.json",
        [SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV]:
          "/sccp-bsc/mainnet-config.json",
      },
      async () => {
        const report = await evaluateBscSccpProductionMaterialInventory({
          scanPaths: [],
          routeReport: routeReport({}, BSC_PROFILES.mainnet),
          bscNetwork: "mainnet",
          generatedAt: "2026-06-06T00:00:00.000Z",
        });

        expect(report.browserProvers.destination.module.moduleUrl).toBe(
          "/sccp-bsc/mainnet-destination.js",
        );
        expect(report.browserProvers.source.module.moduleUrl).toBe(
          "/sccp-bsc/mainnet-source.js",
        );
        expect(report.runtimeProverConfig.configUrl).toBe(
          "/sccp-bsc/mainnet-config.json",
        );

        const explicitReport = await evaluateBscSccpProductionMaterialInventory(
          {
            scanPaths: [],
            routeReport: routeReport({}, BSC_PROFILES.mainnet),
            bscNetwork: "mainnet",
            destinationModuleUrl: "/sccp-bsc/explicit-destination.js",
            sourceModuleUrl: "/sccp-bsc/explicit-source.js",
            runtimeProverConfigUrl: "/sccp-bsc/explicit-config.json",
            generatedAt: "2026-06-06T00:00:00.000Z",
          },
        );

        expect(explicitReport.browserProvers.destination.module.moduleUrl).toBe(
          "/sccp-bsc/explicit-destination.js",
        );
        expect(explicitReport.browserProvers.source.module.moduleUrl).toBe(
          "/sccp-bsc/explicit-source.js",
        );
        expect(explicitReport.runtimeProverConfig.configUrl).toBe(
          "/sccp-bsc/explicit-config.json",
        );
      },
    );
  });

  it("keeps default production scan roots network-scoped and away from diagnostic operator scratch output", () => {
    const normalized = DEFAULT_BSC_PRODUCTION_MATERIAL_SCAN_PATHS.map((entry) =>
      entry.replace(/\\/gu, "/"),
    );
    const testnet = bscSccpProductionMaterialScanPaths("testnet").map((entry) =>
      entry.replace(/\\/gu, "/"),
    );
    const mainnet = bscSccpProductionMaterialScanPaths("mainnet").map((entry) =>
      entry.replace(/\\/gu, "/"),
    );

    expect(normalized).toEqual(testnet);
    expect(
      normalized.some((entry) => entry.endsWith("/output/sccp-bsc-deploy")),
    ).toBe(false);
    expect(normalized.some((entry) => entry.endsWith("/public/sccp-bsc"))).toBe(
      false,
    );
    expect(testnet.some((entry) => entry.endsWith("/public/sccp-bsc"))).toBe(
      false,
    );
    expect(mainnet.some((entry) => entry.endsWith("/public/sccp-bsc"))).toBe(
      false,
    );
    expect(
      normalized.some((entry) =>
        entry.endsWith("/output/sccp-bsc-prover-manifest-cli"),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith("/output/sccp-bsc-deploy/bsc-deployer.private.env"),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.draft.json",
        ),
      ),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json",
        ),
      ),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-xor-route.production-ready.route-only.toml",
        ),
      ),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.manifest.draft.json",
        ),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.manifest.production-ready.json",
        ),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.production-ready.route-only.toml",
        ),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.production-ready.torii.toml",
        ),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) => entry.endsWith("/output/sccp-bsc-production")),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-material.manifest.json",
        ),
      ),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/testnet-full/sccp-bsc-full-message-v1.final.zkey",
        ),
      ),
    ).toBe(true);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/testnet-full",
        ),
      ),
    ).toBe(false);
    expect(
      normalized.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-material.manifest.json",
        ),
      ),
    ).toBe(false);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-mainnet-xor-route.manifest.production-ready.json",
        ),
      ),
    ).toBe(true);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/output/sccp-bsc-deploy/taira-bsc-xor-route.manifest.production-ready.json",
        ),
      ),
    ).toBe(false);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/mainnet-full/mainnet-bsc-groth16-material.manifest.json",
        ),
      ),
    ).toBe(true);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/mainnet-full/sccp-bsc-full-message-v1.final.zkey",
        ),
      ),
    ).toBe(true);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/mainnet-full",
        ),
      ),
    ).toBe(false);
    expect(
      mainnet.some((entry) =>
        entry.endsWith(
          "/iroha/output/sccp-bsc-production/groth16-material/testnet-full/testnet-bsc-groth16-material.manifest.json",
        ),
      ),
    ).toBe(false);
  });

  it("honors allow-not-ready for read-only production material audits", () => {
    expect(
      shouldFailBscSccpProductionMaterialInventoryCli({ ready: false }, {}),
    ).toBe(true);
    expect(
      shouldFailBscSccpProductionMaterialInventoryCli(
        { ready: false },
        { "allow-not-ready": "true" },
      ),
    ).toBe(false);
    expect(
      shouldFailBscSccpProductionMaterialInventoryCli({ ready: true }, {}),
    ).toBe(false);
  });

  it("fails closed when the material scan would be truncated", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, { maxFiles: 1 });

      expect(report.ready).toBe(false);
      expect(report.counts.files).toBe(1);
      expect(report.counts.maxFiles).toBe(1);
      expect(report.counts.truncated).toBe(true);
      expect(report.counts.relevantFilesSeen).toBe(2);
      expect(
        report.checks.find((entry) => entry.id === "material-scan-complete"),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("complete inventory"),
      });
      expect(report.reasons.join("\n")).toMatch(/material-scan-complete/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts clean production route, verifier, proof files, and browser prover sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture);

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.route.bsc).toEqual({
        network: "testnet",
        chain: "bsc-testnet",
        chainIdHex: "0x61",
        networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
        explorerUrl: "https://testnet.bscscan.com",
        explorerHost: "testnet.bscscan.com",
      });
      expect(report.counts.productionRouteArtifacts).toBe(1);
      expect(report.counts.productionOfflineFullTomlEvidenceArtifacts).toBe(1);
      expect(report.counts.productionVerifierArtifacts).toBe(1);
      expect(report.counts.productionGroth16MaterialManifests).toBe(1);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(1);
      expect(report.counts.readyGroth16AttestationRequestPackages).toBe(1);
      expect(report.counts.blockedGroth16AttestationRoles).toBe(0);
      expect(report.counts.productionNativeProverBundles).toBe(1);
      expect(report.counts.productionRequirementsArtifacts).toBe(1);
      expect(report.counts.compiledContractArtifacts).toBe(4);
      expect(report.counts.productionDeploymentEvidenceArtifacts).toBe(1);
      expect(report.counts.proofArtifacts).toBe(1);
      expect(report.counts.provingKeys).toBe(1);
      expect(report.counts.warningFindings).toBe(0);
      expect(
        report.checks.find(
          (entry) => entry.id === "groth16-attestation-role-readiness",
        ),
      ).toMatchObject({ ok: true });
      expect(
        report.checks.find(
          (entry) => entry.id === "compiled-contract-artifacts",
        ),
      ).toMatchObject({ ok: true });
      expect(
        report.checks.find(
          (entry) => entry.id === "production-burn-record-material",
        ),
      ).toMatchObject({ ok: true });
      expect(
        report.files.find((entry) => entry.kind === "production-requirements")
          ?.productionRequirements,
      ).toMatchObject({
        valid: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: "testnet",
        inputCount: 41,
        requiredReportCount: 5,
        deniedVerifierKeyHashCount: 1,
        contractHash: bscProductionRequirementsContractHash("testnet"),
        expectedContractHash: bscProductionRequirementsContractHash("testnet"),
        contractMatchesExpected: true,
      });
      expect(
        report.files.find((entry) => entry.kind === "deployment-evidence")
          ?.deploymentEvidence,
      ).toMatchObject({
        valid: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: "testnet",
        chain: "bsc-testnet",
        chainIdHex: "0x61",
        bridgeAddress: fixture.routeDeployment.bridgeAddress,
        tokenAddress: fixture.routeDeployment.tokenAddress,
        sourceBridgeAddress: fixture.routeDeployment.sourceBridgeAddress,
        verifierAddress: fixture.routeDeployment.verifierAddress,
        verifierCodeHash: fixture.routeDeployment.verifierCodeHash,
        verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
        destinationBindingHash: fixture.routeDeployment.destinationBindingHash,
        bscContractReadback: {
          codePresent: {
            token: true,
            bridge: true,
            sourceBridge: true,
            verifier: true,
          },
          tokenAddress: fixture.routeDeployment.tokenAddress,
          bridgeAddress: fixture.routeDeployment.bridgeAddress,
          sourceBridgeAddress: fixture.routeDeployment.sourceBridgeAddress,
          verifierAddress: fixture.routeDeployment.verifierAddress,
          tokenBridgeAddress: fixture.routeDeployment.bridgeAddress,
          tokenBridgeLocked: true,
          sourceBridgeOwner: fixture.routeDeployment.bridgeAddress,
          bridgeDestinationBindingHash:
            fixture.routeDeployment.destinationBindingHash,
          bridgeVerifierAddress: fixture.routeDeployment.verifierAddress,
          bridgeVerifierCodeHash: fixture.routeDeployment.verifierCodeHash,
          bridgeVerifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          bridgeNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
          bridgeSourceDomain: 0,
          bridgeTargetDomain: 2,
        },
      });
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        verifierCodeHash: fixture.routeDeployment.verifierCodeHash,
        verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
        proofArtifactHash: fixture.routeDeployment.proofArtifactHash,
        provingKeyHash: fixture.routeDeployment.provingKeyHash,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        destinationBindingHash: fixture.routeDeployment.destinationBindingHash,
        bridgeAddress: fixture.routeDeployment.bridgeAddress,
        tokenAddress: fixture.routeDeployment.tokenAddress,
        sourceBridgeAddress: fixture.routeDeployment.sourceBridgeAddress,
        verifierAddress: fixture.routeDeployment.verifierAddress,
        explorerUrl: "https://testnet.bscscan.com",
        explorerHost: "testnet.bscscan.com",
        explorerBindingMatches: true,
        publicDeploymentMatches: true,
      });
      expect(
        report.files.find(
          (entry) => entry.kind === "groth16-attestation-request-package",
        )?.groth16AttestationRequestPackage,
      ).toMatchObject({
        valid: true,
        allRolesReady: true,
        referencedManifestVerified: true,
        publicDeploymentMatches: true,
        manifestSha256: sha256Hex(
          await readFile(fixture.groth16MaterialManifestPath),
        ),
      });
      expect(
        report.files.find(
          (entry) => entry.kind === "offline-full-toml-evidence",
        )?.offlineFullTomlEvidence,
      ).toMatchObject({
        valid: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: "testnet",
        offlineFullTomlSha256: HASH_88,
        hashInputSha256: HASH_88,
        publicPostDeployMatches: true,
      });
      expect(report.browserProvers.destination.ok).toBe(true);
      expect(report.browserProvers.source.ok).toBe(true);
      expect(report.browserProvers.destination.sidecar.manifest).toMatchObject({
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscChainIdHex: "0x61",
        bscNetworkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        deployment: {
          bridgeAddress: fixture.routeDeployment.bridgeAddress,
          tokenAddress: fixture.routeDeployment.tokenAddress,
          sourceBridgeAddress: fixture.routeDeployment.sourceBridgeAddress,
          verifierAddress: fixture.routeDeployment.verifierAddress,
        },
      });
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: true,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        auditHashesProduction: true,
        auditHashIssueCount: 0,
        publicDeploymentMatches: true,
      });
      expect(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.sourceParityAttestation,
      ).toMatchObject({
        valid: true,
        requiredMarkers: sourceParityRequiredMarkers(BSC_PROFILES.testnet),
        sdkCount: Object.keys(
          SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
        ).length,
        sdks: expect.objectContaining(
          Object.fromEntries(
            Object.entries(
              SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
            ).map(([sdk, implementation]) => [
              sdk,
              expect.objectContaining({
                implementation,
                implementationHashMatches: true,
                fileCount: Object.keys(
                  sourceParitySdkFileMarkers(BSC_PROFILES.testnet)[sdk],
                ).length,
              }),
            ]),
          ),
        ),
      });
      expect(report.runtimeProverConfig).toMatchObject({
        ok: true,
        required: false,
      });
      expect(report.nextActions).toEqual([]);
      expect(report.missingProductionInputs).toEqual([]);
      expect(JSON.stringify(report)).not.toContain("do-not-leak");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores clean cross-profile handoff artifacts in shared artifact roots", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "mainnet-production-requirements.json"),
        productionRequirementsArtifact(BSC_PROFILES.mainnet),
      );
      await writeJson(
        path.join(fixture.root, "mainnet-source-parity-attestation.json"),
        sourceParityAttestationArtifact(BSC_PROFILES.mainnet),
      );

      const report = await evaluateFixture(fixture);
      const mainnetAttestation = report.files.find(
        (entry) =>
          entry.kind === "source-parity-attestation" &&
          entry.sourceParityAttestation?.bscNetwork === "mainnet",
      );
      const mainnetRequirements = report.files.find(
        (entry) =>
          entry.kind === "production-requirements" &&
          entry.productionRequirements?.bscNetwork === "mainnet",
      );

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.counts.productionRequirementsArtifacts).toBe(1);
      expect(report.counts.sourceParityAttestations).toBe(1);
      expect(mainnetRequirements?.productionRequirements).toMatchObject({
        valid: true,
        bscNetwork: "mainnet",
        contractMatchesExpected: true,
      });
      expect(mainnetRequirements?.findings).toEqual([]);
      expect(mainnetAttestation?.sourceParityAttestation).toMatchObject({
        valid: true,
        bscNetwork: "mainnet",
        requiredMarkers: sourceParityRequiredMarkers(BSC_PROFILES.mainnet),
      });
      expect(mainnetAttestation?.findings).toEqual([]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects self-consistent source-parity attestations with forged required marker categories", async () => {
    const fixture = await createReadyFixture();
    try {
      const attestationPath = path.join(
        fixture.root,
        "source-parity-attestation.json",
      );
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      attestation.requiredMarkers = [
        "BSC_TESTNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
        "forged-marker-category",
        "BSC_TESTNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
      ];
      await writeJson(
        attestationPath,
        recomputeSourceParityHashes(attestation),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.findings,
      );

      expect(report.ready).toBe(false);
      expect(findingText).toMatch(
        /requiredMarkers contain unknown marker forged-marker-category/u,
      );
      expect(
        report.checks.find((entry) => entry.id === "source-parity-attestation"),
      ).toMatchObject({ ok: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects mainnet source-parity attestations repackaged with testnet source markers", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      const attestationPath = path.join(
        fixture.root,
        "source-parity-attestation.json",
      );
      await writeJson(
        attestationPath,
        sourceParityAttestationArtifact(BSC_PROFILES.testnet, {
          bscNetwork: BSC_PROFILES.mainnet.key,
          chain: BSC_PROFILES.mainnet.chain,
          chainIdHex: BSC_PROFILES.mainnet.chainIdHex,
          networkIdHex: BSC_PROFILES.mainnet.networkIdHex,
        }),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.findings,
      );

      expect(report.ready).toBe(false);
      expect(findingText).toMatch(
        /requiredMarkers are missing BSC_MAINNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER/u,
      );
      expect(findingText).toMatch(
        /requiredMarkers contain unknown marker BSC_TESTNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER/u,
      );
      expect(findingText).toMatch(
        /BscTestnetSccpProver\.java|BscMainnetSccp\.java/u,
      );
      expect(
        report.checks.find((entry) => entry.id === "source-parity-attestation"),
      ).toMatchObject({ ok: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects self-consistent source-parity attestations with unexpected SDK file paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const attestationPath = path.join(
        fixture.root,
        "source-parity-attestation.json",
      );
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      attestation.sdks.javascript.files[0].path =
        "javascript/iroha_js/src/pretend-bsc-local-admission.js";
      await writeJson(
        attestationPath,
        recomputeSourceParityHashes(attestation),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.findings,
      );

      expect(report.ready).toBe(false);
      expect(findingText).toMatch(/path is not an expected SDK source path/u);
      expect(findingText).toMatch(
        /is missing expected file javascript\/iroha_js\/src\/sccp\.js/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects source-parity attestations with recomputed tree hashes but drifted SDK implementation hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      const attestationPath = path.join(
        fixture.root,
        "source-parity-attestation.json",
      );
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      attestation.sdks.swift.files[0].sha256 = attestationHash(
        "drifted swift source bytes",
      );
      attestation.sourceTreeHash = sha256Hex(
        Buffer.from(
          stableJsonString({
            schema: attestation.schema,
            routeId: attestation.routeId,
            assetKey: attestation.assetKey,
            bscNetwork: attestation.bscNetwork,
            chain: attestation.chain,
            chainIdHex: attestation.chainIdHex,
            networkIdHex: attestation.networkIdHex,
            domain: attestation.domain,
            proofBackend: attestation.proofBackend,
            requiredMarkers: attestation.requiredMarkers,
            sdks: attestation.sdks,
          }),
          "utf8",
        ),
      );
      await writeJson(attestationPath, attestation);

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.findings,
      );

      expect(report.ready).toBe(false);
      expect(findingText).toMatch(
        /SDK swift implementationHash does not match attested files/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("classifies standalone TAIRA burn-record contracts without treating them as route artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const burnRecord = productionBurnRecordMaterial();
      const contractPath = path.join(
        fixture.root,
        "taira-bsc-xor-burn-record.contract.json",
      );
      await writeJson(
        contractPath,
        tairaBurnRecordContractMaterial({ burnRecord }),
      );

      const report = await evaluateFixture(fixture);
      const contract = report.files.find((entry) =>
        entry.path.endsWith(".contract.json"),
      );

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.counts.productionRouteArtifacts).toBe(1);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(1);
      expect(contract?.kind).toBe("taira-burn-record-contract");
      expect(contract?.tairaBurnRecordContract).toMatchObject({
        valid: true,
        schema: TAIRA_BURN_RECORD_CONTRACT_SCHEMA,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        artifactSha256: burnRecord.artifactSha256,
        artifactProductionProblemCount: 0,
        entrypoint: "burn_and_record",
        permission: "AssetTransferRole",
        executable: "IvmProved",
        forceZkMode: true,
        settlementInstruction: "Burn<Numeric, Asset>",
        recordInstruction: "RecordSccpMessage",
        routeArtifactHashMatches: true,
      });
      expect(
        report.files.filter((entry) => entry.kind === "route"),
      ).toHaveLength(1);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts route-referenced standalone TAIRA burn-record material without clearing route publication", async () => {
    const fixture = await createReadyFixture();
    try {
      const routePath = path.join(
        fixture.root,
        "taira-bsc-xor-route.production.json",
      );
      const route = JSON.parse(await readFile(routePath, "utf8"));
      await writeJson(routePath, {
        ...route,
        productionReady: false,
        disabledReason: "draft route publication is pending",
      });
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-burn-record.contract.json"),
        tairaBurnRecordContractMaterial({
          burnRecord: route.tairaXorBurnRecord,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(1);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact"),
      ).toMatchObject({ ok: false });
      expect(
        report.checks.find(
          (entry) => entry.id === "production-burn-record-material",
        ),
      ).toMatchObject({ ok: true });
      expect(
        report.files.find(
          (entry) => entry.kind === "taira-burn-record-contract",
        )?.tairaBurnRecordContract?.routeArtifactHashMatches,
      ).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects tampered compiled BSC contract artifact hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      const bridgeArtifactPath = path.join(
        fixture.root,
        "contracts",
        "bridge.json",
      );
      await writeJson(bridgeArtifactPath, {
        ...JSON.parse(await readFile(bridgeArtifactPath, "utf8")),
        bytecodeSha256: HASH_11,
      });

      const report = await evaluateFixture(fixture);
      const bridgeFile = report.files.find(
        (entry) => entry.path === relativeModuleUrl(bridgeArtifactPath),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.compiledContractArtifacts).toBe(3);
      expect(
        report.checks.find(
          (entry) => entry.id === "compiled-contract-artifacts",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("bridge"),
      });
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        ),
      ).toMatchObject({ ok: false });
      expect(bridgeFile).toMatchObject({
        kind: "contract-artifact",
        contractArtifact: {
          key: "bridge",
          valid: false,
          bytecodeSha256: HASH_11,
        },
      });
      expect(bridgeFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-compiled-contract-artifact",
            message: expect.stringMatching(
              /bytecodeSha256 does not match bytecode/u,
            ),
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects tampered compiled BSC contract artifact keccak hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      const verifierArtifactPath = path.join(
        fixture.root,
        "contracts",
        "verifier.json",
      );
      await writeJson(verifierArtifactPath, {
        ...JSON.parse(await readFile(verifierArtifactPath, "utf8")),
        deployedBytecodeKeccak256: HASH_22,
      });

      const report = await evaluateFixture(fixture);
      const verifierFile = report.files.find(
        (entry) => entry.path === relativeModuleUrl(verifierArtifactPath),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.compiledContractArtifacts).toBe(3);
      expect(
        report.checks.find(
          (entry) => entry.id === "compiled-contract-artifacts",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("verifier"),
      });
      expect(verifierFile).toMatchObject({
        kind: "contract-artifact",
        contractArtifact: {
          key: "verifier",
          valid: false,
          deployedBytecodeKeccak256: HASH_22,
        },
      });
      expect(verifierFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-compiled-contract-artifact",
            message: expect.stringMatching(
              /deployedBytecodeKeccak256 does not match deployedBytecode/u,
            ),
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("skips generated fixture directories when scanning broad material roots", async () => {
    const parent = await mkdtemp(
      path.join(repoRoot, "output", "sccp-bsc-broad-scan-parent-"),
    );
    const fixture = await createReadyFixture({ rootDir: parent });
    try {
      const report = await evaluateBscSccpProductionMaterialInventory({
        scanPaths: [parent],
        routeReport: fixture.routeReport,
        bscNetwork: fixture.profile.key,
        destinationModuleUrl: fixture.destinationModuleUrl,
        sourceModuleUrl: fixture.sourceModuleUrl,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.counts.skippedGeneratedDirectories).toBe(1);
      expect(report.skippedGeneratedDirectories[0]).toContain(
        "sccp-bsc-material-inventory-test-",
      );
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
      expect(report.counts.productionNativeProverBundles).toBe(0);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact")
          ?.ok,
      ).toBe(false);
      expect(report.nextActions.map((action) => action.id)).toContain(
        "publish-production-route-artifacts",
      );
      const routeAction = report.nextActions.find(
        (action) => action.id === "publish-production-route-artifacts",
      );
      expect(routeAction?.requiredInputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "testnet-bsc-deployment-evidence" }),
          expect.objectContaining({ id: "taira-burn-record-contract" }),
          expect.objectContaining({
            id: "canonical-settlement-asset-definition-id",
          }),
          expect.objectContaining({ id: "burn-record-proof-artifact" }),
          expect.objectContaining({ id: "burn-record-proving-key" }),
          expect.objectContaining({ id: "native-evm-prover-bundle" }),
          expect.objectContaining({ id: "post-deploy-live-evidence" }),
          expect.objectContaining({ id: "deployed-taira-base-config" }),
        ]),
      );
      expect(routeAction?.commands[0]).toContain(
        "--evidence <testnet-deployment-evidence.json>",
      );
      expect(routeAction?.commands[0]).toContain(
        "--taira-contract <taira-burn-record.contract.json>",
      );
      expect(routeAction?.commands[0]).toContain(
        "--native-prover-bundle <native-evm-prover-bundle.json>",
      );
      expect(routeAction?.commands[0]).toContain(
        "--offline-full-toml-evidence <offline-full-toml-evidence.json>",
      );
      expect(routeAction?.commands[0]).toContain(
        "--confirm-testnet taira_bsc_xor",
      );
      expect(routeAction?.commands[0]).not.toMatch(/\{bscNetwork\}/u);
      expect(routeAction?.commands[0]).not.toMatch(
        /\{routeManifestConfirmationArgs\}/u,
      );
      expect(routeAction?.commands[1]).toContain(
        "route-config --manifest <production-route.manifest.json>",
      );
      expect(routeAction?.commands[1]).toContain(
        "--out <production-route.production-ready.torii.toml>",
      );
      expect(routeAction?.commands[1]).toContain(
        "--write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
      );
      const proofAction = report.nextActions.find(
        (action) => action.id === "publish-production-proof-material",
      );
      expect(proofAction?.requiredInputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: "native-prover-artifact-root" }),
          expect.objectContaining({ id: "native-prover-snarkjs-verifier" }),
          expect.objectContaining({ id: "groth16-circom-compiler" }),
          expect.objectContaining({
            id: "production-groth16-verifier-key-json",
          }),
          expect.objectContaining({ id: "burn-record-proof-artifact" }),
          expect.objectContaining({ id: "burn-record-proving-key" }),
          expect.objectContaining({ id: "groth16-powers-of-tau" }),
          expect.objectContaining({ id: "groth16-witness-wasm" }),
          expect.objectContaining({ id: "groth16-material-manifest" }),
          expect.objectContaining({
            id: "candidate-groth16-material-manifest",
          }),
          expect.objectContaining({
            id: "groth16-attestation-request-package",
          }),
          expect.objectContaining({ id: "signed-groth16-role-attestations" }),
          expect.objectContaining({ id: "groth16-proof-self-test-report" }),
          expect.objectContaining({
            id: "trusted-groth16-attestation-signer",
          }),
          expect.objectContaining({ id: "trusted-setup-transcript" }),
          expect.objectContaining({ id: "reproducible-build-transcript" }),
          expect.objectContaining({ id: "cross-sdk-parity-report" }),
          expect.objectContaining({ id: "native-prover-self-test-report" }),
          expect.objectContaining({ id: "javascript-sdk-implementation" }),
          expect.objectContaining({ id: "swift-sdk-implementation" }),
          expect.objectContaining({ id: "kotlin-sdk-implementation" }),
          expect.objectContaining({ id: "java-android-sdk-implementation" }),
          expect.objectContaining({ id: "dotnet-sdk-implementation" }),
          expect.objectContaining({
            id: "semantic-sccp-circuit-attestation",
          }),
          expect.objectContaining({
            id: "trusted-setup-ceremony-attestation",
          }),
          expect.objectContaining({
            id: "reproducible-groth16-build-attestation",
          }),
          expect.objectContaining({ id: "audit-circuit-security" }),
          expect.objectContaining({ id: "audit-native-implementation" }),
          expect.objectContaining({ id: "audit-reproducible-build" }),
          expect.objectContaining({ id: "audit-no-wasm-no-remote-scan" }),
        ]),
      );
      const proofCommands = proofAction?.commands ?? [];
      const findProofCommand = (needle) =>
        proofCommands.find((command) => command.includes(needle));
      expect(findProofCommand("source-parity-attestation")).toContain(
        "source-parity-attestation --bsc-network testnet",
      );
      const materializeCommand = findProofCommand(
        "groth16-material materialize",
      );
      expect(materializeCommand).toContain(
        "groth16-material materialize --bsc-network testnet",
      );
      for (const flag of [
        "--ptau <powersOfTau28_hez_final_22.ptau>",
        "--witness-wasm <production-circuit.wasm>",
        "--snarkjs-bin <snarkjs>",
      ]) {
        expect(materializeCommand).toContain(flag);
      }
      const proofSelfTestCommand = findProofCommand(
        "groth16-material proof-self-test",
      );
      expect(proofSelfTestCommand).toContain(
        "groth16-material proof-self-test --manifest <production-ready-groth16-material.manifest.json>",
      );
      expect(proofSelfTestCommand).toContain(
        "--witness-wasm <production-circuit.wasm>",
      );
      expect(proofSelfTestCommand).toContain("--snarkjs-bin <snarkjs>");
      const requestCommand = findProofCommand(
        "groth16-material attestation-request",
      );
      expect(requestCommand).toContain(
        "groth16-material attestation-request --manifest <candidate-groth16-material.manifest.json>",
      );
      expect(requestCommand).toContain(
        "--semantic-review-evidence <semantic-review-evidence.json>",
      );
      expect(requestCommand).toContain(
        "--circuit-security-audit-evidence <circuit-security-audit-evidence.json>",
      );
      expect(requestCommand).not.toContain("--toolchain-sha256");
      const handoffCommand = findProofCommand(
        "groth16-material handoff-bundle",
      );
      expect(handoffCommand).toContain(
        "groth16-material handoff-bundle --manifest <candidate-groth16-material.manifest.json>",
      );
      expect(handoffCommand).toContain(
        "--transcript-template-package <transcript-template-package.json>",
      );
      expect(handoffCommand).toContain(
        "--evidence-template-package <evidence-template-package.json>",
      );
      expect(handoffCommand).toContain("--request <attestation-request.json>");
      expect(handoffCommand).toContain("--out <attestation-handoff.json>");
      const inventoryCommand = findProofCommand(
        "groth16-material attestation-inventory",
      );
      expect(inventoryCommand).toContain(
        "groth16-material attestation-inventory --request <attestation-request.json>",
      );
      expect(inventoryCommand).toContain(
        "--scan-dir <native-prover-artifact-root>",
      );
      expect(inventoryCommand).toContain(
        "--trusted-attestation-signer <0x...>",
      );
      const finalizeCommand = findProofCommand(
        "groth16-material finalize-attestations",
      );
      expect(finalizeCommand).toContain(
        "groth16-material finalize-attestations --request <attestation-request.json>",
      );
      for (const flag of [
        "--semantic-attestation <semantic-sccp-circuit-attestation.json>",
        "--circuit-security-attestation <circuit-security-audit.json>",
        "--trusted-setup-attestation <trusted-setup-ceremony.json>",
        "--reproducible-build-attestation <reproducible-build-attestation.json>",
        "--trusted-attestation-signer <0x...>",
      ]) {
        expect(finalizeCommand).toContain(flag);
      }
      const nativeBundleCommand = findProofCommand(
        "native-prover-bundle --bsc-network testnet",
      );
      expect(nativeBundleCommand).toContain(
        "native-prover-bundle --bsc-network testnet",
      );
      for (const flag of [
        "--proof-artifact <relative-circuit.r1cs>",
        "--proving-key <relative-circuit.zkey>",
        "--verifier-key <production-verifier-key.json>",
        "--groth16-material-manifest <relative-groth16-material-manifest.json>",
        "--groth16-proof-self-test <relative-groth16-proof-self-test.json>",
        "--snarkjs-bin <snarkjs>",
        "--trusted-attestation-signer <0x...>",
        "--cross-sdk-parity <relative-cross-sdk-parity.json>",
        "--native-prover-self-test <relative-native-self-test.json>",
        "--javascript-implementation <relative-javascript-implementation>",
        "--swift-implementation <relative-swift-implementation>",
        "--kotlin-implementation <relative-kotlin-implementation>",
        "--java-android-implementation <relative-java-android-implementation>",
        "--dotnet-implementation <relative-dotnet-implementation>",
        "--audit-circuit-security <hex-or-relative-file>",
        "--audit-native-implementation <source-parity-attestation.json>",
        "--audit-reproducible-build <hex-or-relative-file>",
        "--audit-no-wasm-no-remote-scan <hex-or-relative-file>",
      ]) {
        expect(nativeBundleCommand).toContain(flag);
      }
      for (const command of proofCommands) {
        expect(command).not.toMatch(/\{bscNetwork\}/u);
      }
      expect(report.missingProductionInputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "production-route-manifest",
            blockedByActions: ["publish-production-route-artifacts"],
          }),
          expect.objectContaining({
            id: "offline-full-toml-evidence",
            blockedByActions: ["publish-production-route-artifacts"],
          }),
          expect.objectContaining({
            id: "cross-sdk-parity-report",
            blockedByActions: ["publish-production-proof-material"],
          }),
          expect.objectContaining({
            id: "audit-no-wasm-no-remote-scan",
            blockedByActions: ["publish-production-proof-material"],
          }),
        ]),
      );
    } finally {
      await rm(parent, { recursive: true, force: true });
    }
  });

  it("rejects configured local browser prover sidecars as production prover evidence", async () => {
    const fixture = await createReadyFixture();
    try {
      const destinationModuleBytes = await readFile(
        fixture.destinationModulePath,
      );
      await writeJson(`${fixture.destinationModulePath}.manifest.json`, {
        schema: "iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1",
        moduleUrl: fixture.destinationModuleUrl,
        moduleSha256: sha256Hex(destinationModuleBytes),
        exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.browserProverSidecars).toBe(2);
      expect(report.browserProvers.destination).toMatchObject({
        ok: false,
        detail: expect.stringMatching(/retired local-only sidecar schema/u),
        sidecar: {
          ok: false,
          manifest: null,
        },
      });
      expect(
        report.files.find(
          (entry) =>
            entry.path ===
            relativeModuleUrl(`${fixture.destinationModulePath}.manifest.json`),
        ),
      ).toMatchObject({
        browserProverSidecar: {
          schema: "iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1",
          valid: false,
        },
        findings: expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-browser-prover-sidecar",
            message: expect.stringMatching(/local-only/u),
          }),
        ]),
      });
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/retired local-only sidecar schema/u);
      const proverAction = report.nextActions.find(
        (action) => action.id === "publish-browser-prover-modules",
      );
      expect(proverAction).toMatchObject({
        blockedByChecks: ["destination-browser-prover"],
      });
      expect(report.missingProductionInputs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "testnet-destination-browser-prover-module",
            blockedByActions: ["publish-browser-prover-modules"],
          }),
        ]),
      );
      expect(JSON.stringify(proverAction)).not.toContain("{bscNetwork}");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("requires generated offline full TOML evidence to match the public route", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(fixture.offlineFullTomlEvidencePath, { force: true });
      const missingReport = await evaluateFixture(fixture);

      expect(missingReport.ready).toBe(false);
      expect(
        missingReport.checks.find(
          (entry) => entry.id === "offline-full-toml-evidence-artifact",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringMatching(
          /No clean offline full-TOML evidence artifact was found/u,
        ),
      });

      await writeJson(
        fixture.offlineFullTomlEvidencePath,
        offlineFullTomlEvidenceArtifact(
          {
            offlineFullTomlSha256: HASH_77,
            hashInputSha256: HASH_77,
            postDeployLiveEvidence: {
              fullTomlReady: true,
              offlineFullTomlSha256: HASH_77,
            },
          },
          fixture.profile,
        ),
      );
      const driftReport = await evaluateFixture(fixture);
      expect(driftReport.ready).toBe(false);
      expect(
        driftReport.checks.find(
          (entry) => entry.id === "offline-full-toml-evidence-artifact",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringMatching(
          /No clean offline full-TOML evidence artifact matched/u,
        ),
      });
      expect(
        driftReport.files.find(
          (entry) => entry.kind === "offline-full-toml-evidence",
        )?.offlineFullTomlEvidence,
      ).toMatchObject({
        valid: true,
        publicPostDeployMatches: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects offline full TOML evidence that serializes peer config material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.offlineFullTomlEvidencePath, {
        ...offlineFullTomlEvidenceArtifact({}, fixture.profile),
        fullToml: '[network]\nprivate_key = "do-not-leak"\n',
      });
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .find((entry) => entry.kind === "offline-full-toml-evidence")
          ?.findings.map((entry) => entry.id),
      ).toContain("invalid-offline-full-toml-evidence");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        ),
      ).toMatchObject({ ok: false });
      expect(JSON.stringify(report)).not.toContain("do-not-leak");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects referenced offline full TOML files with legacy TRON aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      const fullConfigToml = [
        "[[zk.sccp_route_manifests]]",
        `route_id = "${SCCP_BSC_XOR_ROUTE_ID}"`,
        `asset_key = "${SCCP_BSC_XOR_ASSET_KEY}"`,
        `sccp_tron_source_bridge_address = "${BSC_SOURCE_BRIDGE_ADDRESS}"`,
        `tron_verifier_address = "${BSC_VERIFIER_ADDRESS}"`,
        `post_deploy_offline_full_toml_sha256 = "${HASH_88}"`,
        "",
      ].join("\n");
      const fullConfigHash = sha256Hex(
        Buffer.from(
          canonicalizeBscOfflineFullConfigTomlForHash(fullConfigToml),
          "utf8",
        ),
      );
      await writeFile(
        path.join(fixture.root, "legacy-full-config.toml"),
        fullConfigToml,
        "utf8",
      );
      await writeJson(
        fixture.offlineFullTomlEvidencePath,
        offlineFullTomlEvidenceArtifact(
          {
            fullConfigPath: "legacy-full-config.toml",
            offlineFullTomlSha256: fullConfigHash,
            hashInputSha256: fullConfigHash,
            postDeployLiveEvidence: {
              fullTomlReady: true,
              offlineFullTomlSha256: fullConfigHash,
            },
          },
          fixture.profile,
        ),
      );
      const report = await evaluateFixture(fixture);
      const evidenceFile = report.files.find(
        (entry) => entry.kind === "offline-full-toml-evidence",
      );
      const findingText = evidenceFile?.findings
        .map((entry) => entry.message)
        .join("\n");

      expect(report.ready).toBe(false);
      expect(findingText).toMatch(
        /referenced fullConfigPath: sccp_tron_source_bridge_address/u,
      );
      expect(findingText).toMatch(
        /referenced fullConfigPath: tron_verifier_address/u,
      );
      expect(
        report.checks.find(
          (entry) => entry.id === "offline-full-toml-evidence-artifact",
        ),
      ).toMatchObject({ ok: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects offline full TOML evidence without generated path provenance", async () => {
    const cases = [
      [
        "missing route manifest path",
        { routeManifestPath: undefined },
        /routeManifestPath is required/u,
      ],
      [
        "absolute route manifest path",
        { routeManifestPath: "/tmp/route.manifest.json" },
        /routeManifestPath must be a relative path/u,
      ],
      [
        "traversing route manifest path",
        { routeManifestPath: "../route.manifest.json" },
        /routeManifestPath must be a relative path/u,
      ],
      [
        "encoded traversal route manifest path",
        { routeManifestPath: "artifacts/sccp-bsc/%2e%2e/route.manifest.json" },
        /routeManifestPath must not use percent-encoded path segments/u,
      ],
      [
        "scheme route manifest path",
        { routeManifestPath: "https://example.invalid/route.manifest.json" },
        /routeManifestPath must be a relative path/u,
      ],
      [
        "conflicting route manifest path aliases",
        { route_manifest_path: "artifacts/sccp-bsc/other.manifest.json" },
        /routeManifestPath aliases disagree/u,
      ],
      [
        "missing full config path",
        { fullConfigPath: undefined },
        /fullConfigPath is required/u,
      ],
      [
        "absolute full config path",
        { fullConfigPath: "/tmp/full-config.toml" },
        /fullConfigPath must be a relative path/u,
      ],
      [
        "query full config path",
        { fullConfigPath: "artifacts/sccp-bsc/full-config.toml?download=1" },
        /fullConfigPath must be a relative path/u,
      ],
      [
        "backslash full config path",
        { fullConfigPath: "artifacts\\sccp-bsc\\full-config.toml" },
        /fullConfigPath must be a relative path/u,
      ],
      [
        "raw config TOML payload",
        { configToml: "[zk]\nroute_enabled = true\n" },
        /must not serialize configToml/u,
      ],
      [
        "raw full-config TOML payload",
        { fullConfigToml: "[zk]\nroute_enabled = true\n" },
        /must not serialize fullConfigToml/u,
      ],
      [
        "duplicate chain id alias",
        { chain_id_hex: BSC_TESTNET_CHAIN_ID_HEX },
        /offline full TOML evidence chainIdHex must not use multiple aliases/u,
      ],
      [
        "conflicting chain id alias",
        { chain_id_hex: BSC_MAINNET_CHAIN_ID_HEX },
        /offline full TOML evidence chainIdHex aliases disagree/u,
      ],
      [
        "duplicate network id alias",
        { network_id_hex: BSC_TESTNET_NETWORK_ID_HEX },
        /offline full TOML evidence networkIdHex must not use multiple aliases/u,
      ],
      [
        "conflicting network id alias",
        { network_id_hex: BSC_MAINNET_NETWORK_ID_HEX },
        /offline full TOML evidence networkIdHex aliases disagree/u,
      ],
    ];

    for (const [name, overrides, pattern] of cases) {
      const fixture = await createReadyFixture();
      try {
        await writeJson(
          fixture.offlineFullTomlEvidencePath,
          offlineFullTomlEvidenceArtifact(overrides, fixture.profile),
        );
        const report = await evaluateFixture(fixture);
        const evidenceFile = report.files.find(
          (entry) => entry.kind === "offline-full-toml-evidence",
        );
        const findingText = evidenceFile?.findings
          .map((entry) => entry.message)
          .join(" ");

        expect(report.ready, name).toBe(false);
        expect(evidenceFile?.offlineFullTomlEvidence?.valid, name).toBe(false);
        expect(
          evidenceFile?.findings.map((entry) => entry.id),
          name,
        ).toContain("invalid-offline-full-toml-evidence");
        expect(findingText, name).toMatch(pattern);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 30_000);

  it("accepts clean BSC mainnet production material with mainnet-bound sidecars and native bundle", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      const report = await evaluateFixture(fixture);

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.route.bsc).toEqual({
        network: "mainnet",
        chain: "bsc-mainnet",
        chainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
        networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        explorerUrl: "https://bscscan.com",
        explorerHost: "bscscan.com",
      });
      expect(report.counts.productionRouteArtifacts).toBe(1);
      expect(report.counts.productionOfflineFullTomlEvidenceArtifacts).toBe(1);
      expect(report.counts.productionVerifierArtifacts).toBe(1);
      expect(report.counts.productionNativeProverBundles).toBe(1);
      expect(report.counts.productionRequirementsArtifacts).toBe(1);
      expect(report.counts.compiledContractArtifacts).toBe(4);
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        verifierCodeHash: fixture.routeDeployment.verifierCodeHash,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        destinationBindingHash: fixture.routeDeployment.destinationBindingHash,
        explorerUrl: "https://bscscan.com",
        explorerHost: "bscscan.com",
        explorerBindingMatches: true,
        publicDeploymentMatches: true,
      });
      expect(report.browserProvers.destination.ok).toBe(true);
      expect(report.browserProvers.source.ok).toBe(true);
      expect(report.browserProvers.destination.sidecar.manifest).toMatchObject({
        bscChainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
        bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
      });
      const destinationSidecar = JSON.parse(
        await readFile(
          `${fixture.destinationModulePath}.manifest.json`,
          "utf8",
        ),
      );
      expect(destinationSidecar).toMatchObject({
        bscChainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
        bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
      });
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: true,
        chain: BSC_PROFILES.mainnet.chain,
        bundleId: BSC_PROFILES.mainnet.bundleId,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        artifactsVerified: true,
        publicDeploymentMatches: true,
      });
      expect(
        report.files.find((entry) => entry.kind === "source-parity-attestation")
          ?.sourceParityAttestation,
      ).toMatchObject({
        valid: true,
        bscNetwork: "mainnet",
        chain: BSC_PROFILES.mainnet.chain,
        requiredMarkers: sourceParityRequiredMarkers(BSC_PROFILES.mainnet),
        sdks: expect.objectContaining({
          javascript: expect.objectContaining({
            fileCount: Object.keys(
              sourceParitySdkFileMarkers(BSC_PROFILES.mainnet).javascript,
            ).length,
          }),
          "java-android": expect.objectContaining({
            fileCount: Object.keys(
              sourceParitySdkFileMarkers(BSC_PROFILES.mainnet)["java-android"],
            ).length,
          }),
        }),
      });
      expect(
        report.files.find((entry) => entry.kind === "production-requirements")
          ?.productionRequirements,
      ).toMatchObject({
        valid: true,
        bscNetwork: "mainnet",
        inputCount: 41,
        contractMatchesExpected: true,
      });
      expect(JSON.stringify(report)).not.toContain(
        "bsc-testnet-native-evm-prover-bundle.json",
      );
      expect(JSON.stringify(report)).not.toContain(
        "taira-bsc-xor-route.manifest.json",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects mainnet production requirements that point at testnet artifact handoff paths", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      const staleRequirements = productionRequirementsArtifact(
        BSC_PROFILES.mainnet,
      );
      staleRequirements.commands.routeManifest =
        staleRequirements.commands.routeManifest
          .replace(
            "taira-bsc-mainnet-xor-deployment.evidence.json",
            "taira-bsc-xor-deployment.evidence.json",
          )
          .replace(
            "bsc-mainnet-native-evm-prover-bundle.json",
            "bsc-testnet-native-evm-prover-bundle.json",
          )
          .replace(
            "taira-bsc-mainnet-xor-route.manifest.json",
            "taira-bsc-xor-route.manifest.json",
          );
      staleRequirements.commands.nativeProverBundle =
        staleRequirements.commands.nativeProverBundle
          .replaceAll(
            "taira-bsc-mainnet-xor-route.manifest.json",
            "taira-bsc-xor-route.manifest.json",
          )
          .replace(
            "bsc-mainnet-native-evm-prover-bundle.json",
            "bsc-testnet-native-evm-prover-bundle.json",
          );
      staleRequirements.commands.routeConfig =
        "node scripts/sccp_bsc_taira_xor_deploy.mjs route-config --manifest artifacts/sccp-bsc/taira-bsc-xor-route.manifest.json";
      staleRequirements.inputs = staleRequirements.inputs.map((input) =>
        input.id === "production-route-manifest"
          ? {
              ...input,
              placeholder:
                "artifacts/sccp-bsc/taira-bsc-xor-route.manifest.json",
            }
          : input,
      );
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        staleRequirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "mainnet",
        inputCount: 41,
        contractMatchesExpected: true,
      });
      expect(JSON.stringify(requirementsFile)).toMatch(
        /wrong deployment evidence path|wrong native prover bundle path|wrong route manifest output path|wrong route manifest path|production-route-manifest placeholder/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("requires a route-bound production requirements artifact", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(
        report.checks.find(
          (entry) => entry.id === "production-requirements-artifact",
        ),
      ).toMatchObject({
        ok: false,
        detail: "No clean BSC production requirements artifact was found.",
      });
      expect(report.reasons.join("\n")).toMatch(
        /production-requirements-artifact/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale BSC production requirements missing route-manifest handoff inputs", async () => {
    const fixture = await createReadyFixture();
    try {
      const staleRequirements = productionRequirementsArtifact();
      delete staleRequirements.commands.routeManifest;
      staleRequirements.inputs = staleRequirements.inputs.filter(
        (input) =>
          ![
            "taira-burn-record-contract",
            "testnet-bsc-deployment-evidence",
            "canonical-settlement-asset-definition-id",
            "post-deploy-live-evidence",
          ].includes(input.id),
      );
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        staleRequirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "testnet",
        inputCount: 37,
        contractMatchesExpected: false,
      });
      expect(JSON.stringify(requirementsFile)).toMatch(
        /command routeManifest is invalid|inputs is missing testnet-bsc-deployment-evidence|inputs is missing taira-burn-record-contract|inputs is missing canonical-settlement-asset-definition-id|inputs is missing post-deploy-live-evidence/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route-manifest requirements commands without live production evidence", async () => {
    const fixture = await createReadyFixture();
    try {
      const staleRequirements = productionRequirementsArtifact();
      staleRequirements.commands.routeManifest =
        "node scripts/sccp_bsc_taira_xor_deploy.mjs route-manifest --evidence artifacts/sccp-bsc/taira-bsc-xor.deployment.evidence.json --settlement-asset-definition-id <canonical-asset-definition-id> --proof-artifact-hash <0x...> --proving-key-hash <0x...>";
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        staleRequirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "testnet",
        inputCount: 41,
        contractMatchesExpected: true,
      });
      expect(JSON.stringify(requirementsFile)).toMatch(
        /routeManifest command lacks --taira-contract|routeManifest command lacks --source-bridge-config-hash|routeManifest command lacks --offline-full-toml-evidence|routeManifest command is not production-ready explicit/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production requirements that publish raw offline full TOML hashes instead of generated evidence", async () => {
    const fixture = await createReadyFixture();
    try {
      const staleRequirements = productionRequirementsArtifact();
      staleRequirements.commands.routeManifest =
        staleRequirements.commands.routeManifest.replace(
          `--offline-full-toml-evidence ${fullConfigEvidencePathForProfile(fixture.profile)}`,
          "--offline-full-toml-sha256 <0x...>",
        );
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        staleRequirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "testnet",
        inputCount: 41,
        contractMatchesExpected: true,
      });
      expect(JSON.stringify(requirementsFile)).toMatch(
        /routeManifest command lacks --offline-full-toml-evidence|routeManifest command uses raw offline full TOML hash instead of generated evidence/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects forged BSC production requirements artifacts", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        {
          ...productionRequirementsArtifact(BSC_PROFILES.mainnet),
          inputs: [
            ...productionRequirementsArtifact(BSC_PROFILES.mainnet).inputs,
            {
              id: "production-route-manifest",
              kind: "file",
              placeholder: "<duplicate>",
              requiredBy: ["production"],
              description: "duplicate",
            },
          ],
          commands: {
            ...productionRequirementsArtifact(BSC_PROFILES.mainnet).commands,
            deploy:
              "node scripts/sccp_bsc_taira_xor_deploy.mjs deploy --bsc-network mainnet --verifier <production-verifier-key.json> --broadcast true --confirm-testnet taira_bsc_xor",
            nativeProverBundle:
              "node scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --route-manifest <manifest>",
          },
        },
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "mainnet",
      });
      expect(requirementsFile?.findings.map((entry) => entry.id)).toContain(
        "invalid-production-requirements-artifact",
      );
      expect(JSON.stringify(requirementsFile)).toMatch(
        /bsc\.network is invalid|legacy confirmation|lacks --proof-artifact|duplicate production-route-manifest/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale production requirements input contracts", async () => {
    const fixture = await createReadyFixture();
    try {
      const staleRequirements = productionRequirementsArtifact(
        BSC_PROFILES.testnet,
      );
      staleRequirements.inputs = staleRequirements.inputs.map((input) =>
        input.id === "native-prover-artifact-root"
          ? {
              ...input,
              kind: "file",
              requiredBy: ["production"],
            }
          : input,
      );
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        staleRequirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "testnet",
        contractMatchesExpected: false,
      });
      expect(requirementsFile?.findings.map((entry) => entry.id)).toContain(
        "invalid-production-requirements-artifact",
      );
      expect(JSON.stringify(requirementsFile)).toMatch(
        /native-prover-artifact-root kind must be directory|requiredBy is missing native-prover-bundle|unsupported production/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects malformed production requirements input rows", async () => {
    const fixture = await createReadyFixture();
    try {
      const requirements = productionRequirementsArtifact(BSC_PROFILES.testnet);
      requirements.inputs = [...requirements.inputs, "not-a-requirement"];
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-production-requirements.json"),
        requirements,
      );

      const report = await evaluateFixture(fixture);
      const requirementsFile = report.files.find(
        (entry) => entry.kind === "production-requirements",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRequirementsArtifacts).toBe(0);
      expect(requirementsFile?.productionRequirements).toMatchObject({
        valid: false,
        bscNetwork: "testnet",
        contractMatchesExpected: true,
      });
      expect(JSON.stringify(requirementsFile)).toMatch(
        /production requirements inputs\[41\] must be an object/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not classify verifier material from vk substrings in parent directories", async () => {
    const fixture = await createReadyFixture({
      rootPrefix: "sccp-bsc-material-inventory-vk-parent-",
    });
    try {
      const report = await evaluateFixture(fixture);

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(
        report.files
          .filter((entry) => entry.path.includes("vk-parent"))
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).not.toContain("wrong-network-verifier-material");
      expect(
        report.files
          .filter((entry) => entry.path.includes("vk-parent"))
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).not.toContain("wrong-domain-verifier-material");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover sidecars with unsupported production fields", async () => {
    const fixture = await createReadyFixture();
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const manifest = JSON.parse(await readFile(sidecarPath, "utf8"));
      await writeJson(sidecarPath, {
        ...manifest,
        customData: {
          operator: "do-not-leak-top-level-sidecar-value",
        },
        deployment: {
          ...manifest.deployment,
          operatorNotes: "do-not-leak-deployment-sidecar-value",
        },
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      const detail = report.checks.find(
        (entry) => entry.id === "destination-browser-prover",
      )?.detail;
      expect(detail).toMatch(/manifest contains unsupported field customData/u);
      expect(detail).toMatch(
        /manifest\.deployment contains unsupported field operatorNotes/u,
      );
      expect(JSON.stringify(report)).not.toContain(
        "do-not-leak-top-level-sidecar-value",
      );
      expect(JSON.stringify(report)).not.toContain(
        "do-not-leak-deployment-sidecar-value",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC mainnet inventory when verifier material is still testnet-bound", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: BSC_PROFILES.testnet.chain,
        chainIdHex: BSC_PROFILES.testnet.chainIdHex,
        networkId: BSC_PROFILES.testnet.networkIdHex,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("wrong-network-verifier-material");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts clean route-bound verifier material from deployment evidence when the standalone verifier file is absent", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(fixture.verifierPath, { force: true });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(true);
      expect(
        report.checks.find(
          (entry) => entry.id === "production-verifier-material",
        )?.ok,
      ).toBe(true);
      expect(
        report.files.some(
          (entry) =>
            entry.kind !== "verifier" &&
            entry.verifier?.hashMatchesPublicRoute === true,
        ),
      ).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("classifies route-bound Groth16 verifier-key JSON as verifier material", async () => {
    const fixture = await createReadyFixture();
    try {
      const verifier = JSON.parse(await readFile(fixture.verifierPath, "utf8"));
      await writeJson(fixture.verifierPath, {
        ...verifier,
        schema: "iroha-sccp-bsc-groth16-verifier-key/v1",
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: fixture.profile.key,
      });

      const report = await evaluateFixture(fixture);
      const verifierFile = report.files.find(
        (entry) => entry.path === relativeModuleUrl(fixture.verifierPath),
      );

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.counts.productionRouteArtifacts).toBe(1);
      expect(report.counts.productionVerifierArtifacts).toBe(1);
      expect(verifierFile).toMatchObject({
        kind: "verifier",
        verifier: expect.objectContaining({
          hashMatchesPublicRoute: true,
          bscNetworkBound: true,
          bscRouteDomainBound: true,
          g1MaterialValid: true,
          g2MaterialValid: true,
        }),
      });
      expect(verifierFile?.route).toBeUndefined();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC mainnet inventory carrying a testnet native EVM prover bundle", async () => {
    const fixture = await createReadyFixture({ profile: BSC_PROFILES.mainnet });
    try {
      await writeJson(
        fixture.nativeBundlePath,
        nativeEvmProverBundle(fixture.routeDeployment, BSC_PROFILES.testnet),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-native-evm-prover-bundle");
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/No clean SDK-validated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("accepts an explicit runtime prover config only when its referenced material is route-bound", async () => {
    const baseFixture = await createReadyFixture();
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: true,
        required: true,
        configUrl: fixture.runtimeConfigUrl,
        manifest: {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          destination: {
            nativeEvmProverBundleHash:
              fixture.routeDeployment.nativeEvmProverBundleHash,
            proofArtifactSha256: fixture.routeDeployment.proofArtifactHash,
            provingKeySha256: fixture.routeDeployment.provingKeyHash,
            verifierKeySha256: fixture.verifierKeyArtifactHash,
            backendSelfContained: true,
          },
          source: {
            backendSelfContained: true,
          },
        },
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")?.ok,
      ).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("accepts an explicit BSC mainnet runtime prover config only when it stays mainnet-bound", async () => {
    const baseFixture = await createReadyFixture({
      profile: BSC_PROFILES.mainnet,
    });
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: true,
        required: true,
        manifest: {
          bscNetwork: "mainnet",
          bscChain: "bsc-mainnet",
          bscChainIdHex: BSC_MAINNET_CHAIN_ID_HEX,
          bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
          destination: {
            nativeEvmProverBundleHash:
              fixture.routeDeployment.nativeEvmProverBundleHash,
            proofArtifactSha256: fixture.routeDeployment.proofArtifactHash,
            provingKeySha256: fixture.routeDeployment.provingKeyHash,
            verifierKeySha256: fixture.verifierKeyArtifactHash,
            backendSelfContained: true,
          },
          source: {
            nativeEvmProverBundleHash:
              fixture.routeDeployment.nativeEvmProverBundleHash,
            backendSelfContained: true,
          },
        },
      });
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: true,
        chain: "bsc-mainnet",
        bundleId: SCCP_BSC_MAINNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
        artifactsVerified: true,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime prover configs whose backend hash drifts from disk", async () => {
    const baseFixture = await createReadyFixture();
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      await writeFile(
        fixture.backendPath,
        `${runtimeBackendSource()}\nexport const tampered = true;\n`,
        "utf8",
      );

      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready).toBe(false);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/not canonical|backend module sha256 .* does not match/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime prover configs with duplicate JSON object keys", async () => {
    const baseFixture = await createReadyFixture();
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      const configText = await readFile(fixture.runtimeConfigPath, "utf8");
      await writeFile(
        fixture.runtimeConfigPath,
        configText.replace(
          '"routeId": "taira_bsc_xor",',
          '"routeId": "taira_bsc_shadow",\n  "routeId": "taira_bsc_xor",',
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready).toBe(false);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/duplicate JSON object key/u);
      expect(JSON.stringify(report)).not.toContain("taira_bsc_shadow");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime prover configs whose hash-matching backend imports unverified code", async () => {
    const baseFixture = await createReadyFixture();
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      const importedBackend = Buffer.from(
        `import "https://cdn.example.invalid/extra.js";\n${runtimeBackendSource()}\n`,
      );
      const config = JSON.parse(
        await readFile(fixture.runtimeConfigPath, "utf8"),
      );
      await writeFile(fixture.backendPath, importedBackend);
      await writeJson(fixture.runtimeConfigPath, {
        ...config,
        destination: {
          ...config.destination,
          backendModuleSha256: sha256Hex(importedBackend),
        },
        source: {
          ...config.source,
          backendModuleSha256: sha256Hex(importedBackend),
        },
      });

      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready).toBe(false);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/must be self-contained and must not import/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects runtime prover config URLs with parent directory traversal", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: "../operator/prover.config.json",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/parent directory/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized streamed remote runtime prover configs", async () => {
    const fixture = await createReadyFixture();
    try {
      const fetchCalls = [];
      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl:
          "https://cdn.example.invalid/taira-bsc-xor-prover.config.json",
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));
          return streamingBytesResponse(512 * 1024 + 1);
        },
      });

      expect(report.ready).toBe(false);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/exceeds 524288 bytes/u);
      expect(fetchCalls).toEqual([
        "https://cdn.example.invalid/taira-bsc-xor-prover.config.json",
      ]);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized local runtime prover configs before parsing them", async () => {
    const baseFixture = await createReadyFixture();
    const fixture = await addRuntimeProverConfigToFixture(baseFixture);
    try {
      await writeFile(
        fixture.runtimeConfigPath,
        Buffer.alloc(512 * 1024 + 1, 0x61),
      );

      const report = await evaluateFixture(fixture, {
        runtimeProverConfigUrl: fixture.runtimeConfigUrl,
      });

      expect(report.ready).toBe(false);
      expect(report.runtimeProverConfig).toMatchObject({
        ok: false,
        required: true,
      });
      expect(
        report.checks.find((entry) => entry.id === "runtime-prover-config")
          ?.detail,
      ).toMatch(/too large/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 15_000);

  it("rejects native EVM prover bundles that fail sibling SDK validation", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.nativeBundlePath, {
        ...nativeEvmProverBundle(fixture.routeDeployment),
        chain: "eth",
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-native-evm-prover-bundle");
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/No clean SDK-validated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles that reuse hashes across cryptographic roles", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      bundle.verifierKeyArtifactHash =
        bundle.proofArtifactHash ?? bundle.proof_artifact_hash;
      bundle.verifier_key_artifact_hash =
        bundle.proof_artifact_hash ?? bundle.proofArtifactHash;
      await writeJson(fixture.nativeBundlePath, bundle);

      const report = await evaluateFixture(fixture);
      const nativeBundleFile = report.files.find(
        (entry) => entry.kind === "native-prover-bundle",
      );

      expect(report.ready).toBe(false);
      expect(nativeBundleFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-native-evm-prover-bundle",
            message: expect.stringMatching(
              /proofArtifactHash must not equal verifierKeyArtifactHash/u,
            ),
          }),
        ]),
      );
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/No clean SDK-validated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles whose parity and self-test reports reuse proof hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      await injectNativeSelfTestSourceProofCollision(fixture);

      const report = await evaluateFixture(fixture);
      const nativeBundleFile = report.files.find(
        (entry) => entry.kind === "native-prover-bundle",
      );

      expect(report.ready).toBe(false);
      expect(nativeBundleFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "unverified-native-evm-prover-artifacts",
            message: expect.stringMatching(
              /nativeProverReports hashes must be role-separated: nativeProverSelfTest\.sourceProofHash matches crossSdkParity\.sourceProofHash/u,
            ),
          }),
        ]),
      );
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/No clean SDK-validated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects generated native EVM prover bundles with missing SDK implementation bytes", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(path.join(fixture.artifactRoot, "dotnet/implementation.native"));

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("unverified-native-evm-prover-artifacts");
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        artifactsVerified: false,
        verifiedSdks: expect.not.arrayContaining(["dotnet"]),
      });
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/verified artifact bytes/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized generated native EVM prover bundle artifacts before reading them", async () => {
    const fixture = await createReadyFixture();
    try {
      const implementationPath = path.join(
        fixture.artifactRoot,
        "dotnet/implementation.native",
      );
      await writeFile(implementationPath, "");
      await truncate(
        implementationPath,
        SCCP_BSC_NATIVE_PROVER_ARTIFACT_MAX_BYTES + 1,
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      const findings = report.files.flatMap((entry) => entry.findings);
      expect(findings.map((entry) => entry.id)).toContain(
        "unverified-native-evm-prover-artifacts",
      );
      expect(
        findings.find(
          (entry) => entry.id === "unverified-native-evm-prover-artifacts",
        )?.message,
      ).toMatch(/maximum allowed/u);
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        artifactsVerified: false,
        verifiedSdks: expect.not.arrayContaining(["dotnet"]),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundle artifacts that resolve outside the scanned roots", async () => {
    const fixture = await createReadyFixture();
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-native-artifact-escape-"),
    );
    try {
      const implementationPath = path.join(
        fixture.artifactRoot,
        "dotnet/implementation.native",
      );
      const escapedImplementationPath = path.join(
        outside,
        "implementation.native",
      );
      await writeFile(
        escapedImplementationPath,
        await readFile(implementationPath),
      );
      await rm(implementationPath);
      await symlink(escapedImplementationPath, implementationPath);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("unverified-native-evm-prover-artifacts");
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        artifactsVerified: false,
        verifiedSdks: expect.not.arrayContaining(["dotnet"]),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles with percent-encoded artifact paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      bundle.proof_artifact = `artifacts/${fixture.profile.chain}/%2e%2e/proof-artifact.r1cs`;
      await writeJson(fixture.nativeBundlePath, bundle);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-native-evm-prover-bundle");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(
        /proofArtifact must not contain percent-encoded path segments/u,
      );
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: false,
        artifactsVerified: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles with query or fragment artifact paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const cleanBundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      const cases = [
        {
          mutate(bundle) {
            bundle.proof_artifact = `artifacts/${fixture.profile.chain}/proof-artifact.r1cs?sha256=abc`;
          },
          pattern: /proofArtifact must not contain query strings or fragments/u,
        },
        {
          mutate(bundle) {
            bundle.native_sdk_artifacts = bundle.native_sdk_artifacts.map(
              (artifact) =>
                artifact.sdk === "javascript"
                  ? {
                      ...artifact,
                      implementation_artifact: `artifacts/${fixture.profile.chain}/javascript-implementation.bin#sha256`,
                    }
                  : artifact,
            );
          },
          pattern:
            /nativeSdkArtifacts\[0\]\.implementationArtifact must not contain query strings or fragments/u,
        },
      ];

      for (const testCase of cases) {
        const bundle = structuredClone(cleanBundle);
        testCase.mutate(bundle);
        await writeJson(fixture.nativeBundlePath, bundle);

        const report = await evaluateFixture(fixture);

        expect(report.ready).toBe(false);
        expect(
          report.files
            .flatMap((entry) => entry.findings)
            .map((entry) => entry.id),
        ).toContain("invalid-native-evm-prover-bundle");
        expect(
          report.files
            .flatMap((entry) => entry.findings)
            .map((entry) => entry.message)
            .join(" "),
        ).toMatch(testCase.pattern);
        expect(
          report.files.find((entry) => entry.kind === "native-prover-bundle")
            ?.nativeProverBundle,
        ).toMatchObject({
          valid: false,
          artifactsVerified: false,
        });
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles whose support artifacts use duplicate aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      const profile = fixture.profile;
      const parityPath = path.join(
        fixture.artifactRoot,
        "cross-sdk-parity.json",
      );
      const parity = JSON.parse(await readFile(parityPath, "utf8"));
      parity.proofArtifactHash = parity.proof_artifact_hash;
      await writeJson(parityPath, parity);
      const parityHash = sha256Hex(await readFile(parityPath));

      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      const auditHashes = bundle.audit_hashes ?? bundle.auditHashes;
      auditHashes.cross_sdk_parity = parityHash;
      await writeJson(fixture.nativeBundlePath, bundle);

      fixture.routeDeployment.nativeEvmProverBundleHash =
        canonicalBscNativeEvmProverBundleHash(
          profile.validateBundle(bundle, {
            expectedDestinationBindingHash:
              fixture.routeDeployment.destinationBindingHash,
          }),
        );
      fixture.routeReport = routeReport(
        { deployment: fixture.routeDeployment },
        profile,
      );
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: profile.explorerUrl,
          explorerHost: profile.explorerHost,
          deployment: fixture.routeDeployment,
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );
      const destinationModuleBytes = await readFile(
        fixture.destinationModulePath,
      );
      const sourceModuleBytes = await readFile(fixture.sourceModulePath);
      await writeJson(
        `${fixture.destinationModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.destinationModuleUrl,
          moduleSha256: sha256Hex(destinationModuleBytes),
          direction: "destination",
          deploymentInfo: fixture.routeDeployment,
          profile,
        }),
      );
      await writeJson(
        `${fixture.sourceModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.sourceModuleUrl,
          moduleSha256: sha256Hex(sourceModuleBytes),
          direction: "source",
          deploymentInfo: fixture.routeDeployment,
          profile,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("unverified-native-evm-prover-artifacts");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/multiple aliases/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles whose parity artifact uses a legacy fixture schema", async () => {
    const fixture = await createReadyFixture();
    try {
      const profile = fixture.profile;
      const parityPath = path.join(
        fixture.artifactRoot,
        "cross-sdk-parity.json",
      );
      const parity = JSON.parse(await readFile(parityPath, "utf8"));
      parity.schema = profile.legacyParityFixtureSchema;
      await writeJson(parityPath, parity);

      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      const auditHashes = bundle.audit_hashes ?? bundle.auditHashes;
      auditHashes.cross_sdk_parity = sha256Hex(await readFile(parityPath));
      await writeJson(fixture.nativeBundlePath, bundle);
      fixture.routeDeployment.nativeEvmProverBundleHash =
        canonicalBscNativeEvmProverBundleHash(
          profile.validateBundle(bundle, {
            expectedDestinationBindingHash:
              fixture.routeDeployment.destinationBindingHash,
          }),
        );
      await rewriteFixtureRouteEvidence(fixture);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("unverified-native-evm-prover-artifacts");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/legacy fixture schema .* is not valid/u);
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: true,
        artifactsVerified: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundles that use legacy fixture parity artifact aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      bundle.cross_sdk_fixture_parity_artifact =
        bundle.cross_sdk_parity_artifact;
      delete bundle.cross_sdk_parity_artifact;
      await writeJson(fixture.nativeBundlePath, bundle);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-native-evm-prover-bundle");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/legacy crossSdkFixtureParityArtifact/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps native EVM prover artifact resolution on production parity fields only", async () => {
    const scriptText = await readFile(
      path.join(
        repoRoot,
        "scripts/e2e/sccp-bsc-production-material-inventory.mjs",
      ),
      "utf8",
    );
    const artifactPathHelper = scriptText.match(
      /const nativeProverBundleParityArtifactPath = \(descriptor\) =>[\s\S]*?\n\s*\);/u,
    )?.[0];

    expect(artifactPathHelper).toContain("crossSdkParityArtifact");
    expect(artifactPathHelper).toContain("cross_sdk_parity_artifact");
    expect(artifactPathHelper).not.toContain("crossSdkFixtureParityArtifact");
    expect(artifactPathHelper).not.toContain(
      "cross_sdk_fixture_parity_artifact",
    );
  });

  it("rejects native EVM prover bundles that use legacy fixture parity audit hash keys", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      const auditHashes = bundle.audit_hashes ?? bundle.auditHashes;
      auditHashes.cross_sdk_fixture_parity = auditHashes.cross_sdk_parity;
      delete auditHashes.cross_sdk_parity;
      await writeJson(fixture.nativeBundlePath, bundle);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-native-evm-prover-bundle");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/legacy cross_sdk_fixture_parity/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover reports not bound to the signed Groth16 material manifest", async () => {
    for (const { fileName, auditHashKey, forgedHashLabel, expectedMessage } of [
      {
        fileName: "cross-sdk-parity.json",
        auditHashKey: "cross_sdk_parity",
        forgedHashLabel: "forged inventory parity production attestation hash",
        expectedMessage:
          /crossSdkParityArtifact production_attestation_hash must be role-derived/u,
      },
      {
        fileName: "native-prover-self-test.json",
        auditHashKey: "native_prover_self_test",
        forgedHashLabel:
          "forged inventory self-test production attestation hash",
        expectedMessage:
          /nativeProverSelfTestArtifact production_attestation_hash must be role-derived/u,
      },
    ]) {
      const fixture = await createReadyFixture();
      try {
        const artifactPath = path.join(fixture.artifactRoot, fileName);
        const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
        artifact.production_attestation_hash = attestationHash(forgedHashLabel);
        await writeJson(artifactPath, artifact);

        const bundle = JSON.parse(
          await readFile(fixture.nativeBundlePath, "utf8"),
        );
        const auditHashes = bundle.audit_hashes ?? bundle.auditHashes;
        auditHashes[auditHashKey] = sha256Hex(await readFile(artifactPath));
        await writeJson(fixture.nativeBundlePath, bundle);
        fixture.routeDeployment.nativeEvmProverBundleHash =
          canonicalBscNativeEvmProverBundleHash(
            fixture.profile.validateBundle(bundle, {
              expectedDestinationBindingHash:
                fixture.routeDeployment.destinationBindingHash,
            }),
          );
        await rewriteFixtureRouteEvidence(fixture);

        const report = await evaluateFixture(fixture);

        expect(report.ready).toBe(false);
        expect(
          report.files
            .flatMap((entry) => entry.findings)
            .map((entry) => entry.id),
        ).toContain("unverified-native-evm-prover-artifacts");
        expect(
          report.files
            .flatMap((entry) => entry.findings)
            .map((entry) => entry.message)
            .join(" "),
        ).toMatch(expectedMessage);
        expect(
          report.files.find((entry) => entry.kind === "native-prover-bundle")
            ?.nativeProverBundle,
        ).toMatchObject({
          valid: true,
          artifactsVerified: false,
        });
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  });

  it("rejects native EVM prover bundles with placeholder audit hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      const auditHashes = bundle.audit_hashes ?? bundle.auditHashes;
      auditHashes.circuit_security_audit = repeatedHash(0xa1);
      await writeJson(fixture.nativeBundlePath, bundle);

      const report = await evaluateFixture(fixture);
      const nativeBundle = report.files.find(
        (entry) => entry.kind === "native-prover-bundle",
      )?.nativeProverBundle;

      expect(report.ready).toBe(false);
      expect(nativeBundle).toMatchObject({
        valid: false,
        artifactsVerified: false,
        auditHashesProduction: false,
        auditHashIssueCount: 1,
      });
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-native-evm-prover-audit-hashes");
      expect(JSON.stringify(report)).not.toContain(repeatedHash(0xa1));
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/No clean SDK-validated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale production-ready route artifacts that carry diagnostic verifier material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(path.join(fixture.root, "stale-production-ready.json"), {
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        productionReady: true,
        diagnosticVerifier: true,
        verifierKeyHash: DIAGNOSTIC_VERIFIER_HASH,
        proofArtifactHash: HASH_44,
        provingKeyHash: HASH_66,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/production-ready-diagnostic-route|known-diagnostic/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with conflicting nested hash aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          proofArtifactHash: HASH_77,
          deployment: fixture.routeDeployment,
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/conflicting-route-material/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with handoff placeholder text", async () => {
    const variants = [
      {
        label: "todo warning",
        patch: { operatorWarning: "TODO replace verifier material" },
        expected: /route\.operatorWarning/u,
      },
      {
        label: "example post-deploy note",
        patch: {
          postDeployLiveEvidence: {
            operatorNote: "example verifier evidence must not ship",
          },
        },
        expected: /route\.postDeployLiveEvidence\.operatorNote/u,
      },
      {
        label: "replace-me rollout key",
        patch: {
          destinationRollout: {
            replaceMeVerifierKeyHash: HASH_22,
          },
        },
        expected: /route\.destinationRollout\.replaceMeVerifierKeyHash/u,
      },
    ];

    for (const { label, patch, expected } of variants) {
      const fixture = await createReadyFixture();
      try {
        const routePath = path.join(
          fixture.root,
          "taira-bsc-xor-route.production.json",
        );
        const route = JSON.parse(await readFile(routePath, "utf8"));
        await writeJson(routePath, {
          ...route,
          ...patch,
          postDeployLiveEvidence: {
            ...route.postDeployLiveEvidence,
            ...patch.postDeployLiveEvidence,
          },
          destinationRollout: {
            ...route.destinationRollout,
            ...patch.destinationRollout,
          },
        });

        const report = await evaluateFixture(fixture);
        const findings = report.files
          .flatMap((entry) => entry.findings)
          .filter((entry) => entry.id === "production-ready-diagnostic-route");

        expect(report.ready, label).toBe(false);
        expect(findings.map((entry) => entry.message).join("\n")).toMatch(
          expected,
        );
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 20_000);

  it("rejects production route artifact paths with handoff placeholders", async () => {
    const fixture = await createReadyFixture();
    try {
      const routePath = path.join(
        fixture.root,
        "taira-bsc-xor-route.production.json",
      );
      const route = JSON.parse(await readFile(routePath, "utf8"));
      await writeJson(
        path.join(fixture.root, "todo-taira-bsc-xor-route.production.json"),
        route,
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-diagnostic-route");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("requires clean route-bound BSC deployment evidence", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(fixture.deploymentEvidencePath, { force: true });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "deployment-evidence-artifact",
        )?.detail,
      ).toMatch(/No clean BSC deployment evidence artifact/u);
      expect(
        report.nextActions.find(
          (entry) => entry.id === "publish-production-route-artifacts",
        )?.blockedByChecks,
      ).toContain("deployment-evidence-artifact");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with handoff placeholder text", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-deployment.evidence.json"),
        {
          schema: BSC_DEPLOYMENT_EVIDENCE_SCHEMA,
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: fixture.profile.key,
          chain: fixture.profile.chain,
          chainIdHex: fixture.profile.chainIdHex,
          networkIdHex: fixture.profile.networkIdHex,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence({}, fixture.profile),
          operatorNote: "TODO replace verifier material",
        },
      );

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "diagnostic-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /deploymentEvidence\.operatorNote/u,
      );
      expect(report.files).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "deployment-evidence",
            deploymentEvidence: expect.objectContaining({
              schema: BSC_DEPLOYMENT_EVIDENCE_SCHEMA,
              productionPlaceholderFree: false,
            }),
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence for the wrong selected network", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
        {
          bscNetwork: "mainnet",
        },
      );
      await writeJson(fixture.deploymentEvidencePath, evidence);

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /BSC network must be testnet/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with false contract readback", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        bscContractReadback: {
          ...evidence.bscContractReadback,
          tokenBridgeLocked: false,
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /tokenBridgeLocked must be true/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence whose compiled code hashes do not match readback", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        compiledContractCodeHashes: {
          ...evidence.compiledContractCodeHashes,
          sourceBridge: HASH_66,
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /compiledContractCodeHashes\.sourceBridge must match bscContractReadback\.codeHashes\.sourceBridge/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence whose verifier readback code hash drifts from the route", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        compiledContractCodeHashes: {
          ...evidence.compiledContractCodeHashes,
          verifier: HASH_66,
        },
        bscContractReadback: {
          ...evidence.bscContractReadback,
          codeHashes: {
            ...evidence.bscContractReadback.codeHashes,
            verifier: HASH_66,
          },
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /bscContractReadback\.codeHashes\.verifier must match verifierCodeHash/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence whose readback target address drifts", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        bscContractReadback: {
          ...evidence.bscContractReadback,
          tokenAddress: "0x1234567890abcdef1234567890abcdef12345678",
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /bscContractReadback\.tokenAddress must match deployment evidence/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with unsupported contract readback fields", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        bscContractReadback: {
          ...evidence.bscContractReadback,
          rawReceipt: "0x01",
          codePresent: {
            ...evidence.bscContractReadback.codePresent,
            verifierDebugTrace: true,
          },
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /bscContractReadback contains unsupported field rawReceipt/u,
      );
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /bscContractReadback\.codePresent contains unsupported field verifierDebugTrace/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with unsupported top-level fields", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        disabledReason: "route publication pending",
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /deploymentEvidence contains unsupported field disabledReason/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence missing a required post-deploy checklist item", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        postDeployChecklist: evidence.postDeployChecklist.slice(1),
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /postDeployChecklist is missing required item TairaXOR\.bridge\(\) equals bscBridgeAddress/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with forged post-deploy checklist items", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        postDeployChecklist: [
          ...evidence.postDeployChecklist,
          "Explorer screenshot checked manually",
        ],
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /postDeployChecklist contains unsupported item Explorer screenshot checked manually/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with destination version drift", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        destinationRollout: {
          ...evidence.destinationRollout,
          version: 2,
        },
        destinationBinding: {
          ...evidence.destinationBinding,
          version: 2,
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /destinationRollout\.version must be 1/u,
      );
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /destinationBinding\.version must be 1/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence whose verifier contract readback drifts", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        bscContractReadback: {
          ...evidence.bscContractReadback,
          verifierKeyHash: HASH_44,
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /bscContractReadback\.verifierKeyHash must match deployment evidence/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC deployment evidence with forged destination binding", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidence = deploymentEvidenceArtifact(
        fixture.routeDeployment,
        fixture.profile,
      );
      await writeJson(fixture.deploymentEvidencePath, {
        ...evidence,
        destinationRollout: {
          ...evidence.destinationRollout,
          destinationBindingHash: HASH_44,
        },
        destinationBinding: {
          ...evidence.destinationBinding,
          bindingHash: HASH_44,
        },
        bscContractReadback: {
          ...evidence.bscContractReadback,
          bridgeDestinationBindingHash: HASH_44,
        },
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "invalid-deployment-evidence");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /destinationBindingHash does not match computed binding/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects native EVM prover bundle JSON with handoff placeholder text", async () => {
    const fixture = await createReadyFixture();
    try {
      const bundle = JSON.parse(
        await readFile(fixture.nativeBundlePath, "utf8"),
      );
      await writeJson(fixture.nativeBundlePath, {
        ...bundle,
        operatorNote: "example verifier evidence must not ship",
      });

      const report = await evaluateFixture(fixture);
      const findings = report.files
        .flatMap((entry) => entry.findings)
        .filter((entry) => entry.id === "diagnostic-native-evm-prover-bundle");

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.message).join("\n")).toMatch(
        /nativeEvmProverBundle\.operatorNote/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with placeholder TAIRA burn-record material", async () => {
    const fixture = await createReadyFixture();
    try {
      const burnRecordBytes = Buffer.alloc(512, 7);
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: fixture.profile.explorerUrl,
          explorerHost: fixture.profile.explorerHost,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence({}, fixture.profile),
          tairaXorBurnRecord: {
            contractArtifactB64: burnRecordBytes.toString("base64"),
            artifactSha256: sha256Hex(burnRecordBytes),
          },
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-placeholder-burn-record");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/placeholder burn-record material.*repeated/u);
      expect(
        report.checks.find(
          (entry) => entry.id === "production-burn-record-material",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringMatching(/placeholder burn-record material/u),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts missing TAIRA burn-record material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: fixture.profile.explorerUrl,
          explorerHost: fixture.profile.explorerHost,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence({}, fixture.profile),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-placeholder-burn-record");
      expect(
        report.checks.find(
          (entry) => entry.id === "production-burn-record-material",
        ),
      ).toMatchObject({
        ok: false,
        detail: expect.stringMatching(/contractArtifactB64/u),
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects standalone TAIRA burn-record contracts with artifact hash drift", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-burn-record.contract.json"),
        tairaBurnRecordContractMaterial({
          rest: {
            artifact_sha256: HASH_77,
          },
        }),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find(
          (entry) => entry.kind === "taira-burn-record-contract",
        )?.findings,
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(0);
      expect(findingText).toMatch(/artifactSha256 does not match artifactB64/u);
      expect(findingText).toMatch(/invalid-taira-burn-record-contract/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects standalone TAIRA burn-record contracts with placeholder artifact bytes", async () => {
    const fixture = await createReadyFixture();
    try {
      const placeholderBytes = Buffer.alloc(512, 7);
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-burn-record.contract.json"),
        tairaBurnRecordContractMaterial({
          burnRecord: {
            contractArtifactB64: placeholderBytes.toString("base64"),
            artifactSha256: sha256Hex(placeholderBytes),
          },
        }),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find(
          (entry) => entry.kind === "taira-burn-record-contract",
        )?.findings,
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(0);
      expect(findingText).toMatch(/placeholder burn-record material/u);
      expect(findingText).toMatch(/repeated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects standalone TAIRA burn-record contracts with non-proved execution material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-burn-record.contract.json"),
        tairaBurnRecordContractMaterial({
          execution: {
            executable: "Instructions",
            force_zk_mode: false,
            settlement_instruction: "Mint<Numeric, Asset>",
            record_instruction: "Instruction",
          },
        }),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find(
          (entry) => entry.kind === "taira-burn-record-contract",
        )?.findings,
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(0);
      expect(findingText).toMatch(/execution\.executable must be IvmProved/u);
      expect(findingText).toMatch(/execution\.force_zk_mode must be true/u);
      expect(findingText).toMatch(
        /settlement_instruction must be Burn<Numeric, Asset>/u,
      );
      expect(findingText).toMatch(
        /record_instruction must be RecordSccpMessage/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects standalone TAIRA burn-record contracts bound to the wrong route identity", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-burn-record.contract.json"),
        tairaBurnRecordContractMaterial({
          routeId: "taira_tron_xor",
          assetKey: "eth",
        }),
      );

      const report = await evaluateFixture(fixture);
      const findingText = JSON.stringify(
        report.files.find(
          (entry) => entry.kind === "taira-burn-record-contract",
        )?.findings,
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionTairaBurnRecordContracts).toBe(0);
      expect(findingText).toMatch(/route_id must be taira_bsc_xor/u);
      expect(findingText).toMatch(/asset_key must be xor/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with same-valued duplicate proof hash aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          ...fixture.routeDeployment,
          verifier_key_hash: fixture.routeDeployment.verifierKeyHash,
          proof_artifact_hash: fixture.routeDeployment.proofArtifactHash,
          native_evm_prover_bundle_hash:
            fixture.routeDeployment.nativeEvmProverBundleHash,
          destination_binding_hash:
            fixture.routeDeployment.destinationBindingHash,
          destinationRollout: {
            provingKeyHash: fixture.routeDeployment.provingKeyHash,
            proving_key_hash: fixture.routeDeployment.provingKeyHash,
          },
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/conflicting-route-material/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/must not use multiple aliases/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts that use stale TRON contract aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          deployment: fixture.routeDeployment,
          sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
          destinationRollout: {
            tron_verifier_address: BSC_VERIFIER_ADDRESS,
          },
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(
        /TRON aliases.*sccp_tron_source_bridge_address|TRON aliases.*tron_verifier_address/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose proof-role hashes collide", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(
          fixture.root,
          "taira-bsc-xor-route-colliding.production.json",
        ),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          deployment: {
            ...fixture.routeDeployment,
            provingKeyHash: fixture.routeDeployment.proofArtifactHash,
          },
          postDeployLiveEvidence: postDeployLiveEvidence(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/conflicting-route-material/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/provingKeyHash must not equal proofArtifactHash/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports whose proof-role hashes collide despite passing prerequisite checks", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          deployment: deployment({
            ...fixture.routeDeployment,
            provingKeyHash: fixture.routeDeployment.proofArtifactHash,
          }),
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(
        /route deployment provingKeyHash must not equal proofArtifactHash/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports with ambiguous prerequisite check state", async () => {
    const fixture = await createReadyFixture();
    try {
      const cases = [
        {
          name: "duplicate check id",
          routeReport: routeReport({
            deployment: fixture.routeDeployment,
            checks: [
              ...routeReport().checks,
              {
                ...routeReport().checks[0],
                status: "pass",
              },
            ],
          }),
          detail: /route report check id .* is duplicated/u,
        },
        {
          name: "contradictory ok/status",
          routeReport: routeReport({
            deployment: fixture.routeDeployment,
            checks: routeReport().checks.map((entry) =>
              entry.id === "bsc-production-ready"
                ? { ...entry, ok: false, status: "pass" }
                : entry,
            ),
          }),
          detail:
            /route report check bsc-production-ready has contradictory ok\/status/u,
        },
        {
          name: "invalid status-only check",
          routeReport: routeReport({
            deployment: fixture.routeDeployment,
            checks: routeReport().checks.map((entry) =>
              entry.id === "bsc-production-ready"
                ? { id: entry.id, message: entry.message, status: "maybe" }
                : entry,
            ),
          }),
          detail:
            /route report check bsc-production-ready has no machine-readable pass\/fail state/u,
        },
        {
          name: "non-object check entry",
          routeReport: routeReport({
            deployment: fixture.routeDeployment,
            checks: [null, ...routeReport().checks],
          }),
          detail: /route report check 0 is not an object/u,
        },
        {
          name: "missing route-preflight runbook contract",
          routeReport: routeReport({
            deployment: fixture.routeDeployment,
            checks: routeReport().checks.filter(
              (entry) => entry.id !== "bsc-preflight-runbook-contract",
            ),
          }),
          detail: /missing passing bsc-preflight-runbook-contract check/u,
        },
      ];

      for (const { name, routeReport: badRouteReport, detail } of cases) {
        const report = await evaluateFixture(fixture, {
          routeReport: badRouteReport,
        });

        expect(report.ready, name).toBe(false);
        expect(
          report.checks.find((entry) => entry.id === "route-report-binding")
            ?.detail,
          name,
        ).toMatch(detail);
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with duplicate post-deploy aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          ...fixture.routeDeployment,
          postDeployLiveEvidence: {
            ...postDeployLiveEvidence(),
            full_toml_ready: true,
            source_event_transaction_url:
              postDeployLiveEvidence().sourceEventExplorerUrl,
            route_canary_transaction_url:
              postDeployLiveEvidence().routeCanaryExplorerUrl,
          },
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(/postDeployLiveEvidence.*must not use multiple aliases/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with repeated-byte hex evidence", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          deployment: {
            ...fixture.routeDeployment,
            proofArtifactHash: repeatedHash(0x44),
          },
          postDeployLiveEvidence: {
            ...postDeployLiveEvidence(),
            routeCanaryEvidenceHash: repeatedHash(0x66),
            offlineFullTomlSha256: repeatedHash(0x88),
          },
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);
      const findings = report.files.flatMap((entry) => entry.findings);

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.id)).toContain(
        "conflicting-route-material",
      );
      expect(findings.map((entry) => entry.message).join(" ")).toMatch(
        /repeated-byte hash/u,
      );
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/conflicting-route-material/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with repeated-byte contract addresses", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          deployment: {
            ...fixture.routeDeployment,
            bridgeAddress: "0x1111111111111111111111111111111111111111",
          },
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);
      const findings = report.files.flatMap((entry) => entry.findings);

      expect(report.ready).toBe(false);
      expect(findings.map((entry) => entry.id)).toContain(
        "conflicting-route-material",
      );
      expect(findings.map((entry) => entry.message).join(" ")).toMatch(
        /repeated-byte address/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects public route reports with repeated-byte contract addresses", async () => {
    const fixture = await createReadyFixture();
    try {
      fixture.routeReport = routeReport({
        deployment: deployment({
          bridgeAddress: "0x1111111111111111111111111111111111111111",
        }),
      });

      const report = await evaluateFixture(fixture);
      const routeBinding = report.checks.find(
        (entry) => entry.id === "route-report-binding",
      );

      expect(report.ready).toBe(false);
      expect(routeBinding?.ok).toBe(false);
      expect(routeBinding?.detail).toMatch(/repeated-byte address/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts that omit explorer binding metadata", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-wrong-explorer-binding");
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        explorerUrl: null,
        explorerHost: null,
        explorerBindingMatches: false,
      });
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/production-ready-wrong-explorer-binding/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose explorer metadata targets another BSC network", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.mainnet.explorerUrl,
          explorerHost: BSC_PROFILES.mainnet.explorerHost,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-wrong-explorer-binding");
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        explorerUrl: "https://bscscan.com",
        explorerHost: "bscscan.com",
        explorerBindingMatches: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts with duplicate explorer aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          bsc_explorer_url: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          bsc_explorer_host: BSC_PROFILES.testnet.explorerHost,
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-route-material");
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.message)
          .join(" "),
      ).toMatch(
        /explorerUrl.*must not use multiple aliases|explorerHost.*must not use multiple aliases/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects public route reports whose deployment uses stale TRON contract aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          deployment: {
            ...fixture.routeDeployment,
            sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
            tron_verifier_address: BSC_VERIFIER_ADDRESS,
          },
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(
        /TRON aliases.*sccp_tron_source_bridge_address|TRON aliases.*tron_verifier_address/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose post-deploy evidence does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          ...fixture.routeDeployment,
          postDeployLiveEvidence: postDeployLiveEvidence({
            routeCanaryTransactionId: HASH_55,
          }),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact")
          ?.detail,
      ).toMatch(/post-deploy live evidence/u);
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({ publicDeploymentMatches: true });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("does not treat nested report check ids as route id aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(path.join(fixture.root, "ready-route-report.json"), {
        ready: false,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        productionReady: true,
        explorerUrl: BSC_PROFILES.testnet.explorerUrl,
        explorerHost: BSC_PROFILES.testnet.explorerHost,
        deployment: fixture.routeDeployment,
        tairaXorBurnRecord: productionBurnRecordMaterial(),
        checks: [
          { id: "route-preflight-ready", ok: false },
          { id: "production-material-inventory", ok: false },
        ],
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(true);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).not.toContain("conflicting-route-material");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier artifacts with conflicting nested verifier identity", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: HASH_22,
        nestedVerifierEvidence: {
          verifier_key_hash: HASH_77,
          targetDomain: 3,
        },
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-verifier-material");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/conflicting-verifier-material/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects smoke-test generator-point Groth16 verifier material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: HASH_22,
        alpha1: SMOKE_FIXTURE_G1,
        beta2: SMOKE_FIXTURE_G2,
        gamma2: SMOKE_FIXTURE_G2,
        delta2: SMOKE_FIXTURE_G2,
        ic: SMOKE_FIXTURE_IC,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("fixture-shaped-verifier-material");
      expect(
        report.files.find((entry) => entry.kind === "verifier")?.verifier
          ?.fixtureShaped,
      ).toBe(true);
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/fixture-shaped-verifier-material/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier artifacts with invalid BN254 G1 material", async () => {
    const variants = [
      {
        label: "off-curve alpha1",
        material: { alpha1: ["1", "3"], ic: VALID_IC },
        expected: /BN254 G1 curve/u,
      },
      {
        label: "out-of-field alpha1",
        material: { alpha1: [BN254_BASE_FIELD_MODULUS, "2"], ic: VALID_IC },
        expected: /BN254 field element/u,
      },
      {
        label: "IC point at infinity",
        material: { alpha1: VALID_G1_POINTS[0], ic: ["0", "0"] },
        expected: /point at infinity/u,
      },
    ];

    for (const variant of variants) {
      const fixture = await createReadyFixture({
        rootPrefix: `sccp-bsc-material-inventory-${variant.label.replace(/[^a-z0-9]+/giu, "-").toLowerCase()}-`,
      });
      try {
        await writeJson(fixture.verifierPath, {
          schema: "iroha-sccp-bsc-verifier-key/v1",
          network: "bsc-testnet",
          chainIdHex: "0x61",
          networkId: BSC_TESTNET_NETWORK_ID_HEX,
          sourceDomain: 0,
          targetDomain: 2,
          verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          ...variant.material,
        });

        const report = await evaluateFixture(fixture);
        const verifier = report.files.find(
          (entry) => entry.kind === "verifier",
        );
        const findingIds = report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id);

        expect(report.ready).toBe(false);
        expect(report.counts.productionVerifierArtifacts).toBe(0);
        expect(findingIds).toContain("invalid-bn254-verifier-material");
        expect(verifier?.verifier?.g1MaterialValid).toBe(false);
        expect(verifier?.verifier?.g1MaterialProblems.join("; ")).toMatch(
          variant.expected,
        );
        expect(
          report.checks.find(
            (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
          )?.detail,
        ).toMatch(/invalid-bn254-verifier-material/u);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 20_000);

  it("rejects verifier artifacts with invalid BN254 G2 material", async () => {
    const baseMaterial = {
      alpha1: VALID_G1_POINTS[0],
      beta2: SMOKE_FIXTURE_G2,
      gamma2: SMOKE_FIXTURE_G2,
      delta2: SMOKE_FIXTURE_G2,
      ic: VALID_IC,
    };
    const variants = [
      {
        label: "off-twist beta2",
        material: { ...baseMaterial, beta2: ["1", "2", "3", "4"] },
        expected: /BN254 G2 twist curve/u,
      },
      {
        label: "out-of-field gamma2",
        material: {
          ...baseMaterial,
          gamma2: [BN254_BASE_FIELD_MODULUS, "2", "3", "4"],
        },
        expected: /BN254 field element/u,
      },
      {
        label: "delta2 point at infinity",
        material: { ...baseMaterial, delta2: ["0", "0", "0", "0"] },
        expected: /G2 point at infinity/u,
      },
    ];

    for (const variant of variants) {
      const fixture = await createReadyFixture({
        rootPrefix: `sccp-bsc-material-inventory-${variant.label.replace(/[^a-z0-9]+/giu, "-").toLowerCase()}-`,
      });
      try {
        await writeJson(fixture.verifierPath, {
          schema: "iroha-sccp-bsc-verifier-key/v1",
          network: "bsc-testnet",
          chainIdHex: "0x61",
          networkId: BSC_TESTNET_NETWORK_ID_HEX,
          sourceDomain: 0,
          targetDomain: 2,
          verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          ...variant.material,
        });

        const report = await evaluateFixture(fixture);
        const verifier = report.files.find(
          (entry) => entry.kind === "verifier",
        );
        const findingIds = report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id);

        expect(report.ready).toBe(false);
        expect(report.counts.productionVerifierArtifacts).toBe(0);
        expect(findingIds).toContain("invalid-bn254-verifier-material");
        expect(verifier?.verifier?.g2MaterialValid).toBe(false);
        expect(verifier?.verifier?.g2MaterialProblems.join("; ")).toMatch(
          variant.expected,
        );
        expect(
          report.checks.find(
            (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
          )?.detail,
        ).toMatch(/invalid-bn254-verifier-material/u);
      } finally {
        await rm(fixture.root, { recursive: true, force: true });
      }
    }
  }, 20_000);

  it("accepts equivalent BSC testnet verifier network labels", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        bsc_network: "testnet",
        chain: "chapel",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
        ...VALID_VERIFIER_MATERIAL,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(true);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).not.toContain("conflicting-verifier-material");
      expect(
        report.files.find((entry) => entry.kind === "verifier")?.verifier
          ?.network,
      ).toBe("bsc-testnet");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier artifacts that omit BN254 verifier key material", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
      });

      const report = await evaluateFixture(fixture);
      const verifier = report.files.find((entry) => entry.kind === "verifier");
      const findingIds = report.files
        .flatMap((entry) => entry.findings)
        .map((entry) => entry.id);

      expect(report.ready).toBe(false);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
      expect(findingIds).toContain("invalid-bn254-verifier-material");
      expect(verifier?.verifier?.g1MaterialValid).toBe(false);
      expect(verifier?.verifier?.g2MaterialValid).toBe(false);
      expect(verifier?.verifier?.g1MaterialProblems.join("; ")).toMatch(
        /verifier\.alpha1 material is missing/u,
      );
      expect(verifier?.verifier?.g2MaterialProblems.join("; ")).toMatch(
        /verifier\.beta2 material is missing/u,
      );
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/invalid-bn254-verifier-material/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier artifacts with conflicting BSC network labels", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chain: "bsc-mainnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: HASH_22,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("conflicting-verifier-material");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects placeholder browser prover modules before accepting sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(
        fixture.destinationModulePath,
        "export const result = { proofBytes: new Uint8Array([1]) };\n",
        "utf8",
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/not production-shaped/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects incomplete browser prover adapter pipelines before accepting sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        incompleteAdapterPipelineModuleSource(),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes);
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      await writeJson(sidecarPath, {
        ...JSON.parse(await readFile(sidecarPath, "utf8")),
        moduleSha256: sha256Hex(moduleBytes),
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/checked-in BSC runtime adapter pipeline/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects flat browser prover adapter call sets before accepting sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        flatAdapterPipelineModuleSource(),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes);
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      await writeJson(sidecarPath, {
        ...JSON.parse(await readFile(sidecarPath, "utf8")),
        moduleSha256: sha256Hex(moduleBytes),
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/checked-in BSC runtime adapter pipeline/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects detached browser prover adapter entrypoints before accepting sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        detachedAdapterEntrypointModuleSource(),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes);
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      await writeJson(sidecarPath, {
        ...JSON.parse(await readFile(sidecarPath, "utf8")),
        moduleSha256: sha256Hex(moduleBytes),
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/checked-in BSC runtime adapter pipeline/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects aliased browser prover adapter entrypoints before accepting sidecars", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        aliasedAdapterEntrypointModuleSource(),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes);
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      await writeJson(sidecarPath, {
        ...JSON.parse(await readFile(sidecarPath, "utf8")),
        moduleSha256: sha256Hex(moduleBytes),
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/checked-in BSC runtime adapter pipeline/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("flags standalone browser prover modules without adjacent sidecar manifests", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(`${fixture.destinationModulePath}.manifest.json`);

      const report = await evaluateFixture(fixture);
      const destinationModule = report.files.find((entry) =>
        entry.path.endsWith("/destination-sccp-bsc.js"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.criticalFindings).toBe(0);
      expect(report.counts.warningFindings).toBe(1);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/sidecar manifest is missing/u);
      expect(destinationModule?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "warning",
            id: "standalone-browser-prover-module",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("classifies route-named browser prover sidecars separately from route artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture);
      const sidecars = report.files.filter((entry) =>
        entry.path.endsWith(".js.manifest.json"),
      );

      expect(report.ready).toBe(true);
      expect(report.counts.browserProverSidecars).toBe(2);
      expect(report.counts.productionRouteArtifacts).toBe(1);
      expect(sidecars).toHaveLength(2);
      expect(sidecars).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "browser-prover-sidecar",
            browserProverSidecar: expect.objectContaining({
              valid: true,
              moduleSha256: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
              moduleSha256Actual: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
              exports: expect.arrayContaining(["bscSccpProve"]),
            }),
          }),
          expect.objectContaining({
            kind: "browser-prover-sidecar",
            browserProverSidecar: expect.objectContaining({
              valid: true,
              exports: expect.arrayContaining(["bscSccpSourceProve"]),
            }),
          }),
        ]),
      );
      expect(sidecars.every((entry) => entry.route === undefined)).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover sidecars whose adjacent module hash drifts", async () => {
    const fixture = await createReadyFixture();
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
      await writeJson(sidecarPath, {
        ...sidecar,
        moduleSha256: HASH_22,
      });

      const report = await evaluateFixture(fixture);
      const sidecarEntry = report.files.find(
        (entry) => entry.path === relativeModuleUrl(sidecarPath),
      );

      expect(report.ready).toBe(false);
      expect(sidecarEntry).toMatchObject({
        kind: "browser-prover-sidecar",
        browserProverSidecar: {
          valid: false,
          moduleSha256: HASH_22,
        },
      });
      expect(sidecarEntry?.route).toBeUndefined();
      expect(sidecarEntry?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-browser-prover-sidecar",
            message: expect.stringMatching(/moduleSha256 .* does not match/u),
          }),
        ]),
      );
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/moduleSha256 does not match module bytes/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover sidecars with duplicate module hash aliases", async () => {
    const fixture = await createReadyFixture();
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
      await writeJson(sidecarPath, {
        ...sidecar,
        module_sha256: sidecar.moduleSha256,
      });

      const report = await evaluateFixture(fixture);
      const sidecarEntry = report.files.find(
        (entry) => entry.path === relativeModuleUrl(sidecarPath),
      );

      expect(report.ready).toBe(false);
      expect(sidecarEntry).toMatchObject({
        kind: "browser-prover-sidecar",
        browserProverSidecar: {
          valid: false,
          moduleSha256: sidecar.moduleSha256,
          moduleSha256Actual: sidecar.moduleSha256,
        },
      });
      expect(sidecarEntry?.route).toBeUndefined();
      expect(sidecarEntry?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-browser-prover-sidecar",
            message: expect.stringMatching(
              /browser prover sidecar moduleSha256 must not use multiple aliases/u,
            ),
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover sidecars with malformed export entries", async () => {
    const fixture = await createReadyFixture();
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const sidecar = JSON.parse(await readFile(sidecarPath, "utf8"));
      await writeJson(sidecarPath, {
        ...sidecar,
        exports: [...sidecar.exports, "", { exportName: "bscSccpProve" }],
      });

      const report = await evaluateFixture(fixture);
      const sidecarEntry = report.files.find(
        (entry) => entry.path === relativeModuleUrl(sidecarPath),
      );

      expect(report.ready).toBe(false);
      expect(sidecarEntry).toMatchObject({
        kind: "browser-prover-sidecar",
        browserProverSidecar: {
          valid: false,
          exports: expect.arrayContaining(["bscSccpProve"]),
        },
      });
      expect(sidecarEntry?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-browser-prover-sidecar",
            message: expect.stringMatching(
              /browser prover sidecar exports\[2\] must be a non-empty string/u,
            ),
          }),
          expect.objectContaining({
            severity: "critical",
            id: "invalid-browser-prover-sidecar",
            message: expect.stringMatching(
              /browser prover sidecar exports\[3\] must be a non-empty string/u,
            ),
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects BSC source browser prover modules without public-input bindings", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(
        fixture.sourceModulePath,
        moduleSource("bscSccpSourceProve", {
          includeSourcePublicInputs: false,
        }),
        "utf8",
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "source-browser-prover")
          ?.detail,
      ).toMatch(/public-input binding fields/u);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("placeholder-browser-prover-module");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects symlinked configured browser prover modules before hashing", async () => {
    const fixture = await createReadyFixture();
    const outsideDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-browser-module-escape-"),
    );
    try {
      const escapedModulePath = path.join(
        outsideDir,
        "destination-sccp-bsc.js",
      );
      await writeFile(
        escapedModulePath,
        await readFile(fixture.destinationModulePath),
      );
      await rm(fixture.destinationModulePath);
      await symlink(escapedModulePath, fixture.destinationModulePath);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/symbolic link/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects symlinked browser prover sidecar manifests before hashing", async () => {
    const fixture = await createReadyFixture();
    const outsideDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-browser-sidecar-escape-"),
    );
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const escapedSidecarPath = path.join(
        outsideDir,
        "destination-sccp-bsc.js.manifest.json",
      );
      await writeFile(escapedSidecarPath, await readFile(sidecarPath));
      await rm(sidecarPath);
      await symlink(escapedSidecarPath, sidecarPath);

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/symbolic link/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it("rejects oversized browser prover sidecar manifests before parsing", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(
        `${fixture.destinationModulePath}.manifest.json`,
        JSON.stringify({ padding: "x".repeat(256 * 1024) }),
        "utf8",
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/maximum allowed/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate JSON object keys in browser prover sidecar manifests", async () => {
    const fixture = await createReadyFixture();
    try {
      const sidecarPath = `${fixture.destinationModulePath}.manifest.json`;
      const sidecarText = await readFile(sidecarPath, "utf8");
      await writeFile(
        sidecarPath,
        sidecarText.replace(
          '"bscNetwork": "testnet",',
          '"bscNetwork": "mainnet",\n  "bscNetwork": "testnet",',
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/duplicate JSON object key/u);
      expect(JSON.stringify(report)).not.toContain('"mainnet"');
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover modules whose sidecar export only appears in comments", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        commentOnlyModuleSource("bscSccpProve"),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes, "utf8");
      await writeJson(
        `${fixture.destinationModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.destinationModuleUrl,
          moduleSha256: sha256Hex(moduleBytes),
          direction: "destination",
          deploymentInfo: fixture.routeDeployment,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/does not export one of/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover modules whose sidecar export is not callable", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        nonCallableModuleSource("bscSccpProve"),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes, "utf8");
      await writeJson(
        `${fixture.destinationModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.destinationModuleUrl,
          moduleSha256: sha256Hex(moduleBytes),
          direction: "destination",
          deploymentInfo: fixture.routeDeployment,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/callable function/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover modules whose native self-test export is missing", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        missingSelfTestModuleSource("bscSccpProve"),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes, "utf8");
      await writeJson(
        `${fixture.destinationModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.destinationModuleUrl,
          moduleSha256: sha256Hex(moduleBytes),
          direction: "destination",
          deploymentInfo: fixture.routeDeployment,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/native self-test/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects browser prover modules whose native self-test export does not match the sidecar", async () => {
    const fixture = await createReadyFixture();
    try {
      const moduleBytes = Buffer.from(
        wrongSelfTestModuleSource("bscSccpProve"),
        "utf8",
      );
      await writeFile(fixture.destinationModulePath, moduleBytes, "utf8");
      await writeJson(
        `${fixture.destinationModulePath}.manifest.json`,
        sidecarManifest({
          moduleUrl: fixture.destinationModuleUrl,
          moduleSha256: sha256Hex(moduleBytes),
          direction: "destination",
          deploymentInfo: fixture.routeDeployment,
        }),
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "destination-browser-prover")
          ?.detail,
      ).toMatch(/native self-test.*does not export/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects secret-like files without serializing the secret value", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(path.join(fixture.root, "operator.private.json"), {
        privateKey: "do-not-leak-this-value",
        apiKey: "do-not-leak-api-key-value",
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/secret-like/u);
      expect(JSON.stringify(report)).not.toContain("do-not-leak-this-value");
      expect(JSON.stringify(report)).not.toContain("do-not-leak-api-key-value");
      expect(JSON.stringify(report)).not.toContain("privateKey");
      expect(JSON.stringify(report)).not.toContain("apiKey");
      expect(JSON.stringify(report)).not.toContain("operator.private.json");
      expect(report.files.map((entry) => entry.path)).toContain(
        "[redacted secret-like artifact path]",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects assignment-shaped secrets hidden in innocuous artifact strings", async () => {
    const fixture = await createReadyFixture();
    const assignmentSecret =
      "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
    try {
      await writeJson(path.join(fixture.root, "operator-notes.json"), {
        notes: [
          `operator note privateKey=0x${assignmentSecret}`,
          `authToken=0x${assignmentSecret}`,
        ],
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/secret-like/u);
      expect(JSON.stringify(report)).not.toContain("privateKey=");
      expect(JSON.stringify(report)).not.toContain("authToken=");
      expect(JSON.stringify(report)).not.toContain(assignmentSecret);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("secret-like-text");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects bearer-token-shaped secrets hidden in innocuous artifact strings", async () => {
    const fixture = await createReadyFixture();
    const bearerToken = "Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l";
    try {
      await writeJson(path.join(fixture.root, "operator-notes.json"), {
        notes: [`operator pasted ${bearerToken}`],
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/secret-like/u);
      expect(JSON.stringify(report)).not.toContain("Bearer");
      expect(JSON.stringify(report)).not.toContain(
        "mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
      );
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("secret-like-text");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when proof artifact or proving-key files are missing", async () => {
    const fixture = await createReadyFixture({ writeProvingKey: false });
    try {
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-proof-files")
          ?.detail,
      ).toMatch(/proving key file matching route provingKeyHash is missing/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when the Groth16 material manifest is missing", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(fixture.groth16MaterialManifestPath, { force: true });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16MaterialManifests).toBe(0);
      expect(
        report.checks.find((entry) => entry.id === "groth16-material-manifest"),
      ).toMatchObject({
        ok: false,
        detail:
          "No clean productionReady BSC testnet Groth16 material manifest was found.",
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects unready Groth16 material manifests with production blockers", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.productionReady = false;
      manifest.productionBlockers = [
        "semantic SCCP circuit attestation is missing",
        "circuit security audit attestation is missing",
        "trusted setup transcript contributors must record at least 2",
        "trusted setup transcript localSingleContributor must be false",
        "reproducible build transcript independentRebuilders must record at least 2",
        "reproducible build transcript reproducible must be true",
        "operator attempted local-only promotion",
      ];
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16MaterialManifests).toBe(0);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        productionReady: false,
        productionBlockerCount: 7,
        productionBlockers: manifest.productionBlockers,
        productionBlockerSummary:
          "semantic SCCP circuit attestation is missing; circuit security audit attestation is missing; trusted setup transcript contributors must record at least 2; trusted setup transcript localSingleContributor must be false; reproducible build transcript independentRebuilders must record at least 2; reproducible build transcript reproducible must be true; +1 more",
      });
      expect(manifestFile?.findings.map((entry) => entry.id)).toContain(
        "invalid-groth16-material-manifest",
      );
      expect(JSON.stringify(manifestFile?.findings)).toContain(
        "trusted setup transcript contributors must record at least 2",
      );
      expect(JSON.stringify(manifestFile?.findings)).toContain("+1 more");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toContain(
        "trusted setup transcript contributors must record at least 2",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("classifies route-bound Groth16 proof self-test reports", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture);
      const proofSelfTestFile = report.files.find(
        (entry) => entry.kind === "groth16-proof-self-test-report",
      );

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.counts.productionGroth16ProofSelfTestReports).toBe(1);
      expect(proofSelfTestFile?.groth16ProofSelfTestReport).toMatchObject({
        valid: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: fixture.profile.key,
        manifestProductionReady: true,
        manifestProductionBlockerCount: 0,
        referencedManifestVerified: true,
        publicDeploymentMatches: true,
        proofArtifactHash: fixture.routeDeployment.proofArtifactHash,
        provingKeyHash: fixture.routeDeployment.provingKeyHash,
      });
      expect(
        report.checks.find(
          (entry) => entry.id === "groth16-proof-self-test-report",
        ),
      ).toMatchObject({ ok: true });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("fails closed when the Groth16 proof self-test report is missing", async () => {
    const fixture = await createReadyFixture();
    try {
      await rm(
        path.join(fixture.artifactRoot, "groth16-proof-self-test.json"),
        {
          force: true,
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16ProofSelfTestReports).toBe(0);
      expect(
        report.checks.find(
          (entry) => entry.id === "groth16-proof-self-test-report",
        ),
      ).toMatchObject({
        ok: false,
        detail:
          "No clean BSC testnet Groth16 proof self-test report was found.",
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects proof self-test reports generated from unready material manifests", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofSelfTestPath = path.join(
        fixture.artifactRoot,
        "groth16-proof-self-test.json",
      );
      const proofSelfTest = JSON.parse(
        await readFile(proofSelfTestPath, "utf8"),
      );
      proofSelfTest.manifest.productionReady = false;
      proofSelfTest.manifest.productionBlockers = [
        "stale report generated before audit",
        "trusted setup transcript contributors must record at least 2",
        "trusted setup transcript localSingleContributor must be false",
        "trusted setup transcript toxicWasteDestroyed must be true",
        "trusted setup transcript ceremonyResult must be pass",
        "reproducible build transcript independentRebuilders must record at least 2",
        "reproducible build transcript reproducible must be true",
      ];
      await writeJson(proofSelfTestPath, proofSelfTest);

      const report = await evaluateFixture(fixture);
      const proofSelfTestFile = report.files.find(
        (entry) => entry.kind === "groth16-proof-self-test-report",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16ProofSelfTestReports).toBe(0);
      expect(proofSelfTestFile?.groth16ProofSelfTestReport).toMatchObject({
        valid: false,
        manifestProductionReady: false,
        manifestProductionBlockerCount: 7,
        manifestProductionBlockers: proofSelfTest.manifest.productionBlockers,
        manifestProductionBlockerSummary:
          "stale report generated before audit; trusted setup transcript contributors must record at least 2; trusted setup transcript localSingleContributor must be false; trusted setup transcript toxicWasteDestroyed must be true; trusted setup transcript ceremonyResult must be pass; reproducible build transcript independentRebuilders must record at least 2; +1 more",
      });
      expect(proofSelfTestFile?.findings.map((entry) => entry.id)).toContain(
        "invalid-groth16-proof-self-test-report",
      );
      expect(JSON.stringify(proofSelfTestFile?.findings)).toMatch(
        /manifest\.productionReady must be true/u,
      );
      expect(JSON.stringify(proofSelfTestFile?.findings)).toContain(
        "trusted setup transcript contributors must record at least 2",
      );
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toContain(
        "trusted setup transcript contributors must record at least 2",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects proof self-test reports with encoded traversal material manifest paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofSelfTestPath = path.join(
        fixture.artifactRoot,
        "groth16-proof-self-test.json",
      );
      const proofSelfTest = JSON.parse(
        await readFile(proofSelfTestPath, "utf8"),
      );
      proofSelfTest.manifest.path =
        "native-prover/%2e%2e/taira-bsc-groth16-material.manifest.json";
      await writeJson(proofSelfTestPath, proofSelfTest);

      const report = await evaluateFixture(fixture);
      const proofSelfTestFile = report.files.find(
        (entry) => entry.kind === "groth16-proof-self-test-report",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16ProofSelfTestReports).toBe(0);
      expect(proofSelfTestFile?.groth16ProofSelfTestReport).toMatchObject({
        valid: false,
      });
      expect(JSON.stringify(proofSelfTestFile)).toMatch(
        /manifest\.path must be a safe relative path/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects proof self-test reports whose artifact hashes drift from the material manifest", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofSelfTestPath = path.join(
        fixture.artifactRoot,
        "groth16-proof-self-test.json",
      );
      const proofSelfTest = JSON.parse(
        await readFile(proofSelfTestPath, "utf8"),
      );
      proofSelfTest.artifacts.r1cs.sha256 = HASH_99;
      await writeJson(proofSelfTestPath, proofSelfTest);

      const report = await evaluateFixture(fixture);
      const proofSelfTestFile = report.files.find(
        (entry) => entry.kind === "groth16-proof-self-test-report",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16ProofSelfTestReports).toBe(0);
      expect(proofSelfTestFile?.groth16ProofSelfTestReport).toMatchObject({
        valid: false,
        referencedManifestVerified: false,
      });
      expect(JSON.stringify(proofSelfTestFile?.findings)).toMatch(
        /referenced Groth16 material manifest hashes do not match proof self-test report artifacts/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests whose attestation summaries reuse a signer", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      for (const attestation of Object.values(manifest.attestations)) {
        attestation.signature.signerFingerprint =
          TRUSTED_ATTESTATION_SIGNER_FINGERPRINT;
      }
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16MaterialManifests).toBe(0);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
      });
      expect(
        manifestFile?.findings.map((entry) => entry.message).join(" "),
      ).toMatch(/attestation signers must be role-separated/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests missing the circuit source artifact", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      delete manifest.artifacts.circuitSource;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        circuitSourceHash: null,
      });
      expect(JSON.stringify(manifestFile)).toMatch(
        /Groth16 material manifest circuit source sha256 is missing or invalid/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests missing transcript artifacts without throwing", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      delete manifest.artifacts.trustedSetupTranscript;
      delete manifest.artifacts.reproducibleBuildTranscript;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        trustedSetupTranscriptHash: null,
        reproducibleBuildTranscriptHash: null,
        referencedTranscriptsVerified: false,
      });
      expect(JSON.stringify(manifestFile)).toMatch(
        /trusted setup transcript sha256 is missing or invalid/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /reproducible build transcript sha256 is missing or invalid/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests without passing SnarkJS self-checks", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.selfChecks.snarkjs.verifierKeyHashMatches = false;
      manifest.selfChecks.snarkjs.r1csInfoSource = "fixture-parser";
      manifest.selfChecks.snarkjs.r1csPublicInputCount = 8;
      manifest.selfChecks.snarkjs.r1csConstraintCount = 128;
      manifest.selfChecks.snarkjs.exportedVerifierKeyHash = HASH_44;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        selfChecks: {
          snarkjs: {
            verifierKeyHashMatches: false,
            r1csInfoSource: "fixture-parser",
            r1csPublicInputCount: 8,
            r1csConstraintCount: 128,
            exportedVerifierKeyHash: HASH_44,
          },
        },
      });
      expect(JSON.stringify(manifestFile)).toMatch(
        /SnarkJS exported verifier hash must match/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /R1CS public input count must be 9/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /R1CS info source must be one of snarkjs-cli, binary-header-fallback/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /R1CS constraint count must be at least 4096/u,
      );

      delete manifest.selfChecks;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);
      const missingReport = await evaluateFixture(fixture);
      const missingManifestFile = missingReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(missingReport.ready).toBe(false);
      expect(JSON.stringify(missingManifestFile)).toMatch(
        /selfChecks\.snarkjs is missing/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests without production circuit-source checks", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.selfChecks.circuitSource.unresolvedPlaceholders = true;
      manifest.selfChecks.circuitSource.keccakPublicSignalDerivation = false;
      manifest.selfChecks.circuitSource.publicSignalConstraintCount = 3;
      manifest.selfChecks.circuitSource.labelBindingCount = 2;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        selfChecks: {
          circuitSource: {
            valid: false,
            unresolvedPlaceholders: true,
            keccakPublicSignalDerivation: false,
            publicSignalConstraintCount: 3,
            labelBindingCount: 2,
          },
        },
      });
      expect(JSON.stringify(manifestFile)).toMatch(/unresolved placeholders/u);
      expect(JSON.stringify(manifestFile)).toMatch(
        /derive public signals with Keccak/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /constrain all 9 public signals/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /bind all 9 Solidity signal labels/u,
      );

      delete manifest.selfChecks.circuitSource;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);
      const missingReport = await evaluateFixture(fixture);
      const missingManifestFile = missingReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(missingReport.ready).toBe(false);
      expect(JSON.stringify(missingManifestFile)).toMatch(
        /circuitSource self-check is missing/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests with drifted public signal names", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.publicSignalNames = [...BSC_GROTH16_PUBLIC_SIGNAL_NAMES];
      manifest.publicSignalNames[2] = "route_id_hash";
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        publicSignalNames: expect.arrayContaining(["route_id_hash"]),
      });
      expect(JSON.stringify(manifestFile)).toMatch(
        /publicSignalNames must match BSC Groth16 public signals/u,
      );

      manifest.publicSignalNames = [
        ...BSC_GROTH16_PUBLIC_SIGNAL_NAMES.slice(1),
        BSC_GROTH16_PUBLIC_SIGNAL_NAMES[0],
      ];
      await writeJson(fixture.groth16MaterialManifestPath, manifest);
      const reorderedReport = await evaluateFixture(fixture);
      const reorderedManifestFile = reorderedReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(reorderedReport.ready).toBe(false);
      expect(JSON.stringify(reorderedManifestFile)).toMatch(
        /publicSignalNames must match BSC Groth16 public signals/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests whose proof hash drifts from the public route", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.artifacts.r1cs.sha256 = HASH_55;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        publicDeploymentMatches: false,
        referencedAttestationsVerified: false,
      });
      expect(
        manifestFile?.findings?.map((entry) => entry.message).join("\n") ?? "",
      ).toMatch(/referenced attestations are invalid:.*r1csSha256 must match/u);
      expect(
        report.checks.find((entry) => entry.id === "groth16-material-manifest")
          ?.detail,
      ).toContain(
        "No clean productionReady BSC testnet Groth16 material manifest was found.",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 attestation request packages with stale role payload hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      const request = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      request.roles.semanticSccpCircuit.body.negativeCaseCoverage = false;
      await writeJson(fixture.groth16AttestationRequestPackagePath, request);

      const report = await evaluateFixture(fixture);
      const requestFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-request-package",
      );
      const findingText = JSON.stringify(requestFile);

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(0);
      expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
        valid: false,
      });
      expect(findingText).toMatch(/signedPayloadSha256 must match role body/u);
      expect(findingText).toMatch(/negativeCaseCoverage must be true/u);
      expect(
        report.checks.find(
          (entry) => entry.id === "groth16-attestation-request-package",
        ),
      ).toMatchObject({ ok: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 attestation request packages that reference an unscanned material manifest", async () => {
    const fixture = await createReadyFixture();
    try {
      const request = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      request.manifest.sha256 = HASH_55;
      await writeJson(fixture.groth16AttestationRequestPackagePath, request);

      const report = await evaluateFixture(fixture);
      const requestFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-request-package",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(0);
      expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
        valid: false,
        referencedManifestVerified: false,
      });
      expect(JSON.stringify(requestFile)).toMatch(
        /referenced Groth16 material manifest sha256 was not found/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 attestation request packages with traversing material manifest paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const request = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      request.manifest.path = "../outside/taira-bsc-groth16-material.json";
      await writeJson(fixture.groth16AttestationRequestPackagePath, request);

      const report = await evaluateFixture(fixture);
      const requestFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-request-package",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(0);
      expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
        valid: false,
        allRolesReady: true,
      });
      expect(JSON.stringify(requestFile)).toMatch(
        /manifest\.path must be a safe relative path/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 attestation request packages with unsafe artifact paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const baseline = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      const cases = [
        "https://example.invalid/sccp-bsc-full-message-v1.r1cs",
        "native-prover/proof-artifact.r1cs?sha256=abc",
        "native-prover\\proof-artifact.r1cs",
        "%2e%2e/proof-artifact.r1cs",
        "%252e%252e/proof-artifact.r1cs",
        "native-prover%2fproof-artifact.r1cs",
        "./native-prover/proof-artifact.r1cs",
        "native-prover//proof-artifact.r1cs",
      ];

      for (const artifactPath of cases) {
        await writeJson(fixture.groth16AttestationRequestPackagePath, {
          ...baseline,
          artifacts: {
            ...baseline.artifacts,
            r1cs: {
              ...baseline.artifacts.r1cs,
              path: artifactPath,
            },
          },
        });

        const report = await evaluateFixture(fixture);
        const requestFile = report.files.find(
          (entry) => entry.kind === "groth16-attestation-request-package",
        );

        expect(report.ready).toBe(false);
        expect(report.counts.productionGroth16AttestationRequestPackages).toBe(
          0,
        );
        expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
          valid: false,
        });
        expect(JSON.stringify(requestFile)).toMatch(
          /Groth16 attestation request package artifacts\.r1cs\.path must be a safe relative path/u,
        );
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 30_000);

  it("classifies route-bound Groth16 attestation handoff bundles", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture);
      const handoffFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-handoff",
      );

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.counts.routeBoundGroth16AttestationHandoffs).toBe(1);
      expect(handoffFile?.groth16AttestationHandoff).toMatchObject({
        valid: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        bscNetwork: fixture.profile.key,
        handoffComplete: true,
        requestValid: true,
        referencedRequestVerified: true,
        referencedManifestVerified: true,
        publicDeploymentMatches: true,
        attestationRequestSha256: sha256Hex(
          await readFile(fixture.groth16AttestationRequestPackagePath),
        ),
        manifestSha256: sha256Hex(
          await readFile(fixture.groth16MaterialManifestPath),
        ),
      });
      expect(
        report.checks.find(
          (entry) => entry.id === "groth16-attestation-handoff",
        ),
      ).toMatchObject({ ok: true });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 handoff bundles whose request hash drifts", async () => {
    const fixture = await createReadyFixture();
    try {
      const handoff = JSON.parse(
        await readFile(fixture.groth16AttestationHandoffPath, "utf8"),
      );
      handoff.packages.attestationRequest.sha256 = HASH_55;
      await writeJson(fixture.groth16AttestationHandoffPath, handoff);

      const report = await evaluateFixture(fixture);
      const handoffFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-handoff",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.routeBoundGroth16AttestationHandoffs).toBe(0);
      expect(handoffFile?.groth16AttestationHandoff).toMatchObject({
        valid: false,
        referencedRequestVerified: false,
      });
      expect(JSON.stringify(handoffFile)).toMatch(
        /referenced Groth16 attestation request package sha256 was not found/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 handoff bundles with encoded traversal package paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const handoff = JSON.parse(
        await readFile(fixture.groth16AttestationHandoffPath, "utf8"),
      );
      handoff.packages.attestationRequest.path =
        "native-prover/%2e%2e/attestation-request.json";
      await writeJson(fixture.groth16AttestationHandoffPath, handoff);

      const report = await evaluateFixture(fixture);
      const handoffFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-handoff",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.routeBoundGroth16AttestationHandoffs).toBe(0);
      expect(handoffFile?.groth16AttestationHandoff).toMatchObject({
        valid: false,
      });
      expect(JSON.stringify(handoffFile)).toMatch(
        /attestationRequest\.path must be a safe relative path/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 handoff bundles with impossible readiness claims", async () => {
    const fixture = await createReadyFixture();
    try {
      const handoff = JSON.parse(
        await readFile(fixture.groth16AttestationHandoffPath, "utf8"),
      );
      handoff.readiness.requestReadyForSignature.trustedSetup = false;
      handoff.readiness.signingReady = true;
      handoff.readiness.readyToFinalize = true;
      handoff.readiness.missingSignedRoles = ["trustedSetup"];
      handoff.readiness.problemCount = 0;
      await writeJson(fixture.groth16AttestationHandoffPath, handoff);

      const report = await evaluateFixture(fixture);
      const handoffFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-handoff",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.routeBoundGroth16AttestationHandoffs).toBe(0);
      expect(handoffFile?.groth16AttestationHandoff).toMatchObject({
        valid: false,
      });
      expect(JSON.stringify(handoffFile)).toMatch(
        /signingReady cannot be true while request roles are blocked/u,
      );
      expect(JSON.stringify(handoffFile)).toMatch(
        /readyToFinalize requires signingReady, all roles ready, no missing signed roles, productionReady, and problemCount zero/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 handoff bundles whose manifest readiness drifts", async () => {
    const fixture = await createReadyFixture();
    try {
      const handoff = JSON.parse(
        await readFile(fixture.groth16AttestationHandoffPath, "utf8"),
      );
      handoff.manifest.productionReady = false;
      handoff.manifest.productionBlockers = ["stale handoff blocker"];
      handoff.readiness.productionReady = false;
      handoff.readiness.productionBlockers = ["stale handoff blocker"];
      await writeJson(fixture.groth16AttestationHandoffPath, handoff);

      const report = await evaluateFixture(fixture);
      const handoffFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-handoff",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.routeBoundGroth16AttestationHandoffs).toBe(0);
      expect(handoffFile?.groth16AttestationHandoff).toMatchObject({
        valid: false,
        referencedManifestVerified: true,
      });
      expect(JSON.stringify(handoffFile)).toMatch(
        /referenced Groth16 material manifest readiness does not match handoff/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("reports blocked Groth16 attestation request roles explicitly", async () => {
    const fixture = await createReadyFixture();
    try {
      const request = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      request.roles.trustedSetup.readyForSignature = false;
      request.roles.trustedSetup.blockers = [
        "trusted setup transcript contributors must record at least 2",
      ];
      await writeJson(fixture.groth16AttestationRequestPackagePath, request);

      const report = await evaluateFixture(fixture);
      const requestFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-request-package",
      );
      const readinessCheck = report.checks.find(
        (entry) => entry.id === "groth16-attestation-role-readiness",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(0);
      expect(report.counts.readyGroth16AttestationRequestPackages).toBe(0);
      expect(report.counts.blockedGroth16AttestationRoles).toBe(1);
      expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
        valid: true,
        allRolesReady: false,
        roles: {
          trustedSetup: {
            readyForSignature: false,
            blockerCount: 1,
            blockers: [
              "trusted setup transcript contributors must record at least 2",
            ],
          },
        },
      });
      expect(readinessCheck).toMatchObject({ ok: false });
      expect(readinessCheck?.detail).toContain("trustedSetup not ready");
      expect(readinessCheck?.detail).toContain(
        "trusted setup transcript contributors must record at least 2",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 attestation request packages with unexplained not-ready roles", async () => {
    const fixture = await createReadyFixture();
    try {
      const request = JSON.parse(
        await readFile(fixture.groth16AttestationRequestPackagePath, "utf8"),
      );
      request.roles.trustedSetup.readyForSignature = false;
      request.roles.trustedSetup.blockers = [];
      await writeJson(fixture.groth16AttestationRequestPackagePath, request);

      const report = await evaluateFixture(fixture);
      const requestFile = report.files.find(
        (entry) => entry.kind === "groth16-attestation-request-package",
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionGroth16AttestationRequestPackages).toBe(0);
      expect(requestFile?.groth16AttestationRequestPackage).toMatchObject({
        valid: false,
        allRolesReady: false,
      });
      expect(JSON.stringify(requestFile)).toMatch(
        /must explain why readyForSignature is false/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests with unsafe artifact paths", async () => {
    const fixture = await createReadyFixture();
    try {
      const baseline = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const cases = [
        "https://example.invalid/sccp-bsc-full-message-v1.r1cs",
        "native-prover/proof-artifact.r1cs?sha256=abc",
        "native-prover\\proof-artifact.r1cs",
        "%2e%2e/proof-artifact.r1cs",
        "%252e%252e/proof-artifact.r1cs",
        "native-prover%2fproof-artifact.r1cs",
        "./native-prover/proof-artifact.r1cs",
        "native-prover//proof-artifact.r1cs",
      ];

      for (const artifactPath of cases) {
        await writeJson(fixture.groth16MaterialManifestPath, {
          ...baseline,
          artifacts: {
            ...baseline.artifacts,
            r1cs: {
              ...baseline.artifacts.r1cs,
              path: artifactPath,
            },
          },
        });

        const report = await evaluateFixture(fixture);
        const manifestFile = report.files.find(
          (entry) => entry.kind === "groth16-material-manifest",
        );

        expect(report.ready).toBe(false);
        expect(manifestFile?.groth16MaterialManifest).toMatchObject({
          valid: false,
        });
        expect(
          manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "",
        ).toMatch(
          /Groth16 material manifest artifacts\.r1cs\.path must be a safe relative path/u,
        );
      }
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  }, 30_000);

  it("rejects Groth16 material manifests with local-only transcript contents even when attestations are re-signed", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const badSetupTranscript = {
        schema: "iroha-sccp-bsc-trusted-setup-transcript/v1",
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        contributors: ["local-candidate"],
        localSingleContributor: true,
        toxicWasteDestroyed: false,
        ceremonyResult: "candidate-only",
        phase1: {
          snarkjsPowersOfTauVerify: {
            completed: false,
          },
        },
      };
      const badReproducibleTranscript = {
        schema: "iroha-sccp-bsc-reproducible-build-transcript/v1",
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        independentRebuilders: ["local-candidate"],
        reproducible: false,
        r1csInfoSource: "manual-inspection",
        r1csPublicInputCount: 8,
        r1csConstraintCount: 128,
      };
      const setupPath = path.resolve(
        fixture.root,
        manifest.artifacts.trustedSetupTranscript.path,
      );
      const reproduciblePath = path.resolve(
        fixture.root,
        manifest.artifacts.reproducibleBuildTranscript.path,
      );
      await writeJson(setupPath, badSetupTranscript);
      await writeJson(reproduciblePath, badReproducibleTranscript);
      manifest.artifacts.trustedSetupTranscript.sha256 = sha256Hex(
        await readFile(setupPath),
      );
      manifest.artifacts.reproducibleBuildTranscript.sha256 = sha256Hex(
        await readFile(reproduciblePath),
      );

      const setupReference = manifest.attestations.trustedSetup;
      const setupAttestationPath = path.resolve(
        fixture.root,
        setupReference.path,
      );
      const setupAttestation = JSON.parse(
        await readFile(setupAttestationPath, "utf8"),
      );
      delete setupAttestation.signature;
      setupAttestation.contributionTranscriptSha256 =
        manifest.artifacts.trustedSetupTranscript.sha256;
      const signedSetup = signGroth16MaterialAttestationRecord(
        setupAttestation,
        defaultGroth16MaterialAttestationSigning().trustedSetup,
      );
      await writeJson(setupAttestationPath, signedSetup);
      setupReference.sha256 = sha256Hex(await readFile(setupAttestationPath));
      setupReference.signature =
        groth16MaterialAttestationSignatureSummary(signedSetup);

      const reproducibleReference = manifest.attestations.reproducibleBuild;
      const reproducibleAttestationPath = path.resolve(
        fixture.root,
        reproducibleReference.path,
      );
      const reproducibleAttestation = JSON.parse(
        await readFile(reproducibleAttestationPath, "utf8"),
      );
      delete reproducibleAttestation.signature;
      reproducibleAttestation.buildTranscriptSha256 =
        manifest.artifacts.reproducibleBuildTranscript.sha256;
      const signedReproducible = signGroth16MaterialAttestationRecord(
        reproducibleAttestation,
        defaultGroth16MaterialAttestationSigning().reproducibleBuild,
      );
      await writeJson(reproducibleAttestationPath, signedReproducible);
      reproducibleReference.sha256 = sha256Hex(
        await readFile(reproducibleAttestationPath),
      );
      reproducibleReference.signature =
        groth16MaterialAttestationSignatureSummary(signedReproducible);

      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      const findingText =
        manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "";

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        referencedTranscriptsVerified: false,
      });
      expect(findingText).toMatch(
        /trusted setup transcript contributors must record at least 2/u,
      );
      expect(findingText).toMatch(
        /trusted setup transcript localSingleContributor must be false/u,
      );
      expect(findingText).toMatch(
        /trusted setup transcript snarkjsPowersOfTauVerify\.completed must be true/u,
      );
      expect(findingText).toMatch(
        /reproducible build transcript independentRebuilders must record at least 2/u,
      );
      expect(findingText).toMatch(
        /reproducible build transcript r1csInfoSource must be snarkjs-cli/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests with encoded traversal transcript references", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      manifest.artifacts.trustedSetupTranscript.path =
        "transcripts/%2e%2e/trusted-setup-transcript.json";
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        referencedTranscriptsVerified: false,
      });
      expect(
        manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "",
      ).toMatch(
        /artifacts\.trustedSetupTranscript\.path must be a safe relative path/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects tampered referenced Groth16 attestation bodies even when the file hash is refreshed", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const reference = manifest.attestations.semanticSccpCircuit;
      const attestationPath = path.resolve(fixture.root, reference.path);
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      attestation.negativeCaseCoverage = false;
      await writeJson(attestationPath, attestation);
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      const findingText =
        manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "";

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        referencedAttestationsVerified: false,
      });
      expect(findingText).toMatch(/negativeCaseCoverage must be true/u);
      expect(findingText).toMatch(/detached signature verification failed/u);
      expect(findingText).toMatch(
        /manifest signature summary must match attestation body hash/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects trusted re-signed referenced Groth16 attestations whose body fields drift from the manifest", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const reference = manifest.attestations.semanticSccpCircuit;
      const attestationPath = path.resolve(fixture.root, reference.path);
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      const body = { ...attestation };
      delete body.signature;
      body.r1csSha256 = HASH_55;
      const signed = signGroth16MaterialAttestationRecord(
        body,
        defaultGroth16MaterialAttestationSigning().semanticSccpCircuit,
      );
      await writeJson(attestationPath, signed);
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      reference.signature = groth16MaterialAttestationSignatureSummary(signed);
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      const findingText =
        manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "";

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        referencedAttestationsVerified: false,
      });
      expect(findingText).toMatch(/r1csSha256 must match/u);
      expect(findingText).not.toMatch(
        /detached signature verification failed/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects referenced Groth16 attestation files whose signer drifts from the manifest summary", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const reference = manifest.attestations.circuitSecurity;
      const attestationPath = path.resolve(fixture.root, reference.path);
      const attestation = JSON.parse(await readFile(attestationPath, "utf8"));
      const body = { ...attestation };
      delete body.signature;
      const signed = signGroth16MaterialAttestationRecord(
        body,
        defaultGroth16MaterialAttestationSigning().semanticSccpCircuit,
      );
      await writeJson(attestationPath, signed);
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      const findingText =
        manifestFile?.findings.map((entry) => entry.message).join("\n") ?? "";

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest).toMatchObject({
        valid: false,
        referencedAttestationsVerified: false,
      });
      expect(findingText).toMatch(
        /manifest signature summary must match attestation signer/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects malformed or unsafe referenced Groth16 attestation files after summary validation passes", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      const reference = manifest.attestations.semanticSccpCircuit;
      const attestationPath = path.resolve(fixture.root, reference.path);
      const attestationText = await readFile(attestationPath, "utf8");
      const duplicateKeyText = attestationText.replace(
        /"routeId":\s*"[^"]+"/u,
        `"routeId": "forged-route",\n  "routeId": "${SCCP_BSC_XOR_ROUTE_ID}"`,
      );
      await writeFile(attestationPath, duplicateKeyText, "utf8");
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const duplicateReport = await evaluateFixture(fixture);
      const duplicateManifestFile = duplicateReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(duplicateReport.ready).toBe(false);
      expect(
        duplicateManifestFile?.findings
          .map((entry) => entry.message)
          .join("\n") ?? "",
      ).toMatch(/duplicate JSON object key/u);

      await writeJson(attestationPath, JSON.parse(attestationText));
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      reference.path = path.resolve(fixture.root, reference.path);
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const unsafePathReport = await evaluateFixture(fixture);
      const unsafeManifestFile = unsafePathReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(unsafePathReport.ready).toBe(false);
      expect(
        unsafeManifestFile?.findings.map((entry) => entry.message).join("\n") ??
          "",
      ).toMatch(/path must be a safe relative path/u);

      reference.path = "attestations/%2e%2e/semantic-sccp-circuit.json";
      reference.sha256 = sha256Hex(await readFile(attestationPath));
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const encodedTraversalReport = await evaluateFixture(fixture);
      const encodedTraversalManifestFile = encodedTraversalReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(encodedTraversalReport.ready).toBe(false);
      expect(
        encodedTraversalManifestFile?.findings
          .map((entry) => entry.message)
          .join("\n") ?? "",
      ).toMatch(/path must be a safe relative path/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests with missing or forged attestation references", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      delete manifest.attestations.trustedSetup;
      manifest.attestations.semanticSccpCircuit.schema =
        BSC_GROTH16_TRUSTED_SETUP_ATTESTATION_SCHEMA;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest?.valid).toBe(false);
      expect(JSON.stringify(manifestFile)).toMatch(
        /semantic SCCP circuit attestation schema|trusted setup attestation is required/u,
      );
      expect(manifestFile?.findings.map((entry) => entry.id)).toContain(
        "invalid-groth16-material-manifest",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests without signed attestation trust policy", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      delete manifest.attestationTrustPolicy;
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest?.valid).toBe(false);
      expect(JSON.stringify(manifestFile)).toMatch(
        /attestationTrustPolicy is missing/u,
      );

      manifest.attestationTrustPolicy = {
        signatureSchema: "forged-signature-schema",
        requiredAlgorithm: "secp256k1",
        trustedSignerFingerprints: [HASH_11],
      };
      await writeJson(fixture.groth16MaterialManifestPath, manifest);
      const forgedReport = await evaluateFixture(fixture);
      const forgedManifestFile = forgedReport.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );
      expect(forgedReport.ready).toBe(false);
      expect(JSON.stringify(forgedManifestFile)).toMatch(
        /attestationTrustPolicy signatureSchema/u,
      );
      expect(JSON.stringify(forgedManifestFile)).toMatch(
        /requiredAlgorithm must be ed25519/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects Groth16 material manifests with unsigned attestation references", async () => {
    const fixture = await createReadyFixture();
    try {
      const manifest = JSON.parse(
        await readFile(fixture.groth16MaterialManifestPath, "utf8"),
      );
      delete manifest.attestations.semanticSccpCircuit.signature;
      manifest.attestations.circuitSecurity.signature = {
        verified: false,
        algorithm: "ed25519",
        signerFingerprint: TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
        signedPayloadSha256: HASH_22,
      };
      manifest.attestations.trustedSetup.signature = {
        verified: true,
        algorithm: "secp256k1",
        signerFingerprint: TRUSTED_ATTESTATION_SIGNER_FINGERPRINT,
        signedPayloadSha256: HASH_33,
      };
      manifest.attestations.reproducibleBuild.signature = {
        verified: true,
        algorithm: "ed25519",
        signerFingerprint: "0x0",
        signedPayloadSha256: HASH_44,
      };
      await writeJson(fixture.groth16MaterialManifestPath, manifest);

      const report = await evaluateFixture(fixture);
      const manifestFile = report.files.find(
        (entry) => entry.kind === "groth16-material-manifest",
      );

      expect(report.ready).toBe(false);
      expect(manifestFile?.groth16MaterialManifest?.valid).toBe(false);
      expect(JSON.stringify(manifestFile)).toMatch(
        /semantic SCCP circuit attestation signature summary is missing/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /circuit security attestation signature must be verified/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /trusted setup attestation signature algorithm must be ed25519/u,
      );
      expect(JSON.stringify(manifestFile)).toMatch(
        /reproducible build attestation signature signerFingerprint is missing or invalid/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects tiny proof artifacts even when bytes are non-repeating", async () => {
    const root = await mkdtemp(
      path.join(repoRoot, "output/sccp-bsc-material-inventory-test-"),
    );
    try {
      const proofArtifactBytes = proofArtifactMaterialBytes(9, 4096);
      const provingKeyBytes = provingKeyMaterialBytes(7);
      const verifierKeyBytes = verifierKeyMaterialBytes();
      const verifierKeyHash = verifierKeyHashForMaterial();
      const routeDeployment = deployment({
        proofArtifactHash: sha256Hex(proofArtifactBytes),
        provingKeyHash: sha256Hex(provingKeyBytes),
        verifierKeyHash,
        destinationBindingHash: bscDestinationBindingHash({
          verifierAddress: BSC_VERIFIER_ADDRESS,
          bridgeAddress: BSC_BRIDGE_ADDRESS,
          verifierCodeHash: HASH_11,
          verifierKeyHash,
        }),
      });

      await expect(
        writeGeneratedNativeProverBundle({
          root,
          routeDeployment,
          proofArtifactBytes,
          provingKeyBytes,
          verifierKeyBytes,
        }),
      ).rejects.toThrow(/proofArtifactBytes must be at least 65536 bytes/u);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects oversized proof artifacts before hashing or reading them", async () => {
    const fixture = await createReadyFixture();
    try {
      await truncate(
        fixture.proofArtifactPath,
        SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES + 1,
      );
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("oversized-proof-material-file");
      const proofEntry = report.files.find(
        (entry) =>
          entry.kind === "proof-artifact" &&
          entry.sizeBytes === SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES + 1,
      );
      expect(proofEntry?.kind).toBe("proof-artifact");
      expect(proofEntry?.sizeBytes).toBe(
        SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES + 1,
      );
      expect(proofEntry?.sha256).toBeNull();
      expect(proofEntry?.proofFile?.productionMaxSized).toBe(false);
      expect(proofEntry?.proofFile?.maxSizeBytes).toBe(
        SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects oversized scanned material files before hashing them", async () => {
    const fixture = await createReadyFixture();
    try {
      const oversizedPath = path.join(fixture.root, "oversized-evidence.json");
      await writeFile(oversizedPath, "");
      await truncate(oversizedPath, SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES + 1);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("oversized-material-inventory-file");
      const oversizedEntry = report.files.find(
        (entry) =>
          entry.path.endsWith("/oversized-evidence.json") &&
          entry.sizeBytes === SCCP_BSC_MATERIAL_SCAN_FILE_MAX_BYTES + 1,
      );
      expect(oversizedEntry?.kind).toBe("artifact");
      expect(oversizedEntry?.sha256).toBeNull();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects large repeated-byte proof material as fixture-shaped", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(fixture.provingKeyPath, Buffer.alloc(96 * 1024, 7));
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("low-entropy-proof-material-file");
      expect(
        report.files.find((entry) => entry.kind === "proving-key")?.proofFile
          ?.uniqueByteCount,
      ).toBe(1);
      expect(
        report.files.find((entry) => entry.kind === "proving-key")?.proofFile
          ?.repeatedPatternLength,
      ).toBe(1);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects large repeated-pattern proof material as fixture-shaped", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = Buffer.alloc(96 * 1024);
      for (let index = 0; index < proofArtifactBytes.length; index += 1) {
        proofArtifactBytes[index] = index % 32;
      }
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("low-entropy-proof-material-file");
      expect(
        report.files.find((entry) => entry.kind === "proof-artifact")?.proofFile
          ?.uniqueByteCount,
      ).toBe(32);
      expect(
        report.files.find((entry) => entry.kind === "proof-artifact")?.proofFile
          ?.repeatedPatternLength,
      ).toBe(32);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects large arithmetic-sequence proof material as fixture-shaped", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = Buffer.alloc(96 * 1024);
      for (let index = 0; index < proofArtifactBytes.length; index += 1) {
        proofArtifactBytes[index] = (index * 17 + 23) & 0xff;
      }
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("low-entropy-proof-material-file");
      expect(
        report.files.find((entry) => entry.kind === "proof-artifact")?.proofFile
          ?.arithmeticSequenceDelta,
      ).toBe(17);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects large dominant-byte padded proof material as fixture-shaped", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = Buffer.alloc(96 * 1024, 0);
      for (let index = 0; index < 128; index += 1) {
        proofArtifactBytes[proofArtifactBytes.length - 128 + index] =
          index & 0xff;
      }
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("low-entropy-proof-material-file");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proof-artifact",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(false);
      expect(proofFile?.uniqueByteCount).toBe(128);
      expect(proofFile?.dominantByte).toBe(0);
      expect(proofFile?.dominantByteCount).toBeGreaterThan(
        Math.floor(proofArtifactBytes.length * 0.98),
      );
      expect(proofFile?.dominantByteFraction).toBeGreaterThan(0.98);
      expect(proofFile?.repeatedPatternLength).toBe(0);
      expect(proofFile?.arithmeticSequenceDelta).toBeNull();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects high-entropy proof artifacts with invalid r1cs headers", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = proofArtifactMaterialBytes(0x45);
      proofArtifactBytes[0] = 0x78;
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proof-artifact",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("r1cs");
      expect(proofFile?.formatProblem).toMatch(/magic bytes/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route-bound proof artifacts stored as wasm files", async () => {
    const fixture = await createReadyFixture();
    try {
      const wasmProofPath = path.join(
        path.dirname(fixture.proofArtifactPath),
        "proof-artifact.wasm",
      );
      await writeFile(wasmProofPath, await readFile(fixture.proofArtifactPath));
      await rm(fixture.proofArtifactPath, { force: true });
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find((entry) =>
        entry.path.endsWith("proof-artifact.wasm"),
      )?.proofFile;
      expect(proofFile?.isProofArtifact).toBe(true);
      expect(proofFile?.hashMatchesPublicRoute).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("wasm");
      expect(proofFile?.formatProblem).toMatch(/must be a \.r1cs artifact/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects high-entropy proving keys with invalid zkey headers", async () => {
    const fixture = await createReadyFixture();
    try {
      const provingKeyBytes = provingKeyMaterialBytes(0x46);
      provingKeyBytes[0] = 0x78;
      await writeFile(fixture.provingKeyPath, provingKeyBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proving-key",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("zkey");
      expect(proofFile?.formatProblem).toMatch(/magic bytes/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects high-entropy SnarkJS proof material with invalid section tables", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = proofArtifactMaterialBytes(0x47);
      proofArtifactBytes.writeUInt32LE(proofArtifactBytes.length, 16);
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proof-artifact",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("r1cs");
      expect(proofFile?.formatProblem).toMatch(/section exceeds file size/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects high-entropy SnarkJS proof material with unsupported section ids", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = proofArtifactMaterialBytes(0x48);
      proofArtifactBytes.writeUInt32LE(4, 12);
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proof-artifact",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("r1cs");
      expect(proofFile?.formatProblem).toMatch(
        /missing required section ids: 1/u,
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects high-entropy SnarkJS proof material with duplicate section ids", async () => {
    const fixture = await createReadyFixture();
    try {
      const proofArtifactBytes = proofArtifactMaterialBytes(0x49);
      setSnarkjsSectionId(proofArtifactBytes, 2, 1);
      await writeFile(fixture.proofArtifactPath, proofArtifactBytes);
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("invalid-proof-material-format");
      const proofFile = report.files.find(
        (entry) => entry.kind === "proof-artifact",
      )?.proofFile;
      expect(proofFile?.productionEntropy).toBe(true);
      expect(proofFile?.productionFormat).toBe(false);
      expect(proofFile?.format).toBe("r1cs");
      expect(proofFile?.formatProblem).toMatch(/section ids must be unique/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier material that is not explicitly bound to BSC testnet", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-mainnet",
        chainIdHex: "0x38",
        networkId: `0x${"00".repeat(31)}38`,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: HASH_22,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("wrong-network-verifier-material");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier material bound to the wrong SCCP domains", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 2,
        targetDomain: 0,
        verifierKeyHash: HASH_22,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("wrong-domain-verifier-material");
      expect(
        report.files.find((entry) => entry.kind === "verifier")?.verifier
          ?.bscRouteDomainBound,
      ).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects verifier material whose hash does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(fixture.verifierPath, {
        schema: "iroha-sccp-bsc-verifier-key/v1",
        network: "bsc-testnet",
        chainIdHex: "0x61",
        networkId: BSC_TESTNET_NETWORK_ID_HEX,
        sourceDomain: 0,
        targetDomain: 2,
        verifierKeyHash: HASH_77,
        ...VALID_VERIFIER_MATERIAL,
      });

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("route-verifier-key-hash-mismatch");
      expect(
        report.files.find((entry) => entry.kind === "verifier")?.verifier
          ?.hashMatchesPublicRoute,
      ).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports bound to the wrong BSC chain id", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          bsc: {
            chainIdHex: "0x38",
            networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
          },
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("BSC testnet chain id");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports whose valid fields are only inherited properties", async () => {
    const fixture = await createReadyFixture();
    try {
      const pollutedRouteReport = Object.create(routeReport());
      const report = await evaluateFixture(fixture, {
        routeReport: pollutedRouteReport,
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("route report is missing");
      expect(report.routeReport).toBeUndefined();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores Object.prototype route report material when binding inventory", async () => {
    const fixture = await createReadyFixture();
    const fullReport = routeReport({ deployment: fixture.routeDeployment });
    const inherited = {
      manifestSource: fullReport.manifestSource,
      routeId: fullReport.routeId,
      assetKey: fullReport.assetKey,
      taira: fullReport.taira,
      bsc: fullReport.bsc,
      deployment: fullReport.deployment,
      postDeployLiveEvidence: fullReport.postDeployLiveEvidence,
      checks: fullReport.checks,
    };
    const previousDescriptors = new Map(
      Object.entries(inherited).map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );

    try {
      for (const [key, value] of Object.entries(inherited)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      const report = await evaluateFixture(fixture, {
        routeReport: {
          ready: true,
          generatedAtMs: fullReport.generatedAtMs,
        },
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("route deployment summary is missing");
      expect(report.route).toMatchObject({
        ready: true,
        manifestSource: null,
        bsc: null,
        deployment: null,
        postDeployLiveEvidence: null,
      });
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed route report readiness without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const readyGetter = vi.fn(() => {
        throw new Error("route ready getter should not run");
      });
      const reportInput = routeReport({ deployment: fixture.routeDeployment });
      Object.defineProperty(reportInput, "ready", {
        configurable: true,
        enumerable: true,
        get: readyGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: reportInput,
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("route report is not ready");
      expect(report.route.ready).toBe(false);
      expect(readyGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed route deployments without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const deploymentGetter = vi.fn(() => {
        throw new Error("route deployment getter should not run");
      });
      const reportInput = routeReport({ deployment: fixture.routeDeployment });
      Object.defineProperty(reportInput, "deployment", {
        configurable: true,
        enumerable: true,
        get: deploymentGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: reportInput,
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("route deployment summary is missing");
      expect(report.route.deployment).toBeNull();
      expect(deploymentGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed nested route deployment fields without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const verifierKeyHashGetter = vi.fn(() => {
        throw new Error(
          "route deployment verifierKeyHash getter should not run",
        );
      });
      const deploymentInput = { ...fixture.routeDeployment };
      Object.defineProperty(deploymentInput, "verifierKeyHash", {
        configurable: true,
        enumerable: true,
        get: verifierKeyHashGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({ deployment: deploymentInput }),
      });

      expect(report.ready).toBe(false);
      expect(report.route.deployment?.verifierKeyHash).toBeUndefined();
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("verifierKeyHash is missing or invalid");
      expect(verifierKeyHashGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores accessor-backed forbidden route aliases without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const tronVerifierGetter = vi.fn(() => {
        throw new Error("TRON verifier alias getter should not run");
      });
      const deploymentInput = { ...fixture.routeDeployment };
      Object.defineProperty(deploymentInput, "tronVerifierAddress", {
        configurable: true,
        enumerable: true,
        get: tronVerifierGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({ deployment: deploymentInput }),
      });

      expect(report.ready).toBe(true);
      expect(tronVerifierGetter).not.toHaveBeenCalled();
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")?.ok,
      ).toBe(true);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed route checks without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const checkGetter = vi.fn(() => {
        throw new Error("route check getter should not run");
      });
      const checks = routeReport().checks.map((entry) => ({ ...entry }));
      Object.defineProperty(checks, "0", {
        configurable: true,
        enumerable: true,
        get: checkGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          deployment: fixture.routeDeployment,
          checks,
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/route report check 0 is not an object/u);
      expect(checkGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores accessor-backed post-deploy evidence without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const evidenceGetter = vi.fn(() => {
        throw new Error("post-deploy evidence getter should not run");
      });
      const reportInput = routeReport({ deployment: fixture.routeDeployment });
      Object.defineProperty(reportInput, "postDeployLiveEvidence", {
        configurable: true,
        enumerable: true,
        get: evidenceGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: reportInput,
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "offline-full-toml-evidence-artifact",
        )?.detail,
      ).toContain("route offlineFullTomlSha256 is missing or invalid");
      expect(report.route.postDeployLiveEvidence).toBeNull();
      expect(evidenceGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects accessor-backed nested post-deploy evidence fields without invoking getters", async () => {
    const fixture = await createReadyFixture();
    try {
      const fullTomlReadyGetter = vi.fn(() => {
        throw new Error("post-deploy fullTomlReady getter should not run");
      });
      const evidenceInput = postDeployLiveEvidence();
      Object.defineProperty(evidenceInput, "fullTomlReady", {
        configurable: true,
        enumerable: true,
        get: fullTomlReadyGetter,
      });

      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          deployment: fixture.routeDeployment,
          postDeployLiveEvidence: evidenceInput,
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find(
          (entry) => entry.id === "offline-full-toml-evidence-artifact",
        )?.detail,
      ).toContain("matched the public route post-deploy evidence");
      expect(report.route.postDeployLiveEvidence?.fullTomlReady).toBe(false);
      expect(fullTomlReadyGetter).not.toHaveBeenCalled();
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("ignores Object.prototype material fields when scanning artifact JSON", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-inventory-polluted-"),
    );
    const benignPath = path.join(root, "benign.json");
    await writeJson(benignPath, {
      note: "plain operator note, not route or verifier evidence",
    });
    const inheritedDeployment = deployment();
    const inherited = {
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      productionReady: true,
      verifierCodeHash: inheritedDeployment.verifierCodeHash,
      verifierKeyHash: inheritedDeployment.verifierKeyHash,
      proofArtifactHash: inheritedDeployment.proofArtifactHash,
      provingKeyHash: inheritedDeployment.provingKeyHash,
      nativeEvmProverBundleHash: inheritedDeployment.nativeEvmProverBundleHash,
      destinationBindingHash: inheritedDeployment.destinationBindingHash,
      explorerUrl: BSC_PROFILES.testnet.explorerUrl,
      explorerHost: BSC_PROFILES.testnet.explorerHost,
      fullTomlReady: true,
      network: BSC_PROFILES.testnet.chain,
      chainIdHex: BSC_PROFILES.testnet.chainIdHex,
      networkId: BSC_PROFILES.testnet.networkIdHex,
      sourceDomain: SCCP_DOMAIN_SORA,
      targetDomain: SCCP_DOMAIN_BSC,
    };
    const previousDescriptors = new Map(
      Object.entries(inherited).map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );

    try {
      for (const [key, value] of Object.entries(inherited)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      const report = await evaluateBscSccpProductionMaterialInventory({
        scanPaths: [root],
        routeReport: routeReport(),
        bscNetwork: "testnet",
        generatedAt: "2026-06-06T00:00:00.000Z",
      });
      const benign = report.files.find((entry) =>
        entry.path.endsWith("benign.json"),
      );

      expect(benign?.kind).toBe("artifact");
      expect(benign?.route).toBeUndefined();
      expect(benign?.verifier).toBeUndefined();
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
      await rm(root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate JSON object keys in scanned production route artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const routePath = path.join(
        fixture.root,
        "taira-bsc-xor-route.production.json",
      );
      const routeText = await readFile(routePath, "utf8");
      await writeFile(
        routePath,
        routeText.replace(
          '"productionReady": true,',
          '"productionReady": false,\n  "productionReady": true,',
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const routeFile = report.files.find((entry) =>
        entry.path.endsWith("taira-bsc-xor-route.production.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(routeFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "duplicate-json-object-key",
          }),
        ]),
      );
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/duplicate-json-object-key/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects duplicate JSON object keys in scanned verifier artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const verifierText = await readFile(fixture.verifierPath, "utf8");
      await writeFile(
        fixture.verifierPath,
        verifierText.replace(
          '"verifierKeyHash":',
          `"verifierKeyHash": "${HASH_33}",\n  "verifierKeyHash":`,
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const verifierFile = report.files.find((entry) =>
        entry.path.endsWith("bsc-verifier-key.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(verifierFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "duplicate-json-object-key",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON in scanned production route artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const routePath = path.join(
        fixture.root,
        "taira-bsc-xor-route.production.json",
      );
      await writeFile(
        routePath,
        [
          "{",
          `  "routeId": "${SCCP_BSC_XOR_ROUTE_ID}",`,
          `  "assetKey": "${SCCP_BSC_XOR_ASSET_KEY}",`,
          '  "productionReady": true,',
          `  "verifierKeyHash": "${fixture.routeDeployment.verifierKeyHash}",`,
        ].join("\n"),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const routeFile = report.files.find((entry) =>
        entry.path.endsWith("taira-bsc-xor-route.production.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(routeFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-json-artifact",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects malformed JSON in scanned verifier artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(
        fixture.verifierPath,
        [
          "{",
          '  "schema": "iroha-sccp-bsc-verifier-key/v1",',
          `  "network": "${fixture.profile.chain}",`,
          `  "verifierKeyHash": "${fixture.routeDeployment.verifierKeyHash}",`,
        ].join("\n"),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const verifierFile = report.files.find((entry) =>
        entry.path.endsWith("bsc-verifier-key.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(verifierFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "invalid-json-artifact",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects non-object JSON in scanned production route artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      const routePath = path.join(
        fixture.root,
        "taira-bsc-xor-route.production.json",
      );
      await writeFile(
        routePath,
        JSON.stringify(
          [
            {
              routeId: SCCP_BSC_XOR_ROUTE_ID,
              assetKey: SCCP_BSC_XOR_ASSET_KEY,
              productionReady: true,
              deployment: fixture.routeDeployment,
            },
          ],
          null,
          2,
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const routeFile = report.files.find((entry) =>
        entry.path.endsWith("taira-bsc-xor-route.production.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionRouteArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(routeFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "non-object-json-artifact",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects non-object JSON in scanned verifier artifacts", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(
        fixture.verifierPath,
        JSON.stringify(
          [
            {
              schema: "iroha-sccp-bsc-verifier-key/v1",
              network: fixture.profile.chain,
              verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
            },
          ],
          null,
          2,
        ),
        "utf8",
      );

      const report = await evaluateFixture(fixture);
      const verifierFile = report.files.find((entry) =>
        entry.path.endsWith("bsc-verifier-key.json"),
      );

      expect(report.ready).toBe(false);
      expect(report.counts.productionVerifierArtifacts).toBe(0);
      expect(report.counts.criticalFindings).toBeGreaterThan(0);
      expect(verifierFile?.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            severity: "critical",
            id: "non-object-json-artifact",
          }),
        ]),
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale route reports missing the raw verifier key hash readback", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-verifier-key-hash-readback",
          ),
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain(
        "route report is missing passing bsc-verifier-key-hash-readback check",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects stale route reports missing the production verifier-material check", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-production-verifier-material",
          ),
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain(
        "route report is missing passing bsc-production-verifier-material check",
      );
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports missing the BSC explorer host binding", async () => {
    const fixture = await createReadyFixture();
    try {
      const goodRoute = routeReport();
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          bsc: {
            ...goodRoute.bsc,
            explorerHost: undefined,
          },
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toContain("explorerHost is not bound to BSC testnet");
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects route reports whose BSC explorer URL is bound to another network", async () => {
    const fixture = await createReadyFixture();
    try {
      const goodRoute = routeReport();
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          bsc: {
            ...goodRoute.bsc,
            explorerUrl: "https://bscscan.com",
            explorerHost: "bscscan.com",
          },
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/explorerUrl|explorerHost/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects proof artifacts whose hash does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      const report = await evaluateFixture(fixture, {
        routeReport: routeReport({
          deployment: deployment({
            ...fixture.routeDeployment,
            proofArtifactHash: HASH_44,
          }),
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-proof-files")
          ?.detail,
      ).toMatch(
        /proof artifact file hash does not match route proofArtifactHash/u,
      );
      expect(
        report.files.find((entry) => entry.kind === "proof-artifact")?.proofFile
          ?.hashMatchesPublicRoute,
      ).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects proving keys whose hash does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeFile(fixture.provingKeyPath, provingKeyMaterialBytes(0x71));
      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-proof-files")
          ?.detail,
      ).toMatch(/proving key file hash does not match route provingKeyHash/u);
      expect(
        report.files.find((entry) => entry.kind === "proving-key")?.proofFile
          ?.hashMatchesPublicRoute,
      ).toBe(false);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose hashes do not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          proofArtifactHash: HASH_44,
          provingKeyHash: fixture.routeDeployment.provingKeyHash,
          deployment: deployment({
            ...fixture.routeDeployment,
            proofArtifactHash: HASH_44,
          }),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact")
          ?.detail,
      ).toMatch(/matched the public route deployment hashes/u);
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({ publicDeploymentMatches: false });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose BSC addresses do not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          deployment: {
            ...fixture.routeDeployment,
            bridgeAddress: "0x1234567890abcdef1234567890abcdef12345678",
          },
          postDeployLiveEvidence: postDeployLiveEvidence(),
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact")
          ?.detail,
      ).toMatch(/matched the public route deployment hashes/u);
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        bridgeAddress: "0x1234567890abcdef1234567890abcdef12345678",
        publicDeploymentMatches: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts whose native prover bundle hash does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          explorerUrl: BSC_PROFILES.testnet.explorerUrl,
          explorerHost: BSC_PROFILES.testnet.explorerHost,
          deployment: {
            ...fixture.routeDeployment,
            nativeEvmProverBundleHash: HASH_77,
          },
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "production-route-artifact")
          ?.detail,
      ).toMatch(/matched the public route deployment hashes/u);
      expect(
        report.files.find(
          (entry) =>
            entry.kind === "route" && entry.route?.productionReady === true,
        )?.route,
      ).toMatchObject({
        nativeEvmProverBundleHash: HASH_77,
        publicDeploymentMatches: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects validated native EVM prover bundles whose descriptor hash does not match the public route report", async () => {
    const fixture = await createReadyFixture();
    try {
      const forgedRouteReport = routeReport({
        deployment: {
          ...fixture.routeDeployment,
          nativeEvmProverBundleHash: HASH_77,
        },
      });
      const report = await evaluateFixture(fixture, {
        routeReport: forgedRouteReport,
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "native-evm-prover-bundle")
          ?.detail,
      ).toMatch(/native descriptor\/verifier\/proof/u);
      expect(
        report.files.find((entry) => entry.kind === "native-prover-bundle")
          ?.nativeProverBundle,
      ).toMatchObject({
        valid: true,
        nativeEvmProverBundleHash:
          fixture.routeDeployment.nativeEvmProverBundleHash,
        publicDeploymentMatches: false,
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("rejects production route artifacts that omit native bundle and destination binding hashes", async () => {
    const fixture = await createReadyFixture();
    try {
      await writeJson(
        path.join(fixture.root, "taira-bsc-xor-route.production.json"),
        {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          verifierCodeHash: fixture.routeDeployment.verifierCodeHash,
          verifierKeyHash: fixture.routeDeployment.verifierKeyHash,
          proofArtifactHash: fixture.routeDeployment.proofArtifactHash,
          provingKeyHash: fixture.routeDeployment.provingKeyHash,
          tairaXorBurnRecord: productionBurnRecordMaterial(),
        },
      );

      const report = await evaluateFixture(fixture);

      expect(report.ready).toBe(false);
      expect(
        report.files
          .flatMap((entry) => entry.findings)
          .map((entry) => entry.id),
      ).toContain("production-ready-missing-proof-hashes");
      expect(
        report.checks.find(
          (entry) => entry.id === "artifact-secret-and-diagnostic-scan",
        )?.detail,
      ).toMatch(/production-ready-missing-proof-hashes/u);
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
    }
  });

  it("loads route reports from disk for the CLI runner path", async () => {
    const fixture = await createReadyFixture();
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const routeReportPath = path.join(temp, "route-report.json");
      await writeJson(routeReportPath, fixture.routeReport);

      const report = await runBscSccpProductionMaterialInventory({
        scanPaths: [fixture.root],
        routeReportPath,
        destinationModuleUrl: fixture.destinationModuleUrl,
        sourceModuleUrl: fixture.sourceModuleUrl,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(true);
      expect(report.route.deployment).toEqual(fixture.routeDeployment);
      expect(report.route.bsc).toEqual({
        network: "testnet",
        chain: "bsc-testnet",
        chainIdHex: "0x61",
        networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
        explorerUrl: "https://testnet.bscscan.com",
        explorerHost: "testnet.bscscan.com",
      });
    } finally {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("does not invoke accessor-backed top-level inventory runner option fields", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const routeReportPath = path.join(temp, "route-report.json");
      await writeJson(routeReportPath, routeReport());
      const getters = new Map(
        [
          "bscNetwork",
          "destinationModuleUrl",
          "sourceModuleUrl",
          "runtimeProverConfigUrl",
          "destinationSidecarPath",
          "sourceSidecarPath",
          "fetchImpl",
          "timeoutMs",
          "generatedAt",
        ].map((key) => [
          key,
          vi.fn(() => {
            throw new Error(`${key} getter should not run`);
          }),
        ]),
      );
      const options = {
        scanPaths: [temp],
        routeReportPath,
      };
      for (const [key, getter] of getters) {
        Object.defineProperty(options, key, {
          configurable: true,
          enumerable: true,
          get: getter,
        });
      }

      const report = await runBscSccpProductionMaterialInventory(options);

      expect(report.ready).toBe(false);
      expect(report.route.ready).toBe(true);
      for (const getter of getters.values()) {
        expect(getter).not.toHaveBeenCalled();
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("uses profile-specific default route report paths for standalone inventory runs", () => {
    expect(
      path.relative(
        repoRoot,
        bscSccpProductionMaterialInventoryRouteReportPath("testnet"),
      ),
    ).toBe(path.join("output", "sccp-bsc-preflight", "testnet", "latest.json"));
    expect(
      path.relative(
        repoRoot,
        bscSccpProductionMaterialInventoryRouteReportPath("mainnet"),
      ),
    ).toBe(path.join("output", "sccp-bsc-preflight", "mainnet", "latest.json"));
  });

  it("fails closed on symlinked route reports passed to the inventory runner", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const target = path.join(temp, "route-report.target.json");
      const link = path.join(temp, "route-report.json");
      await writeJson(target, routeReport());
      await symlink(target, link);

      const report = await runBscSccpProductionMaterialInventory({
        scanPaths: [temp],
        routeReportPath: link,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/symbolic link/u);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed on oversized route reports passed to the inventory runner", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const routeReportPath = path.join(temp, "route-report.json");
      await writeFile(
        routeReportPath,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      const report = await runBscSccpProductionMaterialInventory({
        scanPaths: [temp],
        routeReportPath,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/maximum allowed/u);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed on non-object route report JSON passed to the inventory runner", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const routeReportPath = path.join(temp, "route-report.json");
      await writeFile(routeReportPath, JSON.stringify([]), "utf8");

      const report = await runBscSccpProductionMaterialInventory({
        scanPaths: [temp],
        routeReportPath,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/JSON object/u);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });

  it("fails closed on duplicate JSON object keys in route reports passed to the inventory runner", async () => {
    const temp = await mkdtemp(path.join(tmpdir(), "sccp-bsc-inventory-"));
    try {
      const routeReportPath = path.join(temp, "route-report.json");
      const routeReportText = JSON.stringify(routeReport(), null, 2)
        .replace('"ready": true,', '"ready": false,\n  "ready": true,')
        .concat("\n");
      await writeFile(routeReportPath, routeReportText, "utf8");

      const report = await runBscSccpProductionMaterialInventory({
        scanPaths: [temp],
        routeReportPath,
        generatedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(
        report.checks.find((entry) => entry.id === "route-report-binding")
          ?.detail,
      ).toMatch(/duplicate JSON object key/u);
      expect(JSON.stringify(report)).not.toContain('"ready":true');
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  });
});
