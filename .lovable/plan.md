

# Plano: Integracoes Instagram, Facebook, WhatsApp Cloud API

## Status de Implementacao

### ✅ CONCLUIDO

1. **Tabela `meta_connections`** - Criada com RLS completo (5 policies), indexes, trigger updated_at
2. **Edge Function `meta-webhook`** - Webhook unificado para Instagram DM, Facebook Messenger e WhatsApp Cloud API
   - GET: Verificacao de webhook (challenge)
   - POST: Roteamento por `object` field (instagram, page, whatsapp_business_account)
   - Cria clientes, conversas e mensagens automaticamente
3. **Edge Function `meta-api`** - Envio de mensagens via Graph API
   - Suporta texto, imagem, audio, video, documento
   - Roteamento por origin (Send API para IG/FB, Cloud API para WABA)
   - Autenticado via JWT
4. **Edge Function `meta-oauth-callback`** - Fluxo OAuth completo
   - Troca code por short-lived token -> long-lived token (60 dias)
   - Lista pages do usuario para selecao
   - Detecta Instagram Business Account vinculado
   - Salva token criptografado (AES-GCM)
5. **Frontend: InstagramIntegration.tsx** - Card em Settings > Integracoes
6. **Frontend: FacebookIntegration.tsx** - Card em Settings > Integracoes
7. **IntegrationsSettings.tsx** - Atualizado com novos cards
8. **ConversationSidebarCard.tsx** - Icones para Instagram, Facebook, WhatsApp Cloud
9. **KanbanCard.tsx** - Icones para Instagram, Facebook, WhatsApp Cloud
10. **config.toml** - `verify_jwt = false` para meta-webhook e meta-oauth-callback

### 🔲 PENDENTE (proxima iteracao)

1. **Roteamento de envio em Conversations.tsx** - Adicionar `INSTAGRAM`, `FACEBOOK`, `WHATSAPP_CLOUD` aos arrays `nonWhatsAppOrigins` (7 locais) e adicionar sub-rota para chamar `meta-api` em vez de salvar direto no DB
2. **Roteamento de envio em KanbanChatPanel.tsx** - Mesmo padrao (1 local)
3. **ai-chat/index.ts** - Adicionar novos origins ao VALID_SOURCES
4. **Secrets** - Configurar META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN
5. **Rota OAuth callback** - Criar pagina `/auth/meta-callback` no React Router para processar o retorno do popup OAuth
6. **Testes end-to-end** com app Meta real

### Arquivos Criados

| Arquivo | Linhas |
|---------|--------|
| `supabase/functions/meta-webhook/index.ts` | ~320 |
| `supabase/functions/meta-api/index.ts` | ~230 |
| `supabase/functions/meta-oauth-callback/index.ts` | ~210 |
| `src/components/settings/integrations/InstagramIntegration.tsx` | ~140 |
| `src/components/settings/integrations/FacebookIntegration.tsx` | ~110 |

### Arquivos Modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/config.toml` | +4 linhas (verify_jwt) |
| `src/components/settings/IntegrationsSettings.tsx` | +4 linhas (imports + cards) |
| `src/components/conversations/ConversationSidebarCard.tsx` | +22 linhas (novos origins) |
| `src/components/kanban/KanbanCard.tsx` | +12 linhas (novos origins) |

