

# QR Code Dialog Nao Fecha Apos Escanear (Stale Closure no Polling)

## Diagnostico

O problema e um **bug de stale closure** no polling de status.

### Como funciona o polling

A funcao `pollOnce` tem duas ramificacoes:
- **Sem QR code** (`!currentQRCode`): chama `getQRCode` (linha 227-273)
- **Com QR code**: chama `getStatus` (linha 276-296)

### O bug

`pollOnce` captura `currentQRCode` via closure e esta nos deps do `useCallback` (linha 306). Quando o QR code e obtido e `setCurrentQRCode(qrCode)` e chamado, o React recria `pollOnce` com o novo valor.

**Porem**, o `setTimeout` na linha 305 ja foi agendado com a versao ANTIGA de `pollOnce` (onde `currentQRCode === null`):

```text
T=0s   pollOnce v1 (currentQRCode=null) → getQRCode → obtem QR → setCurrentQRCode("abc")
       setTimeout(() => pollOnce_v1(id), 8000)  ← CAPTURA pollOnce v1!
       
T=8s   pollOnce v1 executa (currentQRCode=null!) → getQRCode novamente!
       setTimeout(() => pollOnce_v1(id), 8000)
       
T=16s  pollOnce v1 executa → getQRCode novamente...
```

O polling **nunca muda para a ramificacao `getStatus`** porque o `setTimeout` sempre usa a versao antiga de `pollOnce` onde `currentQRCode` e `null`.

Consequencias:
1. Em vez de verificar status com `getStatus`, o polling continua chamando `getQRCode`
2. `getQRCode` chama `provider.connect()` que pode retornar status `connected`, mas o check na linha 242 so verifica `result.status === "open"` — o valor `"connected"` **funciona** (esta la), mas `getQRCode` para uazapi chama `connect()` que pode reenviar um novo QR em vez de reportar status
3. O dialogo fica preso mostrando QR code indefinidamente

### Porque funciona ao clicar "Conectar" manualmente

Ao fechar e clicar "Conectar", `handleConnectInstance` chama `getQRCode` que para uazapi chama `provider.connect()`. Se a instancia ja esta conectada, retorna `status: "connected"` e o polling detecta corretamente. Mas isso so funciona porque e uma chamada fresca, nao presa no stale closure.

## Correcao

### Arquivo: `src/pages/Connections.tsx`

**Usar ref para `currentQRCode` no polling** em vez de depender do state diretamente no closure. Isso elimina o stale closure:

1. Adicionar `currentQRCodeRef` que espelha `currentQRCode`:
```typescript
const currentQRCodeRef = useRef<string | null>(null);

// Sync ref with state
useEffect(() => {
  currentQRCodeRef.current = currentQRCode;
}, [currentQRCode]);
```

2. No `pollOnce`, usar `currentQRCodeRef.current` em vez de `currentQRCode`:
```typescript
if (!currentQRCodeRef.current) {
  // fetch QR...
} else {
  // check status...
}
```

3. Remover `currentQRCode` dos deps do `useCallback` de `pollOnce` para evitar recriacao desnecessaria (agora usa a ref).

**Adicionar refetch imediato apos fechar o dialog**: Quando o usuario fecha o dialog manualmente (sem conexao detectada), fazer um `refetch()` e `getStatus` imediato para atualizar o estado da instancia:

```typescript
const handleQRDialogClose = () => {
  stopPolling();
  setIsQRDialogOpen(false);
  setCurrentQRCode(null);
  setConnectionStatus(null);
  setPollCount(0);
  // Refetch status imediato ao fechar
  if (currentInstanceId) {
    getStatus.mutateAsync(currentInstanceId).catch(() => {});
  }
  refetch();
};
```

## Resultado Esperado

1. Usuario escaneia QR code
2. Polling muda corretamente para ramificacao `getStatus` (ref sempre atualizada)
3. `getStatus` retorna `status: "connected"` para uazapi
4. Dialog fecha automaticamente com mensagem "Conectado!"
5. Se usuario fechar manualmente, refetch imediato atualiza o status na lista

## Arquivos Afetados

| Arquivo | Mudanca |
|---|---|
| `src/pages/Connections.tsx` | Usar ref para QR code no polling, adicionar refetch ao fechar dialog |

