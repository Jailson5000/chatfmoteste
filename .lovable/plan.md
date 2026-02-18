

# Corrigir Instagram - Escopos OAuth Invalidos

## Problema

Ao clicar em "Conectar" no Instagram, o popup do Facebook exibe:

> Invalid Scopes: instagram_business_basic, instagram_business_manage_messages

Esses escopos pertencem a Instagram Business Login API (que usa `instagram.com/oauth/authorize`) e nao sao validos no dialogo OAuth do Facebook (`facebook.com/dialog/oauth`), que e o endpoint utilizado atualmente.

Como resultado, a Meta rejeita a solicitacao, nao retorna nenhum codigo de autorizacao, e o sistema exibe "Codigo de autorizacao nao encontrado".

## Correcao

### `src/lib/meta-config.ts`

Remover os escopos invalidos da configuracao do Instagram:

**Antes:**
```
instagram: "pages_show_list,instagram_basic,instagram_manage_messages,instagram_business_basic,instagram_business_manage_messages"
```

**Depois:**
```
instagram: "pages_show_list,instagram_basic,instagram_manage_messages"
```

Os escopos restantes (`pages_show_list`, `instagram_basic`, `instagram_manage_messages`) sao suficientes para:
- Listar paginas do Facebook vinculadas (`pages_show_list`)
- Acessar dados basicos do Instagram (`instagram_basic`)
- Enviar e receber mensagens do Instagram Direct (`instagram_manage_messages`)

## Impacto

- Apenas 1 linha alterada em 1 arquivo
- Nenhuma mudanca no backend (edge functions)
- O fluxo OAuth voltara a funcionar normalmente
