
# Plano: Melhorias na Base de Conhecimento com Avisos de PDF

## Problemas Identificados

### 1. A página KnowledgeBase.tsx NÃO extrai texto dos documentos
A função `handleFileUpload` (linhas 198-243) apenas faz upload do arquivo para o storage, mas **não chama** a função `extractDocumentContent()`. Isso significa que:
- Arquivos enviados pelo botão "Enviar Documento" na página Base de Conhecimento não têm texto extraído
- A IA não consegue ler nenhum documento enviado por essa página

### 2. PDFs não têm aviso visual claro
Na lista de documentos, PDFs aparecem sem indicação de que a IA não consegue lê-los.

### 3. Botão "Enviar Documento" não mostra formatos suportados
O usuário não sabe quais formatos são aceitos até tentar enviar.

---

## Alterações Necessárias

### Arquivo 1: `src/pages/KnowledgeBase.tsx`

#### Mudança A: Importar função de extração
```typescript
import { extractDocumentContent, getSupportedFormatsDescription } from '@/lib/documentExtractor';
```

#### Mudança B: Atualizar handleFileUpload para extrair texto
Modificar a função para:
1. Chamar `extractDocumentContent(file)` antes do upload
2. Salvar o texto extraído no campo `content`
3. Mostrar toast apropriado baseado no resultado

#### Mudança C: Adicionar tooltip/texto no botão "Enviar Documento"
Mostrar os formatos suportados quando o usuário passar o mouse.

#### Mudança D: Adicionar badge de aviso para PDFs na lista
Na tabela, ao lado da badge "PDF", adicionar um indicador visual de que a IA não lê esse formato.

---

## Detalhes Técnicos

### handleFileUpload Atualizado (linhas 198-243):
```typescript
const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file || !lawFirm?.id) return;

  setIsUploading(true);
  try {
    // 1. Extrair texto do documento
    const extraction = await extractDocumentContent(file);
    
    // 2. Fazer upload para o storage
    const fileExt = file.name.split('.').pop();
    const fileName = `${lawFirm.id}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage
      .from('internal-chat-files')
      .upload(fileName, file);

    if (uploadError) throw uploadError;

    const { data: { publicUrl } } = supabase.storage
      .from('internal-chat-files')
      .getPublicUrl(fileName);

    // 3. Salvar com conteúdo extraído
    await createItem.mutateAsync({
      title: file.name,
      content: extraction.content, // Agora salva o texto!
      category: 'other',
      item_type: 'document',
      file_url: publicUrl,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
    });

    // 4. Feedback apropriado
    if (extraction.content) {
      toast({
        title: 'Documento processado',
        description: 'Texto extraído com sucesso. A IA poderá ler o conteúdo.',
      });
    } else if (extraction.error) {
      toast({
        title: 'Documento salvo com limitações',
        description: extraction.error,
        variant: 'default',
      });
    }
  } catch (error) {
    // ... tratamento de erro existente
  } finally {
    setIsUploading(false);
    e.target.value = '';
  }
};
```

### Badge de Aviso para PDFs (na tabela):
Na linha 465-468, adicionar lógica para mostrar aviso quando for PDF:
```tsx
{item.item_type === 'document' && item.file_type && (
  <div className="flex items-center gap-1">
    <Badge variant="outline" className="text-xs uppercase">
      {item.file_type.split('/').pop() || 'doc'}
    </Badge>
    {item.file_type === 'application/pdf' && !item.content && (
      <Tooltip>
        <TooltipTrigger>
          <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">A IA não consegue ler PDFs</p>
        </TooltipContent>
      </Tooltip>
    )}
  </div>
)}
```

### Texto de Formatos Suportados no Header:
Adicionar abaixo do subtítulo:
```tsx
<p className="text-xs text-muted-foreground mt-1">
  Formatos suportados: {getSupportedFormatsDescription()}
</p>
```

---

## Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `src/pages/KnowledgeBase.tsx` | Importar `extractDocumentContent` e `getSupportedFormatsDescription` |
| `src/pages/KnowledgeBase.tsx` | Modificar `handleFileUpload` para extrair texto |
| `src/pages/KnowledgeBase.tsx` | Adicionar badge de aviso para PDFs sem conteúdo |
| `src/pages/KnowledgeBase.tsx` | Mostrar formatos suportados na descrição |
| `src/pages/KnowledgeBase.tsx` | Importar `Tooltip`, `TooltipTrigger`, `TooltipContent`, `AlertCircle` |

---

## Resultado Esperado

| Cenário | Antes | Depois |
|---------|-------|--------|
| Upload de Excel | Salvo sem texto | Texto extraído, IA lê |
| Upload de Word | Salvo sem texto | Texto extraído, IA lê |
| Upload de PDF | Salvo sem texto | Salvo + Aviso visual na lista |
| Formatos suportados | Não visível | Exibido na página |

---

## Risco de Quebra

**Muito Baixo**
- Mudanças localizadas no componente de upload
- Fallback: se extração falhar, continua salvando com content = null
- Não altera lógica de leitura existente
