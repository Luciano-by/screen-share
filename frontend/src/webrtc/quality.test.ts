import { describe, it, expect, vi, afterEach } from "vitest";
import { startQualityMonitor } from "./quality";

// STEP-012: a taxa de perda deve ser calculada por JANELA (delta entre
// leituras), não sobre o total acumulado da sessão.

function fakeSetup(samples: { sent: number; lost: number; limitation?: string; fps?: number }[]) {
  let i = 0;
  const track: any = { applyConstraints: vi.fn().mockResolvedValue(undefined) };
  const sender: any = {
    track,
    getParameters: () => ({ encodings: [{}] }),
    setParameters: vi.fn().mockResolvedValue(undefined),
    getStats: async () => {
      const s = samples[Math.min(i++, samples.length - 1)];
      return new Map<string, any>([
        ["out", { type: "outbound-rtp", kind: "video", packetsSent: s.sent, framesPerSecond: s.fps, qualityLimitationReason: s.limitation ?? "none" }],
        ["rem", { type: "remote-inbound-rtp", kind: "video", packetsLost: s.lost }],
      ]);
    },
  };
  const pc: any = { getSenders: () => [sender] };
  return { pc, track };
}

describe("startQualityMonitor (modo automático)", () => {
  afterEach(() => vi.useRealTimers());

  it("desce de nível após 2 leituras seguidas com ~10% de perda, mesmo com sessão longa e limpa antes", async () => {
    vi.useFakeTimers();
    // 100k pacotes limpos, depois 2 janelas com 10% de perda. Pela média
    // acumulada isso seria ~0,2% (nunca reagiria).
    const { pc, track } = fakeSetup([
      { sent: 100000, lost: 0 },
      { sent: 101000, lost: 100 },
      { sent: 102000, lost: 200 },
    ]);
    const h = startQualityMonitor(pc, track, "auto", () => {});
    for (let n = 0; n < 3; n++) await vi.advanceTimersByTimeAsync(2000);
    h.stop();

    expect(track.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({ height: 420, frameRate: 30 }));
  });

  it("desce de nível quando o encoder reporta limitação por CPU", async () => {
    vi.useFakeTimers();
    const { pc, track } = fakeSetup([
      { sent: 1000, lost: 0, limitation: "cpu" },
      { sent: 2000, lost: 0, limitation: "cpu" },
      { sent: 3000, lost: 0, limitation: "cpu" },
    ]);
    const h = startQualityMonitor(pc, track, "auto", () => {});
    for (let n = 0; n < 3; n++) await vi.advanceTimersByTimeAsync(2000);
    h.stop();

    expect(track.applyConstraints).toHaveBeenCalledWith(expect.objectContaining({ height: 420 }));
  });

  it("não muda de nível em SD/HD fixos, mesmo com perda", async () => {
    vi.useFakeTimers();
    const { pc, track } = fakeSetup([
      { sent: 1000, lost: 0 },
      { sent: 2000, lost: 500 },
      { sent: 3000, lost: 1000 },
    ]);
    const h = startQualityMonitor(pc, track, "hd", () => {});
    for (let n = 0; n < 3; n++) await vi.advanceTimersByTimeAsync(2000);
    h.stop();

    expect(track.applyConstraints).not.toHaveBeenCalled();
  });
  it("repassa o FPS real medido (getStats) no callback, oscilando conforme a leitura", async () => {
    vi.useFakeTimers();
    const { pc, track } = fakeSetup([
      { sent: 100, lost: 0, fps: 60 },
      { sent: 200, lost: 0, fps: 34 },
      { sent: 300, lost: 0, fps: 58 },
    ]);
    const seen: (number | null)[] = [];
    const h = startQualityMonitor(pc, track, "hd", (info) => seen.push(info.fps));
    for (let n = 0; n < 3; n++) await vi.advanceTimersByTimeAsync(2000);
    h.stop();
    expect(seen).toEqual([60, 34, 58]);
  });
});
