import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: 'src',
  base: '/flomington-refactored/',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
})
