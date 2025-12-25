export type SharedRunState = {
  state: "idle" | "starting" | "running" | "finished" | "error" | "canceled";
  runId: string | null;
  runBy: string | null;
  language: "python" | "javascript";
  phase: string | null;
  message: string | null;
  rateLimitLimit: number | null;
  rateLimitWindowSec: number | null;
  rateLimitRemaining: number | null;
  rateLimitResetMs: number | null;
  elapsedMs: number | null;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  error: string | null;
};

export const DEFAULT_SHARED_RUN: SharedRunState = {
  state: "idle",
  runId: null,
  runBy: null,
  language: "python",
  phase: null,
  message: null,
  rateLimitLimit: null,
  rateLimitWindowSec: null,
  rateLimitRemaining: null,
  rateLimitResetMs: null,
  elapsedMs: null,
  stdoutBytes: null,
  stderrBytes: null,
  error: null,
};
