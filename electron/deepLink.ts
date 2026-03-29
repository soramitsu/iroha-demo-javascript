export const KAIGI_PROTOCOL = "iroha:";

const trimString = (value: unknown): string => String(value ?? "").trim();

export const buildKaigiHashRoute = (inviteToken: string): string =>
  `/kaigi?invite=${encodeURIComponent(trimString(inviteToken))}`;

export const parseKaigiDeepLinkToHashRoute = (
  input: string,
): string | null => {
  const raw = trimString(input);
  if (!raw) {
    return null;
  }
  try {
    const url = new URL(raw);
    if (url.protocol !== KAIGI_PROTOCOL) {
      return null;
    }
    if (url.hostname !== "kaigi") {
      return null;
    }
    const path = url.pathname.replace(/^\/+/, "");
    if (path !== "join") {
      return null;
    }
    const inviteToken = trimString(url.searchParams.get("invite"));
    if (!inviteToken) {
      return null;
    }
    return buildKaigiHashRoute(inviteToken);
  } catch (_error) {
    return null;
  }
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
