import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'export',
  distDir: '.next',
  images: { unoptimized: true }
};
export default nextConfig;
