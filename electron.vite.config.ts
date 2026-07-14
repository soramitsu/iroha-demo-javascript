import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";
import {
  buildIrohaSdkAliases,
  resolveCompatibleIrohaSdkRoot,
} from "./scripts/iroha-sdk-compat.mjs";

const projectRoot = process.cwd();
const resolveFromRoot = (...segments: string[]) =>
  resolve(projectRoot, ...segments);
const irohaSdkRoot = resolveCompatibleIrohaSdkRoot({ projectRoot });
const sharedAliases = [
  {
    find: /^@\//u,
    replacement: `${resolveFromRoot("src")}/`,
  },
  // This also forces the native-capable crypto entry in preload, whose
  // default resolution otherwise uses browser conditions.
  ...buildIrohaSdkAliases(irohaSdkRoot),
];

export default defineConfig({
  main: {
    resolve: {
      alias: sharedAliases,
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
    publicDir: resolveFromRoot("public"),
    build: {
      outDir: resolveFromRoot("dist/renderer"),
      rollupOptions: {
        input: resolveFromRoot("src/index.html"),
      },
    },
    resolve: {
      alias: sharedAliases,
    },
    plugins: [vue()],
    server: {
      port: 5173,
    },
  },
});
