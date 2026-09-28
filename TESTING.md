# Como testar (sem serviços online)

Três níveis, do mais automático ao mais manual. Tudo roda no seu PC.

## 1. Testes automáticos sem navegador (segundos)

```bash
cd frontend
npm test
```

Cobre a lógica do React/WebRTC com peças simuladas: o vídeo do espectador
ser ligado ao `<video>`, reconexão, oferta quando o transmissor recarrega,
erro de conexão e a adaptação do modo Automático. **Não** prova que a imagem
aparece numa tela real — para isso, níveis 2 e 3.

## 2. Testes E2E com navegador real (1–2 min)

```bash
cd frontend
npx playwright install chromium   # só na primeira vez
npm run test:e2e
```

Sobe backend + frontend sozinho, abre **dois navegadores** (transmissor e
espectador) e confere que o vídeo está **tocando de verdade** (frames
avançando), o áudio chegou, encerrar/retomar, troca de transmissor e
recarregar a página. A "tela" é um canvas animado (não usa o seletor nativo).

## 3. Teste manual com tela real (o que só humano confere)

Terminal 1: `cd backend && npm run dev`  ·  Terminal 2: `cd frontend && npm run dev`

1. **Transmissor:** abra `http://localhost:5173/?debug=1` → Iniciar transmissão.
2. **Espectador:** outra janela (ou outro perfil do navegador) em
   `<link da sala>?debug=1`.
3. Escolha o que compartilhar. **Não compartilhe a janela do espectador**
   (efeito espelho infinito). Bom teste: uma aba do YouTube (marque
   "compartilhar áudio da guia").
4. Se compartilhar a **tela inteira com áudio do sistema** no mesmo PC,
   coloque o volume do espectador em 0 — senão o áudio dele é recapturado
   e volta em loop (eco).

O painel verde (`?debug=1`) diz o que está acontecendo de verdade:

| O que aparece | Significado |
|---|---|
| `conexão: connected` + `par ICE: host/host udp` | P2P direto funcionando |
| `conexão: failed` / `ice: failed` | ICE não conectou (rede/firewall/política WebRTC do navegador) |
| `par ICE: .../relay` | usando TURN (esperado só em rede restritiva) |
| espectador: vídeo `kbps` = 0 ou `fps` = — | conectou mas **nenhum dado chegando** |
| transmissor: `limitado por cpu` | PC fraco: modo Automático deve reduzir a qualidade |
| perda/jitter altos | rede ruim; Automático deve descer de degrau |

Ferramenta nativa complementar: `chrome://webrtc-internals`
(no Brave: `brave://webrtc-internals`).

Volume e tela cheia (espectador) e áudio: confira à mão — o E2E só valida
que a faixa de áudio chegou, não que você a **ouve**.

## 4. Testar em outro aparelho na mesma rede (iPad etc.)

```bash
cd frontend && npm run dev:lan
```

- O **transmissor fica sempre em `http://localhost:5173`** (captura de tela
  exige contexto seguro; `localhost` conta como seguro, `http://192.168...` não).
- No iPad/outro PC: `http://IP-DO-SEU-PC:5173/s/CODIGO` (troque `localhost`
  do link pelo IP; veja o IP com `ipconfig`). O WebSocket já usa o mesmo host.
- Libere Node/navegador no Firewall do Windows (rede privada) se pedir.
- Se o Safari se recusar a receber por `http://`, aí sim será preciso HTTPS
  local (ex.: mkcert) — não verificado por mim.

### "O navegador bloqueia a transmissão" (contexto inseguro)

Captura de tela só funciona em `https://` ou `http://localhost`. Em
`http://192.168.x.x:5173` a API nem existe. Soluções, da mais simples:

1. Abra o **transmissor** em `http://localhost:5173` (só os espectadores usam o IP).
2. Transmissor em outro PC, só para teste: no Chrome/Edge/Brave abra
   `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (Brave:
   `brave://flags/...`), adicione `http://IP-DO-PC:5173`, ative e reinicie o navegador.
3. HTTPS local exigiria HTTPS/proxy também no backend (página https não
   pode usar `ws://`) — não vale a pena; em produção isso já vem pronto.

Publicado em https (Cloudflare Pages, etc.) o problema não existe.

## 5. Latência real (tela → tela)

RTT do painel **não** é a latência que você percebe (falta captura +
codificação + decodificação). Para medir a real:

1. Abra `tools/latency-clock.html` numa aba e **compartilhe essa aba**.
2. Deixe a janela do espectador **ao lado** do relógio original.
3. Tire **um print** com os dois visíveis. A diferença entre os dois números
   (ms) é a latência ponta a ponta (precisão ~±35 ms). Repita algumas vezes.

## 6. Rede ruim (perda de pacotes / latência)

O throttling do DevTools **não afeta WebRTC**. No Windows, o *clumsy*
(gratuito) injeta perda/atraso em UDP; confirme no painel qual par ICE foi
usado, pois tráfego local nem sempre passa pelo filtro. Observe se o modo
Automático desce de degrau (`720p60 → 720p30 → 420p30`) e se volta a subir.
