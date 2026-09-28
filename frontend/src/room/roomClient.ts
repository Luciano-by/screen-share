// STEP-006: wrapper do WebSocket para falar com o signaling server.
//
// Os tipos abaixo espelham backend/src/signaling/protocol.ts. Como os
// dois projetos (frontend/backend) não compartilham build ainda, os
// tipos são duplicados aqui de propósito — se o protocolo mudar, os
// dois lados precisam ser atualizados manualmente por enquanto.
// (Compartilhar um pacote "shared/" é uma melhoria possível numa
// etapa futura, mas não foi pedida na spec original.)

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

type Listener = (msg: ServerMessage) => void;

export class RoomClient {
  private ws: WebSocket;
  private listeners = new Map<ServerMessage["type"], Set<Listener>>();
  private openPromise: Promise<void>;

  constructor(url: string) {
    this.ws = new WebSocket(url);

    this.openPromise = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", () => resolve(), { once: true });
      this.ws.addEventListener("error", () => reject(new Error("ws-error")), {
        once: true,
      });
    });

    this.ws.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      const set = this.listeners.get(msg.type);
      set?.forEach((cb) => cb(msg));
    });
  }

  whenOpen(): Promise<void> {
    return this.openPromise;
  }

  on(type: ServerMessage["type"], cb: Listener): () => void {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(cb);
    return () => this.listeners.get(type)?.delete(cb);
  }

  /** Avisa quando o socket fecha (servidor caiu, rede caiu, etc). */
  onClose(cb: () => void): void {
    this.ws.addEventListener("close", () => cb());
  }

  send(msg: ClientMessage): void {
    // Evita exceção se o socket já fechou (ex: clicar em "Encerrar" offline).
    if (this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify(msg));
  }

  close(): void {
    this.ws.close();
  }
}
