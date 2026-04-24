const SUPPORTED_ENDPOINT_PROTOCOLS = new Set(["http:", "https:"]);

export const normalizeEndpointUrl = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Enter a Torii endpoint URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (_error) {
    throw new Error("Enter a valid Torii endpoint URL.");
  }

  if (!SUPPORTED_ENDPOINT_PROTOCOLS.has(parsed.protocol)) {
    throw new Error("Endpoint must start with http:// or https://.");
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed.toString().replace(/\/+$/, "");
};

export const resolveEndpointUrl = (
  value: unknown,
  fallback: string,
): string => {
  try {
    return normalizeEndpointUrl(String(value ?? ""));
  } catch (_error) {
    return normalizeEndpointUrl(fallback);
  }
};
