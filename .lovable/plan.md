
## Corrigir Download de Midias e Persistencia

### Problemas Identificados

**Problema 1: Persistencia de midia nunca executou**

O codigo de persistencia (`persistMediaToStorage`) foi adicionado ao arquivo `evolution-webhook/index.ts`, mas os logs mostram ZERO ocorrencias de `MEDIA_PERSIST`. Isso indica que a versao do edge function em producao nao contem o codigo de persistencia - provavelmente o deploy anterior nao foi aplicado corretamente.

O arquivo "processo-471855952.pdf" recebido hoje as 14:07 UTC ainda tem a URL temporaria do WhatsApp CDN (`mmg.whatsapp.net/.../.enc`).

**Problema 2: Persistencia usa credenciais erradas**

O codigo atual (linhas 5572-5574) usa variaveis de ambiente globais:
```text
EVOLUTION_BASE_URL  (env var global)
EVOLUTION_GLOBAL_API_KEY  (env var global)
```

Mas cada instancia tem sua propria `api_url` e `api_key` no banco de dados. O objeto `instance` ja esta disponivel no escopo e ja e usado em todos os outros lugares do webhook. Usar env vars globais pode falhar se a instancia estiver em um servidor diferente ou se a chave global nao tiver permissao.

**Problema 3: Download falha quando Evolution API nao encontra a mensagem**

Os logs do `evolution-api` mostram:
```text
Get media failed: {"message":["Message not found"]}
Get media failed: {"message":["TypeError: fetch failed"]}
```

A Evolution API nao conseguiu descriptografar a midia porque o WhatsApp ja removeu a mensagem do cache da sessao (mesmo sendo recente - apenas 12 minutos). Isso acontece quando a conexao reinicia.

### Correcoes

**1. Corrigir persistencia no webhook (usar instancia, nao env vars)**

No arquivo `supabase/functions/evolution-webhook/index.ts`, linhas 5570-5607, substituir o uso de env vars globais pelo objeto `instance` que ja esta no escopo:

```text
// ANTES (bugado):
const evolutionBaseUrl = Deno.env.get('EVOLUTION_BASE_URL');
const evolutionApiKey = Deno.env.get('EVOLUTION_GLOBAL_API_KEY');

// DEPOIS (correto):
const evolutionBaseUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
const evolutionApiKey = instance.api_key || '';
```

**2. Adicionar persistencia no momento do download (fallback para mensagens antigas)**

No arquivo `supabase/functions/evolution-api/index.ts`, no case `get_media`: apos obter o base64 com sucesso da Evolution API, salvar no Storage antes de retornar. Isso garante que mensagens antigas (que nao passaram pela persistencia no webhook) sejam persistidas na primeira vez que forem baixadas com sucesso.

Alem disso, atualizar o campo `media_url` da mensagem no banco para a URL permanente, evitando chamadas futuras a Evolution API.

```text
// Apos obter mediaData.base64 com sucesso:
// 1. Upload para chat-media bucket
// 2. Atualizar messages.media_url com a URL permanente
// 3. Retornar base64 normalmente
```

**3. Redesployar o evolution-webhook**

Garantir que a edge function seja redeployada corretamente com o codigo de persistencia.

### Detalhes Tecnicos

**Arquivo 1: `supabase/functions/evolution-webhook/index.ts`**

Modificar linhas ~5570-5590 para usar `instance.api_url` e `instance.api_key` em vez de env vars:

```text
if (mediaUrl && ['image', 'document', 'audio', 'video', 'ptt', 'sticker'].includes(messageType) && !isFromMe) {
  try {
    // Usar URL e chave da instancia especifica (ja disponivel no escopo)
    const evolutionBaseUrl = instance.api_url.replace(/\/+$/, '').replace(/\/manager$/i, '');
    const evolutionApiKey = instance.api_key || '';

    const persistedUrl = await persistMediaToStorage(
      supabaseClient,
      evolutionBaseUrl,
      evolutionApiKey,
      instance.instance_name,
      data.key,
      data.message,
      conversation.law_firm_id,
      conversation.id,
      data.key.id,
      mediaMimeType
    );
    // ...
  }
}
```

**Arquivo 2: `supabase/functions/evolution-api/index.ts`**

No case `get_media` (linhas ~2264-2282), apos obter o base64 da midia, adicionar logica para persistir no Storage e atualizar a mensagem:

```text
// Apos: const mediaData = await mediaResponse.json();
// E apos normalizar o mimeType:

// --- PERSIST ON DOWNLOAD (para mensagens antigas) ---
try {
  const baseMime = (normalizedMimetype || '').split(';')[0].trim().toLowerCase();
  const extMap = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', ... };
  const ext = extMap[baseMime] || '.bin';
  const safeId = body.whatsappMessageId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const storagePath = `${targetLawFirmId}/${body.conversationId}/${safeId}${ext}`;

  // Upload to Storage
  const bytes = Uint8Array.from(atob(mediaData.base64), c => c.charCodeAt(0));
  await supabaseClient.storage.from('chat-media').upload(storagePath, bytes, {
    contentType: baseMime || 'application/octet-stream',
    upsert: true,
  });

  // Get public URL and update message
  const { data: publicUrlData } = supabaseClient.storage.from('chat-media').getPublicUrl(storagePath);
  if (publicUrlData?.publicUrl) {
    await supabaseClient.from('messages')
      .update({ media_url: publicUrlData.publicUrl })
      .eq('whatsapp_message_id', body.whatsappMessageId)
      .eq('conversation_id', body.conversationId);
  }
} catch (persistErr) {
  console.warn('[Evolution API] Failed to persist media on download:', persistErr);
}
// --- END PERSIST ON DOWNLOAD ---
```

### Resumo

1. Persistencia no webhook: usar credenciais da instancia, nao env vars globais
2. Persistencia no download: salvar no Storage quando descriptografar com sucesso (catch-up para mensagens antigas)
3. Redeployar ambas as edge functions

Isso resolve tanto o problema imediato (arquivos novos nao sendo persistidos) quanto o problema de longo prazo (arquivos antigos serao persistidos na primeira vez que forem baixados com sucesso).
