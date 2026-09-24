import { defineStore } from "pinia";
import {
  DEFAULT_LOCALE,
  detectPreferredLocale,
  getLocaleDirection,
  isSupportedLocale,
  type SupportedLocale,
} from "@/i18n/messages";
import { parseJsonWithoutDuplicateObjectKeys } from "@/utils/json";

export const LOCALE_STORAGE_KEY = "iroha-demo:locale";
export const LOCALE_SCHEMA = "iroha-demo-locale";
export const LOCALE_VERSION = 1 as const;

const MAX_PERSISTED_LOCALE_LENGTH = 1_024;

type PersistedLocale = {
  schema: typeof LOCALE_SCHEMA;
  version: typeof LOCALE_VERSION;
  locale: SupportedLocale;
};

const parsePersistedLocale = (raw: string): PersistedLocale => {
  if (raw.length > MAX_PERSISTED_LOCALE_LENGTH) {
    throw new TypeError("Saved locale exceeds the supported size.");
  }
  const value = parseJsonWithoutDuplicateObjectKeys(raw, "Saved locale");
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Saved locale must be an object.");
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== "locale" ||
    keys[1] !== "schema" ||
    keys[2] !== "version"
  ) {
    throw new TypeError("Saved locale contains missing or unknown fields.");
  }
  const payload = value as Record<string, unknown>;
  if (
    payload.schema !== LOCALE_SCHEMA ||
    payload.version !== LOCALE_VERSION ||
    typeof payload.locale !== "string" ||
    !isSupportedLocale(payload.locale)
  ) {
    throw new TypeError(
      "Saved locale schema, version, or value is unsupported.",
    );
  }
  return {
    schema: LOCALE_SCHEMA,
    version: LOCALE_VERSION,
    locale: payload.locale,
  };
};

const readPersistedLocale = (): SupportedLocale | null => {
  const raw = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (raw === null) {
    return null;
  }
  try {
    return parsePersistedLocale(raw).locale;
  } catch {
    localStorage.removeItem(LOCALE_STORAGE_KEY);
    return null;
  }
};

const persistLocale = (locale: SupportedLocale) => {
  localStorage.setItem(
    LOCALE_STORAGE_KEY,
    JSON.stringify({
      schema: LOCALE_SCHEMA,
      version: LOCALE_VERSION,
      locale,
    } satisfies PersistedLocale),
  );
};

const pickInitialLocale = (): SupportedLocale => {
  return readPersistedLocale() ?? detectPreferredLocale();
};

export const useLocaleStore = defineStore("locale", {
  state: () => ({
    current: pickInitialLocale(),
  }),
  actions: {
    setLocale(locale: SupportedLocale) {
      if (!isSupportedLocale(locale)) {
        throw new TypeError("Unsupported locale.");
      }
      this.current = locale;
      persistLocale(locale);
      document.documentElement.setAttribute("lang", locale);
      document.documentElement.setAttribute("dir", getLocaleDirection(locale));
    },
    hydrate() {
      this.setLocale(
        readPersistedLocale() ??
          (isSupportedLocale(this.current) ? this.current : DEFAULT_LOCALE),
      );
    },
  },
});
