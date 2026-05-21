/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable the default undici / fetch body-read timeout for server routes.
  // Without this, long-lived SSE proxy streams time out after ~5 minutes.
  experimental: {
    proxyTimeout: 0, // 0 = no timeout
  },
  httpAgentOptions: {
    keepAlive: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "api.dicebear.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
