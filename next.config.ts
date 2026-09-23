import type { NextConfig } from "next";

// Extra dev origins (LAN IPs, tunnel hosts) come from .env.local so they never get committed.
// Example: DEV_ORIGINS="192.168.x.x,my-tunnel.trycloudflare.com"
const devOrigins = (process.env.DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const nextConfig: NextConfig = {
  allowedDevOrigins: devOrigins,
  typedRoutes: true
};

export default nextConfig;
