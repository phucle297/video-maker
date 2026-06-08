import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app uses ffmpeg child_process + filesystem; keep it on the Node runtime.
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg"],
  experimental: {
    // We rely on Node fs/path extensively in the domain layer
    serverActions: {
      bodySizeLimit: "10mb", // generous for future video uploads
    },
  },
  // Allow the Effect runtime's longer-running operations
  // (Next.js may have its own timeout defaults we override here)
};

export default nextConfig;
