export const KAIGI_PROTOCOL = "iroha:";

const trimString = (value: unknown): string => String(value ?? "").trim();

type KaigiRouteQuery =
  | {
      invite: string;
    }
  | {
      call: string;
      secret: string;
    };

const buildKaigiQueryString = (query: KaigiRouteQuery): string => {
  const params = new URLSearchParams();
  if ("invite" in query) {
    params.set("invite", trimString(query.invite));
  } else {
    params.set("call", trimString(query.call));
    params.set("secret", trimString(query.secret));
  }
  return params.toString();
};

export const buildKaigiHashRoute = (query: KaigiRouteQuery): string =>
  `/kaigi?${buildKaigiQueryString(query)}`;

export const parseKaigiDeepLinkToHashRoute = (input: string): string | null => {
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
    if (inviteToken) {
      return buildKaigiHashRoute({ invite: inviteToken });
    }
    const callId = trimString(url.searchParams.get("call"));
    const secret = trimString(url.searchParams.get("secret"));
    if (!callId || !secret) {
      return null;
    }
    return buildKaigiHashRoute({ call: callId, secret });
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
