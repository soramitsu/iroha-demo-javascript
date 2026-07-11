import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import {
  DEFAULT_LOCALE,
  detectPreferredLocale,
  getLocaleDirection,
  hasLocaleTranslation,
  HISTORICAL_UI_TRANSLATION_KEYS,
  isSupportedLocale,
  LOCALE_LABELS,
  isRtlLocale,
  SUPPORTED_LOCALES,
  translate,
} from "@/i18n/messages";
import { isHistoricalTechnicalToken } from "@/i18n/ancientTranslations";
import { QUIET_SAKURA_TRANSLATION_KEYS } from "@/i18n/quietSakuraTranslations";
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

const HISTORICAL_LOCALES = ["egy-Egyp", "akk-Xsux"] as const;
const HISTORICAL_SCRIPTS = {
  "egy-Egyp": /\p{Script=Egyptian_Hieroglyphs}/u,
  "akk-Xsux": /\p{Script=Cuneiform}/u,
} as const;
const SEMANTIC_CONNECTORS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "the",
  "to",
  "via",
  "with",
]);
const LATIN_OR_MACHINE_TOKEN_PATTERN =
  /https?:\/\/[^\s]+|\/v\d+\/[^\s]+|[A-Za-z][A-Za-z0-9]*(?:[-_.:/+@#][A-Za-z0-9]+)*/g;

const getTemplateParameters = (text: string): string[] =>
  [...text.matchAll(/\{([\w]+)\}/g)].map((match) => match[1]).sort();

const getVisibleLatinOrMachineTokens = (text: string): string[] =>
  text.replace(/\{[\w]+\}/g, "").match(LATIN_OR_MACHINE_TOKEN_PATTERN) ?? [];

const sourceNeedsNativeScript = (text: string): boolean =>
  getVisibleLatinOrMachineTokens(text).some(
    (token) =>
      !isHistoricalTechnicalToken(token) &&
      !SEMANTIC_CONNECTORS.has(token.toLowerCase()),
  );

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
    expect(translate("he-IL", "SORA Parliament")).toBe("פרלמנט SORA");
    expect(translate("ur-PK", "SORA Parliament")).toBe("سورا پارلیمنٹ");
    expect(translate("ar-SA", "Torii control deck")).toBe("لوحة تحكم Torii");
    expect(translate("ur-PK", "Torii control deck")).toBe("Torii کنٹرول ڈیک");
    expect(translate("ja-JP", "Share QR or Account ID")).toContain("I105");
    expect(translate("hi-IN", "I105")).toBe("I105");
    expect(
      translate(
        "en-US",
        "Canonical I105 account IDs are compact literals and may look like 6cmz..., not i105:.",
      ),
    ).toContain("testu...");
    expect(
      translate(
        "ko-KR",
        "referendumId is required before submitting a ballot.",
      ),
    ).toContain("referendumId");
  });

  it("overrides broken TAIRA chrome strings in manual locale tables", () => {
    expect(translate("ja-JP", "TAIRA connection ready")).toBe(
      "TAIRA接続準備完了",
    );
    expect(translate("ja-JP", "Open Taira Explorer")).toBe(
      "TAIRA Explorerを開く",
    );
    expect(translate("zh-CN", "TAIRA locked")).toBe("TAIRA 已锁定");
    expect(translate("zh-CN", "TAIRA Torii ready")).toBe("TAIRA Torii 已就绪");
    expect(translate("zh-CN", "Open Taira Explorer")).toBe(
      "打开 TAIRA Explorer",
    );
    expect(translate("zh-TW", "TAIRA locked")).toBe("TAIRA 已鎖定");
    expect(translate("zh-TW", "TAIRA Torii ready")).toBe("TAIRA Torii 已就緒");
    expect(translate("zh-TW", "Open Taira Explorer")).toBe(
      "開啟 TAIRA Explorer",
    );
  });

  it("falls back to wallet-first copy for shared runtime status keys", () => {
    expect(translate("en-US", "Set up network and wallet first.")).toBe(
      "Set up network and wallet first.",
    );
    expect(translate("nl-NL", "Set up network and wallet first.")).toBe(
      "Set up network and wallet first.",
    );
    expect(translate("ja-JP", "Create on-chain account")).toBe(
      "Authority-only registration",
    );
    expect(
      translate(
        "fr-FR",
        "This wallet is saved locally. If the account is not live on-chain yet, balances and transfers can stay empty until it is funded or otherwise created on-chain.",
      ),
    ).toBe(
      "This wallet is local only. Balances stay empty until it is funded or otherwise created on-chain.",
    );
  });

  it("validates locale support", () => {
    expect(isSupportedLocale("en-US")).toBe(true);
    expect(isSupportedLocale("ar-SA")).toBe(true);
    expect(isSupportedLocale("akk-Xsux")).toBe(true);
    expect(isSupportedLocale("egy-Egyp")).toBe(true);
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
    expect(getLocaleDirection("egy-Egyp")).toBe("ltr");
    expect(getLocaleDirection("akk-Xsux")).toBe("ltr");
    expect(getLocaleDirection("ar-SA")).toBe("rtl");
    expect(getLocaleDirection("he-IL")).toBe("rtl");
    expect(getLocaleDirection("ur-PK")).toBe("rtl");
    expect(isRtlLocale("fa-IR")).toBe(true);
    expect(isRtlLocale("egy-Egyp")).toBe(false);
    expect(isRtlLocale("akk-Xsux")).toBe(false);
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

  it.each([
    ["egy", "egy-Egyp"],
    ["akk", "akk-Xsux"],
  ] as const)("maps the %s language prefix", (language, expected) => {
    const languageSpy = vi
      .spyOn(window.navigator, "language", "get")
      .mockReturnValue("xx-YY");
    const languagesSpy = vi
      .spyOn(window.navigator, "languages", "get")
      .mockReturnValue([language, "en-US"]);

    expect(detectPreferredLocale()).toBe(expected);

    languageSpy.mockRestore();
    languagesSpy.mockRestore();
  });

  it("uses semantic native-script labels for core historical-locale actions", () => {
    const egyptian = {
      Wallet: "𓉐𓌉",
      Send: "𓊄𓃀𓂻",
      Receive: "𓊏𓊪𓂡",
    } as const;
    const oldAkkadian = {
      Wallet: "𒆬𒌓",
      Send: "𒁕𒊏𒌈",
      Receive: "𒈠𒄩𒀸",
    } as const;

    for (const [key, value] of Object.entries(egyptian)) {
      expect(translate("egy-Egyp", key)).toBe(value);
      expect(value).toMatch(/\p{Script=Egyptian_Hieroglyphs}/u);
      expect(value).not.toMatch(/[A-Za-z]/u);
    }
    for (const [key, value] of Object.entries(oldAkkadian)) {
      expect(translate("akk-Xsux", key)).toBe(value);
      expect(value).toMatch(/\p{Script=Cuneiform}/u);
      expect(value).not.toMatch(/[A-Za-z]/u);
    }

    expect(translate("egy-Egyp", "Torii URL")).toBe("Torii URL");
    expect(translate("akk-Xsux", "Torii URL")).toBe("Torii URL");
  });

  it("materializes every historical UI key without silent English fallback", () => {
    expect(LOCALE_LABELS["egy-Egyp"]).toMatch(HISTORICAL_SCRIPTS["egy-Egyp"]);
    expect(LOCALE_LABELS["akk-Xsux"]).toMatch(HISTORICAL_SCRIPTS["akk-Xsux"]);

    const allUiKeys = new Set([
      ...HISTORICAL_UI_TRANSLATION_KEYS,
      ...collectTranslationKeys(),
    ]);

    for (const locale of HISTORICAL_LOCALES) {
      for (const key of allUiKeys) {
        const english = translate("en-US", key);
        const translated = translate(locale, key);

        expect(hasLocaleTranslation(locale, key), `${locale}: ${key}`).toBe(
          true,
        );
        expect(
          getTemplateParameters(translated),
          `${locale} must preserve parameters for ${key}`,
        ).toEqual(getTemplateParameters(english));

        const unsupportedLatin = getVisibleLatinOrMachineTokens(
          translated,
        ).filter((token) => !isHistoricalTechnicalToken(token));
        expect(
          unsupportedLatin,
          `${locale} leaked English for ${key}: ${translated}`,
        ).toEqual([]);

        if (sourceNeedsNativeScript(english)) {
          expect(
            translated,
            `${locale} needs native-script semantics for ${key}`,
          ).toMatch(HISTORICAL_SCRIPTS[locale]);
          expect(translated, `${locale} fell back on ${key}`).not.toBe(english);
        }
      }
    }

    expect(
      hasLocaleTranslation("egy-Egyp", "Unregistered English sentinel"),
    ).toBe(false);
    expect(
      hasLocaleTranslation("akk-Xsux", "Unregistered English sentinel"),
    ).toBe(false);
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

  it("uses locale-specific copy for every Quiet Sakura UI key", () => {
    const nonEnglishLocales = SUPPORTED_LOCALES.filter(
      (locale) => locale !== "en-US",
    );

    for (const locale of nonEnglishLocales) {
      for (const key of QUIET_SAKURA_TRANSLATION_KEYS) {
        expect(hasLocaleTranslation(locale, key)).toBe(true);
        expect(
          translate(locale, key),
          `${locale} should translate ${key}`,
        ).not.toBe(key);
      }
    }
  });

  it("does not keep non-technical hardcoded placeholder text in Vue templates", () => {
    const allowedStaticPlaceholders = new Set<string>();
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
    expect(t("Iroha Points")).toBe(translate("en-US", "Iroha Points"));
  });
});
