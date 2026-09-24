import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { configDefaults, defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import {
  buildIrohaSdkAliases,
  resolveCompatibleIrohaSdkRoot,
} from "./scripts/iroha-sdk-compat.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const irohaSdkRoot = resolveCompatibleIrohaSdkRoot({ projectRoot: __dirname });

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: /^@\//u,
        replacement: `${resolve(__dirname, "src")}/`,
      },
      {
        find: /^@noble\/hashes\/webcrypto\.js$/u,
        replacement: resolve(
          __dirname,
          "node_modules/@scure/bip39/node_modules/@noble/hashes/webcrypto.js",
        ),
      },
      ...buildIrohaSdkAliases(irohaSdkRoot),
    ],
    dedupe: ["@noble/curves", "@noble/hashes"],
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    exclude: [
      ...configDefaults.exclude,
      "tests/sccp.spec.ts",
      "tests/sccpBsc*.spec.*",
      "tests/sccpNile*.spec.*",
      "tests/sccpProver*.spec.*",
      "tests/sccpSolana*.spec.*",
      "tests/sccpView.spec.ts",
      "tests/solana*.spec.*",
      "tests/tronTypeContracts.spec.ts",
      "tests/useSccpBridge.spec.ts",
    ],
    coverage: {
      clean: true,
      enabled: process.env.VITEST_COVERAGE === "1",
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
