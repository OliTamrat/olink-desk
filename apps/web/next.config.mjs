/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@olink-desk/database"],
  // Fleet convention: Windows dev machines OOM without this.
  experimental: { workerThreads: false, cpus: 1 },
};

export default nextConfig;
