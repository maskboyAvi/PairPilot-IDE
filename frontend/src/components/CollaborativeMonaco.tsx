"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import type * as Monaco from "monaco-editor";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Props = {
  roomId: string;
};

const DEFAULT_WS_URL = "ws://localhost:1234";
const DEFAULT_ENGINE_URL = "http://localhost:8080";

type SharedRunState = {
  state: "idle" | "starting" | "running" | "finished" | "error" | "canceled";
  runId: string | null;
  runBy: string | null;
  language: "python" | "javascript";
  phase: string | null;
  message: string | null;
  prepMs: number | null;
  elapsedMs: number | null;
  stdoutBytes: number | null;
  stderrBytes: number | null;
  error: string | null;
};

const DEFAULT_SHARED_RUN: SharedRunState = {
  state: "idle",
  runId: null,
  runBy: null,
  language: "python",
  phase: null,
  message: null,
  prepMs: null,
  elapsedMs: null,
  stdoutBytes: null,
  stderrBytes: null,
  error: null,
};

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  const fixed = i === 0 ? Math.round(v).toString() : v.toFixed(v >= 10 ? 1 : 2);
  return `${fixed} ${units[i]}`;
}

function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function donutParts(
  stdoutBytes: number,
  stderrBytes: number
): {
  outPct: number;
  errPct: number;
} {
  const total = Math.max(1, stdoutBytes + stderrBytes);
  const outPct = Math.round((stdoutBytes / total) * 100);
  const errPct = 100 - outPct;
  return { outPct, errPct };
}

function Donut({
  stdoutBytes,
  stderrBytes,
}: {
  stdoutBytes: number;
  stderrBytes: number;
}) {
  const size = 34;
  const r = 14;
  const c = 2 * Math.PI * r;
  const { outPct } = donutParts(stdoutBytes, stderrBytes);
  const outLen = (outPct / 100) * c;
  const errLen = c - outLen;
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden="true">
      <circle
        cx="17"
        cy="17"
        r={r}
        fill="none"
        stroke="var(--foreground)"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <g transform="rotate(-90 17 17)">
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="var(--foreground)"
          strokeWidth="4"
          strokeDasharray={`${outLen} ${c}`}
          strokeLinecap="round"
        />
        <circle
          cx="17"
          cy="17"
          r={r}
          fill="none"
          stroke="#b00020"
          strokeWidth="4"
          strokeDasharray={`${errLen} ${c}`}
          strokeDashoffset={-outLen}
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function CollaborativeMonaco({ roomId }: Props) {
  const wsUrl = process.env.NEXT_PUBLIC_YJS_WS_URL || DEFAULT_WS_URL;
  const engineUrl = process.env.NEXT_PUBLIC_ENGINE_URL || DEFAULT_ENGINE_URL;

  const ydoc = useMemo(() => new Y.Doc(), []);
  const yRun = useMemo(() => ydoc.getMap<unknown>("run"), [ydoc]);
  const yStdout = useMemo(() => ydoc.getText("run:stdout"), [ydoc]);
  const yStderr = useMemo(() => ydoc.getText("run:stderr"), [ydoc]);
  const yRuns = useMemo(() => ydoc.getArray<unknown>("runs"), [ydoc]);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const editorRef = useRef<
    import("monaco-editor").editor.IStandaloneCodeEditor | null
  >(null);
  const runWsRef = useRef<WebSocket | null>(null);
  const lastWsMsgAtRef = useRef<number>(0);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  const [sharedRun, setSharedRun] =
    useState<SharedRunState>(DEFAULT_SHARED_RUN);
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");

  const [selectedLanguage, setSelectedLanguage] =
    useState<SharedRunState["language"]>("python");

  const isRunBusy =
    sharedRun.state === "starting" || sharedRun.state === "running";

  const isDockerRelated =
    sharedRun.prepMs != null ||
    sharedRun.phase === "preparing" ||
    (sharedRun.message?.toLowerCase().includes("docker") ?? false);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let provider: WebsocketProvider | null = null;

    const start = async () => {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      const token = session?.access_token;
      if (error || !token) {
        setStatus("error");
        return;
      }

      provider = new WebsocketProvider(wsUrl, `pairpilot:${roomId}`, ydoc, {
        connect: true,
        params: { token },
      });

      providerRef.current = provider;

      const updateStatus = () => {
        // y-websocket uses ws-readyState numbers. Keep it simple.
        const state = provider?.ws?.readyState;
        if (state === 0) setStatus("connecting");
        else if (state === 1) setStatus("connected");
        else if (state === 3) setStatus("disconnected");
      };

      updateStatus();

      provider.on("status", ({ status }) => {
        if (status === "connected") setStatus("connected");
        else if (status === "disconnected") setStatus("disconnected");
        else setStatus("connecting");
      });

      provider.on("connection-error", () => {
        setStatus("error");
      });

      // Initialize shared run state if missing.
      if (!yRun.has("state")) {
        ydoc.transact(() => {
          yRun.set("state", "idle");
          yRun.set("runId", null);
          yRun.set("runBy", null);
          yRun.set("language", "python");
          yRun.set("phase", null);
          yRun.set("message", null);
          yRun.set("prepMs", null);
          yRun.set("elapsedMs", null);
          yRun.set("stdoutBytes", null);
          yRun.set("stderrBytes", null);
          yRun.set("error", null);
        });
      }

      // Initialize run history container.
      if (yRuns.length === 0) {
        // no-op: we only append entries; leaving empty is fine.
      }
    };

    void start();

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;

      runWsRef.current?.close();
      runWsRef.current = null;

      provider?.destroy();
      providerRef.current = null;

      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, wsUrl]);

  useEffect(() => {
    const applyRunSnapshot = () => {
      const next: SharedRunState = {
        state: (yRun.get("state") as SharedRunState["state"]) ?? "idle",
        runId: (yRun.get("runId") as string | null) ?? null,
        runBy: (yRun.get("runBy") as string | null) ?? null,
        language:
          (yRun.get("language") as SharedRunState["language"]) ?? "python",
        phase: (yRun.get("phase") as string | null) ?? null,
        message: (yRun.get("message") as string | null) ?? null,
        prepMs: (yRun.get("prepMs") as number | null) ?? null,
        elapsedMs: (yRun.get("elapsedMs") as number | null) ?? null,
        stdoutBytes: (yRun.get("stdoutBytes") as number | null) ?? null,
        stderrBytes: (yRun.get("stderrBytes") as number | null) ?? null,
        error: (yRun.get("error") as string | null) ?? null,
      };
      setSharedRun(next);

      // Keep local selector in sync when idle (so the UI reflects last used language).
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

    applyRunSnapshot();
    applyOutputSnapshot();

    const onRun = () => applyRunSnapshot();
    const onOut = () => applyOutputSnapshot();
    const onErr = () => applyOutputSnapshot();
    yRun.observe(onRun);
    yStdout.observe(onOut);
    yStderr.observe(onErr);

    return () => {
      yRun.unobserve(onRun);
      yStdout.unobserve(onOut);
      yStderr.unobserve(onErr);
    };
  }, [yRun, yStdout, yStderr]);

  const cancelRun = async () => {
    const runId = (yRun.get("runId") as string | null) ?? null;
    if (!runId) return;

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (error || !token) {
      ydoc.transact(() => {
        yRun.set("state", "error");
        yRun.set("error", "Missing auth session. Please sign in again.");
      });
      return;
    }

    // Show immediate feedback in the shared overlay.
    ydoc.transact(() => {
      yRun.set("phase", "canceling");
      yRun.set("message", "Cancel requested…");
    });

    try {
      await fetch(`${engineUrl}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch {
      // Best-effort: if this fails, the runner will still time out or finish.
    }
  };

  const runCode = async () => {
    const current = (yRun.get("state") as string) || "idle";
    if (current === "starting" || current === "running") return;

    runWsRef.current?.close();
    runWsRef.current = null;

    const supabase = createSupabaseBrowserClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    const token = session?.access_token;
    if (error || !token) {
      yRun.set("state", "error");
      yRun.set("error", "Missing auth session. Please sign in again.");
      return;
    }

    const me = session?.user?.email || session?.user?.id || "Someone";

    const language = selectedLanguage;

    // Freeze for everyone (shared state), clear shared output, and mark who started it.
    ydoc.transact(() => {
      yRun.set("state", "starting");
      yRun.set("runBy", me);
      yRun.set("runId", null);
      yRun.set("language", language);
      yRun.set("phase", "starting");
      yRun.set("message", "Starting run…");
      yRun.set("prepMs", null);
      yRun.set("elapsedMs", null);
      yRun.set("stdoutBytes", 0);
      yRun.set("stderrBytes", 0);
      yRun.set("error", null);
      if (yStdout.length > 0) yStdout.delete(0, yStdout.length);
      if (yStderr.length > 0) yStderr.delete(0, yStderr.length);
    });

    const code =
      editorRef.current?.getValue() ?? ydoc.getText("monaco").toString();

    let executeRes: Response;
    try {
      executeRes = await fetch(`${engineUrl}/v1/execute`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          language,
          code,
          stdin: "",
          args: [],
          timeoutMs: 8000,
        }),
      });
    } catch (e) {
      yRun.set("state", "error");
      yRun.set("error", `Failed to reach engine at ${engineUrl}`);
      return;
    }

    if (!executeRes.ok) {
      const text = await executeRes.text().catch(() => "");
      yRun.set("state", "error");
      yRun.set("error", text || `Engine error (${executeRes.status})`);
      return;
    }

    const body = (await executeRes.json()) as { runId?: string };
    if (!body.runId) {
      yRun.set("state", "error");
      yRun.set("error", "Engine returned no runId");
      return;
    }

    ydoc.transact(() => {
      yRun.set("runId", body.runId);
      yRun.set("state", "running");
      yRun.set("phase", "connecting");
      yRun.set("message", "Connecting to output stream…");
    });

    const wsBase = engineUrl
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:");
    const ws = new WebSocket(
      `${wsBase}/v1/runs/${encodeURIComponent(
        body.runId
      )}/events?token=${encodeURIComponent(token)}`
    );

    runWsRef.current = ws;

    lastWsMsgAtRef.current = Date.now();
    const connectTimeout = window.setTimeout(() => {
      // If we never opened, surface an actionable error.
      if (ws.readyState !== WebSocket.OPEN) {
        ydoc.transact(() => {
          yRun.set("state", "error");
          yRun.set(
            "error",
            "Failed to connect to run output stream. Check engine logs and that /v1/runs/<id>/events is reachable."
          );
        });
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }, 5000);

    ws.onopen = () => {
      window.clearTimeout(connectTimeout);
      ydoc.transact(() => {
        yRun.set("phase", "streaming");
        yRun.set("message", "Streaming output…");
      });
    };

    ws.onmessage = (evt) => {
      try {
        lastWsMsgAtRef.current = Date.now();
        const msg = JSON.parse(evt.data as string) as {
          type?: string;
          phase?: string;
          data?: string;
          at?: string;
          code?: string;
          message?: string;
          prepMs?: number;
          elapsedMs?: number;
          stdoutBytes?: number;
          stderrBytes?: number;
        };

        if (msg.type === "run.phase") {
          ydoc.transact(() => {
            yRun.set("phase", msg.phase ?? null);
            yRun.set("message", msg.message ?? null);
            if (typeof msg.prepMs === "number") yRun.set("prepMs", msg.prepMs);
          });
        } else if (msg.type === "run.stdout") {
          const chunk = msg.data ?? "";
          if (chunk) yStdout.insert(yStdout.length, chunk);
        } else if (msg.type === "run.stderr") {
          const chunk = msg.data ?? "";
          if (chunk) yStderr.insert(yStderr.length, chunk);
        } else if (msg.type === "run.stats") {
          ydoc.transact(() => {
            if (typeof msg.elapsedMs === "number")
              yRun.set("elapsedMs", msg.elapsedMs);
            if (typeof msg.stdoutBytes === "number")
              yRun.set("stdoutBytes", msg.stdoutBytes);
            if (typeof msg.stderrBytes === "number")
              yRun.set("stderrBytes", msg.stderrBytes);
          });
        } else if (msg.type === "run.error") {
          if (msg.code === "canceled") {
            ydoc.transact(() => {
              yRun.set("state", "canceled");
              yRun.set("error", null);
              yRun.set("phase", "canceled");
              yRun.set("message", "Canceled");
            });
          } else {
            ydoc.transact(() => {
              yRun.set("state", "error");
              yRun.set("error", msg.message ?? "Run error");
            });
          }
        } else if (msg.type === "run.finished") {
          ydoc.transact(() => {
            const cur = (yRun.get("state") as string) || "idle";
            if (cur !== "error" && cur !== "canceled")
              yRun.set("state", "finished");
            yRun.set("phase", "finished");
            yRun.set("message", "Finished");
          });

          // Append to shared run history (bounded).
          try {
            const snap = {
              runId: (yRun.get("runId") as string | null) ?? null,
              runBy: (yRun.get("runBy") as string | null) ?? null,
              language: (yRun.get("language") as string) ?? "python",
              state: (yRun.get("state") as string) ?? "finished",
              finishedAt: msg.at ?? null,
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

          ws.close();
        }
      } catch {
        // ignore malformed messages
      }
    };

    ws.onerror = () => {
      yRun.set("state", "error");
      yRun.set("error", "WebSocket error while streaming run output");
    };

    ws.onclose = (evt) => {
      window.clearTimeout(connectTimeout);
      const cur = (yRun.get("state") as string) || "idle";
      if (cur === "starting" || cur === "running") {
        const detail = evt?.code ? ` (code ${evt.code})` : "";
        ydoc.transact(() => {
          yRun.set("state", "error");
          yRun.set(
            "error",
            `Run output stream closed unexpectedly${detail}. This is usually auth failure (token) or the engine WS endpoint rejecting the connection.`
          );
        });
      }
    };

    // Watchdog: if we are "running" but no messages arrive for too long, surface an error.
    const watchdog = window.setInterval(() => {
      const cur = (yRun.get("state") as string) || "idle";
      if (cur !== "starting" && cur !== "running") {
        window.clearInterval(watchdog);
        return;
      }
      const since = Date.now() - lastWsMsgAtRef.current;
      if (since > 15000) {
        window.clearInterval(watchdog);
        ydoc.transact(() => {
          yRun.set("state", "error");
          yRun.set(
            "error",
            "No output events received from engine for 15s. Check engine is running and that WebSocket /v1/runs/<id>/events is working."
          );
        });
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    }, 1000);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <p style={{ margin: 0, color: "#555" }}>
          Realtime status: <strong>{status}</strong>
        </p>
        <p style={{ margin: 0, color: "#555" }}>
          WS: <span>{wsUrl}</span>
        </p>
      </div>

      {isRunBusy ? (
        <div className="pp-panel" style={{ marginTop: 12 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <span className="pp-spinner" aria-hidden="true" />
            <div>
              <div style={{ fontWeight: 700 }}>
                {sharedRun.language === "javascript" ? "JavaScript" : "Python"}{" "}
                run by {sharedRun.runBy || "someone"}
              </div>
              <div style={{ opacity: 0.9 }}>
                {sharedRun.message ||
                  (sharedRun.phase ? `Phase: ${sharedRun.phase}` : "Running…")}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void cancelRun()}
              className="pp-button"
              style={{ marginLeft: "auto" }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div
        style={{
          marginTop: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={() => void runCode()}
          disabled={isRunBusy}
          className="pp-button"
        >
          {isRunBusy ? "Running…" : "Run"}
        </button>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "#555",
          }}
        >
          Language
          <select
            value={selectedLanguage}
            onChange={(e) =>
              setSelectedLanguage(e.target.value as SharedRunState["language"])
            }
            disabled={isRunBusy}
            style={{
              padding: "6px 8px",
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
          </select>
        </label>

        <p style={{ margin: 0, color: "#555" }}>
          Engine: <span>{engineUrl}</span>
        </p>

        <p style={{ margin: 0, color: "#555" }}>
          Run: <strong>{sharedRun.state}</strong>
          {sharedRun.runId ? <span> ({sharedRun.runId})</span> : null}
        </p>
      </div>

      {sharedRun.error ? (
        <p style={{ marginTop: 8, color: "#b00020" }}>{sharedRun.error}</p>
      ) : null}

      {sharedRun.prepMs != null || sharedRun.elapsedMs != null ? (
        <div className="pp-statGrid" style={{ marginTop: 12 }}>
          <div className="pp-statCard">
            <Donut
              stdoutBytes={Number(sharedRun.stdoutBytes ?? 0)}
              stderrBytes={Number(sharedRun.stderrBytes ?? 0)}
            />
            <div>
              <div className="pp-statLabel">Execution time</div>
              <div className="pp-statValue">{fmtMs(sharedRun.elapsedMs)}</div>
            </div>
          </div>

          <div className="pp-statCard">
            <Donut
              stdoutBytes={Number(sharedRun.stdoutBytes ?? 0)}
              stderrBytes={Number(sharedRun.stderrBytes ?? 0)}
            />
            <div>
              <div className="pp-statLabel">Stdout size</div>
              <div className="pp-statValue">
                {fmtBytes(Number(sharedRun.stdoutBytes ?? 0))}
              </div>
            </div>
          </div>

          <div className="pp-statCard">
            <Donut
              stdoutBytes={Number(sharedRun.stdoutBytes ?? 0)}
              stderrBytes={Number(sharedRun.stderrBytes ?? 0)}
            />
            <div>
              <div className="pp-statLabel">Stderr size</div>
              <div className="pp-statValue">
                {fmtBytes(Number(sharedRun.stderrBytes ?? 0))}
              </div>
            </div>
          </div>

          {isDockerRelated ? (
            <div className="pp-statCard">
              {sharedRun.prepMs == null && sharedRun.phase === "preparing" ? (
                <span className="pp-spinner" aria-hidden="true" />
              ) : (
                <Donut
                  stdoutBytes={Number(sharedRun.stdoutBytes ?? 0)}
                  stderrBytes={Number(sharedRun.stderrBytes ?? 0)}
                />
              )}
              <div>
                <div className="pp-statLabel">Docker prep</div>
                <div className="pp-statValue">{fmtMs(sharedRun.prepMs)}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <Editor
          height="420px"
          language={selectedLanguage}
          defaultValue={"print('Hello from PairPilot IDE')\n"}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            readOnly: isRunBusy,
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            const provider = providerRef.current;
            if (!provider) return;

            // Use a shared Y.Text as the canonical document.
            const ytext = ydoc.getText("monaco");

            const model = editor.getModel();
            if (!model) return;

            // Bind Monaco <-> Yjs.
            // IMPORTANT: y-monaco touches `window` at module-eval time, so we must import it dynamically.
            void (async () => {
              const { MonacoBinding } = await import("y-monaco");

              bindingRef.current?.destroy();
              bindingRef.current = new MonacoBinding(
                ytext,
                model,
                new Set([editor]),
                provider.awareness
              );
            })();

            // Quality-of-life: make remote cursors more readable.
            try {
              (monaco as typeof Monaco).editor.setTheme("vs");
            } catch {
              // theme is optional
            }
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          border: "1px solid #ddd",
          borderRadius: 8,
          padding: 12,
        }}
      >
        <p style={{ marginTop: 0, marginBottom: 8, color: "#555" }}>
          <strong>recent runs</strong>
        </p>
        {yRuns.length === 0 ? (
          <p style={{ margin: 0, color: "#777" }}>(none yet)</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {Array.from(yRuns.toArray())
              .slice()
              .reverse()
              .map((r, idx) => {
                const item = r as any;
                const label = `${
                  item.language === "javascript" ? "js" : "py"
                } · ${item.state} · ${fmtMs(item.elapsedMs)} · ${fmtBytes(
                  item.stdoutBytes
                )} / ${fmtBytes(item.stderrBytes)}`;
                return (
                  <div
                    key={`${item.runId || "run"}-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <span style={{ color: "#333" }}>{label}</span>
                    <span style={{ color: "#777" }}>{item.runBy || ""}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <p style={{ marginTop: 0, marginBottom: 8, color: "#555" }}>
            <strong>stdout</strong>
          </p>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {stdout || "(empty)"}
          </pre>
        </div>
        <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }}>
          <p style={{ marginTop: 0, marginBottom: 8, color: "#555" }}>
            <strong>stderr</strong>
          </p>
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
            {stderr || "(empty)"}
          </pre>
        </div>
      </div>
    </div>
  );
}
