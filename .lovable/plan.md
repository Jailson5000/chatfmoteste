
# Correção: QR Code e Criação de Instâncias WhatsApp

## Problema Identificado

A edge function `evolution-api` tem um bug crítico no fluxo de QR Code:

1. Quando o endpoint `/instance/connect` retorna `{"count":0}`, o código interpreta como "sessão corrompida"
2. Inicia recovery: logout -> connect -> delete -> recreate -> connect
3. O connect pós-recovery TAMBÉM retorna `{"count":0}` (porque o problema persiste no lado da Evolution API)
4. Resultado: QR nunca aparece, e instâncias ficam sendo deletadas e recriadas em loop

Os logs confirmam: "Recovery completed but no QR code returned" em todas as tentativas.

## Causa Raiz

O `{"count":0}` significa que a instância existe mas o Baileys não consegue iniciar uma sessão QR. Isso acontece quando:
- A instância está de fato conectada (não precisa de QR)
- A versão do WhatsApp Web configurada na Evolution está desatualizada/incompatível
- A sessão Baileys está travada internamente

## Solução

### 1. Verificar connectionState ANTES de declarar sessão corrompida
Na edge function `evolution-api`, no handler `get_qrcode`, adicionar uma chamada ao endpoint `/instance/connectionState/` antes de tentar recovery. Se o estado for `open`, atualizar o banco para `connected` e retornar sucesso (sem QR necessário).

### 2. Adicionar retry com delay maior no recovery
Quando o recovery for realmente necessário (estado nao-open), aguardar mais tempo (8-10s) entre delete e create, pois a Evolution API demora para liberar o nome da instância.

### 3. Forçar restart do Baileys no recovery
Após o recreate, chamar `/instance/connect` com um delay de 3s, e se retornar `{"count":0}` novamente, tentar uma vez mais após 5s.

## Alteracoes Tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

No bloco de deteccao de sessão corrompida (linhas ~866-1050), modificar a logica para:

```text
Fluxo Atual (bugado):
  connect -> {"count":0} -> logout -> connect -> delete -> recreate -> connect -> {"count":0} -> FALHA

Fluxo Novo:
  connect -> {"count":0} -> connectionState check
    -> Se "open": atualizar DB para "connected", retornar sucesso
    -> Se "close"/"connecting": logout -> wait 3s -> connect
      -> Se QR: sucesso
      -> Se {"count":0}: delete -> wait 8s -> create -> wait 3s -> connect
        -> Se QR: sucesso  
        -> Se {"count":0}: wait 5s -> connect (ultima tentativa)
          -> Se QR: sucesso
          -> FALHA com mensagem clara
```

### Detalhes da Implementacao

1. **Nova funcao `checkConnectionState`**: chama `GET /instance/connectionState/{name}` e retorna o estado real (`open`, `close`, `connecting`)

2. **Modificar bloco `isCorruptedSession`**: antes de iniciar recovery, verificar connectionState. Se `open`, fazer:
   - Update DB: `status = "connected"`, extrair phone number
   - Retornar `{ success: true, status: "connected" }`

3. **Melhorar timings do recovery**: aumentar delays entre operacoes para dar tempo a Evolution API processar

4. **Manter funcionalidade existente**: todas as outras actions (send_message, delete, etc.) permanecem inalteradas
