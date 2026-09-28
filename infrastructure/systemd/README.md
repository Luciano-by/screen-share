# systemd

Mantém o backend Node.js ativo sem Docker (spec seção 11), com
reinício automático em caso de falha.

- `screen-share-backend.service`: unit file (sintaxe validada com
  `systemd-analyze verify`).
- `screen-share-backend.env.example`: variáveis de ambiente a copiar
  para `/opt/screen-share/backend/.env`.

Ver `infrastructure/README.md` para o passo a passo completo de deploy.
