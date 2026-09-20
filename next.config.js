/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow HMR / dev requests from the Mac's LAN IP (used when testing from
  // another device or via the machine IP). Without this, Next blocks the
  // non-localhost Origin and browsers surface it as an HMR WebSocket
  // ERR_INVALID_HTTP_RESPONSE.
  allowedDevOrigins: ['192.168.1.198'],
};

module.exports = nextConfig;
