/** @type {import('next').NextConfig} */

// Where the Scala backend lives. Locally this falls back to localhost:8080;
// in production (Vercel) set BACKEND_URL to the deployed backend, e.g.
// https://sunnyside-api.onrender.com — no trailing slash.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8080'

const nextConfig = {
  // Proxy /api/* → backend. The rewrite runs server-side on Vercel, so the
  // browser only ever talks to the frontend's own domain — no CORS needed.
  // Frontend calls /api/goals → Next.js forwards to ${BACKEND_URL}/goals
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${BACKEND_URL}/:path*`,
      },
    ]
  },
}

module.exports = nextConfig
