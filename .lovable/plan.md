

# Configurar Eventos na Evolution API -- Manual + Automatizado

## Sim, funciona! Mas com cuidados.

Entrar instancia por instancia no painel da Evolution (como voce mostrou no screenshot) e desligar os eventos desnecessarios **funciona perfeitamente** e e a forma mais imediata de resolver.

## O que deixar LIGADO (ON) em cada instancia

| Evento | Status | Motivo |
|--------|--------|--------|
| CONNECTION_UPDATE | ON | Detecta conexao/desconexao |
| MESSAGES_DELETE | ON | Exclusao de mensagens |
| MESSAGES_UPDATE | ON | ACK (entrega/leitura) |
| MESSAGES_UPSERT | ON | Mensagens recebidas (PRINCIPAL) |
| QRCODE_UPDATED | ON | QR Code para conectar |
| CONTACTS_UPDATE | ON | Resolucao de nomes de contatos |

## O que DESLIGAR (OFF) em cada instancia

| Evento | Status | Economia/dia |
|--------|--------|-------------|
| SEND_MESSAGE | OFF | ~519 invocacoes (esta ligado no seu screenshot!) |
| PRESENCE_UPDATE | OFF | ~1.175 invocacoes |
| CHATS_UPDATE | OFF | ~1.838 invocacoes (nao aparece no screenshot, talvez ja OFF) |
| CHATS_UPSERT | OFF | ~456 invocacoes |
| CONTACTS_UPSERT | OFF | ~77 invocacoes |
| MESSAGES_EDITED | OFF | ~141 invocacoes (pode nao aparecer dependendo da versao) |
| CALL | OFF | ~37 invocacoes |
| GROUP_UPDATE | OFF | Nao usado |
| GROUPS_UPSERT | OFF | Nao usado |
| LABELS_ASSOCIATION | OFF | Nao usado |
| LABELS_EDIT | OFF | Nao usado |
| LOGOUT_INSTANCE | OFF | Nao usado |
| MESSAGES_SET | OFF | Nao usado |
| REMOVE_INSTANCE | OFF | Nao usado |
| TYPEBOT_CHANGE_STATUS | OFF | Nao usado |
| TYPEBOT_START | OFF | Nao usado |

## No seu screenshot especifico

Voce ja tem quase tudo certo! Somente o **SEND_MESSAGE** (destacado em amarelo) precisa ser desligado. Ele gera ~519 invocacoes/dia inuteis porque nosso sistema nao processa esse evento.

## Complemento automatizado (no codigo)

Alem da acao manual, vou fazer duas mudanas no codigo para que **novas instancias** ja sejam criadas com a config correta e para que voce possa reaplicar em todas de uma vez sem entrar instancia por instancia:

### 1. Corrigir `buildWebhookConfig` no `evolution-api/index.ts`

A funcao que configura o webhook ao criar instancias atualmente inclui `SEND_MESSAGE` e nao inclui `CONTACTS_UPDATE`. Vou corrigir:

```text
ANTES:  CONNECTION_UPDATE, QRCODE_UPDATED, MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE, SEND_MESSAGE
DEPOIS: CONNECTION_UPDATE, QRCODE_UPDATED, MESSAGES_UPSERT, MESSAGES_UPDATE, MESSAGES_DELETE, CONTACTS_UPDATE
```

### 2. Adicionar acao `reapply_webhook` no `evolution-api/index.ts`

Nova acao que permite reaplicar a configuracao de webhook em uma instancia existente via API, sem precisar entrar no painel da Evolution. Util para:
- Aplicar a config atualizada em instancias antigas
- Corrigir instancias que tiveram a config sobreescrita

### 3. Adicionar acao `reapply_all_webhooks` (batch)

Busca todas as instancias ativas no banco e reaplica a config em cada uma de uma vez. Assim voce nao precisa entrar instancia por instancia.

## Seguranca

- O filtro rapido no `evolution-webhook` (ja implementado) continua ativo como rede de seguranca -- mesmo que a Evolution envie um evento inesperado, ele sera descartado nos primeiros milissegundos
- Novas instancias ja serao criadas com a lista correta
- A acao de reapply pode ser executada a qualquer momento sem afetar o funcionamento

## Resumo da acao

| Acao | Quem faz | Quando |
|------|----------|--------|
| Desligar SEND_MESSAGE nas instancias atuais | Voce (manual no painel) | Agora |
| Corrigir buildWebhookConfig | Codigo (automatico) | No deploy |
| Acao reapply_all_webhooks | Voce via painel admin ou API | Apos deploy, uma vez |

## Arquivo alterado

`supabase/functions/evolution-api/index.ts` -- Corrigir lista de eventos + adicionar acoes reapply_webhook e reapply_all_webhooks

