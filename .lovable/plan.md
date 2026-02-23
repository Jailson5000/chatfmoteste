
# Analise Completa: Conexao WhatsApp - Problemas e Correcoes

## Situacao Atual do Banco de Dados

| Instancia | Status | awaiting_qr | Ultimo Webhook | Problema |
|-----------|--------|-------------|----------------|----------|
| inst_l26f156k | awaiting_qr | true | connection.update | Loop connecting - nunca recebe QR |
| inst_0gkejsc5 | connecting | false | connection.update | Estava conectado, agora preso em connecting |
| inst_d92ekkep | awaiting_qr | true | connection.update | Loop connecting |
| inst_464pnw5n | awaiting_qr | true | connection.update | Loop connecting |
| inst_ea9bfhx3 | awaiting_qr | false | connection.update | awaiting_qr=false mas status=awaiting_qr |
| inst_5fjooku6 | awaiting_qr | false | connection.update | Era conectado, regrediu |
| inst_s10r2qh8 | awaiting_qr | true | connection.update | Loop connecting |

## Problemas Identificados

### 1. Instancia fantasma `inst_a7n22orl` gerando erro em loop (CRITICO)
A instancia `inst_a7n22orl` foi deletada do banco de dados, mas ainda existe na Evolution API e continua enviando webhooks `connection.update`. Cada webhook gera um erro `Instance not found (PGRST116)` nos logs. Isso polui os logs e consome invocacoes desnecessariamente (dezenas por minuto).

**Correcao:** A instancia ja foi deletada da Evolution API via VPS, mas os webhooks continuam chegando porque a Evolution API ainda tenta reconectar a sessao residual. Precisamos garantir que o webhook retorne 200 silenciosamente para instancias nao encontradas (ja faz isso), mas tambem adicionar um endpoint para limpar instancias orfas na Evolution API.

### 2. Post-Level1 retorna "connecting" e trava (CRITICO)
Apos o Level 1 de recovery, se `connectionState` retorna `"connecting"`, o codigo na **linha 1275-1286** retorna imediatamente com `retryable: true` - mas isso cria um loop infinito: o usuario clica "Gerar QR" -> Level 1 roda -> termina em "connecting" -> retorna "tente em 10s" -> usuario clica de novo -> mesmo ciclo.

O fix anterior (linha 1196-1218) so trata o "connecting" ANTES do Level 1. Mas o "connecting" APOS o Level 1 tambem precisa ser tratado, forcando o Level 2 (logout + connect).

**Correcao:** Remover o retorno imediato pos-Level1 quando `awaiting_qr=true`. Em vez de retornar, deixar o fluxo continuar para o Level 2 (logout + connect).

### 3. Inconsistencia `awaiting_qr` vs `status` (MEDIO)
`inst_ea9bfhx3` tem `status=awaiting_qr` mas `awaiting_qr=false`. Isso significa que o fix da linha 1196-1218 nao vai funcionar para ela - vai retornar "Aguarde alguns segundos..." em vez de forcar recovery.
`inst_5fjooku6` e `inst_0gkejsc5` tinham sido conectados antes mas agora estao `awaiting_qr` ou `connecting`.

**Correcao:** Verificar AMBOS `awaiting_qr=true` OU `status='awaiting_qr'` na checagem pre-Level1 (linha 1204).

### 4. Webhooks duplicados sem token (BAIXO)
A Evolution API envia webhooks duplicados - um com token (via query string) e outro sem. Os sem token sao corretamente rejeitados com 401, mas isso gera ruido nos logs. Isso e comportamento conhecido e documentado.

**Nenhuma acao necessaria** - ja funciona corretamente.

### 5. Nenhum evento `qrcode.updated` nos logs (CRITICO)
Nenhuma instancia esta recebendo eventos `qrcode.updated`, apenas `connection.update` com `state: connecting`. Isso confirma que a Evolution API esta em loop de reconexao sem nunca gerar QR.

**Correcao:** O Level 2 (logout + connect) e a unica saida. O fix precisa garantir que o Level 2 seja alcancado mesmo quando o Level 1 termina em "connecting".

## Mudancas Tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

#### Correcao 1: Checagem pre-Level1 mais abrangente (linhas ~1196-1218)
Mudar a condicao `dbInstance?.awaiting_qr` para tambem verificar `status === 'awaiting_qr'`:

```typescript
if (currentState === "connecting") {
  const { data: dbInstance } = await supabaseClient
    .from("whatsapp_instances")
    .select("awaiting_qr, status")
    .eq("id", body.instanceId)
    .single();

  const shouldForceRecovery = dbInstance?.awaiting_qr === true || dbInstance?.status === 'awaiting_qr';
  
  if (shouldForceRecovery) {
    console.log(`[Evolution API] Instance "connecting" + awaiting/status=awaiting_qr. Proceeding to Level 1 recovery.`);
    // Continua para Level 1
  } else {
    // Retorna retryable
  }
}
```

#### Correcao 2: Pos-Level1 nao deve travar em "connecting" (linhas ~1275-1286)
Quando pos-Level1 detecta `connecting` e a instancia tem `awaiting_qr=true`, em vez de retornar imediatamente, deve continuar para o Level 2:

```typescript
if (postL1RealState === "connecting") {
  // Verificar se deve forcar Level 2
  const { data: postL1Db } = await supabaseClient
    .from("whatsapp_instances")
    .select("awaiting_qr, status")
    .eq("id", body.instanceId)
    .single();
  
  const shouldForceLevel2 = postL1Db?.awaiting_qr === true || postL1Db?.status === 'awaiting_qr';
  
  if (shouldForceLevel2) {
    console.log(`[Evolution API] Still "connecting" after Level 1 + awaiting_qr=true. Forcing Level 2.`);
    // NAO retorna - continua para Level 2
  } else {
    console.log(`[Evolution API] Still "connecting" after Level 1 - returning retryable`);
    return new Response(/* retryable */);
  }
}
```

### Deploy
Redeployar a edge function `evolution-api` apos as mudancas.

## Acoes Manuais Recomendadas (VPS)
Apos o deploy, executar no VPS para sincronizar estado:

```bash
# Verificar quais instancias realmente existem na Evolution API
curl -s "https://evo.fmoadv.com.br/instance/fetchInstances" \
  -H "apikey: a3c56030f89efe1e5b4c033308c7e3c8f72d7492ac8bb46947be28df2e06ffed" | jq '.[].instance.instanceName'
```

Isso vai mostrar quais instancias a Evolution API ainda conhece, permitindo identificar se alguma foi recriada automaticamente apos a exclusao.

## Resultado Esperado
1. Ao clicar "Gerar QR Code" em qualquer instancia, o sistema vai forcar logout + reconnect (Level 2) em vez de ficar preso em "connecting"
2. Instancias com `status=awaiting_qr` mas `awaiting_qr=false` serao tratadas corretamente
3. Logs mais limpos (instancias fantasma ja foram removidas da Evolution API)
