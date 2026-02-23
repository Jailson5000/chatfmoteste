

# Fix: QR Code nao aparece ao criar/conectar instancias WhatsApp

## Diagnostico

Os logs mostram um padrao claro: toda chamada a `/instance/connect/{name}` retorna `{"count":0}` (sem QR code). Isso acontece em 3 cenarios:

1. **Criar instancia**: O `create_instance` na Evolution API retorna `qrcode: {count: 0}` em vez de um base64 QR. O frontend verifica `result.qrCode` que e `null`, entao o dialogo de QR nunca abre.

2. **Conectar instancia existente (MIAU)**: O `get_qrcode` chama `/instance/connect` que retorna `{count:0}`, dispara o recovery (logout+connect, delete+recreate) e todas as tentativas subsequentes tambem retornam `{count:0}`.

3. **Nova instancia (dsged)**: Criada com sucesso mas sem QR. O frontend mostra "Instancia criada com sucesso" mas nao abre o dialogo de QR automaticamente.

## Causa Raiz

A Evolution API com Baileys v7 precisa de mais tempo para inicializar a sessao WebSocket antes de gerar o QR code. O delay atual (3-5s) e insuficiente. Alem disso, o fluxo de `create_instance` na edge function nao tenta obter o QR code apos a criacao.

## Solucao (2 alteracoes)

### 1. Edge Function `evolution-api` - Retry de QR apos create_instance

No bloco `create_instance` (linhas 659-703), quando o QR code nao vem na resposta do create, adicionar um loop de retries com delays progressivos para chamar `/instance/connect/{name}`:

- Aguardar 5 segundos apos criar a instancia
- Tentar `/instance/connect/{name}` ate 4 vezes (com 5s entre tentativas)
- Se obtiver QR code, retornar com sucesso
- Se nao, retornar `success: true` sem QR code (o frontend ira tratar)

### 2. Frontend `Connections.tsx` - Auto-conectar apos criar instancia sem QR

No `handleCreateInstance` (linhas 330-360), quando `result.qrCode` e `null` mas `result.instance` existe, chamar automaticamente `handleConnectInstance(result.instance)` para abrir o dialogo de QR e tentar obter o QR code separadamente.

Isso garante que o usuario sempre veja o dialogo de QR code apos criar uma instancia, mesmo que o QR nao tenha sido gerado na criacao.

## Detalhes Tecnicos

### Edge Function - Bloco create_instance (apos linha 667)

```text
Antes:
  1. Criar instancia
  2. Extrair QR da resposta do create
  3. Salvar no banco
  4. Retornar

Depois:
  1. Criar instancia
  2. Extrair QR da resposta do create
  3. SE nao tem QR:
     a. Aguardar 5s (inicializacao Baileys)
     b. Loop ate 4 tentativas:
        - GET /instance/connect/{name}
        - Se tem QR: usar esse QR
        - Se nao: aguardar 5s e tentar novamente
  4. Salvar no banco (com status correto)
  5. Retornar
```

### Frontend - handleCreateInstance

```text
Antes:
  1. Chamar createInstance
  2. Se result.qrCode E result.instance: abrir dialog QR
  3. Se nao: nada acontece

Depois:
  1. Chamar createInstance
  2. Se result.qrCode E result.instance: abrir dialog QR (sem mudanca)
  3. Se NAO tem qrCode MAS tem instance:
     - Chamar handleConnectInstance(instance) automaticamente
     - Isso abre o dialog de QR e tenta obter o QR separadamente
```

## Resultado Esperado

- Ao criar uma nova instancia, o sistema tentara obter o QR code com ate 4 retries no backend
- Se o backend nao conseguir, o frontend automaticamente abrira o dialogo de conexao e tentara obter o QR
- O usuario sempre vera o dialogo de QR code apos criar uma instancia
- Instancias existentes continuam com o mesmo fluxo de recovery (que tambem se beneficia dos delays maiores)

