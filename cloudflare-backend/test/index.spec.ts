import { describe, expect, it } from "vitest";
import { exports } from "cloudflare:workers";

async function fetchWorker(path: string): Promise<Response> {
  return exports.default.fetch(
    new Request(`https://example.com${path}`),
  );
}

describe("Cloudflare Backend", () => {
  it("responde pela rota raiz", async () => {
    const response = await fetchWorker("/");

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Cloudflare Backend OK",
    );
  });

  it("responde ao healthcheck", async () => {
    const response = await fetchWorker("/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/json",
    );

    await expect(response.json()).resolves.toEqual({
      status: "ok",
    });
  });

  it("retorna configuração TURN vazia quando TURN externo ainda não está configurado", async () => {
    const response = await fetchWorker(
      "/turn-credentials",
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain(
      "application/json",
    );

    await expect(response.json()).resolves.toEqual({
      iceServers: [],
    });

    expect(
      response.headers.get("Access-Control-Allow-Origin"),
    ).toBe("*");
  });

  it("retorna 200 para uma rota desconhecida", async () => {
    const response = await fetchWorker(
      "/rota-inexistente",
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe(
      "Cloudflare Backend OK",
    );
  });
});