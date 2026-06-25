import { createHash } from "node:crypto";
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
import { deflateSync } from "node:zlib";
import { SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1 } from "@iroha/iroha-js/sccp";
import { describe, expect, it } from "vitest";
import {
  BSC_TAIRA_CHAIN_ID,
  BSC_TAIRA_NETWORK_PREFIX,
  BSC_MAINNET_NETWORK_ID_HEX,
  BSC_TESTNET_NETWORK_ID_HEX,
  SCCP_BSC_XOR_ASSET_KEY,
  SCCP_BSC_XOR_ROUTE_ID,
  resolveBscNetworkProfile,
} from "../scripts/e2e/sccp-bsc-route-preflight.mjs";
import { bscDestinationBindingKey } from "../scripts/e2e/sccp-bsc-route-manifest.mjs";
import {
  bscSccpProductionGateRunbookProblems,
  bscSccpProductionGateReportPaths,
  evaluateBscSccpProductionGate,
  refreshBscSccpProductionGateReports,
  resolveBscSccpProductionGateRefreshReports,
  runBscSccpProductionGate,
} from "../scripts/e2e/sccp-bsc-production-gate.mjs";
import {
  SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
  bscProductionRequirementsContractHash,
} from "../scripts/e2e/sccp-bsc-production-material-inventory.mjs";
import { SCCP_BSC_SANITIZED_STANZA_MAX_BYTES } from "../scripts/e2e/sccp-bsc-peer-config-audit.mjs";
import {
  MAX_SCREENSHOT_ARTIFACT_BYTES,
  MAX_VIDEO_ARTIFACT_BYTES,
  REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
  SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
} from "../scripts/e2e/sccp-bsc-live-video.mjs";
import {
  SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES,
  SCCP_BSC_BROWSER_MODULE_MAX_BYTES,
  SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV,
  SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
  SCCP_BSC_PROVER_CONFIG_URL_ENV,
  SCCP_BSC_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_PROVER_MODULE_URL_ENV,
  SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
  SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
  SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV,
  SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV,
} from "../scripts/e2e/sccp-bsc-live-smoke-readiness.mjs";

const fixtureHash = (label) =>
  `0x${createHash("sha256").update(Buffer.from(label, "utf8")).digest("hex")}`;
const fixtureAddress = (label) => fixtureHash(label).slice(0, 42);
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc production gate bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc production gate token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc production gate source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc production gate verifier");
const HASH_11 = fixtureHash("bsc production gate fixture hash 11");
const HASH_12 = fixtureHash("bsc production gate fixture hash 12");
const HASH_13 = fixtureHash("bsc production gate fixture hash 13");
const HASH_14 = fixtureHash("bsc production gate fixture hash 14");
const HASH_15 = fixtureHash("bsc production gate fixture hash 15");
const HASH_16 = fixtureHash("bsc production gate fixture hash 16");
const HASH_17 = fixtureHash("bsc production gate fixture hash 17");
const HASH_18 = fixtureHash("bsc production gate fixture hash 18");
const HASH_22 = fixtureHash("bsc production gate fixture hash 22");
const HASH_33 = fixtureHash("bsc production gate fixture hash 33");
const HASH_44 = fixtureHash("bsc production gate fixture hash 44");
const HASH_55 = fixtureHash("bsc production gate fixture hash 55");
const HASH_66 = fixtureHash("bsc production gate fixture hash 66");
const HASH_77 = fixtureHash("bsc production gate fixture hash 77");
const HASH_88 = fixtureHash("bsc production gate fixture hash 88");
const HASH_99 = fixtureHash("bsc production gate fixture hash 99");
const VIDEO_HASH_AA = `0x${"aa".repeat(32)}`;
const VIDEO_HASH_BB = `0x${"bb".repeat(32)}`;
const VIDEO_HASH_CC = `0x${"cc".repeat(32)}`;
const VIDEO_HASH_DD = `0x${"dd".repeat(32)}`;
const ZERO_HASH = `0x${"00".repeat(32)}`;
const LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA =
  "iroha-demo-sccp-bsc-browser-prover-local-sidecar/v1";
const BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA =
  "iroha-sccp-bsc-groth16-attestation-handoff/v1";
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
const sourceParityRequiredMarkers = (profile = "testnet") => {
  const key =
    typeof profile === "string" ? profile : (profile?.key ?? "testnet");
  return sourceParityRequiredMarkersByProfile[key];
};
const BSC_COMPILED_CONTRACTS = Object.freeze({
  verifier: "SccpGroth16Bn254MessageVerifier",
  sourceBridge: "SccpBscSourceBridge",
  token: "TairaXOR",
  bridge: "TairaXorBscSccpBridge",
});
const compiledContractFile = (key) => ({
  path: `./output/sccp-bsc-production/contracts/${key}.json`,
  kind: "contract-artifact",
  sizeBytes: 8192,
  sha256: fixtureHash(`bsc compiled contract file ${key}`),
  contractArtifact: {
    valid: true,
    key,
    contractName: BSC_COMPILED_CONTRACTS[key],
    abiEntryCount: 12,
    bytecodeKeccak256: fixtureHash(
      `bsc compiled contract bytecode keccak ${key}`,
    ),
    deployedBytecodeKeccak256:
      key === "verifier"
        ? HASH_11
        : fixtureHash(`bsc compiled contract deployed bytecode keccak ${key}`),
    bytecodeSha256: fixtureHash(`bsc compiled contract bytecode ${key}`),
    deployedBytecodeSha256: fixtureHash(
      `bsc compiled contract deployed bytecode ${key}`,
    ),
  },
  findings: [],
});
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const VIDEO_ARTIFACT_SIZE_BYTES = 96 * 1024;
const VALID_MNEMONIC =
  "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
const NOW_ISO = "2026-06-06T00:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);
const SMOKE_CHECKED_AT = new Date(NOW_MS - 1_000).toISOString();
const VIDEO_ARTIFACT = {
  relativePath: "video.webm",
  sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
  sha256: "ab".repeat(32),
  mediaType: "video/webm",
  status: "captured",
  fileVerified: true,
};
const SCREENSHOT_SHA256 = "cd".repeat(32);
const SCREENSHOT_SHA256_BY_KIND = Object.freeze({
  tairaSourceTx: "c1".repeat(32),
  bscFinalizeTx: "c2".repeat(32),
  bscBurnTx: "c3".repeat(32),
  tairaSettlementTx: "c4".repeat(32),
});
const VIDEO_PROOF_LABELS = Object.freeze({
  tairaSourceTx: "TAIRA source transaction",
  bscFinalizeTx: "BSC finalize transaction",
  bscBurnTx: "BSC burn transaction",
  tairaSettlementTx: "TAIRA settlement transaction",
});
const SMOKE_FIXTURE_G1 = [`0x${"0".repeat(63)}1`, `0x${"0".repeat(63)}2`];
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
const REQUIRED_ROUTE_PREFLIGHT_COMMON_CHECK_IDS = [
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
  "bsc-explorer-binding",
  "bsc-bridge-address",
  "bsc-token-address",
  "bsc-sourceBridge-address",
  "bsc-verifier-address",
  "bsc-contract-addresses-distinct",
  "bsc-verifierCodeHash",
  "bsc-verifierKeyHash",
  "bsc-destinationBindingHash",
  "bsc-destination-binding",
  "bsc-production-verifier-material",
  "bsc-production-prover-material",
  "bsc-native-evm-prover-bundle",
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

const transactionHashFromExplorerUrl = (href) => {
  try {
    const pathname = new URL(href).pathname.replace(/\/+$/u, "");
    const bsc = pathname.match(/^\/tx\/0x([0-9a-f]{64})$/iu);
    if (bsc) {
      return bsc[1].toLowerCase();
    }
    const taira = pathname.match(/^\/transactions?\/(?:0x)?([0-9a-f]{64})$/iu);
    if (taira) {
      return taira[1].toLowerCase();
    }
  } catch (_error) {
    // Invalid fixture URLs should remain invalid in the caller.
  }
  return "";
};

const screenshotProof = (kind, href, overrides = {}) => ({
  kind,
  label: VIDEO_PROOF_LABELS[kind],
  href,
  finalHref: href,
  transactionHash: transactionHashFromExplorerUrl(href),
  contentLength: 128,
  relativePath: `${kind}.png`,
  sizeBytes: 2048,
  sha256: SCREENSHOT_SHA256_BY_KIND[kind] ?? SCREENSHOT_SHA256,
  mediaType: "image/png",
  status: "captured",
  fileVerified: true,
  ...overrides,
});

const WEBM_HEADER_BYTES = Object.freeze([
  0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81, 0x01,
  0x42, 0xf2, 0x81, 0x04, 0x42, 0xf3, 0x81, 0x08, 0x42, 0x82, 0x84, 0x77, 0x65,
  0x62, 0x6d, 0x42, 0x87, 0x81, 0x04, 0x42, 0x85, 0x81, 0x02, 0x18, 0x53, 0x80,
  0x67, 0xff,
]);
const WEBM_INFO_ELEMENT_BYTES = Object.freeze([0x15, 0x49, 0xa9, 0x66]);
const WEBM_TRACKS_ELEMENT_BYTES = Object.freeze([0x16, 0x54, 0xae, 0x6b]);
const WEBM_CLUSTER_ELEMENT_BYTES = Object.freeze([0x1f, 0x43, 0xb6, 0x75]);
const WEBM_SIMPLE_BLOCK_ELEMENT_BYTES = Object.freeze([0xa3]);
const WEBM_SIMPLE_BLOCK_PAYLOAD_BYTES = Object.freeze(
  Array.from({ length: 64 }, (_entry, index) => (index * 29 + 11) & 0xff),
);
const WEBM_MEDIA_STRUCTURE_BYTES = Object.freeze([
  ...WEBM_INFO_ELEMENT_BYTES,
  0x84,
  0x2a,
  0xd7,
  0xb1,
  0x80,
  ...WEBM_TRACKS_ELEMENT_BYTES,
  0x81,
  0x00,
  ...WEBM_CLUSTER_ELEMENT_BYTES,
  0x86,
  0xe7,
  0x81,
  0x00,
  ...WEBM_SIMPLE_BLOCK_ELEMENT_BYTES,
  0xc0,
  ...WEBM_SIMPLE_BLOCK_PAYLOAD_BYTES,
]);
const WEBM_TINY_MEDIA_STRUCTURE_BYTES = Object.freeze([
  ...WEBM_INFO_ELEMENT_BYTES,
  0x84,
  0x2a,
  0xd7,
  0xb1,
  0x80,
  ...WEBM_TRACKS_ELEMENT_BYTES,
  0x81,
  0x00,
  ...WEBM_CLUSTER_ELEMENT_BYTES,
  0x86,
  0xe7,
  0x81,
  0x00,
  ...WEBM_SIMPLE_BLOCK_ELEMENT_BYTES,
  0x81,
  0x00,
]);
const WEBM_DOCTYPE_SIZE_OFFSET = 23;
const WEBM_DOCTYPE_VALUE_OFFSET = 24;
const WEBM_SEGMENT_OFFSET = 36;

const webmBytes = (size = VIDEO_ARTIFACT_SIZE_BYTES, fill = 7) => {
  const bytes = Buffer.alloc(size);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = (fill + index * 37 + (index >> 8)) & 0xff;
  }
  Buffer.from(WEBM_HEADER_BYTES).copy(bytes, 0);
  Buffer.from(WEBM_MEDIA_STRUCTURE_BYTES).copy(bytes, WEBM_HEADER_BYTES.length);
  return bytes;
};

const forgedWebmTinyPaddedBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = Buffer.alloc(size, fill);
  Buffer.from(WEBM_HEADER_BYTES).copy(bytes, 0);
  Buffer.from(WEBM_TINY_MEDIA_STRUCTURE_BYTES).copy(
    bytes,
    WEBM_HEADER_BYTES.length,
  );
  return bytes;
};

const forgedWebmDominantPaddedBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = Buffer.alloc(size, fill);
  Buffer.from(WEBM_HEADER_BYTES).copy(bytes, 0);
  Buffer.from(WEBM_MEDIA_STRUCTURE_BYTES).copy(bytes, WEBM_HEADER_BYTES.length);
  return bytes;
};

const forgedWebmWithoutSequenceBytes = (sequence, size = 4096, fill = 7) => {
  const bytes = webmBytes(size, fill);
  const offset = bytes.indexOf(Buffer.from(sequence));
  if (offset !== -1) {
    Buffer.alloc(sequence.length, fill).copy(bytes, offset);
  }
  return bytes;
};

const forgedWebmSubstringBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = Buffer.alloc(size, fill);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes, 0);
  Buffer.from("webm").copy(bytes, 32);
  return bytes;
};

const forgedWebmWrongDocTypeBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = webmBytes(size, fill);
  Buffer.from("wxbm").copy(bytes, WEBM_DOCTYPE_VALUE_OFFSET);
  return bytes;
};

const forgedWebmWrongDocTypeSizeBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = webmBytes(size, fill);
  bytes[WEBM_DOCTYPE_SIZE_OFFSET] = 0x85;
  return bytes;
};

const forgedWebmWithoutSegmentBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => {
  const bytes = webmBytes(size, fill);
  Buffer.alloc(4, fill).copy(bytes, WEBM_SEGMENT_OFFSET);
  return bytes;
};

const forgedWebmWithoutInfoBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => forgedWebmWithoutSequenceBytes(WEBM_INFO_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutTracksBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => forgedWebmWithoutSequenceBytes(WEBM_TRACKS_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutClusterBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) => forgedWebmWithoutSequenceBytes(WEBM_CLUSTER_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutBlockBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 7,
) =>
  forgedWebmWithoutSequenceBytes(WEBM_SIMPLE_BLOCK_ELEMENT_BYTES, size, fill);

const PNG_CRC32_TABLE = Object.freeze(
  Array.from({ length: 256 }, (_entry, index) => {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    return value >>> 0;
  }),
);

const pngCrc32 = (bytes) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = PNG_CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const PNG_SIGNATURE_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const pngChunk = (type, data = Buffer.alloc(0)) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(
    pngCrc32(out.subarray(4, 8 + data.length)),
    8 + data.length,
  );
  return out;
};

const paddedPngBytes = (size, chunks) => {
  const iend = pngChunk("IEND");
  const withoutPadding = Buffer.concat([PNG_SIGNATURE_BYTES, ...chunks, iend]);
  const padLength = size - withoutPadding.length - 12;
  if (padLength < 0) {
    return withoutPadding;
  }
  return Buffer.concat([
    PNG_SIGNATURE_BYTES,
    ...chunks,
    pngChunk("tEXt", Buffer.alloc(padLength, 0x20)),
    iend,
  ]);
};

const pngBytes = (size = 2048, fill = 9, options = {}) => {
  const { width = 1280, height = 720, varied = true } = options;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const stride = width + 1;
  const scanlines = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    scanlines[row * stride] = 0;
    for (let column = 0; column < width; column += 1) {
      scanlines[row * stride + 1 + column] = varied
        ? (fill + (row >> 4) * 17 + (column >> 4) * 31) & 0xff
        : fill & 0xff;
    }
  }
  return paddedPngBytes(size, [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(scanlines, { level: 9 })),
  ]);
};

const uniformPngBytes = (size = 2048, fill = 9, options = {}) =>
  pngBytes(size, fill, { ...options, varied: false });

const pngBytesWithInvalidIdat = (size = 2048, fill = 9) => {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1280, 0);
  ihdr.writeUInt32BE(720, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return paddedPngBytes(size, [
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", Buffer.alloc(256, fill)),
  ]);
};

const forgedPngSignatureOnlyBytes = (size = 2048, fill = 9) => {
  const bytes = Buffer.alloc(size, fill);
  PNG_SIGNATURE_BYTES.copy(bytes, 0);
  return bytes;
};

const screenshotFileFixtures = (fill = 9) =>
  Object.fromEntries(
    REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.map((slot, index) => {
      const bytes = pngBytes(2048, fill + index);
      return [
        slot,
        {
          bytes,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ];
    }),
  );

const writeScreenshotFileFixtures = async (dir, fixtures) => {
  for (const [slot, fixture] of Object.entries(fixtures)) {
    await writeFile(path.join(dir, `${slot}.png`), fixture.bytes);
  }
};

const fileBackedExplorerScreenshots = (fixtures) =>
  videoTranscript().explorerScreenshots.map((entry) => ({
    ...entry,
    relativePath: `${entry.kind}.png`,
    sizeBytes: fixtures[entry.kind].bytes.length,
    sha256: fixtures[entry.kind].sha256,
  }));

const deployment = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  return {
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
    ...rest,
  };
};

const deploymentEvidence = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const routeDeployment = deployment({ bscNetwork: profile.key });
  return {
    schema: "iroha-sccp-bsc-taira-xor-deployment-evidence/v1",
    valid: true,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    bridgeAddress: routeDeployment.bridgeAddress,
    tokenAddress: routeDeployment.tokenAddress,
    sourceBridgeAddress: routeDeployment.sourceBridgeAddress,
    verifierAddress: routeDeployment.verifierAddress,
    verifierCodeHash: routeDeployment.verifierCodeHash,
    verifierKeyHash: routeDeployment.verifierKeyHash,
    destinationBindingHash: routeDeployment.destinationBindingHash,
    destinationBindingKey: bscDestinationBindingKey({
      networkId: profile.networkIdHex,
      verifierAddress: routeDeployment.verifierAddress,
      bridgeAddress: routeDeployment.bridgeAddress,
      verifierCodeHash: routeDeployment.verifierCodeHash,
      verifierKeyHash: routeDeployment.verifierKeyHash,
    }),
    destinationRolloutVersion: 1,
    destinationBindingVersion: 1,
    compiledContractCodeHashes: {
      token: HASH_33,
      bridge: HASH_44,
      sourceBridge: HASH_55,
      verifier: routeDeployment.verifierCodeHash,
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
        verifier: routeDeployment.verifierCodeHash,
      },
      tokenAddress: routeDeployment.tokenAddress,
      bridgeAddress: routeDeployment.bridgeAddress,
      sourceBridgeAddress: routeDeployment.sourceBridgeAddress,
      verifierAddress: routeDeployment.verifierAddress,
      tokenBridgeAddress: routeDeployment.bridgeAddress,
      tokenBridgeLocked: true,
      sourceBridgeOwner: routeDeployment.bridgeAddress,
      bridgeDestinationBindingHash: routeDeployment.destinationBindingHash,
      bridgeVerifierAddress: routeDeployment.verifierAddress,
      bridgeVerifierCodeHash: routeDeployment.verifierCodeHash,
      bridgeVerifierKeyHash: routeDeployment.verifierKeyHash,
      verifierKeyHash: routeDeployment.verifierKeyHash,
      bridgeNetworkId: profile.networkIdHex,
      bridgeSourceDomain: 0,
      bridgeTargetDomain: 2,
    },
    productionPlaceholderFree: true,
    publicDeploymentMatches: true,
    ...rest,
  };
};

const smokeFixtureMaterial = () => ({
  alpha1: SMOKE_FIXTURE_G1,
  beta2: SMOKE_FIXTURE_G2,
  gamma2: SMOKE_FIXTURE_G2,
  delta2: SMOKE_FIXTURE_G2,
  ic: SMOKE_FIXTURE_IC,
});

const postDeployLiveEvidence = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  return {
    fullTomlReady: true,
    sourceBridgeConfigHash: HASH_44,
    sourceEventTransactionId: HASH_55,
    sourceEventExplorerUrl: `${profile.explorerUrl}/tx/${HASH_55}`,
    routeCanaryEvidenceHash: HASH_66,
    routeCanaryTransactionId: HASH_77,
    routeCanaryExplorerUrl: `${profile.explorerUrl}/tx/${HASH_77}`,
    offlineFullTomlSha256: HASH_88,
    ...rest,
  };
};

const routeReport = (overrides = {}) => {
  const {
    bscNetwork = "testnet",
    generatedAt,
    generatedAtMs,
    ...rest
  } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const effectiveGeneratedAtMs = generatedAtMs ?? NOW_MS - 1_000;
  const networkCheckId =
    profile.key === "testnet"
      ? "bsc-testnet-network-id"
      : "bsc-mainnet-network-id";
  const chainCheckId =
    profile.key === "testnet" ? "bsc-testnet-chain-id" : "bsc-mainnet-chain-id";
  return {
    ready: true,
    generatedAt:
      generatedAt ??
      (Number.isSafeInteger(effectiveGeneratedAtMs)
        ? new Date(effectiveGeneratedAtMs).toISOString()
        : new Date(NOW_MS - 1_000).toISOString()),
    generatedAtMs: effectiveGeneratedAtMs,
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
    deployment: deployment({ bscNetwork: profile.key }),
    postDeployLiveEvidence: postDeployLiveEvidence({
      bscNetwork: profile.key,
    }),
    checks: [
      ...REQUIRED_ROUTE_PREFLIGHT_COMMON_CHECK_IDS.filter(
        (id) => id !== "bsc-testnet-chain-id",
      ),
      chainCheckId,
      networkCheckId,
    ].map((id) => ({
      id,
      ok: true,
      message: `${id} ready`,
    })),
    ...rest,
  };
};

const peerAuditReport = (overrides = {}) => {
  const {
    bscNetwork = "testnet",
    generatedAt,
    generatedAtMs,
    peers: overridePeers,
    peerCount: overridePeerCount,
    ...rest
  } = overrides;
  const effectiveGeneratedAtMs = generatedAtMs ?? NOW_MS - 1_000;
  const peers =
    overridePeers ??
    Array.from({ length: 4 }, (_, index) => ({
      source: `peer${index}.toml`,
      routeCount: 0,
      rawTomlSha256: HASH_11,
      sanitizedStanzaSha256: HASH_22,
      sanitizedStanzaFileChecked: true,
      sanitizedStanzaFileVerified: true,
      sanitizedStanzaFileSha256: HASH_22,
      productionReady: false,
      ready: true,
      manifestFingerprint: null,
      deployment: null,
      postDeployLiveEvidence: null,
      hashRoleProblems: [],
      burnRecordMaterialProblems: [],
      failedChecks: [],
    }));
  const peerCount = Object.hasOwn(overrides, "peerCount")
    ? overridePeerCount
    : peers.length;
  return {
    ready: true,
    generatedAt:
      generatedAt ??
      (Number.isSafeInteger(effectiveGeneratedAtMs)
        ? new Date(effectiveGeneratedAtMs).toISOString()
        : new Date(NOW_MS - 1_000).toISOString()),
    generatedAtMs: effectiveGeneratedAtMs,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    peerCount,
    manifestFingerprint: null,
    sanitizedStanzaFilesChecked: true,
    checks: [
      { id: "peer-config-files", ok: true, message: "ready" },
      { id: "peer-route-count", ok: true, message: "ready" },
      { id: "peer-route-consistency", ok: true, message: "ready" },
      { id: "peer-route-production-readiness", ok: true, message: "ready" },
      { id: "peer-route-burn-record-material", ok: true, message: "ready" },
      { id: "peer-route-hash-role-separation", ok: true, message: "ready" },
      { id: "peer-audit-runbook-contract", ok: true, message: "ready" },
    ],
    peers,
    ...rest,
  };
};

const smokeProverManifest = (direction = "destination", overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const proofExport =
    direction === "source" ? "bscSccpSourceProve" : "bscSccpProve";
  const selfTestExport =
    direction === "source"
      ? "bscSccpSourceNativeProverSelfTest"
      : "bscSccpNativeProverSelfTest";
  return {
    schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
    moduleUrl:
      direction === "source"
        ? "/sccp-bsc/source.js"
        : "/sccp-bsc/destination.js",
    kind: direction === "source" ? "bsc-source" : "bsc-destination",
    exports: [proofExport, selfTestExport],
    acceptedExport: proofExport,
    acceptedSelfTestExport: selfTestExport,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    tairaChainId: BSC_TAIRA_CHAIN_ID,
    tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    bscNetwork: profile.key,
    bscChain: profile.chain,
    bscChainIdHex: profile.chainIdHex,
    bscNetworkIdHex: profile.networkIdHex,
    moduleSha256: direction === "source" ? HASH_33 : HASH_11,
    proofArtifactHash: HASH_44,
    provingKeyHash: HASH_66,
    nativeEvmProverBundleHash: HASH_99,
    deployment: deployment({ bscNetwork: profile.key }),
    postDeployLiveEvidence: postDeployLiveEvidence({
      bscNetwork: profile.key,
    }),
    ...rest,
  };
};

const inventorySidecarManifest = (
  direction = "destination",
  overrides = {},
) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const moduleSha256 = direction === "source" ? HASH_33 : HASH_11;
  return {
    schema: SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA,
    moduleUrl:
      direction === "source"
        ? "./public/sccp-bsc/source.js"
        : "./public/sccp-bsc/destination.js",
    direction,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    tairaChainId: BSC_TAIRA_CHAIN_ID,
    tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
    bscNetwork: profile.key,
    bscChain: profile.chain,
    bscChainIdHex: profile.chainIdHex,
    bscNetworkIdHex: profile.networkIdHex,
    moduleSha256,
    proofArtifactHash: HASH_44,
    provingKeyHash: HASH_66,
    nativeEvmProverBundleHash: HASH_99,
    acceptedExport:
      direction === "source" ? "bscSccpSourceProve" : "bscSccpProve",
    acceptedSelfTestExport:
      direction === "source"
        ? "bscSccpSourceNativeProverSelfTest"
        : "bscSccpNativeProverSelfTest",
    deployment: deployment({ bscNetwork: profile.key }),
    postDeployLiveEvidence: postDeployLiveEvidence({
      bscNetwork: profile.key,
    }),
    ...rest,
  };
};

const smokeReadinessReport = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  return {
    ready: true,
    checkedAt: SMOKE_CHECKED_AT,
    routeReady: true,
    route: {
      manifestSource: "torii",
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
      deployment: deployment({ bscNetwork: profile.key }),
      postDeployLiveEvidence: postDeployLiveEvidence({
        bscNetwork: profile.key,
      }),
    },
    peerAudit: peerAuditReport({ bscNetwork: profile.key }),
    checks: [
      { id: "route-preflight", status: "pass", message: "ready" },
      { id: "peer-config-audit", status: "pass", message: "ready" },
      { id: "walletconnect-project-id", status: "pass", message: "ready" },
      { id: "runtime-prover-config", status: "pass", message: "ready" },
      { id: "destination-prover-module", status: "pass", message: "ready" },
      { id: "destination-prover-manifest", status: "pass", message: "ready" },
      { id: "source-prover-module", status: "pass", message: "ready" },
      { id: "source-prover-manifest", status: "pass", message: "ready" },
      {
        id: "smoke-readiness-runbook-contract",
        status: "pass",
        message: "ready",
      },
    ],
    provers: {
      destination: {
        moduleUrl: "/sccp-bsc/destination.js",
        manifestUrl: "/sccp-bsc/destination.js.manifest.json",
        manifest: smokeProverManifest("destination", {
          bscNetwork: profile.key,
        }),
      },
      source: {
        moduleUrl: "/sccp-bsc/source.js",
        manifestUrl: "/sccp-bsc/source.js.manifest.json",
        manifest: smokeProverManifest("source", {
          bscNetwork: profile.key,
        }),
      },
      runtimeConfig: {
        required: true,
        configUrl: "/sccp-bsc/taira-bsc-xor-prover.config.json",
        configSha256: HASH_55,
        manifest: {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          tairaChainId: BSC_TAIRA_CHAIN_ID,
          tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
          bscNetwork: profile.key,
          bscChain: profile.chain,
          bscChainIdHex: profile.chainIdHex,
          bscNetworkIdHex: profile.networkIdHex,
          destination: {
            nativeProverBundleUrl: "/sccp-bsc/native-prover-bundle.json",
            nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
            nativeProverBundleSha256: HASH_77,
            nativeEvmProverBundleHash: HASH_99,
            nativeProverVerifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
            proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
            proofArtifactSha256: HASH_44,
            provingKeyUrl: "/sccp-bsc/proving-key.zkey",
            provingKeySha256: HASH_66,
            verifierKeyUrl: "/sccp-bsc/verifier-key.json",
            verifierKeySha256: HASH_55,
            backendModuleUrl: "/sccp-bsc/backend.js",
            backendModuleSha256: HASH_11,
            backendSelfContained: true,
            backendAcceptedExport: "bscSccpProve",
            backendAcceptedSelfTestExport: "bscSccpNativeProverSelfTest",
          },
          source: {
            nativeProverBundleUrl: "/sccp-bsc/source-native-prover-bundle.json",
            nativeProverArtifactBaseUrl: "/sccp-bsc/source-native-prover/",
            nativeProverBundleSha256: HASH_88,
            nativeEvmProverBundleHash: HASH_99,
            nativeProverVerifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
            proofArtifactUrl: "/sccp-bsc/source-proof-artifact.r1cs",
            proofArtifactSha256: HASH_44,
            provingKeyUrl: "/sccp-bsc/source-proving-key.zkey",
            provingKeySha256: HASH_66,
            verifierKeyUrl: "/sccp-bsc/source-verifier-key.json",
            verifierKeySha256: HASH_55,
            backendModuleUrl: "/sccp-bsc/source-backend.js",
            backendModuleSha256: HASH_33,
            backendSelfContained: true,
            backendAcceptedExport: "bscSccpSourceProve",
            backendAcceptedSelfTestExport: "bscSccpSourceNativeProverSelfTest",
          },
        },
      },
    },
    ...rest,
  };
};

const materialInventoryReport = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  const requirementsContractHash = bscProductionRequirementsContractHash(
    profile.key,
  );
  return {
    schema: "iroha-demo-sccp-bsc-production-material-inventory/v1",
    ready: true,
    generatedAt: SMOKE_CHECKED_AT,
    routeId: SCCP_BSC_XOR_ROUTE_ID,
    assetKey: SCCP_BSC_XOR_ASSET_KEY,
    scanRoots: ["./output/sccp-bsc-production", "./public/sccp-bsc"],
    scanRootStatuses: [
      { path: "./output/sccp-bsc-production", ok: true, kind: "directory" },
      { path: "./public/sccp-bsc", ok: true, kind: "directory" },
    ],
    checks: [
      { id: "material-scan-complete", ok: true, message: "ready" },
      { id: "scan-root-availability", ok: true, message: "ready" },
      {
        id: "artifact-secret-and-diagnostic-scan",
        ok: true,
        message: "clean",
      },
      {
        id: "production-requirements-artifact",
        ok: true,
        message: "ready",
      },
      {
        id: "deployment-evidence-artifact",
        ok: true,
        message: "ready",
      },
      { id: "production-route-artifact", ok: true, message: "ready" },
      {
        id: "offline-full-toml-evidence-artifact",
        ok: true,
        message: "ready",
      },
      {
        id: "production-burn-record-material",
        ok: true,
        message: "ready",
      },
      { id: "production-verifier-material", ok: true, message: "ready" },
      { id: "source-parity-attestation", ok: true, message: "ready" },
      { id: "groth16-material-manifest", ok: true, message: "ready" },
      {
        id: "groth16-attestation-role-readiness",
        ok: true,
        message: "ready",
      },
      {
        id: "groth16-attestation-request-package",
        ok: true,
        message: "ready",
      },
      { id: "groth16-attestation-handoff", ok: true, message: "ready" },
      { id: "groth16-proof-self-test-report", ok: true, message: "ready" },
      { id: "native-evm-prover-bundle", ok: true, message: "ready" },
      { id: "production-proof-files", ok: true, message: "ready" },
      { id: "destination-browser-prover", ok: true, message: "ready" },
      { id: "source-browser-prover", ok: true, message: "ready" },
      { id: "runtime-prover-config", ok: true, message: "ready" },
      { id: "route-report-binding", ok: true, message: "ready" },
      {
        id: "material-inventory-runbook-contract",
        ok: true,
        message: "ready",
      },
    ],
    route: {
      ready: true,
      manifestSource: "torii",
      bsc: {
        network: profile.key,
        chain: profile.chain,
        chainIdHex: profile.chainIdHex,
        networkIdHex: profile.networkIdHex,
        explorerUrl: profile.explorerUrl,
        explorerHost: profile.explorerHost,
      },
      deployment: deployment({ bscNetwork: profile.key }),
      postDeployLiveEvidence: postDeployLiveEvidence({
        bscNetwork: profile.key,
      }),
    },
    counts: {
      files: 20,
      relevantFilesSeen: 20,
      maxFiles: 2000,
      truncated: false,
      productionRouteArtifacts: 1,
      productionOfflineFullTomlEvidenceArtifacts: 1,
      productionDeploymentEvidenceArtifacts: 1,
      productionTairaBurnRecordContracts: 1,
      productionVerifierArtifacts: 1,
      sourceParityAttestations: 1,
      productionGroth16MaterialManifests: 1,
      productionGroth16AttestationRequestPackages: 1,
      routeBoundGroth16AttestationHandoffs: 1,
      productionGroth16ProofSelfTestReports: 1,
      productionNativeProverBundles: 1,
      productionRequirementsArtifacts: 1,
      compiledContractArtifacts: 4,
      browserProverSidecars: 2,
      proofArtifacts: 1,
      provingKeys: 1,
      proofArtifactCandidates: 1,
      provingKeyCandidates: 1,
      criticalFindings: 0,
      warningFindings: 0,
      skippedGeneratedDirectories: 0,
    },
    skippedGeneratedDirectories: [],
    files: [
      {
        path: "./output/sccp-bsc-production/taira-bsc-xor-route.production.json",
        kind: "route",
        sizeBytes: 4096,
        sha256: HASH_11,
        route: {
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          productionReady: true,
          verifierCodeHash: HASH_11,
          verifierKeyHash: HASH_22,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          nativeEvmProverBundleHash: HASH_99,
          destinationBindingHash: HASH_33,
          bridgeAddress: BSC_BRIDGE_ADDRESS,
          tokenAddress: BSC_TOKEN_ADDRESS,
          sourceBridgeAddress: BSC_SOURCE_BRIDGE_ADDRESS,
          verifierAddress: BSC_VERIFIER_ADDRESS,
          explorerUrl: profile.explorerUrl,
          explorerHost: profile.explorerHost,
          explorerBindingMatches: true,
          postDeployLiveEvidence: postDeployLiveEvidence({
            bscNetwork: profile.key,
          }),
          burnRecordArtifactSha256: HASH_12,
          disabled: false,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/taira-bsc-xor-burn-record.contract.json",
        kind: "taira-burn-record-contract",
        sizeBytes: 4096,
        sha256: HASH_13,
        tairaBurnRecordContract: {
          valid: true,
          schema: "iroha-sccp-taira-xor-burn-record-contract/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          sourceName: "contracts/taira/sccp/TairaXorBscSccpBurnRecord.ko",
          compilerFingerprint: "kotodama_lang/2.0.0-rc.2.0",
          codeHash: HASH_14,
          abiHash: HASH_15,
          artifactSha256: HASH_12,
          artifactSizeBytes: 4096,
          artifactProductionProblemCount: 0,
          entrypoint: "burn_and_record",
          permission: "AssetTransferRole",
          paramSignature:
            "sender:AccountId,settlement_asset:AssetDefinitionId,amount:int,record_instruction:Blob",
          executable: "IvmProved",
          forceZkMode: true,
          settlementInstruction: "Burn<Numeric, Asset>",
          recordInstruction: "RecordSccpMessage",
          routeArtifactHashMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/taira-bsc-xor-production-requirements.json",
        kind: "production-requirements",
        sizeBytes: 4096,
        sha256: HASH_88,
        productionRequirements: {
          valid: true,
          schema: "iroha-sccp-bsc-taira-xor-production-requirements/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          inputCount: 41,
          requiredReportCount: 5,
          deniedVerifierKeyHashCount: 1,
          contractHash: requirementsContractHash,
          expectedContractHash: requirementsContractHash,
          contractMatchesExpected: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/source-parity-attestation.json",
        kind: "source-parity-attestation",
        sizeBytes: 4096,
        sha256: HASH_55,
        sourceParityAttestation: {
          valid: true,
          schema: "iroha-sccp-bsc-native-evm-source-parity-attestation/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chain: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          domain: 2,
          proofBackend: "evm-groth16-bn254-v1",
          requiredMarkers: sourceParityRequiredMarkers(profile),
          sourceTreeHash: HASH_33,
          expectedSourceTreeHash: HASH_33,
          sourceTreeHashMatches: true,
          sdkCount: Object.keys(
            SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
          ).length,
          sdks: Object.fromEntries(
            Object.entries(
              SCCP_ETH_NATIVE_EVM_PROVER_REQUIRED_IMPLEMENTATIONS_V1,
            ).map(([sdk, implementation], index) => [
              sdk,
              {
                implementation,
                implementationHash: fixtureHash(
                  `bsc source parity ${profile.key} ${sdk} ${index}`,
                ),
                expectedImplementationHash: fixtureHash(
                  `bsc source parity ${profile.key} ${sdk} ${index}`,
                ),
                implementationHashMatches: true,
                fileCount: 1,
              },
            ]),
          ),
        },
        findings: [],
      },
      ...Object.keys(BSC_COMPILED_CONTRACTS).map(compiledContractFile),
      {
        path: "./output/sccp-bsc-production/native-prover/groth16-material.manifest.json",
        kind: "groth16-material-manifest",
        sizeBytes: 4096,
        sha256: HASH_12,
        groth16MaterialManifest: {
          valid: true,
          schema: "iroha-sccp-bsc-groth16-material-manifest/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chain: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          proofBackend: "evm-groth16-bn254-v1",
          proofFamily: "stark-fri-v1",
          sourceDomain: 0,
          targetDomain: 2,
          circuitProfile: "sccp-bsc-full-message-v1",
          publicInputCount: 9,
          publicSignalNames: [],
          productionReady: true,
          productionBlockerCount: 0,
          verifierKeyHash: HASH_22,
          circuitSourceHash: HASH_13,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          bscVerifierKeyArtifactHash: HASH_55,
          snarkjsVerificationKeyHash: HASH_14,
          trustedSetupTranscriptHash: HASH_15,
          reproducibleBuildTranscriptHash: HASH_16,
          referencedTranscriptsVerified: true,
          referencedAttestationsVerified: true,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/native-prover/groth16-attestation-request.json",
        kind: "groth16-attestation-request-package",
        sizeBytes: 4096,
        sha256: HASH_13,
        groth16AttestationRequestPackage: {
          valid: true,
          schema: "iroha-sccp-bsc-groth16-attestation-request-package/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chain: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          circuitProfile: "sccp-bsc-full-message-v1",
          publicInputCount: 9,
          publicSignalNames: [],
          verifierKeyHash: HASH_22,
          circuitSourceHash: HASH_13,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          bscVerifierKeyArtifactHash: HASH_55,
          snarkjsVerificationKeyHash: HASH_14,
          trustedSetupTranscriptHash: HASH_15,
          reproducibleBuildTranscriptHash: HASH_16,
          manifestPath: "native-prover/groth16-material.manifest.json",
          manifestSha256: HASH_12,
          manifestProductionReady: true,
          manifestProductionBlockerCount: 0,
          roles: {},
          allRolesReady: true,
          referencedManifestVerified: true,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/native-prover/groth16-attestation-handoff.json",
        kind: "groth16-attestation-handoff",
        sizeBytes: 4096,
        sha256: HASH_18,
        groth16AttestationHandoff: {
          valid: true,
          schema: BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA,
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chain: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          circuitProfile: "sccp-bsc-full-message-v1",
          proofBackend: "evm-groth16-bn254-v1",
          verifierKeyHash: HASH_22,
          manifestPath: "native-prover/groth16-material.manifest.json",
          manifestSha256: HASH_12,
          manifestProductionReady: true,
          manifestProductionBlockerCount: 0,
          manifestProductionBlockers: [],
          manifestProductionBlockerSummary: "",
          packages: {
            attestationRequest: {
              path: "native-prover/groth16-attestation-request.json",
              sha256: HASH_13,
              schema: "iroha-sccp-bsc-groth16-attestation-request-package/v1",
            },
          },
          attestationRequestPath:
            "native-prover/groth16-attestation-request.json",
          attestationRequestSha256: HASH_13,
          handoffComplete: true,
          signingReady: true,
          readyToFinalize: true,
          requestValid: true,
          roleReadiness: {
            semanticSccpCircuit: true,
            circuitSecurity: true,
            trustedSetup: true,
            reproducibleBuild: true,
          },
          allRolesReady: true,
          missingSignedRoles: [],
          handoffBlockers: [],
          attestationStatusProblemCount: 0,
          attestationStatusProblemSummary: "",
          readinessProductionReady: true,
          readinessProductionBlockers: [],
          problemCount: 0,
          nextActions: [],
          referencedRequestVerified: true,
          referencedManifestVerified: true,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/native-prover/groth16-proof-self-test.json",
        kind: "groth16-proof-self-test-report",
        sizeBytes: 4096,
        sha256: HASH_14,
        groth16ProofSelfTestReport: {
          valid: true,
          schema: "iroha-sccp-bsc-groth16-proof-self-test/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chain: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          circuitProfile: "sccp-bsc-full-message-v1",
          proofBackend: "evm-groth16-bn254-v1",
          proofFamily: "stark-fri-v1",
          manifestPath: "native-prover/groth16-material.manifest.json",
          manifestSha256: HASH_12,
          manifestProductionReady: true,
          manifestProductionBlockerCount: 0,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          bscVerifierKeyArtifactHash: HASH_55,
          snarkjsVerificationKeyHash: HASH_14,
          witnessWasmHash: HASH_15,
          witnessHash: HASH_16,
          proofHash: HASH_17,
          publicSignalsHash: HASH_18,
          publicSignalNames: [],
          referencedManifestVerified: true,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/taira-bsc-xor-deployment.evidence.json",
        kind: "deployment-evidence",
        sizeBytes: 4096,
        sha256: HASH_77,
        deploymentEvidence: deploymentEvidence({ bscNetwork: profile.key }),
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/verifier-key.json",
        kind: "verifier",
        sizeBytes: 4096,
        sha256: HASH_55,
        verifier: {
          verifierKeyHash: HASH_22,
          network: profile.chain,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          sourceDomain: 0,
          targetDomain: 2,
          requiresVerifierBinding: true,
          bscNetworkBound: true,
          bscRouteDomainBound: true,
          fixtureShaped: false,
          g1MaterialValid: true,
          g1MaterialProblems: [],
          g2MaterialValid: true,
          g2MaterialProblems: [],
          expectedVerifierKeyHash: HASH_22,
          hashMatchesPublicRoute: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/native-prover/bundle.json",
        kind: "native-prover-bundle",
        sizeBytes: 8192,
        sha256: HASH_99,
        nativeProverBundle: {
          valid: true,
          bundleId:
            profile.key === "mainnet"
              ? "sccp-bsc-mainnet-native-evm-prover-bundle-v1"
              : "sccp-bsc-testnet-native-evm-prover-bundle-v1",
          chain: profile.chain,
          domain: 2,
          nativeEvmProverBundleHash: HASH_99,
          verifierKeyHash: HASH_22,
          verifierKeyArtifactHash: HASH_55,
          proofArtifactHash: HASH_44,
          provingKeyHash: HASH_66,
          groth16ProofSelfTestHash: HASH_88,
          destinationBindingHash: HASH_33,
          auditHashesProduction: true,
          auditHashIssueCount: 0,
          artifactsVerified: true,
          verifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
          publicDeploymentMatches: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/proof-artifact.r1cs",
        kind: "proof-artifact",
        sizeBytes: 96 * 1024,
        sha256: HASH_44,
        proofFile: {
          isProofArtifact: true,
          isProvingKey: false,
          productionSized: true,
          productionMaxSized: true,
          maxSizeBytes: SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
          productionEntropy: true,
          productionFormat: true,
          hashMatchesPublicRoute: true,
          expectedHash: HASH_44,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/proving-key.zkey",
        kind: "proving-key",
        sizeBytes: 96 * 1024,
        sha256: HASH_66,
        proofFile: {
          isProofArtifact: false,
          isProvingKey: true,
          productionSized: true,
          productionMaxSized: true,
          maxSizeBytes: SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
          productionEntropy: true,
          productionFormat: true,
          hashMatchesPublicRoute: true,
          expectedHash: HASH_66,
        },
        findings: [],
      },
      {
        path: "./public/sccp-bsc/destination.js.manifest.json",
        kind: "browser-prover-sidecar",
        sizeBytes: 1024,
        sha256: HASH_77,
        browserProverSidecar: {
          schema: LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
          modulePath: "./public/sccp-bsc/destination.js",
          moduleSha256: HASH_11,
          moduleSha256Actual: HASH_11,
          exports: ["bscSccpProve", "bscSccpNativeProverSelfTest"],
          valid: true,
        },
        findings: [],
      },
      {
        path: "./public/sccp-bsc/source.js.manifest.json",
        kind: "browser-prover-sidecar",
        sizeBytes: 1024,
        sha256: HASH_88,
        browserProverSidecar: {
          schema: LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA,
          modulePath: "./public/sccp-bsc/source.js",
          moduleSha256: HASH_33,
          moduleSha256Actual: HASH_33,
          exports: ["bscSccpSourceProve", "bscSccpSourceNativeProverSelfTest"],
          valid: true,
        },
        findings: [],
      },
      {
        path: "./output/sccp-bsc-production/taira-bsc-xor-route.full-taira-config.evidence.json",
        kind: "offline-full-toml-evidence",
        sizeBytes: 2048,
        sha256: HASH_99,
        offlineFullTomlEvidence: {
          valid: true,
          schema: "iroha-sccp-bsc-taira-xor-offline-full-toml-evidence/v1",
          routeId: SCCP_BSC_XOR_ROUTE_ID,
          assetKey: SCCP_BSC_XOR_ASSET_KEY,
          bscNetwork: profile.key,
          chainIdHex: profile.chainIdHex,
          networkIdHex: profile.networkIdHex,
          fullTomlReady: true,
          offlineFullTomlSha256: HASH_88,
          hashInputSha256: HASH_88,
          renderedTomlSha256: HASH_77,
          hashMode:
            "sha256:merged-full-config-without-post_deploy_offline_full_toml_sha256",
          routeManifestPath:
            "output/sccp-bsc-production/taira-bsc-xor-route.manifest.json",
          fullConfigPath:
            "output/sccp-bsc-production/taira-bsc-xor-full-config.toml",
          publicPostDeployMatches: true,
        },
        findings: [],
      },
    ],
    browserProvers: {
      destination: {
        ok: true,
        module: {
          moduleUrl: "./public/sccp-bsc/destination.js",
          path: "./public/sccp-bsc/destination.js",
          sizeBytes: 4096,
          sha256: HASH_11,
          ok: true,
        },
        sidecar: {
          path: "./public/sccp-bsc/destination.js.manifest.json",
          sizeBytes: 2048,
          sha256: HASH_22,
          moduleSha256: HASH_11,
          ok: true,
          manifest: inventorySidecarManifest("destination", {
            bscNetwork: profile.key,
          }),
        },
      },
      source: {
        ok: true,
        module: {
          moduleUrl: "./public/sccp-bsc/source.js",
          path: "./public/sccp-bsc/source.js",
          sizeBytes: 4096,
          sha256: HASH_33,
          ok: true,
        },
        sidecar: {
          path: "./public/sccp-bsc/source.js.manifest.json",
          sizeBytes: 2048,
          sha256: HASH_44,
          moduleSha256: HASH_33,
          ok: true,
          manifest: inventorySidecarManifest("source", {
            bscNetwork: profile.key,
          }),
        },
      },
    },
    runtimeProverConfig: {
      ok: true,
      required: true,
      configUrl: "/sccp-bsc/taira-bsc-xor-prover.config.json",
      path: "./public/sccp-bsc/taira-bsc-xor-prover.config.json",
      sizeBytes: 4096,
      sha256: HASH_55,
      manifest: {
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        tairaChainId: BSC_TAIRA_CHAIN_ID,
        tairaNetworkPrefix: BSC_TAIRA_NETWORK_PREFIX,
        bscNetwork: profile.key,
        bscChain: profile.chain,
        bscChainIdHex: profile.chainIdHex,
        bscNetworkIdHex: profile.networkIdHex,
        destination: {
          nativeProverBundleUrl: "/sccp-bsc/native-prover-bundle.json",
          nativeProverArtifactBaseUrl: "/sccp-bsc/native-prover/",
          nativeProverBundleSha256: HASH_77,
          nativeEvmProverBundleHash: HASH_99,
          nativeProverVerifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
          proofArtifactUrl: "/sccp-bsc/proof-artifact.r1cs",
          proofArtifactSha256: HASH_44,
          provingKeyUrl: "/sccp-bsc/proving-key.zkey",
          provingKeySha256: HASH_66,
          verifierKeyUrl: "/sccp-bsc/verifier-key.json",
          verifierKeySha256: HASH_55,
          backendModuleUrl: "/sccp-bsc/backend.js",
          backendModuleSha256: HASH_11,
          backendSelfContained: true,
          backendAcceptedExport: "bscSccpProve",
          backendAcceptedSelfTestExport: "bscSccpNativeProverSelfTest",
        },
        source: {
          nativeProverBundleUrl: "/sccp-bsc/source-native-prover-bundle.json",
          nativeProverArtifactBaseUrl: "/sccp-bsc/source-native-prover/",
          nativeProverBundleSha256: HASH_88,
          nativeEvmProverBundleHash: HASH_99,
          nativeProverVerifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
          proofArtifactUrl: "/sccp-bsc/source-proof-artifact.r1cs",
          proofArtifactSha256: HASH_44,
          provingKeyUrl: "/sccp-bsc/source-proving-key.zkey",
          provingKeySha256: HASH_66,
          verifierKeyUrl: "/sccp-bsc/source-verifier-key.json",
          verifierKeySha256: HASH_55,
          backendModuleUrl: "/sccp-bsc/source-backend.js",
          backendModuleSha256: HASH_33,
          backendSelfContained: true,
          backendAcceptedExport: "bscSccpSourceProve",
          backendAcceptedSelfTestExport: "bscSccpSourceNativeProverSelfTest",
        },
      },
    },
    ...rest,
  };
};

const tairaTx = (hash) =>
  `https://taira-explorer.sora.org/transactions/${hash.slice(2)}`;
const bscTx = (hash, bscNetwork = "testnet") =>
  `${resolveBscNetworkProfile(bscNetwork).explorerUrl}/tx/${hash}`;
const transactionLinks = (bscNetwork = "testnet") => [
  { label: "TAIRA source transaction", href: tairaTx(VIDEO_HASH_AA) },
  {
    label: "BSC finalize transaction",
    href: bscTx(VIDEO_HASH_BB, bscNetwork),
  },
  { label: "BSC burn transaction", href: bscTx(VIDEO_HASH_CC, bscNetwork) },
  { label: "TAIRA settlement transaction", href: tairaTx(VIDEO_HASH_DD) },
];
const expectedVideoEvidence = (bscNetwork = "testnet") => {
  const profile = resolveBscNetworkProfile(bscNetwork);
  return [
    "TAIRA source transaction from the SCCP UI",
    `${profile.label} finalize transaction shown in explorer`,
    "BSC burn transaction shown in explorer",
    "TAIRA settlement transaction shown in explorer",
  ];
};
const emptyVideoMissingEvidence = () => ({
  transactionSlots: [],
  explorerScreenshotSlots: [],
  duplicateTransactionSlots: [],
  duplicateExplorerScreenshotSlots: [],
  invalidExplorerScreenshotSlots: [],
  unexpectedExplorerScreenshotKinds: [],
  readiness: [],
  videoArtifacts: [],
  videoTimeline: [],
});
const videoEvidence = () => ({
  proofComplete: true,
  missingTransactionSlots: [],
  missingExplorerScreenshotSlots: [],
  duplicateTransactionSlots: [],
  duplicateExplorerScreenshotSlots: [],
  invalidExplorerScreenshotSlots: [],
  unexpectedExplorerScreenshotKinds: [],
  readinessEvidence: {
    ready: true,
    missingReadinessEvidence: [],
  },
  postDeployTransactionEvidence: {
    ready: true,
    reusedPostDeployTransactionSlots: [],
    reusedPostDeployTransactions: [],
  },
  videoArtifactEvidence: {
    ready: true,
    missingVideoArtifacts: [],
    capturedArtifacts: [
      {
        relativePath: VIDEO_ARTIFACT.relativePath,
        sizeBytes: VIDEO_ARTIFACT.sizeBytes,
        sha256: VIDEO_ARTIFACT.sha256,
        mediaType: VIDEO_ARTIFACT.mediaType,
      },
    ],
  },
  timelineEvidence: {
    ready: true,
    durationMs: 60_000,
    missingVideoTimeline: [],
  },
});

const videoTranscript = (overrides = {}) => {
  const { bscNetwork = "testnet", ...rest } = overrides;
  const profile = resolveBscNetworkProfile(bscNetwork);
  return {
    schema: "iroha-demo-sccp-bsc-live-video/v1",
    startedAtMs: NOW_MS - 61_000,
    endedAtMs: NOW_MS - 1_000,
    durationMs: 60_000,
    outputDir: "output/sccp-bsc-live-proof/test-run",
    proofComplete: true,
    preflightReady: true,
    smokeReadinessReady: true,
    bsc: {
      network: profile.key,
      chain: profile.chain,
      chainIdHex: profile.chainIdHex,
      networkIdHex: profile.networkIdHex,
      explorerUrl: profile.explorerUrl,
      explorerHost: profile.explorerHost,
    },
    readinessBinding: {
      checkedAt: SMOKE_CHECKED_AT,
      routeReady: true,
      smokeReadinessReady: true,
      checks: smokeReadinessReport({ bscNetwork: profile.key }).checks.map(
        (entry) => ({
          id: entry.id,
          ok: true,
          status: "pass",
          message: entry.message,
        }),
      ),
      route: {
        manifestSource: "torii",
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
        deployment: deployment({ bscNetwork: profile.key }),
        postDeployLiveEvidence: postDeployLiveEvidence({
          bscNetwork: profile.key,
        }),
      },
      peerAudit: {
        ready: true,
        routeId: SCCP_BSC_XOR_ROUTE_ID,
        assetKey: SCCP_BSC_XOR_ASSET_KEY,
        peerCount: 4,
        manifestFingerprint: null,
        sanitizedStanzaFilesChecked: true,
      },
    },
    flowOrder: [...REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS],
    expectedEvidence: expectedVideoEvidence(profile.key),
    videoArtifacts: [VIDEO_ARTIFACT],
    transactions: {
      tairaSourceTx: tairaTx(VIDEO_HASH_AA),
      bscFinalizeTx: bscTx(VIDEO_HASH_BB, profile.key),
      bscBurnTx: bscTx(VIDEO_HASH_CC, profile.key),
      tairaSettlementTx: tairaTx(VIDEO_HASH_DD),
    },
    transactionLinks: transactionLinks(profile.key),
    explorerScreenshots: [
      screenshotProof("tairaSourceTx", tairaTx(VIDEO_HASH_AA)),
      screenshotProof("bscFinalizeTx", bscTx(VIDEO_HASH_BB, profile.key)),
      screenshotProof("bscBurnTx", bscTx(VIDEO_HASH_CC, profile.key)),
      screenshotProof("tairaSettlementTx", tairaTx(VIDEO_HASH_DD)),
    ],
    evidence: videoEvidence(),
    operatorNotes: SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
    missingEvidence: emptyVideoMissingEvidence(),
    ...rest,
  };
};

const evaluate = (overrides = {}) =>
  evaluateBscSccpProductionGate({
    routeReport: routeReport(),
    peerAuditReport: peerAuditReport(),
    smokeReadinessReport: smokeReadinessReport(),
    materialInventoryReport: materialInventoryReport(),
    videoTranscript: videoTranscript(),
    checkedAt: NOW_ISO,
    requireReverifiedVideoProofFiles: false,
    ...overrides,
  });

const reportsWithPostDeployEvidence = (evidenceOverrides = {}) => {
  const evidence = postDeployLiveEvidence(evidenceOverrides);
  const basePeerAudit = peerAuditReport();
  const baseSmoke = smokeReadinessReport();
  const baseInventory = materialInventoryReport();
  const baseVideo = videoTranscript();
  return {
    routeReport: routeReport({ postDeployLiveEvidence: evidence }),
    peerAuditReport: peerAuditReport({
      peers: basePeerAudit.peers.map((peer) => ({
        ...peer,
        postDeployLiveEvidence: evidence,
      })),
    }),
    smokeReadinessReport: smokeReadinessReport({
      route: {
        ...baseSmoke.route,
        postDeployLiveEvidence: evidence,
      },
      peerAudit: {
        ...baseSmoke.peerAudit,
        peers: baseSmoke.peerAudit.peers.map((peer) => ({
          ...peer,
          postDeployLiveEvidence: evidence,
        })),
      },
      provers: {
        ...baseSmoke.provers,
        destination: {
          ...baseSmoke.provers.destination,
          manifest: {
            ...baseSmoke.provers.destination.manifest,
            postDeployLiveEvidence: evidence,
          },
        },
        source: {
          ...baseSmoke.provers.source,
          manifest: {
            ...baseSmoke.provers.source.manifest,
            postDeployLiveEvidence: evidence,
          },
        },
      },
    }),
    materialInventoryReport: materialInventoryReport({
      route: {
        ...baseInventory.route,
        postDeployLiveEvidence: evidence,
      },
      files: baseInventory.files.map((entry) =>
        entry.kind === "route"
          ? {
              ...entry,
              route: {
                ...entry.route,
                postDeployLiveEvidence: evidence,
              },
            }
          : entry,
      ),
      browserProvers: {
        ...baseInventory.browserProvers,
        destination: {
          ...baseInventory.browserProvers.destination,
          sidecar: {
            ...baseInventory.browserProvers.destination.sidecar,
            manifest: {
              ...baseInventory.browserProvers.destination.sidecar.manifest,
              postDeployLiveEvidence: evidence,
            },
          },
        },
        source: {
          ...baseInventory.browserProvers.source,
          sidecar: {
            ...baseInventory.browserProvers.source.sidecar,
            manifest: {
              ...baseInventory.browserProvers.source.sidecar.manifest,
              postDeployLiveEvidence: evidence,
            },
          },
        },
      },
    }),
    videoTranscript: videoTranscript({
      readinessBinding: {
        ...baseVideo.readinessBinding,
        route: {
          ...baseVideo.readinessBinding.route,
          postDeployLiveEvidence: evidence,
        },
      },
    }),
  };
};

const reportsWithDeployment = (deploymentOverrides = {}) => {
  const forgedDeployment = deployment(deploymentOverrides);
  const basePeerAudit = peerAuditReport();
  const baseSmoke = smokeReadinessReport();
  const baseInventory = materialInventoryReport();
  const baseVideo = videoTranscript();
  return {
    routeReport: routeReport({ deployment: forgedDeployment }),
    peerAuditReport: peerAuditReport({
      peers: basePeerAudit.peers.map((peer) => ({
        ...peer,
        deployment: forgedDeployment,
      })),
    }),
    smokeReadinessReport: smokeReadinessReport({
      route: {
        ...baseSmoke.route,
        deployment: forgedDeployment,
      },
      peerAudit: {
        ...baseSmoke.peerAudit,
        peers: baseSmoke.peerAudit.peers.map((peer) => ({
          ...peer,
          deployment: forgedDeployment,
        })),
      },
      provers: {
        ...baseSmoke.provers,
        destination: {
          ...baseSmoke.provers.destination,
          manifest: {
            ...baseSmoke.provers.destination.manifest,
            deployment: forgedDeployment,
          },
        },
        source: {
          ...baseSmoke.provers.source,
          manifest: {
            ...baseSmoke.provers.source.manifest,
            deployment: forgedDeployment,
          },
        },
      },
    }),
    materialInventoryReport: materialInventoryReport({
      route: {
        ...baseInventory.route,
        deployment: forgedDeployment,
      },
      browserProvers: {
        ...baseInventory.browserProvers,
        destination: {
          ...baseInventory.browserProvers.destination,
          sidecar: {
            ...baseInventory.browserProvers.destination.sidecar,
            manifest: {
              ...baseInventory.browserProvers.destination.sidecar.manifest,
              deployment: forgedDeployment,
            },
          },
        },
        source: {
          ...baseInventory.browserProvers.source,
          sidecar: {
            ...baseInventory.browserProvers.source.sidecar,
            manifest: {
              ...baseInventory.browserProvers.source.sidecar.manifest,
              deployment: forgedDeployment,
            },
          },
        },
      },
    }),
    videoTranscript: videoTranscript({
      readinessBinding: {
        ...baseVideo.readinessBinding,
        route: {
          ...baseVideo.readinessBinding.route,
          deployment: forgedDeployment,
        },
      },
    }),
  };
};

const failedCheck = (report, id) =>
  report.checks.find((entry) => entry.id === id && !entry.ok);

const passedCheck = (report, id) =>
  report.checks.find((entry) => entry.id === id && entry.ok);

const sha256Hex = (bytes) =>
  `0x${createHash("sha256").update(bytes).digest("hex")}`;

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

const writeFileBackedPeerAuditReports = async (
  dir,
  {
    sources = {},
    missingPeers = new Set(),
    tamperedPeers = new Set(),
    peerContents = {},
  } = {},
) => {
  const stanzaDir = path.join(dir, "stanzas");
  await mkdir(stanzaDir, { recursive: true });
  const peerPeers = [];
  const smokePeers = [];
  for (const [index, peer] of peerAuditReport().peers.entries()) {
    const source = sources[index] ?? `stanzas/peer${index}.toml`;
    const cleanBytes = Buffer.from(
      peerContents[index] ??
        `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nasset_key = "${SCCP_BSC_XOR_ASSET_KEY}"\n`,
    );
    const expectedHash = sha256Hex(cleanBytes);
    if (
      !missingPeers.has(index) &&
      !tamperedPeers.has(index) &&
      source.startsWith("stanzas/")
    ) {
      await writeFile(path.join(dir, source), cleanBytes);
    } else if (tamperedPeers.has(index) && source.startsWith("stanzas/")) {
      await writeFile(path.join(dir, source), Buffer.from("tampered\n"));
    }
    const fileBackedPeer = {
      ...peer,
      source,
      sanitizedStanzaSha256: expectedHash,
    };
    peerPeers.push(fileBackedPeer);
    smokePeers.push({
      ...smokeReadinessReport().peerAudit.peers[index],
      source,
      sanitizedStanzaSha256: expectedHash,
      sanitizedStanzaFileSha256: expectedHash,
    });
  }
  return {
    peerAudit: peerAuditReport({ peers: peerPeers }),
    smokeReadiness: smokeReadinessReport({
      peerAudit: {
        ...smokeReadinessReport().peerAudit,
        peers: smokePeers,
      },
    }),
  };
};

describe("BSC SCCP aggregate production gate", () => {
  it("keeps CLI production-gate refresh opt-in by default", () => {
    expect(resolveBscSccpProductionGateRefreshReports()).toBe(false);
    expect(
      resolveBscSccpProductionGateRefreshReports({ envRefresh: "true" }),
    ).toBe(true);
    expect(
      resolveBscSccpProductionGateRefreshReports({ envRefresh: "false" }),
    ).toBe(false);
    expect(
      resolveBscSccpProductionGateRefreshReports({
        argRefresh: "false",
        envRefresh: "true",
      }),
    ).toBe(false);
    expect(
      resolveBscSccpProductionGateRefreshReports({ argRefresh: "true" }),
    ).toBe(true);
  });

  it("does not invoke accessor-backed production-gate refresh flag fields", () => {
    let reads = 0;
    const options = {};
    for (const field of ["argRefresh", "envRefresh"]) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(`${field} getter must not be invoked`);
        },
      });
    }

    expect(resolveBscSccpProductionGateRefreshReports(options)).toBe(false);
    expect(reads).toBe(0);
  });

  it("accepts complete BSC production gate runbook contracts", () => {
    expect(
      bscSccpProductionGateRunbookProblems({
        nextActions: [
          {
            id: "publish-production-proof-material",
            title: "Publish production proof material",
            detail: "Publish route-bound production verifier material.",
            requiredInputs: [
              {
                id: "production-groth16-verifier-key-json",
                kind: "file",
                placeholder: "<production-verifier-key.json>",
                description: "Production BN254 Groth16 verifier key JSON.",
              },
            ],
            blockedByChecks: ["production-proof-material"],
            commands: [
              "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --proof-artifact <relative-circuit.r1cs> --proving-key <relative-circuit.zkey> --verifier-key <relative-verifier-key.json> --groth16-material-manifest <relative-groth16-material-manifest.json> --cross-sdk-parity <relative-cross-sdk-parity.json> --native-prover-self-test <relative-native-self-test.json> --javascript-implementation <relative-js-implementation> --swift-implementation <relative-swift-implementation> --kotlin-implementation <relative-kotlin-implementation> --java-android-implementation <relative-java-android-implementation> --dotnet-implementation <relative-dotnet-implementation> --audit-circuit-security <hex-or-relative-file> --audit-native-implementation <hex-or-relative-file> --audit-reproducible-build <hex-or-relative-file> --audit-no-wasm-no-remote-scan <hex-or-relative-file> --out <native-evm-prover-bundle.json>",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "production-groth16-verifier-key-json",
            kind: "file",
            placeholder: "<production-verifier-key.json>",
            description: "Production BN254 Groth16 verifier key JSON.",
            blockedByActions: ["publish-production-proof-material"],
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects production-gate proof-material runbooks that omit native bundle inputs", () => {
    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "Publish production proof material",
          detail: "Publish route-bound production verifier material.",
          requiredInputs: [
            {
              id: "native-evm-prover-bundle",
              kind: "file",
              placeholder: "<native-evm-prover-bundle.json>",
              description: "SDK-validated native EVM prover bundle.",
            },
          ],
          blockedByChecks: ["production-proof-material"],
          commands: [
            "node ../iroha/scripts/sccp_bsc_taira_xor_deploy.mjs native-prover-bundle --route-manifest <production-route.manifest.json> --artifact-root <native-prover-artifact-root> --out <native-evm-prover-bundle.json>",
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
        "BSC production gate next action 0 native-prover-bundle command lacks --proof-artifact.",
        "BSC production gate next action 0 native-prover-bundle command lacks --proving-key.",
        "BSC production gate next action 0 native-prover-bundle command lacks --verifier-key.",
        "BSC production gate next action 0 native-prover-bundle command lacks --groth16-material-manifest.",
        "BSC production gate next action 0 native-prover-bundle command lacks --cross-sdk-parity.",
        "BSC production gate next action 0 native-prover-bundle command lacks --native-prover-self-test.",
        "BSC production gate next action 0 native-prover-bundle command lacks --audit-no-wasm-no-remote-scan.",
      ]),
    );
  });

  it("rejects malformed BSC production gate runbook contracts", () => {
    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "",
          detail: "Publish route-bound production verifier material.",
          requiredInputs: [
            {
              id: "production-groth16-verifier-key-json",
              kind: "file",
              placeholder: "",
            },
          ],
          blockedByChecks: [],
          commands:
            "npm run e2e:sccp:bsc-production-gate -- --bsc-network testnet",
        },
      ],
      missingProductionInputs: [
        {
          id: "production-groth16-verifier-key-json",
          kind: "",
          placeholder: "<production-verifier-key.json>",
          description: "Production BN254 Groth16 verifier key JSON.",
          blockedByActions: "publish-production-proof-material",
        },
        "not-an-input-contract",
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC production gate next action 0 title is missing or not a non-empty string.",
        "BSC production gate next action 0 required input 0 placeholder is missing or not a non-empty string.",
        "BSC production gate next action 0 required input 0 description is missing or not a non-empty string.",
        "BSC production gate next action 0 blockedByChecks is missing or empty.",
        "BSC production gate next action 0 commands is missing or empty.",
        "BSC production gate next action 0 command is not an array.",
        "BSC production gate missing production input 0 kind is missing or not a non-empty string.",
        "BSC production gate missing production input 0 blockedByActions is not an array.",
        "BSC production gate missing production input 0 has no blocking action references.",
        "BSC production gate missing production input 1 is not an object.",
      ]),
    );
  });

  it("rejects unlinked BSC production gate runbook contracts", () => {
    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "Publish production proof material",
          detail: "Publish route-bound production verifier material.",
          requiredInputs: [
            {
              id: "production-groth16-verifier-key-json",
              kind: "file",
              placeholder: "<production-verifier-key.json>",
              description: "Production BN254 Groth16 verifier key JSON.",
            },
            {
              id: "burn-record-proof-artifact",
              kind: "file",
              placeholder: "<burn-record-proof-artifact.r1cs>",
              description: "Production burn-record proof artifact.",
            },
          ],
          blockedByChecks: ["production-proof-material"],
          commands: [
            "npm run e2e:sccp:bsc-production-gate -- --bsc-network testnet",
          ],
        },
        {
          id: "record-live-video-proof",
          title: "Record live UI proof video",
          detail: "Record the SCCP UI proof.",
          requiredInputs: [
            {
              id: "sccp-ui-proof-video",
              kind: "video-file",
              placeholder: "<sccp-ui-proof-video.webm>",
              description: "Recorded SCCP UI proof video.",
            },
          ],
          blockedByChecks: ["video-proof-complete"],
          commands: ["npm run e2e:sccp:bsc-video -- --bsc-network testnet"],
        },
        {
          id: "record-live-video-proof",
          title: "Duplicate live UI proof action",
          detail: "Duplicate action id must fail.",
          requiredInputs: [
            {
              id: "sccp-ui-proof-video",
              kind: "video-file",
              placeholder: "<sccp-ui-proof-video.webm>",
              description: "Recorded SCCP UI proof video.",
            },
          ],
          blockedByChecks: ["video-proof-complete"],
          commands: ["npm run e2e:sccp:bsc-video -- --bsc-network testnet"],
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
          id: "sccp-ui-proof-video",
          kind: "video-file",
          placeholder: "<sccp-ui-proof-video.webm>",
          description: "Recorded SCCP UI proof video.",
          blockedByActions: ["publish-production-proof-material"],
        },
        {
          id: "sccp-ui-proof-video",
          kind: "video-file",
          placeholder: "<sccp-ui-proof-video.webm>",
          description: "Duplicate input id must fail.",
          blockedByActions: ["record-live-video-proof"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC production gate next action id record-live-video-proof is duplicated.",
        "BSC production gate missing production input id sccp-ui-proof-video is duplicated.",
        "BSC production gate missing production input production-groth16-verifier-key-json does not reference blocking action publish-production-proof-material.",
        "BSC production gate next action publish-production-proof-material requires input burn-record-proof-artifact, but missingProductionInputs does not include it.",
        "BSC production gate missing production input sccp-ui-proof-video does not reference blocking action record-live-video-proof.",
        "BSC production gate missing production input production-groth16-verifier-key-json references unknown blocking action unknown-action.",
        "BSC production gate missing production input sccp-ui-proof-video references blocking action publish-production-proof-material, but that action does not require the input.",
      ]),
    );
  });

  it("rejects unlinked child-report blockers in BSC production gate runbooks", () => {
    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "refresh-readiness-evidence",
          title: "Refresh BSC readiness evidence",
          detail: "Refresh public route and peer readiness evidence.",
          requiredInputs: [
            {
              id: "peer-config-audit-source",
              kind: "directory-or-remote",
              placeholder: "<peer-config-audit-source>",
              description: "Peer config source used to refresh readiness.",
            },
          ],
          blockedByChecks: ["evidence-freshness"],
          commands: [
            "npm run e2e:sccp:bsc-production-gate -- --refresh true --bsc-network testnet",
          ],
        },
      ],
      routeNextActions: [
        {
          id: "refresh-bsc-route-preflight",
          requiredInputs: [
            {
              id: "testnet-public-route-report",
            },
          ],
        },
      ],
      materialNextActions: [
        {
          id: "publish-browser-prover-modules",
          requiredInputs: [
            {
              id: "testnet-destination-browser-prover-module",
            },
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "peer-config-audit-source",
          kind: "directory-or-remote",
          placeholder: "<peer-config-audit-source>",
          description: "Peer config source used to refresh readiness.",
          blockedByActions: ["refresh-readiness-evidence"],
          blockedByRouteActions: ["unknown-route-action"],
          blockedByMaterialActions: ["publish-browser-prover-modules"],
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC production gate missing production input peer-config-audit-source references unknown blockedByRouteActions action unknown-route-action.",
        "BSC production gate missing production input peer-config-audit-source references blockedByMaterialActions action publish-browser-prover-modules, but that action does not require the input.",
      ]),
    );
  });

  it("rejects unsupported BSC production gate runbook fields with redaction", () => {
    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "Publish production proof material",
          detail: "Publish route-bound production verifier material.",
          verifierMaterial: "do-not-serialize-verifier-material",
          requiredInputs: [
            {
              id: "production-groth16-verifier-key-json",
              kind: "file",
              placeholder: "<production-verifier-key.json>",
              description: "Production BN254 Groth16 verifier key JSON.",
              secretPath: "do-not-serialize-secret-path",
            },
          ],
          blockedByChecks: ["production-proof-material"],
          commands: [
            "npm run e2e:sccp:bsc-production-gate -- --bsc-network testnet",
          ],
        },
      ],
      missingProductionInputs: [
        {
          id: "production-groth16-verifier-key-json",
          kind: "file",
          placeholder: "<production-verifier-key.json>",
          description: "Production BN254 Groth16 verifier key JSON.",
          blockedByActions: ["publish-production-proof-material"],
          operatorNote: "publish the production verifier material",
          apiTokenPath: "do-not-serialize-token-path",
        },
      ],
    });

    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC production gate next action 0 contains unsupported field [redacted unsupported field].",
        "BSC production gate next action 0 required input 0 contains unsupported field [redacted unsupported field].",
        "BSC production gate missing production input 0 contains unsupported field operatorNote.",
        "BSC production gate missing production input 0 contains unsupported field [redacted unsupported field].",
      ]),
    );
    const serializedProblems = JSON.stringify(problems);
    expect(serializedProblems).not.toContain("verifierMaterial");
    expect(serializedProblems).not.toContain("secretPath");
    expect(serializedProblems).not.toContain("apiTokenPath");
    expect(serializedProblems).not.toContain("do-not-serialize");
  });

  it("does not invoke accessor-backed BSC production gate runbook entries", () => {
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
      "npm run e2e:sccp:bsc-production-gate -- --bsc-network testnet",
    ];
    Object.defineProperty(commands, "1", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("command getter must not be invoked");
      },
    });
    const blockedByActions = ["publish-production-proof-material"];
    Object.defineProperty(blockedByActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("blocked action getter must not be invoked");
      },
    });

    const problems = bscSccpProductionGateRunbookProblems({
      nextActions: [
        {
          id: "publish-production-proof-material",
          title: "Publish production proof material",
          detail: "Publish route-bound production verifier material.",
          requiredInputs,
          blockedByChecks: ["production-proof-material"],
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

    expect(reads).toBe(0);
    expect(problems).toEqual(
      expect.arrayContaining([
        "BSC production gate next action 0 requiredInputs is missing or empty.",
        "BSC production gate next action 0 command 1 is missing.",
        "BSC production gate next action 0 required input 0 is missing.",
        "BSC production gate missing production input 0 blockedByActions 1 is missing.",
      ]),
    );
  });

  it("does not invoke accessor-backed top-level production gate refresh fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: "",
    };
    let reads = 0;
    const options = {
      defaultReportPaths: paths,
      checkedAt: NOW_ISO,
      refreshRunners: {
        runRoutePreflight: async () => routeReport(),
        runPeerConfigAudit: async () => peerAuditReport(),
        runSmokeReadiness: async () => smokeReadinessReport(),
        runMaterialInventory: async () => materialInventoryReport(),
      },
    };
    for (const field of [
      "routeReportPath",
      "peerAuditReportPath",
      "smokeReadinessReportPath",
      "materialInventoryReportPath",
      "toriiUrl",
      "manifestFile",
      "bscNetwork",
      "checkBscContracts",
      "bscRpcUrl",
      "allowLocalRpc",
      "peerAuditDir",
      "peerAuditFiles",
      "peerAuditIncludeBackups",
      "peerAuditExpectedPeers",
      "peerAuditSshHost",
      "peerAuditSshPassword",
      "peerAuditSshPasswordFile",
      "peerAuditSshCredsFile",
      "peerAuditRemoteDir",
      "peerAuditRemotePeerCount",
      "peerAuditSshCommand",
      "peerAuditSshpassCommand",
      "peerAuditConnectTimeoutSeconds",
      "materialScanPaths",
      "destinationProverModuleUrl",
      "sourceProverModuleUrl",
      "destinationProverManifestUrl",
      "sourceProverManifestUrl",
      "runtimeProverConfigUrl",
      "destinationSidecarPath",
      "sourceSidecarPath",
      "walletConnectProjectId",
      "checkModuleAvailability",
      "checkProverManifests",
      "checkRuntimeProverConfig",
      "fetchImpl",
      "timeoutMs",
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

    try {
      const refreshed = await refreshBscSccpProductionGateReports(options);

      expect(reads).toBe(0);
      expect(refreshed.paths.routeReportPath).toBe(paths.routeReportPath);
      expect(
        JSON.parse(await readFile(paths.routeReportPath, "utf8")).ready,
      ).toBe(true);
      expect(
        JSON.parse(await readFile(paths.materialInventoryReportPath, "utf8"))
          .ready,
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("does not invoke accessor-backed top-level production gate runner fields", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: path.join(dir, "video.json"),
    };
    await writeFile(paths.routeReportPath, JSON.stringify(routeReport()));
    await writeFile(
      paths.peerAuditReportPath,
      JSON.stringify(peerAuditReport()),
    );
    await writeFile(
      paths.smokeReadinessReportPath,
      JSON.stringify(smokeReadinessReport()),
    );
    await writeFile(
      paths.materialInventoryReportPath,
      JSON.stringify(materialInventoryReport()),
    );
    await writeFile(
      paths.videoTranscriptPath,
      JSON.stringify(videoTranscript()),
    );
    let reads = 0;
    const options = {
      defaultReportPaths: paths,
      checkedAt: NOW_ISO,
    };
    for (const field of [
      "routeReportPath",
      "peerAuditReportPath",
      "smokeReadinessReportPath",
      "materialInventoryReportPath",
      "videoTranscriptPath",
      "refreshReports",
      "refreshRunners",
      "toriiUrl",
      "manifestFile",
      "bscNetwork",
      "checkBscContracts",
      "bscRpcUrl",
      "allowLocalRpc",
      "peerAuditDir",
      "peerAuditFiles",
      "peerAuditIncludeBackups",
      "peerAuditExpectedPeers",
      "peerAuditSshHost",
      "peerAuditSshPassword",
      "peerAuditSshPasswordFile",
      "peerAuditSshCredsFile",
      "peerAuditRemoteDir",
      "peerAuditRemotePeerCount",
      "peerAuditSshCommand",
      "peerAuditSshpassCommand",
      "peerAuditConnectTimeoutSeconds",
      "materialScanPaths",
      "destinationProverModuleUrl",
      "sourceProverModuleUrl",
      "destinationProverManifestUrl",
      "sourceProverManifestUrl",
      "runtimeProverConfigUrl",
      "destinationSidecarPath",
      "sourceSidecarPath",
      "walletConnectProjectId",
      "checkModuleAvailability",
      "checkProverManifests",
      "checkRuntimeProverConfig",
      "fetchImpl",
      "timeoutMs",
      "maxReportAgeMs",
      "futureSkewMs",
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

    try {
      const report = await runBscSccpProductionGate(options);

      expect(reads).toBe(0);
      expect(report.ready).toBe(false);
      expect(report.route?.ready).toBe(true);
      expect(report.videoProof).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes only when route, peer audit, smoke readiness, and video proof all agree", () => {
    const report = evaluate();

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.reasons).toEqual([]);
    expect(report.route?.bsc).toMatchObject({
      network: "testnet",
      chain: "bsc-testnet",
      chainIdHex: "0x61",
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(report.route?.deployment).toEqual(deployment());
    expect(report.route?.postDeployLiveEvidence).toEqual(
      postDeployLiveEvidence(),
    );
    expect(report.route?.generatedAt).toBe(
      new Date(report.route?.generatedAtMs ?? 0).toISOString(),
    );
    expect(report.peerAudit?.peerCount).toBe(4);
    expect(report.peerAudit?.generatedAt).toBe(
      new Date(report.peerAudit?.generatedAtMs ?? 0).toISOString(),
    );
    expect(report.smokeReadiness?.peerAudit?.manifestFingerprint).toBeNull();
    expect(report.smokeReadiness?.route?.bsc).toMatchObject({
      network: "testnet",
      chain: "bsc-testnet",
      chainIdHex: "0x61",
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(
      report.smokeReadiness?.provers?.runtimeConfig?.manifest,
    ).toMatchObject({
      bscNetwork: "testnet",
      bscChain: "bsc-testnet",
      bscChainIdHex: "0x61",
      bscNetworkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    });
    expect(report.smokeReadiness?.provers?.runtimeConfig?.required).toBe(true);
    expect(report.materialInventory?.ready).toBe(true);
    expect(report.materialInventory?.scanRoots).toEqual([
      "./output/sccp-bsc-production",
      "./public/sccp-bsc",
    ]);
    expect(report.materialInventory?.scanRootStatuses).toEqual([
      { path: "./output/sccp-bsc-production", ok: true, kind: "directory" },
      { path: "./public/sccp-bsc", ok: true, kind: "directory" },
    ]);
    expect(report.materialInventory?.counts?.relevantFilesSeen).toBe(20);
    expect(report.materialInventory?.counts?.maxFiles).toBe(2000);
    expect(report.materialInventory?.counts?.truncated).toBe(false);
    expect(report.materialInventory?.counts?.warningFindings).toBe(0);
    expect(report.materialInventory?.counts?.browserProverSidecars).toBe(2);
    expect(report.materialInventory?.counts?.compiledContractArtifacts).toBe(4);
    expect(
      report.materialInventory?.counts
        ?.productionOfflineFullTomlEvidenceArtifacts,
    ).toBe(1);
    expect(
      report.materialInventory?.counts?.productionDeploymentEvidenceArtifacts,
    ).toBe(1);
    expect(
      report.materialInventory?.counts?.productionTairaBurnRecordContracts,
    ).toBe(1);
    expect(
      report.materialInventory?.counts?.routeBoundGroth16AttestationHandoffs,
    ).toBe(1);
    expect(report.materialInventory?.counts?.proofArtifactCandidates).toBe(1);
    expect(report.materialInventory?.counts?.provingKeyCandidates).toBe(1);
    expect(report.materialInventory?.counts?.skippedGeneratedDirectories).toBe(
      0,
    );
    expect(report.materialInventory?.skippedGeneratedDirectories).toEqual([]);
    expect(report.materialInventory?.files).toHaveLength(
      materialInventoryReport().files.length,
    );
    expect(report.materialInventory?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "production-requirements",
          productionRequirements: expect.objectContaining({
            valid: true,
            routeId: SCCP_BSC_XOR_ROUTE_ID,
            assetKey: SCCP_BSC_XOR_ASSET_KEY,
            bscNetwork: "testnet",
            inputCount: 41,
            requiredReportCount: 5,
            deniedVerifierKeyHashCount: 1,
            contractHash: bscProductionRequirementsContractHash("testnet"),
            expectedContractHash:
              bscProductionRequirementsContractHash("testnet"),
            contractMatchesExpected: true,
          }),
        }),
        expect.objectContaining({
          kind: "contract-artifact",
          contractArtifact: expect.objectContaining({
            valid: true,
            key: "bridge",
            contractName: "TairaXorBscSccpBridge",
          }),
        }),
        expect.objectContaining({
          kind: "offline-full-toml-evidence",
          offlineFullTomlEvidence: expect.objectContaining({
            valid: true,
            routeId: SCCP_BSC_XOR_ROUTE_ID,
            assetKey: SCCP_BSC_XOR_ASSET_KEY,
            bscNetwork: "testnet",
            offlineFullTomlSha256: HASH_88,
            hashInputSha256: HASH_88,
            renderedTomlSha256: HASH_77,
            publicPostDeployMatches: true,
          }),
        }),
        expect.objectContaining({
          kind: "browser-prover-sidecar",
          browserProverSidecar: expect.objectContaining({
            valid: true,
            moduleSha256: HASH_11,
            moduleSha256Actual: HASH_11,
            exports: expect.arrayContaining(["bscSccpProve"]),
          }),
        }),
        expect.objectContaining({
          kind: "groth16-attestation-handoff",
          groth16AttestationHandoff: expect.objectContaining({
            valid: true,
            schema: BSC_GROTH16_ATTESTATION_HANDOFF_SCHEMA,
            routeId: SCCP_BSC_XOR_ROUTE_ID,
            assetKey: SCCP_BSC_XOR_ASSET_KEY,
            bscNetwork: "testnet",
            verifierKeyHash: HASH_22,
            manifestSha256: HASH_12,
            attestationRequestSha256: HASH_13,
            handoffComplete: true,
            signingReady: true,
            readyToFinalize: true,
            requestValid: true,
            roleReadiness: {
              semanticSccpCircuit: true,
              circuitSecurity: true,
              trustedSetup: true,
              reproducibleBuild: true,
            },
            referencedRequestVerified: true,
            referencedManifestVerified: true,
            publicDeploymentMatches: true,
          }),
        }),
      ]),
    );
    expect(report.materialInventory?.route?.bsc).toMatchObject({
      network: "testnet",
      chain: "bsc-testnet",
      chainIdHex: "0x61",
      networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
      explorerUrl: "https://testnet.bscscan.com",
      explorerHost: "testnet.bscscan.com",
    });
    expect(report.materialInventory?.route?.postDeployLiveEvidence).toEqual(
      postDeployLiveEvidence(),
    );
    expect(
      report.materialInventory?.runtimeProverConfig?.manifest,
    ).toMatchObject({
      bscNetwork: "testnet",
      bscChain: "bsc-testnet",
      bscChainIdHex: "0x61",
      bscNetworkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
    });
    expect(report.videoProof?.proofComplete).toBe(true);
    expect(report.materialInventory?.nextActions).toEqual([]);
    expect(report.materialInventory?.missingProductionInputs).toEqual([]);
    expect(report.nextActions).toEqual([]);
    expect(report.missingProductionInputs).toEqual([]);
    expect(JSON.stringify(report)).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("redacts material inventory next-action fields before publishing the aggregate summary", () => {
    const baseInventory = materialInventoryReport();
    const secret = `privateKey=0x${"11".repeat(32)}`;
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        checks: baseInventory.checks.map((entry) =>
          entry.id === "destination-browser-prover"
            ? { ...entry, ok: false, message: "missing destination prover" }
            : entry,
        ),
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
                description: "Browser-safe module URL.",
              },
              {
                id: secret,
                kind: "operator-environment",
                placeholder: secret,
                description: secret,
              },
            ],
            blockedByChecks: ["destination-browser-prover", secret],
            commands: [
              "npm run e2e:sccp:bsc-runtime-prover-config -- --bsc-network testnet",
              `${secret} npm run e2e:sccp:bsc-material-inventory`,
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "testnet-destination-browser-prover-module",
            kind: "url",
            placeholder: "<destination-prover-module-url>",
            description: "Browser-safe module URL.",
            blockedByActions: ["publish-browser-prover-modules"],
          },
          {
            id: secret,
            kind: "operator-environment",
            placeholder: secret,
            description: secret,
            blockedByActions: ["publish-browser-prover-modules", secret],
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).not.toMatch(/unsupported field (?:nextActions|missingProductionInputs)/u);
    expect(report.materialInventory?.nextActions).toEqual([
      {
        id: "publish-browser-prover-modules",
        title: "Publish browser prover modules",
        detail: "Publish route-bound browser prover modules.",
        requiredInputs: [
          {
            id: "testnet-destination-browser-prover-module",
            kind: "url",
            placeholder: "<destination-prover-module-url>",
            description: "Browser-safe module URL.",
          },
          {
            id: "redacted-check",
            kind: "operator-environment",
            placeholder: "[redacted secret-like detail]",
            description: "[redacted secret-like detail]",
          },
        ],
        blockedByChecks: ["destination-browser-prover", "redacted-check"],
        commands: [
          "npm run e2e:sccp:bsc-runtime-prover-config -- --bsc-network testnet",
          "[redacted secret-like detail]",
        ],
      },
    ]);
    expect(report.materialInventory?.missingProductionInputs).toEqual([
      {
        id: "testnet-destination-browser-prover-module",
        kind: "url",
        placeholder: "<destination-prover-module-url>",
        description: "Browser-safe module URL.",
        blockedByActions: ["publish-browser-prover-modules"],
      },
      {
        id: "redacted-check",
        kind: "operator-environment",
        placeholder: "[redacted secret-like detail]",
        description: "[redacted secret-like detail]",
        blockedByActions: ["publish-browser-prover-modules", "redacted-check"],
      },
    ]);
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "testnet-destination-browser-prover-module",
          blockedByActions: expect.arrayContaining([
            "publish-bsc-prover-modules",
          ]),
          blockedByMaterialActions: ["publish-browser-prover-modules"],
        }),
      ]),
    );
    expect(
      report.missingProductionInputs.map((input) => input.id),
    ).not.toContain("redacted-check");
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("redacts secret-shaped Groth16 handoff diagnostics before publishing the aggregate summary", () => {
    const secret = `privateKey=0x${"22".repeat(32)}`;
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        files: materialInventoryReport().files.map((entry) =>
          entry.kind === "groth16-attestation-handoff"
            ? {
                ...entry,
                groth16AttestationHandoff: {
                  ...entry.groth16AttestationHandoff,
                  attestationStatusProblemSummary: secret,
                  nextActions: [secret],
                  readinessProductionBlockers: [secret],
                },
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "material-inventory-secret-scan")).toBeTruthy();
    const handoff = report.materialInventory?.files?.find(
      (entry) => entry.kind === "groth16-attestation-handoff",
    )?.groth16AttestationHandoff;
    expect(handoff).toMatchObject({
      attestationStatusProblemSummary: "[redacted secret-like detail]",
      nextActions: ["[redacted secret-like detail]"],
      readinessProductionBlockers: ["[redacted secret-like detail]"],
    });
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("preserves sanitized material-inventory browser prover failure details", () => {
    const baseInventory = materialInventoryReport();
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        checks: baseInventory.checks.map((entry) =>
          entry.id === "destination-browser-prover"
            ? {
                ...entry,
                ok: false,
                detail:
                  "TAIRA -> BSC destination prover module URL is not configured.",
              }
            : entry,
        ),
        browserProvers: {
          ...baseInventory.browserProvers,
          destination: {
            ok: false,
            detail:
              "TAIRA -> BSC destination prover module URL is not configured.",
            module: null,
            sidecar: null,
          },
        },
      }),
    });

    expect(report.ready).toBe(false);
    expect(report.materialInventory?.browserProvers?.destination).toEqual({
      ok: false,
      detail: "TAIRA -> BSC destination prover module URL is not configured.",
      module: null,
      sidecar: null,
    });
  });

  it("rejects unsupported material-inventory action metadata without leaking hidden fields", () => {
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        nextActions: [
          {
            id: "publish-browser-prover-modules",
            title: "Publish browser prover modules",
            detail: "Publish route-bound browser prover modules.",
            proofMaterial: "do-not-serialize-next-action",
            requiredInputs: [
              {
                id: "testnet-destination-browser-prover-module",
                kind: "url",
                placeholder: "<destination-prover-module-url>",
                description: "Browser-safe module URL.",
                verifierKeyHash: "do-not-serialize-required-input",
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
            description: "Browser-safe module URL.",
            blockedByActions: ["publish-browser-prover-modules"],
            verifierMaterial: "do-not-serialize-missing-input",
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    const detail = failedCheck(report, "production-material-inventory")?.detail;
    expect(detail).toMatch(
      /production material inventory next action 0 contains unsupported field \[redacted unsupported field\]/u,
    );
    expect(detail).toMatch(
      /production material inventory next action 0 required input 0 contains unsupported field \[redacted unsupported field\]/u,
    );
    expect(detail).toMatch(
      /production material inventory missing production input 0 contains unsupported field \[redacted unsupported field\]/u,
    );
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("do-not-serialize-next-action");
    expect(serialized).not.toContain("do-not-serialize-required-input");
    expect(serialized).not.toContain("do-not-serialize-missing-input");
    expect(serialized).not.toContain("proofMaterial");
    expect(serialized).not.toContain("verifierMaterial");
  });

  it("rejects non-object rows in record-only production evidence arrays", () => {
    const baseRoute = routeReport();
    const basePeerAudit = peerAuditReport();
    const baseSmoke = smokeReadinessReport();
    const baseVideo = videoTranscript();
    const report = evaluate({
      routeReport: routeReport({
        checks: [...baseRoute.checks, "not-a-route-check"],
      }),
      peerAuditReport: peerAuditReport({
        checks: [...basePeerAudit.checks, "not-a-peer-check"],
      }),
      smokeReadinessReport: smokeReadinessReport({
        checks: [...baseSmoke.checks, "not-a-smoke-check"],
      }),
      materialInventoryReport: materialInventoryReport({
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
                description: "Browser-safe module URL.",
              },
              "not-a-required-input",
            ],
            blockedByChecks: ["destination-browser-prover"],
            commands: [
              "npm run e2e:sccp:bsc-material-inventory -- --bsc-network testnet",
            ],
          },
        ],
      }),
      videoTranscript: videoTranscript({
        readinessBinding: {
          ...baseVideo.readinessBinding,
          checks: [
            ...baseVideo.readinessBinding.checks,
            "not-a-video-binding-check",
          ],
        },
      }),
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "route-preflight-ready")?.detail).toMatch(
      /route preflight check \d+ is not an object/u,
    );
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer audit check \d+ is not an object/u,
    );
    expect(failedCheck(report, "smoke-readiness-ready")?.detail).toMatch(
      /smoke-readiness check \d+ is not an object/u,
    );
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(
      /production material inventory next action 0 required input 1 is not an object/u,
    );
    expect(failedCheck(report, "video-readiness-binding")?.detail).toMatch(
      /video readiness binding check \d+ is not an object/u,
    );
    expect(JSON.stringify(report)).not.toContain("not-a-required-input");
    expect(JSON.stringify(report)).not.toContain("not-a-video-binding-check");
  });

  it("rejects malformed public production input contracts", () => {
    const sparseBlockedChecks = ["destination-browser-prover"];
    sparseBlockedChecks.length = 2;
    let blockedActionGetterReads = 0;
    const accessorBlockedActions = ["publish-bsc-prover-modules"];
    Object.defineProperty(accessorBlockedActions, "1", {
      configurable: true,
      enumerable: true,
      get() {
        blockedActionGetterReads += 1;
        return "operator-secret-action";
      },
    });

    const report = evaluate({
      routeReport: routeReport({
        missingProductionInputs: [
          {
            kind: "file",
            placeholder: "<production-route.manifest.json>",
            description: "Production route manifest.",
            blockedByActions: ["publish-production-route-artifacts"],
          },
        ],
      }),
      peerAuditReport: peerAuditReport({
        nextActions: [
          {
            id: "deploy-production-peer-route-config",
            title: "Deploy production peer route config",
            detail: "Deploy production route stanzas.",
            requiredInputs: [
              {
                id: "peer-config-audit-source",
                kind: "directory-or-remote",
              },
            ],
            blockedByChecks: ["peer-route-production-readiness"],
            commands: ["npm run e2e:sccp:bsc-peer-config-audit"],
          },
        ],
      }),
      smokeReadinessReport: smokeReadinessReport({
        missingProductionInputs: [
          {
            id: "walletconnect-project-id",
            kind: "operator-environment",
            placeholder: "<walletconnect-project-id>",
            description: "WalletConnect project id.",
            blockedByActions: accessorBlockedActions,
          },
        ],
      }),
      materialInventoryReport: materialInventoryReport({
        nextActions: [
          {
            id: "publish-browser-prover-modules",
            title: "Publish browser prover modules",
            detail: "Publish route-bound browser prover modules.",
            requiredInputs: [
              {
                id: "testnet-source-browser-prover-module",
                kind: "url",
                placeholder: "<source-prover-module-url>",
                description: "Source prover module URL.",
              },
            ],
            blockedByChecks: sparseBlockedChecks,
            commands: [
              "npm run e2e:sccp:bsc-material-inventory -- --bsc-network testnet",
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "testnet-runtime-prover-config",
            kind: "url",
            placeholder: "<runtime-prover-config-url>",
            description: "Runtime prover config URL.",
            blockedByActions: ["publish-browser-prover-modules", 42],
          },
        ],
      }),
    });

    expect(blockedActionGetterReads).toBe(0);
    expect(report.ready).toBe(false);
    expect(failedCheck(report, "route-preflight-ready")?.detail).toMatch(
      /route preflight missing production input 0 id is missing or not a non-empty string/u,
    );
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer audit next action 0 required input 0 placeholder is missing or not a non-empty string/u,
    );
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer audit next action 0 required input 0 description is missing or not a non-empty string/u,
    );
    expect(failedCheck(report, "smoke-readiness-ready")?.detail).toMatch(
      /smoke-readiness missing production input 0 blockedByActions 1 is not a non-empty string/u,
    );
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(
      /production material inventory next action 0 blockedByChecks 1 is not a non-empty string/u,
    );
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(
      /production material inventory missing production input 0 blockedByActions 1 is not a non-empty string/u,
    );
  });

  it("rejects non-array public production report fields without invoking getters", () => {
    let accessorNextActionReads = 0;
    const accessorNextActions = [];
    accessorNextActions.length = 1;
    Object.defineProperty(accessorNextActions, "0", {
      configurable: true,
      enumerable: true,
      get() {
        accessorNextActionReads += 1;
        return {
          id: "hidden-action",
          title: "Hidden action",
          detail: "This must not be read.",
        };
      },
    });
    const baseSmoke = smokeReadinessReport();
    const baseVideo = videoTranscript();

    const report = evaluate({
      routeReport: routeReport({
        nextActions: { 0: "not-an-array" },
        missingProductionInputs: "not-an-array",
      }),
      peerAuditReport: peerAuditReport({
        nextActions: [
          {
            id: "deploy-production-peer-route-config",
            title: "Deploy production peer route config",
            detail: "Deploy production route stanzas.",
            requiredInputs: "not-an-array",
            blockedByChecks: ["peer-route-production-readiness"],
            commands: ["npm run e2e:sccp:bsc-peer-config-audit"],
          },
        ],
      }),
      smokeReadinessReport: smokeReadinessReport({
        peerAudit: {
          ...baseSmoke.peerAudit,
          peers: "not-an-array",
        },
      }),
      materialInventoryReport: materialInventoryReport({
        nextActions: accessorNextActions,
        scanRootStatuses: "not-an-array",
      }),
      videoTranscript: videoTranscript({
        readinessBinding: {
          ...baseVideo.readinessBinding,
          checks: "not-an-array",
        },
        transactionLinks: "not-an-array",
      }),
    });

    expect(accessorNextActionReads).toBe(0);
    expect(report.ready).toBe(false);
    expect(failedCheck(report, "route-preflight-ready")?.detail).toMatch(
      /route preflight next action is not an array/u,
    );
    expect(failedCheck(report, "route-preflight-ready")?.detail).toMatch(
      /route preflight missing production input is not an array/u,
    );
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer audit next action 0 required input is not an array/u,
    );
    expect(failedCheck(report, "smoke-readiness-ready")?.detail).toMatch(
      /smoke-readiness peer audit peer is not an array/u,
    );
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(/production material inventory next action 0 is not an object/u);
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(
      /production material inventory scan root status is not an array/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /video readiness binding check is not an array/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /video proof transcript transaction link is not an array/u,
    );
    expect(JSON.stringify(report)).not.toContain("hidden-action");
    expect(JSON.stringify(report)).not.toContain("This must not be read");
  });

  it("rejects public next actions without complete operator runbook arrays", () => {
    const report = evaluate({
      routeReport: routeReport({
        nextActions: [
          {
            id: "publish-production-route-artifacts",
            title: "Publish production route artifacts",
            detail: "Publish the production route artifacts.",
            requiredInputs: [],
            blockedByChecks: [],
            commands: [],
          },
          {
            id: "refresh-public-route-evidence",
            title: "Refresh public route evidence",
            detail: "Refresh route evidence.",
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    const detail = failedCheck(report, "route-preflight-ready")?.detail;
    expect(detail).toMatch(
      /route preflight next action 0 requiredInputs is missing or empty/u,
    );
    expect(detail).toMatch(
      /route preflight next action 0 blockedByChecks is missing or empty/u,
    );
    expect(detail).toMatch(
      /route preflight next action 0 commands is missing or empty/u,
    );
    expect(detail).toMatch(
      /route preflight next action 1 requiredInputs is missing or empty/u,
    );
    expect(detail).toMatch(
      /route preflight next action 1 blockedByChecks is missing or empty/u,
    );
    expect(detail).toMatch(
      /route preflight next action 1 commands is missing or empty/u,
    );
  });

  it("redacts smoke-readiness next-action fields before publishing the aggregate summary", () => {
    const baseSmoke = smokeReadinessReport();
    const secret = `accessToken=${"22".repeat(32)}`;
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        ready: false,
        checks: baseSmoke.checks.map((entry) =>
          entry.id === "walletconnect-project-id"
            ? { ...entry, status: "fail", detail: "missing project id" }
            : entry,
        ),
        nextActions: [
          {
            id: "configure-bsc-walletconnect",
            title: "Configure BSC WalletConnect",
            detail: "Configure WalletConnect for BSC smoke signing.",
            requiredInputs: [
              {
                id: "walletconnect-project-id",
                kind: "operator-environment",
                placeholder: "<walletconnect-project-id>",
                description: "WalletConnect project id.",
              },
              {
                id: secret,
                kind: "operator-environment",
                placeholder: secret,
                description: secret,
              },
            ],
            blockedByChecks: ["walletconnect-project-id", secret],
            commands: [
              "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
              `${secret} npm run e2e:sccp:bsc-smoke-readiness`,
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
          {
            id: secret,
            kind: "operator-environment",
            placeholder: secret,
            description: secret,
            blockedByActions: ["configure-bsc-walletconnect", secret],
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    expect(report.smokeReadiness?.nextActions).toEqual([
      {
        id: "configure-bsc-walletconnect",
        title: "Configure BSC WalletConnect",
        detail: "Configure WalletConnect for BSC smoke signing.",
        requiredInputs: [
          {
            id: "walletconnect-project-id",
            kind: "operator-environment",
            placeholder: "<walletconnect-project-id>",
            description: "WalletConnect project id.",
          },
          {
            id: "redacted-check",
            kind: "operator-environment",
            placeholder: "[redacted secret-like detail]",
            description: "[redacted secret-like detail]",
          },
        ],
        blockedByChecks: ["walletconnect-project-id", "redacted-check"],
        commands: [
          "npm run e2e:sccp:bsc-smoke-readiness -- --bsc-network testnet",
          "[redacted secret-like detail]",
        ],
      },
    ]);
    expect(report.smokeReadiness?.missingProductionInputs).toEqual([
      {
        id: "walletconnect-project-id",
        kind: "operator-environment",
        placeholder: "<walletconnect-project-id>",
        description: "WalletConnect project id.",
        blockedByActions: ["configure-bsc-walletconnect"],
      },
      {
        id: "redacted-check",
        kind: "operator-environment",
        placeholder: "[redacted secret-like detail]",
        description: "[redacted secret-like detail]",
        blockedByActions: ["configure-bsc-walletconnect", "redacted-check"],
      },
    ]);
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "walletconnect-project-id",
          blockedByActions: expect.arrayContaining([
            "publish-bsc-prover-modules",
          ]),
          blockedBySmokeActions: ["configure-bsc-walletconnect"],
        }),
      ]),
    );
    expect(
      report.missingProductionInputs.map((input) => input.id),
    ).not.toContain("redacted-check");
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("redacts route-preflight next-action fields before publishing the aggregate summary", () => {
    const baseRoute = routeReport();
    const secret = `privateKey=0x${"33".repeat(32)}`;
    const report = evaluate({
      routeReport: routeReport({
        ready: false,
        checks: baseRoute.checks.map((entry) =>
          entry.id === "bsc-production-prover-material"
            ? { ...entry, ok: false, message: "missing proof material" }
            : entry,
        ),
        nextActions: [
          {
            id: "publish-production-proof-material",
            title: "Publish production proof material",
            detail: "Publish route-bound production BSC proof material.",
            requiredInputs: [
              {
                id: "burn-record-proof-artifact",
                kind: "file",
                placeholder: "<burn-record-proof-artifact.r1cs>",
                description: "Production burn-record proof artifact.",
              },
              {
                id: secret,
                kind: "operator-environment",
                placeholder: secret,
                description: secret,
              },
            ],
            blockedByChecks: ["bsc-production-prover-material", secret],
            commands: [
              "npm run e2e:sccp:bsc-preflight -- --bsc-network testnet",
              `${secret} npm run e2e:sccp:bsc-preflight`,
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "burn-record-proof-artifact",
            kind: "file",
            placeholder: "<burn-record-proof-artifact.r1cs>",
            description: "Production burn-record proof artifact.",
            blockedByActions: ["publish-production-proof-material"],
          },
          {
            id: secret,
            kind: "operator-environment",
            placeholder: secret,
            description: secret,
            blockedByActions: ["publish-production-proof-material", secret],
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    expect(report.route?.nextActions).toEqual([
      {
        id: "publish-production-proof-material",
        title: "Publish production proof material",
        detail: "Publish route-bound production BSC proof material.",
        requiredInputs: [
          {
            id: "burn-record-proof-artifact",
            kind: "file",
            placeholder: "<burn-record-proof-artifact.r1cs>",
            description: "Production burn-record proof artifact.",
          },
          {
            id: "redacted-check",
            kind: "operator-environment",
            placeholder: "[redacted secret-like detail]",
            description: "[redacted secret-like detail]",
          },
        ],
        blockedByChecks: ["bsc-production-prover-material", "redacted-check"],
        commands: [
          "npm run e2e:sccp:bsc-preflight -- --bsc-network testnet",
          "[redacted secret-like detail]",
        ],
      },
    ]);
    expect(report.route?.missingProductionInputs).toEqual([
      {
        id: "burn-record-proof-artifact",
        kind: "file",
        placeholder: "<burn-record-proof-artifact.r1cs>",
        description: "Production burn-record proof artifact.",
        blockedByActions: ["publish-production-proof-material"],
      },
      {
        id: "redacted-check",
        kind: "operator-environment",
        placeholder: "[redacted secret-like detail]",
        description: "[redacted secret-like detail]",
        blockedByActions: [
          "publish-production-proof-material",
          "redacted-check",
        ],
      },
    ]);
    expect(report.missingProductionInputs.map((input) => input.id)).not.toEqual(
      expect.arrayContaining(["burn-record-proof-artifact", "redacted-check"]),
    );
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("redacts peer-audit next-action fields before publishing the aggregate summary", () => {
    const basePeerAudit = peerAuditReport();
    const secret = `mnemonic=${"abandon ".repeat(11)}about`;
    const report = evaluate({
      peerAuditReport: peerAuditReport({
        ready: false,
        checks: basePeerAudit.checks.map((entry) =>
          entry.id === "peer-route-production-readiness"
            ? { ...entry, ok: false, message: "peer route not production" }
            : entry,
        ),
        nextActions: [
          {
            id: "deploy-production-peer-route-config",
            title: "Deploy production peer route config",
            detail: "Deploy production route stanzas to every TAIRA peer.",
            requiredInputs: [
              {
                id: "taira-peer-config-targets",
                kind: "operator-environment",
                placeholder: "<taira-peer-config-targets>",
                description: "TAIRA peer config targets.",
              },
              {
                id: secret,
                kind: "operator-environment",
                placeholder: secret,
                description: secret,
              },
            ],
            blockedByChecks: ["peer-route-production-readiness", secret],
            commands: [
              "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
              `${secret} npm run e2e:sccp:bsc-peer-config-audit`,
            ],
          },
        ],
        missingProductionInputs: [
          {
            id: "taira-peer-config-targets",
            kind: "operator-environment",
            placeholder: "<taira-peer-config-targets>",
            description: "TAIRA peer config targets.",
            blockedByActions: ["deploy-production-peer-route-config"],
          },
          {
            id: secret,
            kind: "operator-environment",
            placeholder: secret,
            description: secret,
            blockedByActions: ["deploy-production-peer-route-config", secret],
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    expect(report.peerAudit?.nextActions).toEqual([
      {
        id: "deploy-production-peer-route-config",
        title: "Deploy production peer route config",
        detail: "Deploy production route stanzas to every TAIRA peer.",
        requiredInputs: [
          {
            id: "taira-peer-config-targets",
            kind: "operator-environment",
            placeholder: "<taira-peer-config-targets>",
            description: "TAIRA peer config targets.",
          },
          {
            id: "redacted-check",
            kind: "operator-environment",
            placeholder: "[redacted secret-like detail]",
            description: "[redacted secret-like detail]",
          },
        ],
        blockedByChecks: ["peer-route-production-readiness", "redacted-check"],
        commands: [
          "npm run e2e:sccp:bsc-peer-config-audit -- --bsc-network testnet",
          "[redacted secret-like detail]",
        ],
      },
    ]);
    expect(report.peerAudit?.missingProductionInputs).toEqual([
      {
        id: "taira-peer-config-targets",
        kind: "operator-environment",
        placeholder: "<taira-peer-config-targets>",
        description: "TAIRA peer config targets.",
        blockedByActions: ["deploy-production-peer-route-config"],
      },
      {
        id: "redacted-check",
        kind: "operator-environment",
        placeholder: "[redacted secret-like detail]",
        description: "[redacted secret-like detail]",
        blockedByActions: [
          "deploy-production-peer-route-config",
          "redacted-check",
        ],
      },
    ]);
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "taira-peer-config-targets",
          blockedByActions: expect.arrayContaining([
            "remove-stale-peer-route-overrides",
          ]),
          blockedByPeerActions: ["deploy-production-peer-route-config"],
        }),
      ]),
    );
    expect(
      report.missingProductionInputs.map((input) => input.id),
    ).not.toContain("redacted-check");
    expect(JSON.stringify(report)).not.toContain(secret);
  });

  it("accepts a reported skipped generated material directory when the count and path are bound", () => {
    const baseInventory = materialInventoryReport();
    const skippedGeneratedDirectories = [
      "./output/sccp-bsc-material-inventory-test-20260613",
    ];
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        scanRoots: ["./output", "./public/sccp-bsc"],
        scanRootStatuses: [
          { path: "./output", ok: true, kind: "directory" },
          { path: "./public/sccp-bsc", ok: true, kind: "directory" },
        ],
        counts: {
          ...baseInventory.counts,
          skippedGeneratedDirectories: skippedGeneratedDirectories.length,
        },
        skippedGeneratedDirectories,
      }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.materialInventory?.counts?.skippedGeneratedDirectories).toBe(
      skippedGeneratedDirectories.length,
    );
    expect(report.materialInventory?.skippedGeneratedDirectories).toEqual(
      skippedGeneratedDirectories,
    );
  });

  it("surfaces material inventory warning findings in the aggregate report", () => {
    const baseInventory = materialInventoryReport();
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        counts: {
          ...baseInventory.counts,
          warningFindings: 1,
        },
        files: baseInventory.files.map((entry, index) =>
          index === 0
            ? {
                ...entry,
                findings: [
                  {
                    severity: "warning",
                    id: "standalone-browser-prover-module",
                    message:
                      "A BSC browser prover module was scanned without an adjacent sidecar manifest.",
                  },
                ],
              }
            : entry,
        ),
      }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.materialInventory?.counts?.warningFindings).toBe(1);
    expect(report.materialInventory?.files?.[0]).toMatchObject({
      path: baseInventory.files[0].path,
      kind: baseInventory.files[0].kind,
      sizeBytes: baseInventory.files[0].sizeBytes,
      sha256: baseInventory.files[0].sha256,
      findings: [
        {
          severity: "warning",
          id: "standalone-browser-prover-module",
          code: null,
        },
      ],
    });
  });

  it("emits stable next actions for the current diagnostic-material production blockers", () => {
    const staleIso = new Date(NOW_MS - 24 * 60 * 60 * 1000).toISOString();
    const staleMs = Date.parse(staleIso);
    const diagnosticDeployment = deployment({
      verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
      proofArtifactHash: null,
      provingKeyHash: null,
      nativeEvmProverBundleHash: null,
    });
    const basePeerAudit = peerAuditReport();
    const baseSmoke = smokeReadinessReport();
    const baseInventory = materialInventoryReport();

    const report = evaluate({
      routeReport: routeReport({
        ready: false,
        generatedAtMs: staleMs,
        warnings: ["diagnostic verifier material"],
        deployment: diagnosticDeployment,
      }),
      peerAuditReport: peerAuditReport({
        ready: false,
        generatedAtMs: staleMs,
        checks: basePeerAudit.checks.map((entry) =>
          entry.id === "peer-route-production-readiness"
            ? { ...entry, ok: false, message: "diagnostic verifier material" }
            : entry,
        ),
        peers: basePeerAudit.peers.map((peer) => ({
          ...peer,
          ready: false,
          productionReady: false,
          deployment: diagnosticDeployment,
        })),
      }),
      smokeReadinessReport: smokeReadinessReport({
        ready: false,
        checkedAt: staleIso,
        routeReady: false,
        route: {
          ...baseSmoke.route,
          deployment: diagnosticDeployment,
        },
        peerAudit: {
          ...baseSmoke.peerAudit,
          ready: false,
        },
        checks: baseSmoke.checks.map((entry) =>
          ["route-preflight", "peer-config-audit"].includes(entry.id)
            ? { ...entry, status: "fail", message: "not production ready" }
            : entry,
        ),
      }),
      materialInventoryReport: materialInventoryReport({
        ready: false,
        generatedAt: staleIso,
        checks: baseInventory.checks.map((entry) =>
          [
            "production-route-artifact",
            "production-burn-record-material",
            "production-verifier-material",
            "native-evm-prover-bundle",
            "production-proof-files",
            "destination-browser-prover",
            "source-browser-prover",
            "runtime-prover-config",
          ].includes(entry.id)
            ? { ...entry, ok: false, message: "missing production material" }
            : entry,
        ),
        route: {
          ...baseInventory.route,
          ready: false,
          deployment: diagnosticDeployment,
        },
        counts: {
          files: 1,
          productionRouteArtifacts: 0,
          productionVerifierArtifacts: 0,
          productionNativeProverBundles: 0,
          proofArtifacts: 0,
          provingKeys: 0,
          criticalFindings: 0,
          warningFindings: 0,
        },
        missingProductionInputs: [
          {
            id: "production-route-manifest",
            kind: "file",
            placeholder: "<production-route.manifest.json>",
            description: "Production route manifest bound to route material.",
            blockedByActions: ["publish-production-route-artifacts"],
          },
          {
            id: "production-route-overlay",
            kind: "file",
            placeholder: "<production-route.production-ready.torii.toml>",
            description: "TAIRA route overlay generated from the manifest.",
            blockedByActions: ["publish-production-route-artifacts"],
          },
          {
            id: "testnet-runtime-prover-config",
            kind: "url",
            placeholder: "<runtime-prover-config-url>",
            description: "Runtime prover config for the selected BSC network.",
            blockedByActions: ["publish-browser-prover-modules"],
          },
          {
            id: "public-route-report",
            kind: "file",
            placeholder: "<route-preflight-report.json>",
            description: "Fresh public route preflight report.",
            blockedByActions: ["refresh-public-route-evidence"],
          },
        ],
      }),
      videoTranscript: null,
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "replace-diagnostic-bsc-verifier",
      "publish-production-proof-material",
      "publish-bsc-prover-modules",
      "remove-stale-peer-route-overrides",
      "refresh-readiness-evidence",
      "record-live-video-proof",
    ]);
    const actions = Object.fromEntries(
      report.nextActions.map((action) => [action.id, action]),
    );
    expect(
      actions["replace-diagnostic-bsc-verifier"].blockedByChecks,
    ).toContain("route-report-diagnostic-verifier-key-hash-scan");
    expect(
      actions["publish-production-proof-material"].blockedByChecks,
    ).toEqual(
      expect.arrayContaining([
        "production-proof-material",
        "production-material-inventory",
      ]),
    );
    expect(actions["publish-bsc-prover-modules"].blockedByChecks).toEqual(
      expect.arrayContaining([
        "material-runtime-prover-configured",
        "material-destination-prover-configured",
        "material-source-prover-configured",
      ]),
    );
    expect(
      actions["remove-stale-peer-route-overrides"].blockedByChecks,
    ).toContain("peer-config-audit-ready");
    expect(actions["refresh-readiness-evidence"].blockedByChecks).toEqual(
      expect.arrayContaining([
        "evidence-freshness",
        "route-preflight-ready",
        "smoke-readiness-ready",
        "smoke-readiness-binding",
        "cross-report-binding",
        "production-material-inventory",
      ]),
    );
    expect(actions["record-live-video-proof"].blockedByChecks).toEqual(
      expect.arrayContaining([
        "video-proof-transcript-present",
        "video-artifact-captured",
        "video-proof-complete",
      ]),
    );
    expect(
      report.nextActions.every(
        (action) =>
          action.title &&
          action.detail &&
          action.commands.length > 0 &&
          action.requiredInputs.length > 0 &&
          action.blockedByChecks.length > 0,
      ),
    ).toBe(true);
    expect(JSON.stringify(report.nextActions)).not.toMatch(
      /private|seed|mnemonic/iu,
    );
    const commandText = JSON.stringify(report.nextActions);
    expect(commandText).not.toContain("{bscNetwork}");
    expect(commandText).not.toContain("{confirmNetwork}");
    expect(commandText).not.toContain("{mainnetConfirmation}");
    expect(actions["replace-diagnostic-bsc-verifier"].commands[0]).toContain(
      "--confirm-network taira_bsc_xor:testnet",
    );
    expect(
      actions["replace-diagnostic-bsc-verifier"].commands[0],
    ).not.toContain("--confirm-mainnet true");
    expect(actions["publish-production-proof-material"].commands[0]).toContain(
      "requirements --bsc-network testnet --out <production-requirements.json>",
    );
    expect(actions["publish-production-proof-material"].commands[1]).toContain(
      " route-manifest --evidence <testnet-deployment-evidence.json>",
    );
    expect(actions["publish-production-proof-material"].commands[1]).toContain(
      "--taira-contract <taira-burn-record.contract.json>",
    );
    expect(actions["publish-production-proof-material"].commands[1]).toContain(
      "--settlement-asset-definition-id <canonical-asset-definition-id>",
    );
    expect(actions["publish-production-proof-material"].commands[2]).toContain(
      "source-parity-attestation --bsc-network testnet",
    );
    expect(actions["publish-production-proof-material"].commands[3]).toContain(
      "groth16-material attestation-inventory --request <attestation-request.json>",
    );
    expect(actions["publish-production-proof-material"].commands[3]).toContain(
      "--scan-dir <native-prover-artifact-root>",
    );
    expect(actions["publish-production-proof-material"].commands[3]).toContain(
      "--trusted-attestation-signer <0x...>",
    );
    expect(actions["publish-production-proof-material"].commands[4]).toContain(
      "--groth16-proof-self-test <relative-groth16-proof-self-test.json>",
    );
    expect(actions["publish-production-proof-material"].commands[4]).toContain(
      "--snarkjs-bin <snarkjs>",
    );
    expect(actions["publish-production-proof-material"].commands[4]).toContain(
      "--trusted-attestation-signer <0x...>",
    );
    expect(actions["publish-production-proof-material"].commands[4]).toContain(
      "--cross-sdk-parity <relative-cross-sdk-parity.json>",
    );
    expect(actions["publish-production-proof-material"].commands[4]).toContain(
      "--audit-no-wasm-no-remote-scan <hex-or-relative-file>",
    );
    expect(actions["publish-production-proof-material"].commands[5]).toContain(
      "--native-prover-bundle <native-evm-prover-bundle.json>",
    );
    expect(actions["publish-production-proof-material"].commands[5]).toContain(
      "--source-bridge-config-hash <0x...>",
    );
    expect(
      actions["publish-production-proof-material"].commands[5],
    ).not.toContain("--offline-full-toml-sha256");
    expect(actions["publish-production-proof-material"].commands[5]).toContain(
      "--out <production-route.pre-offline-evidence.manifest.json>",
    );
    expect(actions["publish-production-proof-material"].commands[5]).toContain(
      "--live-readback-checked true",
    );
    expect(
      actions["publish-production-proof-material"].commands[5],
    ).not.toContain("--production-ready true");
    expect(actions["publish-production-proof-material"].commands[6]).toContain(
      " route-config --manifest <production-route.pre-offline-evidence.manifest.json>",
    );
    expect(actions["publish-production-proof-material"].commands[6]).toContain(
      "--allow-unready true",
    );
    expect(actions["publish-production-proof-material"].commands[6]).toContain(
      "--write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(actions["publish-production-proof-material"].commands[7]).toContain(
      "--offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(actions["publish-production-proof-material"].commands[7]).toContain(
      "--production-ready true",
    );
    expect(actions["publish-production-proof-material"].commands[7]).toContain(
      "--confirm-testnet taira_bsc_xor",
    );
    expect(
      JSON.stringify(actions["publish-production-proof-material"]),
    ).not.toContain("--offline-full-toml-sha256");
    expect(actions["remove-stale-peer-route-overrides"].commands[0]).toContain(
      "--dir <peer-config-audit-source>",
    );
    expect(actions["remove-stale-peer-route-overrides"].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "taira-peer-config-targets" }),
        expect.objectContaining({ id: "peer-config-audit-source" }),
      ]),
    );
    expect(actions["replace-diagnostic-bsc-verifier"].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-groth16-verifier-key-json",
          kind: "file",
          placeholder: "<production-verifier-key.json>",
        }),
        expect.objectContaining({
          id: "testnet-funded-bsc-deployer",
          kind: "operator-environment",
          placeholder: "<testnet-deployer-signing-env>",
        }),
      ]),
    );
    expect(actions["publish-production-proof-material"].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "testnet-bsc-deployment-evidence",
          placeholder: "<testnet-deployment-evidence.json>",
        }),
        expect.objectContaining({
          id: "taira-burn-record-contract",
          placeholder: "<taira-burn-record.contract.json>",
        }),
        expect.objectContaining({
          id: "canonical-settlement-asset-definition-id",
          placeholder: "<canonical-asset-definition-id>",
        }),
        expect.objectContaining({
          id: "post-deploy-live-evidence",
          placeholder:
            "<source-event/route-canary/full-config hashes and explorer urls>",
        }),
        expect.objectContaining({
          id: "deployed-taira-base-config",
          placeholder: "<deployed-taira-config.toml>",
        }),
        expect.objectContaining({
          id: "production-material-scan-path",
          kind: "directory",
          placeholder: "<production-material-scan-path>",
        }),
        expect.objectContaining({
          id: "burn-record-proof-artifact",
          placeholder: "<relative-circuit.r1cs>",
        }),
        expect.objectContaining({
          id: "burn-record-proving-key",
          placeholder: "<relative-circuit.zkey>",
        }),
        expect.objectContaining({
          id: "groth16-material-manifest",
          placeholder: "<relative-groth16-material-manifest.json>",
        }),
        expect.objectContaining({
          id: "groth16-attestation-request",
          placeholder: "<attestation-request.json>",
        }),
        expect.objectContaining({
          id: "trusted-attestation-signer",
          placeholder: "<0x...>",
        }),
        expect.objectContaining({
          id: "groth16-proof-self-test",
          placeholder: "<relative-groth16-proof-self-test.json>",
        }),
        expect.objectContaining({
          id: "snarkjs-binary",
          placeholder: "<snarkjs>",
        }),
        expect.objectContaining({
          id: "cross-sdk-parity-report",
          placeholder: "<relative-cross-sdk-parity.json>",
        }),
        expect.objectContaining({
          id: "source-parity-attestation",
          placeholder: "<source-parity-attestation.json>",
        }),
        expect.objectContaining({
          id: "audit-no-wasm-no-remote-scan",
          placeholder: "<hex-or-relative-file>",
        }),
      ]),
    );
    expect(actions["publish-bsc-prover-modules"].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "testnet-destination-browser-prover-module",
          placeholder: "<testnet-destination-prover-module-url>",
        }),
        expect.objectContaining({
          id: "testnet-source-browser-prover-module",
          placeholder: "<testnet-source-prover-module-url>",
        }),
        expect.objectContaining({
          id: "walletconnect-project-id",
        }),
        expect.objectContaining({
          id: "testnet-runtime-prover-config",
        }),
      ]),
    );
    expect(actions["record-live-video-proof"].requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "funded-taira-wallet",
          kind: "secure-wallet",
        }),
        expect.objectContaining({
          id: "testnet-wallet-session",
          placeholder: "<testnet-walletconnect-session>",
        }),
        expect.objectContaining({
          id: "sccp-ui-proof-video",
          kind: "video-file",
        }),
      ]),
    );
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
          blockedByActions: expect.arrayContaining([
            "publish-production-proof-material",
          ]),
          blockedByMaterialActions: ["publish-production-route-artifacts"],
        }),
        expect.objectContaining({
          id: "testnet-runtime-prover-config",
          blockedByActions: expect.arrayContaining([
            "publish-bsc-prover-modules",
          ]),
          blockedByMaterialActions: ["publish-browser-prover-modules"],
        }),
        expect.objectContaining({
          id: "public-route-report",
          blockedByActions: expect.arrayContaining([
            "refresh-readiness-evidence",
          ]),
          blockedByMaterialActions: ["refresh-public-route-evidence"],
        }),
        expect.objectContaining({
          id: "taira-burn-record-contract",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "canonical-settlement-asset-definition-id",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "post-deploy-live-evidence",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "groth16-material-manifest",
          blockedByActions: ["publish-production-proof-material"],
        }),
        expect.objectContaining({
          id: "production-material-scan-path",
          blockedByActions: expect.arrayContaining([
            "publish-production-proof-material",
            "refresh-readiness-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "sccp-ui-proof-video",
          blockedByActions: ["record-live-video-proof"],
        }),
      ]),
    );
    expect(JSON.stringify(report.missingProductionInputs)).not.toContain(
      "{bscNetwork}",
    );
    for (const input of report.missingProductionInputs) {
      expect(input.blockedByActions, input.id).not.toEqual([]);
    }
  });

  it("routes missing video proof to recording without asking for prerequisite refresh", () => {
    const report = evaluate({ videoTranscript: null });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "evidence-freshness")).toBeUndefined();
    expect(report.nextActions.map((action) => action.id)).toEqual([
      "record-live-video-proof",
    ]);
    const recordAction = report.nextActions[0];
    expect(recordAction.blockedByChecks).toEqual(
      expect.arrayContaining([
        "video-proof-transcript-present",
        "video-readiness-binding",
        "video-artifact-captured",
        "video-proof-complete",
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "sccp-ui-proof-video",
          blockedByActions: ["record-live-video-proof"],
        }),
        expect.objectContaining({
          id: "bsc-explorer-screenshots",
          blockedByActions: ["record-live-video-proof"],
        }),
      ]),
    );
    expect(JSON.stringify(report.missingProductionInputs)).not.toContain(
      "production-material-scan-path",
    );
  });

  it("routes unavailable production material scan roots into proof-material next actions", () => {
    const baseInventory = materialInventoryReport();
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        scanRootStatuses: [
          {
            path: "./output/sccp-bsc-production",
            ok: false,
            kind: "missing",
            detail: "scan root does not exist or cannot be read",
          },
          baseInventory.scanRootStatuses[1],
        ],
        checks: baseInventory.checks.map((entry) =>
          entry.id === "scan-root-availability"
            ? {
                ...entry,
                ok: false,
                message: "scan root does not exist or cannot be read",
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "material-inventory-scan-root-availability")?.detail,
    ).toMatch(
      /production material inventory scan root 0 is unavailable: missing \(scan root does not exist or cannot be read\)/u,
    );
    const publishProofMaterial = report.nextActions.find(
      (action) => action.id === "publish-production-proof-material",
    );
    expect(publishProofMaterial?.blockedByChecks).toEqual(
      expect.arrayContaining([
        "material-inventory-scan-root-availability",
        "production-material-inventory",
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "production-material-scan-path",
          blockedByActions: expect.arrayContaining([
            "publish-production-proof-material",
            "refresh-readiness-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "native-prover-artifact-root",
          blockedByActions: ["publish-production-proof-material"],
        }),
      ]),
    );
    const publicText = JSON.stringify({
      checks: report.checks,
      nextActions: report.nextActions,
      missingProductionInputs: report.missingProductionInputs,
      materialInventory: report.materialInventory,
    });
    expect(publicText).not.toContain("/Users/");
    expect(publicText).not.toContain("file://");
    expect(publicText).not.toMatch(/private|seed|mnemonic/iu);
  });

  it("routes missing material-inventory deployment evidence into production artifact publication", () => {
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        checks: materialInventoryReport().checks.map((entry) =>
          entry.id === "deployment-evidence-artifact"
            ? {
                ...entry,
                ok: false,
                message: "deployment-evidence-artifact is missing.",
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "material-deployment-evidence-artifact")?.detail,
    ).toMatch(/deployment-evidence-artifact is missing/u);
    const publishProofMaterial = report.nextActions.find(
      (action) => action.id === "publish-production-proof-material",
    );
    expect(publishProofMaterial?.blockedByChecks).toEqual(
      expect.arrayContaining([
        "material-deployment-evidence-artifact",
        "production-material-inventory",
      ]),
    );
  });

  it("routes generated offline full-TOML evidence that is not published to public reports", () => {
    const unpublishedEvidence = postDeployLiveEvidence({
      offlineFullTomlSha256: undefined,
    });
    const basePeerAudit = peerAuditReport();
    const baseSmoke = smokeReadinessReport();
    const baseInventory = materialInventoryReport();
    const baseVideo = videoTranscript();
    const materialInventoryWithGeneratedEvidence = materialInventoryReport({
      ready: false,
      route: {
        ...baseInventory.route,
        postDeployLiveEvidence: unpublishedEvidence,
      },
      checks: baseInventory.checks.map((entry) =>
        entry.id === "offline-full-toml-evidence-artifact"
          ? {
              ...entry,
              ok: false,
              message:
                "route offlineFullTomlSha256 is missing from public evidence",
            }
          : entry,
      ),
      files: baseInventory.files.map((entry) => {
        if (entry.kind === "route") {
          return {
            ...entry,
            route: {
              ...entry.route,
              postDeployLiveEvidence: unpublishedEvidence,
            },
          };
        }
        if (entry.kind === "offline-full-toml-evidence") {
          return {
            ...entry,
            offlineFullTomlEvidence: {
              ...entry.offlineFullTomlEvidence,
              publicPostDeployMatches: false,
            },
          };
        }
        return entry;
      }),
    });
    const report = evaluate({
      routeReport: routeReport({
        postDeployLiveEvidence: unpublishedEvidence,
      }),
      smokeReadinessReport: smokeReadinessReport({
        route: {
          ...baseSmoke.route,
          postDeployLiveEvidence: unpublishedEvidence,
        },
      }),
      materialInventoryReport: materialInventoryWithGeneratedEvidence,
      videoTranscript: videoTranscript({
        readinessBinding: {
          ...baseVideo.readinessBinding,
          route: {
            ...baseVideo.readinessBinding.route,
            postDeployLiveEvidence: unpublishedEvidence,
          },
        },
      }),
    });

    expect(report.ready).toBe(false);
    const failedPublication = failedCheck(
      report,
      "offline-full-toml-publication",
    );
    expect(failedPublication?.detail).toContain(
      `public route report postDeployLiveEvidence.offlineFullTomlSha256 is missing or invalid; generated evidence hash ${HASH_88} is not published.`,
    );
    expect(failedPublication?.detail).toMatch(
      /production material inventory offline full-TOML evidence file \d+ publicPostDeployMatches is not true/u,
    );
    expect(report.materialInventory?.files).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "offline-full-toml-evidence",
          offlineFullTomlEvidence: expect.objectContaining({
            offlineFullTomlSha256: HASH_88,
            hashInputSha256: HASH_88,
            publicPostDeployMatches: false,
          }),
        }),
      ]),
    );
    const publishOfflineEvidence = report.nextActions.find(
      (action) => action.id === "publish-offline-full-toml-evidence",
    );
    expect(publishOfflineEvidence?.blockedByChecks).toEqual([
      "offline-full-toml-publication",
    ]);
    expect(publishOfflineEvidence?.commands[0]).toContain(
      "--write-offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(publishOfflineEvidence?.commands[1]).toContain(
      "--offline-full-toml-evidence <offline-full-toml-evidence.json>",
    );
    expect(publishOfflineEvidence?.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "testnet-bsc-deployment-evidence",
          placeholder: "<testnet-deployment-evidence.json>",
        }),
        expect.objectContaining({
          id: "taira-burn-record-contract",
          placeholder: "<taira-burn-record.contract.json>",
        }),
        expect.objectContaining({
          id: "canonical-settlement-asset-definition-id",
          placeholder: "<canonical-asset-definition-id>",
        }),
        expect.objectContaining({
          id: "native-evm-prover-bundle",
          placeholder: "<native-evm-prover-bundle.json>",
        }),
        expect.objectContaining({
          id: "post-deploy-live-evidence",
          placeholder:
            "<source-event/route-canary/full-config hashes and explorer urls>",
        }),
      ]),
    );
    const concretePlaceholders = [
      "<production-route.manifest.json>",
      "<offline-full-toml-evidence.json>",
      "<testnet-deployment-evidence.json>",
      "<taira-burn-record.contract.json>",
      "<canonical-asset-definition-id>",
      "<native-evm-prover-bundle.json>",
      "<deployed-taira-config.toml>",
      "<peer-config-audit-source>",
    ];
    const requiredPlaceholders = new Set(
      publishOfflineEvidence?.requiredInputs.map((input) => input.placeholder),
    );
    for (const placeholder of concretePlaceholders) {
      expect(
        publishOfflineEvidence?.commands.some((command) =>
          command.includes(placeholder),
        ),
      ).toBe(true);
      expect(requiredPlaceholders.has(placeholder)).toBe(true);
    }
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "offline-full-toml-evidence",
          blockedByActions: expect.arrayContaining([
            "publish-offline-full-toml-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "testnet-bsc-deployment-evidence",
          blockedByActions: expect.arrayContaining([
            "publish-offline-full-toml-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "taira-burn-record-contract",
          blockedByActions: expect.arrayContaining([
            "publish-offline-full-toml-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "canonical-settlement-asset-definition-id",
          blockedByActions: expect.arrayContaining([
            "publish-offline-full-toml-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "native-evm-prover-bundle",
          blockedByActions: ["publish-offline-full-toml-evidence"],
        }),
        expect.objectContaining({
          id: "post-deploy-live-evidence",
          blockedByActions: expect.arrayContaining([
            "publish-offline-full-toml-evidence",
          ]),
        }),
        expect.objectContaining({
          id: "taira-route-publication-channel",
          blockedByActions: ["publish-offline-full-toml-evidence"],
        }),
      ]),
    );
  });

  it.each([
    [
      "missing route manifest path",
      { routeManifestPath: "" },
      /routeManifestPath is missing/u,
    ],
    [
      "absolute full config path",
      { fullConfigPath: "/tmp/full-config.toml" },
      /fullConfigPath must be a relative path/u,
    ],
    [
      "encoded traversal full config path",
      { fullConfigPath: "output/sccp-bsc-production/%2e%2e/full-config.toml" },
      /fullConfigPath must not use percent-encoded path segments/u,
    ],
    [
      "query route manifest path",
      {
        routeManifestPath:
          "output/sccp-bsc-production/taira-bsc-xor-route.manifest.json?raw=1",
      },
      /routeManifestPath must be a relative path/u,
    ],
  ])(
    "does not publish offline full-TOML evidence with %s provenance",
    (_label, evidencePatch, inventoryDetail) => {
      const report = evaluate({
        materialInventoryReport: materialInventoryReport({
          ready: false,
          files: materialInventoryReport().files.map((entry) =>
            entry.kind === "offline-full-toml-evidence"
              ? {
                  ...entry,
                  offlineFullTomlEvidence: {
                    ...entry.offlineFullTomlEvidence,
                    ...evidencePatch,
                  },
                }
              : entry,
          ),
        }),
      });

      expect(report.ready).toBe(false);
      expect(
        failedCheck(report, "offline-full-toml-publication")?.detail,
      ).toContain(
        "production material inventory has no valid generated offline full-TOML evidence artifact to publish.",
      );
      expect(
        failedCheck(report, "production-material-inventory")?.detail,
      ).toMatch(inventoryDetail);
    },
  );

  it("keeps the operator runbook aligned with offline full-TOML publication requirements", async () => {
    const docs = await readFile(
      path.join(process.cwd(), "SCCP_BSC_TESTNET.md"),
      "utf8",
    );
    const normalizedDocs = docs.replace(/\s+/gu, " ");
    const publishAction = evaluate({
      routeReport: routeReport({
        postDeployLiveEvidence: postDeployLiveEvidence({
          offlineFullTomlSha256: undefined,
        }),
      }),
      materialInventoryReport: materialInventoryReport({
        checks: materialInventoryReport().checks.map((entry) =>
          entry.id === "offline-full-toml-evidence-artifact"
            ? {
                ...entry,
                ok: false,
                message:
                  "route offlineFullTomlSha256 is missing from public evidence",
              }
            : entry,
        ),
      }),
    }).nextActions.find(
      (action) => action.id === "publish-offline-full-toml-evidence",
    );

    expect(publishAction).toBeDefined();
    expect(docs).toContain("`publish-offline-full-toml-evidence`");
    expect(docs).not.toContain("`publish-offline-full-toml-\nevidence`");
    for (const inputId of publishAction?.requiredInputs.map(
      (input) => input.id,
    ) ?? []) {
      const runbookTerm = {
        "production-route-manifest": "production route manifest",
        "offline-full-toml-evidence": "offline full-TOML evidence",
        "testnet-bsc-deployment-evidence": "testnet BSC deployment evidence",
        "taira-burn-record-contract": "TAIRA burn-record contract",
        "canonical-settlement-asset-definition-id":
          "canonical settlement asset definition id",
        "native-evm-prover-bundle": "native EVM prover bundle",
        "groth16-material-manifest": "Groth16 material manifest",
        "post-deploy-live-evidence": "post-deploy live evidence",
        "deployed-taira-base-config": "deployed TAIRA base config",
        "taira-route-publication-channel": "TAIRA route publication channel",
        "peer-config-audit-source": "peer-config audit source",
      }[inputId];
      expect(runbookTerm, inputId).toBeDefined();
      expect(normalizedDocs).toContain(runbookTerm);
    }
    expect(
      [...docs.matchAll(/--proof-artifact-hash <0x\.\.\.>/gu)].length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      [...docs.matchAll(/--proving-key-hash <0x\.\.\.>/gu)].length,
    ).toBeGreaterThanOrEqual(2);
    expect(docs).toContain(
      "--offline-full-toml-evidence output/sccp-bsc-deploy/taira-bsc-xor-route.full-taira-config.evidence.json",
    );
  });

  it("uses the selected BSC profile in next-action commands", () => {
    const report = evaluate({
      bscNetwork: "mainnet",
      routeReport: routeReport({
        bscNetwork: "mainnet",
        ready: false,
        warnings: ["diagnostic verifier material"],
        deployment: deployment({
          bscNetwork: "mainnet",
          verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
        }),
      }),
      peerAuditReport: peerAuditReport({ bscNetwork: "mainnet" }),
      smokeReadinessReport: smokeReadinessReport({ bscNetwork: "mainnet" }),
      materialInventoryReport: materialInventoryReport({
        bscNetwork: "mainnet",
      }),
      videoTranscript: videoTranscript({ bscNetwork: "mainnet" }),
    });

    expect(report.ready).toBe(false);
    expect(report.nextActions.map((action) => action.id)).toContain(
      "replace-diagnostic-bsc-verifier",
    );
    const commandText = JSON.stringify(report.nextActions);
    expect(commandText).toContain("--bsc-network mainnet");
    expect(commandText).toContain("--confirm-network taira_bsc_xor:mainnet");
    expect(commandText).toContain("--confirm-network taira_bsc_xor");
    expect(commandText).toContain("--confirm-mainnet true");
    expect(commandText).toContain(
      "requirements --bsc-network mainnet --out <production-requirements.json>",
    );
    expect(commandText).not.toContain("--bsc-network testnet");
    const requiredInputText = JSON.stringify(report.missingProductionInputs);
    expect(requiredInputText).toContain("mainnet-funded-bsc-deployer");
    expect(requiredInputText).toContain("mainnet-bsc-deployment-evidence");
    expect(requiredInputText).toContain("<mainnet-deployment-evidence.json>");
    expect(requiredInputText).toContain("<mainnet-bsc-rpc-url>");
    expect(requiredInputText).toContain("<mainnet-walletconnect-session>");
    expect(requiredInputText).not.toContain("{bscNetwork}");
    expect(requiredInputText).not.toContain("testnet-funded-bsc-deployer");
  });

  it("rejects prerequisite reports whose valid fields are only inherited properties", () => {
    const cases = [
      {
        name: "route",
        override: { routeReport: Object.create(routeReport()) },
        failedCheckId: "route-preflight-ready",
        summaryKey: "route",
      },
      {
        name: "peer audit",
        override: { peerAuditReport: Object.create(peerAuditReport()) },
        failedCheckId: "peer-config-audit-ready",
        summaryKey: "peerAudit",
      },
      {
        name: "smoke readiness",
        override: {
          smokeReadinessReport: Object.create(smokeReadinessReport()),
        },
        failedCheckId: "smoke-readiness-ready",
        summaryKey: "smokeReadiness",
      },
      {
        name: "material inventory",
        override: {
          materialInventoryReport: Object.create(materialInventoryReport()),
        },
        failedCheckId: "production-material-inventory",
        summaryKey: "materialInventory",
      },
    ];

    for (const { name, override, failedCheckId, summaryKey } of cases) {
      const report = evaluate(override);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, failedCheckId), name).toBeTruthy();
      expect(report[summaryKey], name).toBeNull();
    }
  });

  it("ignores polluted Object.prototype fields across aggregate report inputs", () => {
    const pollutedKeys = {
      ready: true,
      routeReady: true,
      proofComplete: true,
      preflightReady: true,
      smokeReadinessReady: true,
      manifestSource: "torii",
      routeId: SCCP_BSC_XOR_ROUTE_ID,
      assetKey: SCCP_BSC_XOR_ASSET_KEY,
      taira: routeReport().taira,
      bsc: routeReport().bsc,
      deployment: deployment(),
      postDeployLiveEvidence: postDeployLiveEvidence(),
      checks: routeReport().checks,
      peerCount: 4,
      sanitizedStanzaFilesChecked: true,
      peers: peerAuditReport().peers,
      manifestFingerprint: peerAuditReport().manifestFingerprint,
      route: smokeReadinessReport().route,
      peerAudit: smokeReadinessReport().peerAudit,
      provers: smokeReadinessReport().provers,
      files: materialInventoryReport().files,
      counts: materialInventoryReport().counts,
      readinessBinding: videoTranscript().readinessBinding,
      videoArtifacts: videoTranscript().videoArtifacts,
      transactions: videoTranscript().transactions,
      transactionLinks: videoTranscript().transactionLinks,
      explorerScreenshots: videoTranscript().explorerScreenshots,
      evidence: videoTranscript().evidence,
      missingEvidence: videoTranscript().missingEvidence,
      startedAtMs: videoTranscript().startedAtMs,
      endedAtMs: videoTranscript().endedAtMs,
    };
    try {
      for (const [key, value] of Object.entries(pollutedKeys)) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          value,
        });
      }

      const report = evaluate({
        routeReport: {},
        peerAuditReport: {},
        smokeReadinessReport: {},
        materialInventoryReport: {},
        videoTranscript: {},
      });

      expect(report.ready).toBe(false);
      expect(failedCheck(report, "route-preflight-ready")).toBeTruthy();
      expect(failedCheck(report, "peer-config-audit-ready")).toBeTruthy();
      expect(failedCheck(report, "smoke-readiness-ready")).toBeTruthy();
      expect(failedCheck(report, "video-proof-complete")).toBeTruthy();
      expect(report.route?.routeId).toBeNull();
      expect(report.route?.assetKey).toBeNull();
      expect(report.route?.deployment).toBeNull();
      expect(report.peerAudit?.peerCount).toBeNull();
      expect(report.peerAudit?.peers).toEqual([]);
      expect(report.smokeReadiness?.route).toBeNull();
      expect(report.materialInventory?.counts).toBeNull();
      expect(report.videoProof?.proofComplete).toBe(false);
      expect(report.videoProof?.readinessBinding).toBeNull();
      expect(report.videoProof?.videoArtifacts).toEqual([]);
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("does not invoke accessor-backed prerequisite report fields", () => {
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
    const route = getterBacked(routeReport(), "route");
    const peerAudit = getterBacked(peerAuditReport(), "peerAudit");
    const smokeReadiness = getterBacked(
      smokeReadinessReport(),
      "smokeReadiness",
    );
    const materialInventory = getterBacked(
      materialInventoryReport(),
      "materialInventory",
    );
    const video = getterBacked(videoTranscript(), "video");

    const report = evaluate({
      routeReport: route.target,
      peerAuditReport: peerAudit.target,
      smokeReadinessReport: smokeReadiness.target,
      materialInventoryReport: materialInventory.target,
      videoTranscript: video.target,
    });

    expect(report.ready).toBe(false);
    for (const probe of [
      route,
      peerAudit,
      smokeReadiness,
      materialInventory,
      video,
    ]) {
      expect(probe.reads).toBe(0);
    }
    expect(failedCheck(report, "route-preflight-ready")).toBeTruthy();
    expect(failedCheck(report, "peer-config-audit-ready")).toBeTruthy();
    expect(failedCheck(report, "smoke-readiness-ready")).toBeTruthy();
    expect(failedCheck(report, "production-material-inventory")).toBeTruthy();
    expect(failedCheck(report, "video-proof-complete")).toBeTruthy();
    expect(report.route).toMatchObject({
      ready: false,
      routeId: null,
      assetKey: null,
      deployment: null,
    });
    expect(report.peerAudit).toMatchObject({
      ready: false,
      routeId: null,
      assetKey: null,
      peerCount: null,
      peers: [],
    });
    expect(report.smokeReadiness?.route).toBeNull();
    expect(report.materialInventory?.files).toEqual([]);
    expect(report.videoProof?.proofComplete).toBe(false);
  });

  it("does not invoke accessor-backed top-level production gate option fields", () => {
    let reads = 0;
    const validInput = {
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport(),
      smokeReadinessReport: smokeReadinessReport(),
      materialInventoryReport: materialInventoryReport(),
      videoTranscript: videoTranscript(),
      peerAuditRefresh: { refreshed: true },
      bscNetwork: "testnet",
      checkedAt: NOW_ISO,
      maxReportAgeMs: 60_000,
      futureSkewMs: 60_000,
      requireReverifiedVideoProofFiles: false,
    };
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

    const report = evaluateBscSccpProductionGate(options);

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.route).toBeNull();
    expect(report.peerAudit).toBeNull();
    expect(report.smokeReadiness).toBeNull();
    expect(report.materialInventory).toBeNull();
    expect(report.videoProof).toBeNull();
    expect(failedCheck(report, "route-preflight-ready")).toBeTruthy();
    expect(failedCheck(report, "peer-config-audit-ready")).toBeTruthy();
    expect(failedCheck(report, "smoke-readiness-ready")).toBeTruthy();
    expect(failedCheck(report, "production-material-inventory")).toBeTruthy();
    expect(failedCheck(report, "video-proof-complete")).toBeTruthy();
  });

  it("does not invoke accessor-backed material inventory file summaries", () => {
    let reads = 0;
    const files = [...materialInventoryReport().files];
    Object.defineProperty(files, "0", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("material inventory file getter must not be invoked");
      },
    });

    const report = evaluate({
      materialInventoryReport: materialInventoryReport({ files }),
    });

    expect(report.ready).toBe(false);
    expect(reads).toBe(0);
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(/file summary 0 is not an object/u);
  });

  it("does not invoke accessor-backed nested route deployment fields", () => {
    let reads = 0;
    const routeDeployment = deployment();
    Object.defineProperty(routeDeployment, "verifierKeyHash", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("route deployment verifierKeyHash getter invoked");
      },
    });

    const report = evaluate({
      routeReport: routeReport({ deployment: routeDeployment }),
    });

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.route?.deployment?.verifierKeyHash).toBeNull();
    const failedDetails = report.checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.message} ${entry.detail ?? ""}`)
      .join("\n");
    expect(failedDetails).toMatch(/verifierKeyHash|deployment|binding/u);
  });

  it("does not invoke accessor-backed nested post-deploy evidence fields", () => {
    let reads = 0;
    const routePostDeployEvidence = postDeployLiveEvidence();
    Object.defineProperty(routePostDeployEvidence, "fullTomlReady", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("route post-deploy fullTomlReady getter invoked");
      },
    });

    const report = evaluate({
      routeReport: routeReport({
        postDeployLiveEvidence: routePostDeployEvidence,
      }),
    });

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(report.route?.postDeployLiveEvidence?.fullTomlReady).toBe(false);
    const failedDetails = report.checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.message} ${entry.detail ?? ""}`)
      .join("\n");
    expect(failedDetails).toMatch(/fullTomlReady|post-deploy|binding/u);
  });

  it("does not invoke accessor-backed nested video readiness evidence fields", () => {
    let reads = 0;
    const baseVideo = videoTranscript();
    const videoPostDeployEvidence = {
      ...baseVideo.readinessBinding.route.postDeployLiveEvidence,
    };
    Object.defineProperty(videoPostDeployEvidence, "fullTomlReady", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error(
          "video readiness post-deploy fullTomlReady getter invoked",
        );
      },
    });

    const report = evaluate({
      videoTranscript: videoTranscript({
        readinessBinding: {
          ...baseVideo.readinessBinding,
          route: {
            ...baseVideo.readinessBinding.route,
            postDeployLiveEvidence: videoPostDeployEvidence,
          },
        },
      }),
    });

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    expect(
      report.videoProof?.readinessBinding?.route?.postDeployLiveEvidence
        ?.fullTomlReady,
    ).toBe(false);
    const failedDetails = report.checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.message} ${entry.detail ?? ""}`)
      .join("\n");
    expect(failedDetails).toMatch(/video route|post-deploy|binding/u);
  });

  it("does not invoke accessor-backed video artifact array entries", () => {
    let reads = 0;
    const videoArtifacts = [...videoTranscript().videoArtifacts];
    Object.defineProperty(videoArtifacts, "0", {
      configurable: true,
      enumerable: true,
      get() {
        reads += 1;
        throw new Error("video artifact getter invoked");
      },
    });

    const report = evaluate({
      videoTranscript: videoTranscript({ videoArtifacts }),
    });

    expect(reads).toBe(0);
    expect(report.ready).toBe(false);
    const failedDetails = report.checks
      .filter((entry) => !entry.ok)
      .map((entry) => `${entry.message} ${entry.detail ?? ""}`)
      .join("\n");
    expect(failedDetails).toMatch(
      /video artifact 0 is not an object|recorded UI video artifact/u,
    );
  });

  it("ignores accessor-backed duplicate post-deploy aliases without invoking getters", () => {
    let reads = 0;
    const routePostDeployEvidence = postDeployLiveEvidence();
    Object.defineProperty(
      routePostDeployEvidence,
      "sourceEventTransactionUrl",
      {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          throw new Error(
            "route post-deploy sourceEventTransactionUrl getter invoked",
          );
        },
      },
    );

    const report = evaluate({
      routeReport: routeReport({
        postDeployLiveEvidence: routePostDeployEvidence,
      }),
    });

    expect(reads).toBe(0);
    expect(report.route?.postDeployLiveEvidence).toEqual(
      postDeployLiveEvidence(),
    );
  });

  it("does not use inherited route deployment evidence for production gate bindings", () => {
    const baseRouteReport = routeReport();
    const routeWithoutOwnedEvidence = { ...baseRouteReport };
    delete routeWithoutOwnedEvidence.deployment;
    delete routeWithoutOwnedEvidence.postDeployLiveEvidence;
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

      const report = evaluate({ routeReport: routeWithoutOwnedEvidence });
      const failedDetails = report.checks
        .filter((entry) => entry.ok === false)
        .map((entry) => `${entry.message} ${entry.detail ?? ""}`)
        .join("\n");

      expect(report.ready).toBe(false);
      expect(report.route?.deployment).toBeNull();
      expect(report.route?.postDeployLiveEvidence).toBeNull();
      expect(failedDetails).toMatch(
        /deployment|postDeployLiveEvidence|post-deploy/u,
      );
    } finally {
      for (const key of Object.keys(pollutedKeys)) {
        delete Object.prototype[key];
      }
    }
  });

  it("normalizes BSC-specific source bridge and verifier aliases across aggregate evidence", () => {
    const aliasedDeployment = deployment({
      sourceBridgeAddress: undefined,
      verifierAddress: undefined,
      sccp_bsc_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
      sccp_bsc_destination_verifier_address: BSC_VERIFIER_ADDRESS,
    });
    const report = evaluate({
      routeReport: routeReport({ deployment: aliasedDeployment }),
      peerAuditReport: peerAuditReport({
        peers: peerAuditReport().peers.map((peer) => ({
          ...peer,
          deployment: aliasedDeployment,
        })),
      }),
      materialInventoryReport: materialInventoryReport({
        route: {
          ...materialInventoryReport().route,
          deployment: aliasedDeployment,
        },
      }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.route?.deployment?.sourceBridgeAddress).toBe(
      BSC_SOURCE_BRIDGE_ADDRESS,
    );
    expect(report.route?.deployment?.verifierAddress).toBe(
      BSC_VERIFIER_ADDRESS,
    );
  });

  it("accepts smoke-readiness reports that explicitly do not require runtime config", () => {
    const baseSmoke = smokeReadinessReport();
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        provers: {
          ...baseSmoke.provers,
          runtimeConfig: {
            required: false,
            configUrl: null,
            configSha256: null,
            manifest: null,
          },
        },
      }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.smokeReadiness?.provers?.runtimeConfig).toEqual({
      required: false,
      configUrl: null,
      configSha256: null,
      manifest: null,
    });
  });

  it("accepts live smoke-readiness prover manifests that use public direction fields", () => {
    const baseSmoke = smokeReadinessReport();
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        provers: {
          ...baseSmoke.provers,
          destination: {
            ...baseSmoke.provers.destination,
            manifest: {
              ...baseSmoke.provers.destination.manifest,
              kind: undefined,
              direction: "destination",
            },
          },
          source: {
            ...baseSmoke.provers.source,
            manifest: {
              ...baseSmoke.provers.source.manifest,
              kind: undefined,
              direction: "source",
            },
          },
        },
      }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(failedCheck(report, "smoke-readiness-binding")).toBeUndefined();
  });

  it("passes for BSC mainnet only when every production report is mainnet-bound", () => {
    const report = evaluate({
      bscNetwork: "mainnet",
      routeReport: routeReport({ bscNetwork: "mainnet" }),
      peerAuditReport: peerAuditReport({ bscNetwork: "mainnet" }),
      smokeReadinessReport: smokeReadinessReport({ bscNetwork: "mainnet" }),
      materialInventoryReport: materialInventoryReport({
        bscNetwork: "mainnet",
      }),
      videoTranscript: videoTranscript({ bscNetwork: "mainnet" }),
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.route?.bsc).toMatchObject({
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      explorerUrl: "https://bscscan.com",
      explorerHost: "bscscan.com",
    });
    expect(report.route?.deployment?.networkIdHex).toBe(
      BSC_MAINNET_NETWORK_ID_HEX,
    );
    expect(report.smokeReadiness?.route?.bsc).toMatchObject({
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      explorerUrl: "https://bscscan.com",
      explorerHost: "bscscan.com",
    });
    expect(
      report.smokeReadiness?.provers?.runtimeConfig?.manifest,
    ).toMatchObject({
      bscNetwork: "mainnet",
      bscChain: "bsc-mainnet",
      bscChainIdHex: "0x38",
      bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    });
    expect(report.materialInventory?.route?.bsc).toMatchObject({
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      explorerUrl: "https://bscscan.com",
      explorerHost: "bscscan.com",
    });
    expect(
      report.materialInventory?.runtimeProverConfig?.manifest,
    ).toMatchObject({
      bscNetwork: "mainnet",
      bscChain: "bsc-mainnet",
      bscChainIdHex: "0x38",
      bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    });
    expect(report.videoProof?.bsc).toMatchObject({
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
      explorerUrl: "https://bscscan.com",
      explorerHost: "bscscan.com",
    });

    const forgedTestnetVideo = evaluate({
      bscNetwork: "mainnet",
      routeReport: routeReport({ bscNetwork: "mainnet" }),
      peerAuditReport: peerAuditReport({ bscNetwork: "mainnet" }),
      smokeReadinessReport: smokeReadinessReport({ bscNetwork: "mainnet" }),
      materialInventoryReport: materialInventoryReport({
        bscNetwork: "mainnet",
      }),
      videoTranscript: videoTranscript(),
    });
    expect(forgedTestnetVideo.ready).toBe(false);
    expect(
      failedCheck(forgedTestnetVideo, "video-proof-complete")?.detail,
    ).toMatch(/BSC network binding does not match BSC mainnet/u);
    expect(
      failedCheck(forgedTestnetVideo, "video-readiness-binding")?.detail,
    ).toMatch(/video route .*networkIdHex does not match/u);

    const forgedTestnetRoute = evaluate({
      bscNetwork: "mainnet",
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport({ bscNetwork: "mainnet" }),
      smokeReadinessReport: smokeReadinessReport({ bscNetwork: "mainnet" }),
      materialInventoryReport: materialInventoryReport({
        bscNetwork: "mainnet",
      }),
      videoTranscript: videoTranscript({ bscNetwork: "mainnet" }),
    });
    expect(forgedTestnetRoute.ready).toBe(false);
    expect(
      failedCheck(forgedTestnetRoute, "cross-report-binding")?.detail,
    ).toMatch(/BSC mainnet/u);
  });

  it("uses profile-specific default prerequisite report paths", () => {
    const testnet = bscSccpProductionGateReportPaths("testnet");
    const mainnet = bscSccpProductionGateReportPaths("mainnet");

    expect(testnet.routeReportPath).toContain(
      "output/sccp-bsc-preflight/testnet/latest.json",
    );
    expect(mainnet.routeReportPath).toContain(
      "output/sccp-bsc-preflight/mainnet/latest.json",
    );
    expect(testnet.materialInventoryReportPath).toContain(
      "output/sccp-bsc-production-material-inventory/testnet/latest.json",
    );
    expect(mainnet.materialInventoryReportPath).toContain(
      "output/sccp-bsc-production-material-inventory/mainnet/latest.json",
    );
    expect(mainnet.routeReportPath).not.toBe(testnet.routeReportPath);
    expect(mainnet.peerAuditReportPath).not.toBe(testnet.peerAuditReportPath);
    expect(mainnet.smokeReadinessReportPath).not.toBe(
      testnet.smokeReadinessReportPath,
    );
    expect(mainnet.materialInventoryReportPath).not.toBe(
      testnet.materialInventoryReportPath,
    );
  });

  it("rejects BSC profile-summary drift even when deployment hashes still match", () => {
    const baseRoute = routeReport();
    const baseSmoke = smokeReadinessReport();
    const baseMaterial = materialInventoryReport();
    const baseVideo = videoTranscript();
    const cases = [
      [
        "route summary network drift",
        {
          routeReport: routeReport({
            bsc: {
              ...baseRoute.bsc,
              network: "mainnet",
            },
          }),
        },
        "cross-report-binding",
        /route report BSC network does not match BSC testnet/u,
      ],
      [
        "route summary missing explorer URL",
        {
          routeReport: routeReport({
            bsc: {
              ...baseRoute.bsc,
              explorerUrl: "",
            },
          }),
        },
        "cross-report-binding",
        /route report BSC explorerUrl is missing/u,
      ],
      [
        "route summary duplicate chain-id alias",
        {
          routeReport: routeReport({
            bsc: {
              ...baseRoute.bsc,
              chain_id_hex: baseRoute.bsc.chainIdHex,
            },
          }),
        },
        "cross-report-binding",
        /route report BSC chainIdHex uses multiple aliases: chainIdHex, chain_id_hex/u,
      ],
      [
        "route report unsupported top-level field",
        {
          routeReport: routeReport({
            operatorOverride: "force-ready",
          }),
        },
        "route-preflight-ready",
        /route preflight report contains unsupported field operatorOverride/u,
      ],
      [
        "route report unsupported TAIRA profile field",
        {
          routeReport: routeReport({
            taira: {
              ...baseRoute.taira,
              endpointOverride: "https://taira.sora.org",
            },
          }),
        },
        "route-preflight-ready",
        /route preflight TAIRA profile contains unsupported field endpointOverride/u,
      ],
      [
        "route report unsupported BSC profile field",
        {
          routeReport: routeReport({
            bsc: {
              ...baseRoute.bsc,
              rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
            },
          }),
        },
        "route-preflight-ready",
        /route preflight BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "route report unsupported deployment field",
        {
          routeReport: routeReport({
            deployment: {
              ...baseRoute.deployment,
              hiddenDeploymentOverride: HASH_77,
            },
          }),
        },
        "route-preflight-ready",
        /route preflight deployment contains unsupported field hiddenDeploymentOverride/u,
      ],
      [
        "route report unsupported post-deploy field",
        {
          routeReport: routeReport({
            postDeployLiveEvidence: {
              ...baseRoute.postDeployLiveEvidence,
              hiddenPostDeployOverride: HASH_77,
            },
          }),
        },
        "route-preflight-ready",
        /route preflight postDeployLiveEvidence contains unsupported field hiddenPostDeployOverride/u,
      ],
      [
        "route report unsupported check field",
        {
          routeReport: routeReport({
            checks: baseRoute.checks.map((entry, index) =>
              index === 0
                ? { ...entry, hiddenRouteCheckOverride: "force-pass" }
                : entry,
            ),
          }),
        },
        "route-preflight-ready",
        /route preflight check 0 contains unsupported field hiddenRouteCheckOverride/u,
      ],
      [
        "route report unsupported errors field",
        {
          routeReport: routeReport({
            errors: {
              unexpectedOperatorError: "ignore me",
            },
          }),
        },
        "route-preflight-ready",
        /route preflight errors contains unsupported field unexpectedOperatorError/u,
      ],
      [
        "route report unsupported BSC readback field",
        {
          routeReport: routeReport({
            bscContractReadback: {
              endpoint: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
              chainIdHex: "0x61",
              codePresent: {
                token: true,
                bridge: true,
                sourceBridge: true,
                verifier: true,
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
              hiddenReadbackOverride: "force-pass",
            },
          }),
        },
        "route-preflight-ready",
        /route preflight BSC contract readback contains unsupported field hiddenReadbackOverride/u,
      ],
      [
        "route report unsupported BSC readback code field",
        {
          routeReport: routeReport({
            bscContractReadback: {
              endpoint: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
              chainIdHex: "0x61",
              codePresent: {
                token: true,
                bridge: true,
                sourceBridge: true,
                verifier: true,
                hiddenVerifierCodeOverride: true,
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
            },
          }),
        },
        "route-preflight-ready",
        /route preflight BSC contract readback codePresent contains unsupported field hiddenVerifierCodeOverride/u,
      ],
      [
        "route report readback target address drift",
        {
          routeReport: routeReport({
            bscContractReadback: {
              endpoint: "https://data-seed-prebsc-1-s1.bnbchain.org:8545",
              chainIdHex: "0x61",
              codePresent: {
                token: true,
                bridge: true,
                sourceBridge: true,
                verifier: true,
              },
              tokenAddress: BSC_BRIDGE_ADDRESS,
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
            },
          }),
        },
        "route-preflight-ready",
        /route preflight BSC contract readback tokenAddress does not match route deployment/u,
      ],
      [
        "smoke route summary chain drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              bsc: {
                ...baseSmoke.route.bsc,
                chain: "bsc-mainnet",
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /smoke-readiness route BSC chain does not match BSC testnet/u,
      ],
      [
        "smoke route summary duplicate network alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              bsc: {
                ...baseSmoke.route.bsc,
                bsc_network: baseSmoke.route.bsc.network,
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /smoke-readiness route BSC network uses multiple aliases: network, bsc_network/u,
      ],
      [
        "smoke route summary duplicate route identity alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              route_id: baseSmoke.route.routeId,
            },
          }),
        },
        "smoke-readiness-ready",
        /smoke-readiness routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "smoke runtime config chain drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  bscChainIdHex: "0x38",
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /runtime prover config is not bound to BSC testnet chain id/u,
      ],
      [
        "smoke prover manifest network-label drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  bscNetwork: "mainnet",
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /destination smoke prover manifest is not bound to BSC testnet network label/u,
      ],
      [
        "smoke prover manifest forged explorer URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  bscExplorerUrl: "https://bscscan.com",
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /destination smoke prover manifest explorer URL does not match BSC testnet/u,
      ],
      [
        "smoke prover manifest duplicate network alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  bsc_network:
                    baseSmoke.provers.destination.manifest.bscNetwork,
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /destination smoke prover manifest BSC network uses multiple aliases: bscNetwork, bsc_network/u,
      ],
      [
        "smoke runtime config chain-label drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  bscChain: "bsc-mainnet",
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /runtime prover config is not bound to BSC testnet chain label/u,
      ],
      [
        "smoke runtime config duplicate chain-id alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  bsc_chain_id_hex:
                    baseSmoke.provers.runtimeConfig.manifest.bscChainIdHex,
                },
              },
            },
          }),
        },
        "smoke-readiness-binding",
        /smoke-readiness runtime prover config BSC chainIdHex uses multiple aliases: bscChainIdHex, bsc_chain_id_hex/u,
      ],
      [
        "material route summary missing",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...baseMaterial.route,
              bsc: null,
            },
          }),
        },
        "production-material-inventory",
        /production material inventory route BSC profile binding is missing/u,
      ],
      [
        "material browser sidecar chain-label drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...baseMaterial.browserProvers,
              source: {
                ...baseMaterial.browserProvers.source,
                sidecar: {
                  ...baseMaterial.browserProvers.source.sidecar,
                  manifest: {
                    ...baseMaterial.browserProvers.source.sidecar.manifest,
                    bscChain: "bsc-mainnet",
                  },
                },
              },
            },
          }),
        },
        "production-material-inventory",
        /source browser prover manifest is not bound to BSC testnet chain label/u,
      ],
      [
        "material browser sidecar duplicate chain alias",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...baseMaterial.browserProvers,
              source: {
                ...baseMaterial.browserProvers.source,
                sidecar: {
                  ...baseMaterial.browserProvers.source.sidecar,
                  manifest: {
                    ...baseMaterial.browserProvers.source.sidecar.manifest,
                    bsc_chain:
                      baseMaterial.browserProvers.source.sidecar.manifest
                        .bscChain,
                  },
                },
              },
            },
          }),
        },
        "production-material-inventory",
        /production material inventory source browser prover manifest BSC chain uses multiple aliases: bscChain, bsc_chain/u,
      ],
      [
        "material browser sidecar forged explorer host",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...baseMaterial.browserProvers,
              source: {
                ...baseMaterial.browserProvers.source,
                sidecar: {
                  ...baseMaterial.browserProvers.source.sidecar,
                  manifest: {
                    ...baseMaterial.browserProvers.source.sidecar.manifest,
                    bscExplorerHost: "bscscan.com",
                  },
                },
              },
            },
          }),
        },
        "production-material-inventory",
        /source browser prover manifest explorer host does not match BSC testnet/u,
      ],
      [
        "material route summary duplicate explorer URL alias",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...baseMaterial.route,
              bsc: {
                ...baseMaterial.route.bsc,
                bscExplorerUrl: baseMaterial.route.bsc.explorerUrl,
              },
            },
          }),
        },
        "production-material-inventory",
        /production material inventory route BSC explorerUrl uses multiple aliases: explorerUrl, bscExplorerUrl/u,
      ],
      [
        "material runtime config network drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...baseMaterial.runtimeProverConfig,
              manifest: {
                ...baseMaterial.runtimeProverConfig.manifest,
                bscNetworkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
              },
            },
          }),
        },
        "production-material-inventory",
        /runtime prover config is not bound to BSC testnet network id/u,
      ],
      [
        "material runtime config forged explorer URL",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...baseMaterial.runtimeProverConfig,
              manifest: {
                ...baseMaterial.runtimeProverConfig.manifest,
                bscExplorerUrl: "https://bscscan.com",
              },
            },
          }),
        },
        "production-material-inventory",
        /runtime prover config explorer URL does not match BSC testnet/u,
      ],
      [
        "material runtime config network-label drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...baseMaterial.runtimeProverConfig,
              manifest: {
                ...baseMaterial.runtimeProverConfig.manifest,
                bscNetwork: "mainnet",
              },
            },
          }),
        },
        "production-material-inventory",
        /runtime prover config is not bound to BSC testnet network label/u,
      ],
      [
        "material runtime config duplicate network-id alias",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...baseMaterial.runtimeProverConfig,
              manifest: {
                ...baseMaterial.runtimeProverConfig.manifest,
                bsc_network_id_hex:
                  baseMaterial.runtimeProverConfig.manifest.bscNetworkIdHex,
              },
            },
          }),
        },
        "production-material-inventory",
        /production material inventory runtime prover config BSC networkIdHex uses multiple aliases: bscNetworkIdHex, bsc_network_id_hex/u,
      ],
      [
        "video readiness route profile drift",
        {
          videoTranscript: videoTranscript({
            readinessBinding: {
              ...baseVideo.readinessBinding,
              route: {
                ...baseVideo.readinessBinding.route,
                bsc: {
                  ...baseVideo.readinessBinding.route.bsc,
                  chainIdHex: "0x38",
                },
              },
            },
          }),
        },
        "video-readiness-binding",
        /video readiness binding route BSC chainIdHex does not match BSC testnet/u,
      ],
      [
        "video readiness route duplicate network-id alias",
        {
          videoTranscript: videoTranscript({
            readinessBinding: {
              ...baseVideo.readinessBinding,
              route: {
                ...baseVideo.readinessBinding.route,
                bsc: {
                  ...baseVideo.readinessBinding.route.bsc,
                  bsc_network_id_hex:
                    baseVideo.readinessBinding.route.bsc.networkIdHex,
                },
              },
            },
          }),
        },
        "video-readiness-binding",
        /video readiness binding route BSC networkIdHex uses multiple aliases: networkIdHex, bsc_network_id_hex/u,
      ],
    ];

    for (const [name, overrides, checkId, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, checkId)?.detail, name).toMatch(detail);
    }
  });

  it("rejects live video transactions that reuse post-deploy evidence", () => {
    const baseVideo = videoTranscript();
    const cases = [
      [
        "TAIRA source reuses source event transaction hash",
        "tairaSourceTx",
        "TAIRA source transaction",
        tairaTx(HASH_55),
        /tairaSourceTx reuses post-deploy sourceEventTransactionId/u,
      ],
      [
        "finalize reuses source event transaction",
        "bscFinalizeTx",
        "BSC finalize transaction",
        bscTx(HASH_55),
        /bscFinalizeTx reuses post-deploy sourceEventTransactionId/u,
      ],
      [
        "burn reuses route canary transaction",
        "bscBurnTx",
        "BSC burn transaction",
        bscTx(HASH_77),
        /bscBurnTx reuses post-deploy routeCanaryTransactionId/u,
      ],
      [
        "TAIRA settlement reuses route canary transaction hash",
        "tairaSettlementTx",
        "TAIRA settlement transaction",
        tairaTx(HASH_77),
        /tairaSettlementTx reuses post-deploy routeCanaryTransactionId/u,
      ],
    ];

    for (const [name, slot, label, href, detail] of cases) {
      const report = evaluate({
        videoTranscript: videoTranscript({
          transactions: {
            ...baseVideo.transactions,
            [slot]: href,
          },
          transactionLinks: baseVideo.transactionLinks.map((entry) =>
            entry.label === label ? { ...entry, href } : entry,
          ),
          explorerScreenshots: baseVideo.explorerScreenshots.map((entry) =>
            entry.kind === slot ? screenshotProof(slot, href) : entry,
          ),
        }),
      });

      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, "video-proof-complete"), name).toBeUndefined();
      expect(
        failedCheck(report, "video-readiness-binding")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("rejects local-only, disabled, or diagnostic route reports", () => {
    const cases = [
      [
        "local manifest",
        routeReport({ manifestSource: "file" }),
        "route-preflight-ready",
        /local-only|not ready|wrong route/u,
      ],
      [
        "not ready",
        routeReport({ ready: false }),
        "route-preflight-ready",
        /not ready/u,
      ],
      [
        "wrong route",
        routeReport({ routeId: "taira_bsc_usdt" }),
        "route-preflight-ready",
        /wrong route/u,
      ],
      [
        "duplicate route identity alias",
        routeReport({ route_id: SCCP_BSC_XOR_ROUTE_ID }),
        "route-preflight-ready",
        /route preflight routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "diagnostic warning",
        routeReport({ warnings: ["diagnostic verifier material"] }),
        "route-diagnostic-scan",
        /diagnostic/u,
      ],
      [
        "stale route report missing placeholder scan",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-production-placeholder-scan",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-production-placeholder-scan check/u,
      ],
      [
        "stale route report missing manifest secret scan",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-manifest-secret-scan",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-manifest-secret-scan check/u,
      ],
      [
        "stale route report missing manifest uniqueness scan",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-route-manifest-unique",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-route-manifest-unique check/u,
      ],
      [
        "stale route report missing disabled conflict scan",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-production-disabled-conflict",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-production-disabled-conflict check/u,
      ],
      [
        "stale route report missing chain id check",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-testnet-chain-id",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-testnet-chain-id check/u,
      ],
      [
        "stale route report missing production verifier material check",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-production-verifier-material",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-production-verifier-material check/u,
      ],
      [
        "stale route report missing raw verifier key hash readback",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-verifier-key-hash-readback",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-verifier-key-hash-readback check/u,
      ],
      [
        "stale route report missing runbook contract",
        routeReport({
          checks: routeReport().checks.filter(
            (entry) => entry.id !== "bsc-preflight-runbook-contract",
          ),
        }),
        "route-preflight-ready",
        /missing passing bsc-preflight-runbook-contract check/u,
      ],
    ];

    for (const [name, badRouteReport, checkId, detail] of cases) {
      const report = evaluate({ routeReport: badRouteReport });
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, checkId)?.detail, name).toMatch(detail);
    }
  });

  it("requires production-shaped TAIRA burn-record evidence in route and inventory reports", () => {
    const baseRoute = routeReport();
    const baseInventory = materialInventoryReport();
    const cases = [
      [
        "route preflight burn-record check missing",
        {
          routeReport: routeReport({
            checks: baseRoute.checks.filter(
              (entry) => entry.id !== "taira-burn-record-material",
            ),
          }),
        },
        /route preflight report is missing passing taira-burn-record-material check/u,
      ],
      [
        "route preflight burn-record check failed",
        {
          routeReport: routeReport({
            checks: baseRoute.checks.map((entry) =>
              entry.id === "taira-burn-record-material"
                ? {
                    ...entry,
                    ok: false,
                    status: "fail",
                    detail: "placeholder burn-record material",
                  }
                : entry,
            ),
          }),
        },
        /route preflight report is missing passing taira-burn-record-material check/u,
      ],
      [
        "inventory burn-record check missing",
        {
          materialInventoryReport: materialInventoryReport({
            checks: baseInventory.checks.filter(
              (entry) => entry.id !== "production-burn-record-material",
            ),
          }),
        },
        /production material inventory is missing passing production-burn-record-material check/u,
      ],
      [
        "inventory burn-record check failed",
        {
          materialInventoryReport: materialInventoryReport({
            ready: false,
            checks: baseInventory.checks.map((entry) =>
              entry.id === "production-burn-record-material"
                ? {
                    ...entry,
                    ok: false,
                    detail: "placeholder burn-record material",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory is missing passing production-burn-record-material check/u,
      ],
      [
        "inventory forged pass with placeholder burn finding",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...baseInventory.counts,
              criticalFindings: 1,
            },
            files: baseInventory.files.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    findings: [
                      {
                        severity: "critical",
                        id: "production-ready-placeholder-burn-record",
                        message: "placeholder burn-record material",
                      },
                    ],
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file 0 reports invalid TAIRA burn-record material/u,
      ],
      [
        "inventory forged pass with route burn problem list",
        {
          materialInventoryReport: materialInventoryReport({
            files: baseInventory.files.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      burnRecordArtifactProductionProblems: [
                        "contractArtifactB64 is missing",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file 0 carries invalid TAIRA burn-record material/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "taira-burn-record-production-material")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("rejects forged prerequisite reports with duplicate or contradictory check states", () => {
    const cases = [
      [
        "duplicated route check",
        {
          routeReport: routeReport({
            checks: [
              ...routeReport().checks,
              {
                id: "bsc-production-ready",
                ok: false,
                message: "forged duplicate",
              },
            ],
          }),
        },
        /route preflight check id bsc-production-ready is duplicated/u,
      ],
      [
        "duplicate route check id alias",
        {
          routeReport: routeReport({
            checks: routeReport().checks.map((entry) =>
              entry.id === "bsc-production-ready"
                ? { ...entry, check_id: entry.id }
                : entry,
            ),
          }),
        },
        /route preflight check bsc-production-ready id uses multiple aliases: id, check_id/u,
      ],
      [
        "contradictory smoke check",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: smokeReadinessReport().checks.map((entry) =>
              entry.id === "route-preflight"
                ? { ...entry, ok: false, status: "pass" }
                : entry,
            ),
          }),
        },
        /smoke-readiness check route-preflight has contradictory ok\/status/u,
      ],
      [
        "duplicate smoke check id alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: smokeReadinessReport().checks.map((entry) =>
              entry.id === "route-preflight"
                ? { ...entry, checkId: entry.id }
                : entry,
            ),
          }),
        },
        /smoke-readiness check route-preflight id uses multiple aliases: id, checkId/u,
      ],
      [
        "stateless material check",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.map((entry) =>
              entry.id === "route-report-binding"
                ? { id: entry.id, message: "no machine state" }
                : entry,
            ),
          }),
        },
        /production material inventory check route-report-binding has no machine-readable pass\/fail state/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "prerequisite-report-check-integrity")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("reports prerequisite load errors explicitly for every input report", () => {
    const cases = [
      [
        "route",
        {
          routeReport: { ready: false, loadError: "route report: unreadable" },
        },
        /route preflight load error: route report: unreadable/u,
      ],
      [
        "peer audit",
        {
          peerAuditReport: {
            ready: false,
            loadError: "peer audit report: unreadable",
          },
        },
        /peer audit load error: peer audit report: unreadable/u,
      ],
      [
        "smoke readiness",
        {
          smokeReadinessReport: {
            ready: false,
            loadError: "smoke-readiness report: unreadable",
          },
        },
        /smoke-readiness load error: smoke-readiness report: unreadable/u,
      ],
      [
        "material inventory",
        {
          materialInventoryReport: {
            ready: false,
            loadError: "material inventory report: unreadable",
          },
        },
        /production material inventory load error: material inventory report: unreadable/u,
      ],
      [
        "video proof",
        {
          videoTranscript: {
            ready: false,
            loadError: "video transcript: unreadable",
          },
        },
        /video proof load error: video transcript: unreadable/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "prerequisite-report-load-errors")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("propagates lower-level readiness blockers without leaking sensitive detail text", () => {
    const routeBlocker = evaluate({
      routeReport: routeReport({
        ready: false,
        deployment: deployment({
          proofArtifactHash: null,
          provingKeyHash: null,
        }),
        checks: [
          {
            id: "bsc-production-prover-material",
            ok: false,
            message: "BSC production prover material is present.",
            detail: "proofArtifactHash is required; provingKeyHash is required",
          },
        ],
      }),
    });

    expect(routeBlocker.ready).toBe(false);
    expect(failedCheck(routeBlocker, "route-preflight-ready")?.detail).toMatch(
      /bsc-production-prover-material: .*proofArtifactHash is required; provingKeyHash is required/u,
    );

    const peerBlocker = evaluate({
      peerAuditReport: peerAuditReport({
        ready: false,
        checks: [
          {
            id: "peer-route-production-readiness",
            ok: false,
            detail:
              "peer route is disabled because verifier material is diagnostic",
          },
        ],
        peers: [
          {
            ...peerAuditReport().peers[0],
            ready: false,
            failedChecks: [
              {
                id: "bsc-production-prover-material",
                ok: false,
                detail: "proofArtifactHash is required",
              },
            ],
          },
        ],
      }),
    });

    expect(peerBlocker.ready).toBe(false);
    expect(failedCheck(peerBlocker, "peer-config-audit-ready")?.detail).toMatch(
      /peer-route-production-readiness: .*diagnostic/u,
    );
    expect(failedCheck(peerBlocker, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0: bsc-production-prover-material: proofArtifactHash/u,
    );

    const duplicatePeerAlias = evaluate({
      peerAuditReport: peerAuditReport({
        asset_key: SCCP_BSC_XOR_ASSET_KEY,
      }),
    });
    expect(duplicatePeerAlias.ready).toBe(false);
    expect(
      failedCheck(duplicatePeerAlias, "peer-config-audit-ready")?.detail,
    ).toMatch(
      /peer audit assetKey uses multiple aliases: assetKey, asset_key/u,
    );

    const missingRawPeerHash = evaluate({
      peerAuditReport: peerAuditReport({
        peers: [
          {
            ...peerAuditReport().peers[0],
            rawTomlSha256: undefined,
          },
        ],
      }),
    });

    expect(missingRawPeerHash.ready).toBe(false);
    expect(
      failedCheck(missingRawPeerHash, "peer-config-audit-ready")?.detail,
    ).toMatch(/peer 0 rawTomlSha256 is missing or invalid/u);

    const missingSanitizedPeerHash = evaluate({
      peerAuditReport: peerAuditReport({
        peers: [
          {
            ...peerAuditReport().peers[0],
            sanitizedStanzaSha256: undefined,
          },
        ],
      }),
    });

    expect(missingSanitizedPeerHash.ready).toBe(false);
    expect(
      failedCheck(missingSanitizedPeerHash, "peer-config-audit-ready")?.detail,
    ).toMatch(/peer 0 sanitizedStanzaSha256 is missing or invalid/u);

    const basePeerAudit = peerAuditReport();
    const peerAuditShapeCases = [
      [
        "unsupported peer audit report field",
        peerAuditReport({ operatorOverride: "force-ready" }),
        /peer audit report contains unsupported field operatorOverride/u,
      ],
      [
        "unsupported peer audit BSC profile field",
        peerAuditReport({
          bscNetwork: "testnet",
          bsc: {
            ...routeReport().bsc,
            rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
          },
        }),
        /peer audit BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "unsupported peer audit check field",
        peerAuditReport({
          checks: basePeerAudit.checks.map((entry, index) =>
            index === 0
              ? { ...entry, hiddenPeerCheckOverride: "force-pass" }
              : entry,
          ),
        }),
        /peer audit check 0 contains unsupported field hiddenPeerCheckOverride/u,
      ],
      [
        "unsupported peer summary field",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0 ? { ...peer, hiddenPeerOverride: "force-ready" } : peer,
          ),
        }),
        /peer audit peer 0 contains unsupported field hiddenPeerOverride/u,
      ],
      [
        "unsupported peer deployment field",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  deployment: {
                    ...peer.deployment,
                    hiddenPeerDeploymentOverride: HASH_77,
                  },
                }
              : peer,
          ),
        }),
        /peer audit peer 0 deployment contains unsupported field hiddenPeerDeploymentOverride/u,
      ],
      [
        "unsupported peer post-deploy field",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  postDeployLiveEvidence: {
                    ...peer.postDeployLiveEvidence,
                    hiddenPeerPostDeployOverride: HASH_77,
                  },
                }
              : peer,
          ),
        }),
        /peer audit peer 0 postDeployLiveEvidence contains unsupported field hiddenPeerPostDeployOverride/u,
      ],
      [
        "unsupported peer failed-check field",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? {
                  ...peer,
                  failedChecks: [
                    {
                      id: "peer-route-production-readiness",
                      ok: false,
                      message: "failed",
                      hiddenFailedCheckOverride: "force-pass",
                    },
                  ],
                }
              : peer,
          ),
        }),
        /peer audit peer 0 failed check 0 contains unsupported field hiddenFailedCheckOverride/u,
      ],
    ];

    for (const [name, badPeerAudit, detail] of peerAuditShapeCases) {
      const report = evaluate({ peerAuditReport: badPeerAudit });
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "peer-config-audit-ready")?.detail,
        name,
      ).toMatch(detail);
    }

    const peerSummaryCases = [
      [
        "sanitized stanza files not checked",
        peerAuditReport({ sanitizedStanzaFilesChecked: false }),
        /peer audit sanitized stanza files were not checked/u,
      ],
      [
        "peer count drift",
        peerAuditReport({ peerCount: basePeerAudit.peers.length + 1 }),
        /peer audit peerCount does not match peer summaries/u,
      ],
      [
        "peer summary not object",
        peerAuditReport({
          peerCount: basePeerAudit.peers.length + 1,
          peers: [...basePeerAudit.peers, "not-a-peer-summary"],
        }),
        /peer audit peer summary 4 is not an object/u,
      ],
      [
        "missing required peer audit check",
        peerAuditReport({
          checks: basePeerAudit.checks.filter(
            (entry) => entry.id !== "peer-route-burn-record-material",
          ),
        }),
        /peer audit report is missing passing peer-route-burn-record-material check/u,
      ],
      [
        "missing peer audit runbook contract",
        peerAuditReport({
          checks: basePeerAudit.checks.filter(
            (entry) => entry.id !== "peer-audit-runbook-contract",
          ),
        }),
        /peer audit report is missing passing peer-audit-runbook-contract check/u,
      ],
      [
        "peer not ready",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0 ? { ...peer, ready: false } : peer,
          ),
        }),
        /peer 0 is not ready/u,
      ],
      [
        "peer failed checks",
        peerAuditReport({
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
        /peer 0 carries failed peer checks/u,
      ],
      [
        "peer burn-record material problems",
        peerAuditReport({
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
        /peer 0 carries invalid TAIRA burn-record material/u,
      ],
      [
        "peer hash-role problems",
        peerAuditReport({
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
        /peer 0 carries invalid BSC route hash role separation/u,
      ],
      [
        "peer sanitized stanza file not checked",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0 ? { ...peer, sanitizedStanzaFileChecked: false } : peer,
          ),
        }),
        /peer 0 sanitized stanza file was not checked/u,
      ],
      [
        "peer sanitized stanza file not verified",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? { ...peer, sanitizedStanzaFileVerified: false }
              : peer,
          ),
        }),
        /peer 0 sanitized stanza file not verified/u,
      ],
      [
        "peer sanitized stanza file hash missing",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? { ...peer, sanitizedStanzaFileSha256: undefined }
              : peer,
          ),
        }),
        /peer 0 sanitized stanza file hash is missing or invalid/u,
      ],
      [
        "peer sanitized stanza file hash drift",
        peerAuditReport({
          peers: basePeerAudit.peers.map((peer, index) =>
            index === 0
              ? { ...peer, sanitizedStanzaFileSha256: HASH_33 }
              : peer,
          ),
        }),
        /peer 0 sanitized stanza file hash mismatched/u,
      ],
    ];

    for (const [name, badPeerAudit, detail] of peerSummaryCases) {
      const report = evaluate({ peerAuditReport: badPeerAudit });
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "peer-config-audit-ready")?.detail,
        name,
      ).toMatch(detail);
    }

    const smokeBlocker = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        ready: false,
        routeReady: false,
        checks: [
          {
            id: "route-preflight",
            status: "fail",
            detail:
              "bsc-production-prover-material: proofArtifactHash is required",
          },
          {
            id: "walletconnect-project-id",
            status: "fail",
            message: "VITE_WALLETCONNECT_PROJECT_ID is missing",
          },
        ],
      }),
    });

    expect(smokeBlocker.ready).toBe(false);
    expect(failedCheck(smokeBlocker, "smoke-readiness-ready")?.detail).toMatch(
      /route-preflight: bsc-production-prover-material/u,
    );
    expect(failedCheck(smokeBlocker, "smoke-readiness-ready")?.detail).toMatch(
      /walletconnect-project-id: VITE_WALLETCONNECT_PROJECT_ID/u,
    );
    expect(
      failedCheck(smokeBlocker, "smoke-walletconnect-configured")?.detail,
    ).toMatch(/walletconnect-project-id: VITE_WALLETCONNECT_PROJECT_ID/u);
    expect(
      failedCheck(smokeBlocker, "smoke-runtime-prover-configured")?.detail,
    ).toMatch(/missing passing runtime-prover-config check/u);

    const uniqueSecretMarker =
      "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
    const hostileDetail = evaluate({
      routeReport: routeReport({
        ready: false,
        checks: [
          {
            id: "bsc-production-prover-material",
            ok: false,
            detail: `operator privateKey=0x${uniqueSecretMarker}`,
          },
        ],
      }),
    });

    expect(
      failedCheck(hostileDetail, "route-preflight-ready")?.detail,
    ).toContain("[redacted secret-like detail]");
    expect(JSON.stringify(hostileDetail)).not.toContain("privateKey=");
    expect(JSON.stringify(hostileDetail)).not.toContain(uniqueSecretMarker);
  });

  it("routes missing WalletConnect and BSC prover setup into prover publication", () => {
    const baseSmoke = smokeReadinessReport();
    const failingSmokeChecks = new Set([
      "walletconnect-project-id",
      "destination-prover-module",
      "destination-prover-manifest",
      "source-prover-module",
      "source-prover-manifest",
    ]);
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        ready: false,
        checks: baseSmoke.checks.map((entry) =>
          failingSmokeChecks.has(entry.id)
            ? {
                ...entry,
                status: "fail",
                message:
                  entry.id === "walletconnect-project-id"
                    ? "VITE_WALLETCONNECT_PROJECT_ID is required for BSC WalletConnect signing."
                    : `${entry.id} is not configured.`,
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "smoke-walletconnect-configured")?.detail,
    ).toMatch(/VITE_WALLETCONNECT_PROJECT_ID is required/u);
    expect(
      failedCheck(report, "smoke-destination-prover-configured")?.detail,
    ).toMatch(/destination-prover-module is not configured/u);
    expect(
      failedCheck(report, "smoke-source-prover-configured")?.detail,
    ).toMatch(/source-prover-module is not configured/u);
    expect(
      failedCheck(report, "smoke-runtime-prover-configured"),
    ).toBeUndefined();
    const publishProvers = report.nextActions.find(
      (action) => action.id === "publish-bsc-prover-modules",
    );
    expect(publishProvers?.blockedByChecks).toEqual(
      expect.arrayContaining([
        "smoke-walletconnect-configured",
        "smoke-destination-prover-configured",
        "smoke-source-prover-configured",
      ]),
    );
    expect(publishProvers?.blockedByChecks).not.toContain(
      "smoke-readiness-ready",
    );
    expect(publishProvers?.blockedByChecks).not.toContain(
      "smoke-readiness-binding",
    );
    expect(publishProvers?.requiredInputs.map((input) => input.id)).toContain(
      "testnet-runtime-prover-config",
    );
    expect(report.nextActions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "publish-bsc-prover-modules",
        "record-live-video-proof",
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "walletconnect-project-id",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
        expect.objectContaining({
          id: "testnet-destination-browser-prover-module",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
        expect.objectContaining({
          id: "testnet-source-browser-prover-module",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
      ]),
    );
  });

  it("routes missing material-inventory prover evidence into prover publication", () => {
    const failingInventoryChecks = new Set([
      "destination-browser-prover",
      "source-browser-prover",
      "runtime-prover-config",
    ]);
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        checks: materialInventoryReport().checks.map((entry) =>
          failingInventoryChecks.has(entry.id)
            ? {
                ...entry,
                ok: false,
                message: `${entry.id} is not configured.`,
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "material-destination-prover-configured")?.detail,
    ).toMatch(/destination-browser-prover is not configured/u);
    expect(
      failedCheck(report, "material-source-prover-configured")?.detail,
    ).toMatch(/source-browser-prover is not configured/u);
    expect(
      failedCheck(report, "material-runtime-prover-configured")?.detail,
    ).toMatch(/runtime-prover-config is not configured/u);
    const publishProvers = report.nextActions.find(
      (action) => action.id === "publish-bsc-prover-modules",
    );
    expect(publishProvers?.blockedByChecks).toEqual(
      expect.arrayContaining([
        "material-runtime-prover-configured",
        "material-destination-prover-configured",
        "material-source-prover-configured",
      ]),
    );
    expect(publishProvers?.blockedByChecks).not.toContain(
      "production-material-inventory",
    );
    expect(publishProvers?.requiredInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "testnet-runtime-prover-config" }),
        expect.objectContaining({
          id: "testnet-destination-browser-prover-module",
        }),
        expect.objectContaining({ id: "testnet-source-browser-prover-module" }),
      ]),
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "testnet-runtime-prover-config",
          blockedByActions: ["publish-bsc-prover-modules"],
        }),
      ]),
    );
  });

  it("accepts public route preflight runbook fields embedded in smoke readiness", () => {
    const baseSmoke = smokeReadinessReport();
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        route: {
          ...baseSmoke.route,
          nextActions: [
            {
              id: "publish-production-proof-material",
              title: "Publish production proof material",
              detail: "Publish route-bound BSC proof material.",
              requiredInputs: [
                {
                  id: "testnet-production-verifier-key-json",
                  kind: "file",
                  placeholder: "<verifier-key.json>",
                  description: "Production BSC verifier key JSON.",
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
              id: "testnet-production-verifier-key-json",
              kind: "file",
              placeholder: "<verifier-key.json>",
              description: "Production BSC verifier key JSON.",
              blockedByActions: ["publish-production-proof-material"],
            },
          ],
        },
      }),
    });

    expect(report.ready).toBe(true);
    expect(
      failedCheck(report, "smoke-readiness-binding")?.detail ?? "",
    ).not.toMatch(/unsupported field (?:nextActions|missingProductionInputs)/u);
    expect(report.smokeReadiness?.route?.nextActions).toEqual([
      expect.objectContaining({
        id: "publish-production-proof-material",
        requiredInputs: [
          expect.objectContaining({
            id: "testnet-production-verifier-key-json",
          }),
        ],
      }),
    ]);
    expect(report.smokeReadiness?.route?.missingProductionInputs).toEqual([
      expect.objectContaining({
        id: "testnet-production-verifier-key-json",
        blockedByActions: ["publish-production-proof-material"],
      }),
    ]);
  });

  it("keeps retired local smoke prover sidecars sanitized in production gate failures", () => {
    const baseSmoke = smokeReadinessReport();
    const retiredDetail = `TAIRA -> BSC prover manifest uses retired local-only sidecar schema ${LOCAL_BROWSER_PROVER_SIDECAR_SCHEMA}; publish a route-bound ${SCCP_BSC_BROWSER_PROVER_MANIFEST_SCHEMA} sidecar.`;
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        ready: false,
        reasons: [retiredDetail],
        checks: baseSmoke.checks.map((entry) =>
          entry.id === "destination-prover-manifest" ||
          entry.id === "source-prover-manifest"
            ? { ...entry, status: "fail", detail: retiredDetail }
            : entry,
        ),
        provers: {
          ...baseSmoke.provers,
          destination: {
            ...baseSmoke.provers.destination,
            moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
            manifestUrl: "/sccp-bsc/taira-bsc-xor-prover.js.manifest.json",
            manifest: null,
          },
          source: {
            ...baseSmoke.provers.source,
            moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
            manifestUrl: "/sccp-bsc/taira-bsc-xor-prover.js.manifest.json",
            manifest: null,
          },
        },
      }),
    });
    const bindingDetail =
      failedCheck(report, "smoke-readiness-binding")?.detail ?? "";
    const readinessDetail =
      failedCheck(report, "smoke-readiness-ready")?.detail ?? "";

    expect(report.ready).toBe(false);
    expect(readinessDetail).toContain("retired local-only sidecar schema");
    expect(bindingDetail).toContain(
      "destination smoke prover manifest is missing",
    );
    expect(bindingDetail).toContain("source smoke prover manifest is missing");
    expect(`${readinessDetail}\n${bindingDetail}`).not.toContain(
      "routeId must be",
    );
  });

  it("rejects forged smoke-readiness reports without real probe and prover bindings", () => {
    const baseSmoke = smokeReadinessReport();
    const cases = [
      [
        "missing required smoke check",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: baseSmoke.checks.filter(
              (entry) => entry.id !== "source-prover-manifest",
            ),
          }),
        },
        /missing passing source-prover-manifest check/u,
      ],
      [
        "missing smoke-readiness runbook contract",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: baseSmoke.checks.filter(
              (entry) => entry.id !== "smoke-readiness-runbook-contract",
            ),
          }),
        },
        /missing passing smoke-readiness-runbook-contract check/u,
      ],
      [
        "failed required smoke check",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: baseSmoke.checks.map((entry) =>
              entry.id === "source-prover-module"
                ? {
                    ...entry,
                    status: "fail",
                    detail: "source prover module availability was not checked",
                  }
                : entry,
            ),
          }),
        },
        /source-prover-module: source prover module availability was not checked/u,
      ],
      [
        "unsupported smoke report field",
        {
          smokeReadinessReport: smokeReadinessReport({
            operatorOverride: "force-ready",
          }),
        },
        /smoke-readiness report contains unsupported field operatorOverride/u,
      ],
      [
        "unsupported smoke check field",
        {
          smokeReadinessReport: smokeReadinessReport({
            checks: baseSmoke.checks.map((entry, index) =>
              index === 0
                ? { ...entry, hiddenProbeOverride: "force-pass" }
                : entry,
            ),
          }),
        },
        /smoke-readiness check 0 contains unsupported field hiddenProbeOverride/u,
      ],
      [
        "unsupported smoke route field",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              hiddenRouteOverride: "force-public",
            },
          }),
        },
        /smoke-readiness route contains unsupported field hiddenRouteOverride/u,
      ],
      [
        "malformed smoke route next action",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              nextActions: [
                {
                  id: "publish-production-proof-material",
                  title: "",
                  detail: "Publish route-bound BSC proof material.",
                  requiredInputs: [],
                  blockedByChecks: [],
                  commands:
                    "npm run e2e:sccp:bsc-preflight -- --bsc-network testnet",
                },
              ],
            },
          }),
        },
        /smoke-readiness route next action 0 title is missing or not a non-empty string/u,
      ],
      [
        "unsupported smoke route next action required input field",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              nextActions: [
                {
                  id: "publish-production-proof-material",
                  title: "Publish production proof material",
                  detail: "Publish route-bound BSC proof material.",
                  requiredInputs: [
                    {
                      id: "testnet-production-verifier-key-json",
                      kind: "file",
                      placeholder: "<verifier-key.json>",
                      description: "Production BSC verifier key JSON.",
                      privateKey: "must-not-leak",
                    },
                  ],
                  blockedByChecks: ["bsc-production-verifier-material"],
                  commands: [
                    "npm run e2e:sccp:bsc-preflight -- --bsc-network testnet",
                  ],
                },
              ],
            },
          }),
        },
        /smoke-readiness route next action 0 required input 0 contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "malformed smoke route missing production input",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              missingProductionInputs: [
                {
                  id: "testnet-production-verifier-key-json",
                  kind: "file",
                  placeholder: "<verifier-key.json>",
                  description: "",
                  blockedByActions: "publish-production-proof-material",
                },
              ],
            },
          }),
        },
        /smoke-readiness route missing production input 0 description is missing or not a non-empty string/u,
      ],
      [
        "unsupported smoke route BSC profile field",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              bsc: {
                ...baseSmoke.route.bsc,
                rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
              },
            },
          }),
        },
        /smoke-readiness route BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "unsupported smoke route deployment field",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              deployment: {
                ...baseSmoke.route.deployment,
                hiddenDeploymentOverride: HASH_77,
              },
            },
          }),
        },
        /smoke-readiness route deployment contains unsupported field hiddenDeploymentOverride/u,
      ],
      [
        "unsupported smoke route post-deploy field",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...baseSmoke.route,
              postDeployLiveEvidence: {
                ...baseSmoke.route.postDeployLiveEvidence,
                hiddenPostDeployOverride: HASH_77,
              },
            },
          }),
        },
        /smoke-readiness route postDeployLiveEvidence contains unsupported field hiddenPostDeployOverride/u,
      ],
      [
        "unsupported embedded peer audit field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              hiddenPeerAuditOverride: "force-ready",
            },
          }),
        },
        /smoke-readiness peer audit contains unsupported field hiddenPeerAuditOverride/u,
      ],
      [
        "unsupported embedded peer audit check field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              checks: baseSmoke.peerAudit.checks.map((entry, index) =>
                index === 0
                  ? { ...entry, hiddenPeerCheckOverride: "force-pass" }
                  : entry,
              ),
            },
          }),
        },
        /smoke-readiness peer audit check 0 contains unsupported field hiddenPeerCheckOverride/u,
      ],
      [
        "unsupported embedded peer summary field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              peers: baseSmoke.peerAudit.peers.map((peer, index) =>
                index === 0
                  ? { ...peer, hiddenPeerOverride: "force-ready" }
                  : peer,
              ),
            },
          }),
        },
        /smoke-readiness peer audit peer 0 contains unsupported field hiddenPeerOverride/u,
      ],
      [
        "unsupported embedded peer deployment field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              peers: baseSmoke.peerAudit.peers.map((peer, index) =>
                index === 0
                  ? {
                      ...peer,
                      deployment: {
                        ...peer.deployment,
                        hiddenPeerDeploymentOverride: HASH_77,
                      },
                    }
                  : peer,
              ),
            },
          }),
        },
        /smoke-readiness peer audit peer 0 deployment contains unsupported field hiddenPeerDeploymentOverride/u,
      ],
      [
        "unsupported embedded peer post-deploy field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              peers: baseSmoke.peerAudit.peers.map((peer, index) =>
                index === 0
                  ? {
                      ...peer,
                      postDeployLiveEvidence: {
                        ...peer.postDeployLiveEvidence,
                        hiddenPeerPostDeployOverride: HASH_77,
                      },
                    }
                  : peer,
              ),
            },
          }),
        },
        /smoke-readiness peer audit peer 0 postDeployLiveEvidence contains unsupported field hiddenPeerPostDeployOverride/u,
      ],
      [
        "unsupported embedded peer failed-check field",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...baseSmoke.peerAudit,
              peers: baseSmoke.peerAudit.peers.map((peer, index) =>
                index === 0
                  ? {
                      ...peer,
                      failedChecks: [
                        {
                          id: "peer-route-production-readiness",
                          ok: false,
                          message: "failed",
                          hiddenFailedCheckOverride: "force-pass",
                        },
                      ],
                    }
                  : peer,
              ),
            },
          }),
        },
        /smoke-readiness peer audit peer 0 failed check 0 contains unsupported field hiddenFailedCheckOverride/u,
      ],
      [
        "unsupported provers summary field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              hiddenProversOverride: "force-ready",
            },
          }),
        },
        /smoke-readiness provers contains unsupported field hiddenProversOverride/u,
      ],
      [
        "unsupported destination prover field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                hiddenProverOverride: "force-ready",
              },
            },
          }),
        },
        /smoke-readiness destination prover contains unsupported field hiddenProverOverride/u,
      ],
      [
        "unsupported destination prover manifest field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  hiddenManifestOverride: HASH_77,
                },
              },
            },
          }),
        },
        /smoke-readiness destination prover manifest contains unsupported field hiddenManifestOverride/u,
      ],
      [
        "unsupported destination prover manifest deployment field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  deployment: {
                    ...baseSmoke.provers.destination.manifest.deployment,
                    hiddenManifestDeploymentOverride: HASH_77,
                  },
                },
              },
            },
          }),
        },
        /smoke-readiness destination prover manifest deployment contains unsupported field hiddenManifestDeploymentOverride/u,
      ],
      [
        "unsupported destination prover manifest post-deploy field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  postDeployLiveEvidence: {
                    ...baseSmoke.provers.destination.manifest
                      .postDeployLiveEvidence,
                    hiddenManifestPostDeployOverride: HASH_77,
                  },
                },
              },
            },
          }),
        },
        /smoke-readiness destination prover manifest postDeployLiveEvidence contains unsupported field hiddenManifestPostDeployOverride/u,
      ],
      [
        "unsupported runtime config summary field",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                hiddenRuntimeOverride: "force-ready",
              },
            },
          }),
        },
        /smoke-readiness runtime prover config summary contains unsupported field hiddenRuntimeOverride/u,
      ],
      [
        "unsafe destination prover URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                moduleUrl: "https://user:pass@example.com/prover.js",
              },
            },
          }),
        },
        /destination smoke prover moduleUrl must not include credentials/u,
      ],
      [
        "duplicate destination prover module URL alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                url: "/sccp-bsc/other-destination.js",
              },
            },
          }),
        },
        /destination smoke prover moduleUrl must not use multiple aliases: moduleUrl, url/u,
      ],
      [
        "double-encoded destination prover traversal URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                moduleUrl:
                  "https://cdn.example.invalid/provers/%252e%252e/prover.js",
              },
            },
          }),
        },
        /destination smoke prover moduleUrl must not include parent directory segments/u,
      ],
      [
        "manifest URL equals executable module URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifestUrl: baseSmoke.provers.destination.moduleUrl,
              },
            },
          }),
        },
        /destination smoke prover manifestUrl must not equal moduleUrl/u,
      ],
      [
        "duplicate destination prover manifest URL alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                url: "/sccp-bsc/other-destination.js.manifest.json",
              },
            },
          }),
        },
        /destination smoke prover manifestUrl must not use multiple aliases: manifestUrl, url/u,
      ],
      [
        "manifest URL points at executable module",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              source: {
                ...baseSmoke.provers.source,
                manifestUrl: "/sccp-bsc/source.js",
              },
            },
          }),
        },
        /source smoke prover manifestUrl must point to manifest JSON, not executable prover code/u,
      ],
      [
        "manifest URL path drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              source: {
                ...baseSmoke.provers.source,
                manifestUrl: "/sccp-bsc/other-source.js.manifest.json",
              },
            },
          }),
        },
        /source smoke prover manifestUrl does not match moduleUrl/u,
      ],
      [
        "manifest module URL mismatch",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  moduleUrl: "/sccp-bsc/other-destination.js",
                },
              },
            },
          }),
        },
        /destination smoke prover manifest moduleUrl does not match/u,
      ],
      [
        "duplicate destination prover manifest module URL alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  module_url: "/sccp-bsc/other-destination.js",
                },
              },
            },
          }),
        },
        /destination smoke prover manifest moduleUrl must not use multiple aliases: moduleUrl, module_url/u,
      ],
      [
        "destination prover duplicate route identity alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  route_id: SCCP_BSC_XOR_ROUTE_ID,
                },
              },
            },
          }),
        },
        /destination smoke prover manifest routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "source proof hash drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              source: {
                ...baseSmoke.provers.source,
                manifest: {
                  ...baseSmoke.provers.source.manifest,
                  proofArtifactHash: HASH_77,
                },
              },
            },
          }),
        },
        /source smoke prover manifest proofArtifactHash does not match route deployment/u,
      ],
      [
        "destination native bundle hash drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  nativeEvmProverBundleHash: HASH_77,
                  deployment: {
                    ...baseSmoke.provers.destination.manifest.deployment,
                    nativeEvmProverBundleHash: HASH_77,
                  },
                },
              },
            },
          }),
        },
        /destination smoke prover manifest nativeEvmProverBundleHash does not match route deployment/u,
      ],
      [
        "wrong source export",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              source: {
                ...baseSmoke.provers.source,
                manifest: {
                  ...baseSmoke.provers.source.manifest,
                  acceptedExport: "bscSccpProve",
                  exports: ["bscSccpProve"],
                },
              },
            },
          }),
        },
        /source smoke prover manifest does not expose bscSccpSourceProve/u,
      ],
      [
        "runtime config omitted",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: null,
            },
          }),
        },
        /smoke-readiness runtime prover config summary is missing/u,
      ],
      [
        "runtime config falsely marked not required for checked-in runtime module",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                },
              },
              source: {
                ...baseSmoke.provers.source,
                moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                manifest: {
                  ...baseSmoke.provers.source.manifest,
                  moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                },
              },
              runtimeConfig: {
                required: false,
                configUrl: null,
                manifest: null,
              },
            },
          }),
        },
        /claims it is not required while a checked-in runtime prover module is selected/u,
      ],
      [
        "runtime config falsely marked not required while carrying material",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                required: false,
              },
            },
          }),
        },
        /runtime prover config claims it is not required but carries runtime config material/u,
      ],
      [
        "runtime config required flag omitted for checked-in runtime module",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              destination: {
                ...baseSmoke.provers.destination,
                moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                manifest: {
                  ...baseSmoke.provers.destination.manifest,
                  moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                },
              },
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                required: undefined,
              },
            },
          }),
        },
        /runtime prover config is not explicitly marked required while a checked-in runtime prover module is selected/u,
      ],
      [
        "runtime config hash omitted",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                configSha256: undefined,
              },
            },
          }),
        },
        /runtime prover config hash is missing or invalid/u,
      ],
      [
        "runtime config zero hash",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                configSha256: ZERO_HASH,
              },
            },
          }),
        },
        /runtime prover config hash is missing or invalid/u,
      ],
      [
        "runtime config route drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  routeId: "wrong_route",
                },
              },
            },
          }),
        },
        /smoke-readiness runtime prover config is for the wrong SCCP route/u,
      ],
      [
        "runtime config duplicate asset identity alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  asset_key: SCCP_BSC_XOR_ASSET_KEY,
                },
              },
            },
          }),
        },
        /smoke-readiness runtime prover config assetKey uses multiple aliases: assetKey, asset_key/u,
      ],
      [
        "runtime config missing TAIRA chain binding",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  tairaChainId: undefined,
                },
              },
            },
          }),
        },
        /smoke-readiness runtime prover config is not bound to TAIRA chain id/u,
      ],
      [
        "runtime config destination proof hash drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  destination: {
                    ...baseSmoke.provers.runtimeConfig.manifest.destination,
                    proofArtifactSha256: HASH_77,
                  },
                },
              },
            },
          }),
        },
        /destination runtime prover config proofArtifactSha256 does not match route proofArtifactHash/u,
      ],
      [
        "runtime config unsafe source backend URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  source: {
                    ...baseSmoke.provers.runtimeConfig.manifest.source,
                    backendModuleUrl: "https://user:pass@example.com/prover.js",
                  },
                },
              },
            },
          }),
        },
        /source runtime prover config backendModuleUrl must not include credentials/u,
      ],
      [
        "runtime config double-encoded source backend traversal URL",
        {
          smokeReadinessReport: smokeReadinessReport({
            provers: {
              ...baseSmoke.provers,
              runtimeConfig: {
                ...baseSmoke.provers.runtimeConfig,
                manifest: {
                  ...baseSmoke.provers.runtimeConfig.manifest,
                  source: {
                    ...baseSmoke.provers.runtimeConfig.manifest.source,
                    backendModuleUrl: "/sccp-bsc/%252e%252e/source-backend.js",
                  },
                },
              },
            },
          }),
        },
        /source runtime prover config backendModuleUrl must not include parent directory segments/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "smoke-readiness-binding")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("rejects cross-report deployment and peer-audit drift", () => {
    const cases = [
      [
        "smoke deployment drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              deployment: deployment({ verifierAddress: BSC_BRIDGE_ADDRESS }),
            },
          }),
        },
        /smoke-readiness route verifierAddress does not match/u,
      ],
      [
        "route deployment duplicate verifier alias",
        {
          routeReport: routeReport({
            deployment: {
              ...deployment(),
              verifier_address: BSC_VERIFIER_ADDRESS,
            },
          }),
        },
        /smoke-readiness route verifierAddress uses multiple aliases: verifierAddress, verifier_address/u,
      ],
      [
        "route deployment single TRON verifier alias",
        {
          routeReport: routeReport({
            deployment: {
              ...deployment({ verifierAddress: undefined }),
              tron_verifier_address: BSC_VERIFIER_ADDRESS,
            },
          }),
        },
        /route report verifierAddress uses forbidden TRON aliases for BSC evidence: tron_verifier_address/u,
      ],
      [
        "smoke deployment duplicate proof alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              deployment: {
                ...smokeReadinessReport().route.deployment,
                prover_artifact_hash: HASH_44,
              },
            },
          }),
        },
        /smoke-readiness route proofArtifactHash uses multiple aliases: proofArtifactHash, prover_artifact_hash/u,
      ],
      [
        "smoke deployment single TRON source bridge alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              deployment: {
                ...smokeReadinessReport().route.deployment,
                sourceBridgeAddress: undefined,
                sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
              },
            },
          }),
        },
        /smoke-readiness route sourceBridgeAddress uses forbidden TRON aliases for BSC evidence: sccp_tron_source_bridge_address/u,
      ],
      [
        "smoke post-deploy drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              postDeployLiveEvidence: postDeployLiveEvidence({
                routeCanaryTransactionId: HASH_55,
              }),
            },
          }),
        },
        /smoke-readiness route routeCanaryTransactionId does not match/u,
      ],
      [
        "smoke post-deploy missing offline full TOML hash",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              postDeployLiveEvidence: postDeployLiveEvidence({
                offlineFullTomlSha256: undefined,
              }),
            },
          }),
        },
        /smoke-readiness route offlineFullTomlSha256 is missing/u,
      ],
      [
        "route post-deploy duplicate readiness alias",
        {
          routeReport: routeReport({
            postDeployLiveEvidence: {
              ...postDeployLiveEvidence(),
              full_toml_ready: true,
            },
          }),
        },
        /smoke-readiness route fullTomlReady uses multiple aliases/u,
      ],
      [
        "smoke post-deploy duplicate config hash alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              postDeployLiveEvidence: {
                ...smokeReadinessReport().route.postDeployLiveEvidence,
                source_bridge_config_hash: HASH_44,
              },
            },
          }),
        },
        /smoke-readiness route sourceBridgeConfigHash uses multiple aliases/u,
      ],
      [
        "embedded peer raw TOML hash drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: [
                {
                  ...smokeReadinessReport().peerAudit.peers[0],
                  rawTomlSha256: HASH_22,
                },
                ...smokeReadinessReport().peerAudit.peers.slice(1),
              ],
            },
          }),
        },
        /peer 0 rawTomlSha256 differs/u,
      ],
      [
        "embedded peer sanitized stanza hash drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: [
                {
                  ...smokeReadinessReport().peerAudit.peers[0],
                  sanitizedStanzaSha256: HASH_33,
                },
                ...smokeReadinessReport().peerAudit.peers.slice(1),
              ],
            },
          }),
        },
        /peer 0 sanitizedStanzaSha256 differs/u,
      ],
      [
        "embedded peer hash-role problems missing",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: smokeReadinessReport().peerAudit.peers.map(
                (peer, index) =>
                  index === 0 ? { ...peer, hashRoleProblems: undefined } : peer,
              ),
            },
          }),
        },
        /peer 0 hashRoleProblems differs/u,
      ],
      [
        "embedded peer burn-record problems drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: smokeReadinessReport().peerAudit.peers.map(
                (peer, index) =>
                  index === 0
                    ? {
                        ...peer,
                        burnRecordMaterialProblems: [
                          "stale burn-record problem",
                        ],
                      }
                    : peer,
              ),
            },
          }),
        },
        /peer 0 burnRecordMaterialProblems differs/u,
      ],
      [
        "embedded peer audit route drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              assetKey: "wrong_asset",
            },
          }),
        },
        /peer audit route differs/u,
      ],
      [
        "embedded peer audit peerCount drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peerCount: 99,
            },
          }),
        },
        /peer audit peerCount differs/u,
      ],
      [
        "embedded peer summary not object",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: [
                ...smokeReadinessReport().peerAudit.peers,
                "not-a-peer-summary",
              ],
            },
          }),
        },
        /smoke-readiness peer audit peer summary 4 is not an object/u,
      ],
      [
        "embedded peer audit check drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              checks: smokeReadinessReport().peerAudit.checks.slice(1),
            },
          }),
        },
        /peer audit check count differs/u,
      ],
      [
        "embedded peer audit duplicate check id alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              checks: smokeReadinessReport().peerAudit.checks.map((entry) =>
                entry.id === "peer-route-count"
                  ? { ...entry, check_id: entry.id }
                  : entry,
              ),
            },
          }),
        },
        /smoke-readiness embedded peer audit check peer-route-count id uses multiple aliases: id, check_id/u,
      ],
      [
        "embedded peer failed check duplicate id alias",
        {
          peerAuditReport: peerAuditReport({
            peers: peerAuditReport().peers.map((peer, index) =>
              index === 0
                ? {
                    ...peer,
                    failedChecks: [
                      {
                        id: "bsc-production-ready",
                        checkId: "bsc-production-ready",
                        ok: false,
                        message: "failed",
                      },
                    ],
                  }
                : peer,
            ),
          }),
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: smokeReadinessReport().peerAudit.peers.map(
                (peer, index) =>
                  index === 0
                    ? {
                        ...peer,
                        failedChecks: [
                          {
                            id: "bsc-production-ready",
                            checkId: "bsc-production-ready",
                            ok: false,
                            message: "failed",
                          },
                        ],
                      }
                    : peer,
              ),
            },
          }),
        },
        /peer audit peer 0 failed checks check bsc-production-ready id uses multiple aliases: id, checkId/u,
      ],
      [
        "embedded peer readiness drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: [
                {
                  ...smokeReadinessReport().peerAudit.peers[0],
                  ready: false,
                },
                ...smokeReadinessReport().peerAudit.peers.slice(1),
              ],
            },
          }),
        },
        /smoke-readiness peer 0 ready differs/u,
      ],
      [
        "embedded peer failed-check drift",
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              peers: [
                {
                  ...smokeReadinessReport().peerAudit.peers[0],
                  failedChecks: [
                    {
                      id: "peer-route-production-readiness",
                      ok: false,
                      message: "failed",
                    },
                  ],
                },
                ...smokeReadinessReport().peerAudit.peers.slice(1),
              ],
            },
          }),
        },
        /smoke-readiness peer 0 failed check count differs/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        report.checks
          .filter((entry) => !entry.ok)
          .map((entry) => entry.detail)
          .join("\n"),
        name,
      ).toMatch(detail);
    }
  });

  it("rejects consistently malformed post-deploy live evidence", () => {
    const cases = [
      [
        "invalid source config hash",
        reportsWithPostDeployEvidence({
          sourceBridgeConfigHash: "not-a-hash",
        }),
        /sourceBridgeConfigHash is missing or invalid/u,
      ],
      [
        "source and canary evidence hash reuse",
        reportsWithPostDeployEvidence({
          routeCanaryEvidenceHash: HASH_44,
        }),
        /sourceBridgeConfigHash and routeCanaryEvidenceHash must be distinct/u,
      ],
      [
        "source and canary transaction reuse",
        reportsWithPostDeployEvidence({
          routeCanaryTransactionId: HASH_55,
          routeCanaryExplorerUrl: bscTx(HASH_55),
        }),
        /sourceEventTransactionId and routeCanaryTransactionId must be distinct/u,
      ],
      [
        "wrong explorer host",
        reportsWithPostDeployEvidence({
          routeCanaryExplorerUrl: bscTx(HASH_77, "mainnet"),
        }),
        /routeCanaryExplorerUrl is missing or invalid/u,
      ],
      [
        "explorer URL with query string",
        reportsWithPostDeployEvidence({
          routeCanaryExplorerUrl: `${bscTx(HASH_77)}?utm_source=proof`,
        }),
        /routeCanaryExplorerUrl is missing or invalid/u,
      ],
      [
        "explorer URL with credentials",
        reportsWithPostDeployEvidence({
          routeCanaryExplorerUrl: bscTx(HASH_77).replace(
            "https://",
            "https://operator:secret@",
          ),
        }),
        /routeCanaryExplorerUrl is missing or invalid/u,
      ],
      [
        "full TOML not ready",
        reportsWithPostDeployEvidence({
          fullTomlReady: false,
        }),
        /fullTomlReady is not true/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        report.checks
          .filter((entry) => !entry.ok)
          .map((entry) => entry.detail)
          .join("\n"),
        name,
      ).toMatch(detail);
    }
  });

  it("rejects consistently malformed BSC deployment addresses", () => {
    const cases = [
      [
        "short bridge address",
        reportsWithDeployment({ bridgeAddress: "0x1234" }),
        /route report deployment bridgeAddress is missing or invalid/u,
      ],
      [
        "zero verifier address",
        reportsWithDeployment({
          verifierAddress: "0x0000000000000000000000000000000000000000",
        }),
        /route report deployment verifierAddress is missing or invalid/u,
      ],
      [
        "duplicate token and bridge addresses",
        reportsWithDeployment({ tokenAddress: BSC_BRIDGE_ADDRESS }),
        /route report deployment tokenAddress must not equal bridgeAddress/u,
      ],
      [
        "zero verifier code hash",
        reportsWithDeployment({ verifierCodeHash: ZERO_HASH }),
        /route report deployment verifierCodeHash is missing or invalid/u,
      ],
      [
        "short proof artifact hash",
        reportsWithDeployment({ proofArtifactHash: "0x1234" }),
        /route report deployment proofArtifactHash is missing or invalid/u,
      ],
      [
        "duplicate destination binding and verifier key hashes",
        reportsWithDeployment({ destinationBindingHash: HASH_22 }),
        /route report destinationBindingHash must not equal verifierKeyHash/u,
      ],
      [
        "alias settlement asset",
        reportsWithDeployment({ settlementAssetDefinitionId: "xor#universal" }),
        /route report deployment settlementAssetDefinitionId is missing or invalid/u,
      ],
      [
        "non-base58 settlement asset",
        reportsWithDeployment({
          settlementAssetDefinitionId: "O0IlO0IlO0IlO0Il",
        }),
        /route report deployment settlementAssetDefinitionId is missing or invalid/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        report.checks
          .filter((entry) => !entry.ok)
          .map((entry) => entry.detail)
          .join("\n"),
        name,
      ).toMatch(detail);
    }
  });

  it("rejects case-only settlement asset drift across deployment evidence", () => {
    const smokeSettlementAssetDefinitionId = "6tEAJqbb8oEPmLncoNiMRbLEK6tw";
    const report = evaluate({
      smokeReadinessReport: smokeReadinessReport({
        route: {
          ...smokeReadinessReport().route,
          deployment: deployment({
            settlementAssetDefinitionId: smokeSettlementAssetDefinitionId,
          }),
        },
      }),
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "cross-report-binding")?.detail).toMatch(
      /smoke-readiness route settlementAssetDefinitionId does not match/u,
    );
  });

  it("rejects stale, future-dated, or timestamp-stripped evidence", () => {
    const staleMs = NOW_MS - 7 * 60 * 60 * 1000;
    const futureMs = NOW_MS + 10 * 60 * 1000;
    const cases = [
      [
        "stale route",
        { routeReport: routeReport({ generatedAtMs: staleMs }) },
        /route preflight report is stale/u,
      ],
      [
        "future peer audit",
        { peerAuditReport: peerAuditReport({ generatedAtMs: futureMs }) },
        /peer audit report is dated in the future/u,
      ],
      [
        "missing smoke timestamp",
        { smokeReadinessReport: smokeReadinessReport({ checkedAt: null }) },
        /smoke-readiness report timestamp is missing or invalid/u,
      ],
      [
        "date-only route timestamp",
        {
          routeReport: routeReport({
            generatedAt: "2026-06-06",
            generatedAtMs: undefined,
          }),
        },
        /route preflight report timestamp is missing or invalid/u,
      ],
      [
        "locale-style material inventory timestamp",
        {
          materialInventoryReport: materialInventoryReport({
            generatedAt: "06/06/2026 00:00:00",
            generatedAtMs: undefined,
          }),
        },
        /production material inventory report timestamp is missing or invalid/u,
      ],
      [
        "invalid primary smoke timestamp with valid fallback alias",
        {
          smokeReadinessReport: smokeReadinessReport({
            checkedAt: "2026-06-06",
            generatedAtMs: NOW_MS - 1_000,
          }),
        },
        /smoke-readiness report timestamp is missing or invalid/u,
      ],
      [
        "conflicting route report timestamp aliases",
        {
          routeReport: routeReport({
            generatedAt: new Date(NOW_MS - 6_000).toISOString(),
            generatedAtMs: NOW_MS - 1_000,
          }),
        },
        /route preflight report timestamp fields are inconsistent: point timestamp fields disagree: generatedAt, generatedAtMs/u,
      ],
      [
        "invalid secondary peer audit timestamp alias",
        {
          peerAuditReport: peerAuditReport({
            generatedAt: new Date(NOW_MS - 1_000).toISOString(),
            generatedAtMs: "not-a-safe-integer",
          }),
        },
        /peer audit report timestamp fields are inconsistent: generatedAtMs is invalid/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, "evidence-freshness")?.detail, name).toMatch(
        detail,
      );
    }
  });

  it("rejects missing or zero production proof material hashes", () => {
    const cases = [
      [
        "missing route proof",
        {
          routeReport: routeReport({
            deployment: deployment({ proofArtifactHash: null }),
          }),
        },
        /route preflight proofArtifactHash is missing or invalid/u,
      ],
      [
        "missing smoke proof",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              deployment: deployment({ proofArtifactHash: undefined }),
            },
          }),
        },
        /smoke-readiness route proofArtifactHash is missing or invalid/u,
      ],
      [
        "missing native bundle descriptor hash",
        {
          routeReport: routeReport({
            deployment: deployment({ nativeEvmProverBundleHash: null }),
          }),
        },
        /route preflight nativeEvmProverBundleHash is missing or invalid/u,
      ],
      [
        "colliding route proof material roles",
        {
          routeReport: routeReport({
            deployment: deployment({
              provingKeyHash: deployment().proofArtifactHash,
            }),
          }),
        },
        /route preflight provingKeyHash must not equal proofArtifactHash/u,
      ],
    ];

    for (const [name, overrides, detail] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "production-proof-material")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("surfaces blocked Groth16 attestation roles as a dedicated gate blocker", () => {
    const inventory = materialInventoryReport();
    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        ready: false,
        checks: inventory.checks.map((entry) =>
          entry.id === "groth16-attestation-role-readiness"
            ? {
                ...entry,
                ok: false,
                message:
                  "Groth16 attestation request roles are all ready for signature.",
                detail:
                  "trustedSetup not ready: trusted setup requires at least two independent contributors.",
              }
            : entry,
        ),
      }),
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "material-groth16-attestation-role-readiness")
        ?.detail,
    ).toMatch(/trustedSetup not ready/u);
    expect(
      failedCheck(report, "material-groth16-attestation-role-readiness")
        ?.detail,
    ).toMatch(/two independent contributors/u);
    const action = report.nextActions.find(
      (entry) => entry.id === "publish-production-proof-material",
    );
    expect(action?.blockedByChecks).toContain(
      "material-groth16-attestation-role-readiness",
    );
  });

  it("allows valid cross-profile production requirement and source parity summaries in shared scan roots", () => {
    const baseInventory = materialInventoryReport();
    const mainnetProfile = resolveBscNetworkProfile("mainnet");
    const mainnetRequirementsHash =
      bscProductionRequirementsContractHash("mainnet");
    const baseRequirements = baseInventory.files.find(
      (entry) => entry.kind === "production-requirements",
    );
    const baseSourceParity = baseInventory.files.find(
      (entry) => entry.kind === "source-parity-attestation",
    );

    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        counts: {
          ...baseInventory.counts,
          files: baseInventory.counts.files + 2,
          relevantFilesSeen: baseInventory.counts.relevantFilesSeen + 2,
        },
        files: [
          ...baseInventory.files,
          {
            ...baseRequirements,
            path: "./output/sccp-bsc-production/taira-bsc-mainnet-xor-production-requirements.json",
            productionRequirements: {
              ...baseRequirements.productionRequirements,
              bscNetwork: mainnetProfile.key,
              contractHash: mainnetRequirementsHash,
              expectedContractHash: mainnetRequirementsHash,
            },
          },
          {
            ...baseSourceParity,
            path: "./output/sccp-bsc-production/mainnet-source-parity-attestation.json",
            sourceParityAttestation: {
              ...baseSourceParity.sourceParityAttestation,
              bscNetwork: mainnetProfile.key,
              chain: mainnetProfile.chain,
              chainIdHex: mainnetProfile.chainIdHex,
              networkIdHex: mainnetProfile.networkIdHex,
              requiredMarkers: sourceParityRequiredMarkers(mainnetProfile),
            },
          },
        ],
      }),
    });

    expect(report.ready).toBe(true);
    expect(
      failedCheck(report, "production-material-inventory")?.detail ?? "",
    ).not.toMatch(/source parity attestation file \d+ bscNetwork is invalid/u);
    expect(
      failedCheck(report, "production-material-inventory")?.detail ?? "",
    ).not.toMatch(
      /production requirements file \d+ contractHash does not match/u,
    );
  });

  it("rejects invalid cross-profile production requirement and source parity summaries in shared scan roots", () => {
    const baseInventory = materialInventoryReport();
    const mainnetProfile = resolveBscNetworkProfile("mainnet");
    const baseRequirements = baseInventory.files.find(
      (entry) => entry.kind === "production-requirements",
    );
    const baseSourceParity = baseInventory.files.find(
      (entry) => entry.kind === "source-parity-attestation",
    );

    const report = evaluate({
      materialInventoryReport: materialInventoryReport({
        counts: {
          ...baseInventory.counts,
          files: baseInventory.counts.files + 2,
          relevantFilesSeen: baseInventory.counts.relevantFilesSeen + 2,
        },
        files: [
          ...baseInventory.files,
          {
            ...baseRequirements,
            path: "./output/sccp-bsc-production/taira-bsc-mainnet-xor-production-requirements.json",
            productionRequirements: {
              ...baseRequirements.productionRequirements,
              bscNetwork: mainnetProfile.key,
              contractHash: HASH_77,
              expectedContractHash: HASH_77,
              contractMatchesExpected: true,
            },
          },
          {
            ...baseSourceParity,
            path: "./output/sccp-bsc-production/mainnet-source-parity-attestation.json",
            sourceParityAttestation: {
              ...baseSourceParity.sourceParityAttestation,
              bscNetwork: mainnetProfile.key,
              chain: mainnetProfile.chain,
              chainIdHex: mainnetProfile.chainIdHex,
              networkIdHex: mainnetProfile.networkIdHex,
              requiredMarkers: sourceParityRequiredMarkers("testnet"),
            },
          },
        ],
      }),
    });

    expect(report.ready).toBe(false);
    const detail =
      failedCheck(report, "production-material-inventory")?.detail ?? "";
    expect(detail).toMatch(
      /production requirements file \d+ contractHash does not match the expected BSC mainnet requirements contract/u,
    );
    expect(detail).toMatch(
      /source parity attestation file \d+ requiredMarkers are missing BSC_MAINNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER/u,
    );
  });

  it("requires a ready production material inventory bound to the same route", () => {
    const cases = [
      [
        "missing inventory",
        { materialInventoryReport: null },
        /production material inventory report is missing/u,
      ],
      [
        "not ready",
        {
          materialInventoryReport: materialInventoryReport({
            ready: false,
            checks: [
              {
                id: "production-proof-files",
                ok: false,
                message: "missing proof files",
              },
            ],
          }),
        },
        /production material inventory is not ready: production-proof-files/u,
      ],
      [
        "unsupported inventory root field",
        {
          materialInventoryReport: materialInventoryReport({
            verifierMaterial: "public verifier summary",
          }),
        },
        /production material inventory report contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported inventory check field",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.map((entry, index) =>
              index === 0 ? { ...entry, localOverride: "force-pass" } : entry,
            ),
          }),
        },
        /production material inventory check 0 contains unsupported field localOverride/u,
      ],
      [
        "unsupported inventory route field",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              localRouteReport: "./route.json",
            },
          }),
        },
        /production material inventory route contains unsupported field localRouteReport/u,
      ],
      [
        "unsupported inventory route BSC field",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              bsc: {
                ...materialInventoryReport().route.bsc,
                rpcUrl: "https://rpc.invalid",
              },
            },
          }),
        },
        /production material inventory route BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "unsupported inventory route deployment field",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: {
                ...materialInventoryReport().route.deployment,
                proverMaterial: "public prover summary",
              },
            },
          }),
        },
        /production material inventory route deployment contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported inventory route post-deploy field",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              postDeployLiveEvidence: {
                ...materialInventoryReport().route.postDeployLiveEvidence,
                receipt: "0x01",
              },
            },
          }),
        },
        /production material inventory route postDeployLiveEvidence contains unsupported field receipt/u,
      ],
      [
        "unsupported inventory counts field",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              operatorAdjustedFiles: 5,
            },
          }),
        },
        /production material inventory counts contains unsupported field operatorAdjustedFiles/u,
      ],
      [
        "missing scan roots",
        {
          materialInventoryReport: materialInventoryReport({
            scanRoots: undefined,
          }),
        },
        /production material inventory scan roots are missing or invalid/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "missing scan root statuses",
        {
          materialInventoryReport: materialInventoryReport({
            scanRootStatuses: undefined,
          }),
        },
        /production material inventory scan root statuses are missing or invalid/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "scan root status count mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            scanRootStatuses: [
              {
                path: "./output/sccp-bsc-production",
                ok: true,
                kind: "directory",
              },
            ],
          }),
        },
        /production material inventory scan root status count does not match scan roots/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "scan root status path mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            scanRootStatuses: [
              { path: "./public/sccp-bsc", ok: true, kind: "directory" },
              {
                path: "./output/sccp-bsc-production",
                ok: true,
                kind: "directory",
              },
            ],
          }),
        },
        /production material inventory scan root status 0 path does not match scan root 0/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "unavailable scan root status",
        {
          materialInventoryReport: materialInventoryReport({
            scanRootStatuses: [
              {
                path: "./output/sccp-bsc-production",
                ok: false,
                kind: "missing",
                detail: "ENOENT",
              },
              { path: "./public/sccp-bsc", ok: true, kind: "directory" },
            ],
          }),
        },
        /production material inventory scan root 0 is unavailable: missing \(ENOENT\)/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "contradictory scan root status",
        {
          materialInventoryReport: materialInventoryReport({
            scanRootStatuses: [
              {
                path: "./output/sccp-bsc-production",
                ok: true,
                kind: "missing",
              },
              { path: "./public/sccp-bsc", ok: true, kind: "directory" },
            ],
          }),
        },
        /production material inventory scan root status 0 ok flag contradicts kind missing/u,
        "material-inventory-scan-root-availability",
      ],
      [
        "absolute scan root",
        {
          materialInventoryReport: materialInventoryReport({
            scanRoots: ["/tmp/sccp-bsc-production"],
          }),
        },
        /production material inventory scan root 0 path must be a repo-relative public path/u,
      ],
      [
        "duplicate scan root",
        {
          materialInventoryReport: materialInventoryReport({
            scanRoots: [
              "./output/sccp-bsc-production",
              "./output/sccp-bsc-production",
            ],
          }),
        },
        /production material inventory scan root 1 duplicates scan root 0/u,
      ],
      [
        "generated fixture scan root",
        {
          materialInventoryReport: materialInventoryReport({
            scanRoots: ["./output/sccp-bsc-material-inventory-test-1"],
          }),
        },
        /production material inventory scan root 0 must not be a generated non-production material directory/u,
      ],
      [
        "file summary outside scan roots",
        {
          materialInventoryReport: materialInventoryReport({
            scanRoots: ["./public/sccp-bsc"],
          }),
        },
        /production material inventory file summary 0 path is not covered by scan roots/u,
      ],
      [
        "skipped generated directory outside scan roots",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              skippedGeneratedDirectories: 1,
            },
            skippedGeneratedDirectories: [
              "./output/sccp-bsc-material-inventory-test-1",
            ],
          }),
        },
        /production material inventory skipped generated directory 0 is not under a scan root/u,
      ],
      [
        "missing relevant file count",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              relevantFilesSeen: undefined,
            },
          }),
        },
        /production material inventory relevant file count is missing or invalid/u,
      ],
      [
        "relevant file count below summaries",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              relevantFilesSeen: materialInventoryReport().files.length - 1,
            },
          }),
        },
        /production material inventory relevant file count is smaller than file summaries/u,
      ],
      [
        "truncated material scan",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              truncated: true,
            },
          }),
        },
        /production material inventory scan is truncated/u,
      ],
      [
        "scan max below relevant file count",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              maxFiles: materialInventoryReport().counts.files - 1,
            },
          }),
        },
        /production material inventory scan max file limit is smaller than relevant file count/u,
      ],
      [
        "proof artifact candidate count below proof count",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              proofArtifactCandidates: 0,
            },
          }),
        },
        /production material inventory proof artifact candidate count is smaller than proof artifact count/u,
      ],
      [
        "proving key candidate count below proving key count",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              provingKeyCandidates: 0,
            },
          }),
        },
        /production material inventory proving key candidate count is smaller than proving key count/u,
      ],
      [
        "skipped generated directory count drift",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              skippedGeneratedDirectories: 1,
            },
            skippedGeneratedDirectories: [],
          }),
        },
        /production material inventory skipped generated directory count does not match skipped generated directory summaries/u,
      ],
      [
        "skipped generated directory absolute path",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              skippedGeneratedDirectories: 1,
            },
            skippedGeneratedDirectories: ["/tmp/sccp-bsc-material-fixture"],
          }),
        },
        /production material inventory skipped generated directory 0 path must be a repo-relative public path/u,
      ],
      [
        "skipped generated directory with non-generated basename",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              skippedGeneratedDirectories: 1,
            },
            skippedGeneratedDirectories: ["./output/sccp-bsc-production"],
          }),
        },
        /production material inventory skipped generated directory 0 is not a recognized generated non-production material directory/u,
      ],
      [
        "duplicate skipped generated directory",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              skippedGeneratedDirectories: 2,
            },
            skippedGeneratedDirectories: [
              "./output/sccp-bsc-material-inventory-test-1",
              "./output/sccp-bsc-material-inventory-test-1",
            ],
          }),
        },
        /production material inventory skipped generated directory 1 duplicates skipped generated directory 0/u,
      ],
      [
        "stale inventory without offline full-TOML evidence check",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.filter(
              (entry) => entry.id !== "offline-full-toml-evidence-artifact",
            ),
          }),
        },
        /production material inventory is missing passing offline-full-toml-evidence-artifact check/u,
      ],
      [
        "offline full-TOML evidence count drift",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionOfflineFullTomlEvidenceArtifacts: 0,
            },
          }),
        },
        /production material inventory offline full-TOML evidence artifact count does not match file summaries/u,
      ],
      [
        "offline full-TOML evidence summary on non-evidence file",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    offlineFullTomlEvidence:
                      materialInventoryReport().files.find(
                        (file) => file.kind === "offline-full-toml-evidence",
                      )?.offlineFullTomlEvidence,
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary 0 carries offlineFullTomlEvidence for non-evidence kind route/u,
      ],
      [
        "offline full-TOML evidence public hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "offline-full-toml-evidence"
                ? {
                    ...entry,
                    offlineFullTomlEvidence: {
                      ...entry.offlineFullTomlEvidence,
                      offlineFullTomlSha256: HASH_77,
                      hashInputSha256: HASH_77,
                      publicPostDeployMatches: false,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory offline full-TOML evidence file \d+ offlineFullTomlSha256 does not match public route post-deploy evidence/u,
      ],
      [
        "offline full-TOML evidence missing route manifest path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "offline-full-toml-evidence"
                ? {
                    ...entry,
                    offlineFullTomlEvidence: {
                      ...entry.offlineFullTomlEvidence,
                      routeManifestPath: "",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory offline full-TOML evidence file \d+ routeManifestPath is missing/u,
      ],
      [
        "offline full-TOML evidence absolute full config path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "offline-full-toml-evidence"
                ? {
                    ...entry,
                    offlineFullTomlEvidence: {
                      ...entry.offlineFullTomlEvidence,
                      fullConfigPath: "/tmp/full-config.toml",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory offline full-TOML evidence file \d+ fullConfigPath must be a relative path/u,
      ],
      [
        "offline full-TOML evidence encoded traversal route manifest path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "offline-full-toml-evidence"
                ? {
                    ...entry,
                    offlineFullTomlEvidence: {
                      ...entry.offlineFullTomlEvidence,
                      routeManifestPath:
                        "output/sccp-bsc-production/%2e%2e/route.manifest.json",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory offline full-TOML evidence file \d+ routeManifestPath must not use percent-encoded path segments/u,
      ],
      [
        "offline full-TOML evidence backslash full config path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "offline-full-toml-evidence"
                ? {
                    ...entry,
                    offlineFullTomlEvidence: {
                      ...entry.offlineFullTomlEvidence,
                      fullConfigPath:
                        "output\\sccp-bsc-production\\taira-bsc-xor-full-config.toml",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory offline full-TOML evidence file \d+ fullConfigPath must be a relative path/u,
      ],
      [
        "source parity required marker drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "source-parity-attestation"
                ? {
                    ...entry,
                    sourceParityAttestation: {
                      ...entry.sourceParityAttestation,
                      requiredMarkers: [
                        "BSC_TESTNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER",
                        "forged-marker-category",
                        "BSC_TESTNET_LOCAL_ADMISSION_ADVERSARIAL_TESTS",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory source parity attestation file \d+ requiredMarkers contain unknown marker forged-marker-category/u,
      ],
      [
        "mainnet source parity cannot reuse testnet required markers",
        {
          bscNetwork: "mainnet",
          routeReport: routeReport({ bscNetwork: "mainnet" }),
          peerAuditReport: peerAuditReport({ bscNetwork: "mainnet" }),
          smokeReadinessReport: smokeReadinessReport({ bscNetwork: "mainnet" }),
          materialInventoryReport: materialInventoryReport({
            bscNetwork: "mainnet",
            files: materialInventoryReport({ bscNetwork: "mainnet" }).files.map(
              (entry) =>
                entry.kind === "source-parity-attestation"
                  ? {
                      ...entry,
                      sourceParityAttestation: {
                        ...entry.sourceParityAttestation,
                        requiredMarkers: sourceParityRequiredMarkers("testnet"),
                      },
                    }
                  : entry,
            ),
          }),
          videoTranscript: videoTranscript({ bscNetwork: "mainnet" }),
        },
        /production material inventory source parity attestation file \d+ requiredMarkers are missing BSC_MAINNET_NATIVE_EVM_LOCAL_ADMISSION_BUILDER/u,
      ],
      [
        "source parity implementation hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "source-parity-attestation"
                ? {
                    ...entry,
                    sourceParityAttestation: {
                      ...entry.sourceParityAttestation,
                      sdks: {
                        ...entry.sourceParityAttestation.sdks,
                        javascript: {
                          ...entry.sourceParityAttestation.sdks.javascript,
                          expectedImplementationHash: HASH_77,
                          implementationHashMatches: false,
                        },
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory source parity attestation file \d+ SDK javascript implementationHash does not match expectedImplementationHash/u,
      ],
      [
        "source parity SDK match flag missing",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "source-parity-attestation"
                ? {
                    ...entry,
                    sourceParityAttestation: {
                      ...entry.sourceParityAttestation,
                      sdks: {
                        ...entry.sourceParityAttestation.sdks,
                        swift: {
                          ...entry.sourceParityAttestation.sdks.swift,
                          implementationHashMatches: false,
                        },
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory source parity attestation file \d+ SDK swift implementationHashMatches is not true/u,
      ],
      [
        "browser sidecar count drift",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              browserProverSidecars: 1,
            },
          }),
        },
        /production material inventory browser prover sidecar count does not match file summaries/u,
      ],
      [
        "unsupported browser sidecar file field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "browser-prover-sidecar"
                ? {
                    ...entry,
                    browserProverSidecar: {
                      ...entry.browserProverSidecar,
                      operatorNotes: "local",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory browser prover sidecar file \d+ contains unsupported field operatorNotes/u,
      ],
      [
        "browser sidecar summary on non-sidecar file",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    browserProverSidecar: materialInventoryReport().files.find(
                      (file) => file.kind === "browser-prover-sidecar",
                    )?.browserProverSidecar,
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary 0 carries browserProverSidecar for non-sidecar kind route/u,
      ],
      [
        "unsupported browser provers field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              fallback: { ok: true },
            },
          }),
        },
        /production material inventory browser provers contains unsupported field fallback/u,
      ],
      [
        "unsupported destination browser prover field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                localAttestation: true,
              },
            },
          }),
        },
        /production material inventory destination browser prover contains unsupported field localAttestation/u,
      ],
      [
        "unsupported browser prover module field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  sourceMap: "./source.js.map",
                },
              },
            },
          }),
        },
        /production material inventory source browser prover module contains unsupported field sourceMap/u,
      ],
      [
        "unsupported browser prover sidecar field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  verifierMaterial: "public verifier summary",
                },
              },
            },
          }),
        },
        /production material inventory destination browser prover sidecar contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported browser prover sidecar manifest field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: {
                    ...materialInventoryReport().browserProvers.source.sidecar
                      .manifest,
                    verifierMaterial: "public verifier summary",
                  },
                },
              },
            },
          }),
        },
        /production material inventory source browser prover manifest contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported browser prover sidecar deployment field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    deployment: {
                      ...deployment(),
                      operatorNotes: "local",
                    },
                  }),
                },
              },
            },
          }),
        },
        /production material inventory destination browser prover manifest deployment contains unsupported field operatorNotes/u,
      ],
      [
        "unsupported browser prover sidecar post-deploy field",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    postDeployLiveEvidence: {
                      ...postDeployLiveEvidence(),
                      receipt: "0x01",
                    },
                  }),
                },
              },
            },
          }),
        },
        /production material inventory source browser prover manifest postDeployLiveEvidence contains unsupported field receipt/u,
      ],
      [
        "unsupported runtime config wrapper field",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              rawConfig: {},
            },
          }),
        },
        /production material inventory runtime prover config contains unsupported field rawConfig/u,
      ],
      [
        "unsupported runtime config manifest secret field",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                grothProofMaterial: "public proof summary",
              },
            },
          }),
        },
        /production material inventory runtime prover config contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported runtime config section secret field",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  privateKeyMaterial: "public key summary",
                },
              },
            },
          }),
        },
        /production material inventory destination runtime prover config contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "duplicate material inventory route identity alias",
        {
          materialInventoryReport: materialInventoryReport({
            route_id: SCCP_BSC_XOR_ROUTE_ID,
          }),
        },
        /production material inventory routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "route deployment drift",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: deployment({ verifierAddress: BSC_BRIDGE_ADDRESS }),
            },
          }),
        },
        /production material inventory route verifierAddress does not match/u,
      ],
      [
        "route deployment duplicate native bundle alias",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: {
                ...materialInventoryReport().route.deployment,
                native_evm_prover_bundle_hash: HASH_99,
              },
            },
          }),
        },
        /production material inventory route nativeEvmProverBundleHash uses multiple aliases: nativeEvmProverBundleHash, native_evm_prover_bundle_hash/u,
      ],
      [
        "route deployment single TRON source bridge alias",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: {
                ...materialInventoryReport().route.deployment,
                sourceBridgeAddress: undefined,
                tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
              },
            },
          }),
        },
        /production material inventory route sourceBridgeAddress uses forbidden TRON aliases for BSC evidence: tron_source_bridge_address/u,
      ],
      [
        "BSC chain drift",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              bsc: {
                chainIdHex: "0x38",
                networkIdHex: BSC_TESTNET_NETWORK_ID_HEX,
              },
            },
          }),
        },
        /BSC chainIdHex does not match BSC testnet/u,
      ],
      [
        "route summary missing post-deploy evidence",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              postDeployLiveEvidence: null,
            },
          }),
        },
        /production material inventory route post-deploy evidence summary is missing/u,
      ],
      [
        "route summary post-deploy evidence drift",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              postDeployLiveEvidence: postDeployLiveEvidence({
                sourceEventTransactionId: HASH_77,
              }),
            },
          }),
        },
        /production material inventory route sourceEventTransactionId does not match/u,
      ],
      [
        "route file post-deploy evidence stripped",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry, index) =>
              index === 0
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      postDeployLiveEvidence: null,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes and post-deploy live evidence/u,
      ],
      [
        "file count missing",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              files: undefined,
            },
          }),
        },
        /production material inventory file count is missing or invalid/u,
      ],
      [
        "non-object file summary",
        {
          materialInventoryReport: (() => {
            const report = materialInventoryReport();
            return materialInventoryReport({
              counts: {
                ...report.counts,
                files: report.files.length + 1,
              },
              files: [...report.files, "not-a-summary"],
            });
          })(),
        },
        /production material inventory file summary \d+ is not an object/u,
      ],
      [
        "missing prover",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: { ok: false },
            },
          }),
        },
        /source browser prover is not ready/u,
      ],
      [
        "unsafe browser prover module URL",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  moduleUrl: "https://user:pass@example.com/prover.js",
                },
              },
            },
          }),
        },
        /destination browser prover moduleUrl must not include credentials/u,
      ],
      [
        "browser prover remote module URL forged as local inventory",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  moduleUrl: "https://cdn.example.invalid/sccp-bsc/prover.js",
                  path: "./public/sccp-bsc/destination.js",
                },
              },
            },
          }),
        },
        /destination browser prover moduleUrl must use a package-relative or public-local module URL/u,
      ],
      [
        "browser prover module path drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  moduleUrl: "./public/sccp-bsc/destination.js",
                  path: "./public/sccp-bsc/other-destination.js",
                },
              },
            },
          }),
        },
        /destination browser prover module path does not match moduleUrl/u,
      ],
      [
        "browser prover module URL with query string",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  moduleUrl: "/sccp-bsc/source.js?v=1",
                },
              },
            },
          }),
        },
        /source browser prover moduleUrl must not include query strings or fragments/u,
      ],
      [
        "browser prover module URL with double-encoded traversal",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  moduleUrl: "./public/sccp-bsc/%252e%252e/source.js",
                },
              },
            },
          }),
        },
        /source browser prover moduleUrl must not include parent directory segments/u,
      ],
      [
        "browser prover module URL with over-encoded traversal",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  moduleUrl:
                    "./public/sccp-bsc/%252525252e%252525252e/source.js",
                },
              },
            },
          }),
        },
        /source browser prover moduleUrl must not include parent directory segments/u,
      ],
      [
        "browser prover zero module hash",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  sha256: ZERO_HASH,
                },
              },
            },
          }),
        },
        /destination browser prover module sha256 is missing or invalid/u,
      ],
      [
        "browser prover nested module marked not ready",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  ok: false,
                },
              },
            },
          }),
        },
        /destination browser prover module summary is not ready/u,
      ],
      [
        "browser prover module smaller than production minimum",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  sizeBytes: 1,
                  ok: true,
                },
              },
            },
          }),
        },
        /destination browser prover module is smaller than the production browser prover minimum/u,
      ],
      [
        "browser prover module exceeds production maximum",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  sizeBytes: SCCP_BSC_BROWSER_MODULE_MAX_BYTES + 1,
                  ok: true,
                },
              },
            },
          }),
        },
        /source browser prover module exceeds the production browser prover maximum/u,
      ],
      [
        "browser prover missing sidecar hash",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  sha256: undefined,
                },
              },
            },
          }),
        },
        /source browser prover sidecar sha256 is missing or invalid/u,
      ],
      [
        "browser prover sidecar remote path",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  path: "https://cdn.example.invalid/source.js.manifest.json",
                },
              },
            },
          }),
        },
        /source browser prover sidecar path must be a repo-relative public path/u,
      ],
      [
        "browser prover sidecar public-root path",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  path: "/sccp-bsc/destination.js.manifest.json",
                },
              },
            },
          }),
        },
        /destination browser prover sidecar path must be a repo-relative public path/u,
      ],
      [
        "browser prover sidecar sibling-repo path",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  path: "../iroha/artifacts/sccp-bsc/destination.manifest.json",
                },
              },
            },
          }),
        },
        /destination browser prover sidecar path must be a repo-relative path under this repository/u,
      ],
      [
        "browser prover sidecar traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  path: "./public/sccp-bsc/../source.js.manifest.json",
                },
              },
            },
          }),
        },
        /source browser prover sidecar path must not include empty, current, or parent segments/u,
      ],
      [
        "browser prover sidecar path drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  path: "./public/sccp-bsc/source-other.js.manifest.json",
                },
              },
            },
          }),
        },
        /source browser prover sidecar path does not match module path/u,
      ],
      [
        "browser prover nested sidecar marked not ready",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  ok: false,
                },
              },
            },
          }),
        },
        /source browser prover sidecar summary is not ready/u,
      ],
      [
        "browser prover sidecar exceeds production manifest maximum",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  sizeBytes: SCCP_BSC_BROWSER_MANIFEST_MAX_BYTES + 1,
                  ok: true,
                },
              },
            },
          }),
        },
        /destination browser prover sidecar exceeds the production manifest maximum/u,
      ],
      [
        "browser prover sidecar module hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  moduleSha256: HASH_77,
                },
              },
            },
          }),
        },
        /destination browser prover sidecar moduleSha256 does not match module sha256/u,
      ],
      [
        "browser prover sidecar manifest stripped",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: null,
                },
              },
            },
          }),
        },
        /source browser prover sidecar manifest summary is missing/u,
      ],
      [
        "browser prover sidecar source/destination swap",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("source", {
                    moduleUrl: "./public/sccp-bsc/destination.js",
                    moduleSha256: HASH_11,
                    acceptedExport: "bscSccpProve",
                  }),
                },
              },
            },
          }),
        },
        /destination browser prover manifest direction is invalid/u,
      ],
      [
        "browser prover sidecar accepted export drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    acceptedExport: "bscSccpProve",
                  }),
                },
              },
            },
          }),
        },
        /source browser prover manifest acceptedExport is invalid/u,
      ],
      [
        "browser prover sidecar accepted self-test export drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    acceptedSelfTestExport: "bscSccpNativeProverSelfTest",
                  }),
                },
              },
            },
          }),
        },
        /source browser prover manifest acceptedSelfTestExport is invalid/u,
      ],
      [
        "browser prover sidecar BSC profile drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    bscNetwork: "mainnet",
                    moduleUrl: "./public/sccp-bsc/destination.js",
                    moduleSha256: HASH_11,
                  }),
                },
              },
            },
          }),
        },
        /destination browser prover manifest is not bound to BSC testnet chain id/u,
      ],
      [
        "browser prover sidecar deployment drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    deployment: deployment({
                      bridgeAddress: BSC_TOKEN_ADDRESS,
                    }),
                  }),
                },
              },
            },
          }),
        },
        /source browser prover manifest deployment bridgeAddress does not match route deployment/u,
      ],
      [
        "browser prover sidecar single TRON verifier alias",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    deployment: {
                      ...deployment({ verifierAddress: undefined }),
                      sccp_tron_destination_verifier_address:
                        BSC_VERIFIER_ADDRESS,
                    },
                  }),
                },
              },
            },
          }),
        },
        /source browser prover manifest deployment verifierAddress uses forbidden TRON aliases for BSC evidence: sccp_tron_destination_verifier_address/u,
      ],
      [
        "browser prover sidecar post-deploy evidence drift",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    postDeployLiveEvidence: postDeployLiveEvidence({
                      routeCanaryTransactionId: HASH_55,
                    }),
                  }),
                },
              },
            },
          }),
        },
        /destination browser prover manifest routeCanaryTransactionId does not match/u,
      ],
      [
        "browser prover sidecar duplicate post-deploy alias",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              source: {
                ...materialInventoryReport().browserProvers.source,
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    postDeployLiveEvidence: {
                      ...postDeployLiveEvidence(),
                      source_event_transaction_url:
                        postDeployLiveEvidence().sourceEventExplorerUrl,
                    },
                  }),
                },
              },
            },
          }),
        },
        /source browser prover manifest sourceEventExplorerUrl uses multiple aliases/u,
      ],
      [
        "browser prover sidecar duplicate route identity alias",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    asset_key: SCCP_BSC_XOR_ASSET_KEY,
                  }),
                },
              },
            },
          }),
        },
        /destination browser prover manifest assetKey uses multiple aliases: assetKey, asset_key/u,
      ],
      [
        "missing native prover bundle count",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionNativeProverBundles: 0,
            },
          }),
        },
        /no native EVM prover bundle/u,
      ],
      [
        "stale inventory missing material scan completeness check",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.filter(
              (entry) => entry.id !== "material-scan-complete",
            ),
          }),
        },
        /missing passing material-scan-complete check/u,
      ],
      [
        "stale inventory missing required check",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.filter(
              (entry) => entry.id !== "runtime-prover-config",
            ),
          }),
        },
        /missing passing runtime-prover-config check/u,
      ],
      [
        "stale inventory missing runbook contract",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.filter(
              (entry) => entry.id !== "material-inventory-runbook-contract",
            ),
          }),
        },
        /missing passing material-inventory-runbook-contract check/u,
      ],
      [
        "runtime config omitted",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: null,
          }),
        },
        /runtime prover config is not ready/u,
      ],
      [
        "runtime config falsely marked not required while carrying inventory material",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              required: false,
            },
          }),
        },
        /runtime prover config claims it is not required but carries runtime config material/u,
      ],
      [
        "runtime config falsely marked not required for checked-in runtime inventory module",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                },
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                    bscNetwork: "testnet",
                    moduleSha256: HASH_11,
                  }),
                },
              },
              source: {
                ...materialInventoryReport().browserProvers.source,
                module: {
                  ...materialInventoryReport().browserProvers.source.module,
                  moduleUrl: "./public/sccp-bsc/taira-bsc-xor-prover.js",
                },
                sidecar: {
                  ...materialInventoryReport().browserProvers.source.sidecar,
                  manifest: inventorySidecarManifest("source", {
                    moduleUrl: "./public/sccp-bsc/taira-bsc-xor-prover.js",
                    bscNetwork: "testnet",
                    moduleSha256: HASH_33,
                  }),
                },
              },
            },
            runtimeProverConfig: {
              ok: true,
              required: false,
              configUrl: null,
              manifest: null,
            },
          }),
        },
        /runtime prover config claims it is not required while a checked-in runtime prover module is selected/u,
      ],
      [
        "runtime config required flag omitted for checked-in runtime inventory module",
        {
          materialInventoryReport: materialInventoryReport({
            browserProvers: {
              ...materialInventoryReport().browserProvers,
              destination: {
                ...materialInventoryReport().browserProvers.destination,
                module: {
                  ...materialInventoryReport().browserProvers.destination
                    .module,
                  moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                },
                sidecar: {
                  ...materialInventoryReport().browserProvers.destination
                    .sidecar,
                  manifest: inventorySidecarManifest("destination", {
                    moduleUrl: SCCP_BSC_RUNTIME_PROVER_MODULE_URL,
                    bscNetwork: "testnet",
                    moduleSha256: HASH_11,
                  }),
                },
              },
            },
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              required: undefined,
            },
          }),
        },
        /runtime prover config is not explicitly marked required while a checked-in runtime prover module is selected/u,
      ],
      [
        "runtime config wrong route",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                routeId: "wrong_route",
              },
            },
          }),
        },
        /runtime prover config is for the wrong SCCP route/u,
      ],
      [
        "runtime config duplicate route identity alias",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                route_id: SCCP_BSC_XOR_ROUTE_ID,
              },
            },
          }),
        },
        /production material inventory runtime prover config routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "runtime config unsupported top-level field",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                operatorPrivateKey: "0x" + "11".repeat(32),
              },
            },
          }),
        },
        /production material inventory runtime prover config contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "runtime config unsupported direction field",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  customData: {
                    privateKey: "0x" + "22".repeat(32),
                  },
                },
              },
            },
          }),
        },
        /source runtime prover config contains unsupported field customData/u,
      ],
      [
        "runtime config rejects duplicate backend self-contained alias",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  backend_self_contained: true,
                },
              },
            },
          }),
        },
        /destination runtime prover config contains unsupported field backend_self_contained/u,
      ],
      [
        "runtime config rejects duplicate backend self-test export alias",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  backend_accepted_self_test_export:
                    "bscSccpProveSelfTestAccepted",
                },
              },
            },
          }),
        },
        /destination runtime prover config contains unsupported field backend_accepted_self_test_export/u,
      ],
      [
        "runtime config rejects duplicate verifier artifact alias",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  verifier_key_sha256: HASH_22,
                },
              },
            },
          }),
        },
        /source runtime prover config contains unsupported field verifier_key_sha256/u,
      ],
      [
        "runtime config TAIRA chain id drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                tairaChainId: "00000000-0000-0000-0000-000000000000",
              },
            },
          }),
        },
        /runtime prover config is not bound to TAIRA chain id/u,
      ],
      [
        "runtime config TAIRA network prefix drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                tairaNetworkPrefix: 753,
              },
            },
          }),
        },
        /runtime prover config is not bound to TAIRA network prefix/u,
      ],
      [
        "runtime config proof hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  proofArtifactSha256: HASH_77,
                },
              },
            },
          }),
        },
        /destination runtime prover config proofArtifactSha256 does not match route proofArtifactHash/u,
      ],
      [
        "runtime config verifier hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  verifierKeySha256: HASH_77,
                },
              },
            },
          }),
        },
        /source runtime prover config verifierKeySha256 does not match route verifierKeyArtifactHash/u,
      ],
      [
        "runtime config missing native bundle hash",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  nativeProverBundleSha256: undefined,
                },
              },
            },
          }),
        },
        /destination runtime prover config nativeProverBundleSha256 is missing or invalid/u,
      ],
      [
        "runtime config descriptor hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  nativeEvmProverBundleHash: HASH_77,
                },
              },
            },
          }),
        },
        /source runtime prover config nativeEvmProverBundleHash does not match route nativeEvmProverBundleHash/u,
      ],
      [
        "runtime config missing descriptor hash",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  nativeEvmProverBundleHash: undefined,
                },
              },
            },
          }),
        },
        /destination runtime prover config nativeEvmProverBundleHash is missing or invalid/u,
      ],
      [
        "runtime config missing verified native SDK",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  nativeProverVerifiedSdks:
                    SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS.filter(
                      (sdk) => sdk !== "dotnet",
                    ),
                },
              },
            },
          }),
        },
        /destination runtime prover config nativeProverVerifiedSdks is missing dotnet/u,
      ],
      [
        "runtime config unsafe native artifact base URL",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  nativeProverArtifactBaseUrl:
                    "https://user:pass@example.com/native/",
                },
              },
            },
          }),
        },
        /source runtime prover config nativeProverArtifactBaseUrl must not include credentials/u,
      ],
      [
        "runtime config zero backend hash",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  backendModuleSha256: ZERO_HASH,
                },
              },
            },
          }),
        },
        /source runtime prover config backendModuleSha256 is missing or invalid/u,
      ],
      [
        "runtime config missing backend self-contained attestation",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  backendSelfContained: false,
                },
              },
            },
          }),
        },
        /source runtime prover config backendSelfContained is not true/u,
      ],
      [
        "runtime config source backend export swapped with destination export",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  backendAcceptedExport: "bscSccpProve",
                },
              },
            },
          }),
        },
        /source runtime prover config backendAcceptedExport is invalid/u,
      ],
      [
        "runtime config destination native self-test export stripped",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  backendAcceptedSelfTestExport: "",
                },
              },
            },
          }),
        },
        /destination runtime prover config backendAcceptedSelfTestExport is invalid/u,
      ],
      [
        "runtime config forged config hash",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              sha256: "not-a-hash",
            },
          }),
        },
        /runtime prover config hash is missing/u,
      ],
      [
        "runtime config local path omitted",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              path: "",
            },
          }),
        },
        /runtime prover config path is missing/u,
      ],
      [
        "runtime config local path traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              path: "./public/sccp-bsc/../taira-bsc-xor-prover.config.json",
            },
          }),
        },
        /runtime prover config path must not include empty, current, or parent segments/u,
      ],
      [
        "runtime config local path drift",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              path: "./public/sccp-bsc/other-runtime.config.json",
            },
          }),
        },
        /runtime prover config path does not match configUrl/u,
      ],
      [
        "runtime config remote URL carries local path",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              configUrl:
                "https://cdn.example.invalid/sccp-bsc/taira-bsc-xor-prover.config.json",
              path: "./public/sccp-bsc/taira-bsc-xor-prover.config.json",
            },
          }),
        },
        /runtime prover config path must be empty for remote configUrl/u,
      ],
      [
        "runtime config URL with credentials",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              configUrl: "https://user:pass@example.com/config.json",
            },
          }),
        },
        /runtime prover config URL must not include credentials/u,
      ],
      [
        "runtime config URL with double-encoded traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              configUrl:
                "/sccp-bsc/%252e%252e/taira-bsc-xor-prover.config.json",
            },
          }),
        },
        /runtime prover config URL must not include parent directory segments/u,
      ],
      [
        "runtime config URL with over-encoded traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              configUrl:
                "/sccp-bsc/%252525252e%252525252e/taira-bsc-xor-prover.config.json",
            },
          }),
        },
        /runtime prover config URL must not include parent directory segments/u,
      ],
      [
        "missing file summaries",
        {
          materialInventoryReport: materialInventoryReport({
            files: undefined,
          }),
        },
        /production material inventory file summaries are missing/u,
      ],
      [
        "file count overstated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              files: materialInventoryReport().files.length + 1,
            },
          }),
        },
        /file summaries do not cover the reported file count/u,
      ],
      [
        "file count understated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              files: materialInventoryReport().files.length - 1,
            },
          }),
        },
        /file summaries exceed the reported file count/u,
      ],
      [
        "hidden critical file finding",
        {
          materialInventoryReport: materialInventoryReport({
            files: [
              ...materialInventoryReport().files,
              {
                path: "./output/sccp-bsc-production/notes.json",
                kind: "operator-note",
                sizeBytes: 128,
                sha256: HASH_77,
                findings: [
                  {
                    severity: "critical",
                    code: "unbound-production-material",
                    message: "critical finding hidden outside selected files",
                  },
                ],
              },
            ],
            counts: {
              ...materialInventoryReport().counts,
              files: materialInventoryReport().files.length + 1,
              criticalFindings: 0,
            },
          }),
        },
        /critical finding count does not match file summaries/u,
      ],
      [
        "hidden warning file finding",
        {
          materialInventoryReport: materialInventoryReport({
            files: [
              ...materialInventoryReport().files,
              {
                path: "./output/sccp-bsc-production/operator-warning.json",
                kind: "operator-note",
                sizeBytes: 128,
                sha256: HASH_77,
                findings: [
                  {
                    severity: "warning",
                    code: "standalone-browser-prover-module",
                    message: "warning finding hidden outside selected files",
                  },
                ],
              },
            ],
            counts: {
              ...materialInventoryReport().counts,
              files: materialInventoryReport().files.length + 1,
              warningFindings: 0,
            },
          }),
        },
        /warning finding count does not match file summaries/u,
      ],
      [
        "route artifact count overstated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionRouteArtifacts: 2,
            },
          }),
        },
        /production-ready route artifact count does not match file summaries/u,
      ],
      [
        "verifier artifact count missing",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionVerifierArtifacts: undefined,
            },
          }),
        },
        /production verifier artifact count is missing or invalid/u,
      ],
      [
        "verifier summary missing G2 material validation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      g2MaterialValid: undefined,
                      g2MaterialProblems: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "verifier summary marks invalid G1 material",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      g1MaterialValid: false,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "verifier summary hides non-empty material problems",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      g1MaterialProblems: [
                        "verifier.alpha1 must be on the BN254 G1 curve",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "verifier summary missing expected route hash",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      expectedVerifierKeyHash: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "verifier summary expected route hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      expectedVerifierKeyHash: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "native prover bundle count overstated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionNativeProverBundles: 2,
            },
          }),
        },
        /native EVM prover bundle count does not match file summaries/u,
      ],
      [
        "proof artifact count overstated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              proofArtifacts: 2,
            },
          }),
        },
        /proof artifact file count does not match file summaries/u,
      ],
      [
        "proving key count overstated",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              provingKeys: 2,
            },
          }),
        },
        /proving key file count does not match file summaries/u,
      ],
      [
        "material file summary missing path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact" ? { ...entry, path: "" } : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path is missing/u,
      ],
      [
        "material file summary duplicate path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proving-key"
                ? {
                    ...entry,
                    path: materialInventoryReport().files.find(
                      (candidate) => candidate.kind === "proof-artifact",
                    ).path,
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path duplicates file summary \d+/u,
      ],
      [
        "material file summary path without repo prefix",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    path: "output/sccp-bsc-production/proof-artifact.r1cs",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path must start with \.\/ or \.\.\/iroha\//u,
      ],
      [
        "material file summary absolute path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    path: "/tmp/proof-artifact.r1cs",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path must be a repo-relative public path/u,
      ],
      [
        "material file summary backslash path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    path: ".\\output\\sccp-bsc-production\\proof-artifact.r1cs",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path must be a repo-relative public path/u,
      ],
      [
        "material file summary traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    path: "./output/sccp-bsc-production/../proof-artifact.r1cs",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path must not include empty, current, or parent segments/u,
      ],
      [
        "material file summary encoded traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    path: "./output/%2e%2e/proof-artifact.r1cs",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ path must not use percent-encoded segments/u,
      ],
      [
        "Groth16 attestation request manifest traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-attestation-request-package"
                ? {
                    ...entry,
                    groth16AttestationRequestPackage: {
                      ...entry.groth16AttestationRequestPackage,
                      manifestPath:
                        "../outside/taira-bsc-groth16-material.manifest.json",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 attestation request package file \d+ manifestPath path must not include empty, current, or parent segments/u,
      ],
      [
        "Groth16 proof self-test manifest encoded traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-proof-self-test-report"
                ? {
                    ...entry,
                    groth16ProofSelfTestReport: {
                      ...entry.groth16ProofSelfTestReport,
                      manifestPath:
                        "native-prover/%2e%2e/taira-bsc-groth16-material.manifest.json",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 proof self-test report file \d+ manifestPath path must not use percent-encoded segments/u,
      ],
      [
        "Groth16 handoff request traversal path",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-attestation-handoff"
                ? {
                    ...entry,
                    groth16AttestationHandoff: {
                      ...entry.groth16AttestationHandoff,
                      attestationRequestPath:
                        "../outside/taira-bsc-groth16-attestation-request.json",
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 attestation handoff file \d+ attestationRequestPath path must not include empty, current, or parent segments/u,
      ],
      [
        "Groth16 handoff impossible readiness",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-attestation-handoff"
                ? {
                    ...entry,
                    groth16AttestationHandoff: {
                      ...entry.groth16AttestationHandoff,
                      signingReady: true,
                      allRolesReady: false,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 attestation handoff file \d+ signingReady cannot be true while allRolesReady is false/u,
      ],
      [
        "Groth16 handoff count drift",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              routeBoundGroth16AttestationHandoffs: 0,
            },
          }),
        },
        /production material inventory Groth16 attestation handoff count does not match file summaries/u,
      ],
      [
        "Groth16 material blocker array count mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-material-manifest"
                ? {
                    ...entry,
                    groth16MaterialManifest: {
                      ...entry.groth16MaterialManifest,
                      productionBlockers: [
                        "trusted setup transcript contributors must record at least 2",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 material manifest file \d+ productionBlockers count does not match productionBlockerCount/u,
      ],
      [
        "Groth16 material blocker summary wrong type",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-material-manifest"
                ? {
                    ...entry,
                    groth16MaterialManifest: {
                      ...entry.groth16MaterialManifest,
                      productionBlockerSummary: {
                        operatorOverride: "hide unready ceremony",
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 material manifest file \d+ productionBlockerSummary must be a string/u,
      ],
      [
        "Groth16 proof self-test blocker array count mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-proof-self-test-report"
                ? {
                    ...entry,
                    groth16ProofSelfTestReport: {
                      ...entry.groth16ProofSelfTestReport,
                      manifestProductionBlockers: [
                        "stale report generated before audit",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 proof self-test report file \d+ manifestProductionBlockers count does not match manifestProductionBlockerCount/u,
      ],
      [
        "Groth16 proof self-test blocker summary wrong type",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "groth16-proof-self-test-report"
                ? {
                    ...entry,
                    groth16ProofSelfTestReport: {
                      ...entry.groth16ProofSelfTestReport,
                      manifestProductionBlockerSummary: {
                        operatorOverride: "hide stale proof self-test",
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory Groth16 proof self-test report file \d+ manifestProductionBlockerSummary must be a string/u,
      ],
      [
        "material file summary unsupported top-level field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    operatorNote: "unreviewed proof artifact override",
                  }
                : entry,
            ),
          }),
        },
        /production material inventory file summary \d+ contains unsupported field operatorNote/u,
      ],
      [
        "route file unsupported field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      hiddenDeploymentOverride: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory route file 0 contains unsupported field hiddenDeploymentOverride/u,
      ],
      [
        "verifier file unsupported field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      hiddenVerifierOverride: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory verifier file \d+ contains unsupported field hiddenVerifierOverride/u,
      ],
      [
        "native bundle file unsupported field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      hiddenNativeBundleOverride: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory native prover bundle file \d+ contains unsupported field hiddenNativeBundleOverride/u,
      ],
      [
        "compiled contract artifact unsupported field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "contract-artifact" &&
              entry.contractArtifact?.key === "bridge"
                ? {
                    ...entry,
                    contractArtifact: {
                      ...entry.contractArtifact,
                      hiddenBytecodeOverride: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory compiled contract artifact file \d+ contains unsupported field hiddenBytecodeOverride/u,
      ],
      [
        "compiled contract artifact invalid summary",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "contract-artifact" &&
              entry.contractArtifact?.key === "bridge"
                ? {
                    ...entry,
                    contractArtifact: {
                      ...entry.contractArtifact,
                      valid: false,
                      bytecodeSha256: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /compiled contract artifact file \d+ is not valid|missing clean compiled contract artifacts: bridge/u,
      ],
      [
        "compiled verifier artifact runtime keccak drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "contract-artifact" &&
              entry.contractArtifact?.key === "verifier"
                ? {
                    ...entry,
                    contractArtifact: {
                      ...entry.contractArtifact,
                      deployedBytecodeKeccak256: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /verifier compiled contract runtime bytecode keccak does not match public route verifierCodeHash/u,
      ],
      [
        "compiled contract artifact missing keccak summary",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "contract-artifact" &&
              entry.contractArtifact?.key === "sourceBridge"
                ? {
                    ...entry,
                    contractArtifact: {
                      ...entry.contractArtifact,
                      deployedBytecodeKeccak256: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /compiled contract artifact file \d+ deployedBytecodeKeccak256 is missing or invalid|missing clean compiled contract artifacts: sourceBridge/u,
      ],
      [
        "proof file unsupported field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      hiddenProofOverride: HASH_77,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory proof file \d+ contains unsupported field hiddenProofOverride/u,
      ],
      [
        "route file native bundle hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      nativeEvmProverBundleHash: HASH_77,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes/u,
      ],
      [
        "route file BSC bridge address drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      bridgeAddress:
                        "0x1234567890abcdef1234567890abcdef12345678",
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes/u,
      ],
      [
        "route file explorer binding stripped",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      explorerUrl: undefined,
                      explorerHost: undefined,
                      explorerBindingMatches: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes/u,
      ],
      [
        "route file explorer binding drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      explorerUrl: "https://bscscan.com",
                      explorerHost: "bscscan.com",
                      explorerBindingMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes/u,
      ],
      [
        "route file explorer match flag false",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      explorerBindingMatches: false,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean route file summary bound to the public route deployment hashes/u,
      ],
      [
        "route file duplicate route identity alias",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      route_id: SCCP_BSC_XOR_ROUTE_ID,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory route file 0 routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "route file duplicate proof hash alias",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "route"
                ? {
                    ...entry,
                    route: {
                      ...entry.route,
                      proof_artifact_hash: entry.route.proofArtifactHash,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory route file 0 proofArtifactHash uses multiple aliases: proofArtifactHash, proof_artifact_hash/u,
      ],
      [
        "verifier file hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      verifierKeyHash: HASH_77,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean verifier file summary bound to the public route verifierKeyHash/u,
      ],
      [
        "verifier file duplicate hash alias",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "verifier"
                ? {
                    ...entry,
                    verifier: {
                      ...entry.verifier,
                      verifier_key_hash: entry.verifier.verifierKeyHash,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory verifier file \d+ verifierKeyHash uses multiple aliases: verifierKeyHash, verifier_key_hash/u,
      ],
      [
        "native bundle file not SDK verified",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      artifactsVerified: false,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment/u,
      ],
      [
        "native bundle file omits audit hash production summary",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      auditHashesProduction: undefined,
                      auditHashIssueCount: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment/u,
      ],
      [
        "native bundle file has placeholder audit hashes",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      auditHashesProduction: false,
                      auditHashIssueCount: 1,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment/u,
      ],
      [
        "native bundle file descriptor hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      nativeEvmProverBundleHash: HASH_77,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment/u,
      ],
      [
        "native bundle file duplicate descriptor hash alias",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      native_evm_prover_bundle_hash:
                        entry.nativeProverBundle.nativeEvmProverBundleHash,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory native prover bundle file \d+ nativeEvmProverBundleHash uses multiple aliases: nativeEvmProverBundleHash, native_evm_prover_bundle_hash/u,
      ],
      [
        "native bundle file collides verifier artifact hash with proof artifact hash",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      verifierKeyArtifactHash:
                        entry.nativeProverBundle.proofArtifactHash,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory native prover bundle file \d+ proofArtifactHash must not equal verifierKeyArtifactHash/u,
      ],
      [
        "native bundle file collides proof self-test hash with proving key hash",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      groth16ProofSelfTestHash:
                        entry.nativeProverBundle.provingKeyHash,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production material inventory native prover bundle file \d+ groth16ProofSelfTestHash must not equal provingKeyHash/u,
      ],
      [
        "native bundle file descriptor hash omitted",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      nativeEvmProverBundleHash: undefined,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment/u,
      ],
      [
        "native bundle file BSC profile drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      chain: "bsc-mainnet",
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment, BSC profile, and required SDK attestations/u,
      ],
      [
        "native bundle file domain drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      domain: 1,
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment, BSC profile, and required SDK attestations/u,
      ],
      [
        "native bundle file missing SDK attestation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      verifiedSdks: SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS.filter(
                        (sdk) => sdk !== "swift",
                      ),
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment, BSC profile, and required SDK attestations/u,
      ],
      [
        "native bundle file duplicate SDK attestation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "native-prover-bundle"
                ? {
                    ...entry,
                    nativeProverBundle: {
                      ...entry.nativeProverBundle,
                      verifiedSdks: [
                        ...SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS,
                        SCCP_BSC_REQUIRED_NATIVE_PROVER_SDKS[0],
                      ],
                      publicDeploymentMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean native EVM prover bundle file summary bound to the public route deployment, BSC profile, and required SDK attestations/u,
      ],
      [
        "proof artifact file is fixture-shaped",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      productionEntropy: false,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proof artifact file summary bound to the public route proofArtifactHash/u,
      ],
      [
        "proof artifact file missing expected route hash",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      expectedHash: undefined,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proof artifact file summary bound to the public route proofArtifactHash/u,
      ],
      [
        "proof artifact file expected route hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      expectedHash: HASH_77,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proof artifact file summary bound to the public route proofArtifactHash/u,
      ],
      [
        "proof artifact file lacks production format attestation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      productionFormat: false,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proof artifact file summary bound to the public route proofArtifactHash/u,
      ],
      [
        "proving key file lacks production format attestation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proving-key"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      productionFormat: false,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proving key file summary bound to the public route provingKeyHash/u,
      ],
      [
        "proving key file expected route hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proving-key"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      expectedHash: HASH_77,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proving key file summary bound to the public route provingKeyHash/u,
      ],
      [
        "proof artifact file exceeds production max size",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proof-artifact"
                ? {
                    ...entry,
                    sizeBytes: SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES + 1,
                    proofFile: {
                      ...entry.proofFile,
                      productionMaxSized: true,
                      maxSizeBytes: SCCP_BSC_PRODUCTION_PROOF_FILE_MAX_BYTES,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proof artifact file summary bound to the public route proofArtifactHash/u,
      ],
      [
        "proving key file lacks production max-size attestation",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "proving-key"
                ? {
                    ...entry,
                    proofFile: {
                      ...entry.proofFile,
                      productionMaxSized: false,
                      hashMatchesPublicRoute: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /no clean proving key file summary bound to the public route provingKeyHash/u,
      ],
      [
        "runtime material URL with parent traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  proofArtifactUrl: "../proof-artifact.r1cs",
                },
              },
            },
          }),
        },
        /proofArtifactUrl must not include parent directory/u,
      ],
      [
        "runtime material URL with double-encoded parent traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  proofArtifactUrl: ".%252e/proof-artifact.r1cs",
                },
              },
            },
          }),
        },
        /proofArtifactUrl must not include parent directory/u,
      ],
      [
        "runtime material URL with over-encoded parent traversal",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  proofArtifactUrl: ".%252525252e/proof-artifact.r1cs",
                },
              },
            },
          }),
        },
        /proofArtifactUrl must not include parent directory/u,
      ],
      [
        "runtime material URL with query string",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                source: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .source,
                  provingKeyUrl: "/sccp-bsc/source-proving-key.zkey?v=1",
                },
              },
            },
          }),
        },
        /provingKeyUrl must not include query strings or fragments/u,
      ],
      [
        "runtime material URL with unsupported scheme",
        {
          materialInventoryReport: materialInventoryReport({
            runtimeProverConfig: {
              ...materialInventoryReport().runtimeProverConfig,
              manifest: {
                ...materialInventoryReport().runtimeProverConfig.manifest,
                destination: {
                  ...materialInventoryReport().runtimeProverConfig.manifest
                    .destination,
                  backendModuleUrl: "ftp://example.com/backend.js",
                },
              },
            },
          }),
        },
        /backendModuleUrl must be a public path, package-relative path, HTTPS URL, or loopback HTTP URL/u,
      ],
      [
        "production requirements contract hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "production-requirements"
                ? {
                    ...entry,
                    productionRequirements: {
                      ...entry.productionRequirements,
                      contractHash: HASH_77,
                      contractMatchesExpected: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production requirements file \d+ contractHash does not match the expected BSC testnet requirements contract/u,
      ],
      [
        "production requirements input count drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "production-requirements"
                ? {
                    ...entry,
                    productionRequirements: {
                      ...entry.productionRequirements,
                      inputCount: 19,
                      contractMatchesExpected: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /production requirements file \d+ inputCount must be 41/u,
      ],
      [
        "TAIRA burn-record contract route binding spoof",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "taira-burn-record-contract"
                ? {
                    ...entry,
                    tairaBurnRecordContract: {
                      ...entry.tairaBurnRecordContract,
                      artifactSha256: HASH_77,
                      routeArtifactHashMatches: true,
                    },
                  }
                : entry,
            ),
          }),
        },
        /TAIRA burn-record contract file \d+ routeArtifactHashMatches does not match scanned route summaries/u,
      ],
      [
        "TAIRA burn-record contract count drift",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              productionTairaBurnRecordContracts: 0,
            },
          }),
        },
        /TAIRA burn-record contract count does not match file summaries/u,
      ],
      [
        "missing deployment evidence check",
        {
          materialInventoryReport: materialInventoryReport({
            checks: materialInventoryReport().checks.filter(
              (entry) => entry.id !== "deployment-evidence-artifact",
            ),
          }),
        },
        /missing passing deployment-evidence-artifact check/u,
      ],
      [
        "missing deployment evidence artifact",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              files: materialInventoryReport().counts.files - 1,
              relevantFilesSeen:
                materialInventoryReport().counts.relevantFilesSeen - 1,
              productionDeploymentEvidenceArtifacts: 0,
            },
            files: materialInventoryReport().files.filter(
              (entry) => entry.kind !== "deployment-evidence",
            ),
          }),
        },
        /has no clean BSC deployment evidence artifact bound to the public route deployment/u,
      ],
      [
        "deployment evidence binding key drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      destinationBindingKey:
                        "evm:0:2:0000000000000000000000000000000000000000000000000000000000000061:0x1111111111111111111111111111111111111111:0x2222222222222222222222222222222222222222:0x3333333333333333333333333333333333333333333333333333333333333333:0x4444444444444444444444444444444444444444444444444444444444444444",
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ destinationBindingKey does not match public route deployment/u,
      ],
      [
        "deployment evidence public route mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      publicDeploymentMatches: false,
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ publicDeploymentMatches is not true/u,
      ],
      [
        "deployment evidence destination version drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      destinationRolloutVersion: 2,
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ destinationRolloutVersion must be 1/u,
      ],
      [
        "deployment evidence missing post-deploy checklist",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      postDeployChecklist: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ postDeployChecklist is missing or invalid/u,
      ],
      [
        "deployment evidence forged post-deploy checklist",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      postDeployChecklist: [
                        ...entry.deploymentEvidence.postDeployChecklist,
                        "Explorer screenshot checked manually",
                      ],
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ postDeployChecklist contains unsupported item Explorer screenshot checked manually/u,
      ],
      [
        "deployment evidence missing readback summary",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      bscContractReadback: undefined,
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback summary is missing/u,
      ],
      [
        "deployment evidence readback target address drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      bscContractReadback: {
                        ...entry.deploymentEvidence.bscContractReadback,
                        tokenAddress:
                          "0x1234567890abcdef1234567890abcdef12345678",
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback\.tokenAddress does not match public route deployment/u,
      ],
      [
        "deployment evidence false verifier code readback",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      bscContractReadback: {
                        ...entry.deploymentEvidence.bscContractReadback,
                        codePresent: {
                          ...entry.deploymentEvidence.bscContractReadback
                            .codePresent,
                          verifier: false,
                        },
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback\.codePresent\.verifier must be true/u,
      ],
      [
        "deployment evidence compiled code hash mismatch",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      compiledContractCodeHashes: {
                        ...entry.deploymentEvidence.compiledContractCodeHashes,
                        sourceBridge: HASH_66,
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ compiledContractCodeHashes\.sourceBridge does not match bscContractReadback\.codeHashes\.sourceBridge/u,
      ],
      [
        "deployment evidence verifier readback code hash drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      compiledContractCodeHashes: {
                        ...entry.deploymentEvidence.compiledContractCodeHashes,
                        verifier: HASH_66,
                      },
                      bscContractReadback: {
                        ...entry.deploymentEvidence.bscContractReadback,
                        codeHashes: {
                          ...entry.deploymentEvidence.bscContractReadback
                            .codeHashes,
                          verifier: HASH_66,
                        },
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback\.codeHashes\.verifier does not match public route deployment verifierCodeHash/u,
      ],
      [
        "deployment evidence verifier contract readback drift",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      bscContractReadback: {
                        ...entry.deploymentEvidence.bscContractReadback,
                        verifierKeyHash: HASH_77,
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback\.verifierKeyHash does not match public route deployment/u,
      ],
      [
        "deployment evidence unsupported readback field",
        {
          materialInventoryReport: materialInventoryReport({
            files: materialInventoryReport().files.map((entry) =>
              entry.kind === "deployment-evidence"
                ? {
                    ...entry,
                    deploymentEvidence: {
                      ...entry.deploymentEvidence,
                      bscContractReadback: {
                        ...entry.deploymentEvidence.bscContractReadback,
                        rawReceipt: "0x01",
                      },
                    },
                  }
                : entry,
            ),
          }),
        },
        /deployment evidence file \d+ bscContractReadback contains unsupported field rawReceipt/u,
      ],
      [
        "critical findings",
        {
          materialInventoryReport: materialInventoryReport({
            counts: {
              ...materialInventoryReport().counts,
              criticalFindings: 1,
            },
          }),
        },
        /critical findings/u,
      ],
    ];

    for (const [name, overrides, detail, topLevelCheckId] of cases) {
      const report = evaluate(overrides);
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "production-material-inventory")?.detail,
        name,
      ).toMatch(detail);
      if (topLevelCheckId) {
        expect(failedCheck(report, topLevelCheckId)?.detail, name).toMatch(
          detail,
        );
      }
    }
  });

  it("rejects video transcripts bound to different readiness evidence", () => {
    const futureCheckedAt = new Date(NOW_MS + 60_000).toISOString();
    const cases = [
      [
        "route deployment drift",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              deployment: deployment({ bridgeAddress: BSC_TOKEN_ADDRESS }),
            },
          },
        }),
        /video route bridgeAddress does not match/u,
      ],
      [
        "route deployment duplicate token alias",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              deployment: {
                ...videoTranscript().readinessBinding.route.deployment,
                bsc_token_address: BSC_TOKEN_ADDRESS,
              },
            },
          },
        }),
        /video route tokenAddress uses multiple aliases: tokenAddress, bsc_token_address/u,
      ],
      [
        "route deployment single TRON source bridge alias",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              deployment: {
                ...videoTranscript().readinessBinding.route.deployment,
                sourceBridgeAddress: undefined,
                sccp_tron_source_bridge_address: BSC_SOURCE_BRIDGE_ADDRESS,
              },
            },
          },
        }),
        /video route sourceBridgeAddress uses forbidden TRON aliases for BSC evidence: sccp_tron_source_bridge_address/u,
      ],
      [
        "route duplicate route identity alias",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              route_id: SCCP_BSC_XOR_ROUTE_ID,
            },
          },
        }),
        /video readiness binding route routeId uses multiple aliases: routeId, route_id/u,
      ],
      [
        "native prover bundle hash omitted",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              deployment: deployment({ nativeEvmProverBundleHash: undefined }),
            },
          },
        }),
        /video route nativeEvmProverBundleHash is missing/u,
      ],
      [
        "route post-deploy drift",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              postDeployLiveEvidence: postDeployLiveEvidence({
                sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/${HASH_77}`,
              }),
            },
          },
        }),
        /video route sourceEventExplorerUrl does not match/u,
      ],
      [
        "route report not ready while video claims route readiness",
        videoTranscript(),
        /routeReady differs from route report/u,
        {
          routeReport: routeReport({ ready: false }),
        },
      ],
      [
        "smoke route not ready while video claims route readiness",
        videoTranscript(),
        /routeReady differs from smoke-readiness report/u,
        {
          smokeReadinessReport: smokeReadinessReport({ routeReady: false }),
        },
      ],
      [
        "smoke readiness not ready while video claims smoke readiness",
        videoTranscript(),
        /smokeReadinessReady differs from smoke-readiness report/u,
        {
          smokeReadinessReport: smokeReadinessReport({ ready: false }),
        },
      ],
      [
        "readiness checks omitted",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checks: undefined,
          },
        }),
        /video readiness binding report checks are missing or invalid/u,
      ],
      [
        "readiness checks duplicated",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checks: [
              videoTranscript().readinessBinding.checks[0],
              ...videoTranscript().readinessBinding.checks,
            ],
          },
        }),
        /video readiness binding check id route-preflight is duplicated/u,
      ],
      [
        "readiness check summary rewritten",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checks: videoTranscript().readinessBinding.checks.map(
              (entry, index) =>
                index === 0 ? { ...entry, message: "forged ready" } : entry,
            ),
          },
        }),
        /video readiness binding check 0 message differs/u,
      ],
      [
        "peer audit duplicate asset identity alias",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              asset_key: SCCP_BSC_XOR_ASSET_KEY,
            },
          },
        }),
        /video readiness binding peer audit assetKey uses multiple aliases: assetKey, asset_key/u,
      ],
      [
        "peer count drift",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              peerCount: 3,
            },
          },
        }),
        /peer audit peerCount differs/u,
      ],
      [
        "peer sanitized stanza status omitted",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              sanitizedStanzaFilesChecked: undefined,
            },
          },
        }),
        /peer audit sanitized stanza files were not checked/u,
      ],
      [
        "peer sanitized stanza status false",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              sanitizedStanzaFilesChecked: false,
            },
          },
        }),
        /peer audit sanitized stanza files were not checked/u,
      ],
      [
        "peer sanitized stanza status differs from smoke-readiness",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              sanitizedStanzaFilesChecked: true,
            },
          },
        }),
        /peer audit sanitized stanza file status differs from smoke-readiness report/u,
        {
          smokeReadinessReport: smokeReadinessReport({
            peerAudit: {
              ...smokeReadinessReport().peerAudit,
              sanitizedStanzaFilesChecked: false,
            },
          }),
        },
      ],
      [
        "missing peer count",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              peerCount: undefined,
            },
          },
        }),
        /peer audit peerCount is invalid/u,
      ],
      [
        "smoke timestamp drift",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checkedAt: "2026-06-05T00:00:00.000Z",
          },
        }),
        /checkedAt differs from smoke-readiness report/u,
      ],
      [
        "readiness timestamp before recording",
        (() => {
          const staleCheckedAt = new Date(NOW_MS - 120_000).toISOString();
          return videoTranscript({
            readinessBinding: {
              ...videoTranscript().readinessBinding,
              checkedAt: staleCheckedAt,
            },
          });
        })(),
        /checkedAt is before the recording window/u,
        {
          smokeReadinessReport: smokeReadinessReport({
            checkedAt: new Date(NOW_MS - 120_000).toISOString(),
          }),
        },
      ],
      [
        "readiness timestamp after recording",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checkedAt: futureCheckedAt,
          },
        }),
        /checkedAt is after the recording window/u,
        {
          smokeReadinessReport: smokeReadinessReport({
            checkedAt: futureCheckedAt,
          }),
        },
      ],
      [
        "missing binding",
        videoTranscript({ readinessBinding: null }),
        /readiness binding is missing/u,
      ],
    ];

    for (const [name, badTranscript, detail, overrides = {}] of cases) {
      const report = evaluate({ videoTranscript: badTranscript, ...overrides });
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "video-readiness-binding")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("rejects video readiness bindings whose route hashes reuse cryptographic roles", () => {
    const report = evaluate(
      reportsWithDeployment({
        proofArtifactHash: deployment().verifierKeyHash,
      }),
    );

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "video-readiness-binding")?.detail).toMatch(
      /video readiness binding route proofArtifactHash must not equal verifierKeyHash/u,
    );
  });

  it("rejects missing, unverified, or forged recorded video artifacts", () => {
    const cases = [
      ["missing artifact", videoTranscript({ videoArtifacts: [] })],
      [
        "unverified artifact",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, fileVerified: false }],
        }),
      ],
      [
        "tiny artifact",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, sizeBytes: 12 }],
        }),
      ],
      [
        "oversized artifact declaration",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, sizeBytes: MAX_VIDEO_ARTIFACT_BYTES + 1 },
          ],
        }),
      ],
      [
        "zero hash",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, sha256: "00".repeat(32) }],
        }),
      ],
      [
        "missing media type",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, mediaType: undefined }],
        }),
      ],
      [
        "wrong media type",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, mediaType: "application/octet-stream" },
          ],
        }),
      ],
      [
        "wrong extension",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, relativePath: "video.mp4" }],
        }),
      ],
      [
        "path traversal",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "../video.webm" },
          ],
        }),
      ],
      [
        "absolute path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "/tmp/video.webm" },
          ],
        }),
      ],
      [
        "windows absolute path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "C:\\proof\\video.webm" },
          ],
        }),
      ],
      [
        "windows traversal path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "proof\\..\\video.webm" },
          ],
        }),
      ],
      [
        "encoded traversal path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "proof/%2e%2e/video.webm" },
          ],
        }),
      ],
      [
        "double-encoded traversal path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "proof/%252e%252e/video.webm" },
          ],
        }),
      ],
      [
        "over-encoded traversal path",
        videoTranscript({
          outputDir: "external-proof-output",
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "proof/%252525252e%252525252e/video.webm",
            },
          ],
        }),
      ],
      [
        "scheme path",
        videoTranscript({
          videoArtifacts: [
            { ...VIDEO_ARTIFACT, relativePath: "file:video.webm" },
          ],
        }),
      ],
      [
        "malformed artifact entry",
        videoTranscript({
          videoArtifacts: [VIDEO_ARTIFACT, "not-a-video-artifact"],
        }),
        /video proof transcript video artifact 1 is not an object/u,
      ],
      [
        "duplicate captured recordings",
        videoTranscript({
          videoArtifacts: [
            VIDEO_ARTIFACT,
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video-duplicate.webm",
              sha256: "ac".repeat(32),
            },
          ],
        }),
        /recorded UI video artifact is duplicated/u,
      ],
      [
        "extra non-captured recording artifact",
        videoTranscript({
          videoArtifacts: [
            VIDEO_ARTIFACT,
            {
              ...VIDEO_ARTIFACT,
              status: "skipped",
              relativePath: "video-extra.webm",
              sha256: "ad".repeat(32),
            },
          ],
        }),
        /video proof transcript must contain exactly one video artifact/u,
      ],
    ];

    for (const [
      name,
      badTranscript,
      detail = /recorded UI video artifact is missing/u,
    ] of cases) {
      const report = evaluate({ videoTranscript: badTranscript });
      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "video-artifact-captured")?.detail,
        name,
      ).toMatch(detail);
    }
  });

  it("rejects forged in-memory video proof file reverification in production mode", () => {
    const forgedTranscript = videoTranscript({
      proofFilesReverified: true,
      videoArtifacts: [{ ...VIDEO_ARTIFACT, fileReverified: true }],
      explorerScreenshots: videoTranscript().explorerScreenshots.map(
        (entry) => ({
          ...entry,
          fileReverified: true,
        }),
      ),
    });

    const report = evaluate({
      videoTranscript: forgedTranscript,
      requireReverifiedVideoProofFiles: true,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /not reverified from the transcript directory/u,
    );
    expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
    expect(failedCheck(report, "video-proof-complete")).toBeUndefined();
  });

  it("requires file-backed video proof reverification by default", () => {
    const report = evaluateBscSccpProductionGate({
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport(),
      smokeReadinessReport: smokeReadinessReport(),
      materialInventoryReport: materialInventoryReport(),
      videoTranscript: videoTranscript(),
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /not reverified from the transcript directory/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /explorer screenshot is missing/u,
    );
  });

  it("does not invoke accessor-backed transcript arrays while gating video proof", () => {
    const getterCounts = [];
    const accessorArray = (value) => {
      let reads = 0;
      const rows = [];
      Object.defineProperty(rows, "0", {
        configurable: true,
        enumerable: true,
        get() {
          reads += 1;
          return value;
        },
      });
      rows.length = 1;
      getterCounts.push(() => reads);
      return rows;
    };
    const transcript = videoTranscript({
      flowOrder: accessorArray(REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[0]),
      expectedEvidence: accessorArray(expectedVideoEvidence()[0]),
      transactionLinks: accessorArray(transactionLinks()[0]),
      explorerScreenshots: accessorArray(
        screenshotProof("tairaSourceTx", tairaTx(VIDEO_HASH_AA)),
      ),
      videoArtifacts: accessorArray(VIDEO_ARTIFACT),
      evidence: {
        ...videoEvidence(),
        missingTransactionSlots: accessorArray("bscBurnTx"),
        missingExplorerScreenshotSlots: accessorArray("bscBurnTx"),
        duplicateTransactionSlots: accessorArray({
          transaction: bscTx(VIDEO_HASH_CC),
          slots: ["bscFinalizeTx", "bscBurnTx"],
        }),
        duplicateExplorerScreenshotSlots: accessorArray("bscBurnTx"),
        invalidExplorerScreenshotSlots: accessorArray("bscBurnTx"),
        unexpectedExplorerScreenshotKinds: accessorArray("unknown"),
        readinessEvidence: {
          ready: true,
          missingReadinessEvidence: accessorArray("routePreflightReady"),
        },
        postDeployTransactionEvidence: {
          ready: true,
          reusedPostDeployTransactionSlots: accessorArray("bscBurnTx"),
          reusedPostDeployTransactions: accessorArray({
            slot: "bscBurnTx",
            postDeployField: "routeCanaryTransactionId",
          }),
        },
        videoArtifactEvidence: {
          ready: true,
          missingVideoArtifacts: accessorArray("recording"),
          capturedArtifacts: accessorArray({
            relativePath: VIDEO_ARTIFACT.relativePath,
            sizeBytes: VIDEO_ARTIFACT.sizeBytes,
            sha256: VIDEO_ARTIFACT.sha256,
            mediaType: VIDEO_ARTIFACT.mediaType,
          }),
        },
        timelineEvidence: {
          ready: true,
          durationMs: 60_000,
          missingVideoTimeline: accessorArray("durationMs"),
        },
      },
      missingEvidence: {
        transactionSlots: accessorArray("bscBurnTx"),
        explorerScreenshotSlots: accessorArray("bscBurnTx"),
        duplicateTransactionSlots: accessorArray({
          transaction: bscTx(VIDEO_HASH_CC),
          slots: ["bscFinalizeTx", "bscBurnTx"],
        }),
        duplicateExplorerScreenshotSlots: accessorArray("bscBurnTx"),
        invalidExplorerScreenshotSlots: accessorArray("bscBurnTx"),
        unexpectedExplorerScreenshotKinds: accessorArray("unknown"),
        readiness: accessorArray("routePreflightReady"),
        videoArtifacts: accessorArray("recording"),
        videoTimeline: accessorArray("durationMs"),
      },
    });

    const report = evaluate({
      videoTranscript: transcript,
      requireReverifiedVideoProofFiles: false,
    });

    expect(getterCounts.every((readCount) => readCount() === 0)).toBe(true);
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /must contain exactly one video artifact|recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /expectedEvidence must include exactly|transaction link is missing|explorer screenshot is missing/u,
    );
  });

  it("rejects incomplete or forged video proof transcripts", () => {
    const cases = [
      ["missing transcript", null, /video proof transcript is missing/u],
      [
        "missing output directory",
        (() => {
          const transcript = videoTranscript();
          delete transcript.outputDir;
          return transcript;
        })(),
        /video proof transcript outputDir is missing or not portable/u,
      ],
      [
        "absolute output directory",
        videoTranscript({ outputDir: "/tmp/proof/private-key=operator" }),
        /video proof transcript outputDir is missing or not portable/u,
      ],
      [
        "scheme output directory",
        videoTranscript({ outputDir: "file:proof" }),
        /video proof transcript outputDir is missing or not portable/u,
      ],
      [
        "encoded traversal output directory",
        videoTranscript({ outputDir: "output/%2e%2e/proof" }),
        /video proof transcript outputDir is missing or not portable/u,
      ],
      [
        "not complete",
        videoTranscript({ proofComplete: false }),
        /not complete/u,
      ],
      [
        "missing operator notes",
        (() => {
          const transcript = videoTranscript();
          delete transcript.operatorNotes;
          return transcript;
        })(),
        /operatorNotes is missing or invalid/u,
      ],
      [
        "empty operator notes",
        videoTranscript({ operatorNotes: "   " }),
        /operatorNotes is missing or invalid/u,
      ],
      [
        "structured operator notes",
        videoTranscript({ operatorNotes: { localPath: "/tmp/proof.webm" } }),
        /operatorNotes is missing or invalid/u,
      ],
      [
        "wrong operator notes",
        videoTranscript({ operatorNotes: "Reviewed locally; looks fine." }),
        /operatorNotes does not match the complete proof note/u,
      ],
      [
        "missing declared duration",
        (() => {
          const transcript = videoTranscript();
          delete transcript.durationMs;
          return transcript;
        })(),
        /durationMs is missing or invalid/u,
      ],
      [
        "invalid declared duration",
        videoTranscript({ durationMs: "60000" }),
        /durationMs is missing or invalid/u,
      ],
      [
        "declared duration does not match recording window",
        videoTranscript({ durationMs: 59_000 }),
        /durationMs does not match recording window/u,
      ],
      [
        "missing declared flow order",
        (() => {
          const transcript = videoTranscript();
          delete transcript.flowOrder;
          return transcript;
        })(),
        /flowOrder is missing/u,
      ],
      [
        "declared flow order with invalid entry",
        videoTranscript({
          flowOrder: [
            ...REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS.slice(0, 2),
            17,
            REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[3],
          ],
        }),
        /flowOrder contains invalid entries/u,
      ],
      [
        "declared flow order out of order",
        videoTranscript({
          flowOrder: [
            REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[2],
            REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[0],
            REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[1],
            REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS[3],
          ],
        }),
        /flowOrder does not match required TAIRA -> BSC -> TAIRA order/u,
      ],
      [
        "transaction links out of flow order",
        videoTranscript({
          transactionLinks: [
            transactionLinks()[2],
            transactionLinks()[0],
            transactionLinks()[1],
            transactionLinks()[3],
          ],
        }),
        /transactionLinks are not in required TAIRA -> BSC -> TAIRA order/u,
      ],
      [
        "explorer screenshots out of flow order",
        videoTranscript({
          explorerScreenshots: [
            videoTranscript().explorerScreenshots[1],
            videoTranscript().explorerScreenshots[0],
            videoTranscript().explorerScreenshots[2],
            videoTranscript().explorerScreenshots[3],
          ],
        }),
        /explorerScreenshots are not in required TAIRA -> BSC -> TAIRA order/u,
      ],
      [
        "explorer screenshot missing label",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, label: undefined }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot label does not match required proof label/u,
      ],
      [
        "explorer screenshot swapped label",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, label: "TAIRA source transaction" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot label does not match required proof label/u,
      ],
      [
        "unsupported root field",
        videoTranscript({ verifierMaterial: "public verifier summary" }),
        /video proof transcript contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported BSC binding field",
        videoTranscript({
          bsc: { ...videoTranscript().bsc, rpcUrl: "https://rpc.invalid" },
        }),
        /video proof transcript BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "unsupported readiness binding field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            verifierMaterial: "public verifier summary",
          },
        }),
        /video readiness binding contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported readiness binding check field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            checks: [{ id: "route-preflight", ok: true, trace: "local" }],
          },
        }),
        /video readiness binding check 0 contains unsupported field trace/u,
      ],
      [
        "unsupported readiness route field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              localManifest: "./manifest.json",
            },
          },
        }),
        /video readiness binding route contains unsupported field localManifest/u,
      ],
      [
        "unsupported readiness route BSC field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              bsc: {
                ...videoTranscript().readinessBinding.route.bsc,
                rpcUrl: "https://rpc.invalid",
              },
            },
          },
        }),
        /video readiness binding route BSC profile contains unsupported field rpcUrl/u,
      ],
      [
        "unsupported readiness route deployment field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              deployment: {
                ...videoTranscript().readinessBinding.route.deployment,
                verifierMaterial: "public verifier summary",
              },
            },
          },
        }),
        /video readiness binding route deployment contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported readiness route post-deploy field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            route: {
              ...videoTranscript().readinessBinding.route,
              postDeployLiveEvidence: {
                ...videoTranscript().readinessBinding.route
                  .postDeployLiveEvidence,
                receipt: "0x01",
              },
            },
          },
        }),
        /video readiness binding route postDeployLiveEvidence contains unsupported field receipt/u,
      ],
      [
        "unsupported readiness peer audit field",
        videoTranscript({
          readinessBinding: {
            ...videoTranscript().readinessBinding,
            peerAudit: {
              ...videoTranscript().readinessBinding.peerAudit,
              peerSecretsHash: "0x01",
            },
          },
        }),
        /video readiness binding peer audit contains unsupported field \[redacted unsupported field\]/u,
      ],
      [
        "unsupported transaction field",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            proverTrace: "0x01",
          },
        }),
        /video proof transcript transactions contains unsupported field proverTrace/u,
      ],
      [
        "unsupported transaction link field",
        videoTranscript({
          transactionLinks: videoTranscript().transactionLinks.map((entry) =>
            entry.label === "BSC burn transaction"
              ? { ...entry, trace: "clicked" }
              : entry,
          ),
        }),
        /video proof transcript transaction link 2 contains unsupported field trace/u,
      ],
      [
        "unsupported explorer screenshot field",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, rawHtml: "<html></html>" }
                : entry,
          ),
        }),
        /video proof transcript explorer screenshot 2 contains unsupported field rawHtml/u,
      ],
      [
        "unsupported video artifact field",
        videoTranscript({
          videoArtifacts: [{ ...VIDEO_ARTIFACT, ffmpegLog: "local" }],
        }),
        /video proof transcript video artifact 0 contains unsupported field ffmpegLog/u,
      ],
      [
        "local video artifact path field",
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              path: "/tmp/proof/private-key=operator-secret.webm",
            },
          ],
        }),
        /video proof transcript video artifact 0 contains unsupported field path/u,
      ],
      [
        "local explorer screenshot path field",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? {
                    ...entry,
                    screenshot: "/tmp/proof/private-key=operator-secret.png",
                  }
                : entry,
          ),
        }),
        /video proof transcript explorer screenshot 2 contains unsupported field screenshot/u,
      ],
      [
        "unsupported nested evidence field",
        videoTranscript({
          evidence: { ...videoEvidence(), operatorOverride: true },
        }),
        /video proof transcript evidence contains unsupported field operatorOverride/u,
      ],
      [
        "unsupported readiness evidence field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            readinessEvidence: {
              ...videoEvidence().readinessEvidence,
              routeReport: {},
            },
          },
        }),
        /video proof transcript readiness evidence contains unsupported field routeReport/u,
      ],
      [
        "unsupported post-deploy transaction evidence field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ready: true,
              reusedPostDeployTransactionSlots: [],
              reusedPostDeployTransactions: [],
              receipt: "0x01",
            },
          },
        }),
        /video proof transcript post-deploy transaction evidence contains unsupported field receipt/u,
      ],
      [
        "unsupported post-deploy reused transaction field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ready: true,
              reusedPostDeployTransactionSlots: [],
              reusedPostDeployTransactions: [
                {
                  slot: "bscBurnTx",
                  postDeployField: "routeCanary",
                  tx: "0x1",
                },
              ],
            },
          },
        }),
        /video proof transcript post-deploy reused transaction 0 contains unsupported field tx/u,
      ],
      [
        "unsupported video artifact evidence field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ...videoEvidence().videoArtifactEvidence,
              localPath: "/tmp/video.webm",
            },
          },
        }),
        /video proof transcript video artifact evidence contains unsupported field localPath/u,
      ],
      [
        "unsupported captured video artifact evidence field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ...videoEvidence().videoArtifactEvidence,
              capturedArtifacts: [
                {
                  ...videoEvidence().videoArtifactEvidence.capturedArtifacts[0],
                  path: "/tmp/video.webm",
                },
              ],
            },
          },
        }),
        /video proof transcript captured video artifact 0 contains unsupported field path/u,
      ],
      [
        "unsupported timeline evidence field",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            timelineEvidence: {
              ...videoEvidence().timelineEvidence,
              clockSource: "local",
            },
          },
        }),
        /video proof transcript timeline evidence contains unsupported field clockSource/u,
      ],
      [
        "unsupported missingEvidence field",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            operatorNotes: [],
          },
        }),
        /video proof transcript missingEvidence contains unsupported field operatorNotes/u,
      ],
      [
        "missing recording window",
        videoTranscript({ startedAtMs: null }),
        /video proof transcript recording window is missing/u,
      ],
      [
        "too short recording window",
        videoTranscript({ endedAtMs: NOW_MS - 60_999 }),
        /video proof transcript recording duration is outside allowed bounds/u,
      ],
      [
        "too long recording window",
        videoTranscript({ startedAtMs: NOW_MS - 7_300_000 }),
        /video proof transcript recording duration is outside allowed bounds/u,
      ],
      [
        "missing BSC network binding",
        videoTranscript({ bsc: null }),
        /BSC network binding is missing/u,
      ],
      [
        "missing BSC explorer URL binding",
        videoTranscript({
          bsc: { ...videoTranscript().bsc, explorerUrl: "" },
        }),
        /BSC network binding does not match/u,
      ],
      [
        "forged BSC explorer URL binding",
        videoTranscript({
          bsc: { ...videoTranscript().bsc, explorerUrl: "https://bscscan.com" },
        }),
        /BSC network binding does not match/u,
      ],
      [
        "missing expected evidence",
        (() => {
          const transcript = videoTranscript();
          delete transcript.expectedEvidence;
          return transcript;
        })(),
        /expectedEvidence is missing or invalid/u,
      ],
      [
        "invalid expected evidence container",
        videoTranscript({ expectedEvidence: "all proof captured" }),
        /expectedEvidence is missing or invalid/u,
      ],
      [
        "empty expected evidence list",
        videoTranscript({ expectedEvidence: [] }),
        /expectedEvidence must include exactly the required evidence steps/u,
      ],
      [
        "wrong-network expected evidence",
        videoTranscript({ expectedEvidence: expectedVideoEvidence("mainnet") }),
        /expectedEvidence entry 1 does not match BSC testnet/u,
      ],
      [
        "reordered expected evidence",
        videoTranscript({
          expectedEvidence: [
            expectedVideoEvidence()[1],
            expectedVideoEvidence()[0],
            expectedVideoEvidence()[2],
            expectedVideoEvidence()[3],
          ],
        }),
        /expectedEvidence entry 0 does not match BSC testnet/u,
      ],
      [
        "duplicate expected evidence",
        videoTranscript({
          expectedEvidence: [
            expectedVideoEvidence()[0],
            expectedVideoEvidence()[1],
            expectedVideoEvidence()[2],
            expectedVideoEvidence()[2],
          ],
        }),
        /expectedEvidence entry 3 does not match BSC testnet/u,
      ],
      [
        "extra expected evidence",
        videoTranscript({
          expectedEvidence: [
            ...expectedVideoEvidence(),
            "Operator wallet balance page shown",
          ],
        }),
        /expectedEvidence must include exactly the required evidence steps/u,
      ],
      [
        "non-string expected evidence entry",
        videoTranscript({
          expectedEvidence: [
            expectedVideoEvidence()[0],
            expectedVideoEvidence()[1],
            { label: "BSC burn transaction shown in explorer" },
            expectedVideoEvidence()[3],
          ],
        }),
        /expectedEvidence entry 2 is invalid/u,
      ],
      [
        "missing nested evidence summary",
        videoTranscript({ evidence: null }),
        /evidence summary is missing/u,
      ],
      [
        "nested evidence not complete",
        videoTranscript({
          evidence: { ...videoEvidence(), proofComplete: false },
        }),
        /evidence\.proofComplete is not true/u,
      ],
      [
        "nested evidence missing transaction slot not empty",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            missingTransactionSlots: ["bscBurnTx"],
          },
        }),
        /evidence\.missingTransactionSlots is not empty/u,
      ],
      [
        "nested evidence duplicate transaction summary malformed",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            duplicateTransactionSlots: "bscBurnTx",
          },
        }),
        /evidence\.duplicateTransactionSlots is missing or invalid/u,
      ],
      [
        "nested evidence invalid screenshot slot not empty",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            invalidExplorerScreenshotSlots: ["bscFinalizeTx"],
          },
        }),
        /evidence\.invalidExplorerScreenshotSlots is not empty/u,
      ],
      [
        "reused explorer screenshot proof path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath:
                entry.kind === "tairaSettlementTx"
                  ? "tairaSourceTx.png"
                  : entry.relativePath,
            }),
          ),
        }),
        /tairaSettlementTx explorer screenshot reuses proof file from tairaSourceTx/u,
      ],
      [
        "reused explorer screenshot proof hash",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "tairaSettlementTx"
                ? {
                    ...entry,
                    sha256: SCREENSHOT_SHA256_BY_KIND.tairaSourceTx,
                  }
                : entry,
          ),
        }),
        /tairaSettlementTx explorer screenshot reuses proof file hash from tairaSourceTx explorer screenshot/u,
      ],
      [
        "video artifact reuses screenshot proof hash",
        (() => {
          const evidence = videoEvidence();
          const reusedHash = SCREENSHOT_SHA256_BY_KIND.bscBurnTx;
          return videoTranscript({
            videoArtifacts: [{ ...VIDEO_ARTIFACT, sha256: reusedHash }],
            evidence: {
              ...evidence,
              videoArtifactEvidence: {
                ...evidence.videoArtifactEvidence,
                capturedArtifacts:
                  evidence.videoArtifactEvidence.capturedArtifacts.map(
                    (artifact) => ({
                      ...artifact,
                      sha256: reusedHash,
                    }),
                  ),
              },
            },
          });
        })(),
        /bscBurnTx explorer screenshot reuses proof file hash from video artifact 0/u,
      ],
      [
        "missing readiness evidence",
        videoTranscript({
          evidence: { ...videoEvidence(), readinessEvidence: null },
        }),
        /readiness evidence is missing/u,
      ],
      [
        "readiness evidence not ready",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            readinessEvidence: {
              ready: false,
              missingReadinessEvidence: ["smokeReadinessReady"],
            },
          },
        }),
        /readiness evidence is not ready/u,
      ],
      [
        "readiness evidence missing list not empty despite ready flag",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            readinessEvidence: {
              ready: true,
              missingReadinessEvidence: ["routeReady"],
            },
          },
        }),
        /readiness evidence\.missingReadinessEvidence is not empty/u,
      ],
      [
        "post-deploy transaction evidence missing",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: null,
          },
        }),
        /post-deploy transaction evidence is missing/u,
      ],
      [
        "post-deploy transaction evidence not ready",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ready: false,
              reusedPostDeployTransactionSlots: ["bscBurnTx"],
              reusedPostDeployTransactions: [],
            },
          },
        }),
        /post-deploy transaction evidence is not ready/u,
      ],
      [
        "post-deploy transaction reused slot not empty despite ready flag",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ...videoEvidence().postDeployTransactionEvidence,
              reusedPostDeployTransactionSlots: ["bscBurnTx"],
            },
          },
        }),
        /post-deploy transaction evidence\.reusedPostDeployTransactionSlots is not empty/u,
      ],
      [
        "post-deploy transaction reused list not empty despite ready flag",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ...videoEvidence().postDeployTransactionEvidence,
              reusedPostDeployTransactions: [
                {
                  slot: "bscBurnTx",
                  postDeployField: "routeCanaryTransactionId",
                },
              ],
            },
          },
        }),
        /post-deploy transaction evidence\.reusedPostDeployTransactions is not empty/u,
      ],
      [
        "post-deploy transaction reused slot field malformed",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            postDeployTransactionEvidence: {
              ...videoEvidence().postDeployTransactionEvidence,
              reusedPostDeployTransactionSlots: "bscBurnTx",
            },
          },
        }),
        /post-deploy transaction evidence\.reusedPostDeployTransactionSlots is missing or invalid/u,
      ],
      [
        "video artifact evidence not ready",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: false,
              missingVideoArtifacts: ["recording"],
            },
          },
        }),
        /video artifact evidence is not ready/u,
      ],
      [
        "video artifact evidence duplicate recording summary",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                ...videoEvidence().videoArtifactEvidence.capturedArtifacts,
                {
                  relativePath: "video-duplicate.webm",
                  sizeBytes: VIDEO_ARTIFACT.sizeBytes,
                  sha256: "ac".repeat(32),
                  mediaType: "video/webm",
                },
              ],
            },
          },
        }),
        /video artifact evidence must summarize exactly one recording/u,
      ],
      [
        "video artifact evidence mismatched recording summary",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  ...videoEvidence().videoArtifactEvidence.capturedArtifacts[0],
                  sha256: "ac".repeat(32),
                },
              ],
            },
          },
        }),
        /video artifact evidence does not match the captured recording/u,
      ],
      [
        "video artifact evidence missing list not empty despite ready flag",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ...videoEvidence().videoArtifactEvidence,
              missingVideoArtifacts: ["recording"],
            },
          },
        }),
        /video artifact evidence\.missingVideoArtifacts is not empty/u,
      ],
      [
        "timeline evidence missing",
        videoTranscript({
          evidence: { ...videoEvidence(), timelineEvidence: null },
        }),
        /timeline evidence is missing/u,
      ],
      [
        "timeline evidence not ready",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            timelineEvidence: {
              ready: false,
              durationMs: 12,
              missingVideoTimeline: ["durationMs"],
            },
          },
        }),
        /timeline evidence is not ready/u,
      ],
      [
        "timeline evidence duration drift",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            timelineEvidence: {
              ...videoEvidence().timelineEvidence,
              durationMs: 59_000,
            },
          },
        }),
        /timeline duration does not match recording window/u,
      ],
      [
        "timeline evidence missing list not empty despite ready flag",
        videoTranscript({
          evidence: {
            ...videoEvidence(),
            timelineEvidence: {
              ...videoEvidence().timelineEvidence,
              missingVideoTimeline: ["durationMs"],
            },
          },
        }),
        /timeline evidence\.missingVideoTimeline is not empty/u,
      ],
      [
        "missing missingEvidence object",
        videoTranscript({ missingEvidence: null }),
        /missingEvidence is missing/u,
      ],
      [
        "invalid missingEvidence field",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            videoTimeline: "durationMs",
          },
        }),
        /missingEvidence\.videoTimeline is missing or invalid/u,
      ],
      [
        "missingEvidence transaction slots not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            transactionSlots: ["bscBurnTx"],
          },
        }),
        /missingEvidence\.transactionSlots is not empty/u,
      ],
      [
        "missingEvidence duplicate screenshots not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            duplicateExplorerScreenshotSlots: ["bscBurnTx"],
          },
        }),
        /missingEvidence\.duplicateExplorerScreenshotSlots is not empty/u,
      ],
      [
        "missingEvidence invalid screenshots not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            invalidExplorerScreenshotSlots: ["bscBurnTx"],
          },
        }),
        /missingEvidence\.invalidExplorerScreenshotSlots is not empty/u,
      ],
      [
        "missingEvidence unexpected screenshots not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            unexpectedExplorerScreenshotKinds: ["bscAccount"],
          },
        }),
        /missingEvidence\.unexpectedExplorerScreenshotKinds is not empty/u,
      ],
      [
        "missingEvidence readiness not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            readiness: ["peerAudit"],
          },
        }),
        /missingEvidence\.readiness is not empty/u,
      ],
      [
        "missingEvidence video artifacts not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            videoArtifacts: ["recording"],
          },
        }),
        /missingEvidence\.videoArtifacts is not empty/u,
      ],
      [
        "missingEvidence video timeline not empty",
        videoTranscript({
          missingEvidence: {
            ...emptyVideoMissingEvidence(),
            videoTimeline: ["durationMs"],
          },
        }),
        /missingEvidence\.videoTimeline is not empty/u,
      ],
      [
        "missing transaction link artifact",
        videoTranscript({ transactionLinks: null }),
        /transactionLinks is missing/u,
      ],
      [
        "empty transaction links",
        videoTranscript({ transactionLinks: [] }),
        /tairaSourceTx transaction link is missing/u,
      ],
      [
        "invalid transaction link entry",
        videoTranscript({
          transactionLinks: [...videoTranscript().transactionLinks, "bad"],
        }),
        /invalid transaction link entries/u,
      ],
      [
        "unexpected transaction link label",
        videoTranscript({
          transactionLinks: [
            ...videoTranscript().transactionLinks,
            { label: "BSC account", href: bscTx(HASH_99) },
          ],
        }),
        /unexpected transaction link label: BSC account/u,
      ],
      [
        "duplicate transaction link slot",
        videoTranscript({
          transactionLinks: [
            ...videoTranscript().transactionLinks,
            { label: "BSC burn transaction", href: bscTx(HASH_77) },
          ],
        }),
        /bscBurnTx transaction link is duplicated/u,
      ],
      [
        "transaction link URL drift",
        videoTranscript({
          transactionLinks: videoTranscript().transactionLinks.map((entry) =>
            entry.label === "BSC burn transaction"
              ? { ...entry, href: bscTx(HASH_99) }
              : entry,
          ),
        }),
        /bscBurnTx transaction link does not match transaction URL/u,
      ],
      [
        "wrong explorer host in transaction link",
        videoTranscript({
          transactionLinks: videoTranscript().transactionLinks.map((entry) =>
            entry.label === "BSC burn transaction"
              ? { ...entry, href: `https://bscscan.com/tx/${HASH_77}` }
              : entry,
          ),
        }),
        /bscBurnTx transaction link does not match transaction URL/u,
      ],
      [
        "BSC transaction link in TAIRA source slot",
        videoTranscript({
          transactionLinks: videoTranscript().transactionLinks.map((entry) =>
            entry.label === "TAIRA source transaction"
              ? { ...entry, href: bscTx(HASH_55) }
              : entry,
          ),
        }),
        /tairaSourceTx transaction link does not match transaction URL/u,
      ],
      [
        "mainnet BSC explorer",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            bscBurnTx: `https://bscscan.com/tx/${HASH_77}`,
          },
        }),
        /bscBurnTx explorer transaction URL is missing or invalid/u,
      ],
      [
        "BSC explorer transaction URL with fragment",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            bscBurnTx: `${bscTx(HASH_77)}#proof`,
          },
        }),
        /bscBurnTx explorer transaction URL is missing or invalid/u,
      ],
      [
        "BSC transaction in TAIRA source slot",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            tairaSourceTx: bscTx(HASH_55),
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "tairaSourceTx"
                ? { ...entry, href: bscTx(HASH_55) }
                : entry,
          ),
        }),
        /tairaSourceTx explorer transaction URL is missing or invalid/u,
      ],
      [
        "TAIRA transaction in BSC finalize slot",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            bscFinalizeTx: tairaTx(HASH_66),
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscFinalizeTx"
                ? { ...entry, href: tairaTx(HASH_66) }
                : entry,
          ),
        }),
        /bscFinalizeTx explorer transaction URL is missing or invalid/u,
      ],
      [
        "TAIRA screenshot for BSC burn slot",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, href: tairaTx(HASH_77) }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "unverified screenshot",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, fileVerified: false }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "tiny screenshot",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx" ? { ...entry, sizeBytes: 12 } : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "oversized screenshot declaration",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, sizeBytes: MAX_SCREENSHOT_ARTIFACT_BYTES + 1 }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "zero screenshot hash",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, sha256: "00".repeat(32) }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "wrong screenshot media type",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, mediaType: "text/html" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "wrong screenshot extension",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "bscBurnTx.jpg" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "absolute screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "/tmp/bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "windows absolute screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "C:\\proof\\bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "windows traversal screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "proof\\..\\bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "encoded traversal screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "proof/%2e%2e/bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "double-encoded traversal screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "proof/%252e%252e/bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "over-encoded traversal screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? {
                    ...entry,
                    relativePath: "proof/%252525252e%252525252e/bscBurnTx.png",
                  }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "scheme screenshot path",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, relativePath: "file:bscBurnTx.png" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot is missing/u,
      ],
      [
        "screenshot final URL drift",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, finalHref: bscTx(HASH_99) }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot finalHref does not match transaction URL/u,
      ],
      [
        "missing screenshot transaction hash",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, transactionHash: "" }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot transactionHash is missing or invalid/u,
      ],
      [
        "screenshot transaction hash drift",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "tairaSettlementTx"
                ? { ...entry, transactionHash: HASH_99.slice(2) }
                : entry,
          ),
        }),
        /tairaSettlementTx explorer screenshot transactionHash does not match transaction URL/u,
      ],
      [
        "missing screenshot content length",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, contentLength: undefined }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot contentLength is missing or too small/u,
      ],
      [
        "tiny screenshot content length",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) =>
              entry.kind === "bscBurnTx"
                ? { ...entry, contentLength: 12 }
                : entry,
          ),
        }),
        /bscBurnTx explorer screenshot contentLength is missing or too small/u,
      ],
      [
        "duplicate screenshot slot",
        videoTranscript({
          explorerScreenshots: [
            ...videoTranscript().explorerScreenshots,
            screenshotProof("bscBurnTx", bscTx(HASH_77), {
              relativePath: "bscBurnTx-duplicate.png",
            }),
          ],
        }),
        /bscBurnTx explorer screenshot is duplicated/u,
      ],
      [
        "unexpected screenshot kind",
        videoTranscript({
          explorerScreenshots: [
            ...videoTranscript().explorerScreenshots,
            screenshotProof("bscAccount", bscTx(HASH_99), {
              relativePath: "bscAccount.png",
            }),
          ],
        }),
        /unexpected explorer screenshot kind: bscAccount/u,
      ],
      [
        "duplicate tx",
        videoTranscript({
          transactions: {
            ...videoTranscript().transactions,
            bscBurnTx: bscTx(VIDEO_HASH_BB),
          },
        }),
        /duplicates/u,
      ],
      [
        "duplicate tx hash across TAIRA and BSC",
        (() => {
          const base = videoTranscript();
          const tairaSourceTx = tairaTx(VIDEO_HASH_BB);
          return videoTranscript({
            transactions: {
              ...base.transactions,
              tairaSourceTx,
            },
            transactionLinks: base.transactionLinks.map((entry) =>
              entry.label === "TAIRA source transaction"
                ? { ...entry, href: tairaSourceTx }
                : entry,
            ),
            explorerScreenshots: base.explorerScreenshots.map((entry) =>
              entry.kind === "tairaSourceTx"
                ? screenshotProof("tairaSourceTx", tairaSourceTx)
                : entry,
            ),
          });
        })(),
        /bscFinalizeTx duplicates tairaSourceTx transaction hash/u,
      ],
      [
        "missing screenshot",
        videoTranscript({
          explorerScreenshots: videoTranscript().explorerScreenshots.filter(
            (entry) => entry.kind !== "tairaSettlementTx",
          ),
        }),
        /tairaSettlementTx explorer screenshot is missing/u,
      ],
    ];

    for (const [name, badVideoTranscript, detail] of cases) {
      const report = evaluate({ videoTranscript: badVideoTranscript });
      expect(report.ready, name).toBe(false);
      if (badVideoTranscript === null) {
        expect(
          failedCheck(report, "video-proof-transcript-present")?.detail,
          name,
        ).toMatch(/video proof transcript is missing/u);
      } else {
        expect(
          failedCheck(report, "video-proof-transcript-present"),
          name,
        ).toBeUndefined();
      }
      expect(failedCheck(report, "video-proof-complete")?.detail, name).toMatch(
        detail,
      );
    }
    const externalOutputReport = evaluate({
      videoTranscript: videoTranscript({ outputDir: "external-proof-output" }),
    });
    expect(externalOutputReport.ready).toBe(true);
    expect(externalOutputReport.videoProof?.outputDir).toBe(
      "external-proof-output",
    );
  });

  it("redacts secret-like material from aggregate reports", () => {
    const report = evaluate({
      routeReport: routeReport({
        privateKey: "do-not-serialize",
        apiKey: "do-not-serialize-api-key",
        nested: {
          seedPhrase: "seed words must not leak",
        },
      }),
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "route-report-secret-scan")?.detail).toContain(
      "secret-like material",
    );
    expect(JSON.stringify(report)).not.toContain("privateKey");
    expect(JSON.stringify(report)).not.toContain("apiKey");
    expect(JSON.stringify(report)).not.toContain("do-not-serialize");
    expect(JSON.stringify(report)).not.toContain("do-not-serialize-api-key");
    expect(JSON.stringify(report)).not.toContain("seedPhrase");
    expect(JSON.stringify(report)).not.toContain("seed words must not leak");
  });

  it("rejects secret-like values hidden under innocuous report fields", () => {
    const report = evaluate({
      routeReport: routeReport({
        operatorNotes: VALID_MNEMONIC,
      }),
      peerAuditReport: peerAuditReport({
        auditNotes: ["public note", VALID_MNEMONIC],
      }),
      smokeReadinessReport: smokeReadinessReport({
        readinessNotes: {
          operatorNotes: VALID_MNEMONIC,
        },
      }),
      materialInventoryReport: materialInventoryReport({
        operatorNotes: VALID_MNEMONIC,
      }),
      videoTranscript: videoTranscript({
        operatorNotes: VALID_MNEMONIC,
      }),
    });

    expect(report.ready).toBe(false);
    for (const id of [
      "route-report-secret-scan",
      "peer-audit-secret-scan",
      "smoke-readiness-secret-scan",
      "material-inventory-secret-scan",
      "video-transcript-secret-scan",
    ]) {
      expect(failedCheck(report, id)?.detail, id).toContain(
        "secret-like material",
      );
    }
    expect(JSON.stringify(report)).not.toContain(VALID_MNEMONIC);
  });

  it("rejects assignment-shaped secrets hidden in innocuous report strings", () => {
    const assignmentSecret =
      "feedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedfacefeedface";
    const secretNote = `operator note privateKey=0x${assignmentSecret} accessToken=0x${assignmentSecret}`;
    const report = evaluate({
      routeReport: routeReport({ operatorNotes: secretNote }),
      peerAuditReport: peerAuditReport({ auditNotes: ["public", secretNote] }),
      smokeReadinessReport: smokeReadinessReport({
        readinessNotes: { operatorNotes: secretNote },
      }),
      materialInventoryReport: materialInventoryReport({
        operatorNotes: secretNote,
      }),
      videoTranscript: videoTranscript({ operatorNotes: secretNote }),
    });

    expect(report.ready).toBe(false);
    for (const id of [
      "route-report-secret-scan",
      "peer-audit-secret-scan",
      "smoke-readiness-secret-scan",
      "material-inventory-secret-scan",
      "video-transcript-secret-scan",
    ]) {
      expect(failedCheck(report, id)?.detail, id).toContain(
        "secret-like material",
      );
    }
    expect(JSON.stringify(report)).not.toContain("privateKey=");
    expect(JSON.stringify(report)).not.toContain("accessToken=");
    expect(JSON.stringify(report)).not.toContain(assignmentSecret);
  });

  it("rejects bearer-token-shaped secrets hidden in innocuous report strings", () => {
    const bearerToken = "Bearer mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l";
    const secretNote = `operator pasted ${bearerToken}`;
    const report = evaluate({
      routeReport: routeReport({ operatorNotes: secretNote }),
      peerAuditReport: peerAuditReport({ auditNotes: ["public", secretNote] }),
      smokeReadinessReport: smokeReadinessReport({
        readinessNotes: { operatorNotes: secretNote },
      }),
      materialInventoryReport: materialInventoryReport({
        operatorNotes: secretNote,
      }),
      videoTranscript: videoTranscript({ operatorNotes: secretNote }),
    });

    expect(report.ready).toBe(false);
    for (const id of [
      "route-report-secret-scan",
      "peer-audit-secret-scan",
      "smoke-readiness-secret-scan",
      "material-inventory-secret-scan",
      "video-transcript-secret-scan",
    ]) {
      expect(failedCheck(report, id)?.detail, id).toContain(
        "secret-like material",
      );
    }
    expect(JSON.stringify(report)).not.toContain("Bearer");
    expect(JSON.stringify(report)).not.toContain(
      "mF9x8Y7z6W5v4U3t2S1r0Q9p8O7n6M5l",
    );
  });

  it("rejects aggregate input reports carrying smoke-test verifier material without echoing points", () => {
    const cases = [
      [
        "route report",
        {
          routeReport: routeReport({
            verifierMaterial: smokeFixtureMaterial(),
          }),
        },
        "route-report-smoke-fixture-scan",
      ],
      [
        "peer audit report",
        {
          peerAuditReport: peerAuditReport({
            peers: [
              {
                ...peerAuditReport().peers[0],
                verifierMaterial: smokeFixtureMaterial(),
              },
              ...peerAuditReport().peers.slice(1),
            ],
          }),
        },
        "peer-audit-smoke-fixture-scan",
      ],
      [
        "smoke readiness report",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              verifierMaterial: smokeFixtureMaterial(),
            },
          }),
        },
        "smoke-readiness-smoke-fixture-scan",
      ],
      [
        "material inventory report",
        {
          materialInventoryReport: materialInventoryReport({
            inventory: {
              verifier: {
                material: smokeFixtureMaterial(),
              },
            },
          }),
        },
        "material-inventory-smoke-fixture-scan",
      ],
      [
        "video transcript",
        {
          videoTranscript: videoTranscript({
            readinessBinding: {
              ...videoTranscript().readinessBinding,
              verifierMaterial: smokeFixtureMaterial(),
            },
          }),
        },
        "video-transcript-smoke-fixture-scan",
      ],
    ];

    for (const [name, overrides, checkId] of cases) {
      const report = evaluate(overrides);
      const serialized = JSON.stringify(report);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, checkId)?.detail, name).toContain(
        "smoke-test verifier material",
      );
      expect(serialized, name).not.toContain(SMOKE_FIXTURE_G2[0]);
      expect(serialized, name).not.toContain("verifierMaterial");
      expect(serialized, name).not.toContain("alpha1");
    }
  });

  it("rejects aggregate input reports carrying malformed BN254 verifier material without echoing points", () => {
    const invalidVerifierMaterial = (overrides = {}) => ({
      ...VALID_VERIFIER_MATERIAL,
      ...overrides,
    });
    const cases = [
      [
        "route report",
        {
          routeReport: routeReport({
            verifierMaterial: invalidVerifierMaterial({
              alpha1: ["1", "3"],
            }),
          }),
        },
        "route-report-bn254-verifier-material-scan",
      ],
      [
        "peer audit report",
        {
          peerAuditReport: peerAuditReport({
            peers: [
              {
                ...peerAuditReport().peers[0],
                verifierMaterial: invalidVerifierMaterial({
                  beta2: [1, 2, 3, 4],
                }),
              },
              ...peerAuditReport().peers.slice(1),
            ],
          }),
        },
        "peer-audit-bn254-verifier-material-scan",
      ],
      [
        "smoke readiness report",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              verifierMaterial: invalidVerifierMaterial({
                gamma2: [BN254_BASE_FIELD_MODULUS, 2, 3, 4],
              }),
            },
          }),
        },
        "smoke-readiness-bn254-verifier-material-scan",
      ],
      [
        "material inventory report",
        {
          materialInventoryReport: materialInventoryReport({
            inventory: {
              verifier: {
                material: invalidVerifierMaterial({
                  delta2: [0, 0, 0, 0],
                }),
              },
            },
          }),
        },
        "material-inventory-bn254-verifier-material-scan",
      ],
      [
        "video transcript",
        {
          videoTranscript: videoTranscript({
            readinessBinding: {
              ...videoTranscript().readinessBinding,
              verifierMaterial: invalidVerifierMaterial({
                ic: VALID_G1_POINTS.slice(1, 10).flat(),
              }),
            },
          }),
        },
        "video-transcript-bn254-verifier-material-scan",
      ],
    ];

    for (const [name, overrides, checkId] of cases) {
      const report = evaluate(overrides);
      const serialized = JSON.stringify(report);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, checkId)?.detail, name).toContain(
        "invalid BN254 verifier material",
      );
      expect(serialized, name).not.toContain(BN254_BASE_FIELD_MODULUS);
      expect(serialized, name).not.toContain("verifierMaterial");
      expect(serialized, name).not.toContain("alpha1");
      expect(serialized, name).not.toContain("beta2");
      expect(serialized, name).not.toContain("gamma2");
      expect(serialized, name).not.toContain("delta2");
    }
  });

  it("rejects aggregate input reports carrying known diagnostic verifier key hashes without relying on warning text", () => {
    const readinessBinding = videoTranscript().readinessBinding;
    const cases = [
      [
        "route report",
        {
          routeReport: routeReport({
            deployment: {
              ...routeReport().deployment,
              verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            },
          }),
        },
        "route-report-diagnostic-verifier-key-hash-scan",
      ],
      [
        "peer audit report",
        {
          peerAuditReport: peerAuditReport({
            peers: [
              {
                ...peerAuditReport().peers[0],
                deployment: {
                  ...peerAuditReport().peers[0].deployment,
                  verifier_key_hash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
                },
              },
              ...peerAuditReport().peers.slice(1),
            ],
          }),
        },
        "peer-audit-diagnostic-verifier-key-hash-scan",
      ],
      [
        "smoke readiness report",
        {
          smokeReadinessReport: smokeReadinessReport({
            route: {
              ...smokeReadinessReport().route,
              deployment: {
                ...smokeReadinessReport().route.deployment,
                bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
              },
            },
          }),
        },
        "smoke-readiness-diagnostic-verifier-key-hash-scan",
      ],
      [
        "material inventory report",
        {
          materialInventoryReport: materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: {
                ...materialInventoryReport().route.deployment,
                vkHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
              },
            },
          }),
        },
        "material-inventory-diagnostic-verifier-key-hash-scan",
      ],
      [
        "video transcript",
        {
          videoTranscript: videoTranscript({
            readinessBinding: {
              ...readinessBinding,
              route: {
                ...readinessBinding.route,
                deployment: {
                  ...readinessBinding.route.deployment,
                  configuredVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
                },
              },
            },
          }),
        },
        "video-transcript-diagnostic-verifier-key-hash-scan",
      ],
    ];

    for (const [name, overrides, checkId] of cases) {
      const report = evaluate(overrides);
      const serialized = JSON.stringify(report);
      expect(report.ready, name).toBe(false);
      expect(failedCheck(report, checkId)?.detail, name).toContain(
        "known diagnostic BSC verifier key hash",
      );
      expect(serialized, name).not.toContain("bridgeVerifierKeyHash");
      expect(serialized, name).not.toContain("configuredVerifierKeyHash");
      expect(serialized, name).not.toContain("vkHash");
    }
  });

  it("loads report files and preserves only public summaries", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 7);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshots = screenshotFileFixtures(9);
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    await writeScreenshotFileFixtures(dir, screenshots);
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          outputDir: "external-proof-output",
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.videoProof?.proofFilesReverified).toBe(true);
    expect(
      report.videoProof?.videoArtifacts.every(
        (artifact) => artifact.fileReverified === true,
      ),
    ).toBe(true);
    expect(
      report.videoProof?.explorerScreenshots.every(
        (screenshot) => screenshot.fileReverified === true,
      ),
    ).toBe(true);
    expect(report.peerAudit?.sanitizedStanzaFilesChecked).toBe(true);
    expect(
      report.peerAudit?.peers.every((peer) => peer.sanitizedStanzaFileVerified),
    ).toBe(true);
    expect(JSON.parse(await readFile(files.route, "utf8")).deployment).toEqual(
      deployment(),
    );
    expect(report.checkedAt).toBe("2026-06-06T00:00:00.000Z");

    const defaultPathReport = await runBscSccpProductionGate({
      defaultReportPaths: {
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
      },
      checkedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(defaultPathReport.ready).toBe(true);
    expect(defaultPathReport.route?.deployment).toEqual(deployment());
  });

  it("rejects file-backed video proof transcripts that claim a different outputDir", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 41);
      const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
      const screenshots = screenshotFileFixtures(43);
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir);
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(path.join(dir, "video.webm"), videoBytes);
      await writeScreenshotFileFixtures(dir, screenshots);
      await writeFile(
        files.video,
        JSON.stringify(
          videoTranscript({
            outputDir: "output/sccp-bsc-live-proof/claimed-run",
            videoArtifacts: [
              {
                ...VIDEO_ARTIFACT,
                relativePath: "video.webm",
                sizeBytes: videoBytes.length,
                sha256: videoSha256,
              },
            ],
            evidence: {
              ...videoEvidence(),
              videoArtifactEvidence: {
                ready: true,
                missingVideoArtifacts: [],
                capturedArtifacts: [
                  {
                    relativePath: VIDEO_ARTIFACT.relativePath,
                    sizeBytes: videoBytes.length,
                    sha256: videoSha256,
                    mediaType: VIDEO_ARTIFACT.mediaType,
                  },
                ],
              },
            },
            explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
          }),
        ),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.videoProof?.proofFilesReverified).toBe(false);
      expect(
        failedCheck(report, "video-proof-files-reverified")?.detail,
      ).toMatch(/outputDir does not resolve to the transcript directory/u);
      expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
      expect(failedCheck(report, "video-proof-complete")).toBeUndefined();
      expect(JSON.stringify(report)).not.toContain(dir);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("accepts file-backed video proof transcripts in the declared repo outputDir", async () => {
    const outputRoot = path.join(process.cwd(), "output");
    await mkdir(outputRoot, { recursive: true });
    const dir = await mkdtemp(
      path.join(outputRoot, "sccp-bsc-prod-gate-proof-"),
    );
    try {
      const outputDir = path.relative(process.cwd(), dir).replace(/\\/gu, "/");
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 47);
      const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
      const screenshots = screenshotFileFixtures(49);
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir);
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(path.join(dir, "video.webm"), videoBytes);
      await writeScreenshotFileFixtures(dir, screenshots);
      await writeFile(
        files.video,
        JSON.stringify(
          videoTranscript({
            outputDir,
            videoArtifacts: [
              {
                ...VIDEO_ARTIFACT,
                relativePath: "video.webm",
                sizeBytes: videoBytes.length,
                sha256: videoSha256,
              },
            ],
            evidence: {
              ...videoEvidence(),
              videoArtifactEvidence: {
                ready: true,
                missingVideoArtifacts: [],
                capturedArtifacts: [
                  {
                    relativePath: VIDEO_ARTIFACT.relativePath,
                    sizeBytes: videoBytes.length,
                    sha256: videoSha256,
                    mediaType: VIDEO_ARTIFACT.mediaType,
                  },
                ],
              },
            },
            explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
          }),
        ),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
      expect(report.videoProof?.outputDir).toBe(outputDir);
      expect(report.videoProof?.proofFilesReverified).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on symlinked file-backed report inputs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const target = path.join(dir, "route.target.json");
      const link = path.join(dir, "route.json");
      await writeFile(target, JSON.stringify(routeReport()), "utf8");
      await symlink(target, link);

      const report = await runBscSccpProductionGate({
        routeReportPath: link,
        peerAuditReportPath: path.join(dir, "missing-peer.json"),
        smokeReadinessReportPath: path.join(dir, "missing-smoke.json"),
        materialInventoryReportPath: path.join(dir, "missing-inventory.json"),
        videoTranscriptPath: path.join(dir, "missing-video.json"),
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.reasons.join("\n")).toMatch(/route report.*symbolic link/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on duplicate JSON keys in file-backed report inputs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const route = path.join(dir, "route.json");
      const duplicateRouteReport = JSON.stringify(routeReport(), null, 2)
        .replace('"ready": true,', '"ready": false,\n  "ready": true,')
        .concat("\n");
      await writeFile(route, duplicateRouteReport, "utf8");

      const report = await runBscSccpProductionGate({
        routeReportPath: route,
        peerAuditReportPath: path.join(dir, "missing-peer.json"),
        smokeReadinessReportPath: path.join(dir, "missing-smoke.json"),
        materialInventoryReportPath: path.join(dir, "missing-inventory.json"),
        videoTranscriptPath: path.join(dir, "missing-video.json"),
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.reasons.join("\n")).toMatch(
        /route report.*duplicate JSON object key/u,
      );
      expect(JSON.stringify(report)).not.toContain('"ready":true');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on oversized file-backed report inputs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const route = path.join(dir, "route.json");
      await writeFile(
        route,
        JSON.stringify({ ready: true, padding: "x".repeat(4 * 1024 * 1024) }),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: route,
        peerAuditReportPath: path.join(dir, "missing-peer.json"),
        smokeReadinessReportPath: path.join(dir, "missing-smoke.json"),
        materialInventoryReportPath: path.join(dir, "missing-inventory.json"),
        videoTranscriptPath: path.join(dir, "missing-video.json"),
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.reasons.join("\n")).toMatch(
        /route report.*maximum allowed/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("fails closed on non-object file-backed report JSON", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const route = path.join(dir, "route.json");
      await writeFile(route, JSON.stringify([]), "utf8");

      const report = await runBscSccpProductionGate({
        routeReportPath: route,
        peerAuditReportPath: path.join(dir, "missing-peer.json"),
        smokeReadinessReportPath: path.join(dir, "missing-smoke.json"),
        materialInventoryReportPath: path.join(dir, "missing-inventory.json"),
        videoTranscriptPath: path.join(dir, "missing-video.json"),
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.reasons.join("\n")).toMatch(/route report.*JSON object/u);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects file-backed video proof transcripts with tampered artifact bytes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 31);
    const declaredVideoSha256 = createHash("sha256")
      .update(webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 32))
      .digest("hex");
    const screenshotBytes = pngBytes(2048, 37);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const tamperedScreenshotBytes = pngBytes(2048, 41);
    const declaredTamperedScreenshotSha256 = createHash("sha256")
      .update(pngBytes(2048, 42))
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(
        path.join(dir, `${entry.kind}.png`),
        entry.kind === "bscBurnTx" ? tamperedScreenshotBytes : screenshotBytes,
      );
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: declaredVideoSha256,
            },
          ],
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes:
                entry.kind === "bscBurnTx"
                  ? tamperedScreenshotBytes.length
                  : screenshotBytes.length,
              sha256:
                entry.kind === "bscBurnTx"
                  ? declaredTamperedScreenshotSha256
                  : screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscBurnTx explorer screenshot is missing/u,
    );
    expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(false);
    expect(
      report.videoProof?.explorerScreenshots.find(
        (entry) => entry.kind === "bscBurnTx",
      )?.fileVerified,
    ).toBe(false);
  });

  it("rejects file-backed video proof transcripts with wrong artifact media bytes", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = Buffer.alloc(VIDEO_ARTIFACT_SIZE_BYTES, 51);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 53);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const invalidScreenshotBytes = forgedPngSignatureOnlyBytes(2048, 57);
    const invalidScreenshotSha256 = createHash("sha256")
      .update(invalidScreenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(
        path.join(dir, `${entry.kind}.png`),
        entry.kind === "bscBurnTx" ? invalidScreenshotBytes : screenshotBytes,
      );
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes:
                entry.kind === "bscBurnTx"
                  ? invalidScreenshotBytes.length
                  : screenshotBytes.length,
              sha256:
                entry.kind === "bscBurnTx"
                  ? invalidScreenshotSha256
                  : screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscBurnTx explorer screenshot is missing/u,
    );
    expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].mediaType).toBe("unknown");
    expect(
      report.videoProof?.explorerScreenshots.find(
        (entry) => entry.kind === "bscBurnTx",
      )?.mediaType,
    ).toBe("unknown");
  });

  it("rejects file-backed video proof transcripts with tiny explorer screenshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 61);
      const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
      const screenshots = screenshotFileFixtures(63);
      const tinyScreenshotBytes = pngBytes(2048, 71, {
        width: 1,
        height: 1,
      });
      screenshots.bscBurnTx = {
        bytes: tinyScreenshotBytes,
        sha256: createHash("sha256").update(tinyScreenshotBytes).digest("hex"),
      };
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir);
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(path.join(dir, "video.webm"), videoBytes);
      await writeScreenshotFileFixtures(dir, screenshots);
      await writeFile(
        files.video,
        JSON.stringify(
          videoTranscript({
            videoArtifacts: [
              {
                ...VIDEO_ARTIFACT,
                relativePath: "video.webm",
                sizeBytes: videoBytes.length,
                sha256: videoSha256,
              },
            ],
            evidence: {
              ...videoEvidence(),
              videoArtifactEvidence: {
                ready: true,
                missingVideoArtifacts: [],
                capturedArtifacts: [
                  {
                    relativePath: VIDEO_ARTIFACT.relativePath,
                    sizeBytes: videoBytes.length,
                    sha256: videoSha256,
                    mediaType: VIDEO_ARTIFACT.mediaType,
                  },
                ],
              },
            },
            explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
          }),
        ),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.videoProof?.proofFilesReverified).toBe(false);
      expect(
        failedCheck(report, "video-proof-files-reverified")?.detail,
      ).toMatch(/video proof file reverification did not pass/u);
      expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
        /bscBurnTx explorer screenshot is missing/u,
      );
      expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(true);
      const tinyScreenshot = report.videoProof?.explorerScreenshots.find(
        (entry) => entry.kind === "bscBurnTx",
      );
      expect(tinyScreenshot).toMatchObject({
        mediaType: "image/png",
        fileVerified: false,
        fileReverified: false,
      });
      expect(tinyScreenshot?.fileVerificationError).toMatch(
        /at least 640x480 pixels, got 1x1/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects file-backed video proof transcripts with invalid PNG IDAT streams", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 73);
      const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
      const screenshots = screenshotFileFixtures(75);
      const invalidScreenshotBytes = pngBytesWithInvalidIdat(2048, 77);
      screenshots.bscBurnTx = {
        bytes: invalidScreenshotBytes,
        sha256: createHash("sha256")
          .update(invalidScreenshotBytes)
          .digest("hex"),
      };
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir);
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(path.join(dir, "video.webm"), videoBytes);
      await writeScreenshotFileFixtures(dir, screenshots);
      await writeFile(
        files.video,
        JSON.stringify(
          videoTranscript({
            videoArtifacts: [
              {
                ...VIDEO_ARTIFACT,
                relativePath: "video.webm",
                sizeBytes: videoBytes.length,
                sha256: videoSha256,
              },
            ],
            evidence: {
              ...videoEvidence(),
              videoArtifactEvidence: {
                ready: true,
                missingVideoArtifacts: [],
                capturedArtifacts: [
                  {
                    relativePath: VIDEO_ARTIFACT.relativePath,
                    sizeBytes: videoBytes.length,
                    sha256: videoSha256,
                    mediaType: VIDEO_ARTIFACT.mediaType,
                  },
                ],
              },
            },
            explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
          }),
        ),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.videoProof?.proofFilesReverified).toBe(false);
      expect(
        failedCheck(report, "video-proof-files-reverified")?.detail,
      ).toMatch(/video proof file reverification did not pass/u);
      expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
        /bscBurnTx explorer screenshot is missing/u,
      );
      const invalidScreenshot = report.videoProof?.explorerScreenshots.find(
        (entry) => entry.kind === "bscBurnTx",
      );
      expect(invalidScreenshot).toMatchObject({
        mediaType: "unknown",
        fileVerified: false,
        fileReverified: false,
      });
      expect(invalidScreenshot?.fileVerificationError).toMatch(
        /expected image\/png media, got unknown/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects file-backed video proof transcripts with uniform explorer screenshots", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    try {
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 79);
      const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
      const screenshots = screenshotFileFixtures(81);
      const uniformScreenshotBytes = uniformPngBytes(2048, 83);
      screenshots.bscBurnTx = {
        bytes: uniformScreenshotBytes,
        sha256: createHash("sha256")
          .update(uniformScreenshotBytes)
          .digest("hex"),
      };
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir);
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(path.join(dir, "video.webm"), videoBytes);
      await writeScreenshotFileFixtures(dir, screenshots);
      await writeFile(
        files.video,
        JSON.stringify(
          videoTranscript({
            videoArtifacts: [
              {
                ...VIDEO_ARTIFACT,
                relativePath: "video.webm",
                sizeBytes: videoBytes.length,
                sha256: videoSha256,
              },
            ],
            evidence: {
              ...videoEvidence(),
              videoArtifactEvidence: {
                ready: true,
                missingVideoArtifacts: [],
                capturedArtifacts: [
                  {
                    relativePath: VIDEO_ARTIFACT.relativePath,
                    sizeBytes: videoBytes.length,
                    sha256: videoSha256,
                    mediaType: VIDEO_ARTIFACT.mediaType,
                  },
                ],
              },
            },
            explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
          }),
        ),
        "utf8",
      );

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: "2026-06-06T00:00:00.000Z",
      });

      expect(report.ready).toBe(false);
      expect(report.videoProof?.proofFilesReverified).toBe(false);
      expect(
        failedCheck(report, "video-proof-files-reverified")?.detail,
      ).toMatch(/video proof file reverification did not pass/u);
      expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
        /bscBurnTx explorer screenshot is missing/u,
      );
      const uniformScreenshot = report.videoProof?.explorerScreenshots.find(
        (entry) => entry.kind === "bscBurnTx",
      );
      expect(uniformScreenshot).toMatchObject({
        mediaType: "image/png",
        fileVerified: false,
        fileReverified: false,
      });
      expect(uniformScreenshot?.fileVerificationError).toMatch(
        /non-trivial pixel variation/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects file-backed video proof transcripts with forged WebM container headers", async () => {
    for (const [name, videoBytes] of [
      [
        "doctype substring only",
        forgedWebmSubstringBytes(VIDEO_ARTIFACT_SIZE_BYTES, 101),
      ],
      [
        "wrong doctype value",
        forgedWebmWrongDocTypeBytes(VIDEO_ARTIFACT_SIZE_BYTES, 103),
      ],
      [
        "wrong doctype size",
        forgedWebmWrongDocTypeSizeBytes(VIDEO_ARTIFACT_SIZE_BYTES, 105),
      ],
      [
        "missing segment element",
        forgedWebmWithoutSegmentBytes(VIDEO_ARTIFACT_SIZE_BYTES, 107),
      ],
      [
        "missing info element",
        forgedWebmWithoutInfoBytes(VIDEO_ARTIFACT_SIZE_BYTES, 109),
      ],
      [
        "missing tracks element",
        forgedWebmWithoutTracksBytes(VIDEO_ARTIFACT_SIZE_BYTES, 111),
      ],
      [
        "missing cluster element",
        forgedWebmWithoutClusterBytes(VIDEO_ARTIFACT_SIZE_BYTES, 113),
      ],
      [
        "missing block element",
        forgedWebmWithoutBlockBytes(VIDEO_ARTIFACT_SIZE_BYTES, 115),
      ],
      [
        "tiny padded frame payload",
        forgedWebmTinyPaddedBytes(VIDEO_ARTIFACT_SIZE_BYTES, 117),
      ],
      [
        "dominant-byte padded frame payload",
        forgedWebmDominantPaddedBytes(VIDEO_ARTIFACT_SIZE_BYTES, 119),
      ],
    ]) {
      const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
      try {
        const files = {
          route: path.join(dir, "route.json"),
          peer: path.join(dir, "peer.json"),
          smoke: path.join(dir, "smoke.json"),
          inventory: path.join(dir, "inventory.json"),
          video: path.join(dir, "video.json"),
        };
        const videoSha256 = createHash("sha256")
          .update(videoBytes)
          .digest("hex");
        const screenshots = screenshotFileFixtures(109);
        const { peerAudit, smokeReadiness } =
          await writeFileBackedPeerAuditReports(dir);
        await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
        await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
        await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
        await writeFile(
          files.inventory,
          JSON.stringify(materialInventoryReport()),
          "utf8",
        );
        await writeFile(path.join(dir, "video.webm"), videoBytes);
        await writeScreenshotFileFixtures(dir, screenshots);
        await writeFile(
          files.video,
          JSON.stringify(
            videoTranscript({
              videoArtifacts: [
                {
                  ...VIDEO_ARTIFACT,
                  relativePath: "video.webm",
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                },
              ],
              evidence: {
                ...videoEvidence(),
                videoArtifactEvidence: {
                  ready: true,
                  missingVideoArtifacts: [],
                  capturedArtifacts: [
                    {
                      relativePath: VIDEO_ARTIFACT.relativePath,
                      sizeBytes: videoBytes.length,
                      sha256: videoSha256,
                      mediaType: VIDEO_ARTIFACT.mediaType,
                    },
                  ],
                },
              },
              explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
            }),
          ),
          "utf8",
        );

        const report = await runBscSccpProductionGate({
          routeReportPath: files.route,
          peerAuditReportPath: files.peer,
          smokeReadinessReportPath: files.smoke,
          materialInventoryReportPath: files.inventory,
          videoTranscriptPath: files.video,
          checkedAt: "2026-06-06T00:00:00.000Z",
        });

        expect(report.ready, name).toBe(false);
        expect(report.videoProof?.proofFilesReverified, name).toBe(false);
        expect(
          failedCheck(report, "video-proof-files-reverified")?.detail,
          name,
        ).toMatch(/video proof file reverification did not pass/u);
        expect(
          failedCheck(report, "video-artifact-captured")?.detail,
          name,
        ).toMatch(/recorded UI video artifact is missing/u);
        expect(report.videoProof?.videoArtifacts[0], name).toMatchObject({
          relativePath: "video.webm",
          sizeBytes: videoBytes.length,
          mediaType: "unknown",
          fileVerified: false,
          fileReverified: false,
        });
        expect(
          report.videoProof?.videoArtifacts[0].fileVerificationError,
          name,
        ).toMatch(/expected video\/webm media, got unknown/u);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    }
  });

  it("rejects file-backed video proof transcripts with missing declared media types", async () => {
    const withoutMediaType = (entry) => {
      const copy = { ...entry };
      delete copy.mediaType;
      return copy;
    };
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 59);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 63);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(path.join(dir, `${entry.kind}.png`), screenshotBytes);
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            withoutMediaType({
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            }),
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => {
              const screenshot = {
                ...entry,
                relativePath: `${entry.kind}.png`,
                sizeBytes: screenshotBytes.length,
                sha256: screenshotSha256,
              };
              return entry.kind === "bscBurnTx"
                ? withoutMediaType(screenshot)
                : screenshot;
            },
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    const bscBurnScreenshot = report.videoProof?.explorerScreenshots.find(
      (entry) => entry.kind === "bscBurnTx",
    );
    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscBurnTx explorer screenshot is missing/u,
    );
    expect(report.videoProof?.videoArtifacts[0]).toMatchObject({
      fileVerified: false,
      fileReverified: false,
      fileVerificationError: "declared mediaType is missing",
    });
    expect(bscBurnScreenshot).toMatchObject({
      fileVerified: false,
      fileReverified: false,
      fileVerificationError: "declared mediaType is missing",
    });
  });

  it("rejects file-backed explorer screenshot proof path reuse after rehashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 64);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 66);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(path.join(dir, `${entry.kind}.png`), screenshotBytes);
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath:
                entry.kind === "tairaSettlementTx"
                  ? "tairaSourceTx.png"
                  : `${entry.kind}.png`,
              sizeBytes: screenshotBytes.length,
              sha256: screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /tairaSettlementTx explorer screenshot reuses proof file from tairaSourceTx/u,
    );
    const settlementScreenshot = report.videoProof?.explorerScreenshots.find(
      (entry) => entry.kind === "tairaSettlementTx",
    );
    expect(settlementScreenshot).toMatchObject({
      relativePath: "tairaSourceTx.png",
      fileVerified: true,
      fileReverified: true,
    });
  });

  it("rejects file-backed explorer screenshot proof hash reuse after rehashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 70);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const reusedScreenshotBytes = pngBytes(2048, 71);
    const reusedScreenshotSha256 = createHash("sha256")
      .update(reusedScreenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(
        path.join(dir, `${entry.kind}.png`),
        reusedScreenshotBytes,
      );
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes: reusedScreenshotBytes.length,
              sha256: reusedScreenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscFinalizeTx explorer screenshot reuses proof file hash from tairaSourceTx explorer screenshot/u,
    );
    expect(
      report.videoProof?.explorerScreenshots.every(
        (entry) => entry.fileReverified === true,
      ),
    ).toBe(true);
  });

  it("rejects file-backed video proof artifacts that symlink outside the transcript directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const outsideDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-prod-gate-escape-"),
    );
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 61);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshots = screenshotFileFixtures(67);
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    const escapedVideoPath = path.join(outsideDir, "video.webm");
    await writeFile(escapedVideoPath, videoBytes);
    await symlink(escapedVideoPath, path.join(dir, "video.webm"));
    await writeScreenshotFileFixtures(dir, screenshots);
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")).toBeUndefined();
    expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileReverified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileVerificationError).toMatch(
      /symbolic link/u,
    );
  });

  it("rejects file-backed video proof artifacts that symlink inside the transcript directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 71);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshots = screenshotFileFixtures(73);
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    const actualVideoPath = path.join(dir, "actual-video.webm");
    await writeFile(actualVideoPath, videoBytes);
    await symlink(actualVideoPath, path.join(dir, "video.webm"));
    await writeScreenshotFileFixtures(dir, screenshots);
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(failedCheck(report, "video-proof-complete")).toBeUndefined();
    expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileReverified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileVerificationError).toMatch(
      /symbolic link/u,
    );
  });

  it("rejects file-backed explorer screenshot proof artifacts that are symlinks", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 79);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 83);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      const screenshotPath = path.join(dir, `${entry.kind}.png`);
      if (entry.kind === "bscBurnTx") {
        const actualScreenshotPath = path.join(dir, "actual-bscBurnTx.png");
        await writeFile(actualScreenshotPath, screenshotBytes);
        await symlink(actualScreenshotPath, screenshotPath);
      } else {
        await writeFile(screenshotPath, screenshotBytes);
      }
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes: screenshotBytes.length,
              sha256: screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    const bscBurnScreenshot = report.videoProof?.explorerScreenshots.find(
      (entry) => entry.kind === "bscBurnTx",
    );

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscBurnTx explorer screenshot is missing/u,
    );
    expect(bscBurnScreenshot?.fileVerified).toBe(false);
    expect(bscBurnScreenshot?.fileReverified).toBe(false);
    expect(bscBurnScreenshot?.fileVerificationError).toMatch(/symbolic link/u);
  });

  it("rejects oversized file-backed video proof artifacts before hashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const screenshotBytes = pngBytes(2048, 89);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), "");
    await truncate(path.join(dir, "video.webm"), MAX_VIDEO_ARTIFACT_BYTES + 1);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(path.join(dir, `${entry.kind}.png`), screenshotBytes);
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: MAX_VIDEO_ARTIFACT_BYTES + 1,
              sha256: "ab".repeat(32),
            },
          ],
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes: screenshotBytes.length,
              sha256: screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(report.videoProof?.videoArtifacts[0].fileVerified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileReverified).toBe(false);
    expect(report.videoProof?.videoArtifacts[0].fileVerificationError).toMatch(
      /maximum allowed/u,
    );
  });

  it("rejects undersized file-backed video proof artifacts even when media bytes match", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(512, 93);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 95);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      await writeFile(path.join(dir, `${entry.kind}.png`), screenshotBytes);
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          evidence: {
            ...videoEvidence(),
            videoArtifactEvidence: {
              ready: true,
              missingVideoArtifacts: [],
              capturedArtifacts: [
                {
                  relativePath: VIDEO_ARTIFACT.relativePath,
                  sizeBytes: videoBytes.length,
                  sha256: videoSha256,
                  mediaType: VIDEO_ARTIFACT.mediaType,
                },
              ],
            },
          },
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes: screenshotBytes.length,
              sha256: screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")?.detail).toMatch(
      /recorded UI video artifact is missing/u,
    );
    expect(report.videoProof?.videoArtifacts[0]).toMatchObject({
      sizeBytes: videoBytes.length,
      fileVerified: false,
      fileReverified: false,
    });
    expect(report.videoProof?.videoArtifacts[0].fileVerificationError).toMatch(
      /minimum required/u,
    );
  });

  it("rejects oversized file-backed explorer screenshot proofs before hashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 91);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshotBytes = pngBytes(2048, 97);
    const screenshotSha256 = createHash("sha256")
      .update(screenshotBytes)
      .digest("hex");
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    for (const entry of videoTranscript().explorerScreenshots) {
      const screenshotPath = path.join(dir, `${entry.kind}.png`);
      if (entry.kind === "bscBurnTx") {
        await writeFile(screenshotPath, "");
        await truncate(screenshotPath, MAX_SCREENSHOT_ARTIFACT_BYTES + 1);
      } else {
        await writeFile(screenshotPath, screenshotBytes);
      }
    }
    await writeFile(
      files.video,
      JSON.stringify(
        videoTranscript({
          videoArtifacts: [
            {
              ...VIDEO_ARTIFACT,
              relativePath: "video.webm",
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
            },
          ],
          explorerScreenshots: videoTranscript().explorerScreenshots.map(
            (entry) => ({
              ...entry,
              relativePath: `${entry.kind}.png`,
              sizeBytes:
                entry.kind === "bscBurnTx"
                  ? MAX_SCREENSHOT_ARTIFACT_BYTES + 1
                  : screenshotBytes.length,
              sha256:
                entry.kind === "bscBurnTx" ? "cd".repeat(32) : screenshotSha256,
            }),
          ),
        }),
      ),
      "utf8",
    );

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: "2026-06-06T00:00:00.000Z",
    });
    const bscBurnScreenshot = report.videoProof?.explorerScreenshots.find(
      (entry) => entry.kind === "bscBurnTx",
    );

    expect(report.ready).toBe(false);
    expect(report.videoProof?.proofFilesReverified).toBe(false);
    expect(failedCheck(report, "video-proof-files-reverified")?.detail).toMatch(
      /video proof file reverification did not pass/u,
    );
    expect(failedCheck(report, "video-artifact-captured")).toBeUndefined();
    expect(failedCheck(report, "video-proof-complete")?.detail).toMatch(
      /bscBurnTx explorer screenshot is missing/u,
    );
    expect(bscBurnScreenshot?.fileVerified).toBe(false);
    expect(bscBurnScreenshot?.fileReverified).toBe(false);
    expect(bscBurnScreenshot?.fileVerificationError).toMatch(
      /maximum allowed/u,
    );
  });

  it("fails closed when production-gate refresh preserves peer audit evidence without peer inputs", () => {
    const report = evaluateBscSccpProductionGate({
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport(),
      smokeReadinessReport: smokeReadinessReport(),
      materialInventoryReport: materialInventoryReport(),
      videoTranscript: videoTranscript(),
      peerAuditRefresh: {
        mode: "preserved",
        inputSource: "existing-report",
        refreshed: false,
        reportExisted: true,
        reason:
          "No local or remote peer-audit inputs were provided; the existing peer audit report was preserved.",
      },
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-audit-refresh-source")?.message).toBe(
      "Peer audit evidence preservation during production-gate refresh is audited.",
    );
    expect(failedCheck(report, "peer-audit-refresh-source")?.detail).toMatch(
      /preserved instead of regenerated/u,
    );
    expect(report.peerAuditRefresh).toEqual({
      mode: "preserved",
      inputSource: "existing-report",
      refreshed: false,
      reportExisted: true,
      reason:
        "No local or remote peer-audit inputs were provided; the existing peer audit report was preserved.",
    });
    const actions = Object.fromEntries(
      report.nextActions.map((action) => [action.id, action]),
    );
    expect(report.nextActions.map((action) => action.id)).toEqual(
      expect.arrayContaining([
        "refresh-peer-audit-evidence",
        "record-live-video-proof",
      ]),
    );
    expect(actions["refresh-readiness-evidence"]).toBeUndefined();
    expect(actions["deploy-peer-route-config"]).toBeUndefined();
    expect(actions["refresh-peer-audit-evidence"].blockedByChecks).toEqual([
      "peer-audit-refresh-source",
    ]);
    expect(actions["refresh-peer-audit-evidence"].requiredInputs).toEqual([
      expect.objectContaining({
        id: "peer-config-audit-source",
        kind: "directory-or-remote",
        placeholder: "<peer-config-audit-source>",
      }),
    ]);
    expect(actions["refresh-peer-audit-evidence"].commands[1]).toContain(
      "--peer-audit-dir <peer-config-audit-source>",
    );
    expect(report.missingProductionInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "peer-config-audit-source",
          blockedByActions: ["refresh-peer-audit-evidence"],
        }),
      ]),
    );
  });

  it("does not claim peer-audit regeneration for non-refresh production-gate runs", () => {
    const report = evaluateBscSccpProductionGate({
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport(),
      smokeReadinessReport: smokeReadinessReport(),
      materialInventoryReport: materialInventoryReport(),
      videoTranscript: videoTranscript(),
      checkedAt: NOW_ISO,
    });
    const provenanceCheck = passedCheck(report, "peer-audit-refresh-source");

    expect(provenanceCheck?.message).toBe(
      "Peer audit evidence provenance is accepted for a non-refresh production-gate run.",
    );
    expect(JSON.stringify(provenanceCheck)).not.toMatch(/regenerated/iu);
    expect(report.peerAuditRefresh).toBeNull();
  });

  it("reports explicit peer-audit refresh input when evidence is regenerated", () => {
    const report = evaluateBscSccpProductionGate({
      routeReport: routeReport(),
      peerAuditReport: peerAuditReport(),
      smokeReadinessReport: smokeReadinessReport(),
      materialInventoryReport: materialInventoryReport(),
      videoTranscript: videoTranscript(),
      peerAuditRefresh: {
        mode: "regenerated",
        inputSource: "local-files",
        refreshed: true,
        reportExisted: true,
        reason:
          "Peer audit report was regenerated during production-gate refresh.",
      },
      checkedAt: NOW_ISO,
    });

    expect(passedCheck(report, "peer-audit-refresh-source")?.message).toBe(
      "Peer audit evidence was regenerated from explicit local-files production-gate refresh input.",
    );
    expect(report.peerAuditRefresh).toEqual({
      mode: "regenerated",
      inputSource: "local-files",
      refreshed: true,
      reportExisted: true,
      reason:
        "Peer audit report was regenerated during production-gate refresh.",
    });
  });

  it("reports stale preserved peer-audit contract failures during production-gate refresh", () => {
    const basePeerAudit = peerAuditReport();
    const preservedRefresh = {
      mode: "preserved",
      inputSource: "existing-report",
      refreshed: false,
      reportExisted: true,
      reason:
        "No local or remote peer-audit inputs were provided; the existing peer audit report was preserved.",
    };
    const cases = [
      [
        "missing runbook contract",
        peerAuditReport({
          checks: basePeerAudit.checks.filter(
            (entry) => entry.id !== "peer-audit-runbook-contract",
          ),
        }),
        /preserved peer audit report is incomplete: .*peer-audit-runbook-contract/u,
      ],
      [
        "failed peer production check",
        peerAuditReport({
          checks: basePeerAudit.checks.map((entry) =>
            entry.id === "peer-route-production-readiness"
              ? {
                  ...entry,
                  ok: false,
                  status: "fail",
                  detail:
                    "deployed peers still carry diagnostic verifier material",
                }
              : entry,
          ),
        }),
        /preserved peer audit report contains failed checks: peer-route-production-readiness: deployed peers still carry diagnostic verifier material/u,
      ],
    ];

    for (const [name, stalePeerAudit, detail] of cases) {
      const report = evaluateBscSccpProductionGate({
        routeReport: routeReport(),
        peerAuditReport: stalePeerAudit,
        smokeReadinessReport: smokeReadinessReport(),
        materialInventoryReport: materialInventoryReport(),
        videoTranscript: videoTranscript(),
        peerAuditRefresh: preservedRefresh,
        checkedAt: NOW_ISO,
      });

      expect(report.ready, name).toBe(false);
      expect(
        failedCheck(report, "peer-audit-refresh-source")?.detail,
        name,
      ).toMatch(/preserved instead of regenerated/u);
      expect(
        failedCheck(report, "peer-audit-refresh-source")?.detail,
        name,
      ).toMatch(detail);
      expect(
        report.nextActions.map((action) => action.id),
        name,
      ).toContain("refresh-peer-audit-evidence");
      expect(report.missingProductionInputs, name).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: "peer-config-audit-source",
            blockedByActions: expect.arrayContaining([
              "refresh-peer-audit-evidence",
            ]),
          }),
        ]),
      );
    }
  });

  it("rejects mixed local and remote peer audit refresh sources before regenerating reports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: "",
    };
    let routeCalls = 0;

    try {
      await expect(
        refreshBscSccpProductionGateReports({
          defaultReportPaths: paths,
          peerAuditDir: path.join(dir, "peer-configs"),
          peerAuditSshHost: "ops@taira.example",
          refreshRunners: {
            runRoutePreflight: async () => {
              routeCalls += 1;
              return routeReport();
            },
            runPeerConfigAudit: async () => peerAuditReport(),
            runSmokeReadiness: async () => smokeReadinessReport(),
            runMaterialInventory: async () => materialInventoryReport(),
          },
        }),
      ).rejects.toThrow(/Conflicting BSC production-gate peer audit sources/u);

      expect(routeCalls).toBe(0);
      await expect(readFile(paths.routeReportPath, "utf8")).rejects.toThrow(
        /ENOENT/u,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects ambiguous remote peer audit credentials before regenerating reports", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const missingCredsFile = path.join(dir, "missing-creds.txt");
    const missingPasswordFile = path.join(dir, "missing-password.txt");
    const cases = [
      {
        name: "host-with-creds-file",
        input: {
          peerAuditSshHost: "ops@taira.example",
          peerAuditSshCredsFile: missingCredsFile,
        },
        pattern:
          /Conflicting BSC peer-config audit SSH host sources: sshHost.*sshCredsFile/u,
      },
      {
        name: "runtime-password-with-password-file",
        input: {
          peerAuditSshHost: "ops@taira.example",
          peerAuditSshPassword: "runtime-password",
          peerAuditSshPasswordFile: missingPasswordFile,
        },
        pattern:
          /Conflicting BSC peer-config audit SSH credential sources: sshPassword.*sshPasswordFile/u,
      },
      {
        name: "runtime-password-with-creds-file",
        input: {
          peerAuditSshPassword: "runtime-password",
          peerAuditSshCredsFile: missingCredsFile,
        },
        pattern:
          /Conflicting BSC peer-config audit SSH credential sources: sshPassword.*sshCredsFile/u,
      },
      {
        name: "password-file-with-creds-file",
        input: {
          peerAuditSshPasswordFile: missingPasswordFile,
          peerAuditSshCredsFile: missingCredsFile,
        },
        pattern:
          /Conflicting BSC peer-config audit SSH credential sources: sshPasswordFile.*sshCredsFile/u,
      },
    ];

    try {
      for (const testCase of cases) {
        const paths = {
          routeReportPath: path.join(dir, `${testCase.name}-route.json`),
          peerAuditReportPath: path.join(dir, `${testCase.name}-peer.json`),
          smokeReadinessReportPath: path.join(
            dir,
            `${testCase.name}-smoke.json`,
          ),
          materialInventoryReportPath: path.join(
            dir,
            `${testCase.name}-inventory.json`,
          ),
          videoTranscriptPath: "",
        };
        let routeCalls = 0;

        await expect(
          refreshBscSccpProductionGateReports({
            defaultReportPaths: paths,
            ...testCase.input,
            refreshRunners: {
              runRoutePreflight: async () => {
                routeCalls += 1;
                return routeReport();
              },
              runRemotePeerConfigAudit: async () => peerAuditReport(),
              runSmokeReadiness: async () => smokeReadinessReport(),
              runMaterialInventory: async () => materialInventoryReport(),
            },
          }),
        ).rejects.toThrow(testCase.pattern);

        expect(routeCalls).toBe(0);
        await expect(readFile(paths.routeReportPath, "utf8")).rejects.toThrow(
          /ENOENT/u,
        );
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("refreshes prerequisite reports and binds inventory to the fresh route report", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    const videoBytes = webmBytes(VIDEO_ARTIFACT_SIZE_BYTES, 17);
    const videoSha256 = createHash("sha256").update(videoBytes).digest("hex");
    const screenshots = screenshotFileFixtures(23);
    await writeFile(
      files.route,
      JSON.stringify(
        routeReport({
          deployment: deployment({ proofArtifactHash: HASH_77 }),
        }),
      ),
      "utf8",
    );
    await writeFile(path.join(dir, "video.webm"), videoBytes);
    await writeScreenshotFileFixtures(dir, screenshots);
    const refreshedVideoTranscript = videoTranscript({
      outputDir: "external-proof-output",
      videoArtifacts: [
        {
          ...VIDEO_ARTIFACT,
          relativePath: "video.webm",
          sizeBytes: videoBytes.length,
          sha256: videoSha256,
        },
      ],
      evidence: {
        ...videoEvidence(),
        videoArtifactEvidence: {
          ready: true,
          missingVideoArtifacts: [],
          capturedArtifacts: [
            {
              relativePath: VIDEO_ARTIFACT.relativePath,
              sizeBytes: videoBytes.length,
              sha256: videoSha256,
              mediaType: VIDEO_ARTIFACT.mediaType,
            },
          ],
        },
      },
      explorerScreenshots: fileBackedExplorerScreenshots(screenshots),
    });
    await writeFile(
      files.video,
      JSON.stringify(refreshedVideoTranscript),
      "utf8",
    );

    const calls = {};
    const report = await runBscSccpProductionGate({
      refreshReports: true,
      defaultReportPaths: {
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
      },
      checkedAt: NOW_ISO,
      refreshRunners: {
        runRoutePreflight: async () => routeReport(),
        runPeerConfigAudit: async (input) => {
          calls.peerAudit = input;
          return peerAudit;
        },
        runSmokeReadiness: async (input) => {
          calls.smoke = input;
          return smokeReadiness;
        },
        runMaterialInventory: async (input) => {
          calls.inventory = input;
          const route = JSON.parse(
            await readFile(input.routeReportPath, "utf8"),
          );
          expect(route.deployment).toEqual(deployment());
          return materialInventoryReport();
        },
      },
    });

    expect(report.ready, JSON.stringify(report.reasons, null, 2)).toBe(true);
    expect(report.route?.deployment).toEqual(deployment());
    expect(JSON.parse(await readFile(files.route, "utf8")).deployment).toEqual(
      deployment(),
    );
    expect(calls.inventory.routeReportPath).toBe(files.route);
    expect(calls.smoke.peerAuditReportPath).toBe(files.peer);
    expect(calls.peerAudit.sanitizedStanzasDir).toBe(
      path.join(path.dirname(files.peer), "stanzas"),
    );
    expect(calls.peerAudit.reportOutputDir).toBe(path.dirname(files.peer));
  });

  it("keeps refreshed gates fail-closed when inventory is not route-bound", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      refreshReports: true,
      defaultReportPaths: {
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
      },
      checkedAt: NOW_ISO,
      refreshRunners: {
        runRoutePreflight: async () => routeReport(),
        runPeerConfigAudit: async () => peerAudit,
        runSmokeReadiness: async () => smokeReadiness,
        runMaterialInventory: async () =>
          materialInventoryReport({
            route: {
              ...materialInventoryReport().route,
              deployment: deployment({ proofArtifactHash: HASH_77 }),
            },
          }),
      },
    });

    expect(report.ready).toBe(false);
    expect(
      failedCheck(report, "production-material-inventory")?.detail,
    ).toMatch(
      /production material inventory route proofArtifactHash does not match/u,
    );
  });

  it("writes refreshed prerequisite reports without evaluating the final gate", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: "",
    };

    const refreshed = await refreshBscSccpProductionGateReports({
      defaultReportPaths: paths,
      checkedAt: NOW_ISO,
      refreshRunners: {
        runRoutePreflight: async () => routeReport(),
        runPeerConfigAudit: async () => peerAuditReport(),
        runSmokeReadiness: async () => smokeReadinessReport(),
        runMaterialInventory: async (input) => {
          expect(input.routeReportPath).toBe(paths.routeReportPath);
          return materialInventoryReport();
        },
      },
    });

    expect(refreshed.paths.routeReportPath).toBe(paths.routeReportPath);
    expect(
      JSON.parse(await readFile(paths.routeReportPath, "utf8")).ready,
    ).toBe(true);
    expect(
      JSON.parse(await readFile(paths.materialInventoryReportPath, "utf8"))
        .ready,
    ).toBe(true);
  });

  it("does not overwrite an existing peer audit during refresh without peer inputs", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: "",
    };
    const existingPeerAudit = peerAuditReport({
      generatedAtMs: NOW_MS - 12_345,
      manifestFingerprint: `sha256:${"44".repeat(32)}`,
    });
    await writeFile(
      paths.peerAuditReportPath,
      JSON.stringify(existingPeerAudit),
      "utf8",
    );
    const calls = {};

    const refreshed = await refreshBscSccpProductionGateReports({
      defaultReportPaths: paths,
      checkedAt: NOW_ISO,
      refreshRunners: {
        runRoutePreflight: async () => routeReport(),
        runSmokeReadiness: async (input) => {
          calls.smoke = input;
          return smokeReadinessReport();
        },
        runMaterialInventory: async () => materialInventoryReport(),
      },
    });

    expect(refreshed.peerAuditReport).toEqual(existingPeerAudit);
    expect(refreshed.peerAuditRefresh).toEqual({
      mode: "preserved",
      inputSource: "existing-report",
      refreshed: false,
      reportExisted: true,
      reason:
        "No local or remote peer-audit inputs were provided; the existing peer audit report was preserved.",
    });
    expect(calls.smoke.peerAuditReportPath).toBe(paths.peerAuditReportPath);
    expect(
      JSON.parse(await readFile(paths.peerAuditReportPath, "utf8")),
    ).toEqual(existingPeerAudit);
    expect(
      JSON.parse(await readFile(paths.routeReportPath, "utf8")).ready,
    ).toBe(true);
    expect(
      JSON.parse(await readFile(paths.smokeReadinessReportPath, "utf8")).ready,
    ).toBe(true);
    expect(
      JSON.parse(await readFile(paths.materialInventoryReportPath, "utf8"))
        .ready,
    ).toBe(true);
  });

  it("prefers profile-specific prover environment over generic BSC prover environment during refresh", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const paths = {
      routeReportPath: path.join(dir, "route.json"),
      peerAuditReportPath: path.join(dir, "peer.json"),
      smokeReadinessReportPath: path.join(dir, "smoke.json"),
      materialInventoryReportPath: path.join(dir, "inventory.json"),
      videoTranscriptPath: "",
    };
    const calls = {};

    await withEnv(
      {
        [SCCP_BSC_PROVER_MODULE_URL_ENV]: "/sccp-bsc/generic-destination.js",
        [SCCP_BSC_MAINNET_PROVER_MODULE_URL_ENV]:
          "/sccp-bsc/mainnet-destination.js",
        [SCCP_BSC_SOURCE_PROVER_MODULE_URL_ENV]: "/sccp-bsc/generic-source.js",
        [SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL_ENV]:
          "/sccp-bsc/mainnet-source.js",
        [SCCP_BSC_PROVER_MANIFEST_URL_ENV]:
          "/sccp-bsc/generic-destination.manifest.json",
        [SCCP_BSC_MAINNET_PROVER_MANIFEST_URL_ENV]:
          "/sccp-bsc/mainnet-destination.manifest.json",
        [SCCP_BSC_SOURCE_PROVER_MANIFEST_URL_ENV]:
          "/sccp-bsc/generic-source.manifest.json",
        [SCCP_BSC_MAINNET_SOURCE_PROVER_MANIFEST_URL_ENV]:
          "/sccp-bsc/mainnet-source.manifest.json",
        [SCCP_BSC_PROVER_CONFIG_URL_ENV]: "/sccp-bsc/generic-config.json",
        [SCCP_BSC_MAINNET_PROVER_CONFIG_URL_ENV]:
          "/sccp-bsc/mainnet-config.json",
      },
      async () => {
        await refreshBscSccpProductionGateReports({
          defaultReportPaths: paths,
          bscNetwork: "mainnet",
          checkedAt: NOW_ISO,
          refreshRunners: {
            runRoutePreflight: async () =>
              routeReport({ bscNetwork: "mainnet" }),
            runPeerConfigAudit: async () =>
              peerAuditReport({ bscNetwork: "mainnet" }),
            runSmokeReadiness: async (input) => {
              calls.smoke = input;
              return smokeReadinessReport({ bscNetwork: "mainnet" });
            },
            runMaterialInventory: async (input) => {
              calls.inventory = input;
              return materialInventoryReport({ bscNetwork: "mainnet" });
            },
          },
        });
      },
    );

    expect(calls.smoke).toMatchObject({
      destinationProverModuleUrl: "/sccp-bsc/mainnet-destination.js",
      sourceProverModuleUrl: "/sccp-bsc/mainnet-source.js",
      destinationProverManifestUrl:
        "/sccp-bsc/mainnet-destination.manifest.json",
      sourceProverManifestUrl: "/sccp-bsc/mainnet-source.manifest.json",
      runtimeProverConfigUrl: "/sccp-bsc/mainnet-config.json",
    });
    expect(calls.inventory).toMatchObject({
      destinationModuleUrl: "/sccp-bsc/mainnet-destination.js",
      sourceModuleUrl: "/sccp-bsc/mainnet-source.js",
      runtimeProverConfigUrl: "/sccp-bsc/mainnet-config.json",
    });
  });

  it("rejects file-backed peer audits with missing sanitized stanza files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } = await writeFileBackedPeerAuditReports(
      dir,
      {
        missingPeers: new Set([0]),
      },
    );
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file is missing/u,
    );
    expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(false);
  });

  it("does not mark empty file-backed peer audits as sanitized-stanza checked", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const emptyPeerAudit = peerAuditReport({
      ready: false,
      peerCount: 0,
      manifestFingerprint: null,
      sanitizedStanzaFilesChecked: false,
      checks: [
        {
          id: "peer-config-files",
          ok: false,
          message: "At least one TAIRA peer config was audited.",
        },
        { id: "peer-route-count", ok: true, message: "ready" },
        {
          id: "peer-route-consistency",
          ok: false,
          message:
            "All TAIRA peer configs carry the same BSC route manifest material.",
        },
        {
          id: "peer-route-production-readiness",
          ok: false,
          message:
            "Every TAIRA peer config advertises a production-ready BSC route stanza.",
        },
      ],
      peers: [],
    });
    const emptySmokeReadiness = smokeReadinessReport({
      ready: false,
      routeReady: false,
      peerAudit: emptyPeerAudit,
      checks: smokeReadinessReport().checks.map((entry) =>
        entry.id === "peer-config-audit"
          ? { ...entry, status: "fail", detail: "peer audit has no peers" }
          : entry,
      ),
    });

    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(emptyPeerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(emptySmokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(report.peerAudit?.sanitizedStanzaFilesChecked).toBe(false);
    expect(report.smokeReadiness?.peerAudit?.sanitizedStanzaFilesChecked).toBe(
      false,
    );
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer audit report does not include peer summaries/u,
    );
    expect(
      failedCheck(report, "smoke-peer-audit-binding")?.detail ?? "",
    ).not.toMatch(/sanitized stanza file status differs/u);
  });

  it("rejects file-backed peer audits with tampered sanitized stanza files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } = await writeFileBackedPeerAuditReports(
      dir,
      {
        tamperedPeers: new Set([0]),
      },
    );
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file hash mismatched/u,
    );
    expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(false);
  });

  it.each([
    [
      "legacy TRON alias",
      `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nsccp_tron_source_bridge_address = "${BSC_SOURCE_BRIDGE_ADDRESS}"\n`,
      /contains forbidden TRON aliases for BSC evidence: sccp_tron_source_bridge_address/u,
    ],
    [
      "secret-like assignment",
      `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nprivate_key = "must-not-persist"\n`,
      /contains secret-like material/u,
    ],
    [
      "malformed route TOML",
      `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}\n`,
      /is malformed SCCP route TOML/u,
    ],
    [
      "unsupported sanitized route field",
      `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nasset_key = "${SCCP_BSC_XOR_ASSET_KEY}"\noperator_override = "force-ready"\n`,
      /contains unsupported sanitized route field operator_override/u,
    ],
    [
      "no route stanza",
      "# sanitized file intentionally emptied\n",
      /does not contain SCCP route stanza evidence/u,
    ],
    [
      "wrong asset binding",
      `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nasset_key = "dot"\n`,
      /does not contain taira_bsc_xor\/xor route stanza evidence/u,
    ],
  ])(
    "rejects file-backed peer audits whose sanitized stanza contains %s",
    async (_label, hostileContent, expectedDetail) => {
      const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
      const files = {
        route: path.join(dir, "route.json"),
        peer: path.join(dir, "peer.json"),
        smoke: path.join(dir, "smoke.json"),
        inventory: path.join(dir, "inventory.json"),
        video: path.join(dir, "video.json"),
      };
      const { peerAudit, smokeReadiness } =
        await writeFileBackedPeerAuditReports(dir, {
          peerContents: { 0: hostileContent },
        });
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: NOW_ISO,
      });

      expect(report.ready).toBe(false);
      expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
        expectedDetail,
      );
      expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(
        false,
      );
      expect(
        report.peerAudit?.peers[0].sanitizedStanzaFileVerificationError,
      ).toMatch(expectedDetail);
    },
  );

  it("rejects file-backed peer audits with unsafe sanitized stanza paths", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } = await writeFileBackedPeerAuditReports(
      dir,
      {
        sources: {
          0: "../outside.toml",
        },
      },
    );
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file has unsafe path/u,
    );
    expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(false);
  });

  it("rejects peer audits that point sanitized stanza evidence outside the report directory", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const packageHash = sha256Hex(await readFile("package.json"));
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    peerAudit.peers[0] = {
      ...peerAudit.peers[0],
      source: "package.json",
      sanitizedStanzaSha256: packageHash,
    };
    smokeReadiness.peerAudit.peers[0] = {
      ...smokeReadiness.peerAudit.peers[0],
      source: "package.json",
      sanitizedStanzaSha256: packageHash,
      sanitizedStanzaFileSha256: packageHash,
    };
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file has unsafe path/u,
    );
    expect(report.peerAudit?.peers[0]).toMatchObject({
      sanitizedStanzaFileChecked: true,
      sanitizedStanzaFileVerified: false,
      sanitizedStanzaFileVerificationError: "has unsafe path",
    });
  });

  it("accepts repo-relative sanitized stanza evidence in a sibling stanzas directory", async () => {
    const dir = await mkdtemp(
      path.join(process.cwd(), "output/sccp-bsc-prod-gate-"),
    );
    try {
      const reportDir = path.join(dir, "report");
      const stanzaDir = path.join(dir, "stanzas");
      await mkdir(reportDir, { recursive: true });
      await mkdir(stanzaDir, { recursive: true });
      const files = {
        route: path.join(reportDir, "route.json"),
        peer: path.join(reportDir, "latest.json"),
        smoke: path.join(reportDir, "smoke.json"),
        inventory: path.join(reportDir, "inventory.json"),
        video: path.join(reportDir, "video.json"),
      };
      const peerPeers = [];
      const smokePeers = [];
      for (const [index, peer] of peerAuditReport().peers.entries()) {
        const stanzaFile = path.join(stanzaDir, `peer${index}.toml`);
        const stanzaBytes = Buffer.from(
          `[[zk.sccp_route_manifests]]\nroute_id = "${SCCP_BSC_XOR_ROUTE_ID}"\nasset_key = "${SCCP_BSC_XOR_ASSET_KEY}"\n`,
        );
        await writeFile(stanzaFile, stanzaBytes);
        const source = path.relative(process.cwd(), stanzaFile);
        const expectedHash = sha256Hex(stanzaBytes);
        peerPeers.push({
          ...peer,
          source,
          sanitizedStanzaSource: source,
          sanitizedStanzaSha256: expectedHash,
        });
        smokePeers.push({
          ...smokeReadinessReport().peerAudit.peers[index],
          source,
          sanitizedStanzaSource: source,
          sanitizedStanzaSha256: expectedHash,
          sanitizedStanzaFileSha256: expectedHash,
        });
      }
      const peerAudit = peerAuditReport({ peers: peerPeers });
      const smokeReadiness = smokeReadinessReport({
        peerAudit: {
          ...smokeReadinessReport().peerAudit,
          peers: smokePeers,
        },
      });
      await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
      await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
      await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
      await writeFile(
        files.inventory,
        JSON.stringify(materialInventoryReport()),
        "utf8",
      );
      await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

      const report = await runBscSccpProductionGate({
        routeReportPath: files.route,
        peerAuditReportPath: files.peer,
        smokeReadinessReportPath: files.smoke,
        materialInventoryReportPath: files.inventory,
        videoTranscriptPath: files.video,
        checkedAt: NOW_ISO,
      });

      expect(failedCheck(report, "peer-config-audit-ready")).toBeUndefined();
      expect(report.reasons.join(" ")).not.toMatch(
        /sanitized stanza file has unsafe path/u,
      );
      expect(
        report.peerAudit?.peers.every(
          (peer) => peer.sanitizedStanzaFileVerified,
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { force: true, recursive: true });
    }
  });

  it("rejects file-backed peer audits with symlinked sanitized stanza files", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    const peer0 = path.join(dir, "stanzas/peer0.toml");
    const target = path.join(dir, "stanzas/peer0.actual.toml");
    await writeFile(target, await readFile(peer0));
    await rm(peer0);
    await symlink(target, peer0);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file must not be a symbolic link/u,
    );
    expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(false);
  });

  it("rejects file-backed peer audits with oversized sanitized stanza files before hashing", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-prod-gate-"));
    const files = {
      route: path.join(dir, "route.json"),
      peer: path.join(dir, "peer.json"),
      smoke: path.join(dir, "smoke.json"),
      inventory: path.join(dir, "inventory.json"),
      video: path.join(dir, "video.json"),
    };
    const { peerAudit, smokeReadiness } =
      await writeFileBackedPeerAuditReports(dir);
    const peer0 = path.join(dir, "stanzas/peer0.toml");
    await writeFile(peer0, "");
    await truncate(peer0, SCCP_BSC_SANITIZED_STANZA_MAX_BYTES + 1);
    await writeFile(files.route, JSON.stringify(routeReport()), "utf8");
    await writeFile(files.peer, JSON.stringify(peerAudit), "utf8");
    await writeFile(files.smoke, JSON.stringify(smokeReadiness), "utf8");
    await writeFile(
      files.inventory,
      JSON.stringify(materialInventoryReport()),
      "utf8",
    );
    await writeFile(files.video, JSON.stringify(videoTranscript()), "utf8");

    const report = await runBscSccpProductionGate({
      routeReportPath: files.route,
      peerAuditReportPath: files.peer,
      smokeReadinessReportPath: files.smoke,
      materialInventoryReportPath: files.inventory,
      videoTranscriptPath: files.video,
      checkedAt: NOW_ISO,
    });

    expect(report.ready).toBe(false);
    expect(failedCheck(report, "peer-config-audit-ready")?.detail).toMatch(
      /peer 0 sanitized stanza file .*maximum allowed/u,
    );
    expect(report.peerAudit?.peers[0].sanitizedStanzaFileVerified).toBe(false);
  });
});
