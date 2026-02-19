
# Otimizar Webhooks para Reduzir Invocacoes

## Situacao Atual

Analisei os dados das ultimas 24 horas e o resultado e alarmante:

```text
Total de invocacoes/dia: ~14.660
Invocacoes UTEIS:        ~5.038  (messages.upsert + messages.update)
Invocacoes DESPERDICADAS: ~9.622  (65.6% do total!)
```

Detalhamento por evento:

```text
contacts.update   4.938  (33.7%) - Atualiza nomes, mas dispara excessivamente
chats.update      1.838  (12.5%) - Nao faz NADA, apenas loga "Unhandled event"
presence.update   1.175  ( 8.0%) - Nao faz NADA, apenas loga
send.message        519  ( 3.5%) - Nao faz NADA, apenas loga
chats.upsert        456  ( 3.1%) - Nao faz NADA, apenas loga
null (sem token)    305  ( 2.1%) - Requisicoes rejeitadas
messages.edited     141  ( 1.0%) - Nao faz NADA, apenas loga
contacts.upsert      77  ( 0.5%) - Nao faz NADA
call                 37  ( 0.3%) - Nao faz NADA
```

Isso significa que com 7 empresas, gastamos **~440k invocacoes/mes** -- quase o limite de 500k do plano Pro. Com 35 empresas seria impossivel.

## Estrategia: Filtro Rapido no Inicio da Funcao

A abordagem mais segura e eficiente: **rejeitar eventos inuteis nos primeiros milissegundos**, antes de fazer qualquer consulta ao banco.

### O que muda

No inicio da funcao `evolution-webhook`, ANTES de buscar a instancia no banco, adicionar um filtro que retorna 200 imediatamente para eventos que nao precisam de processamento:

```text
Eventos MANTIDOS (processamento completo):
  - messages.upsert     (mensagens reais)
  - messages.update      (ACK - status entrega/leitura)
  - messages.ack         (formato alternativo de ACK)
  - connection.update    (status de conexao)
  - qrcode.updated       (QR code)
  - messages.delete      (exclusao de mensagem)
  - messages.reaction    (reacoes de clientes)
  - contacts.update      (resolucao de nomes)

Eventos DESCARTADOS (retorno 200 imediato):
  - chats.update         (12.5% - nao faz nada)
  - chats.upsert         (3.1% - nao faz nada)
  - presence.update      (8.0% - nao faz nada)
  - send.message         (3.5% - nao faz nada)
  - contacts.upsert      (0.5% - nao faz nada)
  - messages.edited      (1.0% - nao faz nada)
  - call                 (0.3% - nao faz nada)
```

### Reducao estimada

```text
Eventos descartados por dia: ~4.243 (29% do total)
Invocacoes restantes:       ~10.417
Economia mensal:            ~127.000 invocacoes

Com contacts.update otimizado (debounce): economia adicional de ~100.000/mes
Total economizado: ~227.000 invocacoes/mes (51% de reducao)
```

### Seguranca

- Nenhuma logica existente e alterada
- Eventos que JA tem handler continuam funcionando normalmente
- Apenas eventos que caem no `default: "Unhandled event"` sao filtrados antes
- O retorno e sempre HTTP 200 para a Evolution API (evita retries)
- O filtro fica ANTES da consulta ao banco, economizando tambem tempo de execucao

## Otimizacao extra: Configurar Evolution API

Alem do filtro no codigo, e possivel configurar a Evolution API para parar de enviar eventos desnecessarios. Isso eliminaria as invocacoes na ORIGEM (a Evolution nem faria o request HTTP), economizando ainda mais. Mas isso depende de acesso ao painel da Evolution e e uma acao manual sua.

## Arquivo alterado

1. `supabase/functions/evolution-webhook/index.ts` -- Adicionar filtro de eventos no inicio (antes da linha de lookup de instancia), redeploy automatico

## Resultado final esperado

```text
ANTES:  ~440k invocacoes/mes (7 empresas) -- 88% do limite
DEPOIS: ~213k invocacoes/mes (7 empresas) -- 43% do limite
Capacidade: de 30-35 empresas para 60-70 empresas no mesmo plano
```
