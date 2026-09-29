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
  | {
      type: "room-joined";
      roomId: string;
      role: Role;
      peerPresent: boolean;
    }
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

    if (!data || typeof data.type !== "string") {
      return null;
    }

    return data as ClientMessage;
  } catch {
    return null;
  }
}