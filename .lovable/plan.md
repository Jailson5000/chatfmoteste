

# Plano: Integracoes Instagram, Facebook, WhatsApp Cloud API + Limpeza Tray

## PARTE 1: Esclarecimento sobre "Tray Chat"

O "Tray Chat" NAO e uma integracao separada do Widget/Chat Web. Eles sao o MESMO sistema:

- A tabela `tray_chat_integrations` armazena o `widget_key` que o `widget.js` usa para autenticar
- As Edge Functions `widget-messages` e `ai-chat` leem desta tabela para validar requests e obter configuracoes padrao
- O componente `TrayChatIntegration` exibe "Chat Web" na UI de Settings

**Remover a tabela ou o hook quebraria o chat do site completamente.**

### O que PODEMOS limpar (sem quebrar nada)

| Acao | Impacto | Linhas removidas |
|------|---------|-----------------|
| Remover origin `TRAY` dos arrays de check | Nenhum (ninguem cria conversas com origin TRAY atualmente) | ~15 linhas em 5 arquivos |
| Renomear `useTrayIntegration` para `useWidgetIntegration` | Cosmético - clareza no codigo | 0 linhas (rename) |
| Renomear `TrayChatIntegration` para `WidgetChatIntegration` | Cosmético | 0 linhas (rename) |

**Recomendacao:** Manter tudo como esta por enquanto. A limpeza de nomes e cosmética e nao reduz a complexidade real. O ganho de linhas e minimo (~15 linhas).

---

## PARTE 2: Impacto nos arquivos grandes (Conversations.tsx e KanbanChatPanel.tsx)

### Tamanho atual estimado

| Arquivo | Linhas (aprox) |
|---------|---------------|
| `src/pages/Conversations.tsx` | ~3800+ |
| `src/components/kanban/KanbanChatPanel.tsx` | ~2700+ |
| `src/hooks/useConversations.tsx` | ~900+ |

### A integracao Instagram/Facebook/WhatsApp Cloud adicionaria codigo?

**NAO significativamente.** O impacto nos arquivos existentes e minimo:

| Arquivo | Mudanca para Instagram/Facebook/Cloud | Linhas adicionadas |
|---------|--------------------------------------|---------------------|
| `Conversations.tsx` | Adicionar `INSTAGRAM`, `FACEBOOK`, `WHATSAPP_CLOUD` nos arrays `nonWhatsAppOrigins` (6 locais) | ~6 linhas |
| `KanbanChatPanel.tsx` | Idem + roteamento de envio para `meta-api` | ~10 linhas |
| `ConversationSidebarCard.tsx` | Icones para novos origins | ~15 linhas |
| `KanbanCard.tsx` | Icones para novos origins | ~10 linhas |

O trabalho pesado fica em **novos arquivos** (Edge Functions, pagina de configuracao), nao nos existentes.

---

## PARTE 3: Plano de Implementacao - Instagram DM (Prioridade 1)

### Fase 1: Infraestrutura Base

**Nova tabela:** `meta_connections`

```text
id              uuid PK
law_firm_id     uuid FK -> law_firms
type            text ('instagram' | 'facebook' | 'whatsapp_cloud')
page_id         text (Facebook Page ID)
page_name       text
ig_account_id   text (Instagram Account ID, nullable)
access_token    text (criptografado)
token_expires_at timestamptz
is_active       boolean default true
created_at      timestamptz
updated_at      timestamptz
```

**Novas Edge Functions:**

1. `meta-webhook/index.ts` - Recebe webhooks do Meta (Instagram + Facebook + WhatsApp Cloud)
   - Verificacao de webhook (GET com challenge)
   - Roteamento por `object` field: `instagram`, `page`, `whatsapp_business_account`
   - Cria/atualiza conversas com origin correspondente
   - Insere mensagens recebidas

2. `meta-api/index.ts` - Envia mensagens via Graph API
   - Texto, imagem, audio, video, documento
   - Endpoint: `https://graph.facebook.com/v21.0/me/messages`
   - Token lookup por `law_firm_id` + `type`

3. `meta-oauth-callback/index.ts` - Processa callback do OAuth
   - Troca code por access token
   - Obtem long-lived token (60 dias)
   - Salva em `meta_connections`

### Fase 2: Frontend - Configuracao

**Novo componente:** `src/components/settings/integrations/InstagramIntegration.tsx`
- Card na grid de integracoes (IntegrationsSettings.tsx)
- Botao "Conectar" abre popup OAuth do Meta
- Selecao de Page/Instagram Account
- Configuracoes padrao (departamento, status, handler)

**Novo componente:** `src/components/settings/integrations/FacebookIntegration.tsx`
- Mesmo padrao do Instagram (reutiliza 90% do codigo)

### Fase 3: Roteamento de Mensagens

**Mudancas minimas em arquivos existentes:**

1. `Conversations.tsx` - Nos 6 locais com `nonWhatsAppOrigins`:
   ```text
   // De:
   const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB'];
   // Para:
   const nonWhatsAppOrigins = ['WIDGET', 'TRAY', 'SITE', 'WEB', 'INSTAGRAM', 'FACEBOOK'];
   ```
   E adicionar rota de envio para `meta-api` quando origin for INSTAGRAM ou FACEBOOK.

2. `KanbanChatPanel.tsx` - Mesmo padrao acima.

3. `ConversationSidebarCard.tsx` e `KanbanCard.tsx` - Adicionar icones:
   ```text
   if (upperOrigin === 'INSTAGRAM') return { label: "Instagram", icon: InstagramIcon };
   if (upperOrigin === 'FACEBOOK') return { label: "Facebook", icon: FacebookIcon };
   ```

4. `ai-chat/index.ts` - Adicionar `INSTAGRAM` e `FACEBOOK` ao `VALID_SOURCES` e ao check de `isWidgetConversation` (que passaria a se chamar `isNonWhatsAppConversation`).

### Fase 4: WhatsApp Cloud API (Prioridade 3)

Reutiliza a mesma infraestrutura Meta. Diferenca principal:
- Webhook payload diferente (`entry[].changes[].value.messages[]`)
- Envio via `/{phone_number_id}/messages` em vez de `/me/messages`
- Suporte a templates pre-aprovados
- Origin: `WHATSAPP_CLOUD`
- Convive com Evolution API (origin `WHATSAPP` vs `WHATSAPP_CLOUD`)

---

## PARTE 4: Resumo de Impacto

### Arquivos NOVOS (nao afetam codigo existente)

| Arquivo | Linhas estimadas |
|---------|-----------------|
| `supabase/functions/meta-webhook/index.ts` | ~300 |
| `supabase/functions/meta-api/index.ts` | ~200 |
| `supabase/functions/meta-oauth-callback/index.ts` | ~150 |
| `src/components/settings/integrations/InstagramIntegration.tsx` | ~200 |
| `src/components/settings/integrations/FacebookIntegration.tsx` | ~150 |
| Migracao SQL (tabela + RLS) | ~50 |
| **Total novo** | **~1050** |

### Arquivos MODIFICADOS (mudancas minimas)

| Arquivo | Mudanca | Linhas |
|---------|---------|--------|
| `Conversations.tsx` | Adicionar origins + rota meta-api | ~20 |
| `KanbanChatPanel.tsx` | Idem | ~15 |
| `ConversationSidebarCard.tsx` | Icones | ~15 |
| `KanbanCard.tsx` | Icones | ~10 |
| `ai-chat/index.ts` | VALID_SOURCES + routing | ~10 |
| `IntegrationsSettings.tsx` | Trocar "Coming Soon" por componentes reais | ~5 |
| `supabase/config.toml` | verify_jwt = false para meta-webhook | ~3 |
| **Total modificado** | | **~78 linhas** |

### Risco de Regressao

| Area | Risco | Motivo |
|------|-------|--------|
| WhatsApp (Evolution API) | Zero | Nenhuma edge function existente e modificada |
| Chat Web (Widget) | Zero | Nenhuma mudanca na tabela ou logica |
| Kanban drag-and-drop | Zero | Apenas icones adicionados |
| Status/Tags/Departamentos | Zero | Sistema de locking otimista nao e afetado |
| IA (ai-chat) | Baixo | Apenas adiciona novos sources validos |

### Secrets Necessarios

| Secret | Descricao |
|--------|-----------|
| `META_APP_ID` | ID do app Meta |
| `META_APP_SECRET` | Secret do app Meta |
| `META_WEBHOOK_VERIFY_TOKEN` | Token de verificacao do webhook |

### Ordem de Implementacao Sugerida

1. Criar tabela `meta_connections` + RLS
2. Criar `meta-webhook` (receber mensagens)
3. Criar `meta-api` (enviar mensagens)
4. Criar `meta-oauth-callback` (conexao)
5. Frontend: `InstagramIntegration.tsx` + update em Settings
6. Frontend: Icones nos cards + roteamento de envio
7. Testes end-to-end
8. Repetir para Facebook (reutiliza 90%)
9. WhatsApp Cloud API (fase posterior)

