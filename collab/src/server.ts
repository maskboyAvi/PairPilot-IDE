import "dotenv/config";

import http from "node:http";
import { WebSocketServer } from "ws";
import type { IncomingMessage } from "node:http";
import type WebSocket from "ws";
import process from "node:process";

// NOTE: y-websocket exposes server helpers via bin/utils.
// This is a common pattern used for custom-auth servers.
import { setupWSConnection } from "y-websocket/bin/utils";

const PORT = Number.parseInt(process.env.PORT ?? "1234", 10);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL) {
  throw new Error("SUPABASE_URL is required (see .env.example)");
}

if (!SUPABASE_ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY is required (see .env.example)");
}
const ROOM_PREFIX = process.env.ROOM_PREFIX ?? "pairpilot:";

const SUPABASE_USER_ENDPOINT = `${SUPABASE_URL}/auth/v1/user`;

function getTokenFromReq(req: IncomingMessage): string | null {
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  return url?.searchParams.get("token") ?? null;
}

function redactUrl(inputUrl: string | undefined): string | undefined {
  if (!inputUrl) return inputUrl;
  try {
    const url = new URL(inputUrl, "http://localhost");
    if (url.searchParams.has("token")) {
      url.searchParams.set("token", "[redacted]");
    }
    return `${url.pathname}${url.search}`;
  } catch {
    return inputUrl;
  }
}

function getRoomFromReq(req: IncomingMessage): string {
  // y-websocket uses the request path as the room name.
  // Example: /pairpilot:abc123?token=...
  const url = req.url ? new URL(req.url, "http://localhost") : null;
  const pathname = url?.pathname ?? "/";
  const raw = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  return decodeURIComponent(raw);
}

async function verifySupabaseAccessToken(token: string) {
  // Supabase access tokens may be HS256 (project JWT secret) or RS256.
  // Rather than trying to guess signing setup, ask Supabase Auth to validate it.
  const res = await fetch(SUPABASE_USER_ENDPOINT, {
    method: "GET",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Supabase token check failed (${res.status}): ${body}`);
  }

  const user = (await res.json()) as { id?: string };
  if (!user?.id) {
    throw new Error("Supabase token check returned no user id");
  }

  return user;
}

const server = http.createServer((req, res) => {
  // Tiny health endpoint so we can see it's alive.
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ noServer: true });

server.on("error", (err: any) => {
  if (err?.code === "EADDRINUSE") {
    // eslint-disable-next-line no-console
    console.error(
      `Port ${PORT} is already in use. Stop the other collab server or set PORT to a different value (collab/.env).`
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.error("Collab server error:", err);
  process.exit(1);
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const room = getRoomFromReq(req);
    if (!room || !room.startsWith(ROOM_PREFIX)) {
      // eslint-disable-next-line no-console
      console.warn("WS rejected (bad room)", { room, url: redactUrl(req.url) });
      socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
      socket.destroy();
      return;
    }

    const token = getTokenFromReq(req);
    if (!token) {
      // eslint-disable-next-line no-console
      console.warn("WS rejected (missing token)", { room, url: redactUrl(req.url) });
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    await verifySupabaseAccessToken(token);

    wss.handleUpgrade(req, socket, head, (ws: WebSocket) => {
      // Delegate protocol handling to y-websocket.
      setupWSConnection(ws, req, { gc: true });
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("WS rejected (jwt verify failed)", { url: redactUrl(req.url), err });
    socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
    socket.destroy();
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PairPilot collab server listening on ws://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`Auth check: GET ${SUPABASE_USER_ENDPOINT}`);
});
