

# Adaptar Edge Functions para Evolution API v2.2.3

## Contexto

A v2.2.3 usa Baileys v6 (mais estável) e tem algumas diferenças de API em relação à v2.3.x:

- O endpoint `/instance/restart` **EXISTE** na v2.2.3 (foi removido apenas na v2.3+)
- O endpoint `/instance/connect` funciona normalmente e retorna QR code mais rápido (sem delay de init do Baileys v7)
- A resposta do `/instance/create` já retorna QR code diretamente (sem necessidade de retries)
- Formato de webhook usa `webhook_by_events` (snake_case) - igual ao que já temos

## Mudanças Necessárias

### 1. `supabase/functions/evolution-api/index.ts`

**A) Restaurar `restart_instance` para usar `/instance/restart` diretamente (linhas ~2070)**
- Na v2.2.3 o endpoint `PUT /instance/restart/{instanceName}` funciona normalmente
- Manter o fallback de recrear se retornar 404 (caso a instância não exista)
- Nenhuma mudança necessária aqui - o código atual já faz isso corretamente

**B) Simplificar recovery do `get_qrcode` (linhas ~1100-1350)**
- Na v2.2.3, o Baileys v6 inicializa rápido - não há o problema de `{count:0}`
- O recovery de Level 1 e Level 2 pode ser mantido como está (é defensivo)
- Remover a detecção de versão que pode gerar logs confusos

**C) Reduzir retries no `create_instance` (linhas ~675-730)**
- Na v2.2.3, o `/instance/create` já retorna o QR code na primeira resposta
- Os 4 retries com delay de 5s eram necessários apenas para o Baileys v7
- Reduzir para 2 retries com delay de 2s como fallback

**D) Restaurar `global_restart_instance` (linhas ~4188-4218)**
- Na v2.2.3, `/instance/restart` funciona - manter como está
- Adicionar fallback para `/instance/connect` caso retorne 404

### 2. `supabase/functions/auto-reconnect-instances/index.ts`

**A) Restaurar uso do `/instance/restart` como método principal**
- Na v2.2.3, o endpoint de restart funciona e é o método preferido para reconexão
- Atualizar `attemptConnect` para tentar restart primeiro, connect como fallback
- A memória do sistema diz que usa connect porque restart foi removido na v2.3+ - agora podemos reverter

### 3. Docker Compose (instrução manual para o usuário)

O usuário precisa alterar a imagem no servidor:
```
atendai/evolution-api:v2.2.3
```

## Detalhes Técnicos

### Diferenças de API v2.2.3 vs v2.3.x

| Endpoint | v2.2.3 | v2.3.x |
|---|---|---|
| `/instance/restart` | Funciona (PUT) | Removido (404) |
| `/instance/connect` | Retorna QR rapido | Delay Baileys v7 |
| `/instance/create` | QR na resposta | Pode precisar retry |
| Webhook format | snake_case | snake_case |
| Settings format | Mesmo | Mesmo |

### Arquivos alterados
1. `supabase/functions/evolution-api/index.ts` - Reduzir retries no create, manter restart funcional
2. `supabase/functions/auto-reconnect-instances/index.ts` - Usar restart como método principal de reconexão

### Instruções manuais para o servidor
Após aprovação, o usuário deve executar no servidor VPS:
```bash
# Alterar imagem para v2.2.3
sed -i 's|evoapicloud/evolution-api:v2.3.1|atendai/evolution-api:v2.2.3|' docker-compose.yml
docker compose down && docker compose pull && docker compose up -d
```

