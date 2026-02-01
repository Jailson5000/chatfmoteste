
# Plano: Correção Bug de Data nas Tarefas + Análise Impacto Anúncios

---

## Parte 1: Correção do Bug de Data nas Tarefas (IMPLEMENTAR)

### Problema

Quando o usuário altera a data de vencimento de uma tarefa, ela sempre volta para o dia 01 ou um dia anterior ao esperado.

### Causa Raiz

O bug acontece devido à interpretação de fuso horário no JavaScript:

```typescript
// Linha 329 - TaskDetailSheet.tsx
selected={task.due_date ? new Date(task.due_date) : undefined}

// O problema:
new Date("2026-02-03")  // Resultado: 2026-02-03T00:00:00.000Z (UTC)
                        // No Brasil (UTC-3): 2026-02-02T21:00:00 ← DIA ERRADO!
```

A mesma lógica aparece na linha 320 (exibição da data) e linha 329 (seleção do calendário).

### Solução

Criar função helper para parsear datas "YYYY-MM-DD" como horário local (meia-noite local, não UTC):

```typescript
// Helper para evitar bug de fuso horário
const parseDateLocal = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day); // month é 0-indexed
};
```

### Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `src/components/tasks/TaskDetailSheet.tsx` | Usar `parseDateLocal` nas linhas 320 e 329 |

### Detalhes das Alterações

**Linha 320 (exibição da data)**
```typescript
// ANTES:
{format(new Date(task.due_date), "dd/MM/yyyy", { locale: ptBR })}

// DEPOIS:
{format(parseDateLocal(task.due_date), "dd/MM/yyyy", { locale: ptBR })}
```

**Linha 329 (seleção no calendário)**
```typescript
// ANTES:
selected={task.due_date ? new Date(task.due_date) : undefined}

// DEPOIS:
selected={task.due_date ? parseDateLocal(task.due_date) : undefined}
```

### Segurança

- Sem alteração em banco de dados
- Sem alteração em RLS
- Não afeta outras partes do sistema
- Correção isolada no componente de tarefas

---

## Parte 2: Análise de Impacto - Anúncios do Facebook no Chat

### O que é

Mensagens que vêm de anúncios "Click-to-WhatsApp" do Facebook/Instagram incluem metadados especiais com a mídia e informações do anúncio (como na sua imagem: "Anúncio do Facebook - Mostrar detalhes").

### Impacto: BAIXO

| Aspecto | Impacto |
|---------|---------|
| **Banco de Dados** | Zero alterações - campos `origin` e `origin_metadata` já existem |
| **Webhook** | ~50 linhas adicionais para extrair `externalAdReply` |
| **Frontend** | ~30 linhas para exibir badge "Via Anúncio" no chat |
| **Risco** | Mínimo - lógica puramente aditiva |
| **Performance** | Negligível - apenas parsing de campos existentes |
| **Tempo Estimado** | ~30-45 minutos |

### Estrutura Técnica (para referência futura)

Anúncios CTWA enviam dados no campo `contextInfo.externalAdReply`:

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

A implementação requer:

1. **Webhook**: Detectar `externalAdReply` e salvar em `origin_metadata`
2. **Conversation**: Atualizar `origin` para `whatsapp_ctwa` quando vem de anúncio
3. **MessageBubble**: Exibir badge visual "Via Anúncio do Facebook" com preview da mídia

Se você quiser prosseguir com esta funcionalidade futuramente, posso implementar.

---

## Resultado Esperado

Após a correção:

1. **Tarefas**: Datas são exibidas e selecionadas corretamente, independente do fuso horário do usuário
2. **Anúncios**: Análise de impacto concluída - implementação disponível quando desejar

