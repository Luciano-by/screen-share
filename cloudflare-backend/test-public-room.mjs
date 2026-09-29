const wait = (ms) =>
  new Promise((resolve) =>
    setTimeout(resolve, ms)
  );

const a = new WebSocket(
  "wss://cloudflare-backend.marco-lucamonte.workers.dev"
);

const b = new WebSocket(
  "wss://cloudflare-backend.marco-lucamonte.workers.dev"
);

function log(prefix, event) {
  console.log(prefix, event);
}

a.onopen = () => {
  console.log(
    "A: ✅ conectado"
  );

  a.send(
    JSON.stringify({
      type: "create-room",
    })
  );
};

a.onmessage = (event) => {
  console.log(
    "A:",
    event.data
  );

  const msg =
    JSON.parse(event.data);

  if (
    msg.type ===
    "room-created"
  ) {
    setTimeout(() => {
      b.send(
        JSON.stringify({
          type: "join-room",
          roomId: msg.roomId,
        })
      );
    }, 300);
  }
};

b.onopen = () => {
  console.log(
    "B: ✅ conectado"
  );
};

b.onmessage = (event) => {
  console.log(
    "B:",
    event.data
  );
};

a.onerror = (event) =>
  log("A ERROR:", event);

b.onerror = (event) =>
  log("B ERROR:", event);

a.onclose = (event) =>
  log("A CLOSE:", event);

b.onclose = (event) =>
  log("B CLOSE:", event);

await wait(10000);