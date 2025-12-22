"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import * as Y from "yjs";
import type { YTextEvent } from "yjs";
import type * as Monaco from "monaco-editor";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";

import { Donut } from "@/components/collab/Donut";
import { base64ToBytes, bytesToBase64 } from "@/components/collab/encoding";
import { fmtBytes, fmtMs } from "@/components/collab/format";
import { presenceColor } from "@/components/collab/presence";
import { usernameFromUser } from "@/components/collab/username";
import type { SharedRunState } from "@/components/collab/runTypes";
import { useSharedRun } from "@/components/collab/useSharedRun";

type Props = {
  roomId: string;
};

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

export default function CollaborativeMonaco({ roomId }: Props) {
  const ydoc = useMemo(() => new Y.Doc(), []);
  const yRun = useMemo(() => ydoc.getMap<unknown>("run"), [ydoc]);
  const yStdout = useMemo(() => ydoc.getText("run:stdout"), [ydoc]);
  const yStderr = useMemo(() => ydoc.getText("run:stderr"), [ydoc]);
  const yRuns = useMemo(() => ydoc.getArray<unknown>("runs"), [ydoc]);
  const yRoom = useMemo(() => ydoc.getMap<unknown>("room"), [ydoc]);
  const yRoles = useMemo(() => ydoc.getMap<unknown>("roles"), [ydoc]);
  const awarenessRef = useRef<Awareness | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
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
  const boundProviderRef = useRef<Awareness | null>(null);
  const seededDefaultRef = useRef<boolean>(false);
  const editorRef = useRef<
    import("monaco-editor").editor.IStandaloneCodeEditor | null
  >(null);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

  const [selectedLanguage, setSelectedLanguage] =
    useState<SharedRunState["language"]>("python");

  const [me, setMe] = useState<PresenceUser | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [myRole, setMyRole] = useState<Role>("viewer");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isSynced, setIsSynced] = useState<boolean>(false);

  const isOwner = !!(me?.id && ownerId && me.id === ownerId);
  const effectiveRole: Role = isOwner ? "editor" : myRole;
  // Only allow edits once the initial provider sync completes.
  // This avoids first-join races and also gives a clear "viewer-only until synced" behavior.
  const {
    sharedRun,
    stdout,
    stderr,
    runsSnapshot,
    isRunBusy,
    cancelRun,
    runCode,
  } = useSharedRun({
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
  });

  const canEdit = effectiveRole === "editor" && !isRunBusy && isSynced;

  const labelRemoteSelections = useCallback((ps: Participant[]) => {
    // Best-effort: y-monaco uses class names that include the clientId.
    // We add `data-user` for CSS to show a Google-Docs-like label.
    try {
      for (const p of ps) {
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
  }, []);

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
    const awareness = awarenessRef.current;
    const editor = editorRef.current;
    const model = monacoModelRef.current;
    if (!awareness || !editor || !model) return;

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
    if (bindingRef.current && boundProviderRef.current !== awareness) {
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
          awareness
        );

        boundModelRef.current = model;
        boundProviderRef.current = awareness;
      } finally {
        bindingInitInFlightRef.current = null;
      }
    })();
  };

  useEffect(() => {
    const ytext = ydoc.getText("monaco");
    const onText = (evt: YTextEvent) => {
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
    let channel: RealtimeChannel | null = null;
    let awareness: Awareness | null = null;
    let hasInitialSync = false;
    const myHelloNonce = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

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

      // Transport: Supabase Realtime broadcast (no custom WS server required).
      // Presence/cursors: Yjs Awareness (broadcasted over Realtime).
      awareness = new Awareness(ydoc);
      awarenessRef.current = awareness;
      setStatus("connecting");

      // Presence / cursor colors + role metadata.
      awareness.setLocalStateField("user", {
        name: nextMe.name,
        color: nextMe.color,
        colorLight: nextMe.colorLight,
        id: nextMe.id,
      });

      const handleInitialSyncReady = () => {
        if (hasInitialSync) return;
        hasInitialSync = true;
        setIsSynced(true);

        // Normalize newlines in the shared doc: ensure the Y.Text never contains `\r`.
        normalizeSharedNewlinesToLF();

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
            yRoles.set(nextMe.id, "editor");
          } else if (!yRoles.has(nextMe.id)) {
            yRoles.set(nextMe.id, "viewer");
          }
        });

        // Seed the default snippet only after initial sync, and only if the shared doc is empty.
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

        // Ensure Monaco binding exists once we're ready.
        ensureMonacoBinding();
      };

      const roomChannelName = `pairpilot:${roomId}`;
      channel = supabase.channel(roomChannelName, {
        config: {
          broadcast: { self: false },
        },
      });
      channelRef.current = channel;

      const broadcast = async (
        event: string,
        payload: Record<string, unknown>
      ) => {
        if (!channel) return;
        try {
          await channel.send({ type: "broadcast", event, payload });
        } catch {
          // ignore
        }
      };

      // Listen for Yjs updates.
      channel.on(
        "broadcast",
        { event: "yjs-update" },
        ({ payload }: { payload: unknown }) => {
          try {
            if (!payload || typeof payload !== "object") return;
            const rec = payload as Record<string, unknown>;
            if (!rec.update) return;
            const update = base64ToBytes(String(rec.update));
            Y.applyUpdate(ydoc, update, "remote");
          } catch {
            // ignore
          }
        }
      );

      // Listen for awareness updates.
      channel.on(
        "broadcast",
        { event: "awareness-update" },
        ({ payload }: { payload: unknown }) => {
          try {
            if (!payload || typeof payload !== "object") return;
            const rec = payload as Record<string, unknown>;
            if (!rec.update) return;
            if (!awareness) return;
            const update = base64ToBytes(String(rec.update));
            applyAwarenessUpdate(awareness, update, "remote");
          } catch {
            // ignore
          }
        }
      );

      // Initial sync handshake: new joiner broadcasts "hello".
      // Existing peers respond with a full state update (no persistence).
      channel.on(
        "broadcast",
        { event: "hello" },
        ({ payload }: { payload: unknown }) => {
          try {
            if (!payload || typeof payload !== "object") return;
            const rec = payload as Record<string, unknown>;
            const from = String(rec.from ?? "");
            const nonce = String(rec.nonce ?? "");
            if (!from || from === nextMe.id) return;
            if (nonce === myHelloNonce) return;
            const full = Y.encodeStateAsUpdate(ydoc);
            void broadcast("sync", {
              to: from,
              from: nextMe.id,
              update: bytesToBase64(full),
            });
          } catch {
            // ignore
          }
        }
      );

      channel.on(
        "broadcast",
        { event: "sync" },
        ({ payload }: { payload: unknown }) => {
          try {
            if (!payload || typeof payload !== "object") return;
            const rec = payload as Record<string, unknown>;
            if (!rec.update) return;
            if (rec.to && String(rec.to) !== nextMe.id) return;
            const update = base64ToBytes(String(rec.update));
            Y.applyUpdate(ydoc, update, "remote");
            handleInitialSyncReady();
          } catch {
            // ignore
          }
        }
      );

      // Outgoing doc updates.
      const onDocUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === "remote") return;
        void broadcast("yjs-update", { update: bytesToBase64(update) });
      };
      ydoc.on("update", onDocUpdate);

      // Outgoing awareness updates.
      const onAwarenessUpdate = (
        {
          added,
          updated,
          removed,
        }: { added: number[]; updated: number[]; removed: number[] },
        origin: unknown
      ) => {
        if (origin === "remote") return;
        if (!awareness) return;
        const changed = ([] as number[])
          .concat(added || [])
          .concat(updated || [])
          .concat(removed || []);
        if (changed.length === 0) return;
        const enc = encodeAwarenessUpdate(awareness, changed);
        void broadcast("awareness-update", { update: bytesToBase64(enc) });
      };
      awareness.on("update", onAwarenessUpdate);

      channel.subscribe((s: string) => {
        if (s === "SUBSCRIBED") {
          setStatus("connected");
          // Ask for initial sync from any existing peer.
          void broadcast("hello", { from: nextMe.id, nonce: myHelloNonce });

          // If nobody responds quickly (empty room), mark synced anyway.
          window.setTimeout(() => {
            handleInitialSyncReady();
          }, 700);
        } else if (s === "CLOSED") {
          setStatus("disconnected");
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("error");
        } else {
          setStatus("connecting");
        }
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

      try {
        channel?.unsubscribe();
      } catch {
        // ignore
      }
      channelRef.current = null;

      try {
        awareness?.destroy();
      } catch {
        // ignore
      }
      awarenessRef.current = null;

      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

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
    const awareness = awarenessRef.current;
    if (!awareness) return;

    const computeParticipants = () => {
      const states = awareness.states as Map<number, unknown>;
      const next: Participant[] = [];
      states.forEach((st, clientId) => {
        const rec =
          st && typeof st === "object" ? (st as Record<string, unknown>) : null;
        const userRaw = rec?.user;
        const u =
          userRaw && typeof userRaw === "object"
            ? (userRaw as {
                id?: unknown;
                name?: unknown;
                color?: unknown;
                colorLight?: unknown;
              })
            : null;

        const userId = typeof u?.id === "string" ? u.id : "";
        if (!userId) return;

        const name = typeof u?.name === "string" && u.name ? u.name : userId;
        const role = ((yRoles.get(userId) as Role | undefined) ??
          "viewer") as Role;
        const isOwnerUser = !!(ownerId && ownerId === userId);
        next.push({
          clientId,
          userId,
          name,
          role: isOwnerUser ? "editor" : role,
          color:
            typeof u?.color === "string" && u.color
              ? u.color
              : presenceColor(userId).color,
          colorLight:
            typeof u?.colorLight === "string" && u.colorLight
              ? u.colorLight
              : presenceColor(userId).colorLight,
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
      requestAnimationFrame(() => labelRemoteSelections(next));
    };

    computeParticipants();
    const onAwareness = () => computeParticipants();
    // Awareness emits `change` events when peers update cursor/user state.
    awareness.on("change", onAwareness);
    const onRoles = () => computeParticipants();
    yRoles.observe(onRoles);

    return () => {
      awareness.off("change", onAwareness);
      yRoles.unobserve(onRoles);
    };
  }, [labelRemoteSelections, ownerId, yRoles]);

  useEffect(() => {
    // If the editor mounted before initial sync, bind now.
    ensureMonacoBinding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSynced]);

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

          <div className="pp-subtle">Realtime: {status}</div>
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
          Runner: Browser (Web Worker)
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

      {sharedRun.elapsedMs != null ? (
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
              labelRemoteSelections(participants);
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
        {runsSnapshot.length === 0 ? (
          <p className="pp-subtle">(none yet)</p>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            {Array.from(runsSnapshot)
              .slice()
              .reverse()
              .map((r, idx) => {
                const item =
                  r && typeof r === "object"
                    ? (r as Record<string, unknown>)
                    : {};

                const language =
                  item.language === "javascript" || item.language === "python"
                    ? item.language
                    : "python";
                const state = typeof item.state === "string" ? item.state : "";
                const elapsedMs =
                  typeof item.elapsedMs === "number" ? item.elapsedMs : null;
                const stdoutBytes =
                  typeof item.stdoutBytes === "number"
                    ? item.stdoutBytes
                    : null;
                const stderrBytes =
                  typeof item.stderrBytes === "number"
                    ? item.stderrBytes
                    : null;
                const runId =
                  typeof item.runId === "string" ? item.runId : "run";
                const runBy = typeof item.runBy === "string" ? item.runBy : "";

                const label = `${
                  language === "javascript" ? "js" : "py"
                } · ${state} · ${fmtMs(elapsedMs)} · ${fmtBytes(
                  stdoutBytes
                )} / ${fmtBytes(stderrBytes)}`;
                return (
                  <div
                    key={`${runId}-${idx}`}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <span style={{ color: "var(--foreground)" }}>{label}</span>
                    <span className="pp-subtle">{runBy}</span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
