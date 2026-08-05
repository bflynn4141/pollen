import { createMDX } from 'fumadocs-mdx/next'

const withMDX = createMDX()

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  // @pollen/data ships TypeScript source (shared with the pollen-api worker).
  transpilePackages: ['@pollen/data'],
}

export default withMDX(nextConfig)
