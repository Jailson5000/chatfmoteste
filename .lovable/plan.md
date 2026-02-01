
# Plano: Exibir Mensagens de Anúncios do Facebook no Chat

## Objetivo
Detectar mensagens que vêm de anúncios "Click-to-WhatsApp" (CTWA) do Facebook/Instagram e exibir um badge visual no chat com os metadados do anúncio.

---

## Análise Técnica

### Estrutura dos Dados de Anúncios (externalAdReply)

Quando uma mensagem vem de um anúncio CTWA, o payload do WhatsApp inclui `contextInfo.externalAdReply`:

```json
{
  "contextInfo": {
    "externalAdReply": {
      "title": "Nome do Anúncio",
      "body": "Texto do anúncio",
      "thumbnailUrl": "https://...",
      "mediaUrl": "https://...",
      "sourceId": "ad_id_123",
      "sourceType": "AD",
      "sourceUrl": "https://fb.com/..."
    }
  }
}
```

### Campos Existentes no Banco

| Tabela | Campo | Status |
|--------|-------|--------|
| `conversations` | `origin` | Existe (text) |
| `conversations` | `origin_metadata` | Existe (jsonb) |
| `messages` | N/A | Não precisa de novo campo |

---

## Arquivos a Modificar

### 1. Webhook: `supabase/functions/evolution-webhook/index.ts`

**Alterações:**

1. **Adicionar interface `ExternalAdReply`** (~linha 773, junto com `ContextInfo`)
2. **Detectar `externalAdReply`** na função de extração de mensagem (~linha 4150)
3. **Atualizar conversa com `origin` e `origin_metadata`** quando detectar anúncio

```typescript
// Interface nova
interface ExternalAdReply {
  title?: string;
  body?: string;
  thumbnailUrl?: string;
  mediaUrl?: string;
  sourceId?: string;
  sourceType?: string;
  sourceUrl?: string;
}

// Atualizar ContextInfo para incluir externalAdReply
interface ContextInfo {
  stanzaId?: string;
  participant?: string;
  quotedMessage?: {...};
  externalAdReply?: ExternalAdReply; // NOVO
}
```

**Lógica de detecção (~linha 4150):**

```typescript
// Extrair info de anúncio CTWA se existir
const externalAdReply = 
  data.contextInfo?.externalAdReply ||
  data.message?.extendedTextMessage?.contextInfo?.externalAdReply ||
  data.message?.imageMessage?.contextInfo?.externalAdReply ||
  data.message?.videoMessage?.contextInfo?.externalAdReply ||
  null;

if (externalAdReply && !isFromMe) {
  // Atualizar conversa com origin = 'whatsapp_ctwa' e metadados do anúncio
  await supabaseClient
    .from('conversations')
    .update({
      origin: 'whatsapp_ctwa',
      origin_metadata: {
        ad_title: externalAdReply.title,
        ad_body: externalAdReply.body,
        ad_thumbnail: externalAdReply.thumbnailUrl,
        ad_source_id: externalAdReply.sourceId,
        ad_source_url: externalAdReply.sourceUrl,
        detected_at: new Date().toISOString(),
      }
    })
    .eq('id', conversation.id);
}
```

---

### 2. Frontend: `src/components/conversations/ConversationSidebarCard.tsx`

Adicionar badge visual na lista de conversas para indicar origem de anúncio:

```typescript
// Badge para conversas vindas de anúncio
{conversation.origin === 'whatsapp_ctwa' && (
  <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-700 px-1">
    Via Anúncio
  </Badge>
)}
```

---

### 3. Frontend: `src/components/conversations/ContactDetailsPanel.tsx`

Exibir informações do anúncio no painel de detalhes do contato:

```typescript
{conversation.origin === 'whatsapp_ctwa' && conversation.origin_metadata && (
  <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200">
    <div className="flex items-center gap-2 mb-2">
      <Megaphone className="h-4 w-4 text-blue-600" />
      <span className="text-sm font-medium text-blue-700">Via Anúncio do Facebook</span>
    </div>
    {conversation.origin_metadata.ad_title && (
      <p className="text-sm text-blue-600">{conversation.origin_metadata.ad_title}</p>
    )}
    {conversation.origin_metadata.ad_thumbnail && (
      <img 
        src={conversation.origin_metadata.ad_thumbnail} 
        alt="Preview do anúncio" 
        className="mt-2 rounded max-h-24 object-cover"
      />
    )}
  </div>
)}
```

---

### 4. Frontend: `src/components/conversations/MessageBubble.tsx` (Opcional)

Para a **primeira mensagem** de uma conversa vinda de anúncio, exibir um banner contextual acima da mensagem:

```typescript
// Prop adicional (opcional)
adContext?: {
  title: string;
  thumbnailUrl?: string;
} | null;

// Renderização
{adContext && (
  <div className="mb-2 p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800 flex items-center gap-2">
    {adContext.thumbnailUrl && (
      <img src={adContext.thumbnailUrl} alt="" className="w-10 h-10 rounded object-cover" />
    )}
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
        <Megaphone className="h-3 w-3" />
        <span>Via Anúncio do Facebook</span>
      </div>
      {adContext.title && (
        <p className="text-xs text-blue-700 dark:text-blue-300 truncate">{adContext.title}</p>
      )}
    </div>
  </div>
)}
```

---

## Fluxo Após Implementação

```text
Cliente clica em anúncio CTWA
         │
         v
┌─────────────────────────────┐
│ Evolution Webhook           │
│ Detecta externalAdReply     │
│ Salva origin=whatsapp_ctwa  │
│ Salva metadados do anúncio  │
└─────────────────────────────┘
         │
         v
┌─────────────────────────────┐
│ Lista de Conversas          │
│ Badge "Via Anúncio" ✓       │
└─────────────────────────────┘
         │
         v
┌─────────────────────────────┐
│ Painel de Detalhes          │
│ Seção com info do anúncio   │
│ (título, thumbnail, etc.)   │
└─────────────────────────────┘
```

---

## Detalhes de Segurança

| Aspecto | Análise |
|---------|---------|
| **RLS** | Sem alteração - campos já existem e estão protegidos |
| **Multi-tenant** | origin_metadata é por conversa, isolado por law_firm_id |
| **Regressão** | Zero risco - lógica puramente aditiva |
| **Performance** | Negligível - apenas parsing de campo existente |

---

## Arquivos Afetados

| Arquivo | Tipo de Alteração | Linhas Estimadas |
|---------|------------------|------------------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar detecção de externalAdReply | ~40 linhas |
| `src/components/conversations/ConversationSidebarCard.tsx` | Badge "Via Anúncio" | ~5 linhas |
| `src/components/conversations/ContactDetailsPanel.tsx` | Seção de info do anúncio | ~20 linhas |
| `src/components/conversations/MessageBubble.tsx` | Banner opcional (primeira msg) | ~15 linhas |

**Total: ~80 linhas de código novo**

---

## Resultado Esperado

1. **Lista de conversas**: Badge discreto "Via Anúncio" em conversas vindas de CTWA
2. **Painel de detalhes**: Seção com título e thumbnail do anúncio original
3. **Chat**: Banner contextual na primeira mensagem (opcional)
4. **Dados persistentes**: Metadados do anúncio salvos para análise futura
