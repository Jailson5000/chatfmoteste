

# Corrigir Renderizacao de Templates WhatsApp + Preview na Criacao

## Problema 1: Templates nao aparecem como cards estilizados no chat

Os templates enviados pelo WhatsApp Cloud sao salvos no banco como texto puro, **sem** o marcador `[template: nome]` que o `MessageBubble` usa para detectar e renderizar como card estilizado com borda verde, icone e botoes.

**Causa**: No `meta-api/index.ts` (linha 433), quando o sistema busca o conteudo expandido do template na Graph API, ele substitui o fallback `[template: hello_world]` pelo texto expandido:

```text
// O que e salvo:
Hello World

Welcome and congratulations!!...

_WhatsApp Business Platform sample message_

// O que deveria ser salvo (com marcador):
[template: hello_world]
Hello World

Welcome and congratulations!!...

_WhatsApp Business Platform sample message_
```

Sem o marcador `[template:]`, o `MessageBubble.tsx` (linha 1872) nao detecta como template e renderiza como texto comum.

## Problema 2: Falta preview na criacao de templates

O dialog de criacao de templates em `WhatsAppTemplatesManager.tsx` nao mostra uma pre-visualizacao do template sendo criado. E preciso adicionar um painel lateral de preview que simule a aparencia do template no WhatsApp (com header, body, footer e botoes).

## Solucao

### 1. Backend: Preservar marcador `[template:]` no conteudo salvo

**Arquivo**: `supabase/functions/meta-api/index.ts`

Na funcao `send_test_message` (linha ~408-437), alterar a logica para **sempre** incluir o marcador `[template: nome]` na primeira linha do conteudo expandido:

```typescript
// Linha 433 - alterar de:
if (parts.length > 0) finalContent = parts.join("\n\n");

// Para:
if (parts.length > 0) finalContent = `[template: ${tplName}]\n${parts.join("\n\n")}`;
```

Isso garante que o conteudo salvo sempre comece com `[template: hello_world]`, ativando a deteccao do card no `MessageBubble`.

### 2. Backend: Fazer o mesmo para envio normal via chat

**Arquivo**: `supabase/functions/meta-api/index.ts`

Adicionar suporte a um novo action `send_template` que permite enviar templates a partir da tela de conversas (nao apenas pelo meta-test). Este action:
- Recebe `conversationId`, `templateName`, `templateLang` e opcionalmente `templateComponents` (parametros)
- Envia o template via WhatsApp Cloud API
- Salva a mensagem no banco com o marcador `[template: nome]` + conteudo expandido

### 3. Frontend: Melhorar deteccao de templates no MessageBubble

**Arquivo**: `src/components/conversations/MessageBubble.tsx`

Melhorar o `parseTemplateContent` para tambem detectar templates pelo padrao de conteudo (Header + Body + Footer com `_texto_`), mesmo sem o marcador `[template:]`. Isso corrige mensagens ja salvas no banco:

- Detectar mensagens que possuem footer no formato `_texto_` (indicador de template WhatsApp)
- Combinar com `is_from_me: true` e `message_type: "text"` para evitar falsos positivos

### 4. Frontend: Preview de template na criacao

**Arquivo**: `src/components/connections/WhatsAppTemplatesManager.tsx`

Expandir o dialog de criacao (`max-w-lg` para `max-w-3xl`) com layout de duas colunas:
- **Coluna esquerda**: formulario atual (header, body, footer, botoes)
- **Coluna direita**: preview em tempo real estilizado como WhatsApp

O preview mostrara:
- Fundo verde claro simulando bolha do WhatsApp
- Header em negrito (se preenchido)
- Body com variaveis `{{1}}` destacadas
- Footer em italico e cor mais clara
- Botoes como chips clicaveis abaixo da mensagem
- Borda lateral verde (mesmo estilo usado no chat)

### 5. Corrigir mensagens existentes no banco (SQL)

Atualizar as mensagens de template ja salvas para incluir o marcador:

```sql
UPDATE messages 
SET content = '[template: hello_world]' || E'\n' || content
WHERE content LIKE 'Hello World%' 
  AND content LIKE '%WhatsApp Business Platform sample message%'
  AND content NOT LIKE '[template:%'
  AND is_from_me = true;
```

## Resumo de alteracoes

| Arquivo | Tipo | Descricao |
|---------|------|-----------|
| `supabase/functions/meta-api/index.ts` | Backend | Preservar marcador `[template:]` ao salvar + novo action `send_template` |
| `src/components/conversations/MessageBubble.tsx` | Frontend | Melhorar deteccao de templates (fallback para conteudo sem marcador) |
| `src/components/connections/WhatsAppTemplatesManager.tsx` | Frontend | Adicionar painel de preview na criacao de templates |
| SQL | Dados | Corrigir mensagens existentes no banco |

## O que NAO muda
- Facebook (funcionando)
- Instagram (funcionando)
- Webhook `meta-webhook` (sem alteracoes)
- Templates internos do sistema (`EditableTemplate.tsx`, `TemplatePopup.tsx`)
- Logica de envio de mensagens normais (texto, imagem, etc.)

