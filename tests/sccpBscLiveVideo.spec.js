import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  symlink,
  truncate,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import {
  assertExplorerPageContainsTransactionHash,
  buildSccpBscLiveVideoElectronArgs,
  assertSccpBscLiveVideoTranscriptComplete,
  buildSccpBscLiveVideoElectronEnv,
  buildSccpBscTransactionLinksArtifact,
  buildSccpBscVideoReadinessBinding,
  buildSccpBscLiveVideoTranscript,
  buildSccpBscVideoWalletApprovalEvidence,
  captureExplorerProofs,
  canonicalizeSccpBscProofLinks,
  classifySccpBscProofLink,
  collectSccpBscVideoArtifacts,
  evaluateSccpBscVideoArtifactEvidence,
  evaluateSccpBscVideoPostDeployTransactionEvidence,
  evaluateSccpBscVideoProofEvidence,
  evaluateSccpBscVideoReadinessEvidence,
  evaluateSccpBscVideoTimelineEvidence,
  explorerTransactionEvidenceUrlsMatch,
  extractExplorerTransactionHash,
  inferSccpBscVideoTransactions,
  MAX_SCREENSHOT_ARTIFACT_BYTES,
  MAX_VIDEO_ARTIFACT_BYTES,
  normalizeSccpBscE2eAmount,
  parseArgs,
  parseSccpBscPrivateEnvText,
  prepareSccpBscLiveVideoRunDir,
  readSccpBscE2eSignerEnvFile,
  readSccpBscFundedTairaWalletFile,
  readDurationMs,
  resolveSccpBscProverV8HeapMb,
  resolveSccpBscLiveVideoWalletConnectProjectId,
  REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
  SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
  SCCP_BSC_VIDEO_INCOMPLETE_OPERATOR_NOTES,
  SCCP_BSC_VIDEO_WALLET_APPROVAL_E2E_MODE,
  SCCP_BSC_VIDEO_WALLET_APPROVAL_MANUAL_MODE,
  SCCP_BSC_WALLETCONNECT_NAMESPACE,
  SCCP_BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD,
  sanitizeSccpBscLiveVideoLogText,
  sccpBscWalletConnectCaipChainId,
  summarizeSccpBscLiveVideoMissingEvidence,
} from "../scripts/e2e/sccp-bsc-live-video.mjs";

const BSC_TESTNET_NETWORK_ID_HEX = `0x${"61".padStart(64, "0")}`;
const BSC_MAINNET_NETWORK_ID_HEX = `0x${"38".padStart(64, "0")}`;
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASH =
  "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4";
const fixtureAddress = (label) =>
  `0x${createHash("sha256")
    .update(Buffer.from(label, "utf8"))
    .digest("hex")
    .slice(0, 40)}`;
const BSC_BRIDGE_ADDRESS = fixtureAddress("bsc live video bridge");
const BSC_TOKEN_ADDRESS = fixtureAddress("bsc live video token");
const BSC_SOURCE_BRIDGE_ADDRESS = fixtureAddress(
  "bsc live video source bridge",
);
const BSC_VERIFIER_ADDRESS = fixtureAddress("bsc live video verifier");
const VIDEO_ARTIFACT_SIZE_BYTES = 96 * 1024;
const VALID_STARTED_AT_MS = 1_000;
const VALID_ENDED_AT_MS = VALID_STARTED_AT_MS + 60_000;
const READY_SMOKE_CHECK_IDS = [
  "route-preflight",
  "peer-config-audit",
  "walletconnect-project-id",
  "runtime-prover-config",
  "destination-prover-module",
  "destination-prover-manifest",
  "source-prover-module",
  "source-prover-manifest",
];
const readySmokeChecks = () =>
  READY_SMOKE_CHECK_IDS.map((id) => ({
    id,
    ok: true,
    status: "pass",
    message: `${id} ready`,
  }));

const READY_READINESS = {
  checkedAt: "2026-06-06T00:00:00.000Z",
  ready: true,
  routeReady: true,
  checks: readySmokeChecks(),
  route: {
    manifestSource: "torii",
    routeId: "taira_bsc_xor",
    assetKey: "xor",
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
      verifierCodeHash: `0x${"11".repeat(32)}`,
      verifierKeyHash: `0x${"22".repeat(32)}`,
      proofArtifactHash: `0x${"33".repeat(32)}`,
      provingKeyHash: `0x${"44".repeat(32)}`,
      nativeEvmProverBundleHash: `0x${"bb".repeat(32)}`,
      destinationBindingHash: `0x${"55".repeat(32)}`,
      settlementAssetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
    },
    postDeployLiveEvidence: {
      fullTomlReady: true,
      sourceBridgeConfigHash: `0x${"66".repeat(32)}`,
      sourceEventTransactionId: `0x${"77".repeat(32)}`,
      sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/0x${"77".repeat(32)}`,
      routeCanaryEvidenceHash: `0x${"88".repeat(32)}`,
      routeCanaryTransactionId: `0x${"99".repeat(32)}`,
      routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`,
      offlineFullTomlSha256: `0x${"aa".repeat(32)}`,
    },
  },
  peerAudit: {
    ready: true,
    routeId: "taira_bsc_xor",
    assetKey: "xor",
    peerCount: 4,
    manifestFingerprint: `sha256:${"aa".repeat(32)}`,
    sanitizedStanzaFilesChecked: true,
  },
};
const READY_MAINNET_READINESS = {
  ...READY_READINESS,
  route: {
    ...READY_READINESS.route,
    bsc: {
      network: "mainnet",
      chain: "bsc-mainnet",
      chainIdHex: "0x38",
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    },
    deployment: {
      ...READY_READINESS.route.deployment,
      networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
    },
    postDeployLiveEvidence: {
      ...READY_READINESS.route.postDeployLiveEvidence,
      sourceEventExplorerUrl: `https://bscscan.com/tx/0x${"77".repeat(32)}`,
      routeCanaryExplorerUrl: `https://bscscan.com/tx/0x${"99".repeat(32)}`,
    },
  },
};
const READY_ONCHAIN_ONLY_PEER_AUDIT = {
  ...READY_READINESS.peerAudit,
  manifestFingerprint: null,
  sanitizedStanzaFilesChecked: true,
  peers: Array.from({ length: 4 }, (_, index) => ({
    source: `peer${index}.toml`,
    routeCount: 0,
    sanitizedStanzaFileChecked: true,
    sanitizedStanzaFileVerified: true,
    sanitizedStanzaSha256: `0x${"ab".repeat(32)}`,
    sanitizedStanzaFileSha256: `0x${"ab".repeat(32)}`,
  })),
};
const VIDEO_ARTIFACT = {
  path: "/tmp/proof/video.webm",
  relativePath: "video.webm",
  sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
  sha256: "ab".repeat(32),
  mediaType: "video/webm",
  status: "captured",
  fileVerified: true,
};
const PUBLIC_VIDEO_ARTIFACT = {
  relativePath: "video.webm",
  sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
  sha256: "ab".repeat(32),
  mediaType: "video/webm",
  status: "captured",
  fileVerified: true,
};
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

const pngBytes = (size = 2048, fill = 1, options = {}) => {
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

const uniformPngBytes = (size = 2048, fill = 1, options = {}) =>
  pngBytes(size, fill, { ...options, varied: false });

const pngBytesWithInvalidIdat = (size = 2048, fill = 1) => {
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

const forgedPngSignatureOnlyBytes = (size = 2048, fill = 1) => {
  const bytes = Buffer.alloc(size, fill);
  PNG_SIGNATURE_BYTES.copy(bytes, 0);
  return bytes;
};

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

const webmBytes = (size = VIDEO_ARTIFACT_SIZE_BYTES, fill = 2) => {
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
  fill = 2,
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
  fill = 2,
) => {
  const bytes = Buffer.alloc(size, fill);
  Buffer.from(WEBM_HEADER_BYTES).copy(bytes, 0);
  Buffer.from(WEBM_MEDIA_STRUCTURE_BYTES).copy(bytes, WEBM_HEADER_BYTES.length);
  return bytes;
};

const forgedWebmWithoutSequenceBytes = (sequence, size = 4096, fill = 2) => {
  const bytes = webmBytes(size, fill);
  const offset = bytes.indexOf(Buffer.from(sequence));
  if (offset !== -1) {
    Buffer.alloc(sequence.length, fill).copy(bytes, offset);
  }
  return bytes;
};

const forgedWebmSubstringBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => {
  const bytes = Buffer.alloc(size, fill);
  Buffer.from([0x1a, 0x45, 0xdf, 0xa3]).copy(bytes, 0);
  Buffer.from("webm").copy(bytes, 32);
  return bytes;
};

const forgedWebmWrongDocTypeBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => {
  const bytes = webmBytes(size, fill);
  Buffer.from("wxbm").copy(bytes, WEBM_DOCTYPE_VALUE_OFFSET);
  return bytes;
};

const forgedWebmWrongDocTypeSizeBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => {
  const bytes = webmBytes(size, fill);
  bytes[WEBM_DOCTYPE_SIZE_OFFSET] = 0x85;
  return bytes;
};

const forgedWebmWithoutSegmentBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => {
  const bytes = webmBytes(size, fill);
  Buffer.alloc(4, fill).copy(bytes, WEBM_SEGMENT_OFFSET);
  return bytes;
};

const forgedWebmWithoutInfoBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => forgedWebmWithoutSequenceBytes(WEBM_INFO_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutTracksBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => forgedWebmWithoutSequenceBytes(WEBM_TRACKS_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutClusterBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) => forgedWebmWithoutSequenceBytes(WEBM_CLUSTER_ELEMENT_BYTES, size, fill);

const forgedWebmWithoutBlockBytes = (
  size = VIDEO_ARTIFACT_SIZE_BYTES,
  fill = 2,
) =>
  forgedWebmWithoutSequenceBytes(WEBM_SIMPLE_BLOCK_ELEMENT_BYTES, size, fill);

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
  screenshot: `/tmp/proof/${kind}.png`,
  relativePath: `${kind}.png`,
  sizeBytes: 2048,
  sha256: SCREENSHOT_SHA256_BY_KIND[kind] ?? "cd".repeat(32),
  mediaType: "image/png",
  status: "captured",
  fileVerified: true,
  ...overrides,
});

describe("BSC SCCP live video proof helpers", () => {
  it("validates recording duration bounds", () => {
    expect(readDurationMs(undefined)).toBe(600_000);
    expect(readDurationMs("30000")).toBe(30_000);
    expect(readDurationMs("7200000")).toBe(7_200_000);

    for (const value of ["0", "29999", "7200001", "1.5", "bad"]) {
      expect(() => readDurationMs(value)).toThrow(/duration-ms/u);
    }
  });

  it("parses boolean and valued CLI arguments", () => {
    expect(
      parseArgs([
        "--duration-ms",
        "60000",
        "--skip-preflight",
        "--allow-incomplete",
        "--output-dir",
        "output/proof",
        "--peer-audit-report",
        "output/peer-audit/latest.json",
        "--auto-flow",
        "--e2e-signer-env-file",
        "output/private.env",
        "--funded-wallet-file",
        "output/funded.json",
        "--e2e-amount",
        "0.0001",
      ]),
    ).toEqual({
      "duration-ms": "60000",
      "skip-preflight": true,
      "allow-incomplete": true,
      "output-dir": "output/proof",
      "peer-audit-report": "output/peer-audit/latest.json",
      "auto-flow": true,
      "e2e-signer-env-file": "output/private.env",
      "funded-wallet-file": "output/funded.json",
      "e2e-amount": "0.0001",
    });
  });

  it("passes documented WalletConnect project id input through to the Electron renderer env", () => {
    const envProjectId = "envprojectid1234567890";
    const cliProjectId = "cliprojectid1234567890";

    expect(
      resolveSccpBscLiveVideoWalletConnectProjectId(
        { "walletconnect-project-id": cliProjectId },
        { VITE_WALLETCONNECT_PROJECT_ID: envProjectId },
      ),
    ).toBe(cliProjectId);
    expect(
      resolveSccpBscLiveVideoWalletConnectProjectId(
        {},
        { VITE_WALLETCONNECT_PROJECT_ID: envProjectId },
      ),
    ).toBe(envProjectId);
    expect(resolveSccpBscLiveVideoWalletConnectProjectId({}, {})).toBe("");

    const env = buildSccpBscLiveVideoElectronEnv({
      args: {
        "walletconnect-project-id": cliProjectId,
        "destination-prover-module-url": "/sccp-bsc/destination.js",
        "source-prover-module-url": "/sccp-bsc/source.js",
      },
      env: {
        NODE_ENV: "test",
        VITE_WALLETCONNECT_PROJECT_ID: envProjectId,
        VITE_SCCP_BSC_NETWORK: "mainnet",
        VITE_SCCP_BSC_E2E_WALLET: "0",
        VITE_SCCP_BSC_PROVER_MODULE_URL: "/old-destination.js",
        VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL: "/old-source.js",
      },
      bscNetwork: "testnet",
      autoFlow: true,
    });
    expect(env).toMatchObject({
      NODE_ENV: "test",
      VITE_WALLETCONNECT_PROJECT_ID: cliProjectId,
      VITE_SCCP_BSC_NETWORK: "testnet",
      VITE_SCCP_BSC_E2E_WALLET: "1",
      VITE_SCCP_BSC_PROVER_MODULE_URL: "/sccp-bsc/destination.js",
      VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL: "/sccp-bsc/destination.js",
      VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL: "/sccp-bsc/source.js",
      VITE_SCCP_BSC_TESTNET_SOURCE_PROVER_MODULE_URL: "/sccp-bsc/source.js",
    });

    const mainnetEnv = buildSccpBscLiveVideoElectronEnv({
      args: {
        "destination-prover-module-url": "/sccp-bsc/mainnet-destination.js",
        "source-prover-module-url": "/sccp-bsc/mainnet-source.js",
      },
      env: {},
      bscNetwork: "mainnet",
    });
    expect(mainnetEnv).toMatchObject({
      VITE_SCCP_BSC_NETWORK: "mainnet",
      VITE_SCCP_BSC_PROVER_MODULE_URL: "/sccp-bsc/mainnet-destination.js",
      VITE_SCCP_BSC_MAINNET_PROVER_MODULE_URL:
        "/sccp-bsc/mainnet-destination.js",
      VITE_SCCP_BSC_SOURCE_PROVER_MODULE_URL: "/sccp-bsc/mainnet-source.js",
      VITE_SCCP_BSC_MAINNET_SOURCE_PROVER_MODULE_URL:
        "/sccp-bsc/mainnet-source.js",
    });
    expect(mainnetEnv).not.toHaveProperty(
      "VITE_SCCP_BSC_TESTNET_PROVER_MODULE_URL",
    );
  });

  it("launches Electron with a bounded SCCP prover V8 heap flag", () => {
    expect(resolveSccpBscProverV8HeapMb({})).toBe(12288);
    expect(
      resolveSccpBscProverV8HeapMb({
        SCCP_BSC_PROVER_V8_HEAP_MB: "4096",
      }),
    ).toBe(4096);
    expect(
      resolveSccpBscProverV8HeapMb({
        SCCP_BSC_PROVER_V8_HEAP_MB: "false",
      }),
    ).toBeNull();
    expect(
      resolveSccpBscProverV8HeapMb({
        SCCP_BSC_PROVER_V8_HEAP_MB: "1",
      }),
    ).toBe(1024);
    expect(
      resolveSccpBscProverV8HeapMb({
        SCCP_BSC_PROVER_V8_HEAP_MB: "999999",
      }),
    ).toBe(32768);

    expect(
      buildSccpBscLiveVideoElectronArgs({
        entrypoint: "/tmp/app.cjs",
        env: { SCCP_BSC_PROVER_V8_HEAP_MB: "6144" },
      }),
    ).toEqual(["--js-flags=--max-old-space-size=6144", "/tmp/app.cjs"]);
    expect(
      buildSccpBscLiveVideoElectronArgs({
        entrypoint: "/tmp/app.cjs",
        env: { SCCP_BSC_PROVER_V8_HEAP_MB: "0" },
      }),
    ).toEqual(["/tmp/app.cjs"]);
  });

  it("rejects unsafe WalletConnect project id injection before launching Electron", () => {
    for (const value of [
      "https://walletconnect.example/project",
      "project?id=abc",
      "project/id",
      "project\\id",
      "project id",
      "project\nid",
      "short",
      "aaaaaaaaaaaaaaaa",
      "placeholder-walletconnect-project-id",
      "walletconnect-project-id",
      "<walletconnect-project-id>",
      "todo-walletconnect-project-id",
    ]) {
      expect(() =>
        resolveSccpBscLiveVideoWalletConnectProjectId(
          { "walletconnect-project-id": value },
          {},
        ),
      ).toThrow(/WalletConnect project ID/u);
    }
  });

  it("ignores prototype-polluted WalletConnect project id values", () => {
    const previousDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "VITE_WALLETCONNECT_PROJECT_ID",
    );
    const previousCliDescriptor = Object.getOwnPropertyDescriptor(
      Object.prototype,
      "walletconnect-project-id",
    );
    try {
      Object.defineProperty(Object.prototype, "VITE_WALLETCONNECT_PROJECT_ID", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: "pollutedenvprojectid123",
      });
      Object.defineProperty(Object.prototype, "walletconnect-project-id", {
        configurable: true,
        enumerable: true,
        writable: true,
        value: "pollutedcliprojectid123",
      });
      expect(resolveSccpBscLiveVideoWalletConnectProjectId({}, {})).toBe("");
      const launchEnv = buildSccpBscLiveVideoElectronEnv({
        args: {},
        env: {},
        bscNetwork: "testnet",
      });
      expect(
        Object.prototype.hasOwnProperty.call(
          launchEnv,
          "VITE_WALLETCONNECT_PROJECT_ID",
        ),
      ).toBe(false);
    } finally {
      if (previousDescriptor) {
        Object.defineProperty(
          Object.prototype,
          "VITE_WALLETCONNECT_PROJECT_ID",
          previousDescriptor,
        );
      } else {
        delete Object.prototype.VITE_WALLETCONNECT_PROJECT_ID;
      }
      if (previousCliDescriptor) {
        Object.defineProperty(
          Object.prototype,
          "walletconnect-project-id",
          previousCliDescriptor,
        );
      } else {
        delete Object.prototype["walletconnect-project-id"];
      }
    }
  });

  it("validates E2E auto-flow amount and private input files without leaking values", async () => {
    expect(normalizeSccpBscE2eAmount(undefined)).toBe("0.0001");
    expect(normalizeSccpBscE2eAmount("1.000000000000000001")).toBe(
      "1.000000000000000001",
    );
    for (const value of ["0", "0.0", "-1", "1.0000000000000000001", "bad"]) {
      expect(() => normalizeSccpBscE2eAmount(value)).toThrow(/amount/u);
    }

    expect(
      parseSccpBscPrivateEnvText(`
        # comment
        export SCCP_BSC_DEPLOYER_PRIVATE_KEY="0x${"11".repeat(32)}"
        SCCP_BSC_DEPLOYER_ADDRESS='0x${"22".repeat(20)}'
      `),
    ).toEqual({
      SCCP_BSC_DEPLOYER_PRIVATE_KEY: `0x${"11".repeat(32)}`,
      SCCP_BSC_DEPLOYER_ADDRESS: `0x${"22".repeat(20)}`,
    });
    expect(() => parseSccpBscPrivateEnvText("not valid")).toThrow(
      /invalid assignment on line 1/u,
    );

    const baseDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-env-"));
    const signerFile = path.join(baseDir, "signer.private.env");
    await writeFile(
      signerFile,
      [
        `SCCP_BSC_DEPLOYER_PRIVATE_KEY=0x${"11".repeat(32)}`,
        `SCCP_BSC_DEPLOYER_ADDRESS=0x${"22".repeat(20)}`,
      ].join("\n"),
    );
    await expect(readSccpBscE2eSignerEnvFile(signerFile)).resolves.toEqual({
      privateKeyHex: `0x${"11".repeat(32)}`,
      address: `0x${"22".repeat(20)}`,
    });

    const fundedFile = path.join(baseDir, "funded.json");
    await writeFile(
      fundedFile,
      JSON.stringify({
        privateKeyHex: "33".repeat(32),
        domain: "wonderland",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      }),
    );
    await expect(readSccpBscFundedTairaWalletFile(fundedFile)).resolves.toEqual(
      {
        privateKeyHex: "33".repeat(32),
        publicKeyHex: expect.stringMatching(/^[0-9A-F]{64}$/u),
        domain: "wonderland",
        assetDefinitionId: "6TEAJqbb8oEPmLncoNiMRbLEK6tw",
      },
    );

    const invalidSignerFile = path.join(baseDir, "invalid.private.env");
    await writeFile(
      invalidSignerFile,
      [
        "SCCP_BSC_DEPLOYER_PRIVATE_KEY=not-a-key",
        `SCCP_BSC_DEPLOYER_ADDRESS=0x${"22".repeat(20)}`,
      ].join("\n"),
    );
    await expect(
      readSccpBscE2eSignerEnvFile(invalidSignerFile),
    ).rejects.toThrow(/SCCP_BSC_DEPLOYER_PRIVATE_KEY/u);
  });

  it("rejects unsupported or positional CLI arguments", () => {
    expect(() => parseArgs(["unexpected"])).toThrow(
      /Unexpected argument: unexpected/u,
    );
    expect(() => parseArgs(["--unknown-production-option"])).toThrow(
      /Unknown option: --unknown-production-option/u,
    );
    expect(() =>
      parseArgs(["--duration-ms", "60000", "--duration-ms", "120000"]),
    ).toThrow(/Duplicate option: --duration-ms/u);
  });

  it("creates live proof run directories only under non-symlink output roots", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-root-"));
    const outputRoot = path.join(baseDir, "proof-output");

    const prepared = await prepareSccpBscLiveVideoRunDir(outputRoot, {
      runLabel: "2026-06-13T00-00-00-000Z",
    });
    expect(prepared).toEqual({
      outputRoot,
      runDir: path.join(outputRoot, "2026-06-13T00-00-00-000Z"),
    });
    expect((await lstat(prepared.runDir)).isDirectory()).toBe(true);

    const targetRoot = path.join(baseDir, "target-root");
    const symlinkRoot = path.join(baseDir, "proof-output-link");
    await mkdir(targetRoot);
    await symlink(targetRoot, symlinkRoot, "dir");

    await expect(
      prepareSccpBscLiveVideoRunDir(symlinkRoot, {
        runLabel: "2026-06-13T00-00-01-000Z",
      }),
    ).rejects.toThrow(/symbolic link/u);
    await expect(
      lstat(path.join(targetRoot, "2026-06-13T00-00-01-000Z")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects symlinked and reused live proof run directories", async () => {
    const baseDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-root-"));
    const outputRoot = path.join(baseDir, "proof-output");
    const symlinkTarget = path.join(baseDir, "outside-run");
    await mkdir(outputRoot);
    await mkdir(symlinkTarget);
    await symlink(symlinkTarget, path.join(outputRoot, "fixed-run"), "dir");

    await expect(
      prepareSccpBscLiveVideoRunDir(outputRoot, { runLabel: "fixed-run" }),
    ).rejects.toThrow(/symbolic link/u);

    await prepareSccpBscLiveVideoRunDir(outputRoot, {
      runLabel: "fresh-run",
    });
    await expect(
      prepareSccpBscLiveVideoRunDir(outputRoot, { runLabel: "fresh-run" }),
    ).rejects.toThrow(/already exists/u);
  });

  it("rejects unsafe live proof run labels", async () => {
    const outputRoot = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-video-root-"),
    );

    await expect(
      prepareSccpBscLiveVideoRunDir(outputRoot, { runLabel: "../escape" }),
    ).rejects.toThrow(/Unsafe SCCP BSC live proof output run label/u);
    await expect(
      prepareSccpBscLiveVideoRunDir(outputRoot, { runLabel: "nested/run" }),
    ).rejects.toThrow(/Unsafe SCCP BSC live proof output run label/u);
  });

  it("redacts renderer-controlled live video log text", () => {
    const pem =
      "-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----";
    const bareMnemonic =
      "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    const fakeApiSecret = ["sk", "live", "browserrawsecret1234567890"].join(
      "_",
    );
    const fakeApiSecretPrefix = ["sk", "live", "browserrawsecret"].join("_");
    const logText = [
      "console privateKey=0xfeedface",
      '{"privateKey":"0xjsonsecret"}',
      "?seed_phrase=abandon-abandon-abandon",
      "password:super-secret",
      "apiKey=browser-api-secret",
      "accessToken=browser-access-secret",
      "BearerToken=browser-bearer-secret",
      "Authorization: Bearer browser-raw-bearer-token-123456",
      `rawKey ${fakeApiSecret}`,
      `pem=${pem}`,
      `phrase ${bareMnemonic}`,
      `mnemonic=${bareMnemonic}`,
      "secretariat=public-office",
    ].join(" ");

    const sanitized = sanitizeSccpBscLiveVideoLogText(logText);

    expect(sanitized).toContain("privateKey=[redacted]");
    expect(sanitized).toContain('"privateKey":[redacted]');
    expect(sanitized).toContain("?seed_phrase=[redacted]");
    expect(sanitized).toContain("password:[redacted]");
    expect(sanitized).toContain("apiKey=[redacted]");
    expect(sanitized).toContain("accessToken=[redacted]");
    expect(sanitized).toContain("BearerToken=[redacted]");
    expect(sanitized).toContain("Authorization: [redacted token]");
    expect(sanitized).toContain("rawKey [redacted token]");
    expect(sanitized).toContain("pem=[redacted private key]");
    expect(sanitized).toContain("[redacted recovery phrase]");
    expect(sanitized).toContain("mnemonic=[redacted recovery phrase]");
    expect(sanitized).toContain("secretariat=public-office");
    expect(sanitized).not.toContain("feedface");
    expect(sanitized).not.toContain("jsonsecret");
    expect(sanitized).not.toContain("super-secret");
    expect(sanitized).not.toContain("browser-api-secret");
    expect(sanitized).not.toContain("browser-access-secret");
    expect(sanitized).not.toContain("browser-bearer-secret");
    expect(sanitized).not.toContain("browser-raw-bearer-token");
    expect(sanitized).not.toContain(fakeApiSecretPrefix);
    expect(sanitized).not.toContain("abc123");
    expect(sanitized).not.toContain("abandon abandon");

    const truncated = sanitizeSccpBscLiveVideoLogText("x".repeat(2_100));
    expect(truncated).toHaveLength(2_014);
    expect(truncated.endsWith("...[truncated]")).toBe(true);
  });

  it("classifies only SCCP proof transaction explorer links", () => {
    expect(
      classifySccpBscProofLink({
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      }),
    ).toBe("bscFinalizeTx");
    expect(
      classifySccpBscProofLink({
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      }),
    ).toBe("bscBurnTx");
    expect(
      classifySccpBscProofLink({
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      }),
    ).toBe("tairaSourceTx");
    expect(
      classifySccpBscProofLink({
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/0x${"44".repeat(32)}`,
      }),
    ).toBe("tairaSettlementTx");
    expect(
      classifySccpBscProofLink(
        {
          label: "BSC finalize transaction",
          href: `https://bscscan.com/tx/0x${"55".repeat(32)}`,
        },
        { bscNetwork: "mainnet" },
      ),
    ).toBe("bscFinalizeTx");
    expect(
      classifySccpBscProofLink({
        label: "BSC account",
        href: `https://testnet.bscscan.com/address/${BSC_BRIDGE_ADDRESS}`,
      }),
    ).toBeNull();
    for (const forgedLink of [
      {
        label: "BSC finalize transaction",
        href: `https://bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `http://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://operator:credential@testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://evil.example/redirect?u=https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC unrelated transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "TAIRA source transaction",
        href: `https://minamoto-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "TAIRA source transaction",
        href: `https://operator:credential@taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "TAIRA unrelated transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
    ]) {
      expect(classifySccpBscProofLink(forgedLink), forgedLink.href).toBeNull();
    }
    expect(
      extractExplorerTransactionHash(
        `https://operator:credential@testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      ),
    ).toBe("");
    expect(
      canonicalizeSccpBscProofLinks([
        {
          label: "BSC finalize transaction",
          href: `https://operator:credential@testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
      ]),
    ).toEqual([]);
  });

  it("requires explorer screenshot navigation to stay on the same canonical transaction", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const bscBurn = `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`;
    expect(extractExplorerTransactionHash(bscFinalize)).toBe("11".repeat(32));
    expect(
      explorerTransactionEvidenceUrlsMatch(
        bscFinalize,
        `${bscFinalize}/?utm_source=proof`,
      ),
    ).toBe(true);
    expect(
      explorerTransactionEvidenceUrlsMatch(
        bscFinalize,
        `https://bscscan.com/tx/0x${"11".repeat(32)}`,
      ),
    ).toBe(false);
    expect(
      explorerTransactionEvidenceUrlsMatch(
        bscFinalize,
        `https://operator:credential@testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      ),
    ).toBe(false);
    expect(
      explorerTransactionEvidenceUrlsMatch(
        bscFinalize,
        `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`,
      ),
    ).toBe(false);

    let currentUrl = "";
    const page = {
      goto: vi.fn(async (href) => {
        currentUrl =
          href === bscBurn
            ? `https://bscscan.com/tx/0x${"22".repeat(32)}`
            : `${href}/`;
      }),
      url: vi.fn(() => currentUrl),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(screenshotPath, pngBytes());
      }),
    };

    const screenshots = await captureExplorerProofs(
      page,
      [
        { label: "BSC finalize transaction", href: bscFinalize },
        { label: "BSC transaction", href: bscBurn },
      ],
      runDir,
      { settleMs: 0 },
    );

    expect(screenshots).toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        href: bscFinalize,
        finalHref: `${bscFinalize}/`,
        status: "captured",
        relativePath: "explorer-1-bscFinalizeTx.png",
        sizeBytes: expect.any(Number),
        fileVerified: true,
      }),
      expect.objectContaining({
        kind: "bscBurnTx",
        href: bscBurn,
        finalHref: `https://bscscan.com/tx/0x${"22".repeat(32)}`,
        status: "failed",
        error: expect.stringContaining("does not match"),
      }),
    ]);
    expect(page.screenshot).toHaveBeenCalledTimes(1);
  });

  it("rejects explorer screenshot artifacts written as symlinks", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        const targetPath = path.join(runDir, "actual.png");
        await writeFile(targetPath, pngBytes());
        await symlink(targetPath, screenshotPath);
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        screenshot: expect.stringMatching(/explorer-1-bscFinalizeTx\.png$/u),
        error: expect.stringContaining("symbolic link"),
      }),
    ]);
  });

  it("rejects preexisting explorer screenshot symlinks before capture", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const targetPath = path.join(runDir, "actual.png");
    await writeFile(targetPath, pngBytes());
    await symlink(
      targetPath,
      path.join(runDir, "explorer-1-bscFinalizeTx.png"),
    );
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async () => {
        throw new Error("screenshot must not be called");
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining("symbolic link"),
      }),
    ]);
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("rejects preexisting explorer screenshot files before capture", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    await writeFile(
      path.join(runDir, "explorer-1-bscFinalizeTx.png"),
      pngBytes(),
    );
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async () => {
        throw new Error("screenshot must not be called");
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining("already exist"),
      }),
    ]);
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("rejects explorer screenshot artifacts that only forge the PNG signature", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(screenshotPath, forgedPngSignatureOnlyBytes());
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining("expected image/png media, got unknown"),
      }),
    ]);
  });

  it("rejects explorer screenshot artifacts with invalid PNG IDAT streams", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(screenshotPath, pngBytesWithInvalidIdat());
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining("expected image/png media, got unknown"),
      }),
    ]);
  });

  it("rejects explorer screenshot artifacts with uniform PNG pixels", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(screenshotPath, uniformPngBytes());
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining("non-trivial pixel variation"),
      }),
    ]);
  });

  it("rejects explorer screenshot artifacts with tiny PNG dimensions", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(
          screenshotPath,
          pngBytes(2048, 17, { width: 1, height: 1 }),
        );
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        error: expect.stringContaining(
          "expected image/png media with at least 640x480 pixels, got 1x1",
        ),
      }),
    ]);
  });

  it("rejects oversized explorer screenshot artifacts before reading them", async () => {
    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-"));
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const page = {
      goto: vi.fn(async () => undefined),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(() => `Transaction 0x${"11".repeat(32)}`),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `BSC tx 0x${"11".repeat(32)}`),
      })),
      screenshot: vi.fn(async ({ path: screenshotPath }) => {
        await writeFile(screenshotPath, "");
        await truncate(screenshotPath, MAX_SCREENSHOT_ARTIFACT_BYTES + 1);
      }),
    };

    await expect(
      captureExplorerProofs(
        page,
        [{ label: "BSC finalize transaction", href: bscFinalize }],
        runDir,
        { settleMs: 0 },
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        status: "failed",
        screenshot: expect.stringMatching(/explorer-1-bscFinalizeTx\.png$/u),
        error: expect.stringContaining("maximum allowed"),
      }),
    ]);
  });

  it("rejects explorer screenshots when the page content omits the requested transaction hash", async () => {
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    await expect(
      assertExplorerPageContainsTransactionHash(
        {
          title: vi.fn(async () => "Transaction not found"),
          locator: vi.fn(() => ({
            innerText: vi.fn(async () => `Wrong tx 0x${"99".repeat(32)}`),
          })),
        },
        bscFinalize,
        {
          explorerHashContentTimeoutMs: 0,
          explorerHashContentPollMs: 0,
        },
      ),
    ).rejects.toThrow(/did not include transaction hash/);

    const page = {
      goto: vi.fn(async () => {}),
      url: vi.fn(() => bscFinalize),
      title: vi.fn(async () => "Transaction not found"),
      locator: vi.fn(() => ({
        innerText: vi.fn(async () => `Wrong tx 0x${"99".repeat(32)}`),
      })),
      screenshot: vi.fn(async () => {}),
    };
    const screenshots = await captureExplorerProofs(
      page,
      [{ label: "BSC finalize transaction", href: bscFinalize }],
      "/tmp/proof",
      {
        settleMs: 0,
        explorerHashContentTimeoutMs: 0,
        explorerHashContentPollMs: 0,
      },
    );

    expect(screenshots).toEqual([
      expect.objectContaining({
        kind: "bscFinalizeTx",
        href: bscFinalize,
        finalHref: bscFinalize,
        status: "failed",
        error: expect.stringContaining("did not include transaction hash"),
      }),
    ]);
    expect(page.screenshot).not.toHaveBeenCalled();
  });

  it("infers transcript transaction slots from visible UI links without duplicates", () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];

    expect(inferSccpBscVideoTransactions(links)).toEqual({
      tairaSourceTx: links[0].href,
      bscFinalizeTx: links[2].href,
      bscBurnTx: links[3].href,
      tairaSettlementTx: links[4].href,
    });
  });

  it("canonicalizes proof links before transcript persistence", () => {
    const secretLabel = "BSC finalize transaction privateKey=0xfeedface";
    const links = [
      {
        label: secretLabel,
        href: `https://testnet.bscscan.com/tx/0x${"AA".repeat(32)}/?utm_source=proof`,
      },
      {
        label: "TAIRA settlement transaction mnemonic=abandon abandon",
        href: `https://taira-explorer.sora.org/transactions/0x${"BB".repeat(32)}#notes`,
      },
      {
        label: "BSC burn transaction",
        href: `https://testnet.bscscan.com/tx/0x${"CC".repeat(32)}`,
      },
    ];

    const canonicalLinks = canonicalizeSccpBscProofLinks(links);

    expect(canonicalLinks).toEqual([
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"aa".repeat(32)}`,
      },
      {
        label: "BSC burn transaction",
        href: `https://testnet.bscscan.com/tx/0x${"cc".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"bb".repeat(32)}`,
      },
    ]);

    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      links,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      explorerScreenshots: canonicalLinks.map((link) => {
        const kind = classifySccpBscProofLink(link);
        return screenshotProof(kind, link.href);
      }),
    });
    const serialized = JSON.stringify(transcript);
    expect(serialized).not.toContain("privateKey=");
    expect(serialized).not.toContain("mnemonic=");
    expect(serialized).not.toContain("feedface");
    expect(transcript.flowOrder).toEqual(
      REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
    );
    expect(transcript.durationMs).toBe(VALID_ENDED_AT_MS - VALID_STARTED_AT_MS);
    expect(transcript.operatorNotes).toBe(
      SCCP_BSC_VIDEO_INCOMPLETE_OPERATOR_NOTES,
    );
    expect(transcript.transactionLinks).toEqual(canonicalLinks);
  });

  it("builds a secret-safe transaction links artifact", () => {
    const links = [
      {
        label:
          "TAIRA source transaction seedPhrase=abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
        href: `https://taira-explorer.sora.org/transactions/0x${"DD".repeat(32)}?token=operator-secret`,
      },
      {
        label: "BSC burn transaction privateKey=0xfeedface",
        href: `https://testnet.bscscan.com/tx/0x${"EE".repeat(32)}#privateKey=0xfeedface`,
      },
      {
        label: "BSC account privateKey=0xfeedface",
        href: `https://testnet.bscscan.com/address/${BSC_BRIDGE_ADDRESS}`,
      },
    ];

    const artifact = buildSccpBscTransactionLinksArtifact(links);
    const serialized = JSON.stringify(artifact);

    expect(artifact).toEqual([
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"dd".repeat(32)}`,
      },
      {
        label: "BSC burn transaction",
        href: `https://testnet.bscscan.com/tx/0x${"ee".repeat(32)}`,
      },
    ]);
    expect(serialized).not.toContain("seedPhrase=");
    expect(serialized).not.toContain("privateKey=");
    expect(serialized).not.toContain("operator-secret");
    expect(serialized).not.toContain("feedface");
  });

  it("does not invoke accessor-backed proof links while canonicalizing", () => {
    const labelGetter = vi.fn(() => "BSC finalize transaction");
    const hrefGetter = vi.fn(
      () => `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
    );
    const link = {};
    Object.defineProperty(link, "label", {
      configurable: true,
      enumerable: true,
      get: labelGetter,
    });
    Object.defineProperty(link, "href", {
      configurable: true,
      enumerable: true,
      get: hrefGetter,
    });
    const linkGetter = vi.fn(() => ({
      label: "BSC burn transaction",
      href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
    }));
    const linkRows = [];
    Object.defineProperty(linkRows, "0", {
      configurable: true,
      enumerable: true,
      get: linkGetter,
    });

    expect(canonicalizeSccpBscProofLinks([link])).toEqual([]);
    expect(canonicalizeSccpBscProofLinks(linkRows)).toEqual([]);
    expect(labelGetter).not.toHaveBeenCalled();
    expect(hrefGetter).not.toHaveBeenCalled();
    expect(linkGetter).not.toHaveBeenCalled();
  });

  it("evaluates complete and incomplete proof evidence explicitly", () => {
    const transactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href),
        ),
      }),
    ).toEqual({
      proofComplete: true,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: [],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: [],
      invalidExplorerScreenshotSlots: [],
      unexpectedExplorerScreenshotKinds: [],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: [
          screenshotProof("tairaSourceTx", `${transactions.tairaSourceTx}/`),
          screenshotProof(
            "bscFinalizeTx",
            `${transactions.bscFinalizeTx}/?utm_source=proof`,
          ),
          screenshotProof("bscBurnTx", `${transactions.bscBurnTx}/`),
          screenshotProof(
            "tairaSettlementTx",
            `https://taira-explorer.sora.org/transactions/0x${"44".repeat(32)}`,
          ),
        ],
      }),
    ).toEqual({
      proofComplete: true,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: [],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: [],
      invalidExplorerScreenshotSlots: [],
      unexpectedExplorerScreenshotKinds: [],
    });

    for (const [name, screenshotOverrides] of [
      ["missing label", { label: undefined }],
      ["swapped label", { label: "TAIRA source transaction" }],
    ]) {
      expect(
        evaluateSccpBscVideoProofEvidence({
          transactions,
          explorerScreenshots: Object.entries(transactions).map(
            ([kind, href]) =>
              screenshotProof(
                kind,
                href,
                kind === "bscBurnTx" ? screenshotOverrides : {},
              ),
          ),
        }),
        name,
      ).toMatchObject({
        proofComplete: false,
        missingTransactionSlots: [],
        missingExplorerScreenshotSlots: ["bscBurnTx"],
        duplicateTransactionSlots: [],
        duplicateExplorerScreenshotSlots: [],
        invalidExplorerScreenshotSlots: ["bscBurnTx"],
        unexpectedExplorerScreenshotKinds: [],
      });
    }

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions: {
          ...transactions,
          bscBurnTx: "",
        },
        explorerScreenshots: [
          screenshotProof("tairaSourceTx", transactions.tairaSourceTx),
          {
            kind: "bscFinalizeTx",
            href: transactions.bscFinalizeTx,
            status: "failed",
          },
          screenshotProof("tairaSettlementTx", transactions.tairaSettlementTx),
        ],
      }),
    ).toEqual({
      proofComplete: false,
      missingTransactionSlots: ["bscBurnTx"],
      missingExplorerScreenshotSlots: ["bscFinalizeTx"],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: [],
      invalidExplorerScreenshotSlots: ["bscFinalizeTx"],
      unexpectedExplorerScreenshotKinds: [],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(
            kind,
            kind === "bscBurnTx"
              ? `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`
              : href,
          ),
        ),
      }),
    ).toEqual({
      proofComplete: false,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: ["bscBurnTx"],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: [],
      invalidExplorerScreenshotSlots: ["bscBurnTx"],
      unexpectedExplorerScreenshotKinds: [],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            finalHref:
              kind === "bscFinalizeTx"
                ? `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`
                : href,
          }),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: ["bscFinalizeTx"],
      invalidExplorerScreenshotSlots: ["bscFinalizeTx"],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            transactionHash:
              kind === "tairaSettlementTx"
                ? "99".repeat(32)
                : transactionHashFromExplorerUrl(href),
          }),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: ["tairaSettlementTx"],
      invalidExplorerScreenshotSlots: ["tairaSettlementTx"],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: [
          screenshotProof(
            "bscFinalizeTx",
            `https://bscscan.com/tx/0x${"11".repeat(32)}`,
          ),
          screenshotProof(
            "tairaSourceTx",
            `https://minamoto-explorer.sora.org/transactions/${"33".repeat(32)}`,
          ),
        ],
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: expect.arrayContaining([
        "tairaSourceTx",
        "bscFinalizeTx",
      ]),
      invalidExplorerScreenshotSlots: expect.arrayContaining([
        "tairaSourceTx",
        "bscFinalizeTx",
      ]),
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            fileVerified: kind !== "bscBurnTx",
          }),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: ["bscBurnTx"],
      invalidExplorerScreenshotSlots: ["bscBurnTx"],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            mediaType: kind === "bscBurnTx" ? "text/html" : "image/png",
          }),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: ["bscBurnTx"],
      invalidExplorerScreenshotSlots: ["bscBurnTx"],
    });

    for (const relativePath of [
      "/tmp/bscBurnTx.png",
      "C:\\proof\\bscBurnTx.png",
      "screenshots/../bscBurnTx.png",
      "screenshots\\..\\bscBurnTx.png",
      "screenshots/%2e%2e/bscBurnTx.png",
      "screenshots/%252e%252e/bscBurnTx.png",
      "screenshots/%252525252e%252525252e/bscBurnTx.png",
      "file:bscBurnTx.png",
    ]) {
      expect(
        evaluateSccpBscVideoProofEvidence({
          transactions,
          explorerScreenshots: Object.entries(transactions).map(
            ([kind, href]) =>
              screenshotProof(kind, href, {
                relativePath:
                  kind === "bscBurnTx" ? relativePath : `${kind}.png`,
              }),
          ),
        }),
        relativePath,
      ).toMatchObject({
        proofComplete: false,
        missingExplorerScreenshotSlots: ["bscBurnTx"],
        invalidExplorerScreenshotSlots: ["bscBurnTx"],
      });
    }

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: [
          ...Object.entries(transactions).map(([kind, href]) =>
            screenshotProof(kind, href),
          ),
          screenshotProof("bscBurnTx", transactions.bscBurnTx, {
            relativePath: "bscBurnTx-duplicate.png",
          }),
        ],
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: [],
      duplicateExplorerScreenshotSlots: ["bscBurnTx"],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: [
          ...Object.entries(transactions).map(([kind, href]) =>
            screenshotProof(kind, href),
          ),
          screenshotProof(
            "bscAccount",
            `https://testnet.bscscan.com/tx/0x${"55".repeat(32)}`,
          ),
        ],
      }),
    ).toMatchObject({
      proofComplete: false,
      unexpectedExplorerScreenshotKinds: ["bscAccount"],
    });

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            contentLength: kind === "bscBurnTx" ? 12 : 128,
          }),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      missingExplorerScreenshotSlots: ["bscBurnTx"],
      invalidExplorerScreenshotSlots: ["bscBurnTx"],
    });
  });

  it("ignores Object.prototype transaction slots and proof-link metadata", () => {
    const inherited = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      label: "BSC finalize transaction",
      href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
    };
    const pollutedEntries = Object.entries(inherited);
    const previousDescriptors = new Map(
      pollutedEntries.map(([key]) => [
        key,
        Object.getOwnPropertyDescriptor(Object.prototype, key),
      ]),
    );
    let proofEvidence;
    let canonicalLinks;

    try {
      for (const [key, value] of pollutedEntries) {
        Object.defineProperty(Object.prototype, key, {
          configurable: true,
          enumerable: false,
          writable: true,
          value,
        });
      }

      proofEvidence = evaluateSccpBscVideoProofEvidence({
        transactions: {},
        explorerScreenshots: [],
      });
      canonicalLinks = canonicalizeSccpBscProofLinks([{}]);
    } finally {
      for (const [key, descriptor] of previousDescriptors) {
        if (descriptor) {
          Object.defineProperty(Object.prototype, key, descriptor);
        } else {
          delete Object.prototype[key];
        }
      }
    }

    expect(proofEvidence).toMatchObject({
      proofComplete: false,
      missingTransactionSlots: [
        "tairaSourceTx",
        "bscFinalizeTx",
        "bscBurnTx",
        "tairaSettlementTx",
      ],
      missingExplorerScreenshotSlots: [],
    });
    expect(canonicalLinks).toEqual([]);
  });

  it("does not invoke accessor-backed explorer screenshot evidence", () => {
    const transactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };
    const kindGetter = vi.fn(() => "bscBurnTx");
    const screenshot = screenshotProof("bscBurnTx", transactions.bscBurnTx);
    Object.defineProperty(screenshot, "kind", {
      configurable: true,
      enumerable: true,
      get: kindGetter,
    });
    const screenshotGetter = vi.fn(() =>
      screenshotProof("bscFinalizeTx", transactions.bscFinalizeTx),
    );
    const screenshotRows = [];
    Object.defineProperty(screenshotRows, "0", {
      configurable: true,
      enumerable: true,
      get: screenshotGetter,
    });

    const fieldReport = evaluateSccpBscVideoProofEvidence({
      transactions,
      explorerScreenshots: [screenshot],
    });
    const indexReport = evaluateSccpBscVideoProofEvidence({
      transactions,
      explorerScreenshots: screenshotRows,
    });

    expect(kindGetter).not.toHaveBeenCalled();
    expect(screenshotGetter).not.toHaveBeenCalled();
    expect(fieldReport.proofComplete).toBe(false);
    expect(fieldReport.unexpectedExplorerScreenshotKinds).toEqual(["unknown"]);
    expect(indexReport.proofComplete).toBe(false);
    expect(indexReport.missingExplorerScreenshotSlots).toEqual([
      "tairaSourceTx",
      "bscFinalizeTx",
      "bscBurnTx",
      "tairaSettlementTx",
    ]);
    expect(indexReport.invalidExplorerScreenshotSlots).toEqual([
      "explorerScreenshots[0]:not-data-property",
    ]);
  });

  it("rejects proof bundles that reuse explorer transactions across required slots", () => {
    const duplicateBsc = `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`;
    const duplicateTaira = `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`;
    const transactions = {
      tairaSourceTx: duplicateTaira,
      bscFinalizeTx: duplicateBsc,
      bscBurnTx: duplicateBsc.toUpperCase(),
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/0x${"33".repeat(32)}`,
    };

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href),
        ),
      }),
    ).toEqual({
      proofComplete: false,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: [],
      duplicateTransactionSlots: [
        {
          transaction: duplicateTaira,
          slots: ["tairaSourceTx", "tairaSettlementTx"],
        },
        {
          transaction: duplicateBsc,
          slots: ["bscFinalizeTx", "bscBurnTx"],
        },
      ],
      duplicateExplorerScreenshotSlots: [],
      invalidExplorerScreenshotSlots: [],
      unexpectedExplorerScreenshotKinds: [],
    });
  });

  it("rejects proof bundles that reuse transaction hashes across TAIRA and BSC slots", () => {
    const duplicateHash = "11".repeat(32);
    const tairaSource = `https://taira-explorer.sora.org/transactions/${duplicateHash}`;
    const bscFinalize = `https://testnet.bscscan.com/tx/0x${duplicateHash}`;
    const transactions = {
      tairaSourceTx: tairaSource,
      bscFinalizeTx: bscFinalize,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
    };

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href),
        ),
      }),
    ).toMatchObject({
      proofComplete: false,
      duplicateTransactionSlots: [
        {
          transaction: tairaSource,
          slots: ["tairaSourceTx", "bscFinalizeTx"],
        },
      ],
    });
  });

  it("rejects proof bundles that reuse explorer screenshot proof files across required slots", () => {
    const transactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(kind, href, {
            relativePath:
              kind === "tairaSettlementTx"
                ? "tairaSourceTx.png"
                : `${kind}.png`,
          }),
        ),
      }),
    ).toEqual({
      proofComplete: false,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: [],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: ["tairaSourceTx", "tairaSettlementTx"],
      invalidExplorerScreenshotSlots: [],
      unexpectedExplorerScreenshotKinds: [],
    });
  });

  it("rejects proof bundles that reuse explorer screenshot hashes across required slots", () => {
    const transactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };

    expect(
      evaluateSccpBscVideoProofEvidence({
        transactions,
        explorerScreenshots: Object.entries(transactions).map(([kind, href]) =>
          screenshotProof(
            kind,
            href,
            kind === "tairaSettlementTx"
              ? { sha256: SCREENSHOT_SHA256_BY_KIND.tairaSourceTx }
              : {},
          ),
        ),
      }),
    ).toEqual({
      proofComplete: false,
      missingTransactionSlots: [],
      missingExplorerScreenshotSlots: [],
      duplicateTransactionSlots: [],
      duplicateExplorerScreenshotSlots: ["tairaSourceTx", "tairaSettlementTx"],
      invalidExplorerScreenshotSlots: [],
      unexpectedExplorerScreenshotKinds: [],
    });
  });

  it("detects proof links that reuse post-deploy source or canary transactions", () => {
    const cleanTransactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };
    expect(
      evaluateSccpBscVideoPostDeployTransactionEvidence({
        transactions: cleanTransactions,
        readiness: READY_READINESS,
      }),
    ).toEqual({
      ready: true,
      reusedPostDeployTransactionSlots: [],
      reusedPostDeployTransactions: [],
    });

    expect(
      evaluateSccpBscVideoPostDeployTransactionEvidence({
        transactions: {
          ...cleanTransactions,
          tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"77".repeat(32)}`,
          bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"77".repeat(32)}`,
          bscBurnTx: `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`,
          tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"99".repeat(32)}`,
        },
        readiness: READY_READINESS,
      }),
    ).toEqual({
      ready: false,
      reusedPostDeployTransactionSlots: [
        "tairaSourceTx",
        "bscFinalizeTx",
        "bscBurnTx",
        "tairaSettlementTx",
      ],
      reusedPostDeployTransactions: [
        {
          slot: "tairaSourceTx",
          postDeployField: "sourceEventTransactionId",
        },
        {
          slot: "bscFinalizeTx",
          postDeployField: "sourceEventTransactionId",
        },
        {
          slot: "bscBurnTx",
          postDeployField: "routeCanaryTransactionId",
        },
        {
          slot: "tairaSettlementTx",
          postDeployField: "routeCanaryTransactionId",
        },
      ],
    });

    expect(
      evaluateSccpBscVideoPostDeployTransactionEvidence({
        transactions: {
          ...cleanTransactions,
          bscBurnTx: `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`,
        },
        readiness: {
          ...READY_READINESS,
          route: {
            ...READY_READINESS.route,
            postDeployLiveEvidence: {
              post_deploy_full_toml_ready: true,
              source_bridge_config_hash:
                READY_READINESS.route.postDeployLiveEvidence
                  .sourceBridgeConfigHash,
              source_event_transaction_id:
                READY_READINESS.route.postDeployLiveEvidence
                  .sourceEventTransactionId,
              source_event_explorer_url:
                READY_READINESS.route.postDeployLiveEvidence
                  .sourceEventExplorerUrl,
              route_canary_evidence_hash:
                READY_READINESS.route.postDeployLiveEvidence
                  .routeCanaryEvidenceHash,
              route_canary_transaction_id:
                READY_READINESS.route.postDeployLiveEvidence
                  .routeCanaryTransactionId,
              route_canary_explorer_url:
                READY_READINESS.route.postDeployLiveEvidence
                  .routeCanaryExplorerUrl,
              offline_full_toml_sha256:
                READY_READINESS.route.postDeployLiveEvidence
                  .offlineFullTomlSha256,
            },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reusedPostDeployTransactionSlots: ["bscBurnTx"],
      reusedPostDeployTransactions: [
        {
          slot: "bscBurnTx",
          postDeployField: "routeCanaryTransactionId",
        },
      ],
    });

    expect(
      evaluateSccpBscVideoPostDeployTransactionEvidence({
        transactions: {
          ...cleanTransactions,
          bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"77".repeat(32)}`,
          bscBurnTx: `https://testnet.bscscan.com/tx/0x${"99".repeat(32)}`,
        },
        readiness: {
          ...READY_READINESS,
          route: {
            ...READY_READINESS.route,
            postDeployLiveEvidence: {
              postDeployFullTomlReady: true,
              postDeploySourceBridgeConfigHash:
                READY_READINESS.route.postDeployLiveEvidence
                  .sourceBridgeConfigHash,
              postDeploySourceEventTransactionUrl:
                READY_READINESS.route.postDeployLiveEvidence
                  .sourceEventExplorerUrl,
              postDeployRouteCanaryEvidenceHash:
                READY_READINESS.route.postDeployLiveEvidence
                  .routeCanaryEvidenceHash,
              postDeployRouteCanaryTransactionUrl:
                READY_READINESS.route.postDeployLiveEvidence
                  .routeCanaryExplorerUrl,
              postDeployOfflineFullTomlSha256:
                READY_READINESS.route.postDeployLiveEvidence
                  .offlineFullTomlSha256,
            },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reusedPostDeployTransactionSlots: ["bscFinalizeTx", "bscBurnTx"],
      reusedPostDeployTransactions: [
        {
          slot: "bscFinalizeTx",
          postDeployField: "sourceEventExplorerUrl",
        },
        {
          slot: "bscBurnTx",
          postDeployField: "routeCanaryExplorerUrl",
        },
      ],
    });
  });

  it("requires route readiness evidence before a transcript can be complete", async () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];
    const explorerScreenshots = [
      screenshotProof("tairaSourceTx", links[0].href),
      screenshotProof("bscFinalizeTx", links[1].href),
      screenshotProof("bscBurnTx", links[2].href),
      screenshotProof("tairaSettlementTx", links[3].href),
    ];

    expect(evaluateSccpBscVideoReadinessEvidence(null)).toEqual({
      ready: false,
      missingReadinessEvidence: ["smokeReadinessReport"],
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence(Object.create(READY_READINESS)),
    ).toEqual({
      ready: false,
      missingReadinessEvidence: ["smokeReadinessReport"],
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        generatedAtMs: Date.parse("2026-06-07T00:00:00.000Z"),
      }),
    ).toMatchObject({
      ready: false,
      missingReadinessEvidence: expect.arrayContaining([
        "smokeReadinessTimestampAlias.pointTimestampFieldsDisagree.checkedAt.generatedAtMs",
      ]),
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        generatedAt: "2026-06-06T00:00:00.000Z",
        generatedAtMs: "not-a-safe-integer",
      }),
    ).toMatchObject({
      ready: false,
      missingReadinessEvidence: expect.arrayContaining([
        "smokeReadinessTimestampAlias.generatedAtMs.invalid",
      ]),
    });
    {
      const inherited = {
        ready: true,
        routeReady: true,
        checkedAt: READY_READINESS.checkedAt,
        checks: READY_READINESS.checks,
        route: READY_READINESS.route,
        peerAudit: READY_READINESS.peerAudit,
      };
      const pollutedEntries = Object.entries(inherited);
      const previousDescriptors = new Map(
        pollutedEntries.map(([key]) => [
          key,
          Object.getOwnPropertyDescriptor(Object.prototype, key),
        ]),
      );
      let result;

      try {
        for (const [key, value] of pollutedEntries) {
          Object.defineProperty(Object.prototype, key, {
            configurable: true,
            enumerable: false,
            writable: true,
            value,
          });
        }

        result = evaluateSccpBscVideoReadinessEvidence({});
      } finally {
        for (const [key, descriptor] of previousDescriptors) {
          if (descriptor) {
            Object.defineProperty(Object.prototype, key, descriptor);
          } else {
            delete Object.prototype[key];
          }
        }
      }

      expect(result).toMatchObject({
        ready: false,
        missingReadinessEvidence: expect.arrayContaining([
          "routePreflightReady",
          "smokeReadinessReady",
          "smokeReadinessCheck.route-preflight",
          "smokeReadinessTimestamp",
          "routeIdentityBinding",
          "routeDeploymentBinding",
          "postDeployLiveEvidenceBinding",
          "peerAuditBinding",
        ]),
      });
    }
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ready: false,
        routeReady: false,
      }),
    ).toEqual({
      ready: false,
      missingReadinessEvidence: [
        "routePreflightReady",
        "smokeReadinessReady",
        "smokeReadinessCheck.route-preflight",
        "smokeReadinessCheck.peer-config-audit",
        "smokeReadinessCheck.walletconnect-project-id",
        "smokeReadinessCheck.runtime-prover-config",
        "smokeReadinessCheck.destination-prover-module",
        "smokeReadinessCheck.destination-prover-manifest",
        "smokeReadinessCheck.source-prover-module",
        "smokeReadinessCheck.source-prover-manifest",
        "smokeReadinessTimestamp",
        "routeIdentityBinding",
        "routeDeploymentBinding",
        "postDeployLiveEvidenceBinding",
        "peerAuditBinding",
      ],
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          routeId: "taira_tron_xor",
          deployment: {
            ...READY_READINESS.route.deployment,
            proofArtifactHash: null,
            nativeEvmProverBundleHash: null,
          },
          postDeployLiveEvidence: {
            ...READY_READINESS.route.postDeployLiveEvidence,
            offlineFullTomlSha256: null,
          },
        },
        peerAudit: {
          ...READY_READINESS.peerAudit,
          ready: false,
          peerCount: 0,
          manifestFingerprint: "sha256:not-a-hash",
        },
      }),
    ).toEqual({
      ready: false,
      missingReadinessEvidence: [
        "routeIdentityBinding",
        "routeDeployment.proofArtifactHash",
        "routeDeployment.nativeEvmProverBundleHash",
        "postDeployLiveEvidence.offlineFullTomlSha256",
        "peerAudit.ready",
        "peerAudit.peerCount",
        "peerAudit.manifestFingerprint",
      ],
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        peerAudit: READY_ONCHAIN_ONLY_PEER_AUDIT,
      }),
    ).toEqual({
      ready: true,
      missingReadinessEvidence: [],
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        peerAudit: {
          ...READY_ONCHAIN_ONLY_PEER_AUDIT,
          peers: [
            {
              ...READY_ONCHAIN_ONLY_PEER_AUDIT.peers[0],
              routeCount: 1,
            },
          ],
        },
      }),
    ).toEqual({
      ready: false,
      missingReadinessEvidence: ["peerAuditBinding"],
    });
    for (const [name, peerAuditOverrides] of [
      [
        "missing peer sanitized stanza evidence",
        { sanitizedStanzaFilesChecked: undefined },
      ],
      [
        "false peer sanitized stanza evidence",
        { sanitizedStanzaFilesChecked: false },
      ],
    ]) {
      expect(
        evaluateSccpBscVideoReadinessEvidence({
          ...READY_READINESS,
          peerAudit: {
            ...READY_READINESS.peerAudit,
            ...peerAuditOverrides,
          },
        }),
        name,
      ).toEqual({
        ready: false,
        missingReadinessEvidence: ["peerAudit.sanitizedStanzaFilesChecked"],
      });
    }
    expect(
      buildSccpBscLiveVideoTranscript({
        runDir: "/tmp/proof",
        readiness: {
          ...READY_READINESS,
          route: {
            ...READY_READINESS.route,
            deployment: {
              ...READY_READINESS.route.deployment,
              proofArtifactHash: "",
              provingKeyHash: "",
              nativeEvmProverBundleHash: "",
            },
          },
        },
        startedAtMs: VALID_STARTED_AT_MS,
        endedAtMs: VALID_ENDED_AT_MS,
        links,
        explorerScreenshots,
        videoArtifacts: [VIDEO_ARTIFACT],
      }),
    ).toMatchObject({
      proofComplete: false,
      missingEvidence: {
        readiness: [
          "routeDeployment.proofArtifactHash",
          "routeDeployment.provingKeyHash",
          "routeDeployment.nativeEvmProverBundleHash",
        ],
      },
    });

    for (const [name, deploymentOverrides, expected] of [
      [
        "proof hash reuses verifier key hash",
        { proofArtifactHash: READY_READINESS.route.deployment.verifierKeyHash },
        "routeDeployment.proofArtifactHash.roleCollision.verifierKeyHash",
      ],
      [
        "proving key hash reuses proof artifact hash",
        { provingKeyHash: READY_READINESS.route.deployment.proofArtifactHash },
        "routeDeployment.provingKeyHash.roleCollision.proofArtifactHash",
      ],
      [
        "native prover bundle hash reuses destination binding hash",
        {
          nativeEvmProverBundleHash:
            READY_READINESS.route.deployment.destinationBindingHash,
        },
        "routeDeployment.destinationBindingHash.roleCollision.nativeEvmProverBundleHash",
      ],
    ]) {
      const forgedRoleCollision = evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          deployment: {
            ...READY_READINESS.route.deployment,
            ...deploymentOverrides,
          },
        },
      });
      expect(forgedRoleCollision.ready, name).toBe(false);
      expect(forgedRoleCollision.missingReadinessEvidence, name).toContain(
        expected,
      );
    }

    expect(buildSccpBscVideoReadinessBinding(READY_READINESS)).toMatchObject({
      checkedAt: READY_READINESS.checkedAt,
      routeReady: true,
      smokeReadinessReady: true,
      checks: expect.arrayContaining([
        expect.objectContaining({ id: "route-preflight", ok: true }),
        expect.objectContaining({
          id: "destination-prover-manifest",
          status: "pass",
        }),
      ]),
      route: {
        routeId: "taira_bsc_xor",
        assetKey: "xor",
        deployment: {
          nativeEvmProverBundleHash: `0x${"bb".repeat(32)}`,
        },
      },
      peerAudit: {
        ready: true,
        manifestFingerprint: `sha256:${"aa".repeat(32)}`,
        sanitizedStanzaFilesChecked: true,
      },
    });

    const aliasedReadinessBinding = buildSccpBscVideoReadinessBinding({
      ...READY_READINESS,
      route: {
        ...READY_READINESS.route,
        deployment: {
          ...READY_READINESS.route.deployment,
          sourceBridgeAddress: undefined,
          verifierAddress: undefined,
          sccp_bsc_source_bridge_address:
            READY_READINESS.route.deployment.sourceBridgeAddress,
          sccp_bsc_destination_verifier_address:
            READY_READINESS.route.deployment.verifierAddress,
        },
      },
    });
    expect(aliasedReadinessBinding.route?.deployment).toMatchObject({
      sourceBridgeAddress: READY_READINESS.route.deployment.sourceBridgeAddress,
      verifierAddress: READY_READINESS.route.deployment.verifierAddress,
    });

    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          deployment: {
            ...READY_READINESS.route.deployment,
            bridgeAddress: undefined,
            tokenAddress: undefined,
            sourceBridgeAddress: undefined,
            verifierAddress: undefined,
            verifierCodeHash: undefined,
            verifierKeyHash: undefined,
            proofArtifactHash: undefined,
            bscBridgeAddress: READY_READINESS.route.deployment.bridgeAddress,
            evmTokenAddress: READY_READINESS.route.deployment.tokenAddress,
            bscSourceBridgeAddress:
              READY_READINESS.route.deployment.sourceBridgeAddress,
            evmVerifierAddress:
              READY_READINESS.route.deployment.verifierAddress,
            verifierCodeHashHex:
              READY_READINESS.route.deployment.verifierCodeHash,
            verifierKeyHashHex:
              READY_READINESS.route.deployment.verifierKeyHash,
            circuitArtifactHash:
              READY_READINESS.route.deployment.proofArtifactHash,
          },
        },
      }),
    ).toEqual({
      ready: true,
      missingReadinessEvidence: [],
    });

    const forgedDiagnosticVerifierHash = evaluateSccpBscVideoReadinessEvidence({
      ...READY_READINESS,
      route: {
        ...READY_READINESS.route,
        deployment: {
          ...READY_READINESS.route.deployment,
          verifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
        },
      },
    });
    expect(forgedDiagnosticVerifierHash.ready).toBe(false);
    expect(forgedDiagnosticVerifierHash.missingReadinessEvidence).toContain(
      "diagnosticVerifierKeyHash",
    );

    const forgedNestedDiagnosticVerifierHash =
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          deployment: {
            ...READY_READINESS.route.deployment,
            verifierEvidence: {
              bridgeVerifierKeyHash: DIAGNOSTIC_BSC_VERIFIER_KEY_HASH,
            },
          },
        },
      });
    expect(forgedNestedDiagnosticVerifierHash.ready).toBe(false);
    expect(
      forgedNestedDiagnosticVerifierHash.missingReadinessEvidence,
    ).toContain("diagnosticVerifierKeyHash");

    const forgedForbiddenDeploymentAliases =
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          deployment: {
            ...READY_READINESS.route.deployment,
            sourceBridgeAddress: undefined,
            verifierAddress: undefined,
            sccpTronSourceBridgeAddress:
              READY_READINESS.route.deployment.sourceBridgeAddress,
            tronVerifierAddress:
              READY_READINESS.route.deployment.verifierAddress,
          },
        },
      });
    expect(forgedForbiddenDeploymentAliases.ready).toBe(false);
    expect(forgedForbiddenDeploymentAliases.missingReadinessEvidence).toEqual(
      expect.arrayContaining([
        "readinessAlias.route.deployment.sourceBridgeAddress.forbidden.sccpTronSourceBridgeAddress",
        "readinessAlias.route.deployment.verifierAddress.forbidden.tronVerifierAddress",
      ]),
    );

    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          bsc: {
            bscNetwork: "testnet",
            bscChain: "bsc-testnet",
            bsc_chain_id_hex: "0x61",
            bsc_network_id_hex: BSC_TESTNET_NETWORK_ID_HEX,
            bscExplorerUrl: "https://testnet.bscscan.com",
            bscExplorerHost: "testnet.bscscan.com",
          },
        },
      }),
    ).toEqual({
      ready: true,
      missingReadinessEvidence: [],
    });

    const forgedBscExplorer = evaluateSccpBscVideoReadinessEvidence({
      ...READY_READINESS,
      route: {
        ...READY_READINESS.route,
        bsc: {
          ...READY_READINESS.route.bsc,
          bscExplorerUrl: "https://bscscan.com",
          bscExplorerHost: "bscscan.com",
        },
      },
    });
    expect(forgedBscExplorer.ready).toBe(false);
    expect(forgedBscExplorer.missingReadinessEvidence).toContain(
      "routeBscExplorerBinding",
    );

    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          postDeployLiveEvidence: {
            post_deploy_full_toml_ready: true,
            source_bridge_config_hash:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceBridgeConfigHash,
            source_event_transaction_id:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceEventTransactionId,
            source_event_explorer_url:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceEventExplorerUrl,
            route_canary_evidence_hash:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryEvidenceHash,
            route_canary_transaction_id:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryTransactionId,
            route_canary_explorer_url:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryExplorerUrl,
            offline_full_toml_sha256:
              READY_READINESS.route.postDeployLiveEvidence
                .offlineFullTomlSha256,
          },
        },
      }),
    ).toEqual({
      ready: true,
      missingReadinessEvidence: [],
    });

    expect(
      evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          postDeployLiveEvidence: {
            postDeployFullTomlReady: true,
            postDeploySourceBridgeConfigHash:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceBridgeConfigHash,
            postDeploySourceEventTransactionId:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceEventTransactionId,
            postDeploySourceEventTransactionUrl:
              READY_READINESS.route.postDeployLiveEvidence
                .sourceEventExplorerUrl,
            postDeployRouteCanaryEvidenceHash:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryEvidenceHash,
            postDeployRouteCanaryTransactionId:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryTransactionId,
            postDeployRouteCanaryTransactionUrl:
              READY_READINESS.route.postDeployLiveEvidence
                .routeCanaryExplorerUrl,
            postDeployOfflineFullTomlSha256:
              READY_READINESS.route.postDeployLiveEvidence
                .offlineFullTomlSha256,
          },
        },
      }),
    ).toEqual({
      ready: true,
      missingReadinessEvidence: [],
    });

    for (const [name, postDeployOverrides, expected] of [
      [
        "source event URL points at a different BSC transaction",
        {
          sourceEventExplorerUrl: `https://testnet.bscscan.com/tx/0x${"12".repeat(32)}`,
        },
        "postDeployLiveEvidence.sourceEventExplorerUrl.transactionIdBinding",
      ],
      [
        "route canary URL points at a different BSC transaction",
        {
          routeCanaryExplorerUrl: `https://testnet.bscscan.com/tx/0x${"13".repeat(32)}`,
        },
        "postDeployLiveEvidence.routeCanaryExplorerUrl.transactionIdBinding",
      ],
      [
        "route canary reuses the source event transaction id",
        {
          routeCanaryTransactionId:
            READY_READINESS.route.postDeployLiveEvidence
              .sourceEventTransactionId,
          routeCanaryExplorerUrl:
            READY_READINESS.route.postDeployLiveEvidence.sourceEventExplorerUrl,
        },
        "postDeployLiveEvidence.routeCanaryTransactionId.roleCollision.sourceEventTransactionId",
      ],
    ]) {
      const result = evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        route: {
          ...READY_READINESS.route,
          postDeployLiveEvidence: {
            ...READY_READINESS.route.postDeployLiveEvidence,
            ...postDeployOverrides,
          },
        },
      });
      expect(result.ready, name).toBe(false);
      expect(result.missingReadinessEvidence, name).toContain(expected);
    }

    const forgedNoChecks = evaluateSccpBscVideoReadinessEvidence({
      ...READY_READINESS,
      checks: [],
    });
    expect(forgedNoChecks.ready).toBe(false);
    expect(forgedNoChecks.missingReadinessEvidence).toContain(
      "smokeReadinessCheck.route-preflight",
    );
    expect(forgedNoChecks.missingReadinessEvidence).toContain(
      "smokeReadinessCheck.destination-prover-manifest",
    );

    const forgedMissingRoutePreflight = evaluateSccpBscVideoReadinessEvidence({
      ...READY_READINESS,
      checks: READY_READINESS.checks.filter(
        (entry) => entry.id !== "route-preflight",
      ),
    });
    expect(forgedMissingRoutePreflight.ready).toBe(false);
    expect(forgedMissingRoutePreflight.missingReadinessEvidence).toContain(
      "smokeReadinessCheck.route-preflight",
    );

    const ambiguousCheckCases = [
      {
        name: "duplicate check id",
        checks: [
          ...READY_READINESS.checks,
          { ...READY_READINESS.checks[0], status: "pass" },
        ],
        expected:
          "smokeReadinessCheckIntegrity.smokeReadiness check id route-preflight is duplicated",
      },
      {
        name: "contradictory ok/status",
        checks: READY_READINESS.checks.map((entry) =>
          entry.id === "route-preflight"
            ? { ...entry, ok: false, status: "pass" }
            : entry,
        ),
        expected:
          "smokeReadinessCheckIntegrity.smokeReadiness check route-preflight has contradictory ok/status",
      },
      {
        name: "invalid status-only check",
        checks: READY_READINESS.checks.map((entry) =>
          entry.id === "route-preflight"
            ? { id: entry.id, message: entry.message, status: "maybe" }
            : entry,
        ),
        expected:
          "smokeReadinessCheckIntegrity.smokeReadiness check route-preflight has no machine-readable pass/fail state",
      },
      {
        name: "non-object check",
        checks: [null, ...READY_READINESS.checks],
        expected:
          "smokeReadinessCheckIntegrity.smokeReadiness check 0 is not an object",
      },
    ];

    for (const { name, checks, expected } of ambiguousCheckCases) {
      const result = evaluateSccpBscVideoReadinessEvidence({
        ...READY_READINESS,
        checks,
      });
      expect(result.ready, name).toBe(false);
      expect(result.missingReadinessEvidence, name).toContain(expected);
    }

    const forgedDuplicateAliases = evaluateSccpBscVideoReadinessEvidence({
      ...READY_READINESS,
      checks: READY_READINESS.checks.map((entry, index) =>
        index === 0 ? { ...entry, check_id: entry.id } : entry,
      ),
      route: {
        ...READY_READINESS.route,
        route_id: READY_READINESS.route.routeId,
        asset_key: READY_READINESS.route.assetKey,
        bsc: {
          ...READY_READINESS.route.bsc,
          bscNetwork: READY_READINESS.route.bsc.network,
        },
        deployment: {
          ...READY_READINESS.route.deployment,
          sccp_bsc_destination_verifier_address:
            READY_READINESS.route.deployment.verifierAddress,
          proof_artifact_hash:
            READY_READINESS.route.deployment.proofArtifactHash,
        },
        postDeployLiveEvidence: {
          ...READY_READINESS.route.postDeployLiveEvidence,
          source_event_transaction_id:
            READY_READINESS.route.postDeployLiveEvidence
              .sourceEventTransactionId,
        },
      },
      peerAudit: {
        ...READY_READINESS.peerAudit,
        route_id: READY_READINESS.peerAudit.routeId,
      },
    });
    expect(forgedDuplicateAliases.ready).toBe(false);
    expect(forgedDuplicateAliases.missingReadinessEvidence).toEqual(
      expect.arrayContaining([
        "readinessAlias.route.routeId",
        "readinessAlias.route.assetKey",
        "readinessAlias.route.bsc.network",
        "readinessAlias.route.deployment.verifierAddress",
        "readinessAlias.route.deployment.proofArtifactHash",
        "readinessAlias.route.postDeployLiveEvidence.sourceEventTransactionId",
        "readinessAlias.peerAudit.routeId",
        "readinessAlias.checks.route-preflight.id",
      ]),
    );

    expect(evaluateSccpBscVideoArtifactEvidence([VIDEO_ARTIFACT])).toEqual({
      ready: true,
      missingVideoArtifacts: [],
      capturedArtifacts: [
        {
          relativePath: "video.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ab".repeat(32),
          mediaType: "video/webm",
        },
      ],
    });
    expect(
      evaluateSccpBscVideoArtifactEvidence([
        VIDEO_ARTIFACT,
        "not-a-video-artifact",
      ]),
    ).toEqual({
      ready: false,
      missingVideoArtifacts: ["videoArtifacts[1]:not-object"],
      capturedArtifacts: [
        {
          relativePath: "video.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ab".repeat(32),
          mediaType: "video/webm",
        },
      ],
    });
    const sparseVideoArtifacts = [VIDEO_ARTIFACT];
    sparseVideoArtifacts.length = 2;
    expect(evaluateSccpBscVideoArtifactEvidence(sparseVideoArtifacts)).toEqual({
      ready: false,
      missingVideoArtifacts: ["videoArtifacts[1]:missing"],
      capturedArtifacts: [
        {
          relativePath: "video.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ab".repeat(32),
          mediaType: "video/webm",
        },
      ],
    });
    expect(
      evaluateSccpBscVideoArtifactEvidence([
        VIDEO_ARTIFACT,
        {
          ...VIDEO_ARTIFACT,
          relativePath: "video-duplicate.webm",
          sha256: "ac".repeat(32),
        },
      ]),
    ).toEqual({
      ready: false,
      missingVideoArtifacts: ["duplicate-recording"],
      capturedArtifacts: [
        {
          relativePath: "video.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ab".repeat(32),
          mediaType: "video/webm",
        },
        {
          relativePath: "video-duplicate.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ac".repeat(32),
          mediaType: "video/webm",
        },
      ],
    });
    expect(
      evaluateSccpBscVideoArtifactEvidence([VIDEO_ARTIFACT], {
        explorerScreenshots: [
          screenshotProof(
            "bscBurnTx",
            `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
            { sha256: VIDEO_ARTIFACT.sha256 },
          ),
        ],
      }),
    ).toEqual({
      ready: false,
      missingVideoArtifacts: ["reused-proof-artifact-hash:bscBurnTx"],
      capturedArtifacts: [
        {
          relativePath: "video.webm",
          sizeBytes: VIDEO_ARTIFACT_SIZE_BYTES,
          sha256: "ab".repeat(32),
          mediaType: "video/webm",
        },
      ],
    });
    for (const [name, artifacts] of [
      ["missing", []],
      ["tiny", [{ ...VIDEO_ARTIFACT, sizeBytes: 10 }]],
      [
        "oversized",
        [{ ...VIDEO_ARTIFACT, sizeBytes: MAX_VIDEO_ARTIFACT_BYTES + 1 }],
      ],
      ["unverified", [{ ...VIDEO_ARTIFACT, fileVerified: false }]],
      ["zero hash", [{ ...VIDEO_ARTIFACT, sha256: "00".repeat(32) }]],
      ["missing media type", [{ ...VIDEO_ARTIFACT, mediaType: undefined }]],
      [
        "wrong media type",
        [{ ...VIDEO_ARTIFACT, mediaType: "application/octet-stream" }],
      ],
      ["wrong extension", [{ ...VIDEO_ARTIFACT, relativePath: "video.mp4" }]],
      [
        "path traversal",
        [{ ...VIDEO_ARTIFACT, relativePath: "../video.webm" }],
      ],
      [
        "absolute path",
        [{ ...VIDEO_ARTIFACT, relativePath: "/tmp/video.webm" }],
      ],
      [
        "windows absolute path",
        [{ ...VIDEO_ARTIFACT, relativePath: "C:\\proof\\video.webm" }],
      ],
      [
        "windows traversal path",
        [{ ...VIDEO_ARTIFACT, relativePath: "proof\\..\\video.webm" }],
      ],
      [
        "encoded traversal path",
        [{ ...VIDEO_ARTIFACT, relativePath: "proof/%2e%2e/video.webm" }],
      ],
      [
        "double-encoded traversal path",
        [{ ...VIDEO_ARTIFACT, relativePath: "proof/%252e%252e/video.webm" }],
      ],
      [
        "over-encoded traversal path",
        [
          {
            ...VIDEO_ARTIFACT,
            relativePath: "proof/%252525252e%252525252e/video.webm",
          },
        ],
      ],
      ["scheme path", [{ ...VIDEO_ARTIFACT, relativePath: "file:video.webm" }]],
    ]) {
      expect(evaluateSccpBscVideoArtifactEvidence(artifacts), name).toEqual({
        ready: false,
        missingVideoArtifacts: ["recording"],
        capturedArtifacts: [],
      });
    }

    const runDir = await mkdtemp(path.join(tmpdir(), "sccp-bsc-video-proof-"));
    const outsideDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-video-proof-escape-"),
    );
    const escapedVideoPath = path.join(outsideDir, "video.webm");
    const symlinkedVideoPath = path.join(runDir, "video.webm");
    await writeFile(escapedVideoPath, webmBytes());
    await symlink(escapedVideoPath, symlinkedVideoPath);
    await expect(
      collectSccpBscVideoArtifacts(
        { path: vi.fn(async () => symlinkedVideoPath) },
        runDir,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        relativePath: "video.webm",
        fileVerified: false,
        error: expect.stringContaining("symbolic link"),
      }),
    ]);

    const undersizedVideoDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-video-proof-undersized-"),
    );
    const undersizedVideoPath = path.join(undersizedVideoDir, "video.webm");
    const undersizedVideoBytes = webmBytes(4096, 31);
    await writeFile(undersizedVideoPath, undersizedVideoBytes);
    await expect(
      collectSccpBscVideoArtifacts(
        { path: vi.fn(async () => undersizedVideoPath) },
        undersizedVideoDir,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        relativePath: "video.webm",
        sizeBytes: undersizedVideoBytes.length,
        fileVerified: false,
        error: expect.stringContaining("minimum required"),
      }),
    ]);

    const oversizedVideoDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-video-proof-oversized-"),
    );
    const oversizedVideoPath = path.join(oversizedVideoDir, "video.webm");
    await writeFile(oversizedVideoPath, "");
    await truncate(oversizedVideoPath, MAX_VIDEO_ARTIFACT_BYTES + 1);
    await expect(
      collectSccpBscVideoArtifacts(
        { path: vi.fn(async () => oversizedVideoPath) },
        oversizedVideoDir,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        relativePath: "video.webm",
        sizeBytes: MAX_VIDEO_ARTIFACT_BYTES + 1,
        fileVerified: false,
        error: expect.stringContaining("maximum allowed"),
      }),
    ]);

    for (const [name, bytes] of [
      ["doctype substring only", forgedWebmSubstringBytes()],
      ["wrong doctype value", forgedWebmWrongDocTypeBytes()],
      ["wrong doctype size", forgedWebmWrongDocTypeSizeBytes()],
      ["missing segment element", forgedWebmWithoutSegmentBytes()],
      ["missing info element", forgedWebmWithoutInfoBytes()],
      ["missing tracks element", forgedWebmWithoutTracksBytes()],
      ["missing cluster element", forgedWebmWithoutClusterBytes()],
      ["missing block element", forgedWebmWithoutBlockBytes()],
      ["tiny padded frame payload", forgedWebmTinyPaddedBytes()],
      ["dominant-byte padded frame payload", forgedWebmDominantPaddedBytes()],
    ]) {
      const forgedVideoDir = await mkdtemp(
        path.join(tmpdir(), "sccp-bsc-video-proof-forged-"),
      );
      const forgedVideoPath = path.join(forgedVideoDir, "video.webm");
      await writeFile(forgedVideoPath, bytes);
      await expect(
        collectSccpBscVideoArtifacts(
          { path: vi.fn(async () => forgedVideoPath) },
          forgedVideoDir,
        ),
        name,
      ).resolves.toEqual([
        expect.objectContaining({
          status: "failed",
          relativePath: "video.webm",
          sizeBytes: bytes.length,
          mediaType: "unknown",
          fileVerified: false,
          fileVerificationError: expect.stringContaining(
            "expected video/webm media, got unknown",
          ),
        }),
      ]);
    }

    const insideRunDir = await mkdtemp(
      path.join(tmpdir(), "sccp-bsc-video-proof-inside-"),
    );
    const realVideoPath = path.join(insideRunDir, "actual.webm");
    const insideSymlinkPath = path.join(insideRunDir, "video.webm");
    await writeFile(realVideoPath, webmBytes());
    await symlink(realVideoPath, insideSymlinkPath);
    await expect(
      collectSccpBscVideoArtifacts(
        { path: vi.fn(async () => insideSymlinkPath) },
        insideRunDir,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        status: "failed",
        relativePath: "video.webm",
        fileVerified: false,
        error: expect.stringContaining("symbolic link"),
      }),
    ]);

    expect(
      evaluateSccpBscVideoTimelineEvidence({
        startedAtMs: VALID_STARTED_AT_MS,
        endedAtMs: VALID_ENDED_AT_MS,
      }),
    ).toEqual({
      ready: true,
      durationMs: 60_000,
      missingVideoTimeline: [],
    });
    for (const [name, timeline] of [
      ["missing start", { endedAtMs: VALID_ENDED_AT_MS }],
      [
        "too short",
        {
          startedAtMs: VALID_STARTED_AT_MS,
          endedAtMs: VALID_STARTED_AT_MS + 29_999,
        },
      ],
      [
        "reversed",
        {
          startedAtMs: VALID_ENDED_AT_MS,
          endedAtMs: VALID_STARTED_AT_MS,
        },
      ],
      [
        "too long",
        {
          startedAtMs: VALID_STARTED_AT_MS,
          endedAtMs: VALID_STARTED_AT_MS + 7_200_001,
        },
      ],
    ]) {
      expect(
        evaluateSccpBscVideoTimelineEvidence(timeline),
        name,
      ).toMatchObject({
        ready: false,
        missingVideoTimeline: expect.arrayContaining(["durationMs"]),
      });
    }

    expect(
      buildSccpBscLiveVideoTranscript({
        runDir: "/tmp/proof",
        readiness: null,
        startedAtMs: VALID_STARTED_AT_MS,
        endedAtMs: VALID_ENDED_AT_MS,
        links,
        explorerScreenshots,
      }),
    ).toMatchObject({
      preflightReady: null,
      smokeReadinessReady: null,
      proofComplete: false,
      missingEvidence: {
        readiness: ["smokeReadinessReport"],
      },
      evidence: {
        proofComplete: true,
        readinessEvidence: {
          ready: false,
        },
        videoArtifactEvidence: {
          ready: false,
        },
      },
    });
  });

  it("does not invoke accessor-backed readiness report fields", () => {
    const routeGetter = vi.fn(() => READY_READINESS.route);
    const checkGetter = vi.fn(() => READY_READINESS.checks[0]);
    const readiness = {
      ready: true,
      routeReady: true,
      checkedAt: READY_READINESS.checkedAt,
      checks: [],
      peerAudit: READY_READINESS.peerAudit,
    };
    Object.defineProperty(readiness, "route", {
      configurable: true,
      enumerable: true,
      get: routeGetter,
    });
    Object.defineProperty(readiness.checks, "0", {
      configurable: true,
      enumerable: true,
      get: checkGetter,
    });

    const report = evaluateSccpBscVideoReadinessEvidence(readiness);
    const binding = buildSccpBscVideoReadinessBinding(readiness);

    expect(routeGetter).not.toHaveBeenCalled();
    expect(checkGetter).not.toHaveBeenCalled();
    expect(report.ready).toBe(false);
    expect(report.missingReadinessEvidence).toEqual(
      expect.arrayContaining([
        "smokeReadinessCheck.route-preflight",
        "routeIdentityBinding",
        "routeDeploymentBinding",
        "postDeployLiveEvidenceBinding",
      ]),
    );
    expect(binding.route).toBeNull();
    expect(binding.checks).toEqual([]);
  });

  it("does not invoke accessor-backed video artifact records", () => {
    const statusGetter = vi.fn(() => "captured");
    const artifact = { ...VIDEO_ARTIFACT };
    Object.defineProperty(artifact, "status", {
      configurable: true,
      enumerable: true,
      get: statusGetter,
    });
    const artifactGetter = vi.fn(() => VIDEO_ARTIFACT);
    const artifactRows = [];
    Object.defineProperty(artifactRows, "0", {
      configurable: true,
      enumerable: true,
      get: artifactGetter,
    });

    const fieldReport = evaluateSccpBscVideoArtifactEvidence([artifact]);
    const indexReport = evaluateSccpBscVideoArtifactEvidence(artifactRows);
    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [artifact],
    });

    expect(statusGetter).not.toHaveBeenCalled();
    expect(artifactGetter).not.toHaveBeenCalled();
    expect(fieldReport).toMatchObject({
      ready: false,
      missingVideoArtifacts: ["recording"],
      capturedArtifacts: [],
    });
    expect(indexReport).toMatchObject({
      ready: false,
      missingVideoArtifacts: [
        "recording",
        "videoArtifacts[0]:not-data-property",
      ],
      capturedArtifacts: [],
    });
    expect(transcript.videoArtifacts[0]).not.toHaveProperty("status");
    expect(transcript.evidence.videoArtifactEvidence.ready).toBe(false);
  });

  it("does not invoke accessor-backed timeline and transcript completion fields", () => {
    const startedAtGetter = vi.fn(() => VALID_STARTED_AT_MS);
    const timeline = { endedAtMs: VALID_ENDED_AT_MS };
    Object.defineProperty(timeline, "startedAtMs", {
      configurable: true,
      enumerable: true,
      get: startedAtGetter,
    });

    const timelineReport = evaluateSccpBscVideoTimelineEvidence(timeline);

    expect(startedAtGetter).not.toHaveBeenCalled();
    expect(timelineReport).toMatchObject({
      ready: false,
      durationMs: null,
      missingVideoTimeline: expect.arrayContaining([
        "startedAtMs",
        "durationMs",
      ]),
    });

    const proofCompleteGetter = vi.fn(() => true);
    const duplicateTransactionGetter = vi.fn(() => "secret-local-tx");
    const duplicateEntry = { slots: ["bscFinalizeTx", "bscBurnTx"] };
    Object.defineProperty(duplicateEntry, "transaction", {
      configurable: true,
      enumerable: true,
      get: duplicateTransactionGetter,
    });
    const transcript = {
      missingEvidence: {
        duplicateTransactionSlots: [duplicateEntry],
      },
    };
    Object.defineProperty(transcript, "proofComplete", {
      configurable: true,
      enumerable: true,
      get: proofCompleteGetter,
    });

    expect(
      assertSccpBscLiveVideoTranscriptComplete(transcript, {
        allowIncomplete: true,
      }),
    ).toEqual({
      complete: false,
      detail:
        "transaction slots: none; explorer screenshots: none; duplicate transactions: bscFinalizeTx+bscBurnTx:unknown-transaction; duplicate explorer screenshots: none; invalid explorer screenshots: none; unexpected explorer screenshots: none; invalid transaction links: none; readiness: none; video artifacts: none; video timeline: none; wallet approval: none",
    });
    expect(proofCompleteGetter).not.toHaveBeenCalled();
    expect(duplicateTransactionGetter).not.toHaveBeenCalled();
  });

  it("does not invoke accessor-backed top-level live-video option fields", () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
    ];
    const validTransactions = {
      tairaSourceTx: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      bscFinalizeTx: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      tairaSettlementTx: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
    };
    const getters = {
      runDir: vi.fn(() => "/tmp/proof"),
      readiness: vi.fn(() => READY_READINESS),
      bscNetwork: vi.fn(() => "testnet"),
      startedAtMs: vi.fn(() => VALID_STARTED_AT_MS),
      endedAtMs: vi.fn(() => VALID_ENDED_AT_MS),
      links: vi.fn(() => links),
      transactions: vi.fn(() => validTransactions),
      explorerScreenshots: vi.fn(() => [
        screenshotProof("tairaSourceTx", validTransactions.tairaSourceTx),
      ]),
      videoArtifacts: vi.fn(() => [PUBLIC_VIDEO_ARTIFACT]),
    };
    const options = {};
    for (const [field, getter] of Object.entries(getters)) {
      Object.defineProperty(options, field, {
        configurable: true,
        enumerable: true,
        get: getter,
      });
    }

    const proofReport = evaluateSccpBscVideoProofEvidence(options);
    const postDeployReport =
      evaluateSccpBscVideoPostDeployTransactionEvidence(options);
    const transcript = buildSccpBscLiveVideoTranscript(options);

    for (const getter of Object.values(getters)) {
      expect(getter).not.toHaveBeenCalled();
    }
    expect(proofReport).toMatchObject({
      proofComplete: false,
      missingTransactionSlots: REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
      missingExplorerScreenshotSlots: [],
    });
    expect(postDeployReport).toEqual({
      ready: true,
      reusedPostDeployTransactionSlots: [],
      reusedPostDeployTransactions: [],
    });
    expect(transcript).toMatchObject({
      outputDir: "",
      preflightReady: null,
      smokeReadinessReady: null,
      proofComplete: false,
      transactionLinks: [],
      explorerScreenshots: [],
      videoArtifacts: [],
      missingEvidence: {
        transactionSlots: REQUIRED_SCCP_BSC_VIDEO_TRANSACTION_SLOTS,
        readiness: ["smokeReadinessReport"],
        videoArtifacts: ["recording"],
        videoTimeline: ["startedAtMs", "endedAtMs", "durationMs"],
      },
      evidence: {
        proofComplete: false,
        postDeployTransactionEvidence: {
          ready: true,
          reusedPostDeployTransactions: [],
        },
        timelineEvidence: {
          ready: false,
          durationMs: null,
          missingVideoTimeline: ["startedAtMs", "endedAtMs", "durationMs"],
        },
      },
    });
  });

  it("builds transcript artifacts with readiness and captured proof metadata", () => {
    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      links: [
        {
          label: "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        },
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
        {
          label: "BSC transaction",
          href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        },
        {
          label: "TAIRA settlement transaction",
          href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        },
      ],
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });

    expect(transcript).toMatchObject({
      schema: "iroha-demo-sccp-bsc-live-video/v1",
      outputDir: "external-proof-output",
      preflightReady: true,
      smokeReadinessReady: true,
      bsc: {
        explorerUrl: "https://testnet.bscscan.com",
        explorerHost: "testnet.bscscan.com",
      },
      transactions: {
        bscBurnTx: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      proofComplete: true,
      walletApprovalEvidence: {
        mode: SCCP_BSC_VIDEO_WALLET_APPROVAL_MANUAL_MODE,
        productionReady: true,
        walletConnectNamespace: SCCP_BSC_WALLETCONNECT_NAMESPACE,
        walletConnectMethod: SCCP_BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD,
        walletConnectChainId: "eip155:97",
        e2eWalletHarness: false,
      },
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      readinessBinding: {
        checkedAt: READY_READINESS.checkedAt,
        route: {
          routeId: "taira_bsc_xor",
          assetKey: "xor",
        },
        peerAudit: {
          manifestFingerprint: `sha256:${"aa".repeat(32)}`,
          sanitizedStanzaFilesChecked: true,
        },
      },
      missingEvidence: {
        transactionSlots: [],
        explorerScreenshotSlots: [],
        duplicateTransactionSlots: [],
        invalidTransactionLinks: [],
        readiness: [],
        videoTimeline: [],
        walletApproval: [],
      },
      evidence: {
        invalidTransactionLinkEntries: [],
        readinessEvidence: {
          ready: true,
          missingReadinessEvidence: [],
        },
        videoArtifactEvidence: {
          ready: true,
          missingVideoArtifacts: [],
        },
        timelineEvidence: {
          ready: true,
          durationMs: 60_000,
          missingVideoTimeline: [],
        },
      },
      explorerScreenshots: expect.arrayContaining([
        expect.objectContaining({
          kind: "bscBurnTx",
          status: "captured",
        }),
      ]),
    });
  });

  it("accepts auto-flow E2E wallet harness transcripts as generated-key approval proof", () => {
    const manualEvidence = buildSccpBscVideoWalletApprovalEvidence({
      bscNetwork: "testnet",
      autoFlow: false,
    });
    const e2eEvidence = buildSccpBscVideoWalletApprovalEvidence({
      bscNetwork: "testnet",
      autoFlow: true,
    });

    expect(manualEvidence).toEqual({
      mode: SCCP_BSC_VIDEO_WALLET_APPROVAL_MANUAL_MODE,
      productionReady: true,
      walletConnectNamespace: SCCP_BSC_WALLETCONNECT_NAMESPACE,
      walletConnectMethod: SCCP_BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD,
      walletConnectChainId: sccpBscWalletConnectCaipChainId("testnet"),
      e2eWalletHarness: false,
    });
    expect(e2eEvidence).toEqual({
      mode: SCCP_BSC_VIDEO_WALLET_APPROVAL_E2E_MODE,
      productionReady: true,
      walletConnectNamespace: SCCP_BSC_WALLETCONNECT_NAMESPACE,
      walletConnectMethod: SCCP_BSC_WALLETCONNECT_SEND_TRANSACTION_METHOD,
      walletConnectChainId: "eip155:97",
      e2eWalletHarness: true,
    });

    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      autoFlow: true,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      links: [
        {
          label: "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        },
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
        {
          label: "BSC transaction",
          href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        },
        {
          label: "TAIRA settlement transaction",
          href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        },
      ],
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });

    expect(transcript).toMatchObject({
      proofComplete: true,
      operatorNotes: SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
      walletApprovalEvidence: e2eEvidence,
      missingEvidence: {
        walletApproval: [],
      },
    });
    expect(summarizeSccpBscLiveVideoMissingEvidence(transcript)).toContain(
      "wallet approval: none",
    );
    expect(() =>
      assertSccpBscLiveVideoTranscriptComplete(transcript),
    ).not.toThrow();
  });

  it("marks transcripts incomplete when proof link rows are malformed", () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
      "not-a-proof-link",
    ];

    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      links,
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });

    expect(transcript.proofComplete).toBe(false);
    expect(transcript.missingEvidence.invalidTransactionLinks).toEqual([
      "transactionLinks[4]:not-object",
    ]);
    expect(transcript.evidence.invalidTransactionLinkEntries).toEqual([
      "transactionLinks[4]:not-object",
    ]);
    expect(summarizeSccpBscLiveVideoMissingEvidence(transcript)).toContain(
      "invalid transaction links: transactionLinks[4]:not-object",
    );
  });

  it("marks transcripts incomplete when proof link rows are sparse or accessor-backed", () => {
    const validLinks = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];
    const explorerScreenshots = [
      screenshotProof(
        "tairaSourceTx",
        `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      ),
      screenshotProof(
        "bscFinalizeTx",
        `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      ),
      screenshotProof(
        "bscBurnTx",
        `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      ),
      screenshotProof(
        "tairaSettlementTx",
        `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      ),
    ];
    const transcriptInput = {
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      explorerScreenshots,
    };

    const sparseLinks = [...validLinks];
    sparseLinks.length = 5;
    const sparseTranscript = buildSccpBscLiveVideoTranscript({
      ...transcriptInput,
      links: sparseLinks,
    });
    expect(sparseTranscript.proofComplete).toBe(false);
    expect(sparseTranscript.missingEvidence.invalidTransactionLinks).toEqual([
      "transactionLinks[4]:missing",
    ]);

    const linkGetter = vi.fn(() => {
      throw new Error("proof link getter should not run");
    });
    const accessorLinks = [...validLinks];
    Object.defineProperty(accessorLinks, "4", {
      configurable: true,
      enumerable: true,
      get: linkGetter,
    });
    const accessorTranscript = buildSccpBscLiveVideoTranscript({
      ...transcriptInput,
      links: accessorLinks,
    });
    expect(linkGetter).not.toHaveBeenCalled();
    expect(accessorTranscript.proofComplete).toBe(false);
    expect(accessorTranscript.missingEvidence.invalidTransactionLinks).toEqual([
      "transactionLinks[4]:not-data-property",
    ]);
  });

  it("marks transcripts incomplete when screenshot rows are malformed", () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];
    const validScreenshots = [
      screenshotProof(
        "tairaSourceTx",
        `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      ),
      screenshotProof(
        "bscFinalizeTx",
        `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      ),
      screenshotProof(
        "bscBurnTx",
        `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      ),
      screenshotProof(
        "tairaSettlementTx",
        `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      ),
    ];
    const baseInput = {
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
      links,
    };

    const transcript = buildSccpBscLiveVideoTranscript({
      ...baseInput,
      explorerScreenshots: [...validScreenshots, "not-a-screenshot"],
    });

    expect(transcript.proofComplete).toBe(false);
    expect(transcript.missingEvidence.invalidExplorerScreenshotSlots).toEqual([
      "explorerScreenshots[4]:not-object",
    ]);
    expect(
      transcript.missingEvidence.unexpectedExplorerScreenshotKinds,
    ).toEqual([]);

    const sparseScreenshots = [...validScreenshots];
    sparseScreenshots.length = 5;
    const sparseTranscript = buildSccpBscLiveVideoTranscript({
      ...baseInput,
      explorerScreenshots: sparseScreenshots,
    });
    expect(sparseTranscript.proofComplete).toBe(false);
    expect(
      sparseTranscript.missingEvidence.invalidExplorerScreenshotSlots,
    ).toEqual(["explorerScreenshots[4]:missing"]);

    const screenshotGetter = vi.fn(() => {
      throw new Error("screenshot getter should not run");
    });
    const accessorScreenshots = [...validScreenshots];
    Object.defineProperty(accessorScreenshots, "4", {
      configurable: true,
      enumerable: true,
      get: screenshotGetter,
    });
    const accessorTranscript = buildSccpBscLiveVideoTranscript({
      ...baseInput,
      explorerScreenshots: accessorScreenshots,
    });
    expect(screenshotGetter).not.toHaveBeenCalled();
    expect(accessorTranscript.proofComplete).toBe(false);
    expect(
      accessorTranscript.missingEvidence.invalidExplorerScreenshotSlots,
    ).toEqual(["explorerScreenshots[4]:not-data-property"]);
  });

  it("marks transcripts incomplete when explorer screenshot labels are missing or swapped", () => {
    const baseLinks = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];
    for (const [name, label] of [
      ["missing", undefined],
      ["swapped", "TAIRA source transaction"],
    ]) {
      const transcript = buildSccpBscLiveVideoTranscript({
        runDir: "/tmp/proof",
        readiness: READY_READINESS,
        startedAtMs: VALID_STARTED_AT_MS,
        endedAtMs: VALID_ENDED_AT_MS,
        videoArtifacts: [PUBLIC_VIDEO_ARTIFACT],
        links: baseLinks,
        explorerScreenshots: [
          screenshotProof(
            "tairaSourceTx",
            `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
          ),
          screenshotProof(
            "bscFinalizeTx",
            `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
          ),
          screenshotProof(
            "bscBurnTx",
            `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
            { label },
          ),
          screenshotProof(
            "tairaSettlementTx",
            `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
          ),
        ],
      });

      expect(transcript.proofComplete, name).toBe(false);
      expect(transcript.operatorNotes, name).toBe(
        SCCP_BSC_VIDEO_INCOMPLETE_OPERATOR_NOTES,
      );
      expect(transcript.missingEvidence, name).toMatchObject({
        explorerScreenshotSlots: ["bscBurnTx"],
        invalidExplorerScreenshotSlots: ["bscBurnTx"],
      });
      expect(transcript.evidence, name).toMatchObject({
        proofComplete: false,
        invalidExplorerScreenshotSlots: ["bscBurnTx"],
      });
    }
  });

  it("marks transcripts incomplete when video artifacts reuse screenshot proof hashes", () => {
    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [
        {
          ...PUBLIC_VIDEO_ARTIFACT,
          sha256: SCREENSHOT_SHA256_BY_KIND.bscBurnTx,
        },
      ],
      links: [
        {
          label: "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        },
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
        {
          label: "BSC transaction",
          href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        },
        {
          label: "TAIRA settlement transaction",
          href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        },
      ],
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });

    expect(transcript).toMatchObject({
      proofComplete: false,
      missingEvidence: {
        videoArtifacts: ["reused-proof-artifact-hash:bscBurnTx"],
      },
      evidence: {
        videoArtifactEvidence: {
          ready: false,
          missingVideoArtifacts: ["reused-proof-artifact-hash:bscBurnTx"],
        },
      },
    });
  });

  it("publishes only portable proof output locations in video transcripts", () => {
    const repoRunDir = path.resolve(
      "output/sccp-bsc-live-proof/2026-06-11T21-10-28-000Z",
    );
    const repoTranscript = buildSccpBscLiveVideoTranscript({
      runDir: repoRunDir,
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [VIDEO_ARTIFACT],
    });
    expect(repoTranscript.outputDir).toBe(
      "output/sccp-bsc-live-proof/2026-06-11T21-10-28-000Z",
    );

    const externalTranscript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof/private-key=operator-secret",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [
        {
          ...VIDEO_ARTIFACT,
          privateKey: "0xvideo-secret",
          mnemonic:
            "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
          authToken: "video-auth-token",
        },
        "privateKey=string-entry-secret",
      ],
      explorerScreenshots: [
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(
            32,
          )}?privateKey=0xscreenshot-secret`,
          {
            finalHref: `https://testnet.bscscan.com/tx/0x${"22".repeat(
              32,
            )}#mnemonic=abandon`,
            absolutePath: "/tmp/proof/private-key=operator-secret.png",
            localPath: "/tmp/proof/local.png",
            filePath: "/tmp/proof/file.png",
            privateKey: "0xscreenshot-secret",
            error: "privateKey=0xscreenshot-error-secret",
            fileVerificationError: "apiToken=screenshot-token-secret",
          },
        ),
        "mnemonic=string-entry-secret",
      ],
    });
    const serializedExternal = JSON.stringify(externalTranscript);
    expect(externalTranscript.outputDir).toBe("external-proof-output");
    expect(serializedExternal).not.toContain("private-key=operator-secret");
    expect(serializedExternal).not.toContain("/tmp/proof");
    expect(serializedExternal).not.toContain("0xvideo-secret");
    expect(serializedExternal).not.toContain("video-auth-token");
    expect(serializedExternal).not.toContain("0xscreenshot-secret");
    expect(serializedExternal).not.toContain("0xscreenshot-error-secret");
    expect(serializedExternal).not.toContain("screenshot-token-secret");
    expect(serializedExternal).not.toContain("string-entry-secret");
    expect(serializedExternal).not.toContain("abandon abandon");
    expect(externalTranscript.videoArtifacts[0]).toEqual(PUBLIC_VIDEO_ARTIFACT);
    expect(externalTranscript.videoArtifacts).toHaveLength(1);
    expect(externalTranscript.explorerScreenshots[0]).not.toHaveProperty(
      "screenshot",
    );
    expect(externalTranscript.explorerScreenshots[0]).not.toHaveProperty(
      "absolutePath",
    );
    expect(externalTranscript.explorerScreenshots[0]).not.toHaveProperty(
      "localPath",
    );
    expect(externalTranscript.explorerScreenshots[0]).not.toHaveProperty(
      "filePath",
    );
    expect(externalTranscript.explorerScreenshots[0]).not.toHaveProperty(
      "privateKey",
    );
    expect(externalTranscript.explorerScreenshots[0]).toMatchObject({
      href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      finalHref: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
      error: "privateKey=[redacted]",
      fileVerificationError: "apiToken=[redacted]",
    });
    expect(externalTranscript.explorerScreenshots).toHaveLength(1);
  });

  it("marks transcripts incomplete when BSC flow links reuse post-deploy evidence", () => {
    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [VIDEO_ARTIFACT],
      links: [
        {
          label: "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        },
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"77".repeat(32)}`,
        },
        {
          label: "BSC transaction",
          href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        },
        {
          label: "TAIRA settlement transaction",
          href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        },
      ],
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"77".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });

    expect(transcript).toMatchObject({
      proofComplete: false,
      missingEvidence: {
        transactionSlots: [],
        explorerScreenshotSlots: [],
        readiness: [
          "postDeployTransactionReuse.bscFinalizeTx.sourceEventTransactionId",
        ],
      },
      evidence: {
        postDeployTransactionEvidence: {
          ready: false,
          reusedPostDeployTransactionSlots: ["bscFinalizeTx"],
          reusedPostDeployTransactions: [
            {
              slot: "bscFinalizeTx",
              postDeployField: "sourceEventTransactionId",
            },
          ],
        },
      },
    });
  });

  it("builds mainnet transcript artifacts only with mainnet explorer evidence", () => {
    const links = [
      {
        label: "TAIRA source transaction",
        href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
      },
      {
        label: "BSC finalize transaction",
        href: `https://bscscan.com/tx/0x${"11".repeat(32)}`,
      },
      {
        label: "BSC transaction",
        href: `https://bscscan.com/tx/0x${"22".repeat(32)}`,
      },
      {
        label: "TAIRA settlement transaction",
        href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
      },
    ];
    const explorerScreenshots = links.map((link) => {
      const kind = classifySccpBscProofLink(link, { bscNetwork: "mainnet" });
      return screenshotProof(kind, link.href);
    });

    expect(canonicalizeSccpBscProofLinks(links)).toEqual([
      {
        label: "TAIRA source transaction",
        href: links[0].href,
      },
      {
        label: "TAIRA settlement transaction",
        href: links[3].href,
      },
    ]);
    expect(
      canonicalizeSccpBscProofLinks(links, { bscNetwork: "mainnet" }),
    ).toEqual([
      {
        label: "TAIRA source transaction",
        href: links[0].href,
      },
      {
        label: "BSC finalize transaction",
        href: links[1].href,
      },
      {
        label: "BSC burn transaction",
        href: links[2].href,
      },
      {
        label: "TAIRA settlement transaction",
        href: links[3].href,
      },
    ]);

    const transcript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_MAINNET_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [VIDEO_ARTIFACT],
      links,
      explorerScreenshots,
    });

    expect(transcript).toMatchObject({
      proofComplete: true,
      operatorNotes: SCCP_BSC_VIDEO_COMPLETE_OPERATOR_NOTES,
      bsc: {
        network: "mainnet",
        chain: "bsc-mainnet",
        chainIdHex: "0x38",
        networkIdHex: BSC_MAINNET_NETWORK_ID_HEX,
        explorerUrl: "https://bscscan.com",
        explorerHost: "bscscan.com",
      },
      transactions: {
        bscFinalizeTx: links[1].href,
        bscBurnTx: links[2].href,
      },
      evidence: {
        readinessEvidence: {
          ready: true,
          missingReadinessEvidence: [],
        },
      },
    });
    expect(
      evaluateSccpBscVideoReadinessEvidence(READY_MAINNET_READINESS, {
        bscNetwork: "testnet",
      }),
    ).toMatchObject({
      ready: false,
      missingReadinessEvidence: expect.arrayContaining([
        "routeBscNetworkBinding",
        "routeDeployment.networkIdHex",
        "postDeployLiveEvidence.sourceEventExplorerUrl",
        "postDeployLiveEvidence.routeCanaryExplorerUrl",
      ]),
    });
  });

  it("fails closed on incomplete transcripts unless explicitly allowed", () => {
    const completeTranscript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [VIDEO_ARTIFACT],
      links: [
        {
          label: "TAIRA source transaction",
          href: `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        },
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
        {
          label: "BSC transaction",
          href: `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        },
        {
          label: "TAIRA settlement transaction",
          href: `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        },
      ],
      explorerScreenshots: [
        screenshotProof(
          "tairaSourceTx",
          `https://taira-explorer.sora.org/transactions/${"33".repeat(32)}`,
        ),
        screenshotProof(
          "bscFinalizeTx",
          `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        ),
        screenshotProof(
          "bscBurnTx",
          `https://testnet.bscscan.com/tx/0x${"22".repeat(32)}`,
        ),
        screenshotProof(
          "tairaSettlementTx",
          `https://taira-explorer.sora.org/transactions/${"44".repeat(32)}`,
        ),
      ],
    });
    expect(
      assertSccpBscLiveVideoTranscriptComplete(completeTranscript),
    ).toEqual({
      complete: true,
      detail: "SCCP BSC live proof transcript is complete.",
    });

    const tooShortTranscript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: READY_READINESS,
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_STARTED_AT_MS + 1,
      videoArtifacts: [VIDEO_ARTIFACT],
      links: completeTranscript.transactionLinks,
      explorerScreenshots: completeTranscript.explorerScreenshots,
    });
    expect(tooShortTranscript).toMatchObject({
      proofComplete: false,
      missingEvidence: {
        videoTimeline: ["durationMs"],
      },
      evidence: {
        timelineEvidence: {
          ready: false,
          durationMs: 1,
          missingVideoTimeline: ["durationMs"],
        },
      },
    });

    const incompleteTranscript = buildSccpBscLiveVideoTranscript({
      runDir: "/tmp/proof",
      readiness: { ...READY_READINESS, ready: false },
      startedAtMs: VALID_STARTED_AT_MS,
      endedAtMs: VALID_ENDED_AT_MS,
      videoArtifacts: [VIDEO_ARTIFACT],
      links: [
        {
          label: "BSC finalize transaction",
          href: `https://testnet.bscscan.com/tx/0x${"11".repeat(32)}`,
        },
      ],
      explorerScreenshots: [],
    });
    expect(summarizeSccpBscLiveVideoMissingEvidence(incompleteTranscript)).toBe(
      "transaction slots: tairaSourceTx, bscBurnTx, tairaSettlementTx; explorer screenshots: bscFinalizeTx; duplicate transactions: none; duplicate explorer screenshots: none; invalid explorer screenshots: none; unexpected explorer screenshots: none; invalid transaction links: none; readiness: smokeReadinessReady; video artifacts: none; video timeline: none; wallet approval: none",
    );
    expect(() =>
      assertSccpBscLiveVideoTranscriptComplete(incompleteTranscript, {
        transcriptPath: "/tmp/proof/transcript.json",
      }),
    ).toThrow(
      /SCCP BSC live proof is incomplete: \/tmp\/proof\/transcript\.json/u,
    );
    expect(
      assertSccpBscLiveVideoTranscriptComplete(incompleteTranscript, {
        allowIncomplete: true,
      }),
    ).toEqual({
      complete: false,
      detail:
        "transaction slots: tairaSourceTx, bscBurnTx, tairaSettlementTx; explorer screenshots: bscFinalizeTx; duplicate transactions: none; duplicate explorer screenshots: none; invalid explorer screenshots: none; unexpected explorer screenshots: none; invalid transaction links: none; readiness: smokeReadinessReady; video artifacts: none; video timeline: none; wallet approval: none",
    });
  });
});
