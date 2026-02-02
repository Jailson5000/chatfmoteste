
Objetivo
- Fazer as reações (emoji) que o cliente coloca na sua mensagem aparecerem no painel (Conversas e Kanban) sem gerar efeitos colaterais nas mensagens normais.

Diagnóstico (o que está acontecendo de verdade)
- O frontend já está pronto para mostrar a reação:
  - `MessageBubble.tsx` renderiza a “bolinha” com o emoji quando recebe `clientReaction`.
  - `Conversations.tsx`, `useMessagesWithPagination.tsx` e `KanbanChatPanel.tsx` já carregam/passador `client_reaction`.
- O problema está no backend (webhook):
  - No banco, `client_reaction` está sempre NULL (contagem: 0).
  - Nos logs do webhook, a reação do cliente está chegando como `messages.upsert` com `messageType: "reactionMessage"` (ou seja: não é um evento `messages.reaction` como supusemos inicialmente).
  - Como o código não trata `reactionMessage` dentro do `messages.upsert`, ele acaba salvando a reação como uma “mensagem vazia” (`message_type='text'` e `content=''`), e o UI mostra isso como “📎 Mídia” (exatamente como aparece no print), ao invés de atualizar a mensagem original com `client_reaction`.

Estratégia de correção (mínimo risco, sem quebrar o que já funciona)
- Corrigir no webhook o tratamento de `reactionMessage` dentro de `messages.upsert`:
  1) Atualizar a mensagem alvo (a mensagem original que recebeu a reação) preenchendo `client_reaction`.
  2) Não inserir a reação como uma nova linha em `messages` (isso elimina a “mensagem fantasma” que vira “📎 Mídia”).
- Ajuste pequeno no frontend para não exibir “📎 Mídia” quando `message_type === 'text'` e `content` está vazio, para “limpar” visualmente reações antigas que já foram salvas como mensagem vazia anteriormente (sem precisar deletar dados).

Mudanças planejadas (arquivos)
1) Backend: `supabase/functions/evolution-webhook/index.ts`
   A. Tipagem (seguro, sem impacto em runtime)
   - Em `MessageData.message`, adicionar:
     - `reactionMessage?: { text?: string; key?: { id?: string; fromMe?: boolean; remoteJid?: string } }`
     - (Deixar os campos opcionais para suportar variações do payload)

   B. Tratamento no `case 'messages.upsert'`
   - Logo após identificar `remoteJid` e validar que não é grupo, adicionar um “early return” para reações:
     - Condição: `data.messageType === 'reactionMessage'` OU `data.message?.reactionMessage`
     - Extrair:
       - `emoji = reactionMessage.text || null` (se vier vazio/removido, salvar null)
       - `reactedMessageId = reactionMessage.key?.id`
       - `reactedMessageIsFromMe = reactionMessage.key?.fromMe === true`
       - `reacterIsClient = data.key.fromMe === false`
     - Regra principal (o seu caso):
       - Se `reacterIsClient && reactedMessageIsFromMe && reactedMessageId`:
         - `UPDATE messages SET client_reaction = emoji_or_null`
         - Filtros para não “vazar” entre conversas/tenants:
           - `.eq('law_firm_id', lawFirmId)`
           - `.eq('conversation_id', conversation.id)` (depois que a conversa for resolvida)
           - `.eq('whatsapp_message_id', reactedMessageId)`
           - `.eq('is_from_me', true)`
       - (Opcional, para completar o recurso sem quebrar): Se for uma reação enviada por nós em mensagem do cliente, atualizar `my_reaction` de forma análoga.
     - Se o update não encontrar linha (0 linhas afetadas):
       - Logar diagnóstico com `reactedMessageId`, `conversation.id`, `lawFirmId` e (opcional) tentar fallback sem `conversation_id` (ainda com `law_firm_id` + `whatsapp_message_id`), só para cobrir variações de histórico.
     - Finalizar retornando `200 { success: true, action: "reaction_updated" }` e NÃO continuar para a seção “Save message to database”.

   C. Manter compatibilidade com o `case 'messages.reaction'`
   - Deixar o handler atual como fallback, mas tornar a checagem robusta para payloads que mandem `fromMe` como string/number:
     - Ex.: tratar `fromMe === false || fromMe === "false" || fromMe === 0`
   - Isso garante que, se alguma instância mandar como `messages.reaction`, também funcione.

2) Frontend: `src/components/conversations/MessageBubble.tsx`
   - Ajuste pequeno e seguro para “não inventar mídia” em mensagens de texto vazias:
     - Hoje existe o bloco:
       - `!hasMedia && !content && messageType !== "audio" -> "📎 Mídia"`
     - Alterar para só mostrar “📎 Mídia” quando o tipo não for texto:
       - Ex.: `!hasMedia && !content && messageType && messageType !== "audio" && messageType !== "text"`
   - Resultado:
     - As “mensagens fantasma” antigas (reactions salvas como texto vazio) deixam de aparecer como “📎 Mídia”.
     - Mensagens reais com mídia continuam aparecendo normalmente (porque `hasMedia` ou `media_url` continua guiando a UI).

Validações obrigatórias (para garantir que não quebre nada)
1) Validação de dados (backend)
- Gerar uma reação real pelo WhatsApp em uma mensagem enviada por vocês.
- Confirmar em logs do webhook:
  - Detectou `reactionMessage`
  - Encontrou `reactedMessageId`
  - Fez UPDATE em `messages.client_reaction`
- Confirmar no banco (consulta):
  - A linha da mensagem original (`whatsapp_message_id = reactedMessageId`) agora tem `client_reaction = '👍'` (ou outro emoji).

2) Validação visual (frontend)
- Em Conversas:
  - A reação aparece como “bolinha” abaixo da mensagem enviada (outgoing).
  - Não aparece mais uma “📎 Mídia” fantasma quando o cliente reage.
- Em Kanban:
  - Mesmo comportamento (porque usa o mesmo `MessageBubble` + `useMessagesWithPagination` já escuta UPDATE).

3) Regressão (fluxos sensíveis)
- Envio/recebimento de: texto, imagem, áudio, documento, sticker, contato (vCard) e mensagens revogadas.
- Garantir que:
  - não surgiram mensagens duplicadas
  - status/ticks continuam atualizando
  - mídia continua baixando/abrindo normalmente

Riscos e mitigação
- Risco: variação do payload do Evolution para reação (campos diferentes).
  - Mitigação: tipagem opcional + logs detalhados + fallback no `messages.reaction` + fallback de update sem `conversation_id` se necessário.
- Risco: esconder alguma mensagem válida com `message_type='text'` e `content` vazio.
  - Mitigação: isso não é um caso normal no WhatsApp; e mensagens “apagadas” ainda renderizam o bloco de “Mensagem apagada”, então não some sinalização importante.

Resultado esperado
- Cliente reage (👍/❤️/etc) → a reação aparece na mensagem enviada por vocês, tanto em Conversas quanto no Kanban.
- Não aparece mais “📎 Mídia”/mensagem vazia gerada por reação.
