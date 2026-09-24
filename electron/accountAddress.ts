import { AccountAddress } from "@iroha/iroha-js/address";
import {
  normalizeCryptoAlgorithm,
  type CryptoAlgorithm,
} from "@iroha/iroha-js/crypto";
import { DEFAULT_SIGNING_ALGORITHM } from "../src/utils/signingAlgorithms";
import { getInstalledIrohaJsNativeBinding } from "./irohaJsNativeDir";
import { FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES } from "./firstReleaseResourceLimits";

const SORA_NETWORK_PREFIX = 753;
const LOCAL_DOMAIN_LABEL_MAX_BYTES = 256;
const HEX_RE = /^[0-9a-fA-F]+$/;

type NativeAccountAddressRenderResult = {
  i105?: string;
  i105Default?: string;
  i105DefaultFullwidth?: string;
};

type NativeAccountAddressCodec = {
  accountAddressRender: (
    canonicalBytes: Uint8Array,
    networkPrefix: number,
  ) => NativeAccountAddressRenderResult | null;
};

const trimString = (value: unknown): string => String(value ?? "").trim();

const requireBoundedLocalDomainLabel = (value: unknown): void => {
  if (
    typeof value !== "string" ||
    value.trim() !== value ||
    Buffer.byteLength(value, "utf8") > LOCAL_DOMAIN_LABEL_MAX_BYTES ||
    Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  ) {
    throw new Error("domain must be bounded canonical local-profile text.");
  }
};

const normalizeNetworkPrefix = (value: number): number => {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized < 0 || normalized > 0x3fff) {
    throw new Error("networkPrefix must be an integer between 0 and 16383.");
  }
  return normalized;
};

const hexToBuffer = (value: string, label: string): Buffer => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} is required.`);
  }
  if (
    value.length > FIRST_RELEASE_CRYPTO_KEY_MATERIAL_MAX_BYTES * 2 ||
    value.trim() !== value ||
    value.length % 2 !== 0 ||
    !HEX_RE.test(value)
  ) {
    throw new Error(`${label} must be bounded canonical even-length hex.`);
  }
  return Buffer.from(value, "hex");
};

const resolveInstalledNativeAccountAddressCodec =
  (): NativeAccountAddressCodec | null => {
    const binding = getInstalledIrohaJsNativeBinding();
    if (
      binding === null ||
      typeof binding.accountAddressRender !== "function"
    ) {
      return null;
    }
    return {
      accountAddressRender:
        binding.accountAddressRender as NativeAccountAddressCodec["accountAddressRender"],
    };
  };

const renderNativeAccountLiteral = (
  canonicalBytes: Uint8Array,
  networkPrefix: number,
) => {
  const nativeAccountAddressCodec = resolveInstalledNativeAccountAddressCodec();
  if (nativeAccountAddressCodec === null) {
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

const renderCanonicalAccountId = (
  address: InstanceType<typeof AccountAddress>,
  networkPrefix: number,
) => address.toI105(networkPrefix);

const parseCanonicalAccountId = (
  value: unknown,
  label: string,
  networkPrefix: number,
): {
  address: InstanceType<typeof AccountAddress>;
  literal: string;
} => {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  if (value !== value.trim()) {
    throw new Error(
      `${label} must be a canonical I105 account ID without surrounding whitespace.`,
    );
  }

  let address: InstanceType<typeof AccountAddress>;
  try {
    address = AccountAddress.parseEncoded(value, networkPrefix).address;
  } catch {
    throw new Error(
      `${label} must be a canonical I105 account ID for network prefix ${networkPrefix}.`,
    );
  }

  const literal = renderCanonicalAccountId(address, networkPrefix);
  if (value !== literal) {
    throw new Error(
      `${label} must exactly match its canonical I105 rendering for network prefix ${networkPrefix}.`,
    );
  }

  return { address, literal };
};

export const normalizeCanonicalAccountIdLiteral = (
  value: string,
  label: string,
  networkPrefix: number,
) => {
  const normalizedPrefix = normalizeNetworkPrefix(networkPrefix);
  return parseCanonicalAccountId(value, label, normalizedPrefix).literal;
};

export const requireAccountIdBoundToPublicKey = (input: {
  accountId: string;
  publicKeyHex: string;
  networkPrefix: number;
  signingAlgorithm: string;
}): string => {
  const accountId = normalizeCanonicalAccountIdLiteral(
    input.accountId,
    "accountId",
    input.networkPrefix,
  );
  const derivedAccountId = deriveAccountAddressView({
    domain: "",
    publicKeyHex: input.publicKeyHex,
    networkPrefix: input.networkPrefix,
    signingAlgorithm: input.signingAlgorithm,
  }).accountId;
  if (accountId !== derivedAccountId) {
    throw new Error(
      "accountId does not match the supplied signing key and algorithm.",
    );
  }
  return accountId;
};

export const parseAccountAddressLiteral = (
  value: string,
  label: string,
  networkPrefix: number,
) => {
  const normalizedPrefix = normalizeNetworkPrefix(networkPrefix);
  return parseCanonicalAccountId(value, label, normalizedPrefix).address;
};

export const deriveAccountAddressView = (input: {
  domain: string;
  publicKeyHex: string;
  networkPrefix: number;
  signingAlgorithm?: string;
}) => {
  requireBoundedLocalDomainLabel(input.domain);
  const networkPrefix = normalizeNetworkPrefix(input.networkPrefix);
  const publicKey = hexToBuffer(input.publicKeyHex, "publicKeyHex");
  const signingAlgorithm: CryptoAlgorithm = normalizeCryptoAlgorithm(
    trimString(input.signingAlgorithm) || DEFAULT_SIGNING_ALGORITHM,
  );
  // Modern account addresses are signatory-only. The domain remains local
  // profile metadata and never participates in address derivation.
  const address = AccountAddress.fromAccount({
    publicKey,
    algorithm: signingAlgorithm,
  });
  const canonicalBytes = Uint8Array.from(address.canonicalBytes());
  const canonicalAccountId = renderCanonicalAccountId(address, networkPrefix);
  const nativeRendering = renderNativeAccountLiteral(
    canonicalBytes,
    networkPrefix,
  );

  return {
    accountId: canonicalAccountId,
    i105AccountId: canonicalAccountId,
    i105DefaultAccountId: renderCanonicalAccountId(
      address,
      SORA_NETWORK_PREFIX,
    ),
    i105DefaultFullwidthAccountId: nativeRendering?.i105DefaultFullwidth ?? "",
    publicKeyHex: publicKey.toString("hex").toUpperCase(),
    signingAlgorithm,
    accountIdWarning: nativeRendering
      ? ""
      : "Native I105 rendering is unavailable; using canonical JS I105 rendering.",
  };
};
