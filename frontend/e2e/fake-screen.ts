// Substitui navigator.mediaDevices.getDisplayMedia por uma "tela falsa":
// um canvas animado (frames numerados, 30fps) + um tom de áudio. Assim o
// teste roda sem seletor nativo, sem permissões e sem depender do monitor,
// exercitando TODO o resto: sinalização, WebRTC, <video>, controles.
// (O seletor nativo real e o áudio do sistema só um humano testa — ver TESTING.md.)
export const FAKE_SCREEN = `
(() => {
  navigator.mediaDevices.getDisplayMedia = async (opts) => {
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const ctx = c.getContext("2d");
    let n = 0;
    setInterval(() => {
      n++;
      ctx.fillStyle = "hsl(" + ((n * 5) % 360) + ",70%,40%)";
      ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = "#fff";
      ctx.font = "96px sans-serif";
      ctx.fillText("frame " + n, 80, 200);
    }, 33);
    const stream = c.captureStream(30);
    if (opts && opts.audio) {
      const ac = new AudioContext();
      await ac.resume().catch(() => {});
      const osc = ac.createOscillator();
      const dst = ac.createMediaStreamDestination();
      osc.connect(dst);
      osc.start();
      stream.addTrack(dst.stream.getAudioTracks()[0]);
    }
    return stream;
  };
})();
`;
