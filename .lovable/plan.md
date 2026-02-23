
## Corrigir: "This name is already in use" ao Recriar Instancias

### Problema Comprovado

Os logs mostram exatamente o que acontece:

```
Delete response: 200                    <-- Evolution retorna 200
Recreate failed: 403 "This name inst_7sw6k99c is already in use"  <-- Mas nao deletou de verdade
```

A Evolution API v2.3.7 retorna 200 para o DELETE mas NAO remove a instancia imediatamente (operacao assincrona interna). Quando tentamos POST /instance/create 2 segundos depois, o nome ainda esta registrado = erro 403.

**IMPORTANTE**: O Evolution ESTA funcionando (confirmado pela screenshot - v2.3.7, inst_464pnw5n conectada com numero). O problema e exclusivamente no nosso fluxo de recuperacao.

### Solucao: Trocar Estrategia para Logout + Connect

Para sessoes corrompidas onde a instancia JA EXISTE no Evolution (nao e 404), o fluxo correto e:

```text
ANTES (falha):
  Detecta sessao corrompida
  -> DELETE /instance/delete  (retorna 200 mas nao apaga)
  -> POST /instance/create    (403 - nome em uso)
  -> ERRO

DEPOIS (correto):
  Detecta sessao corrompida
  -> DELETE /instance/logout   (limpa sessao Baileys, mantem registro)
  -> Esperar 3s
  -> GET /instance/connect     (gera novo QR com registro existente)
  -> Se falhar, tentar DELETE /instance/delete + esperar 5s + POST /instance/create
```

A diferenca: **logout** limpa apenas a sessao Baileys (auth files) sem remover o registro da instancia. Depois, **connect** inicia uma sessao nova e gera um QR code fresco.

Se mesmo assim falhar, fazemos delete+recreate com retry e espera maior (5s ao inves de 2s), e se o nome ainda estiver em uso, tentamos com um sufixo novo.

### Mudancas Tecnicas

**Arquivo: `supabase/functions/evolution-api/index.ts`**

Na secao de "CORRUPTED SESSION DETECTION" (linhas 844-970):

1. **Substituir** o fluxo delete+recreate por logout+connect como primeira tentativa:
   - Chamar `DELETE /instance/logout/{name}` (best-effort, ignorar erros 400/500)
   - Esperar 3 segundos para o Baileys limpar os arquivos de sessao
   - Chamar `GET /instance/connect/{name}` para gerar novo QR
   - Se retornar QR code valido, retornar sucesso

2. **Manter** delete+recreate como fallback (se logout+connect falhar):
   - Aumentar espera de 2s para 5s apos o delete
   - Adicionar retry: se 403 "already in use", esperar mais 5s e tentar novamente
   - Se persistir, logar erro claro e retornar mensagem orientando o usuario

3. **Corrigir** tambem a mesma logica no 404 handler (linhas 729-812): quando o create retornar 403, fazer logout primeiro ao inves de falhar imediatamente.

**Arquivo: `supabase/functions/auto-reconnect-instances/index.ts`**

Na funcao `deleteAndRecreateInstance`:
- Aplicar a mesma estrategia: logout+connect primeiro, delete+recreate como fallback
- Aumentar espera apos delete para 5s
- Adicionar retry em caso de 403

### Fluxo Corrigido

```text
Sessao corrompida detectada ({"count":0} ou sem QR)
  |
  v
Tentativa 1: Logout + Connect
  -> DELETE /instance/logout/{name} (limpa Baileys)
  -> Esperar 3s
  -> GET /instance/connect/{name}
  -> QR code gerado? -> Retornar sucesso
  |
  NAO
  v
Tentativa 2: Delete + Recreate (com retry)
  -> DELETE /instance/delete/{name}
  -> Esperar 5s
  -> POST /instance/create
  -> 403 "already in use"? -> Esperar +5s -> Retry
  -> QR code gerado? -> Retornar sucesso
  |
  NAO
  v
Erro final com mensagem clara para o usuario
```

### Impacto Esperado

| Antes | Depois |
|---|---|
| Delete retorna 200 mas nao apaga | Logout limpa sessao sem precisar apagar registro |
| Create falha com 403 "name in use" | Connect gera QR com registro existente |
| QR nunca aparece | QR gerado apos logout+connect |
| Sem fallback | Delete+recreate com retry como fallback |

### Arquivos Editados

1. `supabase/functions/evolution-api/index.ts` - Trocar delete+recreate por logout+connect na deteccao de sessao corrompida, manter delete+recreate como fallback com retry
2. `supabase/functions/auto-reconnect-instances/index.ts` - Mesma estrategia na funcao deleteAndRecreateInstance
