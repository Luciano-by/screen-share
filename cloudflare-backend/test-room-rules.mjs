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

    ws.onerror = (event) => {
      clearTimeout(timeout);
      reject(
        new Error(`${name}: erro WebSocket ${event.type}`)
      );
    };
  });
}

function waitForMessage(ws, expectedType, name) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(
        new Error(
          `${name}: timeout aguardando ${expectedType}`
        )
      );
    }, 5000);

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      console.log(
        `${name}:`,
        JSON.stringify(message)
      );

      if (message.type === expectedType) {
        clearTimeout(timeout);
        resolve(message);
      }
    };
  });
}

const A = await connect("A");
const B = await connect("B");
const C = await connect("C");
const D = await connect("D");

// A cria a sala
A.send(
  JSON.stringify({
    type: "create-room",
  })
);

const created = await waitForMessage(
  A,
  "room-created",
  "A"
);

const roomId = created.roomId;

console.log(`\nSala criada: ${roomId}\n`);

// B entra
B.send(
  JSON.stringify({
    type: "join-room",
    roomId,
  })
);

await waitForMessage(B, "room-joined", "B");

// C tenta entrar na mesma sala
C.send(
  JSON.stringify({
    type: "join-room",
    roomId,
  })
);

await waitForMessage(C, "room-full", "C");

// D tenta entrar em uma sala inexistente
D.send(
  JSON.stringify({
    type: "join-room",
    roomId: "ZZZZZZ",
  })
);

await waitForMessage(
  D,
  "room-not-found",
  "D"
);

console.log("\n================================");
console.log("✅ TESTE DE REGRAS DA SALA PASSOU");
console.log("================================\n");

A.close();
B.close();
C.close();
D.close();