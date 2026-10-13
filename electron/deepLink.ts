import {
  buildKaigiInviteHashRoute,
  parseKaigiInviteDeepLink,
} from "../src/utils/kaigiInvite";
import { parseIrohaConnectUri } from "../src/utils/irohaConnect";

export const KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES = 128;
export const KAIGI_DEEP_LINK_ARGV_MAX_CHARACTERS = 64 * 1024;

export const parseKaigiDeepLinkToHashRoute = (input: string): string | null => {
  const invite = parseKaigiInviteDeepLink(input);
  return invite ? buildKaigiInviteHashRoute(invite) : null;
};

export const extractKaigiDeepLinkFromArgv = (
  argv: readonly string[],
): string | null => {
  if (!Array.isArray(argv) || argv.length > KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES) {
    return null;
  }
  let totalCharacters = 0;
  let matchedRoute: string | null = null;
  for (const value of argv) {
    if (typeof value !== "string") {
      return null;
    }
    totalCharacters += value.length;
    if (totalCharacters > KAIGI_DEEP_LINK_ARGV_MAX_CHARACTERS) {
      return null;
    }
    const route = parseKaigiDeepLinkToHashRoute(value);
    if (route) {
      if (matchedRoute !== null) {
        return null;
      }
      matchedRoute = route;
    }
  }
  return matchedRoute;
};

/**
 * Validate an `iroha://connect?...` wallet-role pairing link with exactly the
 * same rules as a scanned QR and return its canonical form, or null.
 */
export const parseIrohaConnectDeepLink = (input: string): string | null => {
  if (typeof input !== "string" || !/^iroha:\/\/connect\?/u.test(input)) {
    return null;
  }
  try {
    return parseIrohaConnectUri(input).canonicalUri;
  } catch {
    return null;
  }
};

export type WalletDeepLink =
  | { kind: "kaigi"; hashRoute: string }
  | { kind: "connect"; uri: string };

/** Route one `iroha://` URL to the Kaigi or IrohaConnect handler. */
export const parseWalletDeepLink = (input: string): WalletDeepLink | null => {
  const hashRoute = parseKaigiDeepLinkToHashRoute(input);
  if (hashRoute) {
    return { kind: "kaigi", hashRoute };
  }
  const uri = parseIrohaConnectDeepLink(input);
  return uri ? { kind: "connect", uri } : null;
};

/** Find the only IrohaConnect pairing link in a launch/second-instance argv. */
export const extractIrohaConnectDeepLinkFromArgv = (
  argv: readonly string[],
): string | null => {
  if (!Array.isArray(argv) || argv.length > KAIGI_DEEP_LINK_ARGV_MAX_ENTRIES) {
    return null;
  }
  let totalCharacters = 0;
  let matched: string | null = null;
  for (const value of argv) {
    if (typeof value !== "string") {
      return null;
    }
    totalCharacters += value.length;
    if (totalCharacters > KAIGI_DEEP_LINK_ARGV_MAX_CHARACTERS) {
      return null;
    }
    const uri = parseIrohaConnectDeepLink(value);
    if (uri) {
      if (matched !== null) {
        return null;
      }
      matched = uri;
    }
  }
  return matched;
};
