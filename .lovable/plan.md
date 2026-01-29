

# Plano: Ocultar "[Imagem]" quando não há legenda

## Problema Identificado

Quando uma imagem é enviada sem legenda:
- No WhatsApp: Aparece corretamente apenas a imagem (sem texto)
- No sistema de atendimento: Aparece a imagem **E** o texto "[Imagem]" abaixo

O texto "[Imagem]" é um placeholder gerado automaticamente quando o usuário não digita uma legenda.

## Fluxo Atual

```text
┌──────────────────────────────────────────────────────────────────┐
│ 1. Frontend (Conversations.tsx / KanbanChatPanel.tsx)            │
│    - Cria mensagem otimista com content: "[Imagem]"              │
│                                                                  │
│ 2. Backend (evolution-api/index.ts)                              │
│    - Salva no banco: content: caption || "[Imagem]"              │
│    - Se caption vazio → "[Imagem]" vai pro banco                 │
│                                                                  │
│ 3. MessageBubble.tsx                                             │
│    - Renderiza media + displayContent                            │
│    - displayContent NÃO filtra "[Imagem]" → texto aparece        │
└──────────────────────────────────────────────────────────────────┘
```

## Solução

Existem duas abordagens possíveis:

| Abordagem | Descrição | Prós | Contras |
|-----------|-----------|------|---------|
| **A) Filtrar no MessageBubble** | Adicionar regex para ocultar "[Imagem]", "[Vídeo]", etc. quando há mídia | Mínima mudança, não afeta banco | Dados "sujos" persistem no BD |
| **B) Não salvar placeholder** | Backend/Frontend salvam `null`/vazio quando não há legenda | Dados limpos no BD | Mais arquivos para modificar |

**Recomendação: Abordagem A (filtrar na exibição)**

Esta é a mais segura porque:
- Não altera o fluxo de dados existente
- Não requer mudanças no banco ou backend
- Retrocompatível com mensagens já enviadas
- Pode ser facilmente revertida se necessário

---

## Implementação

### Arquivo: `src/components/conversations/MessageBubble.tsx`

**Mudança**: Na função `displayContent` (linhas 1694-1743), adicionar filtro para remover placeholders de mídia quando o messageType indica que é uma mídia.

A lógica será:

```typescript
// Dentro de displayContent (após os filtros existentes)

// Para mensagens de imagem/vídeo: ocultar placeholders "[Imagem]", "[Vídeo]", etc.
if (messageType === "image" || messageType === "video") {
  const mediaPlaceholders = /^\[(imagem|vídeo|video|imagen)\]$/i;
  if (mediaPlaceholders.test(normalized)) return "";
}
```

Isso significa que:
- Se `messageType === "image"` e `content === "[Imagem]"` → retorna vazio (não exibe texto)
- Se `messageType === "image"` e `content === "Foto do contrato"` → exibe "Foto do contrato" normalmente

---

## Arquivos a Modificar

| Arquivo | Mudança | Impacto |
|---------|---------|---------|
| `src/components/conversations/MessageBubble.tsx` | Adicionar filtro para placeholders de mídia no `displayContent` | Baixo |

---

## Checklist de Validação

- [ ] Enviar imagem SEM legenda → imagem aparece SEM texto "[Imagem]" abaixo
- [ ] Enviar imagem COM legenda → imagem aparece COM a legenda embaixo
- [ ] Enviar vídeo SEM legenda → vídeo aparece SEM texto "[Vídeo]" abaixo
- [ ] Enviar vídeo COM legenda → vídeo aparece COM a legenda embaixo
- [ ] Documentos continuam mostrando nome do arquivo normalmente
- [ ] Mensagens antigas de imagem com "[Imagem]" também ficam limpas

---

## Notas Técnicas

O `displayContent` já possui filtros semelhantes para:
- Nomes de arquivos de áudio (`audio_173....webm`)
- Nomes de arquivos de documento (`.pdf`, `.doc`, etc.)
- Placeholders de áudio do WhatsApp (`[mensagem de áudio]`)

A nova lógica segue o mesmo padrão estabelecido, apenas estendendo para imagens e vídeos.

