// STEP-005: protocolo de sala (criação/entrada, contagem de espectadores).
// STEP-007: mensagens de WebRTC (offer/answer/ice-candidate) — o backend
// apenas RETRANSMITE essas mensagens entre os dois participantes da sala;
// ele nunca abre nem inspeciona o conteúdo de mídia (spec seções 10 e 22).
// STEP-009: troca de transmissor (spec seção 4).

export type Role = "broadcaster" | "viewer";

export interface SdpPayload {
  type: "offer" | "answer";
  sdp: string;
}

export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

// ---- Mensagens do cliente para o servidor ----
export type ClientMessage =
  | { type: "create-room" }
  | { type: "join-room"; roomId: string }
  | { type: "offer"; payload: SdpPayload }
  | { type: "answer"; payload: SdpPayload }
  | { type: "ice-candidate"; payload: IceCandidatePayload }
  | { type: "stop-broadcast" }
  | { type: "request-broadcast" }
  | { type: "accept-broadcast-request" }
  | { type: "decline-broadcast-request" };

// ---- Mensagens do servidor para o cliente ----
export type ServerMessage =
  | { type: "room-created"; roomId: string }
  | { type: "room-joined"; roomId: string; role: Role; peerPresent: boolean }
  | { type: "room-full" }
  | { type: "room-not-found" }
  | { type: "viewer-count"; count: number }
  | { type: "peer-joined"; role: Role }
  | { type: "peer-left" }
  | { type: "offer"; payload: SdpPayload }
  | { type: "answer"; payload: SdpPayload }
  | { type: "ice-candidate"; payload: IceCandidatePayload }
  | { type: "broadcast-ended" }
  | { type: "broadcast-request" }
  | { type: "broadcast-request-declined" }
  | { type: "role-changed"; role: Role }
  | { type: "error"; message: string };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const data = JSON.parse(raw);
    if (typeof data?.type !== "string") return null;
    return data as ClientMessage;
  } catch {
    return null;
  }
}
