import {
  buildKaigiInviteHashRoute,
  parseKaigiInviteDeepLink,
} from "../src/utils/kaigiInvite";

export const parseKaigiDeepLinkToHashRoute = (input: string): string | null => {
  const invite = parseKaigiInviteDeepLink(input);
  return invite ? buildKaigiInviteHashRoute(invite) : null;
};

export const extractKaigiDeepLinkFromArgv = (
  argv: readonly string[],
): string | null => {
  for (const value of argv) {
    const route = parseKaigiDeepLinkToHashRoute(value);
    if (route) {
      return route;
    }
  }
  return null;
};
