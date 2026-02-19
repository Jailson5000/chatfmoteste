

# Corrigir Botao "Reaplicar Webhooks" (Bug Encontrado)

## O que aconteceu

O botao "Reaplicar Webhooks" **falhou em todas as instancias**. Confirmei nos logs que todas as 7 chamadas retornaram o erro:

```text
Error: instanceName is required
```

**Causa:** O frontend envia `instanceId` (o UUID do banco de dados), mas a Edge Function espera `instanceName` (o nome da instancia na Evolution API). Sao campos diferentes.

## Sobre novas instancias

**Sim** -- qualquer instancia nova criada ou reconectada ja vira automaticamente sem `MESSAGES_UPDATE`, porque o `buildWebhookConfig` ja foi atualizado. O problema e apenas com as instancias existentes que precisam ser atualizadas.

## Correcao

### Arquivo 1: `src/hooks/useGlobalAdminInstances.tsx`

Na mutation `reapplyAllWebhooks` (linha 474), trocar:

```text
instanceId: instance.id
```

por:

```text
instanceName: instance.instance_name
```

Isso envia o nome correto que a Evolution API espera (ex: `fmo-whatsapp`) em vez do UUID do banco.

### Arquivo 2: `supabase/functions/evolution-api/index.ts`

Adicionar fallback no `global_configure_webhook` (linha 3168) para que, se receber `instanceId` em vez de `instanceName`, ele busque o nome no banco automaticamente. Isso torna a acao mais robusta:

- Se `instanceName` estiver presente, usa direto
- Se so `instanceId` estiver presente, busca `instance_name` na tabela `whatsapp_instances`
- Se nenhum dos dois, retorna erro

## Resumo

| Item | Detalhe |
|---|---|
| Arquivos alterados | 2 |
| Causa raiz | Frontend enviava UUID, API esperava nome |
| Risco | Nenhum -- correcao cirurgica |
| Apos deploy | Clicar novamente em "Reaplicar Webhooks" |

