const BASE = "ws://127.0.0.1:8788";

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`${name}: timeout na conexão`));
    }, 5000);

    ws.onopen = () => {
      clearTimeout(timeout);
      console.log(`${name}: ✅ conectado`);
      resolve(ws);
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`${name}: erro WebSocket`));
    };
  });
}

function waitFor(ws, name, predicate, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ws.removeEventListener("message", handler);
      reject(
        new Error(`${name}: timeout aguardando mensagem`)
      );
    }, timeoutMs);

    function handler(event) {
      const message = JSON.parse(event.data);

      console.log(
        `${name}:`,
        JSON.stringify(message)
      );

      if (predicate(message)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(message);
      }
    }

    ws.addEventListener("message", handler);
  });
}

function sleep(ms) {
  return new Promise((resolve) =>
    setTimeout(resolve, ms)
  );
}

const A = await connect("A");
const B = await connect("B");

// ======================================================
// 1. A cria sala
// ======================================================

const roomCreatedPromise = waitFor(
  A,
  "A",
  (msg) => msg.type === "room-created"
);

const roomJoinedAPromise = waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "room-joined" &&
    msg.role === "broadcaster"
);

A.send(
  JSON.stringify({
    type: "create-room",
  })
);

const roomCreated =
  await roomCreatedPromise;

await roomJoinedAPromise;

const roomId =
  roomCreated.roomId;

console.log(
  `\nSala criada: ${roomId}\n`
);

// ======================================================
// 2. B entra
// ======================================================

const peerJoinedPromise = waitFor(
  A,
  "A",
  (msg) => msg.type === "peer-joined"
);

const roomJoinedBPromise = waitFor(
  B,
  "B",
  (msg) =>
    msg.type === "room-joined" &&
    msg.role === "viewer"
);

B.send(
  JSON.stringify({
    type: "join-room",
    roomId,
  })
);

await Promise.all([
  peerJoinedPromise,
  roomJoinedBPromise,
]);

console.log(
  "\n✅ A e B estão na sala\n"
);

// ======================================================
// 3. B sai
// ======================================================

console.log(
  "\n--- TESTANDO PEER-LEFT ---"
);

const peerLeftPromise = waitFor(
  A,
  "A",
  (msg) => msg.type === "peer-left"
);

const viewerCountPromise = waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "viewer-count" &&
    msg.count === 0
);

B.close();

await Promise.all([
  peerLeftPromise,
  viewerCountPromise,
]);

console.log(
  "\n✅ peer-left e viewer-count confirmados\n"
);

// ======================================================
// 4. A também sai
// ======================================================

console.log(
  "--- INICIANDO GRACE PERIOD ---"
);

A.close();

console.log(
  "A e B desconectados."
);

console.log(
  "Aguardando 32 segundos para o Alarm..."
);

await sleep(32_000);

// ======================================================
// 5. Tentar entrar novamente
// ======================================================

console.log(
  "\n--- TESTANDO REMOÇÃO DA SALA ---"
);

const C = await connect("C");

const roomNotFoundPromise = waitFor(
  C,
  "C",
  (msg) =>
    msg.type === "room-not-found"
);

C.send(
  JSON.stringify({
    type: "join-room",
    roomId,
  })
);

await roomNotFoundPromise;

console.log(
  "\n=========================================="
);

console.log(
  "✅ TESTE DE DESCONEXÃO + GRACE PERIOD PASSOU"
);

console.log(
  "==========================================\n"
);

C.close();