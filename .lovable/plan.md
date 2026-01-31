
# Implementação: Foto de Perfil do WhatsApp no Avatar

## Objetivo

Exibir a foto de perfil real do WhatsApp do contato no avatar, em vez das iniciais (como "JP").

---

## Situação Atual

### O que já funciona
- A tabela `clients` já possui a coluna `avatar_url`
- O componente `ConversationSidebarCard` já exibe `avatar_url` quando disponível
- A Evolution API oferece endpoint `fetchProfilePictureUrl` para buscar fotos de perfil

### O que falta
- O sistema **não busca** a foto de perfil do WhatsApp quando um cliente é criado
- O campo `avatar_url` dos clientes está sempre vazio para contatos do WhatsApp

---

## Solução Técnica

### Arquitetura

```text
Mensagem recebida (evolution-webhook)
        ↓
Cliente criado/encontrado
        ↓
Verifica se avatar_url está vazio
        ↓
Se vazio → Busca foto via Evolution API
        ↓
Atualiza clients.avatar_url no banco
        ↓
Frontend exibe foto no avatar
```

### Alterações Necessárias

#### 1. Edge Function `evolution-api` - Nova Action

Adicionar action `fetch_profile_picture` para buscar foto de perfil:

```typescript
// Nova action em evolution-api/index.ts
case "fetch_profile_picture": {
  const { instanceId, phoneNumber } = body;
  
  // Busca instância
  const instance = await getInstanceById(supabaseClient, lawFirmId, instanceId, isGlobalAdmin);
  const apiUrl = normalizeUrl(instance.api_url);
  
  // Chama Evolution API
  const response = await fetch(
    `${apiUrl}/chat/fetchProfilePictureUrl/${instance.instance_name}`,
    {
      method: 'POST',
      headers: { 'apikey': instance.api_key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: phoneNumber })
    }
  );
  
  const result = await response.json();
  return { success: true, profilePictureUrl: result.profilePictureUrl };
}
```

#### 2. Edge Function `evolution-webhook` - Buscar Foto ao Criar Cliente

Após criar um novo cliente, buscar a foto de perfil de forma assíncrona:

```typescript
// Após criar newClient com sucesso
if (newClient && !newClient.avatar_url) {
  // Busca foto de perfil em background (não bloqueia webhook)
  fetchAndUpdateProfilePicture(
    supabaseClient, 
    instance, 
    phoneNumber, 
    newClient.id
  ).catch(err => 
    logDebug('AVATAR', 'Failed to fetch profile picture', { error: err })
  );
}
```

Nova função auxiliar:

```typescript
async function fetchAndUpdateProfilePicture(
  supabaseClient: any,
  instance: any,
  phoneNumber: string,
  clientId: string
): Promise<void> {
  try {
    const apiUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
    
    const response = await fetch(
      `${apiUrl}/chat/fetchProfilePictureUrl/${instance.instance_name}`,
      {
        method: 'POST',
        headers: {
          'apikey': instance.api_key || '',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ number: phoneNumber }),
      }
    );

    if (!response.ok) return;

    const result = await response.json();
    const profilePicUrl = result?.profilePictureUrl || result?.picture || result?.url;

    if (profilePicUrl) {
      await supabaseClient
        .from('clients')
        .update({ avatar_url: profilePicUrl })
        .eq('id', clientId);
      
      logDebug('AVATAR', 'Profile picture updated', { clientId, hasUrl: true });
    }
  } catch (error) {
    logDebug('AVATAR', 'Error fetching profile picture', { 
      error: error instanceof Error ? error.message : error 
    });
  }
}
```

#### 3. Atualização Periódica (Opcional - Fase 2)

Para manter fotos atualizadas, podemos criar um job que atualiza fotos de clientes ativos periodicamente. Mas isso pode ser implementado em uma fase futura.

---

## Arquivos Afetados

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Adicionar função para buscar foto de perfil após criar cliente |
| `supabase/functions/evolution-api/index.ts` | (Opcional) Adicionar action `fetch_profile_picture` para uso futuro |

---

## Considerações de Segurança

1. **Não bloqueia webhook**: A busca de foto é feita em background
2. **Fail-safe**: Erros ao buscar foto não afetam o fluxo principal
3. **Respeita privacidade**: Alguns usuários podem ter foto privada (API retornará null)

---

## Resultado Esperado

### Antes
- Avatar mostra iniciais "JP" para José Maria

### Depois  
- Avatar mostra foto de perfil do WhatsApp
- Se foto não disponível (privacidade), mantém iniciais como fallback

---

## Considerações Importantes

1. **Fotos privadas**: Se o usuário configurou foto privada no WhatsApp, a API retorna null. Nesses casos, o avatar continua mostrando as iniciais.

2. **Cache de imagem**: A URL retornada pela Evolution API é da CDN do WhatsApp e pode expirar. Em uma fase futura, podemos fazer upload da imagem para nosso storage.

3. **Clientes existentes**: Esta implementação só afeta novos clientes. Para atualizar clientes existentes, seria necessário um script de migração ou uma funcionalidade de "atualizar foto" manual.
