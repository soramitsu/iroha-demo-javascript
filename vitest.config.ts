import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";
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
        find: /^@noble\/ciphers\/chacha$/u,
        replacement: resolve(
          __dirname,
          "node_modules/@noble/ciphers/chacha.js",
        ),
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
    coverage: {
      clean: true,
      enabled: process.env.VITEST_COVERAGE === "1",
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
