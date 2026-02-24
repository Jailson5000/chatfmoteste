
## 0) Bloqueio imediato: erro de build (GitHub token)
**Erro:** `failed to get github access token ... invalid character '<'`
Isso normalmente acontece quando a resposta do GitHub volta como HTML (ex: página de login), indicando **token expirado / app sem permissão / sessão inválida**.

**Ação necessária (sua, 1 min):**
1. Abra **Project Settings → GitHub**.
2. Clique em **Reconnect / Re-authorize** (reautorizar o app).
3. Garanta que você escolheu a **conta/organização correta** e que o app tem permissão no repositório.
4. Refaça o build/deploy.

> Sem isso, qualquer correção que eu fizer pode não conseguir gerar “latest commit” e o pipeline trava.

---

## 1) Diagnóstico real (por que mídia ainda “não aparece / não baixa / figurinha falha”)
Pelos logs e pelo que apareceu no banco:

### 1.1 Sticker chegando com URL errada
No webhook do uazapi, alguns eventos chegam assim:
- `message.content.URL = "https://web.whatsapp.net"` (isso **não é** o arquivo da figurinha)
Resultado:
- Nosso código tenta baixar essa URL (falha DNS no runtime) e **não persiste** a figurinha no storage.
- O frontend vê `media_url` não-pública e tenta fallback via `get_media` (Evolution), mas **para uazapi hoje o get_media retorna erro**, então a figurinha vira “placeholder”.

### 1.2 Documento “aparece” mas ao clicar abre nova aba e não baixa
No frontend, o `DocumentViewer` faz:
- se URL é pública → `window.open(src, "_blank")`
Isso abre outra aba (como você relatou) e **não dispara download**. Além disso, se o PDF estiver inválido/corrompido (ou o navegador não renderizar), ele mostra erro em vez de baixar.

### 1.3 Áudio/imagem “não disponível”
Mesmo quando a mídia foi persistida no storage, o UI só funciona 100% quando:
- a URL é pública e o blob é baixável/reproduzível; ou
- o fallback `get_media` funciona (para casos de URL ausente/ruim).
Hoje, para uazapi, o `get_media` ainda está negando (“verifique o Storage”), então quando alguma mídia vier sem URL boa, o UI quebra.

---

## 2) Correção de backend (uazapi): parar de depender de `content.URL` e usar o endpoint correto de download
A documentação oficial do uazapi possui o endpoint:
- `POST /message/download` (Baixar arquivo de uma mensagem)

Ele retorna:
- `fileURL` (link público temporário do próprio uazapi, válido por 2 dias no storage deles)
- `base64Data` (opcional)
- `mimetype`

### 2.1 Ajuste no `uazapi-webhook` (principal)
Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Mudanças:**
1. **Detectar URLs inválidas/suspeitas**:
   - Se `mediaUrl` for `https://web.whatsapp.net` (ou vazio), tratar como **não confiável**.
2. **Quando mensagem for mídia (image/audio/document/sticker/video)**, ao invés de baixar do CDN diretamente:
   - Chamar `POST {instance.api_url}/message/download` com header `token: instance.api_key`
   - Body mínimo:
     ```json
     { "id": "<whatsappMessageId>", "return_link": true, "return_base64": false }
     ```
   - Para áudio, decidir `generate_mp3: true` (melhor compatibilidade web) ou `false` (manter ogg). Recomendo **true** para reduzir “áudio não disponível” no browser.
3. **Persistir sempre no nosso storage**:
   - Baixar o `fileURL` retornado pelo uazapi (não o `content.URL`)
   - Fazer upload no bucket `chat-media`
   - Salvar `messagePayload.media_url` com a URL pública do nosso storage
   - Salvar `media_mime_type` com o `mimetype` retornado
4. **Extensão correta**:
   - Usar `mimetype.split(';')[0]` e extMap (incluindo `.webp`, `.mp3`, `.ogg`, `.pdf`, etc.).
5. **Concorrência/duplicatas**:
   - Trocar a lógica de “duplicate check” e/ou tratar erro 23505 como “ok” **antes** de gastar tempo baixando e subindo arquivo.
   - Ideal: `upsert` por `(law_firm_id, whatsapp_message_id)` com `ignoreDuplicates`, ou capturar `23505` e abortar sem logar como erro.

**Resultado esperado:**
- Sticker, áudio, imagem e documento sempre ganham `media_url` pública real no storage.
- Nada mais tenta baixar `https://web.whatsapp.net`.

### 2.2 Corrigir fallback `get_media` para uazapi (muito importante)
Arquivo: `supabase/functions/evolution-api/index.ts` (action `get_media`)

Hoje ele faz:
- se uazapi → retorna erro “verifique o Storage”.

Vamos mudar para:
- se uazapi → chamar `POST /message/download` com:
  ```json
  { "id": "<whatsappMessageId>", "return_base64": true, "return_link": false, "generate_mp3": true }
  ```
- Retornar para o frontend no mesmo formato atual:
  ```json
  { "success": true, "base64": "<...>", "mimetype": "audio/mpeg" }
  ```

**Por que isso é crítico?**
- Mesmo com webhook bom, vai existir caso de falha temporária de download/persistência.
- O frontend (ImageViewer/StickerViewer/AudioPlayer/DocumentViewer) já tem lógica para buscar `get_media` quando precisa (decriptação/fallback). Sem isso, “Imagem/Áudio não disponível” volta.

---

## 3) Correção do frontend: download correto (sem abrir nova aba)
Arquivo: `src/components/conversations/MessageBubble.tsx` (DocumentViewer)

### 3.1 Para URLs públicas (storage), fazer download de verdade
Trocar o comportamento:
- Em vez de `window.open(src, "_blank")`
- Fazer:
  1) `fetch(src)` → `blob()`  
  2) criar `URL.createObjectURL(blob)`  
  3) `a.download = displayName`  
  4) clicar programaticamente e limpar URL.

### 3.2 Fallback se fetch falhar
Se o `fetch(src)` falhar (404, conteúdo inválido etc):
- Tentar o fallback atual (`supabase.functions.invoke("evolution-api", { action:"get_media" ... })`)
- E baixar via `dataUrl → blob` (como já existe).

**Resultado esperado:**
- Clique no documento → baixa o arquivo (sem “ir pra outra página”).
- Mesmo que PDF não renderize, o arquivo ainda baixa.

---

## 4) Backfill/recuperação do histórico (mídias antigas quebradas)
Depois das mudanças acima, ainda haverá mensagens antigas com:
- `media_url = https://web.whatsapp.net` ou `mmg.whatsapp.net` expirado

Plano de correção do histórico (2 opções):
1) **On-demand (recomendado e rápido)**: quando o usuário tentar abrir/baixar e falhar, o frontend chama `get_media` (agora suportado para uazapi) e funciona sem reprocessar tudo.
2) **Job de reparo (opcional)**: criar uma função de backend “repair_uazapi_media” para varrer mensagens recentes com URL ruim e repersistir no storage em lote.

---

## 5) Validação (checklist de teste)
Após aplicar:
1. Envie pelo WhatsApp (uazapi):
   - 1 figurinha
   - 1 áudio (PTT)
   - 1 imagem
   - 1 PDF
2. Confirme no chat:
   - figurinha aparece como imagem webp
   - áudio toca no player (sem “Áudio não disponível”)
   - imagem renderiza
   - PDF baixa diretamente (sem abrir aba)

---

## 6) Observação final sobre “remover Evolution”
Você aprovou **Dual-provider estável**. Então:
- Vamos **manter Evolution** para tenants legados
- Mas o fluxo do uazapi ficará completo e independente:
  - webhook persistindo mídia corretamente
  - `get_media` funcionando para uazapi (fallback universal)
  - downloads no frontend sem depender do Evolution

---

<lov-actions>
  <lov-open-history>View History</lov-open-history>
  <lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>
