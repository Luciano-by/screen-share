import WebSocket from "ws";
const mk = () => { const ws = new WebSocket("ws://localhost:3001"); const q=[], w=[];
  ws.on("message", r => { const m=JSON.parse(r); w.length ? w.shift()(m) : q.push(m); });
  ws.next = (ms=4000) => new Promise(res => { if (q.length) return res(q.shift());
    const t = setTimeout(() => res({type:"TIMEOUT"}), ms); w.push(m => { clearTimeout(t); res(m); }); }); return ws; };
const open = ws => new Promise(r => ws.once("open", r));

const a = mk(); await open(a);
a.send(JSON.stringify({type:"create-room"}));
const { roomId } = await a.next(); await a.next();

const d = mk(); await open(d);
d.send(JSON.stringify({type:"join-room", roomId})); await d.next();
await a.next(); await a.next();                 // peer-joined + viewer-count

d._socket.pause();                              // D para de ler => não responde ao ping (simula Wi-Fi caído)
const t0 = Date.now();
let m; do { m = await a.next(); } while (m.type !== "peer-left" && m.type !== "TIMEOUT");
console.log("A recebeu:", m.type, m.type==="peer-left" ? `(após ${Date.now()-t0} ms)` : "");
console.log("A (cliente normal) continua conectado:", a.readyState === WebSocket.OPEN);
process.exit(0);
