
## Corrigir Envio/Recebimento de Mensagens + Auto-Reconexao

### Diagnostico

A Evolution API na VPS (`evo.fmoadv.com.br`) esta com as sessoes WhatsApp (Baileys) quebradas:
- O endpoint `/instance/fetchInstances` reporta "open", mas os sockets reais estao fechados
- Ao tentar enviar mensagem, retorna `Error: Connection Closed`
- Nenhum evento `MESSAGES_UPSERT` esta chegando (sem recebimento)
- Dezenas de eventos `connection.update` com `state: connecting` estao sendo disparados

### Acao imediata necessaria (na VPS)

Voce precisa reiniciar a Evolution API ou forcar reconexao das instancias:

```bash
# Opcao 1: Reiniciar o container da Evolution
docker restart evolution-api

# Opcao 2: Forcar reconexao de cada instancia via API
curl -s -X DELETE "https://evo.fmoadv.com.br/instance/logout/inst_l26f156k" \
  -H "apikey: SUA_API_KEY"
# Depois reconectar:
curl -s -X GET "https://evo.fmoadv.com.br/instance/connect/inst_l26f156k" \
  -H "apikey: SUA_API_KEY"
```

### Melhoria no codigo (prevencao futura)

Alterar a Edge Function `evolution-api` para que, ao detectar o erro "Connection Closed" durante o envio:

1. Atualizar o status da instancia no banco para `disconnected`
2. Tentar automaticamente chamar o endpoint `/instance/restart` da Evolution API
3. Informar o usuario que a instancia perdeu conexao e precisa ser reconectada

### Detalhes tecnicos

**Arquivo**: `supabase/functions/evolution-api/index.ts`

Na secao de tratamento de erro do background send (linha ~1895-1927), adicionar deteccao do erro "Connection Closed":

```typescript
// Dentro do bloco de erro do background send
if (sendResponse.status === 400) {
  try {
    const errorJson = JSON.parse(errorText);
    const messages = errorJson?.response?.message || errorJson?.message || [];
    const isConnectionClosed = messages.some(
      (m: string) => typeof m === 'string' && m.includes('Connection Closed')
    );
    
    if (isConnectionClosed && instanceId) {
      // Atualizar status no banco para refletir a realidade
      await supabaseClient
        .from("whatsapp_instances")
        .update({ 
          status: 'disconnected', 
          disconnected_since: new Date().toISOString() 
        })
        .eq("id", instanceId);
      
      // Tentar reconexao automatica em background
      try {
        await fetch(
          `${apiUrl}/instance/restart/${instance.instance_name}`,
          { method: "PUT", headers: { apikey: instance.api_key || "" } }
        );
      } catch {}
      
      errorReason = "Conexao WhatsApp perdida. Reconectando automaticamente...";
    }
  } catch {}
}
```

**Tambem no webhook** (`evolution-webhook/index.ts`): Ajustar para aceitar o estado `close` vindo do webhook e marcar como `disconnected` no banco, mesmo que o status atual seja `connected`. Isso garante que desconexoes reais sejam registradas.

### Resultado esperado

1. **Imediato**: Apos reiniciar a Evolution API na VPS, as instancias devem reconectar e voltar a enviar/receber
2. **Futuro**: Se uma conexao cair novamente, o sistema detectara o erro "Connection Closed", atualizara o status no banco e tentara reconectar automaticamente
