

# Fix: QR Code nao aparece ao criar/conectar instancias WhatsApp

## Problema

Os logs confirmam o problema: a Evolution API retorna `{"count":0}` consistentemente para TODAS as chamadas `/instance/connect/{name}`, mesmo apos 25+ segundos de retries no backend. O backend ja tem retry logic extensiva (4 retries de 5s cada) mas nao e suficiente.

O problema real esta no frontend: quando o QR nao vem nem do `create_instance` nem do `get_qrcode`, o dialog mostra "QR Code nao disponivel" como um beco sem saida. O polling via `get_status` so verifica o `connectionState` -- nunca tenta obter um novo QR code.

## Causa Raiz

A Evolution API com Baileys v7 pode levar 30-60+ segundos para inicializar o WebSocket e gerar o primeiro QR code. O backend tenta por ~25s e desiste. O frontend nao tem mecanismo de re-tentativa automatica para buscar o QR code.

## Solucao (3 alteracoes)

### 1. Frontend - Polling inteligente que tambem busca QR code

Modificar `src/pages/Connections.tsx`:

- Na funcao `pollOnce`, quando `currentQRCode` e `null` (nenhum QR disponivel ainda), chamar `getQRCode.mutateAsync(instanceId)` em vez de apenas `getStatus.mutateAsync(instanceId)`
- Isso faz o polling tentar obter o QR code repetidamente ate conseguir, ao inves de so verificar o status
- Quando o QR code for obtido, atualizar o state e continuar polling normal (so status)

### 2. Frontend - QR Dialog com auto-retry

Modificar `src/components/connections/QRCodeDialog.tsx`:

- Quando nao ha QR code e nao ha erro, mostrar um estado de "Aguardando QR Code..." com spinner em vez de "QR Code nao disponivel" estatico
- Adicionar botao "Tentar Novamente" tambem no estado sem QR (nao so no estado de erro)

### 3. Frontend - handleConnectInstance com retry automatico

Modificar `src/pages/Connections.tsx`:

- Na funcao `handleConnectInstance`, quando `get_qrcode` retorna sem QR e sem erro (retryable=true ou simplesmente sem qrCode), iniciar o polling mesmo assim em vez de mostrar erro
- O polling inteligente (item 1) se encarregara de buscar o QR code

## Detalhes Tecnicos

### Connections.tsx - pollOnce modificado

```text
Antes:
  pollOnce chama getStatus.mutateAsync(instanceId) → verifica status e QR atualizado

Depois:
  pollOnce verifica se currentQRCode e null:
    - Se null: chama getQRCode.mutateAsync(instanceId) em vez de getStatus
      - Se retornar qrCode: atualiza currentQRCode + continua polling normal
      - Se retornar connected: para polling, mostra sucesso
      - Se retornar erro retryable: agenda proximo poll
    - Se ja tem QR: mantém comportamento atual (getStatus)
```

### Connections.tsx - handleConnectInstance modificado

```text
Antes:
  get_qrcode falha sem QR → setQrError("QR Code nao disponivel")

Depois:
  get_qrcode retorna sem QR:
    - Se retryable ou sem qrCode: inicia polling (que tentara buscar QR)
    - Mostra estado de "Aguardando..." no dialog em vez de erro
```

### QRCodeDialog.tsx - Estado intermediario

```text
Antes:
  Sem QR + sem erro + sem loading → "QR Code nao disponivel" (beco sem saida)

Depois:
  Sem QR + sem erro + sem loading + pollCount > 0 → "Aguardando QR Code..." com spinner + botao retry
  Sem QR + sem erro + sem loading + pollCount == 0 → "QR Code nao disponivel" + botao retry
```

## Resultado Esperado

- Ao criar uma instancia, se o QR nao vier imediatamente, o dialog mostra "Aguardando QR Code..." e continua tentando automaticamente
- O polling busca ativamente o QR code via `get_qrcode` (que faz `/instance/connect`) a cada 3-5s
- Quando a Evolution API finalmente gerar o QR (apos 30-60s), ele aparece automaticamente no dialog
- O usuario nao precisa fechar e reabrir o dialog manualmente
