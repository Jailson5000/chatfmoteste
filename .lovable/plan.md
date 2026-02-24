

# Corrigir status da conversa no uazapi-webhook

## Problema

O webhook esta recebendo as mensagens corretamente do uazapi (evento detectado, instancia encontrada, mensagem parseada), porem falha ao criar a conversa no banco de dados:

```
invalid input value for enum case_status: "open"
```

A coluna `status` da tabela `conversations` usa o enum `case_status` com valores: `novo_contato`, `triagem_ia`, `aguardando_documentos`, `em_analise`, `em_andamento`, `encerrado`.

O `uazapi-webhook` tenta inserir `status: "open"`, que nao existe no enum. Todos os outros webhooks (evolution-webhook, meta-webhook, ai-chat, etc.) usam `"novo_contato"`.

## Solucao

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

Alterar a linha que cria a conversa, trocando `status: "open"` por `status: "novo_contato"`:

```typescript
// ANTES
status: "open",

// DEPOIS
status: "novo_contato",
```

## Impacto

- Apenas 1 linha alterada em 1 arquivo
- Apos o deploy, mensagens recebidas do uazapi criarao conversas corretamente e aparecerao na interface

