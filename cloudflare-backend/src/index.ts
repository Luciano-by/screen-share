import { RoomDurableObject } from "./room";

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

    if (
      url.pathname ===
      "/turn-credentials"
    ) {
      return new Response(
        JSON.stringify({
          iceServers: [],
        }),
        {
          status: 200,
          headers: {
            "Content-Type":
              "application/json",
            "Access-Control-Allow-Origin":
              "*",
          },
        },
      );
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