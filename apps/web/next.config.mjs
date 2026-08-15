/** @type {import('next').NextConfig} */
const nextConfig = {
  // Single self-contained image (ADR 0004): standalone output bundles the
  // server and its node_modules so the Docker image runs identically on
  // Cloud Run, Ethio Telecom ECS, and an on-prem box.
  output: "standalone",
  transpilePackages: [
    "@olink-desk/auth",
    "@olink-desk/channels",
    "@olink-desk/database",
    "@olink-desk/i18n",
  ],
  // Fleet convention: Windows dev machines OOM without this.
  experimental: { workerThreads: false, cpus: 1 },
};

export default nextConfig;
