
# Análise: Extração de Imagem de Perfil dos Leads

## Situação Atual (Dados Reais)

| Métrica | Valor |
|---------|-------|
| Total de clientes | 1.045 |
| Com avatar | 257 (24,6%) |
| Sem avatar | 788 (75,4%) |

Das 257 fotos existentes: 255 vêm do WhatsApp (pps.whatsapp.net), 1 do Instagram e 1 de outra fonte.

## Como Funciona Hoje

### WhatsApp (Evolution API)
- A foto de perfil **só é buscada quando um cliente NOVO é criado** (primeiro contato).
- Se o cliente já existia (ex: conversa anterior) e não tinha foto, **nunca mais tenta buscar**.
- Existe um botão manual "Atualizar Foto" no painel de detalhes do contato.
- As URLs salvas apontam diretamente para `pps.whatsapp.net` -- URLs que **expiram** após alguns dias/semanas, quebrando a exibição.

### Instagram / Facebook (Meta Webhook)
- Busca nome + `profile_pic` via Graph API ao criar/atualizar o cliente.
- Funciona, mas depende de **Advanced Access** e o campo `profile_pic` nem sempre retorna (fallback busca só `name`).
- Resultado: apenas 1 avatar de Instagram no banco.

### WhatsApp Cloud API
- **Não busca foto de perfil** atualmente. O meta-webhook trata como canal Meta genérico sem lógica específica de avatar WhatsApp Cloud.

## Problemas Identificados

### 1. Foto só é buscada para clientes NOVOS
Clientes que já existiam quando o recurso foi implementado (~75% do banco) nunca tiveram suas fotos buscadas. Mensagens subsequentes de clientes existentes não disparam nova busca.

### 2. URLs do WhatsApp expiram
As URLs `pps.whatsapp.net` expiram periodicamente. O sistema salva a URL direta sem persistir a imagem no Storage, resultando em avatares quebrados ao longo do tempo.

### 3. Sem re-tentativa para clientes existentes sem avatar
Quando um cliente existente (sem avatar) envia uma nova mensagem, o webhook encontra a conversa e o cliente já existentes e pula a lógica de busca de foto.

## Plano de Correção

### Etapa 1: Buscar avatar para clientes existentes sem foto (evolution-webhook)

No fluxo do webhook, após encontrar uma conversa com cliente existente, adicionar uma verificação: se `client.avatar_url` é `null`, buscar a foto em background.

**Arquivo**: `supabase/functions/evolution-webhook/index.ts`

Na seção onde a conversa já existe e tem `client_id` (após linha ~4496), adicionar:

```text
// Se o cliente existe mas não tem avatar, tentar buscar em background
if (conversation.client_id) {
  const { data: clientData } = await supabaseClient
    .from('clients')
    .select('avatar_url')
    .eq('id', conversation.client_id)
    .maybeSingle();
  
  if (clientData && !clientData.avatar_url) {
    fetchAndUpdateProfilePicture(
      supabaseClient, instance, phoneNumber, conversation.client_id
    ).catch(err => logDebug('AVATAR', 'Background retry failed', { error: String(err) }));
  }
}
```

Isso cobre a grande maioria dos 788 clientes sem foto -- assim que enviarem uma nova mensagem, o avatar será buscado automaticamente.

### Etapa 2: Persistir imagem no Storage (evitar URLs expiradas)

Modificar a função `fetchAndUpdateProfilePicture` para:
1. Baixar a imagem da URL do WhatsApp
2. Salvar no bucket `chat-media` (já existe e é público)
3. Salvar a URL pública do Storage no banco em vez da URL temporária

**Arquivo**: `supabase/functions/evolution-webhook/index.ts` (função `fetchAndUpdateProfilePicture`)

```text
// Após obter profilePicUrl do WhatsApp:
// 1. Baixar a imagem
const imageResponse = await fetch(profilePicUrl);
const imageBuffer = await imageResponse.arrayBuffer();
const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

// 2. Upload para o Storage
const filePath = `${lawFirmId}/avatars/${clientId}.jpg`;
const { error: uploadError } = await supabaseClient.storage
  .from('chat-media')
  .upload(filePath, imageBuffer, { contentType, upsert: true });

// 3. Gerar URL pública permanente
const { data: urlData } = supabaseClient.storage
  .from('chat-media')
  .getPublicUrl(filePath);

// 4. Salvar URL permanente no banco
await supabaseClient.from('clients')
  .update({ avatar_url: urlData.publicUrl })
  .eq('id', clientId);
```

Isso também precisa ser aplicado na action `fetch_profile_picture` do `evolution-api/index.ts` (botão manual).

### Etapa 3: Aplicar a mesma lógica no evolution-api (action manual)

**Arquivo**: `supabase/functions/evolution-api/index.ts` (case `fetch_profile_picture`)

Mesma lógica: baixar imagem, salvar no Storage, retornar URL permanente.

## Escopo e Impacto

- **Etapa 1**: Resolve o problema principal (75% dos leads sem foto). Sem risco -- fire-and-forget.
- **Etapa 2**: Resolve a expiração de URLs. Risco baixo -- usa bucket existente (`chat-media`).
- **Etapa 3**: Consistência entre busca automática e manual.

## Limitações Inerentes

- ~15-20% dos usuários do WhatsApp bloqueiam foto de perfil por privacidade -- esses nunca terão avatar.
- Instagram/Facebook dependem de Advanced Access para fotos.
- WhatsApp Cloud API não expõe endpoint de foto de perfil facilmente.

## Resultado Esperado

Com as 3 etapas, a cobertura de avatares deve subir de **~25% para ~65-80%** (limitado apenas pela privacidade dos usuários), e as fotos não expirarão mais.
