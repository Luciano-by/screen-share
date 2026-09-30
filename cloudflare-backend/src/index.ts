import { RoomDurableObject } from "./room";
import { generateIceServers, type TurnEnv } from "./turn";

export { RoomDurableObject };

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ status: "ok" }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    if (url.pathname === "/turn-credentials") {
      const cors = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      };

      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: cors });
      }

      const iceServers = await generateIceServers(
        env as unknown as TurnEnv,
      );

      return new Response(JSON.stringify({ iceServers }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          ...cors,
        },
      });
    }

    if (
      request.headers.get("Upgrade")?.toLowerCase() ===
      "websocket"
    ) {
      const id =
        env.ROOM.idFromName(
          "global-signaling",
        );

      const stub =
        env.ROOM.get(id);

      return stub.fetch(request);
    }

    return new Response(
      "Cloudflare Backend OK",
    );
  },
} satisfies ExportedHandler<Env>;