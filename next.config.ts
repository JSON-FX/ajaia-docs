import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * isomorphic-dompurify pulls in jsdom, which resolves several of its internals through
   * dynamic requires. Next's bundler cannot trace those statically, so on Vercel the
   * function bundle shipped without them and every route importing lib/sanitize.ts threw
   * at module load — a 500 on PATCH and upload, while routes that didn't import it were
   * fine. It reproduced only on Vercel, never on `next start` locally, because a local
   * production server can still fall back to node_modules on disk.
   *
   * Opting the package out of bundling makes it a native Node require, which Vercel's
   * file tracing follows correctly.
   */
  serverExternalPackages: ["isomorphic-dompurify"],
};

export default nextConfig;
