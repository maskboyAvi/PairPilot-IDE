import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

export default withSentryConfig(
  nextConfig,
  {
    // Route Sentry browser requests through your server (avoids ad-blockers).
    tunnelRoute: "/monitoring",
    silent: true,
  }
);
