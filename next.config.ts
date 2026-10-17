import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

// Production: `next build` writes plain static files to client/out, which the Express server serves,
// so the dashboard and its API deploy as one app.
// Development: `next dev` (port 3001) forwards /api calls to the Express server on port 3000.
export default function nextConfig(phase: string): NextConfig {
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    return {
      async rewrites() {
        return [{ source: '/api/:path*', destination: 'http://localhost:3000/api/:path*' }];
      },
    };
  }
  return { output: 'export' };
}
