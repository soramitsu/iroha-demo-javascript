import { defineStore } from "pinia";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";

export const THEME_STORAGE_KEY = "iroha-demo:theme";
export const THEME_SCHEMA = "iroha-demo-theme";
export const THEME_VERSION = 1 as const;

const MAX_PERSISTED_THEME_LENGTH = 1_024;

type Theme = "dark" | "light";

type PersistedTheme = {
  schema: typeof THEME_SCHEMA;
  version: typeof THEME_VERSION;
  theme: Theme;
};

const isTheme = (value: unknown): value is Theme =>
  value === "dark" || value === "light";

const parsePersistedTheme = (raw: string): PersistedTheme => {
  if (raw.length > MAX_PERSISTED_THEME_LENGTH) {
    throw new TypeError("Saved theme exceeds the supported size.");
  }
  const value = parseJsonWithoutDuplicateObjectKeys(raw, "Saved theme");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Saved theme must be an object.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "schema" ||
    keys[1] !== "theme" ||
    keys[2] !== "version"
  ) {
    throw new TypeError("Saved theme contains missing or unknown fields.");
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.schema !== THEME_SCHEMA ||
    payload.version !== THEME_VERSION ||
    !isTheme(payload.theme)
  ) {
    throw new TypeError(
      "Saved theme schema, version, or value is unsupported.",
    );
  }
  return {
    schema: THEME_SCHEMA,
    version: THEME_VERSION,
    theme: payload.theme,
  };
};

const readPersistedTheme = (): Theme | null => {
  const raw = localStorage.getItem(THEME_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return parsePersistedTheme(raw).theme;
  } catch {
    localStorage.removeItem(THEME_STORAGE_KEY);
    return null;
  }
};

const persistTheme = (theme: Theme) => {
  localStorage.setItem(
    THEME_STORAGE_KEY,
    JSON.stringify({
      schema: THEME_SCHEMA,
      version: THEME_VERSION,
      theme,
    } satisfies PersistedTheme),
  );
};

const initialTheme = (): Theme => {
  return readPersistedTheme() ?? "dark";
};

export const useThemeStore = defineStore("theme", {
  state: () => ({
    current: initialTheme(),
  }),
  actions: {
    setTheme(theme: Theme) {
      if (!isTheme(theme)) {
        throw new TypeError("Unsupported theme.");
      }
      this.current = theme;
      persistTheme(theme);
      document.documentElement.setAttribute("data-theme", theme);
    },
    toggle() {
      this.setTheme(this.current === "dark" ? "light" : "dark");
    },
    hydrate() {
      this.setTheme(
        readPersistedTheme() ??
          (isTheme(this.current) ? this.current : initialTheme()),
      );
    },
  },
});
