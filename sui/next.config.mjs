/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🚨 開発サーバー時のみ.next-devを使用（ビルドとの競合回避）
  distDir: process.env.NEXT_DEV_SERVER === "true" ? ".next-dev" : ".next",
  experimental: {
    optimizePackageImports: ["@mysten/dapp-kit"],
  },
  transpilePackages: ["@mysten/dapp-kit"],
  // Next.js 15: Server Components bundlingから除外するパッケージ
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
  webpack: (config, { nextRuntime }) => {

    // Skip WASM handling for edge runtime
    if (nextRuntime === 'edge') {
      return config;
    }

    // WASM support for client and server (nodejs) runtime only
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Ensure WASM files are properly handled
    config.module.rules.push({
      test: /\.wasm$/,
      type: 'webassembly/async',
    });

    return config;
  },

  // Static file serving for WASM
  async headers() {
    return [
      {
        source: '/wasm/:path*',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
      {
        source: '/circuits/:path*.wasm',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/wasm',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
