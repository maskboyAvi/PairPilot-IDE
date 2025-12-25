import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";

import { bytesToBase64 } from "@/components/collab/encoding";

export function useRoomPersistence(params: {
  roomId: string;
  ydoc: Y.Doc;
  enabled: boolean;
  isSynced: boolean;
}) {
  const { roomId, ydoc, enabled, isSynced } = params;

  const [hydrationStatus, setHydrationStatus] = useState<
    "idle" | "loading" | "hydrated" | "empty" | "error"
  >("idle");

  const lastHydratedRef = useRef<boolean>(false);
  const saveTimerRef = useRef<number | null>(null);
  const isSavingRef = useRef<boolean>(false);

  // Hydrate from the latest saved snapshot once per mount.
  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      if (lastHydratedRef.current) return;
      lastHydratedRef.current = true;

      setHydrationStatus("loading");
      try {
        const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/snapshot`, {
          method: "GET",
        });

        if (!res.ok) {
          setHydrationStatus("error");
          return;
        }

        const data = (await res.json()) as {
          snapshotB64: string | null;
          updatedAt: string | null;
        };

        if (!data.snapshotB64) {
          setHydrationStatus("empty");
          return;
        }

        const update = Uint8Array.from(atob(data.snapshotB64), (c) => c.charCodeAt(0));
        Y.applyUpdate(ydoc, update, "snapshot-hydrate");

        if (!cancelled) setHydrationStatus("hydrated");
      } catch {
        if (!cancelled) setHydrationStatus("error");
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [roomId, ydoc]);

  // Debounced snapshot saver.
  useEffect(() => {
    if (!enabled) return;

    const scheduleSave = () => {
      if (!isSynced) return;
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void saveNow();
      }, 1500);
    };

    const saveNow = async () => {
      if (!enabled) return;
      if (!isSynced) return;
      if (isSavingRef.current) return;

      isSavingRef.current = true;
      try {
        // Important: snapshot the *actual* Yjs doc.
        // If we rebuild a new Y.Doc, it generates new internal IDs and will
        // merge as duplicated content when a refreshed client later receives
        // realtime sync updates from peers.
        const snapshot = Y.encodeStateAsUpdate(ydoc);
        const snapshotB64 = bytesToBase64(snapshot);

        await fetch(`/api/rooms/${encodeURIComponent(roomId)}/snapshot`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotB64 }),
        });
      } finally {
        isSavingRef.current = false;
      }
    };

    const onUpdate = (_update: Uint8Array, origin: unknown) => {
      // Avoid immediately re-saving what we just loaded.
      if (origin === "snapshot-hydrate") return;
      scheduleSave();
    };

    ydoc.on("update", onUpdate);
    return () => {
      ydoc.off("update", onUpdate);
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [enabled, isSynced, roomId, ydoc]);

  return {
    hydrationStatus,
  };
}
