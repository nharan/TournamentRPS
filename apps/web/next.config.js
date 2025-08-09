/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_ATPROTO_APPVIEW_HOST: process.env.ATPROTO_APPVIEW_HOST || 'api.bsky.app',
    NEXT_PUBLIC_SIGNALING_WS: process.env.SIGNALING_WS || 'ws://localhost:8081/ws',
    NEXT_PUBLIC_COORDINATOR_HTTP: process.env.COORDINATOR_HTTP || 'http://localhost:8082',
    NEXT_PUBLIC_MATCH_ENGINE_HTTP: process.env.MATCH_ENGINE_HTTP || 'http://localhost:8083',
  },
};
module.exports = nextConfig;
