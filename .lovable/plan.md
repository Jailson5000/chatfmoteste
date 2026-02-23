
## Correcao de Emergencia: Sincronizar Status das Instancias WhatsApp

### Problema
O banco de dados esta desatualizado - mostra status "connecting" e "awaiting_qr" enquanto a Evolution API v2.3.7 confirma que 7 das 9 instancias estao **conectadas** (status "open"). Isso causa o painel exibir todas as instancias como desconectadas.

### Causa Raiz
1. Apos o restart do container Docker da Evolution API, os webhooks `connection.update` enviaram apenas o estado `connecting`, mas o estado final `open` nao foi processado corretamente pelo webhook handler
2. A funcao `sync-evolution-instances` exige JWT de usuario admin, impossibilitando chamada via curl/cron
3. A funcao `auto-reconnect-instances` marcou instancias como `awaiting_qr` erroneamente porque o banco ja estava desatualizado

### Plano de Correcao (2 etapas)

---

### Etapa 1: Correcao Imediata no Banco (SQL Migration)

Atualizar o status de todas as instancias para refletir o estado real da Evolution API:

| Instancia | Status Atual (banco) | Status Real (Evolution) | Acao |
|---|---|---|---|
| inst_ea9bfhx3 | connecting | open | Atualizar para "connected" |
| inst_0gkejsc5 | connecting | open | Atualizar para "connected" |
| inst_5fjooku6 | connecting | open | Atualizar para "connected" |
| inst_464pnw5n | connecting | open | Atualizar para "connected" |
| inst_l26f156k | connecting | open | Atualizar para "connected" |
| inst_d92ekkep | awaiting_qr | open | Atualizar para "connected" |
| inst_n5572v68 | awaiting_qr | open | Atualizar para "connected" |
| inst_s10r2qh8 | disconnected | NAO EXISTE na Evolution | Manter como disconnected |

A migration vai:
- Setar `status = 'connected'` para as 7 instancias que estao "open" na Evolution
- Resetar `awaiting_qr = false`, `disconnected_since = NULL`, `reconnect_attempts_count = 0`
- Manter `inst_s10r2qh8` inalterada (nao existe mais na Evolution)

---

### Etapa 2: Melhorar sync-evolution-instances para funcionar via Cron

Modificar a edge function `sync-evolution-instances` para aceitar chamadas sem JWT quando autenticadas via um header secreto (para uso em cron jobs), mantendo a autenticacao JWT para chamadas do painel admin.

**Arquivo:** `supabase/functions/sync-evolution-instances/index.ts`

Alteracoes:
- Adicionar verificacao de header `x-cron-secret` como alternativa ao JWT
- O segredo sera comparado com `CRON_SECRET` (variavel de ambiente ja usada em outras funcoes cron do projeto)
- Se o header `x-cron-secret` estiver presente e correto, pular verificacao de JWT
- Se nao, manter o fluxo atual de verificacao JWT + is_admin

Isso permitira chamar a funcao via cron ou curl sem precisar de um usuario logado:

```
curl -X POST ".../sync-evolution-instances" \
  -H "x-cron-secret: SEU_CRON_SECRET" \
  -H "Content-Type: application/json"
```

### Resultado Esperado
- O painel do MiauChat mostrara imediatamente as 7 instancias como "Conectado"
- Futuras dessincronizacoes serao corrigidas automaticamente pelo `auto-reconnect-instances` (que ja verifica `connectionState` na Evolution)
- A funcao de sync podera ser chamada manualmente via curl quando necessario

### Detalhes Tecnicos

**Migration SQL:**
```sql
UPDATE whatsapp_instances
SET 
  status = 'connected',
  awaiting_qr = false,
  manual_disconnect = false,
  disconnected_since = NULL,
  reconnect_attempts_count = 0,
  updated_at = now()
WHERE instance_name IN (
  'inst_ea9bfhx3', 'inst_0gkejsc5', 'inst_5fjooku6',
  'inst_464pnw5n', 'inst_l26f156k', 'inst_d92ekkep', 'inst_n5572v68'
);
```

**Edge Function `sync-evolution-instances`:**
- Adicionar bloco de autenticacao alternativa via `x-cron-secret`
- Reutilizar `SUPABASE_SERVICE_ROLE_KEY` para operacoes de banco (ja existente)
