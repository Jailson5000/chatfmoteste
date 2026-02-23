
# Corrigir QR Code preso em "connecting" apos limpeza de sessoes

## Problema
Apos limpar os arquivos de sessao no VPS, todas as instancias ficaram no estado "connecting" na Evolution API. Quando o usuario tenta gerar um QR Code, a edge function detecta `connectionState === "connecting"` e retorna imediatamente com a mensagem "WhatsApp esta inicializando a conexao. Aguarde alguns segundos..." sem nunca gerar o QR.

Isso cria um loop infinito: a instancia nunca sai de "connecting" porque nao tem sessao valida, e o sistema nunca forca a geracao de um novo QR.

## Solucao
Modificar a logica na edge function `evolution-api` para que, quando o estado for "connecting" e a instancia estiver com `awaiting_qr: true` no banco, o fluxo **nao retorne imediatamente** e sim prossiga para o Level 1 de recuperacao (logout + reconnect), que forcara a geracao de um novo QR Code.

## Mudancas Tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

**Linhas 1196-1208** - Remover o retorno imediato para "connecting" quando `awaiting_qr` esta ativo:

Antes:
```typescript
if (currentState === "connecting") {
  console.log(`[Evolution API] Instance is "connecting" - Baileys still initializing. Returning retryable.`);
  return new Response(
    JSON.stringify({
      success: false,
      error: "WhatsApp esta inicializando a conexao...",
      retryable: true,
      connectionState: "connecting",
    }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}
```

Depois:
```typescript
if (currentState === "connecting") {
  // Verificar se a instancia esta aguardando QR - se sim, prosseguir para recovery
  const { data: dbInstance } = await supabaseClient
    .from("whatsapp_instances")
    .select("awaiting_qr")
    .eq("id", body.instanceId)
    .single();

  if (dbInstance?.awaiting_qr) {
    console.log(`[Evolution API] Instance is "connecting" + awaiting_qr=true. Proceeding to Level 1 recovery to force QR generation.`);
    // Nao retorna - continua para o Level 1 recovery abaixo
  } else {
    console.log(`[Evolution API] Instance is "connecting" - Baileys still initializing. Returning retryable.`);
    return new Response(
      JSON.stringify({
        success: false,
        error: "WhatsApp esta inicializando a conexao. Aguarde alguns segundos...",
        retryable: true,
        connectionState: "connecting",
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}
```

### Deploy
Redeployar a edge function `evolution-api` apos a mudanca.

## Resultado Esperado
Ao clicar em "Gerar QR Code", o sistema vai forcar um logout + reconnect na instancia, gerando um novo QR Code limpo em vez de ficar preso na mensagem de "inicializando".
