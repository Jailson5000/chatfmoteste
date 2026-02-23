
## Corrigir Status das Instancias Travadas + refresh_status do Admin Global

### Problema 1: refresh_status nao funciona para Admin Global

A funcao `refresh_status` na Edge Function `evolution-api` chama `getInstanceById(supabaseClient, lawFirmId, body.instanceId)` **sem passar o parametro `isGlobalAdmin`**. Como o admin global nao pertence ao law_firm das instancias, o filtro `law_firm_id` causa "Instance not found" para quase todas.

**Correcao**: Passar `isGlobalAdmin` na chamada do `refresh_status`, igual ja e feito no `refresh_phone` (linha 1256).

### Problema 2: Webhook URL sem token de autenticacao

A funcao `buildWebhookConfig` configura a URL do webhook como `https://...supabase.co/functions/v1/evolution-webhook` **sem incluir o token de autenticacao na query string**. A Evolution API envia webhooks duplicados (comportamento conhecido), e o webhook que nao tem o token e rejeitado. Para as instancias `inst_l26f156k` e `inst_n5572v68`, os eventos `open` foram perdidos e so os `connecting` foram processados.

**Correcao**: Alterar `buildWebhookConfig` para incluir `?token=EVOLUTION_WEBHOOK_TOKEN` na URL, e depois reaplicar webhooks.

### Problema 3: Reaplicar Webhooks ignora instancias "connecting"

O hook `useGlobalAdminInstances` filtra apenas instancias com `status === "connected"` para reaplicar webhooks. Instancias travadas como "connecting" sao ignoradas.

**Correcao**: Incluir instancias com status "connecting" no filtro de reaplicacao.

### Detalhes tecnicos

**Arquivo 1**: `supabase/functions/evolution-api/index.ts`
- Linha ~1200: Adicionar `isGlobalAdmin` na chamada `getInstanceById`
- Linha ~177-192: Alterar `buildWebhookConfig` para receber e incluir o token na URL

**Arquivo 2**: `src/hooks/useGlobalAdminInstances.tsx`
- Linha do `reapplyAllWebhooks`: Mudar filtro de `status === "connected"` para incluir `"connecting"` tambem

### Resultado esperado

1. O admin global conseguira atualizar o status de todas as instancias via "Refresh Status"
2. Os webhooks serao configurados com autenticacao correta, garantindo que eventos `open` sejam processados
3. Instancias travadas como "connecting" tambem terao seus webhooks reaplicados
4. Apos as correcoes, clicar "Reaplicar Webhooks" deve resolver o status de `inst_l26f156k` e `inst_n5572v68`
