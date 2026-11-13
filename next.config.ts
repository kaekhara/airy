import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Firebase Admin's Auth path pulls in jwks-rsa (CommonJS) which requires
  // jose (ESM). Bundle the SDK so Next's module bridge doesn't attempt a
  // CommonJS require of jose at function startup.
  transpilePackages: ['firebase-admin'],
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
    ];
  },
};

export default nextConfig;
