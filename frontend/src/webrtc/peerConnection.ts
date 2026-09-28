// STEP-007/008: criação do RTCPeerConnection e captura de tela.
// STEP-010: `createPeerConnection` agora aceita servidores TURN extras
// (buscados via webrtc/turnClient.ts) — usados como fallback quando a
// conexão P2P direta via STUN não é possível.

import type { QualityProfile } from "./quality";

const STUN_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function createPeerConnection(turnServers: RTCIceServer[] = []): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: [...STUN_SERVERS, ...turnServers] });
}

export interface CaptureResult {
  stream: MediaStream;
  hasAudio: boolean;
}

/**
 * Pede ao navegador a UI nativa de seleção de aba/janela/tela (spec
 * seção 5), já nas dimensões/FPS do perfil escolhido (spec seção 8).
 * Tenta capturar áudio do sistema quando `includeAudio` é true (spec
 * seção 6), mas isso nem sempre está disponível — quem chamar essa
 * função deve checar `hasAudio` e avisar o usuário quando for `false`.
 */
export async function captureScreen(
  profile: QualityProfile,
  includeAudio: boolean
): Promise<CaptureResult> {
  // Navegadores só liberam captura de tela em contexto seguro: https://
  // ou http://localhost. Em http://192.168.x.x a API nem existe.
  if (!window.isSecureContext || !navigator.mediaDevices?.getDisplayMedia) {
    const err = new Error("contexto inseguro");
    err.name = "InsecureContextError";
    throw err;
  }
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: {
      width: { ideal: profile.width },
      height: { ideal: profile.height },
      frameRate: { ideal: profile.frameRate },
    },
    // Sem cancelamento de eco/supressão de ruído/AGC: esses filtros são
    // feitos para voz e destroem áudio de filmes e música (objetivo do app).
    audio: includeAudio
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : false,
  });

  return {
    stream,
    hasAudio: stream.getAudioTracks().length > 0,
  };
}

export function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
