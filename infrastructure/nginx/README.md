# Nginx

Reverse proxy + terminação TLS. Serve o frontend estático diretamente
e encaminha `/ws`, `/health` e `/turn-credentials` para o backend
(porta 3001, só acessível em localhost).

Ver `infrastructure/README.md` para o passo a passo completo de deploy.
Arquivo de referência: `screen-share.conf` (sintaxe validada com
`nginx -t`).
