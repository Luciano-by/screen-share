import { API_URL } from "../services/config";

// STEP-010: busca credenciais TURN de curta duração no backend
// (mecanismo REST de credenciais efêmeras do coturn — usuário/senha
// que expiram sozinhos depois de alguns minutos). Se o servidor não
// tiver TURN configurado, a resposta vem vazia e a aplicação segue
// normalmente só com STUN (conexão P2P direta, sem fallback de relay
// — como já era até o STEP-009).

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export async function fetchTurnServers(): Promise<IceServerConfig[]> {
  try {
    const res = await fetch(`${API_URL}/turn-credentials`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.iceServers) ? data.iceServers : [];
  } catch {
    // Backend fora do ar, CORS mal configurado, etc — falha
    // silenciosa. Preferível transmitir só com STUN a travar a
    // aplicação por causa de um recurso de fallback.
    return [];
  }
}
