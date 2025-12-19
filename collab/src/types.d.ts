declare module "y-websocket/bin/utils" {
  import type { IncomingMessage } from "node:http";
  import type WebSocket from "ws";

  export function setupWSConnection(
    conn: WebSocket,
    req: IncomingMessage,
    options?: { gc?: boolean }
  ): void;
}
