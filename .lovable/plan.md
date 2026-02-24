

# Correcoes: Foto, Nome da IA, Recusar Chamadas e Ignorar Grupos

## 4 Problemas Identificados

### 1. Foto de perfil nao puxa (automatico nem manual)

**Automatico (webhook):** A funcao `persistProfilePicture` depende de `chat.imagePreview` no payload do uazapi. Se o campo vier vazio ou nulo, nada acontece. Isso e normal — muitos contatos novos nao enviam `imagePreview` no primeiro contato.

**Manual (botao refresh):** O botao chama `evolution-api` → `fetch_profile_picture` que usa o provider abstraction (`whatsapp-provider.ts`). Para uazapi, chama `POST /profile/image` com `{ jid }`. Se o endpoint retorna erro, a UI mostra "Foto nao disponivel". 

**Problema real:** O endpoint uazapi `/profile/image` pode requerer parametros diferentes (ex: `number` em vez de `jid`, ou `GET` em vez de `POST`). Preciso verificar e ajustar. Alem disso, o auto-persist so roda na criacao de novo cliente (`if (resolvedClientId && chat.imagePreview...)`) — se o cliente ja existia sem foto, nao tenta buscar via API.

**Correcao:**
- **`supabase/functions/_shared/whatsapp-provider.ts`**: Adicionar fallback — se `POST /profile/image` falhar, tentar `GET /profile/image?number={phone}` (formato alternativo do uazapi)
- **`supabase/functions/uazapi-webhook/index.ts`**: Quando o cliente ja existe mas `avatar_url` esta null, chamar `persistProfilePicture` com `chat.imagePreview` OU fazer fetch via provider se `imagePreview` nao estiver disponivel

### 2. Mostra "Assistente IA" em vez do nome do agente (Davi)

**Causa raiz:** O `uazapi-webhook` salva a mensagem da IA no banco SEM `ai_agent_id` e `ai_agent_name`:

```typescript
// ATUAL (uazapi-webhook linhas 1032-1041)
await supabaseClient.from("messages").insert({
  conversation_id: conversationId,
  whatsapp_message_id: allMsgIds[0],
  content: aiText,
  message_type: "text",
  is_from_me: true,
  sender_type: "ai",
  ai_generated: true,
  law_firm_id: lawFirmId,
  // ← FALTA ai_agent_id e ai_agent_name!
});
```

O `evolution-webhook` faz corretamente — salva com `ai_agent_id` e `ai_agent_name`. O `MessageBubble` usa `aiAgentName || "Assistente IA"` como fallback, entao sem o campo, mostra o generico.

**Correcao:**
- **`supabase/functions/uazapi-webhook/index.ts`**: Antes de chamar `ai-chat`, buscar o nome da automacao. Depois, incluir `ai_agent_id` e `ai_agent_name` no insert da mensagem:

```typescript
// Buscar nome da automacao
const { data: automation } = await supabaseClient
  .from("automations")
  .select("name")
  .eq("id", conv.current_automation_id)
  .single();

// No insert:
ai_agent_id: conv.current_automation_id,
ai_agent_name: automation?.name || null,
```

### 3. Recusar Chamadas — NAO funciona para uazapi

**Situacao atual:** O toggle "Recusar Chamadas" no painel de detalhes chama:
- `get_settings` → para uazapi retorna `{ rejectCall: false }` hardcoded (nao consulta nada real)
- `set_settings` → para uazapi retorna `{ success: true }` sem fazer nada real

O uazapi nao tem equivalente da Evolution API `/settings/set` com `rejectCall`. A rejeicao de chamadas no uazapi e feita de forma diferente — pode nao existir essa funcionalidade na API.

**Correcao:**
- **`supabase/functions/evolution-api/index.ts`**: Para `get_settings` de uazapi, ler o campo `reject_calls` da tabela `whatsapp_instances` (adicionar se nao existir). Para `set_settings` de uazapi, salvar no banco e tentar configurar via API se endpoint existir.
- **Frontend**: Manter o toggle funcional salvando a preferencia no banco. O webhook do uazapi ja ignora chamadas se nao for mensagem de texto/media — mas precisamos verificar se o uazapi envia eventos de chamada e se podemos rejeitá-las.
- **Alternativa pragmatica**: Se o uazapi nao suporta reject de chamadas via API, esconder o toggle para instancias uazapi e mostrar uma mensagem "Nao suportado neste provedor".

### 4. Ignorar Grupos — JA funciona mas precisa ser padrao

**Situacao atual:** O uazapi-webhook ja tem `if (remoteJidRaw.includes("@g.us")) { skip }` na linha 479. Grupos sao ignorados por padrao no webhook.

**Porem:** A configuracao `groupsIgnore: true` e enviada ao Evolution na criacao/conexao da instancia. Para uazapi, nao ha equivalente — o filtro e feito apenas no webhook. Isso funciona, mas se o uazapi enviar mensagens de grupo como eventos individuais (sem `@g.us` no JID), poderiam passar.

**Correcao:**
- **`supabase/functions/uazapi-webhook/index.ts`**: Adicionar verificacao extra alem de `@g.us`: checar se `chat.isGroup === true` ou se o JID tem mais de 20 digitos (padrao de grupos). Garantir que NENHUMA mensagem de grupo chegue ate o processamento de IA.

```typescript
// Adicionar verificacao robusta de grupo
const isGroup = remoteJidRaw.includes("@g.us") 
  || chat.isGroup === true 
  || (chat as any).isGroup === true;
if (isGroup) {
  console.log("[UAZAPI_WEBHOOK] Skipping group message");
  break;
}
```

## Resumo de Mudancas

| Arquivo | Mudanca | Prioridade |
|---|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar `ai_agent_id` + `ai_agent_name` no insert da IA | CRITICO |
| `supabase/functions/uazapi-webhook/index.ts` | Reforcar filtro de grupos (isGroup check) | ALTO |
| `supabase/functions/uazapi-webhook/index.ts` | Melhorar auto-persist de foto (buscar via API quando imagePreview ausente) | MEDIO |
| `supabase/functions/_shared/whatsapp-provider.ts` | Adicionar fallback no fetchProfilePicture para uazapi | MEDIO |
| `supabase/functions/evolution-api/index.ts` | Salvar/ler `reject_calls` no banco para uazapi (ou esconder toggle) | MEDIO |
| `src/components/connections/ConnectionDetailPanel.tsx` | Esconder toggle "Recusar Chamadas" para instancias uazapi se nao suportado | BAIXO |

## Resultado Esperado

- Mensagens da IA mostram "Davi" em vez de "Assistente IA"
- Foto de perfil busca automaticamente via API quando imagePreview nao disponivel
- Botao manual de refresh funciona para uazapi
- Grupos sao filtrados de forma robusta (multiplos checks)
- Toggle de recusar chamadas e funcional ou escondido conforme suporte do provedor

