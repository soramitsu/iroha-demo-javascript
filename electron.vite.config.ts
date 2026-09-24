import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import {
  buildIrohaSdkAliases,
  resolveCompatibleIrohaSdkRoot,
} from "./scripts/iroha-sdk-compat.mjs";

const projectRoot = dirname(fileURLToPath(import.meta.url));
const resolveFromRoot = (...segments: string[]) =>
  resolve(projectRoot, ...segments);
const irohaSdkRoot = resolveCompatibleIrohaSdkRoot({ projectRoot });
const sharedAliases = [
  {
    find: /^@\//u,
    replacement: `${resolveFromRoot("src")}/`,
  },
  {
    find: /^@noble\/hashes\/webcrypto\.js$/u,
    replacement: resolveFromRoot(
      "node_modules/@scure/bip39/node_modules/@noble/hashes/webcrypto.js",
    ),
  },
  // This also forces the native-capable crypto entry in preload, whose
  // default resolution otherwise uses browser conditions.
  ...buildIrohaSdkAliases(irohaSdkRoot),
];
const rendererAliases = [
  ...sharedAliases,
  {
    find: /^buffer$/u,
    replacement: resolveFromRoot("node_modules/buffer/index.js"),
  },
];
const sharedDedupe = ["@noble/curves", "@noble/hashes"];

export default defineConfig({
  main: {
    resolve: {
      alias: sharedAliases,
      dedupe: sharedDedupe,
    },
    build: {
      outDir: "dist/main",
      lib: {
        entry: resolveFromRoot("electron/main.ts"),
        formats: ["cjs"],
      },
      rollupOptions: {
        external: ["electron"],
        output: {
          entryFileNames: "index.cjs",
        },
      },
    },
  },
  preload: {
    resolve: {
      alias: sharedAliases,
      dedupe: sharedDedupe,
    },
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: resolveFromRoot("electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: resolveFromRoot("src"),
    publicDir: false,
    build: {
      outDir: resolveFromRoot("dist/renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: resolveFromRoot("src/index.html"),
      },
    },
    resolve: {
      alias: rendererAliases,
      dedupe: sharedDedupe,
    },
    plugins: [vue()],
    server: {
      port: 5173,
    },
  },
});
