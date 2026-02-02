# Plano de Implementação - Histórico

Este arquivo contém o histórico de planos implementados.

---

## ✅ Implementado: Suporte a Contatos (vCard)

**Data:** Fev 2026

Quando cliente envia contato compartilhado, agora aparece o nome e telefone formatados no chat.

---

## ✅ Implementado: Reações de Clientes nas Mensagens

**Data:** Fev 2026

Quando cliente reage a uma mensagem do atendente (ex: 👍, ❤️), o emoji agora aparece como uma bolinha abaixo do balão da mensagem.

**Arquivos alterados:**
- `supabase/functions/evolution-webhook/index.ts` - Handler para `messages.reaction`
- `src/components/conversations/MessageBubble.tsx` - Prop `clientReaction` + renderização
- `src/pages/Conversations.tsx` - Passa prop `clientReaction`
- DB: Coluna `client_reaction` na tabela `messages`
