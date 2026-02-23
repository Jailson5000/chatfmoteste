
## Corrigir Instancias Conectadas que Nao Enviam/Recebem Mensagens

### Diagnostico Completo

Analisando os logs, banco de dados e codigo, identifiquei 3 problemas interligados:

**Problema 1: Guard excessivo no webhook mascara desconexoes reais**

No `evolution-webhook`, linhas 4288-4296, quando o banco mostra uma instancia como `connected` e a Evolution API envia um evento `connecting`, o webhook faz um `return` imediato sem processar nada. Isso foi adicionado para evitar "flickering" na UI, mas tem um efeito colateral grave:

- Quando a sessao WhatsApp cai e a Evolution API tenta reconectar, ela envia eventos `connecting`
- Nosso webhook ignora esses eventos porque o banco diz `connected`
- O banco fica mostrando `connected` para uma instancia que NAO esta conectada
- Nenhuma mensagem chega (webhook so recebe `connection.update`, zero `messages.upsert`)
- Ao tentar enviar, falha com "Connection Closed"

Os logs confirmam: TODAS as instancias estao recebendo apenas `connection.update` com `state: connecting`, e o webhook diz "Ignoring connecting state - instance already connected".

**Problema 2: Mensagem do usuario e destruida no erro**

Quando o envio falha, o conteudo original da mensagem e substituido por:
```
"Conexao WhatsApp perdida. Reconectando automaticamente...: <mensagem original>"
```
Isso sobrescreve o campo `content` da mensagem, destruindo o texto original do usuario na interface.

**Problema 3: Retry de 3s nao e suficiente quando a instancia esta genuinamente desconectada**

O retry com delay de 3 segundos funciona para erros transientes rapidos, mas quando a instancia perdeu a sessao WhatsApp, 3 segundos nao sao suficientes para reconectar.

### Solucao

**Arquivo 1: `supabase/functions/evolution-webhook/index.ts`**

Substituir o guard nas linhas 4288-4296 por uma logica baseada em tempo. Em vez de ignorar completamente o `connecting` quando o banco diz `connected`, verificar ha quanto tempo a instancia esta `connected`. Se a ultima atualizacao do status foi ha mais de 60 segundos, permitir a transicao para `connecting` (desconexao real). Se foi ha menos de 60 segundos, manter o guard (reconexao rapida normal da Evolution API).

```text
// ANTES (bugado - mascara desconexoes reais):
} else if (instance.status === 'connected') {
  logDebug('CONNECTION', 'Ignoring connecting state...');
  return new Response(...); // RETURN EARLY - nunca processa
}

// DEPOIS (permite detectar desconexoes reais):
} else if (instance.status === 'connected') {
  const lastUpdate = new Date(instance.updated_at).getTime();
  const now = Date.now();
  const elapsedSeconds = (now - lastUpdate) / 1000;

  if (elapsedSeconds < 60) {
    // Reconexao rapida normal - ignorar para evitar flickering
    logDebug('CONNECTION', 'Ignoring connecting (recent connection)');
    // Atualizar apenas last_webhook_event e updated_at, sem mudar status
    await supabaseClient.from('whatsapp_instances')
      .update({ updated_at: new Date().toISOString(), last_webhook_event: 'connection.update' })
      .eq('id', instance.id);
    return new Response(...);
  } else {
    // Instancia "connected" ha mais de 60s mas recebendo connecting
    // = desconexao real que nao gerou evento "close"
    dbStatus = 'connecting';
    logDebug('CONNECTION', 'Downgrading to connecting (stale connection)');
  }
}
```

Tambem remover o guard redundante `.neq('status', 'connected')` nas linhas 4419-4421, pois a logica acima ja controla quando permitir ou nao a transicao.

**Arquivo 2: `supabase/functions/evolution-api/index.ts`**

Correcao 1 - Nao destruir o conteudo da mensagem no erro (linhas ~2096-2102):

```text
// ANTES:
.update({ 
  status: "failed",
  content: `[erro]: ${body.message}`,  // DESTROI o conteudo original
})

// DEPOIS:
.update({ 
  status: "failed",
  // Manter content original, usuario vera o status "failed" na UI
})
```

Mesma correcao no catch generico (linhas ~2127-2133).

Correcao 2 - Quando retry falha e a instancia esta genuinamente desconectada, marcar como `disconnected` (nao `connecting`), para que o auto-reconnect cron trate adequadamente:

```text
// ANTES (linhas ~2071-2077):
.update({ status: 'connecting' })

// DEPOIS:
.update({ status: 'disconnected', disconnected_since: new Date().toISOString() })
```

### Resumo das Mudancas

| Problema | Antes | Depois |
|---|---|---|
| Guard no webhook | Ignora TODOS os `connecting` quando DB=connected | Ignora apenas se connected < 60s (normal flickering) |
| Conteudo da mensagem | Sobrescrito com erro | Mantido original, apenas status=failed |
| Guard .neq no webhook | Bloqueia DB update connected->connecting | Removido (logica de tempo ja controla) |
| Status no send failure | `connecting` | `disconnected` (permite auto-reconnect) |

### Impacto

- Instancias que perderam a conexao serao detectadas em ate 60 segundos
- O status no banco refletira o estado real da Evolution API
- Mensagens falhadas manterao o conteudo original visivel na interface
- O cron auto-reconnect tratara instancias desconectadas corretamente
- O flickering rapido durante reconexoes normais continua bloqueado (threshold de 60s)

### Arquivos editados

- `supabase/functions/evolution-webhook/index.ts`
- `supabase/functions/evolution-api/index.ts`
