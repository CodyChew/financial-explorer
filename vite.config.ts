import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/financial-explorer/', // Set base path for GitHub Pages
  plugins: [react()],
})
