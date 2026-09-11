/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@agterra/ui"],
  // Same same-origin API proxy as investor-web's next.config.mjs (see that
  // file's comment) — the API has no CORS middleware, so client-side calls
  // go through this rewrite instead. Also declared under turbo.json's
  // build task `env` array (matching the fix already applied there for
  // investor-web's API_URL), so `next build` actually sees the value.
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
