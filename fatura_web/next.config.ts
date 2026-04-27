import type { NextConfig } from "next";
import path from "node:path";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "logo.clearbit.com", pathname: "/**" }],
  },
  turbopack: {
    // Kullanıcı profilinde ekstra lockfile'lar olabildiği için Turbopack root'u
    // bu Next.js projesinin klasörüne sabitliyoruz (uyarıyı susturur).
    root: path.dirname(fileURLToPath(import.meta.url)),
  },
};

export default nextConfig;
