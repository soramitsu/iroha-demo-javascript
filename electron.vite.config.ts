import { resolve } from "node:path";
import { defineConfig } from "electron-vite";
import vue from "@vitejs/plugin-vue";

const projectRoot = process.cwd();
const resolveFromRoot = (...segments: string[]) =>
  resolve(projectRoot, ...segments);

export default defineConfig({
  main: {
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
    build: {
      outDir: "dist/preload",
      rollupOptions: {
        input: resolveFromRoot("electron/preload.ts"),
      },
    },
  },
  renderer: {
    root: resolveFromRoot("src"),
    build: {
      outDir: resolveFromRoot("dist/renderer"),
      rollupOptions: {
        input: resolveFromRoot("src/index.html"),
      },
    },
    resolve: {
      alias: {
        "@": resolveFromRoot("src"),
      },
    },
    plugins: [vue()],
    server: {
      port: 5173,
    },
  },
});
