

# Correção do Alerta Sonoro + Recepção de Templates WhatsApp

## Problema 1: Alerta Sonoro Não Funciona

### Causa Raiz

Bug de arquitetura no `AppLayout.tsx`. O `useMessageNotifications` é chamado **fora** do `RealtimeSyncProvider`:

```text
AppLayout() {
  useMessageNotifications();   ← FORA do Provider!
  
  return (
    <RealtimeSyncProvider>     ← Provider está AQUI
      ...
    </RealtimeSyncProvider>
  );
}
```

O hook `useMessageNotifications` usa `useRealtimeSyncOptional()` para registrar callbacks de mensagem e conversa. Como ele roda fora do provider, `realtimeSync` é `null`, e os callbacks nunca são registrados. Nenhuma notificação sonora dispara.

### Correção

Mover o `useMessageNotifications` para dentro do `RealtimeSyncProvider` criando um componente wrapper interno:

**Arquivo: `src/components/layout/AppLayout.tsx`**

```tsx
function AppLayoutInner() {
  useMessageNotifications({ enabled: true });
  usePresenceTracking();
  // ... resto do layout
}

export function AppLayout() {
  return (
    <RealtimeSyncProvider>
      <AppLayoutInner />
    </RealtimeSyncProvider>
  );
}
```

Isso garante que o hook rode dentro do contexto Realtime e consiga registrar os callbacks de som.

---

## Problema 2: Templates WhatsApp Não São Recebidos Corretamente

### Causa

O `uazapi-webhook` usa `extractContent()` que só extrai texto básico (`text`, `caption`, `conversation`). Ele não trata os tipos especiais de mensagem do WhatsApp:

| Tipo | Descrição | Status no uazapi-webhook |
|---|---|---|
| `buttonsResponseMessage` | Resposta a botão quick reply | NÃO tratado |
| `listResponseMessage` | Seleção de item de lista | NÃO tratado |
| `templateButtonReplyMessage` | Clique em botão de template | NÃO tratado |
| `interactiveResponseMessage` | Resposta interativa genérica | NÃO tratado |
| `templateMessage` | Template de marketing/utilidade | NÃO tratado |

Todos esses tipos já são tratados no `evolution-webhook` (linhas 5310-5420).

### Correção

**Arquivo: `supabase/functions/uazapi-webhook/index.ts`**

Adicionar tratamento para mensagens interativas/template na função de detecção de tipo e na extração de conteúdo. Especificamente:

1. **Na detecção de tipo (`detectMessageType`)**: Reconhecer tipos como `buttonsresponsemessage`, `listresponsemessage`, `templatebuttonreplymessage`, `interactiveresponsemessage`, `templatemessage` e retornar `"text"` (são tratados como texto com metadados).

2. **Na extração de conteúdo (`extractContent`)**: Adicionar blocos antes do fallback para extrair texto dos payloads estruturados:

```typescript
// buttonsResponseMessage → selectedDisplayText
// listResponseMessage → title ou description
// templateButtonReplyMessage → selectedDisplayText
// interactiveResponseMessage → body.text
// templateMessage → hydratedTemplate.hydratedContentText + botões
```

3. **Para templateMessage com mídia**: Detectar `hydratedTemplate.imageMessage`, `videoMessage`, `documentMessage` e ajustar o `messageType` e `mediaUrl` apropriadamente.

4. **Botões de template**: Extrair botões e formatar como `[Opções: Botão1 | Botão2 | Botão3]` no final do conteúdo (mesmo formato do evolution-webhook).

A lógica será portada diretamente do `evolution-webhook` (linhas 5310-5420) adaptada para o formato de payload do uazapi (onde os dados podem estar em `msg.content` ao invés de `messageData`).

---

## Arquivos Afetados

| Arquivo | Mudança |
|---|---|
| `src/components/layout/AppLayout.tsx` | Mover hooks para dentro do RealtimeSyncProvider |
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar tratamento de templates, botões e mensagens interativas |

