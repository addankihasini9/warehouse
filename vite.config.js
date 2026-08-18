import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'ui',
  plugins: [react()],
  server: {
    fs: {
      // Allow serving files from one level up to the project root
      // This is needed to import the JSON reports which are in ../reports/
      allow: ['..']
    }
  },
  resolve: {
    alias: {
      '@reports': path.resolve(__dirname, './reports')
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
})
