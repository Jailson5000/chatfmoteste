

# Alterar nome "uazapiGO" para "MiauChat" no WhatsApp

## O que descobri

A API do uazapi aceita um parametro `systemName` no endpoint `POST /instance/init`. Quando nao informado, o padrao e `"uazapiGO"` — que e exatamente o que aparece na notificacao do WhatsApp.

## Correcao

**Arquivo: `supabase/functions/_shared/whatsapp-provider.ts`** (linha 780)

Adicionar `systemName: "MiauChat"` no body do `POST /instance/init`:

```
// Antes:
body: JSON.stringify({ name: config.instanceName })

// Depois:
body: JSON.stringify({ name: config.instanceName, systemName: "MiauChat" })
```

## Importante

Essa mudanca so afeta **novas instancias** criadas a partir desse momento. Para instancias ja existentes (como a da FMO), sera necessario:

1. Desconectar a instancia no painel
2. Deletar a instancia
3. Recriar a instancia (o sistema usara o novo `systemName`)

Ou, alternativamente, usar o endpoint `PUT /instance/update` da API uazapi diretamente no servidor para atualizar o `systemName` das instancias existentes sem precisar recriar.

