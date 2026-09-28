import { useDebugStats, type MediaDebug } from "../hooks/useDebugStats";

// STEP-013: painel técnico (só com ?debug=1). Não aparece para o usuário final.

const v = (x: number | string | null, unit = "") => (x == null ? "—" : `${x}${unit}`);

function line(name: string, m: MediaDebug | null) {
  if (!m) return `${name}: sem dados`;
  const res = m.width && m.height ? `${m.width}x${m.height}` : "—";
  return (
    `${name}: ${res} @ ${v(m.fps)}fps · ${v(m.kbps)} kbps · perda ${v(m.lost)} · ` +
    `jitter ${v(m.jitterMs, "ms")} · ${v(m.codec)}` +
    (m.framesDropped ? ` · descartados ${m.framesDropped}` : "") +
    (m.limitation && m.limitation !== "none" ? ` · limitado por ${m.limitation}` : "")
  );
}

export function DebugPanel({ getPc }: { getPc: () => RTCPeerConnection | null }) {
  const s = useDebugStats(getPc, true);
  return (
    <pre className="debug">
      {!s
        ? "debug: sem RTCPeerConnection ativa"
        : [
            `conexão: ${s.connectionState} · ice: ${s.iceConnectionState} · sinalização: ${s.signalingState}`,
            `par ICE: ${v(s.pair)} · RTT: ${v(s.rttMs, "ms")} · ${v(s.direction)}`,
            line("vídeo", s.video),
            line("áudio", s.audio),
          ].join("\n")}
    </pre>
  );
}
