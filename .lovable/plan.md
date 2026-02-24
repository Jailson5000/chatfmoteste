

# Correção: Detecção de Anúncio CTWA (Click-to-WhatsApp) no Webhook UAZAPi

## Problema

Após a migração para UAZAPi, o banner "Via Anúncio do Facebook" parou de aparecer nas conversas. A causa é que o `uazapi-webhook` **não possui** a lógica de detecção de `externalAdReply` que existe no `evolution-webhook`.

Quando um usuário clica em um anúncio do Facebook/Instagram e abre o WhatsApp (CTWA - Click-to-WhatsApp), a primeira mensagem contém metadados do anúncio em `contextInfo.externalAdReply`. O Evolution webhook já extrai esses dados e salva em `origin = 'whatsapp_ctwa'` + `origin_metadata` na conversa. O UAZAPi webhook simplesmente ignora esses dados.

## Correção

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

Adicionar detecção de `externalAdReply` logo após a criação/resolução da conversa (após linha ~870) e antes da atualização de `convUpdate` (linha ~1245).

A lógica será:

1. Extrair `externalAdReply` de vários locais possíveis na mensagem UAZAPi:
   - `msg.contextInfo?.externalAdReply`
   - `msg.message?.extendedTextMessage?.contextInfo?.externalAdReply`
   - `msg.message?.imageMessage?.contextInfo?.externalAdReply`
   - `msg.message?.videoMessage?.contextInfo?.externalAdReply`
   - `msg.content?.contextInfo?.externalAdReply` (formato UAZAPi específico)

2. Se detectado e `!isFromMe`, adicionar ao `convUpdate`:
   ```typescript
   convUpdate.origin = 'whatsapp_ctwa';
   convUpdate.origin_metadata = {
     ad_title: externalAdReply.title || null,
     ad_body: externalAdReply.body || null,
     ad_thumbnail: externalAdReply.thumbnailUrl || externalAdReply.thumbnail || null,
     ad_media_url: externalAdReply.mediaUrl || null,
     ad_source_id: externalAdReply.sourceId || null,
     ad_source_url: externalAdReply.sourceUrl || null,
     ad_source_type: externalAdReply.sourceType || null,
     detected_at: new Date().toISOString(),
   };
   ```

3. Adicionar log para monitoramento: `[UAZAPI_WEBHOOK] 📢 CTWA ad detected`

## Inserção no código

O bloco será inserido no `convUpdate` que já existe (linhas 1191-1248), adicionando a verificação de `externalAdReply` antes do `await supabaseClient.from("conversations").update(convUpdate)`.

Também precisa cobrir o caso de criação de conversa nova (linha 836-849), onde o `origin` é definido como `"WHATSAPP"` — se tiver ad, deve ser `"whatsapp_ctwa"` desde o início.

## Resumo

| Problema | Causa | Correção |
|---|---|---|
| Banner "Via Anúncio" não aparece | UAZAPi webhook não lê `externalAdReply` | Adicionar detecção de CTWA ad idêntica ao Evolution webhook |

## Arquivo afetado

| Arquivo | Mudança |
|---|---|
| `supabase/functions/uazapi-webhook/index.ts` | Adicionar extração de `externalAdReply` + salvar `origin`/`origin_metadata` na conversa |

