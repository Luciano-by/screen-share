// PUB-008-STEP-01: credenciais TURN efêmeras via Cloudflare Realtime.
// A TURN Key (ID + API token) fica só no Worker, como secrets — nunca vai
// para o frontend. O navegador recebe apenas usuário/senha com validade curta.

export interface TurnEnv {
  TURN_KEY_ID?: string;
  TURN_KEY_API_TOKEN?: string;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

const TTL_SECONDS = 3600;

export async function generateIceServers(
  env: TurnEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<IceServer[]> {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return [];

  try {
    const res = await fetchImpl(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ttl: TTL_SECONDS }),
      },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    if (Array.isArray(data.iceServers)) return data.iceServers;
    if (data.iceServers) return [data.iceServers];
    return [];
  } catch {
    // Falha silenciosa: o frontend segue só com STUN em vez de travar.
    return [];
  }
}
