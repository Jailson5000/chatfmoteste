

# Corrigir acesso ao Global Admin e ao Cliente

## Diagnostico

O sistema esta com dois problemas combinados:

1. **Instabilidade temporaria do backend** - Requests ao banco retornam 503 (connection timeout) intermitentemente. Isso e um problema de infraestrutura que se resolve sozinho, mas o codigo precisa ser resiliente a isso.

2. **Race condition no `useAdminAuth`** - O hook chama `fetchAdminData` 3 vezes simultaneamente (SIGNED_IN, INITIAL_SESSION, getSession), gerando 6 queries ao banco. Quando essas queries falham com 503:
   - O estado `adminRole` fica `null`
   - O `loading` fica preso em `true` indefinidamente (sem timeout de seguranca)
   - O usuario ve "Verificando permissoes..." para sempre

O `useAuth` ja tem protecoes contra isso (timeout de 20s, pattern `finishLoading`), mas o `useAdminAuth` nao tem nenhuma protecao.

## Correcoes

### 1. Refatorar `useAdminAuth` (arquivo: `src/hooks/useAdminAuth.tsx`)

Aplicar o mesmo padrao de resiliencia do `useAuth`:

- **Timeout de seguranca** (15s): Se `fetchAdminData` nao completar em tempo, libera o loading para evitar tela travada
- **Deduplicacao**: Usar um `useRef` para evitar chamadas concorrentes a `fetchAdminData` - apenas a primeira executa, as demais sao ignoradas
- **Retry com backoff**: Se a query de role falhar (503), tentar mais uma vez apos 2 segundos antes de desistir
- **`finishLoading` pattern**: Centralizar o controle do loading para que qualquer caminho (sucesso, erro, timeout) libere a UI

Mudancas especificas:
- Adicionar `fetchingRef = useRef(false)` para deduplicar chamadas
- Adicionar `setTimeout` de 15s como safety net para loading
- No `fetchAdminData`, checar `fetchingRef.current` e ignorar se ja estiver em andamento
- Na falha do RPC `get_admin_role`, fazer 1 retry apos 2s
- Chamar `finishLoading()` em todos os caminhos de saida

### 2. Nenhuma alteracao no `useAuth`

O `useAuth` ja esta bem implementado com timeout de seguranca e pattern `finishLoading`. Os erros 503 que aparecem nos logs sao transitorios e o hook se recupera sozinho.

### 3. Nenhuma migracao SQL necessaria

O problema e puramente no frontend (race condition + falta de timeout).

## Detalhes Tecnicos

O `useAdminAuth` refatorado tera esta estrutura:

```text
useEffect
  |
  +-- initTimeout (15s safety net) --> finishLoading()
  |
  +-- onAuthStateChange
  |     +-- SIGNED_IN / INITIAL_SESSION
  |     |     +-- setTimeout -> fetchAdminData (deduplicated via ref)
  |     +-- SIGNED_OUT -> finishLoading()
  |
  +-- getSession()
        +-- session found -> fetchAdminData (deduplicated) -> finishLoading()
        +-- no session -> finishLoading()
```

Dentro de `fetchAdminData`:
- Se `fetchingRef.current === true`, retorna imediatamente
- Seta `fetchingRef.current = true`
- Busca admin_profiles (ignora erro silenciosamente)
- Busca role via RPC
  - Se falhar, espera 2s e tenta mais uma vez
- Seta `fetchingRef.current = false`

