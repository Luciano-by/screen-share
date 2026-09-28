# CHANGELOG

Cada entrada tem um ID único. Use esse ID para pedir para eu reverter, explicar
ou retomar uma alteração específica (ex: "volte ao estado do STEP-003").

---

### STEP-001 — Estrutura de pastas do monorepo
**Prompt origem:** "vamos trabalhar com step by step... comece pela base"
**O que foi feito:**
- Criada estrutura de pastas `frontend/`, `backend/`, `infrastructure/`
  conforme a spec original (seção 24), sem nenhum arquivo relacionado a Docker.

### STEP-002 — Backend base (Node.js + TypeScript + ws)
**O que foi feito:**
- `backend/package.json`, `backend/tsconfig.json`
- `backend/src/server.ts`: sobe um servidor HTTP + WebSocket, com rota de
  healthcheck (`GET /health`). Ainda **sem lógica de salas** — isso é o próximo
  passo (troca de mensagens de sinalização).
- Stubs vazios (com TODO) em `signaling/`, `rooms/`, `websocket/` para deixar
  claro onde cada responsabilidade futura vai entrar.

### STEP-003 — Frontend base (Vite + React + TypeScript)
**O que foi feito:**
- `frontend/package.json`, `frontend/vite.config.ts`, `frontend/tsconfig.json`
- `frontend/index.html`, `frontend/src/main.tsx`
- `frontend/src/pages/Home.tsx`: tela inicial estática (spec seção 12), só
  com os dois botões (Iniciar Transmissão / Assistir), **sem lógica ainda**.
- Stubs vazios em `components/`, `hooks/`, `services/`, `webrtc/`, `room/`.

### STEP-004 — Arquivos de projeto (README, .gitignore)
**O que foi feito:**
- `README.md` raiz explicando como rodar backend e frontend localmente.
- `.gitignore` (node_modules, dist, .env).

### STEP-005 — Lógica de salas no backend
**Prompt origem:** "dê o próximo passo no desenvolvimento"
**O que foi feito:**
- `backend/src/rooms/RoomManager.ts`: implementado de verdade.
  - Serial de sala gerada com `nanoid` (alfabeto sem caracteres ambíguos:
    sem `0/O`, `1/I/l`), 6 caracteres (spec seção 3).
  - No máximo 2 participantes por sala (spec seção 4).
  - Quem cria a sala é sempre o `broadcaster` inicial; o segundo a
    entrar é `viewer`. Troca de transmissor **ainda não existe** (fica
    para uma etapa futura, junto com WebRTC).
  - Sala vazia é destruída após 30s de grace period (evita destruir por
    um refresh de página).
- `backend/src/signaling/protocol.ts`: tipos de mensagem
  `create-room`, `join-room`, `room-created`, `room-joined`,
  `room-full`, `room-not-found`, `viewer-count`, `error`.
- `backend/src/websocket/connectionHandler.ts`: liga cada conexão WS ao
  RoomManager e ao protocolo.
- **Testado:** simulação com 4 clientes WS reais (criar sala, entrar
  como viewer, notificação de `viewer-count` ao broadcaster, terceiro
  participante recebendo `room-full`, sala inexistente recebendo
  `room-not-found`). Todos os cenários passaram.

### STEP-006 — Roteamento e conexão de sala no frontend
**O que foi feito:**
- Adicionado `react-router-dom`. Rotas: `/` (Home) e `/s/:roomId` (Room).
- `frontend/src/room/roomClient.ts`: wrapper tipado do WebSocket
  (espelha o protocolo do backend — duplicado por enquanto, ver
  comentário no arquivo sobre isso).
- `frontend/src/pages/Room.tsx`: conecta ao signaling server, cria ou
  entra na sala e mostra status (aguardando, sala cheia, não
  encontrada, etc). **Ainda sem vídeo/captura de tela** — isso é
  STEP-007.
- `frontend/src/pages/Home.tsx`: botão "Iniciar transmissão" agora leva
  a `/s/new` com `intent: create`; a própria página de sala cria a
  sala e corrige a URL para `/s/<serial>`. Botão "Assistir" pede o
  link/código (via `prompt`, provisório) e navega até a sala.
- **Testado:** `tsc -b` sem erros e `vite build` gerando bundle de
  produção sem warnings.

### STEP-007 — Captura de tela + WebRTC real (vídeo ponta a ponta)
**Prompt origem:** "próximo step"
**O que foi feito:**
- `backend/src/signaling/protocol.ts`: novas mensagens `offer`,
  `answer`, `ice-candidate`, `stop-broadcast` (cliente→servidor) e
  `offer`, `answer`, `ice-candidate`, `peer-joined`, `peer-left`,
  `broadcast-ended` (servidor→cliente).
- `backend/src/websocket/connectionHandler.ts`: o servidor agora só
  **retransmite** essas mensagens entre os dois participantes da sala
  — nunca abre nem entende o conteúdo (spec seções 10 e 22). Também
  passou a avisar `peer-joined`/`peer-left` quando alguém entra/sai,
  para o lado do broadcaster saber quando criar a offer.
- `backend/src/rooms/RoomManager.ts`: `removeParticipant` agora
  retorna o participante removido (necessário para notificar o outro
  lado corretamente ao desconectar).
- `frontend/src/webrtc/peerConnection.ts` (novo): `createPeerConnection`
  (STUN público do Google), `captureScreen` (`getDisplayMedia`, tenta
  vídeo+áudio), `stopStream`.
- `frontend/src/pages/Room.tsx`: reescrita com o fluxo completo:
  - Broadcaster: botão "Selecionar tela, janela ou aba" → abre o
    seletor nativo do navegador → cria a `RTCPeerConnection` → manda
    `offer` assim que há um espectador na sala.
  - Viewer: cria a `RTCPeerConnection` ao entrar, responde a `offer`
    com `answer`, recebe a track remota e exibe no `<video>`.
  - ICE candidates trocados nos dois sentidos, com fila para
    candidatos que chegam antes da `remoteDescription` estar pronta
    (trickle ICE).
  - Botão "Encerrar transmissão" e handling do botão nativo "Parar
    compartilhamento" do navegador — os dois avisam o espectador
    (`broadcast-ended`) e liberam a sala para uma nova transmissão
    (spec seção 16), sem destruir a sessão.
  - Se o espectador desconecta, o broadcaster recicla a conexão para
    aceitar um próximo espectador sem precisar recarregar a página.
- **Ainda não implementado nesta etapa:** seletor de qualidade
  (SD/HD/Automático — bitrate e resolução ficam no padrão do
  navegador), TURN, troca de transmissor (o segundo participante ainda
  entra sempre como `viewer`, nunca pode virar `broadcaster`),
  indicador de latência/FPS na tela.
- **Testado:**
  - `tsc -b` e `vite build` do frontend, limpos.
  - `tsc` de produção do backend, limpo.
  - Simulação com 2 clientes WS reais cobrindo: `peer-joined` ao
    entrar, `viewer-count`, retransmissão de `offer`/`answer`/
    `ice-candidate`, `stop-broadcast` → `broadcast-ended`, e
    `peer-left` + `viewer-count` atualizado ao desconectar. Todos os
    cenários passaram.
  - **Não testado ainda** (precisa de dois navegadores reais, fora do
    alcance deste ambiente): captura de tela de verdade, NAT
    traversal/ICE em rede real, compatibilidade Safari/iPad. Vale
    testar manualmente assim que subir para um servidor com HTTPS
    (câmera/tela exigem contexto seguro).

### STEP-008 — Seletor de qualidade (SD/HD/Automático)
**Prompt origem:** "próximo passo"
**O que foi feito:**
- `frontend/src/webrtc/quality.ts` (novo): ladder de 3 degraus exatamente
  como a spec (seção 8): `420p/30fps → 720p/30fps → 720p/60fps`.
  - `applyProfile`: aplica resolução/FPS via `track.applyConstraints`
    e bitrate máximo via `RTCRtpSender.setParameters`.
  - `startQualityMonitor`: a cada 2s lê `getStats()` (perda de pacotes,
    RTT do candidate-pair ativo). No modo **Automático**, sobe ou desce
    um degrau do ladder com histerese (2 leituras ruins seguidas pra
    descer, 4 boas seguidas pra subir — evita ficar oscilando). Nos
    modos **SD**/**HD** fixos, só reporta RTT para exibição.
- `frontend/src/webrtc/peerConnection.ts`: `captureScreen` agora recebe
  o perfil de qualidade e a flag de áudio, e passa isso como
  `width`/`height`/`frameRate` para o `getDisplayMedia`.
- `frontend/src/pages/Room.tsx`:
  - Tela de seleção do broadcaster agora tem os controles da spec
    (seção 13): rádio Automático/SD/HD + checkbox "Incluir áudio do
    sistema", antes do botão de selecionar a origem.
  - Painel durante a transmissão (spec seção 14, versão simplificada)
    mostra o degrau de qualidade atual e a latência aproximada (RTT),
    sem virar um painel técnico cheio de métricas.
  - Ao reconectar com um novo espectador (depois que o anterior sai),
    a qualidade escolhida é reaplicada e o monitor reinicia do zero.
- **Ainda não implementado:** troca de transmissor, TURN, indicador de
  qualidade no lado do espectador (a spec só pede isso no transmissor).
- **Testado:** `tsc -b` e `vite build` do frontend, limpos. A adaptação
  automática em si (subir/descer degrau sob perda de pacotes real)
  precisa de uma rede real com dois navegadores para validar — fora do
  alcance deste ambiente; a lógica foi revisada manualmente linha a
  linha (histerese, guarda contra oscilação, tratamento de erro
  silencioso quando o navegador não aceita `applyConstraints`).

### STEP-009 — Troca de transmissor
**Prompt origem:** "Seguir para o próximo passo"
**O que foi feito (spec seção 4):**
- `backend/src/signaling/protocol.ts`: novas mensagens
  `request-broadcast`, `accept-broadcast-request`,
  `decline-broadcast-request` (cliente→servidor) e `broadcast-request`,
  `broadcast-request-declined`, `role-changed` (servidor→cliente).
- `backend/src/rooms/RoomManager.ts`: `swapRoles(room)` troca os papéis
  dos dois participantes; `getParticipant` auxiliar.
- `backend/src/websocket/connectionHandler.ts`:
  - `request-broadcast`: só aceito de quem é `viewer`; retransmitido
    ao transmissor atual como `broadcast-request`.
  - `accept-broadcast-request`: só aceito de quem é `broadcaster`;
    chama `swapRoles` e manda `role-changed` (com o papel **novo** de
    cada um) individualmente para os dois sockets.
  - `decline-broadcast-request`: retransmitido a quem pediu como
    `broadcast-request-declined`.
- `frontend/src/pages/Room.tsx`:
  - Espectador ganha um botão "Solicitar transmissão" (visível tanto
    esperando quanto já assistindo). Mostra "aguardando resposta..."
    enquanto não chega retorno, e "solicitação recusada" se for o caso.
  - Transmissor ganha um banner "Um espectador quer transmitir" com
    Aceitar/Recusar, visível tanto na tela de seleção quanto já
    transmitindo.
  - `handleRoleChanged`: ao trocar de papel, encerra a captura local
    (se estava transmitindo), fecha a `RTCPeerConnection` antiga e
    monta a UI do novo papel — vira `broadcaster-select` (escolher
    qualidade/origem de novo) ou `viewer-waiting` (com uma pc nova
    pronta pra receber offer). Como ninguém saiu da sala, o par
    continua "presente" (`hasPeerRef`), então assim que o novo
    transmissor escolher a origem, a offer já sai automaticamente.
- **Testado:**
  - `tsc -b` e `vite build` do frontend, limpos; `tsc` do backend, limpo.
  - Simulação com 2 clientes WS reais cobrindo: solicitação → recusa
    → solicitação de novo → aceite → troca de papéis confirmada nos
    dois lados → o novo transmissor recebendo um pedido de volta do
    antigo transmissor (agora viewer). Também confirmado que
    `accept-broadcast-request` vindo de quem não é o transmissor atual
    é silenciosamente ignorado (sem crash).
  - **Não testado ainda:** a parte visual/WebRTC de verdade (precisa
    de dois navegadores reais).

### STEP-010 — TURN como fallback
**Prompt origem:** "Próximo passo."
**O que foi feito (spec seções 6 e 10):**
- `backend/src/server.ts`: endpoint `GET /turn-credentials`, gerando
  credenciais TURN de **curta duração** (10 min) pelo mecanismo REST
  padrão do coturn — usuário é o timestamp de expiração, senha é
  HMAC-SHA1 desse usuário com um segredo compartilhado
  (`TURN_SECRET`). Escolhido em vez de embutir usuário/senha fixos no
  bundle do frontend, que ficariam visíveis a qualquer um e nunca
  expirariam. Sem `TURN_SECRET`/`TURN_URLS` configurados, o endpoint
  responde com lista vazia — aplicação segue só com STUN, como antes.
- `frontend/src/webrtc/turnClient.ts` (novo): busca essas credenciais
  no backend; falha silenciosa (volta lista vazia) se o backend não
  tiver TURN configurado ou estiver fora do ar.
- `frontend/src/webrtc/peerConnection.ts`: `createPeerConnection`
  agora aceita uma lista de servidores TURN extras, somada ao STUN
  público que já existia.
- `frontend/src/pages/Room.tsx`: busca as credenciais TURN em paralelo
  com a conexão ao signaling server, e só entra/cria a sala depois que
  isso resolve — garante que a primeira `RTCPeerConnection` já nasce
  com TURN disponível quando configurado. Todos os pontos que criam
  uma `RTCPeerConnection` (entrada inicial, troca de transmissor,
  reconexão após espectador sair, depois de `broadcast-ended`) agora
  passam a usar essas credenciais.
- `infrastructure/coturn/turnserver.conf` + `README.md`: configuração
  de referência do coturn (auth efêmera via `use-auth-secret`, faixa
  de portas de relay, TLS opcional) e instruções de instalação via
  `apt` — **sem Docker**.
- `README.md` raiz: documentadas as novas variáveis de ambiente
  (`TURN_SECRET`, `TURN_URLS` no backend; `VITE_API_URL` no frontend).
- **Testado:**
  - `tsc -b` e `vite build` do frontend, limpos; `tsc` do backend, limpo.
  - Endpoint testado nos dois cenários: sem `TURN_SECRET` (responde
    `{"iceServers":[]}`) e com `TURN_SECRET`/`TURN_URLS` configurados
    (responde credenciais HMAC válidas, com `ttlSeconds: 600`).
  - **Não testado ainda:** um servidor coturn real (precisa de VPS com
    IP público) e a troca efetiva para relay quando P2P direto falha —
    isso só é observável numa rede real com NAT restritivo, fora do
    alcance deste ambiente.

### STEP-011 — Infraestrutura de deploy (Nginx + systemd + Certbot)
**Prompt origem:** "Siga."
**O que foi feito (spec seção 11 — sem Docker em nenhuma etapa):**
- `infrastructure/nginx/screen-share.conf`: reverse proxy servindo o
  frontend estático (`try_files` pro roteamento SPA) e encaminhando
  `/ws` (WebSocket, com `Upgrade`/`Connection` e timeout longo pra
  sinalização), `/health` e `/turn-credentials` pro backend em
  `127.0.0.1:3001`. TLS via Certbot.
- `infrastructure/systemd/screen-share-backend.service`: mantém
  `node dist/server.js` sempre ativo, reinicia sozinho em falha,
  roda como usuário dedicado (`screenshare`), com um pouco de
  hardening (`NoNewPrivileges`, `ProtectSystem=strict`).
  `screen-share-backend.env.example` documenta as variáveis de
  ambiente esperadas.
- `infrastructure/README.md` (novo): passo a passo completo de deploy
  em Ubuntu, do `apt install` até o teste pós-deploy, amarrando Nginx
  + backend (systemd) + coturn (já feito no STEP-010) em um fluxo só.
- READMEs de `nginx/` e `systemd/` atualizados (eram placeholders).
- **Testado:**
  - `screen-share-backend.service`: sintaxe validada com
    `systemd-analyze verify` (ferramenta testada com um arquivo
    propositalmente quebrado primeiro, pra confirmar que ela pega erro
    de verdade — pegou).
  - `screen-share.conf`: sintaxe validada com `nginx -t` (Nginx
    instalado temporariamente neste ambiente só pra esse teste,
    removido em seguida), incluindo um certificado TLS descartável
    gerado na hora — `nginx -t` confirmou "configuration file test is
    successful".
  - **Não testado** (fora do alcance deste ambiente, por natureza):
    Certbot emitindo um certificado real (precisa de domínio público
    apontando pro servidor), coturn relayando mídia de verdade, e o
    fluxo completo em produção com dois navegadores reais.

### STEP-012 — Correção: espectador via só um frame de vídeo vazio (+ robustez)
**Prompt origem:** print do teste local (vídeo em 0:00, nada tocando) + "faça uma varredura".
**Causa raiz:** `pc.ontrack` atribuía `srcObject` só se o `<video>` já existisse, mas
o `<video>` só era renderizado depois do status virar `viewer-connected` (setado logo
em seguida). O elemento nascia sem stream. Reproduzido em teste antes de corrigir.
**Correções (Room.tsx):**
- `srcObject` ligado por *callback ref* + `attachRemoteStream()`, chamado tanto no
  `ontrack` quanto quando o `<video>` monta (ordem imprevisível).
- Autoplay bloqueado → toca mudo e mostra "Ativar som".
- Espectador cria `RTCPeerConnection` NOVA quando o transmissor sai (reaproveitar a
  antiga falhava na próxima offer).
- `room-joined` agora traz `peerPresent` (protocolo, front+back): quem entra numa sala
  já ocupada não recebe `peer-joined`, então um transmissor que recarregava a página
  nunca enviava a offer.
- Backend fora do ar não deixa mais a tela em "Conectando..." para sempre; erro + botão
  "Tentar novamente". Retry de `join-room` em `room-full` (recarregar a página).
- `RoomClient.send` não lança exceção com socket fechado.
- Controles do espectador conforme a spec §17 (só volume local + tela cheia) no lugar
  dos controles nativos (barra de tempo/pausa sem sentido ao vivo).
**Outras correções da varredura:**
- `quality.ts`: perda de pacotes agora por janela (delta), não acumulada na sessão;
  `qualityLimitationReason: "cpu"` também rebaixa a qualidade; erros de
  `setParameters/applyConstraints` vão ao console (antes eram engolidos) e o perfil é
  reaplicado após a negociação.
- Áudio de captura sem cancelamento de eco/supressão de ruído/AGC (destruíam áudio de
  filme/música).
- Backend: heartbeat ping/pong (derruba sockets mortos; sala não fica "cheia" após
  Wi-Fi cair) e bloqueio de `create-room`/`join-room` repetidos na mesma conexão.
**Testado:** 7 testes vitest (3 falhavam antes / mutação confirmada: desfazer cada
correção derruba o teste correspondente); backend com clientes WS reais
(`peerPresent`, guardas, heartbeat: participante mudo removido em ~570 ms).

### STEP-013 — Painel de métricas (spec §27) e teste em rede local
- `?debug=1` (persistido na aba): estado da conexão/ICE, tipo de par (host/srflx/relay),
  RTT, resolução, FPS, bitrate, perda, jitter, codec, limitação de CPU.
- `config.ts`: URL do WebSocket/API padrão = host da página (`:3001`), então testar do
  iPad via `http://IP-DO-PC:5173` funciona; `npm run dev:lan`.
- `tools/latency-clock.html` para medir latência tela→tela real.

### STEP-014 — Testes E2E (spec §26) e guia `TESTING.md`
- Playwright: 4 fluxos com dois navegadores (vídeo tocando de verdade, encerrar/retomar,
  troca de transmissor, recarregar transmissor) usando "tela falsa" por canvas.
- **NÃO executado por mim** (o ambiente não consegue baixar o Chromium): só foi validado
  que a suíte é reconhecida (`playwright test --list`). Rode `npm run test:e2e` aí.

### STEP-015 — Mensagem clara para captura bloqueada (contexto inseguro)
Abrir o transmissor por `http://IP:5173` (ex.: `npm run dev -- --host`) faz o navegador
esconder `getDisplayMedia`. Antes: "verifique as permissões". Agora: explica a regra
(https ou localhost) e diferencia "cancelado/negado". Teste vitest adicionado (8 passando).
(As pendências de Render/TURN externo citadas antes passam a ser o STEP-016.)

### STEP-016 — Diagnóstico visível de falha de conexão P2P + E2E sem baixar navegador
**Prompt origem:** print com "1 espectador conectado" mas tela preta, e falha ao baixar o
Chromium do Playwright (rede corporativa bloqueando `cdn.playwright.dev`).
**Causa provável do print (não comprovada — falta o painel `?debug=1` do usuário):** sem a
linha "Latência" no transmissor, a conexão ICE provavelmente não fechou (`connectionState`
!= `connected`). Antes disso, a tela do espectador ficava preta sem nenhuma pista.
**Correções:**
- `Room.tsx`: `pc.onconnectionstatechange` agora alimenta a tela. Enquanto não chega o
  primeiro frame (`onLoadedMetadata`), mostra "Conectando..." → "Conectado, aguardando
  imagem" (origem parada/minimizada quase não manda quadros) → mensagem explícita de
  falha, sugerindo TURN, quando `connectionState === "failed"`. O transmissor também
  mostra esse erro quando a conexão dele falha.
- `playwright.config.ts`: usa `channel: "chrome"` (Chrome já instalado) em vez do
  Chromium que o Playwright baixa — evita depender de `cdn.playwright.dev`, que redes
  corporativas/antivírus costumam bloquear. Adicionado
  `--disable-features=WebRtcHideLocalIpsWithMdns` (mDNS de candidatos ICE também costuma
  ser barrado nesse tipo de rede).
- `vite.config.ts`: `test.globals: true` — sem isso, @testing-library/react não limpava o
  DOM entre testes no mesmo arquivo, e o novo teste falhava com "multiple elements"
  (2º teste via o DOM do 1º ainda montado). Corrigido; 9/9 testes passando.
**Ainda não confirmado:** se a causa real do print foi ICE falhando, o "Compartilhar aba do
Chrome" apontado para outra aba parada (`claude.ai`, visível no print), ou outra coisa — só
o painel `?debug=1` no próximo teste do usuário confirma.

### STEP-017 — FPS real visível na tela do transmissor
**Prompt origem:** "é possível verificar quantos fps está oscilando? implemente na tela do
transmissor".
- `quality.ts`: `startQualityMonitor` já lia `getStats()` a cada 2s para bitrate/perda;
  passou a também ler `outbound-rtp.framesPerSecond` (FPS real que o navegador está
  codificando, medido, não o nominal do modo escolhido) e repassar no `QualityInfo`.
- `Room.tsx`: painel do transmissor (visível sem `?debug=1`) ganhou
  "· FPS atual: N" ao lado de Qualidade e Latência, atualizando a cada 2s.
- **Testado:** teste unitário confirma que o FPS reportado pelo `getStats` chega até o
  callback exibido na tela, oscilando entre leituras (60 → 34 → 58); mutação (removendo a
  correção) derruba o teste. 10/10 passando.

---

## Plano original de 11 etapas — concluído

Todas as etapas do plano inicial (STEP-001 a STEP-011) foram
implementadas e testadas no que era possível testar neste ambiente
(compilação, tipos, simulação de protocolo via WebSocket real,
validação de sintaxe de infraestrutura). O que resta é
inerentemente dependente de um ambiente real:
- testar em dois navegadores/dispositivos de verdade (vídeo, áudio,
  Safari/iPad);
- emitir um certificado TLS real com um domínio público;
- rodar o coturn de verdade numa rede com NAT restritivo pra confirmar
  o fallback de relay;
- medir latência real em conexões do Brasil (spec seção 9).

## Possíveis próximos passos (fora do plano original)
- Testes automatizados end-to-end com Playwright (dois contextos de
  navegador simulando transmissor + espectador)
- Página de erro amigável quando o WebSocket cai (hoje só mostra
  "Não foi possível conectar ao servidor")
- Suporte a compartilhar sistema de áudio isolado sem vídeo (não
  pedido na spec original)
