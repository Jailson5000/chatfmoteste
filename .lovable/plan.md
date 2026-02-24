

# Configurar Webhook uazapi

## O que precisa ser feito

### 1. Criar o secret UAZAPI_WEBHOOK_TOKEN

Definir um token seguro no backend que sera usado para validar as requisicoes vindas do uazapi. Voce escolhe o valor (ex: uma string aleatoria longa).

### 2. Corrigir bug no uazapi-webhook (import esm.sh)

O arquivo `supabase/functions/uazapi-webhook/index.ts` usa `import { createClient } from "https://esm.sh/@supabase/supabase-js@2"` -- o mesmo bug critico que ja corrigimos em 3 outras funcoes. Trocar para `npm:@supabase/supabase-js@2`.

### 3. Deploy da funcao corrigida

Redeployar a edge function `uazapi-webhook` apos a correcao.

### 4. Configuracao manual no painel do uazapi (por voce)

Apos os passos acima, voce deve ir ao painel do uazapi (a tela da imagem) e configurar:

| Campo | Valor |
|---|---|
| Habilitado | Ativar (toggle ON) |
| Metodo | POST |
| URL | URL da funcao + `?token=SEU_TOKEN` |
| addUrlEvents | ON |
| addUrlTypesMessages | ON |
| Escutar eventos | `messages` |
| Excluir eventos | `wasSentByApi`, `isGroupYes` |

O token na URL deve ser EXATAMENTE o mesmo valor definido no secret `UAZAPI_WEBHOOK_TOKEN`.

## Detalhes Tecnicos

### Arquivo: `supabase/functions/uazapi-webhook/index.ts`

Linha 2 -- trocar:
```
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```
por:
```
import { createClient } from "npm:@supabase/supabase-js@2";
```

### Secret a criar

- Nome: `UAZAPI_WEBHOOK_TOKEN`
- Valor: token que voce escolher (sera solicitado durante a implementacao)

Nenhuma migracao SQL necessaria.

