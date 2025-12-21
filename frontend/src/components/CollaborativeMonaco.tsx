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

type Role = "viewer" | "editor";

type PresenceUser = {
  id: string;
  name: string;
  color: string;
  colorLight: string;
};

type Participant = {
  clientId: number;
  userId: string;
  name: string;
  role: Role;
  color: string;
  colorLight: string;
  isOwner: boolean;
};

function hashToHue(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 360;
}

function presenceColor(userId: string): { color: string; colorLight: string } {
  const hue = hashToHue(userId);
  // Use comma-separated hsl/hsla for broad browser compatibility.
  const color = `hsl(${hue}, 92%, 62%)`;
  const colorLight = `hsla(${hue}, 92%, 62%, 0.28)`;
  return { color, colorLight };
}

function usernameFromUser(user: any): string {
  const raw = String(user?.user_metadata?.username || "").trim();
  const cleaned = raw
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 10);
  if (cleaned) return cleaned;

  const email = String(user?.email || "");
  const local = email.includes("@") ? email.split("@")[0] : "";
  const fallback = String(local || user?.id || "user")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_\-]/g, "")
    .slice(0, 10);
  return fallback || "user";
}

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
  const yRoom = useMemo(() => ydoc.getMap<unknown>("room"), [ydoc]);
  const yRoles = useMemo(() => ydoc.getMap<unknown>("roles"), [ydoc]);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const [provider, setProvider] = useState<WebsocketProvider | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);
  const remoteStylesRef = useRef<HTMLStyleElement | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const sanitizeInFlightRef = useRef<boolean>(false);
  const monacoModelRef = useRef<
    import("monaco-editor").editor.ITextModel | null
  >(null);
  const bindingInitInFlightRef = useRef<Promise<void> | null>(null);
  const boundModelRef = useRef<
    import("monaco-editor").editor.ITextModel | null
  >(null);
  const boundProviderRef = useRef<WebsocketProvider | null>(null);
  const seededDefaultRef = useRef<boolean>(false);
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

  const [me, setMe] = useState<PresenceUser | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role>("viewer");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isSynced, setIsSynced] = useState<boolean>(false);

  const isRunBusy =
    sharedRun.state === "starting" || sharedRun.state === "running";

  const isDockerRelated =
    sharedRun.prepMs != null ||
    sharedRun.phase === "preparing" ||
    (sharedRun.message?.toLowerCase().includes("docker") ?? false);

  const isOwner = !!(me?.id && ownerId && me.id === ownerId);
  const effectiveRole: Role = isOwner ? "editor" : myRole;
  // Only allow edits once the initial provider sync completes.
  // This avoids first-join races and also gives a clear "viewer-only until synced" behavior.
  const canEdit = effectiveRole === "editor" && !isRunBusy && isSynced;

  const labelRemoteSelections = () => {
    // Best-effort: y-monaco uses class names that include the clientId.
    // We add `data-user` for CSS to show a Google-Docs-like label.
    try {
      for (const p of participants) {
        const heads = document.querySelectorAll(
          `.yRemoteSelectionHead-${p.clientId}`
        );
        heads.forEach((el) => {
          if (!(el instanceof HTMLElement)) return;
          el.dataset.user = p.name;

          // Show label briefly on hover (3s), otherwise keep hidden.
          if (!el.dataset.ppHoverBound) {
            el.dataset.ppHoverBound = "1";
            el.addEventListener("mouseenter", () => {
              el.dataset.ppShow = "1";
              window.setTimeout(() => {
                // Only clear if nothing re-triggered.
                if (el.isConnected) delete el.dataset.ppShow;
              }, 3000);
            });
          }
        });
      }
    } catch {
      // ignore DOM labeling failures
    }
  };

  const normalizeSharedNewlinesToLF = () => {
    if (sanitizeInFlightRef.current) return;
    const ytext = ydoc.getText("monaco");
    const text = ytext.toString();
    if (!text.includes("\r")) return;

    sanitizeInFlightRef.current = true;
    try {
      const idxs: number[] = [];
      for (let i = 0; i < text.length; i++) {
        if (text.charCodeAt(i) === 13) idxs.push(i); // '\r'
      }
      if (idxs.length === 0) return;

      ydoc.transact(() => {
        for (let i = idxs.length - 1; i >= 0; i--) {
          ytext.delete(idxs[i], 1);
        }
      }, "sanitize-eol");
    } finally {
      sanitizeInFlightRef.current = false;
    }
  };

  const ensureRemoteCursorStyles = (ps: Participant[]) => {
    if (!remoteStylesRef.current) {
      const el = document.createElement("style");
      el.setAttribute("data-pp-remote-cursors", "1");
      document.head.appendChild(el);
      remoteStylesRef.current = el;
    }

    const css = ps
      .map((p) => {
        const safeClientId = String(p.clientId).replace(/[^0-9]/g, "");
        if (!safeClientId) return "";
        return `
.yRemoteSelection-${safeClientId} { background-color: ${p.colorLight} !important; }
.yRemoteSelectionHead-${safeClientId} { border-left: 2px solid ${p.color} !important; }
`;
      })
      .join("\n");

    remoteStylesRef.current.textContent = css;
  };

  const ensureMonacoBinding = () => {
    const currentProvider = providerRef.current;
    const editor = editorRef.current;
    const model = monacoModelRef.current;
    if (!currentProvider || !editor || !model) return;

    // Bind Monaco <-> Yjs as soon as possible.
    // We separately gate *editing* on `isSynced` so we don't end up with "two different editors"
    // if the sync event is delayed for any reason.

    // Keep newline semantics consistent (especially on Windows) to avoid cursor drift on Enter.
    normalizeSharedNewlinesToLF();
    try {
      const m = monacoRef.current;
      if (m) model.setEOL(m.editor.EndOfLineSequence.LF);
    } catch {
      // ignore
    }

    // If Monaco swapped its model (e.g. language/model recreation), we must rebind.
    if (bindingRef.current && boundModelRef.current !== model) {
      bindingRef.current.destroy();
      bindingRef.current = null;
      boundModelRef.current = null;
      boundProviderRef.current = null;
    }

    // If the provider instance changed, also rebind.
    if (bindingRef.current && boundProviderRef.current !== currentProvider) {
      bindingRef.current.destroy();
      bindingRef.current = null;
      boundModelRef.current = null;
      boundProviderRef.current = null;
    }

    // Avoid double-init while the dynamic import is in flight.
    if (bindingRef.current) return;
    if (bindingInitInFlightRef.current) return;

    bindingInitInFlightRef.current = (async () => {
      try {
        const ytext = ydoc.getText("monaco");

        const { MonacoBinding } = await import("y-monaco");
        bindingRef.current?.destroy();
        bindingRef.current = new MonacoBinding(
          ytext,
          model,
          new Set([editor]),
          currentProvider.awareness
        );

        boundModelRef.current = model;
        boundProviderRef.current = currentProvider;
      } finally {
        bindingInitInFlightRef.current = null;
      }
    })();
  };

  useEffect(() => {
    const ytext = ydoc.getText("monaco");
    const onText = (evt: any) => {
      if (evt?.transaction?.origin === "sanitize-eol") return;
      normalizeSharedNewlinesToLF();
    };
    ytext.observe(onText);
    return () => {
      ytext.unobserve(onText);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let prov: WebsocketProvider | null = null;
    let onSync: ((isSynced: boolean) => void) | null = null;
    let onSynced: ((isSynced: boolean) => void) | null = null;

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

      const userId = session?.user?.id || session?.user?.email || "unknown";
      const userName = usernameFromUser(session?.user);
      const { color, colorLight } = presenceColor(userId);
      const nextMe: PresenceUser = {
        id: userId,
        name: userName,
        color,
        colorLight,
      };
      setMe(nextMe);

      prov = new WebsocketProvider(wsUrl, `pairpilot:${roomId}`, ydoc, {
        connect: true,
        params: { token },
      });

      providerRef.current = prov;
      setProvider(prov);

      // Presence / cursor colors + role metadata.
      prov.awareness.setLocalStateField("user", {
        name: nextMe.name,
        color: nextMe.color,
        colorLight: nextMe.colorLight,
        id: nextMe.id,
      });

      // Track sync + seed the default snippet only after the provider is synced.
      // Otherwise, refreshing can insert the snippet before remote content arrives.
      const handleSynced = (nextSynced: boolean) => {
        setIsSynced(nextSynced);
        if (!nextSynced) return;

        // Normalize newlines in the shared doc: ensure the Y.Text never contains `\r`.
        // If `\r` exists, Monaco/CRDT offsets drift and cursor movement looks "every 2 Enters".
        try {
          const ytext = ydoc.getText("monaco");
          const current = ytext.toString();
          if (current.includes("\r")) {
            const normalized = current
              .replace(/\r\n/g, "\n")
              .replace(/\r/g, "\n");
            ydoc.transact(() => {
              ytext.delete(0, ytext.length);
              ytext.insert(0, normalized);
            });
          }
        } catch {
          // ignore normalization failures
        }

        // Room ownership + roles (Yjs-backed): run ONLY after initial sync.
        // This prevents a late joiner from setting themselves as owner before they
        // have received the existing owner's `ownerId`.
        ydoc.transact(() => {
          const existingOwner =
            (yRoom.get("ownerId") as string | undefined) ?? null;
          if (!existingOwner) yRoom.set("ownerId", nextMe.id);

          const finalOwner =
            (yRoom.get("ownerId") as string | undefined) ?? nextMe.id;
          if (finalOwner === nextMe.id) {
            // Ensure the owner is always an editor.
            yRoles.set(nextMe.id, "editor");
          } else if (!yRoles.has(nextMe.id)) {
            // All visitors default to viewer.
            yRoles.set(nextMe.id, "viewer");
          }
        });

        // Seed the default snippet only after sync, and only if the shared doc is empty.
        if (!seededDefaultRef.current) {
          seededDefaultRef.current = true;
          const ytext = ydoc.getText("monaco");
          if (ytext.length === 0) {
            ydoc.transact(() => {
              if (ytext.length === 0) {
                ytext.insert(0, "print('Hello from PairPilot IDE')\n");
              }
            });
          }
        }

        // Ensure Monaco binding exists once we're synced.
        ensureMonacoBinding();
      };

      onSync = handleSynced;
      onSynced = handleSynced;
      prov.on("sync", onSync);
      // Some versions also emit `synced` explicitly.
      // Listening to both is harmless and makes the binding more robust.
      // @ts-expect-error - `synced` is emitted but not always typed.
      prov.on("synced", onSynced);

      const updateStatus = () => {
        // y-websocket uses ws-readyState numbers. Keep it simple.
        const state = prov?.ws?.readyState;
        if (state === 0) setStatus("connecting");
        else if (state === 1) setStatus("connected");
        else if (state === 3) setStatus("disconnected");
      };

      updateStatus();

      prov.on("status", ({ status }) => {
        if (status === "connected") setStatus("connected");
        else if (status === "disconnected") setStatus("disconnected");
        else setStatus("connecting");
      });

      prov.on("connection-error", () => {
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

      if (remoteStylesRef.current) {
        remoteStylesRef.current.remove();
        remoteStylesRef.current = null;
      }

      runWsRef.current?.close();
      runWsRef.current = null;

      try {
        if (prov && onSync) prov.off("sync", onSync);
        // @ts-expect-error - `synced` is emitted but not always typed.
        if (prov && onSynced) prov.off("synced", onSynced);
      } catch {
        // ignore
      }

      prov?.destroy();
      providerRef.current = null;
      setProvider(null);

      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, wsUrl]);

  useEffect(() => {
    const applyRoomSnapshot = () => {
      const nextOwner = (yRoom.get("ownerId") as string | null) ?? null;
      setOwnerId(nextOwner);

      if (me?.id) {
        const role = (yRoles.get(me.id) as Role | undefined) ?? "viewer";
        setMyRole(role);
      }
    };

    applyRoomSnapshot();
    const onRoom = () => applyRoomSnapshot();
    const onRoles = () => applyRoomSnapshot();
    yRoom.observe(onRoom);
    yRoles.observe(onRoles);

    return () => {
      yRoom.unobserve(onRoom);
      yRoles.unobserve(onRoles);
    };
  }, [me?.id, yRoom, yRoles]);

  useEffect(() => {
    if (!provider) return;

    const computeParticipants = () => {
      const states = provider.awareness.getStates() as Map<number, any>;
      const next: Participant[] = [];
      states.forEach((st, clientId) => {
        const u = (st?.user ?? null) as {
          id?: string;
          name?: string;
          color?: string;
          colorLight?: string;
        } | null;
        if (!u?.id) return;
        const userId = u.id;
        const name = u.name || userId;
        const role = ((yRoles.get(userId) as Role | undefined) ??
          "viewer") as Role;
        const isOwnerUser = !!(ownerId && ownerId === userId);
        next.push({
          clientId,
          userId,
          name,
          role: isOwnerUser ? "editor" : role,
          color: u.color || presenceColor(userId).color,
          colorLight: u.colorLight || presenceColor(userId).colorLight,
          isOwner: isOwnerUser,
        });
      });
      next.sort((a, b) => {
        if (a.isOwner && !b.isOwner) return -1;
        if (!a.isOwner && b.isOwner) return 1;
        return a.name.localeCompare(b.name);
      });
      setParticipants(next);
      ensureRemoteCursorStyles(next);
      requestAnimationFrame(() => labelRemoteSelections());
    };

    computeParticipants();
    const onAwareness = () => computeParticipants();
    provider.awareness.on("change", onAwareness);
    const onRoles = () => computeParticipants();
    yRoles.observe(onRoles);

    return () => {
      provider.awareness.off("change", onAwareness);
      yRoles.unobserve(onRoles);
    };
  }, [provider, ownerId, yRoles, participants.length]);

  useEffect(() => {
    // If the editor mounted before the provider was ready, bind now.
    ensureMonacoBinding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

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

    if (effectiveRole !== "editor") return;

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

    const me = usernameFromUser(session?.user);

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

  const setRoleForUser = (userId: string, role: Role) => {
    if (!isOwner) return;
    if (!ownerId) return;
    if (userId === ownerId) return;
    ydoc.transact(() => {
      yRoles.set(userId, role);
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <div className="pp-subtle">
          Realtime status: <strong>{status}</strong>
          {effectiveRole === "viewer" ? (
            <span style={{ marginLeft: 10 }}>(view-only)</span>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <details>
            <summary className="pp-linkButton" style={{ cursor: "pointer" }}>
              People ({participants.length})
            </summary>
            <div className="pp-panel" style={{ marginTop: 10, width: 320 }}>
              <div className="pp-subtle" style={{ marginBottom: 10 }}>
                Everyone joins as viewer. Only the owner can promote editors.
              </div>
              {participants.length === 0 ? (
                <div className="pp-subtle">(no one connected)</div>
              ) : (
                <div style={{ display: "grid", gap: 8 }}>
                  {participants.map((p) => (
                    <div
                      key={`${p.userId}-${p.clientId}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 10,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 999,
                            background: p.color,
                            boxShadow: `0 0 0 3px ${p.color}22`,
                          }}
                        />
                        <div>
                          <div style={{ fontWeight: 700 }}>
                            {p.name}
                            {p.isOwner ? (
                              <span
                                className="pp-subtle"
                                style={{ marginLeft: 8 }}
                              >
                                owner
                              </span>
                            ) : null}
                          </div>
                          <div className="pp-subtle" style={{ fontSize: 12 }}>
                            {p.role}
                          </div>
                        </div>
                      </div>

                      {isOwner && !p.isOwner ? (
                        <select
                          className="pp-select"
                          value={p.role}
                          onChange={(e) =>
                            setRoleForUser(p.userId, e.target.value as Role)
                          }
                        >
                          <option value="viewer">viewer</option>
                          <option value="editor">editor</option>
                        </select>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </details>

          <div className="pp-subtle">WS: {wsUrl}</div>
        </div>
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
          flexWrap: "wrap",
          rowGap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => void runCode()}
          disabled={isRunBusy || effectiveRole !== "editor"}
          className="pp-button"
        >
          {isRunBusy ? "Running…" : "Run"}
        </button>

        <label
          style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            color: "var(--pp-muted)",
          }}
        >
          Language
          <select
            value={selectedLanguage}
            onChange={(e) =>
              setSelectedLanguage(e.target.value as SharedRunState["language"])
            }
            disabled={isRunBusy || effectiveRole !== "editor"}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--pp-border)",
              background: "rgba(0, 0, 0, 0.35)",
              color: "var(--foreground)",
            }}
          >
            <option value="python">Python</option>
            <option value="javascript">JavaScript</option>
          </select>
        </label>

        <p style={{ margin: 0, color: "var(--pp-muted)" }}>
          Engine: {engineUrl}
        </p>

        <p style={{ margin: 0, color: "var(--pp-muted)" }}>
          Run: <strong>{sharedRun.state}</strong>
          {sharedRun.runId ? <span> ({sharedRun.runId})</span> : null}
        </p>
      </div>

      {sharedRun.error ? (
        <p style={{ marginTop: 8, color: "var(--pp-danger)" }}>
          {sharedRun.error}
        </p>
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

      <div
        style={{
          marginTop: 12,
          border: "1px solid var(--pp-border)",
          borderRadius: 16,
          overflow: "hidden",
          background: "rgba(0,0,0,0.25)",
        }}
      >
        <Editor
          height="420px"
          language={selectedLanguage}
          defaultValue={""}
          theme="vs-dark"
          path={`pairpilot:${roomId}`}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            readOnly: !canEdit,
          }}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco as typeof Monaco;
            const model = editor.getModel();
            if (!model) return;
            monacoModelRef.current = model;

            // Force LF so line offsets are consistent across platforms.
            try {
              model.setEOL(
                (monaco as typeof Monaco).editor.EndOfLineSequence.LF
              );
            } catch {
              // ignore
            }

            // Normalize any stray CR characters in the shared doc.
            normalizeSharedNewlinesToLF();

            // Bind Monaco <-> Yjs.
            ensureMonacoBinding();

            // Quality-of-life: make remote cursors more readable.
            try {
              (monaco as typeof Monaco).editor.setTheme("vs-dark");
              labelRemoteSelections();
            } catch {
              // theme is optional
            }
          }}
        />
      </div>

      <div
        style={{
          marginTop: 12,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12,
        }}
      >
        <div className="pp-panel">
          <p className="pp-subtle" style={{ marginBottom: 8 }}>
            <strong>stdout</strong>
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: "var(--foreground)",
            }}
          >
            {stdout || "(empty)"}
          </pre>
        </div>
        <div className="pp-panel">
          <p className="pp-subtle" style={{ marginBottom: 8 }}>
            <strong>stderr</strong>
          </p>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              color: "var(--foreground)",
            }}
          >
            {stderr || "(empty)"}
          </pre>
        </div>
      </div>

      <div className="pp-panel" style={{ marginTop: 12 }}>
        <p className="pp-subtle" style={{ marginBottom: 8 }}>
          <strong>recent runs</strong>
        </p>
        {yRuns.length === 0 ? (
          <p className="pp-subtle">(none yet)</p>
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
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "var(--foreground)" }}>{label}</span>
                    <span className="pp-subtle">{item.runBy || ""}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
