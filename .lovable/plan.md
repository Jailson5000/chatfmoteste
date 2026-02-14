
# Analise Completa: WhatsApp Cloud - Mensagens Nao Entregues

## Diagnostico

Apos analise dos logs, codigo e documentacao da Meta, o resultado e claro:

**O codigo do sistema esta funcionando corretamente.** A API da Meta retorna `200 OK` com `message_status: "accepted"` e um `wamid` valido. O problema e uma limitacao do numero de teste.

## Evidencias dos Logs

```text
21:16:11 - Message sent: graphMessageId = "wamid.HBgMNTU2Mzk5Mjk5MDg5..."
21:10:39 - send_test_message result: 200 {"message_status":"accepted"}
```

Nenhum erro nos logs. A Meta **aceitou** as mensagens.

## Causa Raiz: Limitacao do Numero de Teste da Meta

Segundo a documentacao oficial da Meta e multiplos relatos na comunidade de desenvolvedores:

1. **Numero de teste e dos EUA (+1 555 159 0933)**: Numeros de teste fornecidos pela Meta sao americanos e tem restricoes severas de envio para numeros internacionais.

2. **"Accepted" nao significa "Delivered"**: A resposta `200` com `message_status: "accepted"` indica apenas que a Meta recebeu e validou o request. A entrega real e comunicada via webhooks de `statuses` -- que nosso sistema ainda nao processa.

3. **Limitacao geografica documentada**: Numeros de teste dos EUA frequentemente **nao conseguem entregar mensagens para numeros fora dos EUA** (como os numeros brasileiros +55).

4. **Limite de 5 destinatarios**: O numero de teste so pode enviar para ate 5 numeros cadastrados na lista de teste.

## Solucao Real

Para enviar e receber mensagens de verdade, voce precisa **registrar um numero de telefone proprio** (brasileiro) no WhatsApp Business API, substituindo o numero de teste. Isso e feito no painel da Meta em:

**WhatsApp > API Setup > Etapa 1 > Adicionar numero de telefone**

## Melhoria Tecnica Recomendada

Embora o envio funcione, ha uma melhoria que podemos fazer: **processar webhooks de status de entrega** (`delivered`, `read`, `failed`) para mostrar no sistema se a mensagem foi realmente entregue ou falhou.

### Alteracao: `supabase/functions/meta-webhook/index.ts`

Na funcao `processWhatsAppCloudEntry`, atualmente o codigo ignora eventos que nao contem `value.messages`. Porem, eventos de `statuses` (delivery receipts) tambem chegam pelo mesmo webhook e contem informacoes de entrega.

A melhoria consiste em:

1. **Detectar eventos de `statuses`** no payload do webhook
2. **Logar o status de entrega** para diagnostico futuro (delivered, read, failed)
3. **Atualizar a mensagem no banco** com o status de entrega quando disponivel

```typescript
// Apos processar messages, verificar se ha statuses
if (value.statuses?.length) {
  for (const status of value.statuses) {
    const { id: wamid, status: deliveryStatus, errors } = status;
    console.log(`[meta-webhook] Delivery status: ${deliveryStatus} for ${wamid}`);
    
    if (deliveryStatus === "failed" && errors?.length) {
      console.error("[meta-webhook] Delivery failed:", errors);
    }
    
    // Atualizar external_id com status na tabela messages (opcional)
    // Isso permitira mostrar indicadores de "entregue" / "lido" no chat
  }
}
```

### Deploy
- Redeployer `meta-webhook`

## Resumo

| Item | Status |
|------|--------|
| Codigo de envio (`sendWhatsAppCloudMessage`) | Correto, sem alteracao |
| API retorna sucesso | Sim (200 + wamid) |
| Mensagem chega no celular | Nao - limitacao do numero de teste |
| Solucao definitiva | Registrar numero brasileiro proprio |
| Melhoria tecnica | Processar webhooks de delivery status |

## O que NAO muda
- Facebook (funcionando)
- Instagram (funcionando)
- Logica de envio do `meta-api`
