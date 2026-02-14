
# Corrigir Deteccao Falsa de Templates + Botoes

## Problema 1: Mensagens normais aparecendo como template

As mensagens enviadas pelo sistema incluem uma assinatura no formato `_*Suporte MiauChat*_` (italico + negrito). O fallback de deteccao de templates (`looksLikeTemplate`) esta incorretamente identificando essas mensagens como templates porque:

- `_*Suporte MiauChat*_` corresponde ao regex `^_[^_]+_$` (detecta "footer italico")
- A mensagem tem `is_from_me = true`
- A mensagem tem 2+ linhas

**Resultado**: "Ola" com assinatura aparece como card de template em vez de texto normal.

## Problema 2: Botoes do Hello World

O backend ja extrai botoes dos templates (`[Opcoes: texto1 | texto2]`) e o frontend ja renderiza esses botoes como chips. O template "Hello World" da Meta geralmente **nao possui botoes** -- apenas Header, Body e Footer. Por isso nao aparecem botoes para ele. Isso e comportamento correto.

## Solucao

### 1. Remover o fallback `looksLikeTemplate`

**Arquivo**: `src/components/conversations/MessageBubble.tsx` (linhas 1878-1881)

O fallback que detecta templates por "padrao estrutural" esta causando falsos positivos. Templates salvos corretamente ja possuem o marcador `[template:]`, entao o fallback nao e necessario.

Alterar de:
```typescript
const hasItalicFooter = /^_[^_]+_$/m.test(rawContent);
const looksLikeTemplate = isFromMe && !templateNameMatchMulti && hasItalicFooter && rawContent.split('\n').filter(l => l.trim()).length >= 2;
const isTemplateCard = !!templateNameMatchMulti || hasOptionsLine || looksLikeTemplate;
const templateCardName = templateNameMatchSingle?.[1] || templateNameMatchMulti?.[1] || (looksLikeTemplate ? "template" : undefined);
```

Para:
```typescript
const isTemplateCard = !!templateNameMatchMulti || hasOptionsLine;
const templateCardName = templateNameMatchSingle?.[1] || templateNameMatchMulti?.[1];
```

Isso remove completamente a deteccao por heuristica e confia apenas no marcador `[template:]` ou no formato `[Opcoes:]`.

### 2. Tambem suprimir texto duplicado para templates com marcador

Na secao de `displayContent` (linha ~1860-1869), a logica ja suprime o conteudo quando detecta `[template:]`. Isso continua funcionando normalmente.

## Resumo

| Item | Alteracao |
|------|-----------|
| `MessageBubble.tsx` | Remover fallback `looksLikeTemplate` (4 linhas) |
| Backend | Sem alteracao (ja salva marcador corretamente) |
| Botoes Hello World | Nao ha bug -- template nao possui botoes |

## O que NAO muda
- Deteccao por marcador `[template: nome]` (continua funcionando)
- Deteccao por `[Opcoes:]` (continua funcionando)  
- Preview de criacao de templates (implementado anteriormente)
- Envio de templates
- Renderizacao de botoes quando existem
