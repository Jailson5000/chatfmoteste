
# ✅ Correção Concluída: 3 Problemas no Sistema de IA (Áudio e Status)

**Implementado em:** 2026-02-08

### Problema 1: "@Ativar áudio" Aparecendo Como Texto no Chat
**Screenshot:** A IA Maria enviou literalmente "@Ativar áudio" como mensagem de texto para o cliente.

**Causa:** O prompt do agente Maria contém:
```
Se o cliente disser que não sabe ler... então @Ativar áudio
```
A IA interpreta `@Ativar áudio` como texto a ser enviado ao cliente, não como uma ação interna. Diferente de `@status:X` ou `@etiqueta:Y`, NÃO existe uma tool chamada "ativar áudio" - a ativação é feita **automaticamente** pelo sistema quando detecta que o cliente pediu áudio.

### Problema 2: Inconsistência no Formato de Áudio (MP3 vs OGG)
**Situação atual:**
- ElevenLabs gera áudio em **MP3** (`output_format=mp3_44100_128`)
- O arquivo é salvo no Storage como **`.mp3`** com `contentType: 'audio/mpeg'`
- Mas ao enviar para WhatsApp, enviamos com `mimetype: "audio/ogg"` ❌

Isso causa confusão no download e pode causar problemas de compatibilidade.

### Problema 3: IA Não Está Executando `change_status` para "Desqualificado"
**Screenshot:** A conversa mostra que a IA:
- ✅ Adicionou tag "10 anos ++"
- ✅ Alterou status de "Análise" para "Qualificado" (momento errado)
- ✅ Transferiu para departamento "Finalizado"
- ❌ **NÃO** alterou status para "Desqualificado"

A IA identificou corretamente que o cliente se aposentou em 2015 (mais de 10 anos), mas ainda assim colocou "Qualificado" em vez de "Desqualificado".

---

## Solução

### Correção 1: Interceptar e Remover "@Ativar áudio" da Resposta da IA

Adicionar lógica no `evolution-webhook` para:
1. Detectar quando a resposta da IA contém `@Ativar áudio` ou `@Desativar áudio`
2. Remover esse texto da resposta antes de enviar ao cliente
3. Ativar/desativar o modo áudio automaticamente baseado no comando

### Correção 2: Uniformizar Formato de Áudio para MP3

Alterar em 2 lugares:
1. **`sendAudioToWhatsApp`**: Usar `mimetype: "audio/mpeg"` ao enviar para WhatsApp
2. **Insert no banco**: Manter `media_mime_type: 'audio/mpeg'` (já correto)

### Correção 3: Fortalecer Instrução de Mudança de Status

Adicionar instrução **ainda mais explícita** no `ai-chat` que:
1. Enfatiza que `@status:Desqualificado` SEMPRE requer chamar `change_status`
2. Inclui exemplo específico do cenário "10 anos" → Desqualificado
3. Adiciona validação para não permitir "Qualificado" quando prazo > 10 anos

---

## Arquivos a Modificar

| Arquivo | Alteração |
|---------|-----------|
| `supabase/functions/evolution-webhook/index.ts` | Interceptar e remover `@Ativar áudio` da resposta; corrigir mimetype para audio/mpeg |
| `supabase/functions/ai-chat/index.ts` | Fortalecer regras de execução de change_status |

---

## Detalhes Técnicos

### 1. Interceptação de "@Ativar áudio" no evolution-webhook

```typescript
// Adicionar antes de enviar a resposta ao WhatsApp (linhas ~2425-2430)

function processAIAudioCommands(text: string): { cleanText: string; shouldEnableAudio: boolean; shouldDisableAudio: boolean } {
  let cleanText = text;
  let shouldEnableAudio = false;
  let shouldDisableAudio = false;

  // Detectar @Ativar áudio e variações
  const enablePatterns = [
    /@Ativar\s*[aá]udio/gi,
    /@ativar\s*[aá]udio/gi,
    /@ATIVAR\s*[AÁ]UDIO/gi,
  ];

  // Detectar @Desativar áudio e variações
  const disablePatterns = [
    /@Desativar\s*[aá]udio/gi,
    /@desativar\s*[aá]udio/gi,
  ];

  for (const pattern of enablePatterns) {
    if (pattern.test(cleanText)) {
      shouldEnableAudio = true;
      cleanText = cleanText.replace(pattern, '').trim();
    }
  }

  for (const pattern of disablePatterns) {
    if (pattern.test(cleanText)) {
      shouldDisableAudio = true;
      cleanText = cleanText.replace(pattern, '').trim();
    }
  }

  // Limpar linhas vazias extras resultantes da remoção
  cleanText = cleanText.replace(/\n{3,}/g, '\n\n').trim();

  return { cleanText, shouldEnableAudio, shouldDisableAudio };
}
```

### 2. Correção do MIME Type

```typescript
// Em sendAudioToWhatsApp (~linha 1936)
// ANTES:
mimetype: "audio/ogg",

// DEPOIS:
mimetype: "audio/mpeg",
```

### 3. Regras Mais Fortes para change_status

```typescript
// Adicionar ao toolExecutionRules no ai-chat (~linha 3576)

const toolExecutionRules = `

### REGRAS DE EXECUÇÃO DE AÇÕES CRM (OBRIGATÓRIO) ###

...regras existentes...

### REGRA ESPECÍFICA: MUDANÇA DE STATUS DESQUALIFICADO ###

CENÁRIO CRÍTICO: Quando o cliente tem mais de 10 anos de aposentadoria e NÃO solicitou revisão:
1. Você DEVE chamar change_status com status_name="Desqualificado"
2. NÃO chame change_status com "Qualificado" neste cenário
3. A ordem correta é: primeiro identifique o tempo → depois mude o status correto

Erro comum a evitar: Marcar como "Qualificado" e depois tentar mudar para "Desqualificado" - faça apenas UMA chamada com o status CORRETO.

Se o prompt menciona "@status:Desqualificado" para uma situação, você DEVE usar exatamente esse status, não outro.

`;
```

---

## Fluxo Corrigido (Problema 1)

```text
┌─────────────────────────────────────────────────────────────┐
│                 ANTES (BUG)                                 │
├─────────────────────────────────────────────────────────────┤
│  Cliente: "minha leitura é meia pouca"                      │
│  IA responde: "@Ativar áudio" (enviado como texto!) ❌      │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                 DEPOIS (CORRIGIDO)                          │
├─────────────────────────────────────────────────────────────┤
│  Cliente: "minha leitura é meia pouca"                      │
│  IA responde: "@Ativar áudio Olá, senhor..."                │
│           ↓                                                 │
│  evolution-webhook detecta "@Ativar áudio"                  │
│  1. Remove "@Ativar áudio" do texto                         │
│  2. Ativa modo áudio (ai_audio_enabled = true)              │
│  3. Envia "Olá, senhor..." como ÁUDIO ✅                    │
└─────────────────────────────────────────────────────────────┘
```

---

## Análise de Risco

| Aspecto | Risco | Mitigação |
|---------|-------|-----------|
| Remoção de texto | BAIXO | Padrão específico com @ não afeta texto normal |
| MIME type | BAIXO | MP3 é universalmente suportado pelo WhatsApp |
| Regras de status | BAIXO | Adiciona clareza sem quebrar fluxos existentes |
| Performance | NENHUM | Apenas processamento de string leve |

---

## Resultado Esperado

1. **"@Ativar áudio"** nunca mais aparece no chat do cliente
2. Áudios da IA podem ser baixados corretamente como MP3
3. Clientes com mais de 10 anos de aposentadoria são marcados como "Desqualificado", não "Qualificado"
