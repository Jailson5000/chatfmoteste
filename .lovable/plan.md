

# Plano: Adicionar Aviso de Suporte Limitado para PDF

## Situação Atual (Já Implementado)

O sistema já está quase pronto:

| Componente | Status | O que faz |
|------------|--------|-----------|
| Input de arquivo | OK | Aceita PDF (linha 387) |
| Extração de PDF | OK | Retorna erro claro (linha 244) |
| Toast de feedback | OK | Exibe "Documento salvo com limitações" |

## Única Alteração Necessária

### Arquivo: `src/lib/documentExtractor.ts`

**Linha 261 - Atualizar a função `getSupportedFormatsDescription`:**

```typescript
// ANTES:
export function getSupportedFormatsDescription(): string {
  return 'Excel (.xlsx, .xls), Word (.docx), CSV, TXT, MD, JSON';
}

// DEPOIS:
export function getSupportedFormatsDescription(): string {
  return 'Excel (.xlsx, .xls), Word (.docx), CSV, TXT, MD, JSON | PDF (somente armazenamento)';
}
```

## Resultado

O texto na área de upload ficará:
```
Excel (.xlsx, .xls), Word (.docx), CSV, TXT, MD, JSON | PDF (somente armazenamento)
```

## Fluxo do Usuário ao Fazer Upload de PDF

1. Usuário seleciona um arquivo PDF
2. Sistema faz upload para o storage (arquivo é salvo)
3. Toast aparece: "Documento salvo com limitações"
4. Descrição: "PDFs ainda não suportam extração automática de texto. O arquivo será salvo, mas a IA não conseguirá ler seu conteúdo."

## Risco de Quebra

**Zero** - Apenas alteração de texto em uma função de descrição.

## Resumo

| Arquivo | Alteração |
|---------|-----------|
| `src/lib/documentExtractor.ts` | Atualizar texto da linha 261 |

