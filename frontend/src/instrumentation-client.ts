import * as Sentry from "@sentry/nextjs";

// Next.js App Router hook that runs in the browser.
// With a /src directory, this file must live at src/instrumentation-client.ts.

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: !!dsn,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
  debug: process.env.NODE_ENV !== "production",
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
