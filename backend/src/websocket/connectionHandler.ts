import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { RoomManager } from "../rooms/RoomManager.js";
import { parseClientMessage, type ServerMessage } from "../signaling/protocol.js";

// STEP-005/006: roteia mensagens de um socket para o RoomManager.
// STEP-007: além de sala, agora também retransmite mensagens de WebRTC
// (offer/answer/ice-candidate) entre os dois participantes. O servidor
// nunca decodifica nem entende o conteúdo — só repassa (spec seção 10).

function send(ws: WebSocket, message: ServerMessage): void {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

export function handleConnection(ws: WebSocket, roomManager: RoomManager): void {
  const participantId = randomUUID();
  let currentRoomId: string | null = null;

  ws.on("message", (raw) => {
    const msg = parseClientMessage(raw.toString());
    if (!msg) {
      send(ws, { type: "error", message: "mensagem inválida" });
      return;
    }

    switch (msg.type) {
      case "create-room": {
        if (currentRoomId) {
          send(ws, { type: "error", message: "já está em uma sala" });
          return;
        }
        const { roomId } = roomManager.createRoom({ id: participantId, ws });
        currentRoomId = roomId;
        send(ws, { type: "room-created", roomId });
        send(ws, { type: "room-joined", roomId, role: "broadcaster", peerPresent: false });
        console.log(`[room] ${roomId} criada por ${participantId}`);
        break;
      }

      case "join-room": {
        if (currentRoomId) {
          send(ws, { type: "error", message: "já está em uma sala" });
          return;
        }
        const result = roomManager.joinRoom(msg.roomId, {
          id: participantId,
          ws,
        });

        if (!result.ok) {
          send(ws, { type: result.reason === "full" ? "room-full" : "room-not-found" });
          return;
        }

        currentRoomId = msg.roomId;
        // peerPresent: o outro participante já estava na sala? Quem entra
        // NÃO recebe "peer-joined" (ele vai só para quem já estava), então
        // precisa dessa informação aqui para saber se deve negociar.
        send(ws, {
          type: "room-joined",
          roomId: msg.roomId,
          role: result.role,
          peerPresent: result.room.participants.size > 1,
        });

        // Avisa quem já estava na sala que alguém novo entrou — é esse
        // evento que dispara a criação da offer do lado do broadcaster.
        roomManager.broadcastToRoom(
          result.room,
          { type: "peer-joined", role: result.role } satisfies ServerMessage,
          participantId
        );

        const viewerCount = roomManager.countByRole(result.room, "viewer");
        roomManager.broadcastToRoom(result.room, {
          type: "viewer-count",
          count: viewerCount,
        } satisfies ServerMessage);

        console.log(
          `[room] ${msg.roomId}: ${participantId} entrou como ${result.role}`
        );
        break;
      }

      // A partir daqui, mensagens de WebRTC/controle: o servidor só
      // retransmite para o outro participante da sala (não há mais de
      // 2 por sala, então "o outro" é sempre inequívoco).
      case "offer":
      case "answer":
      case "ice-candidate":
      case "stop-broadcast": {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;

        const payload: ServerMessage =
          msg.type === "stop-broadcast"
            ? { type: "broadcast-ended" }
            : (msg as ServerMessage);

        roomManager.broadcastToRoom(room, payload, participantId);
        break;
      }

      // ---- STEP-009: troca de transmissor (spec seção 4) ----
      case "request-broadcast": {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;

        const me = roomManager.getParticipant(room, participantId);
        if (!me || me.role !== "viewer") return; // só espectador solicita

        roomManager.broadcastToRoom(
          room,
          { type: "broadcast-request" } satisfies ServerMessage,
          participantId
        );
        break;
      }

      case "accept-broadcast-request": {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;

        const me = roomManager.getParticipant(room, participantId);
        if (!me || me.role !== "broadcaster") return; // só o transmissor aceita
        if (room.participants.size !== 2) return;

        roomManager.swapRoles(room);
        for (const participant of room.participants.values()) {
          send(participant.ws, { type: "role-changed", role: participant.role });
        }
        console.log(`[room] ${currentRoomId}: transmissor trocado`);
        break;
      }

      case "decline-broadcast-request": {
        if (!currentRoomId) return;
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return;

        roomManager.broadcastToRoom(
          room,
          { type: "broadcast-request-declined" } satisfies ServerMessage,
          participantId
        );
        break;
      }

      default:
        send(ws, { type: "error", message: "tipo de mensagem desconhecido" });
    }
  });

  ws.on("close", () => {
    if (!currentRoomId) return;

    const room = roomManager.getRoom(currentRoomId);
    const removed = roomManager.removeParticipant(currentRoomId, participantId);
    console.log(`[room] ${currentRoomId}: ${participantId} saiu`);

    if (room && removed) {
      roomManager.broadcastToRoom(room, { type: "peer-left" } satisfies ServerMessage);

      const viewerCount = roomManager.countByRole(room, "viewer");
      roomManager.broadcastToRoom(room, {
        type: "viewer-count",
        count: viewerCount,
      } satisfies ServerMessage);
    }
  });
}
