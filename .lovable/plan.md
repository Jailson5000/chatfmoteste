
# Corrigir Conexao Facebook e Instagram

## Problema 1: Facebook - page_id null

Os logs do backend mostram claramente o erro:

```
null value in column "page_id" of relation "meta_connections" violates not-null constraint
```

O codigo seleciona a pagina corretamente (`MIAU chat`, ID `977414192123496`), mas na hora de salvar usa `pageId` (variavel do body da requisicao, que e `undefined`) em vez de `selectedPage.id`.

**Correcao**: No edge function `meta-oauth-callback/index.ts`, linha ~186, trocar `page_id: pageId` por `page_id: selectedPage.id`.

## Problema 2: Instagram - Escopos invalidos

O erro "Invalid Scopes: instagram_business_basic, instagram_business_manage_messages" acontece porque esses escopos pertencem ao produto **Instagram API**, que e diferente do **Facebook Login for Business** configurado no app principal (1237829051015100).

Existem duas opcoes:

**Opcao A (recomendada)**: Trocar os escopos no codigo para os que funcionam com Facebook Login:
- `instagram_basic` (em vez de `instagram_business_basic`)
- `instagram_manage_messages` (em vez de `instagram_business_manage_messages`)

**Opcao B**: Adicionar o produto "Instagram API" ao app 1237829051015100 no Meta Dashboard. Mas isso requer configuracao adicional e pode complicar o App Review.

A Opcao A e mais simples e compativel com o setup atual.

## Mudancas no Codigo

### Arquivo 1: `supabase/functions/meta-oauth-callback/index.ts`

Na secao de upsert (por volta da linha 186), trocar:
```
page_id: pageId,
```
por:
```
page_id: selectedPage.id,
```

Isso corrige o bug do Facebook imediatamente.

### Arquivo 2: `src/lib/meta-config.ts`

Trocar os escopos do Instagram:
```typescript
export const META_SCOPES = {
  instagram: "instagram_basic,instagram_manage_messages,pages_show_list",
  facebook: "pages_messaging,pages_manage_metadata,pages_show_list",
} as const;
```

Esses escopos sao compativeis com "Facebook Login for Business" e cobrem o necessario para receber/enviar DMs.

## Resultado

- **Facebook**: Popup abre, autentica, salva a conexao (com page_id correto) e fecha o popup.
- **Instagram**: Popup abre sem erro de "Invalid Scopes", autentica, salva a conexao e fecha o popup.
- Funciona de qualquer subdominio (*.miauchat.com.br) porque o redirect_uri ja e fixo.
