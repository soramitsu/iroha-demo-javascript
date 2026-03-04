const normalizeConfidentialMode = (value: string | null | undefined): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

export const confidentialModeSupportsShield = (
  mode: string | null | undefined,
): boolean => {
  const normalized = normalizeConfidentialMode(mode);
  return (
    normalized === "shieldedonly" ||
    normalized === "convertible" ||
    normalized === "hybrid" ||
    normalized === "zknative"
  );
};

export const isPositiveWholeAmount = (
  value: string | number | null | undefined,
): boolean => {
  const normalized = String(value ?? "").trim();
  return /^\d+$/.test(normalized) && !/^0+$/.test(normalized);
};
