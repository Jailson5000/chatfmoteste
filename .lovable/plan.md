
# Corrigir erros no Meta Test e Templates

## Problemas identificados

### 1. Token expirado (causa de TODOS os erros atuais)
Os logs confirmam: **"Session has expired on Friday, 13-Feb-26 15:00:00 PST"**. O token temporario que voce colou expirou. Tokens temporarios da Meta duram apenas **1 hora**. Voce precisa gerar um novo no painel Meta Developer > WhatsApp > API Setup.

### 2. "Edge Function returned a non-2xx status code" no envio
O `send_test_message` ainda retorna `status: 502` quando a Meta retorna erro (linha 416-419). O fix anterior so foi aplicado ao `test_api`, mas nao ao `send_test_message`. Mesma coisa para `list_templates`, `create_template` e `delete_template`.

### 3. Template com formato incompleto
A Meta exige que templates UTILITY tenham pelo menos um componente BODY. O formato atual funciona para templates basicos, mas a Meta pode rejeitar se nao tiver o campo `allow_category_change: true` (recomendado). Alem disso, o frontend do `WhatsAppTemplatesManager` faz `throw` no erro em vez de exibir a mensagem.

## Correcoes

### Arquivo: `supabase/functions/meta-api/index.ts`

**Alteracao 1** - `list_templates` (linha 115-118): Mudar para sempre retornar 200
```typescript
// Antes:
status: res.ok ? 200 : 502,
// Depois:
status: 200,
```

**Alteracao 2** - `create_template` (linha 136-138): Mudar para sempre retornar 200 + adicionar `allow_category_change: true`
```typescript
body: JSON.stringify({ name, category, language, components, allow_category_change: true }),
// ...
status: 200,
```

**Alteracao 3** - `delete_template` (linha 156-158): Mudar para sempre retornar 200
```typescript
status: 200,
```

**Alteracao 4** - `send_test_message` (linha 416-419): Mudar para sempre retornar 200
```typescript
status: 200,
```

### Arquivo: `src/components/connections/WhatsAppTemplatesManager.tsx`

**Alteracao 5** - `fetchTemplates`: Tratar `data.error` da Meta em vez de depender do status HTTP
```typescript
if (res.data?.error) {
  throw new Error(res.data.error.message || JSON.stringify(res.data.error));
}
setTemplates(res.data?.data || []);
```

**Alteracao 6** - `handleCreate`: Mesmo tratamento para erros da Meta na criacao

### Arquivo: `src/pages/admin/MetaTestPage.tsx`

**Alteracao 7** - `handleSaveTestConnection` (linha 126): Tratar `data.error` como objeto
```typescript
if (data?.error) {
  const errMsg = typeof data.error === 'object' 
    ? JSON.stringify(data.error, null, 2) 
    : String(data.error);
  throw new Error(errMsg);
}
```

## Acao manual necessaria (voce)

1. Gere um **novo token temporario** no Meta Developer > WhatsApp > API Setup
2. Cole o novo token na pagina `/meta-test`
3. Clique "Salvar Conexao de Teste"
4. Agora todos os testes e templates vao funcionar

## Deploy
Deployar `meta-api` com as correcoes.
