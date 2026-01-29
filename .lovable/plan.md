# Plano: Otimização de Performance do Sistema de Mensagens

## Status: ✅ FASE 1 IMPLEMENTADA

### Mudanças Implementadas

#### 1. Nova Action `send_media_async` (Edge Function)
- **Arquivo:** `supabase/functions/evolution-api/index.ts`
- **Comportamento:** Retorna em ~200ms com `tempMessageId`, processa envio em background
- **Benefício:** UI desbloqueia imediatamente

#### 2. Optimistic Updates para Mídia (Frontend)
- **Arquivos:** `src/pages/Conversations.tsx`, `src/components/kanban/KanbanChatPanel.tsx`
- **Comportamento:** Mostra preview local (blob URL) com status "sending" antes do backend responder
- **Benefício:** Feedback visual instantâneo

#### 3. Fluxo Implementado

```
NOVO FLUXO ASSÍNCRONO:
┌─────────────────────────────────────────────────────────────────────────┐
│ Usuário clica "Enviar" ──→ Edge Function                                │
│                              ↓                                          │
│ [200ms] ←── Retorna tempId ───┘                                         │
│                                                                         │
│ UI mostra "enviando..." ←── Optimistic Update (blob preview)            │
│                                                                         │
│ Background: Evolution API ──→ DB Update ──→ Realtime ──→ UI atualiza   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Métricas Esperadas

| Operação | Antes | Depois | Melhoria |
|----------|-------|--------|----------|
| Envio de áudio | ~5s | ~300ms | **16x** |
| Envio de imagem | ~3s | ~250ms | **12x** |
| Envio de documento | ~3s | ~250ms | **12x** |
| Feedback visual | ~3s | ~50ms | **60x** |

---

## Próximas Fases (Opcionais)

### FASE 2: Remover Verificação connectionState para Áudio
- **Impacto:** Reduz ~300-500ms adicionais por envio de áudio
- **Risco:** Baixo - erros serão tratados naturalmente pelo error handling
- **Status:** Não implementado

### FASE 3: Pré-carregamento de Mídia
- **Impacto:** Reduz espera ao abrir conversa com mídia
- **Status:** Não implementado

### FASE 4: Cache de Mídia no Backend
- **Impacto:** Reduz chamadas repetidas à Evolution API
- **Status:** Não implementado

---

## Arquivos Modificados

| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/evolution-api/index.ts` | Criado `send_media_async` action com background task |
| `src/pages/Conversations.tsx` | Mudou para `send_media_async`, adicionou optimistic updates |
| `src/components/kanban/KanbanChatPanel.tsx` | Mudou para `send_media_async`, adicionou optimistic updates |

---

## Compatibilidade

- ✅ `send_media` (síncrono) continua funcionando para fallback
- ✅ `send_message_async` já existia e continua funcionando
- ✅ Realtime continua como fonte de verdade para reconciliação
- ✅ Mensagens com status "failed" podem ser reenviadas
