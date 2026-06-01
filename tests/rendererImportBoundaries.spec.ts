import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RENDERER_EXTENSIONS = new Set([".js", ".ts", ".vue"]);
const SDK_ROOT_IMPORT_PATTERN =
  /(?:\b(?:import|export)\b[\s\S]*?\bfrom\s*["']@iroha\/iroha-js["']|\bimport\s*\(\s*["']@iroha\/iroha-js["']\s*\))/gu;

const collectRendererFiles = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRendererFiles(filePath));
      continue;
    }
    if (RENDERER_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(filePath);
    }
  }
  return files;
};

describe("renderer import boundaries", () => {
  it("keeps renderer code on browser-safe @iroha/iroha-js subpath imports", () => {
    const sourceRoot = path.resolve(process.cwd(), "src");
    const violations = collectRendererFiles(sourceRoot).flatMap((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      const matches = [...source.matchAll(SDK_ROOT_IMPORT_PATTERN)];
      return matches.map((match) => {
        const line =
          source.slice(0, match.index ?? 0).split(/\r?\n/u).length || 1;
        return `${path.relative(process.cwd(), filePath)}:${line}`;
      });
    });

    expect(violations).toEqual([]);
  });
});
