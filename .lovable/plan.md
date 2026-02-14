

# Corrigir Captura de Nomes de Contatos (Instagram e Facebook)

## Problema

Na linha 388 do `meta-webhook/index.ts`, o campo `username` esta sendo solicitado para Instagram-Scoped User IDs (IGSID), mas esse campo nao e valido para IGSIDs. A Graph API retorna erro, fazendo o nome permanecer generico ("INSTAGRAM 5644").

## Alteracao

### Backend: `supabase/functions/meta-webhook/index.ts`

**Linha 387-389** - Remover `username` dos campos do Instagram:
```typescript
// DE:
const fields = connectionType === "instagram" 
  ? "name,username,profile_pic" 
  : "name,profile_pic";

// PARA:
const fields = "name,profile_pic";
```

**Linha 395** - Remover referencia a `username` no fallback de nome:
```typescript
// DE:
resolvedName = profile.name || profile.username || null;

// PARA:
resolvedName = profile.name || null;
```

**Adicionar fallback**: Se a primeira chamada falhar (ex: `profile_pic` nao suportado), tentar novamente pedindo apenas `name`.

### Deploy
- Redeployer `meta-webhook`

### Sobre a configuracao no painel da Meta
Os campos de webhook da aba "User" (nas screenshots) devem permanecer **OFF**. Os campos necessarios sao:
- **Messenger (Page)** > `messages`: ON
- **Instagram** > `messages`: ON

Nenhuma outra alteracao de codigo necessaria.
