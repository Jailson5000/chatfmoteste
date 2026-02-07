
# Plano: Exibir "Via Anúncio" no Chat e Kanban

## Resumo das Alterações

1. **Criar componente `AdClickBanner`** para exibir no chat
2. **Remover seção de anúncio do painel lateral** (ContactDetailsPanel.tsx)
3. **Adicionar badge "Via Anúncio" no KanbanCard**

---

## Etapa 1: Criar Componente AdClickBanner

**Novo arquivo:** `src/components/conversations/AdClickBanner.tsx`

Componente compacto que mostra:
- Ícone de megafone
- Título "Via Anúncio do Facebook"
- Título do anúncio
- Texto do corpo (com line-clamp)
- Thumbnail (se disponível)
- Link "Ver anúncio original" (se disponível)

```text
┌─────────────────────────────────────────────────────────────┐
│ 📢 Via Anúncio do Facebook                                  │
│ FMO Advogados Associados                                    │
│ 🔴 Atenção, aposentados entre 2015 e 2025!...               │
│ [thumbnail]                      Ver anúncio original →     │
└─────────────────────────────────────────────────────────────┘
```

---

## Etapa 2: Remover Seção do Painel Lateral

**Arquivo:** `src/components/conversations/ContactDetailsPanel.tsx`

Remover linhas 782-822 (seção CTWA Ad Info) para evitar duplicação.

---

## Etapa 3: Adicionar AdClickBanner no Chat

**Arquivo:** `src/pages/Conversations.tsx`

Adicionar import do componente e renderizar antes das mensagens:
- Condição: `selectedConversation.origin === 'whatsapp_ctwa' && selectedConversation.originMetadata && !hasMoreMessages`
- Posição: Após linha 4030, antes do `timelineItems.map`

---

## Etapa 4: Adicionar Badge no KanbanCard

**Arquivo:** `src/components/kanban/KanbanCard.tsx`

Adicionar lógica para detectar `origin === 'whatsapp_ctwa'` e exibir badge:

- Importar `Megaphone` do lucide-react
- Verificar se `conversation.origin?.toUpperCase() === 'WHATSAPP_CTWA'`
- Adicionar badge verde claro "Via Anúncio" na área de status/tags

Posição no card (conforme imagem de referência):

```text
┌─────────────────────────────────────────┐
│ EM  Expedito Máximo              • 11m  │
│     +55 11 98806-8634                   │
│ Sou um assistente virtual e não tenho...│
│ [Via Anúncio] [Qualificado] [Recepção]  │  ← Badge aqui
│ Solicitar do...                         │
│ ••3528                     IA · Maria   │
└─────────────────────────────────────────┘
```

---

## Arquivos Modificados

| Arquivo | Ação |
|---------|------|
| `src/components/conversations/AdClickBanner.tsx` | **CRIAR** - Novo componente |
| `src/components/conversations/ContactDetailsPanel.tsx` | **MODIFICAR** - Remover linhas 782-822 |
| `src/pages/Conversations.tsx` | **MODIFICAR** - Importar e renderizar AdClickBanner |
| `src/components/kanban/KanbanCard.tsx` | **MODIFICAR** - Adicionar badge "Via Anúncio" |

---

## Impacto e Riscos

| Aspecto | Avaliação |
|---------|-----------|
| Risco de quebra | **MUITO BAIXO** - Adicionando elementos visuais, removendo código redundante |
| Performance | **NENHUM IMPACTO** - Dados já disponíveis |
| Retrocompatibilidade | **TOTAL** - Conversas sem anúncio não são afetadas |

---

## Detalhes Técnicos

### Interface AdClickBanner

```typescript
interface AdClickBannerProps {
  originMetadata: {
    ad_title?: string | null;
    ad_body?: string | null;
    ad_thumbnail?: string | null;
    ad_source_url?: string | null;
  };
}
```

### Lógica do Badge no Kanban

```typescript
// Verificar se é via anúncio
const isFromAd = conversation.origin?.toUpperCase() === 'WHATSAPP_CTWA';

// Renderizar badge
{isFromAd && (
  <Badge className="text-[10px] h-4 px-1.5 border-0 bg-green-100 text-green-700">
    <Megaphone className="h-2.5 w-2.5 mr-0.5" />
    Via Anúncio
  </Badge>
)}
```

---

## Visualização Final

**Chat (topo):**
```text
┌─────────────────────────────────────────────────────────────┐
│ 📢 Via Anúncio do Facebook                                  │
│ FMO Advogados Associados                                    │
│ 🔴 Atenção, aposentados entre 2015 e 2025!                  │
│ [thumbnail]                      Ver anúncio original →     │
└─────────────────────────────────────────────────────────────┘
│ [Primeira mensagem do cliente]                              │
│ [Resposta da IA]                                            │
```

**Kanban Card:**
```text
┌─────────────────────────────────────────┐
│ EM  Nome do Cliente              • 5m   │
│     +55 11 98806-8634                   │
│ Última mensagem do chat...              │
│ [📢 Via Anúncio] [Qualificado]          │
│ ••3528                     IA · Maria   │
└─────────────────────────────────────────┘
```
