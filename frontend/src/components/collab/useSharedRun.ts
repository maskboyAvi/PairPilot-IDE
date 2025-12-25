import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { DEFAULT_SHARED_RUN, type SharedRunState } from "@/components/collab/runTypes";
import { usernameFromUser } from "@/components/collab/username";
import { getRunnerWorkerSource } from "@/components/collab/runnerWorkerSource";

export function useSharedRun(params: {
  roomId: string;
  ydoc: Y.Doc;
  yRun: Y.Map<unknown>;
  yStdout: Y.Text;
  yStderr: Y.Text;
  yRuns: Y.Array<unknown>;
  editorRef: React.MutableRefObject<import("monaco-editor").editor.IStandaloneCodeEditor | null>;
  selectedLanguage: SharedRunState["language"];
  setSelectedLanguage: (v: SharedRunState["language"]) => void;
  effectiveRole: "viewer" | "editor";
  isSynced: boolean;
}) {
  const {
    roomId,
    ydoc,
    yRun,
    yStdout,
    yStderr,
    yRuns,
    editorRef,
    selectedLanguage,
    setSelectedLanguage,
    effectiveRole,
    isSynced,
  } = params;

  const runWorkerRef = useRef<Worker | null>(null);
  const runTimeoutRef = useRef<number | null>(null);
  const workerUrlRef = useRef<string | null>(null);

  const [sharedRun, setSharedRun] = useState<SharedRunState>(DEFAULT_SHARED_RUN);
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [runsSnapshot, setRunsSnapshot] = useState<unknown[]>([]);

  const isRunBusy = sharedRun.state === "starting" || sharedRun.state === "running";

  useEffect(() => {
    return () => {
      if (runTimeoutRef.current != null) {
        window.clearTimeout(runTimeoutRef.current);
        runTimeoutRef.current = null;
      }

      try {
        runWorkerRef.current?.terminate();
      } catch {
        // ignore
      }
      runWorkerRef.current = null;

      if (workerUrlRef.current) {
        try {
          URL.revokeObjectURL(workerUrlRef.current);
        } catch {
          // ignore
        }
        workerUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const applyRunSnapshot = () => {
      const next: SharedRunState = {
        state: (yRun.get("state") as SharedRunState["state"]) ?? "idle",
        runId: (yRun.get("runId") as string | null) ?? null,
        runBy: (yRun.get("runBy") as string | null) ?? null,
        language: (yRun.get("language") as SharedRunState["language"]) ?? "python",
        phase: (yRun.get("phase") as string | null) ?? null,
        message: (yRun.get("message") as string | null) ?? null,
        rateLimitLimit: (yRun.get("rateLimitLimit") as number | null) ?? null,
        rateLimitWindowSec: (yRun.get("rateLimitWindowSec") as number | null) ?? null,
        rateLimitRemaining: (yRun.get("rateLimitRemaining") as number | null) ?? null,
        rateLimitResetMs: (yRun.get("rateLimitResetMs") as number | null) ?? null,
        elapsedMs: (yRun.get("elapsedMs") as number | null) ?? null,
        stdoutBytes: (yRun.get("stdoutBytes") as number | null) ?? null,
        stderrBytes: (yRun.get("stderrBytes") as number | null) ?? null,
        error: (yRun.get("error") as string | null) ?? null,
      };
      setSharedRun(next);

      if (
        next.state === "idle" ||
        next.state === "finished" ||
        next.state === "canceled" ||
        next.state === "error"
      ) {
        setSelectedLanguage(next.language);
      }
    };

    const applyOutputSnapshot = () => {
      setStdout(yStdout.toString());
      setStderr(yStderr.toString());
    };

    const applyRunsSnapshot = () => {
      setRunsSnapshot(yRuns.toArray() as unknown[]);
    };

    applyRunSnapshot();
    applyOutputSnapshot();
    applyRunsSnapshot();

    const onRun = () => applyRunSnapshot();
    const onOut = () => applyOutputSnapshot();
    const onErr = () => applyOutputSnapshot();
    const onRuns = () => applyRunsSnapshot();

    yRun.observe(onRun);
    yStdout.observe(onOut);
    yStderr.observe(onErr);
    yRuns.observe(onRuns);

    return () => {
      yRun.unobserve(onRun);
      yStdout.unobserve(onOut);
      yStderr.unobserve(onErr);
      yRuns.unobserve(onRuns);
    };
  }, [setSelectedLanguage, yRun, yRuns, yStderr, yStdout]);

  const cleanupWorker = (worker: Worker, workerUrl: string) => {
    try {
      worker.terminate();
    } catch {
      // ignore
    }
    runWorkerRef.current = null;
    try {
      URL.revokeObjectURL(workerUrl);
    } catch {
      // ignore
    }
    if (workerUrlRef.current === workerUrl) {
      workerUrlRef.current = null;
    }
  };

  const cancelRun = () => {
    const current = (yRun.get("state") as string) || "idle";
    if (current !== "starting" && current !== "running") return;

    if (runTimeoutRef.current != null) {
      window.clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
    runWorkerRef.current?.terminate();
    runWorkerRef.current = null;

    ydoc.transact(() => {
      yRun.set("state", "canceled");
      yRun.set("phase", "canceled");
      yRun.set("message", "Canceled");
      yRun.set("error", null);
    });
  };

  const runCode = async () => {
    const current = (yRun.get("state") as string) || "idle";
    if (current === "starting" || current === "running") return;

    if (effectiveRole !== "editor") return;
    if (!isSynced) return;

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session) {
      yRun.set("state", "error");
      const msg = "Missing auth session. Please sign in again.";
      yRun.set("error", msg);
      yStderr.insert(yStderr.length, msg + "\n");
      return;
    }

    // Server-enforced (but fail-open) rate limit.
    try {
      const rlRes = await fetch("/api/ratelimit/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId }),
      });

      if (rlRes.status === 429) {
        let limit: number | null = null;
        let windowSec: number | null = null;
        let remaining: number | null = null;
        let resetMs: number | null = null;

        try {
          const data = (await rlRes.json()) as Partial<{
            allowed: boolean;
            remaining: number;
            reset: number;
            limit: number;
            windowSec: number;
          }>;
          if (typeof data.limit === "number") limit = data.limit;
          if (typeof data.windowSec === "number") windowSec = data.windowSec;
          if (typeof data.remaining === "number") remaining = data.remaining;
          if (typeof data.reset === "number") {
            // Upstash reset is typically a unix timestamp in ms.
            resetMs = data.reset > 1e12 ? data.reset : data.reset * 1000;
          }
        } catch {
          // ignore parse failures
        }

        const windowLabel =
          typeof windowSec === "number" ? `${windowSec}s` : "60s";
        const limitLabel = typeof limit === "number" ? String(limit) : "";
        const msg = limitLabel
          ? `Rate limit reached: ${limitLabel} run per ${windowLabel}.`
          : `Rate limit reached. Please wait and try again.`;

        ydoc.transact(() => {
          // Not a run failure; it's just a temporary throttle.
          yRun.set("state", "idle");
          yRun.set("phase", "rate-limited");
          yRun.set("message", msg);
          yRun.set("error", null);
          yRun.set("rateLimitLimit", limit);
          yRun.set("rateLimitWindowSec", windowSec);
          yRun.set("rateLimitRemaining", remaining);
          yRun.set("rateLimitResetMs", resetMs);
        });
        return;
      }
    } catch {
      // fail-open
    }

    const me = usernameFromUser(session?.user);

    const language = selectedLanguage;

    if (runTimeoutRef.current != null) {
      window.clearTimeout(runTimeoutRef.current);
      runTimeoutRef.current = null;
    }
    runWorkerRef.current?.terminate();
    runWorkerRef.current = null;

    const runId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    ydoc.transact(() => {
      yRun.set("state", "starting");
      yRun.set("runBy", me);
      yRun.set("runId", runId);
      yRun.set("language", language);
      yRun.set("phase", "starting");
      yRun.set("message", "Starting run (in browser)…");
      yRun.set("rateLimitLimit", null);
      yRun.set("rateLimitWindowSec", null);
      yRun.set("rateLimitRemaining", null);
      yRun.set("rateLimitResetMs", null);
      yRun.set("elapsedMs", null);
      yRun.set("stdoutBytes", 0);
      yRun.set("stderrBytes", 0);
      yRun.set("error", null);
      if (yStdout.length > 0) yStdout.delete(0, yStdout.length);
      if (yStderr.length > 0) yStderr.delete(0, yStderr.length);
    });

    const code =
      editorRef.current?.getValue() ?? ydoc.getText("monaco").toString();

    ydoc.transact(() => {
      yRun.set("state", "running");
      yRun.set("phase", language === "python" ? "loading" : "running");
      yRun.set(
        "message",
        language === "python"
          ? "Loading Python runtime (Pyodide)…"
          : "Running JavaScript…"
      );
    });

    const workerSource = getRunnerWorkerSource();

    const blob = new Blob([workerSource], { type: "text/javascript" });
    const workerUrl = URL.createObjectURL(blob);
    workerUrlRef.current = workerUrl;

    let worker: Worker;
    try {
      worker = new Worker(workerUrl);
    } catch (e) {
      try {
        URL.revokeObjectURL(workerUrl);
      } catch {
        // ignore
      }
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Failed to start code runner";
      ydoc.transact(() => {
        yRun.set("state", "error");
        yRun.set("error", String(msg));
        yRun.set("phase", "error");
        yRun.set("message", "Error");
        yStderr.insert(yStderr.length, String(msg) + "\n");
        yRun.set("stderrBytes", yStderr.length);
      });
      return;
    }

    runWorkerRef.current = worker;

    const timeoutMs = language === "python" ? 20000 : 8000;
    runTimeoutRef.current = window.setTimeout(() => {
      cleanupWorker(worker, workerUrl);
      runTimeoutRef.current = null;
      ydoc.transact(() => {
        yRun.set("state", "error");
        yRun.set("error", `Run timed out after ${timeoutMs}ms`);
        yRun.set("phase", "timeout");
        yRun.set("message", "Timed out");
        yStderr.insert(yStderr.length, `Run timed out after ${timeoutMs}ms\n`);
        yRun.set("stderrBytes", yStderr.length);
      });
    }, timeoutMs);

    worker.onmessage = (evt: MessageEvent<unknown>) => {
      const data = evt.data;
      if (!data || typeof data !== "object") return;
      const msg = data as Record<string, unknown>;
      const type = msg.type;
      if (type !== "stdout" && type !== "stderr" && type !== "phase" && type !== "error" && type !== "finished") {
        return;
      }

      if (type === "stdout") {
        const chunk = String(msg.data ?? "");
        if (chunk) yStdout.insert(yStdout.length, chunk);
        yRun.set("stdoutBytes", yStdout.length);
      } else if (type === "stderr") {
        const chunk = String(msg.data ?? "");
        if (chunk) yStderr.insert(yStderr.length, chunk);
        yRun.set("stderrBytes", yStderr.length);
      } else if (type === "phase") {
        ydoc.transact(() => {
          yRun.set("phase", msg.phase ?? null);
          yRun.set("message", msg.message ?? null);
        });
      } else if (type === "error") {
        if (runTimeoutRef.current != null) {
          window.clearTimeout(runTimeoutRef.current);
          runTimeoutRef.current = null;
        }
        cleanupWorker(worker, workerUrl);
        ydoc.transact(() => {
          yRun.set("state", "error");
          yRun.set("error", msg.message ?? "Run error");
          yRun.set("phase", "error");
          yRun.set("message", "Error");
          const text = String(msg.message ?? "Run error").trim();
          if (text) {
            const suffix = text.endsWith("\n") ? "" : "\n";
            yStderr.insert(yStderr.length, text + suffix);
            yRun.set("stderrBytes", yStderr.length);
          }
        });
      } else if (type === "finished") {
        if (runTimeoutRef.current != null) {
          window.clearTimeout(runTimeoutRef.current);
          runTimeoutRef.current = null;
        }
        cleanupWorker(worker, workerUrl);

        ydoc.transact(() => {
          const cur = (yRun.get("state") as string) || "idle";
          if (cur !== "error" && cur !== "canceled") yRun.set("state", "finished");
          yRun.set("elapsedMs", Number(msg.elapsedMs ?? null));
          yRun.set("phase", "finished");
          yRun.set("message", "Finished");
        });

        try {
          const snap = {
            runId: (yRun.get("runId") as string | null) ?? null,
            runBy: (yRun.get("runBy") as string | null) ?? null,
            language: (yRun.get("language") as string) ?? "python",
            state: (yRun.get("state") as string) ?? "finished",
            finishedAt: new Date().toISOString(),
            elapsedMs: (yRun.get("elapsedMs") as number | null) ?? null,
            stdoutBytes: (yRun.get("stdoutBytes") as number | null) ?? null,
            stderrBytes: (yRun.get("stderrBytes") as number | null) ?? null,
          };
          ydoc.transact(() => {
            yRuns.push([snap]);
            const max = 10;
            if (yRuns.length > max) yRuns.delete(0, yRuns.length - max);
          });
        } catch {
          // ignore history errors
        }
      }
    };

    worker.onmessageerror = () => {
      if (runTimeoutRef.current != null) {
        window.clearTimeout(runTimeoutRef.current);
        runTimeoutRef.current = null;
      }
      cleanupWorker(worker, workerUrl);
      ydoc.transact(() => {
        yRun.set("state", "error");
        const text = "Worker message decode error (structured clone failed)";
        yRun.set("error", text);
        yStderr.insert(yStderr.length, text + "\n");
        yRun.set("stderrBytes", yStderr.length);
      });
    };

    worker.onerror = (evt: ErrorEvent) => {
      if (runTimeoutRef.current != null) {
        window.clearTimeout(runTimeoutRef.current);
        runTimeoutRef.current = null;
      }
      const parts: string[] = [];

      if (evt.message) parts.push(String(evt.message));
      if (evt.filename) parts.push(String(evt.filename));
      if (typeof evt.lineno === "number") parts.push(`:${evt.lineno}`);
      if (typeof evt.colno === "number") parts.push(`:${evt.colno}`);

      cleanupWorker(worker, workerUrl);
      ydoc.transact(() => {
        yRun.set("state", "error");
        const text = parts.length
          ? `Worker error: ${parts.join(" ")}`
          : "Worker error while executing code";
        yRun.set("error", text);
        yStderr.insert(yStderr.length, text + "\n");
        yRun.set("stderrBytes", yStderr.length);
      });
    };

    worker.postMessage({ language, code });
  };

  return {
    sharedRun,
    stdout,
    stderr,
    runsSnapshot,
    isRunBusy,
    cancelRun,
    runCode,
  };
}
