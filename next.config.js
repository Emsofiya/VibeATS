/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdfjs-dist requires canvas as optional dep — alias it to false to avoid build errors
    config.resolve.alias.canvas = false
    return config
  },
  experimental: {
    serverComponentsExternalPackages: ['mammoth'],
  },
}

module.exports = nextConfig
