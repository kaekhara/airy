import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // This is the app shell for the legacy static experience. Always
        // revalidate it so a deployment cannot briefly resurrect old markup.
        source: '/upskill.html',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        // The main interaction bundle changes together with the app shell.
        source: '/upskill-app.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, max-age=0, must-revalidate',
          },
        ],
      },
      {
        source: '/images/mika/:path*',
        has: [
          {
            type: 'query',
            key: 'v',
            value: '(?<mikaAssetVersion>.+)',
          },
        ],
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Versioned static assets can be cached for a year. The HTML shell and
        // unversioned app bundle above remain revalidated to prevent stale UI.
        source: '/:path*',
        has: [
          {
            type: 'query',
            key: 'airy_asset_v',
            value: '(?<airyAssetVersion>.+)',
          },
        ],
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
