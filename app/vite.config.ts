import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// BASE_PATH is set by the GitHub Pages workflow (project sites serve from /<repo>/).
export default defineConfig({
  plugins: [react()],
  base: process.env.BASE_PATH ?? '/',
})
