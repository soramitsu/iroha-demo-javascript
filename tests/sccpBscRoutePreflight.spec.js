/* global BigInt */
import { createHash } from "node:crypto";
import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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
  BSC_TESTNET_CHAIN_ID_HEX,
  SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
  SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES,
  bscSccpRoutePreflightOutputDir,
  bscSccpRoutePreflightRunbookProblems,
  canonicalBscNativeEvmProverBundleHash,
  evaluateBscSccpRoutePreflight,
  fetchBscContractReadback,
  normalizeBscRpcEndpoint,
  runBscSccpRoutePreflight,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";

const TORII_URL = "https://taira.sora.org";
const hex32 = (byte) => `0x${byte.repeat(32)}`;
const fixtureHash = (label) =>
  `0x${createHash("sha256").update(Buffer.from(label, "utf8")).digest("hex")}`;
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc route preflight bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc route preflight token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc route preflight source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc route preflight verifier");
const BSC_TESTNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000061";
const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const HASH_11 = fixtureHash("bsc route preflight fixture hash 11");
const HASH_22 = fixtureHash("bsc route preflight fixture hash 22");
const HASH_33 = fixtureHash("bsc route preflight fixture hash 33");
const HASH_44 = fixtureHash("bsc route preflight fixture hash 44");
const HASH_55 = fixtureHash("bsc route preflight fixture hash 55");
const HASH_66 = fixtureHash("bsc route preflight fixture hash 66");
const HASH_77 = fixtureHash("bsc route preflight fixture hash 77");
const HASH_88 = fixtureHash("bsc route preflight fixture hash 88");
const HASH_99 = fixtureHash("bsc route preflight fixture hash 99");
const HASH_AA = fixtureHash("bsc route preflight fixture hash aa");
const HASH_BB = fixtureHash("bsc route preflight fixture hash bb");
const VERIFIER_KEY_ARTIFACT_HASH = fixtureHash(
  "preflight verifier key artifact",
);
const GROTH16_PROOF_SELF_TEST_HASH = fixtureHash(
  "preflight Groth16 proof self-test report",
);
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH = [
  ...SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
][0];
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
const ARTIFACT_BYTES = Buffer.from(
  Array.from(
    { length: 768 },
    (_, index) => (0x51 + index * 37 + (index >> 3)) & 0xff,
  ),
);
const ARTIFACT_B64 = ARTIFACT_BYTES.toString("base64");
const ARTIFACT_SHA256 = `0x${createHash("sha256")
  .update(ARTIFACT_BYTES)
  .digest("hex")}`;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const BSC_BINDING_KEY = `evm:0:2:${BSC_TESTNET_NETWORK_ID_HEX.slice(
  2,
)}:${BSC_VERIFIER_ADDRESS}:${BSC_BRIDGE_ADDRESS}:${HASH_11}:${HASH_22}`;
const BSC_RPC_URL = "https://bsc-rpc.example.test";
const EVM_SELECTORS = {
  bridge: "0xe78cea92",
  bridgeLocked: "0x91a234e4",
  owner: "0x8da5cb5b",
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

const readyBscContractReadback = (overrides = {}) => ({
  endpoint: BSC_RPC_URL,
  chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
  codePresent: {
    token: true,
    bridge: true,
    sourceBridge: true,
    verifier: true,
    ...overrides.codePresent,
  },
  tokenAddress: BSC_TOKEN_ADDRESS,
  bridgeAddress: BSC_BRIDGE_ADDRESS,
  sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  verifierAddress: BSC_VERIFIER_ADDRESS,
  tokenBridgeAddress: BSC_BRIDGE_ADDRESS,
  tokenBridgeLocked: true,
  sourceBridgeOwner: BSC_BRIDGE_ADDRESS,
  bridgeDestinationBindingHash: HASH_33,
  bridgeVerifierAddress: BSC_VERIFIER_ADDRESS,
  bridgeVerifierCodeHash: HASH_11,
  bridgeVerifierKeyHash: HASH_22,
  verifierKeyHash: HASH_22,
  bridgeNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
  bridgeSourceDomain: 0,
  bridgeTargetDomain: 2,
  ...overrides,
});

const readyCapabilities = {
  proofSubmitPath: "/v1/bridge/proofs/submit",
  messageSubmitPath: "/v1/bridge/messages",
};
const readyChainMetadata = {
  chainId: BSC_TAIRA_CHAIN_ID,
  networkPrefix: BSC_TAIRA_NETWORK_PREFIX,
};

const browserProverRef = (direction = "destination", overrides = {}) => ({
  moduleUrl:
    direction === "source"
      ? "/sccp-bsc/source-prover.js"
      : "/sccp-bsc/destination-prover.js",
  moduleHash: direction === "source" ? HASH_99 : HASH_88,
  manifestHash: direction === "source" ? HASH_BB : HASH_AA,
  expectedExports:
    direction === "source"
      ? ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"]
      : ["bscSccpProve", "bscSccpNativeProverSelfTest"],
  boundRouteHash: HASH_33,
  boundProofHash: HASH_44,
  ...overrides,
});

const readyManifest = (overrides = {}) => ({
  bscNetwork: "testnet",
  chain: "bsc-testnet",
  chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
  explorerUrl: "https://testnet.bscscan.com",
  explorerHost: "testnet.bscscan.com",
  counterpartyDomain: 2,
  counterpartyAccountCodecKey: "evm_hex",
  counterpartyAccountCodec: 2,
  verifierTarget: "EvmContract",
  routeId: "taira_bsc_xor",
  assetKey: "xor",
  productionReady: true,
  nativeEvmProverBundleHash: HASH_99,
  destinationBrowserProver: browserProverRef("destination"),
  sourceBrowserProver: browserProverRef("source"),
  bscBridgeAddress: BSC_BRIDGE_ADDRESS,
  bscTokenAddress: BSC_TOKEN_ADDRESS,
  sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  bscVerifierAddress: BSC_VERIFIER_ADDRESS,
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
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: HASH_77,
    routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    offlineFullTomlSha256: HASH_11,
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
  ...overrides,
});

const nativeProverBundleForManifest = (manifest, overrides = {}) => ({
  schema: SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  bundle_id: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  domain: 2,
  chain: "bsc-testnet",
  proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  proof_artifact: "artifacts/bsc-testnet/proof-artifact.r1cs",
  proof_artifact_hash: manifest.destinationRollout.proofArtifactHash,
  proving_key: "artifacts/bsc-testnet/proving-key.zkey",
  proving_key_hash: manifest.destinationRollout.provingKeyHash,
  verifier_key: "artifacts/bsc-testnet/verifier-key.json",
  verifier_key_hash: manifest.destinationRollout.verifierKeyHash,
  verifier_key_artifact_hash: VERIFIER_KEY_ARTIFACT_HASH,
  destination_binding_hash: manifest.destinationRollout.destinationBindingHash,
  no_wasm: true,
  remote_prover_required: false,
  browser_implementation: "pure-typescript",
  cross_sdk_parity_artifact: "artifacts/bsc-testnet/cross-sdk-parity.json",
  native_prover_self_test_artifact:
    "artifacts/bsc-testnet/native-prover-self-test.json",
  groth16_proof_self_test_artifact:
    "artifacts/bsc-testnet/groth16-proof-self-test.json",
  groth16_proof_self_test_hash: GROTH16_PROOF_SELF_TEST_HASH,
  native_sdk_artifacts: Object.entries(
    SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  ).map(([sdk, implementation], index) => ({
    sdk,
    implementation,
    prover_artifact_hash: manifest.destinationRollout.proofArtifactHash,
    proving_key_hash: manifest.destinationRollout.provingKeyHash,
    implementation_artifact: `artifacts/bsc-testnet/${sdk}-implementation.bin`,
    implementation_hash: hex32((0x81 + index).toString(16)),
  })),
  audit_hashes: {
    circuit_security_audit: fixtureHash("preflight circuit security audit"),
    native_implementation_audit: fixtureHash(
      "preflight native implementation audit",
    ),
    reproducible_build_attestation: fixtureHash(
      "preflight reproducible build attestation",
    ),
    cross_sdk_parity: fixtureHash("preflight cross-SDK parity"),
    native_prover_self_test: fixtureHash("preflight native self-test"),
    no_wasm_no_remote_scan: fixtureHash("preflight no-wasm no-remote scan"),
  },
  ...overrides,
});

const readyManifestWithNativeBundle = (overrides = {}) => {
  const {
    bundleOverrides,
    skipNativeEvmProverBundle,
    destinationRollout: destinationRolloutOverrides,
    ...manifestOverrides
  } = overrides;
  const manifest = readyManifest({
    ...manifestOverrides,
    ...(destinationRolloutOverrides
      ? {
          destinationRollout: {
            ...readyManifest().destinationRollout,
            ...destinationRolloutOverrides,
          },
        }
      : {}),
  });
  const manifestWithRefs = {
    ...manifest,
    destinationBrowserProver:
      manifestOverrides.destinationBrowserProver ??
      manifestOverrides.destination_browser_prover ??
      browserProverRef("destination", {
        boundRouteHash: manifest.destinationRollout.destinationBindingHash,
        boundProofHash: manifest.destinationRollout.proofArtifactHash,
      }),
    sourceBrowserProver:
      manifestOverrides.sourceBrowserProver ??
      manifestOverrides.source_browser_prover ??
      browserProverRef("source", {
        boundRouteHash: manifest.destinationRollout.destinationBindingHash,
        boundProofHash: manifest.destinationRollout.proofArtifactHash,
      }),
  };
  if (skipNativeEvmProverBundle) {
    return manifestWithRefs;
  }
  const nativeEvmProverBundle = nativeProverBundleForManifest(
    manifestWithRefs,
    bundleOverrides ?? {},
  );
  let nativeEvmProverBundleHash;
  try {
    const normalizedNativeEvmProverBundle =
      validateBscTestnetNativeEvmProverBundle(nativeEvmProverBundle, {
        expectedDestinationBindingHash:
          manifestWithRefs.destinationRollout.destinationBindingHash,
      });
    nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
      normalizedNativeEvmProverBundle,
    );
  } catch (_error) {
    nativeEvmProverBundleHash = canonicalBscNativeEvmProverBundleHash(
      nativeEvmProverBundle,
    );
  }
  return {
    ...manifestWithRefs,
    nativeEvmProverBundleHash,
    nativeEvmProverBundle,
  };
};

const duplicateBscNetworkManifestSetJson = () =>
  JSON.stringify({ manifests: [readyManifestWithNativeBundle()] }, null, 2)
    .replace(
      '"bscNetwork": "testnet",',
      '"bscNetwork": "mainnet",\n      "bscNetwork": "testnet",',
    )
    .concat("\n");

const duplicateCapabilitiesJson = () =>
  JSON.stringify(readyCapabilities, null, 2)
    .replace(
      '"proofSubmitPath": "/v1/bridge/proofs/submit"',
      '"proofSubmitPath": "/shadow-submit",\n  "proofSubmitPath": "/v1/bridge/proofs/submit"',
    )
    .concat("\n");

const evaluate = (
  manifestSet = { manifests: [readyManifestWithNativeBundle()] },
) =>
  evaluateBscSccpRoutePreflight({
    toriiUrl: TORII_URL,
    chainMetadata: readyChainMetadata,
    capabilities: readyCapabilities,
    manifestSet,
  });

const failedCheck = (report, id) =>
  report.checks.find((entry) => entry.id === id && !entry.ok);
const failedText = (report, id) => {
  const entry = failedCheck(report, id);
  return `${entry?.message ?? ""} ${entry?.detail ?? ""}`;
};

describe("BSC SCCP route preflight", () => {
  it("uses profile-specific default preflight output directories", () => {
    const testnet = bscSccpRoutePreflightOutputDir("testnet");
    const mainnet = bscSccpRoutePreflightOutputDir("mainnet");

    expect(testnet).toContain("output/sccp-bsc-preflight/testnet");
    expect(mainnet).toContain("output/sccp-bsc-preflight/mainnet");
    expect(mainnet).not.toBe(testnet);
  });

  it("accepts complete BSC route preflight runbook contracts", () => {
    expect(
      bscSccpRoutePreflightRunbookProblems({
        nextActions: [
          {
            id: "replace-diagnostic-bsc-verifier",
            title: "Replace diagnostic BSC verifier deployment",
            detail: "Deploy BSC contracts with production verifier material.",
            requiredInputs: [
              {
                id: "production-groth16-verifier-key-json",
                kind: "file",
                placeholder: "<production-verifier-key.json>",
                description: "Production BN254 Groth16 verifier key JSON.",
              },
            ],
            blockedByChecks: ["bsc-production-verifier-material"],
            commands: [
              "npm run e2e:sccp:bsc-preflight -- --bsc-network testnet",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "production-groth16-verifier-key-json",
            kind: "file",
            placeholder: "<production-verifier-key.json>",
            description: "Production BN254 Groth16 verifier key JSON.",
            blockedByActions: ["replace-diagnostic-bsc-verifier"],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects malformed BSC route preflight runbook contracts", () => {
    const problems = bscSccpRoutePreflightRunbookProblems({
      nextActions: [
        {
          id: "replace-diagnostic-bsc-verifier",
          title: "",
          detail: "Deploy BSC contracts with production verifier material.",
          requiredInputs: [
            {
              id: "production-groth16-verifier-key-json",
              kind: "file",
              placeholder: "",
            },
          ],
          blockedByChecks: [],
          commands: "npm run e2e:sccp:bsc-preflight",
        },
      ],
      missingProductionInputs: [
        {
          id: "production-groth16-verifier-key-json",
          kind: "",
          placeholder: "<production-verifier-key.json>",
          description: "Production BN254 Groth16 verifier key JSON.",
          blockedByActions: "replace-diagnostic-bsc-verifier",
        },
        "not-an-input-contract",
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC route preflight next action 0 title is missing or not a non-empty string.",
        "BSC route preflight next action 0 required input 0 placeholder is missing or not a non-empty string.",
        "BSC route preflight next action 0 required input 0 description is missing or not a non-empty string.",
        "BSC route preflight next action 0 blockedByChecks is missing or empty.",
        "BSC route preflight next action 0 commands is not an array.",
        "BSC route preflight missing production input 0 kind is missing or not a non-empty string.",
        "BSC route preflight missing production input 0 blockedByActions is not an array.",
        "BSC route preflight missing production input 1 is not an object.",
      ]),
    );
  });

  it("rejects unlinked BSC route preflight runbook contracts", () => {
    const problems = bscSccpRoutePreflightRunbookProblems({
      nextActions: [
        {
          id: "replace-diagnostic-bsc-verifier",
          title: "Replace diagnostic BSC verifier deployment",
          detail: "Deploy BSC contracts with production verifier material.",
          requiredInputs: [
            {
              id: "production-groth16-verifier-key-json",
              kind: "file",
              placeholder: "<production-verifier-key.json>",
              description: "Production BN254 Groth16 verifier key JSON.",
            },
            {
              id: "testnet-bsc-rpc-endpoint",
              kind: "url",
              placeholder: "<testnet-bsc-rpc-url>",
              description: "BSC testnet RPC endpoint.",
            },
          ],
          blockedByChecks: ["bsc-production-verifier-material"],
          commands: ["npm run e2e:sccp:bsc-preflight -- --bsc-network testnet"],
        },
        {
          id: "publish-taira-burn-record-material",
          title: "Publish TAIRA burn-record material",
          detail: "Attach burn-record material to the route manifest.",
          requiredInputs: [
            {
              id: "taira-burn-record-contract",
              kind: "file",
              placeholder: "<taira-burn-record.contract.json>",
              description: "Compiled TAIRA burn-record IVM contract artifact.",
            },
          ],
          blockedByChecks: ["taira-burn-record-material"],
          commands: ["npm run e2e:sccp:bsc-preflight -- --bsc-network testnet"],
        },
        {
          id: "publish-taira-burn-record-material",
          title: "Duplicate burn-record action",
          detail: "Duplicate action id must fail.",
          requiredInputs: [
            {
              id: "taira-burn-record-contract",
              kind: "file",
              placeholder: "<taira-burn-record.contract.json>",
              description: "Compiled TAIRA burn-record IVM contract artifact.",
            },
          ],
          blockedByChecks: ["taira-burn-record-material"],
          commands: ["npm run e2e:sccp:bsc-preflight -- --bsc-network testnet"],
        },
      ],
      missingProductionInputs: [
        {
          id: "production-groth16-verifier-key-json",
          kind: "file",
          placeholder: "<production-verifier-key.json>",
          description: "Production BN254 Groth16 verifier key JSON.",
          blockedByActions: ["unknown-action"],
        },
        {
          id: "taira-burn-record-contract",
          kind: "file",
          placeholder: "<taira-burn-record.contract.json>",
          description: "Compiled TAIRA burn-record IVM contract artifact.",
          blockedByActions: ["replace-diagnostic-bsc-verifier"],
        },
        {
          id: "taira-burn-record-contract",
          kind: "file",
          placeholder: "<taira-burn-record.contract.json>",
          description: "Duplicate input id must fail.",
          blockedByActions: ["publish-taira-burn-record-material"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC route preflight next action id publish-taira-burn-record-material is duplicated.",
        "BSC route preflight missing production input id taira-burn-record-contract is duplicated.",
        "BSC route preflight missing production input production-groth16-verifier-key-json does not reference blocking action replace-diagnostic-bsc-verifier.",
        "BSC route preflight next action replace-diagnostic-bsc-verifier requires input testnet-bsc-rpc-endpoint, but missingProductionInputs does not include it.",
        "BSC route preflight missing production input taira-burn-record-contract does not reference blocking action publish-taira-burn-record-material.",
        "BSC route preflight missing production input production-groth16-verifier-key-json references unknown blocking action unknown-action.",
        "BSC route preflight missing production input taira-burn-record-contract references blocking action replace-diagnostic-bsc-verifier, but that action does not require the input.",
      ]),
    );
  });

  it("rejects preflight proof-material runbooks that omit native bundle inputs", () => {
    const problems = bscSccpRoutePreflightRunbookProblems({
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
          blockedByChecks: ["bsc-native-evm-prover-bundle"],
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
        "BSC route preflight next action 0 native-prover-bundle command lacks --proof-artifact.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --proving-key.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --verifier-key.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --groth16-material-manifest.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --cross-sdk-parity.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --native-prover-self-test.",
        "BSC route preflight next action 0 native-prover-bundle command lacks --audit-no-wasm-no-remote-scan.",
      ]),
    );
  });

  it("does not execute accessor-backed BSC route preflight runbook entries", () => {
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
    const commands = ["npm run e2e:sccp:bsc-preflight"];
    Object.defineProperty(commands, "1", {
      configurable: true,
      enumerable: true,
      get() {
        commandReads += 1;
        return "hidden command";
      },
    });
    const blockedByActions = ["replace-diagnostic-bsc-verifier"];
    Object.defineProperty(blockedByActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        blockedActionReads += 1;
        return "hidden-action";
      },
    });

    const problems = bscSccpRoutePreflightRunbookProblems({
      nextActions: [
        {
          id: "replace-diagnostic-bsc-verifier",
          title: "Replace diagnostic BSC verifier deployment",
          detail: "Deploy BSC contracts with production verifier material.",
          requiredInputs,
          blockedByChecks: ["bsc-production-verifier-material"],
          commands,
        },
      ],
      missingProductionInputs: [
        {
          id: "production-groth16-verifier-key-json",
          kind: "file",
          placeholder: "<production-verifier-key.json>",
          description: "Production BN254 Groth16 verifier key JSON.",
          blockedByActions,
        },
      ],
    });

    expect(requiredInputReads).toBe(0);
    expect(commandReads).toBe(0);
    expect(blockedActionReads).toBe(0);
    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC route preflight next action 0 required input 0 is not an object.",
        "BSC route preflight next action 0 commands 1 is not a non-empty string.",
        "BSC route preflight missing production input 0 blockedByActions 1 is not a non-empty string.",
      ]),
    );
  });

  it("accepts a production-ready TAIRA/BSC testnet XOR route without serializing artifact material", () => {
    const manifest = readyManifestWithNativeBundle();
    const expectedNativeBundleHash = canonicalBscNativeEvmProverBundleHash(
      validateBscTestnetNativeEvmProverBundle(manifest.nativeEvmProverBundle, {
        expectedDestinationBindingHash:
          manifest.destinationRollout.destinationBindingHash,
      }),
    );
    const report = evaluate({ manifests: [manifest] });

    expect(report.ready).toBe(true);
    expect(report.generatedAt).toBe(
      new Date(report.generatedAtMs).toISOString(),
    );
    expect(report.bsc).toMatchObject({
      network: "testnet",
      chain: "bsc-testnet",
      chainIdHex: BSC_TESTNET_CHAIN_ID_HEX,
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(report.deployment).toMatchObject({
      bridgeAddress: BSC_BRIDGE_ADDRESS,
      tokenAddress: BSC_TOKEN_ADDRESS,
      sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      verifierAddress: BSC_VERIFIER_ADDRESS,
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_66,
      nativeEvmProverBundleHash: expectedNativeBundleHash,
      destinationBindingHash: HASH_33,
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    });
    expect(report.deployment?.destinationBrowserProver).toMatchObject({
      moduleUrl: "/sccp-bsc/destination-prover.js",
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    });
    expect(report.deployment?.sourceBrowserProver).toMatchObject({
      moduleUrl: "/sccp-bsc/source-prover.js",
      boundRouteHash: HASH_33,
      boundProofHash: HASH_44,
    });
    expect(report.postDeployLiveEvidence).toEqual({
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_44,
      sourceEventTransactionId: HASH_55,
      sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
      routeCanaryEvidenceHash: HASH_66,
      routeCanaryTransactionId: HASH_77,
      routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
      offlineFullTomlSha256: HASH_11,
    });
    expect(JSON.stringify(report)).not.toContain(ARTIFACT_B64);
    expect(JSON.stringify(report)).not.toContain(
      "artifacts/bsc-testnet/proof-artifact.r1cs",
    );
    expect(JSON.stringify(report)).not.toMatch(/private|seed|mnemonic/iu);
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
  });

  it("publishes structured missing inputs for diagnostic and incomplete production route evidence", () => {
    const report = evaluate({
      manifests: [
        readyManifest({
          productionReady: false,
          disabledReason:
            "BSC verifier material is diagnostic and must be replaced before production readiness.",
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            proofArtifactHash: undefined,
            provingKeyHash: undefined,
          },
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            fullTomlReady: true,
            offlineFullTomlSha256: undefined,
          },
          nativeEvmProverBundle: undefined,
          nativeEvmProverBundleHash: undefined,
        }),
      ],
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((entry) => entry.id)).toEqual([
      "replace-diagnostic-bsc-verifier",
      "publish-production-proof-material",
      "publish-post-deploy-full-toml-evidence",
    ]);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "replace-diagnostic-bsc-verifier",
          blockedByChecks: ["bsc-production-verifier-material"],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({
              id: "production-groth16-verifier-key-json",
            }),
            expect.objectContaining({ id: "testnet-funded-bsc-deployer" }),
            expect.objectContaining({ id: "testnet-bsc-rpc-endpoint" }),
          ]),
        }),
        expect.objectContaining({
          id: "publish-production-proof-material",
          blockedByChecks: expect.arrayContaining([
            "bsc-production-prover-material",
            "bsc-native-evm-prover-bundle",
            "bsc-native-evm-prover-bundle-hash",
          ]),
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "production-route-manifest" }),
            expect.objectContaining({ id: "native-prover-artifact-root" }),
            expect.objectContaining({
              id: "production-groth16-verifier-key-json",
            }),
            expect.objectContaining({ id: "burn-record-proof-artifact" }),
            expect.objectContaining({ id: "burn-record-proving-key" }),
            expect.objectContaining({ id: "native-evm-prover-bundle" }),
            expect.objectContaining({ id: "groth16-material-manifest" }),
            expect.objectContaining({ id: "cross-sdk-parity-report" }),
            expect.objectContaining({ id: "native-prover-self-test-report" }),
            expect.objectContaining({ id: "javascript-sdk-implementation" }),
            expect.objectContaining({ id: "swift-sdk-implementation" }),
            expect.objectContaining({ id: "kotlin-sdk-implementation" }),
            expect.objectContaining({ id: "java-android-sdk-implementation" }),
            expect.objectContaining({ id: "dotnet-sdk-implementation" }),
            expect.objectContaining({ id: "audit-circuit-security" }),
            expect.objectContaining({ id: "audit-native-implementation" }),
            expect.objectContaining({ id: "audit-reproducible-build" }),
            expect.objectContaining({ id: "audit-no-wasm-no-remote-scan" }),
          ]),
        }),
        expect.objectContaining({
          id: "publish-post-deploy-full-toml-evidence",
          blockedByChecks: ["bsc-post-deploy-live-evidence"],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "offline-full-toml-evidence" }),
            expect.objectContaining({ id: "post-deploy-live-evidence" }),
          ]),
        }),
      ]),
    );
    const replaceVerifierAction = report.nextActions.find(
      (entry) => entry.id === "replace-diagnostic-bsc-verifier",
    );
    expect(replaceVerifierAction?.commands[0]).toContain(
      "--confirm-network taira_bsc_xor:testnet",
    );
    expect(replaceVerifierAction?.commands[0]).not.toContain(
      "--confirm-network testnet",
    );
    expect(replaceVerifierAction?.commands[0]).not.toContain(
      "--confirm-mainnet true",
    );
    const proofAction = report.nextActions.find(
      (entry) => entry.id === "publish-production-proof-material",
    );
    for (const flag of [
      "--proof-artifact <relative-circuit.r1cs>",
      "--proving-key <relative-circuit.zkey>",
      "--verifier-key <production-verifier-key.json>",
      "--groth16-material-manifest <relative-groth16-material-manifest.json>",
      "--cross-sdk-parity <relative-cross-sdk-parity.json>",
      "--native-prover-self-test <relative-native-self-test.json>",
      "--javascript-implementation <relative-javascript-implementation>",
      "--swift-implementation <relative-swift-implementation>",
      "--kotlin-implementation <relative-kotlin-implementation>",
      "--java-android-implementation <relative-java-android-implementation>",
      "--dotnet-implementation <relative-dotnet-implementation>",
      "--audit-circuit-security <hex-or-relative-file>",
      "--audit-native-implementation <hex-or-relative-file>",
      "--audit-reproducible-build <hex-or-relative-file>",
      "--audit-no-wasm-no-remote-scan <hex-or-relative-file>",
    ]) {
      expect(proofAction?.commands[0]).toContain(flag);
    }
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-groth16-verifier-key-json",
          blockedByActions: expect.arrayContaining([
            "replace-diagnostic-bsc-verifier",
            "publish-production-proof-material",
          ]),
        }),
        expect.objectContaining({
          id: "production-route-manifest",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "cross-sdk-parity-report",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "audit-no-wasm-no-remote-scan",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "offline-full-toml-evidence",
          blockedByActions: ["publish-post-deploy-full-toml-evidence"],
        }),
      ]),
    );
    expect(JSON.stringify(report)).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("does not ask to redeploy the BSC verifier when only native bundle and post-deploy evidence are missing", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      manifestSet: {
        manifests: [
          readyManifest({
            productionReady: false,
            disabledReason:
              "Route manifest draft is not production-ready until native prover and live canary evidence are complete.",
            nativeEvmProverBundle: undefined,
            nativeEvmProverBundleHash: undefined,
            postDeployLiveEvidence: undefined,
          }),
        ],
      },
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((entry) => entry.id)).toEqual([
      "publish-production-proof-material",
      "publish-post-deploy-full-toml-evidence",
    ]);
    expect(
      report.nextActions.some(
        (entry) => entry.id === "replace-diagnostic-bsc-verifier",
      ),
    ).toBe(false);
    expect(
      report.checks.find(
        (entry) => entry.id === "bsc-production-verifier-material",
      )?.ok,
    ).toBe(true);
  });

  it("publishes route-scoped confirmation flags for mainnet BSC verifier replacement", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      bscNetwork: "mainnet",
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      requireNativeProverBundle: false,
      manifestSet: {
        manifests: [
          readyManifest({
            bscNetwork: "mainnet",
            chain: "bsc-mainnet",
            chainIdHex: "0x38",
            explorerUrl: "https://bscscan.com",
            explorerHost: "bscscan.com",
            productionReady: false,
            disabledReason:
              "BSC verifier material is diagnostic and must be replaced before production readiness.",
            destinationRollout: {
              ...readyManifest().destinationRollout,
              verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
              destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
            },
          }),
        ],
      },
    });

    const replaceVerifierAction = report.nextActions.find(
      (entry) => entry.id === "replace-diagnostic-bsc-verifier",
    );
    expect(replaceVerifierAction?.commands[0]).toContain(
      "--confirm-network taira_bsc_xor:mainnet",
    );
    expect(replaceVerifierAction?.commands[0]).toContain(
      "--confirm-mainnet true",
    );
    expect(replaceVerifierAction?.commands[0]).not.toContain(
      "--confirm-network mainnet",
    );
  });

  it("publishes structured missing inputs when TAIRA SCCP submit paths are absent", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: {},
      manifestSet: { manifests: [readyManifestWithNativeBundle()] },
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "roll-out-taira-sccp-submit-paths",
          blockedByChecks: ["sccp-submit-paths"],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "reachable-taira-torii" }),
            expect.objectContaining({ id: "taira-route-publication-channel" }),
          ]),
          commands: expect.arrayContaining([
            "curl -fsS <taira-torii-url>/v1/sccp/capabilities",
          ]),
        }),
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "reachable-taira-torii",
          blockedByActions: ["roll-out-taira-sccp-submit-paths"],
        }),
        expect.objectContaining({
          id: "taira-route-publication-channel",
          blockedByActions: ["roll-out-taira-sccp-submit-paths"],
        }),
      ]),
    );
    expect(
      failedCheck(report, "bsc-preflight-runbook-contract"),
    ).toBeUndefined();
  });

  it("publishes structured missing inputs when no public BSC route manifest is advertised", () => {
    const report = evaluate({
      manifests: [readyManifest({ routeId: "taira_bsc_other" })],
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "publish-public-bsc-route-manifest",
          blockedByChecks: ["bsc-route-manifest", "bsc-route-manifest-unique"],
          requiredInputs: expect.arrayContaining([
            expect.objectContaining({ id: "production-route-manifest" }),
            expect.objectContaining({ id: "testnet-bsc-deployment-evidence" }),
            expect.objectContaining({ id: "taira-burn-record-contract" }),
            expect.objectContaining({
              id: "canonical-settlement-asset-definition-id",
            }),
            expect.objectContaining({ id: "burn-record-proof-artifact" }),
            expect.objectContaining({ id: "burn-record-proving-key" }),
            expect.objectContaining({ id: "native-evm-prover-bundle" }),
            expect.objectContaining({ id: "destination-browser-prover-module" }),
            expect.objectContaining({
              id: "destination-browser-prover-manifest",
            }),
            expect.objectContaining({ id: "source-browser-prover-module" }),
            expect.objectContaining({ id: "source-browser-prover-manifest" }),
            expect.objectContaining({ id: "post-deploy-live-evidence" }),
            expect.objectContaining({ id: "offline-full-toml-evidence" }),
            expect.objectContaining({ id: "deployed-taira-base-config" }),
            expect.objectContaining({ id: "taira-route-publication-channel" }),
          ]),
        }),
      ]),
    );
    const publishAction = report.nextActions.find(
      (entry) => entry.id === "publish-public-bsc-route-manifest",
    );
    expect(publishAction?.commands[0]).toContain(
      "e2e:sccp:bsc-prover-manifest",
    );
    expect(publishAction?.commands[0]).toContain("--direction destination");
    expect(publishAction?.commands[0]).toContain(
      "--route-report <pre-sidecar-route-preflight-report.json>",
    );
    expect(publishAction?.commands[1]).toContain("--direction source");
    expect(publishAction?.commands[2]).toContain(
      "--evidence <testnet-deployment-evidence.json>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--destination-browser-prover-manifest <destination-browser-prover-manifest.json>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--source-browser-prover-manifest <source-browser-prover-manifest.json>",
    );
    expect(publishAction?.commands[3]).toContain("publish-route-manifest");
    expect(publishAction?.commands[2]).toContain(
      "--taira-contract <taira-burn-record.contract.json>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--settlement-asset-definition-id <canonical-asset-definition-id>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--native-prover-bundle <native-evm-prover-bundle.json>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(publishAction?.commands[2]).toContain(
      "--live-readback-checked true",
    );
    expect(publishAction?.commands[2]).toContain(
      "--confirm-testnet taira_bsc_xor",
    );
    expect(publishAction?.commands[2]).not.toContain(
      "--confirm-network testnet",
    );
    expect(publishAction?.commands[3]).toContain("publish-route-manifest");
    expect(publishAction?.commands[3]).toContain(
      "--manifest <production-route.manifest.json>",
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-route-manifest",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
        expect.objectContaining({
          id: "native-evm-prover-bundle",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
        expect.objectContaining({
          id: "destination-browser-prover-manifest",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
        expect.objectContaining({
          id: "source-browser-prover-manifest",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
        expect.objectContaining({
          id: "offline-full-toml-evidence",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
        expect.objectContaining({
          id: "taira-route-publication-channel",
          blockedByActions: ["publish-public-bsc-route-manifest"],
        }),
      ]),
    );
    expect(
      failedCheck(report, "bsc-preflight-runbook-contract"),
    ).toBeUndefined();
  });

  it("publishes mainnet route-manifest commands with mainnet confirmation", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      bscNetwork: "mainnet",
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      manifestSet: { manifests: [readyManifestWithNativeBundle()] },
    });

    const publishAction = report.nextActions.find(
      (entry) => entry.id === "publish-public-bsc-route-manifest",
    );
    expect(publishAction?.commands[0]).toContain("--bsc-network mainnet");
    expect(publishAction?.commands[1]).toContain("--bsc-network mainnet");
    expect(publishAction?.commands[2]).toContain("--bsc-network mainnet");
    expect(publishAction?.commands[2]).toContain(
      "--evidence <mainnet-deployment-evidence.json>",
    );
    expect(publishAction?.commands[2]).toContain("--confirm-mainnet true");
    expect(publishAction?.commands[2]).toContain(
      "--confirm-network taira_bsc_xor",
    );
    expect(publishAction?.commands[2]).not.toContain("--confirm-testnet");
    expect(publishAction?.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "mainnet-bsc-deployment-evidence" }),
      ]),
    );
  });

  it("publishes burn-record repair commands with full production evidence", () => {
    const baseManifest = readyManifest();
    const report = evaluate({
      manifests: [
        readyManifest({
          tairaXorBurnRecord: {
            ...baseManifest.tairaXorBurnRecord,
            artifactSha256: undefined,
          },
        }),
      ],
    });

    const burnRecordAction = report.nextActions.find(
      (entry) => entry.id === "publish-taira-burn-record-material",
    );

    expect(burnRecordAction?.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "testnet-bsc-deployment-evidence" }),
        expect.objectContaining({ id: "taira-burn-record-contract" }),
        expect.objectContaining({
          id: "canonical-settlement-asset-definition-id",
        }),
        expect.objectContaining({ id: "burn-record-proof-artifact" }),
        expect.objectContaining({ id: "burn-record-proving-key" }),
        expect.objectContaining({ id: "native-evm-prover-bundle" }),
        expect.objectContaining({ id: "groth16-material-manifest" }),
        expect.objectContaining({ id: "post-deploy-live-evidence" }),
        expect.objectContaining({ id: "offline-full-toml-evidence" }),
        expect.objectContaining({ id: "deployed-taira-base-config" }),
        expect.objectContaining({ id: "taira-route-publication-channel" }),
      ]),
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--evidence <testnet-deployment-evidence.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--taira-contract <taira-burn-record.contract.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--native-prover-bundle <native-evm-prover-bundle.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--destination-browser-prover-manifest <destination-browser-prover-manifest.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--source-browser-prover-manifest <source-browser-prover-manifest.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain(
      "--offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(burnRecordAction?.commands[0]).toContain("--production-ready true");
    expect(burnRecordAction?.commands[0]).toContain(
      "--confirm-testnet taira_bsc_xor",
    );
    expect(burnRecordAction?.commands[1]).toContain("publish-route-manifest");
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "offline-full-toml-evidence",
          blockedByActions: ["publish-taira-burn-record-material"],
        }),
        expect.objectContaining({
          id: "taira-route-publication-channel",
          blockedByActions: ["publish-taira-burn-record-material"],
        }),
      ]),
    );
  });

  it("does not select route manifests from inherited object properties", () => {
    const pollutedManifest = Object.create(readyManifestWithNativeBundle());

    const report = evaluate({ manifests: [pollutedManifest] });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
      detail: "found 0 matching route manifests",
    });
    expect(report.deployment).toBeNull();
  });

  it("does not execute accessor-backed manifest collection fields", () => {
    const manifestsGetter = vi.fn(() => [readyManifestWithNativeBundle()]);
    const manifestSet = {};
    Object.defineProperty(manifestSet, "manifests", {
      enumerable: true,
      get: manifestsGetter,
    });

    const report = evaluate(manifestSet);

    expect(manifestsGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
      detail: "found 0 matching route manifests",
    });
    expect(report.deployment).toBeNull();
  });

  it("does not execute accessor-backed manifest array entries", () => {
    const manifestGetter = vi.fn(() => readyManifestWithNativeBundle());
    const manifests = [];
    Object.defineProperty(manifests, "0", {
      enumerable: true,
      get: manifestGetter,
    });

    const report = evaluate({ manifests });

    expect(manifestGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
      detail: "found 0 matching route manifests",
    });
    expect(report.deployment).toBeNull();
  });

  it("does not execute accessor-backed route identity fields", () => {
    const routeIdGetter = vi.fn(() => "taira_bsc_xor");
    const manifest = readyManifestWithNativeBundle();
    Object.defineProperty(manifest, "routeId", {
      enumerable: true,
      get: routeIdGetter,
    });

    const report = evaluate({ manifests: [manifest] });

    expect(routeIdGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
      detail: "found 0 matching route manifests",
    });
    expect(report.deployment).toBeNull();
  });

  it("fails closed when manifest arrays contain non-object entries", () => {
    const report = evaluate({
      manifests: [readyManifestWithNativeBundle(), "not-a-manifest"],
      proofManifests: [null],
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-shape")).toMatchObject({
      detail:
        "manifests[1] must be an object.; proofManifests[0] must be an object.",
    });
    expect(failedCheck(report, "bsc-route-manifest-unique")).toBeUndefined();
  });

  it("fails closed when manifest collection fields are not arrays", () => {
    const report = evaluate({
      routes: readyManifestWithNativeBundle(),
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-shape")).toMatchObject({
      detail: "routes must be an array.",
    });
    expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
      detail: "found 0 matching route manifests",
    });
    expect(report.deployment).toBeNull();
  });

  it("does not execute accessor-backed top-level preflight option fields", () => {
    const previousNetwork = process.env.SCCP_BSC_NETWORK;
    process.env.SCCP_BSC_NETWORK = "testnet";
    const getters = {
      toriiUrl: vi.fn(() => TORII_URL),
      chainMetadata: vi.fn(() => readyChainMetadata),
      capabilities: vi.fn(() => readyCapabilities),
      manifestSet: vi.fn(() => ({
        manifests: [readyManifestWithNativeBundle()],
      })),
      bscContractReadback: vi.fn(() => readyBscContractReadback()),
      errors: vi.fn(() => ({})),
      warnings: vi.fn(() => []),
      bscNetwork: vi.fn(() => "mainnet"),
      requireNativeProverBundle: vi.fn(() => false),
    };
    const options = {};
    for (const [field, getter] of Object.entries(getters)) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    try {
      const report = evaluateBscSccpRoutePreflight(options);

      for (const getter of Object.values(getters)) {
        expect(getter).not.toHaveBeenCalled();
      }
      expect(report).toMatchObject({
        ready: false,
        toriiUrl: undefined,
        bsc: {
          network: "testnet",
        },
        deployment: null,
        bscContractReadback: null,
        errors: {},
        warnings: [],
      });
      expect(failedCheck(report, "taira-network")).toBeDefined();
      expect(failedCheck(report, "sccp-submit-paths")).toBeDefined();
      expect(failedCheck(report, "bsc-route-manifest-unique")).toMatchObject({
        detail: "found 0 matching route manifests",
      });
    } finally {
      if (previousNetwork === undefined) {
        delete process.env.SCCP_BSC_NETWORK;
      } else {
        process.env.SCCP_BSC_NETWORK = previousNetwork;
      }
    }
  });

  it("accepts a direct manifest object from --manifest-file", () => {
    const report = evaluate(readyManifestWithNativeBundle());

    expect(report.ready).toBe(true);
    expect(report.deployment?.bridgeAddress).toBe(BSC_BRIDGE_ADDRESS);
  });

  it("rejects the legacy TRON source-bridge field name for production-ready BSC route manifests", () => {
    const report = evaluate(
      readyManifestWithNativeBundle({
        sccpBscSourceBridgeAddress: undefined,
        sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
      }),
    );

    expect(report.ready).toBe(false);
    expect(failedText(report, "bsc-sourceBridge-address")).toMatch(
      /source bridge address must not use TRON aliases on a BSC route manifest: sccp_tron_source_bridge_address/u,
    );
    expect(report.deployment?.sourceBridgeAddress).toBe(
      BSC_SOURCE_BRIDGE_ADDRESS,
    );
  });

  it("accepts same-valued productionReady aliases on BSC route manifests", () => {
    const report = evaluate(
      readyManifestWithNativeBundle({
        production_ready: true,
      }),
    );

    expect(report.ready).toBe(true);
    expect(failedCheck(report, "bsc-production-ready")).toBeUndefined();
  });

  it("keeps compatibility with the deployed legacy TAIRA BSC DTO shape without marking it ready", () => {
    const postDeployLiveEvidence = {
      ...readyManifest().postDeployLiveEvidence,
    };
    delete postDeployLiveEvidence.sourceEventExplorerUrl;
    delete postDeployLiveEvidence.routeCanaryExplorerUrl;

    const report = evaluate(
      readyManifest({
        counterpartyAccountCodecKey: undefined,
        counterpartyAccountCodec: undefined,
        productionReady: false,
        disabledReason: "Legacy diagnostic BSC route draft.",
        explorerUrl: undefined,
        explorerHost: undefined,
        sccpBscSourceBridgeAddress: undefined,
        sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
        postDeployLiveEvidence,
      }),
    );

    expect(report.ready).toBe(false);
    expect(failedText(report, "bsc-production-ready")).toMatch(
      /Legacy diagnostic/u,
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-codec",
        ok: true,
        detail: expect.stringContaining("inferred"),
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-explorer-binding",
        ok: true,
        detail: expect.stringContaining("<omitted>"),
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-post-deploy-live-evidence",
        ok: true,
      }),
    );
    expect(report.postDeployLiveEvidence).toMatchObject({
      sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
      routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    });
  });

  it("passes when live BSC contract readback matches the manifest", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      manifestSet: { manifests: [readyManifestWithNativeBundle()] },
      bscContractReadback: readyBscContractReadback(),
    });

    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-contract-readback",
        ok: true,
        detail: BSC_RPC_URL,
      }),
    );
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-token-lock-readback",
        ok: true,
      }),
    );
  });

  it("accepts explicit non-placeholder source verifier material markers", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      manifestSet: {
        manifests: [
          readyManifestWithNativeBundle({
            sourceVerifierMaterial: {
              version: 1,
              sourceDomain: 2,
              sourceChain: "bsc",
              sourceProofPlan: "BscValidatorSetReceiptProof",
              placeholder_material: false,
            },
          }),
        ],
      },
    });

    expect(report.ready).toBe(true);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-production-placeholder-scan",
        ok: true,
      }),
    );
  });

  it("does not execute accessor-backed BSC contract readback fields", () => {
    const codePresentGetter = vi.fn(() => ({
      token: true,
      bridge: true,
      sourceBridge: true,
      verifier: true,
    }));
    const bscContractReadback = readyBscContractReadback();
    Object.defineProperty(bscContractReadback, "codePresent", {
      enumerable: true,
      get: codePresentGetter,
    });

    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: readyCapabilities,
      manifestSet: { manifests: [readyManifestWithNativeBundle()] },
      bscContractReadback,
    });

    expect(codePresentGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(failedText(report, "bsc-token-code-readback")).toMatch(/bytecode/u);
    expect(report.bscContractReadback).toEqual({});
  });

  it("keeps canonical address summaries when same-valued alias checks fail", () => {
    const report = evaluate({
      manifests: [
        readyManifestWithNativeBundle({
          verifierAddress: BSC_VERIFIER_ADDRESS,
        }),
      ],
    });

    expect(failedText(report, "bsc-verifier-address")).toMatch(
      /verifier address must not use multiple aliases/u,
    );
    expect(report.deployment.verifierAddress).toBe(BSC_VERIFIER_ADDRESS);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-contract-addresses-distinct",
        ok: true,
      }),
    );
  });

  it("rejects drifting or incomplete BSC live contract readback", () => {
    const cases = [
      [
        "wrong chain",
        readyBscContractReadback({ chainIdHex: "0x38" }),
        "bsc-rpc-chain-id-readback",
        /0x38/,
      ],
      [
        "missing token bytecode",
        readyBscContractReadback({ codePresent: { token: false } }),
        "bsc-token-code-readback",
        /bytecode/,
      ],
      [
        "token target drift",
        readyBscContractReadback({ tokenAddress: BSC_BRIDGE_ADDRESS }),
        "bsc-token-target-readback",
        /target address/,
      ],
      [
        "bridge target drift",
        readyBscContractReadback({ bridgeAddress: BSC_TOKEN_ADDRESS }),
        "bsc-bridge-target-readback",
        /target address/,
      ],
      [
        "source bridge target drift",
        readyBscContractReadback({ sourceBridgeAddress: BSC_TOKEN_ADDRESS }),
        "bsc-sourceBridge-target-readback",
        /target address/,
      ],
      [
        "verifier target drift",
        readyBscContractReadback({ verifierAddress: BSC_TOKEN_ADDRESS }),
        "bsc-verifier-target-readback",
        /target address/,
      ],
      [
        "token bridge drift",
        readyBscContractReadback({ tokenBridgeAddress: BSC_TOKEN_ADDRESS }),
        "bsc-token-bridge-readback",
        /bridge address/,
      ],
      [
        "unlocked token",
        readyBscContractReadback({ tokenBridgeLocked: false }),
        "bsc-token-lock-readback",
        /not locked/,
      ],
      [
        "source owner drift",
        readyBscContractReadback({
          sourceBridgeOwner: BSC_SOURCE_BRIDGE_ADDRESS,
        }),
        "bsc-source-owner-readback",
        /owner/,
      ],
      [
        "bridge binding drift",
        readyBscContractReadback({ bridgeDestinationBindingHash: HASH_44 }),
        "bsc-bridge-binding-readback",
        /binding hash/,
      ],
      [
        "bridge verifier address drift",
        readyBscContractReadback({ bridgeVerifierAddress: BSC_BRIDGE_ADDRESS }),
        "bsc-bridge-verifier-address-readback",
        /verifier address/,
      ],
      [
        "bridge verifier code hash drift",
        readyBscContractReadback({ bridgeVerifierCodeHash: HASH_44 }),
        "bsc-bridge-verifier-code-hash-readback",
        /code hash/,
      ],
      [
        "bridge verifier key hash drift",
        readyBscContractReadback({ bridgeVerifierKeyHash: HASH_44 }),
        "bsc-bridge-verifier-key-hash-readback",
        /key hash/,
      ],
      [
        "raw verifier key hash drift",
        readyBscContractReadback({ verifierKeyHash: HASH_44 }),
        "bsc-verifier-key-hash-readback",
        /key hash/,
      ],
      [
        "missing raw verifier key hash",
        readyBscContractReadback({ verifierKeyHash: undefined }),
        "bsc-verifier-key-hash-readback",
        /key hash/,
      ],
      [
        "bridge network drift",
        readyBscContractReadback({
          bridgeNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
        }),
        "bsc-bridge-network-readback",
        /network id/,
      ],
      [
        "bridge domain drift",
        readyBscContractReadback({ bridgeTargetDomain: 1 }),
        "bsc-bridge-domain-readback",
        /target=1/,
      ],
    ];

    for (const [name, bscContractReadback, checkId, reason] of cases) {
      const report = evaluateBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        chainMetadata: readyChainMetadata,
        capabilities: readyCapabilities,
        manifestSet: { manifests: [readyManifestWithNativeBundle()] },
        bscContractReadback,
      });

      expect(report.ready, name).toBe(false);
      expect(failedText(report, checkId), name).toMatch(reason);
      expect(failedText(report, "bsc-contract-readback"), name).toContain(
        BSC_RPC_URL,
      );
    }
  });

  it("normalizes safe BSC RPC endpoints and rejects credential-bearing endpoints", () => {
    expect(normalizeBscRpcEndpoint(" https://rpc.example.test/path/ ")).toBe(
      "https://rpc.example.test/path",
    );
    expect(
      normalizeBscRpcEndpoint("http://127.0.0.1:8545", {
        allowLocal: true,
      }),
    ).toBe("http://127.0.0.1:8545");
    for (const endpoint of [
      "http://rpc.example.test",
      "https://user:pass@rpc.example.test",
      "https://rpc.example.test?token=secret",
      "https://rpc.example.test/#debug",
    ]) {
      expect(() => normalizeBscRpcEndpoint(endpoint)).toThrow(/BSC RPC URL/u);
    }
  });

  it("fails closed when no taira_bsc_xor manifest is advertised", () => {
    const report = evaluate({
      manifests: [readyManifest({ routeId: "taira_bsc_other" })],
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest")?.detail).toContain(
      "No route manifest matched",
    );
    expect(failedCheck(report, "bsc-route-manifest-unique")?.detail).toContain(
      "found 0",
    );
  });

  it("rejects duplicate public TAIRA/BSC route manifests even when the first manifest is ready", () => {
    const report = evaluate({
      manifests: [
        readyManifestWithNativeBundle(),
        readyManifestWithNativeBundle({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryEvidenceHash: HASH_77,
          },
        }),
      ],
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "bsc-route-manifest-unique")?.detail).toContain(
      "found 2",
    );
    expect(failedCheck(report, "bsc-route-manifest")).toBeUndefined();
  });

  it("rejects unsafe capabilities before considering a BSC route ready", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: readyChainMetadata,
      capabilities: {
        proofSubmitPath: "/v1/bridge/proofs/submit?token=secret",
        messageSubmitPath: "/v1/bridge/messages",
      },
      manifestSet: { manifests: [readyManifest()] },
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "sccp-submit-paths")?.detail).toContain(
      "proof=",
    );
  });

  it("rejects adversarial BSC manifest deployment and binding material", () => {
    const proofHashDriftBase = readyManifestWithNativeBundle();
    const proofHashDriftBundle = nativeProverBundleForManifest(
      proofHashDriftBase,
      {
        proof_artifact_hash: HASH_77,
        native_sdk_artifacts: Object.entries(
          SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
        ).map(([sdk, implementation], index) => ({
          sdk,
          implementation,
          prover_artifact_hash: HASH_77,
          proving_key_hash:
            proofHashDriftBase.destinationRollout.provingKeyHash,
          implementation_artifact: `artifacts/bsc-testnet/${sdk}-implementation.bin`,
          implementation_hash: hex32((0x81 + index).toString(16)),
        })),
      },
    );
    const aliasDriftBase = readyManifestWithNativeBundle();
    const aliasDriftBundle = nativeProverBundleForManifest(aliasDriftBase, {
      audit_hashes: {
        circuit_security_audit: fixtureHash("alias preflight circuit audit"),
        native_implementation_audit: fixtureHash(
          "alias preflight native audit",
        ),
        reproducible_build_attestation: fixtureHash(
          "alias preflight reproducible attestation",
        ),
        cross_sdk_parity: fixtureHash("alias preflight parity"),
        native_prover_self_test: fixtureHash("alias preflight self-test"),
        no_wasm_no_remote_scan: fixtureHash("alias preflight no-wasm scan"),
      },
    });
    const missingVerifierArtifactHash = readyManifestWithNativeBundle();
    delete missingVerifierArtifactHash.nativeEvmProverBundle
      .verifier_key_artifact_hash;
    const missingGroth16ProofSelfTestHash = readyManifestWithNativeBundle();
    delete missingGroth16ProofSelfTestHash.nativeEvmProverBundle
      .groth16_proof_self_test_hash;
    const duplicateVerifierArtifactHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        verifierKeyArtifactHash: VERIFIER_KEY_ARTIFACT_HASH,
      },
    });
    const reusedVerifierArtifactHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        verifier_key_artifact_hash: HASH_22,
      },
    });
    const reusedProofArtifactHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        verifier_key_artifact_hash: HASH_44,
      },
    });
    const reusedProvingKeyHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        verifier_key_artifact_hash: HASH_66,
      },
    });
    const reusedDestinationBindingHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        verifier_key_artifact_hash: HASH_33,
      },
    });
    const reusedGroth16ProofSelfTestHash = readyManifestWithNativeBundle({
      bundleOverrides: {
        groth16_proof_self_test_hash: HASH_44,
      },
    });
    const cases = [
      [
        "missing native prover bundle",
        readyManifest(),
        "bsc-native-evm-prover-bundle",
        /nativeEvmProverBundle is required/,
      ],
      [
        "foreign-chain native prover bundle",
        readyManifestWithNativeBundle({ bundleOverrides: { chain: "eth" } }),
        "bsc-native-evm-prover-bundle",
        /chain must be bsc-testnet/,
      ],
      [
        "native prover bundle proof hash drift",
        {
          ...proofHashDriftBase,
          nativeEvmProverBundle: proofHashDriftBundle,
        },
        "bsc-native-evm-prover-bundle",
        /proofArtifactHash does not match route/,
      ],
      [
        "native prover bundle missing verifier key artifact hash",
        missingVerifierArtifactHash,
        "bsc-native-evm-prover-bundle",
        /verifierKeyArtifactHash is required/,
      ],
      [
        "native prover bundle missing Groth16 proof self-test hash",
        missingGroth16ProofSelfTestHash,
        "bsc-native-evm-prover-bundle",
        /groth16ProofSelfTestHash is required/,
      ],
      [
        "native prover bundle duplicate verifier key artifact hash aliases",
        duplicateVerifierArtifactHash,
        "bsc-native-evm-prover-bundle",
        /verifierKeyArtifactHash must not use multiple aliases/,
      ],
      [
        "native prover bundle verifier artifact hash reuses route verifier hash",
        reusedVerifierArtifactHash,
        "bsc-native-evm-prover-bundle",
        /nativeProverBundle hashes must be role-separated|verifierKeyArtifactHash must be role-separated from verifierKeyHash/,
      ],
      [
        "native prover bundle verifier artifact hash reuses proof artifact hash",
        reusedProofArtifactHash,
        "bsc-native-evm-prover-bundle",
        /nativeProverBundle hashes must be role-separated|verifierKeyArtifactHash must be role-separated from proofArtifactHash|proofArtifactHash must be role-separated from verifierKeyArtifactHash/,
      ],
      [
        "native prover bundle verifier artifact hash reuses proving key hash",
        reusedProvingKeyHash,
        "bsc-native-evm-prover-bundle",
        /nativeProverBundle hashes must be role-separated|verifierKeyArtifactHash must be role-separated from provingKeyHash|provingKeyHash must be role-separated from verifierKeyArtifactHash/,
      ],
      [
        "native prover bundle verifier artifact hash reuses destination binding hash",
        reusedDestinationBindingHash,
        "bsc-native-evm-prover-bundle",
        /nativeProverBundle hashes must be role-separated|verifierKeyArtifactHash must be role-separated from destinationBindingHash|destinationBindingHash must be role-separated from verifierKeyArtifactHash/,
      ],
      [
        "native prover bundle Groth16 proof self-test hash reuses proof artifact hash",
        reusedGroth16ProofSelfTestHash,
        "bsc-native-evm-prover-bundle",
        /nativeProverBundle hashes must be role-separated|groth16ProofSelfTestHash must be role-separated from proofArtifactHash|proofArtifactHash must be role-separated from groth16ProofSelfTestHash/,
      ],
      [
        "native prover bundle alias disagreement",
        {
          ...aliasDriftBase,
          destinationRollout: {
            ...aliasDriftBase.destinationRollout,
            nativeProverBundle: aliasDriftBundle,
          },
        },
        "bsc-native-evm-prover-bundle",
        /aliases disagree/,
      ],
      [
        "same-valued post deploy evidence record aliases",
        readyManifest({
          post_deploy_live_evidence: {
            ...readyManifest().postDeployLiveEvidence,
          },
        }),
        "bsc-record-aliases",
        /postDeployLiveEvidence must not use multiple record aliases/,
      ],
      [
        "same-valued destination binding record aliases",
        readyManifest({
          destination_binding: {
            ...readyManifest().destinationBinding,
          },
        }),
        "bsc-record-aliases",
        /destinationBinding must not use multiple record aliases/,
      ],
      [
        "same-valued route identity aliases",
        readyManifest({
          route_id: "taira_bsc_xor",
        }),
        "bsc-route-identity",
        /route id must not use multiple aliases/,
      ],
      [
        "drifting asset key alias",
        readyManifest({
          asset_id: "wrong",
        }),
        "bsc-route-identity",
        /asset key must not use multiple aliases/,
      ],
      [
        "productionReady string",
        readyManifest({ productionReady: "true" }),
        "bsc-production-ready",
        /boolean true/,
      ],
      [
        "conflicting productionReady aliases",
        readyManifest({ production_ready: false }),
        "bsc-production-ready",
        /productionReady aliases disagree/u,
      ],
      [
        "string production_ready alias",
        readyManifest({
          productionReady: undefined,
          production_ready: "true",
        }),
        "bsc-production-ready",
        /productionReady\.production_ready must be boolean/u,
      ],
      [
        "productionReady with disabled reason",
        readyManifest({
          disabledReason: "operator left this route disabled",
        }),
        "bsc-production-disabled-conflict",
        /disabledReason=operator left this route disabled/,
      ],
      [
        "productionReady with placeholder operator warning",
        readyManifest({
          operatorWarning: "placeholder verifier rollout must not ship",
        }),
        "bsc-production-placeholder-scan",
        /operatorWarning.*placeholder/,
      ],
      [
        "productionReady with explicit placeholder source material marker",
        readyManifest({
          sourceVerifierMaterial: {
            version: 1,
            sourceDomain: 2,
            sourceChain: "bsc",
            sourceProofPlan: "BscValidatorSetReceiptProof",
            placeholder_material: true,
          },
        }),
        "bsc-production-placeholder-scan",
        /placeholder_material=true.*placeholder/,
      ],
      [
        "productionReady with TODO operator handoff",
        readyManifest({
          operatorWarning: "TODO replace verifier material before rollout",
        }),
        "bsc-production-placeholder-scan",
        /operatorWarning.*placeholder/,
      ],
      [
        "productionReady with example evidence note",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            operatorNote: "example verifier evidence must not ship",
          },
        }),
        "bsc-production-placeholder-scan",
        /operatorNote.*placeholder/,
      ],
      [
        "productionReady with nested fixture-only marker",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            fixtureOnlyVerifier: true,
          },
        }),
        "bsc-production-placeholder-scan",
        /fixtureOnlyVerifier.*fixture-only/,
      ],
      [
        "productionReady with nested replace-me field",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            replaceMeVerifierKeyHash: HASH_22,
          },
        }),
        "bsc-production-placeholder-scan",
        /replaceMeVerifierKeyHash.*placeholder/,
      ],
      [
        "productionReady with repeated-byte proof hash",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            proofArtifactHash: hex32("44"),
          },
        }),
        "bsc-production-prover-material",
        /repeated-byte hash/,
      ],
      [
        "productionReady with repeated-byte BSC bridge address",
        readyManifest({
          bscBridgeAddress: "0x1111111111111111111111111111111111111111",
          destinationRollout: {
            ...readyManifest().destinationRollout,
            destinationBridgeAddress:
              "0x1111111111111111111111111111111111111111",
          },
        }),
        "bsc-bridge-address",
        /repeated-byte placeholder material/,
      ],
      [
        "TRON codec",
        readyManifest({ counterpartyAccountCodecKey: "tron_base58check" }),
        "bsc-codec",
        /tron_base58check/,
      ],
      [
        "conflicting BSC domain aliases",
        readyManifest({ counterparty_domain: 3 }),
        "bsc-domain",
        /counterpartyDomain aliases disagree/u,
      ],
      [
        "conflicting BSC codec aliases",
        readyManifest({ counterparty_account_codec_key: "tron_base58check" }),
        "bsc-codec",
        /counterpartyAccountCodecKey aliases disagree/u,
      ],
      [
        "wrong codec id",
        readyManifest({ counterpartyAccountCodec: 5 }),
        "bsc-codec",
        /codecId=5/,
      ],
      [
        "conflicting BSC codec id aliases",
        readyManifest({ counterparty_account_codec: 3 }),
        "bsc-codec",
        /counterpartyAccountCodec aliases disagree/u,
      ],
      [
        "diagnostic verifier flag",
        readyManifest({ diagnosticVerifier: true }),
        "bsc-production-verifier-material",
        /diagnosticVerifier=true/,
      ],
      [
        "known diagnostic verifier key hash",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
        "bsc-production-verifier-material",
        /known diagnostic BSC verifier key hash/,
      ],
      [
        "top-level smoke-test verifier material",
        readyManifest({
          verifierMaterial: {
            alpha1: SMOKE_FIXTURE_G1,
            beta2: SMOKE_FIXTURE_G2,
            gamma2: SMOKE_FIXTURE_G2,
            delta2: SMOKE_FIXTURE_G2,
            ic: SMOKE_FIXTURE_IC,
          },
        }),
        "bsc-production-verifier-material",
        /smoke-test Groth16 fixture/,
      ],
      [
        "rollout smoke-test verifier material",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierMaterial: {
              alpha1: SMOKE_FIXTURE_G1,
              beta2: SMOKE_FIXTURE_G2,
              gamma2: SMOKE_FIXTURE_G2,
              delta2: SMOKE_FIXTURE_G2,
              ic: SMOKE_FIXTURE_IC,
            },
          },
        }),
        "bsc-production-verifier-material",
        /smoke-test Groth16 fixture/,
      ],
      [
        "top-level off-curve alpha1 verifier material",
        readyManifest({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            alpha1: [1, 3],
          },
        }),
        "bsc-production-verifier-material",
        /BN254 G1 curve/,
      ],
      [
        "rollout out-of-field alpha1 verifier material",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1: [BN254_BASE_FIELD_MODULUS, 2],
            },
          },
        }),
        "bsc-production-verifier-material",
        /BN254 field element/,
      ],
      [
        "top-level off-twist beta2 verifier material",
        readyManifest({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            beta2: [1, 2, 3, 4],
          },
        }),
        "bsc-production-verifier-material",
        /BN254 G2 twist curve/,
      ],
      [
        "rollout out-of-field gamma2 verifier material",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
            },
          },
        }),
        "bsc-production-verifier-material",
        /BN254 field element/,
      ],
      [
        "top-level delta2 point at infinity verifier material",
        readyManifest({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            delta2: [0, 0, 0, 0],
          },
        }),
        "bsc-production-verifier-material",
        /G2 point at infinity/,
      ],
      [
        "BSC mainnet network id",
        readyManifest({
          chain: "bsc-mainnet",
          destinationRollout: {
            ...readyManifest().destinationRollout,
            destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
          },
        }),
        "bsc-testnet-network-id",
        /expected=|must target BSC testnet/,
      ],
      [
        "missing production chain id",
        readyManifest({ chainIdHex: undefined }),
        "bsc-testnet-chain-id",
        /<missing>/,
      ],
      [
        "BSC mainnet chain id",
        readyManifest({ chainIdHex: "0x38" }),
        "bsc-testnet-chain-id",
        /0x38/,
      ],
      [
        "conflicting BSC chain id aliases",
        readyManifest({ chain_id_hex: "0x38" }),
        "bsc-testnet-chain-id",
        /chainIdHex aliases disagree/u,
      ],
      [
        "missing production explorer URL",
        readyManifest({ explorerUrl: undefined }),
        "bsc-explorer-binding",
        /explorerUrl=<missing>/,
      ],
      [
        "missing production explorer host",
        readyManifest({ explorerHost: undefined }),
        "bsc-explorer-binding",
        /explorerHost=<missing>/,
      ],
      [
        "BSC mainnet explorer URL",
        readyManifest({ bscExplorerUrl: "https://bscscan.com" }),
        "bsc-explorer-binding",
        /explorerUrl aliases disagree/,
      ],
      [
        "BSC mainnet explorer host",
        readyManifest({ bscExplorerHost: "bscscan.com" }),
        "bsc-explorer-binding",
        /explorerHost aliases disagree/,
      ],
      [
        "missing proof artifact hash",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            proofArtifactHash: undefined,
          },
        }),
        "bsc-production-prover-material",
        /proofArtifactHash is required/,
      ],
      [
        "disabled diagnostic route missing proof hashes",
        readyManifest({
          productionReady: false,
          disabledReason:
            "BSC verifier material is diagnostic and must be replaced before production readiness.",
          destinationRollout: {
            ...readyManifest().destinationRollout,
            proofArtifactHash: undefined,
            provingKeyHash: undefined,
          },
        }),
        "bsc-production-prover-material",
        /proofArtifactHash is required; provingKeyHash is required/,
      ],
      [
        "proving key hash reuses verifier key hash",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            provingKeyHash: HASH_22,
          },
        }),
        "bsc-production-prover-material",
        /provingKeyHash must not equal verifierKeyHash/,
      ],
      [
        "duplicate verifier bridge",
        readyManifest({
          bscVerifierAddress: BSC_BRIDGE_ADDRESS,
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierIdentity: BSC_BRIDGE_ADDRESS,
          },
        }),
        "bsc-contract-addresses-distinct",
        /distinct/,
      ],
      [
        "drifting source bridge aliases",
        readyManifest({ source_bridge_address: BSC_BRIDGE_ADDRESS }),
        "bsc-sourceBridge-address",
        /source bridge address must not use multiple aliases in route manifest/,
      ],
      [
        "same-valued source bridge aliases",
        readyManifest({ sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS }),
        "bsc-sourceBridge-address",
        /source bridge address must not use multiple aliases in route manifest/,
      ],
      [
        "single TRON source bridge alias",
        readyManifest({
          sccpBscSourceBridgeAddress: undefined,
          sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
        }),
        "bsc-sourceBridge-address",
        /source bridge address must not use TRON aliases on a BSC route manifest/,
      ],
      [
        "drifting token aliases",
        readyManifest({ tokenAddress: BSC_BRIDGE_ADDRESS }),
        "bsc-token-address",
        /token address must not use multiple aliases in route manifest/,
      ],
      [
        "same-valued token aliases",
        readyManifest({ tokenAddress: BSC_TOKEN_ADDRESS }),
        "bsc-token-address",
        /token address must not use multiple aliases in route manifest/,
      ],
      [
        "drifting bridge rollout alias",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            destinationBridgeAddress: BSC_TOKEN_ADDRESS,
          },
        }),
        "bsc-bridge-address",
        /bridge address aliases disagree/,
      ],
      [
        "same-valued bridge aliases",
        readyManifest({ bridgeAddress: BSC_BRIDGE_ADDRESS }),
        "bsc-bridge-address",
        /bridge address must not use multiple aliases in route manifest/,
      ],
      [
        "drifting verifier rollout identity",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierIdentity: BSC_BRIDGE_ADDRESS,
          },
        }),
        "bsc-verifier-address",
        /verifier address aliases disagree/,
      ],
      [
        "same-valued verifier aliases",
        readyManifest({ verifierAddress: BSC_VERIFIER_ADDRESS }),
        "bsc-verifier-address",
        /verifier address must not use multiple aliases in route manifest/,
      ],
      [
        "single TRON verifier alias",
        readyManifest({
          bscVerifierAddress: undefined,
          tron_verifier_address: BSC_VERIFIER_ADDRESS,
        }),
        "bsc-verifier-address",
        /verifier address must not use TRON aliases on a BSC route manifest/,
      ],
      [
        "drifting verifier code hash alias",
        readyManifest({ verifierCodeHash: HASH_77 }),
        "bsc-verifierCodeHash",
        /verifier code hash aliases disagree/,
      ],
      [
        "same-valued verifier code hash aliases",
        readyManifest({
          verifierCodeHash: HASH_11,
          verifier_code_hash: HASH_11,
        }),
        "bsc-verifierCodeHash",
        /verifier code hash must not use multiple aliases in route manifest/,
      ],
      [
        "same-valued rollout verifier key hash aliases",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifier_key_hash: HASH_22,
          },
        }),
        "bsc-verifierKeyHash",
        /verifier key hash must not use multiple aliases in route manifest destinationRollout/,
      ],
      [
        "drifting proof artifact hash alias",
        readyManifest({ proofArtifactHash: HASH_77 }),
        "bsc-proofArtifactHash",
        /proof artifact hash aliases disagree/,
      ],
      [
        "same-valued top-level proof artifact hash aliases",
        readyManifest({
          proofArtifactHash: HASH_44,
          proof_artifact_hash: HASH_44,
        }),
        "bsc-proofArtifactHash",
        /proof artifact hash must not use multiple aliases in route manifest/,
      ],
      [
        "same-valued rollout proving key hash aliases",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            proving_key_hash: HASH_66,
          },
        }),
        "bsc-provingKeyHash",
        /proving key hash must not use multiple aliases in route manifest destinationRollout/,
      ],
      [
        "same-valued native EVM prover bundle hash aliases",
        readyManifestWithNativeBundle({
          nativeEvmProverBundleHash: hex32("99"),
          native_evm_prover_bundle_hash: hex32("99"),
        }),
        "bsc-native-evm-prover-bundle-hash",
        /native EVM prover bundle hash must not use multiple aliases in route manifest/,
      ],
      [
        "generic native proof artifact extension",
        readyManifestWithNativeBundle({
          bundleOverrides: {
            proof_artifact: "artifacts/bsc-testnet/proof-artifact.bin",
          },
        }),
        "bsc-native-evm-prover-bundle",
        /proofArtifact must reference a \.r1cs artifact/,
      ],
      [
        "generic native proving key extension",
        readyManifestWithNativeBundle({
          bundleOverrides: {
            proving_key: "artifacts/bsc-testnet/proving-key.bin",
          },
        }),
        "bsc-native-evm-prover-bundle",
        /provingKey must reference a \.zkey artifact/,
      ],
      [
        "drifting destination binding hash alias",
        readyManifest({ destinationBindingHash: HASH_77 }),
        "bsc-destinationBindingHash",
        /destination binding hash aliases disagree/,
      ],
      [
        "same-valued destination binding hash aliases",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            binding_hash: HASH_33,
          },
        }),
        "bsc-destinationBindingHash",
        /destination binding hash must not use multiple aliases in route manifest destinationBinding/,
      ],
      [
        "drifting destination binding key alias",
        readyManifest({ destinationBindingKey: "stale-binding-key" }),
        "bsc-destination-binding",
        /destination binding key aliases disagree/,
      ],
      [
        "same-valued destination binding key aliases",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            bindingKey: BSC_BINDING_KEY,
          },
        }),
        "bsc-destination-binding",
        /destination binding key must not use multiple aliases in route manifest destinationBinding/,
      ],
      [
        "leaked recovery phrase in route metadata",
        readyManifest({ operatorNotes: VALID_MNEMONIC }),
        "bsc-manifest-secret-scan",
        /secret-like material/,
      ],
      [
        "forged binding key",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            key: BSC_BINDING_KEY.replace(BSC_BRIDGE_ADDRESS, BSC_TOKEN_ADDRESS),
          },
        }),
        "bsc-destination-binding",
        /destination binding key aliases disagree|version=1/,
      ],
      [
        "malformed binding hash",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            bindingHash: "0x1234",
          },
        }),
        "bsc-destination-binding",
        /binding hash.*32-byte|version=1/,
      ],
      [
        "wrong binding target",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            targetDomain: 5,
          },
        }),
        "bsc-destination-binding",
        /target=5/,
      ],
      [
        "conflicting binding source-domain aliases",
        readyManifest({
          destinationBinding: {
            ...readyManifest().destinationBinding,
            source_domain: 2,
          },
        }),
        "bsc-destination-binding",
        /source domain aliases disagree/u,
      ],
      [
        "conflicting binding rollout target domain",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            targetDomain: 3,
          },
        }),
        "bsc-destination-binding",
        /target domain aliases disagree/u,
      ],
      [
        "conflicting binding rollout version",
        readyManifest({
          destinationRollout: {
            ...readyManifest().destinationRollout,
            version: 2,
          },
        }),
        "bsc-destination-binding",
        /version aliases disagree/u,
      ],
      [
        "missing offline full TOML hash",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            offlineFullTomlSha256: undefined,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /offlineFullTomlSha256 is required/,
      ],
      [
        "claimed full TOML ready without hash on disabled diagnostic route",
        readyManifest({
          productionReady: false,
          disabledReason:
            "BSC verifier material is diagnostic and must be replaced before production readiness.",
          destinationRollout: {
            ...readyManifest().destinationRollout,
            verifierKeyHash:
              "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
          },
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            fullTomlReady: true,
            offlineFullTomlSha256: undefined,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /offlineFullTomlSha256 is required/,
      ],
      [
        "zero route canary tx",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryTransactionId: "0x" + "00".repeat(32),
          },
        }),
        "bsc-post-deploy-live-evidence",
        /routeCanaryTransactionId.*non-zero/,
      ],
      [
        "drifting full TOML readiness alias",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            full_toml_ready: false,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /fullTomlReady aliases disagree/,
      ],
      [
        "drifting source bridge config hash alias",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            source_bridge_config_hash: HASH_77,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /sourceBridgeConfigHash aliases disagree/,
      ],
      [
        "drifting source event explorer URL alias",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            sourceEventTransactionUrl: ROUTE_CANARY_EXPLORER_URL,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /sourceEventExplorerUrl|transaction hash/,
      ],
      [
        "reused source and canary evidence hash",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryEvidenceHash: HASH_44,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /sourceBridgeConfigHash and routeCanaryEvidenceHash must be distinct/,
      ],
      [
        "reused source and canary transaction id",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryTransactionId: HASH_55,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /sourceEventTransactionId and routeCanaryTransactionId must be distinct/,
      ],
      [
        "missing source event explorer URL",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            sourceEventExplorerUrl: "",
          },
        }),
        "bsc-post-deploy-live-evidence",
        /sourceEventExplorerUrl is required/,
      ],
      [
        "missing route canary explorer URL",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryExplorerUrl: "",
          },
        }),
        "bsc-post-deploy-live-evidence",
        /routeCanaryExplorerUrl is required/,
      ],
      [
        "mainnet source event explorer URL",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://bscscan.com/tx/${HASH_55}`,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /BSC testnet explorer/,
      ],
      [
        "route canary explorer URL with query",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            routeCanaryExplorerUrl: `${ROUTE_CANARY_EXPLORER_URL}?utm=proof`,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /query strings/,
      ],
      [
        "source event explorer hash mismatch",
        readyManifest({
          postDeployLiveEvidence: {
            ...readyManifest().postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_77}`,
          },
        }),
        "bsc-post-deploy-live-evidence",
        /transaction hash must match/,
      ],
      [
        "malformed burn artifact",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            contractArtifactB64: "not base64!",
          },
        }),
        "taira-burn-record-material",
        /base64/,
      ],
      [
        "placeholder burn artifact",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            contractArtifactB64: Buffer.from("Nrt0").toString("base64"),
            artifactSha256: `0x${createHash("sha256")
              .update(Buffer.from("Nrt0"))
              .digest("hex")}`,
          },
        }),
        "taira-burn-record-material",
        /32-/,
      ],
      [
        "repeated production burn artifact",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            contractArtifactB64: Buffer.alloc(512, 7).toString("base64"),
            artifactSha256: `0x${createHash("sha256")
              .update(Buffer.alloc(512, 7))
              .digest("hex")}`,
          },
        }),
        "taira-burn-record-material",
        /placeholder burn-record material.*repeated/u,
      ],
      [
        "oversized burn artifact",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            contractArtifactB64: Buffer.alloc(
              SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES + 1,
              1,
            ).toString("base64"),
          },
        }),
        "taira-burn-record-material",
        new RegExp(`-${SCCP_BSC_BURN_RECORD_ARTIFACT_MAX_BYTES} bytes`, "u"),
      ],
      [
        "mismatched burn artifact sha",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            artifactSha256: HASH_77,
          },
        }),
        "taira-burn-record-material",
        /artifactSha256 does not match/,
      ],
      [
        "missing burn artifact sha",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            artifactSha256: undefined,
          },
        }),
        "taira-burn-record-material",
        /artifactSha256/,
      ],
      [
        "settlement alias",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            settlementAssetDefinitionId: "xor#universal",
          },
        }),
        "taira-burn-record-material",
        /canonical Base58 asset definition id/,
      ],
      [
        "malformed settlement asset",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            settlementAssetDefinitionId: "0OIl-not-base58",
          },
        }),
        "taira-burn-record-material",
        /canonical Base58 asset definition id/,
      ],
      [
        "incomplete vk ref",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            vkRef: {
              backend: "groth16-bn254",
            },
          },
        }),
        "taira-burn-record-material",
        /vkRef backend and name/,
      ],
      [
        "invalid burn gas limit",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            gasLimit: "1.5",
          },
        }),
        "taira-burn-record-material",
        /gasLimit must be a positive safe integer/,
      ],
      [
        "non-finite burn gas limit",
        readyManifest({
          tairaXorBurnRecord: {
            ...readyManifest().tairaXorBurnRecord,
            gasLimit: Number.POSITIVE_INFINITY,
          },
        }),
        "taira-burn-record-material",
        /gasLimit must be a positive safe integer/,
      ],
    ];

    for (const [name, manifest, checkId, reason] of cases) {
      const report = evaluate({ manifests: [manifest] });
      expect(report.ready, name).toBe(false);
      expect(failedText(report, checkId), name).toMatch(reason);
    }
  });

  it("redacts secret-like BSC manifest fields from preflight reports", () => {
    const assignmentSecret =
      "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
    const bearerToken = "Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l";
    const report = evaluate({
      manifests: [
        readyManifest({
          deployment: {
            privateKey: "do-not-serialize",
            apiKey: "do-not-serialize-api-key",
          },
          operatorNotes: VALID_MNEMONIC,
          auditNotes: [
            `operator privateKey=0x${assignmentSecret}`,
            `accessToken=0x${assignmentSecret}`,
            `operator pasted ${bearerToken}`,
          ],
        }),
      ],
    });

    expect(report.ready).toBe(false);
    expect(failedText(report, "bsc-manifest-secret-scan")).toContain(
      "secret-like material",
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("privateKey");
    expect(serialized).not.toContain("apiKey");
    expect(serialized).not.toContain("do-not-serialize");
    expect(serialized).not.toContain("do-not-serialize-api-key");
    expect(serialized).not.toContain("operatorNotes");
    expect(serialized).not.toContain("abandon abandon");
    expect(serialized).not.toContain("privateKey=");
    expect(serialized).not.toContain("accessToken=");
    expect(serialized).not.toContain(assignmentSecret);
    expect(serialized).not.toContain("Bearer");
    expect(serialized).not.toContain("mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l");
  });

  it("fails closed when the endpoint metadata is not TAIRA", () => {
    const report = evaluateBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      chainMetadata: {
        chainId: "00000000-0000-0000-0000-000000000000",
        networkPrefix: 753,
      },
      capabilities: readyCapabilities,
      manifestSet: { manifests: [readyManifest()] },
    });

    expect(report.ready).toBe(false);
    expect(failedText(report, "taira-network")).toContain(
      "00000000-0000-0000-0000-000000000000 / 753",
    );
  });

  it("fetches and decodes BSC contract readback through read-only JSON-RPC calls", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({
        href: String(url),
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      const body = JSON.parse(String(init?.body ?? "{}"));
      const [firstParam] = body.params ?? [];
      const to = String(firstParam?.to ?? "").toLowerCase();
      const data = String(firstParam?.data ?? "").toLowerCase();
      let result = "0x";
      if (body.method === "eth_chainId") {
        result = BSC_TESTNET_CHAIN_ID_HEX;
      } else if (body.method === "eth_getCode") {
        result = "0x60016000";
      } else if (body.method === "eth_call" && to === BSC_TOKEN_ADDRESS) {
        if (data === EVM_SELECTORS.bridge) {
          result = abiAddress(BSC_BRIDGE_ADDRESS);
        } else if (data === EVM_SELECTORS.bridgeLocked) {
          result = abiBool(true);
        }
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

    const readback = await fetchBscContractReadback({
      manifest: readyManifest(),
      rpcUrl: BSC_RPC_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(readback).toEqual(readyBscContractReadback());
    expect(calls.every((call) => call.method === "POST")).toBe(true);
    expect(calls.map((call) => call.body.method)).toEqual([
      "eth_chainId",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
      "eth_getCode",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
      "eth_call",
    ]);
  });

  it("does not execute accessor-backed contract readback option fields before RPC", async () => {
    const manifestGetter = vi.fn(() => readyManifest());
    const fetchImpl = vi.fn();
    const options = {
      rpcUrl: BSC_RPC_URL,
      fetchImpl,
      timeoutMs: 1000,
    };
    Object.defineProperty(options, "manifest", {
      configurable: true,
      enumerable: true,
      get: manifestGetter,
    });

    await expect(fetchBscContractReadback(options)).rejects.toThrow(
      /bridge address/u,
    );
    expect(manifestGetter).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("runs metadata, capability, and manifest checks as read-only GET requests", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const href = String(url);
      calls.push({ href, method: init?.method });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifestWithNativeBundle()] });
      }
      return new Response("{}", { status: 404 });
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(report.ready).toBe(true);
    expect(report.bsc).toMatchObject({
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(calls.every((call) => call.method === "GET")).toBe(true);
    expect(calls.map((call) => new URL(call.href).pathname)).toEqual([
      "/v1/chain/metadata",
      "/v1/sccp/capabilities",
      "/v1/sccp/manifests",
    ]);
  });

  it("reports malformed remote manifest arrays without silently dropping entries", async () => {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({
          manifests: [readyManifestWithNativeBundle(), false],
        });
      }
      return new Response("{}", { status: 404 });
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(report.ready).toBe(false);
    expect(report.manifestSource).toBe("torii");
    expect(failedCheck(report, "bsc-route-manifest-shape")).toMatchObject({
      detail: "manifests[1] must be an object.",
    });
    expect(failedCheck(report, "bsc-route-manifest-unique")).toBeUndefined();
  });

  it("rejects oversized remote SCCP capabilities before parsing route readiness", async () => {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(4 * 1024 * 1024 + 1),
          },
        });
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifestWithNativeBundle()] });
      }
      throw new Error(`unexpected fetch: ${href}`);
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(report.ready).toBe(false);
    expect(report.errors.capabilities).toMatch(/maximum allowed/u);
  });

  it("rejects oversized remote SCCP manifests before parsing route evidence", async () => {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return new Response(
          JSON.stringify({
            manifests: [],
            padding: "x".repeat(4 * 1024 * 1024),
          }),
          { headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected fetch: ${href}`);
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
    });

    expect(report.ready).toBe(false);
    expect(report.errors.manifests).toMatch(/exceeds/u);
    expect(report.deployment).toBeNull();
  });

  it("rejects non-object remote SCCP JSON evidence", async () => {
    const cases = [
      {
        endpoint: "/v1/sccp/capabilities",
        errorKey: "capabilities",
      },
      {
        endpoint: "/v1/sccp/manifests",
        errorKey: "manifests",
      },
    ];

    for (const { endpoint, errorKey } of cases) {
      const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith("/v1/chain/metadata")) {
          return Response.json(readyChainMetadata);
        }
        if (href.endsWith("/v1/sccp/capabilities")) {
          return href.endsWith(endpoint)
            ? Response.json([])
            : Response.json(readyCapabilities);
        }
        if (href.endsWith("/v1/sccp/manifests")) {
          return href.endsWith(endpoint)
            ? Response.json([])
            : Response.json({ manifests: [readyManifestWithNativeBundle()] });
        }
        throw new Error(`unexpected fetch: ${href}`);
      };

      const report = await runBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        fetchImpl,
        timeoutMs: 1000,
      });

      expect(report.ready, errorKey).toBe(false);
      expect(report.errors[errorKey], errorKey).toMatch(/JSON object/u);
    }
  });

  it("rejects duplicate JSON object keys in remote SCCP evidence", async () => {
    const cases = [
      {
        endpoint: "/v1/sccp/capabilities",
        errorKey: "capabilities",
        duplicateJson: duplicateCapabilitiesJson(),
      },
      {
        endpoint: "/v1/sccp/manifests",
        errorKey: "manifests",
        duplicateJson: duplicateBscNetworkManifestSetJson(),
      },
    ];

    for (const { endpoint, errorKey, duplicateJson } of cases) {
      const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith("/v1/chain/metadata")) {
          return Response.json(readyChainMetadata);
        }
        if (href.endsWith("/v1/sccp/capabilities")) {
          return href.endsWith(endpoint)
            ? new Response(duplicateJson, {
                headers: { "content-type": "application/json" },
              })
            : Response.json(readyCapabilities);
        }
        if (href.endsWith("/v1/sccp/manifests")) {
          return href.endsWith(endpoint)
            ? new Response(duplicateJson, {
                headers: { "content-type": "application/json" },
              })
            : Response.json({ manifests: [readyManifestWithNativeBundle()] });
        }
        throw new Error(`unexpected fetch: ${href}`);
      };

      const report = await runBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        fetchImpl,
        timeoutMs: 1000,
      });

      expect(report.ready, errorKey).toBe(false);
      expect(report.errors[errorKey], errorKey).toMatch(
        /duplicate JSON object key/u,
      );
      expect(JSON.stringify(report), errorKey).not.toContain("shadow-submit");
      expect(JSON.stringify(report), errorKey).not.toContain("mainnet");
    }
  });

  it("rejects symlinked local manifest files before parsing route evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-preflight-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-preflight-outside-"),
    );
    const target = path.join(outside, "manifest.json");
    const link = path.join(dir, "manifest.json");
    await writeFile(
      target,
      `${JSON.stringify({ manifests: [readyManifestWithNativeBundle()] })}\n`,
      "utf8",
    );
    await symlink(target, link);

    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      throw new Error(`unexpected fetch: ${href}`);
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
      manifestFile: link,
    });

    expect(report.ready).toBe(false);
    expect(report.manifestSource).toBe("file");
    expect(report.errors.manifests).toMatch(/symbolic link/u);
    expect(report.deployment).toBeNull();
  });

  it("rejects oversized local manifest files before parsing route evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-preflight-"));
    try {
      const manifestFile = path.join(dir, "manifest.json");
      await writeFile(
        manifestFile,
        JSON.stringify({ manifests: [], padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith("/v1/chain/metadata")) {
          return Response.json(readyChainMetadata);
        }
        if (href.endsWith("/v1/sccp/capabilities")) {
          return Response.json(readyCapabilities);
        }
        throw new Error(`unexpected fetch: ${href}`);
      };

      const report = await runBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        fetchImpl,
        timeoutMs: 1000,
        manifestFile,
      });

      expect(report.ready).toBe(false);
      expect(report.manifestSource).toBe("file");
      expect(report.errors.manifests).toMatch(/maximum allowed/u);
      expect(report.deployment).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects duplicate JSON object keys in local manifest files before validation", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-preflight-"));
    try {
      const manifestFile = path.join(dir, "manifest.json");
      await writeFile(
        manifestFile,
        duplicateBscNetworkManifestSetJson(),
        "utf8",
      );

      const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith("/v1/chain/metadata")) {
          return Response.json(readyChainMetadata);
        }
        if (href.endsWith("/v1/sccp/capabilities")) {
          return Response.json(readyCapabilities);
        }
        throw new Error(`unexpected fetch: ${href}`);
      };

      const report = await runBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        fetchImpl,
        timeoutMs: 1000,
        manifestFile,
      });

      expect(report.ready).toBe(false);
      expect(report.manifestSource).toBe("file");
      expect(report.errors.manifests).toMatch(/duplicate JSON object key/u);
      expect(report.deployment).toBeNull();
      expect(JSON.stringify(report)).not.toContain("mainnet");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects non-object local manifest JSON before parsing route evidence", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-preflight-"));
    try {
      const manifestFile = path.join(dir, "manifest.json");
      await writeFile(manifestFile, JSON.stringify([]), "utf8");

      const fetchImpl = async (url) => {
        const href = String(url);
        if (href.endsWith("/v1/chain/metadata")) {
          return Response.json(readyChainMetadata);
        }
        if (href.endsWith("/v1/sccp/capabilities")) {
          return Response.json(readyCapabilities);
        }
        throw new Error(`unexpected fetch: ${href}`);
      };

      const report = await runBscSccpRoutePreflight({
        toriiUrl: TORII_URL,
        fetchImpl,
        timeoutMs: 1000,
        manifestFile,
      });

      expect(report.ready).toBe(false);
      expect(report.manifestSource).toBe("file");
      expect(report.errors.manifests).toMatch(/JSON object/u);
      expect(report.deployment).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("layers optional BSC contract readback onto route preflight without write calls", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      const href = String(url);
      calls.push({
        href,
        method: init?.method,
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifestWithNativeBundle()] });
      }
      const body = JSON.parse(String(init?.body ?? "{}"));
      const [firstParam] = body.params ?? [];
      const to = String(firstParam?.to ?? "").toLowerCase();
      const data = String(firstParam?.data ?? "").toLowerCase();
      let result = "0x60016000";
      if (body.method === "eth_chainId") {
        result = BSC_TESTNET_CHAIN_ID_HEX;
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

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
      checkBscContracts: true,
      bscRpcUrl: BSC_RPC_URL,
    });

    expect(report.ready).toBe(true);
    expect(report.bsc).toMatchObject({
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: "bsc-contract-readback",
        ok: true,
      }),
    );
    expect(calls.every((call) => ["GET", "POST"].includes(call.method))).toBe(
      true,
    );
    expect(calls.some((call) => call.href.includes("/wallet/broadcast"))).toBe(
      false,
    );
    expect(calls.filter((call) => call.method === "POST")).toHaveLength(16);
  });

  it("rejects oversized BSC JSON-RPC readback responses", async () => {
    const fetchImpl = async (url) => {
      const href = String(url);
      if (href.endsWith("/v1/chain/metadata")) {
        return Response.json(readyChainMetadata);
      }
      if (href.endsWith("/v1/sccp/capabilities")) {
        return Response.json(readyCapabilities);
      }
      if (href.endsWith("/v1/sccp/manifests")) {
        return Response.json({ manifests: [readyManifestWithNativeBundle()] });
      }
      if (href === BSC_RPC_URL) {
        return new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(4 * 1024 * 1024 + 1),
          },
        });
      }
      throw new Error(`unexpected fetch: ${href}`);
    };

    const report = await runBscSccpRoutePreflight({
      toriiUrl: TORII_URL,
      fetchImpl,
      timeoutMs: 1000,
      checkBscContracts: true,
      bscRpcUrl: BSC_RPC_URL,
    });

    expect(report.ready).toBe(false);
    expect(report.errors.bscContracts).toMatch(/maximum allowed/u);
    expect(failedText(report, "bsc-contract-readback")).toContain(
      "maximum allowed",
    );
  });
});
