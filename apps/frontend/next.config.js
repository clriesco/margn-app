/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    typedRoutes: true
  },
  webpack: (config, { isServer }) => {
    // Enable Web Workers with new Worker(new URL(..., import.meta.url))
    if (!isServer) {
      config.output.workerChunkLoading = 'import';
    }
    return config;
  },
};

module.exports = nextConfig;
