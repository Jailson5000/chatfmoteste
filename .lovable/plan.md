
# Corrigir recuperacao de sessao WhatsApp apos restart

## Problema diagnosticado

Apos o restart do Docker, as instancias ficam instáveis nos primeiros minutos - alternando entre "open" e "close". Quando o usuario tenta gerar QR code nesse periodo, a Evolution API retorna `{"count":0}` e o sistema interpreta como **sessao corrompida**, executando um fluxo destrutivo:

1. Logout (destroi a sessao Baileys)
2. Delete da instancia
3. Recreate da instancia
4. Multiplas tentativas de connect

Isso leva ~40 segundos e frequentemente falha porque Baileys ainda esta inicializando. O resultado: a sessao que estava se recuperando sozinha e destruida.

## Solucao

Substituir o fluxo de recuperacao agressivo por um mais inteligente com 3 niveis:

1. **Nivel 1 - Retry simples** (quando connectionState e "close" ou "connecting"): Apenas fazer 3 tentativas de `/instance/connect/` com delays de 5s entre cada. Sem logout, sem delete.

2. **Nivel 2 - Logout + Connect** (se Nivel 1 falhar e estado continuar "close"): Fazer logout e tentar connect novamente. Sem delete/recreate.

3. **Nivel 3 - Delete + Recreate** (somente se Nivel 2 falhar): Manter como ultimo recurso, mas so apos os niveis anteriores falharem.

## Alteracoes tecnicas

### Arquivo: `supabase/functions/evolution-api/index.ts`

Na secao de deteccao de sessao corrompida (linhas ~1060-1412):

- Quando `connectionState` retornar "close" ou "connecting", adicionar tentativas simples de connect com retry (3x, 5s delay) ANTES de ir para logout
- Mover a logica de logout+connect como segundo nivel
- Manter delete+recreate como terceiro e ultimo nivel
- Adicionar log claro de qual nivel esta sendo executado
- Reduzir o timeout total do fluxo (de ~60s para ~30s no caso comum)

### Fluxo proposto

```text
get_qrcode chamado
  |
  v
/instance/connect/ retorna {"count":0}
  |
  v
Check connectionState
  |
  +-- "open"/"connected" -> Retornar sucesso (ja existe)
  |
  +-- "close"/"connecting" -> NIVEL 1: Retry connect (3x, 5s delay)
  |     |
  |     +-- QR obtido -> Retornar sucesso
  |     |
  |     +-- Falhou -> NIVEL 2: Logout + Connect (2x, 5s delay)
  |           |
  |           +-- QR obtido -> Retornar sucesso
  |           |
  |           +-- Falhou -> NIVEL 3: Delete + Recreate (existente)
  |
  +-- "unknown"/erro -> NIVEL 2 direto
```

Essa mudanca reduz drasticamente a chance de destruir sessoes que estao se recuperando apos um restart do servidor.
