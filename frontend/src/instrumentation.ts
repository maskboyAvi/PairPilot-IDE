import * as Sentry from "@sentry/nextjs";

// Next.js App Router hook used by Sentry to initialize on the server/edge.
// With a /src directory, this file must live at src/instrumentation.ts.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Let Sentry capture errors which happen during request handling (server/edge).
export const onRequestError = Sentry.captureRequestError;
