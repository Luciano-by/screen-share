# Screen Share

Aplicação web minimalista de transmissão de tela P2P (WebRTC), sem
cadastro, sem chat, sem câmera. Ver `CHANGELOG.md` para o histórico de
etapas (cada uma com um ID, ex: `STEP-002`).

## Status atual

Apenas a **base** do projeto está pronta (STEP-001 a STEP-004):
estrutura de pastas, servidor backend rodando (sem lógica de sala
ainda) e frontend com a tela inicial estática (sem lógica ainda).

## Rodando localmente

### Backend

```bash
cd backend
npm install
npm run dev
```

Sobe em `http://localhost:3001`. Teste com `curl http://localhost:3001/health`.

Variáveis de ambiente opcionais (TURN, ver `infrastructure/coturn/README.md`):

```bash
TURN_SECRET=<segredo compartilhado com o coturn>
TURN_URLS=turn:seu-dominio:3478,turns:seu-dominio:5349
```

Sem elas, `/turn-credentials` responde vazio e a aplicação segue só
com STUN (sem fallback de relay).

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Sobe em `http://localhost:5173`. Variáveis de ambiente opcionais:

```bash
VITE_WS_URL=wss://seu-dominio      # padrão: ws://localhost:3001
VITE_API_URL=https://seu-dominio   # padrão: http://localhost:3001
```

## Testes

Ver `TESTING.md` (testes automáticos, E2E e roteiro de teste manual local).

## Não usar Docker

Este projeto **não utiliza Docker em nenhuma etapa** (decisão de
projeto). Deploy é feito com Node.js direto via `systemd` + Nginx (ver
`infrastructure/`).

## Deploy em produção

Passo a passo completo (Nginx, systemd, Certbot, coturn) em
`infrastructure/README.md`.
