

# Corrigir formato do body no global_configure_webhook

## Problema

O botao "Reaplicar Webhooks" esta enviando o body correto (com `instanceName`), mas a Evolution API do servidor global rejeita o formato. O erro:

```text
instance requires property "webhook"
```

A Evolution API neste servidor espera o corpo encapsulado numa chave `webhook`:

```json
{ "webhook": { "enabled": true, "url": "...", "events": [...] } }
```

Mas o codigo atual envia sem wrapper:

```json
{ "enabled": true, "url": "...", "events": [...] }
```

## Sobre desligar manualmente

Sim, funciona! Ao desconectar e reconectar uma instancia, o `buildWebhookConfig` e chamado com a API key da propria instancia, e a nova configuracao (sem `MESSAGES_UPDATE`) e aplicada automaticamente.

## Correcao

### Arquivo: `supabase/functions/evolution-api/index.ts`

Na action `global_configure_webhook` (linha 3203), alterar:

```text
body: JSON.stringify(buildWebhookConfig(WEBHOOK_URL)),
```

para:

```text
body: JSON.stringify({ webhook: buildWebhookConfig(WEBHOOK_URL) }),
```

Isso encapsula a configuracao na chave `webhook` que o servidor espera.

Como fallback extra, se a chamada com wrapper falhar com 400, tentar novamente sem wrapper (para compatibilidade com versoes diferentes da Evolution API).

## Resumo

| Item | Detalhe |
|---|---|
| Arquivo alterado | 1 (evolution-api/index.ts) |
| Causa raiz | Formato do body incompativel com versao do servidor Evolution |
| Risco | Nenhum -- adiciona wrapper e fallback |
| Instancias novas | Ja virao sem MESSAGES_UPDATE automaticamente |

