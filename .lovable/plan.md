

## Correção do Envio de Áudio para WhatsApp

### Diagnóstico Confirmado

Os logs da edge function mostram que o erro 400 "Owned media must be a url, base64, or valid file with buffer" **ainda está ocorrendo**:

```
sendWhatsAppAudio failed (400)
audioDataUriLength: 117094  ← Data URI com prefixo
```

### Causa Raiz

Na linha 2335 do arquivo `evolution-api/index.ts`:
```typescript
const audioPayload = {
  number: targetNumber,
  audio: audioDataUri,  // ← INCORRETO: envia "data:audio/ogg;base64,XXXX"
  delay: 500,
};
```

A Evolution API exige **base64 puro** no campo `audio`, mas o código está enviando um **Data URI completo** (com prefixo `data:mime;base64,`).

### Plano de Correção

#### 1. Backend: Corrigir payload do sendWhatsAppAudio
**Arquivo:** `supabase/functions/evolution-api/index.ts`

**Alterações:**
- Remover a construção de `audioDataUri` (linha 2329)
- Limpar o base64 de espaços e quebras de linha
- Enviar `audio: cleanedBase64` em vez de `audio: audioDataUri`
- Atualizar logs para refletir a mudança

**Código atual (linhas 2329-2338):**
```typescript
const audioDataUri = `data:${audioPureMime};base64,${audioBase64}`;
const audioEndpoint = `${apiUrl}/message/sendWhatsAppAudio/${instance.instance_name}`;
const audioPayload = {
  number: targetNumber,
  audio: audioDataUri,
  delay: 500,
};
```

**Código corrigido:**
```typescript
// Clean base64: remove whitespace and newlines that may corrupt the payload
const cleanedAudioBase64 = audioBase64.trim().replace(/\s+/g, "");

const audioEndpoint = `${apiUrl}/message/sendWhatsAppAudio/${instance.instance_name}`;
const audioPayload = {
  number: targetNumber,
  audio: cleanedAudioBase64,  // RAW base64, NOT Data URI
  delay: 500,
};
```

#### 2. Atualizar logs de diagnóstico
Alterar o log para mostrar `audioBase64Length` em vez de `audioDataUriLength`:

```typescript
console.log(`[Evolution API] Sending audio via sendWhatsAppAudio to ${targetNumber}`, {
  endpoint: audioEndpoint,
  audioBase64Length: cleanedAudioBase64.length,
  estimatedKB: Math.round((cleanedAudioBase64.length * 3) / 4 / 1024),
  pureMime: audioPureMime,
});
```

#### 3. Deploy e Validação
Após o deploy, verificar nos logs:
- `sendWhatsAppAudio` deve retornar status **200/201** (não 400)
- Não deve mais aparecer "Owned media must be..." 
- `methodUsed` deve ser `sendWhatsAppAudio` (não fallback)
- Áudio deve chegar no destinatário e ser reproduzível

### Resumo das Alterações

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-api/index.ts` | Enviar base64 puro no campo `audio` (sem prefixo Data URI) |

### Risco e Mitigação

- **Risco:** Baixo - alteração isolada ao case `audio`
- **Mitigação:** Fallback para `sendMedia` continua funcionando como backup
- **Zero regressão:** Não afeta imagem, documento, vídeo ou outros fluxos

### Critério de Sucesso

1. Logs mostram `sendWhatsAppAudio` retornando 200/201 (sem erro 400)
2. Áudio chega no WhatsApp do destinatário
3. Player exibe duração correta (não "0:00")
4. Status muda de PENDING para delivered

