import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Production: `next build` writes plain static files to out/. Either the backend serves them (the
// dashboard and its API on one address), or a static host does, with NEXT_PUBLIC_API_URL set (.env.example).
// Development: `next dev` (port 3001) forwards /api calls to the backend on port 3000.
// This folder is its own project (own git repository and node_modules), even inside the backend's folder.
export default function nextConfig(phase: string): NextConfig {
  const turbopack = { root: __dirname };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      turbopack,
      async rewrites() {
        return [{ source: '/api/:path*', destination: 'http://localhost:3000/api/:path*' }];
      },
    };
  }
  return { output: 'export', turbopack };
}
