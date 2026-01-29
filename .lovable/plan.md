
## Diagnóstico (por que está duplicando e um fica “carregando”)
- O novo fluxo `send_media_async` **insere uma mensagem “temporária” no banco imediatamente** (status `sending`) com um **UUID gerado no backend** (`tempMessageId`).
- O frontend também está criando **uma mensagem otimista local** com **outro UUID** (`tempId`) antes de chamar o backend.
- Resultado:
  1) A mensagem otimista aparece na UI (id = `tempId`)
  2) Quase ao mesmo tempo, chega o evento Realtime do INSERT do banco (id = `tempMessageId`) e a UI adiciona uma “segunda mensagem”
  3) O WhatsApp recebe apenas 1 arquivo (correto), mas a UI fica com 2 itens; o “segundo” pode ficar preso em `sending` porque não está vinculado ao registro real do banco (ou não recebe o UPDATE correto)

Isso bate com o print: um item “enviado” e outro duplicado em loop de carregamento.

---

## Objetivo da correção
Garantir que **frontend e backend usem o mesmo ID** para a mensagem temporária, para que:
- o Realtime **não crie um segundo item**
- o item “otimista” **seja o mesmo registro** que depois será atualizado para `sent/failed`

---

## Correção proposta (sem regressões)
### A) Backend: aceitar `clientMessageId` no `send_media_async` e usar como `tempMessageId`
**Arquivo:** `supabase/functions/evolution-api/index.ts`

1. Estender o tipo `EvolutionRequest`:
   - adicionar `clientMessageId?: string`
2. No `case "send_media_async"`:
   - trocar `const tempMessageId = crypto.randomUUID()` por:
     - `const tempMessageId = body.clientMessageId ?? crypto.randomUUID()`
   - (opcional, recomendado) validar formato UUID (simples) e, se inválido, gerar novo UUID
3. Inserção no banco continua igual, mas usando `tempMessageId` já alinhado ao frontend
4. Resposta continua retornando `messageId: tempMessageId`

**Benefício:** o INSERT do banco via Realtime terá o **mesmo id** que a UI já tem — logo, não duplica.

---

### B) Frontend: criar a mensagem otimista usando o mesmo `clientMessageId` enviado ao backend
**Arquivos:**
- `src/pages/Conversations.tsx`
- `src/components/kanban/KanbanChatPanel.tsx`

Para **todas** as chamadas de `send_media_async` (imagem, documento, áudio):
1. Antes de adicionar a mensagem otimista:
   - gerar `clientMessageId = crypto.randomUUID()`
2. Criar a mensagem otimista com:
   - `id: clientMessageId`
   - `status: "sending"`
   - `media_url: blobUrl` (preview local)
   - (importante para estabilidade visual) preencher também:
     - `_clientTempId: clientMessageId` (onde existir o campo)
     - `_clientOrder` se o arquivo já usa ordenação estável
3. Ao chamar a function `evolution-api`, enviar:
   - `clientMessageId`
4. Remover/ajustar a lógica que faz:
   - “Update optimistic message with real ID” (troca de id)
   - porque agora o ID já é o “real” do registro temporário do banco
5. Ajustar o toast/copy:
   - o retorno do `send_media_async` significa “enfileirado”, então:
     - ou manter silencioso e deixar o Realtime “confirmar”
     - ou trocar para “Arquivo enfileirado para envio” (sem afirmar “enviado”)

**Benefício:** desaparece a duplicação e a mensagem não fica “travada”, pois o UPDATE do banco vai atualizar exatamente aquele item.

---

### C) Robustez extra (recomendado): em INSERT via Realtime, ao invés de só “ignorar”, fazer merge quando o ID já existir
**Arquivo:** `src/hooks/useMessagesWithPagination.tsx`

Hoje o INSERT faz:
- `if (prev.some(m => m.id === rawMsg.id)) return prev;`

Melhoria:
- Se já existir uma mensagem com esse `id`, atualizar/mesclar dados:
  - manter `media_url` blob (se existir) até o backend trazer URL final
  - preservar `_clientOrder/_clientTempId`
  
Isso deixa o sistema mais resiliente a futuras mudanças/edge cases.

---

## Como vamos validar (checklist anti-regressão)
1) **Conversations (WhatsApp)**
- Enviar imagem → deve aparecer **1** mensagem com preview e status `sending`, depois virar `sent` (sem duplicar)
- Enviar documento → mesma validação
- Enviar áudio → mesma validação

2) **Kanban (WhatsApp)**
- Repetir os 3 envios (imagem/doc/áudio) e confirmar que não duplica

3) **Falha controlada**
- Simular instância desconectada (ou erro de envio):
  - mensagem deve virar `failed/error` (apenas 1 item)
  - retry deve funcionar (sem duplicar)

4) **Não-WhatsApp (Widget/Tray/Site/Web)**
- Confirmar que o envio de mídia continua pelo caminho de storage/DB e não sofre alteração

---

## Arquivos que serão modificados
- `supabase/functions/evolution-api/index.ts`
- `src/pages/Conversations.tsx`
- `src/components/kanban/KanbanChatPanel.tsx`
- (opcional, robustez) `src/hooks/useMessagesWithPagination.tsx`

---

## Resultado esperado
- Não haverá mais mensagens duplicadas no frontend
- O “segundo item” que ficava carregando desaparece
- A UI passa a refletir o estado real do mesmo registro (sending → sent/failed) via Realtime
