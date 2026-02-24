

# Continuidade de conversas entre instancias -- Diagnostico e Plano

## Situacao atual

### Como funciona hoje

Cada conversa no banco tem um campo `whatsapp_instance_id` que vincula ela a uma instancia especifica. Quando a instancia desconecta, as conversas ficam "orfas" -- continuam no banco mas sem instancia ativa.

### O que acontece quando voce conecta uma NOVA instancia Uazapi

1. **Voce envia mensagem para o cliente**: O sistema cria uma **conversa nova** porque o webhook busca conversas filtrando por `whatsapp_instance_id = nova_instancia`. Como a conversa antiga pertence a instancia antiga, ele nao encontra e cria outra. **Historico perdido**.

2. **Cliente envia mensagem**: Mesmo problema. O webhook do uazapi busca `remote_jid + whatsapp_instance_id` e nao encontra a conversa antiga. **Cria conversa duplicada**.

### O que o Evolution ja faz (e o Uazapi nao)

O evolution-webhook chama `reassociate_orphan_records` automaticamente quando uma instancia conecta. Essa funcao SQL ja existe no banco e faz exatamente o que voce precisa:

- Busca conversas onde `last_whatsapp_instance_id = instancia_reconectada` E `whatsapp_instance_id = NULL`
- Reasigna essas conversas de volta para a instancia
- Faz o mesmo com os clientes

**Porem**, isso so funciona quando a instancia e a MESMA (reconecta). Se voce cria uma instancia NOVA com ID diferente, essa funcao nao ajuda.

---

## Plano de correcao

### 1. Uazapi webhook: chamar `reassociate_orphan_records` ao conectar

**Arquivo:** `supabase/functions/uazapi-webhook/index.ts`

Quando `dbStatus === "connected"`, adicionar a chamada que o evolution-webhook ja faz:

```typescript
// Após atualizar status para connected
const { data: reassocResult } = await supabaseClient
  .rpc('reassociate_orphan_records', { _instance_id: instance.id });
```

Isso resolve o caso de **reconexao da mesma instancia**.

### 2. Uazapi webhook: buscar conversa sem filtrar por instancia (fallback)

**Arquivo:** `supabase/functions/uazapi-webhook/index.ts`

Na logica de "FIND OR CREATE CONVERSATION" (linha 530), adicionar um fallback: se nao encontrar conversa pela instancia atual, buscar pelo `remote_jid` + `law_firm_id` sem filtro de instancia (pegar a mais recente). Se encontrar, **reatribuir** para a instancia atual:

```typescript
// 1. Buscar pela instancia atual (como hoje)
const { data: existingConv } = await supabaseClient
  .from("conversations")
  .select("id")
  .eq("law_firm_id", lawFirmId)
  .eq("remote_jid", remoteJid)
  .eq("whatsapp_instance_id", instance.id)
  .limit(1)
  .maybeSingle();

if (existingConv) {
  conversationId = existingConv.id;
} else {
  // 2. FALLBACK: Buscar conversa orfa do mesmo contato (qualquer instancia)
  const { data: orphanConv } = await supabaseClient
    .from("conversations")
    .select("id, whatsapp_instance_id")
    .eq("law_firm_id", lawFirmId)
    .eq("remote_jid", remoteJid)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (orphanConv) {
    // Reatribuir conversa orfa para a nova instancia
    conversationId = orphanConv.id;
    await supabaseClient
      .from("conversations")
      .update({ 
        whatsapp_instance_id: instance.id,
        last_whatsapp_instance_id: orphanConv.whatsapp_instance_id 
      })
      .eq("id", orphanConv.id);
    
    // Reatribuir cliente tambem
    // (buscar pelo client_id da conversa e atualizar)
  } else {
    // 3. Criar conversa nova (como hoje)
    // ...
  }
}
```

### 3. Reatribuir cliente junto com a conversa

Quando a conversa orfa for encontrada e reatribuida, tambem atualizar o `whatsapp_instance_id` do cliente vinculado para manter consistencia.

---

## Resumo do comportamento apos correcao

| Cenario | Hoje | Depois |
|---|---|---|
| Reconecta MESMA instancia | Cria conversa nova | Continua a mesma conversa |
| Cria instancia NOVA, mesmo numero | Cria conversa nova | Encontra conversa orfa e reatribui |
| Cliente envia msg para nova instancia | Cria duplicata | Encontra conversa existente e continua |
| Historico de mensagens | Perdido na conversa nova | Mantido integralmente |

## Impacto

- **Risco baixo**: a logica de fallback so ativa quando nao encontra conversa na instancia atual
- **Sem perda de dados**: apenas reatribui `whatsapp_instance_id`, nunca deleta
- **Compativel com Evolution**: nao altera o fluxo do evolution-webhook

