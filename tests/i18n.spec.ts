import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  DEFAULT_LOCALE,
  detectPreferredLocale,
  getLocaleDirection,
  hasLocaleTranslation,
  isSupportedLocale,
  isRtlLocale,
  SUPPORTED_LOCALES,
  translate,
} from "@/i18n/messages";
import { useLocaleStore } from "@/stores/locale";
import { useAppI18n } from "@/composables/useAppI18n";
import { SUBSCRIPTION_I18N_KEYS } from "@/utils/subscriptions";

const collectTranslationKeys = (): string[] => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const sourceExtensions = new Set([".ts", ".vue"]);
  const keys = new Set<string>();

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (!sourceExtensions.has(path.extname(filePath))) {
        continue;
      }
      if (filePath.includes(`${path.sep}i18n${path.sep}`)) {
        continue;
      }
      const content = fs.readFileSync(filePath, "utf8");
      for (const match of content.matchAll(/\bt\(\s*["']([^"']+)["']/g)) {
        keys.add(match[1]);
      }
      for (const match of content.matchAll(
        /\b(?:titleKey|subtitleKey|labelKey|descriptionKey)\s*:\s*["']([^"']+)["']/g,
      )) {
        keys.add(match[1]);
      }
    }
  };

  walk(sourceRoot);
  Object.values(SUBSCRIPTION_I18N_KEYS).forEach((key) => keys.add(key));
  return [...keys].sort((a, b) => a.localeCompare(b));
};

const collectHardcodedPlaceholders = (): Array<{
  filePath: string;
  value: string;
}> => {
  const sourceRoot = path.resolve(process.cwd(), "src");
  const entries: Array<{ filePath: string; value: string }> = [];

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const filePath = path.join(dir, name);
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) {
        walk(filePath);
        continue;
      }
      if (path.extname(filePath) !== ".vue") {
        continue;
      }
      const content = fs.readFileSync(filePath, "utf8");
      for (const match of content.matchAll(
        /(^|[^:])placeholder\s*=\s*(["'])(.*?)\2/gm,
      )) {
        entries.push({ filePath, value: match[3] });
      }
    }
  };

  walk(sourceRoot);
  return entries;
};

describe("i18n messages", () => {
  it("falls back to key text and interpolates params", () => {
    expect(translate("en-US", "Hello {name}", { name: "Alice" })).toBe(
      "Hello Alice",
    );
    expect(translate("ja-JP", "Iroha Points")).toBe("Irohaポイント");
    expect(translate("ru-RU", "Iroha Points")).toBe("Ироха Очки");
    expect(translate("zh-CN", "Amount (XOR)")).toBe("金额（XOR）");
    expect(translate("ar-SA", "SORA Parliament")).toBe("برلمان SORA");
    expect(translate("fa-IR", "SORA Parliament")).toBe("پارلمان SORA");
    expect(translate("ur-PK", "SORA Parliament")).toBe("سورا پارلیمنٹ");
    expect(
      translate(
        "ko-KR",
        "referendumId is required before submitting a ballot.",
      ),
    ).toContain("referendumId");
  });

  it("validates locale support", () => {
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("ar-SA")).toBe(true);
    expect(isSupportedLocale("fr-FR")).toBe(true);
    expect(isSupportedLocale("ja-JP")).toBe(true);
    expect(isSupportedLocale("pt-PT")).toBe(true);
    expect(isSupportedLocale("ru-RU")).toBe(true);
    expect(isSupportedLocale("ko-KR")).toBe(true);
    expect(isSupportedLocale("uk-UA")).toBe(true);
    expect(isSupportedLocale("ur-PK")).toBe(true);
    expect(isSupportedLocale("zh-CN")).toBe(true);
    expect(isSupportedLocale("zh-TW")).toBe(true);
    expect(isSupportedLocale("xx-YY")).toBe(false);
  });

  it("exposes locale writing direction helpers", () => {
    expect(getLocaleDirection("en-US")).toBe("ltr");
    expect(getLocaleDirection("ja-JP")).toBe("ltr");
    expect(getLocaleDirection("ar-SA")).toBe("rtl");
    expect(getLocaleDirection("he-IL")).toBe("rtl");
    expect(getLocaleDirection("ur-PK")).toBe("rtl");
    expect(isRtlLocale("fa-IR")).toBe(true);
    expect(isRtlLocale("ru-RU")).toBe(false);
  });

  it("detects preferred locale from browser settings", () => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("ja-JP");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["ja-JP", "en-US"]);

    expect(detectPreferredLocale()).toBe("ja-JP");

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("maps language prefixes to supported locales", () => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("xx-YY");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["zh-Hans", "ru", "en-US"]);

    expect(detectPreferredLocale()).toBe("zh-CN");

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("maps traditional chinese and hebrew legacy prefixes", () => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("zh-Hant-HK");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["iw-IL", "en-US"]);

    expect(detectPreferredLocale()).toBe("zh-TW");

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("maps legacy hebrew prefix from navigator languages", () => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("xx-YY");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["iw-IL", "en-US"]);

    expect(detectPreferredLocale()).toBe("he-IL");

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("maps urdu prefix from navigator languages", () => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("xx-YY");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue(["ur-IN", "en-US"]);

    expect(detectPreferredLocale()).toBe("ur-PK");

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("covers all extracted translation keys for non-English locales", () => {
    const keys = collectTranslationKeys();
    const nonEnglishLocales = SUPPORTED_LOCALES.filter(
      (locale) => locale !== "en-US",
    );

    for (const locale of nonEnglishLocales) {
      const missing = keys.filter((key) => !hasLocaleTranslation(locale, key));
      expect(
        missing,
        `${locale} is missing translations for ${missing.join(", ")}`,
      ).toEqual([]);
    }
  });

  it("does not keep non-technical hardcoded placeholder text in Vue templates", () => {
    const allowedStaticPlaceholders = new Set([
      "ref-1",
      "0x0123...",
      "10000",
      "10.00",
      "1500",
      "9000",
      '{"country":"JP","kyc_id":"..."}',
      '{"invoice_id":"..."}',
      '{"tx_id":"..."}',
    ]);
    const offenders = collectHardcodedPlaceholders().filter(({ value }) => {
      if (allowedStaticPlaceholders.has(value)) {
        return false;
      }
      return /[A-Za-z]/.test(value);
    });
    expect(
      offenders,
      offenders
        .map(
          ({ filePath, value }) =>
            `${path.relative(process.cwd(), filePath)} -> ${value}`,
        )
        .join("\n"),
    ).toEqual([]);
  });
});

describe("locale store", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    document.documentElement.removeAttribute("lang");
    document.documentElement.removeAttribute("dir");
  });

  it("hydrates locale from storage and applies html lang attribute", () => {
    localStorage.setItem("iroha-demo:locale", "ja-JP");

    const store = useLocaleStore();
    store.hydrate();

    expect(store.current).toBe("ja-JP");
    expect(document.documentElement.getAttribute("lang")).toBe("ja-JP");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("falls back to default locale when storage is invalid", () => {
    localStorage.setItem("iroha-demo:locale", "xx-YY");

    const store = useLocaleStore();
    store.hydrate();

    expect(store.current).toBe(DEFAULT_LOCALE);
    expect(document.documentElement.getAttribute("lang")).toBe(DEFAULT_LOCALE);
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("applies rtl direction for hebrew locale", () => {
    const store = useLocaleStore();
    store.setLocale("he-IL");

    expect(store.current).toBe("he-IL");
    expect(document.documentElement.getAttribute("lang")).toBe("he-IL");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });

  it("applies rtl direction for urdu locale", () => {
    const store = useLocaleStore();
    store.setLocale("ur-PK");

    expect(store.current).toBe("ur-PK");
    expect(document.documentElement.getAttribute("lang")).toBe("ur-PK");
    expect(document.documentElement.getAttribute("dir")).toBe("rtl");
  });

  it("exposes composable helpers bound to the active locale", () => {
    const store = useLocaleStore();
    store.setLocale("ja-JP");

    const { t, setLocale, n } = useAppI18n();
    expect(t("Iroha Points")).toBe("Irohaポイント");
    expect(n(1234)).not.toBe("");

    setLocale("en-US");
    expect(t("Iroha Points")).toBe("Iroha Points");
  });
});
