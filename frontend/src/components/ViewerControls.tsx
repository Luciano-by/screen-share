import { useState } from "react";

// STEP-012: controles do espectador conforme a spec (seção 7 e 17):
// SÓ volume (local, não altera o transmissor) e tela cheia.
// Substitui os controles nativos do <video>, que mostravam barra de
// tempo/pausa — sem sentido numa transmissão ao vivo.

interface Props {
  getVideo: () => HTMLVideoElement | null;
  getContainer: () => HTMLElement | null;
  soundBlocked: boolean;
  onSoundUnblocked: () => void;
}

export function ViewerControls({ getVideo, getContainer, soundBlocked, onSoundUnblocked }: Props) {
  const [volume, setVolume] = useState(1);

  function changeVolume(value: number) {
    setVolume(value);
    const video = getVideo();
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
    if (value > 0 && soundBlocked) onSoundUnblocked();
  }

  function unmute() {
    const video = getVideo();
    if (!video) return;
    video.muted = false;
    video.volume = volume || 1;
    if (volume === 0) setVolume(1);
    void video.play().catch(() => {});
    onSoundUnblocked();
  }

  function toggleFullscreen() {
    const el: any = getContainer();
    const video: any = getVideo();
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else if (el?.requestFullscreen) {
      void el.requestFullscreen();
    } else if (el?.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else {
      video?.webkitEnterFullscreen?.(); // iPhone/iPad antigos
    }
  }

  return (
    <>
      {soundBlocked && (
        <button className="viewer__unmute" onClick={unmute}>
          🔊 Ativar som
        </button>
      )}
      <div className="viewer__bar">
        <span aria-hidden>🔊</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => changeVolume(Number(e.target.value))}
          aria-label="Volume"
        />
        <button className="viewer__fs" onClick={toggleFullscreen} aria-label="Tela cheia">
          ⛶
        </button>
      </div>
    </>
  );
}
