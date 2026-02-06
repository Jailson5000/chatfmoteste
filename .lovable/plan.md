

# Plano: Extração de Texto de Documentos para Base de Conhecimento

## Análise da Situação Atual

### O que funciona hoje:
- **Textos manuais**: Funcionam 100% - salvos no campo `content` da tabela `knowledge_items`
- **Upload de arquivos**: Funcionam parcialmente - arquivo é salvo no storage, mas `content` fica NULL

### O problema:
- A IA só lê o campo `content`
- PDFs, Word, Excel têm apenas `file_url` preenchido
- Por isso a IA "não vê" o conteúdo desses documentos

---

## Tipos de Arquivo e Viabilidade

| Formato | Suporte | Biblioteca | Complexidade | Chance de Sucesso |
|---------|---------|------------|--------------|-------------------|
| **.xlsx / .xls** | Excelente | `xlsx` (já instalado!) | Baixa | **95%** |
| **.docx** | Bom | `mammoth` ou parsing XML | Média | **85%** |
| **.txt / .csv** | Excelente | Nativo JavaScript | Baixa | **99%** |
| **.pdf** | Difícil | Requer bibliotecas externas | Alta | **50-60%** |

### Por que PDF é mais difícil?
- Bibliotecas de PDF geralmente precisam de binários externos (`mutool`, `pdfimages`)
- Edge Functions do Supabase têm ambiente limitado
- PDFs podem ter texto como imagem (necessitaria OCR)
- Alternativa: usar API externa (custo adicional)

---

## Solução Proposta (Segura e Incremental)

### Fase 1: Extração de Excel e CSV (Alta chance de sucesso)

**Biblioteca**: `xlsx` (SheetJS) - já instalada no projeto!

```typescript
// No frontend, ao fazer upload de .xlsx/.xls/.csv
import * as XLSX from 'xlsx';

const extractExcelContent = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  
  let fullText = '';
  workbook.SheetNames.forEach(sheetName => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    fullText += `=== ${sheetName} ===\n${csv}\n\n`;
  });
  
  return fullText;
};
```

**Alteração**: `AgentKnowledgeSection.tsx` - extrair texto ANTES do upload

### Fase 2: Extração de DOCX (Boa chance)

**Opção A**: Parsing direto de XML (DOCX é um ZIP com XMLs)
- Zero dependências adicionais
- Funciona no browser
- Extrai texto principal

**Opção B**: Biblioteca `mammoth` 
- Mais completa (formatação, listas)
- Precisa adicionar dependência

### Fase 3: Extração de TXT/CSV

Nativo - apenas `file.text()`:
```typescript
const content = await file.text();
```

### Fase 4: PDF (Implementação futura)

Opções:
1. **API externa** (DocumentCloud, Google Document AI) - custo
2. **pdf.js** no browser - funciona mas limitado
3. **Edge Function com Kreuzberg/WASM** - experimental

---

## Arquitetura da Solução

```text
┌─────────────────────────────────────────────────────────────┐
│                    UPLOAD DE DOCUMENTO                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              FRONTEND (AgentKnowledgeSection.tsx)            │
│                                                              │
│  1. Detectar tipo de arquivo                                 │
│  2. Se .xlsx/.xls/.csv → extrair com xlsx                   │
│  3. Se .docx → extrair com parsing XML                       │
│  4. Se .txt → ler diretamente                                │
│  5. Se .pdf → informar limitação (por enquanto)             │
│                                                              │
│  6. Salvar arquivo no storage                                │
│  7. Salvar content extraído no banco                         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   BANCO DE DADOS                             │
│                                                              │
│  knowledge_items:                                            │
│    - file_url: URL do arquivo original                       │
│    - file_name: Nome do arquivo                              │
│    - content: TEXTO EXTRAÍDO (agora preenchido!)            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   IA (ai-chat/index.ts)                      │
│                                                              │
│  Já funciona! Lê o campo content normalmente                │
└─────────────────────────────────────────────────────────────┘
```

---

## Alterações Necessárias

### 1. Criar utilitário de extração
**Arquivo**: `src/lib/documentExtractor.ts`

```typescript
import * as XLSX from 'xlsx';

export async function extractDocumentContent(file: File): Promise<{
  content: string | null;
  error?: string;
  supported: boolean;
}> {
  const ext = file.name.toLowerCase().split('.').pop();
  
  switch (ext) {
    case 'xlsx':
    case 'xls':
    case 'csv':
      return extractExcelContent(file);
    case 'docx':
      return extractDocxContent(file);
    case 'txt':
      return extractTextContent(file);
    case 'pdf':
      return { content: null, supported: false, 
        error: 'PDFs ainda não suportam extração automática de texto' };
    default:
      return { content: null, supported: false };
  }
}
```

### 2. Modificar upload
**Arquivo**: `src/components/ai-agents/AgentKnowledgeSection.tsx`

- Antes do upload para o storage, chamar `extractDocumentContent(file)`
- Salvar o texto extraído no campo `content`
- Manter `file_url` como backup/referência

### 3. Ajustar hook
**Arquivo**: `src/hooks/useKnowledgeItems.tsx`

- `createItem` já aceita `content`, sem alteração necessária

---

## Riscos e Mitigações

| Risco | Probabilidade | Mitigação |
|-------|---------------|-----------|
| Arquivo Excel muito grande | Média | Limitar a 5MB e/ou primeiras 100 linhas |
| DOCX com formatação complexa | Baixa | Extrair apenas texto, ignorar imagens |
| Encoding de caracteres | Baixa | Usar UTF-8, tratar exceções |
| Performance no browser | Baixa | Mostrar loading, processar async |

---

## Resultado Esperado

| Antes | Depois |
|-------|--------|
| Upload de Excel → IA não lê | Upload de Excel → IA lê todo conteúdo |
| Upload de Word → IA não lê | Upload de Word → IA lê texto |
| Upload de CSV → IA não lê | Upload de CSV → IA lê dados |
| Upload de PDF → IA não lê | Upload de PDF → Aviso ao usuário |

---

## Chance de Sucesso Global

**Excel/CSV**: 95% - Biblioteca já instalada e testada
**Word (.docx)**: 85% - Parsing XML é padrão
**TXT**: 99% - Nativo
**PDF**: Não implementado nesta fase

**Risco de quebrar o sistema**: Muito baixo
- Mudanças isoladas no componente de upload
- Fallback: se extração falhar, mantém comportamento atual (content = null)
- Não altera lógica existente da IA

---

## Ordem de Implementação

1. Criar `src/lib/documentExtractor.ts` com funções de extração
2. Modificar `handleFileUpload` em `AgentKnowledgeSection.tsx`
3. Adicionar feedback visual (loading, sucesso, tipo não suportado)
4. Testar com diferentes arquivos

