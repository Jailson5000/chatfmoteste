
# Correção do Upload de Mídia em Templates

## Problema Identificado

O erro "new row violates row-level security policy" ocorre porque o código de upload de mídia para templates está enviando os arquivos para a **raiz** do bucket `template-media`, mas a política RLS exige que os arquivos sejam enviados para uma **pasta com o `law_firm_id`** do usuário.

### Código Atual (com problema)
```typescript
// Linha 174 em Settings.tsx
const filePath = `${fileName}`;  // ❌ Envia para raiz do bucket
```

### Política RLS do bucket
```sql
-- Policy: "Users can upload template media to tenant folder"
with_check: (
  (bucket_id = 'template-media'::text) 
  AND ((storage.foldername(name))[1] = (get_user_law_firm_id(auth.uid()))::text)
)
-- Exige que o primeiro "folder" do caminho seja o law_firm_id do usuário
```

## Solução

Alterar o caminho do upload para incluir o `law_firm_id` como primeira pasta, seguindo o padrão de isolamento multi-tenant já implementado em outros buckets (chat-media, logos).

### Código Corrigido
```typescript
// Usar: {law_firm_id}/{fileName}
const filePath = `${lawFirm.id}/${fileName}`;
```

## Arquivo Afetado

| Arquivo | Linha | Alteração |
|---------|-------|-----------|
| `src/pages/Settings.tsx` | 173-174 | Incluir `lawFirm.id` no caminho do arquivo |

## Mudança Específica

```typescript
// ANTES (linha 173-174):
const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
const filePath = `${fileName}`;

// DEPOIS:
const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
const filePath = `${lawFirm?.id}/${fileName}`;
```

Também adicionar validação para garantir que o `lawFirm` existe antes de tentar o upload:

```typescript
const handleTemplateMediaUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  
  // Validar que lawFirm existe
  if (!lawFirm?.id) {
    toast({
      title: "Erro",
      description: "Não foi possível identificar a empresa. Recarregue a página.",
      variant: "destructive",
    });
    return;
  }

  setUploadingMedia(true);
  try {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
    const filePath = `${lawFirm.id}/${fileName}`;  // ✅ Inclui law_firm_id

    const { data, error } = await supabase.storage
      .from('template-media')
      .upload(filePath, file);
    // ... resto continua igual
```

## Resultado Esperado

- Upload de imagens: ✅ Funciona
- Upload de vídeos: ✅ Funciona  
- Upload de áudios: ✅ Funciona
- Templates de texto: ✅ Continua funcionando (não usa upload)

## Testes de Validação

1. Criar template de imagem com upload de arquivo
2. Criar template de vídeo com upload de arquivo
3. Criar template de áudio com upload de arquivo
4. Confirmar que a URL pública gerada está correta
5. Confirmar que o template é salvo e pode ser usado no chat

## Risco

**Muito baixo** - A alteração é mínima (apenas adicionar o prefixo de pasta no caminho do upload). Não afeta:
- Lógica de criação de templates
- Templates existentes (já salvos)
- Outras funcionalidades do Settings
- Outros uploads (chat-media, logos)
