import path from "node:path";
import type { NextConfig } from "next";

const workspaceRoot = path.join(__dirname, "../..");

const nextConfig: NextConfig = {
  // This app is a pure UI shell: all data comes from its paired BFF over HTTP.
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
};

export default nextConfig;
