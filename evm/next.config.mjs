/** @type {import('next').NextConfig} */
const nextConfig = {
  // 🚨 開発サーバー時のみ.next-devを使用（ビルドとの競合回避）
  distDir: process.env.NEXT_DEV_SERVER === "true" ? ".next-dev" : ".next",
  experimental: {
    optimizePackageImports: ["wagmi", "viem"],
  },
  transpilePackages: ["wagmi", "viem"],
  // Next.js 16: Server Components bundlingから除外するパッケージ
  serverExternalPackages: ["pino-pretty", "lokijs", "encoding"],
};

export default nextConfig;
