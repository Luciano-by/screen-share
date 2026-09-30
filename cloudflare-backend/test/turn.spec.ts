import { describe, expect, it, vi } from "vitest";
import { generateIceServers } from "../src/turn";

const ok = (body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }));

describe("generateIceServers", () => {
  it("retorna vazio sem secrets configurados", async () => {
    const f = vi.fn();
    expect(await generateIceServers({}, f as never)).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it("chama a API da Cloudflare com Bearer e TTL", async () => {
    const f = ok({ iceServers: [{ urls: ["turn:x"], username: "u", credential: "c" }] });
    const r = await generateIceServers({ TURN_KEY_ID: "abc", TURN_KEY_API_TOKEN: "tok" }, f as never);
    expect(r).toEqual([{ urls: ["turn:x"], username: "u", credential: "c" }]);
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://rtc.live.cloudflare.com/v1/turn/keys/abc/credentials/generate-ice-servers");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual({ ttl: 3600 });
  });

  it("aceita iceServers como objeto único", async () => {
    const f = ok({ iceServers: { urls: "turn:y", username: "u", credential: "c" } });
    const r = await generateIceServers({ TURN_KEY_ID: "a", TURN_KEY_API_TOKEN: "t" }, f as never);
    expect(r).toHaveLength(1);
  });

  it("falha silenciosa em erro HTTP ou rede", async () => {
    const env = { TURN_KEY_ID: "a", TURN_KEY_API_TOKEN: "t" };
    const bad = vi.fn(async () => new Response("no", { status: 401 }));
    const boom = vi.fn(async () => { throw new Error("rede"); });
    expect(await generateIceServers(env, bad as never)).toEqual([]);
    expect(await generateIceServers(env, boom as never)).toEqual([]);
  });
});
