import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */

  // `api/measure.py` is a Vercel Python function living outside `app/` on purpose (see
  // AGENTS.md); `next dev` has no route for it and 404s, which `lib/api.ts` turns into
  // PipelineUnavailableError and the capture page silently swallows by falling back to the
  // `/api/scan` stub — a local run then looks live while measuring nothing. In development
  // only, send the route to `scripts/serve_measure.py` instead. Production is untouched: no
  // rewrite is added, so Vercel's real Python function keeps answering.
  async rewrites() {
    if (process.env.NODE_ENV !== "development") return [];
    return [{ source: "/api/measure", destination: "http://127.0.0.1:8000/api/measure" }];
  },
};

export default nextConfig;
