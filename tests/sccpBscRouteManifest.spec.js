import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import {
  SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
  SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
} from "@iroha/iroha-js/sccp";
import {
  BSC_TESTNET_NETWORK_ID_HEX,
  SCCP_BSC_DIAGNOSTIC_VERIFIER_KEY_HASHES,
  SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_HASH_MODE,
  SCCP_BSC_ROUTE_MANIFEST_SCHEMA,
  bscDestinationBindingHash,
  bscDestinationBindingKey,
  buildBscRouteManifestDraft,
  defaultBscRouteManifestOut,
} from "../scripts/e2e/sccp-bsc-route-manifest.mjs";

const hex32 = (byte) => `0x${byte.repeat(32)}`;
const textEncoder = new TextEncoder();
const fixtureHash = (label) =>
  `0x${Buffer.from(sha256(textEncoder.encode(label))).toString("hex")}`;
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc route manifest bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc route manifest token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc route manifest source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc route manifest verifier");
const HASH_11 = fixtureHash("bsc route manifest fixture hash 11");
const HASH_22 = fixtureHash("bsc route manifest fixture hash 22");
const HASH_33 = fixtureHash("bsc route manifest fixture hash 33");
const HASH_44 = fixtureHash("bsc route manifest fixture hash 44");
const HASH_55 = fixtureHash("bsc route manifest fixture hash 55");
const HASH_66 = fixtureHash("bsc route manifest fixture hash 66");
const HASH_77 = fixtureHash("bsc route manifest fixture hash 77");
const HASH_88 = fixtureHash("bsc route manifest fixture hash 88");
const GROTH16_PROOF_SELF_TEST_HASH = fixtureHash(
  "bsc route manifest Groth16 proof self-test report",
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
const SOURCE_EVENT_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_44}`;
const ROUTE_CANARY_EXPLORER_URL = `https://testnet.bscscan.com/tx/${HASH_66}`;
const ARTIFACT_BYTES = Uint8Array.from(
  { length: 768 },
  (_, index) => (0x41 + index * 37 + (index >> 3)) & 0xff,
);
const ARTIFACT_B64 = Buffer.from(ARTIFACT_BYTES).toString("base64");
const ARTIFACT_SHA256 = `0x${Buffer.from(sha256(ARTIFACT_BYTES)).toString(
  "hex",
)}`;
const REPEATED_ARTIFACT_BYTES = Uint8Array.from(Buffer.alloc(512, 7));
const SETTLEMENT_ASSET = "6TEAJqbb8oEPmLncoNiMRbLEK6tw";
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const PRIVATE_KEY_PEM = [
  "-----BEGIN PRIVATE KEY-----",
  "MC4CAQAwBQYDK2VwBCIEIAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  "-----END PRIVATE KEY-----",
].join("\n");
const BSC_MAINNET_NETWORK_ID_HEX =
  "0x0000000000000000000000000000000000000000000000000000000000000038";
const repoRoot = path.resolve(".");
const execFileAsync = promisify(execFile);

const bindingHash = (networkId = BSC_TESTNET_NETWORK_ID_HEX) =>
  bscDestinationBindingHash({
    networkId,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: HASH_11,
    verifierKeyHash: HASH_22,
  });

const bindingKey = (networkId = BSC_TESTNET_NETWORK_ID_HEX) =>
  bscDestinationBindingKey({
    networkId,
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: HASH_11,
    verifierKeyHash: HASH_22,
  });

const diagnosticBindingHash = () =>
  bscDestinationBindingHash({
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: HASH_11,
    verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
  });

const diagnosticBindingKey = () =>
  bscDestinationBindingKey({
    verifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeAddress: BSC_BRIDGE_ADDRESS,
    verifierCodeHash: HASH_11,
    verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
  });

const readyEvidence = (overrides = {}) => ({
  routeId: "taira_bsc_xor",
  assetKey: "xor",
  bscBridgeAddress: BSC_BRIDGE_ADDRESS,
  bscTokenAddress: BSC_TOKEN_ADDRESS,
  sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
  bscVerifierAddress: BSC_VERIFIER_ADDRESS,
  destinationRollout: {
    verifierCodeHash: HASH_11,
    verifierKeyHash: HASH_22,
    proofArtifactHash: HASH_44,
    provingKeyHash: HASH_66,
    destinationBindingHash: bindingHash(),
    destinationBindingKey: bindingKey(),
  },
  bscContractReadback: {
    chainIdHex: "0x61",
    codePresent: {
      token: true,
      bridge: true,
      sourceBridge: true,
      verifier: true,
    },
    tokenBridgeAddress: BSC_BRIDGE_ADDRESS,
    tokenBridgeLocked: true,
    sourceBridgeOwner: BSC_BRIDGE_ADDRESS,
    bridgeDestinationBindingHash: bindingHash(),
    bridgeVerifierAddress: BSC_VERIFIER_ADDRESS,
    bridgeVerifierCodeHash: HASH_11,
    bridgeVerifierKeyHash: HASH_22,
    verifierKeyHash: HASH_22,
    bridgeNetworkId:
      "0x0000000000000000000000000000000000000000000000000000000000000061",
    bridgeSourceDomain: 0,
    bridgeTargetDomain: 2,
  },
  postDeployLiveEvidence: {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_33,
    sourceEventTransactionId: HASH_44,
    sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
    routeCanaryEvidenceHash: HASH_55,
    routeCanaryTransactionId: HASH_66,
    routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    offlineFullTomlSha256: HASH_77,
  },
  ...overrides,
});

const readyMainnetEvidence = (overrides = {}) => {
  const destinationBindingHash = bindingHash(BSC_MAINNET_NETWORK_ID_HEX);
  const destinationBindingKey = bindingKey(BSC_MAINNET_NETWORK_ID_HEX);
  return readyEvidence({
    bscNetwork: "mainnet",
    chain: "bsc-mainnet",
    chainIdHex: "0x38",
    networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    explorerUrl: "https://bscscan.com",
    explorerHost: "bscscan.com",
    destinationRollout: {
      ...readyEvidence().destinationRollout,
      destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
      destinationBindingHash,
      destinationBindingKey,
    },
    bscContractReadback: {
      ...readyEvidence().bscContractReadback,
      chainIdHex: "0x38",
      bridgeNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
      bridgeDestinationBindingHash: destinationBindingHash,
    },
    postDeployLiveEvidence: undefined,
    ...overrides,
  });
};

const nativeProverBundleForEvidence = (evidence, overrides = {}) => ({
  schema: SCCP_NATIVE_EVM_PROVER_BUNDLE_SCHEMA_V1,
  bundle_id: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
  domain: 2,
  chain: "bsc-testnet",
  proof_backend: SCCP_EVM_GROTH16_BN254_PROOF_BACKEND_V1,
  proof_artifact: "artifacts/bsc-testnet/proof-artifact.r1cs",
  proof_artifact_hash: evidence.destinationRollout.proofArtifactHash,
  proving_key: "artifacts/bsc-testnet/proving-key.zkey",
  proving_key_hash: evidence.destinationRollout.provingKeyHash,
  verifier_key: "artifacts/bsc-testnet/verifier-key.json",
  verifier_key_hash: evidence.destinationRollout.verifierKeyHash,
  verifier_key_artifact_hash: HASH_88,
  destination_binding_hash: bindingHash(),
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
    prover_artifact_hash: evidence.destinationRollout.proofArtifactHash,
    proving_key_hash: evidence.destinationRollout.provingKeyHash,
    implementation_artifact: `artifacts/bsc-testnet/${sdk}-implementation.bin`,
    implementation_hash: hex32((0x81 + index).toString(16)),
  })),
  audit_hashes: {
    circuit_security_audit: fixtureHash("route manifest circuit audit"),
    native_implementation_audit: fixtureHash("route manifest native audit"),
    reproducible_build_attestation: fixtureHash(
      "route manifest reproducible attestation",
    ),
    cross_sdk_parity: fixtureHash("route manifest parity"),
    native_prover_self_test: fixtureHash("route manifest self-test"),
    no_wasm_no_remote_scan: fixtureHash("route manifest no-wasm scan"),
  },
  ...overrides,
});

const readyContract = (overrides = {}) => ({
  artifact_b64: ARTIFACT_B64,
  artifact_sha256: ARTIFACT_SHA256,
  code_hash: HASH_33,
  vkRef: {
    backend: "halo2/ipa",
    name: "taira_bsc_xor_burn_record_v1",
  },
  ...overrides,
});

const generatedOfflineFullTomlEvidence = (overrides = {}) => ({
  schema: "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1",
  routeId: "taira_bsc_xor",
  assetKey: "xor",
  bscNetwork: "testnet",
  chain: "bsc-testnet",
  chainIdHex: "0x61",
  networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
  fullTomlReady: true,
  offlineFullTomlSha256: HASH_88,
  hashMode: SCCP_BSC_OFFLINE_FULL_TOML_EVIDENCE_HASH_MODE,
  hashInputSha256: HASH_88,
  renderedTomlSha256: HASH_77,
  routeManifestPath: "output/sccp-bsc-deploy/pre-offline-route.manifest.json",
  fullConfigPath: "output/sccp-bsc-deploy/full-taira-config.toml",
  postDeployLiveEvidence: {
    fullTomlReady: true,
    offlineFullTomlSha256: HASH_88,
  },
  ...overrides,
});

const build = (
  options = {},
  evidence = readyEvidence(),
  contract = readyContract(),
  offlineFullTomlEvidence = null,
) => {
  const {
    "skip-native-prover-bundle": skipNativeProverBundle,
    ...normalizedOptions
  } = options;
  const productionReady = normalizedOptions["production-ready"] === "true";
  return buildBscRouteManifestDraft({
    options: {
      "settlement-asset-definition-id": SETTLEMENT_ASSET,
      ...normalizedOptions,
      ...(productionReady &&
      !skipNativeProverBundle &&
      !normalizedOptions.nativeEvmProverBundle
        ? { nativeEvmProverBundle: nativeProverBundleForEvidence(evidence) }
        : {}),
    },
    evidence,
    tairaContract: contract,
    offlineFullTomlEvidence,
    createdAt: "2026-06-05T00:00:00.000Z",
  });
};

describe("BSC SCCP route manifest input shape", () => {
  it("does not invoke accessor-backed destination binding option fields", () => {
    const getters = new Map(
      [
        "networkId",
        "verifierAddress",
        "bridgeAddress",
        "verifierCodeHash",
        "verifierKeyHash",
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

    expect(() => bscDestinationBindingHash(options)).toThrow(
      /BSC verifier address/u,
    );
    expect(() => bscDestinationBindingKey(options)).toThrow(
      /BSC verifier address/u,
    );
    for (const getter of getters.values()) {
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("does not invoke accessor-backed top-level route manifest option fields", async () => {
    const getters = new Map(
      [
        "options",
        "evidence",
        "tairaContract",
        "offlineFullTomlEvidence",
        "createdAt",
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

    await expect(buildBscRouteManifestDraft(input)).rejects.toThrow(
      /BSC deployment evidence must be an object/u,
    );
    for (const getter of getters.values()) {
      expect(getter).not.toHaveBeenCalled();
    }
  });

  it("rejects inherited deployment evidence fields before manifest generation", async () => {
    const pollutedEvidence = Object.create(readyEvidence());

    await expect(
      build(
        {
          "production-ready": "true",
          nativeEvmProverBundle: nativeProverBundleForEvidence(readyEvidence()),
        },
        pollutedEvidence,
      ),
    ).rejects.toThrow(/BSC deployment evidence must be an object/u);
  });

  it("rejects inherited TAIRA burn-record contract fields before manifest generation", async () => {
    const pollutedContract = Object.create(readyContract());

    await expect(
      build(
        {
          "production-ready": "true",
          nativeEvmProverBundle: nativeProverBundleForEvidence(readyEvidence()),
        },
        readyEvidence(),
        pollutedContract,
      ),
    ).rejects.toThrow(/TAIRA burn-record contract must be an object/u);
  });

  it("ignores Object.prototype deployment evidence fields before manifest generation", async () => {
    const inheritedEvidence = readyEvidence();
    const pollutedKeys = [
      "routeId",
      "assetKey",
      "bscBridgeAddress",
      "bscTokenAddress",
      "sccpBscSourceBridgeAddress",
      "bscVerifierAddress",
      "settlementAssetDefinitionId",
    ].map((key) => [key, inheritedEvidence[key]]);
    const previousDescriptors = new Map(
      pollutedKeys.map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );
    const evidence = {
      destinationRollout: inheritedEvidence.destinationRollout,
      bscContractReadback: inheritedEvidence.bscContractReadback,
      postDeployLiveEvidence: inheritedEvidence.postDeployLiveEvidence,
    };

    try {
      for (const [key, value] of pollutedKeys) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      await expect(
        build(
          {
            "production-ready": "true",
            nativeEvmProverBundle:
              nativeProverBundleForEvidence(inheritedEvidence),
          },
          evidence,
        ),
      ).rejects.toThrow(/routeId is required in BSC deployment evidence/u);
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

  it("does not invoke accessor-backed deployment evidence fields", async () => {
    const routeIdGetter = vi.fn(() => "taira_bsc_xor");
    const evidence = readyEvidence();
    Object.defineProperty(evidence, "routeId", {
      configurable: true,
      enumerable: true,
      get: routeIdGetter,
    });

    await expect(build({}, evidence)).rejects.toThrow(
      /routeId is required in BSC deployment evidence/u,
    );
    expect(routeIdGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed nested deployment evidence records", async () => {
    const rolloutGetter = vi.fn(() => readyEvidence().destinationRollout);
    const evidence = readyEvidence();
    Object.defineProperty(evidence, "destinationRollout", {
      configurable: true,
      enumerable: true,
      get: rolloutGetter,
    });

    await expect(build({}, evidence)).rejects.toThrow(
      /BSC verifier code hash is required/u,
    );
    expect(rolloutGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed TAIRA burn-record contract fields", async () => {
    const artifactGetter = vi.fn(() => ARTIFACT_B64);
    const contract = readyContract();
    Object.defineProperty(contract, "artifact_b64", {
      configurable: true,
      enumerable: true,
      get: artifactGetter,
    });

    await expect(build({}, readyEvidence(), contract)).rejects.toThrow(
      /TAIRA burn-record contract artifact is required/u,
    );
    expect(artifactGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed offline full-TOML evidence fields", async () => {
    const schemaGetter = vi.fn(() => "forged-schema");
    const offlineEvidence = {
      routeId: "taira_bsc_xor",
      assetKey: "xor",
      bscNetwork: "testnet",
      fullTomlReady: true,
      postDeployLiveEvidence: {
        fullTomlReady: true,
        offlineFullTomlSha256: HASH_77,
      },
      offlineFullTomlSha256: HASH_77,
    };
    Object.defineProperty(offlineEvidence, "schema", {
      configurable: true,
      enumerable: true,
      get: schemaGetter,
    });

    await expect(
      build({}, readyEvidence(), readyContract(), offlineEvidence),
    ).rejects.toThrow(/BSC offline full TOML evidence schema is required/u);
    expect(schemaGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed native prover bundle options", async () => {
    const nativeBundleGetter = vi.fn(() =>
      nativeProverBundleForEvidence(readyEvidence()),
    );
    const options = {
      "settlement-asset-definition-id": SETTLEMENT_ASSET,
      "production-ready": "true",
      "confirm-testnet": "taira_bsc_xor",
      "live-readback-checked": "true",
    };
    Object.defineProperty(options, "nativeEvmProverBundle", {
      configurable: true,
      enumerable: true,
      get: nativeBundleGetter,
    });

    await expect(
      buildBscRouteManifestDraft({
        options,
        evidence: readyEvidence(),
        tairaContract: readyContract(),
        createdAt: "2026-06-05T00:00:00.000Z",
      }),
    ).rejects.toThrow(
      /production-ready BSC manifests require --native-prover-bundle/u,
    );
    expect(nativeBundleGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed native prover bundle material fields", async () => {
    const verifierKeyArtifactHashGetter = vi.fn(() => HASH_88);
    const nativeBundle = nativeProverBundleForEvidence(readyEvidence());
    Object.defineProperty(nativeBundle, "verifier_key_artifact_hash", {
      configurable: true,
      enumerable: true,
      get: verifierKeyArtifactHashGetter,
    });

    await expect(
      buildBscRouteManifestDraft({
        options: {
          "settlement-asset-definition-id": SETTLEMENT_ASSET,
          "production-ready": "true",
          "confirm-testnet": "taira_bsc_xor",
          "live-readback-checked": "true",
          nativeEvmProverBundle: nativeBundle,
        },
        evidence: readyEvidence(),
        tairaContract: readyContract(),
        createdAt: "2026-06-05T00:00:00.000Z",
      }),
    ).rejects.toThrow(/verifierKeyArtifactHash is required/u);
    expect(verifierKeyArtifactHashGetter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed verifier vector entries without invoking getters", async () => {
    const alphaGetter = vi.fn(() => {
      throw new Error("verifier vector getter should not run");
    });
    const alpha1 = [VALID_VERIFIER_MATERIAL.alpha1[0]];
    Object.defineProperty(alpha1, "1", {
      configurable: true,
      enumerable: true,
      get: alphaGetter,
    });
    const evidence = readyEvidence({
      verifierMaterial: {
        ...VALID_VERIFIER_MATERIAL,
        alpha1,
      },
    });

    await expect(
      build(
        {
          "production-ready": "true",
          "confirm-testnet": "taira_bsc_xor",
          "live-readback-checked": "true",
        },
        evidence,
      ),
    ).rejects.toThrow(/alpha1\[1\] must be a data property/u);
    expect(alphaGetter).not.toHaveBeenCalled();
  });

  it("rejects sparse verifier vector entries before production manifest generation", async () => {
    const alpha1 = [VALID_VERIFIER_MATERIAL.alpha1[0]];
    alpha1.length = 2;
    const evidence = readyEvidence({
      verifierMaterial: {
        ...VALID_VERIFIER_MATERIAL,
        alpha1,
      },
    });

    await expect(
      build(
        {
          "production-ready": "true",
          "confirm-testnet": "taira_bsc_xor",
          "live-readback-checked": "true",
        },
        evidence,
      ),
    ).rejects.toThrow(/alpha1\[1\] is missing/u);
  });
});

const expectGenericSecretRejection = async (promise, forbidden = []) => {
  let caught = null;
  try {
    await promise;
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = caught?.message ?? "";
  expect(message).toMatch(/secret-like material/u);
  for (const value of [
    "private_key",
    "operatorNotes",
    "mnemonic",
    "BEGIN PRIVATE KEY",
    "abandon abandon",
    ...forbidden,
  ]) {
    expect(message).not.toContain(value);
  }
};

describe("BSC SCCP route manifest draft generator", () => {
  it("rejects symlinked CLI evidence JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const targetEvidencePath = path.join(tempRoot, "evidence.target.json");
      const symlinkEvidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(
        targetEvidencePath,
        JSON.stringify(readyEvidence()),
        "utf8",
      );
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await symlink(targetEvidencePath, symlinkEvidencePath);

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            symlinkEvidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects symlinked CLI native prover bundles before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidence = readyEvidence();
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const targetBundlePath = path.join(tempRoot, "native-bundle.target.json");
      const symlinkBundlePath = path.join(tempRoot, "native-bundle.json");
      await writeFile(evidencePath, JSON.stringify(evidence), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await writeFile(
        targetBundlePath,
        JSON.stringify(nativeProverBundleForEvidence(evidence)),
        "utf8",
      );
      await symlink(targetBundlePath, symlinkBundlePath);

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--native-prover-bundle",
            symlinkBundlePath,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects symlinked CLI TAIRA contract JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const targetContractPath = path.join(
        tempRoot,
        "taira-contract.target.json",
      );
      const symlinkContractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(
        targetContractPath,
        JSON.stringify(readyContract()),
        "utf8",
      );
      await symlink(targetContractPath, symlinkContractPath);

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            symlinkContractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects oversized CLI deployment evidence JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(
        evidencePath,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects non-object CLI deployment evidence JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(evidencePath, JSON.stringify([]), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects duplicate JSON object keys in CLI deployment evidence before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(
        evidencePath,
        `${JSON.stringify(readyEvidence(), null, 2).replace(
          '"routeId": "taira_bsc_xor"',
          '"routeId": "taira_bsc_shadow",\n  "routeId": "taira_bsc_xor"',
        )}\n`,
        "utf8",
      );
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects oversized CLI TAIRA contract JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(
        contractPath,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects non-object CLI TAIRA contract JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(contractPath, JSON.stringify([]), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects duplicate JSON object keys in CLI TAIRA contract JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(
        contractPath,
        `${JSON.stringify(readyContract(), null, 2).replace(
          '"artifact_b64":',
          '"artifact_b64": "shadow",\n  "artifact_b64":',
        )}\n`,
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects oversized CLI native prover bundles before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const bundlePath = path.join(tempRoot, "native-bundle.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await writeFile(
        bundlePath,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--native-prover-bundle",
            bundlePath,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects non-object CLI native prover bundle JSON before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const bundlePath = path.join(tempRoot, "native-bundle.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await writeFile(bundlePath, JSON.stringify([]), "utf8");

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--native-prover-bundle",
            bundlePath,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("rejects duplicate JSON object keys in CLI native prover bundles before manifest generation", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidence = readyEvidence();
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const bundlePath = path.join(tempRoot, "native-bundle.json");
      await writeFile(evidencePath, JSON.stringify(evidence), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await writeFile(
        bundlePath,
        `${JSON.stringify(
          nativeProverBundleForEvidence(evidence),
          null,
          2,
        ).replace(
          '"chain": "bsc-testnet"',
          '"chain": "bsc-mainnet",\n  "chain": "bsc-testnet"',
        )}\n`,
        "utf8",
      );

      await expect(
        execFileAsync(
          process.execPath,
          [
            "scripts/e2e/sccp-bsc-route-manifest.mjs",
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--native-prover-bundle",
            bundlePath,
            "--out",
            path.join(tempRoot, "manifest.json"),
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

  it("uses profile-specific default output and CLI next-step hints for mainnet", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    try {
      const evidencePath = path.join(tempRoot, "mainnet.evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const outPath = path.join(tempRoot, "mainnet-route.manifest.json");
      await writeFile(
        evidencePath,
        JSON.stringify(readyMainnetEvidence()),
        "utf8",
      );
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");

      const result = await execFileAsync(
        process.execPath,
        [
          path.join(repoRoot, "scripts/e2e/sccp-bsc-route-manifest.mjs"),
          "--bsc-network",
          "mainnet",
          "--evidence",
          evidencePath,
          "--taira-contract",
          contractPath,
          "--settlement-asset-definition-id",
          SETTLEMENT_ASSET,
          "--out",
          outPath,
        ],
        { cwd: repoRoot },
      );
      const summary = JSON.parse(result.stdout);

      expect(defaultBscRouteManifestOut("mainnet")).toBe(
        "output/sccp-bsc-route-manifest/taira-bsc-mainnet-xor-route.manifest.json",
      );
      expect(defaultBscRouteManifestOut("testnet")).toBe(
        "output/sccp-bsc-route-manifest/taira-bsc-xor-route.manifest.json",
      );
      expect(summary.wrote).toBe(outPath);
      expect(summary.nextStep).toContain(
        "--confirm-mainnet true --confirm-network taira_bsc_xor",
      );
      expect(summary.nextStep).not.toContain("--confirm-testnet");

      const manifest = JSON.parse(await readFile(summary.wrote, "utf8"));
      expect(manifest).toMatchObject({
        bscNetwork: "mainnet",
        chain: "bsc-mainnet",
        networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        destinationRollout: {
          destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
          destinationBindingHash: bindingHash(BSC_MAINNET_NETWORK_ID_HEX),
        },
      });
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects symlinked route manifest output files before writing", async () => {
    const tempRoot = await mkdtemp(path.join(tmpdir(), "sccp-bsc-route-"));
    const outside = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-route-outside-"),
    );
    try {
      const evidencePath = path.join(tempRoot, "evidence.json");
      const contractPath = path.join(tempRoot, "taira-contract.json");
      const outPath = path.join(tempRoot, "route.manifest.json");
      const targetPath = path.join(outside, "target.json");
      await writeFile(evidencePath, JSON.stringify(readyEvidence()), "utf8");
      await writeFile(contractPath, JSON.stringify(readyContract()), "utf8");
      await writeFile(targetPath, "must-not-overwrite\n", "utf8");
      await symlink(targetPath, outPath);

      await expect(
        execFileAsync(
          process.execPath,
          [
            path.join(repoRoot, "scripts/e2e/sccp-bsc-route-manifest.mjs"),
            "--evidence",
            evidencePath,
            "--taira-contract",
            contractPath,
            "--settlement-asset-definition-id",
            SETTLEMENT_ASSET,
            "--out",
            outPath,
          ],
          { cwd: repoRoot },
        ),
      ).rejects.toThrow(/must not be a symbolic link/u);
      await expect(readFile(targetPath, "utf8")).resolves.toBe(
        "must-not-overwrite\n",
      );
    } finally {
      await rm(tempRoot, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    }
  });

  it("builds a production-ready BSC testnet XOR route manifest from live readback evidence", async () => {
    const manifest = await build({
      "production-ready": "true",
      "live-readback-checked": "true",
      "confirm-testnet": "taira_bsc_xor",
    });

    expect(manifest).toMatchObject({
      schema: SCCP_BSC_ROUTE_MANIFEST_SCHEMA,
      routeId: "taira_bsc_xor",
      assetKey: "xor",
      bscNetwork: "testnet",
      chain: "bsc-testnet",
      chainIdHex: "0x61",
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
      counterpartyDomain: 2,
      counterpartyAccountCodecKey: "evm_hex",
      counterpartyAccountCodec: 2,
      verifierTarget: "EvmContract",
      productionReady: true,
      bscTokenAddress: BSC_TOKEN_ADDRESS,
      bscBridgeAddress: BSC_BRIDGE_ADDRESS,
      sccpBscSourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
      bscVerifierAddress: BSC_VERIFIER_ADDRESS,
      proofArtifactHash: HASH_44,
      provingKeyHash: HASH_66,
      nativeEvmProverBundleHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
      nativeEvmProverBundle: {
        bundleId: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
        chain: "bsc-testnet",
        proofArtifactHash: HASH_44,
        provingKeyHash: HASH_66,
        verifierKeyHash: HASH_22,
        verifierKeyArtifactHash: HASH_88,
        destinationBindingHash: bindingHash(),
      },
      destinationRollout: {
        destinationNetworkId: BSC_TESTNET_NETWORK_ID_HEX,
        verifierIdentity: BSC_VERIFIER_ADDRESS,
        verifierCodeHash: HASH_11,
        verifierKeyHash: HASH_22,
        proofArtifactHash: HASH_44,
        provingKeyHash: HASH_66,
        nativeEvmProverBundleHash: expect.stringMatching(/^0x[0-9a-f]{64}$/u),
        nativeEvmProverBundle: {
          bundleId: SCCP_BSC_TESTNET_NATIVE_EVM_PROVER_BUNDLE_ID_V1,
          chain: "bsc-testnet",
          verifierKeyArtifactHash: HASH_88,
        },
        destinationBindingHash: bindingHash(),
        destinationBindingKey: bindingKey(),
      },
      destinationBinding: {
        key: bindingKey(),
        bindingHash: bindingHash(),
        targetDomain: 2,
      },
      tairaXorBurnRecord: {
        settlementAssetDefinitionId: SETTLEMENT_ASSET,
        contractArtifactB64: ARTIFACT_B64,
        artifactSha256: ARTIFACT_SHA256,
        codeHash: HASH_33,
        gasLimit: 2_000_000,
      },
      postDeployLiveEvidence: {
        fullTomlReady: true,
        sourceBridgeConfigHash: HASH_33,
        sourceEventTransactionId: HASH_44,
        sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
        routeCanaryEvidenceHash: HASH_55,
        routeCanaryTransactionId: HASH_66,
        routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
        offlineFullTomlSha256: HASH_77,
      },
    });
    expect(manifest.nativeEvmProverBundleHash).toBe(
      manifest.destinationRollout.nativeEvmProverBundleHash,
    );
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_11);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_22);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_33);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_44);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_66);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(HASH_88);
    expect(manifest.nativeEvmProverBundleHash).not.toBe(
      GROTH16_PROOF_SELF_TEST_HASH,
    );
    expect(manifest).not.toHaveProperty("bridgeAddress");
    expect(manifest).not.toHaveProperty("tokenAddress");
    expect(manifest).not.toHaveProperty("sourceBridgeAddress");
    expect(manifest).not.toHaveProperty("destinationVerifierAddress");
    expect(manifest).not.toHaveProperty("verifierAddress");
    expect(manifest).not.toHaveProperty("proverArtifactHash");
    expect(manifest).not.toHaveProperty("circuitArtifactHash");
    expect(manifest.destinationRollout).not.toHaveProperty(
      "proverArtifactHash",
    );
    expect(manifest.destinationRollout).not.toHaveProperty(
      "circuitArtifactHash",
    );
    expect(JSON.stringify(manifest)).not.toMatch(/private|mnemonic|seed/iu);
  });

  it("defaults to a disabled draft when production readiness is not acknowledged", async () => {
    const manifest = await build();

    expect(manifest.productionReady).toBe(false);
    expect(manifest.disabledReason).toMatch(/not production-ready/u);
    expect(manifest.disabledReason).toMatch(/native EVM prover bundle/u);
    expect(manifest.disabledReason).not.toMatch(/contract readback/u);
    expect(manifest.disabledReason).not.toMatch(/TAIRA route publication/u);
    expect(manifest.disabledReason).not.toMatch(/live canary/u);
    expect(manifest.postDeployLiveEvidence).toMatchObject({
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_33,
      sourceEventTransactionId: HASH_44,
      routeCanaryEvidenceHash: HASH_55,
      routeCanaryTransactionId: HASH_66,
    });
  });

  it("preserves staged post-deploy evidence without marking the route production-ready", async () => {
    const manifest = await build(
      {},
      readyEvidence({
        postDeployLiveEvidence: {
          ...readyEvidence().postDeployLiveEvidence,
          fullTomlReady: false,
        },
      }),
    );

    expect(manifest.productionReady).toBe(false);
    expect(manifest.postDeployLiveEvidence).toMatchObject({
      fullTomlReady: false,
      sourceBridgeConfigHash: HASH_33,
      sourceEventTransactionId: HASH_44,
      routeCanaryEvidenceHash: HASH_55,
      routeCanaryTransactionId: HASH_66,
    });
  });

  it("rejects disabled drafts that claim full TOML readiness without the offline hash", async () => {
    await expect(
      build(
        {},
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            fullTomlReady: true,
            offlineFullTomlSha256: undefined,
          },
        }),
      ),
    ).rejects.toThrow(
      /fullTomlReady requires postDeployLiveEvidence\.offlineFullTomlSha256/u,
    );
  });

  it("omits post-deploy evidence from disabled drafts when no canary evidence exists", async () => {
    const manifest = await build(
      {},
      readyEvidence({ postDeployLiveEvidence: undefined }),
    );

    expect(manifest.productionReady).toBe(false);
    expect(manifest.disabledReason).toMatch(/post-deploy live evidence/u);
    expect(manifest.postDeployLiveEvidence).toBeUndefined();
  });

  it("preserves diagnostic verifier warnings on disabled drafts", async () => {
    const manifest = await build(
      {},
      readyEvidence({ diagnosticVerifier: true }),
    );

    expect(manifest.productionReady).toBe(false);
    expect(manifest.disabledReason).toMatch(/diagnostic/u);
    expect(manifest.diagnosticVerifier).toBe(true);
    expect(manifest.verifierMaterialWarnings.join(" ")).toMatch(
      /diagnosticVerifier=true/u,
    );
  });

  it("requires explicit testnet confirmation and live readback for production readiness", async () => {
    await expect(build({ "production-ready": "yes" })).rejects.toThrow(
      /--production-ready must be true or false/u,
    );
    await expect(
      build({
        "production-ready": "true",
        "confirm-testnet": "taira_bsc_xor",
        "live-readback-checked": "yes",
      }),
    ).rejects.toThrow(/--live-readback-checked must be true or false/u);
    await expect(
      build(
        {
          "bsc-network": "mainnet",
          "production-ready": "true",
          "confirm-mainnet": "yes",
          "confirm-network": "taira_bsc_xor",
          "live-readback-checked": "true",
        },
        readyMainnetEvidence(),
      ),
    ).rejects.toThrow(/--confirm-mainnet must be true or false/u);
    await expect(
      build({
        "production-ready": "true",
        "confirm-testnet": "taira_bsc_xor",
        "live-readback-checked": "true",
        "full-toml-ready": "yes",
      }),
    ).rejects.toThrow(/--full-toml-ready must be true or false/u);
    await expect(
      build({
        "production-ready": "true",
        "live-readback-checked": "true",
      }),
    ).rejects.toThrow(/confirm-testnet/u);
    await expect(
      build({
        "production-ready": "true",
        "confirm-testnet": "taira_bsc_xor",
      }),
    ).rejects.toThrow(/live-readback-checked/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          "skip-native-prover-bundle": true,
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/native-prover-bundle/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              chain: "eth",
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/chain must be bsc-testnet/u);
    const bundleWithoutVerifierArtifactHash =
      nativeProverBundleForEvidence(readyEvidence());
    delete bundleWithoutVerifierArtifactHash.verifier_key_artifact_hash;
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: bundleWithoutVerifierArtifactHash,
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/verifierKeyArtifactHash is required/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence(),
        readyContract({
          artifact_b64: Buffer.from(REPEATED_ARTIFACT_BYTES).toString("base64"),
          artifact_sha256: `0x${Buffer.from(
            sha256(REPEATED_ARTIFACT_BYTES),
          ).toString("hex")}`,
        }),
      ),
    ).rejects.toThrow(/placeholder burn-record material.*repeated/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              verifierKeyArtifactHash: HASH_88,
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/verifierKeyArtifactHash must not use multiple aliases/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              verifier_key_artifact_hash: HASH_44,
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(
      /role-separated|verifierKeyArtifactHash matches proofArtifactHash/u,
    );
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              groth16_proof_self_test_hash: HASH_44,
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(
      /role-separated|groth16ProofSelfTestHash matches proofArtifactHash/u,
    );
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              proof_artifact:
                "artifacts/bsc-testnet/fixtures/proof-artifact.r1cs",
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/proofArtifact must not reference diagnostic/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              native_sdk_artifacts: nativeProverBundleForEvidence(
                readyEvidence(),
              ).native_sdk_artifacts.map((artifact) =>
                artifact.sdk === "javascript"
                  ? {
                      ...artifact,
                      implementation_artifact:
                        "artifacts/bsc-testnet/mock/javascript-implementation.bin",
                    }
                  : artifact,
              ),
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/implementationArtifact must not reference diagnostic/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          nativeEvmProverBundle: nativeProverBundleForEvidence(
            readyEvidence(),
            {
              proof_artifact_hash: HASH_77,
              native_sdk_artifacts: Object.entries(
                SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
              ).map(([sdk, implementation], index) => ({
                sdk,
                implementation,
                prover_artifact_hash: HASH_77,
                proving_key_hash: HASH_66,
                implementation_artifact: `artifacts/bsc-testnet/${sdk}-implementation.bin`,
                implementation_hash: hex32((0x81 + index).toString(16)),
              })),
            },
          ),
        },
        readyEvidence(),
      ),
    ).rejects.toThrow(/proofArtifactHash must match/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({ bscContractReadback: undefined }),
      ),
    ).rejects.toThrow(/readback evidence/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            proofArtifactHash: undefined,
          },
        }),
      ),
    ).rejects.toThrow(/proof artifact hash and proving key hash/u);
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            provingKeyHash: HASH_22,
          },
        }),
      ),
    ).rejects.toThrow(/role-separated/u);
  });

  it("rejects non-finite production readback numbers", async () => {
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridgeSourceDomain: Number.NaN,
          },
        }),
      ),
    ).rejects.toThrow(/BSC readback bridgeSourceDomain must be an integer/u);
  });

  it("rejects diagnostic verifier material before generating production-ready manifests", async () => {
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({ diagnosticVerifier: true }),
      ),
    ).rejects.toThrow(/diagnostic material/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            destinationBindingHash: diagnosticBindingHash(),
            destinationBindingKey: diagnosticBindingKey(),
          },
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridgeDestinationBindingHash: diagnosticBindingHash(),
            bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
          },
        }),
      ),
    ).rejects.toThrow(/known diagnostic BSC verifier key hash/u);
  });

  it("rejects repeated-byte hashes before generating production-ready manifests", async () => {
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            routeCanaryEvidenceHash: hex32("66"),
          },
        }),
      ),
    ).rejects.toThrow(/non-placeholder production hashes.*repeated-byte hash/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            proofArtifactHash: hex32("44"),
          },
        }),
      ),
    ).rejects.toThrow(/non-placeholder production hashes.*proofArtifactHash/u);
  });

  it("rejects repeated-byte contract addresses before generating production-ready manifests", async () => {
    const repeatedBridgeAddress = "0x1111111111111111111111111111111111111111";
    const repeatedBridgeBindingHash = bscDestinationBindingHash({
      verifierAddress: BSC_VERIFIER_ADDRESS,
      bridgeAddress: repeatedBridgeAddress,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
    });
    const repeatedBridgeBindingKey = bscDestinationBindingKey({
      verifierAddress: BSC_VERIFIER_ADDRESS,
      bridgeAddress: repeatedBridgeAddress,
      verifierCodeHash: HASH_11,
      verifierKeyHash: HASH_22,
    });

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          bscBridgeAddress: repeatedBridgeAddress,
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            destinationBindingHash: repeatedBridgeBindingHash,
            destinationBindingKey: repeatedBridgeBindingKey,
          },
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            tokenBridgeAddress: repeatedBridgeAddress,
            sourceBridgeOwner: repeatedBridgeAddress,
            bridgeDestinationBindingHash: repeatedBridgeBindingHash,
          },
        }),
      ),
    ).rejects.toThrow(
      /non-placeholder contract addresses.*repeated-byte address/u,
    );
  });

  it("rejects smoke-test verifier point fixtures before production-ready manifest generation", async () => {
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          verifierMaterial: {
            alpha1: SMOKE_FIXTURE_G1,
            beta2: SMOKE_FIXTURE_G2,
            gamma2: SMOKE_FIXTURE_G2,
            delta2: SMOKE_FIXTURE_G2,
            ic: SMOKE_FIXTURE_IC,
          },
        }),
      ),
    ).rejects.toThrow(/smoke-test Groth16 fixture/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            verifierMaterial: {
              alpha1: SMOKE_FIXTURE_G1,
              beta2: SMOKE_FIXTURE_G2,
              gamma2: SMOKE_FIXTURE_G2,
              delta2: SMOKE_FIXTURE_G2,
              ic: SMOKE_FIXTURE_IC,
            },
          },
        }),
      ),
    ).rejects.toThrow(/smoke-test Groth16 fixture/u);
  });

  it("rejects invalid BN254 verifier points before production-ready manifest generation", async () => {
    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            alpha1: [1, 3],
          },
        }),
      ),
    ).rejects.toThrow(/BN254 G1 curve/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              alpha1: [BN254_BASE_FIELD_MODULUS, 2],
            },
          },
        }),
      ),
    ).rejects.toThrow(/BN254 field element/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            ic: [0, 0, ...VALID_VERIFIER_MATERIAL.ic.slice(2)],
          },
        }),
      ),
    ).rejects.toThrow(/point at infinity/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            beta2: [1, 2, 3, 4],
          },
        }),
      ),
    ).rejects.toThrow(/BN254 G2 twist curve/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            verifierMaterial: {
              ...VALID_VERIFIER_MATERIAL,
              gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
            },
          },
        }),
      ),
    ).rejects.toThrow(/BN254 field element/u);

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
        },
        readyEvidence({
          verifierMaterial: {
            ...VALID_VERIFIER_MATERIAL,
            delta2: [0, 0, 0, 0],
          },
        }),
      ),
    ).rejects.toThrow(/G2 point at infinity/u);
  });

  it("can attach post-deploy live evidence from CLI options without hand-editing deployment evidence", async () => {
    const evidence = readyEvidence({ postDeployLiveEvidence: undefined });
    const manifest = await build(
      {
        "production-ready": "true",
        "live-readback-checked": "true",
        "confirm-testnet": "taira_bsc_xor",
        "full-toml-ready": "true",
        "source-bridge-config-hash": HASH_33,
        "source-event-transaction-id": HASH_44,
        "source-event-explorer-url": SOURCE_EVENT_EXPLORER_URL,
        "route-canary-evidence-hash": HASH_55,
        "route-canary-transaction-id": HASH_66,
        "route-canary-explorer-url": ROUTE_CANARY_EXPLORER_URL,
        "offline-full-toml-sha256": HASH_77,
      },
      evidence,
    );

    expect(manifest.postDeployLiveEvidence).toEqual({
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_33,
      sourceEventTransactionId: HASH_44,
      routeCanaryEvidenceHash: HASH_55,
      routeCanaryTransactionId: HASH_66,
      offlineFullTomlSha256: HASH_77,
      sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
      routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    });
  });

  it("can attach offline full TOML evidence from generated route-config evidence", async () => {
    const evidence = readyEvidence({ postDeployLiveEvidence: undefined });
    const offlineFullTomlEvidence = generatedOfflineFullTomlEvidence();
    const manifest = await build(
      {
        "production-ready": "true",
        "live-readback-checked": "true",
        "confirm-testnet": "taira_bsc_xor",
        "source-bridge-config-hash": HASH_33,
        "source-event-transaction-id": HASH_44,
        "source-event-explorer-url": SOURCE_EVENT_EXPLORER_URL,
        "route-canary-evidence-hash": HASH_55,
        "route-canary-transaction-id": HASH_66,
        "route-canary-explorer-url": ROUTE_CANARY_EXPLORER_URL,
      },
      evidence,
      readyContract(),
      offlineFullTomlEvidence,
    );

    expect(manifest.postDeployLiveEvidence).toEqual({
      fullTomlReady: true,
      sourceBridgeConfigHash: HASH_33,
      sourceEventTransactionId: HASH_44,
      routeCanaryEvidenceHash: HASH_55,
      routeCanaryTransactionId: HASH_66,
      offlineFullTomlSha256: HASH_88,
      sourceEventExplorerUrl: SOURCE_EVENT_EXPLORER_URL,
      routeCanaryExplorerUrl: ROUTE_CANARY_EXPLORER_URL,
    });

    await expect(
      build(
        {
          "production-ready": "true",
          "live-readback-checked": "true",
          "confirm-testnet": "taira_bsc_xor",
          "source-bridge-config-hash": HASH_33,
          "source-event-transaction-id": HASH_44,
          "source-event-explorer-url": SOURCE_EVENT_EXPLORER_URL,
          "route-canary-evidence-hash": HASH_55,
          "route-canary-transaction-id": HASH_66,
          "route-canary-explorer-url": ROUTE_CANARY_EXPLORER_URL,
          "offline-full-toml-sha256": HASH_77,
        },
        evidence,
        readyContract(),
        offlineFullTomlEvidence,
      ),
    ).rejects.toThrow(
      /--offline-full-toml-sha256 disagrees with --offline-full-toml-evidence/u,
    );
  });

  it("rejects weak or hand-authored offline full TOML evidence", async () => {
    const cases = [
      ["missing hash mode", { hashMode: undefined }, /hashMode is required/u],
      [
        "wrong hash mode",
        { hashMode: "sha256:raw-full-config" },
        /hashMode must be/u,
      ],
      [
        "missing hash input",
        { hashInputSha256: undefined },
        /hashInputSha256 must be 32 bytes/u,
      ],
      [
        "hash input drift",
        { hashInputSha256: HASH_66 },
        /hashInputSha256 must equal offlineFullTomlSha256/u,
      ],
      [
        "missing rendered TOML hash",
        { renderedTomlSha256: undefined },
        /renderedTomlSha256 must be 32 bytes/u,
      ],
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
        "parent route manifest traversal",
        { routeManifestPath: "../route.manifest.json" },
        /routeManifestPath must be a relative path/u,
      ],
      [
        "encoded route manifest traversal",
        { routeManifestPath: "artifacts/sccp-bsc/%2e%2e/route.manifest.json" },
        /routeManifestPath must not use percent-encoded path segments/u,
      ],
      [
        "scheme route manifest path",
        { routeManifestPath: "https://example.invalid/route.manifest.json" },
        /routeManifestPath must be a relative path/u,
      ],
      [
        "missing full config path",
        { fullConfigPath: undefined },
        /fullConfigPath is required/u,
      ],
      [
        "query full config path",
        { fullConfigPath: "artifacts/sccp-bsc/full-config.toml?raw=1" },
        /fullConfigPath must be a relative path/u,
      ],
      [
        "backslash full config path",
        { fullConfigPath: "artifacts\\sccp-bsc\\full-config.toml" },
        /fullConfigPath must be a relative path/u,
      ],
      [
        "raw full TOML payload",
        { fullToml: "[zk]\nroute_enabled = true\n" },
        /must not embed raw TAIRA config or TOML payload/u,
      ],
      [
        "nested raw base config payload",
        { postDeployLiveEvidence: { fullTomlReady: true, baseConfigToml: "" } },
        /must not embed raw TAIRA config or TOML payload/u,
      ],
    ];

    for (const [name, overrides, pattern] of cases) {
      await expect(
        build(
          {
            "production-ready": "true",
            "live-readback-checked": "true",
            "confirm-testnet": "taira_bsc_xor",
            "source-bridge-config-hash": HASH_33,
            "source-event-transaction-id": HASH_44,
            "source-event-explorer-url": SOURCE_EVENT_EXPLORER_URL,
            "route-canary-evidence-hash": HASH_55,
            "route-canary-transaction-id": HASH_66,
            "route-canary-explorer-url": ROUTE_CANARY_EXPLORER_URL,
          },
          readyEvidence({ postDeployLiveEvidence: undefined }),
          readyContract(),
          generatedOfflineFullTomlEvidence(overrides),
        ),
        name,
      ).rejects.toThrow(pattern);
    }
  });

  it("accepts matching generic and BSC deployment evidence aliases", async () => {
    const manifest = await build(
      {},
      readyEvidence({
        bridgeAddress: BSC_BRIDGE_ADDRESS.toUpperCase(),
        tokenAddress: BSC_TOKEN_ADDRESS,
        sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
        destinationVerifierAddress: BSC_VERIFIER_ADDRESS,
        verifierAddress: BSC_VERIFIER_ADDRESS,
        destinationRollout: {
          ...readyEvidence().destinationRollout,
          destinationBridgeAddress: BSC_BRIDGE_ADDRESS,
          verifierIdentity: BSC_VERIFIER_ADDRESS,
        },
      }),
    );

    expect(manifest.bscBridgeAddress).toBe(BSC_BRIDGE_ADDRESS);
    expect(manifest.bscTokenAddress).toBe(BSC_TOKEN_ADDRESS);
    expect(manifest.sccpBscSourceBridgeAddress).toBe(BSC_SOURCE_BRIDGE_ADDRESS);
    expect(manifest.bscVerifierAddress).toBe(BSC_VERIFIER_ADDRESS);
    expect(manifest).not.toHaveProperty("bridgeAddress");
    expect(manifest).not.toHaveProperty("tokenAddress");
    expect(manifest).not.toHaveProperty("sourceBridgeAddress");
    expect(manifest).not.toHaveProperty("verifierAddress");
  });

  it("lets explicit CLI post-deploy evidence override stale embedded evidence", async () => {
    const manifest = await build(
      {
        "production-ready": "true",
        "live-readback-checked": "true",
        "confirm-testnet": "taira_bsc_xor",
        "source-event-transaction-id": HASH_44,
        "source-event-explorer-url": SOURCE_EVENT_EXPLORER_URL,
      },
      readyEvidence({
        postDeployLiveEvidence: {
          ...readyEvidence().postDeployLiveEvidence,
          sourceEventTransactionId: HASH_77,
          source_event_transaction_id: HASH_77,
          sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_77}`,
        },
      }),
    );

    expect(manifest.postDeployLiveEvidence.sourceEventTransactionId).toBe(
      HASH_44,
    );
    expect(manifest.postDeployLiveEvidence.sourceEventExplorerUrl).toBe(
      SOURCE_EVENT_EXPLORER_URL,
    );
  });

  it("rejects cross-route or cross-network BSC deployment evidence", async () => {
    const withoutRouteId = readyEvidence();
    delete withoutRouteId.routeId;

    const cases = [
      ["missing route id", withoutRouteId, /routeId is required/],
      [
        "wrong route id",
        readyEvidence({ routeId: "taira_tron_xor" }),
        /routeId must be taira_bsc_xor/,
      ],
      [
        "conflicting route id aliases",
        readyEvidence({ route_id: "taira_tron_xor" }),
        /routeId aliases disagree/u,
      ],
      [
        "wrong asset key",
        readyEvidence({ assetKey: "not_xor" }),
        /assetKey must be xor/,
      ],
      [
        "mainnet BSC profile",
        readyEvidence({ bscNetwork: "mainnet" }),
        /bscNetwork must be testnet/,
      ],
      [
        "mainnet chain label",
        readyEvidence({ chain: "bsc-mainnet" }),
        /chain must be bsc-testnet/,
      ],
      [
        "mainnet chain id",
        readyEvidence({ chainIdHex: "0x38" }),
        /chainIdHex must be 0x61/,
      ],
      [
        "conflicting chain id aliases",
        readyEvidence({ chainIdHex: "0x61", chain_id_hex: "0x38" }),
        /chainIdHex aliases disagree/u,
      ],
      [
        "mainnet network id",
        readyEvidence({ networkIdHex: BSC_MAINNET_NETWORK_ID_HEX }),
        /networkIdHex must be 0x0000000000000000000000000000000000000000000000000000000000000061/,
      ],
      [
        "mainnet explorer URL",
        readyEvidence({ bscExplorerUrl: "https://bscscan.com" }),
        /explorerUrl must be https:\/\/testnet\.bscscan\.com/u,
      ],
      [
        "mainnet explorer host",
        readyEvidence({ bscExplorerHost: "bscscan.com" }),
        /explorerHost must be testnet\.bscscan\.com/u,
      ],
      [
        "mainnet rollout network id",
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            destinationNetworkId: BSC_MAINNET_NETWORK_ID_HEX,
          },
        }),
        /destinationRollout\.destinationNetworkId must be 0x0000000000000000000000000000000000000000000000000000000000000061/,
      ],
    ];

    for (const [name, evidence, error] of cases) {
      await expect(build({}, evidence), name).rejects.toThrow(error);
    }
  });

  it("rejects forged BSC binding, live readback, and post-deploy evidence", async () => {
    const cases = [
      [
        "forged destination binding hash",
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            destinationBindingHash: HASH_77,
          },
        }),
        /destination binding hash/u,
      ],
      [
        "wrong chain id",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            chainIdHex: "0x38",
          },
        }),
        /chain id/u,
      ],
      [
        "duplicate readback container aliases",
        readyEvidence({
          bsc_contract_readback: {
            ...readyEvidence().bscContractReadback,
          },
        }),
        /BSC contract readback evidence must not use multiple aliases/u,
      ],
      [
        "conflicting readback chain id aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            chain_id_hex: "0x38",
          },
        }),
        /BSC readback chainIdHex aliases disagree/u,
      ],
      [
        "missing bytecode",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            codePresent: {
              ...readyEvidence().bscContractReadback.codePresent,
              verifier: false,
            },
          },
        }),
        /verifier bytecode/u,
      ],
      [
        "conflicting bytecode-present aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            codePresent: {
              ...readyEvidence().bscContractReadback.codePresent,
              source_bridge: false,
            },
          },
        }),
        /BSC readback sourceBridge bytecode aliases disagree/u,
      ],
      [
        "duplicate bytecode-present container aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            code_present: {
              ...readyEvidence().bscContractReadback.codePresent,
            },
          },
        }),
        /BSC readback codePresent must not use multiple aliases/u,
      ],
      [
        "unlocked token",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            tokenBridgeLocked: false,
          },
        }),
        /token bridge must be locked/u,
      ],
      [
        "conflicting token lock aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            token_bridge_locked: false,
          },
        }),
        /BSC readback tokenBridgeLocked aliases disagree/u,
      ],
      [
        "source owner drift",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            sourceBridgeOwner: BSC_SOURCE_BRIDGE_ADDRESS,
          },
        }),
        /source bridge owner/u,
      ],
      [
        "bridge verifier address drift",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridgeVerifierAddress: BSC_BRIDGE_ADDRESS,
          },
        }),
        /bridge verifier address/u,
      ],
      [
        "bridge verifier key hash drift",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridgeVerifierKeyHash: HASH_77,
          },
        }),
        /verifier key hash/u,
      ],
      [
        "conflicting bridge verifier key hash aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridge_verifier_key_hash: HASH_77,
          },
        }),
        /BSC readback bridgeVerifierKeyHash aliases disagree/u,
      ],
      [
        "raw verifier key hash drift",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            verifierKeyHash: HASH_77,
          },
        }),
        /verifier key hash/u,
      ],
      [
        "missing raw verifier key hash",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            verifierKeyHash: undefined,
          },
        }),
        /verifierKeyHash/u,
      ],
      [
        "bridge domain drift",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridgeTargetDomain: 1,
          },
        }),
        /bridge domains/u,
      ],
      [
        "conflicting bridge domain aliases",
        readyEvidence({
          bscContractReadback: {
            ...readyEvidence().bscContractReadback,
            bridge_target_domain: 1,
          },
        }),
        /BSC readback bridgeTargetDomain aliases disagree/u,
      ],
      [
        "canary evidence missing",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            fullTomlReady: false,
          },
        }),
        /fullTomlReady/u,
      ],
      [
        "duplicate post-deploy container aliases",
        readyEvidence({
          post_deploy_live_evidence: {
            ...readyEvidence().postDeployLiveEvidence,
          },
        }),
        /postDeployLiveEvidence must not use multiple aliases/u,
      ],
      [
        "missing offline full TOML hash",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            offlineFullTomlSha256: undefined,
          },
        }),
        /offlineFullTomlSha256 is required/u,
      ],
      [
        "same-valued full TOML readiness aliases",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            full_toml_ready: true,
          },
        }),
        /fullTomlReady must not use multiple aliases/u,
      ],
      [
        "same-valued source bridge config hash aliases",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            source_bridge_config_hash:
              readyEvidence().postDeployLiveEvidence.sourceBridgeConfigHash,
          },
        }),
        /sourceBridgeConfigHash must not use multiple aliases/u,
      ],
      [
        "same-valued route canary explorer URL aliases",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            route_canary_explorer_url:
              readyEvidence().postDeployLiveEvidence.routeCanaryExplorerUrl,
          },
        }),
        /routeCanaryExplorerUrl must not use multiple aliases/u,
      ],
      [
        "reused source and canary evidence hash",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            routeCanaryEvidenceHash: HASH_33,
          },
        }),
        /config hash and route canary evidence hash must be distinct/u,
      ],
      [
        "reused source and canary transaction id",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            routeCanaryTransactionId: HASH_44,
            routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_44}`,
          },
        }),
        /transaction ids must be distinct/u,
      ],
      [
        "missing source event explorer URL",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            sourceEventExplorerUrl: "",
          },
        }),
        /sourceEventExplorerUrl is required/u,
      ],
      [
        "missing route canary explorer URL",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            routeCanaryExplorerUrl: "",
          },
        }),
        /routeCanaryExplorerUrl is required/u,
      ],
      [
        "mainnet explorer URL",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://bscscan.com/tx/${HASH_44}`,
          },
        }),
        /BSC testnet explorer/u,
      ],
      [
        "explorer URL with tracking query",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            sourceEventExplorerUrl: `${SOURCE_EVENT_EXPLORER_URL}?utm=proof`,
          },
        }),
        /query strings/u,
      ],
      [
        "explorer URL hash mismatch",
        readyEvidence({
          postDeployLiveEvidence: {
            ...readyEvidence().postDeployLiveEvidence,
            sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_66}`,
          },
        }),
        /transaction hash must match/u,
      ],
    ];

    for (const [name, evidence, error] of cases) {
      await expect(
        build(
          {
            "production-ready": "true",
            "live-readback-checked": "true",
            "confirm-testnet": "taira_bsc_xor",
          },
          evidence,
        ),
        name,
      ).rejects.toThrow(error);
    }
  });

  it("rejects unsafe manifest material before writing operator artifacts", async () => {
    await expect(
      build({}, readyEvidence({ bscVerifierAddress: BSC_BRIDGE_ADDRESS })),
    ).rejects.toThrow(/distinct/u);
    await expect(
      build({}, readyEvidence({ sourceBridgeAddress: BSC_BRIDGE_ADDRESS })),
    ).rejects.toThrow(/source bridge address aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({
          sccpBscSourceBridgeAddress: undefined,
          sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
        }),
      ),
    ).rejects.toThrow(/source bridge address must not use TRON aliases/u);
    await expect(
      build({}, readyEvidence({ tokenAddress: BSC_BRIDGE_ADDRESS })),
    ).rejects.toThrow(/token address aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            destinationBridgeAddress: BSC_TOKEN_ADDRESS,
          },
        }),
      ),
    ).rejects.toThrow(/bridge address aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({
          destination_rollout: {
            ...readyEvidence().destinationRollout,
          },
        }),
      ),
    ).rejects.toThrow(/destinationRollout must not use multiple aliases/u);
    await expect(
      build(
        {},
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            verifierIdentity: BSC_BRIDGE_ADDRESS,
          },
        }),
      ),
    ).rejects.toThrow(/verifier address aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({
          bscVerifierAddress: undefined,
          tron_verifier_address: BSC_VERIFIER_ADDRESS,
        }),
      ),
    ).rejects.toThrow(/verifier address must not use TRON aliases/u);
    await expect(
      build({ bridge: BSC_TOKEN_ADDRESS }, readyEvidence()),
    ).rejects.toThrow(/bridge address aliases disagree/u);
    await expect(
      build({}, readyEvidence({ verifierKeyHash: HASH_77 })),
    ).rejects.toThrow(/BSC verifier key hash aliases disagree/u);
    await expect(
      build({}, readyEvidence({ proofArtifactHash: HASH_77 })),
    ).rejects.toThrow(/BSC proof artifact hash aliases disagree/u);
    await expect(
      build({}, readyEvidence({ destinationBindingHash: HASH_77 })),
    ).rejects.toThrow(/expected destination binding hash aliases disagree/u);
    await expect(
      build({}, readyEvidence({ destinationBindingKey: "evm:forged" })),
    ).rejects.toThrow(/expected destination binding key aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({ settlementAssetDefinitionId: "1111111111111111" }),
      ),
    ).rejects.toThrow(/--settlement-asset-definition-id aliases disagree/u);
    await expect(
      build({ "settlement-asset-definition-id": "xor#universal" }),
    ).rejects.toThrow(/canonical Base58/u);
    await expect(
      build({}, readyEvidence(), readyContract({ artifactSha256: HASH_77 })),
    ).rejects.toThrow(/TAIRA burn-record artifact sha256 aliases disagree/u);
    await expect(
      build({}, readyEvidence(), readyContract({ codeHash: HASH_77 })),
    ).rejects.toThrow(/TAIRA burn-record code hash aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence(),
        readyContract({
          vk_ref: {
            backend: "halo2/ipa",
            name: "taira_bsc_xor_burn_record_v1",
          },
        }),
      ),
    ).rejects.toThrow(/TAIRA burn-record vkRef must not use multiple aliases/u);
    await expect(
      build({ "vk-backend": "groth16/bn254" }, readyEvidence()),
    ).rejects.toThrow(/--vk-backend aliases disagree/u);
    await expect(
      build(
        {},
        readyEvidence({
          verifierMaterial: {
            alpha1: ["3", "4"],
          },
          verifier_material: {
            alpha1: ["5", "6"],
          },
        }),
      ),
    ).rejects.toThrow(
      /evidence verifier material must not use multiple aliases/u,
    );
    await expectGenericSecretRejection(
      build({}, { ...readyEvidence(), private_key: "secret" }),
    );
    await expectGenericSecretRejection(
      build({}, { ...readyEvidence(), apiKey: "do-not-serialize-api-key" }),
      ["apiKey", "do-not-serialize-api-key"],
    );
    await expectGenericSecretRejection(
      build({}, { ...readyEvidence(), operatorNotes: VALID_MNEMONIC }),
    );
    await expectGenericSecretRejection(
      build({}, { ...readyEvidence(), operatorNotes: PRIVATE_KEY_PEM }),
    );
    await expectGenericSecretRejection(
      build(
        {},
        {
          ...readyEvidence(),
          auditNotes:
            "operator privateKey=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface accessToken=0xfeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface",
        },
      ),
      ["privateKey=", "accessToken=", "feedfacefeedface"],
    );
    await expectGenericSecretRejection(
      build(
        {},
        {
          ...readyEvidence(),
          auditNotes: "operator pasted Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
        },
      ),
      ["Bearer", "mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l"],
    );
    await expectGenericSecretRejection(
      build(
        {},
        readyEvidence({
          destinationRollout: {
            ...readyEvidence().destinationRollout,
            mnemonic: VALID_MNEMONIC,
          },
        }),
      ),
      ["destinationRollout"],
    );
    await expectGenericSecretRejection(
      build(
        {},
        readyEvidence(),
        readyContract({ secretOperatorNote: "fixture-only" }),
      ),
      ["secretOperatorNote", "fixture-only"],
    );
    await expect(
      build({}, readyEvidence(), readyContract({ artifact_b64: "not base64" })),
    ).rejects.toThrow(/base64/u);
    await expect(
      build(
        {},
        readyEvidence(),
        readyContract({ artifact_sha256: `0x${"99".repeat(32)}` }),
      ),
    ).rejects.toThrow(/sha256/u);
  });
});
