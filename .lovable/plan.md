

# Plano: Corrigir exibição de respostas citadas e nome da IA

## Problema 1: Citação (reply/quote) não aparece no chat

**Diagnóstico:** O sistema salva `reply_to_message_id` corretamente no banco (confirmado). O frontend resolve o `reply_to` via lookup local + fetch do banco. Possíveis causas:
- Quando a mensagem chega via Realtime, a resolução async pode falhar silenciosamente
- O `QuotedMessage` renderiza corretamente, mas depende de `replyTo` não ser null

**Correção:**
1. Melhorar o `resolveReplyTo` no realtime handler para ser mais robusto (retry on failure)
2. Adicionar log de diagnóstico para identificar se `reply_to_message_id` está chegando no payload do Realtime
3. Garantir que a resolução assíncrona atualiza o state corretamente (verificar race condition no `setMessages`)

## Problema 2: Nome da IA mostrando "Assistente IA" em vez do nome real

**Diagnóstico confirmado no banco:**
- Automação `1ba14ae9...` tem nome = "Maria"
- Mensagens recentes (hoje) têm `ai_agent_id` preenchido mas `ai_agent_name = NULL`
- Mensagens de ontem têm `ai_agent_name = "Maria"` corretamente

**Causa raiz:** O `ai-chat` salva `automationName` (linha 4254), e o evolution-webhook salva via `contextWithAgent.automationName` (linha 2802). Mas há mensagens "avulsas" (URLs, imagens, texto fragmentado) inseridas em caminhos que não populam o nome.

**Correção em 2 frentes:**

### Frente A — Backend: Preencher `ai_agent_name` retroativamente
- Criar migration SQL para atualizar mensagens existentes com `ai_agent_id` preenchido mas `ai_agent_name` nulo, buscando o nome da automação correspondente
- Adicionar trigger no banco que automaticamente preenche `ai_agent_name` a partir de `ai_agent_id` quando é NULL no INSERT

### Frente B — Frontend: Fallback no MessageBubble
- Se `aiAgentName` for null mas o message é `ai_generated`, buscar o nome do agente via `conversation.current_automation` (já disponível no contexto da conversa selecionada)
- Passar o `currentAgentName` como prop fallback para o MessageBubble

## Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| Migration SQL (nova) | UPDATE retroativo + trigger para ai_agent_name |
| `src/hooks/useMessagesWithPagination.tsx` | Melhorar resolveReplyTo no realtime |
| `src/components/conversations/MessageBubble.tsx` | Fallback do nome da IA |
| `src/pages/Conversations.tsx` | Passar nome do agente como fallback |

## Impacto
- Mensagens existentes com nome NULL serão corrigidas retroativamente
- Novas mensagens sempre terão o nome via trigger
- Frontend exibirá o nome correto mesmo se o backend falhar (fallback)

