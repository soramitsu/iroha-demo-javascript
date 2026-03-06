import { defineStore } from "pinia";
import {
  DEFAULT_LOCALE,
  detectPreferredLocale,
  getLocaleDirection,
  isSupportedLocale,
  type SupportedLocale,
} from "@/i18n/messages";

const LOCALE_KEY = "iroha-demo:locale";

const pickInitialLocale = (): SupportedLocale => {
  const saved = localStorage.getItem(LOCALE_KEY);
  if (saved && isSupportedLocale(saved)) {
    return saved;
  }
  return detectPreferredLocale();
};

export const useLocaleStore = defineStore("locale", {
  state: () => ({
    current: pickInitialLocale(),
  }),
  actions: {
    setLocale(locale: SupportedLocale) {
      this.current = locale;
      localStorage.setItem(LOCALE_KEY, locale);
      document.documentElement.setAttribute("lang", locale);
      document.documentElement.setAttribute("dir", getLocaleDirection(locale));
    },
    hydrate() {
      const saved = localStorage.getItem(LOCALE_KEY);
      if (saved && isSupportedLocale(saved)) {
        this.setLocale(saved);
        return;
      }
      this.setLocale(this.current || DEFAULT_LOCALE);
    },
  },
});
