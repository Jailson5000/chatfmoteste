

## Corrigir Auto-Reconexao para Evolution API v2.3+

### Contexto
A Evolution API na VPS da FMO ja foi atualizada para v2.3000. **Nao e necessario mexer na VPS.** O problema e que o codigo da edge function `auto-reconnect-instances` ainda tenta usar o endpoint `PUT /instance/restart/{name}`, que foi removido nessa versao, resultando em erro 404.

### O que muda

A edge function `auto-reconnect-instances` sera atualizada para:
1. **Remover** a funcao `attemptRestart` (que chama o endpoint inexistente)
2. **Usar diretamente** o `GET /instance/connect/{name}` como metodo principal de reconexao
3. **Manter** a verificacao previa de estado via `GET /instance/connectionState/{name}` (esse endpoint continua funcionando na v2.3+)

### Fluxo corrigido

1. Verificar se a instancia ja esta conectada (sync de status no banco)
2. Se nao conectada, chamar `GET /instance/connect/{name}` diretamente
3. Se retornar QR code, marcar `awaiting_qr = true` (para de tentar)
4. Se retornar `state: open`, reconectou automaticamente

### Detalhes Tecnicos

**Arquivo: `supabase/functions/auto-reconnect-instances/index.ts`**

| Alteracao | Detalhe |
|---|---|
| Remover funcao `attemptRestart` (~40 linhas) | Chama `PUT /instance/restart` que retorna 404 na v2.3+ |
| Alterar fluxo principal | Trocar chamada `attemptRestart(instance)` por `attemptConnect(instance)` diretamente |
| Manter `attemptConnect` | `GET /instance/connect` funciona na v2.3+ |
| Manter `checkConnectionState` | `GET /instance/connectionState` funciona na v2.3+ |

### Impacto
- Nenhuma tabela alterada
- Nenhuma configuracao de VPS necessaria
- Apenas 1 edge function modificada
- Compativel com v2.2.x e v2.3.x (ambas suportam o endpoint `connect`)

### Resultado esperado
As instancias com sessao valida reconectarao automaticamente sem erro 404. As com sessao expirada serao marcadas como `awaiting_qr` sem ficar em loop.

