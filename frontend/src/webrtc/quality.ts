// STEP-008: perfis de qualidade e adaptação automática (spec seção 8).
//
// Ladder de 3 degraus, como descrito na spec:
//   420p/30fps  ->  720p/30fps  ->  720p/60fps
//
// O modo Automático parte do degrau intermediário e sobe/desce com
// base na taxa de perda de pacotes reportada pelo WebRTC. Os modos
// SD e HD são fixos (não se movem no ladder).

export type QualityMode = "auto" | "sd" | "hd";

export interface QualityProfile {
  label: string;
  width: number;
  height: number;
  frameRate: number;
  maxBitrateKbps: number;
}

export const LADDER: QualityProfile[] = [
  { label: "420p — 30 FPS", width: 640, height: 420, frameRate: 30, maxBitrateKbps: 600 },
  { label: "720p — 30 FPS", width: 1280, height: 720, frameRate: 30, maxBitrateKbps: 1800 },
  { label: "720p — 60 FPS", width: 1280, height: 720, frameRate: 60, maxBitrateKbps: 3500 },
];

export function profileForMode(mode: QualityMode): QualityProfile {
  if (mode === "sd") return LADDER[0];
  if (mode === "hd") return LADDER[2];
  return LADDER[1]; // ponto de partida do modo automático
}

function levelForMode(mode: QualityMode): number {
  if (mode === "sd") return 0;
  if (mode === "hd") return 2;
  return 1;
}

export async function applyProfile(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  profile: QualityProfile
): Promise<void> {
  await track
    .applyConstraints({
      width: profile.width,
      height: profile.height,
      frameRate: profile.frameRate,
    })
    .catch((err) => {
      // Nem todo navegador/origem de captura aceita reconstraint em
      // tempo real (ex: algumas janelas de app). Não é fatal — o bitrate
      // abaixo ainda se aplica — mas fica no console pra facilitar teste.
      console.warn("[quality] applyConstraints falhou:", err);
    });

  const sender = pc.getSenders().find((s) => s.track === track);
  if (!sender) return;

  const params = sender.getParameters();
  params.encodings = [
    { ...(params.encodings?.[0] ?? {}), maxBitrate: profile.maxBitrateKbps * 1000 },
  ];
  await sender.setParameters(params).catch((err) => {
    console.warn("[quality] setParameters falhou:", err);
  });
}

export interface QualityInfo {
  label: string;
  rttMs: number | null;
  fps: number | null; // FPS real medido (getStats), não o do modo escolhido
}

export interface QualityMonitorHandle {
  stop: () => void;
}

const POLL_INTERVAL_MS = 2000;
const LOSS_RATE_DOWNGRADE = 0.05; // acima disso, reduz qualidade
const LOSS_RATE_UPGRADE = 0.01; // abaixo disso, pode subir qualidade
const CONSECUTIVE_BAD_TO_DOWNGRADE = 2; // ~4s de perda sustentada
const CONSECUTIVE_GOOD_TO_UPGRADE = 4; // ~8s de rede estável

/**
 * Monitora a conexão a cada POLL_INTERVAL_MS e, no modo automático,
 * ajusta o degrau do ladder com histerese (evita ficar oscilando a
 * cada leitura). Em SD/HD fixos, só reporta RTT para exibição — não
 * muda o degrau.
 */
export function startQualityMonitor(
  pc: RTCPeerConnection,
  track: MediaStreamTrack,
  mode: QualityMode,
  onUpdate: (info: QualityInfo) => void
): QualityMonitorHandle {
  let level = levelForMode(mode);
  let consecutiveGood = 0;
  let consecutiveBad = 0;
  // Contadores do WebRTC são ACUMULADOS desde o início da sessão. A taxa de
  // perda precisa ser calculada só sobre o intervalo entre duas leituras —
  // senão uma perda antiga "suja" a média pra sempre e uma piora recente
  // fica diluída e demora a ser detectada.
  let prevLost = 0;
  let prevSent = 0;

  const interval = setInterval(async () => {
    const sender = pc.getSenders().find((s) => s.track === track);
    if (!sender) return;

    let packetsLost = 0;
    let packetsSent = 0;
    let rttMs: number | null = null;
    let cpuLimited = false;
    let fps: number | null = null;

    const stats = await sender.getStats().catch(() => null);
    stats?.forEach((report: any) => {
      if (
        report.type === "remote-inbound-rtp" &&
        report.kind === "video" &&
        typeof report.packetsLost === "number"
      ) {
        packetsLost = report.packetsLost;
      }
      if (
        report.type === "outbound-rtp" &&
        report.kind === "video" &&
        typeof report.packetsSent === "number"
      ) {
        packetsSent = report.packetsSent;
        // O encoder avisa quando não dá conta (PC fraco — spec seção 20).
        if (report.qualityLimitationReason === "cpu") cpuLimited = true;
        if (typeof report.framesPerSecond === "number") fps = report.framesPerSecond;
      }
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        typeof report.currentRoundTripTime === "number"
      ) {
        rttMs = Math.round(report.currentRoundTripTime * 1000);
      }
    });

    onUpdate({ label: LADDER[level].label, rttMs, fps });

    if (mode !== "auto") return;

    const dLost = Math.max(0, packetsLost - prevLost);
    const dSent = Math.max(0, packetsSent - prevSent);
    prevLost = packetsLost;
    prevSent = packetsSent;
    const lossRate = dSent > 0 ? dLost / dSent : 0;

    if (lossRate > LOSS_RATE_DOWNGRADE || cpuLimited) {
      consecutiveBad++;
      consecutiveGood = 0;
      if (consecutiveBad >= CONSECUTIVE_BAD_TO_DOWNGRADE && level > 0) {
        level--;
        void applyProfile(pc, track, LADDER[level]);
        consecutiveBad = 0;
      }
    } else if (lossRate < LOSS_RATE_UPGRADE && !cpuLimited) {
      consecutiveGood++;
      consecutiveBad = 0;
      if (consecutiveGood >= CONSECUTIVE_GOOD_TO_UPGRADE && level < LADDER.length - 1) {
        level++;
        void applyProfile(pc, track, LADDER[level]);
        consecutiveGood = 0;
      }
    } else {
      consecutiveGood = 0;
      consecutiveBad = 0;
    }
  }, POLL_INTERVAL_MS);

  return { stop: () => clearInterval(interval) };
}
