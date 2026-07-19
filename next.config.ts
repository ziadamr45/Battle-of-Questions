import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  env: {
    DATABASE_URL: process.env.DATABASE_URL || "postgresql://localhost:5432/placeholder",
    DIRECT_URL: process.env.DIRECT_URL || "postgresql://localhost:5432/placeholder",
    NEXT_PUBLIC_GAME_SERVICE_URL: process.env.NEXT_PUBLIC_GAME_SERVICE_URL || "http://localhost:3001",
    LIVEKIT_URL: process.env.LIVEKIT_URL || "http://localhost:7880",
    LIVEKIT_API_KEY: process.env.LIVEKIT_API_KEY || "placeholder",
    LIVEKIT_API_SECRET: process.env.LIVEKIT_API_SECRET || "placeholder",
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL || "ws://localhost:7880",
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "placeholder",
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "placeholder",
    NEXT_APP_URL: process.env.NEXT_APP_URL || "http://localhost:3000",
  },
  // Rewrite all non-API, non-static, non-_next paths to index page
  // so that client-side routing handles /about, /history, /create, /join etc.
  async rewrites() {
    return [
      {
        source: '/about',
        destination: '/',
      },
      {
        source: '/history',
        destination: '/',
      },
      {
        source: '/create',
        destination: '/',
      },
      {
        source: '/join',
        destination: '/',
      },
      {
        source: '/lobby',
        destination: '/',
      },
      {
        source: '/loading',
        destination: '/',
      },
      {
        source: '/game',
        destination: '/',
      },
      {
        source: '/results',
        destination: '/',
      },
      {
        source: '/round-transition',
        destination: '/',
      },
    ]
  },
};

export default nextConfig;
