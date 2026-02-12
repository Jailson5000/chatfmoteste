

# Corrigir PLATFORM_INVALID_APP_ID no OAuth do Instagram/Facebook

## Problema
O erro `PLATFORM_INVALID_APP_ID` ocorre porque o App ID hardcoded no arquivo `src/lib/meta-config.ts` esta errado.

- **Valor atual (errado):** `1447135433693990`
- **Valor correto (do painel Meta):** `1237829051015100`

## Correcao

### Arquivo: `src/lib/meta-config.ts`
Alterar a linha do `META_APP_ID` de:
```
export const META_APP_ID = import.meta.env.VITE_META_APP_ID || "1447135433693990";
```
Para:
```
export const META_APP_ID = import.meta.env.VITE_META_APP_ID || "1237829051015100";
```

### Arquivo: `src/lib/meta-config.ts` - Simplificar scopes
Como voce so precisa de **receber e enviar mensagens**, reduzir os scopes para o minimo:

- **Instagram:** `instagram_business_basic,instagram_business_manage_messages`
- **Facebook:** `pages_messaging,pages_manage_metadata`

Remover `instagram_business_manage_comments` e `instagram_business_content_publish` que nao sao necessarios.

## Resultado
Apos essa correcao, ao clicar "Conectar" no Instagram ou Facebook, o popup do Meta vai abrir corretamente em vez de mostrar "ID do app invalido".

