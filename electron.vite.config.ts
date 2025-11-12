import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist/main'
    }
  },
  preload: {
    build: {
      outDir: 'dist/preload'
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@': resolve(process.cwd(), 'src')
      }
    },
    plugins: [vue()],
    server: {
      port: 5173
    }
  }
})
