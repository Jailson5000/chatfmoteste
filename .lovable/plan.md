
# Correção: Erro PGRST200 no fetchSingleConversation

## Causa Raiz

O log mostra um **novo erro** diferente do anterior:

```
PGRST200: Could not find a relationship between 'conversations' and 'profiles'
```

A FK `conversations_assigned_to_fkey` aponta para `auth.users(id)`, **NÃO** para `public.profiles`. O PostgREST não consegue fazer o join implícito `profiles!conversations_assigned_to_fkey` porque a FK não referencia essa tabela.

O RPC `get_conversations_with_metadata` funciona porque usa SQL direto (`LEFT JOIN profiles p ON p.id = c.assigned_to`), sem depender de FK.

## Correção

### Arquivo: `src/hooks/useConversations.tsx` (~linha 1210-1242)

1. **Remover** o join `assigned_profile:profiles!conversations_assigned_to_fkey(full_name)` da query `.select()`
2. **Após** obter o resultado, buscar o profile separadamente se `assigned_to` existir:

```text
// Pseudo-código:
const directData = await supabase.from('conversations').select(`
  *,
  last_message:messages(...),
  whatsapp_instance:whatsapp_instances!conversations_whatsapp_instance_id_fkey(...),
  current_automation:automations!conversations_current_automation_id_fkey(...),
  client:clients(...),
  department:departments(...)
`).eq('id', conversationId)...

// Buscar profile separado se assigned_to existe
let assignedProfile = null;
if (directData.assigned_to) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', directData.assigned_to)
    .maybeSingle();
  assignedProfile = profile;
}

// Montar resultado com assigned_profile
return { ...directData, assigned_profile: assignedProfile };
```

## Risco

**Zero**. Removemos um join que nunca funcionou (FK aponta para auth.users, não profiles) e substituímos por uma busca direta que funciona. O fluxo principal via RPC não é afetado.
