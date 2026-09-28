import { useEffect, useRef, useState } from "react";

// STEP-013: métricas reais do WebRTC (spec seção 27): estado da conexão,
// tipo de par ICE (host/srflx/relay), RTT, FPS, bitrate, resolução, perda
// de pacotes e jitter. Lê getStats() a cada 1s — só roda em modo debug.

export interface MediaDebug {
  kbps: number | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  lost: number | null;
  jitterMs: number | null;
  codec: string | null;
  framesDropped: number | null;
  limitation: string | null;
}

export interface DebugSnapshot {
  connectionState: string;
  iceConnectionState: string;
  signalingState: string;
  pair: string | null;
  rttMs: number | null;
  direction: "recebendo" | "enviando" | null;
  video: MediaDebug | null;
  audio: MediaDebug | null;
}

export function useDebugStats(
  getPc: () => RTCPeerConnection | null,
  enabled: boolean
): DebugSnapshot | null {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  const prev = useRef(new Map<string, { bytes: number; ts: number }>());

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    const kbps = (key: string, bytes: number, ts: number): number | null => {
      const p = prev.current.get(key);
      prev.current.set(key, { bytes, ts });
      if (!p || ts <= p.ts) return null;
      return Math.round(((bytes - p.bytes) * 8) / (ts - p.ts)); // bits/ms = kbit/s
    };

    const tick = async () => {
      const pc = getPc();
      if (!pc) {
        if (!stopped) setSnap(null);
        return;
      }
      const byId = new Map<string, any>();
      try {
        (await pc.getStats()).forEach((r: any) => byId.set(r.id, r));
      } catch {
        return;
      }
      const reports = [...byId.values()];
      const kindOf = (r: any) => r.kind ?? r.mediaType;

      const media = (kind: string): MediaDebug | null => {
        const rtp = reports.find(
          (r) => (r.type === "inbound-rtp" || r.type === "outbound-rtp") && kindOf(r) === kind
        );
        if (!rtp) return null;
        const inbound = rtp.type === "inbound-rtp";
        const remote = inbound
          ? null
          : reports.find((r) => r.type === "remote-inbound-rtp" && kindOf(r) === kind);
        const jitter = inbound ? rtp.jitter : remote?.jitter;
        return {
          kbps: kbps(rtp.id, (inbound ? rtp.bytesReceived : rtp.bytesSent) ?? 0, rtp.timestamp),
          fps: rtp.framesPerSecond ?? null,
          width: rtp.frameWidth ?? null,
          height: rtp.frameHeight ?? null,
          lost: (inbound ? rtp.packetsLost : remote?.packetsLost) ?? null,
          jitterMs: jitter != null ? Math.round(jitter * 1000) : null,
          codec: rtp.codecId ? byId.get(rtp.codecId)?.mimeType ?? null : null,
          framesDropped: rtp.framesDropped ?? null,
          limitation: rtp.qualityLimitationReason ?? null,
        };
      };

      const transport = reports.find((r) => r.type === "transport");
      const pairRep =
        (transport?.selectedCandidatePairId && byId.get(transport.selectedCandidatePairId)) ||
        reports.find((r) => r.type === "candidate-pair" && r.state === "succeeded" && r.nominated);
      const local = pairRep && byId.get(pairRep.localCandidateId);
      const remoteC = pairRep && byId.get(pairRep.remoteCandidateId);

      const hasIn = reports.some((r) => r.type === "inbound-rtp");
      const hasOut = reports.some((r) => r.type === "outbound-rtp");

      if (stopped) return;
      setSnap({
        connectionState: pc.connectionState,
        iceConnectionState: pc.iceConnectionState,
        signalingState: pc.signalingState,
        pair: local && remoteC ? `${local.candidateType}/${remoteC.candidateType} ${local.protocol}` : null,
        rttMs:
          typeof pairRep?.currentRoundTripTime === "number"
            ? Math.round(pairRep.currentRoundTripTime * 1000)
            : null,
        direction: hasIn ? "recebendo" : hasOut ? "enviando" : null,
        video: media("video"),
        audio: media("audio"),
      });
    };

    const id = setInterval(tick, 1000);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return snap;
}
