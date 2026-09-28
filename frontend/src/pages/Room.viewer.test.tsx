import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

// STEP-012: regressão do bug "espectador vê só um frame de vídeo vazio".
// Causa: pc.ontrack disparava ANTES do <video> existir (ele só é
// renderizado depois que o status vira "viewer-connected"), então o
// srcObject nunca era atribuído. Aqui simulamos exatamente essa ordem.

const h = vi.hoisted(() => {
  type Handler = (msg: any) => void;
  const clients: any[] = [];
  const pcs: any[] = [];

  class FakeClient {
    handlers = new Map<string, Set<Handler>>();
    sent: any[] = [];
    constructor() {
      clients.push(this);
    }
    whenOpen() {
      return Promise.resolve();
    }
    closeCb: (() => void) | null = null;
    onClose(cb: () => void) {
      this.closeCb = cb;
    }
    on(type: string, cb: Handler) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type)!.add(cb);
      return () => this.handlers.get(type)?.delete(cb);
    }
    send(m: any) {
      this.sent.push(m);
    }
    close() {}
    emit(msg: any) {
      this.handlers.get(msg.type)?.forEach((cb) => cb(msg));
    }
  }

  class FakePc {
    ontrack: any = null;
    onicecandidate: any = null;
    remoteDescription: any = null;
    connectionState = "new";
    iceConnectionState = "new";
    signalingState = "stable";
    constructor() {
      pcs.push(this);
    }
    close() {}
    getSenders() {
      return [];
    }
    getStats() {
      return Promise.resolve(new Map());
    }
    addIceCandidate() {
      return Promise.resolve();
    }
    addTrack() {}
    createOffer() {
      return Promise.resolve({ type: "offer", sdp: "fake-sdp" });
    }
    setLocalDescription() {
      return Promise.resolve();
    }
  }

  return { clients, pcs, FakeClient, FakePc };
});

vi.mock("../room/roomClient", () => ({ RoomClient: h.FakeClient }));
vi.mock("../webrtc/turnClient", () => ({ fetchTurnServers: async () => [] }));
vi.mock("../webrtc/peerConnection", () => ({
  createPeerConnection: () => new h.FakePc(),
  captureScreen: vi.fn(),
  stopStream: vi.fn(),
}));

import { captureScreen } from "../webrtc/peerConnection";
import { Room } from "./Room";

function renderViewer() {
  return render(
    <MemoryRouter initialEntries={["/s/ABC234"]}>
      <Routes>
        <Route path="/s/:roomId" element={<Room />} />
      </Routes>
    </MemoryRouter>
  );
}

const flush = () => act(async () => {});

describe("Room (espectador)", () => {
  beforeEach(() => {
    h.clients.length = 0;
    h.pcs.length = 0;
    vi.spyOn(window.HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("liga o stream recebido ao <video>, mesmo que a track chegue antes do elemento existir", async () => {
    const { container } = renderViewer();
    await flush();

    const client = h.clients[h.clients.length - 1];
    await act(async () => client.emit({ type: "room-joined", roomId: "ABC234", role: "viewer", peerPresent: true }));
    await flush();

    const pc = h.pcs[h.pcs.length - 1];
    const fakeStream = { id: "remote-stream", getTracks: () => [] };

    // A track chega: nesse instante o <video> ainda não está no DOM.
    expect(container.querySelector("video")).toBeNull();
    await act(async () => pc.ontrack({ streams: [fakeStream], track: {} }));
    await flush();

    const video = container.querySelector("video") as any;
    expect(video).not.toBeNull();
    expect(video.srcObject).toBe(fakeStream);
  });
  it("espectador cria uma pc NOVA quando o transmissor sai (senão a próxima offer falha)", async () => {
    const { container } = renderViewer();
    await flush();
    const client = h.clients[h.clients.length - 1];
    await act(async () => client.emit({ type: "room-joined", roomId: "ABC234", role: "viewer", peerPresent: true }));
    await flush();
    const pc1 = h.pcs[h.pcs.length - 1];
    await act(async () => pc1.ontrack({ streams: [{ id: "s" }], track: {} }));
    await flush();
    expect((container.querySelector("video") as any).srcObject).toEqual({ id: "s" });

    const before = h.pcs.length;
    await act(async () => client.emit({ type: "peer-left" }));
    await flush();

    expect(h.pcs.length).toBe(before + 1); // pc nova
    expect(container.querySelector("video")).toBeNull(); // voltou pra "AGUARDANDO"
  });

  it("transmissor que entra numa sala com espectador já presente envia a offer ao escolher a tela", async () => {
    const track: any = { applyConstraints: async () => {}, addEventListener() {}, stop() {} };
    const stream: any = { getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
    (captureScreen as any).mockResolvedValue({ stream, hasAudio: false });

    renderViewer();
    await flush();
    const client = h.clients[h.clients.length - 1];
    // peerPresent: true = o espectador já estava lá (ex.: transmissor recarregou a página)
    await act(async () => client.emit({ type: "room-joined", roomId: "ABC234", role: "broadcaster", peerPresent: true }));
    await flush();

    await act(async () => fireEvent.click(screen.getByText("Selecionar tela, janela ou aba")));
    await flush();

    expect(client.sent.some((m: any) => m.type === "offer")).toBe(true);
  });
  it("mostra erro (em vez de ficar em 'Conectando...') quando o servidor cai", async () => {
    renderViewer();
    await flush();
    const client = h.clients[h.clients.length - 1];
    await act(async () => client.closeCb?.());
    expect(screen.getByText("Conexão com o servidor indisponível.")).toBeTruthy();
  });
  it("explica o bloqueio de contexto inseguro (http://IP) em vez de uma mensagem genérica", async () => {
    const err = new Error("x");
    err.name = "InsecureContextError";
    (captureScreen as any).mockRejectedValue(err);

    renderViewer();
    await flush();
    const client = h.clients[h.clients.length - 1];
    await act(async () => client.emit({ type: "room-joined", roomId: "ABC234", role: "broadcaster", peerPresent: false }));
    await flush();
    await act(async () => fireEvent.click(screen.getByText("Selecionar tela, janela ou aba")));
    await flush();

    expect(screen.getByText(/só libera captura de tela em https/)).toBeTruthy();
  });
  it("explica na tela quando a conexão P2P falha (em vez de deixar só a tela preta)", async () => {
    renderViewer();
    await flush();
    const client = h.clients[h.clients.length - 1];
    await act(async () => client.emit({ type: "room-joined", roomId: "ABC234", role: "viewer", peerPresent: true }));
    await flush();
    const pc = h.pcs[h.pcs.length - 1];
    await act(async () => pc.ontrack({ streams: [{ id: "s" }], track: {} }));
    await flush();
    expect(screen.getByText(/Conectando com o transmissor/)).toBeTruthy();

    pc.connectionState = "failed";
    await act(async () => pc.onconnectionstatechange());
    expect(screen.getByText(/bloqueando conexões diretas/)).toBeTruthy();
  });
});
