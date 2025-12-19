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

export default function CollaborativeMonaco({ roomId }: Props) {
  const wsUrl = process.env.NEXT_PUBLIC_YJS_WS_URL || DEFAULT_WS_URL;

  const ydoc = useMemo(() => new Y.Doc(), []);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const bindingRef = useRef<{ destroy: () => void } | null>(null);

  const [status, setStatus] = useState<
    "disconnected" | "connecting" | "connected" | "error"
  >("disconnected");

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
    };

    void start();

    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;

      provider?.destroy();
      providerRef.current = null;

      ydoc.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, wsUrl]);

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

      <div style={{ marginTop: 12, border: "1px solid #ddd", borderRadius: 8 }}>
        <Editor
          height="420px"
          defaultLanguage="python"
          defaultValue={"print('Hello from PairPilot IDE')\n"}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
          }}
          onMount={(editor, monaco) => {
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
    </div>
  );
}
