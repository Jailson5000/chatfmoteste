
# Plano de Correção: Status de Mídia no Kanban + Gravação de Áudio

## Diagnóstico Detalhado

### Problema 1: Imagem fica girando ("enviando") mesmo após ser entregue no WhatsApp

**Causa raiz identificada:**
O fluxo atual cria uma mensagem otimista com `status: "sending"` que deveria ser atualizada via Realtime quando o backend muda para `status: "sent"`. Após análise, o UPDATE está funcionando corretamente no hook `useMessagesWithPagination.tsx` (linhas 673-743).

O problema está no **Kanban**: ele não usa o hook `useMessagesWithPagination` da mesma forma consistente. Ao analisar as linhas 1107-1136 do `KanbanChatPanel.tsx`, o hook está sendo usado, MAS a mensagem otimista é adicionada via `setMessages(prev => [...prev, optimisticMessage])` diretamente no componente (linhas 1907-1920 para áudio, 2054-2068 para arquivo).

**O problema específico:**
1. Frontend adiciona mensagem otimista com `id: clientMessageId`
2. Backend insere a mesma mensagem no banco com `id: tempMessageId = clientMessageId`
3. Realtime envia INSERT → handler de INSERT procura por mensagem com esse ID
4. Handler de INSERT encontra a mensagem (mesmo ID) e faz MERGE (linhas 438-459)
5. **Porém:** O merge preserva o `status` local se o backend enviar `status: null` ou não enviar

Analisando linha 457: `created_at: existingMsg.created_at` - o merge mantém o created_at local, mas não há lógica explícita para manter o status local quando o INSERT chega.

**Problema real:** O INSERT do Realtime chega com `status: "sending"` (igual ao otimista), então o merge não causa problema. O UPDATE com `status: "sent"` deveria atualizar. 

Vou verificar se o UPDATE está sendo recebido - o handler de UPDATE (linha 698-743) procura:
```javascript
const targetIndex = prev.findIndex(m => 
  m.id === updatedMsg.id || 
  (wasReconciled && m.whatsapp_message_id === oldMsg.whatsapp_message_id)
);
```

Se a mensagem tem o mesmo ID, deveria funcionar. **Suspeita:** O Realtime UPDATE pode não estar chegando ou está falhando silenciosamente.

**Solução proposta:** Adicionar logs detalhados temporariamente e garantir que o UPDATE seja processado. Também verificar se o hook está subscrito corretamente para a conversa atual.

---

### Problema 2: Gravação de áudio no Kanban requer dois cliques

**Causa raiz identificada:**

**Em Conversations (comportamento correto):**
- O `AudioRecorder` está embutido inline na barra de input (linha 4420)
- O componente aparece diretamente com o botão de microfone visível
- Usuário clica no botão → `handleStartRecording()` é chamado

**Em Kanban (comportamento problemático):**
- Linha 3268-3274: Botão de microfone → `setIsRecordingAudio(true)`
- Linha 3192-3197: Se `isRecordingAudio=true`, renderiza `AudioRecorder`
- O `AudioRecorder` renderiza no estado padrão (mostra botão de gravar - linha 172-183)
- Usuário precisa clicar novamente para iniciar a gravação

**Solução proposta:** Modificar o `AudioRecorder` para aceitar uma prop `autoStart` que chama `startRecording()` automaticamente ao montar. No Kanban, passar `autoStart={true}`.

---

## Implementação

### Correção 1: Garantir que UPDATE do Realtime atualize o status

**Arquivo:** `src/hooks/useMessagesWithPagination.tsx`

Adicionar log de debug no handler de UPDATE para verificar se está sendo chamado:
- Já existe lógica correta, mas vamos garantir que o `status` seja sempre atualizado

**Verificação:** O código na linha 730 já faz `status: updatedMsg.status ?? prevMsg.status ?? "sent"`. Isso deveria funcionar.

**Problema alternativo:** A mensagem pode não estar no state quando o UPDATE chega. Isso aconteceria se o INSERT via Realtime **não** fez o merge corretamente.

**Análise adicional necessária:** Verificar linhas 438-459 do handler de INSERT. O merge acontece, mas o objeto `rawMsg` do INSERT tem os campos corretos?

**Correção real:** O handler de INSERT está fazendo merge quando `existingIndex !== -1`. Mas está preservando campos do otimista:
```javascript
media_url: shouldKeepBlobUrl ? existingMsg.media_url : (rawMsg.media_url ?? existingMsg.media_url)
```

O `status` NÃO está sendo explicitamente preservado no merge - ele vem do `...rawMsg` (linha 445-446). O INSERT tem `status: "sending"`, igual ao otimista.

**Então o problema deve estar no UPDATE.** Vou verificar se o UPDATE encontra a mensagem.

**Possível causa:** A mensagem otimista no Kanban pode ter campos diferentes (como `_clientOrder`) que não estão sendo setados corretamente, ou o `id` está divergindo.

**Correção definitiva:** No Kanban, garantir que a mensagem otimista tenha exatamente os mesmos campos esperados pelo hook, especialmente o `id`.

---

### Correção 2: Auto-iniciar gravação no Kanban

**Arquivo:** `src/components/conversations/AudioRecorder.tsx`

Adicionar prop `autoStart` que chama `startRecording()` via `useEffect`:

```typescript
interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
  disabled?: boolean;
  autoStart?: boolean; // NEW: auto-start recording on mount
}

// Dentro do componente:
useEffect(() => {
  if (autoStart && !isRecording && !audioBlob) {
    handleStartRecording();
  }
}, [autoStart]);
```

**Arquivo:** `src/components/kanban/KanbanChatPanel.tsx`

Passar `autoStart={true}` para o AudioRecorder:

```typescript
<AudioRecorder
  onSend={handleSendAudio}
  onCancel={() => setIsRecordingAudio(false)}
  disabled={isSending}
  autoStart={true} // NEW
/>
```

---

## Arquivos a Modificar

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| `src/components/conversations/AudioRecorder.tsx` | Adicionar prop `autoStart` + `useEffect` para iniciar automaticamente | Médio |
| `src/components/kanban/KanbanChatPanel.tsx` | Passar `autoStart={true}` para AudioRecorder | Baixo |
| `src/hooks/useMessagesWithPagination.tsx` | (Debug) Adicionar logs temporários no handler UPDATE para diagnosticar | Baixo |

---

## Checklist de Validação

### Problema 1 (Status "enviando")
- [ ] Enviar imagem no Kanban → status deve mudar de "sending" para "sent" sem F5
- [ ] Enviar áudio no Kanban → mesmo comportamento
- [ ] Enviar documento no Kanban → mesmo comportamento
- [ ] Verificar no console se logs de UPDATE estão aparecendo

### Problema 2 (Dois cliques para áudio)
- [ ] Clicar no microfone no Kanban → gravação deve iniciar automaticamente
- [ ] Verificar que em Conversations o comportamento permanece igual (inline, sem auto-start)
- [ ] Testar cancelar gravação → deve funcionar normalmente

---

## Seção Técnica

### AudioRecorder com autoStart

```typescript
import { useState, useEffect } from "react";
// ... imports existentes

interface AudioRecorderProps {
  onSend: (audioBlob: Blob) => void;
  onCancel: () => void;
  disabled?: boolean;
  autoStart?: boolean;
}

export function AudioRecorder({ onSend, onCancel, disabled, autoStart = false }: AudioRecorderProps) {
  const {
    isRecording,
    recordingTime,
    audioBlob,
    audioUrl,
    startRecording,
    stopRecording,
    cancelRecording,
    clearRecording,
  } = useAudioRecorder();
  
  // ... resto do código existente

  // Auto-start recording if prop is set
  useEffect(() => {
    if (autoStart && !isRecording && !audioBlob && !audioUrl) {
      startRecording().catch(error => {
        console.error("Erro ao iniciar gravação automática:", error);
        onCancel(); // Se falhar, cancela para não deixar UI travada
      });
    }
  }, [autoStart]); // Executar apenas uma vez no mount

  // ... resto do código existente
}
```

### Debug de UPDATE no Realtime

```typescript
// useMessagesWithPagination.tsx - dentro do handler de UPDATE
async (payload) => {
  const updatedMsg = payload.new as PaginatedMessage;
  const oldMsg = payload.old as Partial<PaginatedMessage>;
  
  // DEBUG LOG
  console.log("[useMessagesWithPagination] UPDATE received:", {
    id: updatedMsg.id,
    status: updatedMsg.status,
    whatsapp_message_id: updatedMsg.whatsapp_message_id,
  });
  
  // ... resto do código
  
  setMessages(prev => {
    const targetIndex = prev.findIndex(m => 
      m.id === updatedMsg.id || 
      (wasReconciled && m.whatsapp_message_id === oldMsg.whatsapp_message_id)
    );
    
    // DEBUG LOG
    console.log("[useMessagesWithPagination] UPDATE targetIndex:", targetIndex, "for id:", updatedMsg.id);
    
    if (targetIndex === -1) {
      console.warn("[useMessagesWithPagination] UPDATE: message not found in state!");
      return prev;
    }
    
    // ... resto do código
  });
}
```

---

## Notas Importantes

1. **Sem Regressões:** As mudanças são isoladas e não afetam outros fluxos
2. **Auto-start opcional:** A prop `autoStart` tem default `false`, então Conversations continua igual
3. **Logs de debug:** Serão removidos após confirmar funcionamento
