import type { ToriiClient } from "@iroha/iroha-js";

export type ExplorerAccountQrResponse = Awaited<
  ReturnType<ToriiClient["getExplorerAccountQr"]>
>;

export const normalizeBaseUrl = (url: string) => {
  const trimmed = url.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("http")) {
    throw new Error("Torii URL must include http or https scheme");
  }
  return trimmed;
};

export const normalizeExplorerAccountQrPayload = (
  payload: Record<string, unknown>,
): ExplorerAccountQrResponse => {
  const canonicalId = String(payload.canonicalId ?? payload.canonical_id ?? "");
  const literal = String(payload.literal ?? "");
  const addressFormat = String(
    payload.addressFormat ?? payload.address_format ?? "ih58",
  ) as ExplorerAccountQrResponse["addressFormat"];
  const networkPrefix = Number(
    payload.networkPrefix ?? payload.network_prefix ?? 0,
  );
  const errorCorrection = String(
    payload.errorCorrection ?? payload.error_correction ?? "",
  );
  const modules = Number(payload.modules ?? 0);
  const qrVersion = Number(payload.qrVersion ?? payload.qr_version ?? 0);
  const svg = String(payload.svg ?? "");

  if (!canonicalId || !literal || !svg) {
    throw new Error("Explorer QR response was missing required fields.");
  }

  return {
    canonicalId,
    literal,
    addressFormat,
    networkPrefix,
    errorCorrection,
    modules,
    qrVersion,
    svg,
  };
};

export const sanitizeFetchHeaders = (
  headers: unknown,
): HeadersInit | undefined => {
  if (!headers) return undefined;

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    return Array.from(headers.entries());
  }

  if (Array.isArray(headers)) {
    return headers
      .filter(
        (entry): entry is [unknown, unknown] =>
          Array.isArray(entry) && entry.length >= 2,
      )
      .map(([key, value]) => [String(key), String(value)]);
  }

  if (typeof headers === "object") {
    const normalized: Record<string, string> = {};
    for (const [key, value] of Object.entries(
      headers as Record<string, unknown>,
    )) {
      if (value === undefined || value === null) continue;
      normalized[key] = String(value);
    }
    return normalized;
  }

  return undefined;
};

export const sanitizeFetchInit = (
  init?: Parameters<typeof fetch>[1],
): Parameters<typeof fetch>[1] | undefined => {
  if (!init) return init;
  const headers = sanitizeFetchHeaders((init as { headers?: unknown }).headers);
  if (!headers) return init;
  return {
    ...init,
    headers,
  };
};
