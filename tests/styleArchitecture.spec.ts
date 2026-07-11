import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const STYLE_ROOT = path.resolve(process.cwd(), "src/styles");
const SOURCE_ROOT = path.resolve(process.cwd(), "src");

const GLOBAL_STYLE_MODULES = [
  "fonts.css",
  "tokens.css",
  "reset.css",
  "base.css",
  "primitives.css",
  "shell.css",
  "operational-views.css",
  "utilities.css",
] as const;

const CASCADE_LAYERS = [
  "fonts",
  "tokens",
  "reset",
  "base",
  "primitives",
  "shell",
  "views",
  "utilities",
  "states",
] as const;

const IMPORT_LAYERS = [
  ["./fonts.css", "fonts"],
  ["./tokens.css", "tokens"],
  ["./reset.css", "reset"],
  ["./base.css", "base"],
  ["./primitives.css", "primitives"],
  ["./shell.css", "shell"],
  ["./operational-views.css", "views"],
  ["./utilities.css", "utilities"],
] as const;

interface CssRule {
  body: string;
  context: readonly string[];
  line: number;
  selector: string;
}

const readStyle = (fileName: string): string =>
  fs.readFileSync(path.join(STYLE_ROOT, fileName), "utf8");

const withoutComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
    comment.replace(/[^\n]/gu, " "),
  );

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/gu, " ").trim();

const splitAtTopLevel = (value: string, delimiter: string): string[] => {
  const parts: string[] = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses -= 1;
    if (character === "[") brackets += 1;
    if (character === "]") brackets -= 1;
    if (character === delimiter && parentheses === 0 && brackets === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(value.slice(start));
  return parts;
};

const canonicalSelector = (selector: string): string =>
  splitAtTopLevel(selector, ",")
    .map((part) => normalizeWhitespace(part).replace(/\s*([>+~])\s*/gu, "$1"))
    .sort()
    .join(",");

const findMatchingBrace = (source: string, openingBrace: number): number => {
  let depth = 1;
  let quote = "";
  let escaped = false;
  for (let index = openingBrace + 1; index < source.length; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{") depth += 1;
    if (character === "}") depth -= 1;
    if (depth === 0) return index;
  }
  throw new Error(`Unclosed CSS block near character ${openingBrace}`);
};

const findNextBlock = (
  source: string,
  start: number,
  end: number,
): { openingBrace: number; preludeStart: number } | null => {
  let preludeStart = start;
  let quote = "";
  let escaped = false;
  let parentheses = 0;
  let brackets = 0;

  for (let index = start; index < end; index += 1) {
    const character = source[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "(") parentheses += 1;
    if (character === ")") parentheses -= 1;
    if (character === "[") brackets += 1;
    if (character === "]") brackets -= 1;
    if (parentheses !== 0 || brackets !== 0) continue;
    if (character === ";") preludeStart = index + 1;
    if (character === "{") return { openingBrace: index, preludeStart };
  }
  return null;
};

const CONTAINER_AT_RULES = new Set([
  "container",
  "layer",
  "media",
  "scope",
  "supports",
]);

const parseCssRules = (rawSource: string): CssRule[] => {
  const source = withoutComments(rawSource);
  const rules: CssRule[] = [];

  const visit = (
    start: number,
    end: number,
    context: readonly string[],
  ): void => {
    let cursor = start;
    while (cursor < end) {
      const block = findNextBlock(source, cursor, end);
      if (!block) return;
      const closingBrace = findMatchingBrace(source, block.openingBrace);
      const rawPrelude = source.slice(block.preludeStart, block.openingBrace);
      const prelude = normalizeWhitespace(rawPrelude);
      const body = source.slice(block.openingBrace + 1, closingBrace);

      if (prelude.startsWith("@")) {
        const match = /^@([\w-]+)\s*(.*)$/u.exec(prelude);
        const atRule = match?.[1].toLowerCase() ?? "";
        if (CONTAINER_AT_RULES.has(atRule)) {
          visit(block.openingBrace + 1, closingBrace, [
            ...context,
            `@${atRule} ${normalizeWhitespace(match?.[2] ?? "")}`,
          ]);
        }
      } else if (prelude) {
        rules.push({
          body,
          context,
          line: source.slice(0, block.preludeStart).split("\n").length,
          selector: canonicalSelector(prelude),
        });
      }
      cursor = closingBrace + 1;
    }
  };

  visit(0, source.length, []);
  return rules;
};

const declarationsFor = (body: string): Map<string, string> => {
  const declarations = new Map<string, string>();
  for (const match of body.matchAll(/(?:^|;)\s*([\w-]+)\s*:\s*([^;]+)/gmu)) {
    declarations.set(match[1], normalizeWhitespace(match[2]));
  }
  return declarations;
};

const collectFiles = (directory: string): string[] =>
  fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? collectFiles(filePath) : [filePath];
  });

const styleSources = (): Array<{ filePath: string; source: string }> =>
  collectFiles(SOURCE_ROOT).flatMap((filePath) => {
    const extension = path.extname(filePath);
    if (extension === ".css") {
      return [{ filePath, source: fs.readFileSync(filePath, "utf8") }];
    }
    if (extension !== ".vue") return [];
    const vueSource = fs.readFileSync(filePath, "utf8");
    return [...vueSource.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/giu)].map(
      (match, index) => ({
        filePath: `${filePath}#style-${index + 1}`,
        source: match[1],
      }),
    );
  });

const relative = (filePath: string): string =>
  path.relative(process.cwd(), filePath.replace(/#style-\d+$/u, ""));

const hexToRgb = (hex: string): readonly [number, number, number] => {
  const normalized = hex.replace(/^#/u, "");
  if (!/^[\da-f]{6}$/iu.test(normalized)) {
    throw new Error(`Expected a six-digit hex color, received ${hex}`);
  }
  return [0, 2, 4].map((offset) =>
    Number.parseInt(normalized.slice(offset, offset + 2), 16),
  ) as unknown as readonly [number, number, number];
};

const relativeLuminance = (hex: string): number => {
  const [red, green, blue] = hexToRgb(hex).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (foreground: string, background: string): number => {
  const foregroundLuminance = relativeLuminance(foreground);
  const backgroundLuminance = relativeLuminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
};

describe("Quiet Sakura style architecture", () => {
  it("keeps main.css as ordered cascade-layer orchestration only", () => {
    const source = withoutComments(readStyle("main.css"));
    expect(source).not.toMatch(/[{}]/u);

    const statements = source
      .split(";")
      .map(normalizeWhitespace)
      .filter(Boolean);
    const layerStatement = /^@layer\s+(.+)$/u.exec(statements[0]);
    expect(layerStatement?.[1].split(",").map((layer) => layer.trim())).toEqual(
      CASCADE_LAYERS,
    );

    const imports = statements.slice(1).map((statement) => {
      const match = /^@import\s+["']([^"']+)["']\s+layer\(([^)]+)\)$/u.exec(
        statement,
      );
      return match ? [match[1], match[2].trim()] : ["INVALID", statement];
    });
    expect(imports).toEqual(IMPORT_LAYERS);
    expect(statements).toHaveLength(1 + IMPORT_LAYERS.length);
  });

  it("resolves every CSS custom-property reference", () => {
    const declared = new Map<string, string[]>();
    const referenced = new Map<string, string[]>();

    for (const { filePath, source } of styleSources()) {
      const uncommented = withoutComments(source);
      for (const match of uncommented.matchAll(
        /(?:^|[;{])\s*(--[\w-]+)\s*:/gmu,
      )) {
        const locations = declared.get(match[1]) ?? [];
        locations.push(relative(filePath));
        declared.set(match[1], locations);
      }
      for (const match of uncommented.matchAll(/var\(\s*(--[\w-]+)/gu)) {
        const locations = referenced.get(match[1]) ?? [];
        locations.push(relative(filePath));
        referenced.set(match[1], locations);
      }
    }

    const runtimeOwned = new Set(["--parallax-x", "--parallax-y"]);
    const unresolved = [...referenced]
      .filter(
        ([property]) => !declared.has(property) && !runtimeOwned.has(property),
      )
      .map(([property, locations]) => ({
        locations: [...new Set(locations)].sort(),
        property,
      }));
    expect(unresolved).toEqual([]);
  });

  it("keeps semantic color, illumination, and depth tokens complete in both themes", () => {
    const tokenRules = parseCssRules(readStyle("tokens.css"));
    const shared = tokenRules.find(
      (rule) => rule.context.length === 0 && rule.selector === ":root",
    );
    expect(shared, "missing shared :root token contract").toBeTruthy();
    const sharedTokens = declarationsFor(shared?.body ?? "");
    for (const token of [
      "--font-sans",
      "--font-urdu",
      "--font-egyptian",
      "--font-akkadian",
      "--space-1",
      "--space-7",
      "--radius-control",
      "--radius-panel",
      "--radius-shell",
      "--duration-fast",
      "--duration-route",
    ]) {
      expect(sharedTokens.has(token), `missing shared token ${token}`).toBe(
        true,
      );
    }

    for (const theme of ["dark", "light"] as const) {
      const rule = tokenRules.find(
        (candidate) =>
          candidate.context.length === 0 &&
          candidate.selector === `:root[data-theme="${theme}"]`,
      );
      expect(rule, `missing ${theme} theme token contract`).toBeTruthy();
      const tokens = declarationsFor(rule?.body ?? "");
      for (const token of [
        "--color-background",
        "--color-surface",
        "--color-surface-raised",
        "--color-surface-soft",
        "--color-surface-inset",
        "--color-text",
        "--color-text-strong",
        "--color-text-muted",
        "--color-border",
        "--color-accent",
        "--color-success",
        "--color-warning",
        "--color-danger",
        "--color-focus",
        "--frost-filter-shell",
        "--frost-filter-panel",
        "--frost-filter-soft",
        "--frost-shell",
        "--frost-panel",
        "--frost-panel-raised",
        "--frost-panel-soft",
        "--frost-panel-inset",
        "--frost-border",
        "--gi-key-light",
        "--gi-fill-light",
        "--gi-occlusion",
        "--gi-coral-bounce",
        "--gi-rim-light",
        "--shadow-raised",
        "--shadow-control",
        "--shadow-inset",
        "--shadow-shell",
        "--shadow-overlay",
        "--shadow-hover",
        "--shadow-pressed",
      ]) {
        expect(tokens.has(token), `missing ${theme} token ${token}`).toBe(true);
      }

      for (const material of [
        "--frost-shell",
        "--frost-panel",
        "--frost-panel-raised",
        "--frost-panel-soft",
        "--frost-panel-inset",
      ]) {
        const value = tokens.get(material) ?? "";
        const alpha = Number(/,\s*(0?\.\d+)\)$/u.exec(value)?.[1]);
        expect(
          Number.isFinite(alpha),
          `${theme} ${material} must use an rgba material`,
        ).toBe(true);
        expect(
          alpha,
          `${theme} ${material} must remain translucent`,
        ).toBeLessThan(0.8);
        expect(
          alpha,
          `${theme} ${material} must preserve text contrast`,
        ).toBeGreaterThan(0.25);
      }

      const illumination = tokens.get("--background-illumination") ?? "";
      expect(
        [...illumination.matchAll(/radial-gradient\(/gu)],
        `${theme} background must contain key, coral, and fill light fields`,
      ).toHaveLength(3);
      for (const light of [
        "--gi-key-light",
        "--gi-fill-light",
        "--gi-coral-bounce",
      ]) {
        expect(illumination, `${theme} background must use ${light}`).toContain(
          `var(${light})`,
        );
      }

      const depthTokens = [
        "--shadow-inset",
        "--shadow-pressed",
        "--shadow-control",
        "--shadow-hover",
        "--shadow-raised",
        "--shadow-shell",
        "--shadow-overlay",
      ] as const;
      const depthValues = depthTokens.map((token) => tokens.get(token) ?? "");
      expect(
        new Set(depthValues).size,
        `${theme} depth tiers must remain visually distinct`,
      ).toBe(depthTokens.length);
      for (const [index, value] of depthValues.entries()) {
        expect(
          value,
          `${theme} ${depthTokens[index]} must compose semantic illumination or depth tokens`,
        ).toMatch(/var\(--(?:gi-|shadow-)/u);
      }

      for (const foregroundToken of ["--color-text", "--color-text-muted"]) {
        const foreground = tokens.get(foregroundToken) ?? "";
        for (const backgroundToken of [
          "--color-background",
          "--color-surface",
          "--color-surface-raised",
          "--color-surface-soft",
          "--color-surface-inset",
        ]) {
          const background = tokens.get(backgroundToken) ?? "";
          expect(
            contrastRatio(foreground, background),
            `${theme} ${foregroundToken} on ${backgroundToken}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }

      if (theme === "light") {
        for (const tone of ["accent", "success", "warning", "danger"]) {
          expect(
            contrastRatio(
              tokens.get(`--color-${tone}`) ?? "",
              tokens.get(`--color-${tone}-soft`) ?? "",
            ),
            `light ${tone} text on its semantic soft surface`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("bundles a locale-scoped Nastaliq face for Urdu UI copy", () => {
    const fontSource = withoutComments(readStyle("fonts.css"));
    expect(fontSource).toContain('font-family: "Noto Nastaliq Urdu"');
    expect(fontSource).toContain("NotoNastaliqUrdu-Variable.ttf");
    expect(fontSource).toMatch(/font-weight:\s*400\s+700/u);
    expect(fontSource).toMatch(/font-display:\s*swap/u);
    expect(fontSource).toMatch(/unicode-range:[^;}]*U\+0600-06FF/su);

    const fontPath = path.join(
      SOURCE_ROOT,
      "assets/fonts/noto-nastaliq-urdu/NotoNastaliqUrdu-Variable.ttf",
    );
    const licensePath = path.join(
      SOURCE_ROOT,
      "assets/fonts/noto-nastaliq-urdu/OFL.txt",
    );
    expect(fs.statSync(fontPath).size).toBeGreaterThan(100_000);
    expect(fs.readFileSync(licensePath, "utf8")).toContain(
      "SIL OPEN FONT LICENSE Version 1.1",
    );

    const tokenRules = parseCssRules(readStyle("tokens.css"));
    const urduRule = tokenRules.find(
      (rule) => rule.context.length === 0 && rule.selector === ":root:lang(ur)",
    );
    expect(declarationsFor(urduRule?.body ?? "").get("--font-sans")).toBe(
      "var(--font-urdu)",
    );
    expect(readStyle("utilities.css")).toContain(":root:lang(ur)");
  });

  it("bundles locale-scoped faces for the historical script locales", () => {
    const fontSource = withoutComments(readStyle("fonts.css"));
    const historicalFaces = [
      {
        family: "Noto Sans Egyptian Hieroglyphs",
        file: "NotoSansEgyptianHieroglyphs-Regular.ttf",
        folder: "noto-sans-egyptian-hieroglyphs",
        language: "egy",
        range: "U\\+13000-1345F",
        token: "--font-egyptian",
      },
      {
        family: "Noto Sans Cuneiform",
        file: "NotoSansCuneiform-Regular.ttf",
        folder: "noto-sans-cuneiform",
        language: "akk",
        range: "U\\+12000-1254F",
        token: "--font-akkadian",
      },
    ] as const;
    const tokenRules = parseCssRules(readStyle("tokens.css"));

    for (const face of historicalFaces) {
      const faceBlock = new RegExp(
        `@font-face\\s*\\{[^}]*font-family:\\s*"${face.family}"[^}]*\\}`,
        "su",
      ).exec(fontSource)?.[0];
      expect(faceBlock, `missing ${face.family} @font-face`).toBeTruthy();
      expect(faceBlock).toContain(face.file);
      expect(faceBlock).toMatch(/font-weight:\s*400/u);
      expect(faceBlock).toMatch(/font-display:\s*swap/u);
      expect(faceBlock).toMatch(new RegExp(face.range, "u"));

      const fontPath = path.join(
        SOURCE_ROOT,
        `assets/fonts/${face.folder}/${face.file}`,
      );
      const licensePath = path.join(
        SOURCE_ROOT,
        `assets/fonts/${face.folder}/OFL.txt`,
      );
      expect(fs.statSync(fontPath).size).toBeGreaterThan(100_000);
      expect(fs.readFileSync(licensePath, "utf8")).toContain(
        "SIL OPEN FONT LICENSE Version 1.1",
      );

      const localeRule = tokenRules.find(
        (rule) =>
          rule.context.length === 0 &&
          rule.selector === `:root:lang(${face.language})`,
      );
      expect(declarationsFor(localeRule?.body ?? "").get("--font-sans")).toBe(
        `var(${face.token})`,
      );
      expect(readStyle("utilities.css")).toContain(`:lang(${face.language})`);
    }
  });

  it("lets light glass reveal more of the sakura than dark glass", () => {
    const tokenRules = parseCssRules(readStyle("tokens.css"));
    const themeTokens = (theme: "dark" | "light"): Map<string, string> =>
      declarationsFor(
        tokenRules.find(
          (rule) =>
            rule.context.length === 0 &&
            rule.selector === `:root[data-theme="${theme}"]`,
        )?.body ?? "",
      );
    const alphaFor = (tokens: Map<string, string>, material: string): number =>
      Number(/,\s*(0?\.\d+)\)$/u.exec(tokens.get(material) ?? "")?.[1]);
    const blurFor = (tokens: Map<string, string>, filter: string): number =>
      Number(/blur\((\d+)px\)/u.exec(tokens.get(filter) ?? "")?.[1]);

    const dark = themeTokens("dark");
    const light = themeTokens("light");
    for (const material of [
      "--frost-shell",
      "--frost-panel",
      "--frost-panel-raised",
      "--frost-panel-soft",
      "--frost-panel-inset",
    ]) {
      expect(alphaFor(light, material), material).toBeLessThan(
        alphaFor(dark, material),
      );
    }
    for (const filter of [
      "--frost-filter-shell",
      "--frost-filter-panel",
      "--frost-filter-soft",
    ]) {
      expect(blurFor(light, filter), filter).toBeLessThan(
        blurFor(dark, filter),
      );
    }
  });

  it("maps shared surfaces and interaction states onto the global depth tiers", () => {
    const shellRules = parseCssRules(readStyle("shell.css"));
    const primitiveRules = parseCssRules(readStyle("primitives.css"));
    const declarationFor = (
      rules: CssRule[],
      selector: string,
      property: string,
    ): string | undefined =>
      declarationsFor(
        rules.find(
          (rule) => rule.context.length === 0 && rule.selector === selector,
        )?.body ?? "",
      ).get(property);
    const shadowFor = (
      rules: CssRule[],
      selector: string,
    ): string | undefined => declarationFor(rules, selector, "box-shadow");

    expect(shadowFor(shellRules, ".app-header")).toBe("var(--shadow-shell)");
    expect(shadowFor(shellRules, ".workspace")).toBe("var(--shadow-raised)");
    expect(shadowFor(shellRules, ".nav-link:hover")).toContain(
      "var(--shadow-hover)",
    );
    expect(
      shadowFor(shellRules, '.nav-link.active,.nav-link[aria-current="page"]'),
    ).toContain("var(--shadow-pressed)");

    expect(shadowFor(primitiveRules, ".card")).toBe("var(--shadow-raised)");
    expect(shadowFor(primitiveRules, ".ui-metric-list")).toBe(
      "var(--shadow-raised)",
    );
    expect(shadowFor(primitiveRules, ".ui-dialog")).toBe(
      "var(--shadow-overlay)",
    );
    expect(shadowFor(primitiveRules, "input,select,textarea")).toBe(
      "var(--shadow-inset)",
    );

    expect(declarationFor(shellRules, ".workspace", "background")).toBe(
      "var(--frost-panel)",
    );
    expect(declarationFor(shellRules, ".workspace", "backdrop-filter")).toBe(
      "var(--frost-filter-panel)",
    );
    expect(declarationFor(primitiveRules, ".card", "background")).toBe(
      "var(--frost-panel-raised)",
    );
    expect(declarationFor(primitiveRules, ".card", "backdrop-filter")).toBe(
      "var(--frost-filter-panel)",
    );
    expect(
      declarationFor(primitiveRules, ".ui-metric-list", "background"),
    ).toBe("var(--frost-panel-raised)");

    /* Dense interaction and data surfaces stay optically stable over petals. */
    expect(
      declarationFor(primitiveRules, "input,select,textarea", "background"),
    ).toBe("var(--color-surface-inset)");
    expect(
      declarationFor(
        primitiveRules,
        ".table-wrap,.ui-table-wrap",
        "background",
      ),
    ).toBe("var(--color-surface-inset)");
    expect(declarationFor(primitiveRules, ".qr", "background")).toBe(
      "var(--color-qr-surface)",
    );

    const hoverControls = primitiveRules.find(
      (rule) =>
        rule.context.length === 0 &&
        rule.selector.includes("button:hover:not(:disabled)") &&
        rule.selector.includes('.ui-button:hover:not([aria-disabled="true"])'),
    );
    expect(
      declarationsFor(hoverControls?.body ?? "").get("box-shadow"),
    ).toContain("var(--shadow-hover)");

    const pressedControls = primitiveRules.find(
      (rule) =>
        rule.context.length === 0 &&
        rule.selector.includes("button:active:not(:disabled)") &&
        rule.selector.includes('.ui-button:active:not([aria-disabled="true"])'),
    );
    expect(
      declarationsFor(pressedControls?.body ?? "").get("box-shadow"),
    ).toContain("var(--shadow-pressed)");
  });

  it("keeps route-owned advanced panels on shared frosted material tiers", () => {
    const declarationsForView = (
      fileName: string,
      selector: string,
    ): Map<string, string> => {
      const source = styleSources().find(
        ({ filePath }) => relative(filePath) === `src/views/${fileName}`,
      )?.source;
      expect(source, `missing scoped styles for ${fileName}`).toBeTruthy();
      const rule = parseCssRules(source ?? "").find(
        (candidate) =>
          candidate.context.length === 0 && candidate.selector === selector,
      );
      expect(rule, `missing ${selector} in ${fileName}`).toBeTruthy();
      return declarationsFor(rule?.body ?? "");
    };

    for (const surface of [
      { fileName: "ParliamentView.vue", selector: ".parliament-advanced-card" },
      { fileName: "KaigiView.vue", selector: ".kaigi-signal-card" },
      { fileName: "StakingView.vue", selector: ".staking-advanced" },
    ]) {
      const declarations = declarationsForView(
        surface.fileName,
        surface.selector,
      );
      expect(declarations.get("border-color"), surface.selector).toBe(
        "var(--frost-border)",
      );
      expect(declarations.get("background"), surface.selector).toBe(
        "var(--frost-panel-raised)",
      );
      expect(declarations.get("backdrop-filter"), surface.selector).toBe(
        "var(--frost-filter-panel)",
      );
      expect(
        declarations.get("-webkit-backdrop-filter"),
        surface.selector,
      ).toBe("var(--frost-filter-panel)");
    }

    const kaigiBody = declarationsForView(
      "KaigiView.vue",
      ".kaigi-advanced-body",
    );
    expect(kaigiBody.get("background")).toBe("var(--frost-panel-soft)");
    expect(kaigiBody.get("backdrop-filter")).toBe("var(--frost-filter-soft)");
    expect(kaigiBody.get("-webkit-backdrop-filter")).toBe(
      "var(--frost-filter-soft)",
    );
  });

  it("does not dim shared disabled or muted text below its semantic color", () => {
    const files = ["primitives.css", "shell.css"] as const;
    const offenders = files.flatMap((fileName) =>
      parseCssRules(readStyle(fileName)).flatMap((rule) => {
        if (
          !/(?:disabled|aria-disabled|\.muted|\.locked)/u.test(rule.selector)
        ) {
          return [];
        }
        const opacity = declarationsFor(rule.body).get("opacity");
        return opacity && opacity !== "1"
          ? [
              `${fileName}:${rule.line} ${rule.selector} uses opacity ${opacity}`,
            ]
          : [];
      }),
    );
    expect(offenders).toEqual([]);
  });

  it("keeps frosted materials tokenized and legacy glass aliases retired", () => {
    const bannedTokenName =
      "(?:glass-[\\w-]+|menu-(?:glass|highlight|accent-glow)[\\w-]*|qs-shell-glass|gi-ambient|shadow-(?:soft|strong))";
    const bannedToken = new RegExp(`var\\(\\s*--${bannedTokenName}`, "gu");
    const legacyDeclarations = [
      ...withoutComments(readStyle("tokens.css")).matchAll(
        new RegExp(`(?:^|[;{])\\s*(--${bannedTokenName})\\s*:`, "gmu"),
      ),
    ].map((match) => match[1]);
    expect(legacyDeclarations).toEqual([]);

    const violations = styleSources().flatMap(({ filePath, source }) => {
      if (!filePath.endsWith(".vue") && !filePath.includes(".vue#style-")) {
        return [];
      }
      return [...withoutComments(source).matchAll(bannedToken)].map(
        (match) => `${relative(filePath)}: ${match[0]}`,
      );
    });
    expect(violations).toEqual([]);

    const gradientViolations = styleSources().flatMap(
      ({ filePath, source }) => {
        if (relative(filePath) === "src/styles/tokens.css") return [];
        return /(?:linear|radial|conic|repeating-linear|repeating-radial)-gradient\(/iu.test(
          withoutComments(source),
        )
          ? [relative(filePath)]
          : [];
      },
    );
    expect(gradientViolations).toEqual([]);

    const tokenGradientDeclarations = parseCssRules(readStyle("tokens.css"))
      .flatMap((rule) => [...declarationsFor(rule.body)])
      .filter(([, value]) => /(?:linear|radial|conic)-gradient\(/iu.test(value))
      .map(([property]) => property);
    expect(tokenGradientDeclarations).toEqual([
      "--background-illumination",
      "--background-illumination",
    ]);

    const blurViolations = styleSources().flatMap(({ filePath, source }) =>
      [
        ...withoutComments(source).matchAll(
          /(?:^|;)\s*((?:-webkit-)?backdrop-filter)\s*:\s*([^;}]+)/gmu,
        ),
      ].flatMap((match) => {
        const value = normalizeWhitespace(match[2]);
        const usesFrostToken =
          /^var\(--frost-filter-(?:shell|panel|soft)\)$/u.test(value);
        const isDialogBackdrop =
          relative(filePath) === "src/styles/primitives.css" &&
          value === "blur(5px)";
        return usesFrostToken || isDialogBackdrop
          ? []
          : [`${relative(filePath)}: ${match[1]}: ${value}`];
      }),
    );
    expect(blurViolations).toEqual([]);
  });

  it("keeps every global selector generation unique within its cascade context", () => {
    const seen = new Map<string, string[]>();
    for (const fileName of GLOBAL_STYLE_MODULES) {
      for (const rule of parseCssRules(readStyle(fileName))) {
        const key = `${rule.context.join("|")}::${rule.selector}`;
        const locations = seen.get(key) ?? [];
        locations.push(`${fileName}:${rule.line}`);
        seen.set(key, locations);
      }
    }
    const duplicates = [...seen]
      .filter(([, locations]) => locations.length > 1)
      .map(([selector, locations]) => ({ locations, selector }));
    expect(duplicates).toEqual([]);
  });

  it("keeps consolidated Staking and Offline grid placement route-owned", () => {
    const structuralProperties = new Set([
      "grid-column",
      "grid-row",
      "grid-template-areas",
      "grid-template-columns",
      "grid-template-rows",
    ]);
    const leakedPlacement = parseCssRules(readStyle("operational-views.css"))
      .filter((rule) => /\.(?:staking|offline)[\w-]*/u.test(rule.selector))
      .flatMap((rule) =>
        [...declarationsFor(rule.body)]
          .filter(([property]) => structuralProperties.has(property))
          .map(
            ([property, value]) =>
              `operational-views.css:${rule.line} ${rule.selector} ${property}: ${value}`,
          ),
      );

    expect(leakedPlacement).toEqual([]);
  });

  it("retains the 232px, 72px, and drawer shell modes at 1180/760", () => {
    const shellRules = parseCssRules(readStyle("shell.css"));
    const baseShell = shellRules.find(
      (rule) => rule.context.length === 0 && rule.selector === ".app-shell",
    );
    expect(
      declarationsFor(baseShell?.body ?? "").get("grid-template-columns"),
    ).toMatch(/^232px\s+/u);

    const mediaContexts = new Set(
      shellRules.flatMap((rule) =>
        rule.context.filter((context) => context.startsWith("@media ")),
      ),
    );
    expect(mediaContexts).toContain("@media (min-width: 1180px)");
    expect(mediaContexts).toContain(
      "@media (min-width: 761px) and (max-width: 1179px)",
    );
    expect(mediaContexts).toContain("@media (max-width: 760px)");

    const inContext = (media: string, selector: string): CssRule | undefined =>
      shellRules.find(
        (rule) =>
          rule.context.includes(`@media ${media}`) &&
          rule.selector === selector,
      );
    expect(
      declarationsFor(
        inContext("(min-width: 761px) and (max-width: 1179px)", ".app-shell")
          ?.body ?? "",
      ).get("grid-template-columns"),
    ).toMatch(/^72px\s+/u);
    expect(
      declarationsFor(
        inContext("(max-width: 760px)", ".desktop-sidebar")?.body ?? "",
      ).get("display"),
    ).toBe("none");
    expect(
      declarationsFor(
        inContext("(max-width: 760px)", ".mobile-navigation-dialog[open]")
          ?.body ?? "",
      ).get("display"),
    ).toBe("block");

    const structuralShellRules = shellRules.filter((rule) => {
      if (rule.selector !== ".app-shell") return false;
      const declarations = declarationsFor(rule.body);
      return (
        declarations.has("grid-template-columns") || declarations.has("display")
      );
    });
    expect(
      structuralShellRules.map((rule) => rule.context.join("|")).sort(),
    ).toEqual(
      [
        "",
        "@media (max-width: 760px)",
        "@media (min-width: 761px) and (max-width: 1179px)",
      ].sort(),
    );
  });
});
