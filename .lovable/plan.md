

# QR Scan Mostra "Conectado" e Depois Reverte para "Desconectado"

## Diagnostico

O problema e uma **race condition no ciclo de polling** que causa reconexao acidental apos o QR ser escaneado.

### Sequencia do bug

```text
T=0.0s  pollOnce v1 inicia → agenda setTimeout(() => pollOnce(id), 3000)
T=0.5s  Usuario escaneia QR → uazapi envia webhook "connected"
T=0.6s  Realtime detecta → stopPolling() + setCurrentQRCode(null) + refetch()
        → UI mostra "Conectado" ✓
        → stopPolling() cancela o PROXIMO setTimeout agendado
        → MAS pollOnce v1 pode AINDA ESTAR executando (await pendente)

T=3.0s  setTimeout do T=0.0s JA FOI agendado antes do stopPolling
        → pollOnce executa novamente
        → currentQRCodeRef.current === null (foi limpo no T=0.6s!)
        → Entra na ramificacao "sem QR" → chama getQRCode.mutateAsync
        → getQRCode chama provider.connect() no uazapi
        → uazapi REINICIA a sessao → envia webhook "disconnected"
        → DB atualizado para "disconnected"
        → UI reverte para "Desconectado" ✗
```

### Causa raiz (2 falhas)

**Falha 1: `stopPolling()` nao impede polls em andamento.** `clearTimeout` cancela o proximo setTimeout agendado, mas se `pollOnce` esta no meio de um `await`, ele continua executando e agenda um NOVO setTimeout na linha 311 (sobrescrevendo o null do `pollIntervalRef`).

**Falha 2: `setCurrentQRCode(null)` ao detectar conexao cria armadilha.** Quando a conexao e detectada, o QR code e limpo. Se qualquer poll residual executa depois disso, ele ve `currentQRCodeRef.current === null` e chama `getQRCode` → `provider.connect()`, que REINICIA a sessao no uazapi, causando desconexao temporaria.

## Correcao

### Arquivo: `src/pages/Connections.tsx`

**Correcao 1: Adicionar flag `isPollingActiveRef` para controle absoluto do polling**

```typescript
const isPollingActiveRef = useRef(false);
```

- `startPolling` seta `isPollingActiveRef.current = true`
- `stopPolling` seta `isPollingActiveRef.current = false`
- `pollOnce` verifica `isPollingActiveRef.current` NO INICIO antes de qualquer acao e ANTES de agendar o proximo poll

Isso garante que nenhum poll residual (em andamento ou agendado) execute apos a conexao ser detectada.

**Correcao 2: Nao limpar `currentQRCode` durante deteccao de conexao no polling**

Atualmente, quando a conexao e detectada no `pollOnce` (linhas 250-260, 288-298) e no Realtime (linha 192), o codigo faz `setCurrentQRCode(null)` ANTES de parar o polling. Isso cria a armadilha onde polls residuais veem `null` e chamam `connect()`.

Mover `setCurrentQRCode(null)` para DENTRO do `setTimeout` que fecha o dialog (apos 1 segundo), garantindo que o QR permanece setado ate o polling estar completamente parado.

**Correcao 3: `handleCloseQRDialog` deve aguardar `getStatus` antes de `refetch`**

Atualmente:
```typescript
getStatus.mutateAsync(currentInstanceId).catch(() => {});
setCurrentInstanceId(null); // Limpa ANTES do getStatus terminar
refetch(); // Refetch ANTES do DB ser atualizado
```

Corrigir para:
```typescript
const instanceIdToCheck = currentInstanceId;
setCurrentInstanceId(null);
if (instanceIdToCheck) {
  try {
    await getStatus.mutateAsync(instanceIdToCheck);
  } catch {}
}
refetch();
```

## Mudancas especificas

| Local | Mudanca |
|---|---|
| `stopPolling` | Adicionar `isPollingActiveRef.current = false` |
| `startPolling` | Adicionar `isPollingActiveRef.current = true` |
| `pollOnce` (inicio) | Checar `if (!isPollingActiveRef.current) return;` |
| `pollOnce` (antes do setTimeout) | Checar `if (!isPollingActiveRef.current) return;` |
| `pollOnce` (deteccao de conexao) | Mover `setCurrentQRCode(null)` para dentro do setTimeout de 1s |
| Realtime handler | Mover `setCurrentQRCode(null)` para dentro do setTimeout de 1s |
| `handleCloseQRDialog` | Await `getStatus` antes de `refetch`, separar captura do instanceId |

## Resultado Esperado

1. Usuario escaneia QR → conexao detectada (Realtime ou polling)
2. `stopPolling()` seta `isPollingActiveRef = false`
3. Qualquer poll residual verifica a flag e para imediatamente
4. `currentQRCode` mantem valor ate o dialog fechar (nenhum poll vazio dispara `connect()`)
5. UI mostra "Conectado" e PERMANECE conectado
6. Ao fechar dialog manualmente, `getStatus` atualiza DB antes do `refetch`

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/pages/Connections.tsx` | Adicionar `isPollingActiveRef`, proteger `pollOnce` com flag, mover limpeza de QR para apos dialog fechar, corrigir `handleCloseQRDialog` |

