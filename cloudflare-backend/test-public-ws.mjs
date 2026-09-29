const ws = new WebSocket(
  "wss://cloudflare-backend.marco-lucamonte.workers.dev"
);

ws.onopen = () => {
  console.log("✅ WEBSOCKET PÚBLICO CONECTADO");

  ws.send(
    JSON.stringify({
      type: "create-room",
    })
  );
};

ws.onmessage = (event) => {
  console.log("📨 SERVIDOR:", event.data);
};

ws.onerror = (event) => {
  console.error("❌ ERRO:", event);
};

ws.onclose = (event) => {
  console.log(
    "🔴 FECHADO:",
    event.code,
    event.reason
  );
};