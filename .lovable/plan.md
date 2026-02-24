

# Correcao: IA Enviando Textos Sem Dividir (uazapi)

## Diagnostico

O problema esta na logica de fragmentacao do `uazapi-webhook`. Quando a IA responde via `ai-chat`, a funcao retorna dois campos:
- `response`: texto completo
- `responseParts`: array ja fragmentado pela funcao `splitIntoParagraphs` (divide por `\n\n`, `\n`, ou frases >400 chars)

**Porem o uazapi-webhook IGNORA `responseParts`** e usa sua propria logica de split que:
1. So ativa quando texto > 800 caracteres
2. Divide apenas por `\n\n+` (paragrafos duplos)
3. Textos menores que 800 chars sao enviados como bloco unico

Resultado: respostas de 300-799 caracteres chegam como textao sem divisao no WhatsApp.

## Correcao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

**Mudanca unica** — Usar `responseParts` do `ai-chat` em vez de re-fragmentar:

Na linha 1214-1244, substituir a logica atual:
```typescript
// ANTES (logica propria de split):
const aiText = result.response;
// ... split manual com regex ...

// DEPOIS (usar parts ja prontos do ai-chat):
const aiText = result.response;
const parts: string[] = (result.responseParts && result.responseParts.length > 1)
  ? result.responseParts.slice(0, 5)  // Max 5 parts
  : aiText.length > 400
    ? aiText.split(/\n\n+/).map(p => p.trim()).filter(p => p.length > 0).slice(0, 5)
    : [aiText];
```

Isso garante que:
- Se `ai-chat` ja dividiu em paragrafos, usa essa divisao (mais inteligente — divide por `\n\n`, `\n`, ou frases)
- Se nao, faz fallback com threshold de 400 chars (em vez de 800)
- Limita a 5 partes para evitar spam

## Resumo

| Arquivo | Mudanca |
|---|---|
| `uazapi-webhook/index.ts` | Usar `responseParts` do ai-chat + baixar threshold de split |

## Resultado Esperado
- Respostas da IA chegam divididas em mensagens naturais no WhatsApp
- Cada paragrafo vira uma mensagem separada, como no evolution-webhook
- Textos curtos continuam como mensagem unica

