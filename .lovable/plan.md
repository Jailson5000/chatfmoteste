
# Corrigir QR Code - Extrair da resposta de criacao

## Problema identificado

Na Evolution API v2.3.3, quando uma instancia e criada com `qrcode: true`, o QR code vem **na propria resposta do `/instance/create`**. Porem, o codigo atual **descarta essa resposta** e tenta obter o QR via `/instance/connect` separadamente, que retorna `{"count":0}`.

Isso afeta 3 pontos no codigo:

1. **Level 3 recovery** (linha 1344): `recreateResponse.ok` e verificado, mas o body nunca e lido para extrair o QR
2. **404 recreate** (linha 799): o create response e verificado como ok, mas o QR da resposta do create nao e extraido diretamente
3. **global_recreate_instance** (linha 3917): este ja extrai o QR corretamente, mas nao tenta retry se nao veio na primeira resposta

## Solucao

Modificar `supabase/functions/evolution-api/index.ts` em 2 pontos criticos:

### 1. Level 3 recovery (linhas 1329-1348)

Apos `recreateResponse.ok`, **ler o body e extrair o QR code**. Se o QR vier na resposta do create, retornar imediatamente sem precisar chamar `/instance/connect`.

### 2. 404 recreate flow (linhas 799-810)

Apos o create bem-sucedido, **extrair o QR do response body do create** e retornar imediatamente se disponivel, antes de tentar os 3 connect attempts.

## Detalhe tecnico

```text
ANTES (bugado):
  POST /instance/create  -->  response.ok? sim  -->  descarta body  -->  wait 3s  -->  GET /instance/connect  -->  {"count":0}  -->  FALHA

DEPOIS (corrigido):
  POST /instance/create  -->  response.ok? sim  -->  le body  -->  tem QR?  -->  sim  -->  RETORNA QR
                                                                          -->  nao  -->  wait 3s  -->  GET /instance/connect (fallback)
```

## Arquivo modificado

- `supabase/functions/evolution-api/index.ts` - 2 blocos alterados (~15 linhas cada)
