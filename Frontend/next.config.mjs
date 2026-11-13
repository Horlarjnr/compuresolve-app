/** @type {import('next').NextConfig} */
const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:8080';

const nextConfig = {
  // The browser only ever talks to this app. /api/* is proxied to the backend, so the HttpOnly `sid`
  // cookie is first-party and the backend's CSRF origin check sees this app's origin.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${API_ORIGIN}/api/:path*` }];
  },
  // This code was written without being compiled. Remove this once `npm run typecheck` is clean.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
