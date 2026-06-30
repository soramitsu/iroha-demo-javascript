/* BSC SCCP BSC-to-TAIRA browser prover entrypoint. */
/* global globalThis, BigInt */
const CONFIG_SCHEMA = "iroha-demo-sccp-bsc-runtime-prover/v1";
const ROUTE_ID = "taira_bsc_xor";
const ASSET_KEY = "xor";
const TAIRA_CHAIN_ID = "809574f5-fee7-5e69-bfcf-52451e42d50f";
const TAIRA_NETWORK_PREFIX = 369;
const SCCP_SORA_DOMAIN = 0;
const SCCP_BSC_DOMAIN = 2;
const TAIRA_XOR_DECIMALS = 9;
const SCCP_CODEC_TEXT_UTF8 = 1;
const SCCP_CODEC_EVM_HEX = 2;
const SCCP_PAYLOAD_TRANSFER_DISCRIMINANT = 2;
const SCCP_PAYLOAD_HASH_PREFIX = "sccp:payload:v1";
const SCCP_HUB_LEAF_PREFIX = "sccp:hub:leaf:v1";
const SCCP_HUB_NODE_PREFIX = "sccp:hub:node:v1";
const BSC_NETWORK_PROFILES = Object.freeze({
  testnet: Object.freeze({
    key: "testnet",
    label: "BSC testnet",
    chain: "bsc-testnet",
    chainIdHex: "0x61",
    networkIdHex:
      "0x0000000000000000000000000000000000000000000000000000000000000061",
  }),
  mainnet: Object.freeze({
    key: "mainnet",
    label: "BSC mainnet",
    chain: "bsc-mainnet",
    chainIdHex: "0x38",
    networkIdHex:
      "0x0000000000000000000000000000000000000000000000000000000000000038",
  }),
});
const PROOF_BACKEND = "evm-groth16-bn254-v1";
const PROOF_FAMILY = "stark-fri-v1";
const GROTH16_PROOF_SELF_TEST_SCHEMA =
  "iroha-sccp-bsc-groth16-proof-self-test/v1";
const NATIVE_EVM_PROVER_BUNDLE_SCHEMA =
  "sccp-native-evm-groth16-prover-bundle-v1";
const BSC_NATIVE_EVM_PROVER_BUNDLE_IDS = Object.freeze({
  testnet: "sccp:bsc:native-evm-groth16-prover:bsc-testnet:v1",
  mainnet: "sccp:bsc:native-evm-groth16-prover:bsc-mainnet:v1",
});
const BSC_SUPPORT_SCHEMAS = Object.freeze({
  testnet: Object.freeze({
    parity: "sccp-bsc-testnet-native-evm-cross-sdk-parity-v1",
    selfTest: "sccp-bsc-testnet-native-evm-prover-self-test-v1",
  }),
  mainnet: Object.freeze({
    parity: "sccp-bsc-mainnet-native-evm-cross-sdk-parity-v1",
    selfTest: "sccp-bsc-mainnet-native-evm-prover-self-test-v1",
  }),
});
const DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES = Object.freeze(
  new Set([
    "0x9ef8067d260532f88e60cfa4b458fe678fc46b9c242de18fc91ba646e0857fc4",
  ]),
);
const MIN_PROVER_MATERIAL_BYTES = 64 * 1024;
const PROVER_MATERIAL_SHAPE_MIN_BYTES = 4096;
const PROVER_MATERIAL_MIN_UNIQUE_BYTES = 16;
const PROVER_MATERIAL_MAX_REPEATED_PATTERN_BYTES = 64;
const PROVER_MATERIAL_MAX_DOMINANT_BYTE_FRACTION = 0.98;
const MIN_VERIFIER_MATERIAL_BYTES = 128;
const MIN_NATIVE_BUNDLE_BYTES = 512;
const MIN_NATIVE_SUPPORT_MATERIAL_BYTES = 128;
const MIN_NATIVE_IMPLEMENTATION_BYTES = 1024;
const MIN_DESTINATION_PROOF_BYTES = 384;
const MAX_CONFIG_BYTES = 512 * 1024;
const MAX_BACKEND_BYTES = 32 * 1024 * 1024;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const RUNTIME_FETCH_OPTIONS = Object.freeze({
  method: "GET",
  credentials: "omit",
  redirect: "error",
  cache: "no-store",
});
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const U64_MAX = (1n << 64n) - 1n;
const U128_MAX = (1n << 128n) - 1n;
const MASK_64 = (1n << 64n) - 1n;
const BLAKE2B_IV = Object.freeze([
  0x6a09e667f3bcc908n,
  0xbb67ae8584caa73bn,
  0x3c6ef372fe94f82bn,
  0xa54ff53a5f1d36f1n,
  0x510e527fade682d1n,
  0x9b05688c2b3e6c1fn,
  0x1f83d9abfb41bd6bn,
  0x5be0cd19137e2179n,
]);
const BLAKE2B_SIGMA = Object.freeze([
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  Object.freeze([14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]),
  Object.freeze([11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4]),
  Object.freeze([7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8]),
  Object.freeze([9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13]),
  Object.freeze([2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9]),
  Object.freeze([12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11]),
  Object.freeze([13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10]),
  Object.freeze([6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5]),
  Object.freeze([10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0]),
  Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]),
  Object.freeze([14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3]),
]);
const REQUIRED_NATIVE_SDK_IMPLEMENTATIONS = Object.freeze({
  dotnet: "native-csharp",
  "java-android": "native-java",
  javascript: "pure-typescript",
  kotlin: "native-kotlin",
  swift: "native-swift",
});
const REQUIRED_NATIVE_SDKS = Object.freeze(
  Object.keys(REQUIRED_NATIVE_SDK_IMPLEMENTATIONS).sort(),
);
const BN254_SCALAR_FIELD_MODULUS =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;
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
const BROWSER_NATIVE_PROVER_SDK = "javascript";
const BROWSER_NATIVE_PROVER_IMPLEMENTATION =
  REQUIRED_NATIVE_SDK_IMPLEMENTATIONS[BROWSER_NATIVE_PROVER_SDK];
const REQUIRED_NATIVE_BUNDLE_AUDIT_HASHES = Object.freeze([
  "circuit_security_audit",
  "native_implementation_audit",
  "reproducible_build_attestation",
  "cross_sdk_parity",
  "native_prover_self_test",
  "no_wasm_no_remote_scan",
]);
const NATIVE_BUNDLE_KNOWN_FIELDS = Object.freeze(
  new Set([
    "schema",
    "bundleId",
    "bundle_id",
    "domain",
    "chain",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofArtifact",
    "proof_artifact",
    "proverArtifact",
    "prover_artifact",
    "circuitArtifact",
    "circuit_artifact",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "circuitArtifactHash",
    "circuit_artifact_hash",
    "provingKey",
    "proving_key",
    "provingKeyHash",
    "proving_key_hash",
    "verifierKey",
    "verifier_key",
    "verifierKeyHash",
    "verifier_key_hash",
    "verifierKeyArtifactHash",
    "verifier_key_artifact_hash",
    "destinationBindingHash",
    "destination_binding_hash",
    "noWasm",
    "no_wasm",
    "remoteProverRequired",
    "remote_prover_required",
    "browserImplementation",
    "browser_implementation",
    "nativeSdkArtifacts",
    "native_sdk_artifacts",
    "sdkArtifacts",
    "sdk_artifacts",
    "crossSdkParityArtifact",
    "cross_sdk_parity_artifact",
    "nativeProverSelfTestArtifact",
    "native_prover_self_test_artifact",
    "selfTestArtifact",
    "self_test_artifact",
    "groth16ProofSelfTestArtifact",
    "groth16_proof_self_test_artifact",
    "groth16ProofSelfTestHash",
    "groth16_proof_self_test_hash",
    "auditHashes",
    "audit_hashes",
  ]),
);
const NATIVE_BUNDLE_AUDIT_KNOWN_FIELDS = Object.freeze(
  new Set(REQUIRED_NATIVE_BUNDLE_AUDIT_HASHES),
);
const NATIVE_BUNDLE_SDK_KNOWN_FIELDS = Object.freeze(
  new Set([
    "sdk",
    "implementation",
    "proofArtifactHash",
    "proof_artifact_hash",
    "proverArtifactHash",
    "prover_artifact_hash",
    "provingKeyHash",
    "proving_key_hash",
    "implementationArtifact",
    "implementation_artifact",
    "implementationPath",
    "implementation_path",
    "implementationHash",
    "implementation_hash",
  ]),
);
const CONFIG_KNOWN_FIELDS = Object.freeze(
  new Set([
    "schema",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "tairaChainId",
    "taira_chain_id",
    "tairaNetworkPrefix",
    "taira_network_prefix",
    "bscNetwork",
    "bsc_network",
    "network",
    "chain",
    "bscChain",
    "bsc_chain",
    "bscChainIdHex",
    "bsc_chain_id_hex",
    "bscNetworkIdHex",
    "bsc_network_id_hex",
    "destination",
    "source",
  ]),
);
const DIRECTION_CONFIG_KNOWN_FIELDS = Object.freeze(
  new Set([
    "nativeProverBundleUrl",
    "native_prover_bundle_url",
    "nativeProverArtifactBaseUrl",
    "native_prover_artifact_base_url",
    "nativeProverBaseUrl",
    "native_prover_base_url",
    "nativeProverBundleSha256",
    "native_prover_bundle_sha256",
    "nativeEvmProverBundleHash",
    "native_evm_prover_bundle_hash",
    "nativeProverVerifiedSdks",
    "native_prover_verified_sdks",
    "proofArtifactUrl",
    "proof_artifact_url",
    "proofArtifactSha256",
    "proof_artifact_sha256",
    "provingKeyUrl",
    "proving_key_url",
    "provingKeySha256",
    "proving_key_sha256",
    "verifierKeyUrl",
    "verifier_key_url",
    "verifierKeySha256",
    "verifier_key_sha256",
    "backendModuleUrl",
    "backend_module_url",
    "backendModuleSha256",
    "backend_module_sha256",
    "backendSelfContained",
    "backend_self_contained",
    "backendAcceptedExport",
    "backend_accepted_export",
    "backendAcceptedSelfTestExport",
    "backend_accepted_self_test_export",
  ]),
);

const isRecord = (value) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};
const hasOwn = (record, key) =>
  isRecord(record) && Object.prototype.hasOwnProperty.call(record, key);
const ownValue = (record, key) =>
  hasOwn(record, key) ? record[key] : undefined;
const ownJsonValue = (value, seen = new WeakMap()) => {
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return seen.get(value);
    }
    const out = [];
    seen.set(value, out);
    for (const entry of value) {
      out.push(ownJsonValue(entry, seen));
    }
    return out;
  }
  if (!isRecord(value)) {
    return value;
  }
  if (seen.has(value)) {
    return seen.get(value);
  }
  const out = Object.create(null);
  seen.set(value, out);
  for (const [key, entry] of Object.entries(value)) {
    out[key] = ownJsonValue(entry, seen);
  }
  return out;
};

const trim = (value) => String(value ?? "").trim();
const REDACTED_UNSUPPORTED_FIELD = "[redacted unsupported field]";
const UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN =
  /(?:verifier[_-]?material|prover[_-]?material|proof[_-]?material|groth|alpha1|beta2|gamma2|delta2|vk_|private[_-]?key|mnemonic|recovery[_-]?phrase|seed[_-]?phrase|secret|password)/iu;
const publicUnsupportedFieldName = (key) =>
  UNSUPPORTED_FIELD_NAME_REDACTION_PATTERN.test(key)
    ? REDACTED_UNSUPPORTED_FIELD
    : key;

const fail = (code, message) => {
  const error = new Error(message);
  error.code = code;
  throw error;
};

const assertKnownFields = (record, knownFields, label) => {
  for (const key of Object.keys(record)) {
    if (!knownFields.has(key)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_CONFIG",
        `${label} contains unsupported field ${publicUnsupportedFieldName(
          key,
        )}`,
      );
    }
  }
};

const hex = (bytes) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const sha256Hex = async (bytes) =>
  `0x${hex(
    new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
  )}`;

const concatBytes = (...parts) => {
  const size = parts.reduce((sum, part) => sum + part.byteLength, 0);
  const out = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.byteLength;
  }
  return out;
};

const readU64Le = (bytes, offset) => {
  let out = 0n;
  for (let index = 0; index < 8; index += 1) {
    out |= BigInt(bytes[offset + index]) << BigInt(index * 8);
  }
  return out;
};

const writeU64LeInto = (out, offset, value) => {
  let next = value & MASK_64;
  for (let index = 0; index < 8; index += 1) {
    out[offset + index] = Number(next & 0xffn);
    next >>= 8n;
  }
};

const rotateRight64 = (value, bits) =>
  ((value >> BigInt(bits)) | (value << BigInt(64 - bits))) & MASK_64;

const blake2b256 = (input) => {
  const h = [...BLAKE2B_IV];
  h[0] ^= 0x01010020n;
  let compressedBytes = 0n;
  const compress = (block, last) => {
    const m = Array.from({ length: 16 }, (_value, index) =>
      readU64Le(block, index * 8),
    );
    const v = [...h, ...BLAKE2B_IV];
    v[12] ^= compressedBytes & MASK_64;
    v[13] ^= (compressedBytes >> 64n) & MASK_64;
    if (last) {
      v[14] ^= MASK_64;
    }
    const g = (a, b, c, d, x, y) => {
      v[a] = (v[a] + v[b] + x) & MASK_64;
      v[d] = rotateRight64(v[d] ^ v[a], 32);
      v[c] = (v[c] + v[d]) & MASK_64;
      v[b] = rotateRight64(v[b] ^ v[c], 24);
      v[a] = (v[a] + v[b] + y) & MASK_64;
      v[d] = rotateRight64(v[d] ^ v[a], 16);
      v[c] = (v[c] + v[d]) & MASK_64;
      v[b] = rotateRight64(v[b] ^ v[c], 63);
    };
    for (const sigma of BLAKE2B_SIGMA) {
      g(0, 4, 8, 12, m[sigma[0]], m[sigma[1]]);
      g(1, 5, 9, 13, m[sigma[2]], m[sigma[3]]);
      g(2, 6, 10, 14, m[sigma[4]], m[sigma[5]]);
      g(3, 7, 11, 15, m[sigma[6]], m[sigma[7]]);
      g(0, 5, 10, 15, m[sigma[8]], m[sigma[9]]);
      g(1, 6, 11, 12, m[sigma[10]], m[sigma[11]]);
      g(2, 7, 8, 13, m[sigma[12]], m[sigma[13]]);
      g(3, 4, 9, 14, m[sigma[14]], m[sigma[15]]);
    }
    for (let index = 0; index < 8; index += 1) {
      h[index] = (h[index] ^ v[index] ^ v[index + 8]) & MASK_64;
    }
  };

  let offset = 0;
  while (offset + 128 < input.byteLength) {
    compressedBytes += 128n;
    compress(input.subarray(offset, offset + 128), false);
    offset += 128;
  }
  const last = new Uint8Array(128);
  last.set(input.subarray(offset));
  compressedBytes += BigInt(input.byteLength - offset);
  compress(last, true);
  const out = new Uint8Array(64);
  for (let index = 0; index < 8; index += 1) {
    writeU64LeInto(out, index * 8, h[index]);
  }
  return out.slice(0, 32);
};

const prefixedBlake2b256Hex = (prefix, payload) =>
  `0x${hex(blake2b256(concatBytes(textEncoder.encode(prefix), payload)))}`;

const prefixedBlake2b256Bytes = (prefix, payload) =>
  blake2b256(concatBytes(textEncoder.encode(prefix), payload));

const normalizeHex32 = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized) || /^0x0{64}$/u.test(normalized)) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_HASH", `${label} must be a non-zero hash`);
  }
  return normalized;
};

const assertProductionBscVerifierKeyHash = (value, label) => {
  if (DIAGNOSTIC_BSC_VERIFIER_KEY_HASHES.has(value)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL",
      `${label} uses a known diagnostic BSC verifier key hash`,
    );
  }
};

const normalizeHexBytes = (value, label) => {
  const normalized = trim(value).toLowerCase().replace(/^0x/u, "");
  if (
    !normalized ||
    normalized.length % 2 !== 0 ||
    /[^0-9a-f]/u.test(normalized)
  ) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} must be hex-encoded bytes`);
  }
  const bytes = Uint8Array.from(
    normalized.match(/.{2}/gu).map((byte) => Number.parseInt(byte, 16)),
  );
  if (!bytes.some((byte) => byte !== 0)) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} must be non-zero`);
  }
  return bytes;
};

const hex32Bytes = (value, label) => {
  const normalized = normalizeHex32(value, label).slice(2);
  return Uint8Array.from(
    normalized.match(/.{2}/gu).map((byte) => Number.parseInt(byte, 16)),
  );
};

const normalizeAddress = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/u.test(normalized) || /^0x0{40}$/u.test(normalized)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BAD_ADDRESS",
      `${label} must be a non-zero EVM address`,
    );
  }
  return normalized;
};

const loopbackHost = (hostname) => {
  const normalized = hostname.toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "[::1]" ||
    /^127(?:\.\d{1,3}){3}$/u.test(normalized)
  );
};

const hasUnsafeUrlCharacter = (value) => {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
};

const hasParentDirectorySegment = (value) => {
  let normalized = value.replace(/\\/gu, "/");
  for (let depth = 0; depth < 8; depth += 1) {
    if (/(?:^|\/)\.\.(?:\/|$)/u.test(normalized)) {
      return true;
    }
    let decoded;
    try {
      decoded = decodeURIComponent(normalized).replace(/\\/gu, "/");
    } catch (_error) {
      return true;
    }
    if (decoded === normalized) {
      return false;
    }
    normalized = decoded;
  }
  // Values that are still changing after several decode passes are
  // intentionally treated as unsafe instead of guessing how many layers an
  // intermediary might decode.
  return true;
};

const fileUrlDirectory = (baseUrl) => {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch (_error) {
    return "";
  }
  return parsed.protocol === "file:" ? new URL("./", parsed).href : "";
};

const resolveUrl = (value, label, baseUrl, options = {}) => {
  const raw = trim(value);
  if (!raw) {
    fail("ERR_SCCP_BSC_RUNTIME_MISSING_URL", `${label} is required`);
  }
  if (hasUnsafeUrlCharacter(raw)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BAD_URL",
      `${label} must not contain whitespace or control characters`,
    );
  }
  if (hasParentDirectorySegment(raw)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BAD_URL",
      `${label} must not include parent directory segments`,
    );
  }
  let parsed;
  try {
    parsed = new URL(raw, baseUrl);
  } catch (_error) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_URL", `${label} is not a valid URL`);
  }
  if (parsed.username || parsed.password) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_URL", `${label} must not carry credentials`);
  }
  if (parsed.search || parsed.hash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BAD_URL",
      `${label} must not carry query strings or fragments`,
    );
  }
  if (parsed.protocol === "file:" && options.allowFileUrl === true) {
    const baseDirectory = fileUrlDirectory(baseUrl);
    if (options.restrictFileUrlToBaseDir === true && baseDirectory) {
      const resolvedFileUrl = parsed.href;
      if (
        resolvedFileUrl !== baseDirectory &&
        !resolvedFileUrl.startsWith(baseDirectory)
      ) {
        fail(
          "ERR_SCCP_BSC_RUNTIME_BAD_URL",
          `${label} file URL must stay under the BSC prover config directory`,
        );
      }
    }
    return parsed.href;
  }
  if (
    parsed.protocol === "https:" ||
    (parsed.protocol === "http:" && loopbackHost(parsed.hostname)) ||
    (parsed.protocol === "data:" && options.allowDataUrl === true)
  ) {
    return parsed.href;
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_BAD_URL",
    `${label} must be HTTPS, loopback HTTP, or package-relative`,
  );
};

const responseContentLength = (response) => {
  const raw = trim(response.headers.get("content-length") ?? "");
  if (!raw || !/^(?:0|[1-9][0-9]*)$/u.test(raw)) {
    return null;
  }
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : null;
};

const readResponseBytesBounded = async (response, label, maxBytes) => {
  const contentLength = responseContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    fail("ERR_SCCP_BSC_RUNTIME_SIZE", `${label} is too large`);
  }

  if (response.body && typeof response.body.getReader === "function") {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chunk =
          value instanceof Uint8Array ? value : new Uint8Array(value);
        total += chunk.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          fail("ERR_SCCP_BSC_RUNTIME_SIZE", `${label} is too large`);
        }
        chunks.push(chunk);
      }
    } finally {
      reader.releaseLock?.();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    fail("ERR_SCCP_BSC_RUNTIME_SIZE", `${label} is too large`);
  }
  return bytes;
};

const bytesToBase64 = (bytes) => {
  if (typeof btoa !== "function") {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND",
      "BSC runtime cannot import verified backend bytes without base64 support",
    );
  }
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }
  return btoa(binary);
};

const verifiedJavascriptModuleDataUrl = (bytes) =>
  `data:text/javascript;base64,${bytesToBase64(bytes)}`;

const isAsciiIdentifierStart = (char) => /[A-Za-z_$]/u.test(char ?? "");

const isAsciiIdentifierContinue = (char) => /[A-Za-z0-9_$]/u.test(char ?? "");

const skipQuotedString = (text, index, quote) => {
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === quote) {
      return cursor + 1;
    }
  }
  return text.length;
};

const skipLineComment = (text, index) => {
  const nextLine = text.indexOf("\n", index + 2);
  return nextLine < 0 ? text.length : nextLine + 1;
};

const skipBlockComment = (text, index) => {
  const end = text.indexOf("*/", index + 2);
  return end < 0 ? text.length : end + 2;
};

const skipWhitespaceAndComments = (text, index) => {
  let cursor = index;
  for (;;) {
    while (/\s/u.test(text[cursor] ?? "")) {
      cursor += 1;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "/") {
      cursor = skipLineComment(text, cursor);
      continue;
    }
    if (text[cursor] === "/" && text[cursor + 1] === "*") {
      cursor = skipBlockComment(text, cursor);
      continue;
    }
    return cursor;
  }
};

const readAsciiIdentifier = (text, index) => {
  if (!isAsciiIdentifierStart(text[index])) {
    return null;
  }
  let cursor = index + 1;
  while (isAsciiIdentifierContinue(text[cursor])) {
    cursor += 1;
  }
  return { value: text.slice(index, cursor), end: cursor };
};

const nextAsciiIdentifier = (text, index) => {
  const cursor = skipWhitespaceAndComments(text, index);
  return readAsciiIdentifier(text, cursor);
};

const skipBalancedBraces = (text, index) => {
  let depth = 1;
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    const next = text[cursor + 1];
    if (char === '"' || char === "'") {
      cursor = skipQuotedString(text, cursor, char) - 1;
      continue;
    }
    if (char === "`") {
      const result = scanTemplateForBackendImports(text, cursor, "");
      cursor = result.index - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(text, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(text, cursor) - 1;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }
  return text.length;
};

const backendImportProblemAt = (text, index, label) => {
  if (isAsciiIdentifierContinue(text[index - 1])) {
    return "";
  }
  const next = skipWhitespaceAndComments(text, index + "import".length);
  if (isAsciiIdentifierContinue(text[next])) {
    return "";
  }
  if (text[next] === ".") {
    return `${label} must be self-contained and must not use import metadata`;
  }
  if (
    text[next] === "(" ||
    text[next] === '"' ||
    text[next] === "'" ||
    text[next] === "{" ||
    text[next] === "*" ||
    isAsciiIdentifierStart(text[next])
  ) {
    return `${label} must be self-contained and must not import other modules`;
  }
  return "";
};

const backendReExportProblemAt = (text, index, label) => {
  if (isAsciiIdentifierContinue(text[index - 1])) {
    return "";
  }
  const start = skipWhitespaceAndComments(text, index + "export".length);
  const first = text[start];
  if (first === "*") {
    return `${label} must be self-contained and must not re-export other modules`;
  }
  if (first === "{") {
    const afterClause = skipWhitespaceAndComments(
      text,
      skipBalancedBraces(text, start),
    );
    const from = readAsciiIdentifier(text, afterClause);
    if (from?.value === "from") {
      return `${label} must be self-contained and must not re-export other modules`;
    }
    return "";
  }
  const firstIdentifier = readAsciiIdentifier(text, start);
  if (firstIdentifier?.value === "type") {
    const afterType = skipWhitespaceAndComments(text, firstIdentifier.end);
    if (text[afterType] === "{") {
      const from = nextAsciiIdentifier(
        text,
        skipBalancedBraces(text, afterType),
      );
      if (from?.value === "from") {
        return `${label} must be self-contained and must not re-export other modules`;
      }
    }
  }
  const secondIdentifier = firstIdentifier
    ? nextAsciiIdentifier(text, firstIdentifier.end)
    : null;
  if (secondIdentifier?.value === "from") {
    return `${label} must be self-contained and must not re-export other modules`;
  }
  return "";
};

const scanBackendImports = (text, label, index = 0, stopAtBrace = false) => {
  for (let cursor = index; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    const next = text[cursor + 1];
    if (stopAtBrace && char === "}") {
      return { index: cursor + 1, problem: "" };
    }
    if (char === '"' || char === "'") {
      cursor = skipQuotedString(text, cursor, char) - 1;
      continue;
    }
    if (char === "`") {
      const result = scanTemplateForBackendImports(text, cursor, label);
      if (result.problem) {
        return result;
      }
      cursor = result.index - 1;
      continue;
    }
    if (char === "/" && next === "/") {
      cursor = skipLineComment(text, cursor) - 1;
      continue;
    }
    if (char === "/" && next === "*") {
      cursor = skipBlockComment(text, cursor) - 1;
      continue;
    }
    if (stopAtBrace && char === "{") {
      const result = scanBackendImports(text, label, cursor + 1, true);
      if (result.problem) {
        return result;
      }
      cursor = result.index - 1;
      continue;
    }
    if (text.startsWith("import", cursor)) {
      const problem = backendImportProblemAt(text, cursor, label);
      if (problem) {
        return { index: cursor, problem };
      }
      continue;
    }
    if (text.startsWith("export", cursor)) {
      const problem = backendReExportProblemAt(text, cursor, label);
      if (problem) {
        return { index: cursor, problem };
      }
    }
  }
  return { index: text.length, problem: "" };
};

function scanTemplateForBackendImports(text, index, label) {
  for (let cursor = index + 1; cursor < text.length; cursor += 1) {
    const char = text[cursor];
    if (char === "\\") {
      cursor += 1;
      continue;
    }
    if (char === "`") {
      return { index: cursor + 1, problem: "" };
    }
    if (char === "$" && text[cursor + 1] === "{") {
      const result = scanBackendImports(text, label, cursor + 2, true);
      if (result.problem) {
        return result;
      }
      cursor = result.index - 1;
    }
  }
  return { index: text.length, problem: "" };
}

const assertSelfContainedBackendModule = (bytes, label) => {
  const text = textDecoder.decode(bytes);
  const result = scanBackendImports(text, label);
  if (result.problem) {
    fail("ERR_SCCP_BSC_RUNTIME_BACKEND", result.problem);
  }
};

const readBytes = async ({
  url,
  label,
  expectedSha256,
  minBytes,
  maxBytes = MAX_ARTIFACT_BYTES,
  baseUrl,
  allowDataUrl = false,
  allowFileUrl = false,
  expectedExtension = "",
}) => {
  const resolvedUrl = resolveUrl(url, label, baseUrl, {
    allowDataUrl,
    allowFileUrl,
    restrictFileUrlToBaseDir: true,
  });
  if (
    expectedExtension &&
    extensionFromMaterialUrl(resolvedUrl, label) !== expectedExtension
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} must be loaded from a ${expectedExtension} artifact URL`,
    );
  }
  const response = await fetch(resolvedUrl, RUNTIME_FETCH_OPTIONS);
  if (!response.ok) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_FETCH_FAILED",
      `${label} could not be loaded: HTTP ${response.status}`,
    );
  }
  const bytes = await readResponseBytesBounded(response, label, maxBytes);
  if (bytes.byteLength < minBytes) {
    fail("ERR_SCCP_BSC_RUNTIME_SIZE", `${label} is too small`);
  }
  const actualHash = await sha256Hex(bytes);
  const expectedHash = normalizeHex32(expectedSha256, `${label} sha256`);
  if (actualHash !== expectedHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${label} sha256 ${actualHash} does not match ${expectedHash}`,
    );
  }
  return { bytes, sha256: actualHash, url: resolvedUrl };
};

const repeatedPrefixPatternLength = (
  bytes,
  maxPatternLength = PROVER_MATERIAL_MAX_REPEATED_PATTERN_BYTES,
) => {
  const maxLength = Math.min(maxPatternLength, Math.floor(bytes.length / 2));
  for (let length = 1; length <= maxLength; length += 1) {
    let repeated = true;
    for (let index = length; index < bytes.length; index += 1) {
      if (bytes[index] !== bytes[index % length]) {
        repeated = false;
        break;
      }
    }
    if (repeated) {
      return length;
    }
  }
  return 0;
};

const constantByteDelta = (bytes) => {
  if (bytes.byteLength < 16) {
    return null;
  }
  const delta = (bytes[1] - bytes[0] + 256) & 0xff;
  for (let index = 2; index < bytes.byteLength; index += 1) {
    if (((bytes[index] - bytes[index - 1] + 256) & 0xff) !== delta) {
      return null;
    }
  }
  return delta;
};

const dominantByteFrequency = (bytes) => {
  const counts = new Uint32Array(256);
  let byte = 0;
  let count = 0;
  for (const entry of bytes) {
    counts[entry] += 1;
    if (counts[entry] > count) {
      byte = entry;
      count = counts[entry];
    }
  }
  return { byte, count };
};

const u32le = (bytes, offset) =>
  (bytes[offset] |
    (bytes[offset + 1] << 8) |
    (bytes[offset + 2] << 16) |
    (bytes[offset + 3] << 24)) >>>
  0;

const u64leSafe = (bytes, offset) => {
  const low = u32le(bytes, offset);
  const high = u32le(bytes, offset + 4);
  const value = high * 0x100000000 + low;
  return Number.isSafeInteger(value) ? value : null;
};

const bytePrefixMatches = (bytes, prefix) =>
  prefix.every((byte, index) => bytes[index] === byte);

const extensionFromMaterialUrl = (url, label) => {
  let pathname = "";
  try {
    pathname = new URL(url).pathname;
  } catch (_error) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} URL is invalid`);
  }
  const name = pathname.split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
};

const R1CS_REQUIRED_SECTION_IDS = Object.freeze([1, 2, 3]);
const ZKEY_REQUIRED_SECTION_IDS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
]);

const assertSnarkjsBinaryHeader = (
  bytes,
  label,
  magic,
  formatLabel,
  requiredSectionIds,
) => {
  if (bytes.byteLength < 12) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} header is truncated`,
    );
  }
  if (!bytePrefixMatches(bytes, magic)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} must start with ${formatLabel} magic bytes`,
    );
  }
  const version = u32le(bytes, 4);
  const sectionCount = u32le(bytes, 8);
  if (version < 1 || version > 2) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} header version is invalid`,
    );
  }
  if (sectionCount < 1 || sectionCount > 128) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} section count is invalid`,
    );
  }
  let offset = 12;
  const sectionIds = new Set();
  for (let index = 0; index < sectionCount; index += 1) {
    if (offset + 12 > bytes.byteLength) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
        `${label} ${formatLabel} section table is truncated`,
      );
    }
    const sectionId = u32le(bytes, offset);
    const sectionSize = u64leSafe(bytes, offset + 4);
    offset += 12;
    if (sectionId === 0) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
        `${label} ${formatLabel} section id must be non-zero`,
      );
    }
    if (sectionIds.has(sectionId)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
        `${label} ${formatLabel} section ids must be unique`,
      );
    }
    sectionIds.add(sectionId);
    if (sectionSize === null || sectionSize <= 0) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
        `${label} ${formatLabel} section size is invalid`,
      );
    }
    if (sectionSize > bytes.byteLength - offset) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
        `${label} ${formatLabel} section exceeds file size`,
      );
    }
    offset += sectionSize;
  }
  if (offset !== bytes.byteLength) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} section table does not consume the full file`,
    );
  }
  const missingSectionIds = requiredSectionIds.filter(
    (sectionId) => !sectionIds.has(sectionId),
  );
  if (missingSectionIds.length > 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} missing required section ids: ${missingSectionIds.join(", ")}`,
    );
  }
  const unexpectedSectionIds = [...sectionIds].filter(
    (sectionId) => !requiredSectionIds.includes(sectionId),
  );
  if (unexpectedSectionIds.length > 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} ${formatLabel} contains unsupported section ids: ${unexpectedSectionIds.join(", ")}`,
    );
  }
};

const assertProverMaterialFormat = (bytes, label, url, kind) => {
  const extension = extensionFromMaterialUrl(url, label);
  if (kind === "proof-artifact") {
    if (extension === ".r1cs") {
      assertSnarkjsBinaryHeader(
        bytes,
        label,
        [0x72, 0x31, 0x63, 0x73],
        ".r1cs",
        R1CS_REQUIRED_SECTION_IDS,
      );
      return;
    }
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} must be loaded from a .r1cs artifact URL`,
    );
  }
  if (kind === "proving-key") {
    if (extension === ".zkey") {
      assertSnarkjsBinaryHeader(
        bytes,
        label,
        [0x7a, 0x6b, 0x65, 0x79],
        ".zkey",
        ZKEY_REQUIRED_SECTION_IDS,
      );
      return;
    }
    fail(
      "ERR_SCCP_BSC_RUNTIME_MATERIAL_FORMAT",
      `${label} must be loaded from a .zkey artifact URL`,
    );
  }
};

const assertProverMaterialShape = (bytes, label, url, kind) => {
  if (bytes.byteLength < PROVER_MATERIAL_SHAPE_MIN_BYTES) {
    return;
  }
  const repeatedPatternLength = repeatedPrefixPatternLength(bytes);
  if (repeatedPatternLength > 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_PLACEHOLDER_MATERIAL",
      `${label} looks like non-production proof material: repeated ${repeatedPatternLength}-byte pattern`,
    );
  }
  const arithmeticDelta = constantByteDelta(bytes);
  if (arithmeticDelta !== null) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_PLACEHOLDER_MATERIAL",
      `${label} looks like non-production proof material: arithmetic byte sequence with step ${arithmeticDelta}`,
    );
  }
  const dominant = dominantByteFrequency(bytes);
  if (
    dominant.count / bytes.byteLength >
    PROVER_MATERIAL_MAX_DOMINANT_BYTE_FRACTION
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_PLACEHOLDER_MATERIAL",
      `${label} looks like non-production proof material: byte 0x${dominant.byte
        .toString(16)
        .padStart(
          2,
          "0",
        )} dominates ${dominant.count} of ${bytes.byteLength} bytes`,
    );
  }
  const uniqueBytes = new Set();
  for (const byte of bytes) {
    uniqueBytes.add(byte);
    if (uniqueBytes.size >= PROVER_MATERIAL_MIN_UNIQUE_BYTES) {
      break;
    }
  }
  if (uniqueBytes.size >= PROVER_MATERIAL_MIN_UNIQUE_BYTES) {
    assertProverMaterialFormat(bytes, label, url, kind);
    return;
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_PLACEHOLDER_MATERIAL",
    `${label} looks like non-production proof material: only ${uniqueBytes.size} unique byte values across ${bytes.byteLength} bytes`,
  );
};

const parseJsonStringToken = (text, start) => {
  let index = start + 1;
  while (index < text.length) {
    const char = text[index];
    if (char === '"') {
      return {
        value: JSON.parse(text.slice(start, index + 1)),
        end: index,
      };
    }
    if (char === "\\") {
      index += 2;
      continue;
    }
    index += 1;
  }
  return null;
};

const nextNonWhitespaceIndex = (text, start) => {
  let index = start;
  while (index < text.length && /\s/u.test(text[index])) {
    index += 1;
  }
  return index;
};

const duplicateJsonObjectKeyReason = (text, label) => {
  const stack = [];
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      const token = parseJsonStringToken(text, index);
      if (!token) {
        return "";
      }
      const current = stack.at(-1);
      if (
        current?.type === "object" &&
        current.expectingKey === true &&
        text[nextNonWhitespaceIndex(text, token.end + 1)] === ":"
      ) {
        if (current.keys.has(token.value)) {
          return `${label} contains a duplicate JSON object key.`;
        }
        current.keys.add(token.value);
        current.expectingKey = false;
      }
      index = token.end;
      continue;
    }
    if (char === "{") {
      stack.push({ type: "object", keys: new Set(), expectingKey: true });
      continue;
    }
    if (char === "[") {
      stack.push({ type: "array" });
      continue;
    }
    if (char === "}" || char === "]") {
      stack.pop();
      continue;
    }
    if (char === ",") {
      const current = stack.at(-1);
      if (current?.type === "object") {
        current.expectingKey = true;
      }
    }
  }
  return "";
};

const parseJsonBytes = (bytes, label) => {
  const text = textDecoder.decode(bytes);
  let duplicateReason = "";
  try {
    duplicateReason = duplicateJsonObjectKeyReason(text, label);
  } catch (_error) {
    duplicateReason = "";
  }
  if (duplicateReason) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_JSON", duplicateReason);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_error) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_JSON", `${label} is not valid JSON`);
  }
  if (!isRecord(parsed)) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_JSON", `${label} must be a JSON object`);
  }
  return parsed;
};

const strictConfigField = (record, names, label) => {
  if (!isRecord(record)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
  }
  const present = names.filter((name) => hasOwn(record, name));
  if (present.length > 1) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `${label} must not use multiple aliases`,
    );
  }
  if (present.length === 0) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
  }
  return ownValue(record, present[0]);
};

const strictConfigStringField = (record, names, label) => {
  const value = strictConfigField(record, names, label);
  if (typeof value !== "string" || !value.trim()) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be a non-empty string`);
  }
  return value.trim();
};

const strictConfigTrueField = (record, names, label) => {
  const value = strictConfigField(record, names, label);
  if (value !== true) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be true`);
  }
  return true;
};

const optionalStrictConfigField = (record, names, label) => {
  if (!isRecord(record)) {
    return undefined;
  }
  const present = names.filter((name) => hasOwn(record, name));
  if (present.length > 1) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `${label} must not use multiple aliases`,
    );
  }
  return present.length === 1 ? ownValue(record, present[0]) : undefined;
};

const optionalStrictConfigStringField = (record, names, label) => {
  const value = optionalStrictConfigField(record, names, label);
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value !== "string" || !value.trim()) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be a non-empty string`);
  }
  return value.trim();
};

const strictConfigArrayField = (record, names, label) => {
  const value = strictConfigField(record, names, label);
  if (!Array.isArray(value)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be an array`);
  }
  return value;
};

const normalizeVerifiedNativeSdks = (row, direction) => {
  const values = strictConfigArrayField(
    row,
    ["nativeProverVerifiedSdks", "native_prover_verified_sdks"],
    `${direction} native prover verified SDK list`,
  );
  const sdks = values.map((value) =>
    typeof value === "string" ? value.trim() : "",
  );
  const seen = new Set(sdks.filter(Boolean));
  if (seen.size !== sdks.length || sdks.some((sdk) => !sdk)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
      `${direction} native prover verified SDK list must contain unique non-empty strings`,
    );
  }
  for (const sdk of seen) {
    if (!REQUIRED_NATIVE_SDKS.includes(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native prover verified SDK list contains unknown SDK ${sdk}`,
      );
    }
  }
  for (const sdk of REQUIRED_NATIVE_SDKS) {
    if (!seen.has(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native prover verified SDK list is missing ${sdk}`,
      );
    }
  }
  return Object.freeze([...seen].sort());
};

const nativeBundleAnyField = (bundle, names, label) => {
  if (!isRecord(bundle)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
  }
  const present = names.filter(
    (name) => bundle[name] !== undefined && bundle[name] !== null,
  );
  if (present.length > 1) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `${label} must not use multiple aliases`,
    );
  }
  if (present.length === 1) {
    return bundle[present[0]];
  }
  fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
};

const normalizeHex32Word = (value, label) => {
  const normalized = trim(value).toLowerCase();
  if (!/^0x[0-9a-f]{64}$/u.test(normalized)) {
    fail("ERR_SCCP_BSC_RUNTIME_BAD_HASH", `${label} must be a 32-byte hash`);
  }
  return normalized;
};

const repeatedNativeBundleAuditHashPatternLength = (
  bytes,
  maxPatternLength = 16,
) => {
  for (
    let patternLength = 1;
    patternLength <= maxPatternLength;
    patternLength += 1
  ) {
    if (bytes.length % patternLength !== 0) {
      continue;
    }
    let repeated = true;
    for (let index = patternLength; index < bytes.length; index += 1) {
      if (bytes[index] !== bytes[index % patternLength]) {
        repeated = false;
        break;
      }
    }
    if (repeated) {
      return patternLength;
    }
  }
  return 0;
};

const constantNativeBundleAuditHashDelta = (bytes) => {
  if (bytes.length < 3) {
    return null;
  }
  const delta = (bytes[1] - bytes[0] + 256) % 256;
  for (let index = 2; index < bytes.length; index += 1) {
    if ((bytes[index] - bytes[index - 1] + 256) % 256 !== delta) {
      return null;
    }
  }
  return delta;
};

const requireNativeBundleAuditHashProductionShape = ({
  auditHashes,
  direction,
}) => {
  for (const key of REQUIRED_NATIVE_BUNDLE_AUDIT_HASHES) {
    const label = `${direction} native EVM prover bundle auditHashes.${key}`;
    const bytes = hex32Bytes(auditHashes[key], label);
    const repeatedPatternLength =
      repeatedNativeBundleAuditHashPatternLength(bytes);
    if (repeatedPatternLength > 0) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL",
        `${label} must not look like a placeholder audit hash: repeated ${repeatedPatternLength}-byte pattern`,
      );
    }
    const arithmeticDelta = constantNativeBundleAuditHashDelta(bytes);
    if (arithmeticDelta !== null) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL",
        `${label} must not look like a placeholder audit hash: arithmetic byte sequence`,
      );
    }
  }
};

const normalizeNativeBundleArtifactPath = (value, label) => {
  const artifactPath = trim(value);
  if (!artifactPath) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a non-empty relative path`,
    );
  }
  if (
    artifactPath.startsWith("/") ||
    artifactPath.includes("\\") ||
    /[?#]/u.test(artifactPath)
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a relative POSIX path`,
    );
  }
  if (hasUnsafeUrlCharacter(artifactPath)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must not contain whitespace or control characters`,
    );
  }
  if (hasParentDirectorySegment(artifactPath)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must stay under the native prover artifact base URL`,
    );
  }
  const segments = artifactPath.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must stay under the native prover artifact base URL`,
    );
  }
  return artifactPath;
};

const NON_PRODUCTION_NATIVE_BUNDLE_ARTIFACT_PATH_MARKERS = Object.freeze([
  "dev" + "[-_]?only",
  "dia" + "gnostic",
  "du" + "mmy",
  "fix" + "ture",
  "fix" + "tures",
  "mo" + "ck",
  "place" + "holder",
  "sam" + "ple",
  "st" + "ub",
  "test" + "[-_]?only",
]);
const NON_PRODUCTION_NATIVE_BUNDLE_ARTIFACT_PATH_PATTERN = new RegExp(
  String.raw`(?:^|[/._-])(?:${NON_PRODUCTION_NATIVE_BUNDLE_ARTIFACT_PATH_MARKERS.join("|")})(?:[/._-]|$)`,
  "iu",
);

const nonProductionNativeBundleArtifactPathMessage = (label) =>
  `${label} must not reference ${"dia" + "gnostic"}, ${"fix" + "ture"}, ${"mo" + "ck"}, ${"place" + "holder"}, ${"sam" + "ple"}, ${"st" + "ub"}, or ${"test" + "-only"} material`;

const rejectNonProductionNativeBundleArtifactPath = (artifactPath, label) => {
  if (NON_PRODUCTION_NATIVE_BUNDLE_ARTIFACT_PATH_PATTERN.test(artifactPath)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      nonProductionNativeBundleArtifactPathMessage(label),
    );
  }
  return artifactPath;
};

const assertKnownNativeBundleFields = (record, knownFields, label) => {
  if (!isRecord(record)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be a JSON object`);
  }
  for (const key of Object.keys(record)) {
    if (!knownFields.has(key)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_CONFIG",
        `${label} contains unknown field ${key}`,
      );
    }
  }
};

const strictNativeBundleField = (record, names, label) => {
  if (!isRecord(record)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
  }
  const present = names.filter((name) =>
    Object.prototype.hasOwnProperty.call(record, name),
  );
  if (present.length > 1) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `${label} must not use multiple aliases`,
    );
  }
  if (present.length === 0) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} is missing`);
  }
  return ownValue(record, present[0]);
};

const strictNativeBundleStringField = (record, names, label) => {
  const value = strictNativeBundleField(record, names, label);
  if (typeof value !== "string" || value.length === 0) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be a non-empty string`);
  }
  return value;
};

const strictNativeBundleExpectedString = (record, names, label, expected) => {
  const value = strictNativeBundleStringField(record, names, label);
  if (value !== expected) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be ${expected}`);
  }
  return value;
};

const strictNativeBundleExpectedBoolean = (record, names, label, expected) => {
  const value = strictNativeBundleField(record, names, label);
  if (value !== expected) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", `${label} must be ${expected}`);
  }
  return value;
};

const normalizeNativeBundleDescriptorPath = (value, label) => {
  if (typeof value !== "string" || value.length === 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a non-empty relative POSIX path`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} must not contain control characters`,
      );
    }
  }
  if (value.startsWith("/") || value.includes("\\") || /[?#]/u.test(value)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a relative POSIX path`,
    );
  }
  if (hasUnsafeUrlCharacter(value)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must not contain whitespace or control characters`,
    );
  }
  if (hasParentDirectorySegment(value)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must stay under the native prover artifact base URL`,
    );
  }
  const segments = value.split("/");
  if (
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must stay under the native prover artifact base URL`,
    );
  }
  return value;
};

const requireNativeBundleDescriptorPathExtension = (
  value,
  label,
  extension,
) => {
  if (!value.toLowerCase().endsWith(extension)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must reference a ${extension} artifact`,
    );
  }
  return value;
};

const nativeBundleDescriptorHashRoleSeparation = ({
  proofArtifactHash,
  provingKeyHash,
  verifierKeyHash,
  verifierKeyArtifactHash,
  destinationBindingHash,
  groth16ProofSelfTestHash,
  nativeSdkArtifacts,
  auditHashes,
  direction,
}) => {
  const seen = new Map();
  const add = (label, hashValue) => {
    const previous = seen.get(hashValue);
    if (previous) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
        `${direction} native EVM prover bundle descriptor hashes must be role-separated: ${label} matches ${previous}`,
      );
    }
    seen.set(hashValue, label);
  };
  add("proofArtifactHash", proofArtifactHash);
  add("provingKeyHash", provingKeyHash);
  add("verifierKeyHash", verifierKeyHash);
  add("verifierKeyArtifactHash", verifierKeyArtifactHash);
  add("destinationBindingHash", destinationBindingHash);
  add("groth16ProofSelfTestHash", groth16ProofSelfTestHash);
  for (const artifact of nativeSdkArtifacts) {
    add(
      `nativeSdkArtifacts[${artifact.sdk}].implementationHash`,
      artifact.implementationHash,
    );
  }
  for (const key of REQUIRED_NATIVE_BUNDLE_AUDIT_HASHES) {
    add(`auditHashes.${key}`, auditHashes[key]);
  }
};

const normalizeNativeEvmProverBundleDescriptor = ({
  bundle,
  profile,
  direction,
}) => {
  assertKnownNativeBundleFields(
    bundle,
    NATIVE_BUNDLE_KNOWN_FIELDS,
    `${direction} native EVM prover bundle descriptor`,
  );
  const schema = strictNativeBundleExpectedString(
    bundle,
    ["schema"],
    `${direction} native EVM prover bundle schema`,
    NATIVE_EVM_PROVER_BUNDLE_SCHEMA,
  );
  const bundleId = strictNativeBundleExpectedString(
    bundle,
    ["bundleId", "bundle_id"],
    `${direction} native EVM prover bundle id`,
    BSC_NATIVE_EVM_PROVER_BUNDLE_IDS[profile.key],
  );
  const domainInput = strictNativeBundleField(
    bundle,
    ["domain"],
    `${direction} native EVM prover bundle domain`,
  );
  const domain = Number(domainInput);
  if (domain !== 2) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      `${direction} native EVM prover bundle domain must be BSC`,
    );
  }
  const chain = strictNativeBundleExpectedString(
    bundle,
    ["chain"],
    `${direction} native EVM prover bundle chain`,
    profile.chain,
  );
  const proofBackend = strictNativeBundleExpectedString(
    bundle,
    ["proofBackend", "proof_backend", "backend"],
    `${direction} native EVM prover bundle proof backend`,
    PROOF_BACKEND,
  );
  const noWasm = strictNativeBundleExpectedBoolean(
    bundle,
    ["noWasm", "no_wasm"],
    `${direction} native EVM prover bundle noWasm`,
    true,
  );
  const remoteProverRequired = strictNativeBundleExpectedBoolean(
    bundle,
    ["remoteProverRequired", "remote_prover_required"],
    `${direction} native EVM prover bundle remoteProverRequired`,
    false,
  );
  const browserImplementation = strictNativeBundleExpectedString(
    bundle,
    ["browserImplementation", "browser_implementation"],
    `${direction} native EVM prover bundle browserImplementation`,
    "pure-typescript",
  );
  const proofArtifactHash = normalizeHex32Word(
    strictNativeBundleField(
      bundle,
      [
        "proofArtifactHash",
        "proof_artifact_hash",
        "proverArtifactHash",
        "prover_artifact_hash",
        "circuitArtifactHash",
        "circuit_artifact_hash",
      ],
      `${direction} native EVM prover bundle proofArtifactHash`,
    ),
    `${direction} native EVM prover bundle proofArtifactHash`,
  );
  const proofArtifact = requireNativeBundleDescriptorPathExtension(
    normalizeNativeBundleDescriptorPath(
      strictNativeBundleField(
        bundle,
        [
          "proofArtifact",
          "proof_artifact",
          "proverArtifact",
          "prover_artifact",
          "circuitArtifact",
          "circuit_artifact",
        ],
        `${direction} native EVM prover bundle proofArtifact`,
      ),
      `${direction} native EVM prover bundle proofArtifact`,
    ),
    `${direction} native EVM prover bundle proofArtifact`,
    ".r1cs",
  );
  const provingKeyHash = normalizeHex32Word(
    strictNativeBundleField(
      bundle,
      ["provingKeyHash", "proving_key_hash"],
      `${direction} native EVM prover bundle provingKeyHash`,
    ),
    `${direction} native EVM prover bundle provingKeyHash`,
  );
  const provingKey = requireNativeBundleDescriptorPathExtension(
    normalizeNativeBundleDescriptorPath(
      strictNativeBundleField(
        bundle,
        ["provingKey", "proving_key"],
        `${direction} native EVM prover bundle provingKey`,
      ),
      `${direction} native EVM prover bundle provingKey`,
    ),
    `${direction} native EVM prover bundle provingKey`,
    ".zkey",
  );
  const verifierKeyHash = normalizeHex32Word(
    strictNativeBundleField(
      bundle,
      ["verifierKeyHash", "verifier_key_hash"],
      `${direction} native EVM prover bundle verifierKeyHash`,
    ),
    `${direction} native EVM prover bundle verifierKeyHash`,
  );
  assertProductionBscVerifierKeyHash(
    verifierKeyHash,
    `${direction} native EVM prover bundle verifierKeyHash`,
  );
  const verifierKeyArtifactHashAliases = [
    "verifierKeyArtifactHash",
    "verifier_key_artifact_hash",
  ];
  const verifierKeyArtifactHash = normalizeHex32Word(
    strictNativeBundleField(
      bundle,
      verifierKeyArtifactHashAliases,
      `${direction} native EVM prover bundle verifierKeyArtifactHash`,
    ),
    `${direction} native EVM prover bundle verifierKeyArtifactHash`,
  );
  const verifierKey = normalizeNativeBundleDescriptorPath(
    strictNativeBundleField(
      bundle,
      ["verifierKey", "verifier_key"],
      `${direction} native EVM prover bundle verifierKey`,
    ),
    `${direction} native EVM prover bundle verifierKey`,
  );
  const destinationBindingHash = normalizeHex32Word(
    strictNativeBundleField(
      bundle,
      ["destinationBindingHash", "destination_binding_hash"],
      `${direction} native EVM prover bundle destinationBindingHash`,
    ),
    `${direction} native EVM prover bundle destinationBindingHash`,
  );
  const crossSdkParityArtifact = rejectNonProductionNativeBundleArtifactPath(
    requireNativeBundleDescriptorPathExtension(
      normalizeNativeBundleDescriptorPath(
        strictNativeBundleField(
          bundle,
          ["crossSdkParityArtifact", "cross_sdk_parity_artifact"],
          `${direction} native EVM prover bundle crossSdkParityArtifact`,
        ),
        `${direction} native EVM prover bundle crossSdkParityArtifact`,
      ),
      `${direction} native EVM prover bundle crossSdkParityArtifact`,
      ".json",
    ),
    `${direction} native EVM prover bundle cross-SDK parity artifact`,
  );
  const nativeProverSelfTestArtifact =
    rejectNonProductionNativeBundleArtifactPath(
      requireNativeBundleDescriptorPathExtension(
        normalizeNativeBundleDescriptorPath(
          strictNativeBundleField(
            bundle,
            [
              "nativeProverSelfTestArtifact",
              "native_prover_self_test_artifact",
              "selfTestArtifact",
              "self_test_artifact",
            ],
            `${direction} native EVM prover bundle nativeProverSelfTestArtifact`,
          ),
          `${direction} native EVM prover bundle nativeProverSelfTestArtifact`,
        ),
        `${direction} native EVM prover bundle nativeProverSelfTestArtifact`,
        ".json",
      ),
      `${direction} native EVM prover bundle self-test artifact`,
    );
  const groth16ProofSelfTestArtifact =
    rejectNonProductionNativeBundleArtifactPath(
      requireNativeBundleDescriptorPathExtension(
        normalizeNativeBundleDescriptorPath(
          strictNativeBundleField(
            bundle,
            [
              "groth16ProofSelfTestArtifact",
              "groth16_proof_self_test_artifact",
            ],
            `${direction} native EVM prover bundle groth16ProofSelfTestArtifact`,
          ),
          `${direction} native EVM prover bundle groth16ProofSelfTestArtifact`,
        ),
        `${direction} native EVM prover bundle groth16ProofSelfTestArtifact`,
        ".json",
      ),
      `${direction} native EVM prover bundle Groth16 proof self-test artifact`,
    );
  const groth16ProofSelfTestHash = normalizeHex32(
    strictNativeBundleField(
      bundle,
      ["groth16ProofSelfTestHash", "groth16_proof_self_test_hash"],
      `${direction} native EVM prover bundle groth16ProofSelfTestHash`,
    ),
    `${direction} native EVM prover bundle groth16ProofSelfTestHash`,
  );
  const auditHashesInput = strictNativeBundleField(
    bundle,
    ["auditHashes", "audit_hashes"],
    `${direction} native EVM prover bundle auditHashes`,
  );
  assertKnownNativeBundleFields(
    auditHashesInput,
    NATIVE_BUNDLE_AUDIT_KNOWN_FIELDS,
    `${direction} native EVM prover bundle auditHashes`,
  );
  const auditHashes = Object.fromEntries(
    REQUIRED_NATIVE_BUNDLE_AUDIT_HASHES.map((key) => [
      key,
      normalizeHex32Word(
        strictNativeBundleField(
          auditHashesInput,
          [key],
          `${direction} native EVM prover bundle auditHashes.${key}`,
        ),
        `${direction} native EVM prover bundle auditHashes.${key}`,
      ),
    ]),
  );
  const sdkArtifactsInput = strictNativeBundleField(
    bundle,
    [
      "nativeSdkArtifacts",
      "native_sdk_artifacts",
      "sdkArtifacts",
      "sdk_artifacts",
    ],
    `${direction} native EVM prover bundle nativeSdkArtifacts`,
  );
  if (!Array.isArray(sdkArtifactsInput) || sdkArtifactsInput.length === 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
      `${direction} native EVM prover bundle nativeSdkArtifacts must be a non-empty array`,
    );
  }
  const sdkArtifactsByName = new Map();
  for (const [index, artifact] of sdkArtifactsInput.entries()) {
    assertKnownNativeBundleFields(
      artifact,
      NATIVE_BUNDLE_SDK_KNOWN_FIELDS,
      `${direction} native EVM prover bundle nativeSdkArtifacts[${index}]`,
    );
    const sdk = strictNativeBundleStringField(
      artifact,
      ["sdk"],
      `${direction} native EVM prover bundle nativeSdkArtifacts[${index}].sdk`,
    );
    if (!REQUIRED_NATIVE_SDKS.includes(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native EVM prover bundle nativeSdkArtifacts contains unknown SDK ${sdk}`,
      );
    }
    if (sdkArtifactsByName.has(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native EVM prover bundle nativeSdkArtifacts contains duplicate SDK ${sdk}`,
      );
    }
    const implementation = strictNativeBundleExpectedString(
      artifact,
      ["implementation"],
      `${direction} native EVM prover bundle ${sdk} implementation`,
      REQUIRED_NATIVE_SDK_IMPLEMENTATIONS[sdk],
    );
    const sdkProofArtifactHash = normalizeHex32Word(
      strictNativeBundleField(
        artifact,
        [
          "proofArtifactHash",
          "proof_artifact_hash",
          "proverArtifactHash",
          "prover_artifact_hash",
        ],
        `${direction} native EVM prover bundle ${sdk} proofArtifactHash`,
      ),
      `${direction} native EVM prover bundle ${sdk} proofArtifactHash`,
    );
    if (sdkProofArtifactHash !== proofArtifactHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native EVM prover bundle ${sdk} proofArtifactHash must match proofArtifactHash`,
      );
    }
    const sdkProvingKeyHash = normalizeHex32Word(
      strictNativeBundleField(
        artifact,
        ["provingKeyHash", "proving_key_hash"],
        `${direction} native EVM prover bundle ${sdk} provingKeyHash`,
      ),
      `${direction} native EVM prover bundle ${sdk} provingKeyHash`,
    );
    if (sdkProvingKeyHash !== provingKeyHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native EVM prover bundle ${sdk} provingKeyHash must match provingKeyHash`,
      );
    }
    const implementationArtifact = normalizeNativeBundleDescriptorPath(
      strictNativeBundleField(
        artifact,
        [
          "implementationArtifact",
          "implementation_artifact",
          "implementationPath",
          "implementation_path",
        ],
        `${direction} native EVM prover bundle ${sdk} implementationArtifact`,
      ),
      `${direction} native EVM prover bundle ${sdk} implementationArtifact`,
    );
    const implementationHash = normalizeHex32Word(
      strictNativeBundleField(
        artifact,
        ["implementationHash", "implementation_hash"],
        `${direction} native EVM prover bundle ${sdk} implementationHash`,
      ),
      `${direction} native EVM prover bundle ${sdk} implementationHash`,
    );
    sdkArtifactsByName.set(
      sdk,
      Object.freeze({
        sdk,
        implementation,
        proofArtifactHash: sdkProofArtifactHash,
        provingKeyHash: sdkProvingKeyHash,
        implementationArtifact,
        implementationHash,
      }),
    );
  }
  for (const sdk of REQUIRED_NATIVE_SDKS) {
    if (!sdkArtifactsByName.has(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native EVM prover bundle nativeSdkArtifacts missing SDK ${sdk}`,
      );
    }
  }
  const nativeSdkArtifacts = REQUIRED_NATIVE_SDKS.map((sdk) =>
    sdkArtifactsByName.get(sdk),
  );
  nativeBundleDescriptorHashRoleSeparation({
    proofArtifactHash,
    provingKeyHash,
    verifierKeyHash,
    verifierKeyArtifactHash,
    destinationBindingHash,
    groth16ProofSelfTestHash,
    nativeSdkArtifacts,
    auditHashes,
    direction,
  });
  requireNativeBundleAuditHashProductionShape({ auditHashes, direction });
  return Object.freeze({
    schema,
    bundleId,
    domain,
    chain,
    proofBackend,
    proofArtifact,
    proofArtifactHash,
    provingKey,
    provingKeyHash,
    verifierKey,
    verifierKeyHash,
    verifierKeyArtifactHash,
    destinationBindingHash,
    noWasm,
    remoteProverRequired,
    browserImplementation,
    nativeSdkArtifacts,
    crossSdkParityArtifact,
    nativeProverSelfTestArtifact,
    groth16ProofSelfTestArtifact,
    groth16ProofSelfTestHash,
    auditHashes: Object.freeze(auditHashes),
  });
};

const nativeEvmProverBundleDescriptorHash = async ({
  bundle,
  profile,
  direction,
}) => {
  const descriptor = normalizeNativeEvmProverBundleDescriptor({
    bundle,
    profile,
    direction,
  });
  const descriptorHash = await sha256Hex(
    textEncoder.encode(JSON.stringify(descriptor)),
  );
  return {
    descriptor,
    descriptorHash,
  };
};

const nativeProverArtifactBaseUrl = (
  row,
  nativeBundleUrl,
  state,
  direction,
) => {
  const explicit = optionalStrictConfigStringField(
    row,
    [
      "nativeProverArtifactBaseUrl",
      "native_prover_artifact_base_url",
      "nativeProverBaseUrl",
      "native_prover_base_url",
    ],
    `${direction} native prover artifact base URL`,
  );
  const base = explicit || new URL("./", nativeBundleUrl).href;
  const resolved = resolveUrl(
    base,
    `${direction} native prover artifact base URL`,
    state.baseUrl,
    {
      allowDataUrl: false,
      allowFileUrl: state.allowFileUrl,
    },
  );
  return resolved.endsWith("/") ? resolved : `${resolved}/`;
};

const normalizeBscNetworkKey = (value) => {
  const normalized = trim(value).toLowerCase().replace(/_/gu, "-");
  if (
    !normalized ||
    normalized === "testnet" ||
    normalized === "bsc-testnet" ||
    normalized === "chapel" ||
    normalized === "bsc-chapel"
  ) {
    return "testnet";
  }
  if (
    normalized === "mainnet" ||
    normalized === "bsc-mainnet" ||
    normalized === "bnb-mainnet" ||
    normalized === "bsc"
  ) {
    return "mainnet";
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_ROUTE",
    "BSC prover config network must be bsc-testnet or bsc-mainnet",
  );
};

const resolveBscProfile = (config) => {
  const explicitNetwork = optionalStrictConfigStringField(
    config,
    ["bscNetwork", "bsc_network", "network", "chain"],
    "BSC prover config network",
  );
  if (explicitNetwork) {
    return BSC_NETWORK_PROFILES[normalizeBscNetworkKey(explicitNetwork)];
  }
  const chainIdHex = optionalStrictConfigStringField(
    config,
    ["bscChainIdHex", "bsc_chain_id_hex"],
    "bscChainIdHex",
  ).toLowerCase();
  if (chainIdHex === BSC_NETWORK_PROFILES.mainnet.chainIdHex) {
    return BSC_NETWORK_PROFILES.mainnet;
  }
  return BSC_NETWORK_PROFILES.testnet;
};

const normalizeChainHex = (value, label, profile) => {
  const normalized = trim(value).toLowerCase();
  if (normalized !== profile.chainIdHex) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      `${label} must be ${profile.chainIdHex} for ${profile.label}`,
    );
  }
  return normalized;
};

const requireCommonConfig = (config) => {
  if (!isRecord(config)) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", "BSC prover config is required");
  }
  assertKnownFields(config, CONFIG_KNOWN_FIELDS, "BSC prover config");
  if (
    strictConfigStringField(config, ["schema"], "BSC prover config schema") !==
    CONFIG_SCHEMA
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `BSC prover config schema must be ${CONFIG_SCHEMA}`,
    );
  }
  if (
    strictConfigStringField(config, ["routeId", "route_id"], "routeId") !==
      ROUTE_ID ||
    strictConfigStringField(config, ["assetKey", "asset_key"], "assetKey") !==
      ASSET_KEY
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      "BSC prover config must target taira_bsc_xor XOR",
    );
  }
  if (
    strictConfigStringField(
      config,
      ["tairaChainId", "taira_chain_id"],
      "tairaChainId",
    ) !== TAIRA_CHAIN_ID
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      "BSC prover config has wrong TAIRA chain",
    );
  }
  if (
    Number(
      strictConfigField(
        config,
        ["tairaNetworkPrefix", "taira_network_prefix"],
        "tairaNetworkPrefix",
      ),
    ) !== TAIRA_NETWORK_PREFIX
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      "BSC prover config has wrong TAIRA network prefix",
    );
  }
  const profile = resolveBscProfile(config);
  const configuredChain = optionalStrictConfigStringField(
    config,
    ["bscChain", "bsc_chain"],
    "bscChain",
  );
  if (configuredChain && configuredChain !== profile.chain) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      `bscChain must be ${profile.chain} for ${profile.label}`,
    );
  }
  normalizeChainHex(
    strictConfigStringField(
      config,
      ["bscChainIdHex", "bsc_chain_id_hex"],
      "bscChainIdHex",
    ),
    "bscChainIdHex",
    profile,
  );
  const networkId = normalizeHex32(
    strictConfigStringField(
      config,
      ["bscNetworkIdHex", "bsc_network_id_hex"],
      "bscNetworkIdHex",
    ),
    "bscNetworkIdHex",
  );
  if (networkId !== profile.networkIdHex) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_ROUTE",
      `BSC prover config has wrong ${profile.label} network id`,
    );
  }
  return profile;
};

const directionConfig = (config, direction) => {
  const row = ownValue(
    config,
    direction === "source" ? "source" : "destination",
  );
  if (!isRecord(row)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_CONFIG",
      `${direction} BSC prover config is required`,
    );
  }
  assertKnownFields(
    row,
    DIRECTION_CONFIG_KNOWN_FIELDS,
    `${direction} BSC prover config`,
  );
  strictConfigTrueField(
    row,
    ["backendSelfContained", "backend_self_contained"],
    `${direction} backendSelfContained`,
  );
  return row;
};

const DIRECTION_MATERIAL_HASH_FIELDS = Object.freeze([
  Object.freeze({
    key: "nativeProverBundleSha256",
    label: "native prover bundle sha256",
    aliases: ["nativeProverBundleSha256", "native_prover_bundle_sha256"],
  }),
  Object.freeze({
    key: "nativeEvmProverBundleHash",
    label: "native EVM prover bundle descriptor hash",
    aliases: ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
  }),
  Object.freeze({
    key: "proofArtifactSha256",
    label: "proof artifact sha256",
    aliases: ["proofArtifactSha256", "proof_artifact_sha256"],
  }),
  Object.freeze({
    key: "provingKeySha256",
    label: "proving key sha256",
    aliases: ["provingKeySha256", "proving_key_sha256"],
  }),
  Object.freeze({
    key: "verifierKeySha256",
    label: "verifier key sha256",
    aliases: ["verifierKeySha256", "verifier_key_sha256"],
  }),
]);

const normalizeDirectionMaterialHashes = (row, direction) =>
  Object.fromEntries(
    DIRECTION_MATERIAL_HASH_FIELDS.map(({ key, label, aliases }) => [
      key,
      normalizeHex32(
        strictConfigStringField(row, aliases, `${direction} ${label}`),
        `${direction} ${label}`,
      ),
    ]),
  );

const assertDirectionMaterialRoleSeparation = (row, direction) => {
  const hashes = normalizeDirectionMaterialHashes(row, direction);
  assertProductionBscVerifierKeyHash(
    hashes.verifierKeySha256,
    `${direction} verifier key sha256`,
  );
  const seen = new Map();
  for (const { key, label } of DIRECTION_MATERIAL_HASH_FIELDS) {
    const hashValue = hashes[key];
    const role = `${direction} ${label}`;
    const previous = seen.get(hashValue);
    if (previous) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
        `BSC runtime prover material hashes must be role-separated: ${role} matches ${previous}`,
      );
    }
    seen.set(hashValue, role);
  }
};

const assertRuntimeMaterialRoleSeparation = (config) => {
  const rows = {
    destination: directionConfig(config, "destination"),
    source: directionConfig(config, "source"),
  };
  for (const direction of ["destination", "source"]) {
    assertDirectionMaterialRoleSeparation(rows[direction], direction);
  }
  return Object.freeze(rows);
};

const readConfig = async () => {
  const moduleUrl = new URL(import.meta.url);
  const allowFileUrl = moduleUrl.protocol === "file:";
  const configuredConfigUrl = trim(globalThis.IrohaSccpBscProverConfigUrl);
  if (!configuredConfigUrl) {
    fail("ERR_SCCP_BSC_RUNTIME_CONFIG", "BSC prover config URL is required");
  }
  const configUrl = resolveUrl(
    configuredConfigUrl,
    "BSC prover config URL",
    import.meta.url,
    { allowFileUrl },
  );
  const response = await fetch(configUrl, RUNTIME_FETCH_OPTIONS);
  if (!response.ok) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_FETCH_FAILED",
      `BSC prover config could not be loaded: HTTP ${response.status}`,
    );
  }
  const bytes = await readResponseBytesBounded(
    response,
    "BSC prover config",
    MAX_CONFIG_BYTES,
  );
  const config = parseJsonBytes(bytes, "BSC prover config");
  const bscProfile = requireCommonConfig(config);
  const directionRows = assertRuntimeMaterialRoleSeparation(config);
  return {
    config,
    bscProfile,
    directionRows,
    baseUrl: configUrl,
    allowDataUrl: false,
    allowFileUrl: new URL(configUrl).protocol === "file:",
  };
};

const readNativeBundleArtifact = async ({
  artifactBaseUrl,
  artifactPath,
  expectedSha256,
  label,
  minBytes,
  state,
}) =>
  readBytes({
    url: new URL(
      rejectNonProductionNativeBundleArtifactPath(
        normalizeNativeBundleArtifactPath(artifactPath, label),
        label,
      ),
      artifactBaseUrl,
    ).href,
    label,
    expectedSha256,
    minBytes,
    maxBytes: MAX_ARTIFACT_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: false,
    allowFileUrl: state.allowFileUrl,
  });

const validateNativeSupportCommon = ({
  supportRecord,
  schema,
  label,
  material,
  profile,
}) => {
  if (!isRecord(supportRecord)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a JSON object`,
    );
  }
  if (trim(supportRecord.schema) !== schema) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} schema must be ${schema}`,
    );
  }
  if (Number(supportRecord.domain) !== 2) {
    fail("ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT", `${label} domain must be BSC`);
  }
  if (trim(supportRecord.chain) !== profile.chain) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} chain must be ${profile.chain}`,
    );
  }
  if (
    trim(
      nativeBundleAnyField(
        supportRecord,
        ["proofBackend", "proof_backend"],
        `${label} proof backend`,
      ),
    ) !== PROOF_BACKEND
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} proof backend must be ${PROOF_BACKEND}`,
    );
  }
  const expectedHashes = {
    proofArtifactHash: material.proofArtifactHash,
    provingKeyHash: material.provingKeyHash,
    verifierKeyHash: material.verifierKeyHash,
    destinationBindingHash:
      material.nativeEvmProverBundleDescriptor.destinationBindingHash,
  };
  const aliases = {
    proofArtifactHash: [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
      "circuitArtifactHash",
      "circuit_artifact_hash",
    ],
    provingKeyHash: ["provingKeyHash", "proving_key_hash"],
    verifierKeyHash: ["verifierKeyHash", "verifier_key_hash"],
    destinationBindingHash: [
      "destinationBindingHash",
      "destination_binding_hash",
    ],
  };
  for (const [key, expected] of Object.entries(expectedHashes)) {
    const actual = normalizeHex32Word(
      nativeBundleAnyField(supportRecord, aliases[key], `${label} ${key}`),
      `${label} ${key}`,
    );
    if (actual !== expected) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} ${key} must match native prover bundle`,
      );
    }
  }
  return expectedHashes;
};

const normalizeSupportProductionAttestationHash = (supportRecord, label) => {
  const attestationHash = normalizeHex32Word(
    nativeBundleAnyField(
      supportRecord,
      ["productionAttestationHash", "production_attestation_hash"],
      `${label} productionAttestationHash`,
    ),
    `${label} productionAttestationHash`,
  );
  const bytes = hex32Bytes(
    attestationHash,
    `${label} productionAttestationHash`,
  );
  const repeatedPatternLength =
    repeatedNativeBundleAuditHashPatternLength(bytes);
  if (repeatedPatternLength > 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL",
      `${label} productionAttestationHash must not look like a placeholder attestation hash: repeated ${repeatedPatternLength}-byte pattern`,
    );
  }
  const arithmeticDelta = constantNativeBundleAuditHashDelta(bytes);
  if (arithmeticDelta !== null) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_DIAGNOSTIC_MATERIAL",
      `${label} productionAttestationHash must not look like a placeholder attestation hash: arithmetic byte sequence`,
    );
  }
  return attestationHash;
};

const normalizeSupportSignals = (supportRecord, label) => {
  const words = nativeBundleAnyField(
    supportRecord,
    ["publicSignalWords", "public_signal_words"],
    `${label} public signal words`,
  );
  if (!Array.isArray(words) || words.length !== 9) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} public signal words must contain 9 words`,
    );
  }
  return words.map((word, index) =>
    normalizeHex32Word(word, `${label} publicSignalWords[${index}]`),
  );
};

const normalizeSupportHashFields = (supportRecord, label, entries) =>
  Object.fromEntries(
    entries.map(([name, aliases]) => [
      name,
      normalizeHex32(
        nativeBundleAnyField(supportRecord, aliases, `${label} ${name}`),
        `${label} ${name}`,
      ),
    ]),
  );

const validateSupportSdkResults = ({
  supportRecord,
  expected,
  label,
  entries,
}) => {
  const sdkResults = nativeBundleAnyField(
    supportRecord,
    ["sdkResults", "sdk_results"],
    `${label} SDK results`,
  );
  if (!isRecord(sdkResults)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} SDK results must be an object`,
    );
  }
  const keys = Object.keys(sdkResults).sort();
  if (
    keys.length !== REQUIRED_NATIVE_SDKS.length ||
    keys.some((sdk, index) => sdk !== REQUIRED_NATIVE_SDKS[index])
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} SDK results must cover every required native SDK exactly once`,
    );
  }
  for (const sdk of REQUIRED_NATIVE_SDKS) {
    const row = sdkResults[sdk];
    if (!isRecord(row)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} SDK result ${sdk} must be an object`,
      );
    }
    for (const [name, aliases] of entries) {
      const actual = normalizeHex32Word(
        nativeBundleAnyField(row, aliases, `${label} SDK ${sdk} ${name}`),
        `${label} SDK ${sdk} ${name}`,
      );
      if (actual !== expected[name]) {
        fail(
          "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
          `${label} SDK ${sdk} ${name} must match ${name}`,
        );
      }
    }
    const sdkSignals = normalizeSupportSignals(row, `${label} SDK ${sdk}`);
    if (
      sdkSignals.length !== expected.publicSignalWords.length ||
      sdkSignals.some(
        (word, index) => word !== expected.publicSignalWords[index],
      )
    ) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} SDK ${sdk} public signal words must match`,
      );
    }
  }
};

const validateNativeSupportArtifact = ({
  artifact,
  kind,
  material,
  profile,
  direction,
}) => {
  const label =
    kind === "parity"
      ? `${direction} native bundle cross-SDK parity artifact`
      : `${direction} native bundle self-test artifact`;
  const supportRecord = parseJsonBytes(artifact.bytes, label);
  const materialHashes = validateNativeSupportCommon({
    supportRecord,
    schema: BSC_SUPPORT_SCHEMAS[profile.key][kind],
    label,
    material,
    profile,
  });
  const entries =
    kind === "parity"
      ? [
          ["receiptProofHash", ["receiptProofHash", "receipt_proof_hash"]],
          ["sourceProofHash", ["sourceProofHash", "source_proof_hash"]],
          ["calldataHash", ["calldataHash", "calldata_hash"]],
          [
            "toriiSubmitPayloadHash",
            ["toriiSubmitPayloadHash", "torii_submit_payload_hash"],
          ],
        ]
      : [
          ["requestHash", ["requestHash", "request_hash"]],
          ["witnessHash", ["witnessHash", "witness_hash"]],
          ["sourceProofHash", ["sourceProofHash", "source_proof_hash"]],
          ["proofHash", ["proofHash", "proof_hash"]],
          ["calldataHash", ["calldataHash", "calldata_hash"]],
          [
            "toriiSubmitPayloadHash",
            ["toriiSubmitPayloadHash", "torii_submit_payload_hash"],
          ],
        ];
  const hashes = normalizeSupportHashFields(supportRecord, label, entries);
  const publicSignalWords = normalizeSupportSignals(supportRecord, label);
  const productionAttestationHash = normalizeSupportProductionAttestationHash(
    supportRecord,
    label,
  );
  const expected = { ...hashes, publicSignalWords };
  validateSupportSdkResults({ supportRecord, expected, label, entries });
  return Object.freeze({
    schema: supportRecord.schema,
    ...materialHashes,
    ...expected,
    productionAttestationHash,
  });
};

const nativeProverReportProductionAttestationHash = async (
  kind,
  materialManifestHash,
) => {
  const role =
    kind === "parity"
      ? "cross-sdk-parity"
      : kind === "selfTest"
        ? "native-prover-self-test"
        : "";
  if (!role) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      "native prover report production attestation kind is invalid",
    );
  }
  return sha256Hex(
    textEncoder.encode(
      `iroha-sccp-bsc-native-prover-report-production-attestation/v1:${role}:${materialManifestHash}`,
    ),
  );
};

const validateNativeReportProductionAttestationBinding = async ({
  parityDescriptor,
  selfTestDescriptor,
  groth16ProofSelfTestDescriptor,
  direction,
}) => {
  const materialManifestHash =
    groth16ProofSelfTestDescriptor.materialManifestHash;
  const expectedParity = await nativeProverReportProductionAttestationHash(
    "parity",
    materialManifestHash,
  );
  const expectedSelfTest = await nativeProverReportProductionAttestationHash(
    "selfTest",
    materialManifestHash,
  );
  if (parityDescriptor.productionAttestationHash !== expectedParity) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${direction} native bundle cross-SDK parity artifact production_attestation_hash must be role-derived from the Groth16 material manifest hash`,
    );
  }
  if (selfTestDescriptor.productionAttestationHash !== expectedSelfTest) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${direction} native bundle self-test artifact production_attestation_hash must be role-derived from the Groth16 material manifest hash`,
    );
  }
};

const GROTH16_PROOF_SELF_TEST_REPORT_KNOWN_FIELDS = Object.freeze(
  new Set([
    "schema",
    "routeId",
    "route_id",
    "assetKey",
    "asset_key",
    "bscNetwork",
    "bsc_network",
    "network",
    "chain",
    "chainIdHex",
    "chain_id_hex",
    "networkIdHex",
    "network_id_hex",
    "circuitProfile",
    "circuit_profile",
    "proofBackend",
    "proof_backend",
    "backend",
    "proofFamily",
    "proof_family",
    "generatedAt",
    "generated_at",
    "manifest",
    "artifacts",
    "sample",
    "witnessHash",
    "witness_hash",
    "proofHash",
    "proof_hash",
    "publicSignalsHash",
    "public_signals_hash",
    "snarkjs",
    "adversarialChecks",
    "adversarial_checks",
    "proof",
    "publicSignals",
    "public_signals",
  ]),
);

const GROTH16_PROOF_SELF_TEST_MANIFEST_KNOWN_FIELDS = Object.freeze(
  new Set([
    "path",
    "sha256",
    "manifestSha256",
    "manifest_sha256",
    "productionReady",
    "production_ready",
    "productionBlockers",
    "production_blockers",
    "generatedAt",
    "generated_at",
  ]),
);

const GROTH16_PROOF_SELF_TEST_ARTIFACTS_KNOWN_FIELDS = Object.freeze(
  new Set([
    "circuitSource",
    "circuit_source",
    "r1cs",
    "provingKey",
    "proving_key",
    "snarkjsVerificationKey",
    "snarkjs_verification_key",
    "bscVerifierKey",
    "bsc_verifier_key",
    "witnessWasm",
    "witness_wasm",
  ]),
);

const GROTH16_PROOF_SELF_TEST_ARTIFACT_KNOWN_FIELDS = Object.freeze(
  new Set(["path", "sha256", "hash", "artifactHash", "artifact_hash"]),
);

const GROTH16_PROOF_SELF_TEST_SAMPLE_KNOWN_FIELDS = Object.freeze(
  new Set([
    "id",
    "syntheticInputWords",
    "synthetic_input_words",
    "publicSignalNames",
    "public_signal_names",
    "publicSignalWords",
    "public_signal_words",
    "inputSha256",
    "input_sha256",
  ]),
);

const GROTH16_PROOF_SELF_TEST_SNARKJS_KNOWN_FIELDS = Object.freeze(
  new Set(["binary", "wtnsCalculate", "groth16Prove", "groth16Verify"]),
);

const GROTH16_PROOF_SELF_TEST_PROOF_KNOWN_FIELDS = Object.freeze(
  new Set([
    "protocol",
    "curve",
    "pi_a",
    "piA",
    "a",
    "pi_b",
    "piB",
    "b",
    "pi_c",
    "piC",
    "c",
  ]),
);

const proofSelfTestField = (record, names, label) =>
  nativeBundleAnyField(record, names, label);

const proofSelfTestStringField = (record, names, label) => {
  const value = proofSelfTestField(record, names, label);
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a non-empty canonical string`,
    );
  }
  return value;
};

const proofSelfTestExpectedString = (record, names, label, expected) => {
  const value = proofSelfTestStringField(record, names, label);
  if (value !== expected) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be ${expected}`,
    );
  }
  return value;
};

const proofSelfTestExpectedBoolean = (record, names, label, expected) => {
  const value = proofSelfTestField(record, names, label);
  if (value !== expected) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be ${expected}`,
    );
  }
  return value;
};

const normalizeProofSelfTestArtifactPath = (artifact, label) =>
  normalizeNativeBundleDescriptorPath(
    proofSelfTestStringField(artifact, ["path"], `${label}.path`),
    `${label}.path`,
  );

const normalizeProofSelfTestHex32 = (record, names, label) =>
  normalizeHex32(proofSelfTestField(record, names, label), label);

const normalizeProofSelfTestArtifactHash = (artifacts, names, label) => {
  const artifact = proofSelfTestField(artifacts, names, label);
  assertKnownNativeBundleFields(
    artifact,
    GROTH16_PROOF_SELF_TEST_ARTIFACT_KNOWN_FIELDS,
    label,
  );
  normalizeProofSelfTestArtifactPath(artifact, label);
  return normalizeProofSelfTestHex32(
    artifact,
    ["sha256", "hash", "artifactHash", "artifact_hash"],
    `${label}.sha256`,
  );
};

const normalizeProofSelfTestDecimalWord = (value, label) => {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/u.test(value)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a canonical decimal BN254 scalar word`,
    );
  }
  const numeric = BigInt(value);
  if (numeric >= BN254_SCALAR_FIELD_MODULUS) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must be a BN254 scalar field element`,
    );
  }
  return numeric.toString();
};

const normalizeProofSelfTestPublicSignals = (value, label) => {
  if (
    !Array.isArray(value) ||
    value.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} must contain 9 canonical decimal words`,
    );
  }
  return Object.freeze(
    value.map((word, index) =>
      normalizeProofSelfTestDecimalWord(word, `${label}[${index}]`),
    ),
  );
};

const assertProofSelfTestRoleSeparation = (entries, label) => {
  const seen = new Map();
  for (const [role, value] of entries) {
    if (!value) {
      continue;
    }
    const previous = seen.get(value);
    if (previous) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
        `${label} hashes must be role-separated: ${role} matches ${previous}`,
      );
    }
    seen.set(value, role);
  }
};

const validateGroth16ProofSelfTestArtifact = async ({
  artifact,
  material,
  profile,
  direction,
}) => {
  const label = `${direction} native bundle Groth16 proof self-test artifact`;
  const report = parseJsonBytes(artifact.bytes, label);
  assertKnownNativeBundleFields(
    report,
    GROTH16_PROOF_SELF_TEST_REPORT_KNOWN_FIELDS,
    label,
  );
  proofSelfTestExpectedString(
    report,
    ["schema"],
    `${label} schema`,
    GROTH16_PROOF_SELF_TEST_SCHEMA,
  );
  proofSelfTestExpectedString(
    report,
    ["routeId", "route_id"],
    `${label} routeId`,
    ROUTE_ID,
  );
  proofSelfTestExpectedString(
    report,
    ["assetKey", "asset_key"],
    `${label} assetKey`,
    ASSET_KEY,
  );
  proofSelfTestExpectedString(
    report,
    ["bscNetwork", "bsc_network", "network"],
    `${label} bscNetwork`,
    profile.key,
  );
  proofSelfTestExpectedString(
    report,
    ["chain"],
    `${label} chain`,
    profile.chain,
  );
  proofSelfTestExpectedString(
    report,
    ["chainIdHex", "chain_id_hex"],
    `${label} chainIdHex`,
    profile.chainIdHex,
  );
  const networkIdHex = normalizeHex32(
    proofSelfTestField(
      report,
      ["networkIdHex", "network_id_hex"],
      `${label} networkIdHex`,
    ),
    `${label} networkIdHex`,
  );
  if (networkIdHex !== profile.networkIdHex) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} networkIdHex must be ${profile.networkIdHex}`,
    );
  }
  proofSelfTestExpectedString(
    report,
    ["circuitProfile", "circuit_profile"],
    `${label} circuitProfile`,
    "sccp-bsc-full-message-v1",
  );
  proofSelfTestExpectedString(
    report,
    ["proofBackend", "proof_backend", "backend"],
    `${label} proofBackend`,
    PROOF_BACKEND,
  );
  proofSelfTestExpectedString(
    report,
    ["proofFamily", "proof_family"],
    `${label} proofFamily`,
    PROOF_FAMILY,
  );

  const manifest = proofSelfTestField(
    report,
    ["manifest"],
    `${label} manifest`,
  );
  assertKnownNativeBundleFields(
    manifest,
    GROTH16_PROOF_SELF_TEST_MANIFEST_KNOWN_FIELDS,
    `${label} manifest`,
  );
  normalizeProofSelfTestArtifactPath(manifest, `${label} manifest`);
  const materialManifestHash = normalizeProofSelfTestHex32(
    manifest,
    ["sha256", "manifestSha256", "manifest_sha256"],
    `${label} manifest.sha256`,
  );
  proofSelfTestExpectedBoolean(
    manifest,
    ["productionReady", "production_ready"],
    `${label} manifest.productionReady`,
    true,
  );
  const productionBlockers = proofSelfTestField(
    manifest,
    ["productionBlockers", "production_blockers"],
    `${label} manifest.productionBlockers`,
  );
  if (!Array.isArray(productionBlockers) || productionBlockers.length !== 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} manifest.productionBlockers must be an empty array`,
    );
  }

  const artifacts = proofSelfTestField(
    report,
    ["artifacts"],
    `${label} artifacts`,
  );
  assertKnownNativeBundleFields(
    artifacts,
    GROTH16_PROOF_SELF_TEST_ARTIFACTS_KNOWN_FIELDS,
    `${label} artifacts`,
  );
  const circuitSourceHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["circuitSource", "circuit_source"],
    `${label} artifacts.circuitSource`,
  );
  const proofArtifactHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["r1cs"],
    `${label} artifacts.r1cs`,
  );
  const provingKeyHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["provingKey", "proving_key"],
    `${label} artifacts.provingKey`,
  );
  const snarkjsVerificationKeyHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["snarkjsVerificationKey", "snarkjs_verification_key"],
    `${label} artifacts.snarkjsVerificationKey`,
  );
  const bscVerifierKeyArtifactHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["bscVerifierKey", "bsc_verifier_key"],
    `${label} artifacts.bscVerifierKey`,
  );
  const witnessWasmHash = normalizeProofSelfTestArtifactHash(
    artifacts,
    ["witnessWasm", "witness_wasm"],
    `${label} artifacts.witnessWasm`,
  );
  for (const [role, actual, expected] of [
    ["R1CS", proofArtifactHash, material.proofArtifactHash],
    ["proving key", provingKeyHash, material.provingKeyHash],
    [
      "BSC verifier key",
      bscVerifierKeyArtifactHash,
      material.verifierKeyArtifactHash,
    ],
  ]) {
    if (actual !== expected) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} ${role} hash must match native prover bundle`,
      );
    }
  }

  const sample = proofSelfTestField(report, ["sample"], `${label} sample`);
  assertKnownNativeBundleFields(
    sample,
    GROTH16_PROOF_SELF_TEST_SAMPLE_KNOWN_FIELDS,
    `${label} sample`,
  );
  const publicSignalNames = proofSelfTestField(
    sample,
    ["publicSignalNames", "public_signal_names"],
    `${label} sample.publicSignalNames`,
  );
  if (
    !Array.isArray(publicSignalNames) ||
    publicSignalNames.length !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES.length ||
    publicSignalNames.some(
      (name, index) => name !== BSC_GROTH16_PUBLIC_SIGNAL_NAMES[index],
    )
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} sample.publicSignalNames must match BSC Groth16 public signals`,
    );
  }
  const samplePublicSignals = normalizeProofSelfTestPublicSignals(
    proofSelfTestField(
      sample,
      ["publicSignalWords", "public_signal_words"],
      `${label} sample.publicSignalWords`,
    ),
    `${label} sample.publicSignalWords`,
  );
  const publicSignals = normalizeProofSelfTestPublicSignals(
    proofSelfTestField(
      report,
      ["publicSignals", "public_signals"],
      `${label} publicSignals`,
    ),
    `${label} publicSignals`,
  );
  if (
    publicSignals.some((word, index) => word !== samplePublicSignals[index])
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} publicSignals must match sample.publicSignalWords`,
    );
  }

  const snarkjs = proofSelfTestField(report, ["snarkjs"], `${label} snarkjs`);
  assertKnownNativeBundleFields(
    snarkjs,
    GROTH16_PROOF_SELF_TEST_SNARKJS_KNOWN_FIELDS,
    `${label} snarkjs`,
  );
  for (const key of ["wtnsCalculate", "groth16Prove", "groth16Verify"]) {
    proofSelfTestExpectedBoolean(
      snarkjs,
      [key],
      `${label} snarkjs.${key}`,
      true,
    );
  }
  const witnessHash = normalizeProofSelfTestHex32(
    report,
    ["witnessHash", "witness_hash"],
    `${label} witnessHash`,
  );
  const proofHash = normalizeProofSelfTestHex32(
    report,
    ["proofHash", "proof_hash"],
    `${label} proofHash`,
  );
  const publicSignalsHash = normalizeProofSelfTestHex32(
    report,
    ["publicSignalsHash", "public_signals_hash"],
    `${label} publicSignalsHash`,
  );
  const actualPublicSignalsHash = await sha256Hex(
    textEncoder.encode(JSON.stringify(publicSignals)),
  );
  if (actualPublicSignalsHash !== publicSignalsHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} publicSignalsHash must match publicSignals`,
    );
  }
  const proof = proofSelfTestField(report, ["proof"], `${label} proof`);
  assertKnownNativeBundleFields(
    proof,
    GROTH16_PROOF_SELF_TEST_PROOF_KNOWN_FIELDS,
    `${label} proof`,
  );
  const protocol = ownValue(proof, "protocol");
  if (protocol !== undefined && protocol !== "groth16") {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} proof.protocol must be groth16`,
    );
  }
  const curve = ownValue(proof, "curve");
  if (curve !== undefined && curve !== "bn128") {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${label} proof.curve must be bn128`,
    );
  }
  for (const [names, pointLabel] of [
    [["pi_a", "piA", "a"], "pi_a"],
    [["pi_b", "piB", "b"], "pi_b"],
    [["pi_c", "piC", "c"], "pi_c"],
  ]) {
    const point = proofSelfTestField(
      proof,
      names,
      `${label} proof.${pointLabel}`,
    );
    if (!Array.isArray(point) && !isRecord(point)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
        `${label} proof.${pointLabel} must be a Groth16 proof point`,
      );
    }
  }

  assertProofSelfTestRoleSeparation(
    [
      ["reportHash", artifact.sha256],
      ["materialManifestHash", materialManifestHash],
      ["circuitSourceHash", circuitSourceHash],
      ["proofArtifactHash", proofArtifactHash],
      ["provingKeyHash", provingKeyHash],
      ["verifierKeyHash", material.verifierKeyHash],
      ["verifierKeyArtifactHash", bscVerifierKeyArtifactHash],
      [
        "destinationBindingHash",
        material.nativeEvmProverBundleDescriptor.destinationBindingHash,
      ],
      ["snarkjsVerificationKeyHash", snarkjsVerificationKeyHash],
      ["witnessWasmHash", witnessWasmHash],
      ["witnessHash", witnessHash],
      ["proofHash", proofHash],
      ["publicSignalsHash", publicSignalsHash],
    ],
    label,
  );
  return Object.freeze({
    schema: GROTH16_PROOF_SELF_TEST_SCHEMA,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
    bscNetwork: profile.key,
    chain: profile.chain,
    chainIdHex: profile.chainIdHex,
    networkIdHex: profile.networkIdHex,
    circuitProfile: "sccp-bsc-full-message-v1",
    proofBackend: PROOF_BACKEND,
    proofFamily: PROOF_FAMILY,
    materialManifestHash,
    circuitSourceHash,
    proofArtifactHash,
    provingKeyHash,
    bscVerifierKeyArtifactHash,
    snarkjsVerificationKeyHash,
    witnessWasmHash,
    witnessHash,
    proofHash,
    publicSignalsHash,
    publicSignals,
  });
};

const loadNativeBundleArtifacts = async ({
  row,
  state,
  direction,
  material,
  nativeBundleUrl,
}) => {
  const bundle = material.nativeEvmProverBundleDescriptor;
  const artifactBaseUrl = nativeProverArtifactBaseUrl(
    row,
    nativeBundleUrl,
    state,
    direction,
  );
  const verifiedSdks = normalizeVerifiedNativeSdks(row, direction);
  const proofPath = bundle.proofArtifact;
  const provingPath = bundle.provingKey;
  const verifierPath = bundle.verifierKey;
  normalizeNativeBundleArtifactPath(
    proofPath,
    `${direction} native bundle proof artifact path`,
  );
  normalizeNativeBundleArtifactPath(
    provingPath,
    `${direction} native bundle proving key path`,
  );
  normalizeNativeBundleArtifactPath(
    verifierPath,
    `${direction} native bundle verifier key path`,
  );

  const auditHashes = bundle.auditHashes;
  if (!auditHashes) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_ARTIFACT",
      `${direction} native bundle audit hashes are missing`,
    );
  }
  const parityArtifact = await readNativeBundleArtifact({
    artifactBaseUrl,
    artifactPath: bundle.crossSdkParityArtifact,
    expectedSha256: auditHashes.cross_sdk_parity,
    label: `${direction} native bundle cross-SDK parity artifact`,
    minBytes: MIN_NATIVE_SUPPORT_MATERIAL_BYTES,
    state,
  });
  const selfTestArtifact = await readNativeBundleArtifact({
    artifactBaseUrl,
    artifactPath: bundle.nativeProverSelfTestArtifact,
    expectedSha256: auditHashes.native_prover_self_test,
    label: `${direction} native bundle self-test artifact`,
    minBytes: MIN_NATIVE_SUPPORT_MATERIAL_BYTES,
    state,
  });
  const groth16ProofSelfTestArtifact = await readNativeBundleArtifact({
    artifactBaseUrl,
    artifactPath: bundle.groth16ProofSelfTestArtifact,
    expectedSha256: bundle.groth16ProofSelfTestHash,
    label: `${direction} native bundle Groth16 proof self-test artifact`,
    minBytes: MIN_NATIVE_SUPPORT_MATERIAL_BYTES,
    state,
  });
  const parityDescriptor = validateNativeSupportArtifact({
    artifact: parityArtifact,
    kind: "parity",
    material,
    profile: state.bscProfile,
    direction,
  });
  const groth16ProofSelfTestDescriptor =
    await validateGroth16ProofSelfTestArtifact({
      artifact: groth16ProofSelfTestArtifact,
      material,
      profile: state.bscProfile,
      direction,
    });
  const selfTestDescriptor = validateNativeSupportArtifact({
    artifact: selfTestArtifact,
    kind: "selfTest",
    material,
    profile: state.bscProfile,
    direction,
  });
  await validateNativeReportProductionAttestationBinding({
    parityDescriptor,
    selfTestDescriptor,
    groth16ProofSelfTestDescriptor,
    direction,
  });

  const sdkRows = bundle.nativeSdkArtifacts;
  if (!sdkRows) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
      `${direction} native bundle SDK artifacts are missing`,
    );
  }
  const seenSdkRows = new Set();
  const implementationBytes = {};
  const implementationHashes = {};
  for (const [index, rowEntry] of sdkRows.entries()) {
    if (!isRecord(rowEntry)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle SDK artifact ${index} must be an object`,
      );
    }
    const sdk = rowEntry.sdk;
    if (!REQUIRED_NATIVE_SDKS.includes(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle SDK artifact contains unknown SDK ${sdk}`,
      );
    }
    if (!verifiedSdks.includes(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle SDK artifact ${sdk} was not verified in config`,
      );
    }
    if (seenSdkRows.has(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle SDK artifact contains duplicate SDK ${sdk}`,
      );
    }
    seenSdkRows.add(sdk);
    const implementationName = rowEntry.implementation;
    if (implementationName !== REQUIRED_NATIVE_SDK_IMPLEMENTATIONS[sdk]) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle ${sdk} implementation name is not supported`,
      );
    }
    const sdkProofHash = normalizeHex32(
      rowEntry.proofArtifactHash,
      `${direction} native bundle ${sdk} proof artifact hash`,
    );
    const sdkProvingHash = normalizeHex32(
      rowEntry.provingKeyHash,
      `${direction} native bundle ${sdk} proving key hash`,
    );
    if (sdkProofHash !== material.proofArtifactHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
        `${direction} native bundle ${sdk} proof artifact hash does not match loaded material`,
      );
    }
    if (sdkProvingHash !== material.provingKeyHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
        `${direction} native bundle ${sdk} proving key hash does not match loaded material`,
      );
    }
    const implementation = await readNativeBundleArtifact({
      artifactBaseUrl,
      artifactPath: rowEntry.implementationArtifact,
      expectedSha256: rowEntry.implementationHash,
      label: `${direction} native bundle ${sdk} implementation artifact`,
      minBytes: MIN_NATIVE_IMPLEMENTATION_BYTES,
      state,
    });
    implementationBytes[sdk] = implementation.bytes.slice();
    implementationHashes[sdk] = implementation.sha256;
  }
  for (const sdk of REQUIRED_NATIVE_SDKS) {
    if (!seenSdkRows.has(sdk)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_NATIVE_SDKS",
        `${direction} native bundle SDK artifact is missing ${sdk}`,
      );
    }
  }
  return Object.freeze({
    nativeProverArtifactBaseUrl: artifactBaseUrl,
    nativeProverVerifiedSdks: verifiedSdks,
    crossSdkParityBytes: parityArtifact.bytes.slice(),
    crossSdkParityHash: parityArtifact.sha256,
    crossSdkParity: parityDescriptor,
    nativeProverSelfTestBytes: selfTestArtifact.bytes.slice(),
    nativeProverSelfTestHash: selfTestArtifact.sha256,
    nativeProverSelfTest: selfTestDescriptor,
    groth16ProofSelfTestBytes: groth16ProofSelfTestArtifact.bytes.slice(),
    groth16ProofSelfTestHash: groth16ProofSelfTestArtifact.sha256,
    groth16ProofSelfTest: groth16ProofSelfTestDescriptor,
    nativeSdkImplementationBytes: Object.freeze(implementationBytes),
    nativeSdkImplementationHashes: Object.freeze(implementationHashes),
  });
};

const loadMaterial = async (row, state, direction) => {
  const nativeBundle = await readBytes({
    url: strictConfigStringField(
      row,
      ["nativeProverBundleUrl", "native_prover_bundle_url"],
      `${direction} native prover bundle URL`,
    ),
    label: `${direction} native prover bundle`,
    expectedSha256: strictConfigStringField(
      row,
      ["nativeProverBundleSha256", "native_prover_bundle_sha256"],
      `${direction} native prover bundle sha256`,
    ),
    minBytes: MIN_NATIVE_BUNDLE_BYTES,
    maxBytes: MAX_CONFIG_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: state.allowDataUrl,
    allowFileUrl: state.allowFileUrl,
    expectedExtension: ".json",
  });
  const bundle = parseJsonBytes(
    nativeBundle.bytes,
    `${direction} native prover bundle`,
  );
  const expectedNativeEvmProverBundleHash = normalizeHex32(
    strictConfigStringField(
      row,
      ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
      `${direction} native EVM prover bundle descriptor hash`,
    ),
    `${direction} native EVM prover bundle descriptor hash`,
  );
  const {
    descriptor: nativeEvmProverBundleDescriptor,
    descriptorHash: nativeEvmProverBundleHash,
  } = await nativeEvmProverBundleDescriptorHash({
    bundle,
    profile: state.bscProfile,
    direction,
  });
  if (nativeEvmProverBundleHash !== expectedNativeEvmProverBundleHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${direction} native EVM prover bundle descriptor hash ${nativeEvmProverBundleHash} does not match ${expectedNativeEvmProverBundleHash}`,
    );
  }
  const proofArtifact = await readBytes({
    url: strictConfigStringField(
      row,
      ["proofArtifactUrl", "proof_artifact_url"],
      `${direction} proof artifact URL`,
    ),
    label: `${direction} proof artifact`,
    expectedSha256: strictConfigStringField(
      row,
      ["proofArtifactSha256", "proof_artifact_sha256"],
      `${direction} proof artifact sha256`,
    ),
    minBytes: MIN_PROVER_MATERIAL_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: state.allowDataUrl,
    allowFileUrl: state.allowFileUrl,
    expectedExtension: ".r1cs",
  });
  assertProverMaterialShape(
    proofArtifact.bytes,
    `${direction} proof artifact`,
    proofArtifact.url,
    "proof-artifact",
  );
  const provingKey = await readBytes({
    url: strictConfigStringField(
      row,
      ["provingKeyUrl", "proving_key_url"],
      `${direction} proving key URL`,
    ),
    label: `${direction} proving key`,
    expectedSha256: strictConfigStringField(
      row,
      ["provingKeySha256", "proving_key_sha256"],
      `${direction} proving key sha256`,
    ),
    minBytes: MIN_PROVER_MATERIAL_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: state.allowDataUrl,
    allowFileUrl: state.allowFileUrl,
    expectedExtension: ".zkey",
  });
  assertProverMaterialShape(
    provingKey.bytes,
    `${direction} proving key`,
    provingKey.url,
    "proving-key",
  );
  const verifierKey = await readBytes({
    url: strictConfigStringField(
      row,
      ["verifierKeyUrl", "verifier_key_url"],
      `${direction} verifier key URL`,
    ),
    label: `${direction} verifier key`,
    expectedSha256: strictConfigStringField(
      row,
      ["verifierKeySha256", "verifier_key_sha256"],
      `${direction} verifier key sha256`,
    ),
    minBytes: MIN_VERIFIER_MATERIAL_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: state.allowDataUrl,
    allowFileUrl: state.allowFileUrl,
  });
  const material = {
    nativeBundle: bundle,
    nativeBundleBytes: nativeBundle.bytes.slice(),
    nativeEvmProverBundleDescriptor,
    nativeEvmProverBundleHash,
    proofArtifactBytes: proofArtifact.bytes,
    proofArtifactHash: proofArtifact.sha256,
    provingKeyBytes: provingKey.bytes,
    provingKeyHash: provingKey.sha256,
    verifierKeyBytes: verifierKey.bytes.slice(),
    verifierKeyHash: nativeEvmProverBundleDescriptor.verifierKeyHash,
    verifierKeyArtifactHash: verifierKey.sha256,
  };
  return {
    ...material,
    nativeArtifacts: await loadNativeBundleArtifacts({
      row,
      state,
      direction,
      material,
      nativeBundleUrl: nativeBundle.url,
    }),
  };
};

const verifyBundleMaterial = (material, request, direction) => {
  const bundle = material.nativeEvmProverBundleDescriptor;
  const bundleProofHash = bundle.proofArtifactHash;
  const bundleProvingHash = bundle.provingKeyHash;
  const bundleVerifierHash = bundle.verifierKeyHash;
  const bundleVerifierArtifactHash = bundle.verifierKeyArtifactHash;
  if (bundleProofHash !== material.proofArtifactHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${direction} native bundle proof artifact hash does not match bytes`,
    );
  }
  if (bundleProvingHash !== material.provingKeyHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${direction} native bundle proving key hash does not match bytes`,
    );
  }
  if (bundleVerifierHash !== material.verifierKeyHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${direction} native bundle verifier key hash does not match descriptor`,
    );
  }
  if (bundleVerifierArtifactHash !== material.verifierKeyArtifactHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_HASH_MISMATCH",
      `${direction} native bundle verifier key artifact hash does not match bytes`,
    );
  }
  if (isRecord(request)) {
    if (ownValue(request, "proofArtifactHash") !== material.proofArtifactHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_ROUTE",
        "BSC proof request proofArtifactHash does not match loaded material",
      );
    }
    if (ownValue(request, "provingKeyHash") !== material.provingKeyHash) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_ROUTE",
        "BSC proof request provingKeyHash does not match loaded material",
      );
    }
    if (
      ownValue(request, "nativeEvmProverBundleHash") !==
      material.nativeEvmProverBundleHash
    ) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_ROUTE",
        "BSC proof request nativeEvmProverBundleHash does not match loaded material",
      );
    }
    const bindingHash = bundle.destinationBindingHash;
    if (
      bindingHash &&
      ownValue(request, "destinationBindingHash") &&
      normalizeHex32(bindingHash, "native bundle destination binding hash") !==
        normalizeHex32(
          ownValue(request, "destinationBindingHash"),
          "request destination binding hash",
        )
    ) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_ROUTE",
        "BSC proof request destinationBindingHash does not match native bundle",
      );
    }
  }
};

const loadBackend = async (row, state, direction) => {
  const backendUrl = strictConfigStringField(
    row,
    ["backendModuleUrl", "backend_module_url"],
    `${direction} backend module URL`,
  );
  const backendSha256 = strictConfigStringField(
    row,
    ["backendModuleSha256", "backend_module_sha256"],
    `${direction} backend module sha256`,
  );
  const backendBytes = await readBytes({
    url: backendUrl,
    label: `${direction} backend module`,
    expectedSha256: backendSha256,
    minBytes: 1024,
    maxBytes: MAX_BACKEND_BYTES,
    baseUrl: state.baseUrl,
    allowDataUrl: state.allowDataUrl,
    allowFileUrl: state.allowFileUrl,
  });
  assertSelfContainedBackendModule(
    backendBytes.bytes,
    `${direction} backend module`,
  );
  return import(
    /* @vite-ignore */ verifiedJavascriptModuleDataUrl(backendBytes.bytes)
  );
};

const BACKEND_PROVE_EXPORTS = Object.freeze({
  source: Object.freeze([
    "irohaSccpBscSourceProve",
    "bscSccpSourceProve",
    "proveBscSource",
  ]),
  destination: Object.freeze([
    "irohaSccpBscProve",
    "bscSccpProve",
    "evmSccpProve",
    "proveBsc",
  ]),
});

const BACKEND_SELF_TEST_EXPORTS = Object.freeze({
  source: Object.freeze([
    "irohaSccpBscSourceNativeProverSelfTest",
    "bscSccpSourceNativeProverSelfTest",
    "nativeProverSourceSelfTest",
    "selfTestBscSource",
    "selfTestSource",
    "nativeProverSelfTest",
    "selfTestNativeProver",
    "selfTest",
  ]),
  destination: Object.freeze([
    "irohaSccpBscNativeProverSelfTest",
    "bscSccpNativeProverSelfTest",
    "evmSccpNativeProverSelfTest",
    "nativeProverDestinationSelfTest",
    "selfTestBsc",
    "selfTestDestination",
    "nativeProverSelfTest",
    "selfTestNativeProver",
    "selfTest",
  ]),
});

const configuredBackendExportName = ({
  row,
  aliases,
  acceptedExports,
  label,
  code,
}) => {
  const name = strictConfigStringField(row, aliases, label);
  if (!acceptedExports.includes(name)) {
    fail(code, `${label} must be one of ${acceptedExports.join(", ")}`);
  }
  return name;
};

const selectBackendFn = (backend, direction, row) => {
  if (!isRecord(backend)) {
    fail("ERR_SCCP_BSC_RUNTIME_BACKEND", "BSC prover backend is not an object");
  }
  const exportName = configuredBackendExportName({
    row,
    aliases: ["backendAcceptedExport", "backend_accepted_export"],
    acceptedExports:
      BACKEND_PROVE_EXPORTS[direction] ?? BACKEND_PROVE_EXPORTS.destination,
    label: `${direction} backend accepted export`,
    code: "ERR_SCCP_BSC_RUNTIME_BACKEND",
  });
  if (typeof backend[exportName] === "function") {
    return backend[exportName].bind(backend);
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_BACKEND",
    `${direction} BSC prover backend does not export configured prove function ${exportName}`,
  );
};

const backendAnyField = (record, names, label) => {
  if (!isRecord(record)) {
    fail("ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST", `${label} is missing`);
  }
  let selected = undefined;
  let selectedName = "";
  for (const name of names) {
    if (!hasOwn(record, name)) {
      continue;
    }
    if (selectedName) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
        `${label} must not use multiple aliases: ${selectedName} and ${name}`,
      );
    }
    selected = ownValue(record, name);
    selectedName = name;
  }
  if (!selectedName || selected === undefined || selected === null) {
    fail("ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST", `${label} is missing`);
  }
  return selected;
};

const backendStringField = (record, names, label) => {
  const value = backendAnyField(record, names, label);
  if (typeof value !== "string" || !value.trim()) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} must be a non-empty string`,
    );
  }
  return value.trim();
};

const selectBackendSelfTestFn = (backend, direction, row) => {
  if (!isRecord(backend)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      "BSC prover backend must export a native prover self-test",
    );
  }
  const exportName = configuredBackendExportName({
    row,
    aliases: [
      "backendAcceptedSelfTestExport",
      "backend_accepted_self_test_export",
    ],
    acceptedExports:
      BACKEND_SELF_TEST_EXPORTS[direction] ??
      BACKEND_SELF_TEST_EXPORTS.destination,
    label: `${direction} backend accepted self-test export`,
    code: "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
  });
  if (typeof backend[exportName] === "function") {
    return backend[exportName].bind(backend);
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
    `${direction} BSC prover backend does not export configured native prover self-test ${exportName}`,
  );
};

const verifyBackendSelfTestHash = ({
  result,
  expected,
  key,
  aliases,
  label,
}) => {
  const actual = normalizeHex32Word(
    backendAnyField(result, aliases, `${label} ${key}`),
    `${label} ${key}`,
  );
  if (actual !== expected[key]) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} ${key} must match audited native prover self-test material`,
    );
  }
  return actual;
};

const verifyBackendSelfTestPublicSignals = ({ result, expected, label }) => {
  const words = backendAnyField(
    result,
    ["publicSignalWords", "public_signal_words"],
    `${label} publicSignalWords`,
  );
  if (!Array.isArray(words) || words.length !== expected.length) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} publicSignalWords must match audited native prover self-test material`,
    );
  }
  const normalized = words.map((word, index) =>
    normalizeHex32Word(word, `${label} publicSignalWords[${index}]`),
  );
  if (normalized.some((word, index) => word !== expected[index])) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} publicSignalWords must match audited native prover self-test material`,
    );
  }
  return Object.freeze(normalized);
};

const verifyBackendNativeProverSelfTestResult = (result, context) => {
  if (!isRecord(result)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      "BSC prover native self-test result must be an object",
    );
  }
  const label = `${context.direction} BSC prover native self-test result`;
  const sdk = backendStringField(
    result,
    ["sdk", "nativeSdk", "native_sdk"],
    `${label} sdk`,
  );
  if (sdk !== BROWSER_NATIVE_PROVER_SDK) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} sdk must be ${BROWSER_NATIVE_PROVER_SDK}`,
    );
  }
  const implementation = backendStringField(
    result,
    ["implementation", "nativeImplementation", "native_implementation"],
    `${label} implementation`,
  );
  if (implementation !== BROWSER_NATIVE_PROVER_IMPLEMENTATION) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} implementation must be ${BROWSER_NATIVE_PROVER_IMPLEMENTATION}`,
    );
  }
  const implementationHash = normalizeHex32(
    backendAnyField(
      result,
      [
        "implementationHash",
        "implementation_hash",
        "nativeSdkImplementationHash",
        "native_sdk_implementation_hash",
      ],
      `${label} implementationHash`,
    ),
    `${label} implementationHash`,
  );
  if (
    implementationHash !==
    context.nativeSdkImplementationHashes[BROWSER_NATIVE_PROVER_SDK]
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_BACKEND_SELF_TEST",
      `${label} implementationHash must match the audited native SDK implementation`,
    );
  }

  const expected = context.nativeProverSelfTest;
  const hashes = {
    requestHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "requestHash",
      aliases: ["requestHash", "request_hash"],
      label,
    }),
    witnessHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "witnessHash",
      aliases: ["witnessHash", "witness_hash"],
      label,
    }),
    sourceProofHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "sourceProofHash",
      aliases: ["sourceProofHash", "source_proof_hash"],
      label,
    }),
    proofHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "proofHash",
      aliases: ["proofHash", "proof_hash"],
      label,
    }),
    calldataHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "calldataHash",
      aliases: ["calldataHash", "calldata_hash"],
      label,
    }),
    toriiSubmitPayloadHash: verifyBackendSelfTestHash({
      result,
      expected,
      key: "toriiSubmitPayloadHash",
      aliases: ["toriiSubmitPayloadHash", "torii_submit_payload_hash"],
      label,
    }),
  };
  return Object.freeze({
    sdk,
    implementation,
    implementationHash,
    ...hashes,
    publicSignalWords: verifyBackendSelfTestPublicSignals({
      result,
      expected: expected.publicSignalWords,
      label,
    }),
  });
};

const runBackendNativeProverSelfTest = async (selfTest, context, options) => {
  const result = await selfTest(context, options);
  return verifyBackendNativeProverSelfTestResult(result, context);
};

const bytesFromProofResult = (result) => {
  if (!isRecord(result)) {
    return null;
  }
  const value =
    optionalResultField(
      result,
      ["proofBytes", "proof_bytes"],
      "BSC destination prover proofBytes",
    ) ??
    optionalResultField(result, ["proof"], "BSC destination prover proofBytes");
  if (value instanceof Uint8Array) {
    return value;
  }
  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value);
  }
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  return null;
};

const assertGeneratedProofBytesShape = (bytes, label) => {
  const unique = new Set(bytes).size;
  if (unique < 8) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} returned low-variation proofBytes`,
    );
  }
  const repeatedPatternLength = repeatedPrefixPatternLength(bytes);
  if (repeatedPatternLength > 0) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} returned repeated-pattern proofBytes`,
    );
  }
  const arithmeticDelta = constantByteDelta(bytes);
  if (arithmeticDelta !== null) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} returned arithmetic-sequence proofBytes`,
    );
  }
};

const resultField = (record, names, label) => {
  if (!isRecord(record)) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} is missing`);
  }
  let selected = undefined;
  let selectedName = "";
  for (const name of names) {
    if (!hasOwn(record, name)) {
      continue;
    }
    if (selectedName) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_RESULT",
        `${label} must not use multiple aliases: ${selectedName} and ${name}`,
      );
    }
    selected = ownValue(record, name);
    selectedName = name;
  }
  if (!selectedName || selected === undefined || selected === null) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} is missing`);
  }
  return selected;
};

const optionalResultField = (record, names, label) => {
  if (!isRecord(record)) {
    return undefined;
  }
  let selected = undefined;
  let selectedName = "";
  for (const name of names) {
    if (!hasOwn(record, name)) {
      continue;
    }
    if (selectedName) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_RESULT",
        `${label} must not use multiple aliases: ${selectedName} and ${name}`,
      );
    }
    selected = ownValue(record, name);
    selectedName = name;
  }
  return selectedName ? selected : undefined;
};

const resultStringField = (record, names, label) => {
  const value = resultField(record, names, label);
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} is missing`);
};

const optionalResultStringField = (
  record,
  names,
  label = "BSC result field",
) => {
  const value = optionalResultField(record, names, label);
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return "";
};

const resultRecordField = (record, names, label) => {
  const value = resultField(record, names, label);
  if (!isRecord(value)) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} must be an object`);
  }
  return value;
};

const resultSingleAliasRecordField = (record, names, label) => {
  return resultRecordField(record, names, label);
};

const optionalRequestField = (record, names, label) => {
  if (!isRecord(record)) {
    return undefined;
  }
  let selected = undefined;
  let selectedName = "";
  for (const name of names) {
    if (!hasOwn(record, name)) {
      continue;
    }
    if (selectedName) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_REQUEST",
        `${label} must not use multiple aliases: ${selectedName} and ${name}`,
      );
    }
    selected = ownValue(record, name);
    selectedName = name;
  }
  return selectedName ? selected : undefined;
};

const normalizeResultHex32 = (value, label) =>
  normalizeHex32(value, `${label}`);

const normalizeResultAmountBaseUnits = (value, label) => {
  const text = trim(value);
  if (!/^[1-9][0-9]*$/u.test(text)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} must be a positive whole-number base-unit amount`,
    );
  }
  return text;
};

const decimalAmountToBaseUnits = (value, label) => {
  const text = trim(value);
  const match = text.match(/^([0-9]+)(?:\.([0-9]+))?$/u);
  if (!match || match[2]?.length > TAIRA_XOR_DECIMALS) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} must be a TAIRA decimal amount with at most ${TAIRA_XOR_DECIMALS} fractional digits`,
    );
  }
  const whole = match[1].replace(/^0+(?=\d)/u, "");
  const fraction = (match[2] ?? "").padEnd(TAIRA_XOR_DECIMALS, "0");
  const units = `${whole}${fraction}`.replace(/^0+(?=\d)/u, "");
  return normalizeResultAmountBaseUnits(units, `${label} base units`);
};

const expectedSourceAmountBaseUnits = (request) => {
  const explicit = optionalResultStringField(
    request,
    ["amountBaseUnits", "amount_base_units"],
    "BSC source request amountBaseUnits",
  );
  if (explicit) {
    return normalizeResultAmountBaseUnits(
      explicit,
      "BSC source request amount",
    );
  }
  return decimalAmountToBaseUnits(
    resultStringField(
      request,
      ["amountDecimal", "amount_decimal"],
      "BSC source request amountDecimal",
    ),
    "BSC source request amountDecimal",
  );
};

const expectedDestinationBindingHash = (request) => {
  const explicit = optionalResultStringField(
    request,
    ["destinationBindingHash", "destination_binding_hash"],
    "BSC destination request destinationBindingHash",
  );
  if (explicit) {
    return normalizeResultHex32(
      explicit,
      "BSC destination request destinationBindingHash",
    );
  }
  const binding = resultRecordField(
    request,
    ["destinationBinding", "destination_binding"],
    "BSC destination request destinationBinding",
  );
  return normalizeResultHex32(
    resultStringField(
      binding,
      ["bindingHash", "binding_hash"],
      "BSC destination request destinationBinding.bindingHash",
    ),
    "BSC destination request destinationBinding.bindingHash",
  );
};

const requireResultHashMatch = ({
  result,
  resultNames,
  resultLabel,
  expected,
  expectedLabel,
  mismatchMessage,
}) => {
  const actual = normalizeResultHex32(
    resultStringField(result, resultNames, resultLabel),
    resultLabel,
  );
  if (actual !== expected) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${mismatchMessage} must match ${expectedLabel}`,
    );
  }
};

const readTransferPayload = (messageBundle) => {
  const payload = resultRecordField(
    messageBundle,
    ["payload"],
    "BSC source proof package messageBundle.payload",
  );
  const payloadValue = ownValue(payload, "value");
  const payloadTransfer = ownValue(payload, "Transfer");
  if (isRecord(payloadValue) && isRecord(payloadTransfer)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle.payload must not use multiple Transfer aliases",
    );
  }
  if (isRecord(payloadValue)) {
    const kind = optionalResultStringField(
      payload,
      ["kind"],
      "BSC source proof package payload kind",
    );
    if (kind && kind !== "Transfer") {
      fail(
        "ERR_SCCP_BSC_RUNTIME_RESULT",
        "BSC source proof package payload must be a Transfer",
      );
    }
    return payloadValue;
  }
  if (isRecord(payloadTransfer)) {
    return payloadTransfer;
  }
  fail(
    "ERR_SCCP_BSC_RUNTIME_RESULT",
    "BSC source proof package messageBundle.payload must be a Transfer",
  );
};

const assertMessageBundleProofSurfaces = (messageBundle) => {
  const merkleProof = resultRecordField(
    messageBundle,
    ["merkleProof", "merkle_proof"],
    "BSC source proof package messageBundle.merkleProof",
  );
  const merkleSteps = ownValue(merkleProof, "steps");
  if (!Array.isArray(merkleSteps)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle.merkleProof.steps must be an array",
    );
  }
  const steps = merkleSteps.map((step, index) => {
    if (!isRecord(step)) {
      fail(
        "ERR_SCCP_BSC_RUNTIME_RESULT",
        `BSC source proof package messageBundle.merkleProof.steps[${index}] must be an object`,
      );
    }
    const siblingHash = normalizeResultHex32(
      resultStringField(
        step,
        ["sibling_hash", "siblingHash"],
        `BSC source proof package messageBundle.merkleProof.steps[${index}].sibling_hash`,
      ),
      `BSC source proof package messageBundle.merkleProof.steps[${index}].sibling_hash`,
    );
    const side = resultField(
      step,
      ["sibling_is_left", "siblingIsLeft"],
      `BSC source proof package messageBundle.merkleProof.steps[${index}].sibling_is_left`,
    );
    if (typeof side !== "boolean") {
      fail(
        "ERR_SCCP_BSC_RUNTIME_RESULT",
        `BSC source proof package messageBundle.merkleProof.steps[${index}].sibling_is_left must be boolean`,
      );
    }
    return {
      siblingHash,
      siblingIsLeft: side,
    };
  });
  const finalityProof = normalizeHexBytes(
    resultStringField(
      messageBundle,
      ["finalityProof", "finality_proof"],
      "BSC source proof package messageBundle.finalityProof",
    ),
    "BSC source proof package messageBundle.finalityProof",
  );
  return {
    merkleProof: { steps },
    finalityProof,
  };
};

const pushU8 = (out, value) => {
  out.push(value & 0xff);
};

const pushU32Le = (out, value) => {
  for (let index = 0; index < 4; index += 1) {
    out.push((value >> (index * 8)) & 0xff);
  }
};

const pushBigUintLe = (out, value, byteLength) => {
  let next = value;
  for (let index = 0; index < byteLength; index += 1) {
    out.push(Number(next & 0xffn));
    next >>= 8n;
  }
};

const pushVec = (out, bytes) => {
  pushU32Le(out, bytes.byteLength);
  for (const byte of bytes) {
    out.push(byte);
  }
};

const readIntegerField = (record, names, label) => {
  const value = resultField(record, names, label);
  const numberValue =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : Number.NaN;
  if (!Number.isSafeInteger(numberValue)) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} must be an integer`);
  }
  return numberValue;
};

const requireIntegerField = (record, names, label, expected) => {
  const actual = readIntegerField(record, names, label);
  if (actual !== expected) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} must be ${expected}`);
  }
  return actual;
};

const readUnsignedBigIntField = (record, names, label, max) => {
  const value = resultField(record, names, label);
  const text = trim(value);
  if (!/^(?:0|[1-9][0-9]*)$/u.test(text)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} must be an unsigned decimal integer`,
    );
  }
  const bigint = BigInt(text);
  if (bigint > max) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", `${label} is out of range`);
  }
  return bigint;
};

const readCanonicalTextBytesField = (record, names, label) =>
  textEncoder.encode(resultStringField(record, names, label));

const canonicalBscSourceTransferPayloadBytes = (transfer) => {
  requireIntegerField(transfer, ["version"], "BSC source transfer version", 1);
  requireIntegerField(
    transfer,
    ["asset_id_codec", "assetIdCodec"],
    "BSC source transfer asset codec",
    SCCP_CODEC_TEXT_UTF8,
  );
  requireIntegerField(
    transfer,
    ["sender_codec", "senderCodec"],
    "BSC source transfer sender codec",
    SCCP_CODEC_EVM_HEX,
  );
  requireIntegerField(
    transfer,
    ["recipient_codec", "recipientCodec"],
    "BSC source transfer recipient codec",
    SCCP_CODEC_TEXT_UTF8,
  );
  requireIntegerField(
    transfer,
    ["route_id_codec", "routeIdCodec"],
    "BSC source transfer route codec",
    SCCP_CODEC_TEXT_UTF8,
  );
  const sourceDomain = readIntegerField(
    transfer,
    ["source_domain", "sourceDomain"],
    "BSC source proof package transfer source domain",
  );
  const destinationDomain = readIntegerField(
    transfer,
    ["dest_domain", "destDomain", "destination_domain", "destinationDomain"],
    "BSC source proof package transfer destination domain",
  );
  const assetHomeDomain = readIntegerField(
    transfer,
    ["asset_home_domain", "assetHomeDomain"],
    "BSC source proof package transfer asset home domain",
  );
  if (assetHomeDomain !== SCCP_SORA_DOMAIN) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer asset home domain must be TAIRA",
    );
  }
  const out = [];
  pushU8(out, 1);
  pushU32Le(out, sourceDomain);
  pushU32Le(out, destinationDomain);
  pushBigUintLe(
    out,
    readUnsignedBigIntField(
      transfer,
      ["nonce"],
      "BSC source proof package transfer nonce",
      U64_MAX,
    ),
    8,
  );
  pushU32Le(out, assetHomeDomain);
  pushU8(out, SCCP_CODEC_TEXT_UTF8);
  pushVec(
    out,
    readCanonicalTextBytesField(
      transfer,
      ["asset_id", "assetId"],
      "BSC source transfer asset",
    ),
  );
  pushBigUintLe(
    out,
    readUnsignedBigIntField(
      transfer,
      ["amount"],
      "BSC source transfer amount",
      U128_MAX,
    ),
    16,
  );
  pushU8(out, SCCP_CODEC_EVM_HEX);
  pushVec(
    out,
    readCanonicalTextBytesField(
      transfer,
      ["sender"],
      "BSC source transfer sender",
    ),
  );
  pushU8(out, SCCP_CODEC_TEXT_UTF8);
  pushVec(
    out,
    readCanonicalTextBytesField(
      transfer,
      ["recipient"],
      "BSC source transfer recipient",
    ),
  );
  pushU8(out, SCCP_CODEC_TEXT_UTF8);
  pushVec(
    out,
    readCanonicalTextBytesField(
      transfer,
      ["route_id", "routeId"],
      "BSC source transfer route",
    ),
  );
  return Uint8Array.from(out);
};

const canonicalBscSourcePayloadHash = (transfer) =>
  prefixedBlake2b256Hex(
    SCCP_PAYLOAD_HASH_PREFIX,
    concatBytes(
      Uint8Array.from([SCCP_PAYLOAD_TRANSFER_DISCRIMINANT]),
      canonicalBscSourceTransferPayloadBytes(transfer),
    ),
  );

const requireOptionalPayloadHashBinding = ({
  record,
  names,
  label,
  expected,
}) => {
  const value = optionalResultStringField(record, names, label);
  if (!value) {
    return;
  }
  const actual = normalizeResultHex32(value, label);
  if (actual !== expected) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      `${label} must match messageBundle commitment payloadHash`,
    );
  }
};

const requirePublicInputHex32Binding = ({
  publicInputs,
  names,
  label,
  expected,
  mismatchMessage,
}) => {
  const actual = normalizeResultHex32(
    resultStringField(publicInputs, names, label),
    label,
  );
  if (actual !== expected) {
    fail("ERR_SCCP_BSC_RUNTIME_RESULT", mismatchMessage);
  }
};

const canonicalSccpCommitmentBytes = (commitment) => {
  const kind = resultStringField(
    commitment,
    ["kind"],
    "BSC source proof package messageBundle commitment kind",
  );
  if (kind !== "Transfer") {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle commitment kind must be Transfer",
    );
  }
  const out = [];
  pushU8(
    out,
    requireIntegerField(
      commitment,
      ["version"],
      "BSC source proof package messageBundle commitment version",
      1,
    ),
  );
  pushU8(out, 6);
  pushU32Le(
    out,
    readIntegerField(
      commitment,
      ["targetDomain", "target_domain"],
      "BSC source proof package target domain",
    ),
  );
  for (const byte of hex32Bytes(
    resultStringField(
      commitment,
      ["messageId", "message_id"],
      "BSC source proof package messageBundle commitment messageId",
    ),
    "BSC source proof package messageBundle commitment messageId",
  )) {
    out.push(byte);
  }
  for (const byte of hex32Bytes(
    resultStringField(
      commitment,
      ["payloadHash", "payload_hash"],
      "BSC source proof package messageBundle commitment payloadHash",
    ),
    "BSC source proof package messageBundle commitment payloadHash",
  )) {
    out.push(byte);
  }
  return Uint8Array.from(out);
};

const sccpMerkleRootFromCommitment = (commitment, merkleProof) => {
  let current = prefixedBlake2b256Bytes(
    SCCP_HUB_LEAF_PREFIX,
    canonicalSccpCommitmentBytes(commitment),
  );
  for (const [index, step] of merkleProof.steps.entries()) {
    const sibling = hex32Bytes(
      step.siblingHash,
      `BSC source proof package messageBundle.merkleProof.steps[${index}].sibling_hash`,
    );
    current = step.siblingIsLeft
      ? prefixedBlake2b256Bytes(
          SCCP_HUB_NODE_PREFIX,
          concatBytes(sibling, current),
        )
      : prefixedBlake2b256Bytes(
          SCCP_HUB_NODE_PREFIX,
          concatBytes(current, sibling),
        );
  }
  return `0x${hex(current)}`;
};

const verifySourceResult = (result, request) => {
  if (!isRecord(result)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source prover returned no proof package",
    );
  }
  requireResultHashMatch({
    result,
    resultNames: [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
    ],
    resultLabel: "BSC source proof package proofArtifactHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["proofArtifactHash", "proof_artifact_hash"],
        "BSC source request proofArtifactHash",
      ),
      "BSC source request proofArtifactHash",
    ),
    expectedLabel: "the source request",
    mismatchMessage: "BSC source proof package proofArtifactHash",
  });
  requireResultHashMatch({
    result,
    resultNames: ["provingKeyHash", "proving_key_hash"],
    resultLabel: "BSC source proof package provingKeyHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["provingKeyHash", "proving_key_hash"],
        "BSC source request provingKeyHash",
      ),
      "BSC source request provingKeyHash",
    ),
    expectedLabel: "the source request",
    mismatchMessage: "BSC source proof package provingKeyHash",
  });
  requireResultHashMatch({
    result,
    resultNames: ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
    resultLabel: "BSC source proof package nativeEvmProverBundleHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
        "BSC source request nativeEvmProverBundleHash",
      ),
      "BSC source request nativeEvmProverBundleHash",
    ),
    expectedLabel: "the source request",
    mismatchMessage: "BSC source proof package nativeEvmProverBundleHash",
  });
  const requestTxId = normalizeResultHex32(
    resultStringField(
      request,
      ["txId", "tx_id", "transactionHash"],
      "BSC source request txId",
    ),
    "BSC source request txId",
  );
  const resultTxId = normalizeResultHex32(
    resultStringField(
      result,
      ["txId", "tx_id"],
      "BSC source proof package txId",
    ),
    "BSC source proof package txId",
  );
  if (resultTxId !== requestTxId) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package txId must match the source request",
    );
  }
  const expectedAmount = expectedSourceAmountBaseUnits(request);
  const resultAmount = normalizeResultAmountBaseUnits(
    resultStringField(
      result,
      ["amountBaseUnits", "amount_base_units"],
      "BSC source proof package amountBaseUnits",
    ),
    "BSC source proof package amountBaseUnits",
  );
  if (resultAmount !== expectedAmount) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package amountBaseUnits must match the source request",
    );
  }
  const digest = normalizeResultHex32(
    resultStringField(
      result,
      ["sourceEventDigest", "source_event_digest"],
      "BSC source proof package sourceEventDigest",
    ),
    "BSC source proof package sourceEventDigest",
  );
  const expectedDigest = optionalResultStringField(
    request,
    ["sourceEventDigest", "source_event_digest"],
    "BSC source request sourceEventDigest",
  );
  if (
    expectedDigest &&
    digest !==
      normalizeResultHex32(
        expectedDigest,
        "BSC source request sourceEventDigest",
      )
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package sourceEventDigest must match the source request",
    );
  }
  const sender = normalizeAddress(
    resultStringField(
      request,
      ["bscSender", "bsc_sender"],
      "BSC source request sender",
    ),
    "BSC source request sender",
  );
  const recipient = resultStringField(
    request,
    ["tairaRecipient", "taira_recipient"],
    "BSC source request TAIRA recipient",
  );
  const settlement = resultRecordField(
    result,
    ["settlement"],
    "BSC source proof package settlement",
  );
  if (
    resultStringField(
      settlement,
      ["entrypoint"],
      "BSC source settlement entrypoint",
    ) !== "finalize_inbound"
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package settlement entrypoint must be finalize_inbound",
    );
  }
  if (
    resultStringField(
      settlement,
      ["route", "route_id"],
      "BSC source settlement route",
    ) !== ROUTE_ID
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package settlement route must be taira_bsc_xor",
    );
  }
  const messageBundle = resultRecordField(
    result,
    ["messageBundle", "message_bundle"],
    "BSC source proof package messageBundle",
  );
  requireIntegerField(
    messageBundle,
    ["version"],
    "BSC source proof package messageBundle version",
    1,
  );
  const commitmentRoot = normalizeResultHex32(
    resultStringField(
      messageBundle,
      ["commitmentRoot", "commitment_root"],
      "BSC source proof package messageBundle commitmentRoot",
    ),
    "BSC source proof package messageBundle commitmentRoot",
  );
  const resultCommitmentRoot = optionalResultStringField(
    result,
    ["commitmentRoot", "commitment_root"],
    "BSC source proof package commitmentRoot",
  );
  if (
    resultCommitmentRoot &&
    normalizeResultHex32(
      resultCommitmentRoot,
      "BSC source proof package commitmentRoot",
    ) !== commitmentRoot
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package commitmentRoot must match messageBundle commitmentRoot",
    );
  }
  const proofSurfaces = assertMessageBundleProofSurfaces(messageBundle);
  const commitment = resultRecordField(
    messageBundle,
    ["commitment"],
    "BSC source proof package messageBundle.commitment",
  );
  requireIntegerField(
    commitment,
    ["version"],
    "BSC source proof package messageBundle commitment version",
    1,
  );
  if (
    resultStringField(
      commitment,
      ["kind"],
      "BSC source proof package messageBundle commitment kind",
    ) !== "Transfer"
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle commitment kind must be Transfer",
    );
  }
  const resultMessageId = normalizeResultHex32(
    resultStringField(
      result,
      ["messageId", "message_id"],
      "BSC source proof package messageId",
    ),
    "BSC source proof package messageId",
  );
  const commitmentMessageId = normalizeResultHex32(
    resultStringField(
      commitment,
      ["messageId", "message_id"],
      "BSC source proof package messageBundle commitment messageId",
    ),
    "BSC source proof package messageBundle commitment messageId",
  );
  if (resultMessageId !== commitmentMessageId) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageId must match messageBundle commitment",
    );
  }
  const commitmentPayloadHash = normalizeResultHex32(
    resultStringField(
      commitment,
      ["payloadHash", "payload_hash"],
      "BSC source proof package messageBundle commitment payloadHash",
    ),
    "BSC source proof package messageBundle commitment payloadHash",
  );
  requireOptionalPayloadHashBinding({
    record: result,
    names: ["payloadHash", "payload_hash"],
    label: "BSC source proof package payloadHash",
    expected: commitmentPayloadHash,
  });
  const publicInputs = resultSingleAliasRecordField(
    result,
    ["publicInputs", "public_inputs"],
    "BSC source proof package publicInputs",
  );
  requirePublicInputHex32Binding({
    publicInputs,
    names: ["messageId", "message_id"],
    label: "BSC source proof package publicInputs messageId",
    expected: commitmentMessageId,
    mismatchMessage:
      "BSC source proof package publicInputs messageId must match messageBundle commitment",
  });
  requirePublicInputHex32Binding({
    publicInputs,
    names: ["payloadHash", "payload_hash"],
    label: "BSC source proof package publicInputs payloadHash",
    expected: commitmentPayloadHash,
    mismatchMessage:
      "BSC source proof package publicInputs payloadHash must match messageBundle commitment payloadHash",
  });
  requirePublicInputHex32Binding({
    publicInputs,
    names: ["commitmentRoot", "commitment_root"],
    label: "BSC source proof package publicInputs commitmentRoot",
    expected: commitmentRoot,
    mismatchMessage:
      "BSC source proof package publicInputs commitmentRoot must match messageBundle commitmentRoot",
  });
  requirePublicInputHex32Binding({
    publicInputs,
    names: ["txId", "tx_id", "transactionHash"],
    label: "BSC source proof package publicInputs txId",
    expected: resultTxId,
    mismatchMessage:
      "BSC source proof package publicInputs txId must match the source transaction",
  });
  requirePublicInputHex32Binding({
    publicInputs,
    names: ["sourceEventDigest", "source_event_digest"],
    label: "BSC source proof package publicInputs sourceEventDigest",
    expected: digest,
    mismatchMessage:
      "BSC source proof package publicInputs sourceEventDigest must match the source event digest",
  });
  const publicInputSourceDomain = readIntegerField(
    publicInputs,
    ["sourceDomain", "source_domain"],
    "BSC source proof package publicInputs sourceDomain",
  );
  const publicInputTargetDomain = readIntegerField(
    publicInputs,
    ["targetDomain", "target_domain"],
    "BSC source proof package publicInputs targetDomain",
  );
  if (
    publicInputSourceDomain !== SCCP_BSC_DOMAIN ||
    publicInputTargetDomain !== SCCP_SORA_DOMAIN
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package publicInputs must bind BSC -> TAIRA",
    );
  }
  const publicInputAmount = normalizeResultAmountBaseUnits(
    resultStringField(
      publicInputs,
      ["amountBaseUnits", "amount_base_units", "amount"],
      "BSC source proof package publicInputs amount",
    ),
    "BSC source proof package publicInputs amount",
  );
  if (publicInputAmount !== expectedAmount) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package publicInputs amount must match the source request",
    );
  }
  if (
    normalizeAddress(
      resultStringField(
        publicInputs,
        ["sender", "bscSender", "bsc_sender"],
        "BSC source proof package publicInputs sender",
      ),
      "BSC source proof package publicInputs sender",
    ) !== sender
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package publicInputs sender must match the source request",
    );
  }
  if (
    resultStringField(
      publicInputs,
      ["recipient", "tairaRecipient", "taira_recipient"],
      "BSC source proof package publicInputs recipient",
    ) !== recipient
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package publicInputs recipient must match the source request",
    );
  }
  if (
    resultStringField(
      publicInputs,
      ["routeId", "route_id", "route"],
      "BSC source proof package publicInputs route",
    ) !== ROUTE_ID
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package publicInputs route must be taira_bsc_xor",
    );
  }
  if (
    readIntegerField(
      commitment,
      ["targetDomain", "target_domain"],
      "BSC source proof package target domain",
    ) !== SCCP_SORA_DOMAIN
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle must target TAIRA",
    );
  }
  const expectedCommitmentRoot = sccpMerkleRootFromCommitment(
    commitment,
    proofSurfaces.merkleProof,
  );
  if (commitmentRoot !== expectedCommitmentRoot) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle commitmentRoot must match the commitment Merkle proof",
    );
  }
  const transfer = readTransferPayload(messageBundle);
  const sourceDomain = readIntegerField(
    transfer,
    ["source_domain", "sourceDomain"],
    "BSC source proof package transfer source domain",
  );
  const destinationDomain = readIntegerField(
    transfer,
    ["dest_domain", "destDomain", "destination_domain", "destinationDomain"],
    "BSC source proof package transfer destination domain",
  );
  if (
    sourceDomain !== SCCP_BSC_DOMAIN ||
    destinationDomain !== SCCP_SORA_DOMAIN
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer must be BSC -> TAIRA",
    );
  }
  if (
    resultStringField(
      transfer,
      ["asset_id", "assetId"],
      "BSC source transfer asset",
    ) !== ASSET_KEY
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer asset must be XOR",
    );
  }
  if (
    normalizeResultAmountBaseUnits(
      resultStringField(transfer, ["amount"], "BSC source transfer amount"),
      "BSC source transfer amount",
    ) !== expectedAmount
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer amount must match the source request",
    );
  }
  if (
    normalizeAddress(
      resultStringField(transfer, ["sender"], "BSC source transfer sender"),
      "BSC source transfer sender",
    ) !== sender
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer sender must match the source request",
    );
  }
  if (
    resultStringField(
      transfer,
      ["recipient"],
      "BSC source transfer recipient",
    ) !== recipient
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer recipient must match the source request",
    );
  }
  if (
    resultStringField(
      transfer,
      ["route_id", "routeId"],
      "BSC source transfer route",
    ) !== ROUTE_ID
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package transfer route must be taira_bsc_xor",
    );
  }
  const expectedPayloadHash = canonicalBscSourcePayloadHash(transfer);
  if (commitmentPayloadHash !== expectedPayloadHash) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC source proof package messageBundle commitment payloadHash must match the canonical transfer payload",
    );
  }
};

const verifyDestinationResult = (result, request) => {
  if (!isRecord(result)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination prover returned no proof package",
    );
  }
  const proofBytes = bytesFromProofResult(result);
  if (!proofBytes || proofBytes.byteLength < MIN_DESTINATION_PROOF_BYTES) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination prover returned no proofBytes",
    );
  }
  assertGeneratedProofBytesShape(proofBytes, "BSC destination prover");
  if (
    resultStringField(
      result,
      ["routeId", "route_id", "route"],
      "BSC destination proof package route",
    ) !== ROUTE_ID
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination proof package route must be taira_bsc_xor",
    );
  }
  if (
    resultStringField(
      result,
      ["assetKey", "asset_key", "assetId", "asset_id"],
      "BSC destination proof package asset",
    ) !== ASSET_KEY
  ) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination proof package asset must be XOR",
    );
  }
  requireResultHashMatch({
    result,
    resultNames: ["requestHash", "request_hash"],
    resultLabel: "BSC destination proof package requestHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["requestHash", "request_hash"],
        "BSC destination request requestHash",
      ),
      "BSC destination request requestHash",
    ),
    expectedLabel: "the destination request",
    mismatchMessage: "BSC destination proof package requestHash",
  });
  requireResultHashMatch({
    result,
    resultNames: [
      "proofArtifactHash",
      "proof_artifact_hash",
      "proverArtifactHash",
      "prover_artifact_hash",
    ],
    resultLabel: "BSC destination proof package proofArtifactHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["proofArtifactHash", "proof_artifact_hash"],
        "BSC destination request proofArtifactHash",
      ),
      "BSC destination request proofArtifactHash",
    ),
    expectedLabel: "the destination request",
    mismatchMessage: "BSC destination proof package proofArtifactHash",
  });
  requireResultHashMatch({
    result,
    resultNames: ["provingKeyHash", "proving_key_hash"],
    resultLabel: "BSC destination proof package provingKeyHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["provingKeyHash", "proving_key_hash"],
        "BSC destination request provingKeyHash",
      ),
      "BSC destination request provingKeyHash",
    ),
    expectedLabel: "the destination request",
    mismatchMessage: "BSC destination proof package provingKeyHash",
  });
  requireResultHashMatch({
    result,
    resultNames: ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
    resultLabel: "BSC destination proof package nativeEvmProverBundleHash",
    expected: normalizeResultHex32(
      resultStringField(
        request,
        ["nativeEvmProverBundleHash", "native_evm_prover_bundle_hash"],
        "BSC destination request nativeEvmProverBundleHash",
      ),
      "BSC destination request nativeEvmProverBundleHash",
    ),
    expectedLabel: "the destination request",
    mismatchMessage: "BSC destination proof package nativeEvmProverBundleHash",
  });
  requireResultHashMatch({
    result,
    resultNames: ["destinationBindingHash", "destination_binding_hash"],
    resultLabel: "BSC destination proof package destinationBindingHash",
    expected: expectedDestinationBindingHash(request),
    expectedLabel: "the destination request",
    mismatchMessage: "BSC destination proof package destinationBindingHash",
  });
  const resultBinding = resultRecordField(
    result,
    ["destinationBinding", "destination_binding"],
    "BSC destination proof package destinationBinding",
  );
  const requestBinding = resultRecordField(
    request,
    ["destinationBinding", "destination_binding"],
    "BSC destination request destinationBinding",
  );
  const resultVerifier = normalizeAddress(
    resultStringField(
      resultBinding,
      ["verifierAddress", "verifier_address"],
      "BSC destination proof package verifierAddress",
    ),
    "BSC destination proof package verifierAddress",
  );
  const requestVerifier = normalizeAddress(
    resultStringField(
      requestBinding,
      ["verifierAddress", "verifier_address"],
      "BSC destination request verifierAddress",
    ),
    "BSC destination request verifierAddress",
  );
  if (resultVerifier !== requestVerifier) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination proof package verifierAddress must match the destination request",
    );
  }
  const resultBridge = normalizeAddress(
    resultStringField(
      resultBinding,
      ["bridgeAddress", "bridge_address"],
      "BSC destination proof package bridgeAddress",
    ),
    "BSC destination proof package bridgeAddress",
  );
  const requestBridge = normalizeAddress(
    resultStringField(
      requestBinding,
      ["bridgeAddress", "bridge_address"],
      "BSC destination request bridgeAddress",
    ),
    "BSC destination request bridgeAddress",
  );
  if (resultBridge !== requestBridge) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_RESULT",
      "BSC destination proof package bridgeAddress must match the destination request",
    );
  }
};

const buildContext = ({ direction, request, material, config, state }) =>
  Object.freeze({
    direction,
    routeId: ROUTE_ID,
    assetKey: ASSET_KEY,
    tairaChainId: TAIRA_CHAIN_ID,
    tairaNetworkPrefix: TAIRA_NETWORK_PREFIX,
    bscChainIdHex: state.bscProfile.chainIdHex,
    bscNetworkIdHex: state.bscProfile.networkIdHex,
    bscNetwork: state.bscProfile.key,
    bscChain: state.bscProfile.chain,
    request,
    config,
    nativeProverBundle: material.nativeBundle,
    nativeProverBundleBytes: material.nativeBundleBytes.slice(),
    nativeEvmProverBundleDescriptor: material.nativeEvmProverBundleDescriptor,
    nativeEvmProverBundleHash: material.nativeEvmProverBundleHash,
    nativeProverArtifactBaseUrl:
      material.nativeArtifacts.nativeProverArtifactBaseUrl,
    nativeProverVerifiedSdks: material.nativeArtifacts.nativeProverVerifiedSdks,
    proofArtifactBytes: material.proofArtifactBytes,
    provingKeyBytes: material.provingKeyBytes,
    verifierKeyBytes: material.verifierKeyBytes.slice(),
    crossSdkParityBytes: material.nativeArtifacts.crossSdkParityBytes.slice(),
    crossSdkParity: material.nativeArtifacts.crossSdkParity,
    nativeProverSelfTestBytes:
      material.nativeArtifacts.nativeProverSelfTestBytes.slice(),
    nativeProverSelfTest: material.nativeArtifacts.nativeProverSelfTest,
    nativeSdkImplementationBytes: Object.freeze(
      Object.fromEntries(
        Object.entries(
          material.nativeArtifacts.nativeSdkImplementationBytes,
        ).map(([sdk, bytes]) => [sdk, bytes.slice()]),
      ),
    ),
    nativeSdkImplementationHashes:
      material.nativeArtifacts.nativeSdkImplementationHashes,
    crossSdkParityHash: material.nativeArtifacts.crossSdkParityHash,
    nativeProverSelfTestHash: material.nativeArtifacts.nativeProverSelfTestHash,
    proofArtifactHash: material.proofArtifactHash,
    provingKeyHash: material.provingKeyHash,
    verifierKeyHash: material.verifierKeyHash,
    verifierKeyArtifactHash: material.verifierKeyArtifactHash,
    backendAcceptedExport: strictConfigStringField(
      config,
      ["backendAcceptedExport", "backend_accepted_export"],
      `${direction} backend accepted export`,
    ),
    backendAcceptedSelfTestExport: strictConfigStringField(
      config,
      ["backendAcceptedSelfTestExport", "backend_accepted_self_test_export"],
      `${direction} backend accepted self-test export`,
    ),
  });

const withRuntime = async (direction, request, options = {}) => {
  if (!isRecord(request)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_REQUEST",
      "BSC proof request must be a plain object",
    );
  }
  const proofRequest = ownJsonValue(request);
  const state = await readConfig();
  const row = state.directionRows[direction];
  const destinationBinding = optionalRequestField(
    proofRequest,
    ["destinationBinding", "destination_binding"],
    "BSC destination request destinationBinding",
  );
  if (direction === "destination" && isRecord(destinationBinding)) {
    normalizeAddress(
      ownValue(destinationBinding, "verifierAddress"),
      "verifierAddress",
    );
    normalizeAddress(
      ownValue(destinationBinding, "bridgeAddress"),
      "bridgeAddress",
    );
  }
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
  if (!isRecord(request)) {
    fail(
      "ERR_SCCP_BSC_RUNTIME_REQUEST",
      "BSC proof request must be a plain object",
    );
  }
  const proofRequest = ownJsonValue(request);
  const state = await readConfig();
  const row = state.directionRows[direction];
  const destinationBinding = optionalRequestField(
    proofRequest,
    ["destinationBinding", "destination_binding"],
    "BSC destination request destinationBinding",
  );
  if (direction === "destination" && isRecord(destinationBinding)) {
    normalizeAddress(
      ownValue(destinationBinding, "verifierAddress"),
      "verifierAddress",
    );
    normalizeAddress(
      ownValue(destinationBinding, "bridgeAddress"),
      "bridgeAddress",
    );
  }
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

export async function bscSccpProve(request, options = {}) {
  const result = await withRuntime("destination", request, options);
  verifyDestinationResult(result, request);
  return result;
}

export async function bscSccpNativeProverSelfTest(request, options = {}) {
  return withRuntimeSelfTest("destination", request, options);
}

export const irohaSccpBscNativeProverSelfTest = bscSccpNativeProverSelfTest;
export const evmSccpNativeProverSelfTest = bscSccpNativeProverSelfTest;
export const nativeProverSelfTest = bscSccpNativeProverSelfTest;

export const irohaSccpBscProve = bscSccpProve;
export const evmSccpProve = bscSccpProve;
export const proveBsc = bscSccpProve;

export async function bscSccpSourceProve(input, options = {}) {
  const result = await withRuntime("source", input, options);
  verifySourceResult(result, input);
  return result;
}

export async function bscSccpSourceNativeProverSelfTest(input, options = {}) {
  return withRuntimeSelfTest("source", input, options);
}

export const irohaSccpBscSourceNativeProverSelfTest =
  bscSccpSourceNativeProverSelfTest;
export const nativeProverSourceSelfTest = bscSccpSourceNativeProverSelfTest;

export const irohaSccpBscSourceProve = bscSccpSourceProve;
export const proveBscSource = bscSccpSourceProve;

export default bscSccpProve;
