# coturn (servidor TURN)

Fallback usado quando a conexão P2P direta (STUN) não é possível —
redes com NAT simétrico/restritivo, algumas redes corporativas, etc
(spec seções 6 e 10).

## Instalação (sem Docker)

```bash
sudo apt install coturn
sudo cp turnserver.conf /etc/turnserver.conf
# edite /etc/turnserver.conf:
#   - external-ip: IP público do servidor
#   - static-auth-secret: gere um valor aleatório forte
sudo systemctl enable --now coturn
```

Abra no firewall:
- UDP/TCP 3478 (STUN/TURN)
- UDP/TCP 5349 (TURN sobre TLS, se configurado)
- UDP 49152–65535 (faixa de relay de mídia)

## Ligação com o backend

O backend (`backend/src/server.ts`) gera credenciais TURN de curta
duração (10 minutos) via HMAC-SHA1, usando o **mesmo** segredo do
coturn. Configure no backend, como variáveis de ambiente:

```bash
TURN_SECRET=<o mesmo valor de static-auth-secret do turnserver.conf>
TURN_URLS=turn:seu-dominio:3478,turns:seu-dominio:5349
```

Sem essas variáveis, o endpoint `/turn-credentials` do backend
responde com uma lista vazia e a aplicação segue funcionando só com
STUN (conexão P2P direta) — sem fallback de relay.

## Limitações conhecidas

- Todo o tráfego relayado passa pela banda **deste** servidor — não é
  P2P nesse caso. Isso é o principal custo de infraestrutura a
  monitorar (spec seção 11).
- Um TURN gratuito/próprio não garante banda ilimitada nem
  disponibilidade — dimensione conforme o uso real esperado.
