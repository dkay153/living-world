import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  agentRules: false,
  output: 'export',
  generateBuildId: async () => process.env.LW_RELEASE_BUILD_ID || 'living-world-local',
  // Next 16.4 already puts development output in .next/dev. Use that native
  // separation instead of a second custom cache and a Webpack-only override.
  distDir: '.next',
  images: { unoptimized: true }
};
export default nextConfig;
