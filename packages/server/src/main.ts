import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import type { ClientMessage } from "@tbob/shared";
import { createRoomRegistry, type Connection, type Scheduler } from "./rooms.ts";
import { openSqliteScores } from "./scores-sqlite.ts";

const PORT = Number(process.env.PORT ?? 8100);
const CLIENT_DIST = fileURLToPath(new URL("../../client/dist", import.meta.url));
/** Teams and finished Runs. The default sits in the gitignored `packages/server/data/`. */
const DB_PATH = process.env.DB_PATH ?? fileURLToPath(new URL("../data/scores.db", import.meta.url));

const scheduler: Scheduler = {
  every(ms, fn) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
};
const rooms = createRoomRegistry({ scheduler, scores: openSqliteScores(DB_PATH) });

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (req.method === "POST" && url.pathname === "/api/rooms") {
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ roomCode: rooms.createRoom() }));
    return;
  }
  // Serve the built client (production). In development Vite serves it instead.
  const rel = normalize(url.pathname === "/" ? "/index.html" : url.pathname);
  const file = join(CLIENT_DIST, rel);
  if (file.startsWith(CLIENT_DIST) && existsSync(file) && statSync(file).isFile()) {
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    createReadStream(file).pipe(res);
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ server, path: "/ws" });
wss.on("connection", (socket, req) => {
  const params = new URL(req.url ?? "", "http://localhost").searchParams;
  const roomCode = params.get("room") ?? "";
  const conn: Connection = {
    send: (msg) => socket.readyState === socket.OPEN && socket.send(JSON.stringify(msg)),
    close: () => socket.close(),
  };
  const player = rooms.connect(roomCode.toUpperCase(), conn, params.get("browser"));
  if (!player) return;

  socket.on("message", (data) => {
    let msg: unknown;
    try {
      msg = JSON.parse(String(data));
    } catch {
      return;
    }
    if (typeof msg === "object" && msg !== null) player.receive(msg as ClientMessage);
  });
  socket.on("close", () => player.disconnect());
});

server.listen(PORT, () => console.log(`Two Birds server on http://localhost:${PORT}`));
