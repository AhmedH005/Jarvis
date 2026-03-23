import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        input:  resolve(__dirname, 'electron/main.ts'),
        output: { entryFileNames: 'main.js', format: 'cjs' }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron',
      emptyOutDir: false,
      rollupOptions: {
        input:  resolve(__dirname, 'electron/preload.ts'),
        output: { entryFileNames: 'preload.js', format: 'cjs' }
      }
    }
  },
  renderer: {
    root: '.',
    server: {
      port: 5173,
      strictPort: true,
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: { index: resolve(__dirname, 'index.html') }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@renderer': resolve(__dirname, 'src'),
        '@electron': resolve(__dirname, 'electron')
      }
    },
    plugins: [react()]
  }
})
