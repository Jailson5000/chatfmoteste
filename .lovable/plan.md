

# Fix: Remover Auto-Sync que causa timeout no webhook

## Problema identificado
O erro nao e da versao da Evolution API. O codigo de **AUTO-SYNC** adicionado na ultima alteracao esta causando timeouts:
- O webhook espera 10 segundos (`setTimeout(10000)`) e depois faz outra requisicao HTTP
- Isso excede o tempo limite de execucao da Edge Function
- Resultado: erro "The signal has been aborted" e sobrecarga no VPS com multiplas requisicoes pendentes

## Solucao
Remover a funcao `scheduleStatusVerification` e sua chamada do webhook. Em vez disso, resolver o problema de sync de forma mais segura usando a Edge Function `auto-reconnect-instances` que ja roda como cron job separado.

### Mudancas

**Arquivo: `supabase/functions/evolution-webhook/index.ts`**
1. Remover a funcao `scheduleStatusVerification` (linhas 1185-1285)
2. Remover a chamada fire-and-forget no bloco `connection.update` (linhas 4396-4410)
3. Manter o comportamento original: preservar `awaiting_qr` quando receber `connecting`, sem tentar verificar em background

**Arquivo: `supabase/functions/auto-reconnect-instances/index.ts`**
1. Adicionar logica para detectar instancias que estao em `awaiting_qr` ha mais de 30 segundos
2. Para essas instancias, consultar a Evolution API e, se estiverem realmente conectadas (`open`), atualizar o banco para `connected`
3. Isso roda como cron job independente, sem risco de timeout no webhook

## Por que isso resolve
- O webhook volta a ser leve e rapido (sem delays internos)
- A verificacao de status acontece no cron job que tem tempo de execucao proprio
- O VPS nao recebe rajadas de requisicoes extras durante eventos de reconexao

## Sobre a versao da Evolution API
Nao e necessario mudar a versao (v2.2.3 esta correta). O problema era exclusivamente o codigo de auto-sync dentro do webhook.

