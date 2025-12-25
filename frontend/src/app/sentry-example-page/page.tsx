"use client";

import { useMemo, useState } from "react";
import * as Sentry from "@sentry/nextjs";

export default function SentryExamplePage() {
  const [status, setStatus] = useState<string>("");
  const dsnPresent = useMemo(() => {
    // In the browser bundle, only NEXT_PUBLIC_* env vars are available.
    return !!process.env.NEXT_PUBLIC_SENTRY_DSN;
  }, []);

  return (
    <main style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
        Sentry Example Page
      </h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Use the buttons below to trigger an error/event and verify it shows up
        in your Sentry project.
      </p>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={async () => {
            const err = new Error("Sentry Frontend Example Error");
            setStatus("Sending exception to Sentry…");

            try {
              Sentry.captureException(err);
              const ok = await Sentry.flush(2000);
              setStatus(
                ok
                  ? "Exception sent (check Sentry → Issues)."
                  : "Flush timed out. Check network/adblock and DSN."
              );
            } catch (e) {
              setStatus(
                `Failed to send: ${
                  e instanceof Error ? e.message : "unknown error"
                }`
              );
            }

            // Still throw so you can see Next's overlay during dev.
            throw err;
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Throw client error
        </button>

        <button
          type="button"
          onClick={async () => {
            setStatus("Sending test message to Sentry…");

            try {
              Sentry.captureMessage(
                "Sentry test message from /sentry-example-page",
                {
                  level: "info",
                }
              );
              const ok = await Sentry.flush(2000);
              setStatus(
                ok
                  ? "Message sent (check Sentry → Issues / Events)."
                  : "Flush timed out. Check network/adblock and DSN."
              );
            } catch (e) {
              setStatus(
                `Failed to send: ${
                  e instanceof Error ? e.message : "unknown error"
                }`
              );
            }
          }}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.12)",
            background: "rgba(255,255,255,0.06)",
            color: "inherit",
            cursor: "pointer",
          }}
        >
          Send test message
        </button>
      </div>

      <p style={{ opacity: 0.7, marginTop: 16, fontSize: 13 }}>
        If Sentry is configured correctly, you should see an Issue (from the
        thrown error) or an Event (from the test message) in your Sentry
        dashboard.
      </p>

      <div
        style={{
          marginTop: 14,
          padding: "10px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.10)",
          background: "rgba(0,0,0,0.25)",
          fontSize: 13,
          lineHeight: 1.4,
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>Status</div>
        <div style={{ opacity: 0.85 }}>{status || "—"}</div>
        <div style={{ opacity: 0.7, marginTop: 8 }}>
          DSN available in browser: {dsnPresent ? "yes" : "no"}
        </div>
        <div style={{ opacity: 0.7, marginTop: 6 }}>
          If nothing arrives in Sentry: check the browser Network tab for
          requests to `ingest.*.sentry.io` and disable ad blockers for
          `localhost`.
        </div>
      </div>
    </main>
  );
}
