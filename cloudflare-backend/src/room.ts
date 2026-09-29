import { DurableObject } from "cloudflare:workers";
import {
  parseClientMessage,
  type ClientMessage,
  type Role,
  type ServerMessage,
} from "./protocol";

const ROOM_ID_ALPHABET =
  "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const ROOM_ID_LENGTH = 6;
const MAX_PARTICIPANTS = 2;
const GRACE_PERIOD_MS = 30_000;

interface SessionAttachment {
  participantId: string;
  roomId: string | null;
  role: Role | null;
}

interface StoredRoom {
  room_id: string;
  destroy_at: number | null;
}

export class RoomDurableObject extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);

    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS rooms (
        room_id TEXT PRIMARY KEY,
        destroy_at INTEGER NULL
      )
    `);
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket", { status: 400 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    const attachment: SessionAttachment = {
      participantId: crypto.randomUUID(),
      roomId: null,
      role: null,
    };

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(attachment);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    const raw =
      typeof message === "string"
        ? message
        : new TextDecoder().decode(message);

    const msg = parseClientMessage(raw);

    if (!msg) {
      this.send(ws, {
        type: "error",
        message: "mensagem inválida",
      });
      return;
    }

    switch (msg.type) {
      case "create-room":
        await this.handleCreateRoom(ws);
        return;

      case "join-room":
        await this.handleJoinRoom(ws, msg.roomId);
        return;

      case "offer":
      case "answer":
      case "ice-candidate":
      case "stop-broadcast":
        await this.handleWebRTCMessage(ws, msg);
        return;

      case "request-broadcast":
        await this.handleRequestBroadcast(ws);
        return;

      case "accept-broadcast-request":
        await this.handleAcceptBroadcast(ws);
        return;

      case "decline-broadcast-request":
        await this.handleDeclineBroadcast(ws);
        return;

      default:
        this.send(ws, {
          type: "error",
          message: "tipo de mensagem desconhecido",
        });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const session = this.getSession(ws);

    if (!session?.roomId) {
      return;
    }

    const roomId = session.roomId;

    const remaining = this.getRoomSockets(roomId).filter(
      (socket) => socket !== ws,
    );

    this.sendToSockets(
      remaining,
      { type: "peer-left" },
    );

    const viewerCount = this.countRole(
      remaining,
      "viewer",
    );

    this.sendToSockets(
      remaining,
      {
        type: "viewer-count",
        count: viewerCount,
      },
    );

     if (remaining.length === 0) {
         await this.markRoomForDestroy(roomId);
    }
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close();
    } catch {
      // conexão já encerrada
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();

    const expiredRooms = this.ctx.storage.sql
  .exec(
    `
    SELECT room_id, destroy_at
    FROM rooms
    WHERE destroy_at IS NOT NULL
      AND destroy_at <= ?
    `,
    now,
  )
  .toArray()
  .map((row) => ({
    room_id: String(row.room_id),
    destroy_at:
      row.destroy_at === null ||
      row.destroy_at === undefined
        ? null
        : Number(row.destroy_at),
  }));

    for (const room of expiredRooms) {
      const sockets = this.getRoomSockets(room.room_id);

      if (sockets.length === 0) {
        this.ctx.storage.sql.exec(
          `
          DELETE FROM rooms
          WHERE room_id = ?
          `,
          room.room_id,
        );
      } else {
        this.ctx.storage.sql.exec(
          `
          UPDATE rooms
          SET destroy_at = NULL
          WHERE room_id = ?
          `,
          room.room_id,
        );
      }
    }

    await this.scheduleNextAlarm();
  }

  private async handleCreateRoom(ws: WebSocket): Promise<void> {
    const session = this.getSession(ws);

    if (!session || session.roomId) {
      this.send(ws, {
        type: "error",
        message: "já está em uma sala",
      });
      return;
    }

    let roomId = generateRoomId();

    while (this.roomExists(roomId)) {
      roomId = generateRoomId();
    }

    this.ctx.storage.sql.exec(
      `
      INSERT INTO rooms (room_id, destroy_at)
      VALUES (?, NULL)
      `,
      roomId,
    );

    this.setSession(ws, {
      ...session,
      roomId,
      role: "broadcaster",
    });

    this.send(ws, {
      type: "room-created",
      roomId,
    });

    this.send(ws, {
      type: "room-joined",
      roomId,
      role: "broadcaster",
      peerPresent: false,
    });
  }

  private async handleJoinRoom(
    ws: WebSocket,
    roomId: string,
  ): Promise<void> {
    const session = this.getSession(ws);

    if (!session || session.roomId) {
      this.send(ws, {
        type: "error",
        message: "já está em uma sala",
      });
      return;
    }

    const exists = this.roomExists(roomId);

    if (!exists) {
      this.send(ws, {
        type: "room-not-found",
      });
      return;
    }

    const existingSockets = this.getRoomSockets(roomId);

    if (existingSockets.length >= MAX_PARTICIPANTS) {
      this.send(ws, {
        type: "room-full",
      });
      return;
    }

    const hasBroadcaster = existingSockets.some((socket) => {
      const existing = this.getSession(socket);
      return existing?.role === "broadcaster";
    });

    const role: Role = hasBroadcaster
      ? "viewer"
      : "broadcaster";

    this.setSession(ws, {
      ...session,
      roomId,
      role,
    });

    this.ctx.storage.sql.exec(
      `
      UPDATE rooms
      SET destroy_at = NULL
      WHERE room_id = ?
      `,
      roomId,
    );

    await this.scheduleNextAlarm();

    this.send(ws, {
      type: "room-joined",
      roomId,
      role,
      peerPresent: existingSockets.length > 0,
    });

    this.sendToSockets(
      existingSockets,
      {
        type: "peer-joined",
        role,
      },
    );

    const sockets = this.getRoomSockets(roomId);

    this.sendToSockets(
      sockets,
      {
        type: "viewer-count",
        count: this.countRole(
          sockets,
          "viewer",
        ),
      },
    );
  }

  private async handleWebRTCMessage(
    ws: WebSocket,
    msg:
      | Extract<ClientMessage, { type: "offer" }>
      | Extract<ClientMessage, { type: "answer" }>
      | Extract<ClientMessage, { type: "ice-candidate" }>
      | Extract<ClientMessage, { type: "stop-broadcast" }>,
  ): Promise<void> {
    const session = this.getSession(ws);

    if (!session?.roomId) {
      return;
    }

    const sockets = this.getRoomSockets(
      session.roomId,
    ).filter((socket) => socket !== ws);

    if (sockets.length === 0) {
      return;
    }

    if (msg.type === "stop-broadcast") {
      this.sendToSockets(
        sockets,
        {
          type: "broadcast-ended",
        },
      );
      return;
    }

    this.sendToSockets(
      sockets,
      msg as ServerMessage,
    );
  }

  private async handleRequestBroadcast(
    ws: WebSocket,
  ): Promise<void> {
    const session = this.getSession(ws);

    if (
      !session?.roomId ||
      session.role !== "viewer"
    ) {
      return;
    }

    const sockets = this.getRoomSockets(
      session.roomId,
    ).filter((socket) => socket !== ws);

    this.sendToSockets(
      sockets,
      {
        type: "broadcast-request",
      },
    );
  }

  private async handleAcceptBroadcast(
    ws: WebSocket,
  ): Promise<void> {
    const session = this.getSession(ws);

    if (
      !session?.roomId ||
      session.role !== "broadcaster"
    ) {
      return;
    }

    const sockets = this.getRoomSockets(
      session.roomId,
    );

    if (sockets.length !== 2) {
      return;
    }

    for (const socket of sockets) {
      const current = this.getSession(socket);

      if (!current) {
        continue;
      }

      const newRole: Role =
        current.role === "broadcaster"
          ? "viewer"
          : "broadcaster";

      this.setSession(socket, {
        ...current,
        role: newRole,
      });
    }

    for (const socket of sockets) {
      const updated = this.getSession(socket);

      if (updated?.role) {
        this.send(socket, {
          type: "role-changed",
          role: updated.role,
        });
      }
    }
  }

  private async handleDeclineBroadcast(
    ws: WebSocket,
  ): Promise<void> {
    const session = this.getSession(ws);

    if (!session?.roomId) {
      return;
    }

    const sockets = this.getRoomSockets(
      session.roomId,
    ).filter((socket) => socket !== ws);

    this.sendToSockets(
      sockets,
      {
        type: "broadcast-request-declined",
      },
    );
  }

  private getSession(
    ws: WebSocket,
  ): SessionAttachment | null {
    return (
      ws.deserializeAttachment() as
        | SessionAttachment
        | null
    );
  }

  private setSession(
    ws: WebSocket,
    session: SessionAttachment,
  ): void {
    ws.serializeAttachment(session);
  }

  private getRoomSockets(
    roomId: string,
  ): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => {
        const session = this.getSession(socket);
        return session?.roomId === roomId;
      });
  }

  private countRole(
    sockets: WebSocket[],
    role: Role,
  ): number {
    return sockets.filter((socket) => {
      return this.getSession(socket)?.role === role;
    }).length;
  }

  private send(
    ws: WebSocket,
    message: ServerMessage,
  ): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendToSockets(
    sockets: WebSocket[],
    message: ServerMessage,
  ): void {
    const payload = JSON.stringify(message);

    for (const socket of sockets) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(payload);
      }
    }
  }

  private roomExists(
    roomId: string,
  ): boolean {
    const result = this.ctx.storage.sql
      .exec(
        `
        SELECT room_id
        FROM rooms
        WHERE room_id = ?
        LIMIT 1
        `,
        roomId,
      )
      .toArray();

    return result.length > 0;
  }

  private async markRoomForDestroy(
  roomId: string,
): Promise<void> {
  const destroyAt =
    Date.now() + GRACE_PERIOD_MS;

  this.ctx.storage.sql.exec(
    `
    UPDATE rooms
    SET destroy_at = ?
    WHERE room_id = ?
    `,
    destroyAt,
    roomId,
  );

  await this.scheduleNextAlarm();
}

  private async scheduleDestroy(
  roomId: string,
): Promise<void> {
  const sockets =
    this.getRoomSockets(roomId);

  if (sockets.length > 0) {
    return;
  }

  await this.markRoomForDestroy(roomId);
}

  private async scheduleNextAlarm(): Promise<void> {
    const row = this.ctx.storage.sql
      .exec(
        `
        SELECT MIN(destroy_at) AS next_destroy_at
        FROM rooms
        WHERE destroy_at IS NOT NULL
        `,
      )
      .toArray()[0] as
      | { next_destroy_at: number | null }
      | undefined;

    if (
      row?.next_destroy_at !== null &&
      row?.next_destroy_at !== undefined
    ) {
      await this.ctx.storage.setAlarm(
        row.next_destroy_at,
      );
    } else {
      await this.ctx.storage.deleteAlarm();
    }
  }
}

function generateRoomId(): string {
  let result = "";

  while (result.length < ROOM_ID_LENGTH) {
    const bytes = crypto.getRandomValues(
      new Uint8Array(32),
    );

    const max =
      256 -
      (256 % ROOM_ID_ALPHABET.length);

    for (const byte of bytes) {
      if (byte >= max) {
        continue;
      }

      result +=
        ROOM_ID_ALPHABET[
          byte % ROOM_ID_ALPHABET.length
        ];

      if (result.length === ROOM_ID_LENGTH) {
        break;
      }
    }
  }

  return result;
}