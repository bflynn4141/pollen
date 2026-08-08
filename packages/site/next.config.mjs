import { createMDX } from 'fumadocs-mdx/next'
import { fileURLToPath } from 'node:url'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
  // @pollen/data ships TypeScript source (shared with the pollen-api worker).
  transpilePackages: ['@pollen/data'],
}

export default withMDX(nextConfig)
