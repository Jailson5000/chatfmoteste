

# Correcao: 3 Problemas no Fluxo de QR Code e Versao do WhatsApp

## Problema 1 - Delete nao funciona, instancia fica "presa"

Os logs mostram claramente o que acontece com `inst_7sw6k99c`:

```text
17:01:06 - connect retorna {"count":0} (sessao corrompida)
17:01:06 - connectionState = "connecting"
17:01:06 - Recovery Step 1: Logout + Connect -> sem QR
17:01:09 - connectionState = "close"
17:01:10 - Recovery Step 2: Delete + Recreate
17:01:19 - Recreate attempt 1: 403 "name already in use"
17:01:26 - Recreate attempt 2: 403 "name already in use"
17:01:36 - Recreate attempt 3: 403 "name already in use"
17:01:36 - FALHA FINAL
```

O delete retorna sucesso mas a Evolution API nao remove a instancia imediatamente. O create subsequente recebe 403 em todas as 3 tentativas. Quando isso acontece, o codigo atual simplesmente falha - mas a instancia AINDA EXISTE no servidor.

**Solucao**: Quando todas as tentativas de create retornam 403, a instancia ainda existe. Em vez de falhar, devemos fazer logout + connect com delays maiores (a instancia ja existe, so precisa limpar a sessao).

## Problema 2 - Instancias nao recriadas apos tentativa falha

Como o fluxo falhou no meio, as instancias ficaram em estado inconsistente - existem na Evolution mas o sistema as trata como problemicas.

**Solucao**: Adicionar fallback no bloco de 403 do recovery step 2 - se o create falhar com 403, fazer logout da instancia existente e tentar connect com retries progressivos.

## Problema 3 - Versao do WhatsApp

A versao do WhatsApp Web e controlada pelo Baileys dentro do container da Evolution API. A versao atual e `2.3000.1033105955`. Para atualizar, e necessario alterar o arquivo `.env` no container da Evolution ou atualizar o pacote Baileys. Isso NAO pode ser feito pela edge function - e uma configuracao do servidor.

Para atualizar a versao, rode no servidor VPS:

```bash
docker exec -it evolution sh -c "
  # Verificar a versao atual do WhatsApp Web no check-update
  wget -qO- 'https://web.whatsapp.com/check-update?version=0&platform=web' 2>/dev/null | head -1
"
```

Depois, atualize no `.env` da Evolution:
```bash
docker exec -it evolution sh -c "
  # Editar a versao no Defaults do Baileys
  sed -i 's/const version = \[2, 3000, [0-9]*/const version = [2, 3000, NOVA_VERSAO/' /evolution/node_modules/baileys/lib/Defaults/index.js
"
docker restart evolution
```

**Importante**: A versao do WhatsApp Web muda frequentemente. A versao correta pode ser obtida em `https://web.whatsapp.com/check-update?version=0&platform=web`.

## Alteracoes no Codigo

### Arquivo: `supabase/functions/evolution-api/index.ts`

#### Correcao no Recovery Step 2 - Fallback quando create retorna 403

No bloco de recovery step 2 (linhas 1128-1163), quando todas as tentativas de create falham com 403, em vez de lancar erro, adicionar um fallback:

1. Se `recreateSuccess === false` e o motivo foi 403:
   - Fazer logout da instancia existente
   - Aguardar 5 segundos
   - Tentar connect com 3 tentativas (5s entre cada)
   - Se obtiver QR, retornar sucesso
   - Se nao, retornar mensagem informativa pedindo para aguardar

#### Correcao no bloco 403 do fluxo de 404

No bloco de fallback 403 (linhas 906-933), quando recebe 403 "name in use" na recriacao do 404:

1. Apos o logout, aumentar o delay de 3s para 5s
2. Adicionar retry loop (ate 3 tentativas com 5s entre elas) para o connect
3. Se nenhuma tentativa retornar QR, verificar connectionState e retornar mensagem adequada

### Resultado Esperado

- Instancias "presas" (existem na Evolution mas create retorna 403) serao tratadas via logout+connect com retries, em vez de falhar
- O fluxo de 404 com 403 subsequente tera mais tentativas antes de desistir
- Mensagens de erro serao mais claras e informativas
- A versao do WhatsApp e atualizada manualmente no servidor (instrucoes acima)

