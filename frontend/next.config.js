/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proxy /api/* → backend at localhost:8080
  // This avoids CORS issues in development.
  // Frontend calls /api/goals → Next.js forwards to http://localhost:8080/goals
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:8080/:path*',
      },
    ]
  },
}

module.exports = nextConfig
