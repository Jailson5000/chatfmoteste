

# Fase 4: Adaptar birthday-messages e evolution-health para uazapi

## Problema de Login (JWT issued at future)

O erro "JWT issued at future" (PGRST303) e um problema temporario de sincronizacao de relogio entre os servidores de autenticacao e o banco de dados do Lovable Cloud. O login funciona (status 200), mas o PostgREST rejeita o token porque o campo `iat` esta "no futuro" em relacao ao relogio do banco. Isso se resolve automaticamente em alguns minutos. Basta recarregar a pagina e tentar novamente.

---

## 1. Adaptar `process-birthday-messages/index.ts`

Atualmente, esta funcao faz chamada direta para Evolution API (linha 190):
```
fetch(`${apiUrl}/message/sendText/${instance.instance_name}`, ...)
```

**Mudancas:**
- Importar `sendText` de `../_shared/whatsapp-provider.ts`
- Adicionar `api_provider` ao SELECT da query de `whatsapp_instances` (linha 132)
- Substituir a chamada direta `fetch()` por `sendText(instance, { number, text })`
- Remover a construcao manual de headers/body

**Antes:**
```typescript
const response = await fetch(
  `${apiUrl}/message/sendText/${instance.instance_name}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: instance.api_key },
    body: JSON.stringify({ number: remoteJid, text: message }),
  }
);
if (!response.ok) { ... }
```

**Depois:**
```typescript
import { sendText } from "../_shared/whatsapp-provider.ts";

// No SELECT, adicionar api_provider:
.select("id, instance_name, api_url, api_key, api_provider")

// Envio:
const result = await sendText(instance, { number: remoteJid, text: message });
if (!result.success) { ... }
```

Isso automaticamente roteia para Evolution ou uazapi baseado no `api_provider` da instancia.

---

## 2. Adaptar `evolution-health/index.ts`

Atualmente, esta funcao verifica saude apenas da Evolution API global. Para uazapi, nao existe um servidor centralizado - cada instancia tem sua propria URL/token.

**Mudancas:**
- Apos o health check da Evolution (manter como esta), adicionar um resumo de instancias uazapi
- No `instances_summary`, separar contagens por provider
- Consultar instancias uazapi do banco e fazer ping individual (opcional, via `getStatus`)

**Detalhes:**
- Adicionar ao SELECT de instancias: `api_provider`
- Separar o `instances_summary` em `evolution` e `uazapi`
- Adicionar campo `uazapi_summary` com contagem de instancias uazapi por status
- Opcionalmente fazer um health check em ate 3 instancias uazapi para verificar conectividade

**Antes (instances_summary):**
```typescript
const { data: instances } = await supabaseAdmin
  .from("whatsapp_instances")
  .select("status");
```

**Depois:**
```typescript
const { data: instances } = await supabaseAdmin
  .from("whatsapp_instances")
  .select("status, api_provider");

const evoInstances = (instances || []).filter(i => !i.api_provider || i.api_provider === 'evolution');
const uazInstances = (instances || []).filter(i => i.api_provider === 'uazapi');

// Separar summaries
```

---

## Arquivos Modificados

1. `supabase/functions/process-birthday-messages/index.ts` - Usar abstraction layer para envio
2. `supabase/functions/evolution-health/index.ts` - Adicionar contagem por provider

## Ordem de Implementacao

1. Atualizar birthday-messages para usar `sendText` do whatsapp-provider
2. Atualizar evolution-health para separar metricas por provider
3. Deploy das duas funcoes

