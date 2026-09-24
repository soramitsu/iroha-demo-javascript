import {
  buildKaigiInviteHashRoute,
  parseKaigiInviteDeepLink,
} from "../src/utils/kaigiInvite";

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
