import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Vite serves the renderer. Electron loads the built index.html from dist/.
export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'src'),
  base: './',
  publicDir: resolve(__dirname, 'assets'),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    assetsDir: 'assets',
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
