// STEP-006/010/013: URLs do backend.
// Em produção, defina VITE_WS_URL / VITE_API_URL no build (wss://dominio/ws).
// Sem elas, usa o MESMO host da página na porta 3001 — assim, no teste em
// rede local, abrir http://IP-DO-PC:5173 em outro aparelho já aponta o
// WebSocket para o IP do PC (e não para "localhost" do próprio aparelho).
const host = window.location.hostname;
const secure = window.location.protocol === "https:";

export const WS_URL = import.meta.env.VITE_WS_URL ?? `${secure ? "wss" : "ws"}://${host}:3001`;
export const API_URL = import.meta.env.VITE_API_URL ?? `${secure ? "https" : "http"}://${host}:3001`;
