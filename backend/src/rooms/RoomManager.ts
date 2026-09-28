import { customAlphabet } from "nanoid";
import type { WebSocket } from "ws";
import type { Role } from "../signaling/protocol.js";

// STEP-005: gerenciamento de salas em memória (spec seções 3 e 4).
//
// - id de sala com entropia suficiente, alfabeto sem caracteres ambíguos
//   (sem 0/O, 1/I/l) para evitar confusão ao digitar/ler em voz alta.
// - no máximo 2 participantes por sala.
// - o primeiro participante (quem cria a sala) é sempre o broadcaster
//   inicial. Troca de transmissor é uma etapa futura.
// - sala é destruída depois de ficar vazia por GRACE_PERIOD_MS (evita
//   destruir a sala por um refresh de página rápido).

const ROOM_ID_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const ROOM_ID_LENGTH = 6;
const generateRoomId = customAlphabet(ROOM_ID_ALPHABET, ROOM_ID_LENGTH);

const GRACE_PERIOD_MS = 30_000;
const MAX_PARTICIPANTS = 2;

export interface Participant {
  id: string;
  ws: WebSocket;
  role: Role;
}

interface Room {
  id: string;
  participants: Map<string, Participant>;
  destroyTimer: NodeJS.Timeout | null;
}

export type JoinResult =
  | { ok: true; room: Room; role: Role }
  | { ok: false; reason: "not-found" | "full" };

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(creator: Omit<Participant, "role">): { roomId: string; room: Room } {
    let roomId = generateRoomId();
    while (this.rooms.has(roomId)) {
      roomId = generateRoomId();
    }

    const room: Room = {
      id: roomId,
      participants: new Map(),
      destroyTimer: null,
    };

    const broadcaster: Participant = { ...creator, role: "broadcaster" };
    room.participants.set(broadcaster.id, broadcaster);

    this.rooms.set(roomId, room);
    return { roomId, room };
  }

  joinRoom(roomId: string, participant: Omit<Participant, "role">): JoinResult {
    const room = this.rooms.get(roomId);
    if (!room) return { ok: false, reason: "not-found" };
    if (room.participants.size >= MAX_PARTICIPANTS) {
      return { ok: false, reason: "full" };
    }

    this.cancelDestroy(room);

    // Único papel automático nesta etapa: se já existe um broadcaster,
    // quem entra depois é viewer. (Não deveria haver sala sem broadcaster,
    // já que o criador sempre entra como broadcaster.)
    const hasBroadcaster = [...room.participants.values()].some(
      (p) => p.role === "broadcaster"
    );
    const role: Role = hasBroadcaster ? "viewer" : "broadcaster";

    const full: Participant = { ...participant, role };
    room.participants.set(full.id, full);

    return { ok: true, room, role };
  }

  removeParticipant(roomId: string, participantId: string): Participant | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const removed = room.participants.get(participantId);
    room.participants.delete(participantId);

    if (room.participants.size === 0) {
      this.scheduleDestroy(room);
    }

    return removed;
  }

  getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId);
  }

  countByRole(room: Room, role: Role): number {
    return [...room.participants.values()].filter((p) => p.role === role)
      .length;
  }

  broadcastToRoom(
    room: Room,
    payload: unknown,
    excludeParticipantId?: string
  ): void {
    const message = JSON.stringify(payload);
    for (const participant of room.participants.values()) {
      if (participant.id === excludeParticipantId) continue;
      if (participant.ws.readyState === participant.ws.OPEN) {
        participant.ws.send(message);
      }
    }
  }

  /**
   * Troca os papéis dos dois participantes da sala (spec seção 4).
   * Só faz sentido com exatamente 2 participantes; quem chama já deve
   * ter validado isso (ver connectionHandler).
   */
  swapRoles(room: Room): void {
    for (const participant of room.participants.values()) {
      participant.role = participant.role === "broadcaster" ? "viewer" : "broadcaster";
    }
  }

  getParticipant(room: Room, participantId: string): Participant | undefined {
    return room.participants.get(participantId);
  }

  private scheduleDestroy(room: Room): void {
    this.cancelDestroy(room);
    room.destroyTimer = setTimeout(() => {
      // confere de novo: pode ter sido reocupada nesse meio tempo
      if (room.participants.size === 0) {
        this.rooms.delete(room.id);
      }
    }, GRACE_PERIOD_MS);
  }

  private cancelDestroy(room: Room): void {
    if (room.destroyTimer) {
      clearTimeout(room.destroyTimer);
      room.destroyTimer = null;
    }
  }
}
