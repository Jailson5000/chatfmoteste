

## Corrigir Ciclo de Desconexao: Webhook Desfaz o Trabalho do Auto-Reconnect

### Diagnostico com Provas dos Logs

**O fix do auto-reconnect funcionou.** Nos logs de 14:55, o cron usou `fetchInstances` e sincronizou 2 instancias como `connected` corretamente:
```
14:55:08 fetchInstances state for inst_d92ekkep: open (connected: true)
14:55:08 Instance inst_d92ekkep is actually connected - updating DB only
14:55:06 fetchInstances state for inst_0gkejsc5: open (connected: true)
14:55:06 Instance inst_0gkejsc5 is actually connected - updating DB only
Summary: 2 successful (2 status syncs)
```

**Porem, 3 minutos depois (14:58), o WEBHOOK desfez tudo.** A Evolution API enviou eventos `connecting` (comportamento normal do Baileys para keep-alive) e nosso guard de 60 segundos permitiu o downgrade:
```
14:58:34 Downgrading to connecting - stale connection detected (180s since last update)
14:58:34 Updated instance status to connecting
```

**Resultado no banco agora:**
- inst_ea9bfhx3: `connected` (guard de 0s funcionou)
- inst_464pnw5n: `connected` (guard de 0s funcionou)
- inst_d92ekkep: `connected` (guard de 0s funcionou)
- inst_l26f156k: `connecting` (webhook desfez)
- inst_0gkejsc5: `connecting` (webhook desfez)
- inst_5fjooku6: `connecting` (webhook desfez)
- inst_7sw6k99c: `awaiting_qr` (webhook preservou status errado)

### Causa Raiz

O guard de 60 segundos esta ERRADO. A Evolution API v2.3.7 (Baileys) envia eventos `connecting` periodicamente como parte do keep-alive interno, mesmo para instancias perfeitamente conectadas. Apos 60 segundos, nosso webhook interpreta esses eventos como "desconexao real" e desfaz o status `connected`.

O unico evento que indica desconexao real e `state: close`. O estado `connecting` e transitorio e NUNCA deve sobrescrever `connected`.

### Sobre Versao da Evolution API

A pesquisa na documentacao e GitHub mostra:
- v2.3.7 corrigiu bugs criticos: "incoming message events not working after reconnection" e "waiting for message state after reconnection"
- v2.3.6 tem esses bugs, o que causaria problemas piores
- v2.3.7 tem regressao em botoes interativos (issue #2390), mas nao afeta mensagens de texto
- O problema atual NAO e da versao da Evolution - e da nossa logica de webhook

**Recomendacao: Manter v2.3.7** e corrigir apenas a logica do webhook.

### Solucao

**Arquivo: `supabase/functions/evolution-webhook/index.ts`**

Remover completamente o guard de 60 segundos. Quando o webhook receber `connecting` e o banco mostrar `connected`, SEMPRE ignorar (apenas atualizar timestamps). Somente o evento `close` pode rebaixar de `connected` para `disconnected`.

Mudanca nas linhas 4288-4314:

```text
// ANTES (bugado - guard de 60s permite downgrade incorreto):
} else if (instance.status === 'connected') {
  const elapsedSeconds = (now - lastUpdate) / 1000;
  if (elapsedSeconds < 60) {
    // ignora
  } else {
    dbStatus = 'connecting'; // ERRADO - desfaz status real
  }
}

// DEPOIS (correto - NUNCA rebaixar connected via connecting):
} else if (instance.status === 'connected') {
  logDebug('CONNECTION', 'Ignoring connecting event - instance is connected. Only close events can downgrade.', { requestId });
  await supabaseClient.from('whatsapp_instances')
    .update({ updated_at: new Date().toISOString(), last_webhook_event: 'connection.update' })
    .eq('id', instance.id);
  return new Response(JSON.stringify({ status: "ignored", reason: "connected_instance" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

Tambem na linha 4429-4435, adicionar de volta o guard `.neq('status', 'connected')` para updates do tipo `connecting`, como protecao contra race conditions:

```text
// Quando dbStatus e 'connecting', nao sobrescrever se DB ja esta 'connected'
if (dbStatus === 'connecting') {
  updateQuery = updateQuery.neq('status', 'connected');
}
```

### Logica Final de Transicao de Status

```text
Evento webhook    | Status DB atual  | Acao
------------------|------------------|---------------------------
state: open       | qualquer         | -> connected (sempre)
state: close      | qualquer         | -> disconnected (sempre)
state: connecting | connected        | IGNORAR (keep-alive normal)
state: connecting | connecting       | Manter connecting
state: connecting | disconnected     | -> connecting
state: connecting | awaiting_qr     | Preservar awaiting_qr
state: qr         | qualquer         | -> awaiting_qr
```

### Impacto

| Antes | Depois |
|---|---|
| Webhook desfaz connected apos 60s | connected so muda com evento `close` ou `open` |
| Auto-reconnect fixa, webhook estraga | Ambos trabalham em harmonia |
| Instancias "flickering" entre connected/connecting | Status estavel |
| Mensagens nao fluem (sessao instavel) | Sessoes permanecem estaveis, mensagens fluem |

### Arquivo editado

- `supabase/functions/evolution-webhook/index.ts`

