# Infraestrutura de deploy (sem Docker)

Visão geral do deploy em produção, ligando as três peças:

```
Usuário
   │
   ▼
Nginx (443, TLS via Certbot)
   ├── /              → arquivos estáticos do frontend (Vite build)
   ├── /ws            → proxy WebSocket → backend (127.0.0.1:3001)
   ├── /health         → proxy HTTP → backend
   └── /turn-credentials → proxy HTTP → backend

backend (systemd, porta 3001)
   └── gera credenciais TURN, faz sinalização WebRTC

coturn (systemd, portas 3478/5349 + faixa de relay)
   └── fallback de mídia quando P2P direto falha
```

## Passo a passo (Ubuntu)

```bash
# 1. Dependências do sistema
sudo apt update
sudo apt install -y nginx nodejs npm certbot python3-certbot-nginx coturn

# 2. Código-fonte
sudo mkdir -p /opt/screen-share
sudo cp -r backend frontend /opt/screen-share/
sudo useradd --system --home /opt/screen-share/backend screenshare
sudo chown -R screenshare:screenshare /opt/screen-share/backend

# 3. Build do backend
cd /opt/screen-share/backend
sudo -u screenshare npm ci
sudo -u screenshare npm run build   # gera dist/server.js

# 4. Variáveis de ambiente do backend
sudo cp infrastructure/systemd/screen-share-backend.env.example \
        /opt/screen-share/backend/.env
sudo nano /opt/screen-share/backend/.env   # ajuste TURN_SECRET, TURN_URLS

# 5. systemd (backend sempre ativo, sem Docker)
sudo cp infrastructure/systemd/screen-share-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now screen-share-backend
sudo systemctl status screen-share-backend   # confirma "active (running)"

# 6. Build do frontend (aponta para o domínio real)
cd /opt/screen-share/frontend
VITE_WS_URL=wss://screen-share.exemplo.com/ws \
VITE_API_URL=https://screen-share.exemplo.com \
  npm ci && npm run build

sudo mkdir -p /var/www/screen-share/frontend
sudo cp -r dist/* /var/www/screen-share/frontend/

# 7. Nginx + TLS
sudo cp infrastructure/nginx/screen-share.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/screen-share.conf /etc/nginx/sites-enabled/
sudo certbot --nginx -d screen-share.exemplo.com
sudo nginx -t && sudo systemctl reload nginx

# 8. TURN (coturn) — ver infrastructure/coturn/README.md para detalhes
sudo cp infrastructure/coturn/turnserver.conf /etc/turnserver.conf
# edite external-ip e static-auth-secret (mesmo valor de TURN_SECRET)
sudo systemctl enable --now coturn
```

## Verificação pós-deploy

```bash
curl https://screen-share.exemplo.com/health
# {"status":"ok"}

curl https://screen-share.exemplo.com/turn-credentials
# {"iceServers":[...],"ttlSeconds":600}  (se TURN estiver configurado)
```

Depois disso, abrir `https://screen-share.exemplo.com` em dois
navegadores/dispositivos e testar o fluxo completo (criar sala →
compartilhar link → assistir).

## Limitações conhecidas desta infraestrutura

- Backend e coturn nesta config ficam no mesmo servidor. Em uso mais
  pesado, o TURN (que relay toda a mídia quando P2P falha) é o
  primeiro a precisar de mais banda/CPU — considerar separar em outra
  máquina se isso virar gargalo.
- `systemd` reinicia o backend em caso de falha (`Restart=on-failure`),
  mas não há balanceamento/múltiplas instâncias nesta configuração —
  adequado para o escopo do MVP, não para alta disponibilidade.
- Nenhum provedor específico foi fixado aqui de propósito — a spec
  original pede para avaliar opções gratuitas/baixo custo no momento
  do deploy real, já que a oferta muda com o tempo.
