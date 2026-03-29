import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    fileParallelism: false,
    globalSetup: ["./vitest.global-setup.ts"],
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      clean: false,
      enabled: true,
      provider: "v8",
      reporter: ["text", "html", "lcov"],
    },
  },
});
