import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SCCP_BSC_PUBLIC_DIR = join(process.cwd(), "public", "sccp-bsc");
const REMOVED_DEFAULT_CONFIG = join(
  SCCP_BSC_PUBLIC_DIR,
  "taira-bsc-xor-prover.config.json",
);

describe("packaged BSC SCCP prover config", () => {
  it("does not ship a localhost default runtime prover config", () => {
    expect(existsSync(REMOVED_DEFAULT_CONFIG)).toBe(false);
  });

  it("does not ship local-only prover material URLs", () => {
    const jsonFiles = readdirSync(SCCP_BSC_PUBLIC_DIR)
      .filter((name) => name.endsWith(".json"))
      .map((name) => join(SCCP_BSC_PUBLIC_DIR, name));
    for (const file of jsonFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(
        /(?:localhost|127\.0\.0\.1|file:|\/Users\/|\\Users\\)/u,
      );
    }
  });
});
