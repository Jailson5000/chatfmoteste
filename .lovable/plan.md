
# Fix: Auto-Sync de Status Apos Restart do Container

## Problema
Apos o `docker restart evolution`, as instancias que ja estavam conectadas (como `inst_5fjooku6`) enviaram eventos `connection.update` com `state: "connecting"` e depois `state: "open"`, mas o evento `open` foi perdido ou chegou antes do webhook estar pronto. Resultado: o banco ficou com `awaiting_qr` enquanto a Evolution mostra "Connected".

## Solucao Imediata
Clicar no botao **"Atualizar Todas"** na pagina `/global-admin/connections`. Isso ja existe e chama `refresh_status` para cada instancia, consultando a Evolution API diretamente e atualizando o banco.

## Solucao Automatica (Implementacao)
Adicionar logica no webhook para que, quando receber um evento `connecting` e a instancia tiver status `awaiting_qr` no banco, agende uma verificacao automatica apos 10 segundos. Isso captura instancias que reconectaram automaticamente mas cujo evento `open` foi perdido.

### Mudancas

**Arquivo: `supabase/functions/evolution-webhook/index.ts`**

No bloco `connection.update`, apos processar o estado `connecting` para instancias em `awaiting_qr` (linha ~4285-4287):

1. Adicionar uma chamada assincrona (fire-and-forget) que aguarda 10 segundos e depois faz um `fetchInstances` na Evolution API para verificar o estado real
2. Se o estado real for `open`, atualizar o banco para `connected` com as flags corretas (limpar `awaiting_qr`, `disconnected_since`, etc.)
3. Logar o resultado da verificacao para diagnostico

Isso resolve o caso em que:
- Container reinicia
- Instancia reconecta automaticamente (Baileys restabelece sessao)
- Evento `open` e perdido
- O webhook recebe `connecting` mas faz auto-verificacao em 10s

**Arquivo: `supabase/functions/evolution-webhook/index.ts`** (tambem)

Adicionar uma funcao helper `scheduleStatusVerification()` que:
- Aguarda 10 segundos (`await new Promise(resolve => setTimeout(resolve, 10000))`)
- Faz GET em `/instance/fetchInstances?instanceName=...`
- Se `connectionStatus === "open"`, atualiza o banco para `connected`
- Nao bloqueia a resposta do webhook (roda em background com `event.waitUntil` ou fire-and-forget)

### Detalhe Tecnico

```text
Fluxo atual:
  webhook recebe connecting -> preserva awaiting_qr -> fim

Fluxo novo:
  webhook recebe connecting -> preserva awaiting_qr -> dispara verificacao em 10s
  (10s depois) -> consulta Evolution API -> se open -> atualiza para connected
```

### Beneficio
- Zero intervencao manual apos restart do container
- Instancias que reconectaram sozinhas sao detectadas automaticamente
- Sem impacto em performance (apenas 1 request extra por instancia, apenas quando em awaiting_qr)
