import { computed } from "vue";
import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  translate,
  type SupportedLocale,
} from "@/i18n/messages";
import { useLocaleStore } from "@/stores/locale";

export const useAppI18n = () => {
  const localeStore = useLocaleStore();

  const t = (key: string, params?: Record<string, string | number>) =>
    translate(localeStore.current, key, params);

  const d = (
    value: Date | number | string,
    options?: Intl.DateTimeFormatOptions,
  ) => {
    const normalized = typeof value === "string" ? new Date(value) : value;
    return new Intl.DateTimeFormat(localeStore.current, options).format(
      normalized,
    );
  };

  const n = (value: number, options?: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(localeStore.current, options).format(value);

  const locales = computed(() => SUPPORTED_LOCALES);

  const localeOptions = computed(() =>
    SUPPORTED_LOCALES.map((locale) => ({
      value: locale,
      label: LOCALE_LABELS[locale],
    })),
  );

  const setLocale = (locale: SupportedLocale) => {
    localeStore.setLocale(locale);
  };

  return {
    localeStore,
    locales,
    localeOptions,
    t,
    d,
    n,
    setLocale,
  };
};
