
# Plano: Corrigir Duplicação de Mensagens da IA e Revisar Funcionamento

## Problemas Identificados

### Problema 1: Mensagens da IA Aparecendo Duplicadas (URGENTE)

**Diagnóstico:**
A imagem mostra mensagens idênticas da IA (agente "Maria") aparecendo duas vezes. A análise do banco revelou a causa raiz:

| Tenant | Instância | Número |
|--------|-----------|--------|
| FMO Advogados | inst_5fjooku6 | 556399916064 |
| Miau teste | inst_qloxuhkb | **556384017428** |

O contato **Gabrielle Martins** tem o número `556384017428`, que é o **mesmo número** da instância do "Miau teste".

**Fluxo do Bug:**
```text
1. FMO (inst_5fjooku6: 556399916064) envia mensagem da IA para Gabrielle (556384017428)
                    │
                    ▼
2. WhatsApp entrega a mensagem ao número 556384017428
                    │
                    ▼
3. Miau teste tem inst_qloxuhkb conectado ao número 556384017428
                    │
                    ▼
4. Evolution API dispara webhook para inst_qloxuhkb com fromMe=FALSE 
   (porque a mensagem veio de 556399916064, não do próprio número)
                    │
                    ▼
5. Webhook salva como mensagem do "cliente" no tenant Miau teste
                    │
                    ▼
6. RESULTADO: Mesma mensagem aparece em 2 tenants com is_from_me diferentes!
```

**Evidência no Banco:**
```
whatsapp_message_id: 3EB062AA9622FC9D05D88F
├── FMO Advogados:  is_from_me=true,  sender_type=ai,     ai_generated=true
└── Miau teste:     is_from_me=false, sender_type=client, ai_generated=false
```

### Problema 2: Mesma Mensagem Aparece 2x no MESMO Tenant

Além do problema cross-tenant, há duplicação **dentro** do mesmo tenant. Isso acontece porque:

1. A IA gera a resposta e salva no banco (via `ai-chat` ou `sendAIResponseToWhatsApp`)
2. O webhook recebe a confirmação de envio e tenta salvar novamente

A verificação de duplicatas atual (`eq('conversation_id', conversation.id).eq('whatsapp_message_id', data.key.id)`) deveria prevenir isso, mas há uma race condition.

---

## Solução Proposta

### Correção 1: Filtrar Mensagens Inter-Instância no Webhook

**Conceito:** Quando uma mensagem chega no webhook, verificar se o `remoteJid` (remetente) corresponde ao número de **outra instância do sistema**. Se sim, ignorar a mensagem pois ela já foi processada pelo tenant correto.

**Local:** `supabase/functions/evolution-webhook/index.ts` (início do processamento de `messages.upsert`)

**Lógica:**
```typescript
// ANTES de processar a mensagem, verificar se é inter-instância
const { data: isInterInstanceMessage } = await supabaseClient
  .from('whatsapp_instances')
  .select('id')
  .eq('phone_number', phoneNumber) // phoneNumber do remetente
  .neq('id', instanceId) // Não é a própria instância
  .limit(1);

if (isInterInstanceMessage && isInterInstanceMessage.length > 0) {
  logDebug('MESSAGE', 'Ignoring inter-instance message (sender is another system instance)', { 
    requestId, 
    senderPhone: phoneNumber,
    receiverInstance: instanceId
  });
  break; // Pular processamento
}
```

### Correção 2: Melhorar Verificação de Duplicatas com Lock

**Local:** `supabase/functions/evolution-webhook/index.ts` (linhas 4700-4712)

**Problema:** Race condition entre verificação e insert.

**Solução:** Usar `ON CONFLICT` no insert ao invés de verificar antes:

```typescript
// Em vez de:
// 1. SELECT para verificar se existe
// 2. INSERT se não existe

// Fazer:
const { data: savedMessage, error: msgError } = await supabaseClient
  .from('messages')
  .upsert({
    conversation_id: conversation.id,
    law_firm_id: conversation.law_firm_id,
    whatsapp_message_id: data.key.id,
    content: messageContent,
    // ... outros campos
  }, {
    onConflict: 'law_firm_id,whatsapp_message_id',
    ignoreDuplicates: true
  })
  .select()
  .single();
```

### Correção 3: Adicionar Validação no Frontend

**Local:** `src/pages/Conversations/hooks/useTimelineItems.tsx`

**Conceito:** Deduplicar mensagens no frontend antes de exibir:

```typescript
// Adicionar deduplicação por whatsapp_message_id
const deduplicateMessages = (items: TimelineItem[]): TimelineItem[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    if (item.type !== 'message') return true;
    const msgId = item.data.whatsapp_message_id;
    if (!msgId) return true;
    if (seen.has(msgId)) return false;
    seen.add(msgId);
    return true;
  });
};
```

---

## Análise do Sistema de IA

### Componentes Principais

| Componente | Arquivo | Função |
|------------|---------|--------|
| Webhook | `evolution-webhook/index.ts` | Recebe mensagens do WhatsApp, debounce, aciona IA |
| AI Chat | `ai-chat/index.ts` | Gera respostas usando Lovable AI/Gemini/GPT |
| Prompt | `automations.ai_prompt` | Texto do prompt configurado pelo usuário |
| Base de Conhecimento | `agent_knowledge` + `knowledge_items` | Conteúdo injetado no prompt |
| Templates | `templates` | Mensagens pré-configuradas com mídia |

### Fluxo do Prompt

```text
1. Prompt base (automations.ai_prompt)
       │
       ▼
2. Substituição de menções:
   - @empresa (nome, endereço, telefone, etc.)
   - @Nome do cliente
   - @Data atual, @Hora atual
   - @Horário comercial
   - @template:NomeTemplate (inline de templates)
   - @status [nome] (para mudar status)
   - @departamento [nome] (para transferir)
       │
       ▼
3. Injeção da Base de Conhecimento (via agent_knowledge)
       │
       ▼
4. Adição do histórico (35 mensagens anteriores)
       │
       ▼
5. Envio para IA com tools (CRM, Agendamento, Templates)
       │
       ▼
6. Processamento de tool_calls em loop (até 5 iterações)
       │
       ▼
7. Resposta final com deduplicação de parágrafos
```

### Etiquetas/Menções Suportadas

| Menção | Substituição |
|--------|--------------|
| `@empresa` | Nome da empresa |
| `@empresa:Endereço` | Endereço da empresa |
| `@empresa:Telefone` | Telefone da empresa |
| `@empresa:Email` | Email da empresa |
| `@empresa:Instagram` | Instagram da empresa |
| `@Horário comercial` | Dias e horários de funcionamento |
| `@Nome do cliente` | Nome do contato atual |
| `@Data atual` | Data formatada (ex: segunda-feira, 3 de fevereiro de 2026) |
| `@Hora atual` | Hora atual (ex: 14:35) |
| `@template:Nome` | Conteúdo do template inline |

### Status e Departamentos (via Function Calling)

A IA pode executar ações via tools:

| Tool | Função |
|------|--------|
| `change_status` | Muda o status do cliente no funil |
| `transfer_to_department` | Transfere para outro departamento |
| `add_tag` / `remove_tag` | Gerencia etiquetas do cliente |
| `transfer_to_responsible` | Transfere para humano ou outra IA |
| `send_template` | Envia template com mídia |

### Sistema de Deduplicação de Respostas

Já existe uma função `deduplicateParagraphs` (linha 2074-2128 do evolution-webhook) que usa similaridade de Jaccard para remover parágrafos duplicados:

```typescript
// Jaccard similarity > 95% = considera duplicata
const similarity = jaccardSimilarity(words, seenWords);
if (similarity > 0.95) {
  isDuplicate = true;
}
```

---

## Arquivos a Modificar

| Arquivo | Mudança | Risco |
|---------|---------|-------|
| `supabase/functions/evolution-webhook/index.ts` | Filtro inter-instância + melhor dedup | Médio |
| `src/pages/Conversations/hooks/useTimelineItems.tsx` | Dedup no frontend | Baixo |

---

## Detalhes Técnicos da Correção

### Mudança 1: Filtro Inter-Instância

**Localização:** Linha ~4100 do `evolution-webhook/index.ts` (início do case `messages.upsert`)

```typescript
// Após extrair phoneNumber e antes de buscar/criar conversa
// Verificar se o remetente é uma instância do sistema
const senderPhoneClean = phoneNumber.replace(/\D/g, '');

const { data: senderIsSystemInstance } = await supabaseClient
  .from('whatsapp_instances')
  .select('id, law_firm_id')
  .or(`phone_number.eq.${senderPhoneClean},phone_number.eq.${phoneNumber}`)
  .neq('id', instance.id)
  .limit(1);

if (senderIsSystemInstance && senderIsSystemInstance.length > 0) {
  logDebug('MESSAGE', 'INTER-INSTANCE: Ignoring message from another system instance', {
    requestId,
    senderPhone: phoneNumber,
    senderInstanceId: senderIsSystemInstance[0].id,
    receiverInstanceId: instance.id,
    reason: 'Message already processed by sender tenant'
  });
  break;
}
```

### Mudança 2: Upsert com ON CONFLICT

**Localização:** Linhas 4795-4815

Substituir o INSERT por UPSERT que ignora duplicatas:

```typescript
const insertResult = await supabaseClient
  .from('messages')
  .upsert({
    conversation_id: conversation.id,
    law_firm_id: conversation.law_firm_id,
    whatsapp_message_id: data.key.id,
    content: messageContent,
    message_type: messageType,
    media_url: mediaUrl || null,
    media_mime_type: mediaMimeType || null,
    is_from_me: isFromMe,
    sender_type: isFromMe ? 'system' : 'client',
    ai_generated: false,
    reply_to_message_id: replyToMessageId,
  }, {
    onConflict: 'law_firm_id,whatsapp_message_id',
    ignoreDuplicates: true
  })
  .select()
  .maybeSingle();
```

---

## Cronograma de Implementação

1. **Imediato:** Aplicar filtro inter-instância (resolve 80% das duplicatas)
2. **Após teste:** Melhorar dedup com upsert
3. **Opcional:** Dedup no frontend como fallback

---

## Verificação Pós-Implementação

```sql
-- Não deve haver mais duplicatas cross-tenant
SELECT whatsapp_message_id, COUNT(*) as cnt
FROM messages 
WHERE created_at > NOW() - INTERVAL '1 hour'
  AND whatsapp_message_id IS NOT NULL
GROUP BY whatsapp_message_id
HAVING COUNT(*) > 1;
```

---

## Impacto e Riscos

| Aspecto | Impacto |
|---------|---------|
| Mensagens existentes | Não afetadas (correção é prospectiva) |
| Performance | Mínimo (+1 query por mensagem) |
| Funcionalidade de chat | Preservada |
| IA e automações | Não afetadas |
| Kanban | Não afetado |
| Agenda Pro | Não afetada |

