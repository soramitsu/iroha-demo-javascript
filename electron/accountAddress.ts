import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  AccountAddress,
  encodeI105AccountAddress,
  normalizeAccountId as normalizeSdkAccountId,
} from "@iroha/iroha-js";

const SORA_NETWORK_PREFIX = 753;
const DEFAULT_NETWORK_PREFIX = SORA_NETWORK_PREFIX;
const HEX_RE = /^[0-9a-fA-F]+$/;

type NativeAccountAddressParseResult = {
  canonicalBytes?: Uint8Array;
  canonical_bytes?: Uint8Array;
  networkPrefix?: number;
  network_prefix?: number;
};

type NativeAccountAddressRenderResult = {
  i105?: string;
  i105Default?: string;
  i105DefaultFullwidth?: string;
};

type NativeAccountAddressCodec = {
  accountAddressParseEncoded: (
    input: string,
    expectedPrefix: number | null,
  ) => NativeAccountAddressParseResult | null;
  accountAddressRender: (
    canonicalBytes: Uint8Array,
    networkPrefix: number,
  ) => NativeAccountAddressRenderResult | null;
};

const trimString = (value: unknown): string => String(value ?? "").trim();

// Torii surfaces may hand back I105 account IDs as UTF-8 full-width kana,
// while the current JS/native codec accepts the canonical half-width alphabet.
const I105_FULLWIDTH_TO_CANONICAL_KANA: Record<string, string> = {
  イ: "ｲ",
  ロ: "ﾛ",
  ハ: "ﾊ",
  ニ: "ﾆ",
  ホ: "ﾎ",
  ヘ: "ﾍ",
  ト: "ﾄ",
  チ: "ﾁ",
  リ: "ﾘ",
  ヌ: "ﾇ",
  ル: "ﾙ",
  ヲ: "ｦ",
  ワ: "ﾜ",
  カ: "ｶ",
  ヨ: "ﾖ",
  タ: "ﾀ",
  レ: "ﾚ",
  ソ: "ｿ",
  ツ: "ﾂ",
  ネ: "ﾈ",
  ナ: "ﾅ",
  ラ: "ﾗ",
  ム: "ﾑ",
  ウ: "ｳ",
  ノ: "ﾉ",
  オ: "ｵ",
  ク: "ｸ",
  ヤ: "ﾔ",
  マ: "ﾏ",
  ケ: "ｹ",
  フ: "ﾌ",
  コ: "ｺ",
  エ: "ｴ",
  テ: "ﾃ",
  ア: "ｱ",
  サ: "ｻ",
  キ: "ｷ",
  ユ: "ﾕ",
  メ: "ﾒ",
  ミ: "ﾐ",
  シ: "ｼ",
  ヒ: "ﾋ",
  モ: "ﾓ",
  セ: "ｾ",
  ス: "ｽ",
};

const normalizeI105KanaVariants = (literal: string): string =>
  Array.from(literal, (character) => {
    return I105_FULLWIDTH_TO_CANONICAL_KANA[character] ?? character;
  }).join("");

const normalizeAccountLiteralInput = (value: unknown): string =>
  normalizeI105KanaVariants(trimString(value));

const normalizeNetworkPrefix = (value?: number): number => {
  if (value === undefined) {
    return DEFAULT_NETWORK_PREFIX;
  }
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0x3fff) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return normalized;
};

const hexToBuffer = (value: string, label: string): Buffer => {
  const trimmed = trimString(value);
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  if (trimmed.length % 2 !== 0 || !HEX_RE.test(trimmed)) {
    throw new Error(`${label} must be an even-length hex string.`);
  }
  return Buffer.from(trimmed, "hex");
};

const resolveSdkPackageDirectory = (): string | null => {
  try {
    const pkgEntryUrl = (
      import.meta as ImportMeta & {
        resolve?: (specifier: string) => string;
      }
    ).resolve?.("@iroha/iroha-js");
    if (!pkgEntryUrl) {
      return null;
    }
    return path.resolve(path.dirname(fileURLToPath(pkgEntryUrl)), "..");
  } catch {
    return null;
  }
};

const loadNativeAccountAddressCodec = (): NativeAccountAddressCodec | null => {
  try {
    const packageDirectory = resolveSdkPackageDirectory();
    if (!packageDirectory) {
      return null;
    }
    const require = createRequire(import.meta.url);
    const binding = require(
      path.join(packageDirectory, "native", "iroha_js_host.node"),
    ) as Partial<NativeAccountAddressCodec>;
    if (
      typeof binding.accountAddressParseEncoded !== "function" ||
      typeof binding.accountAddressRender !== "function"
    ) {
      return null;
    }
    return {
      accountAddressParseEncoded: binding.accountAddressParseEncoded,
      accountAddressRender: binding.accountAddressRender,
    };
  } catch {
    return null;
  }
};

const nativeAccountAddressCodec = loadNativeAccountAddressCodec();

const detectNativeLiteralPrefix = (literal: string): number | null => {
  if (literal.startsWith("sorau") || literal.startsWith("ｓｏｒａu")) {
    return SORA_NETWORK_PREFIX;
  }
  if (literal.startsWith("testu")) {
    return 369;
  }
  const match = /^n(\d{1,4})u/.exec(literal);
  if (!match) {
    return null;
  }
  const parsed = Number(match[1]);
  return Number.isInteger(parsed) ? parsed : null;
};

const uniquePrefixes = (values: Array<number | null | undefined>): number[] => {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const value of values) {
    if (typeof value !== "number" || !Number.isInteger(value)) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    out.push(value);
  }
  return out;
};

const parseNativeAccountLiteral = (
  literal: string,
  networkPrefix: number,
): { canonicalBytes: Uint8Array; networkPrefix: number } | null => {
  if (!nativeAccountAddressCodec) {
    return null;
  }
  const attempts = uniquePrefixes([
    detectNativeLiteralPrefix(literal),
    networkPrefix,
    SORA_NETWORK_PREFIX,
  ]);

  for (const expectedPrefix of attempts) {
    try {
      const parsed = nativeAccountAddressCodec.accountAddressParseEncoded(
        literal,
        expectedPrefix,
      );
      const canonicalBytes = parsed?.canonicalBytes ?? parsed?.canonical_bytes;
      if (!canonicalBytes || !canonicalBytes.length) {
        continue;
      }
      const detectedPrefix =
        parsed?.networkPrefix ?? parsed?.network_prefix ?? expectedPrefix;
      return {
        canonicalBytes: Uint8Array.from(canonicalBytes),
        networkPrefix: detectedPrefix,
      };
    } catch {
      continue;
    }
  }

  return null;
};

const renderNativeAccountLiteral = (
  canonicalBytes: Uint8Array,
  networkPrefix: number,
) => {
  if (!nativeAccountAddressCodec) {
    return null;
  }
  try {
    const rendered = nativeAccountAddressCodec.accountAddressRender(
      canonicalBytes,
      networkPrefix,
    );
    if (!rendered?.i105 || !rendered.i105Default) {
      return null;
    }
    return rendered;
  } catch {
    return null;
  }
};

const normalizeCompatLiteralFromAddress = (
  address: InstanceType<typeof AccountAddress>,
  networkPrefix: number,
) =>
  encodeI105AccountAddress(address.canonicalBytes(), {
    chainDiscriminant: networkPrefix,
  });

const normalizeCanonicalLiteralFromAddress = (
  address: InstanceType<typeof AccountAddress>,
  networkPrefix: number,
) => normalizeCompatLiteralFromAddress(address, networkPrefix);

const fallbackCompatLiteral = (
  literal: string,
  label: string,
  networkPrefix: number,
) => {
  const normalizedLiteral = normalizeSdkAccountId(literal, label);
  const parsed = AccountAddress.parseEncoded(normalizedLiteral);
  return normalizeCompatLiteralFromAddress(parsed.address, networkPrefix);
};

const fallbackCanonicalLiteral = (
  literal: string,
  label: string,
  networkPrefix: number,
) => {
  const normalizedLiteral = normalizeSdkAccountId(literal, label);
  const parsed = AccountAddress.parseEncoded(normalizedLiteral);
  return normalizeCanonicalLiteralFromAddress(parsed.address, networkPrefix);
};

export const normalizeCompatAccountIdLiteral = (
  value: string,
  label: string,
  networkPrefix?: number,
) => {
  const literal = normalizeAccountLiteralInput(value);
  if (!literal) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const detectedPrefix = detectNativeLiteralPrefix(literal);
  const normalizedPrefix = normalizeNetworkPrefix(
    networkPrefix ?? detectedPrefix ?? DEFAULT_NETWORK_PREFIX,
  );

  try {
    const parsed = AccountAddress.parseEncoded(literal);
    return normalizeCompatLiteralFromAddress(parsed.address, normalizedPrefix);
  } catch {
    // Fall through to native I105 parsing or legacy SDK normalization.
  }

  const nativeParsed = parseNativeAccountLiteral(literal, normalizedPrefix);
  if (nativeParsed) {
    return normalizeCompatLiteralFromAddress(
      AccountAddress.fromCanonicalBytes(nativeParsed.canonicalBytes),
      normalizedPrefix,
    );
  }

  return fallbackCompatLiteral(literal, label, normalizedPrefix);
};

export const normalizeCanonicalAccountIdLiteral = (
  value: string,
  label: string,
  networkPrefix?: number,
) => {
  const literal = normalizeAccountLiteralInput(value);
  if (!literal) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const detectedPrefix = detectNativeLiteralPrefix(literal);
  const normalizedPrefix = normalizeNetworkPrefix(
    networkPrefix ?? detectedPrefix ?? DEFAULT_NETWORK_PREFIX,
  );

  try {
    const parsed = AccountAddress.parseEncoded(literal);
    return normalizeCanonicalLiteralFromAddress(
      parsed.address,
      normalizedPrefix,
    );
  } catch {
    // Fall through to native I105 parsing or legacy SDK normalization.
  }

  const nativeParsed = parseNativeAccountLiteral(literal, normalizedPrefix);
  if (nativeParsed) {
    return normalizeCanonicalLiteralFromAddress(
      AccountAddress.fromCanonicalBytes(nativeParsed.canonicalBytes),
      normalizedPrefix,
    );
  }

  return fallbackCanonicalLiteral(literal, label, normalizedPrefix);
};

export const parseAccountAddressLiteral = (
  value: string,
  label: string,
  networkPrefix = DEFAULT_NETWORK_PREFIX,
) => {
  const literal = normalizeAccountLiteralInput(value);
  if (!literal) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  const normalizedPrefix = normalizeNetworkPrefix(networkPrefix);

  try {
    return AccountAddress.parseEncoded(literal).address;
  } catch {
    // Fall through to native I105 parsing or legacy SDK normalization.
  }

  const nativeParsed = parseNativeAccountLiteral(literal, normalizedPrefix);
  if (nativeParsed) {
    return AccountAddress.fromCanonicalBytes(nativeParsed.canonicalBytes);
  }

  const normalizedLiteral = normalizeSdkAccountId(literal, label);
  return AccountAddress.parseEncoded(normalizedLiteral).address;
};

export const deriveAccountAddressView = (input: {
  domain: string;
  publicKeyHex: string;
  networkPrefix?: number;
}) => {
  const networkPrefix = normalizeNetworkPrefix(input.networkPrefix);
  const publicKey = hexToBuffer(input.publicKeyHex, "publicKeyHex");
  // Modern account addresses are signatory-only; keep `domain` on the input
  // for compatibility with stored profile metadata and onboarding UX.
  void trimString(input.domain);
  const address = AccountAddress.fromAccount({ publicKey });
  const canonicalBytes = Uint8Array.from(address.canonicalBytes());
  const compatAccountId = normalizeCompatLiteralFromAddress(
    address,
    networkPrefix,
  );
  const nativeRendering = renderNativeAccountLiteral(
    canonicalBytes,
    networkPrefix,
  );

  return {
    accountId: compatAccountId,
    i105AccountId: normalizeCanonicalLiteralFromAddress(address, networkPrefix),
    i105DefaultAccountId: normalizeCanonicalLiteralFromAddress(
      address,
      SORA_NETWORK_PREFIX,
    ),
    i105DefaultFullwidthAccountId: nativeRendering?.i105DefaultFullwidth ?? "",
    publicKeyHex: publicKey.toString("hex").toUpperCase(),
    accountIdWarning: nativeRendering
      ? ""
      : "Native I105 rendering is unavailable; using canonical JS I105 rendering.",
  };
};
