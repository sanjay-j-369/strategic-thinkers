/** @type {import('next').NextConfig} */
const backendInternalUrl = process.env.BACKEND_INTERNAL_URL || "http://backend:8000";

const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend-api/:path*",
        destination: `${backendInternalUrl}/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
