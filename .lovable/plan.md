

# Plano de Correção: Persistência de Agendamento e Acesso a PDFs

## Problema 1: scheduling_enabled Não Persiste

### Diagnóstico
No arquivo `src/hooks/useAutomations.tsx`, a função `updateAutomation` não está incluindo o campo `scheduling_enabled` no payload de atualização.

**Código atual (linha 161):**
```typescript
if ((updateData as any).notify_on_transfer !== undefined) 
  updatePayload.notify_on_transfer = (updateData as any).notify_on_transfer;
// scheduling_enabled NÃO está sendo salvo!
```

### Solução
Adicionar a linha para incluir `scheduling_enabled` no payload de atualização:

```typescript
if ((updateData as any).scheduling_enabled !== undefined) 
  updatePayload.scheduling_enabled = (updateData as any).scheduling_enabled;
```

**Arquivo:** `src/hooks/useAutomations.tsx`
**Alteração:** Adicionar linha após a linha 161

---

## Problema 2: IA Não Acessa Conteúdo de PDFs

### Diagnóstico
A função `getAgentKnowledge` no arquivo `supabase/functions/ai-chat/index.ts` (linhas 2191-2229) só retorna itens que têm `content` preenchido. Documentos PDF têm apenas `file_url`, então são ignorados.

**Código atual:**
```typescript
.filter((item: any) => item.knowledge_items?.content) // Ignora PDFs
.map((item: any) => {
  const ki = item.knowledge_items;
  return `### ${ki.title}\n${ki.content}`; // Só usa content
});
```

### Solução
Modificar a função para:
1. Incluir itens do tipo document (PDFs) mesmo sem content
2. Adicionar uma referência ao documento para o modelo saber que existe

```typescript
// Alteração na função getAgentKnowledge

const knowledgeTexts = linkedKnowledge
  .map((item: any) => {
    const ki = item.knowledge_items;
    if (!ki) return null;
    
    // Se tem content (texto), usa normalmente
    if (ki.content) {
      return `### ${ki.title}\n${ki.content}`;
    }
    
    // Se é documento, adiciona referência
    if (ki.item_type === 'document' && ki.file_url) {
      return `### ${ki.title} (Documento)\n[Arquivo disponível: ${ki.file_name || ki.title}]`;
    }
    
    return null;
  })
  .filter(Boolean);
```

### Limitação Importante
A IA não consegue "ler" o conteúdo de PDFs automaticamente. Para isso funcionar completamente, seria necessário:

1. **Extração de texto no upload** - Usar uma biblioteca para extrair texto do PDF quando ele é enviado
2. **Armazenar o texto extraído** - Salvar o conteúdo textual no campo `content` da tabela `knowledge_items`

### Solução Completa (Recomendada para Futuro)
Criar um sistema de extração de texto de PDFs no momento do upload:

1. Quando um PDF é enviado em `AgentKnowledgeSection.tsx`
2. Chamar uma Edge Function que usa biblioteca de parsing de PDF
3. Extrair o texto e salvar no campo `content` do item
4. A IA então terá acesso ao conteúdo textual

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/hooks/useAutomations.tsx` | Adicionar `scheduling_enabled` ao updatePayload |
| `supabase/functions/ai-chat/index.ts` | Incluir documentos na resposta do knowledge base |

## Resultado Esperado

1. **scheduling_enabled**: Após salvar, o toggle de "Agendamento habilitado" permanecerá ativo ao recarregar a página
2. **Base de Conhecimento**: A IA receberá referência aos documentos PDF vinculados (nome e indicação que existe), mas para leitura completa do conteúdo seria necessário implementar extração de texto

