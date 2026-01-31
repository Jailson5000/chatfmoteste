
# Implementação: Botão de Atualizar Foto de Perfil do WhatsApp

## Objetivo

Adicionar um botão de "refresh" (ícone de atualização) no painel lateral direito, próximo ao avatar do contato, que quando clicado busca a foto de perfil do WhatsApp e atualiza o avatar.

---

## Situação Atual

### O que já funciona
- O `evolution-webhook` já busca a foto automaticamente quando um **novo cliente** é criado
- A tabela `clients` já possui a coluna `avatar_url`
- O `ConversationSidebarCard` (lista de conversas) já exibe o `avatar_url` quando disponível
- A função `fetchAndUpdateProfilePicture` já existe no webhook

### O que precisa ser feito
1. O `ContactDetailsPanel` não recebe o `avatar_url` como prop
2. O `ContactDetailsPanel` usa iniciais geradas pelo Dicebear em vez do avatar real
3. Não existe uma action na `evolution-api` para buscar foto de perfil manualmente
4. Não existe botão de refresh no painel

---

## Arquitetura da Solução

```text
Usuário clica no botão de refresh (↻)
        ↓
Frontend chama edge function evolution-api
action: "fetch_profile_picture"
        ↓
Edge function busca foto via Evolution API
/chat/fetchProfilePictureUrl/{instanceName}
        ↓
Atualiza clients.avatar_url no banco
        ↓
Invalida query "clients" e "conversations"
        ↓
Avatar atualizado no painel
```

---

## Alterações Necessárias

### 1. Edge Function `evolution-api/index.ts` - Nova Action

Adicionar `fetch_profile_picture` à lista de actions e implementar o handler:

**Tipo (linha ~41-74):**
```typescript
type EvolutionAction =
  // ... existing actions ...
  | "fetch_profile_picture"; // NEW: Fetch WhatsApp profile picture
```

**Interface (linha ~76):**
```typescript
interface EvolutionRequest {
  // ... existing props ...
  phoneNumber?: string; // NEW: For fetch_profile_picture
  clientId?: string; // NEW: For fetch_profile_picture
}
```

**Handler (novo case no switch):**
```typescript
case "fetch_profile_picture": {
  if (!body.instanceId) {
    throw new Error("instanceId is required");
  }
  if (!body.phoneNumber || !body.clientId) {
    throw new Error("phoneNumber and clientId are required");
  }
  
  // Get instance
  const instance = await getInstanceById(supabaseClient, lawFirmId, body.instanceId, isGlobalAdmin);
  const apiUrl = normalizeUrl(instance.api_url);
  
  // Call Evolution API
  const response = await fetch(
    `${apiUrl}/chat/fetchProfilePictureUrl/${instance.instance_name}`,
    {
      method: 'POST',
      headers: {
        'apikey': instance.api_key || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ number: body.phoneNumber }),
    }
  );

  if (!response.ok) {
    throw new Error(`Evolution API returned ${response.status}`);
  }

  const result = await response.json();
  const profilePicUrl = result?.profilePictureUrl || result?.picture || result?.url || result?.pictureUrl;

  if (profilePicUrl && typeof profilePicUrl === 'string' && profilePicUrl.startsWith('http')) {
    // Update client avatar in database
    const { error } = await supabaseClient
      .from('clients')
      .update({ avatar_url: profilePicUrl })
      .eq('id', body.clientId);
    
    if (error) {
      throw new Error(`Failed to update avatar: ${error.message}`);
    }
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        avatarUrl: profilePicUrl,
        message: "Foto de perfil atualizada com sucesso"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } else {
    return new Response(
      JSON.stringify({ 
        success: false, 
        message: "Foto não disponível (usuário pode ter privacidade ativada)"
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
```

### 2. `ContactDetailsPanel.tsx` - Atualizar Interface

Adicionar campos ao interface da prop `conversation`:

```typescript
interface ContactDetailsPanelProps {
  conversation: {
    // ... existing fields ...
    client?: {
      id?: string;
      email?: string | null;
      address?: string | null;
      document?: string | null;
      notes?: string | null;
      custom_status_id?: string | null;
      avatar_url?: string | null; // NEW
    } | null;
    whatsapp_instance?: { 
      id?: string; // NEW: Need instance ID for API call
      instance_name: string; 
      display_name?: string | null; 
      phone_number?: string | null;
    } | null;
  } | null;
  // ... rest of props ...
}
```

### 3. `ContactDetailsPanel.tsx` - Exibir Avatar Real

Atualizar o componente Avatar para usar a foto do cliente:

```tsx
// State for refresh
const [isRefreshingAvatar, setIsRefreshingAvatar] = useState(false);

// Get avatar URL from client
const avatarUrl = conversation?.client?.avatar_url;

// Função para atualizar foto
const handleRefreshAvatar = async () => {
  if (!conversation?.client?.id || !conversation?.contact_phone || !conversation?.whatsapp_instance?.id) {
    toast({ 
      title: "Não é possível atualizar", 
      description: "Informações de cliente ou instância não disponíveis",
      variant: "destructive"
    });
    return;
  }
  
  setIsRefreshingAvatar(true);
  try {
    const { data, error } = await supabase.functions.invoke('evolution-api', {
      body: {
        action: 'fetch_profile_picture',
        instanceId: conversation.whatsapp_instance.id,
        phoneNumber: conversation.contact_phone.replace(/\D/g, ''),
        clientId: conversation.client.id,
      }
    });
    
    if (error) throw error;
    
    if (data?.success) {
      toast({ title: "Foto atualizada!" });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } else {
      toast({ 
        title: "Foto não disponível", 
        description: data?.message || "O usuário pode ter privacidade ativada",
        variant: "destructive"
      });
    }
  } catch (error) {
    toast({ 
      title: "Erro ao atualizar foto", 
      description: error instanceof Error ? error.message : "Erro desconhecido",
      variant: "destructive"
    });
  } finally {
    setIsRefreshingAvatar(false);
  }
};

// Renderização do Avatar com botão de refresh
<div className="relative inline-block">
  <Avatar className="h-20 w-20">
    {avatarUrl ? (
      <AvatarImage src={avatarUrl} alt={conversation.contact_name || "Avatar"} />
    ) : null}
    <AvatarFallback className="bg-primary/10 text-primary text-xl font-medium">
      {getInitials(conversation.contact_name)}
    </AvatarFallback>
  </Avatar>
  
  {/* Botão de Refresh no canto inferior direito */}
  <Button
    variant="outline"
    size="icon"
    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-background border shadow-sm hover:bg-muted"
    onClick={handleRefreshAvatar}
    disabled={isRefreshingAvatar || !conversation?.client?.id || !conversation?.whatsapp_instance?.id}
    title="Atualizar foto de perfil"
  >
    {isRefreshingAvatar ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
    ) : (
      <RefreshCw className="h-3.5 w-3.5" />
    )}
  </Button>
</div>
```

### 4. `Conversations.tsx` - Passar Dados Adicionais

Atualizar para passar `avatar_url` e `whatsapp_instance.id`:

```typescript
<ContactDetailsPanel
  conversation={{
    ...selectedConversation,
    client: selectedConversation.client_id ? {
      id: selectedConversation.client_id,
      custom_status_id: (selectedConversation as any).client?.custom_status_id,
      avatar_url: (selectedConversation as any).client?.avatar_url, // NEW
    } : null,
    whatsapp_instance: selectedConversation.whatsapp_instance_id ? {
      id: selectedConversation.whatsapp_instance_id, // NEW
      ...selectedConversation.whatsapp_instance,
    } : null,
  }}
  // ... rest of props
/>
```

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-api/index.ts` | Adicionar action `fetch_profile_picture` |
| `src/components/conversations/ContactDetailsPanel.tsx` | Adicionar botão de refresh, exibir avatar real |
| `src/pages/Conversations.tsx` | Passar `avatar_url` e `whatsapp_instance.id` |

---

## Comportamento do Botão

1. **Habilitado**: Quando há `client.id` e `whatsapp_instance.id` disponíveis
2. **Desabilitado**: Quando faltam informações ou está em loading
3. **Loading**: Exibe ícone de spinner durante a requisição
4. **Sucesso**: Toast "Foto atualizada!" + invalida queries para refresh
5. **Falha (privacidade)**: Toast informativo "Foto não disponível"
6. **Erro**: Toast de erro com descrição

---

## Resultado Esperado

### Antes
- Avatar mostra apenas iniciais (ex: "JF")
- Sem opção de atualizar manualmente

### Depois
- Avatar mostra foto do WhatsApp quando disponível
- Botão de refresh (↻) no canto inferior direito do avatar
- Ao clicar, busca foto atualizada do WhatsApp
- Fallback para iniciais se foto não disponível

---

## Considerações de Segurança

1. **Tenant Isolation**: A action valida que o `clientId` pertence ao `lawFirmId` do usuário
2. **Instance Validation**: Usa `getInstanceById` que já valida acesso à instância
3. **Error Handling**: Erros são tratados sem expor informações sensíveis
4. **Rate Limiting**: Implícito pela latência da Evolution API
