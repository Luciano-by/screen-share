const BASE = "ws://127.0.0.1:8788";

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE);

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`${name}: timeout`));
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

function waitFor(ws, name, predicate) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`${name}: timeout aguardando mensagem`));
    }, 5000);

    const handler = (event) => {
      const message = JSON.parse(event.data);

      console.log(`${name}:`, JSON.stringify(message));

      if (predicate(message)) {
        clearTimeout(timeout);
        ws.removeEventListener("message", handler);
        resolve(message);
      }
    };

    ws.addEventListener("message", handler);
  });
}

const A = await connect("A");
const B = await connect("B");

// ======================================================
// 1. A cria sala
// ======================================================

A.send(
  JSON.stringify({
    type: "create-room",
  }),
);

const created = await waitFor(
  A,
  "A",
  (msg) => msg.type === "room-created",
);

const roomId = created.roomId;

console.log(`\nSala criada: ${roomId}\n`);

await waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "room-joined" &&
    msg.role === "broadcaster",
);

// ======================================================
// 2. B entra
// ======================================================

B.send(
  JSON.stringify({
    type: "join-room",
    roomId,
  }),
);

await Promise.all([
  waitFor(
    B,
    "B",
    (msg) =>
      msg.type === "room-joined" &&
      msg.role === "viewer",
  ),
  waitFor(
    A,
    "A",
    (msg) =>
      msg.type === "peer-joined" &&
      msg.role === "viewer",
  ),
]);

// ======================================================
// 3. OFFER
// ======================================================

console.log("\n--- TESTANDO OFFER ---");

const offer = {
  type: "offer",
  payload: {
    type: "offer",
    sdp: "fake-offer-sdp",
  },
};

// O broadcaster A envia a oferta.
// O viewer B deve recebê-la.
A.send(JSON.stringify(offer));

await waitFor(
  B,
  "B",
  (msg) =>
    msg.type === "offer" &&
    msg.payload?.sdp === "fake-offer-sdp",
);

// ======================================================
// 4. ANSWER
// ======================================================

console.log("\n--- TESTANDO ANSWER ---");

const answer = {
  type: "answer",
  payload: {
    type: "answer",
    sdp: "fake-answer-sdp",
  },
};

// O viewer B responde.
// O broadcaster A deve receber o answer.
B.send(JSON.stringify(answer));

await waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "answer" &&
    msg.payload?.sdp === "fake-answer-sdp",
);

// ======================================================
// 5. ICE — A → B
// ======================================================

console.log("\n--- TESTANDO ICE A → B ---");

const iceA = {
  type: "ice-candidate",
  payload: {
    candidate: "candidate:fake-a",
    sdpMid: "0",
    sdpMLineIndex: 0,
  },
};

A.send(JSON.stringify(iceA));

await waitFor(
  B,
  "B",
  (msg) =>
    msg.type === "ice-candidate" &&
    msg.payload?.candidate === "candidate:fake-a",
);

// ======================================================
// 5.1 ICE — B → A
// ======================================================

console.log("\n--- TESTANDO ICE B → A ---");

const iceB = {
  type: "ice-candidate",
  payload: {
    candidate: "candidate:fake-b",
    sdpMid: "0",
    sdpMLineIndex: 0,
  },
};

B.send(JSON.stringify(iceB));

await waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "ice-candidate" &&
    msg.payload?.candidate === "candidate:fake-b",
);
// ======================================================
// 6. STOP BROADCAST
// ======================================================

console.log("\n--- TESTANDO STOP BROADCAST ---");

A.send(
  JSON.stringify({
    type: "stop-broadcast",
  }),
);

await waitFor(
  B,
  "B",
  (msg) =>
    msg.type === "broadcast-ended",
);

// ======================================================
// 7. REQUEST BROADCAST
// ======================================================

console.log("\n--- TESTANDO REQUEST BROADCAST ---");

B.send(
  JSON.stringify({
    type: "request-broadcast",
  }),
);

await waitFor(
  A,
  "A",
  (msg) =>
    msg.type === "broadcast-request",
);

// ======================================================
// 8. ACCEPT BROADCAST REQUEST
// ======================================================

console.log("\n--- TESTANDO ACCEPT ---");

const roleAPromise = waitFor(
  A,
  "A",
  (msg) => msg.type === "role-changed",
);

const roleBPromise = waitFor(
  B,
  "B",
  (msg) => msg.type === "role-changed",
);

// Agora que os dois listeners estão ativos,
// enviamos o accept.
A.send(
  JSON.stringify({
    type: "accept-broadcast-request",
  }),
);

const [roleA, roleB] = await Promise.all([
  roleAPromise,
  roleBPromise,
]);

if (roleA.role !== "viewer") {
  throw new Error(
    `A deveria virar viewer, recebeu ${roleA.role}`,
  );
}

if (roleB.role !== "broadcaster") {
  throw new Error(
    `B deveria virar broadcaster, recebeu ${roleB.role}`,
  );
}

console.log(
  "✅ A virou viewer e B virou broadcaster",
);

// ======================================================
// 9. NOVO REQUEST
// ======================================================

console.log("\n--- TESTANDO NOVO REQUEST ---");

A.send(
  JSON.stringify({
    type: "request-broadcast",
  }),
);

await waitFor(
  B,
  "B",
  (msg) =>
    msg.type === "broadcast-request",
);

// ======================================================
// 10. DECLINE
// ======================================================

console.log("\n--- TESTANDO DECLINE ---");

B.send(
  JSON.stringify({
    type: "decline-broadcast-request",
  }),
);

await waitFor(
  A,
  "A",
  (msg) =>
    msg.type ===
    "broadcast-request-declined",
);

// ======================================================

console.log(
  "\n==========================================",
);

console.log(
  "✅ TESTE COMPLETO DE SINALIZAÇÃO PASSOU",
);

console.log(
  "==========================================\n",
);

A.close();
B.close();