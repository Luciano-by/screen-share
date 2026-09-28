import { createServer } from "node:http";
import { createHmac } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";
import { RoomManager } from "./rooms/RoomManager.js";
import { handleConnection } from "./websocket/connectionHandler.js";

// STEP-002: base do servidor HTTP + WebSocket.
// STEP-005: ligado ao RoomManager via connectionHandler (criação/entrada
// em salas).
// STEP-007/009: WebRTC (offer/answer/ice-candidate) e troca de
// transmissor, ambos retransmitidos via WebSocket.
// STEP-010: endpoint HTTP que gera credenciais TURN de curta duração
// (mecanismo REST padrão do coturn — usuário = timestamp de expiração,
// senha = HMAC-SHA1 com um segredo compartilhado). Isso evita expor
// uma senha TURN fixa no bundle do frontend: a credencial expira
// sozinha depois de TURN_TTL_SECONDS.

const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;
const roomManager = new RoomManager();

const TURN_SECRET = process.env.TURN_SECRET ?? "";
const TURN_URLS = (process.env.TURN_URLS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_TTL_SECONDS = 600; // 10 minutos

function buildTurnCredentials() {
  // Sem TURN_SECRET/TURN_URLS configurados (ex: em desenvolvimento
  // local), devolve uma lista vazia — o frontend simplesmente segue
  // só com STUN (conexão P2P direta, sem fallback de relay).
  if (!TURN_SECRET || TURN_URLS.length === 0) {
    return { iceServers: [] as unknown[] };
  }

  const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS;
  const username = String(expiry);
  const credential = createHmac("sha1", TURN_SECRET).update(username).digest("base64");

  return {
    iceServers: [{ urls: TURN_URLS, username, credential }],
    ttlSeconds: TURN_TTL_SECONDS,
  };
}

const httpServer = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok" }));
    return;
  }

  if (req.url === "/turn-credentials") {
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify(buildTurnCredentials()));
    return;
  }

  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer });

// Heartbeat: derruba conexões "mortas" (Wi-Fi caiu, notebook fechou a
// tampa). Sem isso o servidor só percebe minutos depois, e nesse tempo a
// sala continua "cheia" e ninguém consegue reentrar.
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS ?? 15000);
const alive = new WeakMap<WebSocket, boolean>();

wss.on("connection", (socket) => {
  console.log("[ws] nova conexão");
  alive.set(socket, true);
  socket.on("pong", () => alive.set(socket, true));
  handleConnection(socket, roomManager);
});

const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (alive.get(socket) === false) {
      socket.terminate(); // dispara "close" -> RoomManager remove o participante
      return;
    }
    alive.set(socket, false);
    socket.ping();
  });
}, HEARTBEAT_MS);
wss.on("close", () => clearInterval(heartbeat));

httpServer.listen(PORT, () => {
  console.log(`[server] escutando em http://localhost:${PORT}`);
});
