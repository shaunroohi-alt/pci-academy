import type { NextConfig } from 'next'

// Static export: the app is served from GitHub Pages (or any static host).
// BASE_PATH is set by the Pages workflow, e.g. "/pci-academy/".
const basePath = (process.env.BASE_PATH ?? '').replace(/\/+$/, '')

const config: NextConfig = {
  output: 'export',
  basePath: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
}

export default config
