/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@agterra/ui"],
  // Same-origin proxy to the API so browser-side TanStack Query calls never
  // hit localhost:3001 directly. The API (apps/api/src/main.ts) has no CORS
  // middleware configured — that's a backend concern this app doesn't own —
  // so rewriting client requests through the Next.js dev/prod server keeps
  // them same-origin instead of requiring a backend change. Server Components
  // fetch the API directly (server-to-server, no browser CORS involved).
  async rewrites() {
    const apiUrl = process.env.API_URL ?? "http://localhost:3001";
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;
