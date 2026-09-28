import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import {
  RoomClient,
  type IceCandidatePayload,
  type Role,
  type SdpPayload,
} from "../room/roomClient";
import { DebugPanel } from "../components/DebugPanel";
import { ViewerControls } from "../components/ViewerControls";
import { WS_URL } from "../services/config";
import { isDebugEnabled } from "../services/debug";
import { fetchTurnServers, type IceServerConfig } from "../webrtc/turnClient";
import { captureScreen, createPeerConnection, stopStream } from "../webrtc/peerConnection";
import {
  applyProfile,
  profileForMode,
  startQualityMonitor,
  type QualityInfo,
  type QualityMode,
  type QualityMonitorHandle,
} from "../webrtc/quality";

// STEP-006: fluxo de sala (criar/entrar/link).
// STEP-007: captura de tela + WebRTC de verdade.
// STEP-008: seletor de qualidade (SD/HD/Automático) + adaptação real.
// STEP-009: troca de transmissor (spec seção 4). Ainda SEM TURN — isso
// fica para uma etapa futura.
// STEP-012: correção do vídeo vazio no espectador (srcObject ligado via
// callback ref), reconexão robusta e controles conforme a spec.
// STEP-013: painel de debug (?debug=1).

type Status =
  | "connecting"
  | "broadcaster-select" // broadcaster ainda não escolheu qualidade/origem
  | "broadcaster-live" // transmitindo (com ou sem espectador)
  | "viewer-waiting" // é espectador, esperando a transmissão começar
  | "viewer-connected" // recebendo vídeo
  | "room-full"
  | "not-found"
  | "error";

interface NavState {
  intent?: "create";
}

export function Room() {
  const { roomId: urlRoomId } = useParams<{ roomId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const [status, setStatus] = useState<Status>("connecting");
  const [roomId, setRoomId] = useState<string | undefined>(urlRoomId);
  const [viewerCount, setViewerCount] = useState(0);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [audioWarning, setAudioWarning] = useState(false);
  const [qualityMode, setQualityMode] = useState<QualityMode>("auto");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [qualityInfo, setQualityInfo] = useState<QualityInfo | null>(null);
  const [soundBlocked, setSoundBlocked] = useState(false); // autoplay com som foi bloqueado
  const [debug] = useState(() => isDebugEnabled());
  const [connState, setConnState] = useState<RTCPeerConnectionState | null>(null); // STEP-016
  const [hasFrame, setHasFrame] = useState(false); // já chegou imagem no <video>?

  // STEP-009: estado da troca de transmissor.
  const [incomingRequest, setIncomingRequest] = useState(false); // eu sou o broadcaster, alguém pediu pra transmitir
  const [requestSent, setRequestSent] = useState(false); // eu sou o viewer, já pedi e espero resposta
  const [requestDeclined, setRequestDeclined] = useState(false); // meu pedido foi recusado

  const clientRef = useRef<RoomClient | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const viewerBoxRef = useRef<HTMLDivElement | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const joinAttemptsRef = useRef(0);
  const hasPeerRef = useRef(false);
  const offerSentRef = useRef(false);
  const pendingIceRef = useRef<IceCandidatePayload[]>([]);
  const roleRef = useRef<Role | null>(null);
  const qualityModeRef = useRef<QualityMode>("auto");
  const monitorRef = useRef<QualityMonitorHandle | null>(null);
  const iceServersRef = useRef<IceServerConfig[]>([]); // STEP-010: TURN, se disponível

  useEffect(() => {
    qualityModeRef.current = qualityMode;
  }, [qualityMode]);

  // ---- helpers de WebRTC ----

  function resetPeerConnection() {
    pcRef.current?.close();
    pcRef.current = null;
    setConnState(null);
    offerSentRef.current = false;
    pendingIceRef.current = [];
    monitorRef.current?.stop();
    monitorRef.current = null;
  }

  function attachIceHandler(pc: RTCPeerConnection) {
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      clientRef.current?.send({
        type: "ice-candidate",
        payload: event.candidate.toJSON() as IceCandidatePayload,
      });
    };
    // STEP-016: expõe o estado real da conexão P2P para a interface, em vez de
    // deixar o usuário olhando uma tela preta sem saber por quê.
    pc.onconnectionstatechange = () => {
      if (pcRef.current === pc) setConnState(pc.connectionState);
    };
  }

  /** Adiciona as tracks do stream local à pc e liga qualidade + monitor. */
  function attachLocalTracks(pc: RTCPeerConnection, stream: MediaStream) {
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const mode = qualityModeRef.current;
    const profile = profileForMode(mode);
    void applyProfile(pc, videoTrack, profile);

    monitorRef.current?.stop();
    monitorRef.current = startQualityMonitor(pc, videoTrack, mode, setQualityInfo);
  }

  /**
   * STEP-012: liga o stream remoto ao <video>. Precisa poder ser chamado
   * tanto quando a track chega (ontrack) quanto quando o <video> é montado,
   * porque os dois eventos acontecem em ordem imprevisível — o <video> só
   * existe depois que o status vira "viewer-connected".
   */
  function attachRemoteStream() {
    const video = videoRef.current;
    const stream = remoteStreamRef.current;
    if (!video || !stream) return;
    if (video.srcObject !== stream) video.srcObject = stream;
    void video.play().catch((err: { name?: string }) => {
      // Autoplay com som bloqueado pelo navegador (comum sem interação
      // prévia na página): toca mudo e mostra o botão "Ativar som".
      if (err?.name === "NotAllowedError") {
        video.muted = true;
        setSoundBlocked(true);
        void video.play().catch(() => {});
      }
    });
  }

  function clearRemoteVideo() {
    remoteStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setSoundBlocked(false);
    setHasFrame(false);
  }

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (el) attachRemoteStream();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Cria uma pc pronta para receber vídeo (papel de espectador). */
  function setupViewerConnection(): RTCPeerConnection {
    const pc = createPeerConnection(iceServersRef.current);
    pcRef.current = pc;
    attachIceHandler(pc);
    pc.ontrack = (event) => {
      remoteStreamRef.current = event.streams[0] ?? new MediaStream([event.track]);
      attachRemoteStream();
      setStatus("viewer-connected");
    };
    return pc;
  }

  async function flushPendingIce(pc: RTCPeerConnection) {
    const queued = pendingIceRef.current;
    pendingIceRef.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(candidate).catch(() => {});
    }
  }

  async function createAndSendOffer() {
    const pc = pcRef.current;
    const stream = localStreamRef.current;
    if (!pc || !stream || offerSentRef.current) return;

    offerSentRef.current = true;
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    // Antes da negociação o sender ainda não tem "encodings", então o
    // setParameters de attachLocalTracks pode falhar. Reaplica agora.
    const videoTrack = stream.getVideoTracks()[0];
    if (videoTrack) void applyProfile(pc, videoTrack, profileForMode(qualityModeRef.current));
    clientRef.current?.send({
      type: "offer",
      payload: { type: "offer", sdp: offer.sdp! },
    });
  }

  /** STEP-009: aplica uma troca de papel (aceita internamente ou pelo servidor). */
  function handleRoleChanged(newRole: Role) {
    // Se eu estava transmitindo, encerro minha captura local.
    if (roleRef.current === "broadcaster") {
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
    }
    resetPeerConnection();
    // O outro participante continua na sala (só trocamos papéis, ninguém saiu).
    hasPeerRef.current = true;

    clearRemoteVideo();
    setQualityInfo(null);
    setAudioWarning(false);
    setCaptureError(null);
    setIncomingRequest(false);
    setRequestSent(false);
    setRequestDeclined(false);

    roleRef.current = newRole;
    if (newRole === "broadcaster") {
      setStatus("broadcaster-select");
    } else {
      setStatus("viewer-waiting");
      setupViewerConnection();
    }
  }

  // ---- efeito principal: conecta ao signaling server ----

  useEffect(() => {
    let cancelled = false;
    const intent = (location.state as NavState | null)?.intent;
    const client = new RoomClient(WS_URL);
    clientRef.current = client;

    // STEP-010: busca credenciais TURN em paralelo com a conexão WS.
    // Só entramos na sala depois que isso resolve (ou falha, o que é
    // tratado silenciosamente), pra garantir que a primeira
    // RTCPeerConnection já nasça com TURN disponível quando houver.
    const turnPromise = fetchTurnServers().then((servers) => {
      iceServersRef.current = servers;
    });

    client.on("room-created", (msg) => {
      if (msg.type !== "room-created") return;
      setRoomId(msg.roomId);
      navigate(`/s/${msg.roomId}`, { replace: true });
    });

    client.on("room-joined", (msg) => {
      if (msg.type !== "room-joined") return;
      roleRef.current = msg.role;
      joinAttemptsRef.current = 0;
      // STEP-012: quem ENTRA numa sala já ocupada nunca recebe "peer-joined"
      // (esse evento vai só para quem já estava). Sem isso, um transmissor
      // que recarrega a página nunca enviaria a offer ao espectador.
      hasPeerRef.current = msg.peerPresent;

      if (msg.role === "broadcaster") {
        setStatus("broadcaster-select");
      } else {
        setStatus("viewer-waiting");
        setupViewerConnection();
      }
    });

    client.on("room-full", () => {
      // Ao recarregar a página, o socket antigo pode demorar alguns instantes
      // para ser removido da sala — tenta de novo antes de desistir.
      if (intent !== "create" && urlRoomId && joinAttemptsRef.current < 3) {
        joinAttemptsRef.current++;
        setTimeout(() => {
          if (!cancelled) client.send({ type: "join-room", roomId: urlRoomId });
        }, 1000);
        return;
      }
      setStatus("room-full");
    });
    client.on("room-not-found", () => setStatus("not-found"));

    client.on("viewer-count", (msg) => {
      if (msg.type !== "viewer-count") return;
      setViewerCount(msg.count);
    });

    client.on("peer-joined", () => {
      hasPeerRef.current = true;
      if (roleRef.current === "broadcaster") {
        void createAndSendOffer();
      }
    });

    client.on("peer-left", () => {
      hasPeerRef.current = false;
      setIncomingRequest(false);
      setRequestSent(false);
      setRequestDeclined(false);

      if (roleRef.current === "broadcaster") {
        // O outro lado sumiu: fecha essa RTCPeerConnection e prepara
        // uma nova (com a mesma qualidade escolhida) para quando
        // alguém entrar de novo.
        resetPeerConnection();
        hasPeerRef.current = false;
        if (localStreamRef.current) {
          const pc = createPeerConnection(iceServersRef.current);
          pcRef.current = pc;
          attachIceHandler(pc);
          attachLocalTracks(pc, localStreamRef.current);
        }
      } else {
        // STEP-012: o espectador também precisa de uma pc NOVA — reaproveitar
        // a antiga falha quando o transmissor volta com outra sessão DTLS.
        resetPeerConnection();
        clearRemoteVideo();
        setStatus("viewer-waiting");
        setupViewerConnection();
      }
    });

    client.on("offer", (msg) => {
      if (msg.type !== "offer") return;
      void handleOffer(msg.payload);
    });

    client.on("answer", (msg) => {
      if (msg.type !== "answer") return;
      void handleAnswer(msg.payload);
    });

    client.on("ice-candidate", (msg) => {
      if (msg.type !== "ice-candidate") return;
      void handleRemoteIce(msg.payload);
    });

    client.on("broadcast-ended", () => {
      clearRemoteVideo();
      resetPeerConnection();
      setStatus("viewer-waiting");
      setupViewerConnection();
    });

    // ---- STEP-009: troca de transmissor ----
    client.on("broadcast-request", () => setIncomingRequest(true));
    client.on("broadcast-request-declined", () => {
      setRequestSent(false);
      setRequestDeclined(true);
    });
    client.on("role-changed", (msg) => {
      if (msg.type !== "role-changed") return;
      handleRoleChanged(msg.role);
    });

    client.on("error", () => setStatus("error"));

    // STEP-012: antes, se o backend estivesse fora do ar a tela ficava em
    // "Conectando..." para sempre (a rejeição da promise era ignorada).
    client.onClose(() => {
      if (!cancelled) setStatus("error");
    });

    client
      .whenOpen()
      .then(async () => {
        await turnPromise;
        if (cancelled) return;
        if (intent === "create") {
          client.send({ type: "create-room" });
        } else if (urlRoomId) {
          client.send({ type: "join-room", roomId: urlRoomId });
        } else {
          setStatus("not-found");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
      client.close();
      resetPeerConnection();
      stopStream(localStreamRef.current);
      localStreamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleOffer(payload: SdpPayload) {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload));
    await flushPendingIce(pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    clientRef.current?.send({
      type: "answer",
      payload: { type: "answer", sdp: answer.sdp! },
    });
  }

  async function handleAnswer(payload: SdpPayload) {
    const pc = pcRef.current;
    if (!pc) return;
    await pc.setRemoteDescription(new RTCSessionDescription(payload));
    await flushPendingIce(pc);
  }

  async function handleRemoteIce(payload: IceCandidatePayload) {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) {
      pendingIceRef.current.push(payload);
      return;
    }
    await pc.addIceCandidate(payload).catch(() => {});
  }

  // ---- ações do usuário ----

  async function handleSelectSource() {
    setCaptureError(null);
    try {
      const profile = profileForMode(qualityMode);
      const { stream, hasAudio } = await captureScreen(profile, includeAudio);
      localStreamRef.current = stream;
      setAudioWarning(includeAudio && !hasAudio);

      const pc = createPeerConnection(iceServersRef.current);
      pcRef.current = pc;
      attachIceHandler(pc);
      attachLocalTracks(pc, stream);

      stream.getVideoTracks()[0]?.addEventListener("ended", handleStop);

      setStatus("broadcaster-live");

      if (hasPeerRef.current) {
        void createAndSendOffer();
      }
    } catch (err) {
      const name = (err as { name?: string })?.name;
      setCaptureError(
        name === "InsecureContextError"
          ? "O navegador só libera captura de tela em https:// ou em http://localhost. Abra o transmissor em http://localhost:5173 (veja TESTING.md)."
          : name === "NotAllowedError"
            ? "Compartilhamento cancelado ou negado. Clique de novo e escolha uma tela, janela ou aba."
            : "Não foi possível capturar a tela."
      );
    }
  }

  function handleStop() {
    clientRef.current?.send({ type: "stop-broadcast" });
    stopStream(localStreamRef.current);
    localStreamRef.current = null;
    resetPeerConnection();
    setQualityInfo(null);
    setStatus("broadcaster-select");
  }

  function handleRequestBroadcast() {
    setRequestDeclined(false);
    setRequestSent(true);
    clientRef.current?.send({ type: "request-broadcast" });
  }

  function handleAcceptRequest() {
    setIncomingRequest(false);
    clientRef.current?.send({ type: "accept-broadcast-request" });
  }

  function handleDeclineRequest() {
    setIncomingRequest(false);
    clientRef.current?.send({ type: "decline-broadcast-request" });
  }

  const shareUrl = roomId ? `${window.location.origin}/s/${roomId}` : "";

  const requestBanner = incomingRequest && (
    <div className="banner">
      <p>Um espectador quer transmitir.</p>
      <div className="banner__actions">
        <button className="btn btn--primary" onClick={handleAcceptRequest}>
          Aceitar
        </button>
        <button className="btn btn--secondary" onClick={handleDeclineRequest}>
          Recusar
        </button>
      </div>
    </div>
  );

  return (
    <main className="room">
      {status === "connecting" && <p>Conectando...</p>}

      {status === "broadcaster-select" && (
        <>
          {requestBanner}
          <p>● Sala criada.</p>
          {shareUrl && <p className="room__link">{shareUrl}</p>}

          <fieldset className="quality">
            <legend>Qualidade</legend>
            {(
              [
                ["auto", "Automático"],
                ["sd", "SD — 420p / 30 FPS"],
                ["hd", "HD — 720p / 30–60 FPS"],
              ] as [QualityMode, string][]
            ).map(([value, label]) => (
              <label key={value} className="quality__option">
                <input
                  type="radio"
                  name="quality"
                  value={value}
                  checked={qualityMode === value}
                  onChange={() => setQualityMode(value)}
                />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="quality__option">
            <input
              type="checkbox"
              checked={includeAudio}
              onChange={(e) => setIncludeAudio(e.target.checked)}
            />
            Incluir áudio do sistema
          </label>

          <p>O que deseja compartilhar?</p>
          <button className="btn btn--primary" onClick={handleSelectSource}>
            Selecionar tela, janela ou aba
          </button>
          {captureError && <p className="room__error">{captureError}</p>}
        </>
      )}

      {status === "broadcaster-live" && (
        <>
          {requestBanner}
          <p>● TRANSMITINDO</p>
          <p className="room__link">{shareUrl}</p>
          <p>
            {viewerCount === 0
              ? "Nenhum espectador ainda."
              : `${viewerCount} espectador(es) conectado(s).`}
          </p>
          <p className="room__note">
            Qualidade: {qualityInfo?.label ?? "medindo..."}
            {qualityInfo?.rttMs != null ? ` · Latência: ${qualityInfo.rttMs} ms` : ""}
            {qualityInfo?.fps != null ? ` · FPS atual: ${Math.round(qualityInfo.fps)}` : ""}
          </p>
          {connState === "failed" && (
            <p className="room__error">
              Não foi possível conectar com o espectador: a rede pode estar bloqueando
              conexões diretas (WebRTC). Tente outra rede ou configure um servidor TURN.
            </p>
          )}
          {audioWarning && (
            <p className="room__note">
              Áudio do sistema não está disponível para essa origem/navegador.
            </p>
          )}
          <button className="btn btn--secondary" onClick={handleStop}>
            Encerrar transmissão
          </button>
        </>
      )}

      {status === "viewer-waiting" && (
        <>
          <p>AGUARDANDO</p>
          <p className="room__note">Aguardando o início da transmissão...</p>
          {renderRequestControl()}
        </>
      )}

      {status === "viewer-connected" && (
        <>
          <div ref={viewerBoxRef} className="viewer">
            <video
              ref={setVideoEl}
              className="viewer__video"
              autoPlay
              playsInline
              onLoadedMetadata={() => setHasFrame(true)}
            />
            {!hasFrame && (
              <div className="viewer__overlay">
                {connState === "failed"
                  ? "Não foi possível conectar com o transmissor. Sua rede pode estar bloqueando conexões diretas (WebRTC). Tente outra rede (ex.: hotspot do celular) ou configure um servidor TURN."
                  : connState === "connected"
                    ? "Conectado. Aguardando a imagem… (se a origem compartilhada estiver parada, minimizada ou em segundo plano, ela quase não envia quadros)"
                    : "Conectando com o transmissor…"}
              </div>
            )}
            <ViewerControls
              getVideo={() => videoRef.current}
              getContainer={() => viewerBoxRef.current}
              soundBlocked={soundBlocked}
              onSoundUnblocked={() => setSoundBlocked(false)}
            />
          </div>
          {renderRequestControl()}
        </>
      )}

      {status === "room-full" && <p>Essa sala já tem dois participantes.</p>}
      {status === "not-found" && <p>Sala não encontrada. Confira o link.</p>}
      {status === "error" && (
        <>
          <p>Conexão com o servidor indisponível.</p>
          <button className="btn btn--secondary" onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </>
      )}

      {debug && <DebugPanel getPc={() => pcRef.current} />}
    </main>
  );

  function renderRequestControl() {
    if (requestSent) {
      return <p className="room__note">Solicitação enviada, aguardando resposta...</p>;
    }
    return (
      <>
        {requestDeclined && <p className="room__note">Sua solicitação foi recusada.</p>}
        <button className="btn btn--secondary" onClick={handleRequestBroadcast}>
          Solicitar transmissão
        </button>
      </>
    );
  }
}
